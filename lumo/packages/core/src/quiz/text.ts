/** Language-agnostic text helpers for fair, typo-tolerant grading (EN + FR). */

const ARTICLES = new Set(['the', 'a', 'an', 'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd']);

const STOPWORDS = new Set([
  ...ARTICLES,
  'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'it', 'its', 'that', 'this',
  'as', 'at', 'from', 'into', 'than', 'then', 'which', 'who', 'what', 'when', 'where', 'how', 'why', 'can', 'has', 'have',
  'they', 'their', 'there', 'these', 'those', 'also', 'more', 'most', 'some', 'such', 'only', 'very', 'will', 'would',
  'et', 'ou', 'en', 'au', 'aux', 'par', 'pour', 'avec', 'sans', 'dans', 'sur', 'est', 'sont', 'qui', 'que', 'quoi', 'dont',
  'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'leur', 'leurs', 'il', 'elle', 'ils', 'elles', 'on', 'se', 'ne', 'pas',
  'plus', 'aussi', 'comme', 'mais', 'donc', 'car', 'tres', 'peut', 'fait', 'etre', 'avoir',
]);

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !ARTICLES.has(w))
    .join(' ');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

/** Does a short typed answer match one of the accepted answers (typos, accents, articles, plurals ok)? */
export function matchesAccepted(answer: string, accepted: readonly string[]): boolean {
  const a = normalize(answer);
  if (!a) return false;
  return accepted.some((acc) => {
    const b = normalize(acc);
    if (!b) return false;
    if (a === b) return true;
    const singular = (w: string) => w.replace(/(es|s|x)$/, '');
    if (singular(a) === singular(b)) return true;
    // Short words must be (nearly) exact; longer ones tolerate ~1 typo per 6 letters.
    if (b.length <= 4) return levenshtein(a, b) === 0;
    return similarity(a, b) >= 0.82;
  });
}

/** Content-word stems used for key-point matching. */
export function stems(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map((w) => (w.length > 6 ? w.slice(0, 6) : w.replace(/(es|s)$/, '')));
}

export interface KeyPointMatch {
  score: number; // 0..1
  matched: string[];
  missing: string[];
}

/**
 * Offline fallback for open answers: a key point counts as covered when most of its
 * content-word stems appear (fuzzily) in the answer. AI grading replaces this when available.
 */
export function gradeKeyPoints(answer: string, keyPoints: readonly string[], minPoints?: number): KeyPointMatch {
  const answerStems = stems(answer);
  const has = (stem: string) => answerStems.some((s) => s === stem || (stem.length >= 5 && similarity(s, stem) >= 0.8));
  const matched: string[] = [];
  const missing: string[] = [];
  for (const kp of keyPoints) {
    const kpStems = [...new Set(stems(kp))];
    if (kpStems.length === 0) continue;
    const hit = kpStems.filter(has).length / kpStems.length;
    (hit >= 0.5 ? matched : missing).push(kp);
  }
  const needed = Math.max(1, Math.min(keyPoints.length, minPoints ?? Math.ceil(keyPoints.length * 0.6)));
  return { score: Math.min(1, matched.length / needed), matched, missing };
}

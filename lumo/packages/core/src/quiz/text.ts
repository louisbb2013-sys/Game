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

/**
 * Everyday words that mean the same thing in school answers (EN + FR). Offline only: when Claude
 * is available it judges meaning far more broadly (see shortAnswersToCheck).
 */
const SYNONYM_GROUPS: string[][] = [
  ['round', 'circular', 'circle', 'circle shaped', 'spherical', 'sphere', 'ball shaped', 'rond', 'ronde', 'circulaire', 'spherique', 'sphere'],
  ['big', 'large', 'huge', 'giant', 'enormous', 'grand', 'grande', 'gros', 'grosse', 'enorme', 'geant'],
  ['small', 'little', 'tiny', 'petit', 'petite', 'minuscule'],
  ['fast', 'quick', 'rapid', 'speedy', 'rapide', 'vite'],
  ['slow', 'lent', 'lente'],
  ['hot', 'warm', 'heated', 'chaud', 'chaude'],
  ['cold', 'cool', 'chilly', 'froid', 'froide'],
  ['increase', 'rise', 'go up', 'grow', 'augmente', 'augmenter', 'monte', 'monter', 'hausse'],
  ['decrease', 'drop', 'fall', 'go down', 'shrink', 'diminue', 'diminuer', 'baisse', 'baisser'],
  ['many', 'lots', 'lot', 'numerous', 'plenty', 'beaucoup', 'nombreux', 'nombreuses'],
  ['start', 'begin', 'beginning', 'commence', 'commencer', 'debut'],
  ['end', 'finish', 'stop', 'fin', 'finir', 'terminer'],
  ['make', 'produce', 'create', 'form', 'fabrique', 'fabriquer', 'produire', 'produit', 'creer', 'former'],
  ['use', 'consume', 'utilise', 'utiliser', 'consomme', 'consommer'],
  ['strong', 'powerful', 'fort', 'forte', 'puissant'],
  ['weak', 'faible'],
  ['light', 'lightweight', 'leger', 'legere'],
  ['heavy', 'lourd', 'lourde'],
  ['flat', 'level', 'plat', 'plate'],
  ['hard', 'solid', 'rigid', 'dur', 'dure', 'rigide'],
  ['soft', 'mou', 'molle', 'doux', 'douce'],
  ['wet', 'damp', 'moist', 'humide', 'mouille'],
  ['dry', 'sec', 'seche'],
  ['high', 'tall', 'haut', 'haute', 'eleve'],
  ['low', 'short', 'bas', 'basse'],
  ['same', 'identical', 'equal', 'meme', 'identique', 'egal', 'egale'],
  ['different', 'distinct', 'differente'],
  ['important', 'essential', 'key', 'vital', 'essentiel', 'essentielle'],
  ['help', 'assist', 'aide', 'aider'],
  ['protect', 'shield', 'defend', 'proteger', 'protege', 'defendre'],
  ['move', 'travel', 'deplacer', 'bouger', 'deplace'],
  ['water', 'h2o', 'eau'],
  ['sun', 'sunlight', 'soleil', 'lumiere du soleil'],
  ['earth', 'world', 'planet earth', 'terre', 'planete terre'],
  ['plant', 'plants', 'vegetal', 'vegetaux', 'plante', 'plantes'],
  ['animal', 'animals', 'animaux'],
  ['food', 'nutrients', 'nourriture', 'aliments', 'nutriments'],
  ['energy', 'power', 'energie'],
  ['oxygen', 'o2', 'oxygene'],
  ['carbon dioxide', 'co2', 'dioxyde de carbone', 'gaz carbonique'],
  ['king', 'monarch', 'ruler', 'roi', 'monarque'],
  ['war', 'conflict', 'guerre', 'conflit'],
];
const SYNONYM_OF = new Map<string, number>();
SYNONYM_GROUPS.forEach((g, i) => g.forEach((w) => SYNONYM_OF.set(normalize(w), i)));
const singular = (w: string) => w.replace(/(es|s|x)$/, '');
const synonymGroup = (phrase: string) => SYNONYM_OF.get(phrase) ?? SYNONYM_OF.get(singular(phrase));

/** Do two normalized phrases mean the same thing (same words, or known synonyms word by word)? */
function sameMeaning(a: string, b: string): boolean {
  const ga = synonymGroup(a);
  if (ga !== undefined && ga === synonymGroup(b)) return true;
  const wa = a.split(' ');
  const wb = b.split(' ');
  if (wa.length !== wb.length || wa.length > 4) return false;
  return wa.every((w, i) => {
    const v = wb[i]!;
    if (w === v || singular(w) === singular(v)) return true;
    const g = synonymGroup(w);
    return g !== undefined && g === synonymGroup(v);
  });
}

/** The content words of a phrase (no "it", "is", "the"…), to accept "it is round" for "round". */
const contentWords = (s: string) => s.split(' ').filter((w) => !STOPWORDS.has(w));

/** Does a short typed answer match one of the accepted answers (typos, accents, articles, plurals, synonyms ok)? */
export function matchesAccepted(answer: string, accepted: readonly string[]): boolean {
  const a = normalize(answer);
  if (!a) return false;
  return accepted.some((acc) => {
    const b = normalize(acc);
    if (!b) return false;
    if (a === b) return true;
    if (sameMeaning(a, b)) return true;
    // A short sentence around the right word ("it is round", "they are circular") still counts.
    const ca = contentWords(a).join(' ');
    const cb = contentWords(b).join(' ');
    const negated = /\b(not|no|never|pas|jamais|aucun|aucune)\b/.test(a) && !/\b(not|no|never|pas|jamais|aucun|aucune)\b/.test(b);
    if (!negated && ca && cb && ca !== a && (ca === cb || sameMeaning(ca, cb) || (cb.length > 4 && similarity(ca, cb) >= 0.82))) return true;
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

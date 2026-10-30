/**
 * Cards brought from Gizmo, Quizlet, Anki or any list: one card per line, the term and its definition
 * separated by a tab (what their exports use), " - ", " – ", " : ", ": ", " = " or ";".
 */
export interface Card {
  term: string;
  definition: string;
}

const SEPARATORS = ['\t', ' — ', ' – ', ' - ', ' = ', ' : ', ': ', ';'];

export function parseCards(text: string): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (!line) continue;
    const sep = SEPARATORS.find((s) => line.includes(s));
    if (!sep) continue;
    const i = line.indexOf(sep);
    const term = line.slice(0, i).trim().slice(0, 160);
    const definition = line.slice(i + sep.length).trim().slice(0, 600);
    if (!term || !definition || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    out.push({ term, definition });
  }
  return out.slice(0, 300);
}

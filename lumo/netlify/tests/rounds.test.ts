import { hashString, perfectAnswer, questionFromDraft, type Answer, type Concept, type Question } from '@lumo/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/*
 * The in-browser backend (apps/web/src/local/backend.ts), driven like the pages drive it: whole-deck
 * rounds (one question per fact), no question twice in a round, waiting for questions Claude is still
 * writing, adding notes to a deck, the questions page, and the account copy split in documents.
 */

// A browser, as far as the backend needs one: storage, a viewer with a shared store.
const mem = new Map<string, string>();
const store = new Map<string, unknown>();
const g = globalThis as Record<string, unknown>;
g.window = globalThis;
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
const doc = (path: string) => ({
  id: path.split('/').pop(),
  get: async () => ({ exists: store.has(path), data: () => structuredClone(store.get(path)) }),
  set: async (v: unknown) => void store.set(path, structuredClone(v)),
  delete: async () => void store.delete(path),
});
const db = {
  doc,
  collection: (col: string) => ({
    limit: () => ({
      get: async () => ({ docs: [...store.keys()].filter((k) => k.startsWith(`${col}/`) && k.split('/').length === col.split('/').length + 1).map((k) => ({ id: k.split('/').pop(), exists: true, data: () => structuredClone(store.get(k)) })) }),
    }),
  }),
};
const user = { id: async () => 'u1', can: async () => true, name: async () => 'Louis Test', profiles: async () => ({}) };
g.claude = { use: async (n: string) => ({ db, user })[n as 'db' | 'user'] ?? null };

let localApi: <T>(method: string, path: string, body?: unknown) => Promise<T>;
let writingNow: Set<string>;
beforeAll(async () => {
  ({ localApi } = (await import('../../apps/web/src/local/backend')) as never);
  ({ writingNow } = await import('../../apps/web/src/local/writingNow'));
});
const api = <T = Record<string, any>>(method: string, path: string, body?: unknown) => localApi<T>(method, path, body ?? {}); // eslint-disable-line @typescript-eslint/no-explicit-any

const ideas = [
  { topic: 'Les Romains', kind: 'fact', term: 'Rome', summary: 'Ville au cœur de l’Empire romain.', keyPoints: ['Les Romains vivaient en Italie', 'Rome a été fondée en 753 av. J.-C.', 'Les Romains parlaient le latin'], misconceptions: [], examples: [], synonyms: [] },
  { topic: 'Les Romains', kind: 'definition', term: 'Légion', summary: 'Grande unité de l’armée romaine.', keyPoints: ['Une légion comptait environ 5000 soldats'], misconceptions: [], examples: [], synonyms: [] },
  { topic: 'Les Grecs', kind: 'fact', term: 'Athènes', summary: 'Cité grecque.', keyPoints: ['Athènes était une démocratie', 'Les citoyens votaient à l’assemblée'], misconceptions: [], examples: [], synonyms: [] },
  { topic: 'Les Grecs', kind: 'fact', term: 'Sparte', summary: 'Cité grecque guerrière.', keyPoints: ['Les garçons de Sparte devenaient soldats dès 7 ans'], misconceptions: [], examples: [], synonyms: [] },
];
const FACTS = 7;

/** Two questions on each fact (true/false and a 3-option choice), tagged with it. */
function questionsFor(concepts: Concept[], only?: (c: Concept, f: number) => boolean): Question[] {
  return concepts.flatMap((c) =>
    c.keyPoints.flatMap((_, f) => {
      if (only && !only(c, f)) return [];
      const ctx = { concepts: [c], language: 'fr' as const, seed: hashString(`${c.id}${f}`) };
      return [
        questionFromDraft({ c: 1, f: f + 1, type: 'tf', q: `Vrai ou faux : énoncé numéro ${f + 1} au sujet de ${c.term} qui est vrai.`, answer: true, why: 'Parce que.' }, ctx),
        questionFromDraft({ c: 1, f: f + 1, type: 'mcq', q: `Question à choix ${f + 1} sur ${c.term} : laquelle est juste?`, options: ['La bonne', 'Une erreur', 'Une autre erreur'], answer: 0, why: 'Parce que.' }, ctx),
      ].filter((q): q is Question => !!q);
    }),
  );
}

async function newDeck(withBank = true) {
  const { id } = await api<{ id: string }>('POST', '/api/local/decks', { title: 'Antiquité', subject: 'Histoire', language: 'fr', concepts: ideas, options: { level: 'Secondaire 1', detail: 'all', styles: ['quick'], bogus: 1 } });
  const d = await api<{ concepts: Concept[]; deck: { options: object } }>('GET', `/api/decks/${id}/offline`);
  if (withBank) await api('PATCH', `/api/local/decks/${id}/bank`, { add: questionsFor(d.concepts) });
  return { id, concepts: d.concepts, options: d.deck.options };
}

/** The full question behind what the page sees (the questions page has the answers). */
async function full(deckId: string, prompt: string): Promise<Question> {
  const all = await api<{ questions: Question[] }>('GET', `/api/local/decks/${deckId}/questions`);
  return all.questions.find((q) => q.prompt === prompt)!;
}
const wrongAnswer = (q: Question): Answer => (q.format === 'true_false' || q.format === 'multiple_choice' ? { kind: 'choice', optionId: q.options.find((o) => o.id !== q.correctId)!.id } : { kind: 'text', text: 'zzz' });

describe('whole-deck rounds', () => {
  it('keeps the options chosen when making the deck (well-formed ones only)', async () => {
    const { options } = await newDeck(false);
    expect(options).toEqual({ level: 'Secondaire 1', detail: 'all', styles: ['quick'] });
  });

  it('asks one question per fact, topic by topic, never the same question twice, a missed fact again with another question', async () => {
    const { id } = await newDeck();
    const m = await api('GET', `/api/decks/${id}`);
    expect(m.facts).toBe(FACTS);
    expect(m.roundSize).toBe(FACTS);
    expect(m.factsCovered).toBe(FACTS);
    let r = await api('POST', `/api/decks/${id}/sessions`, { mode: 'practice', full: true, length: 10 });
    expect(r.session.total).toBe(FACTS);
    expect(r.session.full).toBe(true);
    const asked: Question[] = [];
    const topics: string[] = [];
    let missedOnce = false;
    let topicDone: { topic: string; right: number; total: number }[] = [];
    let fixed = false;
    for (let i = 0; i < 30 && r.question; i++) {
      const q = await full(id, r.question.prompt);
      asked.push(q);
      topics.push(r.session.topic);
      // Miss the very first question once; everything else right.
      const a = !missedOnce ? wrongAnswer(q) : perfectAnswer(q);
      missedOnce = true;
      r = await api('POST', `/api/sessions/${r.session.id}/answer`, { questionId: r.question.id, answer: a, timeMs: 3000 });
      if (r.result.topicDone) topicDone = [...topicDone, r.result.topicDone];
      if (r.result.fixed) fixed = true;
      r = { ...r, question: r.next };
    }
    expect(r.summary).toBeTruthy();
    // 7 facts + 1 retry of the missed one.
    expect(asked).toHaveLength(FACTS + 1);
    expect(new Set(asked.map((q) => q.variantKey)).size).toBe(asked.length);
    const facts = new Set(asked.map((q) => `${q.conceptId}:${q.facts![0]}`));
    expect(facts.size).toBe(FACTS);
    // The retry is on the same fact as the miss, with the other question.
    const missed = asked[0]!;
    const again = asked.slice(1).find((q) => q.conceptId === missed.conceptId && q.facts![0] === missed.facts![0])!;
    expect(again.variantKey).not.toBe(missed.variantKey);
    expect(fixed).toBe(true);
    // Romans first, then Greeks (the notes' order), each closed with "topic done".
    const firstGreek = topics.indexOf('Les Grecs');
    expect(topics.slice(0, firstGreek).every((t) => t === 'Les Romains')).toBe(true);
    expect(topics.slice(firstGreek).every((t) => t === 'Les Grecs')).toBe(true);
    expect(topicDone.map((x) => x.topic)).toEqual(['Les Romains', 'Les Grecs']);
    expect(topicDone[0]!.total).toBe(5);
  });

  it('a second round asks the other questions (new ones first)', async () => {
    const { id } = await newDeck();
    const play = async () => {
      const keys: string[] = [];
      let r = await api('POST', `/api/decks/${id}/sessions`, { mode: 'practice', full: true });
      while (r.question) {
        const q = await full(id, r.question.prompt);
        keys.push(q.variantKey);
        r = await api('POST', `/api/sessions/${r.session.id}/answer`, { questionId: r.question.id, answer: perfectAnswer(q) });
        r = { ...r, question: r.next };
      }
      return keys;
    };
    const one = await play();
    const two = await play();
    expect(one).toHaveLength(FACTS);
    expect(two).toHaveLength(FACTS);
    expect(two.filter((k) => one.includes(k))).toHaveLength(0);
  });

  it('a quick round takes a few facts from different ideas', async () => {
    const { id } = await newDeck();
    const r = await api('POST', `/api/decks/${id}/sessions`, { mode: 'practice', length: 4 });
    expect(r.session.total).toBe(4);
    expect(r.session.full).toBe(false);
  });

  it('waits for questions Claude is still writing instead of ending the round', async () => {
    const { id, concepts } = await newDeck(false);
    // Only the Romans are written so far.
    await api('PATCH', `/api/local/decks/${id}/bank`, { add: questionsFor(concepts, (c) => c.topic === 'Les Romains') });
    writingNow.add(id);
    let r = await api('POST', `/api/decks/${id}/sessions`, { mode: 'practice', full: true });
    expect(r.session.total).toBe(FACTS);
    let n = 0;
    while (r.question) {
      const q = await full(id, r.question.prompt);
      r = await api('POST', `/api/sessions/${r.session.id}/answer`, { questionId: r.question.id, answer: perfectAnswer(q) });
      r = { ...r, question: r.next };
      n++;
    }
    expect(n).toBe(4);
    expect(r.summary).toBeNull();
    expect(r.session.waiting).toBe(true);
    // The Greeks arrive: the round goes on.
    await api('PATCH', `/api/local/decks/${id}/bank`, { add: questionsFor(concepts, (c) => c.topic === 'Les Grecs') });
    const back = await api('GET', `/api/sessions/${r.session.id}`);
    expect(back.question).toBeTruthy();
    expect(back.session.topic).toBe('Les Grecs');
    // Writing stops with nothing left to ask: the round ends.
    writingNow.delete(id);
  });

  it('a round started while nothing more is being written leaves out facts with no question', async () => {
    const { id, concepts } = await newDeck(false);
    await api('PATCH', `/api/local/decks/${id}/bank`, { add: questionsFor(concepts, (c, f) => !(c.term === 'Rome' && f === 2)) });
    let r = await api('POST', `/api/decks/${id}/sessions`, { mode: 'practice', full: true });
    let n = 0;
    while (r.question) {
      const q = await full(id, r.question.prompt);
      r = await api('POST', `/api/sessions/${r.session.id}/answer`, { questionId: r.question.id, answer: perfectAnswer(q) });
      r = { ...r, question: r.next };
      n++;
    }
    expect(n).toBe(FACTS - 1);
    expect(r.summary.answered).toBe(FACTS - 1);
  });
});

describe('adding notes and editing questions', () => {
  it('adds new facts at the end of an idea (old question tags stay right) and new ideas after their topic', async () => {
    const { id } = await newDeck();
    const r = await api('POST', `/api/local/decks/${id}/ideas`, {
      concepts: [
        { topic: 'Les Romains', term: 'rome', summary: 'x', keyPoints: ['Les Romains parlaient le latin', 'Rome avait un Sénat'] },
        { topic: 'Les Romains', term: 'Colisée', summary: 'Amphithéâtre de Rome.', keyPoints: ['Le Colisée accueillait des combats de gladiateurs'] },
      ],
    });
    expect(r).toMatchObject({ ideas: 1, facts: 2 });
    const d = await api<{ concepts: Concept[] }>('GET', `/api/decks/${id}/offline`);
    expect(d.concepts.find((c) => c.term === 'Rome')!.keyPoints).toEqual(['Les Romains vivaient en Italie', 'Rome a été fondée en 753 av. J.-C.', 'Les Romains parlaient le latin', 'Rome avait un Sénat']);
    expect(d.concepts.map((c) => c.term)).toEqual(['Rome', 'Légion', 'Colisée', 'Athènes', 'Sparte']);
    const fresh = await api('GET', `/api/local/decks/${id}/fresh`);
    expect(fresh.uncovered).toBe(2);
    await expect(api('POST', `/api/local/decks/${id}/ideas`, { concepts: [{ topic: 'x', term: 'Rome', keyPoints: ['Les Romains vivaient en Italie'] }] })).rejects.toMatchObject({ code: 'nothing_new' });
  });

  it('lists every question with its answer, and lets the learner fix, add and remove them', async () => {
    const { id, concepts } = await newDeck();
    const list = await api('GET', `/api/local/decks/${id}/questions`);
    expect(list.questions).toHaveLength(FACTS * 2);
    expect(list.questions[0].answer).toBeTruthy();
    const q = list.questions.find((x: Question) => x.format === 'multiple_choice') as Question;
    const edited = await api('PUT', `/api/local/decks/${id}/questions/${encodeURIComponent(q.variantKey)}`, { draft: { type: 'mcq', q: 'Où vivaient les Romains?', options: ['En Italie', 'En Grèce', 'En Égypte'], answer: 0, why: '' } });
    expect(edited.question.prompt).toBe('Où vivaient les Romains?');
    expect(edited.question.answer).toBe('En Italie');
    expect(edited.question.facts).toEqual(q.facts); // still tagged with its fact
    const added = await api('POST', `/api/local/decks/${id}/questions`, { conceptId: concepts[0]!.id, draft: { type: 'typed', f: 2, q: 'En quelle année Rome a-t-elle été fondée?', accepted: ['753 av. J.-C.', '-753'], why: 'Selon la légende.' } });
    expect(added.question.facts).toEqual([1]);
    const after = await api('GET', `/api/local/decks/${id}/questions`);
    expect(after.questions).toHaveLength(FACTS * 2 + 1);
    await api('DELETE', `/api/local/decks/${id}/questions/${encodeURIComponent(added.question.variantKey)}`);
    expect((await api('GET', `/api/local/decks/${id}/questions`)).questions).toHaveLength(FACTS * 2);
    await expect(api('POST', `/api/local/decks/${id}/questions`, { conceptId: concepts[0]!.id, draft: { type: 'mcq', q: 'Trop peu de choix?', options: ['a', 'b'], answer: 0 } })).rejects.toMatchObject({ code: 'bad_question' });
  });
});

describe('the account copy', () => {
  it('keeps each deck, its questions (in parts) and its progress in their own documents', async () => {
    const { id } = await newDeck();
    const r = await api('POST', `/api/decks/${id}/sessions`, { mode: 'practice', length: 3 });
    await api('POST', `/api/sessions/${r.session.id}/answer`, { questionId: r.question.id, answer: perfectAnswer(await full(id, r.question.prompt)) });
    // Let the background save run.
    await new Promise((r) => setTimeout(r, 1800));
    for (let i = 0; i < 50 && !store.has(`data/users/u1/prog-${id}`); i++) await new Promise((r) => setTimeout(r, 100));
    const deckDoc = store.get(`data/users/u1/deck-${id}`) as { bank?: unknown; bankChunks: number };
    expect(deckDoc).toBeTruthy();
    expect(deckDoc.bank).toBeUndefined();
    expect(deckDoc.bankChunks).toBe(1);
    expect((store.get(`data/users/u1/bank-${id}-0`) as { questions: unknown[] }).questions).toHaveLength(FACTS * 2);
    const prog = store.get(`data/users/u1/prog-${id}`) as { states: Record<string, unknown>; facts: Record<string, unknown> };
    expect(Object.keys(prog.facts).length).toBeGreaterThan(0);
    const main = store.get('data/users/u1/main') as { states: Record<string, unknown>; seen?: unknown };
    expect(main.seen).toBeUndefined();
    for (const k of Object.keys(prog.states)) expect(main.states[k]).toBeUndefined();

    // Another device (empty browser) gets it all back.
    mem.clear();
    vi.resetModules();
    const again = (await import('../../apps/web/src/local/backend')) as unknown as { localApi: typeof localApi };
    const d = await again.localApi<{ bank: Question[]; concepts: Concept[] }>('GET', `/api/decks/${id}/offline`, {});
    expect(d.bank).toHaveLength(FACTS * 2);
    const m = await again.localApi<{ concepts: { factsKnown: number }[] }>('GET', `/api/decks/${id}`, {});
    expect(m.concepts.some((c) => c.factsKnown > 0)).toBe(true);
  }, 20_000);
});

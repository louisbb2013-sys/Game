import { SANDBOX_KINDS } from '@lumo/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, setupTestApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
afterAll(async () => { await t.close(); });

const NOTES = `# The Water Cycle
Evaporation is when liquid water turns into water vapour because of the sun's heat.
Condensation is the process where water vapour cools and turns into tiny droplets, forming clouds.
Precipitation is water falling from clouds as rain, snow or hail.
Transpiration is water released by plants through tiny holes in their leaves.
Runoff is water that flows over the ground into rivers and the sea.
For example, morning dew on grass is condensation.
If the temperature drops, more water vapour condenses.

Stages of the water cycle:
1. Water evaporates from oceans
2. Vapour rises and cools
3. Clouds form by condensation
4. Rain falls back to the ground`;

async function login(name: string) {
  return cookieFrom(await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name } }));
}
const post = (url: string, cookie: string, payload?: unknown) => t.app.inject({ method: 'POST', url, headers: { cookie }, payload: payload as object });

describe('chat deck builder (offline AI)', () => {
  it('notes → What I understood → edit → build → quiz/sandbox/tutor', async () => {
    const cookie = await login('chatter');
    const { id } = (await post('/api/chats', cookie)).json();
    const first = (await t.app.inject({ method: 'GET', url: `/api/chats/${id}`, headers: { cookie } })).json();
    expect(first.messages[0].role).toBe('assistant');

    const r1 = (await post(`/api/chats/${id}/messages`, cookie, { text: NOTES })).json();
    expect(r1.messages.at(-1).card).toEqual({ type: 'draft' });
    expect(r1.draft.concepts.length).toBeGreaterThanOrEqual(5);
    expect(r1.draft.title).toBe('The Water Cycle');

    const r2 = (await post(`/api/chats/${id}/messages`, cookie, { text: 'runoff is not on the exam, remove it' })).json();
    expect(r2.draft.concepts.map((c: { term: string }) => c.term)).not.toContain('Runoff');

    // Manual edit of the draft (rename the deck).
    const edited = { ...r2.draft, title: 'Water cycle — test Friday' };
    expect((await t.app.inject({ method: 'PUT', url: `/api/chats/${id}/draft`, headers: { cookie }, payload: { draft: edited } })).statusCode).toBe(200);

    const r3 = (await post(`/api/chats/${id}/messages`, cookie, { text: 'Looks good, build it!' })).json();
    const deckCard = r3.messages.at(-1).card;
    expect(deckCard.type).toBe('deck');
    expect(deckCard.title).toBe('Water cycle — test Friday');
    const deck = (await t.app.inject({ method: 'GET', url: `/api/decks/${deckCard.deckId}`, headers: { cookie } })).json();
    expect(deck.concepts.length).toBe(r2.draft.concepts.length);

    const r4 = (await post(`/api/chats/${id}/messages`, cookie, { text: 'make me a crossword about condensation' })).json();
    expect(r4.messages.at(-1).card).toMatchObject({ type: 'sandbox', kind: 'crossword' });

    const r5 = (await post(`/api/chats/${id}/messages`, cookie, { text: 'quiz me but make it harder' })).json();
    expect(r5.messages.at(-1).card).toMatchObject({ type: 'quiz', label: 'harder', mode: 'practice' });
    const s = await post(`/api/decks/${deckCard.deckId}/sessions`, cookie, { mode: 'practice', formats: r5.messages.at(-1).card.formats });
    expect(s.statusCode).toBe(200);

    const r6 = (await post(`/api/chats/${id}/messages`, cookie, { text: 'quiz me only on what I got wrong' })).json();
    expect(r6.messages.at(-1).card).toMatchObject({ type: 'quiz', label: 'wrong', mode: 'wrong_only' });

    const r7 = (await post(`/api/chats/${id}/messages`, cookie, { text: 'can you explain evaporation again?' })).json();
    expect(r7.messages.at(-1).content).toMatch(/Evaporation/);

    const again = await post(`/api/chats/${id}/build`, cookie);
    expect(again.statusCode).toBe(409);
  });

  it('uploads need consent, valid types and are deleted after building', async () => {
    const cookie = await login('uploader');
    const { id } = (await post('/api/chats', cookie)).json();
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    expect((await post(`/api/chats/${id}/uploads`, cookie, { kind: 'image', mime: 'image/png', name: 'notes.png', data: png, consent: false })).json().error).toBe('consent_required');
    expect((await post(`/api/chats/${id}/uploads`, cookie, { kind: 'image', mime: 'image/svg+xml', name: 'x.svg', data: png, consent: true })).statusCode).toBe(415);
    expect((await post(`/api/chats/${id}/uploads`, cookie, { kind: 'pdf', mime: 'application/pdf', name: 'x.pdf', data: png, consent: true })).statusCode).toBe(415);
    const img = (await post(`/api/chats/${id}/uploads`, cookie, { kind: 'image', mime: 'image/png', name: 'notes.png', data: png, consent: true })).json();
    // Offline mode can't read photos and says so kindly.
    const r = (await post(`/api/chats/${id}/messages`, cookie, { text: 'my bio test is friday', uploadIds: [img.id] })).json();
    expect(r.messages.at(-1).card).toEqual({ type: 'error', code: 'images_need_ai' });
    // A text file works offline.
    const txt = (await post(`/api/chats/${id}/uploads`, cookie, { kind: 'text', mime: 'text/plain', name: 'notes.txt', data: Buffer.from(NOTES).toString('base64'), consent: true })).json();
    const r2 = (await post(`/api/chats/${id}/messages`, cookie, { text: 'here are my notes', uploadIds: [txt.id] })).json();
    expect(r2.draft.concepts.length).toBeGreaterThan(3);
    await post(`/api/chats/${id}/build`, cookie);
    const left = await t.db.query('SELECT count(*)::int AS n FROM uploads WHERE chat_id = $1', [id]);
    expect(left.rows[0].n).toBe(0);

    const other = await login('snooper');
    expect((await t.app.inject({ method: 'GET', url: `/api/chats/${id}`, headers: { cookie: other } })).statusCode).toBe(404);
    expect((await post(`/api/chats/${id}/uploads`, other, { kind: 'text', mime: 'text/plain', name: 'a', data: 'YQ==', consent: true })).statusCode).toBe(404);
  });
});

describe('sandbox API', () => {
  it('creates every format, plays, and awards XP once with a daily cap', async () => {
    const cookie = await login('sandboxer');
    const deckId = (await post('/api/decks/sample', cookie, { language: 'en' })).json().id;
    const formats = (await t.app.inject({ method: 'GET', url: `/api/decks/${deckId}/sandbox`, headers: { cookie } })).json().formats;
    expect(formats.every((f: { available: boolean }) => f.available)).toBe(true);

    const ids: string[] = [];
    for (const kind of SANDBOX_KINDS) {
      const r = await post('/api/sandbox', cookie, { deckId, kind });
      expect(r.statusCode, kind).toBe(200);
      expect(r.json().data.kind).toBe(kind);
      ids.push(r.json().id);
    }
    const asked = (await post('/api/sandbox/ask', cookie, { text: 'let’s do two truths and a lie on osmosis' })).json();
    expect(asked.kind).toBe('two_truths');
    expect((await post('/api/sandbox/ask', cookie, { text: 'hello' })).json().error).toBe('unknown_format');

    const c1 = (await post(`/api/sandbox/${ids[0]}/complete`, cookie, { score: 1 })).json();
    expect(c1.xp).toBe(25);
    expect(c1.streak.days).toBe(1);
    expect((await post(`/api/sandbox/${ids[0]}/complete`, cookie, { score: 1 })).json().xp).toBe(0); // once per activity
    let total = c1.xp;
    for (const id of ids.slice(1)) total += (await post(`/api/sandbox/${id}/complete`, cookie, { score: 1 })).json().xp;
    expect(total).toBe(400); // 16 activities would be 455 XP; capped per day
    const me = (await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().user;
    expect(me.xp).toBe(400);

    const other = await login('peeker');
    expect((await t.app.inject({ method: 'GET', url: `/api/sandbox/${ids[1]}`, headers: { cookie: other } })).statusCode).toBe(404);
    expect((await post('/api/sandbox', other, { deckId, kind: 'video' })).statusCode).toBe(404);
  });
});

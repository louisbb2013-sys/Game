import { normalize, parseSandboxRequest, type Concept, type Format, type Locale } from '@lumo/core';
import { z } from 'zod';
import { NeedsAiError, type AiProvider, type DeckDraft, type Media } from '../ai/provider.ts';
import type { Db } from '../db/pool.ts';
import { createDeck } from '../routes/decks.ts';
import { conceptInputSchema } from '../quiz/schemas.ts';
import { QuizError, type QuizService } from '../quiz/service.ts';
import type { SandboxService } from '../sandbox/service.ts';
import type { UserRow } from '../users.ts';

export type ChatCard =
  | { type: 'draft' }
  | { type: 'deck'; deckId: string; title: string; conceptCount: number }
  | { type: 'quiz'; deckId: string; mode: 'practice' | 'wrong_only' | 'challenge'; formats?: Format[]; label: 'quiz' | 'harder' | 'wrong' }
  | { type: 'sandbox'; activityId: string; kind: string; title: string }
  | { type: 'error'; code: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: { id: string; kind: string; name: string }[];
  card: ChatCard | null;
  createdAt: string;
}

export const draftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(80).default(''),
  language: z.enum(['en', 'fr']),
  summary: z.string().max(2000).default(''),
  ignored: z.array(z.string().max(200)).max(30).default([]),
  concepts: z.array(conceptInputSchema).min(1).max(200),
});

const LIMITS = { image: 6_000_000, pdf: 20_000_000, text: 1_000_000 };
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const HARDER_FORMATS: Format[] = ['apply', 'compare', 'spot_mistake', 'cause_effect', 'calculation', 'explain', 'teach_back', 'multiple_select', 'categorize', 'true_false_justify'];

const has = (t: string, words: string[]) => words.some((w) => t.includes(` ${w} `));
const INTENTS = {
  build: ['build', 'create', 'make the deck', 'make it', 'looks good', 'perfect', 'go', 'ok build', 'thats good', 'that s good', 'lets go', 'cree', 'creer', 'construis', 'c est bon', 'parfait', 'vas y', 'go go'],
  harder: ['harder', 'more difficult', 'challenge me', 'too easy', 'plus difficile', 'plus dur', 'trop facile'],
  wrong: ['got wrong', 'wrong', 'mistakes', 'my errors', 'missed', 'erreurs', 'rate', 'trompe', 'fautes'],
  quiz: ['quiz', 'test me', 'quiz me', 'practice', 'start', 'interroge', 'teste', 'entraine', 'commencer', 'questionne'],
};

export class ChatService {
  constructor(
    private db: Db,
    private ai: AiProvider,
    private quiz: QuizService,
    private sandbox: SandboxService,
    private log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  async create(user: UserRow): Promise<{ id: string }> {
    const { rows } = await this.db.query<{ id: string }>('INSERT INTO chats (user_id) VALUES ($1) RETURNING id', [user.id]);
    const greeting =
      user.locale === 'fr'
        ? 'Salut ! 👋 Envoie-moi des photos de tes notes, un PDF ou du texte, et dis-moi pour quel examen tu étudies. Je garde l’essentiel et je te prépare un paquet et un quiz.'
        : 'Hi! 👋 Send me photos of your notes, a PDF or some text, and tell me what exam you’re studying for. I’ll keep what matters and build you a deck and a quiz.';
    await this.addMessage(rows[0]!.id, 'assistant', greeting);
    return { id: rows[0]!.id };
  }

  async list(user: UserRow) {
    const { rows } = await this.db.query(
      `SELECT id, title, deck_id AS "deckId", updated_at AS "updatedAt" FROM chats WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 30`,
      [user.id],
    );
    return rows;
  }

  async get(user: UserRow, chatId: string) {
    const chat = await this.chatRow(user, chatId);
    const { rows } = await this.db.query<{ id: string; role: 'user' | 'assistant'; content: string; attachments: ChatMessage['attachments']; card: ChatCard | null; created_at: Date }>(
      'SELECT id, role, content, attachments, card, created_at FROM chat_messages WHERE chat_id = $1 ORDER BY id',
      [chatId],
    );
    return {
      id: chat.id,
      title: chat.title,
      deckId: chat.deck_id,
      draft: chat.draft,
      messages: rows.map((m) => ({ id: String(m.id), role: m.role, content: m.content, attachments: m.attachments, card: m.card, createdAt: m.created_at.toISOString() })),
    };
  }

  async remove(user: UserRow, chatId: string) {
    await this.db.query('DELETE FROM chats WHERE id = $1 AND user_id = $2', [chatId, user.id]);
  }

  private async chatRow(user: UserRow, chatId: string) {
    const { rows } = await this.db.query<{ id: string; title: string; deck_id: string | null; draft: DeckDraft | null }>('SELECT id, title, deck_id, draft FROM chats WHERE id = $1 AND user_id = $2', [
      chatId,
      user.id,
    ]);
    if (!rows[0]) throw new QuizError(404, 'chat_not_found');
    return rows[0];
  }

  private async addMessage(chatId: string, role: 'user' | 'assistant', content: string, extra: { attachments?: ChatMessage['attachments']; card?: ChatCard } = {}): Promise<ChatMessage> {
    const { rows } = await this.db.query<{ id: string; created_at: Date }>(
      'INSERT INTO chat_messages (chat_id, role, content, attachments, card) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at',
      [chatId, role, content, JSON.stringify(extra.attachments ?? []), extra.card ? JSON.stringify(extra.card) : null],
    );
    await this.db.query('UPDATE chats SET updated_at = now() WHERE id = $1', [chatId]);
    return { id: String(rows[0]!.id), role, content, attachments: extra.attachments ?? [], card: extra.card ?? null, createdAt: rows[0]!.created_at.toISOString() };
  }

  /** Store an uploaded file (only with explicit consent). Returned id is attached to the next message. */
  async upload(user: UserRow, chatId: string, f: { kind: 'image' | 'pdf' | 'text'; mime: string; name: string; data: string; consent: boolean }) {
    await this.chatRow(user, chatId);
    if (!f.consent) throw new QuizError(400, 'consent_required');
    if (f.kind === 'image' && !IMAGE_MIMES.includes(f.mime)) throw new QuizError(415, 'unsupported_file');
    if (f.kind === 'pdf' && f.mime !== 'application/pdf') throw new QuizError(415, 'unsupported_file');
    const bytes = Buffer.from(f.data, 'base64');
    if (bytes.length === 0 || bytes.length > LIMITS[f.kind]) throw new QuizError(413, 'file_too_large');
    if (f.kind === 'pdf' && bytes.subarray(0, 4).toString() !== '%PDF') throw new QuizError(415, 'unsupported_file');
    const { rows } = await this.db.query<{ id: string }>('INSERT INTO uploads (user_id, chat_id, kind, mime, name, bytes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [
      user.id,
      chatId,
      f.kind,
      f.mime,
      f.name.slice(0, 120),
      bytes,
    ]);
    return { id: rows[0]!.id, kind: f.kind, name: f.name.slice(0, 120) };
  }

  /** One turn of the conversation. Returns the new messages (user + assistant). */
  async send(user: UserRow, chatId: string, text: string, uploadIds: string[]): Promise<{ messages: ChatMessage[]; draft: DeckDraft | null; deckId: string | null }> {
    const chat = await this.chatRow(user, chatId);
    const uploads = uploadIds.length
      ? (
          await this.db.query<{ id: string; kind: Media['kind']; mime: string; name: string; bytes: Buffer }>(
            'SELECT id, kind, mime, name, bytes FROM uploads WHERE id = ANY($1::uuid[]) AND user_id = $2 AND chat_id = $3',
            [uploadIds, user.id, chatId],
          )
        ).rows
      : [];
    const userMsg = await this.addMessage(chatId, 'user', text, { attachments: uploads.map((u) => ({ id: u.id, kind: u.kind, name: u.name })) });
    const lang: Locale = user.locale;
    const fr = lang === 'fr';
    const t = ` ${normalize(text)} `;
    const out: ChatMessage[] = [userMsg];
    let draft = chat.draft;
    let deckId = chat.deck_id;

    const reply = async (content: string, card?: ChatCard) => out.push(await this.addMessage(chatId, 'assistant', content, { card }));

    // 1. New material → read it and show "What I understood".
    if (uploads.length > 0 || text.length > 280) {
      try {
        // A long message without files is the material itself.
        const media: Media[] = uploads.length
          ? uploads.map((u) => ({ kind: u.kind, mime: u.mime, name: u.name, data: u.bytes }))
          : [{ kind: 'text', mime: 'text/plain', name: 'notes', data: Buffer.from(text) }];
        const extracted = await this.ai.extractConcepts({ media, instruction: uploads.length ? text : '', language: lang });
        draft = mergeDraft(deckId ? null : draft, extracted);
        await this.db.query('UPDATE chats SET draft = $2, title = $3 WHERE id = $1', [chatId, JSON.stringify(draft), draft.title]);
        await reply(draft.summary, { type: 'draft' });
      } catch (err) {
        const code = err instanceof NeedsAiError ? err.code : 'extract_failed';
        if (!(err instanceof NeedsAiError)) this.log('extraction failed', err);
        await reply(errorText(code, fr), { type: 'error', code });
      }
      return { messages: out, draft, deckId };
    }

    // 2. A draft is waiting: build it, or apply a change in plain words.
    if (draft && !deckId) {
      if (has(t, INTENTS.build)) {
        const built = await this.build(user, chatId, draft, false);
        out.push(...built.messages);
        return { messages: out, draft, deckId: built.deckId };
      }
      const edited = await this.ai.editDraft(draft, text).catch((err) => (this.log('editDraft failed', err), null));
      if (edited) {
        draft = edited;
        await this.db.query('UPDATE chats SET draft = $2 WHERE id = $1', [chatId, JSON.stringify(draft)]);
        await reply(fr ? `C’est fait ! Il reste ${draft.concepts.length} notions. Autre chose, ou je crée le paquet ?` : `Done! ${draft.concepts.length} concepts left. Anything else, or shall I build the deck?`, { type: 'draft' });
        return { messages: out, draft, deckId };
      }
    }

    // 3. With a deck: Sandbox activities and quiz shortcuts.
    if (deckId) {
      const { concepts } = await this.quiz.loadDeck(deckId, user.id);
      const intent = parseSandboxRequest(text, concepts);
      if (intent.kind) {
        try {
          const a = await this.sandbox.create(user, deckId, intent.kind, intent.focus);
          await reply(fr ? 'Voilà ! Je t’ai préparé ça :' : 'Here you go! I made this for you:', { type: 'sandbox', activityId: a.id, kind: a.kind, title: a.title });
        } catch {
          await reply(fr ? 'Ce format ne marche pas avec ces notes — essaie-en un autre !' : 'That format doesn’t work with these notes — try another one!', { type: 'error', code: 'format_not_possible' });
        }
        return { messages: out, draft, deckId };
      }
      const label = has(t, INTENTS.harder) ? 'harder' : has(t, INTENTS.wrong) ? 'wrong' : has(t, INTENTS.quiz) ? 'quiz' : null;
      if (label) {
        const card: ChatCard =
          label === 'harder'
            ? { type: 'quiz', deckId, mode: 'practice', formats: HARDER_FORMATS, label }
            : label === 'wrong'
              ? { type: 'quiz', deckId, mode: 'wrong_only', label }
              : { type: 'quiz', deckId, mode: 'practice', label };
        const msg = {
          harder: fr ? 'Ok, on monte le niveau : questions d’application, d’analyse et d’explication. 💪' : 'Okay, levelling up: apply, analyze and explain questions. 💪',
          wrong: fr ? 'On se concentre sur ce que tu as raté — posé autrement cette fois.' : 'Let’s focus on what you missed — asked differently this time.',
          quiz: fr ? 'C’est parti ! Chaque question sera nouvelle.' : 'Let’s go! Every question will be new.',
        }[label];
        await reply(msg, card);
        return { messages: out, draft, deckId };
      }
    } else if (parseSandboxRequest(text).kind) {
      await reply(fr ? 'Envoie-moi d’abord tes notes, puis je te fais ça avec plaisir !' : 'Send me your notes first, then I’ll happily make that for you!');
      return { messages: out, draft, deckId };
    }

    // 4. Otherwise: tutor conversation.
    const history = (await this.db.query<{ role: 'user' | 'assistant'; content: string }>('SELECT role, content FROM chat_messages WHERE chat_id = $1 AND content <> \'\' ORDER BY id DESC LIMIT 12', [chatId])).rows.reverse();
    let deckCtx: { title: string; concepts: Concept[] } | undefined;
    if (deckId) {
      const d = await this.quiz.loadDeck(deckId, user.id);
      deckCtx = { title: d.deck.title, concepts: d.concepts };
    } else if (draft) deckCtx = { title: draft.title, concepts: draft.concepts.map((c, i) => ({ ...c, id: String(i) })) };
    try {
      await reply(await this.ai.tutorReply({ history, language: lang, deck: deckCtx }));
    } catch (err) {
      this.log('tutor failed', err);
      await reply(errorText('tutor_failed', fr), { type: 'error', code: 'tutor_failed' });
    }
    return { messages: out, draft, deckId };
  }

  async saveDraft(user: UserRow, chatId: string, input: unknown): Promise<DeckDraft> {
    const chat = await this.chatRow(user, chatId);
    if (chat.deck_id) throw new QuizError(409, 'already_built');
    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) throw new QuizError(400, 'invalid_draft');
    await this.db.query('UPDATE chats SET draft = $2, title = $3, updated_at = now() WHERE id = $1', [chatId, JSON.stringify(parsed.data), parsed.data.title]);
    return parsed.data;
  }

  /** Turn the draft into a real deck. Uploaded files are deleted right after (privacy). */
  async build(user: UserRow, chatId: string, draftInput?: unknown, addUserMessage = true): Promise<{ deckId: string; messages: ChatMessage[] }> {
    const chat = await this.chatRow(user, chatId);
    if (chat.deck_id) throw new QuizError(409, 'already_built');
    const parsed = draftSchema.safeParse(draftInput ?? chat.draft);
    if (!parsed.success) throw new QuizError(400, 'invalid_draft');
    const d = parsed.data;
    const deckId = await createDeck(this.db, user.id, { title: d.title, subject: d.subject, language: d.language, summary: d.summary, concepts: d.concepts });
    await this.db.query('UPDATE chats SET deck_id = $2, draft = $3, title = $4 WHERE id = $1', [chatId, deckId, JSON.stringify(d), d.title]);
    await this.db.query('DELETE FROM uploads WHERE chat_id = $1', [chatId]);
    const fr = user.locale === 'fr';
    const messages: ChatMessage[] = [];
    if (addUserMessage) messages.push(await this.addMessage(chatId, 'user', fr ? 'Crée le paquet !' : 'Build the deck!'));
    messages.push(
      await this.addMessage(
        chatId,
        'assistant',
        fr
          ? `Ton paquet « ${d.title} » est prêt avec ${d.concepts.length} notions. 🎉 On fait un quiz, ou tu préfères une activité du Bac à sable (vidéo, mots croisés, escape game…) ?`
          : `Your deck “${d.title}” is ready with ${d.concepts.length} concepts. 🎉 Want a quiz, or something from the Sandbox (video, crossword, escape room…)?`,
        { card: { type: 'deck', deckId, title: d.title, conceptCount: d.concepts.length } },
      ),
    );
    return { deckId, messages };
  }
}

function mergeDraft(prev: DeckDraft | null, next: DeckDraft): DeckDraft {
  if (!prev) return next;
  // New photos in the same chat add to the draft ("also include chapter 3").
  const seen = new Set(prev.concepts.map((c) => c.term.toLowerCase()));
  return { ...prev, summary: next.summary, ignored: [...prev.ignored, ...next.ignored].slice(0, 30), concepts: [...prev.concepts, ...next.concepts.filter((c) => !seen.has(c.term.toLowerCase()))].slice(0, 200) };
}

function errorText(code: string, fr: boolean): string {
  const msgs: Record<string, [string, string]> = {
    images_need_ai: [
      'I can’t read photos or PDFs yet because the AI isn’t set up on this server. Paste your notes as text and I’ll do it right away!',
      'Je ne peux pas encore lire les photos ou PDF car l’IA n’est pas configurée sur ce serveur. Colle tes notes en texte et je m’en occupe tout de suite !',
    ],
    nothing_found: [
      'I couldn’t find clear ideas to study in that. Try clearer photos, or notes with definitions like “X is …”.',
      'Je n’ai pas trouvé d’idées claires à étudier là-dedans. Essaie des photos plus nettes, ou des notes avec des définitions comme « X est … ».',
    ],
    extract_failed: ['Oops, I had trouble reading that. Can you try again?', 'Oups, j’ai eu du mal à lire ça. Tu peux réessayer ?'],
    tutor_failed: ['Sorry, I couldn’t answer just now. Try again in a moment!', 'Désolé, je n’ai pas pu répondre. Réessaie dans un instant !'],
  };
  const m = msgs[code] ?? msgs.extract_failed!;
  return fr ? m[1] : m[0];
}


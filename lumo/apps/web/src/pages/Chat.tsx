import { SANDBOX_EMOJI, type ConceptInput, type SandboxKind } from '@lumo/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { prepareFile, type PreparedFile } from '../lib/files';

interface Draft {
  title: string;
  subject: string;
  language: 'en' | 'fr';
  summary: string;
  ignored: string[];
  concepts: ConceptInput[];
}
type Card =
  | { type: 'draft' }
  | { type: 'deck'; deckId: string; title: string; conceptCount: number }
  | { type: 'quiz'; deckId: string; mode: string; formats?: string[]; label: 'quiz' | 'harder' | 'wrong' }
  | { type: 'sandbox'; activityId: string; kind: SandboxKind; title: string }
  | { type: 'error'; code: string };
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: { id: string; kind: string; name: string }[];
  card: Card | null;
}
interface ChatData {
  id: string;
  title: string;
  deckId: string | null;
  draft: Draft | null;
  messages: Message[];
}

/** /chat → open the latest conversation or start one. */
export function ChatHome() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [chats, setChats] = useState<{ id: string; title: string; deckId: string | null }[] | null>(null);
  useEffect(() => {
    api<{ chats: { id: string; title: string; deckId: string | null }[] }>('/api/chats').then((r) => setChats(r.chats), () => setChats([]));
  }, []);
  const start = async () => navigate(`/chat/${(await api<{ id: string }>('/api/chats', { method: 'POST' })).id}`);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Lumo size={64} mood="happy" />
        <div>
          <h1 className="text-2xl font-black">{t('chat.title')}</h1>
          <p className="text-sm text-muted">{t('chat.subtitle')}</p>
        </div>
      </div>
      <button onClick={() => void start()} className="w-full rounded-2xl bg-brand py-4 text-lg font-black text-brand-ink shadow-[0_4px_0_0_rgb(0_0_0/0.18)]">
        📸 {t('chat.start')}
      </button>
      {chats && chats.length > 0 && (
        <ul className="space-y-2">
          {chats.map((c) => (
            <li key={c.id}>
              <Link to={`/chat/${c.id}`} className="flex items-center justify-between rounded-2xl bg-surface p-3 ring-1 ring-line">
                <span className="truncate font-bold">{c.title || t('chat.untitled')}</span>
                <span className="text-xs font-black text-muted">{c.deckId ? '✓ ' + t('chat.deckReady') : t('chat.inProgress')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Chat() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, update } = useAuth();
  const [chat, setChat] = useState<ChatData | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askConsent, setAskConsent] = useState<'file' | 'camera' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<ChatData>(`/api/chats/${id}`).then(setChat, () => setError('chat_not_found'));
  }, [id]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [chat?.messages.length, sending]);

  const pick = (input: React.RefObject<HTMLInputElement | null>) => {
    if (!user?.settings.uploadConsent) return setAskConsent(input === cameraInput ? 'camera' : 'file');
    input.current?.click();
  };
  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    for (const f of [...list].slice(0, 20 - files.length)) {
      try {
        const p = await prepareFile(f);
        setFiles((x) => [...x, p]);
      } catch (e) {
        setError(e instanceof Error && e.message === 'file_too_large' ? 'file_too_large' : 'unsupported_file');
      }
    }
  };

  const send = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault();
    const msg = preset ?? text;
    if (!chat || sending || (!msg.trim() && files.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      const uploadIds: string[] = [];
      for (const f of files) {
        const r = await api<{ id: string }>(`/api/chats/${chat.id}/uploads`, { method: 'POST', body: { kind: f.kind, mime: f.mime, name: f.name, data: f.data, consent: true } });
        uploadIds.push(r.id);
      }
      const r = await api<{ messages: Message[]; draft: Draft | null; deckId: string | null }>(`/api/chats/${chat.id}/messages`, { method: 'POST', body: { text: msg, uploadIds } });
      setChat((c) => (c ? { ...c, messages: [...c.messages, ...r.messages], draft: r.draft, deckId: r.deckId } : c));
      setText('');
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'network');
    } finally {
      setSending(false);
    }
  };

  const build = async (draft: Draft) => {
    if (!chat) return;
    setSending(true);
    try {
      const r = await api<{ deckId: string; messages: Message[] }>(`/api/chats/${chat.id}/build`, { method: 'POST', body: { draft } });
      setChat((c) => (c ? { ...c, deckId: r.deckId, draft, messages: [...c.messages, ...r.messages] } : c));
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'network');
    } finally {
      setSending(false);
    }
  };

  const startQuiz = async (card: Extract<Card, { type: 'quiz' }> | { deckId: string; mode: string; formats?: string[] }) => {
    const res = await api<{ session: { id: string } }>(`/api/decks/${card.deckId}/sessions`, { method: 'POST', body: { mode: card.mode, formats: card.formats } });
    navigate(`/quiz/${res.session.id}`, { state: res });
  };

  if (error === 'chat_not_found') return <p className="pt-16 text-center font-bold">{t('chat.notFound')}</p>;
  if (!chat) return <p className="pt-16 text-center font-bold text-muted">{t('common.loading')}</p>;
  const lastDraftIdx = chat.messages.map((m) => m.card?.type).lastIndexOf('draft');
  const suggestions = chat.deckId ? ['chat.sugHarder', 'chat.sugWrong', 'chat.sugVideo', 'chat.sugCrossword', 'chat.sugEscape'] : chat.draft ? ['chat.sugBuild'] : ['chat.sugExam'];

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link to="/chat" className="rounded-full bg-surface px-3 py-1 text-sm font-extrabold ring-1 ring-line">
          ←
        </Link>
        <h1 className="truncate text-lg font-black">{chat.title || t('chat.title')}</h1>
      </div>

      <ol className="flex-1 space-y-3" aria-live="polite">
        {chat.messages.map((m, idx) => (
          <li key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <span className="shrink-0">
                <Lumo size={36} mood={m.card?.type === 'error' ? 'sad' : 'happy'} />
              </span>
            )}
            <div className={`max-w-[85%] space-y-2 ${m.role === 'user' ? 'items-end' : ''}`}>
              {m.attachments.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {m.attachments.map((a) => (
                    <span key={a.id} className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-bold">
                      {a.kind === 'image' ? '🖼️' : a.kind === 'pdf' ? '📄' : '📝'} {a.name}
                    </span>
                  ))}
                </div>
              )}
              {m.content && (
                <div className={`rounded-2xl px-3.5 py-2.5 whitespace-pre-line ${m.role === 'user' ? 'rounded-br-sm bg-brand text-brand-ink' : 'rounded-tl-sm bg-surface ring-1 ring-line'}`}>
                  <RichText text={m.content} />
                </div>
              )}
              {m.card?.type === 'draft' && chat.draft && (idx === lastDraftIdx && !chat.deckId ? <DraftEditor chatId={chat.id} draft={chat.draft} onBuild={build} busy={sending} onSaved={(d) => setChat((c) => (c ? { ...c, draft: d } : c))} /> : <p className="text-xs font-bold text-muted">📋 {t('chat.draftSnapshot')}</p>)}
              {m.card?.type === 'deck' && (
                <div className="grid gap-2 rounded-2xl bg-amber-glow/15 p-3 ring-1 ring-amber-glow/40">
                  <p className="font-black">📚 {m.card.title}</p>
                  <button onClick={() => void startQuiz({ deckId: (m.card as { deckId: string }).deckId, mode: 'practice' })} className="rounded-xl bg-brand py-2.5 font-black text-brand-ink">
                    ✨ {t('chat.startQuiz')}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <Link to={`/decks/${m.card.deckId}`} className="rounded-xl bg-surface py-2 text-center font-bold ring-1 ring-line">
                      {t('chat.openDeck')}
                    </Link>
                    <Link to={`/sandbox?deck=${m.card.deckId}`} className="rounded-xl bg-surface py-2 text-center font-bold ring-1 ring-line">
                      🎨 {t('nav.sandbox')}
                    </Link>
                  </div>
                </div>
              )}
              {m.card?.type === 'quiz' && (
                <button onClick={() => void startQuiz(m.card as Extract<Card, { type: 'quiz' }>)} className="w-full rounded-xl bg-brand py-2.5 font-black text-brand-ink">
                  ▶ {t(`chat.quiz_${m.card.label}`)}
                </button>
              )}
              {m.card?.type === 'sandbox' && (
                <Link to={`/sandbox/play/${m.card.activityId}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-2 ring-brand">
                  <span className="text-3xl">{SANDBOX_EMOJI[m.card.kind]}</span>
                  <span className="min-w-0">
                    <span className="block font-black">{t(`sandbox.kinds.${m.card.kind}`)}</span>
                    <span className="block truncate text-xs text-muted">{m.card.title}</span>
                  </span>
                  <span className="ml-auto font-black text-brand">▶</span>
                </Link>
              )}
            </div>
          </li>
        ))}
        {sending && (
          <li className="flex items-center gap-2">
            <Lumo size={36} mood="thinking" />
            <span className="animate-pulse font-bold text-muted">{files.length ? t('chat.reading') : t('chat.thinking')}</span>
          </li>
        )}
      </ol>
      <div ref={bottom} />

      <div className="sticky bottom-24 mt-3 space-y-2 rounded-3xl bg-bg/95 pt-2 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {suggestions.map((k) => (
            <button key={k} type="button" disabled={sending} onClick={() => void send(undefined, t(k))} className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-sm font-bold ring-1 ring-line">
              {t(k)}
            </button>
          ))}
        </div>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, k) => (
              <span key={k} className="relative">
                {f.preview ? <img src={f.preview} alt={f.name} className="size-16 rounded-xl object-cover ring-1 ring-line" /> : <span className="grid size-16 place-items-center rounded-xl bg-surface-2 text-2xl">{f.kind === 'pdf' ? '📄' : '📝'}</span>}
                <button type="button" aria-label={t('chat.removeFile')} onClick={() => setFiles((x) => x.filter((_, j) => j !== k))} className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-bad text-xs font-black text-white">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
            {t(`chat.errors.${error}`, { defaultValue: t('signin.errors.network') })}
          </p>
        )}
        <form onSubmit={(e) => void send(e)} className="flex items-end gap-2">
          <button type="button" onClick={() => pick(cameraInput)} aria-label={t('chat.takePhoto')} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-xl ring-1 ring-line">
            📷
          </button>
          <button type="button" onClick={() => pick(fileInput)} aria-label={t('chat.attach')} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-xl ring-1 ring-line">
            📎
          </button>
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            className="max-h-40 min-h-12 flex-1 resize-none rounded-2xl border-2 border-line bg-surface px-3 py-2.5 outline-none focus:border-brand"
          />
          <button disabled={sending || (!text.trim() && files.length === 0)} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-xl font-black text-brand-ink disabled:opacity-40" aria-label={t('chat.send')}>
            ➤
          </button>
        </form>
        <input ref={fileInput} type="file" hidden multiple accept="image/*,application/pdf,.pdf,.txt,.md,.csv,.tsv" onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ''))} />
        <input ref={cameraInput} type="file" hidden accept="image/*" capture="environment" onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ''))} />
      </div>

      {askConsent && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="consent-title">
          <div className="pop-in max-w-sm space-y-3 rounded-3xl bg-surface p-5">
            <h2 id="consent-title" className="text-lg font-black">
              🔒 {t('chat.consentTitle')}
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>{t('chat.consent1')}</li>
              <li>{t('chat.consent2')}</li>
              <li>{t('chat.consent3')}</li>
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAskConsent(null)} className="rounded-xl py-2.5 font-bold ring-1 ring-line">
                {t('settings.cancel')}
              </button>
              <button
                onClick={() => {
                  const which = askConsent;
                  setAskConsent(null);
                  void update({ settings: { uploadConsent: true } }).then(() => (which === 'camera' ? cameraInput : fileInput).current?.click());
                }}
                className="rounded-xl bg-brand py-2.5 font-black text-brand-ink"
              >
                {t('chat.consentOk')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Minimal **bold** support for tutor replies. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

/** "What I understood": the learner reviews, edits, removes or adds concepts before building. */
function DraftEditor({ chatId, draft, onBuild, onSaved, busy }: { chatId: string; draft: Draft; onBuild: (d: Draft) => void; onSaved: (d: Draft) => void; busy: boolean }) {
  const { t } = useTranslation();
  const [d, setD] = useState(draft);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  useEffect(() => setD(draft), [draft]);

  const included = d.concepts.filter((_, i) => !excluded.has(i));
  const topics = [...new Set(d.concepts.map((c) => c.topic))];
  const save = (next: Draft) => {
    setD(next);
    void api<{ draft: Draft }>(`/api/chats/${chatId}/draft`, { method: 'PUT', body: { draft: next } }).then((r) => onSaved(r.draft), () => {});
  };
  const patchConcept = (i: number, patch: Partial<ConceptInput>) => setD((x) => ({ ...x, concepts: x.concepts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-3.5 ring-2 ring-brand/40" aria-label={t('chat.understood')}>
      <p className="text-xs font-black tracking-wide text-brand uppercase">🧠 {t('chat.understood')}</p>
      <label className="block">
        <span className="text-xs font-bold text-muted">{t('chat.deckTitle')}</span>
        <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} onBlur={() => save(d)} className="w-full rounded-xl border-2 border-line bg-bg px-3 py-1.5 font-black" />
      </label>
      {d.ignored.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-bold">{t('chat.ignored', { n: d.ignored.length })}</summary>
          <p className="mt-1">{d.ignored.join(' · ')}</p>
        </details>
      )}
      {topics.map((topic) => (
        <div key={topic}>
          <p className="mb-1 text-sm font-black">{topic}</p>
          <ul className="space-y-1.5">
            {d.concepts.map((c, i) =>
              c.topic !== topic ? null : (
                <li key={i} className={`rounded-xl p-2 ring-1 ring-line ${excluded.has(i) ? 'opacity-40' : 'bg-bg'}`}>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!excluded.has(i)}
                      onChange={() => setExcluded((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set(s).add(i)))}
                      aria-label={t('chat.include', { term: c.term })}
                      className="mt-1 size-4"
                    />
                    {editing === i ? (
                      <div className="flex-1 space-y-1">
                        <input value={c.term} onChange={(e) => patchConcept(i, { term: e.target.value })} className="w-full rounded-lg border border-line bg-surface px-2 py-1 font-bold" aria-label={t('chat.term')} />
                        <textarea value={c.summary} onChange={(e) => patchConcept(i, { summary: e.target.value })} rows={2} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" aria-label={t('chat.meaning')} />
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            save(d);
                          }}
                          className="rounded-lg bg-brand px-3 py-1 text-sm font-black text-brand-ink"
                        >
                          {t('profile.save')}
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setEditing(i)} className="flex-1 text-left">
                        <span className="font-bold">{c.term}</span>
                        <span className="block text-sm text-muted">{c.summary}</span>
                      </button>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
      {adding ? (
        <div className="space-y-1.5 rounded-xl bg-bg p-2 ring-1 ring-line">
          <input value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder={t('chat.term')} className="w-full rounded-lg border border-line bg-surface px-2 py-1 font-bold" />
          <textarea value={newMeaning} onChange={(e) => setNewMeaning(e.target.value)} placeholder={t('chat.meaning')} rows={2} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
          <button
            type="button"
            disabled={!newTerm.trim() || newMeaning.trim().length < 4}
            onClick={() => {
              const c: ConceptInput = { topic: topics.at(-1) ?? d.title, kind: 'definition', term: newTerm.trim(), summary: newMeaning.trim(), keyPoints: [newMeaning.trim()], misconceptions: [], examples: [], synonyms: [] };
              save({ ...d, concepts: [...d.concepts, c] });
              setAdding(false);
              setNewTerm('');
              setNewMeaning('');
            }}
            className="rounded-lg bg-brand px-3 py-1 text-sm font-black text-brand-ink disabled:opacity-40"
          >
            + {t('chat.add')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="w-full rounded-xl border-2 border-dashed border-line py-2 text-sm font-bold text-muted">
          + {t('chat.addConcept')}
        </button>
      )}
      <button
        type="button"
        disabled={busy || included.length === 0 || !d.title.trim()}
        onClick={() => onBuild({ ...d, concepts: included })}
        className="w-full rounded-2xl bg-brand py-3 font-black text-brand-ink shadow-[0_4px_0_0_rgb(0_0_0/0.18)] disabled:opacity-40"
      >
        ✨ {t('chat.build', { count: included.length })}
      </button>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { Lumo } from '../components/Lumo';
import { getSample } from '../local/reader';

/**
 * Ask Lumo: chat with Lumo like with Claude. It explains, quizzes, plans, and can build a small
 * learning game (a chess lesson, a times-table race…) as one HTML page, played right here in a sandbox.
 */

interface Msg {
  role: 'me' | 'lumo';
  text: string;
}

const KEY = 'lumo.askLumo';
const KEEP = 40;
const SUGGESTIONS = ['chess', 'quiz', 'explain', 'game'] as const;

function loadChat(): Msg[] {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Msg[];
    return Array.isArray(x) ? x.filter((m) => (m.role === 'me' || m.role === 'lumo') && typeof m.text === 'string').slice(-KEEP) : [];
  } catch {
    return [];
  }
}
function saveChat(m: Msg[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m.slice(-KEEP)));
  } catch {
    /* storage full or blocked: the chat still works for now */
  }
}

/** A Lumo reply: its text, and the game it built (the last ```html block), if any. */
export function splitReply(text: string): { text: string; html: string | null; open: boolean } {
  const done = /```html\s*([\s\S]*?)```/gi;
  let html: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = done.exec(text))) html = m[1]!.trim();
  // Still being written: hide the half-built code.
  const start = text.search(/```html/i);
  const unfinished = start >= 0 && !/```html[\s\S]*?```/i.test(text.slice(start));
  const clean = text.replace(/```html[\s\S]*?```/gi, '').replace(/```html[\s\S]*$/i, '').trim();
  return { text: clean, html, open: unfinished };
}

/** The game's page, locked down: no network, no outside files (it only runs its own inline code). */
function gamePage(html: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (h) => h + csp);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${csp}</head><body>${html}</body></html>`;
}

function prompt(history: Msg[], language: string): string {
  const fr = language.startsWith('fr');
  // The latest game in full (to change it on request); older ones only by name, to keep the call small.
  const lastGame = [...history].reverse().findIndex((m) => m.role === 'lumo' && /```html/i.test(m.text));
  const keepFrom = lastGame >= 0 ? history.length - 1 - lastGame : -1;
  const lines = history.slice(-14).map((m) => {
    const i = history.indexOf(m);
    const text = m.role === 'lumo' && i !== keepFrom ? m.text.replace(/```html[\s\S]*?```/gi, '[a game it built]') : m.text;
    return `${m.role === 'me' ? 'Student' : 'Lumo'}: ${text.slice(0, i === keepFrom ? 30_000 : 3000)}`;
  });
  return [
    'You are Lumo, a friendly firefly who helps students aged 12-18 learn. You can do anything a helpful assistant can: explain, quiz, give practice, plan, check work, brainstorm, and build small learning games.',
    `Reply in ${fr ? 'French (Québec school vocabulary)' : 'English'}, warm and clear, short paragraphs, no heavy markdown (simple lists are fine). Keep everything age-appropriate and safe; for homework, help them understand instead of only giving the answer.`,
    'When the student asks for a game, an interactive lesson, a simulation or a tool (for example a chess lesson game), build it: one short sentence, then ONE complete self-contained HTML page in a ```html code block: inline CSS and JavaScript only, no external files, links, fonts or network calls, works on a phone (touch) and a computer, dark friendly colors, clear instructions on screen, a score or progress, and teaching built in (tips, feedback on mistakes). Keep it under 400 lines. To change a game, send the whole new page again.',
    'The conversation so far:',
    ...lines,
    'Lumo:',
  ].join('\n');
}

export function AskLumo() {
  const { t, i18n } = useTranslation();
  const [msgs, setMsgs] = useState<Msg[]>(loadChat);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs]);
  useEffect(() => () => stop.current?.abort(), []);

  // Sent here with a question (from the bac à sable box): ask it right away, once.
  const location = useLocation();
  const navigate = useNavigate();
  const asked = useRef(false);

  const send = async (raw: string) => {
    const said = raw.trim().slice(0, 4000);
    if (!said || busy) return;
    setText('');
    setError(null);
    const history: Msg[] = [...msgs, { role: 'me', text: said }];
    setMsgs([...history, { role: 'lumo', text: '' }]);
    setBusy(true);
    const ctl = new AbortController();
    stop.current = ctl;
    try {
      const s = await getSample();
      if (!s) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
      const call = s as unknown as (i: string, o: object) => Promise<{ text: string }>;
      const r = await call(prompt(history, i18n.language), {
        modelTier: 'default',
        signal: ctl.signal,
        onText: ({ text: so }: { text: string }) => setMsgs([...history, { role: 'lumo', text: so }]),
      });
      const final: Msg[] = [...history, { role: 'lumo', text: r.text.trim() }];
      setMsgs(final);
      saveChat(final);
    } catch (e) {
      const code = String((e as { code?: string })?.code ?? 'upstream_error');
      const partial = (e as { text?: unknown })?.text;
      const kept: Msg[] = typeof partial === 'string' && partial.trim() ? [...history, { role: 'lumo', text: partial.trim() }] : history;
      setMsgs(kept);
      saveChat(kept);
      if (code !== 'cancelled') setError(code);
    }
    stop.current = null;
    setBusy(false);
  };

  useEffect(() => {
    const q = (location.state as { ask?: string } | null)?.ask;
    if (!q || asked.current) return;
    asked.current = true;
    navigate(location.pathname, { replace: true, state: null });
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fresh = () => {
    stop.current?.abort();
    setMsgs([]);
    saveChat([]);
    setError(null);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-2xl flex-col gap-3 pb-2">
      <div className="flex items-center gap-3">
        <Lumo size={48} mood={busy ? 'thinking' : 'happy'} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black">{t('askLumo.title')}</h1>
          <p className="text-xs text-muted">{t('askLumo.sub')}</p>
        </div>
        {msgs.length > 0 && (
          <button type="button" onClick={fresh} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-black ring-1 ring-line" data-testid="ask-new">
            ✨ {t('askLumo.new')}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3" aria-live="polite" data-testid="ask-messages">
        {msgs.length === 0 && (
          <div className="rounded-3xl bg-surface p-4 ring-1 ring-line">
            <p className="font-bold">{t('askLumo.hello')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((k) => (
                <button key={k} type="button" onClick={() => void send(t(`askLumo.ideas.${k}`))} className="rounded-full bg-brand/10 px-3 py-1.5 text-left text-sm font-bold ring-1 ring-brand/30 hover:bg-brand/20">
                  {t(`askLumo.ideas.${k}`)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              {t('askLumo.decksHint')}{' '}
              <Link to="/chat" className="font-black text-brand underline">
                {t('askLumo.makeDeck')}
              </Link>
            </p>
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.role === 'me') {
            return (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-3xl rounded-br-md bg-brand px-4 py-2.5 font-bold whitespace-pre-wrap text-brand-ink">{m.text}</p>
              </div>
            );
          }
          const r = splitReply(m.text);
          const writing = busy && i === msgs.length - 1;
          return (
            <div key={i} className="flex items-start gap-2" data-testid="ask-reply">
              <span className="mt-1 text-xl" aria-hidden>
                ✨
              </span>
              <div className="max-w-[88%] min-w-0 space-y-2 rounded-3xl rounded-tl-md bg-surface px-4 py-2.5 ring-1 ring-line">
                {r.text ? <p className="whitespace-pre-wrap">{r.text}</p> : writing && !r.open ? <p className="text-muted">{t('askLumo.thinking')}</p> : null}
                {r.open && <p className="text-sm font-black text-brand">🛠️ {t('askLumo.building')}</p>}
                {r.html && (
                  <button type="button" onClick={() => setGame(r.html)} className="btn-gold flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 font-black" data-testid="ask-open-game">
                    ▶ {t('askLumo.play')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
          {t(`askLumo.errors.${error}`, { defaultValue: t('askLumo.errors.upstream_error') })}
        </p>
      )}

      <form
        className="sticky bottom-2 flex items-end gap-2 rounded-3xl bg-surface p-2 shadow-lg ring-1 ring-line"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={t('askLumo.placeholder')}
          aria-label={t('askLumo.placeholder')}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-transparent px-3 py-2.5 outline-none"
          data-testid="ask-input"
        />
        {busy ? (
          <button type="button" onClick={() => stop.current?.abort()} className="grid size-11 place-items-center rounded-2xl bg-surface-2 font-black ring-1 ring-line" aria-label={t('askLumo.stop')}>
            ■
          </button>
        ) : (
          <button type="submit" disabled={!text.trim()} className="grid size-11 place-items-center rounded-2xl bg-brand text-xl font-black text-brand-ink disabled:opacity-40" aria-label={t('askLumo.send')} data-testid="ask-send">
            ↑
          </button>
        )}
      </form>

      {game && (
        <div role="dialog" aria-modal="true" aria-label={t('askLumo.play')} className="fixed inset-0 z-[80] flex flex-col bg-night" data-testid="ask-game">
          <div className="flex items-center gap-2 p-2">
            <button type="button" onClick={() => setGame(null)} className="rounded-full bg-white/15 px-4 py-2 font-black text-white ring-1 ring-white/25">
              ← {t('askLumo.backToChat')}
            </button>
          </div>
          {/* Its own sandbox: scripts run, but it can't reach the page, the account or the network. */}
          <iframe title={t('askLumo.play')} sandbox="allow-scripts" srcDoc={gamePage(game)} className="w-full flex-1 border-0 bg-white" />
        </div>
      )}
    </div>
  );
}

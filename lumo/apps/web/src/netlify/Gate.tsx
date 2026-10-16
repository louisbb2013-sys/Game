import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { validateUsername } from '@lumo/core';
import { setLocale } from '../i18n';
import { CloudError, googleAvailable, googleSignIn, installCloud, loadSession, logIn, onSignedOut, saveSession, signUp, startGoogle, takeGoogleReturn, type SessionInfo } from './cloud';

const GUEST = 'lumo_guest';
const LOCAL = 'lumo_local_v1';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode: just this visit */
  }
};

/** Where this learner's progress is kept in the browser (one copy per account, or the guest's). */
function setStorageFor(id: string, name?: string) {
  const g = globalThis as { __LUMO_KEY__?: string; __LUMO_NAME__?: string };
  g.__LUMO_KEY__ = `${LOCAL}:${id}`;
  if (name) g.__LUMO_NAME__ = name;
}

/** A guest who makes an account keeps what they already did on this device. */
function adoptGuestProgress(s: SessionInfo) {
  const guest = read(`${LOCAL}:guest`);
  if (!guest || read(`${LOCAL}:${s.uid}`)) return;
  try {
    const d = JSON.parse(guest) as { user?: { username?: string } };
    if (d.user && s.name) d.user.username = s.name;
    write(`${LOCAL}:${s.uid}`, JSON.stringify(d));
  } catch {
    /* unreadable guest copy: start fresh */
  }
}

let installed = '';
function installOnce(s: SessionInfo) {
  if (installed === s.uid) return;
  installed = s.uid;
  setStorageFor(s.uid, s.name);
  installCloud(s);
}

/** Sign out of this device (the account and everything in it stay on the site). */
export function signOut() {
  saveSession(null);
  write(GUEST, null);
  location.replace('/');
}

/**
 * Standalone site: sign in (a Lumo name + password, or Google when the site has it on) so progress,
 * friends and Live games follow you to any device, or try it first without an account.
 */
export function Gate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(() => loadSession());
  const [guest, setGuest] = useState(() => read(GUEST) === '1');
  const [google, setGoogle] = useState(false);
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    // The sign-in screen wears the midnight look (the app then follows the learner's own setting).
    const html = document.documentElement;
    if (!html.dataset.theme) html.dataset.theme = 'dark';
    onSignedOut(() => {
      saveSession(null);
      location.reload();
    });
    void googleAvailable().then(setGoogle);
    // Back from Google with an Identity token (or a "no thanks").
    const back = takeGoogleReturn();
    if (back && 'token' in back) {
      setBusy(true);
      googleSignIn(back.token)
        .then((s) => enter(s, true))
        .catch(() => {
          setError(t('gate.errors.google'));
          setBusy(false);
        });
    } else if (back) setError(t('gate.errors.google'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enter(s: SessionInfo, maybeNew: boolean) {
    if (maybeNew) adoptGuestProgress(s);
    saveSession(s);
    write(GUEST, null);
    setSession(s);
  }

  if (session) {
    installOnce(session);
    return <>{children}</>;
  }
  if (guest) {
    setStorageFor('guest');
    return <>{children}</>;
  }

  const submit = async (name: string, password: string) => {
    setError(null);
    if (mode === 'signup') {
      const problem = validateUsername(name.trim());
      if (problem) return setError(t(`gate.errors.name_${problem}`));
      if (password.length < 6) return setError(t('gate.errors.weak_password'));
    }
    setBusy(true);
    try {
      const s = mode === 'signup' ? await signUp(name.trim(), password) : await logIn(name.trim(), password);
      enter(s, mode === 'signup');
    } catch (e) {
      const code = e instanceof CloudError ? e.code : 'network';
      setError(t(`gate.errors.${code}`, { defaultValue: t('gate.errors.network') }));
      setBusy(false);
    }
  };
  const tryIt = () => {
    write(GUEST, '1');
    setGuest(true);
  };

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="aurora" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="absolute top-6 right-6 z-10 sm:right-10">
        <Lang />
      </div>
      <section className="relative flex flex-col justify-between overflow-hidden px-6 pt-8 pb-6 sm:px-10 lg:px-16 lg:py-14">
        <span className="font-display text-3xl font-black italic">
          lumo<span className="text-gold">.</span>
        </span>
        <div className="my-8 max-w-xl lg:my-6">
          <h1 className="font-display text-4xl leading-[1.05] font-black sm:text-5xl lg:text-6xl">{t('gate.headline')}</h1>
          <p className="mt-4 max-w-md text-lg text-muted">{t('gate.tagline')}</p>
          <ul className="mt-6 hidden space-y-2.5 text-[0.95rem] font-bold sm:block">
            <li className="flex gap-3">
              <span aria-hidden>📸</span>
              {t('gate.point1')}
            </li>
            <li className="flex gap-3">
              <span aria-hidden>🥚</span>
              {t('gate.point2')}
            </li>
            <li className="flex gap-3">
              <span aria-hidden>⚡</span>
              {t('gate.point3')}
            </li>
          </ul>
        </div>
        <Showcase />
        <p className="mt-6 hidden text-xs text-muted lg:block">{t('gate.privacy')}</p>
      </section>

      <section className="relative flex items-center justify-center px-4 pb-10 sm:px-10 lg:py-14">
        <div className="lacquer lux-frame w-full max-w-md rounded-[2rem] p-6 shadow-2xl sm:p-8">
          <div role="tablist" aria-label={t('gate.accountTabs')} className="mb-6 grid grid-cols-2 rounded-2xl bg-white/5 p-1 ring-1 ring-white/10">
            {(['signup', 'login'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded-xl py-2.5 text-sm font-black transition ${mode === m ? 'bg-gold text-night shadow' : 'text-white/75 hover:text-white'}`}
              >
                {t(m === 'signup' ? 'gate.signupTab' : 'gate.loginTab')}
              </button>
            ))}
          </div>

          {google && (
            <>
              <button type="button" onClick={startGoogle} disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-base font-black text-[#1f1f1f] shadow ring-1 ring-black/15 disabled:opacity-60">
                <GoogleMark />
                {t('gate.google')}
              </button>
              <div className="my-5 flex items-center gap-3 text-xs font-bold text-white/60">
                <span className="h-px flex-1 bg-white/15" />
                {t('gate.or')}
                <span className="h-px flex-1 bg-white/15" />
              </div>
            </>
          )}

          <AccountForm mode={mode} busy={busy} onSubmit={submit} />

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-100 ring-1 ring-rose-300/30">
              {error}
            </p>
          )}

          <button type="button" onClick={tryIt} className="mt-5 w-full py-2 text-sm font-bold text-white/70 underline underline-offset-4 hover:text-white">
            {t('gate.guest')}
          </button>
        </div>
      </section>
    </main>
  );
}

function AccountForm({ mode, busy, onSubmit }: { mode: 'signup' | 'login'; busy: boolean; onSubmit: (name: string, password: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit(name, password);
  };
  const field = 'w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3 font-bold text-white placeholder:text-white/40 outline-none focus:border-gold';
  return (
    <form onSubmit={submit} className="space-y-3.5">
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-white/85">{t('gate.name')}</span>
        <input id="gate-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20} required className={field} placeholder={t('gate.namePlaceholder')} />
        {mode === 'signup' && <span className="mt-1 block text-xs text-white/55">{t('gate.nameHint')}</span>}
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-white/85">{t('gate.password')}</span>
        <div className="relative">
          <input
            id="gate-password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={mode === 'signup' ? 6 : undefined}
            maxLength={200}
            required
            className={`${field} pr-20`}
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-2 my-auto h-9 rounded-xl px-3 text-xs font-black text-white/75 hover:text-white">
            {show ? t('gate.hide') : t('gate.show')}
          </button>
        </div>
      </label>
      <button disabled={busy} className="btn-gold w-full rounded-2xl py-3.5 text-lg font-black disabled:opacity-60">
        {busy ? t('common.loading') : t(mode === 'signup' ? 'gate.create' : 'gate.login')}
      </button>
    </form>
  );
}

/** A peek at the game: a deck card, a question with its four jewel answers, and the rewards. */
function Showcase() {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="relative mt-10 hidden h-72 max-w-2xl lg:block">
      <div className="lux-frame absolute top-6 left-0 w-60 -rotate-6 rounded-3xl p-5 text-white shadow-2xl" style={{ background: 'radial-gradient(120% 90% at 90% -10%, rgb(232 196 104 / 0.3), transparent 55%), linear-gradient(140deg, hsl(152 62% 30%), hsl(192 70% 16%))' }}>
        <p className="text-xs font-bold text-white/70">{t('gate.showSubject')}</p>
        <p className="font-display text-xl font-black">{t('gate.showDeck')}</p>
        <div className="mt-6 h-2 rounded-full bg-white/20">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[#c9973a] to-[#f6e2a0]" />
        </div>
      </div>
      <div className="lacquer lux-frame absolute top-0 left-48 w-72 rotate-3 rounded-3xl p-4 shadow-2xl">
        <p className="text-sm font-black text-white">{t('gate.showQuestion')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {['tile-red', 'tile-blue', 'tile-yellow', 'tile-green'].map((c, i) => (
            <span key={c} className={`tile ${c} min-h-12 justify-center !p-2 text-xs`}>
              {(t('gate.showAnswers', { returnObjects: true }) as string[])[i]}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute top-8 left-[31.5rem] flex flex-col items-start gap-2">
        <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-black shadow-lg ring-1 ring-gold/40">🔥 12</span>
        <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-black shadow-lg ring-1 ring-gold/40">🪙 340</span>
        <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-black shadow-lg ring-1 ring-gold/40">✨ +25 XP</span>
      </div>
    </div>
  );
}

/** English / français, before signing in (the app's own switch needs a signed-in learner). */
function Lang() {
  const { i18n, t } = useTranslation();
  const current = i18n.language === 'fr' ? 'fr' : 'en';
  return (
    <div role="group" aria-label={t('settings.language')} className="inline-flex rounded-full bg-surface p-1 ring-1 ring-line">
      {(['en', 'fr'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={current === l} onClick={() => setLocale(l)} className={`rounded-full px-3 py-1 text-sm font-extrabold uppercase ${current === l ? 'bg-brand text-brand-ink' : 'text-muted'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

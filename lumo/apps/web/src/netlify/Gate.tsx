import type { User } from 'firebase/auth';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Lumo } from '../components/Lumo';
import { firebaseConfig, signInWithGoogle, watchUser } from './firebase';
import { installClaude } from './shim';

const GUEST = 'lumo_guest';

/** Where this learner's progress is kept in the browser (one copy per Google account, or the guest's). */
function setStorageFor(id: string) {
  (globalThis as { __LUMO_KEY__?: string }).__LUMO_KEY__ = `lumo_local_v1:${id}`;
}

/**
 * Standalone site: sign in with Google (progress saved to the account, friends and Live games), or
 * try it without an account (saved on this device only).
 */
export function Gate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [guest, setGuest] = useState(() => {
    try {
      return localStorage.getItem(GUEST) === '1';
    } catch {
      return false;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = firebaseConfig() !== null;

  useEffect(() => watchUser(setUser), []);

  if (user) {
    installOnce(user);
    return <>{children}</>;
  }
  if (guest || (!configured && user === null)) {
    setStorageFor('guest');
    return <>{children}</>;
  }
  if (user === undefined && configured) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Lumo size={80} mood="thinking" />
      </div>
    );
  }

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setError(code === 'auth/unauthorized-domain' ? t('gate.domainError') : t('gate.error'));
    }
    setBusy(false);
  };
  const tryIt = () => {
    try {
      localStorage.setItem(GUEST, '1');
    } catch {
      /* private mode: just this visit */
    }
    setGuest(true);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Lumo size={120} mood="happy" />
      <div className="space-y-2">
        <h1 className="text-4xl font-black">lumo.</h1>
        <p className="text-lg font-bold">{t('gate.tagline')}</p>
      </div>
      <ul className="space-y-1.5 text-left text-sm font-bold">
        <li>📸 {t('gate.point1')}</li>
        <li>🥚 {t('gate.point2')}</li>
        <li>⚡ {t('gate.point3')}</li>
      </ul>
      <div className="w-full space-y-3">
        <button onClick={() => void google()} disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-lg font-black text-[#1f1f1f] shadow ring-1 ring-black/15 disabled:opacity-60">
          <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
          </svg>
          {busy ? t('common.loading') : t('gate.google')}
        </button>
        {error && (
          <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
            {error}
          </p>
        )}
        <button onClick={tryIt} className="w-full py-2 text-sm font-bold text-muted underline">
          {t('gate.guest')}
        </button>
      </div>
      <p className="text-xs text-muted">{t('gate.privacy')}</p>
    </main>
  );
}

let installed = '';
function installOnce(u: User) {
  if (installed === u.uid) return;
  installed = u.uid;
  setStorageFor(u.uid);
  installClaude(u);
}

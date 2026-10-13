import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { GoogleIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { api, ApiError, type Profile } from '../lib/api';
import { browserTimeZone, useAuth } from '../lib/auth';

interface Providers {
  google: boolean;
  email: boolean;
  guest: boolean;
  dev: boolean;
}

export function SignIn() {
  const { t, i18n } = useTranslation();
  const { setUser } = useAuth();
  const [params] = useSearchParams();
  const [providers, setProviders] = useState<Providers | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get('error'));

  useEffect(() => {
    api<Providers>('/api/auth/providers').then(setProviders, () => setError('network'));
  }, []);

  const locale = i18n.language === 'fr' ? 'fr' : 'en';

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
    } finally {
      setBusy(false);
    }
  }

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api('/api/auth/email/start', { method: 'POST', body: { email, locale } });
      setStep('code');
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { user } = await api<{ user: Profile }>('/api/auth/email/verify', {
        method: 'POST',
        body: { email, code, locale, timezone: browserTimeZone() },
      });
      setUser(user);
    });
  };

  const guestLogin = () =>
    run(async () => {
      const { user } = await api<{ user: Profile }>('/api/auth/guest', { method: 'POST', body: { locale, timezone: browserTimeZone() } });
      setUser(user);
    });

  const devLogin = () =>
    run(async () => {
      const { user } = await api<{ user: Profile }>('/api/auth/dev', { method: 'POST', body: { name: 'student' } });
      setUser(user);
    });

  const googleHref = `/api/auth/google?locale=${locale}&tz=${encodeURIComponent(browserTimeZone())}`;
  const errorKey = error ? `signin.errors.${error}` : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>

      <div className="mt-4 flex flex-col items-center text-center">
        <Lumo size={136} mood="happy" glow={0.9} />
        <h1 className="mt-3 text-3xl font-black">{t('signin.title')}</h1>
        <p className="mt-2 text-muted">{t('signin.subtitle')}</p>
      </div>

      <div className="mt-8 space-y-4">
        {providers?.google && (
          <a
            href={googleHref}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-surface px-4 py-3.5 font-extrabold shadow-sm ring-1 ring-line transition hover:ring-brand active:scale-[0.98]"
          >
            <GoogleIcon size={22} />
            {t('signin.google')}
          </a>
        )}

        {providers?.guest && (
          <div className="space-y-1 text-center">
            <button type="button" onClick={guestLogin} disabled={busy} className="w-full rounded-2xl bg-amber-glow px-4 py-3.5 text-lg font-black text-night shadow-[0_4px_0_0_rgb(0_0_0/0.18)] active:translate-y-0.5 disabled:opacity-50">
              ✨ {t('signin.guest')}
            </button>
            <p className="text-xs text-muted">{t('signin.guestHint')}</p>
          </div>
        )}

        {(providers?.google || providers?.guest) && providers?.email && (
          <div className="flex items-center gap-3 text-sm font-bold text-muted">
            <span className="h-px flex-1 bg-line" />
            {t('signin.or')}
            <span className="h-px flex-1 bg-line" />
          </div>
        )}

        {!providers?.email ? null : step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">{t('signin.emailLabel')}</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('signin.emailPlaceholder')}
                className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-lg outline-none focus:border-brand"
              />
            </label>
            <PrimaryButton disabled={busy}>{t('signin.sendCode')}</PrimaryButton>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm text-muted">{t('signin.codeSent', { email })}</p>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">{t('signin.codeLabel')}</span>
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-brand"
              />
            </label>
            <PrimaryButton disabled={busy || code.length !== 6}>{t('signin.verify')}</PrimaryButton>
            <button type="button" onClick={() => setStep('email')} className="w-full text-sm font-bold text-brand">
              {t('signin.changeEmail')}
            </button>
          </form>
        )}

        {errorKey && (
          <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
            {t(errorKey, { defaultValue: t('signin.errors.network') })}
          </p>
        )}

        {providers?.dev && (
          <div className="rounded-2xl border-2 border-dashed border-line p-3 text-center">
            <button type="button" onClick={devLogin} disabled={busy} className="font-extrabold text-brand">
              {t('signin.dev')}
            </button>
            <p className="text-xs text-muted">{t('signin.devHint')}</p>
          </div>
        )}
      </div>

      <p className="mt-auto pt-8 text-center text-xs text-muted">{t('signin.privacy')}</p>
    </div>
  );
}

export function PrimaryButton({ children, disabled, onClick, type = 'submit' }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: 'submit' | 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl bg-brand px-4 py-3.5 text-lg font-black text-brand-ink shadow-[0_4px_0_0_rgb(0_0_0/0.18)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

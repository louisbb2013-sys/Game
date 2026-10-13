import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { api, type Settings as S } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Settings() {
  const { t } = useTranslation();
  const { user, update, setUser } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  if (!user) return null;

  const s = user.settings;
  const set = (patch: S) => void update({ settings: patch }).catch(() => {});

  const deleteAll = async () => {
    await api('/api/me', { method: 'DELETE' });
    setUser(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/me" className="rounded-full bg-surface px-3 py-1 text-sm font-extrabold ring-1 ring-line">
          ← {t('common.back')}
        </Link>
        <h1 className="text-2xl font-black">{t('settings.title')}</h1>
      </div>

      <Card>
        <Row label={t('settings.language')}>
          <LanguageSwitch />
        </Row>
        <Row label={t('settings.theme')}>
          <select
            value={s.theme ?? 'system'}
            onChange={(e) => set({ theme: e.target.value as S['theme'] })}
            className="rounded-xl border-2 border-line bg-bg px-2 py-1 font-bold"
          >
            <option value="system">{t('settings.themeSystem')}</option>
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
          </select>
        </Row>
        <Toggle label={t('settings.sound')} checked={s.sound ?? true} onChange={(v) => set({ sound: v })} />
      </Card>

      <Card title={t('settings.accessibility')}>
        <Toggle label={t('settings.dyslexiaFont')} checked={!!s.dyslexiaFont} onChange={(v) => set({ dyslexiaFont: v })} />
        <Toggle label={t('settings.largeText')} checked={!!s.largeText} onChange={(v) => set({ largeText: v })} />
        <Toggle label={t('settings.reduceMotion')} checked={!!s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
      </Card>

      <Card title={t('settings.privacy')}>
        <p className="text-sm text-muted">{t('settings.privacyBody')}</p>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="mt-2 font-extrabold text-bad">
            {t('settings.deleteData')}
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-sm font-bold">{t('settings.deleteConfirm')}</p>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full rounded-xl border-2 border-bad/50 bg-bg px-3 py-2 font-mono" aria-label={t('settings.deleteConfirm')} />
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} className="flex-1 rounded-xl py-2 font-bold ring-1 ring-line">
                {t('settings.cancel')}
              </button>
              <button onClick={() => void deleteAll()} disabled={typed !== 'DELETE'} className="flex-1 rounded-xl bg-bad py-2 font-black text-white disabled:opacity-40">
                {t('settings.deleteButton')}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1 rounded-3xl bg-surface p-4 ring-1 ring-line">
      {title && <h2 className="pb-1 text-sm font-black tracking-wide text-muted uppercase">{title}</h2>}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <span className="font-bold">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span className="font-bold">{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-brand peer-focus-visible:outline-3 peer-focus-visible:outline-amber-glow after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

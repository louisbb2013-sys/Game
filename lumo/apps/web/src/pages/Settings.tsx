import { DEFAULT_REMINDER } from '@lumo/core';
import { useCallback, useEffect, useState } from 'react';
import { shareOrCopy } from '../components/QrCode';
import { clearOffline } from '../lib/offline';
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
    clearOffline();
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
            aria-label={t('settings.theme')}
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

      <Reminders />
      <ShareLinks />

      <Card title={t('settings.privacy')}>
        <p className="text-sm text-muted">{t('settings.privacyBody')}</p>
        <a href="/api/me/export" download className="mt-2 block font-extrabold text-brand">
          ⬇️ {t('settings.export')}
        </a>
        <p className="text-xs text-muted">{t('settings.exportHint')}</p>
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

const DAY_KEYS = [1, 2, 3, 4, 5, 6, 0];

function Reminders() {
  const { t, i18n } = useTranslation();
  const { user, update } = useAuth();
  if (!user) return null;
  const r = { ...DEFAULT_REMINDER, ...user.settings.reminder };
  const set = (patch: Partial<typeof r>) => void update({ settings: { reminder: { ...r, ...patch } } }).catch(() => {});
  const dayName = (d: number) => new Date(Date.UTC(2026, 9, 11 + d)).toLocaleDateString(i18n.language, { weekday: 'narrow', timeZone: 'UTC' });
  return (
    <Card title={t('settings.reminders')}>
      <Toggle label={t('settings.remindMe')} checked={r.enabled} onChange={(v) => set({ enabled: v })} />
      {!user.email && r.enabled && <p className="text-xs font-bold text-bad">{t('settings.reminderNoEmail')}</p>}
      {r.enabled && (
        <>
          <Row label={t('settings.reminderTime')}>
            <input type="time" min="08:00" max="20:59" value={r.time} onChange={(e) => e.target.value && set({ time: e.target.value })} className="rounded-xl border-2 border-line bg-bg px-2 py-1 font-bold" aria-label={t('settings.reminderTime')} />
          </Row>
          <div className="flex justify-between gap-1 py-1" role="group" aria-label={t('settings.reminderDays')}>
            {DAY_KEYS.map((d) => {
              const on = r.days.includes(d);
              return (
                <button key={d} aria-pressed={on} onClick={() => set({ days: on ? r.days.filter((x) => x !== d) : [...r.days, d] })} className={`size-9 rounded-full text-sm font-black ${on ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted'}`}>
                  {dayName(d)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">{t('settings.reminderHint')}</p>
        </>
      )}
    </Card>
  );
}

interface ShareLink {
  token: string;
  label: string;
  url: string;
  createdAt: string;
  lastViewedAt: string | null;
}

/** Progress links for parents and teachers: read-only, revocable. */
function ShareLinks() {
  const { t } = useTranslation();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api<{ links: ShareLink[] }>('/api/me/shares').then((r) => setLinks(r.links), () => {}), []);
  useEffect(() => void load(), [load]);
  const create = async () => {
    setMsg(null);
    try {
      const r = await api<{ url: string }>('/api/me/shares', { method: 'POST', body: { label } });
      setLabel('');
      const how = await shareOrCopy(r.url, 'Lumo');
      if (how !== 'failed') setMsg(t(`live.${how}`));
    } catch {
      setMsg(t('settings.tooManyLinks'));
    }
    await load();
  };
  return (
    <Card title={t('settings.shareTitle')}>
      <p className="text-sm text-muted">{t('settings.shareBody')}</p>
      <div className="flex gap-2 pt-1">
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder={t('settings.sharePlaceholder')} aria-label={t('settings.shareLabel')} className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-3 py-2 font-bold" />
        <button onClick={() => void create()} className="rounded-xl bg-brand px-3 font-black text-brand-ink">
          {t('settings.shareCreate')}
        </button>
      </div>
      {msg && (
        <p role="status" className="text-sm font-bold text-good">
          {msg}
        </p>
      )}
      <ul className="space-y-1.5 pt-1">
        {links.map((l) => (
          <li key={l.token} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-black">{l.label || t('settings.shareUnnamed')}</span>
              <span className="text-xs text-muted">{l.lastViewedAt ? t('settings.shareViewed', { date: new Date(l.lastViewedAt).toLocaleDateString() }) : t('settings.shareNotViewed')}</span>
            </span>
            <button onClick={() => void shareOrCopy(l.url, 'Lumo').then((h) => h !== 'failed' && setMsg(t(`live.${h}`)))} className="font-black text-brand">
              {t('settings.shareCopy')}
            </button>
            <button onClick={() => void api(`/api/me/shares/${l.token}`, { method: 'DELETE' }).then(load)} className="font-black text-bad">
              {t('settings.shareRevoke')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
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

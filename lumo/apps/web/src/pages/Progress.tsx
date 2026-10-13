import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api } from '../lib/api';

interface Shared {
  username: string;
  level: number;
  streak: number;
  studiedToday: boolean;
  leagueTier: string;
  activity: { day: string; xp: number; answers: number }[];
  decks: { title: string; concepts: number; mastered: number; progress: number }[];
  exams: { title: string; percent: number; at: string }[];
}

/** Read-only progress page for a parent or teacher (no sign-in, no personal data). */
export function Progress() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Shared | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api<Shared>(`/api/progress/${token}`).then(setData, () => setMissing(true));
  }, [token]);

  if (missing)
    return (
      <div className="flex flex-col items-center gap-3 pt-16 text-center">
        <Lumo size={100} mood="sleepy" />
        <p className="font-black">{t('progress.gone')}</p>
      </div>
    );
  if (!data) return <p className="pt-16 text-center font-bold text-muted">{t('common.loading')}</p>;

  // Last 14 days, oldest first.
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10));
  const byDay = new Map(data.activity.map((a) => [a.day, a]));
  const maxXp = Math.max(10, ...data.activity.map((a) => a.xp));
  const activeDays = days.filter((d) => byDay.has(d)).length;

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Lumo size={64} mood="happy" />
        <div>
          <p className="text-sm font-bold text-muted">{t('progress.reportFor')}</p>
          <h1 className="text-2xl font-black">{data.username}</h1>
        </div>
      </header>
      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat value={data.streak} label={t('progress.streak')} />
        <Stat value={activeDays} label={t('progress.activeDays')} />
        <Stat value={data.level} label={t('progress.level')} />
      </section>
      <p className={`rounded-xl px-3 py-2 text-sm font-bold ${data.studiedToday ? 'bg-good/10 text-good' : 'bg-surface-2'}`}>{data.studiedToday ? t('progress.studiedToday') : t('progress.notToday')}</p>

      <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
        <h2 className="mb-3 font-black">{t('progress.activity')}</h2>
        <div className="flex h-24 items-end gap-1" role="img" aria-label={t('progress.activityLabel', { n: activeDays })}>
          {days.map((d) => (
            <div key={d} className="flex flex-1 flex-col items-center gap-1">
              <div className={`w-full rounded-t ${byDay.has(d) ? 'bg-brand' : 'bg-surface-2'}`} style={{ height: `${byDay.has(d) ? Math.max(12, (byDay.get(d)!.xp / maxXp) * 80) : 6}px` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[0.65rem] font-bold text-muted">
          <span>{new Date(days[0]!).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}</span>
          <span>{t('progress.today')}</span>
        </div>
      </section>

      {data.decks.length > 0 && (
        <section className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
          <h2 className="font-black">{t('progress.decks')}</h2>
          {data.decks.map((d) => (
            <div key={d.title}>
              <div className="flex justify-between text-sm font-bold">
                <span className="truncate">{d.title}</span>
                <span className="shrink-0 text-muted">{t('progress.mastered', { n: d.mastered, total: d.concepts })}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-good" style={{ width: `${Math.max(3, d.progress)}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      {data.exams.length > 0 && (
        <section className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
          <h2 className="font-black">📝 {t('progress.exams')}</h2>
          {data.exams.map((e) => (
            <div key={e.at} className="flex justify-between text-sm font-bold">
              <span className="truncate">
                {e.title} · {new Date(e.at).toLocaleDateString(i18n.language)}
              </span>
              <span>{e.percent}%</span>
            </div>
          ))}
        </section>
      )}
      <p className="text-center text-xs text-muted">{t('progress.privacy')}</p>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-bold text-muted">{label}</p>
    </div>
  );
}

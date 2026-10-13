import type { ExamReport as Report } from '@lumo/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Lumo, type LumoMood } from '../components/Lumo';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useConfetti } from '../lib/confetti';
import { play } from '../lib/sound';

const READY: Record<Report['readiness'], { mood: LumoMood; color: string }> = {
  ready: { mood: 'cheer', color: '#22C55E' },
  almost: { mood: 'happy', color: '#F5A524' },
  needs_work: { mood: 'thinking', color: '#F97316' },
  not_yet: { mood: 'sad', color: '#EF4444' },
};

const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

export function ExamReport() {
  const { sessionId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [data, setData] = useState<{ deckId: string; deckTitle: string; report: Report } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ deckId: string; deckTitle: string; report: Report }>(`/api/sessions/${sessionId}/report`).then(
      (r) => {
        setData(r);
        play('finish');
        void refresh();
      },
      (e) => setError(e instanceof ApiError ? e.code : 'network'),
    );
  }, [sessionId, refresh]);
  useConfetti(data?.report.readiness === 'ready');

  const startMode = async (mode: 'wrong_only' | 'exam') => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await api<{ session: { id: string } }>(`/api/decks/${data.deckId}/sessions`, { method: 'POST', body: { mode, length: mode === 'exam' ? data.report.total : 8 } });
      navigate(`/quiz/${res.session.id}`, { state: res });
    } catch {
      setBusy(false);
    }
  };

  if (error)
    return (
      <div className="flex flex-col items-center gap-3 pt-16 text-center">
        <Lumo size={100} mood="sad" />
        <p className="font-black">{t('quiz.loadError')}</p>
        <Link to="/learn" className="font-black text-brand">
          {t('common.back')}
        </Link>
      </div>
    );
  if (!data) return <p className="pt-16 text-center font-bold text-muted">{t('common.loading')}</p>;
  const r = data.report;
  const style = READY[r.readiness];

  return (
    <div className="space-y-5 pb-8">
      <header className="flex items-center gap-2">
        <Link to={`/decks/${data.deckId}`} className="rounded-full bg-surface px-3 py-1 text-sm font-extrabold ring-1 ring-line">
          ← {t('common.back')}
        </Link>
      </header>
      <section className="flex flex-col items-center gap-2 rounded-3xl bg-surface p-5 text-center ring-1 ring-line">
        <p className="text-sm font-bold text-muted">{t('exam.reportFor', { deck: data.deckTitle })}</p>
        <div className="relative grid size-40 place-items-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="12" className="text-surface-2" />
            <circle cx="60" cy="60" r="52" fill="none" stroke={style.color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(r.percent / 100) * 327} 327`} className="transition-[stroke-dasharray] duration-1000" />
          </svg>
          <span className="text-4xl font-black" data-testid="exam-percent">
            {r.percent}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Lumo size={56} mood={style.mood} />
          <h1 className="text-2xl font-black" style={{ color: style.color }}>
            {t(`exam.readiness.${r.readiness}`)}
          </h1>
        </div>
        <p className="font-bold">
          {t('exam.score', { correct: r.correct, total: r.total })}
          {r.unanswered > 0 && <span className="text-bad"> · {t('exam.unanswered', { count: r.unanswered })}</span>}
        </p>
        {r.timeLimitMs > 0 && <p className="text-sm text-muted">{t('exam.time', { used: mmss(Math.min(r.timeMs, r.timeLimitMs)), limit: mmss(r.timeLimitMs) })}</p>}
      </section>

      <section className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <h2 className="font-black">💡 {t('exam.nextSteps')}</h2>
        <ul className="space-y-1.5">
          {r.advice.map((a) => (
            <li key={a} className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-bold">
              {t(`exam.advice.${a}`)}
            </li>
          ))}
        </ul>
      </section>

      {r.weakest.length > 0 && (
        <section className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
          <h2 className="font-black">🎯 {t('exam.weakest')}</h2>
          <ul className="flex flex-wrap gap-2">
            {r.weakest.map((w) => (
              <li key={w.conceptId} className="rounded-xl bg-bad/10 px-2.5 py-1.5 text-sm font-bold text-bad ring-1 ring-bad/30">
                {w.term}
              </li>
            ))}
          </ul>
          <button onClick={() => void startMode('wrong_only')} disabled={busy} className="w-full rounded-2xl bg-brand py-3 font-black text-brand-ink disabled:opacity-50">
            {t('exam.fixNow')}
          </button>
        </section>
      )}

      <Bars title={`📚 ${t('exam.byTopic')}`} rows={r.byTopic.map((x) => ({ label: x.topic, percent: x.percent }))} />
      <Bars title={`🧠 ${t('exam.byLevel')}`} rows={r.byBloom.map((x) => ({ label: t(`bloom.${x.bloom}`), percent: x.percent }))} />

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => void startMode('exam')} disabled={busy} className="rounded-2xl bg-surface py-3 font-black ring-1 ring-line disabled:opacity-50">
          📝 {t('exam.again')}
        </button>
        <Link to={`/decks/${data.deckId}#plan`} className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
          📅 {t('exam.makePlan')}
        </Link>
      </div>
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: { label: string; percent: number }[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-black">{title}</h2>
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex justify-between text-sm font-bold">
            <span>{row.label}</span>
            <span>{row.percent}%</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${row.percent >= 85 ? 'bg-good' : row.percent >= 60 ? 'bg-amber-glow' : 'bg-bad'}`} style={{ width: `${Math.max(3, row.percent)}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

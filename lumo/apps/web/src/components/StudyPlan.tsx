import { addDays, type PlanDay, type PlanTask } from '@lumo/core';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../lib/api';
import { startPlanDay } from '../lib/plan';

interface Plan {
  examDay: string;
  daysLeft: number;
  days: PlanDay[];
  onTrack: boolean;
  peakMinutes: number;
  minutesPerDay: number;
}

const TASK_ICON: Record<PlanTask['kind'], string> = { learn: '🌱', fix: '🎯', review: '🔁', mock_exam: '📝', light_review: '☕' };

export function TaskText({ task }: { task: PlanTask }) {
  const { t } = useTranslation();
  return (
    <span>
      {TASK_ICON[task.kind]} {t(`plan.task.${task.kind}`, 'count' in task ? { count: task.count } : {})}
    </span>
  );
}

/** Exam date → a day-by-day plan. Lives on the deck page. */
export function StudyPlan({ deckId }: { deckId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [examDay, setExamDay] = useState(addDays(new Date().toISOString().slice(0, 10), 7));
  const [minutes, setMinutes] = useState(20);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<{ plan: Plan | null }>(`/api/decks/${deckId}/plan`).then((r) => setPlan(r.plan), () => setPlan(null)), [deckId]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (plan !== undefined && location.hash === '#plan') document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [plan]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ plan: Plan }>(`/api/decks/${deckId}/plan`, { method: 'PUT', body: { examDay, minutesPerDay: minutes } });
      setPlan(r.plan);
      setEditing(false);
    } catch (err) {
      setError(t(`plan.errors.${err instanceof ApiError ? err.code : 'network'}`, { defaultValue: t('signin.errors.network') }));
    }
  };

  const start = async (day: PlanDay) => {
    const res = await startPlanDay(deckId, day);
    navigate(`/quiz/${res.session.id}`, { state: res });
  };

  if (plan === undefined) return null;
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });

  if (!plan || editing) {
    return (
      <form id="plan" onSubmit={save} className="space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <h2 className="font-black">📅 {t('plan.title')}</h2>
        <p className="text-sm text-muted">{t('plan.intro')}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-bold">{t('plan.examDate')}</span>
            <input type="date" required value={examDay} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExamDay(e.target.value)} className="w-full rounded-xl border-2 border-line bg-bg px-2 py-2 font-bold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">{t('plan.minutes')}</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-full rounded-xl border-2 border-line bg-bg px-2 py-2 font-bold">
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {t('plan.minutesValue', { m })}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="text-sm font-bold text-bad">{error}</p>}
        <div className="flex gap-2">
          <button className="flex-1 rounded-2xl bg-brand py-3 font-black text-brand-ink">{t('plan.make')}</button>
          {plan && (
            <button type="button" onClick={() => setEditing(false)} className="rounded-2xl px-4 font-black ring-1 ring-line">
              {t('common.cancel')}
            </button>
          )}
        </div>
      </form>
    );
  }

  const today = plan.days[0];
  return (
    <section id="plan" className="space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-black">📅 {t('plan.title')}</h2>
          <p className="text-sm font-bold text-muted">{plan.daysLeft === 0 ? t('plan.examToday') : t('plan.examIn', { count: plan.daysLeft, date: fmt(plan.examDay) })}</p>
        </div>
        <button onClick={() => (setExamDay(plan.examDay), setMinutes(plan.minutesPerDay), setEditing(true))} className="text-sm font-black text-brand">
          {t('plan.edit')}
        </button>
      </div>
      <p className={`rounded-xl px-3 py-2 text-sm font-bold ${plan.onTrack ? 'bg-good/10 text-good' : 'bg-amber-glow/15'}`}>{plan.onTrack ? t('plan.onTrack') : t('plan.tight', { minutes: plan.peakMinutes })}</p>
      <ol className="space-y-1.5">
        {plan.days.map((d, i) => (
          <li key={d.day} className={`rounded-2xl p-2.5 text-sm ${i === 0 ? 'bg-brand/10 ring-2 ring-brand' : 'bg-surface-2'}`}>
            <div className="flex justify-between font-black">
              <span>{i === 0 ? t('plan.today') : fmt(d.day)}</span>
              <span className="text-muted">~{t('plan.minutesValue', { m: d.minutes })}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 font-bold">
              {d.tasks.map((task) => (
                <TaskText key={task.kind} task={task} />
              ))}
            </div>
          </li>
        ))}
      </ol>
      {today && (
        <button onClick={() => void start(today)} className="w-full rounded-2xl bg-brand py-3 font-black text-brand-ink">
          {t('plan.startToday')}
        </button>
      )}
      <button onClick={() => void api(`/api/decks/${deckId}/plan`, { method: 'DELETE' }).then(load)} className="w-full text-sm font-bold text-muted">
        {t('plan.remove')}
      </button>
    </section>
  );
}

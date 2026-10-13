import type { PlanDay } from '@lumo/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { startPlanDay } from '../lib/plan';
import { TaskText } from './StudyPlan';

interface TodayPlan {
  deckId: string;
  deckTitle: string;
  examDay: string;
  daysLeft: number;
  today: PlanDay | null;
  questions: number;
}

/** Home: what each exam plan asks for today. */
export function TodayPlans() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<TodayPlan[]>([]);
  useEffect(() => {
    api<{ plans: TodayPlan[] }>('/api/plans/today').then((r) => setPlans(r.plans), () => {});
  }, []);
  if (plans.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="plans-title">
      <h2 id="plans-title" className="font-black">
        📅 {t('plan.homeTitle')}
      </h2>
      {plans.map((p) => (
        <div key={p.deckId} className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
          <div className="flex items-baseline justify-between gap-2">
            <Link to={`/decks/${p.deckId}#plan`} className="truncate font-black">
              {p.deckTitle}
            </Link>
            <span className="shrink-0 rounded-full bg-amber-glow/20 px-2 py-0.5 text-xs font-black">{p.daysLeft === 0 ? t('plan.examToday') : t('plan.examInShort', { count: p.daysLeft })}</span>
          </div>
          {p.today && (
            <>
              <div className="flex flex-wrap gap-x-3 text-sm font-bold">
                {p.today.tasks.map((task) => (
                  <TaskText key={task.kind} task={task} />
                ))}
              </div>
              <button
                onClick={() => void startPlanDay(p.deckId, p.today!).then((res) => navigate(`/quiz/${res.session.id}`, { state: res }))}
                className="w-full rounded-2xl bg-brand py-2.5 font-black text-brand-ink"
              >
                {t('plan.startToday')} · ~{t('plan.minutesValue', { m: p.today.minutes })}
              </button>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

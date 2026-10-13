import {
  chooseFormat,
  generateLocal,
  grade,
  hashString,
  newProgress,
  PASS,
  pickConcepts,
  publicQuestion,
  seededRng,
  type Answer,
  type Concept,
  type ConceptProgress,
  type Format,
  type GradeResult,
  type Question,
} from '@lumo/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Lumo } from '../components/Lumo';
import { isReady, QuestionInput } from '../components/quiz/inputs';
import { offlineDeck, offlineDecks, pendingReviews, queueReviews, removeOfflineDeck, syncOffline, useOnline, type OfflineReview } from '../lib/offline';
import { play } from '../lib/sound';

/** Formats that grade well on the device with no AI (open answers would need the server). */
const OFFLINE_FORMATS: Format[] = ['multiple_choice', 'multiple_select', 'type_answer', 'fill_blank', 'matching', 'ordering', 'categorize', 'cause_effect', 'spot_mistake', 'calculation', 'true_false_justify'];
const ROUND = 10;

export function OfflineList() {
  const { t } = useTranslation();
  const online = useOnline();
  const [decks, setDecks] = useState(offlineDecks);
  const [pending, setPending] = useState(pendingReviews);
  const [msg, setMsg] = useState<string | null>(null);

  const sync = async () => {
    const r = await syncOffline();
    setPending(pendingReviews());
    setMsg(t('offline.synced', { count: r.sent, xp: r.xp }));
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">📥 {t('offline.title')}</h1>
      <p className="text-sm text-muted">{t('offline.intro')}</p>
      {!online && <p className="rounded-xl bg-amber-glow/15 px-3 py-2 text-sm font-bold">{t('offline.youAreOffline')}</p>}
      {pending > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
          <span className="text-sm font-bold">{t('offline.pending', { count: pending })}</span>
          <button disabled={!online} onClick={() => void sync()} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-brand-ink disabled:opacity-40">
            {t('offline.syncNow')}
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm font-bold text-good">
          {msg}
        </p>
      )}
      {decks.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <Lumo size={56} mood="sleepy" />
          <p className="text-sm text-muted">{t('offline.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {decks.map((d) => (
            <li key={d.deck.id} className="flex items-center gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
              <Link to={`/offline/${d.deck.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-black">{d.deck.title}</span>
                <span className="text-xs font-bold text-muted">{t('offline.savedOn', { date: new Date(d.savedAt).toLocaleDateString() })}</span>
              </Link>
              <Link to={`/offline/${d.deck.id}`} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-brand-ink">
                {t('offline.review')}
              </Link>
              <button onClick={() => (removeOfflineDeck(d.deck.id), setDecks(offlineDecks()))} aria-label={t('offline.remove', { deck: d.deck.title })} className="px-1 text-muted">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A review round generated and graded entirely on this device. */
export function OfflineReview() {
  const { deckId = '' } = useParams();
  const { t } = useTranslation();
  const online = useOnline();
  const saved = useMemo(() => offlineDeck(deckId), [deckId]);
  const [round, setRound] = useState(0);
  const questions = useMemo(() => (saved ? makeRound(saved.concepts, saved.deck.language, round) : []), [saved, round]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const reviews = useRef<OfflineReview[]>([]);
  const [done, setDone] = useState<{ correct: number; total: number; synced: boolean } | null>(null);

  useEffect(() => {
    setIndex(0);
    setAnswer(null);
    setResult(null);
    reviews.current = [];
  }, [round]);

  if (!saved)
    return (
      <div className="flex flex-col items-center gap-3 pt-12 text-center">
        <Lumo size={100} mood="sad" />
        <p className="font-black">{t('offline.notSaved')}</p>
        <Link to="/offline" className="font-black text-brand">
          {t('offline.title')}
        </Link>
      </div>
    );

  const finish = async () => {
    const correct = reviews.current.filter((r) => r.score >= PASS).length;
    queueReviews(deckId, reviews.current);
    play('finish');
    let synced = false;
    if (online) synced = (await syncOffline().catch(() => ({ sent: 0 }))).sent > 0;
    setDone({ correct, total: reviews.current.length, synced });
  };

  if (done)
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Lumo size={110} mood={done.correct / Math.max(1, done.total) >= 0.7 ? 'cheer' : 'happy'} />
        <h1 className="text-2xl font-black">{t('offline.roundDone', { correct: done.correct, total: done.total })}</h1>
        <p className="text-sm font-bold text-muted">{done.synced ? t('offline.syncedNow') : t('offline.willSync')}</p>
        <button onClick={() => (setDone(null), setRound((r) => r + 1))} className="w-full rounded-2xl bg-brand py-3.5 font-black text-brand-ink">
          {t('offline.again')}
        </button>
        <Link to="/offline" className="font-black text-brand">
          {t('common.back')}
        </Link>
      </div>
    );

  const q = questions[index];
  if (!q) return <p className="pt-10 text-center font-bold text-muted">{t('offline.nothing')}</p>;
  const pq = publicQuestion(q);

  const check = () => {
    if (!answer || !isReady(pq, answer)) return;
    const g = grade(q, answer);
    setResult(g);
    play(g.correct ? 'correct' : 'wrong');
    reviews.current.push({ conceptId: q.conceptId, format: q.format, bloom: q.bloom, score: g.score, at: Date.now() });
  };
  const next = () => {
    if (index + 1 >= questions.length) return void finish();
    setIndex(index + 1);
    setAnswer(null);
    setResult(null);
  };

  return (
    <div className="space-y-4 pb-32">
      <div className="flex items-center gap-3">
        <Link to="/offline" aria-label={t('quiz.exit')} className="text-2xl font-black text-muted">
          ×
        </Link>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-brand" style={{ width: `${((index + (result ? 1 : 0)) / questions.length) * 100}%` }} />
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-black ${online ? 'bg-good/15 text-good' : 'bg-surface-2 text-muted'}`}>{online ? t('offline.online') : t('offline.offline')}</span>
      </div>
      <section key={q.id} data-format={q.format}>
        <span className="mb-2 inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-extrabold text-muted">{t(`formats.${q.format}`)}</span>
        <h1 className="pop-in mb-4 rounded-2xl bg-surface p-3.5 text-lg leading-snug font-extrabold whitespace-pre-line ring-1 ring-line">{q.prompt}</h1>
        <fieldset disabled={!!result} className="min-w-0">
          <QuestionInput q={pq} value={answer} onChange={setAnswer} onSubmit={check} reveal={result ? { correct: result.correct, correctAnswer: result.correctAnswer, itemResults: result.itemResults } : null} />
        </fieldset>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-line bg-bg/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
        {result ? (
          <div className="space-y-2">
            <p className={`font-black ${result.correct ? 'text-good' : 'text-bad'}`} role="status">
              {result.correct ? t('live.correct') : t('offline.answerWas')}
            </p>
            {!result.correct && <p className="text-sm font-bold whitespace-pre-line">{result.correctAnswer}</p>}
            <button onClick={next} className="w-full rounded-2xl bg-brand py-3.5 font-black text-brand-ink">
              {t('quiz.continue')}
            </button>
          </div>
        ) : (
          <button onClick={check} disabled={!isReady(pq, answer)} className="w-full rounded-2xl bg-brand py-3.5 text-lg font-black text-brand-ink disabled:opacity-40">
            {t('quiz.check')}
          </button>
        )}
      </div>
    </div>
  );
}

function makeRound(concepts: readonly Concept[], language: 'en' | 'fr', round: number): Question[] {
  const rng = seededRng(hashString(`${Date.now()}:${round}`));
  const ids = pickConcepts(concepts, new Map(), Math.min(ROUND, Math.max(5, concepts.length)), 'practice', Date.now(), rng);
  const recent = new Map<string, ConceptProgress>();
  const out: Question[] = [];
  for (const id of ids) {
    const c = concepts.find((x) => x.id === id);
    if (!c) continue;
    const p = recent.get(id) ?? newProgress();
    const choice = chooseFormat(c, concepts, p, rng, { allowed: OFFLINE_FORMATS });
    if (!choice) continue;
    const q = generateLocal(c, choice.format, choice.bloom, { deck: concepts, language, rng });
    if (q) out.push(q);
    recent.set(id, { ...p, recentFormats: [choice.format, ...p.recentFormats] });
  }
  return out;
}

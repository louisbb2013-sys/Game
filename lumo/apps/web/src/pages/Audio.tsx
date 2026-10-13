import { gradeKeyPoints, hashString, seededRng, shuffle, type Concept } from '@lumo/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { listenAvailable, listenOnce, stopListening } from '../lib/listen';
import { offlineDeck, queueReviews, syncOffline, type OfflineDeck, type OfflineReview } from '../lib/offline';
import { speak, speechAvailable, stopSpeaking } from '../lib/speech';

type Step = 'idle' | 'ask' | 'listening' | 'answer' | 'rate' | 'done';
const ROUND = 12;

const LINES = {
  en: { ask: (t: string) => `What is ${t}?`, answer: 'Here is the answer.', knew: 'Did you know it? Say yes or no.', done: 'Great listening! That is the end of this round.' },
  fr: { ask: (t: string) => `Qu’est-ce que ${t} ?`, answer: 'Voici la réponse.', knew: 'Tu le savais ? Dis oui ou non.', done: 'Bravo ! C’est la fin de cette série.' },
};
const YES = /\b(yes|yeah|yep|oui|ouais)\b/i;
const NO = /\b(no|nope|non|pas)\b/i;

/** Audio mode: Lumo reads ideas aloud and quizzes you by voice — for the bus, a walk, or tired eyes. */
export function Audio() {
  const { deckId = '' } = useParams();
  const { t } = useTranslation();
  const { user, update } = useAuth();
  const [deck, setDeck] = useState<OfflineDeck | null>(() => offlineDeck(deckId));
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<'quiz' | 'listen'>('quiz');
  const [mic, setMic] = useState(false);
  const [items, setItems] = useState<Concept[]>([]);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('idle');
  const [heard, setHeard] = useState('');
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);
  const reviews = useRef<OfflineReview[]>([]);
  const rate = user?.settings.audioRate ?? 1;

  useEffect(() => {
    if (deck) return;
    api<OfflineDeck>(`/api/decks/${deckId}/offline`).then(setDeck, () => setFailed(true));
  }, [deck, deckId]);
  useEffect(() => {
    if (deck) setItems(shuffle(deck.concepts, seededRng(hashString(`${deckId}:${Date.now()}`))).slice(0, ROUND));
  }, [deck, deckId]);
  // Stop talking when leaving the page.
  useEffect(
    () => () => {
      run.current++;
      stopSpeaking();
      stopListening();
    },
    [],
  );

  const lang = deck?.deck.language ?? 'en';
  const L = LINES[lang];

  const finish = useCallback(async () => {
    setStep('done');
    setPlaying(false);
    queueReviews(deckId, reviews.current);
    reviews.current = [];
    await speak(L.done, lang, { rate });
    void syncOffline().catch(() => {});
  }, [deckId, L, lang, rate]);

  const rateIt = useCallback(
    (i: number, knew: boolean) => {
      const c = items[i];
      if (c) reviews.current.push({ conceptId: c.id, format: 'type_answer', bloom: 'remember', score: knew ? 1 : 0, at: Date.now(), selfRated: true });
    },
    [items],
  );

  /** Play one concept; then move on by itself until paused or finished. */
  const play = useCallback(
    async (i: number) => {
      const my = ++run.current;
      const alive = () => my === run.current;
      const c = items[i];
      if (!c) return void finish();
      setIndex(i);
      setHeard('');
      if (mode === 'listen') {
        setStep('answer');
        await speak(`${c.term}. ${c.summary} ${c.examples[0] ?? c.keyPoints[0] ?? ''}`, lang, { rate });
        if (!alive()) return;
        await new Promise((r) => setTimeout(r, 800));
        if (alive()) void play(i + 1);
        return;
      }
      setStep('ask');
      await speak(L.ask(c.term), lang, { rate });
      if (!alive()) return;
      setStep('listening');
      let said = '';
      if (mic) said = await listenOnce(lang, 8000);
      else await new Promise((r) => setTimeout(r, 5000)); // thinking time
      if (!alive()) return;
      setHeard(said);
      setStep('answer');
      await speak(`${L.answer} ${c.summary}`, lang, { rate });
      if (!alive()) return;
      setStep('rate');
      if (mic) {
        await speak(L.knew, lang, { rate });
        if (!alive()) return;
        const yn = await listenOnce(lang, 5000);
        if (!alive()) return;
        if (YES.test(yn) || NO.test(yn)) {
          rateIt(i, YES.test(yn));
          void play(i + 1);
        }
      }
    },
    [items, mode, mic, lang, rate, L, finish, rateIt],
  );

  const start = () => {
    reviews.current = [];
    setPlaying(true);
    void play(0);
  };
  const pause = () => {
    run.current++;
    stopSpeaking();
    stopListening();
    setPlaying(false);
    setStep('idle');
  };
  const answerRate = (knew: boolean) => {
    rateIt(index, knew);
    void play(index + 1);
  };

  if (failed && !deck)
    return (
      <div className="flex flex-col items-center gap-3 pt-12 text-center">
        <Lumo size={100} mood="sad" />
        <p className="font-black">{t('audio.cantLoad')}</p>
        <Link to="/learn" className="font-black text-brand">
          {t('common.back')}
        </Link>
      </div>
    );
  if (!deck) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;
  const c = items[index];

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <Link to={`/decks/${deckId}`} className="rounded-full bg-surface px-3 py-1 text-sm font-extrabold ring-1 ring-line">
          ← {t('common.back')}
        </Link>
        <span className="truncate text-sm font-bold text-muted">{deck.deck.title}</span>
      </header>
      <h1 className="text-2xl font-black">🎧 {t('audio.title')}</h1>
      {!speechAvailable() && <p className="rounded-xl bg-amber-glow/15 px-3 py-2 text-sm font-bold">{t('audio.noVoice')}</p>}

      {step === 'idle' || step === 'done' ? (
        <section className="space-y-4 rounded-3xl bg-surface p-4 ring-1 ring-line">
          {step === 'done' && <p className="rounded-xl bg-good/10 px-3 py-2 font-black text-good">{t('audio.done')}</p>}
          <div role="radiogroup" aria-label={t('audio.modeLabel')} className="grid grid-cols-2 gap-2">
            {(['quiz', 'listen'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-2xl p-3 text-left ring-2 ${mode === m ? 'bg-brand/10 ring-brand' : 'ring-line'}`}>
                <span className="block font-black">{t(`audio.mode.${m}`)}</span>
                <span className="text-xs text-muted">{t(`audio.mode.${m}Body`)}</span>
              </button>
            ))}
          </div>
          {mode === 'quiz' && listenAvailable() && (
            <label className="flex items-center justify-between gap-3 font-bold">
              <span>
                🎙️ {t('audio.mic')}
                <span className="block text-xs font-normal text-muted">{t('audio.micHint')}</span>
              </span>
              <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} className="size-6 accent-brand" />
            </label>
          )}
          <label className="flex items-center justify-between gap-3 font-bold">
            <span>{t('audio.speed')}</span>
            <select value={rate} onChange={(e) => void update({ settings: { audioRate: Number(e.target.value) } })} className="rounded-xl border-2 border-line bg-bg px-2 py-1.5 font-bold">
              {[0.75, 1, 1.25].map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <button onClick={start} className="w-full rounded-2xl bg-brand py-4 text-lg font-black text-brand-ink">
            ▶ {step === 'done' ? t('audio.again') : t('audio.start', { count: items.length })}
          </button>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-indigo-700 to-violet-600 p-6 text-center text-white" aria-live="polite">
            <Lumo size={80} mood={step === 'listening' ? 'thinking' : 'happy'} />
            <p className="text-xs font-bold opacity-80">
              {index + 1} / {items.length}
            </p>
            <p className="text-2xl font-black">{c?.term}</p>
            {step === 'listening' && <p className="animate-pulse font-bold">{mic ? `🎙️ ${t('audio.listening')}` : `🤔 ${t('audio.thinking')}`}</p>}
            {(step === 'answer' || step === 'rate') && <p className="font-bold">{c?.summary}</p>}
            {heard && <p className="rounded-xl bg-white/15 px-3 py-1.5 text-sm">“{heard}” {c && gradeKeyPoints(heard, [c.summary, ...c.keyPoints], 1).score >= 0.5 ? '✅' : ''}</p>}
          </div>
          {step === 'rate' && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => answerRate(false)} className="rounded-2xl bg-surface py-4 text-lg font-black ring-2 ring-line">
                😅 {t('audio.notYet')}
              </button>
              <button onClick={() => answerRate(true)} className="rounded-2xl bg-good py-4 text-lg font-black text-white">
                💪 {t('audio.knewIt')}
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={pause} className="flex-1 rounded-2xl bg-surface py-3 font-black ring-1 ring-line">
              ⏸ {t('audio.pause')}
            </button>
            <button onClick={() => (playing ? void play(index + 1) : undefined)} className="flex-1 rounded-2xl bg-surface py-3 font-black ring-1 ring-line">
              ⏭ {t('audio.skip')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

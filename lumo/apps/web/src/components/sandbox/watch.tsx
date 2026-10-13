import type { SandboxData } from '@lumo/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { speak, speechAvailable, stopSpeaking } from '../../lib/speech';
import { Lumo } from '../Lumo';
import { BigButton, CheckCard, ProgressDots, type PlayerProps } from './shared';

type Video = Extract<SandboxData, { kind: 'video' }>;
type Podcast = Extract<SandboxData, { kind: 'podcast' }>;
type Story = Extract<SandboxData, { kind: 'story' }>;

const SCENE_BG: Record<string, string> = {
  title: 'from-indigo-900 via-indigo-700 to-violet-600',
  idea: 'from-indigo-800 to-sky-600',
  points: 'from-violet-800 to-indigo-600',
  example: 'from-emerald-700 to-teal-500',
  check: 'from-amber-600 to-orange-500',
  recap: 'from-indigo-900 to-fuchsia-700',
};

/** Animated, narrated explainer. It stops at "pause and predict" scenes so watching stays active. */
export function VideoPlayer({ data, language, onComplete }: PlayerProps<Video>) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(!speechAvailable());
  const [checks, setChecks] = useState<boolean[]>([]);
  const scene = data.scenes[i]!;
  const last = i === data.scenes.length - 1;
  const totalChecks = data.scenes.filter((s) => s.check).length;
  const playRef = useRef(playing);
  playRef.current = playing;

  const next = useCallback(() => setI((x) => Math.min(x + 1, data.scenes.length - 1)), [data.scenes.length]);

  useEffect(() => {
    if (!playing || scene.check) return;
    let cancelled = false;
    void speak(scene.narration, language, { muted }).then(() => {
      if (cancelled || !playRef.current) return;
      if (last) setPlaying(false);
      else setTimeout(() => !cancelled && playRef.current && next(), 500);
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [i, playing, muted, scene, language, last, next]);

  useEffect(() => () => stopSpeaking(), []);

  return (
    <div className="space-y-4">
      {/* Check scenes grow to fit the question; other scenes keep a video frame shape. */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br text-white shadow-xl ${scene.check ? 'p-4 pb-20' : 'aspect-[9/12] sm:aspect-video'} ${SCENE_BG[scene.type]}`}>
        <div key={i} className={`pop-in flex flex-col items-center justify-center gap-4 text-center ${scene.check ? '' : 'absolute inset-0 p-6'}`}>
          {scene.check ? (
            <div className="w-full max-w-md">
              <p className="mb-3 text-2xl font-black drop-shadow">⏸️ {scene.heading}</p>
              <CheckCard
                q={scene.check}
                onDone={(ok) => {
                  setChecks((c) => [...c, ok]);
                  next();
                }}
              />
            </div>
          ) : (
            <>
              <span className="lumo-bounce text-7xl drop-shadow-lg" aria-hidden>
                {scene.emoji}
              </span>
              <h2 className="text-3xl leading-tight font-black drop-shadow sm:text-4xl">{scene.heading}</h2>
              {scene.text && <p className="max-w-md text-lg font-bold text-white/90">{scene.text}</p>}
              {scene.bullets && (
                <ul className="max-w-md space-y-2 text-left">
                  {scene.bullets.map((b, k) => (
                    <li key={k} className="pop-in rounded-xl bg-white/15 px-3 py-2 font-bold backdrop-blur" style={{ animationDelay: `${0.4 + k * 0.6}s` }}>
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="absolute bottom-3 left-3">
          <Lumo size={54} mood={playing ? 'cheer' : 'happy'} />
        </div>
      </div>

      {/* captions (also the transcript for deaf / muted viewers) */}
      {!scene.check && (
        <p className="min-h-12 rounded-2xl bg-surface p-3 text-center font-bold ring-1 ring-line" aria-live="polite">
          {scene.narration}
        </p>
      )}

      <ProgressDots total={data.scenes.length} current={i} />
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <button type="button" onClick={() => (stopSpeaking(), setI((x) => Math.max(0, x - 1)))} disabled={i === 0} className="rounded-2xl bg-surface px-4 py-3 font-black ring-1 ring-line disabled:opacity-40" aria-label={t('sandbox.prev')}>
          ⏮
        </button>
        {last && !scene.check ? (
          <BigButton tone="good" onClick={() => onComplete(totalChecks ? checks.filter(Boolean).length / totalChecks : 1)}>
            {t('sandbox.finish')}
          </BigButton>
        ) : (
          <BigButton onClick={() => setPlaying((p) => !p)} disabled={!!scene.check}>
            {playing ? `⏸ ${t('sandbox.pause')}` : `▶ ${t('sandbox.play')}`}
          </BigButton>
        )}
        <button type="button" onClick={() => (stopSpeaking(), next())} disabled={last || !!scene.check} className="rounded-2xl bg-surface px-4 py-3 font-black ring-1 ring-line disabled:opacity-40" aria-label={t('sandbox.next')}>
          ⏭
        </button>
      </div>
      <label className="flex items-center justify-center gap-2 text-sm font-bold text-muted">
        <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} disabled={!speechAvailable()} />
        {t('sandbox.narration')}
      </label>
    </div>
  );
}

/** Two-host audio show with the transcript; quick checks pause the episode. */
export function PodcastPlayer({ data, language, onComplete }: PlayerProps<Podcast>) {
  const { t } = useTranslation();
  const [line, setLine] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pendingCheck, setPendingCheck] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const muted = !speechAvailable();

  // Move past the current line: a quick check first if one belongs here.
  const advance = useCallback(() => {
    const checkIdx = data.checks.findIndex((c) => c.afterLine === line);
    if (checkIdx >= 0 && results.length <= checkIdx) setPendingCheck(checkIdx);
    else if (line >= data.lines.length - 1) {
      setPlaying(false);
      setDone(true);
    } else setLine(line + 1);
  }, [data, line, results.length]);

  useEffect(() => {
    if (!playing || pendingCheck !== null || done) return;
    let cancelled = false;
    const l = data.lines[line]!;
    void speak(l.text, language, { variant: l.host, muted }).then(() => {
      if (!cancelled) advance();
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [line, playing, pendingCheck, done, data, language, muted, advance]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [line]);
  useEffect(() => () => stopSpeaking(), []);

  const host = data.lines[line]!.host;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-around rounded-3xl bg-gradient-to-br from-indigo-900 to-violet-700 p-5 text-white">
        {data.hosts.map((name, h) => (
          <div key={name} className={`flex flex-col items-center gap-1 transition ${playing && host === h ? 'scale-110' : 'opacity-70'}`}>
            {h === 0 ? <Lumo size={72} mood={playing && host === 0 ? 'cheer' : 'happy'} /> : <NovaAvatar talking={playing && host === 1} />}
            <span className="font-black">{name}</span>
          </div>
        ))}
      </div>
      <ol ref={listRef} className="max-h-72 space-y-2 overflow-y-auto rounded-3xl bg-surface p-3 ring-1 ring-line">
        {data.lines.slice(0, line + 1).map((l, k) => (
          <li key={k} data-line={k} className={`rounded-2xl px-3 py-2 ${l.host === 0 ? 'bg-brand/10' : 'ml-6 bg-amber-glow/15'} ${k === line ? 'ring-2 ring-brand' : ''}`}>
            <span className="text-xs font-black text-muted">{data.hosts[l.host]}</span>
            <p className="font-bold">{l.text}</p>
          </li>
        ))}
      </ol>
      {pendingCheck !== null ? (
        <CheckCard
          q={data.checks[pendingCheck]!.q}
          onDone={(ok) => {
            setResults((r) => [...r, ok]);
            setPendingCheck(null);
            if (line >= data.lines.length - 1) setDone(true);
            else setLine(line + 1);
          }}
        />
      ) : done ? (
        <BigButton tone="good" onClick={() => onComplete(data.checks.length ? results.filter(Boolean).length / data.checks.length : 1)}>
          {t('sandbox.finish')}
        </BigButton>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <BigButton onClick={() => setPlaying((p) => !p)}>{playing ? `⏸ ${t('sandbox.pause')}` : `▶ ${t(line ? 'sandbox.resume' : 'sandbox.play')}`}</BigButton>
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              advance();
            }}
            aria-label={t('sandbox.next')}
            className="rounded-2xl bg-surface px-4 py-3 font-black ring-1 ring-line"
          >
            ⏭
          </button>
        </div>
      )}
    </div>
  );
}

function NovaAvatar({ talking }: { talking: boolean }) {
  return (
    <svg viewBox="0 0 80 80" width={72} height={72} aria-hidden className={talking ? 'lumo-bounce' : 'lumo-float'}>
      <circle cx="40" cy="44" r="28" fill="#F472B6" />
      <path d="M14 34 Q40 2 66 34" fill="#7C3AED" />
      <circle cx="31" cy="44" r="4" fill="#1E1B4B" />
      <circle cx="49" cy="44" r="4" fill="#1E1B4B" />
      <path d={talking ? 'M32 56 Q40 64 48 56 Z' : 'M33 56 Q40 61 47 56'} stroke="#1E1B4B" strokeWidth="3" fill={talking ? '#fff' : 'none'} strokeLinecap="round" />
      <rect x="8" y="38" width="8" height="16" rx="4" fill="#1E1B4B" />
      <rect x="64" y="38" width="8" height="16" rx="4" fill="#1E1B4B" />
    </svg>
  );
}

/** A short mystery: each chapter unlocks only after answering its question. */
export function StoryPlayer({ data, onComplete }: PlayerProps<Story>) {
  const { t } = useTranslation();
  const [ch, setCh] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [asking, setAsking] = useState(false);
  const ended = ch >= data.chapters.length;
  const chapter = data.chapters[Math.min(ch, data.chapters.length - 1)]!;
  return (
    <div className="space-y-4">
      <h2 className="text-center text-2xl font-black">{data.title}</h2>
      <ProgressDots total={data.chapters.length + 1} current={ch} />
      {ended ? (
        <div className="pop-in space-y-4 rounded-3xl bg-gradient-to-br from-indigo-900 to-violet-700 p-6 text-center text-white">
          <span className="text-6xl">🏁</span>
          <p className="text-lg font-bold">{data.ending}</p>
          <BigButton tone="good" onClick={() => onComplete(results.filter(Boolean).length / data.chapters.length)}>
            {t('sandbox.finish')}
          </BigButton>
        </div>
      ) : (
        <article key={ch} className="pop-in space-y-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
          <div className="flex items-center gap-3">
            <span className="text-5xl" aria-hidden>
              {chapter.emoji}
            </span>
            <p className="text-sm font-black tracking-wide text-muted uppercase">{t('sandbox.chapter', { n: ch + 1 })}</p>
          </div>
          <p className="text-lg leading-relaxed">{chapter.text}</p>
          {asking ? (
            <CheckCard
              q={chapter.q}
              onDone={(ok) => {
                setResults((r) => [...r, ok]);
                setAsking(false);
                setCh(ch + 1);
              }}
            />
          ) : (
            <BigButton onClick={() => setAsking(true)}>🔓 {t('sandbox.unlock')}</BigButton>
          )}
        </article>
      )}
    </div>
  );
}

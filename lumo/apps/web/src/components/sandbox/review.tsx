import { orderingScore, shuffle, type SandboxData } from '@lumo/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { play } from '../../lib/sound';
import { BigButton, ProgressDots, type PlayerProps } from './shared';

type Flashcards = Extract<SandboxData, { kind: 'flashcards' }>;
type MindMap = Extract<SandboxData, { kind: 'mind_map' }>;
type Cheat = Extract<SandboxData, { kind: 'cheat_sheet' }>;
type Mnemonics = Extract<SandboxData, { kind: 'mnemonics' }>;
type Timeline = Extract<SandboxData, { kind: 'timeline' }>;

/** Flashcards with active recall: think first, flip, rate. "Not yet" cards come back. */
export function FlashcardsPlayer({ data, onComplete }: PlayerProps<Flashcards>) {
  const { t } = useTranslation();
  const [queue, setQueue] = useState(() => shuffle(data.cards.map((_, i) => i)));
  const [flipped, setFlipped] = useState(false);
  const [firstTime, setFirstTime] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const idx = queue[0];
  if (idx === undefined) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl">🗂️</p>
        <p className="text-xl font-black">{t('sandbox.cardsDone', { n: firstTime, total: data.cards.length })}</p>
        <BigButton tone="good" onClick={() => onComplete(firstTime / data.cards.length)}>
          {t('sandbox.finish')}
        </BigButton>
      </div>
    );
  }
  const card = data.cards[idx]!;
  const rate = (knew: boolean) => {
    play(knew ? 'correct' : 'tap');
    if (knew && !seen.has(idx)) setFirstTime((n) => n + 1);
    setSeen((s) => new Set(s).add(idx));
    setFlipped(false);
    setQueue((q) => (knew ? q.slice(1) : [...q.slice(1, 3), idx, ...q.slice(3)]));
  };
  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-bold text-muted">{t('sandbox.cardsLeft', { n: queue.length })}</p>
      <button type="button" onClick={() => setFlipped((f) => !f)} className="block w-full [perspective:1000px]" aria-label={t('sandbox.flip')}>
        <div className={`relative min-h-64 w-full transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? '[transform:rotateY(180deg)]' : ''}`}>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-gradient-to-br from-indigo-700 to-violet-600 p-6 text-white [backface-visibility:hidden]">
            <p className="text-3xl font-black">{card.front}</p>
            <p className="text-sm text-indigo-100">{t('sandbox.thinkFirst')}</p>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface p-6 ring-2 ring-brand [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="text-lg font-bold">{card.back}</p>
            {card.hint && <p className="text-sm text-muted">💡 {card.hint}</p>}
          </div>
        </div>
      </button>
      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <BigButton tone="plain" onClick={() => rate(false)}>
            🔁 {t('sandbox.notYet')}
          </BigButton>
          <BigButton tone="good" onClick={() => rate(true)}>
            ✓ {t('sandbox.gotIt')}
          </BigButton>
        </div>
      ) : (
        <BigButton onClick={() => setFlipped(true)}>{t('sandbox.flip')}</BigButton>
      )}
    </div>
  );
}

/** Radial concept map. Explore by tapping, then "Test me": name the hidden nodes. */
export function MindMapPlayer({ data, onComplete }: PlayerProps<MindMap>) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<{ term: string; summary: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const nodes = data.branches.flatMap((b) => b.nodes);
  const order = useMemo(() => shuffle(nodes.map((_, i) => i)).slice(0, Math.min(6, nodes.length)), [nodes]);
  const [q, setQ] = useState(0);
  const [right, setRight] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const W = 360;
  const cx = W / 2;
  const cy = W / 2;
  const hidden = testing && order[q] !== undefined ? nodes[order[q]!] : null;
  const options = useMemo(() => (hidden ? shuffle([hidden.term, ...shuffle(nodes.filter((n) => n.term !== hidden.term)).slice(0, 3).map((n) => n.term)]) : []), [hidden, nodes]);

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${W}`} className="w-full rounded-3xl bg-surface ring-1 ring-line" role="img" aria-label={data.center}>
        {data.branches.map((b, bi) => {
          const a = (bi / data.branches.length) * Math.PI * 2 - Math.PI / 2;
          const bx = cx + Math.cos(a) * 95;
          const by = cy + Math.sin(a) * 95;
          return (
            <g key={bi}>
              <line x1={cx} y1={cy} x2={bx} y2={by} stroke="var(--lumo-brand)" strokeWidth="3" opacity="0.5" />
              {b.nodes.map((node, ni) => {
                const spread = 0.9 / Math.max(1, data.branches.length / 3);
                const na = a + (ni - (b.nodes.length - 1) / 2) * spread * 0.55;
                const nx = cx + Math.cos(na) * 150;
                const ny = cy + Math.sin(na) * 150;
                const isHidden = hidden && hidden.term === node.term;
                return (
                  <g key={ni} onClick={() => !testing && setSelected(node)} className="cursor-pointer">
                    <line x1={bx} y1={by} x2={nx} y2={ny} stroke="var(--lumo-line)" strokeWidth="2" />
                    <circle cx={nx} cy={ny} r={isHidden ? 16 : 5} fill={isHidden ? 'var(--lumo-accent)' : 'var(--lumo-brand)'} />
                    <text x={nx} y={ny + (ny > cy ? 18 : -10)} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--lumo-ink)">
                      {isHidden ? '?' : node.term.length > 16 ? node.term.slice(0, 15) + '…' : node.term}
                    </text>
                  </g>
                );
              })}
              <rect x={bx - 50} y={by - 13} width="100" height="26" rx="13" fill="var(--lumo-surface-2)" stroke="var(--lumo-brand)" />
              <text x={bx} y={by + 4} textAnchor="middle" fontSize="11" fontWeight="900" fill="var(--lumo-ink)">
                {b.topic.length > 15 ? b.topic.slice(0, 14) + '…' : b.topic}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="42" fill="var(--lumo-accent)" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="900" fill="#1E1B4B">
          {data.center.length > 14 ? data.center.slice(0, 13) + '…' : data.center}
        </text>
      </svg>

      {!testing ? (
        <>
          <p className="min-h-12 rounded-2xl bg-surface p-3 text-sm ring-1 ring-line">{selected ? <><b>{selected.term}</b> — {selected.summary}</> : t('sandbox.tapNode')}</p>
          <BigButton onClick={() => setTesting(true)}>🧠 {t('sandbox.testMe')}</BigButton>
        </>
      ) : hidden ? (
        <div className="space-y-2">
          <p className="font-bold">
            {t('sandbox.whichNode')} <span className="text-muted">“{hidden.summary}”</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                disabled={!!picked}
                onClick={() => {
                  setPicked(o);
                  const ok = o === hidden.term;
                  play(ok ? 'correct' : 'wrong');
                  if (ok) setRight((r) => r + 1);
                  setTimeout(() => {
                    setPicked(null);
                    setQ((x) => x + 1);
                  }, 900);
                }}
                className={`rounded-xl p-3 font-bold ring-2 ${picked ? (o === hidden.term ? 'bg-good/15 ring-good' : o === picked ? 'bg-bad/10 ring-bad' : 'ring-line') : 'bg-surface ring-line'}`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <BigButton tone="good" onClick={() => onComplete(right / order.length)}>
          {t('sandbox.finishScore', { pct: Math.round((right / order.length) * 100) })}
        </BigButton>
      )}
    </div>
  );
}

/** Printable one-page summary with a cover-and-recall self-test mode. */
export function CheatSheetPlayer({ data, onComplete }: PlayerProps<Cheat>) {
  const { t } = useTranslation();
  const [selfTest, setSelfTest] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [knew, setKnew] = useState<Set<string>>(new Set());
  const items = data.sections.flatMap((s) => s.items);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 print:hidden">
        <button type="button" onClick={() => setSelfTest((v) => !v)} className={`flex-1 rounded-xl py-2 font-bold ring-1 ${selfTest ? 'bg-brand text-brand-ink ring-brand' : 'ring-line'}`}>
          🙈 {t('sandbox.selfTest')}
        </button>
        <button type="button" onClick={() => window.print()} className="flex-1 rounded-xl py-2 font-bold ring-1 ring-line">
          🖨️ {t('sandbox.print')}
        </button>
      </div>
      {selfTest && <p className="text-sm font-bold text-muted print:hidden">{t('sandbox.selfTestHint')}</p>}
      <article className="cheat-sheet space-y-4 rounded-3xl bg-white p-5 text-slate-900 ring-1 ring-line">
        <h2 className="text-2xl font-black">{data.title}</h2>
        {data.sections.map((s) => (
          <section key={s.topic}>
            <h3 className="mb-2 border-b-2 border-amber-400 pb-1 font-black">{s.topic}</h3>
            <dl className="grid gap-2 sm:grid-cols-2">
              {s.items.map((it) => {
                const hide = selfTest && !revealed.has(it.term);
                return (
                  <div key={it.term} className="rounded-xl bg-amber-50 p-2.5">
                    <dt className="font-black">{it.term}</dt>
                    {hide ? (
                      <dd>
                        <button type="button" onClick={() => setRevealed((r) => new Set(r).add(it.term))} className="mt-1 w-full rounded-lg bg-slate-200 py-2 text-sm font-bold print:hidden">
                          {t('sandbox.recallThenTap')}
                        </button>
                      </dd>
                    ) : (
                      <dd className="text-sm">
                        {it.summary}
                        {it.formula && <code className="mt-1 block rounded bg-white px-1.5 py-0.5 font-bold">{it.formula}</code>}
                        {it.points.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-xs">
                            {it.points.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        )}
                        {selfTest && (
                          <label className="mt-1 flex items-center gap-1 text-xs font-bold print:hidden">
                            <input type="checkbox" checked={knew.has(it.term)} onChange={(e) => setKnew((k) => (e.target.checked ? new Set(k).add(it.term) : new Set([...k].filter((x) => x !== it.term))))} />
                            {t('sandbox.iKnewIt')}
                          </label>
                        )}
                      </dd>
                    )}
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </article>
      <div className="print:hidden">
        <BigButton tone="good" onClick={() => onComplete(selfTest ? knew.size / items.length : 0.6)}>
          {t('sandbox.finish')}
        </BigButton>
      </div>
    </div>
  );
}

/** Memory tricks, then rebuild the list from memory using the trick. */
export function MnemonicsPlayer({ data, onComplete }: PlayerProps<Mnemonics>) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [testing, setTesting] = useState(false);
  const [built, setBuilt] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const item = data.items[i];
  const pool = useMemo(() => (item ? shuffle(item.list) : []), [item]);
  if (!item) {
    const s = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl">🎵</p>
        <BigButton tone="good" onClick={() => onComplete(s)}>
          {t('sandbox.finishScore', { pct: Math.round(s * 100) })}
        </BigButton>
      </div>
    );
  }
  const finished = built.length === item.list.length;
  const score = finished ? orderingScore(item.list, built) : 0;
  return (
    <div className="space-y-4">
      <ProgressDots total={data.items.length} current={i} />
      <h2 className="text-xl font-black">{item.title}</h2>
      {!testing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-center gap-1">
            {[...item.acronym].map((ch, k) => (
              <span key={k} className="pop-in grid size-12 place-items-center rounded-xl bg-brand text-2xl font-black text-brand-ink" style={{ animationDelay: `${k * 0.12}s` }}>
                {ch}
              </span>
            ))}
          </div>
          <p className="rounded-2xl bg-amber-glow/20 p-4 text-center text-xl font-black italic">“{item.sentence}”</p>
          <ol className="list-decimal space-y-1 rounded-2xl bg-surface p-4 pl-8 font-bold ring-1 ring-line">
            {item.list.map((x) => (
              <li key={x}>
                <span className="text-brand">{x[0]}</span>
                {x.slice(1)}
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted">💡 {item.tip}</p>
          <BigButton onClick={() => setTesting(true)}>{t('sandbox.testMemory')}</BigButton>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-bold">{t('sandbox.rebuild', { acronym: item.acronym })}</p>
          <ol className="min-h-12 list-decimal space-y-1 rounded-2xl bg-surface p-3 pl-8 ring-1 ring-line">
            {built.map((x, k) => (
              <li key={x} className={`font-bold ${finished ? (item.list[k] === x ? 'text-good' : 'text-bad') : ''}`}>
                {x}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {pool
              .filter((x) => !built.includes(x))
              .map((x) => (
                <button key={x} type="button" onClick={() => setBuilt((b) => [...b, x])} className="rounded-xl bg-surface px-3 py-2 text-sm font-bold ring-2 ring-line hover:ring-brand">
                  {x}
                </button>
              ))}
          </div>
          {finished ? (
            <BigButton
              tone={score === 1 ? 'good' : 'brand'}
              onClick={() => {
                setScores((s) => [...s, score]);
                setI(i + 1);
                setTesting(false);
                setBuilt([]);
              }}
            >
              {score === 1 ? `✓ ${t('sandbox.perfect')}` : t('quiz.continue')}
            </BigButton>
          ) : (
            built.length > 0 && (
              <button type="button" onClick={() => setBuilt(built.slice(0, -1))} className="w-full rounded-xl py-2 font-bold ring-1 ring-line">
                ⌫ {t('sandbox.undo')}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Animated timeline, then rebuild the order from memory. */
export function TimelinePlayer({ data, onComplete }: PlayerProps<Timeline>) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [built, setBuilt] = useState<number[]>([]);
  const pool = useMemo(() => shuffle(data.events.map((_, i) => i)), [data.events]);
  const finished = built.length === data.events.length;
  const score = finished ? orderingScore(data.events.map((_, i) => String(i)), built.map(String)) : 0;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black">{data.title}</h2>
      {!testing ? (
        <>
          <ol className="relative space-y-4 border-l-4 border-brand/40 pl-6">
            {data.events.map((e, i) => (
              <li key={i} className="pop-in relative" style={{ animationDelay: `${i * 0.25}s` }}>
                <span className="absolute -left-[2.1rem] grid size-7 place-items-center rounded-full bg-brand text-xs font-black text-brand-ink">{e.label}</span>
                <p className="rounded-2xl bg-surface p-3 font-bold ring-1 ring-line">{e.detail}</p>
              </li>
            ))}
          </ol>
          <BigButton onClick={() => setTesting(true)}>{t('sandbox.rebuildTimeline')}</BigButton>
        </>
      ) : (
        <>
          <ol className="min-h-12 space-y-1.5">
            {built.map((idx, k) => (
              <li key={idx} className={`rounded-xl p-2 text-sm font-bold ring-2 ${finished ? (idx === k ? 'bg-good/10 ring-good' : 'bg-bad/10 ring-bad') : 'bg-surface ring-line'}`}>
                {k + 1}. {data.events[idx]!.detail}
              </li>
            ))}
          </ol>
          <div className="space-y-1.5">
            {pool
              .filter((i) => !built.includes(i))
              .map((i) => (
                <button key={i} type="button" onClick={() => setBuilt((b) => [...b, i])} className="w-full rounded-xl bg-surface p-2 text-left text-sm font-bold ring-2 ring-line hover:ring-brand">
                  {data.events[i]!.detail}
                </button>
              ))}
          </div>
          {finished ? (
            <BigButton tone="good" onClick={() => onComplete(score)}>
              {t('sandbox.finishScore', { pct: Math.round(score * 100) })}
            </BigButton>
          ) : (
            built.length > 0 && (
              <button type="button" onClick={() => setBuilt(built.slice(0, -1))} className="w-full rounded-xl py-2 font-bold ring-1 ring-line">
                ⌫ {t('sandbox.undo')}
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}

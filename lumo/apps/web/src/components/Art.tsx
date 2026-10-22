import type { Rarity } from '@lumo/core';
import { useEffect, useId, useState } from 'react';
import { cachedPortrait, portrait } from '../three/stage';

/**
 * Lumo's game art, drawn instead of emojis: treasure chests and eggs as small animated SVGs
 * (they bob, gleam, wobble and crack), and pet portraits taken from the 3D creatures.
 * Every animation is CSS (see index.css, "game art"), so it stops for reduced motion.
 */

type ChestKind = 'common' | 'rare' | 'epic';
const CHEST: Record<ChestKind, { top: string; bottom: string; lid: string; band: string; lock: string; dark: string; gem?: string }> = {
  common: { top: '#B8743F', bottom: '#6E3B19', lid: '#C9844A', band: '#E2AE62', lock: '#F6D27A', dark: '#3A1E0B' },
  rare: { top: '#3F78F0', bottom: '#1B2F7E', lid: '#4C86FA', band: '#D8E2F0', lock: '#F2F6FC', dark: '#0E1A4A' },
  epic: { top: '#8B4BF2', bottom: '#3A0F7A', lid: '#9A5CFA', band: '#F5C84C', lock: '#FFE08A', dark: '#24074F', gem: '#FF4FD8' },
};

/** A treasure chest: idles with a gleam; `shake` while it's being opened; `open` lifts the lid in a burst of light. */
export function ChestArt({ kind = 'common', size = 72, state = 'idle', className = '' }: { kind?: ChestKind; size?: number; state?: 'idle' | 'shake' | 'open'; className?: string }) {
  const id = useId().replace(/:/g, '');
  const c = CHEST[kind] ?? CHEST.common;
  return (
    <svg viewBox="0 0 120 112" width={size} height={size * (112 / 120)} className={`chest-art ${className}`} data-kind={kind} data-state={state} aria-hidden>
      <defs>
        <linearGradient id={`cb${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.top} />
          <stop offset="1" stopColor={c.bottom} />
        </linearGradient>
        <linearGradient id={`cl${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.lid} />
          <stop offset="1" stopColor={c.top} />
        </linearGradient>
        <radialGradient id={`cg${id}`}>
          <stop offset="0" stopColor="#FFF6C8" stopOpacity="1" />
          <stop offset="1" stopColor="#FFD54A" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`cc${id}`}>
          <path d="M14 52V40Q14 18 60 18Q106 18 106 40V52Z" />
        </clipPath>
      </defs>
      <g className="chest-rays">
        <circle cx="60" cy="50" r="46" fill={`url(#cg${id})`} />
        {Array.from({ length: 10 }, (_, i) => (
          <path key={i} d="M60 50L56 -4L64 -4Z" fill="#FFE9A0" opacity="0.7" transform={`rotate(${i * 36} 60 50)`} />
        ))}
      </g>
      <ellipse cx="60" cy="104" rx="42" ry="6" fill="#000" opacity="0.28" className="chest-shadow" />
      <g className="chest-all">
        <rect x="14" y="50" width="92" height="50" rx="8" fill={`url(#cb${id})`} />
        <rect x="14" y="50" width="92" height="9" fill={c.dark} opacity="0.35" />
        <rect x="27" y="50" width="10" height="50" fill={c.band} />
        <rect x="83" y="50" width="10" height="50" fill={c.band} />
        <rect x="14" y="91" width="92" height="9" rx="4" fill={c.band} opacity="0.95" />
        <rect x="49" y="57" width="22" height="24" rx="5" fill={c.lock} stroke={c.dark} strokeOpacity="0.35" />
        <circle cx="60" cy="66" r="3.4" fill={c.dark} />
        <rect x="58.6" y="66" width="2.8" height="8" rx="1" fill={c.dark} />
        <g className="chest-lid">
          <path d="M14 52V40Q14 18 60 18Q106 18 106 40V52Z" fill={`url(#cl${id})`} />
          <rect x="27" y="20" width="10" height="32" fill={c.band} />
          <rect x="83" y="20" width="10" height="32" fill={c.band} />
          <rect x="11" y="46" width="98" height="9" rx="4" fill={c.band} />
          {c.gem && <circle cx="60" cy="33" r="6" fill={c.gem} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" />}
          <g clipPath={`url(#cc${id})`}>
            <rect className="chest-shine" x="20" y="0" width="14" height="70" fill="#fff" opacity="0.35" transform="skewX(-20)" />
          </g>
        </g>
      </g>
      <g fill="#FFF3B0">
        <path className="chest-spark" style={{ animationDelay: '0s' }} d="M100 20l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
        <path className="chest-spark" style={{ animationDelay: '0.7s' }} d="M16 14l1.5 4.5 4.5 1.5-4.5 1.5-1.5 4.5-1.5-4.5-4.5-1.5 4.5-1.5z" />
        <path className="chest-spark" style={{ animationDelay: '1.3s' }} d="M110 70l1.2 3.6 3.6 1.2-3.6 1.2-1.2 3.6-1.2-3.6-3.6-1.2 3.6-1.2z" />
      </g>
    </svg>
  );
}

const EGG: Record<Rarity, { light: string; base: string; dark: string; accent: string }> = {
  common: { light: '#FFF9EE', base: '#F3E2C2', dark: '#CDAE7E', accent: '#E3A95C' },
  rare: { light: '#EAF7FF', base: '#9FD8FF', dark: '#3F8CCB', accent: '#2C62D6' },
  epic: { light: '#F6EAFF', base: '#C99DFF', dark: '#7044C2', accent: '#FF79D6' },
  legendary: { light: '#FFF8D4', base: '#FFD54A', dark: '#C98A00', accent: '#FF7A00' },
  mythical: { light: '#FFEAFB', base: '#FF92DA', dark: '#6D4BFF', accent: '#35E3FF' },
};
const EGG_PATH = 'M50 6C74 6 88 44 88 70C88 96 71 110 50 110C29 110 12 96 12 70C12 44 26 6 50 6Z';

/** An egg: it rocks, hops now and then, glows by rarity, and cracks as it gets close to hatching. */
export function EggArt({ rarity = 'common', size = 64, progress = 0, className = '' }: { rarity?: Rarity; size?: number; progress?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const e = EGG[rarity] ?? EGG.common;
  return (
    <svg viewBox="0 0 100 120" width={size * (100 / 120)} height={size} className={`egg-art ${className}`} data-rarity={rarity} data-ready={progress >= 0.8 ? 'true' : undefined} aria-hidden>
      <defs>
        <radialGradient id={`eg${id}`} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor={e.light} />
          <stop offset="0.55" stopColor={e.base} />
          <stop offset="1" stopColor={e.dark} />
        </radialGradient>
        <clipPath id={`ec${id}`}>
          <path d={EGG_PATH} />
        </clipPath>
      </defs>
      <ellipse cx="50" cy="113" rx="26" ry="4.5" fill="#000" opacity="0.28" className="egg-shadow" />
      <g className="egg-bob">
        <g className="egg-body">
          <g className="egg-shell">
            <path d={EGG_PATH} fill={`url(#eg${id})`} />
            <g clipPath={`url(#ec${id})`}>
              <path d="M6 70L16 61L26 70L36 61L46 70L56 61L66 70L76 61L86 70L96 61V78H6Z" fill={e.accent} opacity="0.55" />
              <circle cx="34" cy="90" r="5" fill={e.accent} opacity="0.45" />
              <circle cx="66" cy="94" r="3.6" fill={e.accent} opacity="0.45" />
              <circle cx="64" cy="38" r="4.2" fill={e.accent} opacity="0.4" />
              <circle cx="40" cy="50" r="2.6" fill={e.accent} opacity="0.4" />
            </g>
          </g>
          <ellipse cx="36" cy="34" rx="7" ry="13" fill="#fff" opacity="0.55" transform="rotate(-22 36 34)" />
          {progress >= 0.5 && <path d="M28 56L36 61L32 67L41 71L38 77" fill="none" stroke={e.dark} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="egg-crack" />}
          {progress >= 0.8 && <path d="M74 48L66 54L71 60L63 66L67 72" fill="none" stroke={e.dark} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="egg-crack" />}
        </g>
      </g>
    </svg>
  );
}

/**
 * A pet's portrait: its 3D creature, photographed once and reused (cheap enough for long lists), with
 * a rarity aura behind it. Falls back to the emoji where there's no 3D.
 */
export function PetPortrait({ species, rarity, emoji, size = 56, className = '', still = false }: { species: string; rarity: Rarity; emoji: string; size?: number; className?: string; still?: boolean }) {
  const [src, setSrc] = useState<string | null>(() => cachedPortrait(species, rarity));
  useEffect(() => {
    let alive = true;
    if (!src) void portrait(species, rarity).then((u) => alive && u && setSrc(u));
    return () => {
      alive = false;
    };
  }, [species, rarity, src]);
  return (
    <span className={`pet-portrait ${still ? 'is-still' : ''} ${className}`} data-rarity={rarity} style={{ width: size, height: size }}>
      <span className="pet-aura" aria-hidden />
      {src ? <img src={src} alt="" className="pet-img" draggable={false} /> : <span className="pet-emoji" style={{ fontSize: size * 0.55 }}>{emoji}</span>}
    </span>
  );
}

/** Rarity colours, for chips and borders. */
export const RARITY_TONE: Record<Rarity, string> = {
  common: 'bg-slate-500 text-white',
  rare: 'bg-sky-600 text-white',
  epic: 'bg-fuchsia-600 text-white',
  legendary: 'bg-amber-400 text-night',
  mythical: 'rarity-mythical text-white',
};

/** A shop item's picture: eggs and chests are drawn; small consumables keep their emoji. */
export function ItemArt({ id, emoji, size = 44 }: { id: string; emoji?: string; size?: number }) {
  if (id === 'egg_common' || id === 'egg_rare') return <EggArt rarity={id === 'egg_rare' ? 'rare' : 'common'} size={size} />;
  if (id.startsWith('chest')) return <ChestArt kind="common" size={size * 1.1} />;
  return (
    <span className="inline-grid place-items-center" style={{ fontSize: size * 0.72, width: size, height: size }} aria-hidden>
      {emoji}
    </span>
  );
}

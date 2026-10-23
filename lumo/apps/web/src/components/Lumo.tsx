export type LumoMood = 'happy' | 'cheer' | 'thinking' | 'sleepy' | 'sad';

interface Props {
  mood?: LumoMood;
  size?: number;
  glow?: number; // 0..1, the light grows with mastery
  className?: string;
  title?: string;
}

/** Lumoly the firefly. Original artwork, pure SVG so it scales and themes cleanly. */
export function Lumo({ mood = 'happy', size = 96, glow = 0.7, className = '', title = 'Lumo' }: Props) {
  const g = Math.max(0.15, Math.min(1, glow));
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={`lumo ${mood === 'cheer' ? 'lumo-bounce' : 'lumo-float'} ${className}`}
    >
      <defs>
        <radialGradient id="lumo-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE08A" stopOpacity={0.95 * g} />
          <stop offset="60%" stopColor="#F5A524" stopOpacity={0.35 * g} />
          <stop offset="100%" stopColor="#F5A524" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lumo-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#312E81" />
        </linearGradient>
      </defs>

      {/* glow halo behind the tail */}
      <circle className="lumo-halo" cx="60" cy="88" r={26 + 10 * g} fill="url(#lumo-glow)" />

      {/* wings */}
      <ellipse cx="34" cy="52" rx="20" ry="13" fill="#C7D2FE" opacity="0.85" transform="rotate(-28 34 52)" className="lumo-wing-l" />
      <ellipse cx="86" cy="52" rx="20" ry="13" fill="#C7D2FE" opacity="0.85" transform="rotate(28 86 52)" className="lumo-wing-r" />

      {/* glowing tail */}
      <ellipse cx="60" cy="86" rx="17" ry="15" fill="#FBBF24" />
      <ellipse cx="60" cy="88" rx="11" ry="9" fill="#FEF3C7" opacity={0.6 + 0.4 * g} />

      {/* body / head */}
      <circle cx="60" cy="56" r="27" fill="url(#lumo-body)" />

      {/* antennae */}
      <path d="M50 32 Q44 16 36 14" stroke="#312E81" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M70 32 Q76 16 84 14" stroke="#312E81" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="36" cy="14" r="4.5" fill="#FBBF24" />
      <circle cx="84" cy="14" r="4.5" fill="#FBBF24" />

      {/* cheeks */}
      <circle cx="42" cy="64" r="4.5" fill="#F472B6" opacity="0.45" />
      <circle cx="78" cy="64" r="4.5" fill="#F472B6" opacity="0.45" />

      <Eyes mood={mood} />
      <Mouth mood={mood} />
    </svg>
  );
}

function Eyes({ mood }: { mood: LumoMood }) {
  if (mood === 'sleepy') {
    return (
      <g stroke="#FFF" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M44 54 Q50 58 56 54" />
        <path d="M64 54 Q70 58 76 54" />
      </g>
    );
  }
  if (mood === 'cheer') {
    return (
      <g stroke="#FFF" strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M44 56 Q50 48 56 56" />
        <path d="M64 56 Q70 48 76 56" />
      </g>
    );
  }
  const lookUp = mood === 'thinking' ? -3 : 0;
  return (
    <g>
      <ellipse cx="50" cy="53" rx="7" ry="8.5" fill="#FFF" />
      <ellipse cx="70" cy="53" rx="7" ry="8.5" fill="#FFF" />
      <circle cx={51 + (mood === 'thinking' ? 2 : 0)} cy={55 + lookUp} r="4" fill="#1E1B4B" />
      <circle cx={71 + (mood === 'thinking' ? 2 : 0)} cy={55 + lookUp} r="4" fill="#1E1B4B" />
      <circle cx={52.5} cy={53 + lookUp} r="1.4" fill="#FFF" />
      <circle cx={72.5} cy={53 + lookUp} r="1.4" fill="#FFF" />
      {mood === 'sad' && (
        <g stroke="#C7D2FE" strokeWidth="2.5" strokeLinecap="round">
          <path d="M43 46 L55 42" />
          <path d="M77 46 L65 42" />
        </g>
      )}
    </g>
  );
}

function Mouth({ mood }: { mood: LumoMood }) {
  switch (mood) {
    case 'cheer':
      return <path d="M50 66 Q60 78 70 66 Z" fill="#FFF" />;
    case 'sad':
      return <path d="M52 71 Q60 65 68 71" stroke="#FFF" strokeWidth="3" fill="none" strokeLinecap="round" />;
    case 'thinking':
      return <path d="M54 69 L66 68" stroke="#FFF" strokeWidth="3" strokeLinecap="round" />;
    case 'sleepy':
      return <circle cx="60" cy="69" r="3" fill="#FFF" />;
    default:
      return <path d="M51 66 Q60 74 69 66" stroke="#FFF" strokeWidth="3" fill="none" strokeLinecap="round" />;
  }
}

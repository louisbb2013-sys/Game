import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 22, ...p }: P) => ({ width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, ...p });

export const FlameIcon = (p: P) => (
  <svg {...base(p)}>
    <path fill="#F97316" d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5.2 1.6 1 2.6 2 3 0-3 0-6 1-9Z" />
    <path fill="#FDE047" d="M12 21a3 3 0 0 1-3-3c0-1.7 1.4-2.6 2-4 .9 1 4 2.2 4 4a3 3 0 0 1-3 3Z" />
  </svg>
);

export const HeartIcon = (p: P) => (
  <svg {...base(p)}>
    <path fill="currentColor" d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.4 3 4.5 6.7 4.5c2 0 3.6 1.1 4.3 2.6h2C13.7 5.6 15.3 4.5 17.3 4.5c3.7 0 5.6 3.9 4.2 7.2C19.5 16.4 12 21 12 21Z" />
  </svg>
);

export const CoinIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9.5" fill="#F5A524" />
    <circle cx="12" cy="12" r="6.8" fill="#FBBF24" stroke="#D97706" strokeWidth="1.2" />
    <path d="M12 8.2l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4Z" fill="#FEF3C7" />
  </svg>
);

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const HomeIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M3 11 12 4l9 7" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </svg>
);
export const BookIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z" />
    <path d="M4 19V5M9 7h6" />
  </svg>
);
export const BoltIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />
  </svg>
);
export const TrophyIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z" />
    <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
  </svg>
);
export const UserIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const GearIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const CameraIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const GoogleIcon = (p: P) => (
  <svg {...base(p)} viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z" />
  </svg>
);
export const SparkIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base(p)} {...stroke} strokeWidth={2.6}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const UsersIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
  </svg>
);
export const PawIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <circle cx="6" cy="10" r="1.8" />
    <circle cx="10" cy="5.5" r="1.8" />
    <circle cx="14" cy="5.5" r="1.8" />
    <circle cx="18" cy="10" r="1.8" />
    <path d="M12 11c-3 0-6 4.5-6 7a2.5 2.5 0 0 0 3.5 2.3c1.6-.7 3.4-.7 5 0A2.5 2.5 0 0 0 18 18c0-2.5-3-7-6-7Z" />
  </svg>
);
export const ShopIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M4 9h16l-1.2 11H5.2Z" />
    <path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" />
  </svg>
);
export const UploadIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
  </svg>
);
export const TextIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <path d="M5 6h14M5 11h14M5 16h9" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base(p)} {...stroke}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);

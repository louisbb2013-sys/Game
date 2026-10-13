const COLORS: Record<string, string> = { amber: '#F5A524', violet: '#7C3AED', sky: '#0EA5E9', rose: '#F43F5E', mint: '#10B981', indigo: '#4F46E5' };
const FALLBACK = Object.values(COLORS);

/** A learner's avatar: their initial on their chosen colour (no photos, nothing personal). */
export function Avatar({ name, avatar, size = 36 }: { name: string; avatar: string; size?: number }) {
  const key = avatar.split('-').pop() ?? '';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const bg = COLORS[key] ?? FALLBACK[Math.abs(h) % FALLBACK.length]!;
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full font-black text-white" style={{ width: size, height: size, background: bg, fontSize: size * 0.45 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

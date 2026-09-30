/**
 * Pre-rendered stills, generated from the real 3D shader by `npm run stills`
 * into src/assets/stills/<slug>.webp. A creature without a still falls back
 * to the CSS fur ball automatically.
 */
const files = import.meta.glob('../assets/stills/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const stillFor = (slug: string): string | undefined => files[`../assets/stills/${slug}.webp`];

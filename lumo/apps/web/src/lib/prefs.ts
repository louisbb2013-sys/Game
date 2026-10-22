import type { Settings } from './api';

const KEY = 'lumo.settings';

export function loadLocalSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Settings;
  } catch {
    return {};
  }
}

let media: MediaQueryList | null = null;

/** Mirror settings onto <html> so CSS can react (theme, dyslexia font, large text, motion). */
export function applySettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
  const root = document.documentElement;
  const theme = s.theme ?? 'dark'; // Midnight is Revio's look; light and system are a choice in Settings
  media ??= window.matchMedia('(prefers-color-scheme: dark)');
  const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
  root.dataset.theme = resolved;
  root.dataset.dyslexic = String(Boolean(s.dyslexiaFont));
  root.dataset.largeText = String(Boolean(s.largeText));
  if (s.reduceMotion !== undefined) root.dataset.reduceMotion = String(s.reduceMotion);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0F0C29' : '#F4F2FA');
  media.onchange = () => applySettings(s);
}

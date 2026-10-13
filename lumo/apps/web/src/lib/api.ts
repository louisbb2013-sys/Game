export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

/** Browser-only build: no server, the app's data lives in this browser. */
export const LOCAL = import.meta.env.VITE_LOCAL === '1';

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (LOCAL) {
    const { localApi, LocalError } = await import('../local/backend');
    try {
      return await localApi<T>(init.method ?? 'GET', path, init.body);
    } catch (e) {
      throw e instanceof LocalError ? new ApiError(e.status, e.code) : new ApiError(500, 'error');
    }
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
  return data as T;
}

export interface Settings {
  theme?: 'system' | 'light' | 'dark';
  dyslexiaFont?: boolean;
  largeText?: boolean;
  sound?: boolean;
  reduceMotion?: boolean;
  uploadConsent?: boolean;
  reminder?: { enabled: boolean; time: string; days: number[] };
  audioRate?: number;
}

export interface Profile {
  id: string;
  username: string;
  avatar: string;
  email: string | null;
  locale: 'en' | 'fr';
  timezone: string;
  settings: Settings;
  xp: number;
  level: { level: number; current: number; needed: number; ratio: number };
  coins: number;
  hearts: { current: number; nextRefillAt: number | null };
  streak: { days: number; lastDay: string | null; freezes: number; status: 'none' | 'safe' | 'at_risk' | 'broken' };
  leagueTier: string;
  theme: string;
  boostUntil: string | null;
  createdAt: string;
}

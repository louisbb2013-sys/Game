export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
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
  createdAt: string;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setLocale } from '../i18n';
import { api, ApiError, type Profile, type Settings } from './api';
import { clearOffline, syncOffline } from './offline';
import { applySettings, loadLocalSettings } from './prefs';

const PROFILE_KEY = 'lumo_profile';
function cachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

interface AuthValue {
  user: Profile | null;
  loading: boolean;
  /** Signed in earlier but the server can't be reached: offline review still works. */
  offline: boolean;
  setUser: (u: Profile | null) => void;
  refresh: () => Promise<void>;
  update: (patch: Partial<Pick<Profile, 'username' | 'locale' | 'timezone' | 'avatar'>> & { settings?: Settings }) => Promise<Profile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const setUser = useCallback((u: Profile | null) => {
    setUserState(u);
    try {
      if (u) localStorage.setItem(PROFILE_KEY, JSON.stringify(u));
      else localStorage.removeItem(PROFILE_KEY);
    } catch {
      /* storage blocked */
    }
    if (u) {
      applySettings(u.settings);
      document.documentElement.dataset.skin = u.theme ?? 'default';
      setLocale(u.locale);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: Profile }>('/api/me');
      setUser(user);
      setOffline(false);
      void syncOffline();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else if (e instanceof ApiError && e.status === 0) {
        // No connection: keep the last known profile so saved decks can be reviewed.
        const cached = cachedProfile();
        if (cached) {
          setUserState(cached);
          applySettings(cached.settings);
          setLocale(cached.locale);
          setOffline(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    applySettings(loadLocalSettings());
    void refresh();
    // Back online: reconnect and send reviews done offline.
    const online = () => void refresh();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [refresh]);

  // Only the newest PATCH response may update state, so quick successive changes can't be undone by a slower, older reply.
  const updateSeq = useRef(0);
  const update = useCallback<AuthValue['update']>(
    async (patch) => {
      const seq = ++updateSeq.current;
      if (patch.settings || patch.locale) {
        // Optimistic: show the change immediately.
        setUserState((u) => {
          if (!u) return u;
          const next = { ...u, ...patch, settings: { ...u.settings, ...patch.settings } } as Profile;
          applySettings(next.settings);
          return next;
        });
      }
      try {
        const { user: next } = await api<{ user: Profile }>('/api/me', { method: 'PATCH', body: patch });
        if (seq === updateSeq.current) setUser(next);
        return next;
      } catch (e) {
        if (seq === updateSeq.current) void refresh(); // roll back the optimistic change
        throw e;
      }
    },
    [setUser, refresh],
  );

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    clearOffline();
  }, []);

  const value = useMemo(() => ({ user, loading, offline, setUser, refresh, update, logout }), [user, loading, offline, setUser, refresh, update, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setLocale } from '../i18n';
import { api, ApiError, type Profile, type Settings } from './api';
import { applySettings, loadLocalSettings } from './prefs';

interface AuthValue {
  user: Profile | null;
  loading: boolean;
  setUser: (u: Profile | null) => void;
  refresh: () => Promise<void>;
  update: (patch: Partial<Pick<Profile, 'username' | 'locale' | 'timezone' | 'avatar'>> & { settings?: Settings }) => Promise<Profile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((u: Profile | null) => {
    setUserState(u);
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
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    applySettings(loadLocalSettings());
    void refresh();
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
    setUserState(null);
  }, []);

  const value = useMemo(() => ({ user, loading, setUser, refresh, update, logout }), [user, loading, setUser, refresh, update, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

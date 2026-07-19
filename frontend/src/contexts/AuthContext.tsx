'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  currentGoogleSession,
  googleSessionRefreshDelay,
  googleSessionRetryDelayMs,
  GoogleSession,
  isPermanentGoogleAuthError,
  shouldClearGoogleSessionAfterRefreshError,
  signInWithGoogle,
  signOutGoogle,
} from '@/services/auth-service';

type AuthState = { session: GoogleSession | null; loading: boolean; signIn: () => Promise<void>; signOut: () => Promise<void>; };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<GoogleSession | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async (forceRefresh = false, preserveOnTransientError = false) => {
    try {
      const nextSession = await currentGoogleSession({ forceRefresh });
      setSession(nextSession);
      return nextSession;
    }
    catch (error) {
      const permanent = isPermanentGoogleAuthError(error);
      console.error('[Auth] Failed to restore or refresh Google session:', { error, permanent });
      if (shouldClearGoogleSessionAfterRefreshError(error, preserveOnTransientError)) setSession(null);
      throw error;
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let timer: number | undefined;
    let retryAttempt = 0;
    let refreshing = false;

    function schedule(delay: number) {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void renew(); }, delay);
    }

    async function renew() {
      if (cancelled || refreshing) return;
      refreshing = true;
      try {
        await refresh(true, true);
      } catch (error) {
        if (!cancelled && !isPermanentGoogleAuthError(error)) {
          schedule(googleSessionRetryDelayMs(retryAttempt));
          retryAttempt += 1;
        }
      } finally {
        refreshing = false;
      }
    }

    const refreshDelay = googleSessionRefreshDelay(session);
    if (refreshDelay !== null) schedule(refreshDelay);

    const renewIfDue = () => {
      if (googleSessionRefreshDelay(session) === 0) {
        if (timer !== undefined) window.clearTimeout(timer);
        void renew();
      }
    };
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') renewIfDue(); };

    window.addEventListener('focus', renewIfDue);
    window.addEventListener('online', renewIfDue);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', renewIfDue);
      window.removeEventListener('online', renewIfDue);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, refresh]);
  const signIn = useCallback(async () => { setLoading(true); try { setSession(await signInWithGoogle()); } finally { setLoading(false); } }, []);
  const signOut = useCallback(async () => { await signOutGoogle(); setSession(null); }, []);
  return <AuthContext.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value; }

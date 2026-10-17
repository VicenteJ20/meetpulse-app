'use client';

import { desktopCapabilities } from '@/config/capabilities';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  currentGoogleSession,
  expireGoogleSessionForDebug,
  googleSessionRenewalDelay,
  googleSessionRetryDelayMs,
  GoogleSession,
  isGoogleSessionDueForRefresh,
  isPermanentGoogleAuthError,
  peekCachedGoogleSession,
  peekGoogleAuthSession,
  shouldRequestInteractiveReauth,
  signInWithGoogle,
  signOutGoogle,
} from '@/services/auth-service';

type AuthState = {
  session: GoogleSession | null;
  loading: boolean;
  reauthRequired: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<GoogleSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [reauthRequired, setReauthRequired] = useState(false);

  const applySession = useCallback((nextSession: GoogleSession | null) => {
    if (!nextSession) {
      const cached = peekCachedGoogleSession();
      if (cached) {
        setSession(cached);
        return cached;
      }
      setSession(null);
      setReauthRequired(false);
      return null;
    }

    const needsReauth = nextSession.reauthRequired === true;
    setReauthRequired(needsReauth);
    setSession((current) => {
      if (current && (nextSession.stale || needsReauth)) {
        return { ...current, stale: nextSession.stale, reauthRequired: needsReauth };
      }
      return nextSession;
    });
    return nextSession;
  }, []);

  const refresh = useCallback(async (forceRefresh = false) => {
    try {
      const nextSession = await currentGoogleSession({ forceRefresh });
      const applied = applySession(nextSession);
      if (!applied) return null;
      if (applied.stale && !applied.reauthRequired) {
        throw new Error('Google session refresh returned a stale token');
      }
      return applied;
    } catch (error) {
      if (shouldRequestInteractiveReauth(error)) setReauthRequired(true);
      console.error('[Auth] Failed to restore or refresh Google session:', {
        error,
        permanent: isPermanentGoogleAuthError(error),
        hasCachedIdentity: Boolean(peekCachedGoogleSession()),
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  const didRestore = useRef(false);
  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled) { setLoading(false); return; }
    if (didRestore.current) return;
    didRestore.current = true;
    let cancelled = false;
    void (async () => {
      const cached = peekCachedGoogleSession();
      if (!cancelled && cached) applySession(cached);
      try {
        const peeked = await peekGoogleAuthSession();
        if (!cancelled && peeked) applySession(peeked);
      } catch (error) {
        console.error('[Auth] Failed to peek stored Google identity:', error);
      }
      if (!cancelled) await refresh(false).catch(() => undefined);
    })();
    return () => { cancelled = true; };
  }, [applySession, refresh]);

  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled || !session || reauthRequired || session.reauthRequired) return;

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
        await refresh(true);
      } catch (error) {
        if (!cancelled && !shouldRequestInteractiveReauth(error)) {
          schedule(googleSessionRetryDelayMs(retryAttempt));
          retryAttempt += 1;
        }
      } finally {
        refreshing = false;
      }
    }

    const refreshDelay = googleSessionRenewalDelay(session, retryAttempt);
    if (refreshDelay !== null) schedule(refreshDelay);

    const renewIfDue = () => {
      if (isGoogleSessionDueForRefresh(session)) {
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
  }, [session, reauthRequired, refresh]);

  const signIn = useCallback(async () => {
    setLoading(true);
    try {
      const nextSession = await signInWithGoogle();
      setReauthRequired(false);
      setSession(nextSession);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutGoogle();
    setReauthRequired(false);
    setSession(null);
  }, []);

  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled) return;
    const expireNow = async () => {
      const expired = await expireGoogleSessionForDebug();
      applySession({ ...expired, stale: true });
      console.info('[Auth] Debug: local token marked expired. Forcing refresh now.');
      try {
        const next = await refresh(true);
        toast.success('Google session refreshed', { description: next?.email ? `Still signed in as ${next.email}` : 'You stayed inside the app.' });
        return next;
      } catch (error) {
        toast.error('Google session refresh failed', { description: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    };
    (window as Window & { __meetpulseExpireGoogleSession?: typeof expireNow }).__meetpulseExpireGoogleSession = expireNow;
    return () => {
      delete (window as Window & { __meetpulseExpireGoogleSession?: typeof expireNow }).__meetpulseExpireGoogleSession;
    };
  }, [applySession, refresh]);

  return <AuthContext.Provider value={{ session, loading, reauthRequired, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value; }

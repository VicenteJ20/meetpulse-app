'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { currentGoogleSession, GoogleSession, signInWithGoogle, signOutGoogle } from '@/services/auth-service';

type AuthState = { session: GoogleSession | null; loading: boolean; signIn: () => Promise<void>; signOut: () => Promise<void>; };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<GoogleSession | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { try { setSession(await currentGoogleSession()); } finally { setLoading(false); } }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const signIn = useCallback(async () => { setLoading(true); try { setSession(await signInWithGoogle()); } finally { setLoading(false); } }, []);
  const signOut = useCallback(async () => { await signOutGoogle(); setSession(null); }, []);
  return <AuthContext.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value; }

'use client';

import { invoke } from '@tauri-apps/api/core';
import {
  googleSessionRefreshDelayMs,
  isGoogleSessionUsable,
} from './auth-session-policy.mjs';

export {
  isPermanentGoogleAuthError,
  googleSessionRetryDelayMs,
  shouldClearGoogleSessionAfterRefreshError,
} from './auth-session-policy.mjs';

export interface GoogleSession { idToken: string; email: string; name?: string; expiresAt: number; }
let sessionCache: GoogleSession | null | undefined;
let sessionLoad: Promise<GoogleSession | null> | null = null;
let sessionLoadForcesRefresh = false;
let sessionGeneration = 0;

type NativeGoogleSession = GoogleSession & {
  id_token?: string;
  expires_at?: number;
};

function normalizeSession(session: NativeGoogleSession | null): GoogleSession | null {
  if (!session) return null;

  // Tauri normally emits camelCase. Supporting both formats prevents a
  // hot-reloaded renderer from ever constructing an invalid Bearer token.
  const idToken = session.idToken ?? session.id_token;
  if (!idToken) return null;

  return {
    idToken,
    email: session.email,
    name: session.name,
    expiresAt: session.expiresAt ?? session.expires_at ?? 0,
  };
}

function isUsable(session: GoogleSession): boolean {
  return isGoogleSessionUsable(session.expiresAt);
}

export async function currentGoogleSession(options: { forceRefresh?: boolean } = {}): Promise<GoogleSession | null> {
  if (!options.forceRefresh && sessionCache !== undefined && (sessionCache === null || isUsable(sessionCache))) return sessionCache;
  if (sessionLoad) {
    if (!options.forceRefresh || sessionLoadForcesRefresh) return sessionLoad;
    try { await sessionLoad; } catch { /* the forced request below is an independent retry */ }
    return currentGoogleSession({ forceRefresh: true });
  }
  if (!sessionLoad) {
    const generation = sessionGeneration;
    sessionLoadForcesRefresh = options.forceRefresh === true;
    sessionLoad = invoke<NativeGoogleSession | null>('get_google_auth_token', {
      clientId: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET || undefined,
      forceRefresh: options.forceRefresh === true,
    })
      .then(normalizeSession)
      .then((session) => {
        if (generation === sessionGeneration) sessionCache = session;
        return session;
      })
      .finally(() => {
        sessionLoad = null;
        sessionLoadForcesRefresh = false;
      });
  }
  return sessionLoad;
}

export function googleSessionRefreshDelay(session: GoogleSession): number | null {
  return googleSessionRefreshDelayMs(session.expiresAt);
}

export async function signInWithGoogle(): Promise<GoogleSession> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is not configured.');
  const nativeSession = await invoke<NativeGoogleSession>('sign_in_with_google', { clientId, clientSecret: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET || undefined });
  const session = normalizeSession(nativeSession);
  if (!session) throw new Error('Google returned a session without an ID token.');
  sessionGeneration += 1;
  sessionCache = session;
  return session;
}

export async function signOutGoogle(): Promise<void> {
  sessionGeneration += 1;
  await invoke('sign_out_google');
  sessionCache = null;
}

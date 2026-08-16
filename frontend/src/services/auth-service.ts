'use client';

import { invoke } from '@tauri-apps/api/core';
import {
  googleSessionRefreshDelayMs,
  googleSessionRenewalDelayMs,
  isGoogleSessionFresh,
  resolveGoogleSession,
} from './auth-session-policy.mjs';

export {
  isPermanentGoogleAuthError,
  isGoogleSessionDueForRefresh,
  googleSessionRetryDelayMs,
  googleSessionRenewalDelayMs,
  shouldClearGoogleSessionAfterRefreshError,
  shouldRequestInteractiveReauth,
} from './auth-session-policy.mjs';

export interface GoogleSession {
  idToken: string;
  email: string;
  name?: string;
  expiresAt: number;
  stale?: boolean;
  reauthRequired?: boolean;
}

const IDENTITY_STORAGE_KEY = 'meetpulse-google-identity';

let sessionCache: GoogleSession | null | undefined;
let sessionLoad: Promise<GoogleSession | null> | null = null;
let sessionLoadForcesRefresh = false;
let sessionGeneration = 0;

type NativeGoogleSession = GoogleSession & {
  id_token?: string;
  expires_at?: number;
  reauth_required?: boolean;
};

function persistIdentity(session: GoogleSession | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify({
      idToken: session.idToken,
      email: session.email,
      name: session.name,
      expiresAt: session.expiresAt,
      stale: session.stale === true,
      reauthRequired: session.reauthRequired === true,
    }));
  } catch { /* private mode or storage quota should not break auth */ }
}

function readPersistedIdentity(): GoogleSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NativeGoogleSession;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

function rememberSession(session: GoogleSession | null | undefined) {
  if (session) {
    sessionCache = session;
    persistIdentity(session);
    return session;
  }
  return sessionCache ?? readPersistedIdentity();
}

function normalizeSession(session: NativeGoogleSession | null): GoogleSession | null {
  if (!session) return null;

  // Tauri normally emits camelCase. Supporting both formats prevents a
  // hot-reloaded renderer from ever constructing an invalid Bearer token.
  const idToken = session.idToken ?? session.id_token ?? '';
  if (!idToken && !session.email) return null;

  return {
    idToken,
    email: session.email,
    name: session.name,
    expiresAt: session.expiresAt ?? session.expires_at ?? 0,
    stale: session.stale === true,
    reauthRequired: session.reauthRequired === true || session.reauth_required === true,
  };
}

function isUsable(session: GoogleSession): boolean {
  return isGoogleSessionFresh(session);
}

export function peekCachedGoogleSession(): GoogleSession | null {
  if (sessionCache) return sessionCache;
  const persisted = readPersistedIdentity();
  if (persisted) sessionCache = persisted;
  return persisted;
}

export async function peekGoogleAuthSession(): Promise<GoogleSession | null> {
  const nativeSession = await invoke<NativeGoogleSession | null>('peek_google_auth_session');
  const session = normalizeSession(nativeSession);
  return rememberSession(session) ?? session;
}

export async function currentGoogleSession(options: { forceRefresh?: boolean } = {}): Promise<GoogleSession | null> {
  if (!options.forceRefresh && sessionCache !== undefined && (sessionCache === null || isUsable(sessionCache))) return sessionCache;
  if (sessionLoad) {
    if (!options.forceRefresh || sessionLoadForcesRefresh) return sessionLoad;
    try {
      const inFlight = await sessionLoad;
      if (inFlight && isUsable(inFlight)) return inFlight;
    } catch { /* the forced request below is an independent retry */ }
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
        if (generation !== sessionGeneration) return session;
        const resolved = resolveGoogleSession(session, sessionCache ?? readPersistedIdentity());
        if (resolved) {
          sessionCache = resolved;
          persistIdentity(resolved);
        } else if (sessionCache === undefined) {
          sessionCache = null;
        }
        return resolved;
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

export function googleSessionRenewalDelay(session: GoogleSession, retryAttempt = 0): number | null {
  return googleSessionRenewalDelayMs(session, retryAttempt);
}

export async function signInWithGoogle(): Promise<GoogleSession> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is not configured.');
  const nativeSession = await invoke<NativeGoogleSession>('sign_in_with_google', { clientId, clientSecret: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET || undefined });
  const session = normalizeSession(nativeSession);
  if (!session) throw new Error('Google returned a session without an ID token.');
  sessionGeneration += 1;
  sessionCache = session;
  persistIdentity(session);
  return session;
}

export async function signOutGoogle(): Promise<void> {
  sessionGeneration += 1;
  await invoke('sign_out_google');
  sessionCache = null;
  persistIdentity(null);
}

export async function expireGoogleSessionForDebug(): Promise<GoogleSession> {
  const nativeSession = await invoke<NativeGoogleSession>('debug_expire_google_session');
  const session = normalizeSession(nativeSession);
  if (!session) throw new Error('No Google session is stored.');
  sessionCache = session;
  persistIdentity(session);
  return session;
}

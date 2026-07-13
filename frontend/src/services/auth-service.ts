'use client';

import { invoke } from '@tauri-apps/api/core';

export interface GoogleSession { idToken: string; email: string; name?: string; expiresAt: number; }
let sessionCache: GoogleSession | null | undefined;

export async function currentGoogleSession(): Promise<GoogleSession | null> {
  if (sessionCache !== undefined) return sessionCache;
  sessionCache = await invoke<GoogleSession | null>('get_google_auth_token', { clientId: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '', clientSecret: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET || undefined });
  return sessionCache;
}

export async function signInWithGoogle(): Promise<GoogleSession> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is not configured.');
  const session = await invoke<GoogleSession>('sign_in_with_google', { clientId, clientSecret: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET || undefined });
  sessionCache = session;
  return session;
}

export async function signOutGoogle(): Promise<void> { await invoke('sign_out_google'); sessionCache = null; }

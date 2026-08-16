export const REFRESH_SKEW_MS = 60_000;

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 300_000];
const PERMANENT_GOOGLE_AUTH_ERRORS = [
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
  'access_denied',
];

export function isGoogleSessionUsable(expiresAt, currentTime = Date.now()) {
  return Boolean(expiresAt) && expiresAt * 1000 > currentTime + REFRESH_SKEW_MS;
}

export function isGoogleSessionFresh(session, currentTime = Date.now()) {
  return Boolean(session?.idToken) && !session.stale && !session.reauthRequired && isGoogleSessionUsable(session.expiresAt, currentTime);
}

export function googleSessionRefreshDelayMs(expiresAt, currentTime = Date.now()) {
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt * 1000 - currentTime - REFRESH_SKEW_MS);
}

export function googleSessionRetryDelayMs(attempt) {
  const index = Math.min(Math.max(0, attempt), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}

export function isGoogleSessionDueForRefresh(session, currentTime = Date.now()) {
  return Boolean(session) && !session.reauthRequired && (session.stale || !isGoogleSessionUsable(session.expiresAt, currentTime));
}

export function googleSessionRenewalDelayMs(session, retryAttempt = 0, currentTime = Date.now()) {
  if (!session || session.reauthRequired) return null;
  if (isGoogleSessionDueForRefresh(session, currentTime)) return googleSessionRetryDelayMs(retryAttempt);
  return googleSessionRefreshDelayMs(session.expiresAt, currentTime);
}

function errorText(reason) {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === 'string') return reason;
  try { return JSON.stringify(reason); }
  catch { return String(reason); }
}

export function isPermanentGoogleAuthError(reason) {
  const message = errorText(reason).toLowerCase();
  return PERMANENT_GOOGLE_AUTH_ERRORS.some(code => message.includes(code));
}

export function shouldRequestInteractiveReauth(reason) {
  return isPermanentGoogleAuthError(reason);
}

export function shouldClearGoogleSessionAfterRefreshError(_reason, hasStoredIdentity) {
  return !hasStoredIdentity;
}

export function resolveGoogleSession(nativeSession, cachedSession) {
  if (nativeSession) return nativeSession;
  return cachedSession || null;
}

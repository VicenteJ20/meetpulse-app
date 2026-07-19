export const REFRESH_SKEW_MS = 60_000;

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 300_000];
const PERMANENT_GOOGLE_AUTH_ERRORS = [
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
  'access_denied',
];

export function isGoogleSessionUsable(expiresAt, currentTime = Date.now()) {
  return expiresAt === 0 || expiresAt * 1000 > currentTime + REFRESH_SKEW_MS;
}

export function googleSessionRefreshDelayMs(expiresAt, currentTime = Date.now()) {
  if (!expiresAt) return null;
  return Math.max(0, expiresAt * 1000 - currentTime - REFRESH_SKEW_MS);
}

export function googleSessionRetryDelayMs(attempt) {
  const index = Math.min(Math.max(0, attempt), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
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

export function shouldClearGoogleSessionAfterRefreshError(reason, preserveOnTransientError) {
  return !preserveOnTransientError || isPermanentGoogleAuthError(reason);
}

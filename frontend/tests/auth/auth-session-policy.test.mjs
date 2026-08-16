import assert from 'node:assert/strict';
import test from 'node:test';

import {
  googleSessionRefreshDelayMs,
  googleSessionRenewalDelayMs,
  googleSessionRetryDelayMs,
  isGoogleSessionDueForRefresh,
  isGoogleSessionFresh,
  isGoogleSessionUsable,
  isPermanentGoogleAuthError,
  REFRESH_SKEW_MS,
  resolveGoogleSession,
  shouldClearGoogleSessionAfterRefreshError,
  shouldRequestInteractiveReauth,
} from '../../src/services/auth-session-policy.mjs';

const NOW = 1_720_000_000_000;

test('schedules refresh one minute before token expiration', () => {
  const expiresAt = (NOW + 3_600_000) / 1000;
  assert.equal(REFRESH_SKEW_MS, 60_000);
  assert.equal(googleSessionRefreshDelayMs(expiresAt, NOW), 3_540_000);
  assert.equal(isGoogleSessionUsable(expiresAt, NOW), true);
});

test('treats sessions inside the refresh window as due immediately', () => {
  const expiresAt = (NOW + 30_000) / 1000;
  assert.equal(googleSessionRefreshDelayMs(expiresAt, NOW), 0);
  assert.equal(isGoogleSessionUsable(expiresAt, NOW), false);
});

test('does not treat a missing expiry as an immortal session', () => {
  assert.equal(isGoogleSessionUsable(0, NOW), false);
  assert.equal(isGoogleSessionFresh({ expiresAt: 0 }, NOW), false);
  assert.equal(googleSessionRefreshDelayMs(0, NOW), 0);
});

test('uses bounded retry backoff for transient refresh failures', () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, attempt) => googleSessionRetryDelayMs(attempt)),
    [5_000, 15_000, 30_000, 60_000, 300_000, 300_000, 300_000]
  );
});

test('only terminal OAuth responses require interactive sign-in', () => {
  assert.equal(isPermanentGoogleAuthError('Google token exchange failed (400): {"error":"invalid_grant"}'), true);
  assert.equal(isPermanentGoogleAuthError(new Error('invalid_client')), true);
  assert.equal(isPermanentGoogleAuthError(new Error('network request timed out')), false);
  assert.equal(isPermanentGoogleAuthError('The credential vault is temporarily unavailable'), false);
  assert.equal(shouldRequestInteractiveReauth('invalid_grant'), true);
  assert.equal(shouldRequestInteractiveReauth('missing field `id_token`'), false);
});

test('a missing native session does not erase a cached identity', () => {
  const cached = { idToken: 'cached-token', email: 'user@example.com', expiresAt: 1_720_000_000 };
  assert.deepEqual(resolveGoogleSession(null, cached), cached);
  assert.equal(resolveGoogleSession(null, null), null);
  assert.deepEqual(resolveGoogleSession({ ...cached, idToken: 'fresh-token' }, cached), { ...cached, idToken: 'fresh-token' });
});

test('refresh failures keep an existing identity instead of signing out', () => {
  const networkFailure = new Error('network request timed out');
  assert.equal(shouldClearGoogleSessionAfterRefreshError(networkFailure, true), false);
  assert.equal(shouldClearGoogleSessionAfterRefreshError('invalid_grant', true), false);
  assert.equal(shouldClearGoogleSessionAfterRefreshError('invalid_grant', false), true);
});

test('stale or reauth sessions are not usable API credentials', () => {
  const expiresAt = (NOW + 3_600_000) / 1000;
  assert.equal(isGoogleSessionFresh({ idToken: 'token', expiresAt }, NOW), true);
  assert.equal(isGoogleSessionFresh({ expiresAt }, NOW), false);
  assert.equal(isGoogleSessionFresh({ idToken: 'token', expiresAt, stale: true }, NOW), false);
  assert.equal(isGoogleSessionFresh({ idToken: 'token', expiresAt, reauthRequired: true }, NOW), false);
});

test('renewal uses retry backoff when the current token is already due', () => {
  const fresh = { expiresAt: (NOW + 3_600_000) / 1000 };
  const expired = { expiresAt: (NOW + 30_000) / 1000 };
  const stale = { expiresAt: (NOW + 3_600_000) / 1000, stale: true };
  const reauth = { expiresAt: (NOW + 3_600_000) / 1000, reauthRequired: true };

  assert.equal(googleSessionRenewalDelayMs(fresh, 0, NOW), 3_540_000);
  assert.equal(googleSessionRenewalDelayMs(expired, 0, NOW), 5_000);
  assert.equal(googleSessionRenewalDelayMs(stale, 1, NOW), 15_000);
  assert.equal(googleSessionRenewalDelayMs(reauth, 0, NOW), null);
  assert.equal(isGoogleSessionDueForRefresh(expired, NOW), true);
  assert.equal(isGoogleSessionDueForRefresh(stale, NOW), true);
  assert.equal(isGoogleSessionDueForRefresh(fresh, NOW), false);
  assert.equal(isGoogleSessionDueForRefresh(reauth, NOW), false);
});

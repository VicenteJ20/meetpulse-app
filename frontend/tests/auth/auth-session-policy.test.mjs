import assert from 'node:assert/strict';
import test from 'node:test';

import {
  googleSessionRefreshDelayMs,
  googleSessionRetryDelayMs,
  isGoogleSessionUsable,
  isPermanentGoogleAuthError,
  REFRESH_SKEW_MS,
  shouldClearGoogleSessionAfterRefreshError,
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
});

test('transient refresh failures preserve an active session', () => {
  const networkFailure = new Error('network request timed out');
  assert.equal(shouldClearGoogleSessionAfterRefreshError(networkFailure, true), false);
  assert.equal(shouldClearGoogleSessionAfterRefreshError(networkFailure, false), true);
  assert.equal(shouldClearGoogleSessionAfterRefreshError('invalid_grant', true), true);
});

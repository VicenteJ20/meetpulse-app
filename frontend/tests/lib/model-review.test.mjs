import assert from 'node:assert/strict';
import test from 'node:test';
import { complianceMark, formatHourlyPrice, formatTokenPrice, reviewLabel, reviewStatus } from '../../src/lib/model-review-format.mjs';

test('token prices are shown per million and audio prices per hour', () => {
  assert.equal(formatTokenPrice('0.000002'), '$2.00');
  assert.equal(formatTokenPrice('0.000012'), '$12.00');
  assert.equal(formatTokenPrice('0'), '$0');
  assert.equal(formatTokenPrice(''), '');
  assert.equal(formatHourlyPrice('0.00002778'), '$0.10');
  assert.equal(formatHourlyPrice('0.0001'), '$0.36');
});

test('compliance has three states and unknown values stay empty', () => {
  assert.equal(complianceMark('all'), 'check');
  assert.equal(complianceMark('some'), 'partial');
  assert.equal(complianceMark('none'), 'empty');
  assert.equal(complianceMark('yes'), 'empty');
  assert.equal(complianceMark(undefined), 'empty');
});

test('a missing review is Not tested and a present one is tested with task flags', () => {
  assert.equal(reviewLabel(undefined), 'Not tested');
  assert.equal(reviewLabel(null, 'es'), 'Sin probar');
  const present = { transcription: true, analysis: false, chat: true };
  assert.equal(reviewLabel(present), 'Tested');
  assert.equal(reviewLabel(present, 'es'), 'Probado');
  assert.deepEqual(reviewStatus(present), {
    tested: true,
    transcription: true,
    analysis: false,
    chat: true,
  });
  assert.equal(reviewStatus(undefined).tested, false);
});

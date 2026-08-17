import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidWikiId, slugifyWikiId, withMeetingFrontMatter } from '../../src/lib/wiki-slug.ts';
import { resolvePreferredTenantId } from '../../src/services/wiki-config.ts';

test('slugifyWikiId matches the wiki identifier alphabet', () => {
  assert.equal(slugifyWikiId('Acme Studio'), 'acme-studio');
  assert.equal(slugifyWikiId('Niño Pérez'), 'nino-perez');
  assert.equal(slugifyWikiId('  hello_world  '), 'hello_world');
  assert.equal(slugifyWikiId('???'), '');
});

test('isValidWikiId rejects free-text labels', () => {
  assert.equal(isValidWikiId('acme-studio'), true);
  assert.equal(isValidWikiId('Acme Studio'), false);
  assert.equal(isValidWikiId(''), false);
});

test('resolvePreferredTenantId uses the only tenant or a still-valid saved one', () => {
  assert.equal(resolvePreferredTenantId([]), '');
  assert.equal(resolvePreferredTenantId([{ tenant_id: 'solo' }], 'other'), 'solo');
  assert.equal(
    resolvePreferredTenantId([{ tenant_id: 'acme' }, { tenant_id: 'beta' }], 'beta'),
    'beta',
  );
  assert.equal(
    resolvePreferredTenantId([{ tenant_id: 'acme' }, { tenant_id: 'beta' }], 'gone'),
    'acme',
  );
});

test('withMeetingFrontMatter adds meeting_id without duplicating it', () => {
  assert.equal(
    withMeetingFrontMatter('# Body\n', 'meeting-1'),
    '---\nmeeting_id: meeting-1\n---\n\n# Body\n'
  );
  assert.equal(
    withMeetingFrontMatter('---\ntitle: Existing\n---\n\n# Body\n', 'meeting-1'),
    '---\nmeeting_id: meeting-1\ntitle: Existing\n---\n\n# Body\n'
  );
  assert.equal(
    withMeetingFrontMatter('---\nmeeting_id: meeting-1\n---\n\n# Body\n', 'meeting-1'),
    '---\nmeeting_id: meeting-1\n---\n\n# Body\n'
  );
});

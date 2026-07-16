import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const catalogUrl = new URL('../../src/i18n/catalogs.ts', import.meta.url);

function keysFromObject(source, objectName) {
  const start = source.indexOf(`export const ${objectName}`);
  const end = objectName === 'en' ? source.indexOf('export type TranslationKey') : source.indexOf('export const catalogs');
  assert.notEqual(start, -1, `${objectName} catalog was not found`);
  return new Set([...source.slice(start, end).matchAll(/^\s*'([^']+)':/gm)].map(match => match[1]));
}

test('English and Spanish UI catalogs contain the same keys', async () => {
  const source = await readFile(catalogUrl, 'utf8');
  const english = keysFromObject(source, 'en');
  const spanish = keysFromObject(source, 'es');
  assert.deepEqual([...spanish].sort(), [...english].sort());
});

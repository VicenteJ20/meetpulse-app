import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const root = new URL('../../src/', import.meta.url);
async function loadApi(enabled) {
  const policy = ts.transpileModule(await readFile(new URL('config/capabilities.ts', root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const policyUrl = moduleUrl(enabled ? policy.replace('wikiEnabled: false', 'wikiEnabled: true') : policy);
  const auth = moduleUrl('export async function currentGoogleSession(){ globalThis.__wikiAuthCalls++; return {idToken:"test"}; }');
  const config = moduleUrl('export function getWikiConfig(){return {baseUrl:"https://example.invalid",tenantId:"test"};}');
  const source = ts.transpileModule(await readFile(new URL('services/wiki-api.ts', root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
    .replaceAll("'@/config/capabilities'", JSON.stringify(policyUrl))
    .replaceAll("'./auth-service'", JSON.stringify(auth))
    .replaceAll("'./wiki-config'", JSON.stringify(config));
  return import(moduleUrl(source));
}
test('disabled Wiki rejects account and content requests before auth or HTTP', async () => {
  const original = globalThis.fetch;
  globalThis.__wikiAuthCalls = 0; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected HTTP'); };
  try {
    const { WikiApi, listWikiTenants } = await loadApi(false);
    await assert.rejects(listWikiTenants(), /disabled/);
    await assert.rejects(new WikiApi({ baseUrl: 'https://example.invalid', tenantId: 't' }).summary(), /disabled/);
    assert.equal(globalThis.__wikiAuthCalls, 0); assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
test('the same Wiki client remains usable when capability is enabled', async () => {
  const original = globalThis.fetch;
  globalThis.__wikiAuthCalls = 0;
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ client_count: 3 }) });
  try {
    const { WikiApi } = await loadApi(true);
    assert.equal((await new WikiApi({ baseUrl: 'https://example.invalid', tenantId: 't' }).summary()).client_count, 3);
    assert.equal(globalThis.__wikiAuthCalls, 1);
  } finally { globalThis.fetch = original; }
});

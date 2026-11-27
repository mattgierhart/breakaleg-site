// @verifies CONTRACT.md section 6 (internal tool). Command logic runs against an in-memory store;
// the --local wiring is checked with a recording exec, and scripts/e2e.mjs runs it for real through wrangler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MemoryStore, CloudflareStore, WranglerLocalStore, UsageError, mint, update, end, revoke, info, run, parseArgs, makeStore, parseScript, endOfDay,
} from '../tools/castpack.mjs';
import { handleShowApi } from '../functions/_lib/lookup.js';
import { normaliseCode } from '../functions/_lib/code.js';
import { SCRIPT } from './helpers/fake-kv.mjs';

const scriptText = JSON.stringify(SCRIPT);
const NOW = new Date('2026-12-01T10:00:00.000Z');
const fetchCode = async (store, code) => handleShowApi(new Request('https://x/api/show/' + code), code, { SHOWS: store });

test('mint: writes the four contract keys and the show is fetchable', async () => {
  const store = new MemoryStore();
  const r = await mint(store, { name: ' The Lighthouse Cat ', partner: 'KidStage', scriptText, ends: '2027-03-31' }, { now: NOW });
  assert.equal(normaliseCode(r.code), r.code);
  assert.equal(r.link, `https://break-a-leg.app/show/${r.code}`);
  assert.match(r.display, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const id = await store.get(`code:${r.code}`);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.notEqual(id, r.code, 'showId is separate from the code');
  assert.deepEqual(JSON.parse(await store.get(`show:${id}`)), {
    id, name: 'The Lighthouse Cat', partner: 'KidStage', code: r.code, version: 1,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), endsAt: '2027-03-31T23:59:59.999Z', revoked: false,
  });
  assert.equal(await store.get(`script:${id}`), scriptText);
  assert.equal(await store.get(`count:${id}`), '0');
  const res = await fetchCode(store, r.code);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).script, SCRIPT);
});

test('mint: no end date, no partner, retries on a code collision', async () => {
  const store = new MemoryStore();
  await store.put('code:22222222', 'taken');
  const codes = ['22222222', 'ZZZZZZZ5'];
  const r = await mint(store, { name: 'Show', scriptText }, { now: NOW, makeCode: () => codes.shift() });
  assert.equal(r.code, 'ZZZZZZZ5');
  assert.equal(r.show.endsAt, null);
  assert.equal(r.show.partner, '');
  assert.equal(await store.get('code:22222222'), 'taken');
});

test('mint: rejects a missing name, bad JSON, wrong format, non-numeric formatVersion, bad --ends', async () => {
  const store = new MemoryStore();
  await assert.rejects(mint(store, { name: '', scriptText }), UsageError);
  await assert.rejects(mint(store, { name: 'x', scriptText: 'nope' }), /not valid JSON/);
  await assert.rejects(mint(store, { name: 'x', scriptText: '{"format":"other","formatVersion":1}' }), /breakaleg-script/);
  await assert.rejects(mint(store, { name: 'x', scriptText: '{"format":"breakaleg-script","formatVersion":"1"}' }), /formatVersion/);
  await assert.rejects(mint(store, { name: 'x', scriptText, ends: '31/03/2027' }), /--ends/);
  await assert.rejects(mint(store, { name: 'x', scriptText, ends: '2027-13-45' }), /--ends/);
  assert.equal(store.map.size, 0, 'nothing is written when validation fails');
});

test('parseScript keeps the document as is (BOM and outer whitespace aside)', () => {
  assert.equal(parseScript(`﻿  ${scriptText}\n`), scriptText);
  assert.equal(endOfDay('2027-03-31'), '2027-03-31T23:59:59.999Z');
});

test('update: bumps version, replaces the script, keeps the code', async () => {
  const store = new MemoryStore();
  const { code, show } = await mint(store, { name: 'Show', scriptText }, { now: NOW });
  const newer = JSON.stringify({ ...SCRIPT, title: 'Second draft' });
  const later = new Date('2026-12-05T00:00:00.000Z');
  const u = await update(store, { code: code.toLowerCase(), scriptText: newer }, { now: later });
  assert.equal(u.show.version, 2);
  assert.equal(u.show.updatedAt, later.toISOString());
  assert.equal(u.show.createdAt, NOW.toISOString());
  assert.equal((await (await fetchCode(store, code)).json()).script.title, 'Second draft');
  assert.equal((await (await fetchCode(store, code)).json()).show.version, 2);
  assert.equal(await store.get(`code:${code}`), show.id);
  await assert.rejects(update(store, { code, scriptText: '{}' }), UsageError);
  await assert.rejects(update(store, { code: 'ABCDEFGV', scriptText: newer }), /No show has the code/);
  await assert.rejects(update(store, { code: 'nonsense', scriptText: newer }), /not a valid show code/);
});

test('end: the code returns 410 from now on', async () => {
  const store = new MemoryStore();
  const { code } = await mint(store, { name: 'Show', scriptText });
  assert.equal((await fetchCode(store, code)).status, 200);
  const r = await end(store, { code }, { now: new Date(Date.now() - 1000) });
  assert.ok(r.show.endsAt);
  assert.equal((await fetchCode(store, code)).status, 410);
});

test('revoke: the code returns 404 from now on', async () => {
  const store = new MemoryStore();
  const { code } = await mint(store, { name: 'Show', scriptText });
  await revoke(store, { code });
  assert.equal((await fetchCode(store, code)).status, 404);
  assert.equal((await info(store, { code })).status, 'revoked');
});

test('info: shows status and download count', async () => {
  const store = new MemoryStore();
  const { code, show } = await mint(store, { name: 'Show', partner: 'P', scriptText, ends: '2027-03-31' }, { now: NOW });
  let i = await info(store, { code }, { now: NOW });
  assert.equal(i.count, 0);
  assert.equal(i.status, 'live');
  await store.put(`count:${show.id}`, '17');
  i = await info(store, { code }, { now: new Date('2027-04-01T00:00:00Z') });
  assert.equal(i.count, 17);
  assert.equal(i.status, 'ended');
  assert.equal(i.link, `https://break-a-leg.app/show/${code}`);
});

test('run: command line end to end with files and printed output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'castpack-test-'));
  try {
    const file = join(dir, 'show.breakaleg');
    await writeFile(file, scriptText);
    const store = new MemoryStore();
    const lines = [];
    const out = (s) => lines.push(s);
    const minted = await run(['mint', '--name', 'The Lighthouse Cat', '--partner', 'KidStage', '--script', file, '--ends', '2027-03-31'], { store, out });
    assert.match(lines[0], /Minted\./);
    assert.ok(lines[0].includes(minted.link));
    await run(['update', '--code', minted.display, '--script', file], { store, out });
    assert.match(lines[1], /version 2/);
    await run(['info', '--code', minted.code], { store, out });
    assert.match(lines[2], /Downloads: 0/);
    await run(['end', '--code', minted.code], { store, out });
    await run(['revoke', '--code', minted.code], { store, out });
    assert.match(lines[4], /Revoked/);
    await assert.rejects(run(['bogus'], { store, out }), UsageError);
    await assert.rejects(run(['mint', '--name', 'x'], { store, out }), /--script/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parseArgs rejects stray words and flags without values', () => {
  assert.deepEqual(parseArgs(['info', '--code', 'X', '--local', 'd']), { command: 'info', flags: { code: 'X', local: 'd' } });
  assert.throws(() => parseArgs(['info', 'oops']), UsageError);
  assert.throws(() => parseArgs(['info', '--code']), UsageError);
  assert.throws(() => parseArgs(['info', '--code', '--local', 'd']), UsageError);
});

test('--local picks the wrangler store; otherwise credentials come from the environment only', () => {
  assert.ok(makeStore({ local: '.wrangler/state' }, {}) instanceof WranglerLocalStore);
  assert.throws(() => makeStore({}, {}), /CLOUDFLARE_API_TOKEN/);
  assert.ok(makeStore({}, { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a', SHOWS_KV_NAMESPACE_ID: 'n' }) instanceof CloudflareStore);
});

test('WranglerLocalStore: put and get go through `wrangler kv key ... --local --persist-to`', async () => {
  const calls = [];
  const store = new WranglerLocalStore({
    dir: '/state', wranglerBin: '/w.js',
    exec: async (file, args) => { calls.push(args); return { stdout: args.includes('get') ? 'value\n' : '', stderr: '' }; },
  });
  await store.put('code:AAA', 'x');
  assert.equal(await store.get('code:AAA'), 'value');
  assert.deepEqual(calls[0].slice(0, 5), ['/w.js', 'kv', 'key', 'put', 'code:AAA']);
  for (const a of calls) {
    assert.ok(a.includes('--local'));
    assert.equal(a[a.indexOf('--persist-to') + 1], '/state');
    assert.equal(a[a.indexOf('--namespace-id') + 1], 'SHOWS');
  }
  const missing = new WranglerLocalStore({ dir: '/s', exec: async () => ({ stdout: 'Value not found\n', stderr: '' }) });
  assert.equal(await missing.get('k'), null);
});

test('CloudflareStore: REST calls carry the bearer token and nothing else secret-looking leaks into URLs', async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, init });
    if (init.method === 'PUT') return new Response('{}', { status: 200 });
    return url.endsWith('missing') ? new Response('nope', { status: 404 }) : new Response('hello', { status: 200 });
  };
  const s = new CloudflareStore({ token: 'T0KEN', accountId: 'acc', namespaceId: 'ns', fetchImpl });
  await s.put('code:ABC', 'id1');
  assert.equal(await s.get('code:ABC'), 'hello');
  assert.equal(await s.get('missing'), null);
  assert.equal(seen[0].url, 'https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/values/code%3AABC');
  assert.equal(seen[0].init.method, 'PUT');
  assert.equal(seen[0].init.body, 'id1');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer T0KEN');
  assert.ok(!seen.some((c) => c.url.includes('T0KEN')));
  const bad = new CloudflareStore({ token: 't', accountId: 'a', namespaceId: 'n', fetchImpl: async () => new Response('', { status: 500 }) });
  await assert.rejects(bad.get('k'), /HTTP 500/);
  await assert.rejects(bad.put('k', 'v'), /HTTP 500/);
});

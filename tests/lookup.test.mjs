// @verifies CONTRACT.md section 3 (GET /api/show/<CODE>)
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleShowApi, lookupShow } from '../functions/_lib/lookup.js';
import { FakeKV, SCRIPT, seededKV } from './helpers/fake-kv.mjs';

const get = (code, kv, ctx) =>
  handleShowApi(new Request(`https://break-a-leg.app/api/show/${code}`), code, { SHOWS: kv }, ctx);

function collect() {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), settle: () => Promise.all(pending) };
}

async function assertJsonError(res, status, error) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { error });
}

test('200: envelope, show, script as stored, headers', async () => {
  const kv = seededKV();
  const res = await get('7Q4MXN98', kv);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('set-cookie'), null);
  const body = await res.json();
  assert.deepEqual(body, { envelope: 1, show: { name: 'The Lighthouse Cat', partner: 'KidStage', version: 3 }, script: SCRIPT });
  assert.deepEqual(Object.keys(body), ['envelope', 'show', 'script']);
});

test('200: script text is returned as stored, not re-encoded', async () => {
  const text = '{"format":"breakaleg-script","formatVersion":1,"big":12345678901234567890,"z":"\\u00e9"}';
  const res = await get('7Q4MXN98', seededKV({ script: text }));
  assert.ok((await res.text()).endsWith(`"script":${text}}`));
});

test('200: empty partner is an empty string; show record fields beyond the contract are not leaked', async () => {
  const kv = seededKV({ show: { partner: '', code: '7Q4MXN98', endsAt: '2099-01-01T00:00:00Z' } });
  const body = await (await get('7Q4MXN98', kv)).json();
  assert.deepEqual(body.show, { name: 'The Lighthouse Cat', partner: '', version: 3 });
});

for (const form of ['7Q4MXN98', '7q4mxn98', '7Q4M-XN98', '7q4m-xn98', '7Q4M%20XN98', '7q4m%2Dxn98']) {
  test(`normalised path form ${form}`, async () => {
    const res = await get(form, seededKV());
    assert.equal(res.status, 200);
  });
}

test('404 not_found: malformed codes (too short, too long, bad characters, empty)', async () => {
  for (const bad of ['ABC', '7Q4MXN9', '7Q4MXN988', '7Q4MXN0O', 'ABCDIEFG', '']) {
    await assertJsonError(await get(bad, seededKV()), 404, 'not_found');
  }
});

test('404 not_found: bad check character', async () => {
  await assertJsonError(await get('7Q4MXN92', seededKV()), 404, 'not_found');
});

test('404 not_found: valid but unknown code', async () => {
  await assertJsonError(await get('ABCDEFGV', seededKV()), 404, 'not_found');
});

test('404 not_found: revoked show (not 410, so it looks like an unknown code)', async () => {
  await assertJsonError(await get('7Q4MXN98', seededKV({ show: { revoked: true } })), 404, 'not_found');
});

test('404 not_found: broken percent-encoding', async () => {
  const res = await handleShowApi(new Request('https://break-a-leg.app/api/show/x'), '%E0%A4%A', { SHOWS: seededKV() });
  await assertJsonError(res, 404, 'not_found');
});

test('410 ended: past endsAt', async () => {
  const kv = seededKV({ show: { endsAt: '2020-01-01T00:00:00.000Z' } });
  await assertJsonError(await get('7Q4MXN98', kv), 410, 'ended');
});

test('endsAt in the future is still 200, and an end exactly now is 410', async () => {
  const kv = seededKV({ show: { endsAt: '2030-01-01T00:00:00.000Z' } });
  assert.equal((await get('7Q4MXN98', kv)).status, 200);
  const at = new Date('2030-01-01T00:00:00.000Z');
  assert.equal((await lookupShow(kv, '7Q4MXN98', { now: at })).status, 410);
  assert.equal((await lookupShow(kv, '7Q4MXN98', { now: new Date(at - 1) })).status, 200);
});

test('revoked wins over ended', async () => {
  const kv = seededKV({ show: { revoked: true, endsAt: '2020-01-01T00:00:00.000Z' } });
  await assertJsonError(await get('7Q4MXN98', kv), 404, 'not_found');
});

test('405 for every other method, with Allow: GET', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
    const res = await handleShowApi(new Request('https://break-a-leg.app/api/show/7Q4MXN98', { method }), '7Q4MXN98', { SHOWS: seededKV() });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'GET');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    if (method !== 'HEAD') assert.deepEqual(await res.json(), { error: 'method_not_allowed' });
  }
});

test('missing script for a known show is a 500, not a 404', async () => {
  const kv = seededKV();
  kv.map.delete('script:a1b2c3d4e5f60718');
  await assertJsonError(await get('7Q4MXN98', kv), 500, 'unavailable');
});

test('KV read failure is a JSON 500 with no-store', async () => {
  const kv = seededKV();
  kv.failGet = true;
  await assertJsonError(await get('7Q4MXN98', kv), 500, 'unavailable');
});

test('counter: each download adds one, using waitUntil', async () => {
  const kv = seededKV();
  const ctx = collect();
  await get('7Q4MXN98', kv, ctx);
  await get('7q4m-xn98', kv, ctx);
  await ctx.settle();
  assert.equal(kv.map.get('count:a1b2c3d4e5f60718'), '6');
});

test('counter: starts from nothing, and ignores junk', async () => {
  const kv = seededKV();
  kv.map.delete('count:a1b2c3d4e5f60718');
  const ctx = collect();
  await get('7Q4MXN98', kv, ctx);
  await ctx.settle();
  assert.equal(kv.map.get('count:a1b2c3d4e5f60718'), '1');
  kv.map.set('count:a1b2c3d4e5f60718', 'not a number');
  await get('7Q4MXN98', kv, ctx);
  await ctx.settle();
  assert.equal(kv.map.get('count:a1b2c3d4e5f60718'), '1');
});

test('counter failure does not fail or slow the download', async () => {
  const kv = seededKV();
  kv.failPut = true;
  const ctx = collect();
  const res = await get('7Q4MXN98', kv, ctx);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).envelope, 1);
  await ctx.settle(); // the counter promise never rejects
});

test('counter is not touched for errors', async () => {
  const kv = seededKV({ show: { revoked: true } });
  const ctx = collect();
  await get('7Q4MXN98', kv, ctx);
  await ctx.settle();
  assert.deepEqual(kv.puts, []);
});

test('privacy: the only write is the counter, and nothing from the request is stored', async () => {
  const kv = seededKV();
  const ctx = collect();
  const req = new Request('https://break-a-leg.app/api/show/7Q4MXN98', {
    headers: { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'BreakALeg/1.1', Accept: 'application/json', Cookie: 'a=b' },
  });
  const res = await handleShowApi(req, '7Q4MXN98', { SHOWS: kv }, ctx);
  await ctx.settle();
  assert.deepEqual(kv.puts, ['count:a1b2c3d4e5f60718']);
  assert.ok(![...kv.map.values()].some((v) => v.includes('203.0.113.9') || v.includes('BreakALeg')));
  assert.equal(res.headers.get('set-cookie'), null);
});

test('missing KV binding is a JSON 500', async () => {
  const res = await handleShowApi(new Request('https://break-a-leg.app/api/show/7Q4MXN98'), '7Q4MXN98', {});
  await assertJsonError(res, 500, 'unavailable');
});

test('empty KV: unknown code is 404', async () => {
  await assertJsonError(await get('7Q4MXN98', new FakeKV()), 404, 'not_found');
});

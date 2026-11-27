// @verifies CONTRACT.md sections 4 and 5: AASA, link page, route guard, checkout pages and the privacy copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AASA, aasaResponse } from '../functions/_lib/aasa.js';
import { renderShowPage, handleShowPage, codeFromPath } from '../functions/_lib/show-page.js';
import { isBlockedPath } from '../functions/_lib/guard.js';
import { onRequest as aasaRoute } from '../functions/.well-known/apple-app-site-association.js';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('AASA content is exactly the contract', async () => {
  assert.deepEqual(AASA, {
    applinks: { details: [{ appIDs: ['GHUN5FZ4NP.com.gearheart.breakaleg'], components: [{ '/': '/show/*' }] }] },
  });
  const res = aasaResponse();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.deepEqual(await res.json(), AASA);
});

test('AASA route: GET and HEAD answer directly (no redirect), other methods 405', async () => {
  const url = 'https://break-a-leg.app/.well-known/apple-app-site-association';
  const ok = await aasaRoute({ request: new Request(url) });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('location'), null);
  assert.equal((await aasaRoute({ request: new Request(url, { method: 'HEAD' }) })).status, 200);
  assert.equal((await aasaRoute({ request: new Request(url, { method: 'POST' }) })).status, 405);
});

test('link page: valid code shows in display form with both steps and the App Store button', () => {
  const html = renderShowPage('7Q4MXN98');
  assert.match(html, />7Q4M-XN98</);
  assert.match(html, /Open on your iPad/);
  assert.match(html, /Get the app/);
  assert.match(html, /Tap the link again/);
  assert.match(html, /Have a show code\?/);
  assert.match(html, /href="https:\/\/apps\.apple\.com\/app\/id6834977811"/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(!/<script/i.test(html), 'no scripts, so no tracking');
  assert.ok(!/src="https?:/i.test(html));
});

test('link page: malformed code shows the gentle state and no code', () => {
  const html = renderShowPage(null);
  assert.match(html, /Check the link with your director/);
  assert.ok(!/show-code/.test(html));
  assert.match(html, /noindex/);
});

test('link page: codeFromPath for every shape under /show/', () => {
  assert.equal(codeFromPath('/show/7Q4MXN98'), '7Q4MXN98');
  assert.equal(codeFromPath('/show/7q4m-xn98/'), '7Q4MXN98');
  assert.equal(codeFromPath('/show/7Q4M%20XN98'), '7Q4MXN98');
  assert.equal(codeFromPath('/show/https%3A%2F%2Fbreak-a-leg.app%2Fshow%2F7Q4MXN98'), '7Q4MXN98');
  for (const bad of ['/show', '/show/', '/show/bad', '/show/7Q4MXN92', '/show/%E0%A4%A', '/show/<script>']) {
    assert.equal(codeFromPath(bad), null, bad);
  }
});

test('link page: no lookup, headers, noindex, nothing injected', async () => {
  const res = handleShowPage(new Request('https://break-a-leg.app/show/7Q4MXN98'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  assert.equal(res.headers.get('set-cookie'), null);
  const evil = handleShowPage(new Request('https://break-a-leg.app/show/%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E'));
  const html = await evil.text();
  assert.equal(evil.status, 200);
  assert.ok(!html.includes('alert(1)'));
  assert.equal(handleShowPage(new Request('https://break-a-leg.app/show/x', { method: 'POST' })).status, 405);
  assert.equal(await handleShowPage(new Request('https://break-a-leg.app/show/x', { method: 'HEAD' })).text(), '');
});

test('route guard blocks repo plumbing and nothing else', () => {
  for (const p of ['/tools/castpack.mjs', '/tests/fixtures/code-vectors.json', '/functions/_lib/code.js', '/package.json',
    '/package-lock.json', '/wrangler.toml', '/node_modules/wrangler/package.json', '/.github/workflows/test.yml', '/TOOLS/x', '/tools']) {
    assert.equal(isBlockedPath(p), true, p);
  }
  for (const p of ['/', '/privacy/', '/support/', '/cast-pack/', '/cast-pack/thanks/', '/assets/landing.css', '/show/7Q4MXN98',
    '/toolsy', '/.well-known/apple-app-site-association', '/api/show/x']) {
    assert.equal(isBlockedPath(p), false, p);
  }
});

test('_routes.json sends the guarded paths through the Functions', async () => {
  const { include } = JSON.parse(await read('_routes.json'));
  for (const p of ['/api/*', '/show', '/show/*', '/.well-known/*', '/tools/*', '/tests/*', '/functions/*', '/package.json', '/package-lock.json']) {
    assert.ok(include.includes(p), p);
  }
});

test('Cast Pack order page: price, rights line, one primary button, email fallback, no Stripe script', async () => {
  const html = await read('cast-pack/index.html');
  assert.match(html, /\$19<\/b> a show/);
  assert.match(html, /Any cast size/);
  assert.match(html, /Cast Packs are for scripts you have the right to share with your cast as digital copies\./);
  assert.match(html, /href="mailto:developer@gearheartai\.org\?subject=Cast%20Pack%20for%20our%20show"/);
  assert.match(html, /var CHECKOUT_URL = "";/);
  assert.equal((html.match(/class="btn btn-primary"/g) || []).length, 1);
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external or third-party scripts');
  assert.ok(!/js\.stripe\.com/.test(html));
  assert.ok(!/<input|<form/i.test(html), 'no card fields');
});

test('Cast Pack thanks page: noindex and the four next steps', async () => {
  const html = await read('cast-pack/thanks/index.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /developer@gearheartai\.org/);
  for (const t of ['Email us your script', 'We set it up', 'usually within one working day', 'check it on your iPad', 'forward one link', 'show name', 'group name', 'closing date']) {
    assert.match(html, new RegExp(t, 'i'), t);
  }
});

test('directors section points at /cast-pack/, and the old "no server" claim is gone', async () => {
  const index = await read('index.html');
  const privacy = await read('privacy/index.html');
  assert.match(index, /<a class="btn btn-primary" href="cast-pack\/">/);
  for (const html of [index, privacy]) {
    assert.ok(!/don't run a server|do not run a server/i.test(html));
    assert.match(html, /show code/i);
    assert.match(html, /Stripe/);
    assert.match(html, /IP addresses/);
  }
});

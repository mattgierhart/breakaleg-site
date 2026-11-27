#!/usr/bin/env node
// End-to-end check against a real local server: wrangler pages dev + KV, a show minted with tools/castpack.mjs --local, and curl.
//
//   npm run e2e                              uses a small stand-in script
//   npm run e2e -- --script path/to/real.breakaleg   same checks with a real script file
//   npm run e2e -- --keep                    leave the local KV state in .wrangler/e2e-state afterwards
//
// The server is always stopped when the run ends. Needs curl and `npm install` (wrangler is a devDependency).

import { spawn, execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const port = Number(arg('--port') ?? process.env.E2E_PORT ?? 8799);
const base = `http://127.0.0.1:${port}`;
const state = join(root, '.wrangler', 'e2e-state');

const results = [];
let failures = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { results.push(`ok   ${name}`); },
    (err) => { failures++; results.push(`FAIL ${name}\n       ${err.message.split('\n').join('\n       ')}`); },
  );
}

async function curl(path, extra = []) {
  const { stdout } = await run('curl', ['-s', '-i', '--noproxy', '*', ...extra, base + path], { maxBuffer: 16 * 1024 * 1024 });
  const cut = stdout.indexOf('\r\n\r\n');
  const lines = stdout.slice(0, cut).split('\r\n');
  const status = Number(lines[0].split(' ')[1]);
  const headers = Object.fromEntries(lines.slice(1).map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
  return { status, headers, body: stdout.slice(cut + 4) };
}

const tool = (...a) => run(process.execPath, [join(root, 'tools', 'castpack.mjs'), ...a, '--local', state], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), 'castpack-e2e-'));
  let scriptFile = arg('--script');
  if (!scriptFile) {
    scriptFile = join(tmp, 'stand-in.breakaleg');
    await writeFile(scriptFile, JSON.stringify({ format: 'breakaleg-script', formatVersion: 1, title: 'Stand-in', lineageID: 'e2e', history: [] }));
  }
  const scriptDoc = JSON.parse(await readFile(scriptFile, 'utf8'));
  await rm(state, { recursive: true, force: true });

  const server = spawn(process.execPath, [join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'pages', 'dev', '.', '--kv', 'SHOWS',
    '--persist-to', state, '--port', String(port), '--ip', '127.0.0.1', '--compatibility-date', '2024-09-23'],
  { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { up = (await fetch(base + '/', { signal: AbortSignal.timeout(1000) })).ok; } catch { await new Promise((r) => setTimeout(r, 1000)); }
    }
    if (!up) throw new Error(`dev server did not start on ${base}\n${log.slice(-2000)}`);
    console.log(`dev server up on ${base}`);

    const minted = await tool('mint', '--name', 'The Lighthouse Cat', '--partner', 'KidStage', '--script', scriptFile, '--ends', '2099-12-31');
    const code = /Code:\s+([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(minted.stdout)[1].replace('-', '');
    console.log(`minted ${code}`);

    await check('GET /api/show/<CODE> is 200 JSON no-store with the script', async () => {
      const r = await curl(`/api/show/${code}`, ['-H', 'Accept: application/json']);
      assert.equal(r.status, 200);
      assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
      assert.equal(r.headers['cache-control'], 'no-store');
      const body = JSON.parse(r.body);
      assert.equal(body.envelope, 1);
      assert.deepEqual(body.show, { name: 'The Lighthouse Cat', partner: 'KidStage', version: 1 });
      assert.deepEqual(body.script, scriptDoc);
    });
    await check('lowercase and dashed forms are normalised', async () => {
      const dashed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
      assert.equal((await curl(`/api/show/${dashed}`)).status, 200);
    });
    await check('malformed, bad check character and unknown codes are 404 not_found', async () => {
      for (const bad of ['bad', '7Q4MXN92', 'ABCDEFGV']) {
        const r = await curl(`/api/show/${bad}`);
        assert.equal(r.status, 404, bad);
        assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(JSON.parse(r.body), { error: 'not_found' });
      }
    });
    await check('POST is 405', async () => {
      const r = await curl(`/api/show/${code}`, ['-X', 'POST']);
      assert.equal(r.status, 405);
      assert.equal(r.headers.allow, 'GET');
    });
    await check('GET /show/<CODE> is the HTML link page with the code, noindex', async () => {
      const r = await curl(`/show/${code}`);
      assert.equal(r.status, 200);
      assert.match(r.headers['content-type'], /^text\/html/);
      assert.match(r.headers['x-robots-tag'], /noindex/);
      assert.ok(r.body.includes(`${code.slice(0, 4)}-${code.slice(4)}`));
      assert.match(r.body, /apps\.apple\.com\/app\/id6834977811/);
    });
    await check('GET /show/bad is the gentle state and has no code', async () => {
      const r = await curl('/show/bad');
      assert.equal(r.status, 200);
      assert.match(r.body, /Check the link with your director/);
      assert.ok(!r.body.includes('show-code'));
    });
    await check('AASA is 200 application/json with no redirect', async () => {
      const r = await curl('/.well-known/apple-app-site-association');
      assert.equal(r.status, 200);
      assert.equal(r.headers['content-type'], 'application/json');
      assert.equal(r.headers.location, undefined);
      assert.equal(JSON.parse(r.body).applinks.details[0].appIDs[0], 'GHUN5FZ4NP.com.gearheart.breakaleg');
    });
    await check('/cast-pack/ is 200 HTML with the price', async () => {
      const r = await curl('/cast-pack/');
      assert.equal(r.status, 200);
      assert.match(r.headers['content-type'], /^text\/html/);
      assert.match(r.body, /\$19<\/b> a show/);
    });
    await check('/cast-pack/thanks/ is 200 HTML and noindex', async () => {
      const r = await curl('/cast-pack/thanks/');
      assert.equal(r.status, 200);
      assert.match(r.headers['content-type'], /^text\/html/);
      assert.match(r.body, /name="robots" content="noindex, nofollow"/);
      assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
    });
    await check('repo plumbing is not served (tools, tests, package.json, functions)', async () => {
      for (const p of ['/tools/castpack.mjs', '/tests/fixtures/code-vectors.json', '/package.json', '/functions/_lib/code.js']) {
        assert.equal((await curl(p)).status, 404, p);
      }
    });
    await check('download counter counted the successful downloads', async () => {
      const i = await tool('info', '--code', code);
      const n = Number(/Downloads:\s+(\d+)/.exec(i.stdout)[1]);
      assert.equal(n, 2, `expected 2 counted downloads, saw ${n}`);
    });
    await check('update bumps the version and the same code returns the new script', async () => {
      const second = join(tmp, 'second.breakaleg');
      await writeFile(second, JSON.stringify({ ...scriptDoc, title: 'Second draft' }));
      await tool('update', '--code', code, '--script', second);
      const body = JSON.parse((await curl(`/api/show/${code}`)).body);
      assert.equal(body.show.version, 2);
      assert.equal(body.script.title, 'Second draft');
    });
    await check('end gives 410 ended', async () => {
      await tool('end', '--code', code);
      const r = await curl(`/api/show/${code}`);
      assert.equal(r.status, 410);
      assert.deepEqual(JSON.parse(r.body), { error: 'ended' });
    });
    await check('revoke gives 404 not_found', async () => {
      await tool('revoke', '--code', code);
      const r = await curl(`/api/show/${code}`);
      assert.equal(r.status, 404);
      assert.deepEqual(JSON.parse(r.body), { error: 'not_found' });
    });
  } finally {
    stop();
    if (!args.includes('--keep')) await rm(state, { recursive: true, force: true });
    await rm(tmp, { recursive: true, force: true });
  }
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} check(s) FAILED` : `\nall ${results.length} checks passed; dev server stopped`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });

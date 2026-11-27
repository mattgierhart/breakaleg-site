#!/usr/bin/env node
// Internal tool: mint, update, end, revoke and inspect shows (CONTRACT.md section 6). Node 22, no dependencies.
//
//   node tools/castpack.mjs mint --name "The Lighthouse Cat" --partner "KidStage" --script show.breakaleg [--ends 2027-03-31]
//   node tools/castpack.mjs update --code 7Q4M-XN98 --script show-v2.breakaleg
//   node tools/castpack.mjs end    --code 7Q4M-XN98
//   node tools/castpack.mjs revoke --code 7Q4M-XN98
//   node tools/castpack.mjs info   --code 7Q4M-XN98
//
// Remote (production or preview KV): set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SHOWS_KV_NAMESPACE_ID.
// Local: add --local <dir> (for example .wrangler/state). That writes through `wrangler kv key put --local`
// into the same store that `npm run dev` (wrangler pages dev, KV binding SHOWS) reads.
// Scripts are never committed; keep show files outside the repo.

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { generateCode, normaliseCode, displayCode } from '../functions/_lib/code.js';

export const SITE = 'https://break-a-leg.app';
export const LOCAL_NAMESPACE = 'SHOWS'; // the id wrangler pages dev gives the SHOWS binding

// ---------- stores: get(key) -> string|null, put(key, value) ----------

export class MemoryStore {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  async put(key, value) { this.map.set(key, String(value)); }
}

export class CloudflareStore {
  constructor({ token, accountId, namespaceId, fetchImpl = fetch }) {
    if (!token || !accountId || !namespaceId) {
      throw new UsageError('Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and SHOWS_KV_NAMESPACE_ID, or use --local <dir>.');
    }
    this.token = token;
    this.base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/`;
    this.fetch = fetchImpl;
  }
  async get(key) {
    const res = await this.fetch(this.base + encodeURIComponent(key), { headers: { Authorization: `Bearer ${this.token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Cloudflare KV read failed for ${key}: HTTP ${res.status}`);
    return res.text();
  }
  async put(key, value) {
    const res = await this.fetch(this.base + encodeURIComponent(key), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'text/plain' },
      body: String(value),
    });
    if (!res.ok) throw new Error(`Cloudflare KV write failed for ${key}: HTTP ${res.status}`);
  }
}

function defaultExec(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); } else resolve({ stdout, stderr });
    });
  });
}

const WRANGLER_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

export class WranglerLocalStore {
  constructor({ dir, exec = defaultExec, wranglerBin = WRANGLER_BIN }) {
    this.dir = dir; this.exec = exec; this.bin = wranglerBin;
  }
  common() { return ['--local', '--namespace-id', LOCAL_NAMESPACE, '--persist-to', this.dir]; }
  async get(key) {
    try {
      const { stdout } = await this.exec(process.execPath, [this.bin, 'kv', 'key', 'get', key, '--text', ...this.common()]);
      // wrangler exits 0 and prints this line for a missing key
      return stdout.trim() === 'Value not found' ? null : stdout.replace(/\r?\n$/, '');
    } catch (err) {
      if (/not found/i.test(`${err.stderr || ''}${err.stdout || ''}${err.message}`)) return null;
      throw err;
    }
  }
  async put(key, value) {
    const tmp = await mkdtemp(join(tmpdir(), 'castpack-'));
    try {
      const file = join(tmp, 'value');
      await writeFile(file, String(value));
      await this.exec(process.execPath, [this.bin, 'kv', 'key', 'put', key, '--path', file, ...this.common()]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
}

// ---------- commands ----------

export class UsageError extends Error {}

export function parseScript(text) {
  let doc;
  try { doc = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new UsageError('The script file is not valid JSON.'); }
  if (!doc || doc.format !== 'breakaleg-script' || typeof doc.formatVersion !== 'number') {
    throw new UsageError('That does not look like a .breakaleg file: need "format": "breakaleg-script" and a numeric "formatVersion".');
  }
  return text.replace(/^﻿/, '').trim();
}

/** YYYY-MM-DD -> the last moment of that day (UTC), so the show still works on its closing date. */
export function endOfDay(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Number.isNaN(Date.parse(`${ymd}T00:00:00Z`))) {
    throw new UsageError('--ends must look like 2027-03-31.');
  }
  return `${ymd}T23:59:59.999Z`;
}

const randomHex = (n) => randomBytes(n / 2).toString('hex');

async function loadShow(store, rawCode) {
  const code = normaliseCode(rawCode ?? '');
  if (!code) throw new UsageError('That is not a valid show code.');
  const showId = await store.get(`code:${code}`);
  if (!showId) throw new UsageError(`No show has the code ${displayCode(code)}.`);
  const text = await store.get(`show:${showId}`);
  if (!text) throw new UsageError(`Show ${showId} is missing its record.`);
  return { code, showId, show: JSON.parse(text) };
}

const saveShow = (store, show) => store.put(`show:${show.id}`, JSON.stringify(show));

export function statusOf(show, now = new Date()) {
  if (show.revoked) return 'revoked';
  if (show.endsAt && now.getTime() >= Date.parse(show.endsAt)) return 'ended';
  return 'live';
}

export async function mint(store, { name, partner = '', scriptText, ends }, { now = new Date(), makeCode = generateCode } = {}) {
  if (!name || !name.trim()) throw new UsageError('mint needs --name.');
  const script = parseScript(scriptText);
  const endsAt = ends ? endOfDay(ends) : null;
  let code;
  for (let i = 0; i < 20; i++) {
    const candidate = makeCode();
    if (!(await store.get(`code:${candidate}`))) { code = candidate; break; }
  }
  if (!code) throw new Error('Could not find an unused code after 20 tries.');
  const id = randomHex(16);
  const iso = now.toISOString();
  const show = { id, name: name.trim(), partner: partner.trim(), code, version: 1, createdAt: iso, updatedAt: iso, endsAt, revoked: false };
  // The code key goes last: until it exists the show cannot be reached.
  await store.put(`script:${id}`, script);
  await store.put(`show:${id}`, JSON.stringify(show));
  await store.put(`count:${id}`, '0');
  await store.put(`code:${code}`, id);
  return { show, code, display: displayCode(code), link: `${SITE}/show/${code}` };
}

export async function update(store, { code, scriptText }, { now = new Date() } = {}) {
  const script = parseScript(scriptText);
  const { show } = await loadShow(store, code);
  show.version = (Number.isInteger(show.version) ? show.version : 1) + 1;
  show.updatedAt = now.toISOString();
  await store.put(`script:${show.id}`, script);
  await saveShow(store, show);
  return { show };
}

export async function end(store, { code }, { now = new Date() } = {}) {
  const { show } = await loadShow(store, code);
  show.endsAt = now.toISOString();
  show.updatedAt = now.toISOString();
  await saveShow(store, show);
  return { show };
}

export async function revoke(store, { code }, { now = new Date() } = {}) {
  const { show } = await loadShow(store, code);
  show.revoked = true;
  show.updatedAt = now.toISOString();
  await saveShow(store, show);
  return { show };
}

export async function info(store, { code }, { now = new Date() } = {}) {
  const { code: c, show } = await loadShow(store, code);
  const count = parseInt((await store.get(`count:${show.id}`)) ?? '0', 10) || 0;
  return { show, code: c, display: displayCode(c), link: `${SITE}/show/${c}`, count, status: statusOf(show, now) };
}

// ---------- command line ----------

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`--${key} needs a value.`);
    flags[key] = value;
    i++;
  }
  return { command, flags };
}

export function makeStore(flags, env = process.env, deps = {}) {
  if (flags.local) return new WranglerLocalStore({ dir: flags.local, ...deps });
  return new CloudflareStore({
    token: env.CLOUDFLARE_API_TOKEN, accountId: env.CLOUDFLARE_ACCOUNT_ID, namespaceId: env.SHOWS_KV_NAMESPACE_ID, ...deps,
  });
}

function describe(r) {
  const s = r.show;
  const lines = [
    `Show:     ${s.name}${s.partner ? ` (${s.partner})` : ''}`,
    `Code:     ${r.display}`,
    `Link:     ${r.link}`,
    `Version:  ${s.version}`,
    `Ends:     ${s.endsAt ?? 'no end date'}`,
  ];
  if (r.status) lines.push(`Status:   ${r.status}`, `Downloads: ${r.count}`);
  return lines.join('\n');
}

export async function run(argv, { store, out = console.log, now, makeCode, env = process.env, deps } = {}) {
  const { command, flags } = parseArgs(argv);
  const commands = ['mint', 'update', 'end', 'revoke', 'info'];
  if (!commands.includes(command)) {
    throw new UsageError(`Usage: castpack.mjs <${commands.join('|')}> [options]. See the comment at the top of tools/castpack.mjs.`);
  }
  const s = store ?? makeStore(flags, env, deps);
  const opts = { now, makeCode };
  const clean = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
  let result;
  if (command === 'mint') {
    if (!flags.script) throw new UsageError('mint needs --script <file.breakaleg>.');
    result = await mint(s, { name: flags.name, partner: flags.partner, scriptText: await readFile(flags.script, 'utf8'), ends: flags.ends }, clean);
    out(`Minted.\n${describe(result)}`);
  } else if (command === 'update') {
    if (!flags.script) throw new UsageError('update needs --script <file>.');
    result = await update(s, { code: flags.code, scriptText: await readFile(flags.script, 'utf8') }, clean);
    out(`Updated to version ${result.show.version}.`);
  } else if (command === 'end') {
    result = await end(s, { code: flags.code }, clean);
    out(`Ended at ${result.show.endsAt}. The code now returns 410.`);
  } else if (command === 'revoke') {
    result = await revoke(s, { code: flags.code }, clean);
    out('Revoked. The code now returns 404.');
  } else {
    result = await info(s, { code: flags.code }, clean);
    out(describe(result));
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof UsageError ? err.message : `Error: ${err.message}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}

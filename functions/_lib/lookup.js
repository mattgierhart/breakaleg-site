// GET /api/show/<CODE> (CONTRACT.md section 3). Pure logic: no Cloudflare globals except Response.
// Privacy (BR-023): nothing is read from or stored about the requester. The only write is the per-show counter.

import { normaliseCode } from './code.js';

export const ENVELOPE = 1;

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(status, bodyText, extra = {}) {
  return new Response(bodyText, { status, headers: { ...BASE_HEADERS, ...extra } });
}

const errorBody = (code) => JSON.stringify({ error: code });

/** Best-effort download counter. Never throws, never blocks the response. */
export async function bumpCount(kv, showId) {
  try {
    const key = `count:${showId}`;
    const current = parseInt((await kv.get(key)) ?? '0', 10);
    await kv.put(key, String((Number.isFinite(current) ? current : 0) + 1));
  } catch {
    /* a failed count must never fail a download */
  }
}

function hasEnded(show, now) {
  if (!show.endsAt) return false;
  const t = Date.parse(show.endsAt);
  return Number.isFinite(t) && now.getTime() >= t;
}

/**
 * @param {{ get(key: string): Promise<string|null>, put(key: string, value: string): Promise<void> }} kv
 * @param {string} rawCode  code as it appears in the URL (any case, dashes allowed)
 * @param {{ now?: Date, waitUntil?: (p: Promise<unknown>) => void }} [opts]
 */
export async function lookupShow(kv, rawCode, opts = {}) {
  const now = opts.now ?? new Date();
  const code = normaliseCode(rawCode);
  if (!code) return json(404, errorBody('not_found'));

  let show;
  let scriptText;
  try {
    const showId = await kv.get(`code:${code}`);
    if (!showId) return json(404, errorBody('not_found'));
    const showText = await kv.get(`show:${showId}`);
    if (!showText) return json(404, errorBody('not_found'));
    show = JSON.parse(showText);
    if (show.revoked) return json(404, errorBody('not_found'));
    if (hasEnded(show, now)) return json(410, errorBody('ended'));
    scriptText = await kv.get(`script:${showId}`);
    if (!scriptText) return json(500, errorBody('unavailable'));

    const counting = bumpCount(kv, showId);
    if (opts.waitUntil) opts.waitUntil(counting);
  } catch {
    return json(500, errorBody('unavailable'));
  }

  // The script is stored and returned as is: spliced in as text, not parsed and re-encoded.
  const meta = JSON.stringify({
    name: String(show.name ?? ''),
    partner: String(show.partner ?? ''),
    version: Number.isInteger(show.version) ? show.version : 1,
  });
  return json(200, `{"envelope":${ENVELOPE},"show":${meta},"script":${scriptText}}`);
}

/** Request wrapper used by functions/api/show/[code].js and by tests. */
export async function handleShowApi(request, codeParam, env, ctx = {}) {
  if (request.method !== 'GET') {
    return json(405, errorBody('method_not_allowed'), { Allow: 'GET' });
  }
  let raw = Array.isArray(codeParam) ? codeParam.join('/') : String(codeParam ?? '');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return json(404, errorBody('not_found'));
  }
  if (!env || !env.SHOWS) return json(500, errorBody('unavailable'));
  return lookupShow(env.SHOWS, raw, {
    waitUntil: ctx.waitUntil ? (p) => ctx.waitUntil(p) : undefined,
  });
}

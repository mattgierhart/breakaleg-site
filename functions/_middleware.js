import { isBlockedPath } from './_lib/guard.js';

export function onRequest(context) {
  if (isBlockedPath(new URL(context.request.url).pathname)) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return context.next();
}

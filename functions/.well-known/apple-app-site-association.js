// /.well-known/apple-app-site-association. A Function, not a static file, so the Content-Type is always application/json.
import { aasaResponse } from '../_lib/aasa.js';

export function onRequest(context) {
  const m = context.request.method;
  if (m !== 'GET' && m !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  return aasaResponse();
}

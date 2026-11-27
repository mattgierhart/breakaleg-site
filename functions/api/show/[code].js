// GET /api/show/<CODE>. Thin wrapper: the logic and its tests live in functions/_lib/lookup.js.
import { handleShowApi } from '../../_lib/lookup.js';

export function onRequest(context) {
  return handleShowApi(context.request, context.params.code, context.env, context);
}

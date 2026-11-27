// GET /show and /show/<anything>: the link page. No lookup, no storage. Logic lives in functions/_lib/show-page.js.
import { handleShowPage } from '../_lib/show-page.js';

export function onRequest(context) {
  return handleShowPage(context.request);
}

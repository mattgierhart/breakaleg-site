// GET /show/<anything>: the page families land on when the app does not open the link.
// It never looks the code up (so it cannot reveal whether a show exists) and is noindex.

import { normaliseCode, displayCode } from './code.js';

const APP_STORE = 'https://apps.apple.com/app/id6834977811';

const APPLE_LOGO =
  '<svg class="apple" viewBox="0 0 384 512" width="20" height="24" aria-hidden="true"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>';

const STORE_BUTTON =
  `<a class="btn btn-store" href="${APP_STORE}">${APPLE_LOGO}<span class="lines"><small>Download on the</small>App Store</span></a>`;

/** The code from the last non-empty path segment, or null when it is not a well-formed code. */
export function codeFromPath(pathname) {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const parts = path.split('/').filter(Boolean);
  // parts[0] is "show"; what follows is treated like anything a person might paste (a code or a whole link)
  if (parts.length < 2) return null;
  return normaliseCode(parts.slice(1).join('/'));
}

function layout({ title, description, extraHead = '', body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/landing.css">
<meta name="theme-color" content="#1b0507">
${extraHead}</head>
<body class="l">
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="/"><img src="/assets/img/icon-64.png" alt="" width="32" height="32">Break a Leg</a>
    <nav class="nav" aria-label="Site">
      <a href="/support/">Support</a>
      <a href="/privacy/">Privacy</a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer>
  <div class="wrap">
    <span>© 2026 Gearheart. Break a Leg is an iPad app.</span>
    <nav aria-label="Footer"><a href="/">Home</a><a href="/support/">Support</a><a href="/privacy/">Privacy Policy</a></nav>
  </div>
</footer>
</body>
</html>
`;
}

export function renderShowPage(code) {
  if (!code) {
    return layout({
      title: 'Check your link · Break a Leg',
      description: 'This link did not look right.',
      body: `<section class="show-hero">
  <div class="wrap show-wrap">
    <p class="eyebrow">Show code</p>
    <h1>Check the link with your director</h1>
    <p class="show-lede">That link did not look right. It may have been cut short when it was copied.</p>
    <p class="show-lede">Ask your director to send it again. A show code is 8 letters and numbers.</p>
    <div class="cta-row show-cta">${STORE_BUTTON}</div>
  </div>
</section>`,
    });
  }
  const shown = displayCode(code);
  return layout({
    title: 'Your show code · Break a Leg',
    description: 'Open your show in Break a Leg on your iPad.',
    extraHead: `<meta name="apple-itunes-app" content="app-id=6834977811, app-argument=https://break-a-leg.app/show/${code}">\n`,
    body: `<section class="show-hero">
  <div class="wrap show-wrap">
    <p class="eyebrow">Your show code</p>
    <p class="show-code" aria-label="Show code ${shown.split('').join(' ')}">${shown}</p>
    <h1>Open on your iPad</h1>
    <p class="show-lede">Your director shared a show with you. It opens in the Break a Leg app on an iPad.</p>
    <ol class="show-steps">
      <li><span class="num">1</span><div><b>Get the app</b><span>Find Break a Leg on the App Store. A show code does not use up any of your scripts.</span></div></li>
      <li><span class="num">2</span><div><b>Tap the link again</b><span>Or open the app, tap <em>Have a show code?</em> and type the code above.</span></div></li>
    </ol>
    <div class="cta-row show-cta">${STORE_BUTTON}</div>
  </div>
</section>`,
  });
}

export function handleShowPage(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const code = codeFromPath(new URL(request.url).pathname);
  return new Response(request.method === 'HEAD' ? null : renderShowPage(code), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}

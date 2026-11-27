# breakaleg-site

Public website for **Break a Leg: Line Rehearsal**, the iPad app built in
[`mattgierhart/ipad-line-reader`](https://github.com/mattgierhart/ipad-line-reader).

Plain static HTML, no build step, plus a few Cloudflare Pages Functions for show codes (`functions/`). The same static files are served by two hosts; the Functions run only on Cloudflare:

| Host | URL | Notes |
| --- | --- | --- |
| Cloudflare Pages | https://break-a-leg.app/ | Primary home once the Cloudflare Pages project and custom domain are set up (in progress 2026-11-25). Production branch `main`, build command none, output directory `/`. Uses `_headers` and `_redirects`. |
| GitHub Pages | https://mattgierhart.github.io/breakaleg-site/ | Legacy. These URLs were submitted with 1.0, so they keep serving the same pages. `.nojekyll` makes GitHub serve files as-is. |

| Page | Path | Used by |
| --- | --- | --- |
| `index.html` + `assets/landing.css` | `/` | Landing page (App Store Connect Marketing URL). Mobile first; the stage curtains are pure CSS. |
| `index.html#directors` | `/#directors` | Cast Pack teaser for directors: $19 a show, any cast size (PRD BR-035). Its button goes to `/cast-pack/`. |
| `cast-pack/index.html` | `/cast-pack/` | Cast Pack order page. The Stripe Payment Link goes in the `CHECKOUT_URL` constant at the bottom of this file; while empty, the button opens an email. |
| `cast-pack/thanks/index.html` | `/cast-pack/thanks/` | Where Stripe sends the director after paying (set as the Payment Link's "After payment" page). `noindex`. |
| `functions/show/[[path]].js` | `/show/<CODE>` | Link page families land on without the app. Never looks the code up; `noindex`. Cloudflare only. |
| `functions/api/show/[code].js` | `/api/show/<CODE>` | Script service the app calls. Contract: `CONTRACT.md` in the project files (show-codes). Cloudflare only. |
| `functions/.well-known/apple-app-site-association.js` | `/.well-known/apple-app-site-association` | Universal links for `/show/*`, `application/json`. Cloudflare only. |
| `support/index.html` | `/support/` | App Store Connect Support URL (required) |
| `privacy/index.html` | `/privacy/` | App Store Connect Privacy Policy URL (required) |
| `404.html` | any missing path | Not-found page |

Rules:

- Keep `/support/` and `/privacy/` stable; they are live in the App Store listing.
- All links and asset paths are relative so the pages work under the GitHub Pages `/breakaleg-site/` subpath.
- The privacy text must match App Privacy ("Data Not Collected") and `App/Resources/PrivacyInfo.xcprivacy`.
  The app repo keeps copies in `appstore/privacy-policy.md` and `appstore/support.md`; change both together.
- App Store buttons link to `https://apps.apple.com/app/id6834977811`; the `apple-itunes-app` meta tag shows Safari's smart banner.
- Images in `assets/img/`: `01-` to `06-` and `dev-*.webp` are downsized App Store screenshots (1.0 UI); `icon-*`,
  `favicon-32.png` and `apple-touch-icon.png` come from icon D; `lighthouse-m/-d.webp` (stage hero),
  `lighthouse-loop-m/-d.mp4` (ambient loop, added by JS only without reduced motion or save-data),
  `rehearse-home*.webp` and `curtain-call*.webp` are Higgsfield illustrations in the same paper-cutout diorama
  style as the app's 1.1 art (DES-011 in the app repo). No people or faces in the art.
- When 1.1 ships, swap the `01-` to `06-` and `dev-*` screenshots for the 1.1 set (project files `appstore/1.1/`).

Contact address: developer@gearheartai.org.

## Status (2026-11-25)

- Merged: #1 README, #2 static rebuild (landing, privacy, support), #3 mobile-first redesign, #4 Lighthouse Cat hero art and live App Store buttons.
- App Store Connect still points at the GitHub Pages URLs. Switch Support, Marketing and Privacy URLs to
  break-a-leg.app with the 1.1 submission, after 1.0 is approved; keep the github.io pages serving identical content.

## Show codes and Cast Packs

Director buys a Cast Pack on `/cast-pack/` (Stripe Payment Link), emails the script, and we mint a show with
`tools/castpack.mjs`. Families open `https://break-a-leg.app/show/<CODE>`; the app fetches `/api/show/<CODE>`.
Storage is one KV namespace bound as `SHOWS` (keys `code:`, `show:`, `script:`, `count:`). Scripts are never committed.

### One-time Cloudflare setup (a human, in the dashboard)

1. Workers & Pages > KV > Create a namespace, for example `breakaleg-shows`. Create a second one for previews if you want previews isolated (`breakaleg-shows-preview`).
2. Workers & Pages > `breakaleg-site` > Settings > Bindings > Add > KV namespace. Variable name `SHOWS`. Pick the namespace for Production and the preview one (or the same one) for Preview. Redeploy.
3. Optional rate limit: Security > WAF > Rate limiting rules. Expression `(http.request.uri.path wildcard "/api/show/*")`, for example 30 requests per 10 seconds per IP, action Block. Cloudflare does the counting; our code stores no IP addresses and never returns 429 itself.
4. Stripe: create a Payment Link for the Cast Pack ($19.00 USD, one show). Set "After payment" to "Don't show confirmation page, redirect customers to your website": `https://break-a-leg.app/cast-pack/thanks/`. Paste the link into `CHECKOUT_URL` in `cast-pack/index.html`.
5. Create an API token with Account > Workers KV Storage > Edit, and note the account id and namespace id. Keep them in your shell only: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SHOWS_KV_NAMESPACE_ID`.

There is deliberately no `wrangler.toml`: one that sets `pages_build_output_dir` would make the file, not the dashboard, the source of
truth for bindings, and a placeholder id would break deploys. `wrangler.example.toml` shows the shape for a later move to config-as-code.

### Running shows

```
node tools/castpack.mjs mint --name "The Lighthouse Cat" --partner "KidStage" --script show.breakaleg --ends 2027-03-31
node tools/castpack.mjs update --code 7Q4M-XN98 --script show-v2.breakaleg   # same code, version + 1
node tools/castpack.mjs info   --code 7Q4M-XN98                              # status and download count
node tools/castpack.mjs end    --code 7Q4M-XN98                              # code returns 410
node tools/castpack.mjs revoke --code 7Q4M-XN98                              # code returns 404
```

Add `--local .wrangler/state` to any command to use the local store that `npm run dev` serves (no credentials needed).

### Develop and test

```
npm install        # wrangler is a devDependency; nothing is bundled into the site
npm test           # unit tests, Node's built-in runner, no network
npm run dev        # wrangler pages dev on http://localhost:8788 with a local KV bound as SHOWS
npm run e2e        # starts the dev server, mints a show, curls every route, stops the server
npm run e2e -- --script path/to/real.breakaleg   # same, with a real script file
```

CI (`.github/workflows/test.yml`) runs `npm test` only, when `functions/`, `tools/`, `tests/` or package files change.

### What Cloudflare publishes

The Pages project has no build command and output directory `/`, so the whole repo root is the site. That would publish
`tools/`, `tests/`, `functions/`, `package.json` and so on as static files. `functions/_middleware.js` plus `_routes.json`
answer 404 for those paths (the Function only runs for those paths and for `/api`, `/show`, `/.well-known`). The cleaner fix is a
real output directory (move the site files into `public/` and set it in the Pages project settings); that needs a dashboard
change, so it is not done here. `README.md` is still served at `/README.md`, as before.

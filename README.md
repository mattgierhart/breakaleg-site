# breakaleg-site

Public website for **Break a Leg: Line Rehearsal**, the iPad app built in
[`mattgierhart/ipad-line-reader`](https://github.com/mattgierhart/ipad-line-reader).

Plain static HTML, no build step. The same files are served by two hosts:

| Host | URL | Notes |
| --- | --- | --- |
| Cloudflare Pages | https://break-a-leg.app/ | Primary home once the Cloudflare Pages project and custom domain are set up (in progress 2026-11-25). Production branch `main`, build command none, output directory `/`. Uses `_headers` and `_redirects`. |
| GitHub Pages | https://mattgierhart.github.io/breakaleg-site/ | Legacy. These URLs were submitted with 1.0, so they keep serving the same pages. `.nojekyll` makes GitHub serve files as-is. |

| Page | Path | Used by |
| --- | --- | --- |
| `index.html` + `assets/landing.css` | `/` | Landing page (App Store Connect Marketing URL). Mobile first; the stage curtains are pure CSS. |
| `index.html#directors` | `/#directors` | Cast Pack for directors: $19 a show, any cast size (PRD BR-035). The feature is not built yet; the section says it starts with spring 2027 shows and takes enquiries by email. |
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

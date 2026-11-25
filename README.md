# breakaleg-site

Public website for **Break a Leg: Line Rehearsal**, the iPad app built in
[`mattgierhart/ipad-line-reader`](https://github.com/mattgierhart/ipad-line-reader).

Plain static HTML, no build step. The same files are served by two hosts:

| Host | URL | Notes |
| --- | --- | --- |
| Cloudflare Pages | https://break-a-leg.app/ | Primary home. Production branch `main`, build command none, output directory `/`. Uses `_headers` and `_redirects`. |
| GitHub Pages | https://mattgierhart.github.io/breakaleg-site/ | Legacy. These URLs were submitted with 1.0, so they keep serving the same pages. `.nojekyll` makes GitHub serve files as-is. |

| Page | Path | Used by |
| --- | --- | --- |
| `index.html` + `assets/landing.css` | `/` | Landing page (App Store Connect Marketing URL). Mobile first; the stage curtains are pure CSS. |
| `support/index.html` | `/support/` | App Store Connect Support URL (required) |
| `privacy/index.html` | `/privacy/` | App Store Connect Privacy Policy URL (required) |
| `404.html` | any missing path | Not-found page |

Rules:

- Keep `/support/` and `/privacy/` stable; they are live in the App Store listing.
- All links and asset paths are relative so the pages work under the GitHub Pages `/breakaleg-site/` subpath.
- The privacy text must match App Privacy ("Data Not Collected") and `App/Resources/PrivacyInfo.xcprivacy`.
  The app repo keeps copies in `appstore/privacy-policy.md` and `appstore/support.md`; change both together.
- When 1.0 is live, swap the `APP_STORE_LINK` placeholder in `index.html` for the App Store link
  (`https://apps.apple.com/app/id6834977811`) and add the `apple-itunes-app` meta tag.
- Images in `assets/img/` are downsized from the App Store marketing screenshots and icon D.

Contact address: developer@gearheartai.org.

# Open Late

Static, mobile-first PWA: which restaurants and bars are open now, whose kitchen is still open, and the day's specials. First area: Lancaster, PA.

No build step and no backend. Serve the folder with any static host (`python3 -m http.server`).

## Features added in v75
- **Tonight** chip: places listed open past 11 PM today, with late kitchens ("Food till …") first. Turns on by default after 9 PM EST.
- **List / Map** toggle: Leaflet 1.9.4 (vendored in `vendor/leaflet`, loaded only when Map is opened) with OpenStreetMap tiles. Pins follow the current filters and Near me.
- **Suggest an update / Add a place / Claim your listing** form. It posts to the endpoint in `config.js` (FormSubmit) with a honeypot, and falls back to email if that fails.
- **SEO**: per-County landing pages (`/<county>-county/`), `/counties/`, `sitemap.xml`, `robots.txt`, Open Graph image, JSON-LD. Rebuild them with `python3 tools/build_seo.py` after data changes.
- **Analytics** (off by default): set `goatcounter` in `config.js` to turn on cookie-free GoatCounter.

## config.js
- `formEndpoint`: `https://formsubmit.co/ajax/<email>`. The first submission sends an "Activate Form" email that has to be clicked. After that you can swap the email for the random alias FormSubmit gives you, so the address isn't in the page source.
- `goatcounter`: empty = disabled. Set to `https://<code>.goatcounter.com/count`.

## Files
- `index.html`, `styles.css`, `app.js` – the app
- `validate.py` – data/asset sanity checks (`python3 validate.py`)
- `sw.js` – service worker (app shell cached; data files network-first, offline fallback). Bump `VERSION` when you change shell files.
- `manifest.webmanifest`, `icons/` – PWA install metadata
- `data/cities.json` – area index. Each area has `id`, `name`, `type` (`city` or `town`), `region`, `timezone`, `file`, `status` (`live` or `coming-soon`). Regions group the selector. Coming-soon areas show disabled.
- `data/cities/<area-id>.json` – one file per area: `name`, `timezone`, `checked`, `checkedLabel`, `restaurants[]`

## Adding a City
1. Create `data/cities/<id>.json` with the same shape as `lancaster-pa.json`.
2. In `data/cities.json`, set that area's `file` and `"status": "live"`.
3. Add the file to `SHELL` in `sw.js` and bump `VERSION`.

## Restaurant fields
`hours` and `kitchen` use: `"Mon-Thu 11a-12a; Fri-Sat 11a-1a; Sun closed"`, `"Daily 24h"`, split shifts `"Mon 11a-2p,5p-9p"`. A close time at or before the open time means past midnight. Days not mentioned = not listed. `null` = not listed. Happy hours and specials are `{ "days": "Mon-Fri" | "Tue,Thu" | "Daily", "text": "..." }`. `priceLevel` is `$`–`$$$$` or `null`.

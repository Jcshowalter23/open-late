# Open Late

Static, mobile-first PWA: which restaurants and bars are open now, whose kitchen is still open, and the day's specials. First area: Lancaster, PA.

No build step and no backend. Serve the folder with any static host (`python3 -m http.server`).

## Files
- `index.html`, `styles.css`, `app.js` – the app
- `validate.py` – data/asset sanity checks (`python3 validate.py`)
- `sw.js` – service worker (app shell cached; data files network-first, offline fallback). Bump `VERSION` when you change shell files.
- `manifest.webmanifest`, `icons/` – PWA install metadata
- `data/cities.json` – area index. Each area has `id`, `name`, `type` (`city` or `town`), `region`, `timezone`, `file`, `status` (`live` or `coming-soon`). Regions group the selector. Coming-soon areas show disabled.
- `data/cities/<area-id>.json` – one file per area: `name`, `timezone`, `checked`, `checkedLabel`, `restaurants[]`

## Adding a city or town
1. Create `data/cities/<id>.json` with the same shape as `lancaster-pa.json`.
2. In `data/cities.json`, set that area's `file` and `"status": "live"`.
3. Add the file to `SHELL` in `sw.js` and bump `VERSION`.

## Restaurant fields
`hours` and `kitchen` use: `"Mon-Thu 11a-12a; Fri-Sat 11a-1a; Sun closed"`, `"Daily 24h"`, split shifts `"Mon 11a-2p,5p-9p"`. A close time at or before the open time means past midnight. Days not mentioned = not listed. `null` = not listed. Happy hours and specials are `{ "days": "Mon-Fri" | "Tue,Thu" | "Daily", "text": "..." }`. `priceLevel` is `$`–`$$$$` or `null`.

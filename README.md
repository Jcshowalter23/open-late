# Open Late

Static, mobile-first PWA: which restaurants and bars are open now, whose kitchen is still open, and the day's specials. Covers Pennsylvania, Maryland, Delaware and Washington, DC (picker: State → County → City; Washington, DC is its own State with no County box: State → Neighborhood). States, their order and names come from `states` in data/cities.json (Pennsylvania first, then A–Z); renamed County ids go in `countyAliases` (old links, saved picks and the old landing page redirect).

No build step and no backend. Serve the folder with any static host (`python3 -m http.server`).

## Features added in v75
- **Tonight** chip: places listed open past 11 PM today, with late kitchens ("Food till …") first. Turns on by default after 9 PM EST.
- **List / Map** toggle: Leaflet 1.9.4 (vendored in `vendor/leaflet`, loaded only when Map is opened) with OpenStreetMap tiles. Pins follow the current filters and Near me.
- **Suggest an update / Add a place / Claim your listing** form. It posts to the endpoint in `config.js` (FormSubmit) with a honeypot, and falls back to email if that fails.
- **SEO**: per-County landing pages (`/<county>-county/`), `/counties/`, `sitemap.xml`, `robots.txt`, Open Graph image, JSON-LD. Rebuild them with `python3 tools/build_seo.py` after data changes.
- **Analytics** (off by default): set `goatcounter` in `config.js` to turn on cookie-free GoatCounter.

## "Still good?" deal votes (v83)

Each deal in a place's Details has 👍/👎 ("Still good?"). One vote per deal per device (localStorage `openlate.votes`);
each vote is an anonymous GoatCounter event `deal-vote/<area>/<place-id>/<h|s><index>-<slug>/<up|down>`. Nothing is emailed.

To list deals people say are out of date, create a GoatCounter API key with only the **Read statistics** permission
(GoatCounter → your username, top right → API), then:

    GOATCOUNTER_TOKEN=... python3 tools/deal_votes.py            # deals with any 👎, last 90 days
    GOATCOUNTER_TOKEN=... python3 tools/deal_votes.py --days 30 --min-down 2 --csv

## Crowd type, karaoke and DJ nights (v87)

Research fields on each place in `data/cities/<area>.json` (merged with `python3 tools/merge_crowd.py findings.jsonl`, joined on `"<area>|<place-id>"`; idempotent, and it never replaces a newer check with an older one):

- `crowdType`: `{labels[], summary, confidence: high|medium, details[{label, confidence, evidence[{type: reviews|venue|attr, src, url, quote, date?}]}]}`. The old `crowd` field (busy times) is separate and unchanged.
- `karaoke`, `dj`: `{nights[{day: Mon..Sun, cadence, start, confidence: high|medium|low, basis, lastSeen, datedLastSeen, postsSeen, sources[{src, url, date, quote}], note?, manual?}], stale[], hints[], oneoffs[], conflicts[]}`. Low confidence means a karaoke-directory listing only; `stale` holds nights last seen before May 1, 2026.
- `crowdChecked` (YYYY-MM-DD) and `crowdSources` (which sources were read).

Everything is kept in the source files so the weekly refresh can re-open each `url` and update `lastSeen`/`crowdChecked`. `tools/build_data.py` puts only display fields in `data/county/*.json`: `ct {l: labels, s: summary, src, u}` (high/medium only), and `kk`/`dj` lists of `{d: 0=Sun..6, w: "Thu 10 pm" | "2nd Thu monthly 9 pm" | "every other Sat", t?, s: source, u: url, seen, n?: note}` for high/medium, non-stale nights. Low-confidence and stale nights never reach the app. A place's "Last checked" (`lc`) uses `crowdChecked` only when that research shows something on the card, and only if it is newer.

In the app: a 👥 crowd line on the card and a "Crowd type" row in Details; 🎤 Karaoke and 🎧 DJ chips that follow the day picker (All days = any night); cards show the picked day's nights ("🎤 Karaoke Thu 10 pm"); Details lists every night with its source link.

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
- `data/index.json`, `data/county/<county-id>.json` – **what the app actually loads**, generated from the two above by
  `tools/build_data.py` (run by `tools/build_seo.py`; `validate.py` fails if they're stale). The app loads the index plus the
  picked County's file only (one request, ~30 KB gzipped); other Counties load on demand for favorites and Near me.
  After editing any `data/cities/*.json`, run `python3 tools/build_seo.py`.

## Adding a City
1. Create `data/cities/<id>.json` with the same shape as `lancaster-pa.json`.
2. In `data/cities.json`, set that area's `file` and `"status": "live"`.
3. Run `python3 tools/build_seo.py` (rebuilds `data/county/*.json`, `data/index.json`, County pages and share pages) and bump `VERSION` in `sw.js`.

## Restaurant fields
`hours` and `kitchen` use: `"Mon-Thu 11a-12a; Fri-Sat 11a-1a; Sun closed"`, `"Daily 24h"`, split shifts `"Mon 11a-2p,5p-9p"`. A close time at or before the open time means past midnight. Days not mentioned = not listed. `null` = not listed. Happy hours and specials are `{ "days": "Mon-Fri" | "Tue,Thu" | "Daily", "text": "..." }`. `priceLevel` is `$`–`$$$$` or `null`.

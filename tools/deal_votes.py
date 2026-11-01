#!/usr/bin/env python3
"""List deals that visitors voted "out of date" (👎) so they can be rechecked.

Votes are sent from the app as GoatCounter events named
    deal-vote/<area-id>/<place-id>/<h|s><index>-<deal-slug>/<up|down>
(h = happy hour, s = special; index = position in that place's list in data/cities/<area>.json).

Reading counts needs a GoatCounter API key with the "Read statistics" permission
(GoatCounter → your username, top right → API → create key, tick only "Read statistics").

    GOATCOUNTER_TOKEN=... python3 tools/deal_votes.py               # last 90 days, deals with any 👎
    GOATCOUNTER_TOKEN=... python3 tools/deal_votes.py --days 30 --min-down 2 --csv > recheck.csv

Counts are GoatCounter "visitors" for each event path; the app also limits voting to
one vote per deal per device, so a count is roughly "people who said so".
"""
import argparse, csv, datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = os.environ.get("GOATCOUNTER_SITE", "https://openlateapp.goatcounter.com")
PAT = re.compile(r"^/?deal-vote/([^/]+)/([^/]+)/([hs])(\d+)-?([^/]*)/(up|down)$")


def api(path, params, token):
    url = f"{SITE}/api/v0{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(1 + attempt); continue
            body = e.read().decode("utf-8", "replace")[:300]
            if e.code == 401: sys.exit("GoatCounter said 401: the GOATCOUNTER_TOKEN is missing or wrong.")
            if e.code == 403: sys.exit("GoatCounter said 403: the API key needs the \"Read statistics\" permission.")
            sys.exit(f"GoatCounter error {e.code}: {body}")
    sys.exit("GoatCounter kept rate-limiting; try again in a minute.")


def fetch_vote_hits(token, start, end):
    """All event paths starting with deal-vote/, with visitor counts, paging with exclude_paths."""
    seen, out = [], {}
    while True:
        params = {"start": start, "end": end, "limit": 100}
        if seen: params["exclude_paths"] = ",".join(map(str, seen))
        d = api("/stats/hits", params, token)
        hits = d.get("hits") or []
        for h in hits:
            seen.append(h["path_id"])
            if "deal-vote/" in h.get("path", ""):
                out[h["path"]] = out.get(h["path"], 0) + int(h.get("count") or 0)
        if not d.get("more") or not hits: break
        time.sleep(0.3)  # rate limit is 4 requests/second
    return out


def load_places():
    places = {}
    for f in (ROOT / "data" / "cities").glob("*.json"):
        try: d = json.loads(f.read_text())
        except Exception: continue
        for r in d.get("restaurants", []):
            places[(d["id"], str(r["id"]))] = (d, r)
    return places


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=90, help="look back this many days (default 90)")
    ap.add_argument("--min-down", type=int, default=1, help="only deals with at least this many 👎 (default 1)")
    ap.add_argument("--all", action="store_true", help="list every voted deal, not just ones with 👎")
    ap.add_argument("--csv", action="store_true", help="CSV output")
    ap.add_argument("--json", action="store_true", help="JSON output")
    a = ap.parse_args()
    token = os.environ.get("GOATCOUNTER_TOKEN", "").strip()
    if not token:
        sys.exit("Set GOATCOUNTER_TOKEN (a GoatCounter API key with the \"Read statistics\" permission).")
    now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=1)
    start = (now - dt.timedelta(days=a.days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    hits = fetch_vote_hits(token, start, now.strftime("%Y-%m-%dT%H:%M:%SZ"))

    votes = {}
    for path, n in hits.items():
        m = PAT.match(path)
        if not m: continue
        area, pid, kind, idx, slug, d = m.groups()
        v = votes.setdefault((area, pid, kind, int(idx), slug), {"up": 0, "down": 0})
        v[d] += n

    places = load_places()
    rows = []
    for (area, pid, kind, idx, slug), v in votes.items():
        if not a.all and v["down"] < a.min_down: continue
        d, r = places.get((area, pid), (None, None))
        deal, note = None, ""
        if r:
            lst = r.get("happyHours" if kind == "h" else "specials") or []
            deal = lst[idx] if idx < len(lst) else None
            # the list may have been edited since the vote: fall back to matching the slug
            def slugify(s): return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", (s or "").lower().replace("&", " and ")))
            if deal is None or (slug and not slugify(deal.get("text")).startswith(slug)):
                cand = [x for x in lst if slug and slugify(x.get("text")).startswith(slug)]
                deal = cand[0] if cand else None
                if deal is None: note = "deal no longer in data (changed or removed)"
        else:
            note = "place no longer in data"
        rows.append({
            "down": v["down"], "up": v["up"], "area": area, "place_id": pid,
            "place": r["name"] if r else "", "city": d["name"] if d else "", "county": (r or {}).get("county", ""),
            "kind": "happy hour" if kind == "h" else "special", "days": (deal or {}).get("days", ""),
            "deal": (deal or {}).get("text", slug), "source": (deal or {}).get("src", ""), "checked": (deal or {}).get("checked", ""),
            "website": (r or {}).get("website", ""), "note": note,
        })
    rows.sort(key=lambda x: (-(x["down"] - x["up"]), -x["down"], x["county"], x["place"]))

    if a.json:
        json.dump(rows, sys.stdout, indent=2); print(); return
    if a.csv:
        w = csv.DictWriter(sys.stdout, fieldnames=list(rows[0].keys()) if rows else ["down"]); w.writeheader(); w.writerows(rows); return
    if not rows:
        print(f"No {'votes' if a.all else 'deals with 👎 votes'} in the last {a.days} days."); return
    print(f"{len(rows)} deal(s) to recheck (last {a.days} days), most 👎 first:\n")
    for x in rows:
        print(f"👎 {x['down']}  👍 {x['up']}  {x['place']} ({x['city']}, {x['county']} County) [{x['area']}/{x['place_id']}]")
        print(f"     {x['kind']}: {x['days'] + ': ' if x['days'] else ''}{x['deal']}")
        if x["source"] or x["checked"]: print(f"     source: {x['source']}{' · checked ' + x['checked'] if x['checked'] else ''}")
        if x["website"]: print(f"     {x['website']}")
        if x["note"]: print(f"     NOTE: {x['note']}")


if __name__ == "__main__":
    main()

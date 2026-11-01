#!/usr/bin/env python3
"""Builds what the app loads, from the source data (data/cities.json + data/cities/<area>.json):

  data/index.json          small index: every County (id, name, places, bounding box, centre, file) and, for old
                           links and favorites, which County or Counties each area belongs to
  data/county/<id>.json    one file per County with only that County's places, fields the app doesn't show
                           dropped (phoneSource, county) and `lc` = newest "checked" date for the "Checked Oct 31" line

The app loads index.json plus the one County file you picked (other Counties only on demand: favorites, Near me).
Called by tools/build_seo.py, so every rebuild keeps these current; validate.py fails if they are stale.
Only rewrites files whose content changed."""
import json, os, re, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DROP = {"phoneSource", "county"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
CHECKED = re.compile(r"checked (\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2,8} \d{1,2}, \d{4})")

def parse_date(s):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s or "")
    if m: return datetime.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"^([A-Z][a-z]{2})[a-z]* (\d{1,2}), (\d{4})$", s or "")
    if m and m[1] in MONTHS: return datetime.date(int(m[3]), MONTHS.index(m[1]) + 1, int(m[2]))
    return None

def last_checked(r):
    """newest explicit 'checked <date>' in the place's own source fields or its deals; '' when there is none"""
    best = None
    for k in ("phoneSource", "source", "hoursNote", "kitchenNote"):
        v = r.get(k)
        if isinstance(v, str):
            for m in CHECKED.finditer(v):
                d = parse_date(m[1])
                if d and (best is None or d > best): best = d
    for x in (r.get("happyHours") or []) + (r.get("specials") or []):
        d = parse_date(x.get("checked"))
        if d and (best is None or d > best): best = d
    return best.isoformat() if best else ""

def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))

def build(write=True):
    os.chdir(ROOT)
    idx = json.load(open("data/cities.json"))
    live = {a["id"]: a for a in idx["areas"] if a.get("status") == "live" and a.get("file")}
    files = {aid: json.load(open(a["file"])) for aid, a in live.items()}
    out = {}
    counties = []
    area_counties = {}
    for c in sorted(idx["counties"], key=lambda c: c["name"]):
        areas, places = [], []
        for aid in c["areas"]:
            if aid not in files: continue
            f = files[aid]; n = 0
            for r in f["restaurants"]:
                if r.get("county") != c["name"]: continue
                rr = {k: v for k, v in r.items() if k not in DROP}
                rr["lc"] = last_checked(r); rr["a"] = aid
                places.append(rr); n += 1
            if n:
                areas.append({"id": aid, "name": f.get("name") or live[aid]["name"], "timezone": f.get("timezone") or live[aid].get("timezone"), "checkedLabel": f.get("checkedLabel", "")})
                area_counties.setdefault(aid, []).append(c["id"])
        pts = [(r["lat"], r["lng"]) for r in places if isinstance(r.get("lat"), (int, float)) and isinstance(r.get("lng"), (int, float))]
        bb = [round(min(p[0] for p in pts), 4), round(min(p[1] for p in pts), 4), round(max(p[0] for p in pts), 4), round(max(p[1] for p in pts), 4)] if pts else None
        ctr = [round(sum(p[0] for p in pts) / len(pts), 4), round(sum(p[1] for p in pts) / len(pts), 4)] if pts else None
        fn = f"data/county/{c['id']}.json"
        out[fn] = dump({"id": c["id"], "name": c["name"], "areas": areas, "restaurants": places}) + "\n"
        counties.append({"id": c["id"], "name": c["name"], "places": len(places), "file": fn, "bb": bb, "c": ctr})
    out["data/index.json"] = dump({"defaultCounty": "lancaster", "counties": counties, "areaCounties": area_counties}) + "\n"
    changed = []
    for fn, s in out.items():
        cur = open(fn, encoding="utf-8").read() if os.path.exists(fn) else None
        if cur != s:
            changed.append(fn)
            if write:
                os.makedirs(os.path.dirname(fn), exist_ok=True); open(fn, "w", encoding="utf-8").write(s)
    stale = []
    if os.path.isdir("data/county"):
        for f in os.listdir("data/county"):
            p = f"data/county/{f}"
            if p not in out:
                stale.append(p)
                if write: os.remove(p)
    return changed, stale, out

if __name__ == "__main__":
    ch, st, out = build()
    print(f"data: {len(out) - 1} County files + index.json ({len(ch)} written, {len(st)} removed)")

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
DROP = {"phoneSource", "county", "state", "zip", "conflicts", "crowdType", "karaoke", "dj", "crowdChecked", "crowdSources"}  # research fields stay in the source data; the app gets the compact ct/kk/dj below
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
CHECKED = re.compile(r"checked (\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2,8} \d{1,2}, \d{4})")

def parse_date(s):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s or "")
    if m: return datetime.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"^([A-Z][a-z]{2})[a-z]* (\d{1,2}), (\d{4})$", s or "")
    if m and m[1] in MONTHS: return datetime.date(int(m[3]), MONTHS.index(m[1]) + 1, int(m[2]))
    return None

def last_checked(r, research_shown=False):
    """newest explicit 'checked <date>' in the place's own source fields or its deals, plus the crowd/karaoke/DJ research
    date when that research put something on the card; only ever moves forward; '' when there is none"""
    best = parse_date(r.get("crowdChecked")) if research_shown else None
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

DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
OK_CONF = ("high", "medium")

def norm_time(t):
    """'9pm-2am' -> '9 pm–2 am', '8 PM' -> '8 pm', '9P' -> '9 pm', '8PM-CLOSE' -> '8 pm–close'; parentheses dropped (kept in the full text)"""
    if not t: return ""
    s = re.sub(r"\s*\(.*?\)", "", t).strip()
    s = re.sub(r"(\d)\s*([AaPp])\.?\s*[Mm]?\.?\b", lambda m: f"{m[1]} {m[2].lower()}m", s)
    s = re.sub(r"\s*(?:-|–|till|to)\s*", "–", s)
    s = re.sub(r":00\b", "", s).replace("CLOSE", "close").replace("Close", "close")
    if re.search(r"[a-z]{3,}", re.sub(r"\b(close|midnight|late)\b", "", s)) or len(s) > 18: return ""  # wordy start: keep it for the full text only
    return s

def when(n):
    """'Thu', '2nd Thu monthly', 'every other Sat', 'Sat, monthly', '1st & 3rd Fri monthly' (cadence never dropped unless weekly)"""
    day = n["day"]; c = (n.get("cadence") or "weekly").lower()
    if c == "weekly": w = day
    elif c.startswith("every other week"): w = f"every other {day}"
    elif m := re.match(r"^((?:\d(?:st|nd|rd|th))(?: & \d(?:st|nd|rd|th))*)\b", c): w = f"{m[1]} {day} monthly"
    elif c == "monthly": w = f"{day}{{t}}, monthly"
    else: w = f"{day}{{t}} ({n.get('cadence')})"
    t = norm_time(n.get("start"))
    if "{t}" in w: return w.replace("{t}", f" {t}" if t else "")
    return f"{w} {t}" if t else w

def nights(o, checked=None):
    out = []
    for n in (o or {}).get("nights") or []:
        if n.get("confidence") not in OK_CONF or n.get("stale") or n.get("day") not in DAYS: continue
        src = (n.get("sources") or [{}])[0]
        x = {"d": DAYS.index(n["day"]), "w": when(n)}
        if n.get("start") and not norm_time(n["start"]): x["t"] = n["start"]  # wordy start shown in Details only
        if src.get("src"): x["s"] = src["src"]
        if src.get("url"): x["u"] = src["url"]
        seen = n.get("datedLastSeen") or src.get("date")
        if seen and checked and seen > checked: seen = checked  # a calendar's future event date -> the day we read it
        if seen: x["seen"] = seen
        if n.get("note"): x["n"] = n["note"]
        out.append(x)
    return sorted(out, key=lambda x: ((x["d"] + 6) % 7, x["w"]))  # Monday first

def crowd_type(ct):
    if not ct or ct.get("confidence") not in OK_CONF: return None
    out = {"l": ct.get("labels") or [], "s": ct.get("summary") or ""}
    ev = [e for dt in ct.get("details") or [] if dt.get("confidence") in OK_CONF for e in dt.get("evidence") or []]
    if ev:
        out["src"] = sorted({e.get("src", "") for e in ev if e.get("src")})[:3]
        u = next((e["url"] for e in ev if e.get("url")), None)
        if u: out["u"] = u
    return out

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
                ct, kk, dj = crowd_type(r.get("crowdType")), nights(r.get("karaoke"), r.get("crowdChecked")), nights(r.get("dj"), r.get("crowdChecked"))
                if ct: rr["ct"] = ct
                if kk: rr["kk"] = kk
                if dj: rr["dj"] = dj
                rr["lc"] = last_checked(r, bool(ct or kk or dj)); rr["a"] = aid
                places.append(rr); n += 1
            if n:
                areas.append({"id": aid, "name": f.get("name") or live[aid]["name"], "timezone": f.get("timezone") or live[aid].get("timezone"), "checkedLabel": f.get("checkedLabel", "")})
                area_counties.setdefault(aid, []).append(c["id"])
        pts = [(r["lat"], r["lng"]) for r in places if isinstance(r.get("lat"), (int, float)) and isinstance(r.get("lng"), (int, float))]
        bb = [round(min(p[0] for p in pts), 4), round(min(p[1] for p in pts), 4), round(max(p[0] for p in pts), 4), round(max(p[1] for p in pts), 4)] if pts else None
        ctr = [round(sum(p[0] for p in pts) / len(pts), 4), round(sum(p[1] for p in pts) / len(pts), 4)] if pts else None
        fn = f"data/county/{c['id']}.json"
        meta = {"label": c.get("label") or f"{c['name']} County", "st": c.get("pickerState") or c.get("state") or "PA", "loc": c.get("state") or "PA"}  # picker State + real state for headings
        out[fn] = dump({"id": c["id"], "name": c["name"], **meta, "areas": areas, "restaurants": places}) + "\n"
        counties.append({"id": c["id"], "name": c["name"], **meta, "places": len(places), "file": fn, "bb": bb, "c": ctr})
    # States for the picker, data-driven from data/cities.json "states": the default County's State first, then A-Z by name;
    # only States that have a County. cityWord (e.g. "Neighborhood" for DC) renames the City picker there.
    names = {s["id"]: s for s in idx.get("states") or []}
    have = {c["st"] for c in counties}
    dflt = next((c["st"] for c in counties if c["id"] == "lancaster"), "PA")
    states = [{"id": st, "name": (names.get(st) or {}).get("name") or st, **({"cityWord": names[st]["cityWord"]} if (names.get(st) or {}).get("cityWord") else {})} for st in have]
    states.sort(key=lambda s: (s["id"] != dflt, s["name"]))
    out["data/index.json"] = dump({"defaultCounty": "lancaster", "states": states, "counties": counties, "areaCounties": area_counties, "countyAliases": idx.get("countyAliases") or {}}) + "\n"
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

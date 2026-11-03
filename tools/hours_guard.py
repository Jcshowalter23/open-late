#!/usr/bin/env python3
"""Hours guard (added Nov 3, 2026, early-close audit).
A day can have several stretches ("Mon 6:30a-10:30a,11:30a-10p"); the closing time that counts is the day's LAST close.
- impossible stretch (fails validation): close equals open (other than 12a-12a), a morning close with a later open
  ("11a-10a", "5p-11a"), an afternoon/evening close before the open ("6p-4p"), or a 4-6 am close after a morning open
  ("7:30a-5:30a" when another day closes 5:30p).
- 9 pm rule (flagged, not failed): a place should close at 9 pm or later on at least one night.
Usage: python3 tools/hours_guard.py [--list]   (exit 1 when any impossible stretch is found)"""
import json, os, re, sys
DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
def pt(t):
    m = re.fullmatch(r"(\d{1,2})(?::(\d\d))?([ap])", t.strip())
    if not m: return None
    return (int(m.group(1)) % 12 + (12 if m.group(3) == "p" else 0)) * 60 + int(m.group(2) or 0)
def pdays(s):
    if s == "Daily": return list(range(7))
    out = []
    for part in s.split(","):
        b = part.split("-")
        if b[0] not in DAYS: continue
        a = DAYS.index(b[0])
        if len(b) == 1: out.append(a); continue
        e = DAYS.index(b[1]) if b[1] in DAYS else a; i = a
        for _ in range(7):
            out.append(i)
            if i == e: break
            i = (i + 1) % 7
    return out
def week(s):
    """array[7]: None = not listed, 'closed', or list of (open, close, text) with close > open (past midnight adds 1440)"""
    arr = [None] * 7; bad = []
    for raw in (s or "").split(";"):
        part = raw.strip()
        if not part: continue
        sp = part.find(" ")
        if sp < 0: bad.append(part); continue
        days, rest = part[:sp], part[sp + 1:].strip()
        if rest == "closed": iv = "closed"
        elif rest == "24h": iv = [(0, 1440, "24h")]
        else:
            iv = []
            for x in rest.split(","):
                oc = x.split("-")
                o, c = (pt(oc[0]), pt(oc[1])) if len(oc) == 2 else (None, None)
                if o is None or c is None: bad.append(part); continue
                iv.append((o, c, x.strip()))
        for d in pdays(days): arr[d] = iv
    return arr, bad
def impossible(o, c, pm_closes=()):
    if o == c: return None if o == 0 else "close equals open"
    if 360 < c <= 720 and o > c: return "morning close with a later open"
    if c >= 720 and c < o: return "noon-or-later close before the open"
    if 240 < c <= 360 and c < o and 300 <= o < 720 and c + 720 in pm_closes: return "4-6 am close after a morning open that matches another day's pm close (pm typed as am)"
    return None
def last_close(iv):
    """the day's last close in minutes from that day's midnight (past midnight > 1440)"""
    return max((c + 1440 if c <= o else c) for o, c, _ in iv)
def check(r):
    w, bad = week(r.get("hours"))
    pm = {c for iv in w if isinstance(iv, list) for o, c, t in iv if c > 720}
    imp = [f"{DAYS[d]} {t}: {why}" for d, iv in enumerate(w) if isinstance(iv, list) for o, c, t in iv for why in [impossible(o, c, pm)] if why]
    imp += [f"unreadable '{b}'" for b in bad]
    # the 9 pm rule uses each day's last close, ignoring impossible stretches
    days = [[s for s in iv if not impossible(s[0], s[1], pm) or s[2] == "24h"] for iv in w if isinstance(iv, list) and iv]
    late = r.get("hours") == "Daily 24h" or any(iv and last_close(iv) >= 1260 for iv in days)
    return imp, (bool(days) and not late)
def run(root=None):
    root = root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    idx = json.load(open(os.path.join(root, "data/cities.json")))
    live = [a for a in idx["areas"] if a.get("status") == "live" and a.get("file")]
    cn = {}
    for c in idx["counties"]:
        for a in c["areas"]: cn.setdefault(a, set()).add(c["name"])
    imp, early = [], []
    for a in live:
        for r in json.load(open(os.path.join(root, a["file"])))["restaurants"]:
            if r.get("county") not in cn.get(a["id"], ()): continue
            i, e = check(r)
            if i: imp.append((a["id"], r.get("name"), r.get("hours"), i))
            if e: early.append((a["id"], r.get("name"), r.get("hours")))
    return imp, early
if __name__ == "__main__":
    imp, early = run()
    print(f"hours guard: {len(imp)} places with impossible closes, {len(early)} places with no night closing at 9 pm or later")
    if "--list" in sys.argv or imp:
        for x in imp: print("IMPOSSIBLE", *x[:3], "|", "; ".join(x[3]))
    if "--list" in sys.argv:
        for x in early: print("EARLY (9 pm rule)", *x)
    sys.exit(1 if imp else 0)

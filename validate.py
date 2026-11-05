#!/usr/bin/env python3
"""Sanity checks for Open Late: data files parse, index references exist, shell assets exist, manifest icons are the right size."""
import json, os, re, shutil, subprocess, sys
from PIL import Image
root = os.path.dirname(os.path.abspath(__file__)); os.chdir(root)
err = []
idx = json.load(open("data/cities.json"))
live = [a for a in idx["areas"] if a.get("status") == "live" and a.get("file")]
ids = {a["id"] for a in live}; total = 0
for a in live:
    if not os.path.exists(a["file"]): err.append(f"missing {a['file']}"); continue
    d = json.load(open(a["file"]))
    for r in d["restaurants"]:
        total += 1
        for k in ("name", "cuisine", "source", "county"):
            if not r.get(k): err.append(f"{a['id']}: {r.get('name')} missing {k}")
amap = {a["id"]: a for a in live}; rcache = {}; total_county = 0
for c in idx["counties"]:
    n = 0
    for aid in c["areas"]:
        if aid not in ids: err.append(f"county {c['id']} references non-live area {aid}"); continue
        if aid not in rcache: rcache[aid] = json.load(open(amap[aid]["file"]))["restaurants"]
        n += sum(1 for r in rcache[aid] if r.get("county") == c["name"])
    if n != c.get("places"): err.append(f"county {c['id']} says {c.get('places')} places but lists {n}")
    total_county += n
_cnt = {(aid, c['name']) for c in idx['counties'] for aid in c['areas']}
for a in live:
    for r in rcache.get(a['id']) or json.load(open(a['file']))['restaurants']:
        if (a['id'], r.get('county')) not in _cnt: err.append(f"{a['id']}: {r.get('id')} has county {r.get('county')!r}, which no county lists for this area (place would be missing from the count)")
sys.path.insert(0, "tools"); import build_data
_ch, _st, _out = build_data.build(write=False)
if _ch or _st: err.append(f"data/county or data/index.json is stale ({len(_ch)} differ, {len(_st)} extra): run python3 tools/build_data.py")
_ix = json.load(open("data/index.json"))
if sum(c["places"] for c in _ix["counties"]) != total_county: err.append("data/index.json place total doesn't match the source data")
sw = open("sw.js").read()
for f in json.loads("[" + re.search(r"SHELL = \[(.*?)\]", sw).group(1) + "]"):
    if f != "./" and not os.path.exists(f.split("?")[0]): err.append(f"sw.js SHELL missing {f}")
m = json.load(open("manifest.webmanifest"))
for i in m["icons"]:
    if not os.path.exists(i["src"]): err.append(f"manifest icon missing {i['src']}"); continue
    if i["src"].endswith(".png"):
        w, h = Image.open(i["src"]).size
        if f"{w}x{h}" != i["sizes"]: err.append(f"{i['src']} is {w}x{h}, manifest says {i['sizes']}")
html = open("index.html").read()
for ref in re.findall(r'(?:href|src)="([^"#:]+)"', html):
    if ref != "./" and not os.path.exists(ref.split("?")[0]): err.append(f"index.html references missing {ref}")
js = open("app.js").read()
for id_ in set(re.findall(r'\$\("([A-Za-z]+)"\)', js)):
    if f'id="{id_}"' not in html: err.append(f'app.js uses #{id_} not in index.html')
# hours guard (Nov 3, 2026): an impossible close (e.g. 11a-11a, 5p-11a, 6p-4p) fails; the 9 pm rule is a warning
import hours_guard, test_hours_guard
if test_hours_guard.main(verbose=False): err.append("tools/test_hours_guard.py failed")
_node = shutil.which("node")
if not _node: print("WARNING: node not found; skipped tools/test_split_src.js")
else:
    _sp = subprocess.run([_node, "tools/test_split_src.js"], capture_output=True, text=True)
    if _sp.returncode: err.append("tools/test_split_src.js failed\n" + (_sp.stdout or "") + (_sp.stderr or ""))
_imp, _early = hours_guard.run(root)
for _a, _n, _h, _why in _imp: err.append(f"{_a}: {_n} has impossible hours ({'; '.join(_why)}): fix from a real source or leave that day unlisted")
if _early: print(f"WARNING: {len(_early)} places have no night closing at 9 pm or later (python3 tools/hours_guard.py --list)")
print(f"{len(live)} live areas, {len(idx['counties'])} counties, {total} places")
if err: print("\n".join(err)); sys.exit(1)
print("OK")

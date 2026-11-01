#!/usr/bin/env python3
"""Sanity checks for Open Late: data files parse, index references exist, shell assets exist, manifest icons are the right size."""
import json, os, re, sys
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
for c in idx["counties"]:
    for aid in c["areas"]:
        if aid not in ids: err.append(f"county {c['id']} references non-live area {aid}")
sw = open("sw.js").read()
for f in json.loads("[" + re.search(r"SHELL = \[(.*?)\]", sw).group(1) + "]"):
    if f != "./" and not os.path.exists(f): err.append(f"sw.js SHELL missing {f}")
m = json.load(open("manifest.webmanifest"))
for i in m["icons"]:
    if not os.path.exists(i["src"]): err.append(f"manifest icon missing {i['src']}"); continue
    if i["src"].endswith(".png"):
        w, h = Image.open(i["src"]).size
        if f"{w}x{h}" != i["sizes"]: err.append(f"{i['src']} is {w}x{h}, manifest says {i['sizes']}")
html = open("index.html").read()
for ref in re.findall(r'(?:href|src)="([^"#:]+)"', html):
    if ref != "./" and not os.path.exists(ref): err.append(f"index.html references missing {ref}")
js = open("app.js").read()
for id_ in set(re.findall(r'\$\("([A-Za-z]+)"\)', js)):
    if f'id="{id_}"' not in html: err.append(f'app.js uses #{id_} not in index.html')
print(f"{len(live)} live areas, {len(idx['counties'])} counties, {total} places")
if err: print("\n".join(err)); sys.exit(1)
print("OK")

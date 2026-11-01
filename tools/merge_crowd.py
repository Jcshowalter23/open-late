#!/usr/bin/env python3
"""Merge crowd-type and karaoke/DJ research into the source data (data/cities/<area>.json).

usage: python3 tools/merge_crowd.py /path/to/findings.jsonl     (rows joined by key "<area>|<place-id>")

Per place it sets (or removes, when the research found nothing):
  crowdType      {labels[], summary, confidence: high|medium, details[{label, confidence, evidence[{type, src, url, quote, date?}]}]}
  karaoke, dj    {nights[{day, cadence, start, confidence, lastSeen, datedLastSeen, sources[{src, url, date, quote}], ...}],
                  stale[], hints[], oneoffs[], conflicts[]}   (everything kept, including low-confidence and stale
                  entries, so the weekly refresh can recheck the sources; the app only shows medium/high, non-stale nights)
  crowdChecked   date this research checked the place (YYYY-MM-DD)
  crowdSources   which sources were read (sourcesChecked)
The existing `crowd` field (busy times) is never touched. Re-running with the same file changes nothing.
crowdChecked only moves forward: an older findings file never overwrites a newer check.
Then run `python3 tools/build_seo.py` (rebuilds data/county/*.json, which carries the display fields)."""
import json, os, sys, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main(path):
    rows = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line: r = json.loads(line); rows[r["key"]] = r
    os.chdir(ROOT)
    seen, changed_files, n = set(), 0, {"crowdType": 0, "karaoke": 0, "dj": 0, "skippedOlder": 0}
    for fn in sorted(glob.glob("data/cities/*.json")):
        raw = open(fn, encoding="utf-8").read(); d = json.loads(raw)
        for r in d.get("restaurants", []):
            k = f"{d['id']}|{r['id']}"
            f = rows.get(k)
            if not f: continue
            seen.add(k)
            if r.get("crowdChecked") and f.get("checked") and r["crowdChecked"] > f["checked"]:
                n["skippedOlder"] += 1; continue
            for fld in ("crowdType", "karaoke", "dj"):
                v = f.get(fld)
                if v: r[fld] = v; n[fld] += 1
                else: r.pop(fld, None)
            if f.get("checked"): r["crowdChecked"] = f["checked"]
            if f.get("sourcesChecked"): r["crowdSources"] = f["sourcesChecked"]
        out = json.dumps(d, indent=1, ensure_ascii=False) + "\n"
        if out != raw:
            open(fn, "w", encoding="utf-8").write(out); changed_files += 1
    missing = sorted(set(rows) - seen)
    print(f"merged {len(seen)} of {len(rows)} findings into {changed_files} area files; with crowdType {n['crowdType']}, karaoke {n['karaoke']}, dj {n['dj']}; skipped (older than data) {n['skippedOlder']}")
    if missing: print(f"{len(missing)} findings have no matching place, e.g. {missing[:5]}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/workspace/crowd/findings.jsonl")

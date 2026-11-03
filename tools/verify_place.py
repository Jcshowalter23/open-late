#!/usr/bin/env python3
"""Mark ONE place "Verified by owner" after Jon has approved that owner's claim by hand.

Nobody else verifies a place: not a script, not a bot, not a crawl. The claim must have come in through the site's
Claim form (FormSubmit email) or directly from the owner, and Jon must have checked who they are.

  python3 tools/verify_place.py --place <placeId> [--area <areaId>] --date 2026-11-05 \
      --by "Jon, claim email from owner Jane Doe (GM), Nov 5, 2026" [--note "Owner confirmed hours and specials"] --approved-by-jon
  python3 tools/verify_place.py --place <placeId> --remove --approved-by-jon     # take the badge off
  add --dry-run to see the change without writing it

Writes `verified: {date, by, note}` on the place in data/cities/<area>.json (every copy of the place if it sits in
more than one area file), keeps every other field, then rebuilds data/county/*.json + data/index.json.
The app shows "✓ Verified by owner" (badge b-vf) and a Details row "Verified by owner: <date>"."""
import argparse, glob, json, os, re, sys, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--place", required=True, help="place id, e.g. pa-tellus360 (the ID the claim form sends)")
    ap.add_argument("--area", help="area id (data/cities/<area>.json); default: every area file that has the place")
    ap.add_argument("--date", default=datetime.date.today().isoformat(), help="YYYY-MM-DD the owner confirmed (default today)")
    ap.add_argument("--by", help="who approved and from what claim (required unless --remove)")
    ap.add_argument("--note", default="", help="optional short note shown in Details")
    ap.add_argument("--remove", action="store_true", help="remove the badge")
    ap.add_argument("--approved-by-jon", action="store_true", help="required: Jon approved this claim manually")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-build", action="store_true", help="skip rebuilding data/county + index.json")
    a = ap.parse_args()
    if not a.approved_by_jon: sys.exit("Refusing: pass --approved-by-jon only after Jon has approved this owner's claim himself.")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a.date): sys.exit("--date must be YYYY-MM-DD")
    if not a.remove and not (a.by or "").strip(): sys.exit("--by is required (who approved, which claim)")
    files = [os.path.join(ROOT, "data/cities", a.area + ".json")] if a.area else sorted(glob.glob(os.path.join(ROOT, "data/cities/*.json")))
    hits = 0
    for f in files:
        if not os.path.exists(f): sys.exit(f"no such area file: {f}")
        raw = open(f, encoding="utf-8").read(); d = json.loads(raw); changed = False
        for r in d["restaurants"]:
            if r.get("id") != a.place: continue
            hits += 1
            before = r.get("verified")
            if a.remove: r.pop("verified", None)
            else: r["verified"] = {"date": a.date, "by": a.by.strip(), **({"note": a.note.strip()} if a.note.strip() else {})}
            changed |= before != r.get("verified")
            print(f"{os.path.relpath(f, ROOT)}: {r['name']} ({r.get('address', '')}) verified: {before} -> {r.get('verified')}")
        if changed and not a.dry_run: open(f, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1))
    if not hits: sys.exit(f"place id {a.place!r} not found" + (f" in {a.area}" if a.area else ""))
    if a.dry_run: print("dry run: nothing written"); return
    if not a.no_build:
        import build_data; build_data.build(); print("rebuilt data/county/*.json and data/index.json")
    print("Not released: review, then release as usual.")

if __name__ == "__main__": main()

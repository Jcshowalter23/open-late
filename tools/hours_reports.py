#!/usr/bin/env python3
"""Turn "Report wrong hours" submissions into rows for Pam's (Secretary Bot) nightly call list.

Reports are sent by the site's existing form (FormSubmit.co -> jcshowalter23@gmail.com), subject
"Open Late · Report wrong hours: <place> (<where>)". Each email lists the fields
type, place, where, what (issues), days, details (note), page, placeKey (<area>|<place id>).

Input: a text file with one or more report emails pasted/exported (plain text), or JSON lines of the
submitted fields. Output: CSV in the same columns as /workspace/calls/call-list.csv, with the place's
current site hours, kitchen hours and phone looked up from data/county/*.json (nothing guessed:
blank when the site has none). Rows with no phone are kept with phone blank so Pam can skip them.

  python3 tools/hours_reports.py reports.txt > /workspace/calls/reports-call-list.csv
"""
import csv, glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLS = ["priority", "place_id", "name", "address", "city", "state", "phone", "timezone", "site_hours", "site_kitchen_hours",
        "missing_or_disputed", "website", "phone_verified_source", "review_count", "review_source", "call_order"]
FIELDS = ["type", "place", "where", "what", "days", "details", "page", "placeKey", "name", "email"]


def parse(text):
    out = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try: out.append(json.loads(line)); continue
            except ValueError: pass
    if out: return out
    # plain-text emails: "field<tab or colon or spaces>value", one block per "type" line
    cur = {}
    for line in text.splitlines():
        m = re.match(r"^\s*(%s)\s*[:\t ]\s*(.*)$" % "|".join(FIELDS), line)
        if not m: continue
        k, v = m.group(1), m.group(2).strip()
        if k == "type" and cur: out.append(cur); cur = {}
        cur[k] = v
    if cur: out.append(cur)
    return [o for o in out if o.get("type", "").startswith("Report wrong hours")]


def index():
    idx = {}
    for f in glob.glob(os.path.join(ROOT, "data/county/*.json")):
        d = json.load(open(f)); tz = {a["id"]: a.get("timezone", "") for a in d["areas"]}
        for r in d["restaurants"]: idx[f"{r['a']}|{r['id']}"] = (r, tz.get(r["a"], ""), d.get("st", ""))
    return idx


def main(path):
    reps = parse(open(path).read()); idx = index(); w = csv.writer(sys.stdout); w.writerow(COLS)
    for n, o in enumerate(reps, 1):
        r, tz, st = idx.get(o.get("placeKey", ""), ({}, "", ""))
        issue = f"Visitor report: {o.get('what') or 'not given'}; days: {o.get('days') or 'not given'}" + (f"; note: {o['details']}" if o.get("details") else "") + ". Call to confirm current hours and kitchen hours."
        w.writerow([1 if "Permanently closed" in (o.get("what") or "") or "Closed now" in (o.get("what") or "") else 2,
                    o.get("placeKey", ""), r.get("name") or o.get("place", ""), r.get("address", ""), (o.get("where") or "").split(",")[0], st,
                    r.get("phone", ""), tz, r.get("hours", ""), r.get("kitchen") or "none listed", issue, r.get("website", ""), "", "", "", n])


if __name__ == "__main__":
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(sys.argv[1])

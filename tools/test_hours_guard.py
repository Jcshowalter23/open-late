#!/usr/bin/env python3
"""Tests for tools/hours_guard.py: split hours and impossible closes (added Nov 3, 2026)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hours_guard as G
CASES = [
    # hours, any impossible?, fails the 9 pm rule?
    ("Mon 11a-11a", True, True),                       # close equals open
    ("Mon 5p-11a; Tue-Sun 5p-11p", True, False),       # morning close with a later open
    ("Mon 6p-4p; Tue-Sun 6p-12a", True, False),        # afternoon close before the open
    ("Mon 7p-12p; Tue-Sun 7p-2a", True, False),        # 12p typed for 12a
    ("Mon 7:30a-5:30a; Tue 7:30a-5:30p", True, True),  # pm typed as am (matches Tue)
    ("Daily 8a-5a", False, False),                     # a real 5 am bar close
    ("Mon 5a-10a,12p-9p", False, False),               # split hours: last close 9p passes
    ("Mon 5a-10a,12p-8p", False, True),                # split hours: last close 8p fails
    ("Mon-Sat 7a-3p; Sun closed", False, True),        # closes before 9 pm every day
    ("Mon-Thu 11a-12a; Fri-Sat 11a-1a; Sun closed", False, False),
    ("Daily 24h", False, False),
    ("Mon 11a-2:30p,5p-10p; Tue closed", False, False),
]
def main(verbose=True):
    bad = 0
    for h, imp, early in CASES:
        i, e = G.check({"hours": h})
        ok = bool(i) == imp and e == early
        if verbose or not ok: print(("PASS" if ok else "FAIL"), h, i, e)
        bad += not ok
    lc = G.last_close(G.week("Mon 5a-10a,12p-9p")[0][1])
    ok = lc == 21 * 60; bad += not ok
    if verbose or not ok: print(("PASS" if ok else "FAIL"), "last close of Mon 5a-10a,12p-9p is 9p:", lc)
    return bad
if __name__ == "__main__": sys.exit(1 if main() else 0)

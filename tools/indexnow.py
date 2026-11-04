#!/usr/bin/env python3
"""IndexNow ping for openlateapp.com (Bing, Yandex, Seznam, Naver... share one endpoint).

Usage:
  python3 tools/indexnow.py URL [URL ...]       ping these URLs
  python3 tools/indexnow.py --sitemap           ping every <loc> in sitemap.xml (max 10,000 per POST, batched)
  python3 tools/indexnow.py --changed [REF]     ping pages whose files changed since git REF (default HEAD~1)
  add --dry-run to print the payload instead of sending

The key file <key>.txt sits at the site root; it must be LIVE on openlateapp.com before any ping,
otherwise IndexNow answers 403. Only run this after a release is live.
"""
import glob, json, os, re, subprocess, sys, urllib.request

HOST = "openlateapp.com"
SITE = f"https://{HOST}"
ENDPOINT = "https://api.indexnow.org/indexnow"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def key():
    ks = [os.path.basename(f)[:-4] for f in glob.glob(os.path.join(ROOT, "*.txt")) if re.fullmatch(r"[0-9a-f]{32}", os.path.basename(f)[:-4])]
    if len(ks) != 1: sys.exit(f"indexnow: expected exactly one <32-hex>.txt key file at the site root, found {len(ks)}")
    return ks[0]


def sitemap_urls():
    return re.findall(r"<loc>([^<]+)</loc>", open(os.path.join(ROOT, "sitemap.xml")).read())


def changed_urls(ref):
    out = subprocess.run(["git", "-C", ROOT, "diff", "--name-only", ref, "HEAD"], capture_output=True, text=True, check=True).stdout.split()
    urls = set()
    for f in out:
        if f.startswith("p/") and f.endswith(".html"): urls.add(f"{SITE}/{f}")
        elif re.fullmatch(r"[a-z0-9-]+/index\.html", f): urls.add(f"{SITE}/{f[:-10]}")
        elif f.startswith("data/county/"):  # a County's places changed: ping its landing page
            cid = f[len("data/county/"):-5]
            if os.path.isdir(os.path.join(ROOT, cid)): urls.add(f"{SITE}/{cid}/")
        elif f == "index.html": urls.add(f"{SITE}/")
    return sorted(urls)


def ping(urls, dry=False):
    k = key()
    urls = [u for u in urls if u.startswith(SITE)]
    if not urls: print("indexnow: nothing to ping"); return 0
    for i in range(0, len(urls), 10000):
        batch = urls[i:i + 10000]
        body = {"host": HOST, "key": k, "keyLocation": f"{SITE}/{k}.txt", "urlList": batch}
        if dry: print(json.dumps({**body, "urlList": batch[:5] + (["..."] if len(batch) > 5 else [])}, indent=1)); continue
        req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as r: print(f"indexnow: {len(batch)} urls -> HTTP {r.status}")
        except urllib.error.HTTPError as e:
            print(f"indexnow: HTTP {e.code} {e.reason} (403 = key file not live yet; 422 = url not on {HOST})"); return 1
    return 0


if __name__ == "__main__":
    a = sys.argv[1:]; dry = "--dry-run" in a; a = [x for x in a if x != "--dry-run"]
    if not a: sys.exit(__doc__)
    if a[0] == "--sitemap": urls = sitemap_urls()
    elif a[0] == "--changed": urls = changed_urls(a[1] if len(a) > 1 else "HEAD~1")
    else: urls = a
    sys.exit(ping(urls, dry))

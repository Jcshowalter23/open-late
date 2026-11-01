#!/usr/bin/env python3
"""Builds the static SEO pages from the data: /<county>-county/index.html (one landing page per County),
/counties/index.html, sitemap.xml and robots.txt. Run after data changes (rel.sh does)."""
import json, os, html, datetime, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(root)
SITE = "https://openlateapp.com"
idx = json.load(open("data/cities.json"))
areas = {a["id"]: a for a in idx["areas"] if a.get("status") == "live" and a.get("file")}
files = {aid: json.load(open(a["file"])) for aid, a in areas.items()}
DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
today = datetime.date.today().isoformat()
e = lambda s: html.escape(str(s), quote=True)
short = lambda n: re.sub(r", PA$", "", n)

def parse_days(s):
    if s == "Daily": return list(range(7))
    out = []
    for part in s.split(","):
        b = part.strip().split("-")
        if b[0] not in DAYS: continue
        a = DAYS.index(b[0])
        if len(b) == 1: out.append(a); continue
        if b[1] not in DAYS: continue
        z = DAYS.index(b[1]); i = a
        for _ in range(7):
            out.append(i)
            if i == z: break
            i = (i + 1) % 7
    return out
def t(x):
    m = re.match(r"^(\d{1,2})(?::(\d\d))?([ap])$", x.strip())
    if not m: return None
    h = int(m.group(1)) % 12 + (12 if m.group(3) == "p" else 0)
    return h * 60 + int(m.group(2) or 0)
def latest(hours, days=(5, 6)):
    """latest close (minutes, may exceed 1440) on the given days, or None"""
    if not hours: return None
    if hours == "Daily 24h": return 3000
    best = None
    for part in hours.split(";"):
        part = part.strip(); sp = part.find(" ")
        if sp < 0: continue
        d, rest = part[:sp], part[sp + 1:].strip()
        if rest in ("closed",) or not set(parse_days(d)) & set(days): continue
        if rest == "24h": return 3000
        for iv in rest.split(","):
            if "-" not in iv: continue
            o, c = iv.split("-", 1); o, c = t(o), t(c)
            if o is None or c is None: continue
            if c <= o: c += 1440
            best = c if best is None else max(best, c)
    return best
def fmt(m):
    if m >= 3000: return "open 24 hours"
    m %= 1440; h, mm = divmod(m, 60); ap = "AM" if h < 12 else "PM"; h12 = h % 12 or 12
    return f"{h12}:{mm:02d} {ap}" if mm else f"{h12} {ap}"

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TV19LZ6FTT"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());

  gtag('config', 'G-TV19LZ6FTT');
</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#14161f">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Open Late">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/icons/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{site}/icons/og-image.png">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/landing.css">
<script src="/config.js"></script>
<script type="application/ld+json">{ld}</script>
</head>
<body class="landing">
<header class="top"><div class="bar"><a class="brand" href="/" aria-label="Open Late home"><img src="/icons/logo.svg" alt="" width="30" height="30"><span class="word">Open <b>Late</b></span></a></div></header>
<main class="lp">
{body}
</main>
<footer class="foot"><p class="small">Hours and specials change often, so call ahead. Sources are named on every place in the live list. Not affiliated with any restaurant. <a href="/counties/">All counties</a> · <a href="/">Open the app</a></p></footer>
</body>
</html>
"""

counties = sorted(idx["counties"], key=lambda c: c["name"])
urls = [(SITE + "/", "1.0"), (SITE + "/counties/", "0.8")]
for c in counties:
    rows = []
    for aid in c["areas"]:
        if aid not in files: continue
        for r in files[aid]["restaurants"]:
            if r.get("county") == c["name"]: rows.append((aid, r))
    if not rows: continue
    n = len(rows)
    cities = {}
    for aid, r in rows: cities[aid] = cities.get(aid, 0) + 1
    city_list = sorted(cities.items(), key=lambda x: short(areas[x[0]]["name"]))
    kit = sum(1 for _, r in rows if r.get("kitchen"))
    hh = sum(1 for _, r in rows if r.get("happyHours"))
    sp = sum(1 for _, r in rows if r.get("specials"))
    wings = sum(1 for _, r in rows if any("wings" in (x.get("tags") or []) for x in (r.get("happyHours") or []) + (r.get("specials") or [])))
    late = []
    for aid, r in rows:
        L = latest(r.get("hours"))
        if L and L > 1380: late.append((L, latest(r.get("kitchen")) or 0, r["name"], short(areas[aid]["name"]), aid, r))
    late.sort(key=lambda x: (-x[0], -x[1], x[2]))
    cid = c["id"]; slug = f"{cid}-county"; url = f"{SITE}/{slug}/"
    app = f"/?county={cid}"
    def _d(l):
        try: return datetime.datetime.strptime(l, "%b %d, %Y")
        except ValueError: return datetime.datetime.min
    labels = sorted({files[a]["checkedLabel"] for a in cities if files[a].get("checkedLabel")}, key=_d)
    checked = labels[-1] if labels else ""
    title = f"Open late in {c['name']} County, PA: bars & restaurants, kitchen hours, specials · Open Late"
    desc = f"{n} restaurants and bars in {c['name']} County, PA: who's open late tonight, kitchen hours, happy hours and wing and beer specials, by City."
    stats = f"{n} places across {len(cities)} {'City' if len(cities) == 1 else 'Cities'}" + (f"; {kit} post kitchen hours" if kit else "") + (f"; {hh} list a happy hour" if hh else "") + (f"; {sp} list weekly specials" if sp else "") + (f"; {wings} have wing deals" if wings else "") + "."
    body = [f'<p class="crumbs"><a href="/counties/">All counties</a> › {e(c["name"])} County</p>',
            f'<h1>Open late in {e(c["name"])} County, PA</h1>',
            f'<p class="lede">Which bars and restaurants in {e(c["name"])} County are still open, whose kitchen is still serving, and today\'s happy hours and wing and beer specials. {e(stats)}</p>',
            f'<p><a class="btn" href="{e(app)}">See who\'s open now in {e(c["name"])} County</a> <a class="btn ghost" href="{e(app)}&amp;view=map">Map</a></p>',
            '<h2>By City</h2><ul class="lp-cities">']
    for aid, k in city_list:
        body.append(f'<li><a href="{e(app)}&amp;area={e(aid)}">{e(short(areas[aid]["name"]))}</a> <span>{k} place{"s" if k != 1 else ""}</span></li>')
        urls.append((f"{SITE}/?county={cid}&area={aid}", "0.6"))
    body.append("</ul>")
    if late:
        body.append(f'<h2>Open latest on Friday and Saturday</h2><p class="small">From each place\'s listed hours. Kitchen = listed kitchen close.</p><ol class="lp-late">')
        for L, K, name, city, aid, r in late[:25]:
            kk = f' · kitchen until {fmt(K)}' if K and K > 1260 else ""
            body.append(f'<li><a href="{e(app)}&amp;area={e(aid)}&amp;place={e(r["id"])}">{e(name)}</a> <span>{e(city)} · {"open 24 hours" if L >= 3000 else "until " + fmt(L)}{kk}</span></li>')
        body.append("</ol>")
    if checked: body.append(f'<p class="small">Data checked {e(checked)}. Anything a source didn\'t publish shows as "not listed" in the app.</p>')
    body.append(f'<p class="small">Know a change? <a href="{e(app)}">Open the list</a> and tap "Suggest an update" on any place, or "Own a bar? Claim your listing" at the bottom.</p>')
    ld = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Open Late", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Counties", "item": SITE + "/counties/"},
        {"@type": "ListItem", "position": 3, "name": f"{c['name']} County", "item": url}]}, separators=(",", ":"))
    os.makedirs(slug, exist_ok=True)
    open(f"{slug}/index.html", "w").write(PAGE.format(title=e(title), desc=e(desc), url=url, site=SITE, ld=ld, body="\n".join(body)))
    urls.insert(2, (url, "0.8"))
# counties index
tot = sum(c["places"] for c in counties)
body = ['<h1>Open late across Pennsylvania, by County</h1>',
        f'<p class="lede">{tot:,} restaurants and bars in all {len(counties)} Pennsylvania counties: hours, kitchen hours, happy hours and wing and beer specials.</p>',
        '<p><a class="btn" href="/">Open the live list</a></p><ul class="lp-cities lp-counties">']
for c in counties:
    body.append(f'<li><a href="/{e(c["id"])}-county/">{e(c["name"])} County</a> <span>{c["places"]} places</span></li>')
body.append("</ul>")
ld = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Open Late", "item": SITE + "/"},
    {"@type": "ListItem", "position": 2, "name": "Counties", "item": SITE + "/counties/"}]}, separators=(",", ":"))
os.makedirs("counties", exist_ok=True)
open("counties/index.html", "w").write(PAGE.format(title="Pennsylvania restaurants & bars open late, by County · Open Late", desc=e(f"Late-night restaurants and bars in all {len(counties)} Pennsylvania counties: who's open now, kitchen hours, happy hours and specials."), url=SITE + "/counties/", site=SITE, ld=ld, body="\n".join(body)))
# sitemap + robots
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
seen = set()
for u, pr in urls:
    if u in seen: continue
    seen.add(u); sm.append(f"  <url><loc>{e(u)}</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>{pr}</priority></url>")
sm.append("</urlset>")
open("sitemap.xml", "w").write("\n".join(sm) + "\n")
open("robots.txt", "w").write(f"User-agent: *\nAllow: /\nDisallow: /tools/\n\nSitemap: {SITE}/sitemap.xml\n")
print(f"seo: {len(counties)} county pages, sitemap {len(seen)} urls")

#!/usr/bin/env python3
"""Builds the static SEO pages from the data: /<county>-county/index.html (one landing page per County),
/counties/index.html, sitemap.xml and robots.txt. Run after data changes (rel.sh does)."""
import json, os, html, datetime, re, sys, glob
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(root)
sys.path.insert(0, os.path.join(root, "tools"))
import build_og, build_data
SITE = "https://openlateapp.com"
idx = json.load(open("data/cities.json"))
areas = {a["id"]: a for a in idx["areas"] if a.get("status") == "live" and a.get("file")}
files = {aid: json.load(open(a["file"])) for aid, a in areas.items()}
DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
today = datetime.date.today().isoformat()
e = lambda s: html.escape(str(s), quote=True)
short = lambda n: re.sub(r"(\S), Baltimore$", r"\1", re.sub(r",? (PA|MD|DE|DC|Washington,? DC)$", "", n))

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
    m %= 1440; h, mm = divmod(m, 60); ap = "am" if h < 12 else "pm"; h12 = h % 12 or 12
    return f"{h12}:{mm:02d} {ap}" if mm else f"{h12} {ap}"

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<script>/* old-style shared links (?area= / ?place=) open the live list */(function(){{var q=new URLSearchParams(location.search);if(q.get("area")||q.get("place")){{q.set("county","{cid}");location.replace("/?"+q.toString()+location.hash);}}}})();</script>
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
<meta property="og:image" content="{site}/{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{imgalt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{site}/{img}">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/landing.css">
<script src="/config.js"></script>
<script type="application/ld+json">{ld}</script>
</head>
<body class="landing">
<aside class="social" aria-label="Follow Open Late on social media"><span class="soc-lbl">Follow Open Late</span><a href="https://www.facebook.com/profile.php?id=61595789025720" target="_blank" rel="noopener" aria-label="Open Late on Facebook"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.7V14h2.7v8z"/></svg></a><a href="https://www.instagram.com/theopenlateapp/" target="_blank" rel="noopener" aria-label="Open Late on Instagram"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg></a><a href="https://x.com/TheOpenLateApp" target="_blank" rel="noopener" aria-label="Open Late on X"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/></svg></a><span class="soc-handle">@theopenlateapp</span></aside><header class="top"><div class="bar"><a class="brand" href="/" aria-label="Open Late home"><img src="/icons/logo.svg" alt="" width="30" height="30"><span class="word">Open <b>Late</b></span></a></div></header>
<main class="lp">
{body}
</main>
<footer class="foot"><p class="small">Hours and specials change often, so call ahead. Sources are named on every place in the live list. Not affiliated with any restaurant. <a href="/counties/">All counties</a> · <a href="/">Open the app</a></p><p class="small">Questions or corrections? <a href="mailto:support@openlateapp.com">support@openlateapp.com</a> · <a href="/privacy.html">Privacy</a></p></footer>
</body>
</html>
"""

counties = sorted(idx["counties"], key=lambda c: c["name"])
og_changed = 0; county_of = {}
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
    cid = c["id"]; slug = f"{cid}-county" if not c.get("state") else cid; url = f"{SITE}/{slug}/"  # MD/DE/DC ids are already state-prefixed (md-washington), so no clash with PA's /washington-county/
    LBL = c.get("label") or f"{c['name']} County"; ST = c.get("state") or "PA"; WHERE = LBL if ST == "DC" else f"{LBL}, {ST}"
    app = f"/?county={cid}"
    def _d(l):
        try: return datetime.datetime.strptime(l, "%b %d, %Y")
        except ValueError: return datetime.datetime.min
    labels = sorted({files[a]["checkedLabel"] for a in cities if files[a].get("checkedLabel")}, key=_d)
    checked = labels[-1] if labels else ""
    title = f"Open late in {WHERE}: bars & restaurants, kitchen hours, specials · Open Late"
    desc = f"{n} restaurants and bars in {WHERE}: who's open late tonight, kitchen hours, happy hours and wing and beer specials, by City."
    stats = f"{n} places across {len(cities)} {'City' if len(cities) == 1 else 'Cities'}" + (f"; {kit} post kitchen hours" if kit else "") + (f"; {hh} list a happy hour" if hh else "") + (f"; {sp} list weekly specials" if sp else "") + (f"; {wings} have wing deals" if wings else "") + "."
    body = [f'<p class="crumbs"><a href="/counties/">All counties</a> › {e(LBL)}</p>',
            f'<h1>Open late in {e(WHERE)}</h1>',
            f'<p class="lede">Which bars and restaurants in {e(LBL)} are still open, whose kitchen is still serving, and today\'s happy hours and wing and beer specials. {e(stats)}</p>',
            f'<p><a class="btn" href="{e(app)}">See who\'s open now in {e(LBL)}</a> <a class="btn ghost" href="{e(app)}&amp;view=map">Map</a></p>',
            '<h2>By City</h2><ul class="lp-cities">']
    for aid, k in city_list:
        body.append(f'<li><a href="{e(app)}&amp;area={e(aid)}">{e(short(areas[aid]["name"]))}</a> <span>{k} place{"s" if k != 1 else ""}</span></li>')
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
        {"@type": "ListItem", "position": 3, "name": LBL, "item": url}]}, separators=(",", ":"))
    os.makedirs(slug, exist_ok=True)
    img = f"icons/og/{cid}.png"
    if build_og.save(build_og.county_image(c["name"], n, len(cities), len(late), hh + sp, title=LBL, url=f"openlateapp.com/{slug}"), img): og_changed += 1
    imgalt = f"Open Late: open late in {WHERE}. {n} bars and restaurants across {len(cities)} {'City' if len(cities) == 1 else 'Cities'}."
    open(f"{slug}/index.html", "w").write(PAGE.format(title=e(title), desc=e(desc), url=url, site=SITE, ld=ld, body="\n".join(body), cid=cid, img=img, imgalt=e(imgalt)))
    county_of[c["name"]] = cid
    urls.insert(2, (url, "0.8"))
# counties index
tot = sum(c["places"] for c in counties)
# region wording comes from the States that have Counties, in the picker's order (data/cities.json "states"), so a new State needs no edit here
_sts = [s for s in idx.get("states") or [{"id": "PA", "name": "Pennsylvania"}] if any((c.get("pickerState") or c.get("state") or c.get("st") or "PA") == s["id"] for c in counties)]
def _join(xs, last): return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + f" {last} " + xs[-1]
REG = "Pennsylvania" if len(_sts) == 1 else _join([("DC" if s["id"] == "DC" else s["name"]) for s in _sts], "&")
REGS = "all 67 Pennsylvania counties" if REG == "Pennsylvania" else _join([s["name"] for s in _sts], "and")
REGA = "PA" if REG == "Pennsylvania" else _join([s["id"] for s in _sts], "&")
body = [f'<h1>Open late across {e(REG)}, by County</h1>',
        f'<p class="lede">{tot:,} restaurants and bars in {len(counties)} counties across {e(REGS)}: hours, kitchen hours, happy hours and wing and beer specials.</p>',
        '<p><a class="btn" href="/">Open the live list</a></p>']
# one group per picker State, in the app's order (data/index.json "states": Pennsylvania first, then A-Z)
ST_NAMES = [(s["id"], s["name"]) for s in json.load(open("data/index.json")).get("states") or []] or [("PA", "Pennsylvania")]
multi = REG != "Pennsylvania"
for st, stn in ST_NAMES:
    cs = [c for c in counties if (c.get("pickerState") or c.get("state") or c.get("st") or "PA") == st]
    if not cs: continue
    if multi: body.append(f'<h2>{e(stn)}</h2>')
    body.append('<ul class="lp-cities lp-counties">')
    for c in cs:
        body.append(f'<li><a href="/{e(c["id"]) + ("" if c.get("state") else "-county")}/">{e(c.get("label") or c["name"] + " County")}</a> <span>{c["places"]} places</span></li>')
    body.append("</ul>")
ld = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Open Late", "item": SITE + "/"},
    {"@type": "ListItem", "position": 2, "name": "Counties", "item": SITE + "/counties/"}]}, separators=(",", ":"))
os.makedirs("counties", exist_ok=True)
if build_og.save(build_og.home_image(tot, len(counties), REGA), "icons/og-image.png"): og_changed += 1
open("counties/index.html", "w").write(PAGE.format(title=f"{REG} restaurants & bars open late, by County · Open Late", desc=e(f"Late-night restaurants and bars in {len(counties)} counties across {REGS}: who's open now, kitchen hours, happy hours and specials."), url=SITE + "/counties/", site=SITE, ld=ld, body="\n".join(body), cid="", img="icons/og-image.png", imgalt="Open Late: a crescent moon logo with the words Open Late. Who's open late, whose kitchen is still serving and tonight's specials, across " + REGS + "."))
# home page + manifest wording follow the same State list, so adding a State needs no hand edit
REGN = "Pennsylvania" if len(_sts) == 1 else _join([("DC" if s["id"] == "DC" else s["name"]) for s in _sts], "and")
def _home_meta():
    import re as _re
    h = open("index.html").read(); h0 = h
    subs = [(r'(<title>Open Late · )[^<]*?( restaurants & bars open late)', REGA),
            (r'(<meta name="description" content="Find restaurants and bars in )[^"]*?( open late tonight)', REGN),
            (r'(Who\'s open late near you in )[^"]*?(")', REGA),
            (r'(specials, across )[^"]*?(\.")', REGN),
            (r'("description":"Restaurants and bars open late in )[^:"]*?(: hours)', REGN)]
    for pat, val in subs: h = _re.sub(pat, lambda m, v=val: m.group(1) + v + m.group(2), h)
    if h != h0: open("index.html", "w").write(h)
    m = open("manifest.webmanifest").read(); m2 = _re.sub(r'(specials across )[^"]*?(\.")', lambda x: x.group(1) + REGN + x.group(2), m)
    if m2 != m: open("manifest.webmanifest", "w").write(m2)
_home_meta()

# Renamed Counties (data/cities.json "countyAliases", e.g. md-washington-dc -> washington-dc): the old landing page
# becomes a redirect to the new one, keeping ?query and #hash (the app maps old ?county= ids itself). Not in the sitemap.
REDIR = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>{label} · Open Late</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="{url}">
<meta http-equiv="refresh" content="0; url={path}">
<script>location.replace({path_js} + location.search + location.hash);</script>
</head><body style="font-family:system-ui,sans-serif;background:#14161f;color:#fff;padding:24px">
<p>Moved: <a style="color:#e8a33d" href="{path}">{label} on Open Late</a></p>
</body></html>
"""
slug_of = lambda c: c["id"] if c.get("state") else f"{c['id']}-county"
for old, new in (idx.get("countyAliases") or {}).items():
    nc = next((c for c in counties if c["id"] == new), None)
    if not nc or os.path.isdir(f"{old}-county") and not nc.get("state"): continue
    os.makedirs(old, exist_ok=True)
    path = f"/{slug_of(nc)}/"
    open(f"{old}/index.html", "w").write(REDIR.format(label=e(nc.get("label") or nc["name"]), url=SITE + path, path=path, path_js=json.dumps(path)))

# Share links: /p/<area>/<place>.html, one tiny page per place whose preview names the place and shows its
# County's image, then opens the live list at that place. noindex (not for search), not in the sitemap.
STUB = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="robots" content="noindex">
<meta name="description" content="{desc}">
<meta name="theme-color" content="#14161f">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Open Late">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{imgalt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{site}/{img}">
<script>location.replace({app_js} + location.hash);</script>
</head><body style="font-family:system-ui,sans-serif;background:#14161f;color:#fff;padding:24px">
<p><a style="color:#e8a33d" href="{app}">{name} on Open Late</a></p>
</body></html>
"""
cid_by_name = {(c.get("state") or "PA", c["name"]): c["id"] for c in counties}  # (state, name): MD has its own Washington, Montgomery, Somerset counties
cby_id = {c["id"]: c for c in counties}
def where(c):  # "Lancaster County, PA", "Baltimore City, MD", "Washington, DC"
    lbl = c.get("label") or f"{c['name']} County"
    return lbl if c.get("state") == "DC" else f"{lbl}, {c.get('state') or 'PA'}"
want = set(); stub_changed = 0
for aid, f in files.items():
    city = short(f["name"])
    for r in f["restaurants"]:
        cid = cid_by_name.get((r.get("state") or "PA", r.get("county")))
        if not cid: continue
        path = f"p/{aid}/{r['id']}.html"; want.add(path)
        app = f"/?county={cid}&area={aid}&place={r['id']}"
        what = (r.get("cuisine") or "Restaurant").strip()
        desc = f"{what} in {city}, {where(cby_id[cid])}. Open now? Kitchen hours, happy hours and specials on Open Late."
        page = STUB.format(title=e(f"{r['name']} · {city}, {r.get('state') or 'PA'} · Open Late"), desc=e(desc), url=f"{SITE}/{path}", site=SITE,
                           img=f"icons/og/{cid}.png", imgalt=e(f"Open Late: open late in {where(cby_id[cid])}"),
                           app=e(app), app_js=json.dumps(app), name=e(r["name"]))
        if not os.path.exists(path) or open(path).read() != page:
            os.makedirs(os.path.dirname(path), exist_ok=True); open(path, "w").write(page); stub_changed += 1
removed = 0
for old in glob.glob("p/*/*.html"):
    if old not in want: os.remove(old); removed += 1
for d in glob.glob("p/*"):
    if os.path.isdir(d) and not os.listdir(d): os.rmdir(d)
# sitemap + robots
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
seen = set()
for u, pr in urls:
    if u in seen: continue
    seen.add(u); sm.append(f"  <url><loc>{e(u)}</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>{pr}</priority></url>")
sm.append("</urlset>")
open("sitemap.xml", "w").write("\n".join(sm) + "\n")
open("robots.txt", "w").write(f"User-agent: *\nAllow: /\nDisallow: /tools/\n\nSitemap: {SITE}/sitemap.xml\n")
print(f"seo: {len(counties)} county pages, sitemap {len(seen)} urls, {len(want)} share pages ({stub_changed} written, {removed} removed), og images changed: {og_changed}")
_dc, _ds, _do = build_data.build()
print(f"data: {len(_do) - 1} County files + index.json ({len(_dc)} written, {len(_ds)} removed)")

#!/usr/bin/env python3
"""Share-preview images (1200x630 PNG): icons/og-image.png (home, all counties) and icons/og/<county>.png
(one per County, with its place and City counts). Called by tools/build_seo.py; only rewrites files whose
pixels changed. Needs Pillow + cairosvg and the Inter font (falls back to DejaVu Sans if Inter is missing)."""
import io, os, glob, hashlib
from PIL import Image, ImageDraw, ImageFont
import cairosvg

NAVY, NAVY2, AMBER, WHITE, MUTED = "#14161f", "#1e2130", "#e8a33d", "#ffffff", "#b9bdcc"
W, H = 1200, 630
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTER = (glob.glob("/usr/share/fonts/**/Inter-VariableFont_opsz,wght.ttf", recursive=True)
         + glob.glob(os.path.expanduser("~/.fonts/**/Inter*.ttf"), recursive=True))
FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def font(size, weight=400):
    if INTER:
        f = ImageFont.truetype(INTER[0], size)
        try: f.set_variation_by_axes([min(32, max(14, size)), weight])
        except Exception: pass
        return f
    return ImageFont.truetype(FALLBACK, size)

MOON = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="{bg}"/>
<clipPath id="c"><path clip-rule="evenodd" d="M-600 -600H1200V1200H-600Z M434 214a128 128 0 1 0 -256 0a128 128 0 1 0 256 0Z"/></clipPath>
<circle cx="236" cy="276" r="150" fill="#e8a33d" clip-path="url(#c)"/>
<path d="M360 118l9 25 25 9-25 9-9 25-9-25-25-9 25-9z" fill="#fff"/><circle cx="398" cy="252" r="9" fill="#fff" opacity=".85"/></svg>'''
_icons = {}
def icon(px, bg=NAVY2):
    if (px, bg) not in _icons:
        png = cairosvg.svg2png(bytestring=MOON.format(bg=bg).encode(), output_width=px, output_height=px)
        _icons[(px, bg)] = Image.open(io.BytesIO(png)).convert("RGBA")
    return _icons[(px, bg)]

def fit(d, text, weight, size, maxw, minsize=40):
    while size > minsize and d.textlength(text, font=font(size, weight)) > maxw: size -= 2
    return font(size, weight)

def base():
    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)
    # quiet amber glow, top right, plus a thin amber rule at the bottom
    glow = Image.new("L", (W, H), 0); g = ImageDraw.Draw(glow)
    for i in range(40):
        r = 520 - i * 12
        g.ellipse((W - 160 - r, -220 - r, W - 160 + r, -220 + r), fill=int(2 + i * 0.55))
    im.paste(Image.new("RGB", (W, H), "#2a2433"), (0, 0), glow)
    d = ImageDraw.Draw(im)
    d.rectangle((0, H - 10, W, H), fill=AMBER)
    return im, d

def wordmark(im, d, x, y, size=44):
    ic = icon(int(size * 1.35)); im.paste(ic, (x, y - int(size * 0.18)), ic)
    f = font(size, 800); tx = x + int(size * 1.35) + 16
    d.text((tx, y), "Open ", font=f, fill=WHITE)
    d.text((tx + d.textlength("Open ", font=f), y), "Late", font=f, fill=AMBER)

def save(im, path):
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True); data = buf.getvalue()
    full = os.path.join(ROOT, path)
    if os.path.exists(full) and hashlib.sha1(open(full, "rb").read()).digest() == hashlib.sha1(data).digest(): return False
    os.makedirs(os.path.dirname(full), exist_ok=True); open(full, "wb").write(data); return True

def home_image(n_places, n_counties):
    im, d = base()
    ic = icon(300); im.paste(ic, (90, 150), ic)
    f = font(124, 800); x = 450
    d.text((x, 150), "Open ", font=f, fill=WHITE); d.text((x + d.textlength("Open ", font=f), 150), "Late", font=f, fill=AMBER)
    f2 = font(40, 500)
    d.text((x + 4, 312), "Who's open late, whose kitchen is", font=f2, fill=MUTED)
    d.text((x + 4, 362), "still serving & tonight's specials", font=f2, fill=MUTED)
    d.text((x + 4, 448), f"openlateapp.com · {n_places:,} places · all {n_counties} PA counties", font=fit(d, f"openlateapp.com · {n_places:,} places · all {n_counties} PA counties", 700, 30, 700, 22), fill=AMBER)
    return im

def county_image(name, n_places, n_cities, n_late, n_deals):
    im, d = base()
    wordmark(im, d, 80, 70, 44)
    title = f"{name} County"
    d.text((80, 190), "Open late in", font=font(46, 500), fill=MUTED)
    tf = fit(d, title, 800, 112, W - 160, 60)
    d.text((76, 250), title, font=tf, fill=WHITE)
    stats = [f"{n_places} bars & restaurants", f"{n_cities} {'City' if n_cities == 1 else 'Cities'}"]
    if n_late: stats.append(f"{n_late} open past 11 PM")
    line = "  ·  ".join(stats)
    d.text((80, 400), line, font=fit(d, line, 600, 40, W - 160, 26), fill=WHITE)
    sub = "Kitchen hours, happy hours, wing & beer specials" if n_deals else "Hours and kitchen hours, by City"
    d.text((80, 458), sub, font=fit(d, sub, 500, 36, W - 160, 24), fill=MUTED)
    url = f"openlateapp.com/{name.lower().replace(' ', '-')}-county"
    d.text((80, 540), url, font=font(32, 700), fill=AMBER)
    return im

if __name__ == "__main__":
    im = county_image("Lancaster", 201, 14, 60, 1); im.save("/tmp/og-test.png")
    home_image(4799, 67).save("/tmp/og-home.png"); print("wrote /tmp/og-test.png /tmp/og-home.png")

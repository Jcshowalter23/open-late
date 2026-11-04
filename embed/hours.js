// Open Late embed helpers: the same hours parsing and open/closed logic as app.js (parseDays, parseT, parseWeek, stateAt, pretty),
// copied verbatim so the widget doesn't load the whole app. Keep in sync with app.js (tools/test_embed.js checks they agree).
(function () {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function parseDays(s) {
    if (s === "Daily") return [0, 1, 2, 3, 4, 5, 6];
    const out = [];
    for (const part of s.split(",")) {
      const bits = part.trim().split("-");
      const a = DAYS.indexOf(bits[0]);
      if (a < 0) continue;
      if (bits.length === 1) { out.push(a); continue; }
      const b = DAYS.indexOf(bits[1]);
      let i = a;
      for (let g = 0; g < 7; g++) { out.push(i); if (i === b) break; i = (i + 1) % 7; }
    }
    return out;
  }
  function parseT(t) {
    const m = /^(\d{1,2})(?::(\d{2}))?([ap])$/.exec(t.trim());
    if (!m) return 0;
    let h = Number(m[1]) % 12;
    if (m[3] === "p") h += 12;
    return h * 60 + (m[2] ? Number(m[2]) : 0);
  }
  function parseWeek(s) {
    const arr = [undefined, undefined, undefined, undefined, undefined, undefined, undefined];
    if (!s) return arr;
    for (const raw of s.split(";")) {
      const part = raw.trim();
      const sp = part.indexOf(" ");
      const days = part.slice(0, sp);
      const rest = part.slice(sp + 1).trim();
      let ivs;
      if (rest === "closed") ivs = null;
      else if (rest === "24h") ivs = [[0, 1440]];
      else ivs = rest.split(",").map((x) => {
        const [o, c] = x.split("-");
        const oo = parseT(o);
        let cc = parseT(c);
        if (cc <= oo) cc += 1440;
        return [oo, cc];
      });
      for (const d of parseDays(days)) arr[d] = ivs;
    }
    return arr;
  }
  function stateAt(w, d, m, is24) {
    if (is24) return { known: true, open: true, close: -1 };
    const today = w[d], yest = w[(d + 6) % 7];
    if (today === undefined && yest === undefined) return { known: false, open: false, close: -1 };
    if (yest) for (const [, c] of yest) if (c > 1440 && m < c - 1440) return { known: true, open: true, close: c - 1440 };
    if (today) for (const [o, c] of today) if (m >= o && m < c) return { known: true, open: true, close: c };
    return { known: today !== undefined, open: false, close: -1 };
  }
  function pretty(s) {
    return s.replace(/(\d{1,2}(?::\d{2})?)([ap])(?=[-,;]|$)/g, "$1 $2m").replace(/-/g, "–").replace(/,/g, ", ").replace(/;/g, " ·").replace(/24h/g, "open 24 hours");
  }
  // lowercase, no leading zero: "1 am", "11:30 pm"
  function fmt(min) {
    const m = ((min % 1440) + 1440) % 1440, h = Math.floor(m / 60), mm = m % 60;
    return `${h % 12 === 0 ? 12 : h % 12}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${h < 12 ? "am" : "pm"}`;
  }
  function cityNow(tz, at) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(at || new Date());
    let wd = "Sun", h = 0, mi = 0;
    for (const p of parts) { if (p.type === "weekday") wd = p.value; if (p.type === "hour") h = Number(p.value) % 24; if (p.type === "minute") mi = Number(p.value); }
    return { d: Math.max(0, DAYS.indexOf(wd)), m: h * 60 + mi };
  }
  const tf = (s) => String(s || "").replace(/\b0?(\d{1,2})(?::(\d\d))?\s*([AaPp])\.?[Mm]\.?(?![a-z])/g, (m, h, mm, ap) => `${Number(h)}${mm && mm !== "00" ? ":" + mm : ""} ${ap.toLowerCase()}m`);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // place lookup: data/county/<cid>.json; returns { r, area, county } or null
  async function loadPlace(base, cid, aid, id) {
    const res = await fetch(`${base}/data/county/${encodeURIComponent(cid)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const r = d.restaurants.find((x) => x.id === id && (!aid || x.a === aid)) || d.restaurants.find((x) => x.id === id);
    if (!r) return null;
    const area = d.areas.find((a) => a.id === r.a) || d.areas[0];
    return { r, area, county: d };
  }
  const listingUrl = (base, r) => `${base}/p/${encodeURIComponent(r.a)}/${encodeURIComponent(r.id)}.html`;
  window.OLH = { DAYS, parseDays, parseWeek, stateAt, pretty, fmt, cityNow, tf, esc, loadPlace, listingUrl };
})();

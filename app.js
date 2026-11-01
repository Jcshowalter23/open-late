"use strict";
(function () {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const VIBES = ["All", "Bar scene", "Date night", "Family-friendly", "Late night", "Live music & events", "Rooftop", "Sports & games"];
  const SUGGEST_TO = "jcshowalter23@gmail.com";
  const $ = (id) => document.getElementById(id);

  // ---------- hours parsing ("Mon-Thu 11a-12a; Fri-Sat 11a-1a; Sun closed", "Daily 24h", "Mon 11a-2p,5p-9p")
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
  // returns array[7]: undefined = not listed, null = closed, [[open,close],...] in minutes (close may exceed 1440)
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
  function lastClose(w, d) { const t = w[d]; return t ? Math.max(...t.map((iv) => iv[1])) : -1; }
  function fmt(min) {
    const m = ((min % 1440) + 1440) % 1440, h = Math.floor(m / 60), mm = m % 60;
    const ap = h < 12 ? "AM" : "PM", h12 = h % 12 === 0 ? 12 : h % 12;
    return mm ? `${h12}:${String(mm).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
  }
  function pretty(s) {
    return s.replace(/(\d{1,2}(?::\d{2})?)([ap])(?=[-,;]|$)/g, "$1 $2m").replace(/-/g, "–").replace(/,/g, ", ").replace(/;/g, " ·").replace(/24h/g, "open 24 hours");
  }
  function cityNow(tz) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    let wd = "Sun", h = 0, mi = 0;
    for (const p of parts) {
      if (p.type === "weekday") wd = p.value;
      if (p.type === "hour") h = Number(p.value) % 24;
      if (p.type === "minute") mi = Number(p.value);
    }
    const d = Math.max(0, DAYS.indexOf(wd));
    return { d, m: h * 60 + mi };
  }
  const tzAbbr = (tz) => (new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName") || {}).value || "";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- state
  let city = null, rows = [], now = { d: 0, m: 0 }, dayTouched = false, shown = 0, loadSeq = 0;
  const ALL = 7; // "Deals: All days"
  const PAGE = 40; // cards per "Show more" step, keeps big counties fast on phones
  const shortArea = (n) => n.replace(/, PA$/, "");

  function prep(r, area) {
    const w = parseWeek(r.hours);
    const k = r.kitchen ? parseWeek(r.kitchen) : null;
    const is24 = r.hours === "Daily 24h";
    const late = w.some((dh) => dh && dh.some((iv) => iv[1] > 1440));
    return { r, w, k, is24, lc: checkedText(lastChecked(r)), vibes: late || is24 ? [...r.vibes, "Late night"] : r.vibes, area: area.id, areaName: shortArea(area.name), checkedLabel: area.checkedLabel };
  }
  function deals(p, d) {
    if (d === ALL) { const g = (list) => (list || []).filter((x) => parseDays(x.days).length); return { hh: g(p.r.happyHours), sp: g(p.r.specials) }; }
    const f = (list) => (list || []).filter((x) => parseDays(x.days).includes(d));
    return { hh: f(p.r.happyHours), sp: f(p.r.specials) };
  }
  const hasTag = (x, t) => Array.isArray(x.tags) && x.tags.includes(t);
  const BADGE = { wings: "🍗 Wings", beer: "🍺 Beer" };
  function dealHtml(x) {
    const b = (x.tags || []).filter((t) => BADGE[t]).map((t) => `<span class="badge b-${t}">${BADGE[t]}</span>`).join("");
    const extra = [x.flag ? `<span class="flag">⚠ ${esc(x.flag)}</span>` : "", x.src ? `<span class="dsrc">(${esc(x.src)}${x.checked ? `, checked ${esc(x.checked)}` : ""})</span>` : ""].filter(Boolean).join(" ");
    return `${dayTag(x)}${dayTag(x) ? " " : ""}${b}${esc(x.text)}${extra ? " " + extra : ""}`;
  }
  function opts(sel, items, keep) {
    const cur = keep ? sel.value : null;
    sel.innerHTML = items.map((o) => typeof o === "string" ? `<option>${esc(o)}</option>` : `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }
  function fillDay() {
    const sel = $("day");
    const prev = sel.value;
    opts(sel, [...DAYS.map((d, i) => ({ value: String(i), label: i === now.d ? "Deals: Today" : `Deals: ${DAYS[i]}` })), { value: String(ALL), label: "Deals: All days" }]);
    sel.value = dayTouched && prev !== "" ? prev : String(now.d);
  }
  function tick() {
    const prevD = now.d;
    now = cityNow(city.timezone);
    $("now").textContent = `${DAYS[now.d]} ${fmt(now.m)} ${tzAbbr(city.timezone)}`;
    $("now").title = `Now in ${city.name}: ${DAY_LONG[now.d]} ${fmt(now.m)} ${tzAbbr(city.timezone)}`;
    if (prevD !== now.d || !$("day").options.length) fillDay();
  }

  const on = (id) => $(id).getAttribute("aria-pressed") === "true";
  const CHIPS = ["tonight", "openNow", "kitchenNow", "onlyDeals", "wingDeals", "beerDeals", "hhDeals", "favsOnly"];
  // favorites live in localStorage as "area|placeId"
  let favs = new Set();
  try { favs = new Set(JSON.parse(localStorage.getItem("openlate.favs") || "[]")); } catch (e) { favs = new Set(); }
  // "Still good?" votes: one per deal per device, kept only on this device; each vote is an anonymous GoatCounter event
  let votes = {};
  try { votes = JSON.parse(localStorage.getItem("openlate.votes") || "{}") || {}; } catch (e) { votes = {}; }
  const saveVotes = () => { try { localStorage.setItem("openlate.votes", JSON.stringify(votes)); } catch (e) { /* private mode */ } };
  const slugify = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const dealId = (kind, i, x) => `${kind}${i}-${slugify(x.text).slice(0, 40)}`;
  function votePath(area, id, did, dir) {
    const head = `deal-vote/${area}/${id}/`, tail = `/${dir}`;
    const room = Math.max(4, 120 - head.length - tail.length);
    return head + did.slice(0, room).replace(/-+$/, "") + tail;
  }
  const saveFavs = () => { try { localStorage.setItem("openlate.favs", JSON.stringify([...favs])); } catch (e) { /* private mode */ } };
  const pkey = (p) => `${p.area}|${p.r.id}`;
  // "Near me": location is asked for only when the user taps Near me (or picks it in Sort), never on load
  let here = null, locating = false;
  function miles(p) {
    if (!here || typeof p.r.lat !== "number" || typeof p.r.lng !== "number") return null;
    const rad = Math.PI / 180, dLa = (p.r.lat - here.lat) * rad, dLo = (p.r.lng - here.lng) * rad;
    const x = Math.sin(dLa / 2) ** 2 + Math.cos(here.lat * rad) * Math.cos(p.r.lat * rad) * Math.sin(dLo / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.sqrt(x));
  }
  const fmtMi = (d) => d < 0.1 ? "< 0.1 mi" : d < 10 ? `${d.toFixed(1)} mi` : `${Math.round(d)} mi`;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function setNear(onOff) {
    $("nearMe").setAttribute("aria-pressed", String(onOff));
    if (onOff) $("sort").value = "near"; else if ($("sort").value === "near") $("sort").value = "smart";
    render();
  }
  function askLocation() {
    if (locating) return;
    if (!navigator.geolocation) { toast("Location isn't available in this browser."); setNear(false); return; }
    locating = true; $("nearMe").classList.add("busy");
    navigator.geolocation.getCurrentPosition((pos) => {
      locating = false; $("nearMe").classList.remove("busy");
      here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setNear(true);
      const miss = rows.filter((p) => typeof p.r.lat !== "number").length;
      toast(miss ? `Sorted by distance · ${miss} place${miss === 1 ? "" : "s"} without a map location are listed last` : "Sorted by distance from you");
      loadNearby().catch(() => { /* nearby counties are a bonus; the current County still sorts */ });
    }, (err) => {
      locating = false; $("nearMe").classList.remove("busy");
      toast(err && err.code === 1 ? "Location permission was denied, so Near me can't sort by distance." : "Couldn't get your location. Try again in a moment.");
      setNear(false);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }
  // happy hour "now": only when the text has a clean time range like "4–6 pm" or "3:30-6:30pm"
  const HH_RE = /(\d{1,2})(?::(\d\d))?\s*(am|pm|a|p)?\s*(?:–|-|to)\s*(\d{1,2})(?::(\d\d))?\s*(am|pm|a|p)\b/i;
  function hhRange(text) {
    const m = HH_RE.exec(text); if (!m) return null;
    const t = (h, mm, ap) => (Number(h) % 12 + (/^p/i.test(ap) ? 12 : 0)) * 60 + Number(mm || 0);
    let end = t(m[4], m[5], m[6]), start = t(m[1], m[2], m[3] || m[6]);
    if (!m[3] && start > end) start = t(m[1], m[2], "a"); // "11–2 pm" means 11 AM to 2 PM
    if (end <= start) end += 1440;
    return [start, end];
  }
  const hhNow = (x) => { const r = hhRange(x.text); return !!r && ((now.m >= r[0] && now.m < r[1]) || (r[1] > 1440 && now.m < r[1] - 1440)); };
  const lateKitchen = (p) => !!(p.k && p.k[now.d] && p.k[now.d].some((iv) => iv[1] > 23 * 60));
  // "Tonight": the evening of today (or of yesterday, between midnight and 5 AM). A place counts when its
  // listed hours for that night run past 11 PM and it hasn't closed yet; kitchen = latest listed kitchen close past 11 PM.
  function tonightInfo(p) {
    const late = now.m < 300, nd = late ? (now.d + 6) % 7 : now.d, rel = late ? now.m + 1440 : now.m;
    if (p.is24) return { close: 3000, kitchen: -1 };
    const t = p.w[nd]; if (!t) return null;
    let close = -1, kc = -1;
    for (const iv of t) if (iv[1] > 1380 && iv[1] > rel) close = Math.max(close, iv[1]);
    if (close < 0) return null;
    const k = p.k && p.k[nd];
    if (k) for (const iv of k) if (iv[1] > 1380 && iv[1] > rel) kc = Math.max(kc, iv[1]);
    return { close, kitchen: kc };
  }
  const track = (name, title) => { try { if (window.olTrack) window.olTrack(name, title); } catch (e) { /* analytics never breaks the app */ } };
  const prettyDays = (s) => s.replace(/-/g, "–").replace(/,/g, "/");
  // deal days in plain words, built only from the days the data lists ("Tue" -> "Every Tuesday", "Sat,Sun" -> "Weekends").
  // Anything that isn't a day list ("See venue", "NFL game days") is shown as written, never guessed.
  const MON_FIRST = (d) => (d + 6) % 7;
  function dayWords(s) {
    if (!s) return "";
    const set = new Set(parseDays(s));
    if (!set.size) return prettyDays(s);
    if (set.size === 7) return "Daily";
    const has = (...ds) => ds.every((d) => set.has(d));
    if (set.size === 2 && has(0, 6)) return "Weekends";
    if (set.size === 5 && has(1, 2, 3, 4, 5)) return "Weekdays";
    if (set.size === 1) return `Every ${DAY_LONG[[...set][0]]}`;
    // runs of consecutive days (wrapping Sat->Sun), Monday-first: 3+ days "Mon–Thu", shorter runs as single days
    let start = 0; while (set.has((start + 6) % 7)) start = (start + 6) % 7; // walk back to a run start
    const runs = []; let cur = null;
    for (let g = 0; g < 7; g++) { const d = (start + g) % 7; if (set.has(d)) { if (cur) cur.push(d); else { cur = [d]; runs.push(cur); } } else cur = null; }
    runs.sort((x, y) => MON_FIRST(x[0]) - MON_FIRST(y[0]));
    const items = [];
    for (const r of runs) { if (r.length >= 3) items.push(`${DAYS[r[0]]}–${DAYS[r[r.length - 1]]}`); else r.forEach((d) => items.push(DAYS[d])); }
    return items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
  }
  const dayTag = (x) => x.days ? `<span class="ddays">${esc(dayWords(x.days))}:</span>` : "";
  // "Checked Oct 31": the newest explicit "checked" date in this place's own source fields (none -> no line)
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function parseDate(s) {
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = /^([A-Z][a-z]{2})[a-z]* (\d{1,2}), (\d{4})$/.exec(s); if (m && MONTHS.includes(m[1])) return new Date(+m[3], MONTHS.indexOf(m[1]), +m[2]);
    return null;
  }
  const CHECKED_RE = /checked (\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2,8} \d{1,2}, \d{4})/g;
  function lastChecked(r) {
    if (r.lc !== undefined) return r.lc ? parseDate(r.lc) : null; // precomputed by tools/build_data.py
    let best = null;
    const see = (d) => { if (d && !isNaN(d) && (!best || d > best)) best = d; };
    for (const k of ["phoneSource", "source", "hoursNote", "kitchenNote"]) { const v = r[k]; if (typeof v === "string") for (const m of v.matchAll(CHECKED_RE)) see(parseDate(m[1])); }
    for (const x of [...(r.happyHours || []), ...(r.specials || [])]) if (x.checked) see(parseDate(x.checked));
    return best;
  }
  const checkedText = (d) => d ? `Checked ${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ""}` : "";
  const openCards = new Set(); // which cards have Details expanded, so the 30-second refresh keeps them open
  function status(p) {
    if (p.is24) return { cls: "s-open", text: "Open 24 hours" };
    const s = stateAt(p.w, now.d, now.m);
    if (s.open) {
      const left = s.close - now.m;
      if (left <= 60) return { cls: "s-soon", text: `Closing soon · ${fmt(s.close)} (${left} min)` };
      return { cls: "s-open", text: `Open until ${fmt(s.close)}` };
    }
    if (!s.known) return { cls: "s-closed", text: "Today's hours not listed" };
    const t = p.w[now.d];
    const next = t ? t.map((iv) => iv[0]).filter((o) => o > now.m).sort((a, b) => a - b)[0] : undefined;
    return { cls: "s-closed", text: next !== undefined ? `Closed · opens ${fmt(next)}` : "Closed now" };
  }
  function filtersActive() {
    return CHIPS.some(on) || $("q").value.trim() !== "" || $("cuisine").value !== "All" || $("price").value !== "All" || $("vibe").value !== "All";
  }
  function clearFilters() {
    CHIPS.forEach((id) => $(id).setAttribute("aria-pressed", "false"));
    $("q").value = ""; $("cuisine").value = "All"; $("price").value = "All"; $("vibe").value = "All";
    setSearchOpen(false);
    render();
  }
  function setSearchOpen(open) {
    $("top").classList.toggle("searching", open);
    $("searchBtn").setAttribute("aria-expanded", String(open));
    if (open) $("q").focus();
  }

  function render(more) {
    const q = $("q").value.trim().toLowerCase();
    const town = $("town").value;
    const cuisine = $("cuisine").value, price = $("price").value, vibe = $("vibe").value;
    const openNow = on("openNow"), kitchenNow = on("kitchenNow"), onlyDeals = on("onlyDeals");
    const wingDeals = on("wingDeals"), beerDeals = on("beerDeals"), hhDeals = on("hhDeals"), favsOnly = on("favsOnly");
    const day = Number($("day").value), sort = $("sort").value, tonight = on("tonight");
    const nearOn = sort === "near" && here && !town && bbNear(county, NEAR_MI); // nearby Counties mix in only when you are in or near the picked one
    const pool = rows.concat([...extra.values()].filter((p) => p.cid !== county.id && ((favsOnly && favs.has(pkey(p))) || (nearOn && (miles(p) ?? 99) <= NEAR_MI))));
    let list = pool.filter((p) => {
      const r = p.r;
      if (town && p.area !== town) return false;
      if (q && !r.name.toLowerCase().includes(q) && !p.areaName.toLowerCase().includes(q)) return false;
      if (cuisine !== "All" && r.cuisine !== cuisine) return false;
      if (price === "none" && r.priceLevel) return false;
      if (price !== "All" && price !== "none" && r.priceLevel !== price) return false;
      if (vibe !== "All" && !p.vibes.includes(vibe)) return false;
      if (tonight && !tonightInfo(p)) return false;
      if (openNow && !stateAt(p.w, now.d, now.m, p.is24).open) return false;
      if (kitchenNow && !(p.k && stateAt(p.k, now.d, now.m).open)) return false;
      if (favsOnly && !favs.has(pkey(p))) return false;
      // the Deals day only matters when a deal filter is on; it never hides places by itself
      if (onlyDeals || wingDeals || beerDeals || hhDeals) {
        const dd = deals(p, day), all = [...dd.hh, ...dd.sp];
        if (onlyDeals && !all.length) return false;
        if (wingDeals && !all.some((x) => hasTag(x, "wings"))) return false;
        if (beerDeals && !all.some((x) => hasTag(x, "beer"))) return false;
        if (hhDeals && !dd.hh.length) return false;
      }
      return true;
    });
    const key = (p) => {
      if (p.is24) return 3000;
      const s = stateAt(p.w, now.d, now.m);
      if (s.open) return s.close < now.m ? s.close + 1440 : s.close;
      return lastClose(p.w, now.d);
    };
    // default "Open now first": open places by close time (24-hour places last in that group),
    // then closed places by next opening (later today first, then tomorrow), then hours not listed
    const smartKey = (p) => {
      if (p.is24) return [0, 3000];
      const s = stateAt(p.w, now.d, now.m);
      if (s.open) return [0, s.close < now.m ? s.close + 1440 : s.close];
      if (!s.known) return [3, 0];
      const t = p.w[now.d], nxt = t ? t.map((iv) => iv[0]).filter((o) => o > now.m) : [];
      if (nxt.length) return [1, Math.min(...nxt)];
      const tm = p.w[(now.d + 1) % 7];
      return tm && tm.length ? [2, Math.min(...tm.map((iv) => iv[0]))] : [2, 9999];
    };
    const dist = sort === "near" && here ? new Map(list.map((p) => [p, miles(p)])) : null;
    const tn = tonight && (sort === "smart" || (sort === "near" && !here)) ? new Map(list.map((p) => { const t = tonightInfo(p); return [p, [t.kitchen > 0 ? 0 : 1, -(t.kitchen > 0 ? t.kitchen : t.close)]]; })) : null;
    const sk = !tn && (sort === "smart" || (sort === "near" && !here)) ? new Map(list.map((p) => [p, smartKey(p)])) : null;
    list.sort((a, b) => {
      if (dist) { const x = dist.get(a), y = dist.get(b); if (x === null || y === null) return x === null && y === null ? a.r.name.localeCompare(b.r.name) : x === null ? 1 : -1; return x - y; }
      if (tn) { const x = tn.get(a), y = tn.get(b); return x[0] - y[0] || x[1] - y[1] || a.r.name.localeCompare(b.r.name); }
      if (sk) { const x = sk.get(a), y = sk.get(b); return x[0] - y[0] || x[1] - y[1] || a.r.name.localeCompare(b.r.name); }
      if (sort === "name") return a.r.name.localeCompare(b.r.name);
      const ka = key(a), kb = key(b);
      if (ka < 0 && kb < 0) return a.r.name.localeCompare(b.r.name);
      if (ka < 0) return 1;
      if (kb < 0) return -1;
      return sort === "late" ? kb - ka : ka - kb;
    });
    // chip + "More filters" state
    $("day").parentElement.classList.toggle("on", day !== now.d);
    const mf = [cuisine !== "All", price !== "All", vibe !== "All", sort !== "smart" && sort !== "near"].filter(Boolean).length;
    $("mfCount").textContent = mf ? `(${mf} on)` : "";
    const kinds = [wingDeals && "wing", beerDeals && "beer", hhDeals && "happy hour"].filter(Boolean).join(" + ");
    const scopeN = town ? rows.filter((p) => p.area === town).length : pool.length;
    $("count").textContent = `${list.length} of ${scopeN} places · ${kinds ? kinds + " deals" : "deals"} for ${day === now.d ? "today" : day === ALL ? "all days" : DAY_LONG[day]}${dist ? " · nearest first" : ""}`;
    const nLk = tonight ? list.filter((p) => tonightInfo(p).kitchen > 0).length : 0;
    $("tonightNote").hidden = !tonight || !list.length;
    if (tonight) $("tonightNote").textContent = `🌙 Open past 11 PM tonight · ${nLk ? `${nLk} with food after 11 PM listed first` : "no late kitchen hours listed here"}${dist ? " (Near me sorts by distance)" : ""}.`;
    lastList = list;
    // empty state
    const active = filtersActive();
    const placeName = town ? $("town").selectedOptions[0].dataset.name : `${county.name} County`;
    $("empty").hidden = list.length > 0;
    if (!list.length) {
      let why = active ? `No places in ${placeName} match these filters` : `No places listed in ${placeName} yet`;
      if (tonight && !q && !wingDeals && !beerDeals && !hhDeals && !onlyDeals && !kitchenNow && !favsOnly && !openNow) why = `Nothing in ${placeName} is listed as open past 11 PM tonight`;
      if (openNow && !tonight && !q && !wingDeals && !beerDeals && !hhDeals && !onlyDeals && !kitchenNow && !favsOnly) why = `Nothing in ${placeName} is open right now`;
      if (favsOnly && !favs.size) why = "No favorites yet";
      else if (favsOnly && extraLoading) why = "Loading your favorites from other counties…";
      $("emptyTitle").textContent = why + ".";
      $("emptyText").textContent = why.includes("past 11 PM") ? `Only places with posted hours can show here. Try ${town ? "the whole county, " : ""}a neighboring county, or turn off Tonight.` : favsOnly && !list.length && why.startsWith("No favorites") ? "Tap the ♡ on any place to save it here. Favorites stay on this device." : town ? `Try the whole county, or ${active ? "clear the filters" : "pick another city"}.` : (active ? "Try clearing the filters or picking another day." : "Try a neighboring county.");
      $("clearFilters").hidden = !active;
      $("seeCounty").hidden = !town;
      $("seeCounty").textContent = `See all of ${county.name} County`;
    }
    const prev = more ? shown : 0;
    shown = more ? Math.min(list.length, shown + PAGE) : Math.min(list.length, PAGE);
    const left = list.length - shown;
    $("more").hidden = left <= 0 || view === "map";
    $("more").textContent = `Show ${Math.min(PAGE, left)} more (${left} left)`;
    const NL = "not listed";
    const d3 = day === ALL ? "All days" : DAYS[day], dayWord = day === now.d ? "Today" : day === ALL ? "All days" : DAY_LONG[day];
    const html = list.slice(prev, shown).map((p) => {
      const r = p.r, st = status(p), dd = deals(p, day), all = [...dd.hh, ...dd.sp];
      const ck = pkey(p), fav = favs.has(ck), mi = here ? miles(p) : null;
      let kline = "";
      if (p.k) { const ks = stateAt(p.k, now.d, now.m); kline = ks.open ? `<span class="kitchen k-open">Kitchen until ${fmt(ks.close)}</span>` : `<span class="kitchen">Kitchen closed</span>`; }
      // one compact deal line: the top deal (matching the active deal chips first), plus "+N more" (the rest are in Details)
      const pick = all.filter((x) => (wingDeals && hasTag(x, "wings")) || (beerDeals && hasTag(x, "beer")) || (hhDeals && dd.hh.includes(x)));
      const isToday = day === now.d, live = isToday ? dd.hh.filter(hhNow) : [];
      if (hhDeals && live.length) pick.unshift(live[0]);
      const top = pick[0] || all.find((x) => hasTag(x, "wings") || hasTag(x, "beer")) || dd.hh[0] || dd.sp[0];
      let dline = "";
      if (top) {
        const kind = hasTag(top, "wings") ? ["b-wings", "🍗 Wings"] : hasTag(top, "beer") ? ["b-beer", "🍺 Beer"] : dd.hh.includes(top) ? ["b-hh", "Happy hour"] : ["b-sp", "Special"];
        const n = all.length - 1;
        const nowPill = live.length ? `<span class="badge b-now">${live.includes(top) ? "Now" : "HH now"}</span>` : "";
        dline = `<div class="dline" aria-label="${dayWord} deals">${day !== now.d && day !== ALL ? `<span class="bday">${esc(d3)}</span>` : ""}<span class="badge ${kind[0]}">${kind[1]}</span>${nowPill}<span class="dtext">${top.days ? `<b class="ddays">${esc(dayWords(top.days))}:</b> ` : ""}${esc(top.text)}${top.flag ? ` <span class="flag" title="${esc(top.flag)}">⚠</span>` : ""}</span>${n > 0 ? `<span class="dmore">+${n} more</span>` : ""}</div>`;
      }
      const meta = [r.cuisine, r.priceLevel].filter(Boolean).map(esc).join(" · ");
      const thumbs = (kind, i, x) => {
        const did = dealId(kind, i, x), v = votes[`${p.area}|${r.id}|${did}`];
        return `<span class="vote" data-deal="${esc(did)}" data-dtext="${esc(x.text)}">${v ? `<span class="vthanks">${v === "up" ? "👍" : "👎"} Thanks!</span>` : `<span class="vq">Still good?</span><button type="button" class="vbtn" data-act="vote" data-dir="up" aria-label="Yes, this deal is still good">👍</button><button type="button" class="vbtn" data-act="vote" data-dir="down" aria-label="No, this deal looks out of date">👎</button>`}</span>`;
      };
      const wkList = (list, kind) => list && list.length ? `<ul class="wk">${list.map((x, i) => `<li>${dealHtml(x)}${thumbs(kind, i, x)}</li>`).join("")}</ul>` : "";
      const weekly = wkList(r.specials, "s"), weeklyHH = wkList(r.happyHours, "h");
      const where = `${r.name}, ${r.address ? r.address + ", " : ""}${p.areaName}, PA`;
      const dirs = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`;
      const reviews = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
      const tel = r.phone ? r.phone.replace(/[^0-9+]/g, "") : "";
      const maps = r.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name}, ${r.address}, ${p.areaName}, PA`)}` : "";
      const top2 = [town ? "" : esc(p.cn && !p.areaName.includes(`${p.cn} County`) ? `${p.areaName}, ${p.cn} County` : p.areaName), mi !== null ? `<span class="mi">${fmtMi(mi)}</span>` : ""].filter(Boolean).join(" · ");
      return `<article class="card${tonight && tonightInfo(p).kitchen > 0 ? " card-lk" : ""}" data-key="${esc(ck)}">
        <button type="button" class="fav" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? "Remove from" : "Add to"} favorites: ${esc(r.name)}">${fav ? "♥" : "♡"}</button>
        ${top2 ? `<div class="town">${top2}</div>` : ""}
        <h2>${esc(r.name)}${meta ? ` <span class="meta">${meta}</span>` : ""}</h2>
        <div class="status ${st.cls}"><span class="dot" aria-hidden="true"></span><span>${esc(st.text)}</span>${kline}${tonight ? (tonightInfo(p).kitchen > 0 ? `<span class="lk lk-t" title="Kitchen open past 11 PM tonight (per listed kitchen hours)">🍔 Food till ${fmt(tonightInfo(p).kitchen)}</span>` : "") : lateKitchen(p) ? `<span class="lk" title="Kitchen open past 11 PM today (per listed kitchen hours)">Late kitchen</span>` : ""}</div>
        ${dline}
        ${p.lc ? `<div class="lchk">${esc(p.lc)}</div>` : ""}
        <details class="more-info" data-key="${esc(ck)}"${openCards.has(ck) ? " open" : ""}>
          <summary>Details</summary>
          <div class="info">
            <div class="row">${esc(r.cuisine)} · ${r.priceLevel ? esc(r.priceText) : "Price not listed"}</div>
            <div class="row"><b>Address:</b> ${r.address ? `<a href="${esc(maps)}" target="_blank" rel="noopener">${esc(r.address)}</a>` : NL}</div>
            <div class="row"><b>Hours:</b> ${r.hours ? esc(pretty(r.hours)) : NL}${r.hoursNote ? ` — ${esc(r.hoursNote)}` : ""}</div>
            <div class="row"><b>Kitchen:</b> ${r.kitchen ? esc(pretty(r.kitchen)) : NL}${r.kitchenNote ? ` — ${esc(r.kitchenNote)}` : ""}</div>
            <div class="row"><b>${d3} happy hour:</b> <span class="deal">${dd.hh.length ? dd.hh.map(dealHtml).join("; ") : NL}</span></div>
            <div class="row"><b>${d3} specials:</b> <span class="deal">${dd.sp.length ? dd.sp.map(dealHtml).join("; ") : NL}</span></div>
            ${weeklyHH ? `<div class="row"><b>Happy hours all week:</b>${weeklyHH}</div>` : ""}
            ${weekly ? `<div class="row"><b>Specials all week:</b>${weekly}</div>` : ""}
            <div class="row"><b>Crowd:</b> ${r.crowd ? esc(r.crowd) : NL}</div>
            <div class="src">Source: ${esc(r.source)} · checked ${esc(p.checkedLabel)}</div>
            <div class="actions">
              <a class="act" href="${esc(dirs)}" target="_blank" rel="noopener">Directions</a>
              ${tel ? `<a class="act" href="tel:${esc(tel)}">Call</a>` : ""}
              <a class="act" href="${esc(reviews)}" target="_blank" rel="noopener">Reviews</a>
              <button type="button" class="act" data-act="share">Share</button>
            </div>
            ${r.phone ? `<div class="row"><b>Phone:</b> <a href="tel:${esc(tel)}">${esc(r.phone)}</a></div>` : ""}
            <div class="links">${r.website ? `<a href="${esc(r.website)}" target="_blank" rel="noopener">Website</a>` : `<span class="row"><b>Website:</b> ${NL}</span>`}
              <a href="${esc(mailto(r.name, p.areaName))}" data-act="suggest">Suggest an update</a>
              <a href="${esc(mailto(r.name, p.areaName))}" data-act="claim">Own it? Claim this listing</a></div>
          </div>
        </details>
      </article>`;
    }).join("");
    if (more) $("list").insertAdjacentHTML("beforeend", html); else $("list").innerHTML = html;
    if (view === "map" && map) drawMap(false);
  }

  // ---------- Map view (Leaflet + OpenStreetMap tiles, loaded only the first time Map is opened)
  let view = "list", map = null, mapLayer = null, leafletP = null, lastList = [], mapSig = "", popKey = "", markers = new Map();
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise((res, rej) => {
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "vendor/leaflet/leaflet.css"; document.head.appendChild(l);
      const sc = document.createElement("script"); sc.src = "vendor/leaflet/leaflet.js";
      sc.onload = () => (window.L ? res(window.L) : rej(new Error("Leaflet missing")));
      sc.onerror = () => { leafletP = null; rej(new Error("Leaflet failed to load")); };
      document.head.appendChild(sc);
    });
    return leafletP;
  }
  const PIN = { "s-open": "#1f8a4c", "s-soon": "#e08a00", "s-closed": "#8b8580" };
  function popupHtml(p) {
    const st = status(p), dd = deals(p, now.d), top = [...dd.hh, ...dd.sp][0], t = on("tonight") ? tonightInfo(p) : null;
    return `<div class="mp"><b class="mp-n">${esc(p.r.name)}</b><div class="mp-m">${esc([p.r.cuisine, p.areaName].filter(Boolean).join(" · "))}</div>
      <div class="mp-s ${st.cls}"><span class="dot" aria-hidden="true"></span>${esc(st.text)}</div>
      ${t && t.kitchen > 0 ? `<div class="mp-k">🍔 Food till ${fmt(t.kitchen)}</div>` : ""}
      ${top ? `<div class="mp-d">${esc(top.text.length > 90 ? top.text.slice(0, 88) + "…" : top.text)}</div>` : ""}
      <button type="button" class="act mp-btn" data-mopen="${esc(pkey(p))}">Details</button></div>`;
  }
  function drawMap(fit) {
    if (!map || !window.L) return;
    const L = window.L, pts = lastList.filter((p) => typeof p.r.lat === "number" && typeof p.r.lng === "number");
    mapLayer.clearLayers(); markers = new Map();
    const rank = { "s-closed": 0, "s-soon": 1, "s-open": 2 };
    const withSt = pts.map((p) => [p, status(p)]).sort((a, b) => (rank[a[1].cls] || 0) - (rank[b[1].cls] || 0));
    for (const [p, st] of withSt) {
      const key = pkey(p);
      const m = L.circleMarker([p.r.lat, p.r.lng], { radius: st.cls === "s-closed" ? 6 : 8, color: "#fff", weight: 2, fillColor: PIN[st.cls] || PIN["s-closed"], fillOpacity: 0.95 });
      m.bindPopup(() => popupHtml(p), { maxWidth: 260, minWidth: 180 });
      m.bindTooltip(p.r.name, { direction: "top", offset: [0, -6] });
      m.on("popupopen", () => { popKey = key; }); m.on("popupclose", () => { if (popKey === key) popKey = ""; });
      m.addTo(mapLayer); markers.set(key, m);
    }
    if (here) L.circleMarker([here.lat, here.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2f6fe4", fillOpacity: 1 }).bindTooltip("You are here").addTo(mapLayer);
    const miss = lastList.length - pts.length;
    $("mapMiss").textContent = miss ? `${miss} place${miss === 1 ? "" : "s"} without a map location ${miss === 1 ? "isn't" : "aren't"} shown` : "";
    const sig = pts.map(pkey).join(",") + (here && on("nearMe") ? "|near" : "");
    if (fit || sig !== mapSig) {
      mapSig = sig;
      if (here && on("nearMe")) map.setView([here.lat, here.lng], 13);
      else if (pts.length === 1) map.setView([pts[0].r.lat, pts[0].r.lng], 15);
      else if (pts.length) map.fitBounds(L.latLngBounds(pts.map((p) => [p.r.lat, p.r.lng])), { padding: [24, 24], maxZoom: 15 });
      else map.setView([40.9, -77.7], 7);
    } else if (popKey && markers.has(popKey)) markers.get(popKey).openPopup();
  }
  function setView(v, opts) {
    const was = view; view = v;
    try { localStorage.setItem("openlate.view", v); } catch (e) { /* private mode */ }
    $("viewList").setAttribute("aria-pressed", String(v === "list"));
    $("viewMap").setAttribute("aria-pressed", String(v === "map"));
    document.body.classList.toggle("mapmode", v === "map");
    $("mapwrap").hidden = v !== "map";
    $("list").hidden = v === "map";
    if (v === "list") { render(); if (was === "map" && !(opts && opts.noScroll)) window.scrollTo(0, 0); return; }
    track("view/map", "Map opened");
    $("more").hidden = true;
    if (!(opts && opts.noScroll)) requestAnimationFrame(() => { const top = $("mapwrap").getBoundingClientRect().top + window.scrollY - $("top").offsetHeight - 8; window.scrollTo(0, Math.max(0, top)); });
    loadLeaflet().then((L) => {
      if (!map) {
        map = L.map("map", { preferCanvas: true, zoomControl: true, scrollWheelZoom: true });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);
        mapLayer = L.layerGroup().addTo(map);
        $("map").addEventListener("click", (e) => {
          const b = e.target.closest("[data-mopen]"); if (!b) return;
          const p = findKey(b.dataset.mopen);
          setView("list", { noScroll: true }); if (p) openPlace(p.r.id, p.area);
        });
      }
      map.invalidateSize();
      drawMap(true);
    }).catch(() => { toast("Couldn't load the map. Check your connection and try again."); setView("list"); });
  }

  // ---------- Suggest an update / Claim your listing / Add a place form (FormSubmit.co AJAX, see config.js)
  let formCtx = { mode: "suggest" };
  const CFG = window.OPENLATE_CONFIG || {};
  function openForm(mode, p) {
    const f = $("sForm"); f.reset();
    const townName = $("town").value && $("town").selectedOptions[0] ? $("town").selectedOptions[0].dataset.name : "";
    const where = p ? `${p.areaName}, ${county.name} County` : county ? (townName ? `${townName}, ${county.name} County` : `${county.name} County`) : "";
    formCtx = { mode, key: p ? pkey(p) : "", url: p ? placeUrl(p) : location.href };
    $("fTitle").textContent = mode === "claim" ? "Claim your listing" : mode === "add" ? "Add a place" : "Suggest an update";
    $("fSub").textContent = mode === "claim" ? "Own or work at this place? Tell us who you are and what to fix. We'll email you to confirm, then keep your hours and specials current." : mode === "add" ? "Know a restaurant or bar we're missing? Send what you know. We check it against a source before it goes live." : "Tell us what's wrong or missing. We check every change against a source before it goes live.";
    $("fPlace").value = p ? p.r.name : "";
    $("fWhere").value = where;
    $("fAddrRow").hidden = mode !== "add";
    $("fWhatSet").hidden = mode === "add";
    $("fOwn").checked = mode === "claim";
    $("fDetailsLbl").textContent = mode === "add" ? "Hours, kitchen hours, specials, phone, website (whatever you know)" : mode === "claim" ? "What should we update? (hours, kitchen hours, happy hour, specials, phone)" : "Details";
    $("fEmail").previousElementSibling.textContent = mode === "claim" ? "Email (so we can confirm you)" : "Email (optional, only to follow up)";
    $("fMsg").textContent = ""; $("fMsg").className = "fmsg"; $("fSend").disabled = false;
    const d = $("formDlg");
    if (typeof d.showModal === "function") { if (!d.open) d.showModal(); } else d.setAttribute("open", "");
    setTimeout(() => (p ? $("fDetails") : $("fPlace")).focus(), 30);
  }
  function closeForm() { const d = $("formDlg"); if (typeof d.close === "function" && d.open) d.close(); else d.removeAttribute("open"); }
  function formMailto(o) {
    const body = `Type: ${o.type}\nPlace: ${o.place}\nCity and County: ${o.where}\n${o.address ? `Address: ${o.address}\n` : ""}What's wrong or missing: ${o.what || "-"}\nI own or work here: ${o.owner}\n\n${o.details}\n\nName: ${o.name}\nEmail: ${o.email}\nPage: ${o.page}\n`;
    return `mailto:${SUGGEST_TO}?subject=${encodeURIComponent(o._subject)}&body=${encodeURIComponent(body)}`;
  }
  async function sendForm(e) {
    e.preventDefault();
    const msg = $("fMsg"), what = [...document.querySelectorAll('#sForm input[name="what"]:checked')].map((x) => x.value);
    const place = $("fPlace").value.trim(), details = $("fDetails").value.trim(), email = $("fEmail").value.trim();
    const say = (t, cls, link) => { msg.className = "fmsg " + (cls || ""); msg.textContent = t; if (link) { const a = document.createElement("a"); a.href = link; a.textContent = "Email it instead"; msg.append(" ", a); } };
    if (!place) { say("Please enter the place's name.", "err"); $("fPlace").focus(); return; }
    if (!details && !what.includes("Closed")) { say("Please add a few details.", "err"); $("fDetails").focus(); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say("That email doesn't look right (or leave it empty).", "err"); $("fEmail").focus(); return; }
    if ($("fOwn").checked && !email) { say("Please add an email so we can confirm you own or work here.", "err"); $("fEmail").focus(); return; }
    const type = $("fOwn").checked ? "Claim listing" : formCtx.mode === "add" ? "Add a place" : "Suggest an update";
    const o = { _subject: `Open Late · ${type}: ${place} (${$("fWhere").value.trim() || "PA"})`, _template: "table", _captcha: "false",
      type, place, where: $("fWhere").value.trim(), address: $("fAddr").value.trim(), what: what.join(", "), details,
      name: $("fName").value.trim(), email, owner: $("fOwn").checked ? "Yes" : "No", page: formCtx.url, placeKey: formCtx.key };
    if (email) o._replyto = email;
    if ($("fHoney").value) { say("Thanks! Sent.", "ok"); setTimeout(closeForm, 1500); return; } // bots fill the hidden field; drop silently
    if (!CFG.formEndpoint) { say("The form isn't set up yet.", "err", formMailto(o)); return; }
    $("fSend").disabled = true; say("Sending…");
    try {
      const res = await fetch(CFG.formEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(o) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && String(j.success) === "true") {
        say("Thanks! Sent. We check every change against a source before it goes live.", "ok");
        track(`form/${formCtx.mode === "add" ? "add" : $("fOwn").checked ? "claim" : "suggest"}`, "Form sent");
        setTimeout(closeForm, 2600);
      } else {
        $("fSend").disabled = false;
        const m = String(j.message || "").trim();
        if (/activat/i.test(m)) say("The form isn't switched on yet: the site owner has to click the activation email from FormSubmit first. Your message wasn't sent.", "err", formMailto(o));
        else say(`Couldn't send: ${m || (res.ok ? "the form service didn't confirm it" : "the form service answered " + res.status)}.`, "err", formMailto(o));
      }
    } catch (err) { $("fSend").disabled = false; say(navigator.onLine === false ? "Couldn't send: you're offline." : `Couldn't reach the form service (${(err && err.message) || "network error"}).`, "err", formMailto(o)); }
  }

  function placeUrl(p) {
    return `${location.origin}${location.pathname}?county=${encodeURIComponent(county.id)}&area=${encodeURIComponent(p.area)}&place=${encodeURIComponent(p.r.id)}`;
  }
  // share links go to /p/<area>/<place>.html: a tiny static page whose link preview names the place (with its
  // County's image) and then opens this list at that place (tools/build_seo.py writes them)
  const shareUrl = (p) => `${location.origin}/p/${encodeURIComponent(p.area)}/${encodeURIComponent(p.r.id)}.html`;
  async function share(p) {
    const url = shareUrl(p), title = `${p.r.name} · Open Late`;
    if (navigator.share) { try { await navigator.share({ title, text: `${p.r.name} (${p.areaName})`, url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); }
    catch (e) { window.prompt("Copy this link:", url); }
  }
  // ?place=<id> deep link: page through results until that card shows, open its Details, scroll to it
  function openPlace(id, areaId) {
    const all = rows.concat([...extra.values()]);
    const p = all.find((x) => x.r.id === id && (!areaId || x.area === areaId)) || all.find((x) => x.r.id === id);
    if (!p) return;
    const key = pkey(p);
    openCards.add(key);
    render();
    const find = () => [...$("list").querySelectorAll(".card")].find((c) => c.dataset.key === key);
    while (!find() && !$("more").hidden) render(true);
    let el = find();
    if (!el && filtersActive()) { clearFilters(); while (!find() && !$("more").hidden) render(true); el = find(); }
    if (!el) return;
    el.classList.add("flash");
    if (el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function mailto(place, where) {
    const cn = where || (city ? city.name : "");
    const subj = place ? `Open Late update: ${place} (${cn})` : `Open Late update (${cn})`;
    const body = `Restaurant name: ${place || ""}\nCity: ${cn}\n\nWhat should change? (hours, kitchen closing time, specials, happy hour, crowd, website)\n\n\nWhere did you see it? (link, menu photo, or "I work there")\n\n\nYour name (optional):\n`;
    return `mailto:${SUGGEST_TO}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  }

  // Selection = one county (always) + optional town/area inside it. Places are tagged with their own county,
  // so an area that straddles a line shows only this county's places and can appear under several counties.
  // Data: data/index.json (every County, small) + data/county/<id>.json (one County's places), built by tools/build_data.py.
  // Only the picked County loads; other Counties load on demand for favorites and Near me and show as extras.
  let index = null, county = null, extraLoading = false;
  const NEAR_MI = 10;
  const countyById = (id) => index.counties.find((c) => c.id === (id || "").toLowerCase());
  const primaryCounty = (aid) => { const cs = index.areaCounties[aid]; return cs && countyById(cs[0]); };
  const countyData = new Map(); // id -> Promise of the County file
  const extra = new Map(); // pkey -> prepped place from another County
  function getJSON(url) { return fetch(url, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); }); }
  function getCounty(cid) {
    if (!countyData.has(cid)) {
      const c = countyById(cid), pre = window.__olPre; // index.html starts the likely County's fetch before app.js loads
      const pr = pre && pre.id === cid ? pre.p.catch(() => getJSON(c.file)) : getJSON(c.file);
      if (pre && pre.id === cid) window.__olPre = null;
      countyData.set(cid, pr.catch((e) => { countyData.delete(cid); throw e; }));
    }
    return countyData.get(cid);
  }
  function areaMap(d) { const m = new Map(); for (const a of d.areas) m.set(a.id, a); return m; }
  function addExtras(d, keep) {
    if (county && d.id === county.id) return 0;
    const am = areaMap(d); let n = 0;
    for (const r of d.restaurants) {
      const k = `${r.a}|${r.id}`;
      if (extra.has(k) || !keep(r, k)) continue;
      const p = prep(r, am.get(r.a)); p.cid = d.id; p.cn = d.name; extra.set(k, p); n++;
    }
    return n;
  }
  const findKey = (k) => rows.find((x) => pkey(x) === k) || extra.get(k);
  // Favorites saved in other Counties: load just the Counties they live in
  async function loadFavExtras() {
    const cids = new Set();
    for (const k of favs) { if (findKey(k)) continue; for (const c of index.areaCounties[k.split("|")[0]] || []) if (county && c !== county.id) cids.add(c); }
    if (!cids.size) return;
    extraLoading = true; render();
    try { (await Promise.allSettled([...cids].map(getCounty))).forEach((x) => { if (x.status === "fulfilled") addExtras(x.value, (r, k) => favs.has(k)); }); }
    finally { extraLoading = false; render(); }
  }
  // Near me: load Counties within NEAR_MI of you; if you're nowhere near the picked County, switch to the one you're in
  const bbNear = (c, mi) => { if (!c.bb || !here) return false; const dLa = mi / 69, dLo = mi / (69 * Math.cos(here.lat * Math.PI / 180)); return here.lat >= c.bb[0] - dLa && here.lat <= c.bb[2] + dLa && here.lng >= c.bb[1] - dLo && here.lng <= c.bb[3] + dLo; };
  async function loadNearby() {
    if (!here || !index) return;
    const near = index.counties.filter((c) => bbNear(c, NEAR_MI)).slice(0, 12);
    if (!near.length) return;
    const got = await Promise.allSettled(near.map((c) => getCounty(c.id)));
    const closest = (d) => { let b = Infinity; for (const r of d.restaurants) { const m = miles({ r }); if (m !== null && m < b) b = m; } return b; };
    const ds = got.filter((x) => x.status === "fulfilled").map((x) => x.value);
    const curD = Math.min(...rows.map((p) => miles(p) ?? Infinity));
    let best = null;
    for (const d of ds) { const m = closest(d); if (!best || m < best.m) best = { d, m }; }
    if (best && best.d.id !== county.id && curD > NEAR_MI && best.m <= NEAR_MI) {
      await loadCounty(best.d.id, "");
      toast(`You're near ${best.d.name} County, so it's showing places there, nearest first`);
    }
    for (const d of ds) addExtras(d, (r) => { const m = miles({ r }); return m !== null && m <= NEAR_MI; });
    render();
  }
  function checkedRange(labels) {
    const u = Array.from(new Set(labels.filter(Boolean)));
    if (u.length < 2) return u[0] || "";
    const t = u.map((l) => [Date.parse(l), l]).sort((x, y) => x[0] - y[0]);
    return `between ${t[0][1]} and ${t[t.length - 1][1]}`;
  }
  function saveSel() {
    const area = $("town").value;
    localStorage.setItem("openlate.sel", JSON.stringify({ county: county.id, area }));
    try {
      const u = new URL(location.href);
      u.searchParams.delete("area"); u.searchParams.set("county", county.id);
      if (area) u.searchParams.set("area", area);
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) { /* URL state is optional */ }
  }
  function setHeading() {
    const t = $("town").selectedOptions[0];
    const town = $("town").value && t ? t.dataset.name : "";
    city.name = town ? `${town}, ${county.name} County` : `${county.name} County, PA`;
    $("cityName").textContent = city.name;
    document.title = `Open Late · ${city.name} restaurant hours, kitchen times & specials`;
    const desc = `Restaurants and bars open late in ${town ? `${town}, ${county.name} County, PA` : `${county.name} County, PA`}: who's open now, kitchen hours, happy hours and wing and beer specials.`;
    const setMeta = (sel, attr, v) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, v); };
    const canon = `https://openlateapp.com/?county=${encodeURIComponent(county.id)}${$("town").value ? `&area=${encodeURIComponent($("town").value)}` : ""}`;
    setMeta('meta[name="description"]', "content", desc); setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", document.title); setMeta('meta[property="og:url"]', "content", canon); setMeta("#canon", "href", canon);
  }

  async function loadCounty(cid, areaId) {
    const seq = ++loadSeq;
    county = countyById(cid) || countyById("lancaster");
    $("county").value = county.id;
    $("count").textContent = `Loading ${county.name} County…`;
    const d = await getCounty(county.id); // one file with just this County's places
    if (seq !== loadSeq) return; // a newer pick won
    const am = areaMap(d), metas = d.areas;
    rows = d.restaurants.map((r) => prep(r, am.get(r.a)));
    city = { name: "", timezone: (metas[0] && metas[0].timezone) || "America/New_York", checkedLabel: checkedRange(metas.map((m) => m.checkedLabel)) };
    const cnt = new Map();
    for (const p of rows) cnt.set(p.area, (cnt.get(p.area) || 0) + 1);
    const towns = metas.filter((m) => cnt.has(m.id)).map((m) => ({ id: m.id, name: shortArea(m.name) })).sort((x, y) => x.name.localeCompare(y.name));
    $("town").innerHTML = `<option value="">All cities (${rows.length})</option>` + towns.map((t) => `<option value="${esc(t.id)}" data-name="${esc(t.name)}">${esc(t.name)} (${cnt.get(t.id)})</option>`).join("");
    $("town").value = towns.some((t) => t.id === areaId) ? areaId : "";
    $("checked").textContent = city.checkedLabel;
    opts($("cuisine"), ["All", ...Array.from(new Set(rows.map((p) => p.r.cuisine))).sort()]);
    setHeading();
    saveSel();
    $("suggest").href = mailto("");
    now = { d: -1, m: 0 };
    tick();
    render();
    if (on("favsOnly")) loadFavExtras().catch(() => {});
  }

  async function init() {
    opts($("vibe"), VIBES);
    index = await (window.__olIdx ? window.__olIdx.catch(() => getJSON("data/index.json")) : getJSON("data/index.json"));
    $("county").innerHTML = index.counties.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${esc(c.id)}">${esc(c.name)} County (${c.places})</option>`).join("");
    // start: ?county=&area= link, then an old ?area= link (mapped to its primary county), then the remembered pick, then Lancaster County
    const sp = new URLSearchParams(location.search);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("openlate.sel") || "null"); } catch (e) { saved = null; }
    if (!saved) { // older builds stored one value: an area id or "county:<id>"
      const old = localStorage.getItem("openlate.area") || "";
      saved = /^county:/.test(old) ? { county: old.slice(7), area: "" } : { county: "", area: old };
    }
    let cid = "", aid = "";
    if (countyById(sp.get("county"))) { cid = sp.get("county"); aid = sp.get("area") || ""; }
    else if (sp.get("area") && primaryCounty(sp.get("area"))) { aid = sp.get("area"); cid = primaryCounty(aid).id; }
    else if (countyById(saved.county)) { cid = saved.county; aid = saved.area || ""; }
    else if (saved.area && primaryCounty(saved.area)) { aid = saved.area; cid = primaryCounty(aid).id; }
    else cid = "lancaster";
    $("county").addEventListener("change", () => { dayTouched = false; track(`county/${$("county").value}`, "County picked"); loadCounty($("county").value, "").catch(fail); });
    $("town").addEventListener("change", () => { if ($("town").value) track(`city/${$("town").value}`, "City picked"); setHeading(); saveSel(); $("suggest").href = mailto(""); tick(); render(); });
    ["q", "cuisine", "price", "vibe", "sort"].forEach((id) => $(id).addEventListener(id === "q" ? "input" : "change", () => render()));
    CHIPS.forEach((id) => $(id).addEventListener("click", () => {
      $(id).setAttribute("aria-pressed", String(!on(id)));
      if (on(id)) track(`filter/${id}`, "Filter on");
      if (id === "favsOnly" && on(id)) loadFavExtras().catch(() => {});
      if (id === "tonight") { try { sessionStorage.setItem("openlate.tonight", on(id) ? "on" : "off"); } catch (e) { /* ignore */ } }
      render();
    }));
    $("viewList").addEventListener("click", () => setView("list"));
    $("viewMap").addEventListener("click", () => setView("map"));
    // keep the map sized to the space under the sticky header
    const setTopH = () => document.documentElement.style.setProperty("--toph", $("top").offsetHeight + "px");
    setTopH(); window.addEventListener("resize", setTopH);
    if (window.ResizeObserver) new ResizeObserver(() => { setTopH(); if (map && view === "map") map.invalidateSize(); }).observe($("top"));
    document.querySelectorAll("[data-form]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openForm(a.dataset.form, null); }));
    $("sForm").addEventListener("submit", sendForm);
    $("fClose").addEventListener("click", closeForm); $("fCancel").addEventListener("click", closeForm);
    $("formDlg").addEventListener("click", (e) => { if (e.target === $("formDlg")) closeForm(); });
    $("searchBtn").addEventListener("click", () => setSearchOpen(!$("top").classList.contains("searching")));
    $("q").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("q").value = ""; setSearchOpen(false); render(); } });
    $("q").addEventListener("blur", () => { if (!$("q").value.trim()) setSearchOpen(false); });
    $("clearFilters").addEventListener("click", clearFilters);
    $("seeCounty").addEventListener("click", () => { $("town").value = ""; $("town").dispatchEvent(new Event("change")); window.scrollTo(0, 0); });
    $("list").addEventListener("toggle", (e) => { const d = e.target; if (d.dataset && d.dataset.key) { if (d.open) openCards.add(d.dataset.key); else openCards.delete(d.dataset.key); } }, true);
    $("day").addEventListener("change", () => { dayTouched = true; render(); });
    $("more").addEventListener("click", () => render(true));
    $("nearMe").addEventListener("click", () => { if (on("nearMe")) setNear(false); else if (here) setNear(true); else askLocation(); });
    $("sort").addEventListener("change", () => { if ($("sort").value === "near") { if (here) setNear(true); else askLocation(); } else $("nearMe").setAttribute("aria-pressed", "false"); });
    $("list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const card = b.closest(".card"), key = card.dataset.key, p = findKey(key);
      if (b.dataset.act === "fav") {
        if (favs.has(key)) favs.delete(key); else favs.add(key);
        saveFavs();
        const f = favs.has(key);
        b.setAttribute("aria-pressed", String(f)); b.textContent = f ? "♥" : "♡";
        b.setAttribute("aria-label", `${f ? "Remove from" : "Add to"} favorites: ${p ? p.r.name : ""}`);
        if (on("favsOnly")) render();
      } else if (b.dataset.act === "share" && p) share(p);
      else if (b.dataset.act === "vote" && p) {
        const box = b.closest(".vote"), did = box.dataset.deal, dir = b.dataset.dir, vk = `${p.area}|${p.r.id}|${did}`;
        if (votes[vk]) return;
        votes[vk] = dir; saveVotes();
        track(votePath(p.area, p.r.id, did, dir), `${dir === "up" ? "Still good" : "Out of date"}: ${p.r.name} (${p.areaName}): ${box.dataset.dtext}`.slice(0, 200));
        box.innerHTML = `<span class="vthanks">${dir === "up" ? "👍" : "👎"} Thanks!</span>`;
      }
      else if ((b.dataset.act === "suggest" || b.dataset.act === "claim") && p) { e.preventDefault(); openForm(b.dataset.act, p); }
    });
    if (sp.get("q")) { $("q").value = sp.get("q"); setSearchOpen(true); }
    // after 9 PM (until 3 AM) Tonight starts on, unless it was turned off this visit, a place link was opened, or this is an automated test
    let tn = null; try { tn = sessionStorage.getItem("openlate.tonight"); } catch (e) { tn = null; }
    const auto = !navigator.webdriver && !/jsdom|HeadlessChrome/i.test(navigator.userAgent || "");
    await loadCounty(cid, aid);
    try { window.dispatchEvent(new Event("openlate:ready")); } catch (e) { /* analytics can wait for the fallback */ }
    if (!sp.get("place") && (tn === "on" || (tn === null && auto && (now.m >= 21 * 60 || now.m < 180)))) {
      $("tonight").setAttribute("aria-pressed", "true"); render();
      if (tn === null) toast("It's late: showing places open past 11 PM. Tap 🌙 Tonight to see everything.");
    }
    let savedView = null; try { savedView = localStorage.getItem("openlate.view"); } catch (e) { /* private mode */ }
    const wantView = sp.get("view") === "map" || sp.get("view") === "list" ? sp.get("view") : sp.get("place") ? "list" : savedView;
    if (wantView === "map") setView("map", { noScroll: !sp.get("view") });
    if (sp.get("place")) openPlace(sp.get("place"), aid);
    setupKofi(sp);
    // periodic refresh keeps how many cards were already revealed
    const refresh = () => { const keep = shown; tick(); render(); while (shown < keep && !$("more").hidden) render(true); };
    setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && city) refresh(); });
  }

  // ---------- Ko-fi tip link + gentle prompt (config.js `kofi`; empty = off; ?kofitest=1|fast previews it)
  function setupKofi(sp) {
    const test = sp.get("kofitest");
    const url = CFG.kofi || (test ? "https://ko-fi.com/" : "");
    if (!url) return;
    const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
    $("kofiLink").href = url; $("kofiGo").href = url; $("kofiFoot").hidden = false;
    $("kofiLink").addEventListener("click", () => track("kofi/footer", "Ko-fi footer link"));
    // one visit per browser session
    let visits = +ls("openlate.visits") || 0;
    try { if (!sessionStorage.getItem("openlate.visit")) { sessionStorage.setItem("openlate.visit", "1"); visits += 1; ls("openlate.visits", String(visits)); } } catch (e) { /* storage off */ }
    const snoozed = (+ls("openlate.kofiSnooze") || 0) > Date.now();
    const auto = !navigator.webdriver && !/jsdom|HeadlessChrome/i.test(navigator.userAgent || "");
    if (!test && (!auto || visits < 3 || snoozed)) return;
    const sheet = $("kofiSheet");
    const hide = (how) => {
      sheet.hidden = true; document.body.classList.remove("kofi-on");
      ls("openlate.kofiSnooze", String(Date.now() + 30 * 864e5));
      track("kofi/" + how, how === "clicked" ? "Ko-fi tip clicked" : "Ko-fi prompt dismissed");
    };
    $("kofiGo").addEventListener("click", () => hide("clicked"));
    $("kofiLater").addEventListener("click", () => hide("dismissed"));
    $("kofiX").addEventListener("click", () => hide("dismissed"));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) hide("dismissed"); });
    // never over the form, an open Details, or an active search; wait and retry instead
    const busy = () => $("formDlg").open || !!document.querySelector("#list details[open]") || $("top").classList.contains("searching") || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
    let tries = 0;
    const attempt = () => {
      if (document.hidden || busy()) { if (++tries < 30) setTimeout(attempt, 10000); return; }
      sheet.hidden = false; document.body.classList.add("kofi-on");
      track("kofi/shown", "Ko-fi prompt shown");
    };
    setTimeout(attempt, test === "fast" ? 1500 : 20000);
  }

  function fail(e) { console.error(e); $("count").textContent = "Couldn't load restaurant data. Check your connection and reload."; }
  init().catch(fail);

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();

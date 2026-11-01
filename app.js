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
    const ap = h < 12 ? "am" : "pm", h12 = h % 12 === 0 ? 12 : h % 12;
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
  let city = null, rows = [], now = { d: 0, m: 0 }, dayTouched = false;

  function prep(r) {
    const w = parseWeek(r.hours);
    const k = r.kitchen ? parseWeek(r.kitchen) : null;
    const is24 = r.hours === "Daily 24h";
    const late = w.some((dh) => dh && dh.some((iv) => iv[1] > 1440));
    return { r, w, k, is24, vibes: late || is24 ? [...r.vibes, "Late night"] : r.vibes };
  }
  function deals(p, d) {
    const f = (list) => (list || []).filter((x) => parseDays(x.days).includes(d));
    return { hh: f(p.r.happyHours), sp: f(p.r.specials) };
  }
  const hasTag = (x, t) => Array.isArray(x.tags) && x.tags.includes(t);
  const BADGE = { wings: "🍗 Wings", beer: "🍺 Beer" };
  function dealHtml(x) {
    const b = (x.tags || []).filter((t) => BADGE[t]).map((t) => `<span class="badge b-${t}">${BADGE[t]}</span>`).join("");
    const extra = [x.flag ? `<span class="flag">⚠ ${esc(x.flag)}</span>` : "", x.src ? `<span class="dsrc">(${esc(x.src)}${x.checked ? `, checked ${esc(x.checked)}` : ""})</span>` : ""].filter(Boolean).join(" ");
    return `${b}${esc(x.text)}${extra ? " " + extra : ""}`;
  }
  function opts(sel, items, keep) {
    const cur = keep ? sel.value : null;
    sel.innerHTML = items.map((o) => typeof o === "string" ? `<option>${esc(o)}</option>` : `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }
  function fillDay() {
    const sel = $("day");
    const prev = sel.value;
    opts(sel, DAYS.map((d, i) => ({ value: String(i), label: i === now.d ? `${DAY_LONG[i]} (today)` : DAY_LONG[i] })));
    sel.value = dayTouched && prev !== "" ? prev : String(now.d);
  }
  function tick() {
    const prevD = now.d;
    now = cityNow(city.timezone);
    $("now").textContent = `Now in ${city.name}: ${DAY_LONG[now.d]} ${fmt(now.m)} ${tzAbbr(city.timezone)}`;
    if (prevD !== now.d || !$("day").options.length) fillDay();
  }

  function render() {
    const q = $("q").value.trim().toLowerCase();
    const cuisine = $("cuisine").value, price = $("price").value, vibe = $("vibe").value;
    const openNow = $("openNow").checked, kitchenNow = $("kitchenNow").checked, onlyDeals = $("onlyDeals").checked;
    const wingDeals = $("wingDeals").checked, beerDeals = $("beerDeals").checked;
    const day = Number($("day").value), sort = $("sort").value;
    let list = rows.filter((p) => {
      const r = p.r;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (cuisine !== "All" && r.cuisine !== cuisine) return false;
      if (price === "none" && r.priceLevel) return false;
      if (price !== "All" && price !== "none" && r.priceLevel !== price) return false;
      if (vibe !== "All" && !p.vibes.includes(vibe)) return false;
      if (openNow && !stateAt(p.w, now.d, now.m, p.is24).open) return false;
      if (kitchenNow && !(p.k && stateAt(p.k, now.d, now.m).open)) return false;
      if (onlyDeals || wingDeals || beerDeals) {
        const dd = deals(p, day), all = [...dd.hh, ...dd.sp];
        if (onlyDeals && !all.length) return false;
        if (wingDeals && !all.some((x) => hasTag(x, "wings"))) return false;
        if (beerDeals && !all.some((x) => hasTag(x, "beer"))) return false;
      }
      return true;
    });
    const key = (p) => {
      if (p.is24) return 3000;
      const s = stateAt(p.w, now.d, now.m);
      if (s.open) return s.close < now.m ? s.close + 1440 : s.close;
      return lastClose(p.w, now.d);
    };
    list.sort((a, b) => {
      if (sort === "name") return a.r.name.localeCompare(b.r.name);
      const ka = key(a), kb = key(b);
      if (ka < 0 && kb < 0) return a.r.name.localeCompare(b.r.name);
      if (ka < 0) return 1;
      if (kb < 0) return -1;
      return sort === "late" ? kb - ka : ka - kb;
    });
    const kinds = [wingDeals && "wing", beerDeals && "beer"].filter(Boolean).join(" + ");
    $("count").textContent = `Showing ${list.length} of ${rows.length} · ${kinds ? kinds + " deals" : "deals"} shown for ${DAY_LONG[day]}`;
    $("empty").hidden = list.length > 0;
    const NL = "not listed";
    $("list").innerHTML = list.map((p) => {
      const r = p.r, s = stateAt(p.w, now.d, now.m, p.is24), dd = deals(p, day);
      let pill;
      if (p.is24) pill = `<span class="pill ok">Open 24 hours</span>`;
      else if (s.open) pill = `<span class="pill ok">Open · closes ${fmt(s.close)}</span>`;
      else if (s.known) pill = `<span class="pill">Closed now</span>`;
      else pill = `<span class="pill">Today's hours not listed</span>`;
      let kpill = "";
      if (p.k) { const ks = stateAt(p.k, now.d, now.m); kpill = ks.open ? `<span class="pill ok">Kitchen open · until ${fmt(ks.close)}</span>` : `<span class="pill">Kitchen closed now</span>`; }
      const wk = (x) => `${esc(x.days.replace(/-/g, "–").replace(/,/g, "/"))}: ${dealHtml(x)}`;
      const weekly = (r.specials || []).map(wk).join(" · ");
      const weeklyHH = (r.happyHours || []).map(wk).join(" · ");
      const top = [...dd.hh, ...dd.sp].filter((x) => (wingDeals && hasTag(x, "wings")) || (beerDeals && hasTag(x, "beer")));
      const d3 = DAYS[day];
      return `<article class="card">
        <h2>${esc(r.name)}</h2>
        <div class="meta">${esc(r.cuisine)} · ${r.priceLevel ? esc(r.priceText) : "Price not listed"}<br>${esc(r.address || NL)}</div>
        <div class="pills">${pill}${kpill}</div>
        ${top.length ? `<div class="hit">${top.map(dealHtml).join("<br>")}</div>` : ""}
        <div class="row"><b>Hours:</b> ${r.hours ? esc(pretty(r.hours)) : NL}${r.hoursNote ? ` — ${esc(r.hoursNote)}` : ""}</div>
        <div class="row"><b>Kitchen:</b> ${r.kitchen ? esc(pretty(r.kitchen)) : NL}${r.kitchenNote ? ` — ${esc(r.kitchenNote)}` : ""}</div>
        <div class="row"><b>${d3} happy hour:</b> <span class="deal">${dd.hh.length ? dd.hh.map(dealHtml).join("; ") : NL}</span></div>
        <div class="row"><b>${d3} specials:</b> <span class="deal">${dd.sp.length ? dd.sp.map(dealHtml).join("; ") : NL}</span></div>
        ${weeklyHH ? `<div class="row"><b>Happy hours all week:</b> ${weeklyHH}</div>` : ""}
        ${weekly ? `<div class="row"><b>Specials all week:</b> ${weekly}</div>` : ""}
        <div class="row"><b>Crowd:</b> ${r.crowd ? esc(r.crowd) : NL}</div>
        <div class="src">Source: ${esc(r.source)} · checked ${esc(city.checkedLabel)}</div>
        <div class="links">${r.website ? `<a href="${esc(r.website)}" target="_blank" rel="noopener">Website</a>` : `<span class="row"><b>Website:</b> ${NL}</span>`}
          <a href="${esc(mailto(r.name))}">Suggest an update</a></div>
      </article>`;
    }).join("");
  }

  function mailto(place) {
    const subj = place ? `Open Late update: ${place} (${city.name})` : `Open Late update (${city ? city.name : ""})`;
    const body = `Restaurant name: ${place || ""}\nCity: ${city ? city.name : ""}\n\nWhat should change? (hours, kitchen closing time, specials, happy hour, crowd, website)\n\n\nWhere did you see it? (link, menu photo, or "I work there")\n\n\nYour name (optional):\n`;
    return `mailto:${SUGGEST_TO}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  }

  async function loadCity(id, index) {
    const live = index.areas.filter((a) => a.status === "live" && a.file);
    const meta = live.find((c) => c.id === id) || live.find((c) => c.id === index.defaultArea) || live[0];
    const res = await fetch(meta.file, { cache: "no-cache" });
    city = await res.json();
    city.timezone = city.timezone || meta.timezone;
    rows = city.restaurants.map(prep);
    $("cityName").textContent = city.name;
    $("checked").textContent = city.checkedLabel;
    document.title = `Open Late · ${city.name} restaurant hours, kitchen times & specials`;
    opts($("cuisine"), ["All", ...Array.from(new Set(city.restaurants.map((r) => r.cuisine))).sort()]);
    $("suggest").href = mailto("");
    now = { d: -1, m: 0 };
    tick();
    render();
  }

  function fillAreas(index) {
    // grouped by region, A–Z within each region; areas without data show as "coming soon" and can't be picked
    const sel = $("city");
    sel.innerHTML = index.regions.map((rg) => {
      const items = index.areas.filter((a) => a.region === rg.id).sort((a, b) => a.name.localeCompare(b.name));
      if (!items.length) return "";
      return `<optgroup label="${esc(rg.name)}">` + items.map((a) => {
        const live = a.status === "live" && a.file;
        return `<option value="${esc(a.id)}"${live ? "" : " disabled"}>${esc(a.name)}${live ? "" : " (coming soon)"}</option>`;
      }).join("") + `</optgroup>`;
    }).join("");
  }

  async function init() {
    opts($("vibe"), VIBES);
    const index = await (await fetch("data/cities.json", { cache: "no-cache" })).json();
    fillAreas(index);
    const saved = localStorage.getItem("openlate.area");
    const ok = (id) => index.areas.some((a) => a.id === id && a.status === "live" && a.file);
    const start = ok(saved) ? saved : index.defaultArea;
    $("city").value = start;
    $("city").addEventListener("change", () => { localStorage.setItem("openlate.area", $("city").value); dayTouched = false; loadCity($("city").value, index); });
    ["q", "cuisine", "price", "vibe", "sort", "openNow", "kitchenNow", "onlyDeals", "wingDeals", "beerDeals"].forEach((id) => $(id).addEventListener(id === "q" ? "input" : "change", render));
    $("day").addEventListener("change", () => { dayTouched = true; render(); });
    await loadCity(start, index);
    setInterval(() => { tick(); render(); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && city) { tick(); render(); } });
  }

  init().catch((e) => { console.error(e); $("count").textContent = "Couldn't load restaurant data. Check your connection and reload."; });

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();

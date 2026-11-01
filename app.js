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
  const PAGE = 40; // cards per "Show more" step, keeps big counties fast on phones
  const shortArea = (n) => n.replace(/, PA$/, "");

  function prep(r, area) {
    const w = parseWeek(r.hours);
    const k = r.kitchen ? parseWeek(r.kitchen) : null;
    const is24 = r.hours === "Daily 24h";
    const late = w.some((dh) => dh && dh.some((iv) => iv[1] > 1440));
    return { r, w, k, is24, vibes: late || is24 ? [...r.vibes, "Late night"] : r.vibes, area: area.id, areaName: shortArea(area.name), checkedLabel: area.checkedLabel };
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
    opts(sel, DAYS.map((d, i) => ({ value: String(i), label: i === now.d ? "Deals: Today" : `Deals: ${DAYS[i]}` })));
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
  const CHIPS = ["openNow", "kitchenNow", "onlyDeals", "wingDeals", "beerDeals"];
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
    const wingDeals = on("wingDeals"), beerDeals = on("beerDeals");
    const day = Number($("day").value), sort = $("sort").value;
    let list = rows.filter((p) => {
      const r = p.r;
      if (town && p.area !== town) return false;
      if (q && !r.name.toLowerCase().includes(q) && !p.areaName.toLowerCase().includes(q)) return false;
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
    const sk = sort === "smart" ? new Map(list.map((p) => [p, smartKey(p)])) : null;
    list.sort((a, b) => {
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
    const mf = [cuisine !== "All", price !== "All", vibe !== "All", sort !== "smart"].filter(Boolean).length;
    $("mfCount").textContent = mf ? `(${mf} on)` : "";
    const kinds = [wingDeals && "wing", beerDeals && "beer"].filter(Boolean).join(" + ");
    $("count").textContent = `${list.length} of ${rows.length} places · ${kinds ? kinds + " deals" : "deals"} for ${day === now.d ? "today" : DAY_LONG[day]}`;
    // empty state
    const active = filtersActive();
    const placeName = town ? $("town").selectedOptions[0].dataset.name : `${county.name} County`;
    $("empty").hidden = list.length > 0;
    if (!list.length) {
      let why = active ? `No places in ${placeName} match these filters` : `No places listed in ${placeName} yet`;
      if (openNow && !q && !wingDeals && !beerDeals && !onlyDeals && !kitchenNow) why = `Nothing in ${placeName} is open right now`;
      $("emptyTitle").textContent = why + ".";
      $("emptyText").textContent = town ? `Try the whole county, or ${active ? "clear the filters" : "pick another city"}.` : (active ? "Try clearing the filters or picking another day." : "Try a neighboring county.");
      $("clearFilters").hidden = !active;
      $("seeCounty").hidden = !town;
      $("seeCounty").textContent = `See all of ${county.name} County`;
    }
    const prev = more ? shown : 0;
    shown = more ? Math.min(list.length, shown + PAGE) : Math.min(list.length, PAGE);
    const left = list.length - shown;
    $("more").hidden = left <= 0;
    $("more").textContent = `Show ${Math.min(PAGE, left)} more (${left} left)`;
    const NL = "not listed";
    const d3 = DAYS[day], dayWord = day === now.d ? "Today" : DAY_LONG[day];
    const html = list.slice(prev, shown).map((p) => {
      const r = p.r, st = status(p), dd = deals(p, day), all = [...dd.hh, ...dd.sp];
      const ck = `${p.area}|${r.name}`;
      let kline = "";
      if (p.k) { const ks = stateAt(p.k, now.d, now.m); kline = ks.open ? `<span class="kitchen k-open">Kitchen until ${fmt(ks.close)}</span>` : `<span class="kitchen">Kitchen closed</span>`; }
      // one compact deal line: the top deal (matching the active deal chips first), plus "+N more" (the rest are in Details)
      const pick = all.filter((x) => (wingDeals && hasTag(x, "wings")) || (beerDeals && hasTag(x, "beer")));
      const top = pick[0] || all.find((x) => hasTag(x, "wings") || hasTag(x, "beer")) || dd.hh[0] || dd.sp[0];
      let dline = "";
      if (top) {
        const kind = hasTag(top, "wings") ? ["b-wings", "🍗 Wings"] : hasTag(top, "beer") ? ["b-beer", "🍺 Beer"] : dd.hh.includes(top) ? ["b-hh", "Happy hour"] : ["b-sp", "Special"];
        const n = all.length - 1;
        dline = `<div class="dline" aria-label="${dayWord} deals">${day !== now.d ? `<span class="bday">${esc(d3)}</span>` : ""}<span class="badge ${kind[0]}">${kind[1]}</span><span class="dtext">${esc(top.text)}${top.flag ? ` <span class="flag" title="${esc(top.flag)}">⚠</span>` : ""}</span>${n > 0 ? `<span class="dmore">+${n} more</span>` : ""}</div>`;
      }
      const meta = [r.cuisine, r.priceLevel].filter(Boolean).map(esc).join(" · ");
      const wk = (x) => `${esc(x.days.replace(/-/g, "–").replace(/,/g, "/"))}: ${dealHtml(x)}`;
      const weekly = (r.specials || []).map(wk).join(" · ");
      const weeklyHH = (r.happyHours || []).map(wk).join(" · ");
      const maps = r.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name}, ${r.address}, ${p.areaName}, PA`)}` : "";
      return `<article class="card">
        ${town ? "" : `<div class="town">${esc(p.areaName)}</div>`}
        <h2>${esc(r.name)}${meta ? ` <span class="meta">${meta}</span>` : ""}</h2>
        <div class="status ${st.cls}"><span class="dot" aria-hidden="true"></span><span>${esc(st.text)}</span>${kline}</div>
        ${dline}
        <details class="more-info" data-key="${esc(ck)}"${openCards.has(ck) ? " open" : ""}>
          <summary>Details</summary>
          <div class="info">
            <div class="row">${esc(r.cuisine)} · ${r.priceLevel ? esc(r.priceText) : "Price not listed"}</div>
            <div class="row"><b>Address:</b> ${r.address ? `<a href="${esc(maps)}" target="_blank" rel="noopener">${esc(r.address)}</a>` : NL}</div>
            <div class="row"><b>Hours:</b> ${r.hours ? esc(pretty(r.hours)) : NL}${r.hoursNote ? ` — ${esc(r.hoursNote)}` : ""}</div>
            <div class="row"><b>Kitchen:</b> ${r.kitchen ? esc(pretty(r.kitchen)) : NL}${r.kitchenNote ? ` — ${esc(r.kitchenNote)}` : ""}</div>
            <div class="row"><b>${d3} happy hour:</b> <span class="deal">${dd.hh.length ? dd.hh.map(dealHtml).join("; ") : NL}</span></div>
            <div class="row"><b>${d3} specials:</b> <span class="deal">${dd.sp.length ? dd.sp.map(dealHtml).join("; ") : NL}</span></div>
            ${weeklyHH ? `<div class="row"><b>Happy hours all week:</b> ${weeklyHH}</div>` : ""}
            ${weekly ? `<div class="row"><b>Specials all week:</b> ${weekly}</div>` : ""}
            <div class="row"><b>Crowd:</b> ${r.crowd ? esc(r.crowd) : NL}</div>
            <div class="src">Source: ${esc(r.source)} · checked ${esc(p.checkedLabel)}</div>
            <div class="links">${r.website ? `<a href="${esc(r.website)}" target="_blank" rel="noopener">Website</a>` : `<span class="row"><b>Website:</b> ${NL}</span>`}
              <a href="${esc(mailto(r.name, p.areaName))}">Suggest an update</a></div>
          </div>
        </details>
      </article>`;
    }).join("");
    if (more) $("list").insertAdjacentHTML("beforeend", html); else $("list").innerHTML = html;
  }

  function mailto(place, where) {
    const cn = where || (city ? city.name : "");
    const subj = place ? `Open Late update: ${place} (${cn})` : `Open Late update (${cn})`;
    const body = `Restaurant name: ${place || ""}\nCity: ${cn}\n\nWhat should change? (hours, kitchen closing time, specials, happy hour, crowd, website)\n\n\nWhere did you see it? (link, menu photo, or "I work there")\n\n\nYour name (optional):\n`;
    return `mailto:${SUGGEST_TO}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  }

  // Selection = one county (always) + optional town/area inside it. Places are tagged with their own county,
  // so an area that straddles a line shows only this county's places and can appear under several counties.
  const live = (index) => index.areas.filter((a) => a.status === "live" && a.file);
  let index = null, county = null;
  const countyById = (id) => index.counties.find((c) => c.id === (id || "").toLowerCase());
  const areaById = (id) => live(index).find((a) => a.id === id);
  const primaryCounty = (aid) => { const a = areaById(aid); return a && a.counties && countyById(a.counties[0].toLowerCase().replace(/\s+/g, "-")); };
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
  }

  async function loadCounty(cid, areaId) {
    const seq = ++loadSeq;
    county = countyById(cid) || countyById("lancaster");
    $("county").value = county.id;
    const metas = live(index).filter((a) => county.areas.includes(a.id));
    $("count").textContent = `Loading ${county.name} County…`;
    // every area file in the county loads in parallel, then merges
    const files = await Promise.all(metas.map((m) => fetch(m.file, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`${m.file}: HTTP ${r.status}`); return r.json(); })));
    if (seq !== loadSeq) return; // a newer pick won
    const merged = [];
    files.forEach((f, i) => {
      const area = { id: metas[i].id, name: metas[i].name, checkedLabel: f.checkedLabel };
      for (const r of f.restaurants) if (r.county === county.name) merged.push(prep(r, area));
    });
    rows = merged;
    city = { name: "", timezone: (files[0] && files[0].timezone) || "America/New_York", checkedLabel: checkedRange(files.map((f) => f.checkedLabel)) };
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
  }

  async function init() {
    opts($("vibe"), VIBES);
    index = await (await fetch("data/cities.json", { cache: "no-cache" })).json();
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
    $("county").addEventListener("change", () => { dayTouched = false; loadCounty($("county").value, "").catch(fail); });
    $("town").addEventListener("change", () => { setHeading(); saveSel(); $("suggest").href = mailto(""); tick(); render(); });
    ["q", "cuisine", "price", "vibe", "sort"].forEach((id) => $(id).addEventListener(id === "q" ? "input" : "change", () => render()));
    CHIPS.forEach((id) => $(id).addEventListener("click", () => { $(id).setAttribute("aria-pressed", String(!on(id))); render(); }));
    $("searchBtn").addEventListener("click", () => setSearchOpen(!$("top").classList.contains("searching")));
    $("q").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("q").value = ""; setSearchOpen(false); render(); } });
    $("q").addEventListener("blur", () => { if (!$("q").value.trim()) setSearchOpen(false); });
    $("clearFilters").addEventListener("click", clearFilters);
    $("seeCounty").addEventListener("click", () => { $("town").value = ""; $("town").dispatchEvent(new Event("change")); window.scrollTo(0, 0); });
    $("list").addEventListener("toggle", (e) => { const d = e.target; if (d.dataset && d.dataset.key) { if (d.open) openCards.add(d.dataset.key); else openCards.delete(d.dataset.key); } }, true);
    $("day").addEventListener("change", () => { dayTouched = true; render(); });
    $("more").addEventListener("click", () => render(true));
    await loadCounty(cid, aid);
    // periodic refresh keeps how many cards were already revealed
    const refresh = () => { const keep = shown; tick(); render(); while (shown < keep && !$("more").hidden) render(true); };
    setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && city) refresh(); });
  }

  function fail(e) { console.error(e); $("count").textContent = "Couldn't load restaurant data. Check your connection and reload."; }
  init().catch(fail);

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();

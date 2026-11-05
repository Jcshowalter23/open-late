#!/usr/bin/env node
/**
 * Unit tests for app.js splitSrc(): source chips move into the Sources list,
 * hours-warning prose stays on the card. Run: node tools/test_split_src.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extractFn(src, name) {
  const start = src.indexOf("function " + name);
  if (start < 0) throw new Error("missing " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  let quote = "";
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote && quote !== "/") quote = "";
      else if (quote === "/" && c === "/") quote = "";
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
    if (c === "/" && src[i + 1] === "/") { const n = src.indexOf("\n", i); i = n < 0 ? src.length : n; continue; }
    if (c === "/" && src[i + 1] === "*") { const n = src.indexOf("*/", i + 2); i = n < 0 ? src.length : n + 1; continue; }
    if (c === "/") {
      let j = i - 1;
      while (j > 0 && /\s/.test(src[j])) j--;
      if ("(=,:[!&|?{};".includes(src[j])) { quote = "/"; continue; }
    }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error("unclosed " + name);
}

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const splitSrc = vm.runInNewContext(extractFn(app, "splitSrc") + "\nsplitSrc;");

const CASES = [
  {
    name: "Perma Stone deal chip",
    in: "Wing Wednesday — 75¢ wings, dine-in (Facebook posts, Oct 2026)",
    text: "Wing Wednesday — 75¢ wings, dine-in",
    sources: ["Facebook posts, Oct 2026"],
  },
  {
    name: "DiAnoia hours chip",
    in: "Venue site lists Venue site lists Tue–Thu to 9p (Facebook lists Thu to 10p).; call ahead.",
    text: "Venue site lists Tue–Thu to 9p; call ahead.",
    sources: ["Facebook lists Thu to 10p"],
  },
  {
    name: "Porky's hours chip",
    in: "Venue site lists Venue site lists Mon–Fri to 2a (Facebook Monday to 12a).; call ahead.",
    text: "Venue site lists Mon–Fri to 2a; call ahead.",
    sources: ["Facebook Monday to 12a"],
  },
  {
    name: "Facebook page any case",
    in: "$ (Facebook Page)",
    text: "$",
    sources: ["Facebook Page"],
  },
  {
    name: "bare source names",
    in: "Monday closed (Restaurantji). Tuesday (OpenTable) (Yelp) (listing).",
    text: "Monday closed. Tuesday.",
    sources: ["Restaurantji", "OpenTable", "Yelp", "listing"],
  },
  {
    name: "keep typo warning paren",
    in: "Sunday close from the venue site (Facebook lists Sun 11a–10a, a typo).",
    text: "Sunday close from the venue site (Facebook lists Sun 11a–10a, a typo).",
    sources: [],
  },
  {
    name: "keep also-showed warning",
    in: "Closed Wednesday and Sunday on the venue site (Facebook also showed a Sunday lunch window).",
    text: "Closed Wednesday and Sunday on the venue site (Facebook also showed a Sunday lunch window).",
    sources: [],
  },
  {
    name: "keep Facebook shows only prose",
    in: "Facebook shows only Sun 12am - 1am for that day (may be a lunch/brunch-only listing); call ahead.",
    text: "Facebook shows only Sun 12am - 1am for that day (may be a lunch/brunch-only listing); call ahead.",
    sources: [],
  },
  {
    name: "keep likely-typo paren",
    in: "Facebook lists Thu 5p-5p (likely a typo); that day is unconfirmed, call ahead.",
    text: "Facebook lists Thu 5p-5p (likely a typo); that day is unconfirmed, call ahead.",
    sources: [],
  },
  {
    name: "keep hours-differ listing sentence",
    in: "Venue site says \"New Hours\" (listing shows until 10 pm).",
    text: "Venue site says \"New Hours\" (listing shows until 10 pm).",
    sources: [],
  },
  {
    name: "venue site paren still moves",
    in: "Kitchen closes 3–5 pm daily (reopens 4 pm Sat). (Venue site dianoiaseatery.com, checked 2026-11-01)",
    text: "Kitchen closes 3–5 pm daily (reopens 4 pm Sat).",
    sources: ["Venue site dianoiaseatery.com"],
    date: "2026-11-01",
  },
  {
    name: "per venue website still moves",
    in: "Brunch menu per Venue website example.com, checked 2026-11-01",
    text: "Brunch menu",
    sources: ["Venue website example.com"],
    date: "2026-11-01",
  },
  {
    name: "doubled says prefix",
    in: "Venue site lists Venue site says Mon–Sat 3p–close; Facebook lists to 11p nightly (no Sunday).; call ahead.",
    text: "Venue site says Mon–Sat 3p–close; Facebook lists to 11p nightly (no Sunday); call ahead.",
    sources: [],
  },
];

let bad = 0;
for (const c of CASES) {
  const got = splitSrc(c.in, "Deal");
  const srcs = got.out.map((o) => o.s);
  const ok = got.t === c.text && srcs.join("|") === c.sources.join("|") && (!c.date || got.out.every((o) => o.d === c.date));
  if (!ok) {
    bad++;
    console.log("FAIL", c.name);
    console.log("  text   ", JSON.stringify(got.t));
    console.log("  expect ", JSON.stringify(c.text));
    console.log("  sources", JSON.stringify(got.out));
  } else console.log("PASS", c.name);
}
if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("OK");

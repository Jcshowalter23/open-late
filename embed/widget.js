/* Open Late "Open now" widget. Paste one line where it should appear:
   <script src="https://openlateapp.com/embed/widget.js" data-place="COUNTY/AREA/PLACE" data-theme="light" async></script>
   It adds a small iframe (no cookies, no tracking) showing the place's status now, hours, kitchen hours and today's specials. */
(function () {
  var s = document.currentScript;
  if (!s) { var all = document.querySelectorAll('script[src*="/embed/widget.js"]:not([data-ol-done])'); s = all[all.length - 1]; }
  if (!s || s.getAttribute("data-ol-done")) return;
  s.setAttribute("data-ol-done", "1");
  var parts = String(s.getAttribute("data-place") || "").split("/");
  var base = s.src.replace(/\/embed\/widget\.js.*$/, "");
  var theme = s.getAttribute("data-theme") === "dark" ? "dark" : "light";
  var f = document.createElement("iframe");
  f.src = base + "/embed/w.html?c=" + encodeURIComponent(parts[0] || "") + "&a=" + encodeURIComponent(parts[1] || "") + "&id=" + encodeURIComponent(parts[2] || "") + "&theme=" + theme;
  f.title = "Hours from Open Late";
  f.loading = "lazy";
  f.style.cssText = "border:0;width:100%;max-width:360px;height:230px;display:block;color-scheme:normal;background:transparent";
  f.setAttribute("allowtransparency", "true");
  window.addEventListener("message", function (e) { if (e.source === f.contentWindow && e.data && e.data.olHeight) f.style.height = Math.min(600, Number(e.data.olHeight) || 230) + "px"; });
  s.parentNode.insertBefore(f, s.nextSibling);
})();

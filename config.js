// Open Late site settings. Edit these two values; nothing else needs to change.
window.OPENLATE_CONFIG = {
  // Suggest-an-update / Claim / Add-a-place form. FormSubmit.co AJAX endpoint (no account needed).
  // The first real submission sends a one-time "Activate form" email to the address below; click it once.
  // After activating, FormSubmit also emails a random alias string: you can swap it in here to hide the address
  // (e.g. "https://formsubmit.co/ajax/abc123randomstring").
  formEndpoint: "https://formsubmit.co/ajax/jcshowalter23@gmail.com",
  // Backup when FormSubmit fails or times out (~8 s): Web3Forms. The access key is public by design.
  formBackupEndpoint: "https://api.web3forms.com/submit",
  web3formsKey: "52ad76a9-0976-4ca3-bddd-3aba657cc87a",
  // Privacy-friendly, cookie-free visitor counts via GoatCounter. Empty = analytics off.
  // Set to your GoatCounter count URL, e.g. "https://openlate.goatcounter.com/count".
  goatcounter: "https://openlateapp.goatcounter.com/count",
  // Ko-fi tip page, e.g. "https://ko-fi.com/openlate". Empty = no tip link or prompt anywhere.
  // Preview the prompt before turning it on: add ?kofitest=1 (shows after 20 s) or ?kofitest=fast to any page.
  kofi: "https://ko-fi.com/openlateapp"
};
// Analytics loader (does nothing while goatcounter is empty). Page views are counted automatically;
// the app also records a few anonymous events (county/city picks, filter chips, Map, form sent).
(function () {
  var gc = window.OPENLATE_CONFIG.goatcounter;
  window.olTrack = function (name, title) {
    if (!gc) return;
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: String(name).slice(0, 120), title: title || String(name), event: true }); } catch (e) { /* never break the app */ }
  };
  if (!gc || /^(localhost|127\.)/.test(location.hostname)) return;
  // count the County/City view (?county=&area=) as the page; drop one-off ?place= deep links
  window.goatcounter = { path: function () { return location.pathname + location.search.replace(/([?&])place=[^&]*&?/, "$1").replace(/[?&]$/, ""); } };
  var s = document.createElement("script");
  s.async = true; s.src = "https://gc.zgo.at/count.js"; s.setAttribute("data-goatcounter", gc);
  document.head.appendChild(s);
})();

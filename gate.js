/* Cable launch gate (2026-11-19, Chase): Cable launches 2026-11-20T03:00:00Z (10:00 PM ET, Nov 19).
   Before then every viewer page shows a branded countdown instead of the player. Time = server Date header (HEAD, no-store) with the
   device clock as fallback, re-checked every 30 s; unlocks itself at launch without a reload (fires "cable-unlock").
   Bypass: ?preview=<token> (kept for the session in sessionStorage+localStorage; token in the workspace README, only its hash is here),
   and the diag.html harness (same-origin parent page). diag.html itself does not load this file. */
(function () {
  var W = window, D = document, LAUNCH = Date.UTC(2026, 10, 20, 3, 0, 0), HASH = 0xc42f68bc, KEY = "cable_preview";
  function fnv(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 255; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  var G = W.CABLE_GATE = { locked: false, launch: LAUNCH, offset: 0, src: "device" };
  var bypass = false;
  try { var q = new URLSearchParams(location.search).get("preview"); if (q && fnv(q) === HASH) { sessionStorage.setItem(KEY, q); localStorage.setItem(KEY, q); } } catch (e) {}
  try { var s = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); if (s && fnv(s) === HASH) bypass = true; } catch (e) {}
  try { if (W.parent !== W && /\/diag\.html$/.test(W.parent.location.pathname)) bypass = true; } catch (e) {}
  G.preview = bypass;
  try { var so = +sessionStorage.getItem("cable_gate_off"); if (so && isFinite(so)) { G.offset = so; G.src = "server(cached)"; } } catch (e) {}
  function nowMs() { return Date.now() + G.offset; }
  if (bypass) return;
  if (nowMs() >= LAUNCH) {   // the device says we're live; double-check its clock against the server once (a fast clock must not open early)
    if (nowMs() < LAUNCH + 864e5) try {
      var q0 = Date.now(); fetch(location.pathname + "?gate=" + q0, { method: "HEAD", cache: "no-store" }).then(function (r) {
        var t1 = Date.now(), sv0 = Date.parse(r.headers.get("date") || ""); if (isNaN(sv0)) return;
        var off = sv0 + 500 + (t1 - q0) / 2 - t1; if (t1 + off < LAUNCH - 2000) { try { sessionStorage.setItem("cable_gate_off", String(off)); } catch (e) {} location.reload(); }
      }).catch(function () {});
    } catch (e) {}
    return;
  }
  G.locked = true;
  var de = D.documentElement; de.classList.add("cable-gated");
  var css = D.createElement("style");
  css.textContent = "html.cable-gated body>*:not(#cable-gate):not(.hkd-m){display:none!important}html.cable-gated,html.cable-gated body{background:#020a2a!important;overflow:hidden!important}" +
    "#cable-gate{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;" +
    "background:radial-gradient(ellipse at 50% 35%,#163a9c 0%,#06164a 55%,#020a2a 100%);font-family:Verdana,Tahoma,sans-serif;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom))}" +
    "#cable-gate .cg-in{max-width:900px;width:100%}#cable-gate img{width:min(60vw,360px);height:auto;display:block;margin:0 auto 4vmin}" +
    "#cable-gate h1{font:bold clamp(20px,4.6vmin,46px)/1.2 Verdana,Tahoma,sans-serif;margin:0 0 1.2vmin;letter-spacing:.5px}" +
    "#cable-gate h1 b{color:#ffcc00}#cable-gate .cg-sub{font-size:clamp(13px,2.4vmin,22px);color:#cfe0ff;margin:0 0 4vmin}" +
    "#cable-gate .cg-cd{display:flex;gap:2vmin;justify-content:center;margin:0 auto 4vmin}" +
    "#cable-gate .cg-u{background:linear-gradient(#3f63d6,#1b3a99);border:2px solid #8fb0ff;border-radius:12px;min-width:clamp(64px,15vmin,150px);padding:1.4vmin 1vmin;box-shadow:0 4px 18px rgba(0,0,0,.45)}" +
    "#cable-gate .cg-n{font:bold clamp(30px,9vmin,96px)/1 Verdana,sans-serif;color:#ffcc00;font-variant-numeric:tabular-nums}" +
    "#cable-gate .cg-l{font-size:clamp(10px,1.8vmin,16px);letter-spacing:2px;text-transform:uppercase;color:#cfe0ff;margin-top:.8vmin}" +
    "#cable-gate .cg-f{font-size:clamp(11px,1.9vmin,17px);color:#9fb6ea}#cable-gate .cg-don{margin-top:3vmin}";
  (D.head || de).appendChild(css);
  var el = D.createElement("div"); el.id = "cable-gate"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Cable launches tonight at 10 PM ET");
  el.innerHTML = '<div class="cg-in"><img src="cable-logo-w.svg" alt="cable"><h1>cable &mdash; launches tonight at <b>10 PM ET</b></h1>' +
    '<p class="cg-sub">46 live channels, the program guide, ON DEMAND and My DVR. Free.</p>' +
    '<div class="cg-cd" aria-live="off"><div class="cg-u"><div class="cg-n" id="cg-h">--</div><div class="cg-l">Hours</div></div>' +
    '<div class="cg-u"><div class="cg-n" id="cg-m">--</div><div class="cg-l">Minutes</div></div><div class="cg-u"><div class="cg-n" id="cg-s">--</div><div class="cg-l">Seconds</div></div></div>' +
    '<p class="cg-f">Thursday, November 19 &middot; 10:00 PM Eastern &middot; 9:00 PM Central &middot; 7:00 PM Pacific<br>Keep this screen open &mdash; it turns on by itself.</p>' +
    '<div class="cg-don"><a class="hkd-btn hkd-lg" id="cg-donate" href="https://cash.app/$WrestleWorldPlus" target="_blank" rel="noopener" aria-label="Donate: support us on Cash App, $WrestleWorldPlus"><span class="hkd-l"><span class="hkd-ic" aria-hidden="true">$</span>DONATE</span><span class="hkd-s">Support us on Cash App &middot; $WrestleWorldPlus</span></a></div></div>';
  function mount() { if (!el.parentNode) (D.body || de).appendChild(el); }
  if (D.body) mount(); else D.addEventListener("DOMContentLoaded", mount);
  // swallow every key / remote press while gated (capture phase, before the app's handlers)
  // DONATE on the gate (2026-11-19): the QR modal (donate.js) gets its own keys; arrows focus the DONATE button, OK on it opens it
  function block(e) {
    if (!G.locked) return;
    if (W.HKDonate && W.HKDonate.isOpen()) return;
    e.stopImmediatePropagation(); if (e.type === "keydown" && !/^(F5|F12)$/.test(e.key)) e.preventDefault();
    if (e.type !== "keydown") return;
    var b = D.getElementById("cg-donate"); if (!b) return;
    if (/^Arrow/.test(e.key) || (e.keyCode >= 37 && e.keyCode <= 40)) { b.classList.add("focus"); try { b.focus(); } catch (x) {} }
    else if ((e.key === "Enter" || e.keyCode === 13 || e.keyCode === 23) && (D.activeElement === b || b.classList.contains("focus"))) { if (W.HKDonate) W.HKDonate.go(b); else W.open(b.href, "_blank", "noopener"); }
  }
  ["keydown", "keyup", "keypress"].forEach(function (t) { W.addEventListener(t, block, true); });
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var iv = null, sv = null;
  function render() {
    var ms = LAUNCH - nowMs();
    if (ms <= 0) return unlock();
    var t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    var a = D.getElementById("cg-h"), b = D.getElementById("cg-m"), c = D.getElementById("cg-s");
    if (a) { a.textContent = pad(h); b.textContent = pad(m); c.textContent = pad(s); }
  }
  function sync() {
    var t0 = Date.now(), u = location.pathname + "?gate=" + t0;
    try {
      fetch(u, { method: "HEAD", cache: "no-store" }).then(function (r) {
        var dh = r.headers.get("date"), t1 = Date.now(); if (!dh) return;
        var sv0 = Date.parse(dh); if (isNaN(sv0)) return;
        G.offset = sv0 + 500 + (t1 - t0) / 2 - t1; G.src = "server"; try { sessionStorage.setItem("cable_gate_off", String(G.offset)); } catch (e) {} render();   // Date has 1 s resolution: +500 ms centres it
      }).catch(function () {});
    } catch (e) {}
  }
  function unlock() {
    if (!G.locked) return; G.locked = false; clearInterval(iv); clearInterval(sv);
    de.classList.remove("cable-gated"); if (el.parentNode) el.parentNode.removeChild(el);
    ["keydown", "keyup", "keypress"].forEach(function (t) { W.removeEventListener(t, block, true); });
    try { W.dispatchEvent(new Event("cable-unlock")); } catch (e) {}
  }
  G.unlock = unlock; G.now = nowMs;
  render(); sync(); iv = setInterval(render, 250); sv = setInterval(sync, 30000);
})();

/* Cable Remote - TV side (2026-11-21). Loaded after app.js on every Cable page (TV app, Silk, desktop, phone).
   - Does nothing until this device has been paired once (or the pairing screen is opened): no connections for viewers who never use it.
   - Pairing screen: Main Menu "Phone Remote", the TV menu bar "PHONE REMOTE" button. Shows a 6-character code + a QR code
     (remote URL with this TV's key in the #fragment). The code works while the screen is open (new code every 10 minutes).
   - Commands from the phone run through window.CABLE.rc() (app.js) = the same key() paths as the real remote, so nothing about the TV
     remote / keyboard changes. The TV reports what it is showing back to the phone (state) and, on request, the whole lineup's now-playing.
   Transport + auth: rlink.js (MQTT on two public brokers + ntfy.sh fallback, HMAC-signed with this TV's secret). Plain ES5. */
(function (W, D) {
  "use strict";
  var LS = W.localStorage, L = W.CableLink; if (!L || !LS) return;
  var KEY = "cable_rk", IDK = "cable_rid", link = null, pairN = null, code = "", codeT = 0, ov = null, phones = {}, lastPub = "", pubT = 0, lastVia = "mqtt", sel = 0;
  function N(f) { try { return W.CableNative && W.CableNative[f] ? String(W.CableNative[f]()) : ""; } catch (e) { return ""; } }
  function tvName() {
    var ua = navigator.userAgent;
    if (/AFT[A-Z]/.test(ua)) return "Fire TV"; if (/GoogleTV|Chromecast|CrKey/i.test(ua)) return "Google TV"; if (/Android TV|BRAVIA|SHIELD/i.test(ua)) return "Android TV";
    if (/Tizen|Web0S|webOS|SMART-TV|SmartTV/i.test(ua)) return "Smart TV"; if (W.CableNative || /[?&]tv=1/.test(location.search)) return "TV";
    if (/iPhone|iPad|Android/.test(ua)) return "Cable on " + (/iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : "Android"); return "Cable in a browser";
  }
  function C() { return W.CABLE && W.CABLE.rc ? W.CABLE : null; }
  function toast(t, ms) { var e = D.getElementById("toast"); if (!e) return; e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, ms || 2600); }
  function key() { var k = LS.getItem(KEY); if (!k || k.length < 20) { k = L.newKey(); LS.setItem(KEY, k); } return k; }
  function myId() { var i = LS.getItem(IDK); if (!i) { i = "tv" + L.rnd(10); LS.setItem(IDK, i); } return i; }

  // ---------- link (commands in, state out) ----------
  function start() {
    if (link) return link;
    link = new L.Link(key(), "tv", { id: myId(), onMsg: onCmd, onStatus: function () { if (ov) ovStatus(); } });
    setInterval(watch, 3000);
    return link;
  }
  function stop() { if (link) link.close(); link = null; }
  function active() { var t = Date.now(), k; for (k in phones) if (t - phones[k].t < 15 * 60000) return true; return false; }
  function onCmd(d, meta) {
    if (!d || !C()) return;
    var p = phones[meta.f], fresh = !p; phones[meta.f] = { t: Date.now(), via: meta.via, n: (p && p.n) || d.n || "" }; lastVia = meta.via;
    if (fresh && d.n) toast("\u260E Phone remote connected" + (d.n ? " \u00b7 " + d.n : ""), 2600);
    if (ov && !pairOnly) closeOv();
    var cs = d.c || [], want = false, ln = false;
    for (var i = 0; i < cs.length && i < 30; i++) {
      var c = String(cs[i]);
      if (c === "hello") { want = "now"; continue; }
      if (c === "lineup") { ln = true; continue; }
      try { C().rc(c); } catch (e) { if (W.__cableReport) try { W.__cableReport("Remote: " + (e.message || e)); } catch (x) {} }
      want = want || "soon";
    }
    if (ln) sendLineup(meta.via);
    if (want === "now") pub(true); else if (want) { clearTimeout(pubT); pubT = setTimeout(function () { pub(false); }, meta.via === "mqtt" ? 450 : 1500); }
  }
  var pairOnly = false;
  function stateSig(s) { return [s.on, s.mode, s.ch && s.ch.id, s.title, s.mute, s.vol, s.vod && s.vod.title, s.vod && s.vod.playing, s.dlg].join("|"); }
  function pub(force) {
    if (!link || !C()) return; var s = C().rcState(); s.dev = tvName(); s.app = N("version") ? "android " + N("version") : "web"; s.caps = "web";
    var sig = stateSig(s); if (!force && sig === lastPub) return; lastPub = sig;
    // ntfy has a daily message cap per home network, so state goes there only when the phone is on ntfy (MQTT unreachable) and something changed
    link.send({ st: s }, lastVia === "mqtt" ? "mqtt" : "auto").catch(function () { if (lastVia === "mqtt") link.send({ st: s }, "ntfy").catch(function () {}); });
  }
  function watch() { if (active() && link && link.status().mqtt) pub(false); } // program changes etc. while a phone is open (MQTT only: no message cap)
  function sendLineup(via) { if (!link || !C()) return; link.send({ ln: C().rcLineup(), t: Math.round(Date.now() / 1000) }, "mqtt").catch(function () {}); } // too big for ntfy (4 KB): MQTT only

  // ---------- pairing screen ----------
  var CSS = "#cable-pair{position:fixed;inset:0;z-index:2147483600;background:rgba(0,6,30,.82);display:flex;align-items:center;justify-content:center;font-family:Verdana,Tahoma,sans-serif;color:#fff}" +
    "#cable-pair .cp-box{display:flex;gap:4vmin;align-items:center;background:linear-gradient(#1b3a94,#06164a);border:3px solid #8aa6f0;border-radius:2vmin;padding:4vmin 5vmin;max-width:92vw;box-shadow:0 1vmin 6vmin rgba(0,0,0,.6)}" +
    "#cable-pair .cp-qr{background:#fff;border-radius:1.2vmin;padding:1.6vmin;width:38vmin;height:38vmin;flex:none}#cable-pair .cp-qr img,#cable-pair .cp-qr svg{width:100%;height:100%;display:block;image-rendering:pixelated}" +
    "#cable-pair h2{margin:0 0 1.6vmin;font-size:4.6vmin;font-weight:bold}#cable-pair h2 b{color:#ffcc00}#cable-pair p{margin:.9vmin 0;font-size:2.5vmin;line-height:1.35;color:#dfe8ff}" +
    "#cable-pair .cp-url{color:#fff;font-weight:bold}#cable-pair .cp-code{display:flex;gap:1vmin;margin:1.6vmin 0 2vmin}#cable-pair .cp-code span{background:#000;border:2px solid #ffcc00;color:#ffcc00;border-radius:1vmin;font:bold 6.4vmin/1 Verdana,monospace;width:7.6vmin;padding:1.4vmin 0;text-align:center}" +
    "#cable-pair .cp-st{font-size:2.4vmin;color:#9fd0ff;min-height:3vmin}#cable-pair .cp-st.ok{color:#7dff9a;font-weight:bold}#cable-pair .cp-btns{margin-top:2.2vmin;display:flex;gap:1.4vmin;flex-wrap:wrap}" +
    "#cable-pair button{font:bold 2.4vmin Verdana,sans-serif;color:#fff;background:linear-gradient(#4f6fcf,#16307c);border:2px solid #9fb6ff;border-radius:1vmin;padding:1.2vmin 2.4vmin;cursor:pointer}" +
    "#cable-pair button.focus,#cable-pair button:focus{background:linear-gradient(#ffe066,#ffb400 60%,#e08a00);color:#000;border-color:#fff;outline:none}" +
    "@media (orientation:portrait){#cable-pair .cp-box{flex-direction:column;padding:5vw;gap:4vw}#cable-pair .cp-qr{width:56vw;height:56vw}#cable-pair h2{font-size:6.4vw}#cable-pair p,#cable-pair .cp-st{font-size:3.6vw}#cable-pair .cp-code span{font-size:8vw;width:10vw}#cable-pair button{font-size:3.6vw}}" +
    "html:not(.tv) #remote [data-r=pair]{display:none!important}";
  function css() { if (D.getElementById("cable-pair-css")) return; var s = D.createElement("style"); s.id = "cable-pair-css"; s.textContent = CSS; (D.head || D.documentElement).appendChild(s); }
  function qrLib(cb) { if (W.qrcode) return cb(); var s = D.createElement("script"); s.src = "qrcode.js?v=1"; s.onload = cb; s.onerror = function () { cb(); }; D.head.appendChild(s); }
  function remoteUrl() { return L.REMOTE_URL + "#k=" + key() + "&n=" + encodeURIComponent(tvName()); }
  function open() {
    css(); start(); if (ov) return;
    ov = D.createElement("div"); ov.id = "cable-pair"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Pair a phone remote");
    ov.innerHTML = '<div class="cp-box"><div class="cp-qr" aria-label="QR code: open the Cable Remote on your phone"></div><div class="cp-tx">' +
      '<h2>&#9783; Phone <b>Remote</b></h2><p><b>1.</b> Point your phone\u2019s camera at the code and tap the link.</p>' +
      '<p><b>2.</b> Or open <span class="cp-url">chasebdillard-ai.github.io/cable/remote</span> and enter:</p><div class="cp-code"></div>' +
      '<div class="cp-st">Connecting\u2026</div><div class="cp-btns"><button type="button" data-p="done">Done</button><button type="button" data-p="reset">Unpair all phones</button></div></div></div>';
    D.body.appendChild(ov); sel = 0; hi();
    ov.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-p]"); if (b) act(b.dataset.p); else if (e.target === ov) closeOv(); });
    newCode(); renderQr(); ovStatus();
  }
  function hi() { if (!ov) return; var bs = ov.querySelectorAll("[data-p]"); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("focus", i === sel); }
  function act(a) {
    if (a === "done") return closeOv();
    if (a === "reset") { // new key: every phone paired before stops working; the QR/code change too
      stop(); LS.removeItem(KEY); phones = {}; key(); start(); renderQr(); newCode(); st("All phones unpaired. Pair again with the new code.", false);
    }
  }
  function renderQr() {
    if (!ov) return; var box = ov.querySelector(".cp-qr");
    qrLib(function () { if (!ov || !W.qrcode) return; try { var q = W.qrcode(0, "M"); q.addData(remoteUrl()); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { box.textContent = ""; } });
  }
  function newCode() {
    if (pairN) pairN.close(); code = L.code(); codeT = Date.now();
    var c = ov && ov.querySelector(".cp-code"); if (c) c.innerHTML = code.split("").map(function (x) { return "<span>" + x + "</span>"; }).join("");
    pairN = new L.Ntfy(L.pairTopic(code), onPair, function () { ovStatus(); });
    clearTimeout(newCode.t); newCode.t = setTimeout(function () { if (ov) newCode(); }, 10 * 60000);
  }
  function onPair(s) {
    var m; try { m = JSON.parse(s); } catch (e) { return; }
    if (!m || m.t !== "pair" || !m.p || Date.now() - codeT > 11 * 60000) return;
    var reply = JSON.stringify({ t: "key", p: m.p, k: key(), n: tvName(), tr: "mn" });
    L.ntfyPost(L.pairTopic(code), reply, true).then(function () { st("\u2714 Paired with " + (String(m.n || "your phone").slice(0, 40)) + ". You can put the phone remote to work.", true); setTimeout(function () { if (ov) closeOv(); }, 4000); })
      .catch(function () { st("Couldn't answer the phone (relay busy). Try entering the code again.", false); });
  }
  function st(t, ok) { var e = ov && ov.querySelector(".cp-st"); if (!e) return; e.textContent = t; e.className = "cp-st" + (ok ? " ok" : ""); }
  function ovStatus() { if (!ov) return; var e = ov.querySelector(".cp-st"); if (e && e.className.indexOf("ok") >= 0) return;
    var s = link ? link.status() : { mqtt: 0, ntfy: false }; st(s.mqtt || s.ntfy ? "Ready \u2014 waiting for your phone\u2026" : "Connecting to the remote relay\u2026", false); }
  function closeOv() { if (!ov) return; if (ov.parentNode) ov.parentNode.removeChild(ov); ov = null; if (pairN) { pairN.close(); pairN = null; } clearTimeout(newCode.t); }
  // keys while the pairing screen is open (window capture runs before app.js's document handler)
  W.addEventListener("keydown", function (e) {
    if (!ov) return; var k = e.key, kc = e.keyCode;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (k === "ArrowLeft" || k === "ArrowUp") { sel = 0; hi(); } else if (k === "ArrowRight" || k === "ArrowDown") { sel = 1; hi(); }
    else if (k === "Enter" || k === " " || kc === 13 || kc === 23) act(sel ? "reset" : "done");
    else if (k === "Escape" || k === "Backspace" || k === "GoBack" || k === "BrowserBack" || kc === 4 || kc === 461 || kc === 10009 || kc === 27) closeOv();
  }, true);
  // TV app Back button (native -> window.__cableBack): close the pairing screen first
  function hookBack() { var cb = W.__cableBack; if (cb && !cb.__rmt) { W.__cableBack = function () { if (ov) { closeOv(); return "handled"; } return cb.apply(this, arguments); }; W.__cableBack.__rmt = 1; } }
  setInterval(hookBack, 700);

  css(); // also hides the PHONE REMOTE bar button on phones/desktop (the touch remote) from the start
  W.CableRemoteTV = { open: open, close: closeOv, isOpen: function () { return !!ov; }, link: function () { return link; }, code: function () { return code; }, url: remoteUrl, pub: pub, phones: function () { return phones; } };
  // already paired on this device: listen for the phone from the start (once Cable has its lineup)
  if (LS.getItem(KEY)) { var tries = 0, iv = setInterval(function () { if (C() || ++tries > 120) { clearInterval(iv); if (C()) start(); } }, 500); }
  // ?pair=1 opens the pairing screen (handy from tv.html / the remote's help page)
  if (/[?&]pair=1/.test(location.search)) { var t2 = 0, iv2 = setInterval(function () { if (C() || ++t2 > 120) { clearInterval(iv2); open(); } }, 500); }
})(window, document);

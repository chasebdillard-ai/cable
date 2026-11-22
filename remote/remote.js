/* Cable Remote - phone side (2026-11-21). Pairs with Cable on a TV (code or QR), remembers TVs, sends commands, shows what the TV is showing.
   Transport: ../rlink.js (MQTT on public brokers + ntfy.sh, HMAC-signed with the TV's key). Lineup now-playing comes from the TV itself
   (exact, incl. live overrides); without an answer it falls back to ../epg.json (live-feed channels) and the channel taglines. */
(function (W, D) {
  "use strict";
  var L = W.CableLink, LS = W.localStorage, $ = function (s, r) { return (r || D).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || D).querySelectorAll(s)); };
  var ST = load(), link = null, tvst = null, stAt = 0, helloAt = 0, lineup = null, lineupAt = 0, LIVE = null, EPG = null, q = [], qT = 0, tab = "remote", warnT = 0, pairN = null, pairT = 0;
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var STANDALONE = W.navigator.standalone === true || (W.matchMedia && matchMedia("(display-mode: standalone)").matches);
  function load() { var s = null; try { s = JSON.parse(LS.getItem("cable_remote") || "null"); } catch (e) {} s = s || {}; s.tvs = s.tvs || []; s.cur = s.cur || 0; if (!s.pid) s.pid = "ph" + L.rnd(10); return s; }
  function save() { try { LS.setItem("cable_remote", JSON.stringify(ST)); } catch (e) {} }
  function cur() { return ST.tvs[ST.cur] || null; }
  function phoneName() { var u = navigator.userAgent; return /iPad/.test(u) ? "iPad" : /iPhone/.test(u) ? "iPhone" : /Android/.test(u) ? "Android phone" : "Phone"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, ms) { var e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, ms || 2000); }
  function warn(t) { var w = $("#warn"); if (!t) { w.hidden = true; return; } w.innerHTML = t; w.hidden = false; }
  function haptic() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
  function isRoku() { var t = cur(); return !!(t && (t.caps === "roku" || (tvst && tvst.caps === "roku"))); }
  function ntfyOnly() { var t = cur(); return !!(t && t.tr && t.tr.indexOf("m") < 0); }

  // ---------- TVs ----------
  function addTv(k, n, tr) {
    if (!k || k.length < 20) return false; var i, t = null;
    for (i = 0; i < ST.tvs.length; i++) if (ST.tvs[i].k === k) { t = ST.tvs[i]; ST.cur = i; }
    if (!t) { t = { k: k, n: n || "TV", tr: tr || "mn", at: Date.now() }; ST.tvs.push(t); ST.cur = ST.tvs.length - 1; }
    if (n) t.n = n; if (tr) t.tr = tr; save(); return true;
  }
  function keepHash() { var t = cur(); if (!t) return; try { history.replaceState(null, "", "#k=" + t.k + "&n=" + encodeURIComponent(t.n) + (t.tr && t.tr !== "mn" ? "&tr=" + t.tr : "")); } catch (e) {} }
  function fromHash() {
    var h = location.hash.replace(/^#/, ""), p = {}; h.split("&").forEach(function (kv) { var a = kv.split("="); if (a[0]) p[a[0]] = decodeURIComponent(a[1] || ""); });
    if (p.k && addTv(p.k, p.n, p.tr)) return true; if (p.c) { $("#code").value = p.c; } return false;
  }

  // ---------- link ----------
  function connect() {
    if (link) link.close(); link = null; tvst = null; stAt = 0; lineup = null; renderNow(); renderList();
    var t = cur(); if (!t) return;
    link = new L.Link(t.k, "phone", { id: ST.pid, mqtt: !ntfyOnly(), onMsg: onMsg, onStatus: status, nextSeq: function (s) { var x = Math.max(s, (ST.seq || 0) + 1); ST.seq = x; save(); return x; } });
    $(".tvname").textContent = t.n; status();
    setTimeout(hello, ntfyOnly() ? 2500 : 1200);
  }
  function status() {
    var s = link ? link.status() : { mqtt: 0, ntfy: false }, dot = $("#tvbtn .dot"), fresh = Date.now() - stAt < 90000;
    dot.className = "dot " + (fresh ? "on" : s.mqtt || s.ntfy ? "half" : "off");
    dot.title = fresh ? "TV connected" : s.mqtt || s.ntfy ? "Connected to the relay - waiting for the TV" : "Connecting\u2026";
  }
  function hello() { if (!link) return; helloAt = Date.now(); send("hello", true);
    clearTimeout(warnT); warnT = setTimeout(function () { if (stAt < helloAt) { warn(isRoku() ? "Your Roku isn't answering. Open the <b>Cable</b> channel on the Roku (beta 1.1+) and try again." : "Your TV isn't answering. Make sure <b>Cable</b> is open on the TV (it can be on any channel). Buttons still send." ); status(); } }, 9000); }
  function onMsg(d) {
    if (d.st) { tvst = d.st; stAt = Date.now(); warn(""); var t = cur(); if (t && d.st.dev && t.n !== d.st.dev && /^(TV|Fire TV|Google TV|Android TV|Smart TV|Roku)$/.test(t.n)) { t.n = d.st.dev; save(); $(".tvname").textContent = t.n; }
      if (t && d.st.caps && t.caps !== d.st.caps) { t.caps = d.st.caps; save(); applyCaps(); } renderNow(); status(); renderList(true); }
    if (d.ln) { lineup = {}; d.ln.forEach(function (r) { lineup[r[0]] = r; }); lineupAt = Date.now(); renderList(); }
  }
  // commands are queued and sent together (one relay message per burst)
  function send(cmd, now) {
    q.push(cmd); clearTimeout(qT);
    if (now) return flush();
    qT = setTimeout(flush, ntfyOnly() ? 280 : 35);
  }
  function flush() {
    if (!q.length || !link) { q = []; return; } var c = q; q = [];
    link.send({ c: c, n: phoneName() }, ntfyOnly() ? "ntfy" : "auto").then(function (via) { if (via === "ntfy" && !ntfyOnly() && !flush.noted) { flush.noted = 1; } })
      .catch(function (e) {
        if (e && e.message === "limit") warn("The free relay's daily limit for your home network is used up (it resets within 24 hours). The TV's own remote still works.");
        else warn("Couldn't reach the remote relay. Check your phone's internet connection.");
      });
  }

  // ---------- now watching ----------
  function renderNow() {
    var s = tvst, box = $("#now");
    if (!s) { $(".nw-ch").textContent = cur() ? "Connecting to " + cur().n + "\u2026" : ""; $(".nw-tag").textContent = ""; $(".nw-title").innerHTML = "&nbsp;"; $(".nw-sub").textContent = ""; $(".nw-logo").innerHTML = ""; $(".nw-logo").className = "nw-logo"; $(".nw-bar i").style.width = "0"; return; }
    var lg = $(".nw-logo");
    if (s.caps === "roku") { $(".nw-ch").textContent = "ROKU"; $(".nw-tag").textContent = s.dev || ""; $(".nw-title").textContent = s.title || "Cable on Roku"; $(".nw-sub").textContent = s.sub || "D-pad, OK, Back, play/pause and volume"; lg.className = "nw-logo"; lg.textContent = "ROKU"; $(".nw-bar i").style.width = "0"; return; }
    if (!s.on) { $(".nw-ch").textContent = s.gate ? "NOT LIVE YET" : "TV IS ON THE POWER SCREEN"; $(".nw-tag").textContent = s.dev || ""; $(".nw-title").textContent = "Press OK to watch TV"; $(".nw-sub").textContent = ""; lg.className = "nw-logo"; lg.textContent = ""; return; }
    var c = s.ch || {};
    if (s.vod) { $(".nw-ch").textContent = "ON DEMAND"; $(".nw-title").textContent = s.vod.title; $(".nw-sub").textContent = (s.vod.src || "") + (s.vod.dur ? "  \u00b7  " + mmss(s.vod.pos) + " / " + mmss(s.vod.dur) : ""); }
    else { $(".nw-ch").textContent = "CH " + c.n + "  \u00b7  " + (c.name || ""); $(".nw-title").textContent = s.title || c.name || ""; $(".nw-sub").textContent = (s.start ? hm(s.start) + " \u2013 " + hm(s.end) + (s.sub ? "  \u00b7  " : "") : "") + (s.sub || ""); }
    $(".nw-tag").textContent = s.mode === "guide" ? "GUIDE" : s.mode === "od" ? "MENU" : c.live && !s.vod ? "LIVE" : "";
    if (c.logo) { lg.className = "nw-logo" + (c.plate === "d" ? " pd" : ""); if (!lg.querySelector("img") || lg.dataset.id !== c.id) { lg.innerHTML = '<img alt="" src="../' + esc(c.logo) + '">'; lg.dataset.id = c.id; } }
    else { lg.className = "nw-logo"; lg.textContent = c.call || ""; lg.dataset.id = ""; }
    $("#mutebtn").classList.toggle("on", !!s.mute); $("#mutebtn").textContent = s.mute ? "MUTED" : "MUTE";
    tickBar();
  }
  function tickBar() { var s = tvst; if (!s) return; var w = 0; if (s.vod && s.vod.dur) w = s.vod.pos / s.vod.dur; else if (s.start && s.end > s.start) w = (Date.now() / 1000 - s.start) / (s.end - s.start); $(".nw-bar i").style.width = Math.max(0, Math.min(100, w * 100)) + "%"; }
  setInterval(function () { tickBar(); status(); }, 5000);
  function hm(t) { var x = new Date(t * 1000), h = x.getHours(), m = x.getMinutes(); return (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + (h < 12 ? "a" : "p"); }
  function mmss(s) { s = Math.max(0, Math.round(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x; }

  // ---------- buttons ----------
  function bindPress(el, fire, rep) {
    var t1 = 0, t2 = 0, down = false;
    function stop() { down = false; clearTimeout(t1); clearInterval(t2); el.classList.remove("press"); }
    el.addEventListener("pointerdown", function (e) { if (e.button > 0) return; e.preventDefault(); down = true; el.classList.add("press"); haptic(); fire();
      if (rep) t1 = setTimeout(function () { if (down) t2 = setInterval(function () { if (down) fire(); else stop(); }, ntfyOnly() ? 450 : 170); }, 420); });
    ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach(function (ev) { el.addEventListener(ev, stop); });
    el.addEventListener("click", function (e) { if (e.detail === 0) fire(); }); // keyboard / switch control
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }
  $$("[data-c]").forEach(function (b) { bindPress(b, function () { send(b.dataset.c); }, !!b.dataset.rep); });
  // keypad: digits collect, then one "num:NN" command (1.6 s after the last digit, or ENTER)
  var kv = "", kT = 0;
  function kshow() { $("#kval").innerHTML = kv ? esc(kv) + "<span style='opacity:.4'>_</span>" : "&nbsp;"; var c = kv && LIVE ? LIVE.ch.filter(function (x) { return String(x.n) === String(parseInt(kv, 10)); })[0] : null; $("#kname").textContent = kv ? (c ? c.name : LIVE ? "No channel " + parseInt(kv, 10) : "") : "Type a channel number"; }
  function kgo() { clearTimeout(kT); if (!kv) return; send("num:" + parseInt(kv, 10)); toast("Channel " + parseInt(kv, 10)); kv = ""; setTimeout(kshow, 500); }
  $$("[data-k]").forEach(function (b) { bindPress(b, function () { var k = b.dataset.k; clearTimeout(kT);
    if (k === "del") kv = kv.slice(0, -1); else if (k === "go") return kgo(); else kv = (kv + k).slice(-3);
    kshow(); if (kv) kT = setTimeout(kgo, 1600); }, false); });

  // ---------- tabs ----------
  function showTab(t) { tab = t; $$("#tabs [data-t]").forEach(function (b) { b.classList.toggle("on", b.dataset.t === t); }); $$(".page").forEach(function (p) { p.classList.toggle("on", p.id === "p-" + t); });
    if (t === "chans") { loadLive(); if (!lineup || Date.now() - lineupAt > 120000) askLineup(); renderList(); }
    if (t === "keys") { loadLive(); kshow(); } }
  $$("#tabs [data-t]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.t); }); });

  // ---------- channel list ----------
  function loadLive() {
    if (LIVE || loadLive.busy) return; loadLive.busy = 1;
    fetch("../live.json?h=" + Math.floor(Date.now() / 3600000)).then(function (r) { return r.json(); }).then(function (j) { LIVE = j; renderList(); kshow(); }).catch(function () { loadLive.busy = 0; });
    setTimeout(function () { if (!lineup) loadEpg(); }, 3500);
  }
  function loadEpg() { if (EPG || loadEpg.busy) return; loadEpg.busy = 1; fetch("../epg.json?t=" + Math.floor(Date.now() / 600000)).then(function (r) { return r.json(); }).then(function (j) { EPG = j; renderList(); }).catch(function () { loadEpg.busy = 0; }); }
  function askLineup() { if (link && !ntfyOnly() && !isRoku()) send("lineup", true); }
  setInterval(function () { if (tab === "chans" && !D.hidden && (Date.now() - lineupAt > 300000 || Math.floor(Date.now() / 1800000) !== Math.floor(lineupAt / 1800000))) askLineup(); }, 30000);
  function epgNow(id) { var c = EPG && EPG.ch && EPG.ch[id], t = Date.now() / 1000; if (c) for (var i = 0; i < c.p.length; i++) { var p = c.p[i]; if (p[0] <= t && t < p[1]) return [id, p[2], p[3] || "", p[0], p[1]]; } var f = EPG && EPG.fb && EPG.fb[id]; return f ? [id, f[0], "", 0, 0] : null; }
  function renderList(light) {
    if (tab !== "chans" && light) return; var box = $("#chlist"); if (!LIVE) { box.innerHTML = '<p class="fine" style="padding:0 6px">Loading channels\u2026</p>'; return; }
    var qq = ($("#q").value || "").trim().toLowerCase(), cid = tvst && tvst.ch ? tvst.ch.id : "", t = Date.now() / 1000, html = "";
    LIVE.ch.forEach(function (c) {
      var p = (lineup && lineup[c.id]) || (c.hls ? epgNow(c.id) : null), title = p ? p[1] : c.tag || "", sub = p ? p[2] : "";
      if (qq && (c.name + " " + c.call + " " + c.n + " " + title + " " + sub).toLowerCase().indexOf(qq) < 0) return;
      var lg = LIVE.logos && LIVE.logos[c.id], prog = p && p[3] && p[4] > p[3] ? Math.max(0, Math.min(100, (t - p[3]) / (p[4] - p[3]) * 100)) : 0;
      html += '<button type="button" role="listitem" class="chr' + (c.id === cid ? " cur" : "") + '" data-id="' + esc(c.id) + '" data-n="' + c.n + '"><span class="n">' + c.n + '</span>' +
        '<span class="lg' + (lg && lg[0] === "d" ? " pd" : "") + '">' + (lg ? '<img loading="lazy" alt="" src="../logos/' + esc(c.id) + '.png">' : esc(c.call)) + '</span>' +
        '<span class="tx"><span class="nm">' + esc(c.name) + (c.hls ? '<span class="lv">LIVE</span>' : "") + '</span><span class="pt">' + esc(title) + '</span>' + (sub || p && p[3] ? '<span class="ps">' + (p && p[3] ? hm(p[3]) + " \u2013 " + hm(p[4]) + (sub ? "  \u00b7  " : "") : "") + esc(sub) + "</span>" : "") +
        (prog ? '<span class="nw-bar" style="margin-top:3px"><i style="width:' + prog.toFixed(1) + '%"></i></span>' : "") + "</span></button>";
    });
    box.innerHTML = html || '<p class="fine" style="padding:0 6px">No channels match.</p>';
    $("#chnote").textContent = isRoku() ? "Tap-to-tune isn't available on the Roku app yet; use the D-pad on the Remote tab." : lineup ? "" : "Now-playing for every channel appears once your TV answers.";
  }
  $("#chlist").addEventListener("click", function (e) { var b = e.target.closest(".chr"); if (!b) return; haptic(); send("ch:" + b.dataset.id); toast("Tuning CH " + b.dataset.n);
    $$(".chr.cur").forEach(function (x) { x.classList.remove("cur"); }); b.classList.add("cur"); });
  $("#q").addEventListener("input", function () { renderList(); });

  // ---------- pairing ----------
  function showPair(cancelable) {
    $("#pair").hidden = false; $("#now").hidden = $("#pages").hidden = $("#tabs").hidden = true; $("#tvbtn").hidden = !ST.tvs.length; warn("");
    $("#paircancel").hidden = !cancelable; $("#pairmsg").textContent = ""; $("#pairmsg").className = "msg";
    if (IOS && !STANDALONE) $("#pair .fine").innerHTML += ""; setTimeout(function () { try { if (!("ontouchstart" in W)) $("#code").focus(); } catch (e) {} }, 50);
  }
  function showRemote() {
    $("#pair").hidden = true; $("#now").hidden = $("#pages").hidden = $("#tabs").hidden = false; $("#tvbtn").hidden = false; keepHash(); applyCaps(); connect(); showTab(tab);
  }
  function applyCaps() { var r = isRoku(); $$('[data-c="guide"],[data-c="exit"],[data-c="last"],[data-c="rec"],[data-c="dvr"],[data-c="od"],[data-c="cc"],[data-c="menu"]').forEach(function (b) { b.disabled = r; b.style.opacity = r ? .35 : ""; }); }
  function pairMsg(t, cls) { var m = $("#pairmsg"); m.innerHTML = t; m.className = "msg" + (cls ? " " + cls : ""); }
  $("#code").addEventListener("input", function () { var v = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); if (this.value !== v) this.value = v; });
  $("#pairform").addEventListener("submit", function (e) { e.preventDefault(); pairCode($("#code").value); });
  $("#paircancel").addEventListener("click", function () { if (pairN) pairN.close(); showRemote(); });
  function pairCode(raw) {
    var code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) return pairMsg("The code on your TV has 6 letters and numbers.", "err");
    if (pairN) pairN.close(); clearTimeout(pairT); $("#pairbtn").disabled = true; pairMsg("Looking for your TV\u2026");
    var topic = L.pairTopic(code), done = false, posted = 0;
    function post() { posted++; L.ntfyPost(topic, JSON.stringify({ t: "pair", p: ST.pid, n: phoneName() })).catch(function (e) { pairMsg(e && e.message === "limit" ? "The free relay is busy for your network right now. Try again in a minute." : "Couldn't reach the pairing relay. Check your internet connection.", "err"); $("#pairbtn").disabled = false; }); }
    pairN = new L.Ntfy(topic, function (s) {
      var m; try { m = JSON.parse(s); } catch (x) { return; }
      if (!m || m.t !== "key" || m.p !== ST.pid || done) return; done = true; clearTimeout(pairT); pairN.close(); pairN = null; $("#pairbtn").disabled = false;
      addTv(m.k, m.n, m.tr); pairMsg("\u2714 Paired with " + esc(m.n || "your TV"), "ok"); toast("Paired with " + (m.n || "your TV")); $("#code").value = ""; setTimeout(showRemote, 700);
    }, function (ok) { if (ok && !posted) post(); });
    setTimeout(function () { if (!done && posted === 1) post(); }, 5000);
    pairT = setTimeout(function () { if (done) return; if (pairN) pairN.close(); pairN = null; $("#pairbtn").disabled = false;
      pairMsg("No TV answered that code. Check it against the TV (it changes every 10 minutes) and keep the TV on its <b>Phone Remote</b> screen.", "err"); }, 14000);
  }

  // ---------- TVs sheet ----------
  $("#tvbtn").addEventListener("click", function () { renderTvs(); $("#sheet").hidden = false; });
  $("#shclose").addEventListener("click", function () { $("#sheet").hidden = true; });
  $("#sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") $("#sheet").hidden = true; });
  $("#addtv").addEventListener("click", function () { $("#sheet").hidden = true; if (link) link.close(); link = null; showPair(true); });
  function renderTvs() {
    $("#tvlist").innerHTML = ST.tvs.map(function (t, i) { return '<div class="tvr' + (i === ST.cur ? " cur" : "") + '"><span class="nm">' + esc(t.n) + "<small>" + (i === ST.cur ? "In use" : "Paired " + new Date(t.at).toLocaleDateString()) + (t.caps === "roku" ? " \u00b7 Roku" : "") + '</small></span>' +
      (i === ST.cur ? "" : '<button type="button" data-use="' + i + '">Use</button>') + '<button type="button" data-del="' + i + '">Remove</button></div>'; }).join("") || '<p class="fine">No TVs yet.</p>';
    $("#a2hs").innerHTML = IOS && !STANDALONE ? "Tip: in Safari tap <b>Share</b> &rsaquo; <b>Add to Home Screen</b> to keep Cable Remote one tap away." : !STANDALONE ? "Tip: use your browser's <b>Install app</b> / <b>Add to Home screen</b> to keep Cable Remote one tap away." : "";
  }
  $("#tvlist").addEventListener("click", function (e) {
    var u = e.target.closest("[data-use]"), d = e.target.closest("[data-del]");
    if (u) { ST.cur = +u.dataset.use; save(); $("#sheet").hidden = true; showRemote(); }
    if (d) { var i = +d.dataset.del; ST.tvs.splice(i, 1); if (ST.cur >= ST.tvs.length) ST.cur = Math.max(0, ST.tvs.length - 1); else if (i < ST.cur) ST.cur--; save();
      if (!ST.tvs.length) { $("#sheet").hidden = true; if (link) link.close(); link = null; try { history.replaceState(null, "", location.pathname); } catch (x) {} showPair(false); } else { renderTvs(); showRemote(); } }
  });

  // ---------- lifecycle ----------
  D.addEventListener("visibilitychange", function () { if (!D.hidden && cur() && !$("#pages").hidden) { if (Date.now() - stAt > 20000) hello(); if (tab === "chans") askLineup(); } });
  W.addEventListener("pageshow", function (e) { if (e.persisted && cur()) hello(); });
  setInterval(function () { if (!D.hidden && link && !ntfyOnly() && link.status().mqtt && Date.now() - stAt > 60000 && Date.now() - helloAt > 60000) hello(); }, 15000);
  W.addEventListener("hashchange", function () { if (fromHash()) showRemote(); });
  if (IOS && !STANDALONE) { var f = $("#pair .fine"); if (f) f.innerHTML += "<br>Tip: after pairing, tap <b>Share</b> &rsaquo; <b>Add to Home Screen</b>."; }
  fromHash();
  if (cur()) showRemote(); else showPair(false);
  W.__remote = { ST: ST, send: send, state: function () { return tvst; }, lineup: function () { return lineup; }, link: function () { return link; }, pairCode: pairCode };
})(window, document);

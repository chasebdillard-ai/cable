/* Cable - 2006 digital cable mimic. Live channels = deterministic schedules over free full-length YouTube videos (+3 real HLS networks).
   Modes: tv (full video + flip-bar banner), guide (i-Guide grid), od (ON DEMAND menus), vod (on-demand playback). One persistent YouTube player. */
(function () {
  "use strict";
  var d = document, W = window, $ = function (s, r) { return (r || d).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || d).querySelectorAll(s)); };
  var UA = navigator.userAgent;
  var IS_TV = /SMART-TV|SmartTV|Tizen|Web0S|webOS|AFT[A-Z]|CrKey|BRAVIA|Android TV|GoogleTV|AppleTV|HbbTV|NetCast|Roku|Silk\/.*TV|DTV|Large Screen/i.test(UA) || !!W.TVNative || /[?&]tv=1/.test(location.search);
  if (IS_TV) d.documentElement.classList.add("tv");
  var APPLE = /iP(hone|ad|od)/.test(UA) || (/Safari\//.test(UA) && /Apple/.test(navigator.vendor || "") && !/Chrome|Chromium|CriOS|Android/.test(UA));
  var CAT = null, LIVE = null, SRC = [], SHOWS = [], PEOPLE = [], GEN = [], VV = [], CH = [];
  var TYPEN = { E: "Episode", M: "Movie", D: "Documentary", S: "Special", K: "Marathon" };
  var S = { mode: "boot", ch: 0, last: 0, playing: null, vod: null, override: null, started: false, soundOK: false, bad: {} };
  var LS = W.localStorage || { getItem: function () { return null; }, setItem: function () {} };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function now() { return (W.__cableNow ? W.__cableNow() : Date.now()) / 1000; }
  function hm(t) { var x = new Date(t * 1000), h = x.getHours(), m = x.getMinutes(); return (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + (h < 12 ? "a" : "p"); }
  function clock() { var x = new Date(now() * 1000), h = x.getHours(), m = x.getMinutes(); return (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + " " + (h < 12 ? "AM" : "PM"); }
  function dur(s) { s = Math.max(0, Math.round(s)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x; }
  function mins(s) { var m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60 ? (m % 60) + "m" : "") : m + " min"; }
  function toast(t, ms) { var e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, ms || 2600); }
  function thumb(id, q) { return "https://i.ytimg.com/vi/" + id + "/" + (q || "mqdefault") + ".jpg"; }

  // ---------- data ----------
  function V(i) { var v = VV[i]; return { i: i, id: v[0], t: v[1], d: v[2], src: v[3], sh: v[4], s: v[5], e: v[6], ty: v[7], yr: v[8], up: v[9], g: v[10], cast: v[11] }; }
  function vtitle(v) { var sh = v.sh >= 0 ? SHOWS[v.sh].n : ""; return sh ? sh + (v.s || v.e ? " (S" + (v.s || "?") + (v.e ? ", E" + v.e : "") + ")" : "") + ": " + v.t : v.t; }
  function logo(c, big) {
    var st = c.sty || ["#123", "#fff", "sans"];
    if (c.id === "upn") return '<span class="lg sans" style="background:' + st[0] + ';padding:.2em .4em"><img src="upn.svg" alt="UPN"></span>';
    return '<span class="lg ' + esc(st[2]) + (c.hls ? " live" : "") + '" style="background:' + st[0] + ";color:" + st[1] + '">' + esc(big ? c.name.length > 14 ? c.call : c.name : c.call) + "</span>";
  }
  function prep() {
    SRC = CAT.src; SHOWS = CAT.shows; PEOPLE = CAT.people; GEN = CAT.genres; VV = CAT.v; CH = LIVE.ch;
    CH.forEach(function (c, n) {
      c.idx = n;
      if (c.seq) { var p = [0], t = 0; c.seq.forEach(function (i) { t += VV[i][2]; p.push(t); }); c.pre = p; c.T = t; }
    });
    // facet indexes
    var byShow = {}, byPerson = {}, byGenre = {}, byDec = {}, byType = {}, bySrc = {};
    VV.forEach(function (v, i) {
      (byShow[v[4]] = byShow[v[4]] || []).push(i);
      (bySrc[v[3]] = bySrc[v[3]] || []).push(i);
      (byType[v[7]] = byType[v[7]] || []).push(i);
      v[10].forEach(function (g) { (byGenre[g] = byGenre[g] || []).push(i); });
      v[11].forEach(function (p) { (byPerson[p] = byPerson[p] || { s: [], v: [] }).v.push(i); });
      if (v[8]) { var dc = Math.floor(v[8] / 10) * 10; (byDec[dc] = byDec[dc] || []).push(i); }
    });
    SHOWS.forEach(function (s, n) { s.cast.forEach(function (p) { (byPerson[p] = byPerson[p] || { s: [], v: [] }).s.push(n); }); s.vids = byShow[n] || []; });
    // which live channels carry each show / source
    var chShow = {}, chSrc = {};
    CH.forEach(function (c) { (c.seq || []).forEach(function (i) { var v = VV[i]; if (v[4] >= 0) { (chShow[v[4]] = chShow[v[4]] || {})[c.idx] = 1; } (chSrc[v[3]] = chSrc[v[3]] || {})[c.idx] = 1; }); });
    W.CABLE_IDX = { byShow: byShow, byPerson: byPerson, byGenre: byGenre, byDec: byDec, byType: byType, bySrc: bySrc, chShow: chShow, chSrc: chSrc };
  }
  var IX = function () { return W.CABLE_IDX; };

  // ---------- schedule ----------
  function at(c, t) { // -> {i(video idx), k(seq pos), start, end}
    var pos = ((t - LIVE.epoch) % c.T + c.T) % c.T, lo = 0, hi = c.seq.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (c.pre[mid] <= pos) lo = mid; else hi = mid - 1; }
    var st = t - (pos - c.pre[lo]);
    return { k: lo, i: c.seq[lo], start: st, end: st + VV[c.seq[lo]][2] };
  }
  function nextOf(c, p) { var k = (p.k + 1) % c.seq.length; return { k: k, i: c.seq[k], start: p.end, end: p.end + VV[c.seq[k]][2] }; }
  function progs(c, t0, t1) { if (c.hls) return [{ live: 1, start: t0 - 3600, end: t1 + 3600 }]; var out = [], p = at(c, t0); while (p.start < t1 && out.length < 60) { out.push(p); p = nextOf(c, p); } return out; }

  // ---------- YouTube player ----------
  var YTP = null, ytReady = false, ytQ = null;
  function loadYT() {
    var s = d.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; d.head.appendChild(s);
    W.onYouTubeIframeAPIReady = function () {
      YTP = new YT.Player("yt", { width: "100%", height: "100%", host: "https://www.youtube.com",
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, enablejsapi: 1, origin: location.origin },
        events: { onReady: function () { ytReady = true; var f = YTP.getIframe && YTP.getIframe(); if (f) { f.setAttribute("allow", "autoplay; encrypted-media"); f.setAttribute("tabindex", "-1"); }
            if (ytQ) { var q = ytQ; ytQ = null; ytLoad(q.id, q.at); } },
          onStateChange: onYTState, onError: onYTError } });
    };
  }
  var LOG = W.CABLE_LOG = [];
  function ytLoad(id, start) {
    LOG.push(["load", id, Math.round(start || 0), Date.now()]);
    if (!ytReady) { ytQ = { id: id, at: start }; return; }
    try { YTP.loadVideoById({ videoId: id, startSeconds: Math.max(0, Math.floor(start || 0)) }); if (S.soundOK) { YTP.unMute(); YTP.setVolume(100); } YTP.playVideo(); } catch (e) {}
    clearTimeout(ytLoad.wd); ytLoad.wd = setTimeout(function () { // muted-autoplay fallback
      try { var st = YTP.getPlayerState(); if (st !== 1 && st !== 3) { YTP.mute(); YTP.playVideo(); $("#unmute").hidden = false; } } catch (e) {}
    }, 2500);
  }
  function ytStop() { try { if (ytReady) YTP.pauseVideo(); } catch (e) {} }
  function onYTState(e) {
    LOG.push(["state", e.data, Date.now()]);
    if (e.data === 1) { $("#snow").hidden = true; try { if (!YTP.isMuted()) $("#unmute").hidden = true; } catch (x) {} }
    if (e.data === 0) { // ended
      if (S.mode === "vod" || S.vod) return vodNext();
      S.override = null; tune(S.ch, { quiet: true });
    }
  }
  function onYTError(e) {
    LOG.push(["error", e.data, Date.now()]);
    if (S.vod) { toast("This program is unavailable - skipping"); S.bad[S.vod.id] = 1; return setTimeout(vodNext, 1200); }
    var c = CH[S.ch]; if (!c || c.hls) return;
    var p = S.override || at(c, now()); S.bad[VV[p.i][0]] = 1;
    var n = nextOf(c, p), tries = 0;
    while (S.bad[VV[n.i][0]] && tries++ < 5) n = nextOf(c, n);
    S.override = { k: n.k, i: n.i, start: now(), end: now() + VV[n.i][2], ch: S.ch };
    $("#snow").hidden = false; setTimeout(function () { $("#snow").hidden = true; }, 1500);
    S.playing = VV[n.i][0]; ytLoad(VV[n.i][0], 0); showBanner();
  }

  // ---------- HLS ----------
  var hls = null, hlsWd = null, hlsRetry = null;
  function hlsLib() {
    if (W.Hls) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = d.getElementById("hlsjs");
      if (!s) { s = d.createElement("script"); s.id = "hlsjs"; s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"; d.head.appendChild(s); }
      s.addEventListener("load", function () { res(); }); s.addEventListener("error", function () { rej(); });
      setTimeout(function () { if (W.Hls) res(); }, 50);
    });
  }
  function killHls() {
    clearInterval(hlsWd); clearTimeout(hlsRetry); hlsWd = hlsRetry = null;
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    var v = $("#hls"); try { v.onerror = null; v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {} v.hidden = true;
  }
  function tuneHls(c) {
    killHls(); ytStop();
    var v = $("#hls"), srcs = c.hls.slice(), i = 0, round = 0, medRec = 0, me = c;
    v.hidden = false; v.muted = !S.soundOK;
    function go() { var q = v.play(); if (q && q.catch) q.catch(function () { v.muted = true; $("#unmute").hidden = false; v.play().catch(function () {}); }); }
    function fail() {
      if (CH[S.ch] !== me) return;
      if (hls) { try { hls.destroy(); } catch (e) {} hls = null; } clearInterval(hlsWd);
      i++; if (i < srcs.length) return play();
      $("#snow").hidden = false; toast(me.name + " isn't responding - retrying", 4000);
      hlsRetry = setTimeout(function () { if (CH[S.ch] === me) { i = 0; round++; play(); } }, Math.min(60, 15 * (round + 1)) * 1000);
    }
    function watch() { var last = -1, still = 0; hlsWd = setInterval(function () { if (CH[S.ch] !== me || v.paused) { still = 0; return; } if (v.currentTime === last) { if (++still >= 2) fail(); } else { still = 0; last = v.currentTime; $("#snow").hidden = true; } }, 10000); }
    function play() {
      if (CH[S.ch] !== me) return; medRec = 0; var u = srcs[i]; LOG.push(["hls", u, Date.now()]);
      if (APPLE && v.canPlayType("application/vnd.apple.mpegurl")) { v.onerror = fail; v.src = u; go(); watch(); return; }
      hlsLib().then(function () {
        if (CH[S.ch] !== me) return;
        if (!W.Hls || !Hls.isSupported()) { if (v.canPlayType("application/vnd.apple.mpegurl")) { v.onerror = fail; v.src = u; go(); watch(); } else fail(); return; }
        hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 3, fragLoadingMaxRetry: 3 });
        hls.on(Hls.Events.ERROR, function (e, data) { if (!data.fatal) return; if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !medRec) { medRec = 1; try { hls.recoverMediaError(); } catch (x) { fail(); } return; } fail(); });
        hls.on(Hls.Events.MANIFEST_PARSED, go);
        hls.loadSource(u); hls.attachMedia(v); watch();
      }, function () { fail(); });
    }
    v.onplaying = function () { $("#snow").hidden = true; if (!v.muted) $("#unmute").hidden = true; };
    play();
  }
  W.__cableHls = function () { return $("#hls"); };

  // ---------- tuning ----------
  function tune(n, o) {
    o = o || {}; n = (n + CH.length) % CH.length;
    if (n !== S.ch && !o.keepLast) S.last = S.ch;
    S.ch = n; S.vod = null; S.override = null; var c = CH[n];
    LS.setItem("cable_ch", c.n);
    $("#vodbar").hidden = true; $("#snow").hidden = true;
    if (c.hls) { S.playing = "hls:" + c.id; tuneHls(c); }
    else {
      killHls(); var p = at(c, now()), tries = 0;
      while (S.bad[VV[p.i][0]] && tries++ < 5) p = nextOf(c, p);
      S.playing = VV[p.i][0]; ytLoad(VV[p.i][0], Math.max(0, now() - p.start));
    }
    if (!o.quiet || S.mode === "tv") { if (S.mode === "tv") showBanner(); }
    if (S.mode === "guide") guideInfo();
  }
  function chUp(dx) { var n = S.ch, list = guideList(), k = list.indexOf(n); if (k < 0) k = 0; tune(list[(k + dx + list.length) % list.length]); }
  setInterval(function () { // keep live channels on schedule
    if (!S.started || S.vod) return; var c = CH[S.ch]; if (!c || c.hls) return;
    if (S.override) { if (now() >= S.override.end) { S.override = null; tune(S.ch, { quiet: true, keepLast: true }); } return; }
    var p = at(c, now()); if (VV[p.i][0] !== S.playing && !S.bad[VV[p.i][0]]) tune(S.ch, { quiet: true, keepLast: true });
  }, 5000);

  // ---------- banner ----------
  function showBanner(ms) {
    if (S.mode !== "tv") return;
    var c = CH[S.ch], b = $("#banner");
    $(".bn-num", b).textContent = c.n; $(".bn-logo", b).innerHTML = logo(c);
    $(".bn-clock", b).textContent = clock();
    if (c.hls) {
      $(".bn-title", b).textContent = c.name + " - Live";
      $(".bn-sub", b).textContent = c.tag; $(".bn-bar i", b).style.width = "100%";
      $(".bn-next", b).innerHTML = "<b>LIVE</b> network feed &middot; schedule at " + esc((c.sched || "").replace(/^https?:\/\//, ""));
    } else {
      var p = S.override && S.override.ch === S.ch ? S.override : at(c, now()), v = V(p.i), n = nextOf(c, p);
      $(".bn-title", b).textContent = v.sh >= 0 ? SHOWS[v.sh].n : v.t;
      $(".bn-sub", b).textContent = hm(p.start) + " - " + hm(p.end) + "  \u00b7  " + (v.sh >= 0 ? (v.s ? "S" + v.s + (v.e ? " E" + v.e : "") + " \u00b7 " : "") + v.t : TYPEN[v.ty] + (v.yr ? " (" + v.yr + ")" : "")) + "  \u00b7  " + SRC[v.src][1];
      $(".bn-bar i", b).style.width = Math.min(100, Math.max(0, (now() - p.start) / (p.end - p.start) * 100)) + "%";
      var nv = V(n.i);
      $(".bn-next", b).innerHTML = "<b>Next " + hm(n.start) + ":</b> " + esc(nv.sh >= 0 ? SHOWS[nv.sh].n + " - " + nv.t : nv.t);
    }
    b.hidden = false; clearTimeout(showBanner.t); if (!portrait()) showBanner.t = setTimeout(function () { b.hidden = true; }, ms || 5000);
    if (!IS_TV && matchMedia("(pointer:coarse)").matches) showRemote();
  }
  function showRemote() { var r = $("#remote"); r.hidden = false; clearTimeout(showRemote.t); if (!portrait()) showRemote.t = setTimeout(function () { r.hidden = true; }, 6000); }
  function portrait() { return matchMedia("(orientation:portrait) and (max-width:820px)").matches; }

  // ---------- screen placement ----------
  function place() {
    var sc = $("#screen"), r = null;
    if (portrait()) { r = { left: 0, top: 0, width: innerWidth, height: innerWidth * 9 / 16 }; d.getElementById("tv").classList.add("portrait-bg"); }
    else if (S.mode === "guide") r = $("#gprev").getBoundingClientRect();
    else if (S.mode === "od") { var pv = $("#odprev"); pv.style.display = "block"; r = pv.getBoundingClientRect(); }
    if (S.mode !== "od") $("#odprev").style.display = "none";
    if (r && r.width) { sc.style.left = r.left + "px"; sc.style.top = r.top + "px"; sc.style.width = r.width + "px"; sc.style.height = r.height + "px"; sc.style.zIndex = S.mode === "tv" || S.mode === "vod" ? 5 : 25; }
    else { sc.style.left = "0"; sc.style.top = "0"; sc.style.width = "100vw"; sc.style.height = "100vh"; sc.style.zIndex = 5; }
    if (!portrait()) d.getElementById("tv").classList.remove("portrait-bg");
  }
  addEventListener("resize", function () { place(); if (S.mode === "guide") renderGuide(); });

  // ---------- modes ----------
  function setMode(m) {
    S.mode = m;
    $("#guide").hidden = m !== "guide"; $("#od").hidden = m !== "od";
    $("#banner").hidden = true; if (m !== "tv") $("#remote").hidden = true;
    if (m !== "vod") $("#vodbar").hidden = true;
    if (portrait() && (m === "tv")) { $("#remote").hidden = false; }
    place();
  }
  function goLive() {
    if (S.vod) { S.vod = null; tune(S.ch, { keepLast: true }); }
    setMode("tv"); showBanner();
  }

  // ---------- guide ----------
  var G = { row: 0, top: 0, t: 0, w0: 0, filter: "all", menu: null };
  var FILTERS = [["all", "All Channels"], ["fav", "Favorites"], ["Movie", "Movies"], ["Kids", "Kids & Animation"], ["Documentary", "Documentaries & Science"], ["True Crime", "True Crime"],
    ["Reality", "Reality"], ["Drama", "Drama & Comedy"], ["Game Show", "Game Shows"], ["Live", "Live Networks"]];
  var FMAP = { Kids: ["Kids", "Anime", "Animation"], Documentary: ["Documentary", "Science & Space", "History", "Nature & Wildlife", "Society & People"], Drama: ["Drama", "Comedy", "Sitcom", "Variety"] };
  function guideList() {
    var f = G.filter;
    if (f === "all") return CH.map(function (c) { return c.idx; });
    if (f === "fav") { var fv = favs().ch; var l = CH.filter(function (c) { return fv.indexOf(c.id) >= 0; }).map(function (c) { return c.idx; }); return l.length ? l : CH.map(function (c) { return c.idx; }); }
    var gs = FMAP[f] || [f];
    return CH.filter(function (c) { return c.g.some(function (g) { return gs.indexOf(g) >= 0; }); }).map(function (c) { return c.idx; });
  }
  function rowsVisible() { var h = $("#grows").clientHeight || 300, fs = parseFloat(getComputedStyle($("#grows")).fontSize) || 14; return Math.max(4, Math.min(12, Math.floor(h / (fs * 3.1)))); }
  function winLen() { return portrait() ? 3600 : 5400; }
  function openGuide() {
    setMode("guide"); var t = now(); G.w0 = Math.floor(t / 1800) * 1800; G.t = t;
    var list = guideList(), k = list.indexOf(S.ch); if (k < 0) { G.filter = "all"; list = guideList(); k = list.indexOf(S.ch); }
    G.row = Math.max(0, k); var n = rowsVisible(); G.top = Math.max(0, Math.min(G.row - Math.floor(n / 2), list.length - n));
    renderGuide(); place();
  }
  function selProg() { var list = guideList(), c = CH[list[G.row]]; if (!c) return null; var p = c.hls ? { live: 1, start: G.w0, end: G.w0 + winLen() } : at(c, Math.max(G.t, G.w0)); return { c: c, p: p }; }
  function renderGuide() {
    if (S.mode !== "guide") return;
    var list = guideList(), n = rowsVisible(), wl = winLen(), w1 = G.w0 + wl;
    if (G.row >= list.length) G.row = list.length - 1;
    if (G.row < G.top) G.top = G.row; if (G.row >= G.top + n) G.top = G.row - n + 1;
    var dt = new Date(G.w0 * 1000);
    $(".g-date").textContent = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()] + " " + (dt.getMonth() + 1) + "/" + dt.getDate();
    var th = "";
    for (var k = 0; k < wl / 1800; k++) th += '<span style="left:' + (k * 1800 / wl * 100) + '%">' + hm(G.w0 + k * 1800) + "</span>";
    $(".g-times").innerHTML = th;
    $("#gfilter").innerHTML = "Guide: " + esc(FILTERS.filter(function (f) { return f[0] === G.filter; })[0][1]) + " &#9662;";
    var fv = favs().ch, html = "";
    for (var r = G.top; r < Math.min(list.length, G.top + n); r++) {
      var c = CH[list[r]], cells = "";
      progs(c, G.w0, w1).forEach(function (p) {
        var a = Math.max(p.start, G.w0), b = Math.min(p.end, w1), L = (a - G.w0) / wl * 100, Wd = (b - a) / wl * 100;
        if (Wd <= 0) return;
        var sel = r === G.row && G.t >= p.start && G.t < p.end || (r === G.row && p.live);
        var label, sub, cls = "";
        if (p.live) { label = c.name + " - Live Feed"; sub = c.tag; cls = " live"; }
        else { var v = V(p.i); label = v.sh >= 0 ? SHOWS[v.sh].n : v.t; sub = v.sh >= 0 ? v.t : TYPEN[v.ty] + (v.yr ? " (" + v.yr + ")" : ""); if (v.ty === "M") cls = " mv"; }
        cells += '<div class="g-cell' + cls + (sel ? " sel" : "") + '" data-r="' + r + '" data-t="' + (p.live ? G.w0 : p.start) + '" style="left:' + L + "%;width:" + Wd + '%">' +
          (p.start < G.w0 && !p.live ? '<span class="arr">&#9664;</span>' : "") + esc(label) + "<small>" + esc(sub) + "</small></div>";
      });
      html += '<div class="g-row' + (c.idx === S.ch ? " cur" : "") + '" data-r="' + r + '"><div class="g-ch" data-r="' + r + '"><span class="num">' + c.n + "</span>" + logo(c) +
        (fv.indexOf(c.id) >= 0 ? '<span class="fav">&#9733;</span>' : "") + '</div><div class="g-prog">' + cells + "</div></div>";
    }
    var gr = $("#grows"); gr.style.setProperty("--rows", n); gr.innerHTML = html;
    guideInfo();
  }
  function guideInfo() {
    if (S.mode !== "guide") return;
    $(".g-clock").textContent = clock();
    var sp = selProg(); if (!sp) return; var c = sp.c, p = sp.p;
    if (c.hls) { $(".g-ititle").textContent = c.name + " - Live"; $(".g-imeta").textContent = c.n + " " + c.call + "  \u00b7  LIVE"; $(".g-idesc").textContent = c.tag + ". Real live network feed. Full schedule at " + (c.sched || "").replace(/^https?:\/\//, "") + "."; return; }
    var v = V(p.i), sh = v.sh >= 0 ? SHOWS[v.sh] : null;
    $(".g-ititle").textContent = sh ? sh.n + ": " + v.t : v.t;
    $(".g-imeta").textContent = c.n + " " + c.call + "  \u00b7  " + hm(p.start) + " - " + hm(p.end) + "  \u00b7  " + (v.s ? "S" + v.s + (v.e ? " E" + v.e : "") + "  \u00b7  " : "") + TYPEN[v.ty] + (v.yr ? " \u00b7 " + v.yr : "");
    var gs = v.g.map(function (g) { return GEN[g]; }).join(", "), cast = (sh ? sh.cast : v.cast).slice(0, 4).map(function (p) { return PEOPLE[p]; }).join(", ");
    $(".g-idesc").textContent = (sh && sh.sum ? sh.sum.slice(0, 220) + (sh.sum.length > 220 ? "\u2026 " : " ") : "") + "Genre: " + gs + (cast ? ". Cast: " + cast : "") + ". From " + SRC[v.src][1] + ".";
  }
  function guideKey(k) {
    var list = guideList(), sp;
    if (G.menu) return gmenuKey(k);
    if (k === "up" || k === "down") { G.row = Math.max(0, Math.min(list.length - 1, G.row + (k === "up" ? -1 : 1))); renderGuide(); return; }
    if (k === "pgup" || k === "pgdn") { var n = rowsVisible(); G.row = Math.max(0, Math.min(list.length - 1, G.row + (k === "pgup" ? -n : n))); G.top = Math.max(0, Math.min(G.row, list.length - n)); renderGuide(); return; }
    if (k === "right") {
      sp = selProg(); var t2 = sp.p.end; if (sp.c.hls) t2 = G.w0 + winLen();
      G.t = t2 + 1; if (G.t >= G.w0 + winLen()) G.w0 += 1800; if (G.w0 > now() + 86400) G.w0 = Math.floor(now() / 1800) * 1800 + 86400;
      renderGuide(); return;
    }
    if (k === "left") {
      sp = selProg(); var t1 = sp.p.start - 1, min = Math.floor(now() / 1800) * 1800;
      if (sp.c.hls || t1 < min) { if (G.w0 > min) { G.w0 -= 1800; G.t = Math.max(now(), G.w0); } else { setFilterMenu(); return; } } else { G.t = Math.max(t1, now()); if (G.t < G.w0) G.w0 = Math.max(min, G.w0 - 1800); }
      renderGuide(); return;
    }
    if (k === "ok") { sp = selProg(); if (!sp) return; if (sp.c.hls || sp.p.start <= now() + 1) { tune(sp.c.idx); goLive(); } else { toast(hm(sp.p.start) + ": " + (V(sp.p.i).sh >= 0 ? SHOWS[V(sp.p.i).sh].n : V(sp.p.i).t) + " - not on yet. Find it in ON DEMAND."); } return; }
    if (k === "back" || k === "guide") return goLive();
    if (k === "od") return openOD();
  }
  function setFilterMenu() {
    var m = d.createElement("div"); m.className = "g-menu";
    m.innerHTML = FILTERS.map(function (f, n) { return '<button type="button" data-f="' + f[0] + '"' + (f[0] === G.filter ? ' class="focus"' : "") + ">" + esc(f[1]) + "</button>"; }).join("");
    $("#guide .safe").appendChild(m); G.menu = { el: m, k: Math.max(0, FILTERS.findIndex(function (f) { return f[0] === G.filter; })) };
    m.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { G.menu.k = FILTERS.findIndex(function (f) { return f[0] === b.dataset.f; }); gmenuKey("ok"); } });
  }
  function gmenuKey(k) {
    var bs = $$("button", G.menu.el);
    if (k === "up" || k === "down") { G.menu.k = (G.menu.k + (k === "up" ? -1 : 1) + bs.length) % bs.length; }
    else if (k === "ok" || k === "right") { G.filter = FILTERS[G.menu.k][0]; G.menu.el.remove(); G.menu = null; G.row = 0; G.top = 0; var l = guideList(), x = l.indexOf(S.ch); if (x >= 0) G.row = x; renderGuide(); return; }
    else if (k === "back" || k === "left") { G.menu.el.remove(); G.menu = null; return; }
    bs.forEach(function (b, n) { b.classList.toggle("focus", n === G.menu.k); }); bs[G.menu.k].scrollIntoView({ block: "nearest" });
  }
  $("#grows").addEventListener("click", function (e) {
    var cell = e.target.closest(".g-cell"), ch = e.target.closest(".g-ch");
    if (cell) { var r = +cell.dataset.r, t = +cell.dataset.t; if (r === G.row && Math.abs(Math.max(t, now()) - Math.max(G.t, now())) < 2 || G.t >= t && r === G.row) { return guideKey("ok"); } G.row = r; G.t = Math.max(t, now()); renderGuide(); return; }
    if (ch) { G.row = +ch.dataset.r; G.t = now(); G.w0 = Math.floor(now() / 1800) * 1800; guideKey("ok"); }
  });
  $("#gfilter").addEventListener("click", function () { if (G.menu) { G.menu.el.remove(); G.menu = null; } else setFilterMenu(); });
  $(".g-foot").addEventListener("click", function (e) { var b = e.target.closest("[data-g]"); if (!b) return; var a = b.dataset.g;
    if (a === "live") goLive(); else if (a === "od") openOD(); else if (a === "later") { G.w0 += 1800; G.t = Math.max(G.t, G.w0); renderGuide(); } else if (a === "earlier") { var min = Math.floor(now() / 1800) * 1800; G.w0 = Math.max(min, G.w0 - 1800); G.t = Math.max(now(), G.w0); renderGuide(); } });
  var gwheel = 0; $("#grows").addEventListener("wheel", function (e) { e.preventDefault(); gwheel += e.deltaY; if (Math.abs(gwheel) > 40) { guideKey(gwheel > 0 ? "down" : "up"); gwheel = 0; } }, { passive: false });
  var gty = null; $("#grows").addEventListener("touchstart", function (e) { gty = e.touches[0].clientY; }, { passive: true });
  $("#grows").addEventListener("touchmove", function (e) { if (gty == null) return; var dy = e.touches[0].clientY - gty, h = ($(".g-row") || {}).clientHeight || 40; if (Math.abs(dy) > h) { var list = guideList(), steps = Math.round(-dy / h); G.top = Math.max(0, Math.min(list.length - rowsVisible(), G.top + steps)); G.row = Math.max(G.top, Math.min(G.row, G.top + rowsVisible() - 1)); gty = e.touches[0].clientY; renderGuide(); } }, { passive: true });

  // ---------- favorites + members ----------
  var SB = "https://cubbuiahnhgfpdeubldu.supabase.co", SBK = "sb_publishable_Sj8SNl5Zi0AwjxsIrNGNtQ_B--yHhYi", SKEY = "hvplus_session", PHONE_DOMAIN = "phone.blockbuster-plus.app";
  function session() { try { return JSON.parse(LS.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function uid() { var s = session(); return s && s.user ? s.user.id : "guest"; }
  function favs() { try { return JSON.parse(LS.getItem("cable_fav_" + uid()) || '{"ch":[],"sh":[]}'); } catch (e) { return { ch: [], sh: [] }; } }
  function setFavs(f) { LS.setItem("cable_fav_" + uid(), JSON.stringify(f)); }
  function toggleFav(kind, id) { var f = favs(), a = f[kind], k = a.indexOf(id); if (k >= 0) a.splice(k, 1); else a.push(id); setFavs(f); toast(k >= 0 ? "Removed from Favorites" : "Added to Favorites \u2605"); }
  function sbAuth(path, body) { return fetch(SB + "/auth/v1/" + path, { method: "POST", headers: { apikey: SBK, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); }
  function idToEmail(x) { x = (x || "").trim(); if (x.indexOf("@") > 0) return x.toLowerCase(); var dg = x.replace(/\D/g, ""); if (dg.length === 10) dg = "1" + dg; return dg.length >= 11 ? "p" + dg + "@" + PHONE_DOMAIN : x; }

  // ---------- ON DEMAND ----------
  var OD = { stack: [], sel: 0, items: [], title: "" };
  function openOD(screen) { setMode("od"); if (!OD.stack.length || screen) { OD.stack = []; push(screen || mainMenu()); } else render(); }
  function push(sc) { if (OD.stack.length) OD.stack[OD.stack.length - 1].sel = OD.sel; OD.stack.push(sc); OD.sel = sc.sel || 0; render(); }
  function pop() { if (OD.stack.length <= 1) return goLive(); OD.stack.pop(); OD.sel = OD.stack[OD.stack.length - 1].sel || 0; render(); }
  function cur() { return OD.stack[OD.stack.length - 1]; }
  function render() {
    var sc = cur(); if (sc.build) { sc.items = sc.build(); }
    $(".od-crumb").textContent = OD.stack.map(function (s) { return s.title; }).join("  \u203a  ");
    $(".od-clock").textContent = clock();
    var L = $("#odlist"), h = sc.pre || "";
    h += sc.items.map(function (it, n) {
      if (it.hd) return '<div class="od-item hd">' + esc(it.label) + "</div>";
      return '<button type="button" class="od-item" data-n="' + n + '" role="option">' + (it.ic ? '<span class="ic">' + it.ic + "</span>" : "") + (it.logo || "") + '<span class="t">' + esc(it.label) + "</span>" + (it.count != null ? '<span class="c">' + esc(it.count) + "</span>" : "") + "</button>";
    }).join("");
    if (!sc.items.length && !sc.pre) h = '<div class="od-item hd">Nothing here yet</div>';
    L.innerHTML = h;
    if (sc.after) sc.after(L);
    if (OD.sel >= sc.items.length || (sc.items[OD.sel] && sc.items[OD.sel].hd)) OD.sel = firstSel(sc);
    highlight(); place();
  }
  function firstSel(sc) { for (var n = 0; n < sc.items.length; n++) if (!sc.items[n].hd) return n; return 0; }
  function highlight() {
    var sc = cur(), it = sc.items[OD.sel];
    $$(".od-item", $("#odlist")).forEach(function (b) { b.classList.toggle("sel", +b.dataset.n === OD.sel && !sc.kb); });
    var b = $('.od-item[data-n="' + OD.sel + '"]'); if (b && !sc.kb) b.scrollIntoView({ block: "nearest" });
    side(it);
  }
  function side(it) {
    var art = $(".od-art"), info = $(".od-info"); art.classList.remove("nope"); art.innerHTML = "";
    if (!it) { art.style.backgroundImage = ""; art.classList.add("nope"); info.innerHTML = ""; return; }
    if (it.art) art.style.backgroundImage = "url('" + it.art + "')"; else { art.style.backgroundImage = ""; art.classList.add("nope"); if (it.biglogo) art.innerHTML = it.biglogo; }
    info.innerHTML = it.info || "<h3>" + esc(it.label) + "</h3>";
  }
  function odKey(k) {
    var sc = cur(), its = sc.items;
    if (sc.kb && sc.kbKey && sc.kbKey(k)) return;
    if (k === "up" || k === "down" || k === "pgup" || k === "pgdn") {
      var st = k === "up" ? -1 : k === "down" ? 1 : k === "pgup" ? -8 : 8, n = OD.sel;
      for (var g = 0; g < Math.abs(st); g++) { var m = n + (st > 0 ? 1 : -1); while (m >= 0 && m < its.length && its[m].hd) m += st > 0 ? 1 : -1; if (m < 0 || m >= its.length) break; n = m; }
      if (n === OD.sel && k === "up" && sc.onTop) return sc.onTop();
      OD.sel = n; highlight(); return;
    }
    if (k === "ok" || k === "right") { var it = its[OD.sel]; if (!it || it.hd) return; if (k === "right" && !it.go && !it.screen) return; activate(it); return; }
    if (k === "left" || k === "back") return pop();
    if (k === "guide") return openGuide();
    if (k === "od") { OD.stack = []; push(mainMenu()); }
  }
  function activate(it) { if (it.screen) push(typeof it.screen === "function" ? it.screen() : it.screen); else if (it.go) it.go(); }
  $("#odlist").addEventListener("click", function (e) { var b = e.target.closest(".od-item[data-n]"); if (!b) return; var n = +b.dataset.n; if (n === OD.sel || matchMedia("(pointer:coarse)").matches) { OD.sel = n; highlight(); activate(cur().items[n]); } else { OD.sel = n; highlight(); } });
  $(".od-foot").addEventListener("click", function (e) { var b = e.target.closest("[data-o]"); if (!b) return; var a = b.dataset.o; if (a === "back") pop(); else if (a === "live") goLive(); else openGuide(); });

  // item builders
  function vidItem(i, ctx, opt) {
    var v = V(i), sh = v.sh >= 0 ? SHOWS[v.sh] : null; opt = opt || {};
    var lab = (opt.withShow && sh ? sh.n + ": " : "") + (v.s && !opt.noSE ? "S" + v.s + (v.e ? " E" + v.e : "") + " - " : v.e && !opt.noSE ? "Ep " + v.e + " - " : "") + v.t;
    var gs = v.g.map(function (g) { return GEN[g]; }).join(", "), cast = (v.cast.length ? v.cast : sh ? sh.cast.slice(0, 6) : []).map(function (p) { return esc(PEOPLE[p]); }).join(", ");
    return { label: lab, count: mins(v.d), art: thumb(v.id), ic: v.ty === "M" ? "&#9654;" : v.ty === "D" ? "&#9654;" : "&#9654;",
      info: "<h3>" + esc(v.t) + "</h3>" + (sh ? '<div class="m">' + esc(sh.n) + (v.s ? " \u00b7 Season " + v.s + (v.e ? ", Episode " + v.e : "") : "") + "</div>" : "") +
        '<div class="m">' + TYPEN[v.ty] + " \u00b7 " + mins(v.d) + (v.yr ? " \u00b7 " + v.yr : "") + " \u00b7 FREE</div>" +
        '<div><span class="k">Network:</span> ' + esc(SRC[v.src][1]) + '</div><div><span class="k">Genre:</span> ' + esc(gs) + "</div>" + (cast ? '<div><span class="k">' + (v.cast.length ? "Starring" : "Cast") + ":</span> " + cast + "</div>" : "") +
        (v.up ? '<div><span class="k">Added:</span> ' + v.up.slice(4, 6) + "/" + v.up.slice(6, 8) + "/" + v.up.slice(0, 4) + "</div>" : "") + "<p>Press OK to watch.</p>",
      go: function () { playVod(i, ctx); } };
  }
  function showItem(n) {
    var s = SHOWS[n], f = s.vids[0], chs = Object.keys(IX().chShow[n] || {}).map(function (k) { return CH[k]; });
    return { label: s.n, count: s.vids.length, art: s.img || (f != null ? thumb(VV[f][0]) : ""), ic: "&#9632;", screen: function () { return showScreen(n); },
      info: "<h3>" + esc(s.n) + "</h3>" + '<div class="m">' + esc(SRC[s.k][1]) + (s.y ? " \u00b7 since " + s.y : "") + " \u00b7 " + s.vids.length + " full-length</div>" +
        (s.g.length ? '<div><span class="k">Genre:</span> ' + esc(s.g.join(", ")) + "</div>" : "") + (s.cast.length ? '<div><span class="k">Cast:</span> ' + s.cast.slice(0, 8).map(function (p) { return esc(PEOPLE[p]); }).join(", ") + "</div>" : "") +
        (chs.length ? '<div><span class="k">On live TV:</span> ' + chs.map(function (c) { return c.n + " " + esc(c.name); }).join(", ") + "</div>" : "") + (s.sum ? "<p>" + esc(s.sum) + "</p>" : "") };
  }
  function listScreen(title, idxs, opt) { opt = opt || {}; var ctx = idxs.slice(0, opt.max || 600); return { title: title, items: ctx.map(function (i) { return vidItem(i, ctx, opt); }).concat(idxs.length > ctx.length ? [{ hd: 1, label: "Showing " + ctx.length + " of " + idxs.length }] : []) }; }
  function epSort(a, b) { var x = VV[a], y = VV[b]; return (x[5] || 999) - (y[5] || 999) || (x[6] || 999) - (y[6] || 999) || (x[9] < y[9] ? -1 : 1); }
  function showScreen(n) {
    var s = SHOWS[n], vids = s.vids.slice(), seasons = {}, nos = [];
    vids.forEach(function (i) { var x = VV[i][5]; if (x) (seasons[x] = seasons[x] || []).push(i); else nos.push(i); });
    var ks = Object.keys(seasons).map(Number).sort(function (a, b) { return a - b; }), items = [], fv = favs().sh;
    var base = showItem(n);
    items.push({ label: (fv.indexOf(s.n) >= 0 ? "\u2605 Remove from Favorites" : "\u2606 Add to Favorites"), ic: "", art: base.art, info: base.info, go: function () { toggleFav("sh", s.n); render(); } });
    var chs = Object.keys(IX().chShow[n] || {}).map(function (k) { return CH[k]; });
    chs.slice(0, 3).forEach(function (c) { items.push({ label: "Watch live on " + c.n + " " + c.name, logo: logo(c), info: base.info, art: base.art, go: function () { tune(c.idx); goLive(); } }); });
    if (ks.length > 1 || (ks.length === 1 && nos.length)) {
      ks.forEach(function (k) { var l = seasons[k].sort(epSort); items.push({ label: "Season " + k, count: l.length + " ep", art: thumb(VV[l[0]][0]), ic: "&#9658;", info: base.info, screen: function () { return listScreen(s.n + " S" + k, l, { noSE: false }); } }); });
      if (nos.length) items.push({ label: "More Episodes & Specials", count: nos.length, ic: "&#9658;", art: thumb(VV[nos[0]][0]), info: base.info, screen: function () { return listScreen(s.n + " - More", nos); } });
      items.push({ hd: 1, label: "All episodes" });
    }
    var all = ks.length && !nos.length ? vids.sort(epSort) : vids;
    all.slice(0, 600).forEach(function (i) { items.push(vidItem(i, all)); });
    return { title: s.n, items: items, sel: 0 };
  }
  function srcScreen(k) {
    var vids = IX().bySrc[k] || [], shs = {}, loose = [];
    vids.forEach(function (i) { var x = VV[i][4]; if (x >= 0) shs[x] = 1; else loose.push(i); });
    var items = [], chs = Object.keys(IX().chSrc[k] || {}).map(function (n) { return CH[n]; });
    if (chs.length) { items.push({ hd: 1, label: "On live TV" }); chs.forEach(function (c) { items.push({ label: c.n + " " + c.name, logo: logo(c), go: function () { tune(c.idx); goLive(); } }); }); }
    var sl = Object.keys(shs).map(Number).sort(function (a, b) { return SHOWS[b].vids.length - SHOWS[a].vids.length; });
    if (sl.length) { items.push({ hd: 1, label: "Shows" }); sl.forEach(function (n) { items.push(showItem(n)); }); }
    if (loose.length) { items.push({ hd: 1, label: "Movies, documentaries & specials" }); loose.slice(0, 400).forEach(function (i) { items.push(vidItem(i, loose)); }); }
    return { title: SRC[k][1], items: items };
  }
  function deptScreen(dept) {
    var srcs = SRC.map(function (s, n) { return s[2] === dept ? n : -1; }).filter(function (n) { return n >= 0; });
    var shs = [], loose = [];
    srcs.forEach(function (k) { (IX().bySrc[k] || []).forEach(function (i) { var x = VV[i][4]; if (x >= 0) { if (shs.indexOf(x) < 0) shs.push(x); } else loose.push(i); }); });
    shs.sort(function (a, b) { return SHOWS[b].vids.length - SHOWS[a].vids.length; });
    var items = [{ hd: 1, label: "Networks" }];
    srcs.forEach(function (k) { var c = (IX().bySrc[k] || []).length; if (c) items.push({ label: SRC[k][1], count: c, ic: "&#9658;", screen: function () { return srcScreen(k); } }); });
    if (shs.length) { items.push({ hd: 1, label: "Shows" }); shs.forEach(function (n) { items.push(showItem(n)); }); }
    if (loose.length) { loose.sort(function (a, b) { return VV[a][9] < VV[b][9] ? 1 : -1; }); items.push({ hd: 1, label: "Movies, documentaries & specials" }); loose.slice(0, 400).forEach(function (i) { items.push(vidItem(i, loose)); }); }
    return { title: dept, items: items };
  }
  function moviesScreen(free) {
    var mv = (IX().byType.M || []).slice();
    if (free) { mv.sort(function (a, b) { return VV[a][1].localeCompare(VV[b][1]); }); return listScreen("Free Movies A-Z", mv); }
    var bys = {}; mv.forEach(function (i) { (bys[VV[i][3]] = bys[VV[i][3]] || []).push(i); });
    var items = [{ label: "All Free Movies A-Z", count: mv.length, ic: "&#9654;", screen: function () { return moviesScreen(true); } }, { hd: 1, label: "By network" }];
    Object.keys(bys).forEach(function (k) { items.push({ label: SRC[k][1] + " Movies", count: bys[k].length, ic: "&#9654;", art: thumb(VV[bys[k][0]][0]), screen: function () { return listScreen(SRC[k][1] + " Movies", bys[k]); } }); });
    items.push({ hd: 1, label: "Movie channels (live)" });
    CH.filter(function (c) { return c.g.indexOf("Movie") >= 0; }).forEach(function (c) { items.push({ label: c.n + " " + c.name, logo: logo(c), go: function () { tune(c.idx); goLive(); } }); });
    var docs = IX().byType.D || []; items.push({ hd: 1, label: "Feature documentaries" }); items.push({ label: "Documentaries (" + docs.length + ")", ic: "&#9654;", screen: function () { return listScreen("Documentaries", docs); } });
    return { title: "Movies", items: items };
  }
  function azScreen() { var l = SHOWS.map(function (s, n) { return n; }).sort(function (a, b) { return SHOWS[a].n.localeCompare(SHOWS[b].n); }); return { title: "TV Shows A-Z", items: l.map(showItem) }; }
  function personScreen(p) {
    var e = IX().byPerson[p] || { s: [], v: [] }, items = [];
    if (e.s.length) { items.push({ hd: 1, label: "TV shows" }); e.s.forEach(function (n) { items.push(showItem(n)); }); }
    if (e.v.length) { items.push({ hd: 1, label: "Movies & programs" }); e.v.forEach(function (i) { items.push(vidItem(i, e.v)); }); }
    return { title: PEOPLE[p], items: items };
  }
  function peopleScreen() {
    var bp = IX().byPerson, l = Object.keys(bp).map(Number).filter(function (p) { var e = bp[p]; return e.s.some(function (n) { return SHOWS[n].vids.length; }) || e.v.length; });
    l.sort(function (a, b) { var A = PEOPLE[a].split(" ").pop(), B = PEOPLE[b].split(" ").pop(); return A.localeCompare(B) || PEOPLE[a].localeCompare(PEOPLE[b]); });
    return { title: "Actors & Actresses", items: l.map(function (p) { var e = bp[p], c = e.v.length + e.s.reduce(function (t, n) { return t + SHOWS[n].vids.length; }, 0);
      var fi = e.v[0] != null ? e.v[0] : (SHOWS[e.s[0]] || { vids: [] }).vids[0];
      return { label: PEOPLE[p], count: c, ic: "&#9679;", art: e.s.length && SHOWS[e.s[0]].img ? SHOWS[e.s[0]].img : fi != null ? thumb(VV[fi][0]) : "", screen: function () { return personScreen(p); },
        info: "<h3>" + esc(PEOPLE[p]) + "</h3>" + (e.s.length ? '<div><span class="k">Shows:</span> ' + e.s.map(function (n) { return esc(SHOWS[n].n); }).join(", ") + "</div>" : "") + (e.v.length ? '<div><span class="k">Movies/programs:</span> ' + e.v.length + "</div>" : "") + '<p class="k">Cast lists from TVmaze; movie stars from official titles.</p>' }; }) };
  }
  function genreScreen(g) {
    var vids = IX().byGenre[g] || [], shs = {}, loose = [];
    vids.forEach(function (i) { var x = VV[i][4]; if (x >= 0) shs[x] = 1; else loose.push(i); });
    var items = [], chs = CH.filter(function (c) { return c.g.indexOf(GEN[g]) >= 0; });
    if (chs.length) { items.push({ hd: 1, label: "Live channels" }); chs.forEach(function (c) { items.push({ label: c.n + " " + c.name, logo: logo(c), go: function () { tune(c.idx); goLive(); } }); }); }
    var sl = Object.keys(shs).map(Number).sort(function (a, b) { return SHOWS[b].vids.length - SHOWS[a].vids.length; });
    if (sl.length) { items.push({ hd: 1, label: "Shows" }); sl.forEach(function (n) { items.push(showItem(n)); }); }
    if (loose.length) { items.push({ hd: 1, label: "Movies, documentaries & specials" }); loose.slice(0, 400).forEach(function (i) { items.push(vidItem(i, loose)); }); }
    return { title: GEN[g], items: items };
  }
  function genresScreen() { var bg = IX().byGenre; return { title: "Genres", items: GEN.map(function (g, n) { return n; }).filter(function (n) { return (bg[n] || []).length; }).sort(function (a, b) { return GEN[a].localeCompare(GEN[b]); }).map(function (n) { return { label: GEN[n], count: bg[n].length, ic: "&#9658;", art: thumb(VV[bg[n][0]][0]), screen: function () { return genreScreen(n); } }; }) }; }
  function decadeScreen() {
    var bd = IX().byDec; return { title: "By Decade", items: Object.keys(bd).map(Number).sort(function (a, b) { return b - a; }).map(function (dc) {
      return { label: dc + "s", count: bd[dc].length, ic: "&#9658;", art: thumb(VV[bd[dc][0]][0]), info: "<h3>The " + dc + "s</h3><p>Shows by premiere year (TVmaze) and movies/documentaries by the year in their title.</p>",
        screen: function () { var shs = {}, loose = []; bd[dc].forEach(function (i) { var x = VV[i][4]; if (x >= 0) shs[x] = 1; else loose.push(i); }); var items = [];
          var sl = Object.keys(shs).map(Number); if (sl.length) { items.push({ hd: 1, label: "Shows that premiered in the " + dc + "s" }); sl.forEach(function (n) { items.push(showItem(n)); }); }
          if (loose.length) { items.push({ hd: 1, label: "Movies & documentaries" }); loose.forEach(function (i) { items.push(vidItem(i, loose)); }); } return { title: dc + "s", items: items }; } }; }) };
  }
  function typeScreen() { var bt = IX().byType; return { title: "Program Type", items: ["E", "M", "D", "S", "K"].filter(function (t) { return (bt[t] || []).length; }).map(function (t) { return { label: TYPEN[t] + "s", count: bt[t].length, ic: "&#9658;", art: thumb(VV[bt[t][0]][0]), screen: function () { return listScreen(TYPEN[t] + "s (newest first)", bt[t], { withShow: true, max: 500 }); } }; }) }; }
  function networksScreen() { var bs = IX().bySrc; return { title: "Networks", items: SRC.map(function (s, k) { return k; }).filter(function (k) { return (bs[k] || []).length; }).sort(function (a, b) { return SRC[a][1].localeCompare(SRC[b][1]); }).map(function (k) { return { label: SRC[k][1], count: bs[k].length, ic: "&#9658;", art: thumb(VV[bs[k][0]][0]), info: "<h3>" + esc(SRC[k][1]) + '</h3><div class="m">' + esc(SRC[k][2]) + " \u00b7 YouTube " + esc(SRC[k][4]) + "</div><p>" + bs[k].length + " free full-length programs.</p>", screen: function () { return srcScreen(k); } }; }) }; }
  function liveByGenreScreen() {
    var gs = {}; CH.forEach(function (c) { c.g.forEach(function (g) { (gs[g] = gs[g] || []).push(c); }); });
    var items = [{ label: "All channels (" + CH.length + ")", ic: "&#9632;", screen: function () { return { title: "All Channels", items: CH.map(chItem) }; } }, { hd: 1, label: "By genre" }];
    Object.keys(gs).sort().forEach(function (g) { items.push({ label: g, count: gs[g].length, ic: "&#9658;", screen: function () { return { title: g + " channels", items: gs[g].map(chItem) }; } }); });
    return { title: "Live Channels", items: items };
  }
  function chItem(c) {
    var info = "<h3>" + c.n + " " + esc(c.name) + '</h3><div class="m">' + esc(c.tag) + "</div>";
    if (!c.hls) { var p = at(c, now()), v = V(p.i), n = V(nextOf(c, p).i); info += '<div><span class="k">On now:</span> ' + esc(v.sh >= 0 ? SHOWS[v.sh].n + " - " + v.t : v.t) + '</div><div><span class="k">Next:</span> ' + esc(n.sh >= 0 ? SHOWS[n.sh].n : n.t) + "</div>"; }
    info += '<div><span class="k">Genres:</span> ' + esc(c.g.join(", ")) + "</div>";
    return { label: c.n + "  " + c.name, logo: logo(c), biglogo: logo(c, 1), info: info, go: function () { tune(c.idx); goLive(); } };
  }
  function recentScreen() { var l = VV.map(function (v, i) { return i; }).filter(function (i) { return VV[i][9]; }).sort(function (a, b) { return VV[a][9] < VV[b][9] ? 1 : -1; }).slice(0, 200); return listScreen("Recently Added", l, { withShow: true }); }
  function favScreen() {
    var f = favs(), items = [];
    items.push({ hd: 1, label: "Favorite channels" });
    CH.filter(function (c) { return f.ch.indexOf(c.id) >= 0; }).forEach(function (c) { items.push(chItem(c)); });
    items.push({ label: "\u2606 Add the current channel (" + CH[S.ch].n + " " + CH[S.ch].name + ")", go: function () { toggleFav("ch", CH[S.ch].id); render(); } });
    items.push({ hd: 1, label: "Favorite shows" });
    SHOWS.forEach(function (s, n) { if (f.sh.indexOf(s.n) >= 0) items.push(showItem(n)); });
    return { title: "My Favorites", build: function () { return favScreen().items; }, items: items };
  }
  function accountScreen() {
    var s = session();
    if (s && s.user) {
      var nm = (s.user.user_metadata || {}).display_name || "Member";
      return { title: "My Account", items: [{ label: "Signed in as " + nm, ic: "&#9679;", info: "<h3>Hi, " + esc(nm) + "</h3><p>Your Cable favorites are saved for this account on this device. Same account as your other sites.</p>" },
        { label: "My Favorites", ic: "&#9733;", screen: favScreen }, { label: "Sign Out", ic: "&#9658;", go: function () { fetch(SB + "/auth/v1/logout", { method: "POST", headers: { apikey: SBK, Authorization: "Bearer " + s.access_token } }).catch(function () {}); LS.removeItem(SKEY); toast("Signed out"); pop(); } }] };
    }
    return { title: "Sign In", items: [{ label: "Sign in", ic: "&#9679;", go: function () { var f = $(".od-form input"); if (f) f.focus(); } }],
      pre: '<form class="od-form" autocomplete="on"><input name="id" placeholder="Email or phone" autocomplete="username"><input name="pw" type="password" placeholder="Password" autocomplete="current-password"><input name="nm" placeholder="Display name (new accounts)"><div style="display:flex;gap:.5em"><button class="fbtn" data-a="in">Sign In</button><button class="fbtn" data-a="up">Create Account</button></div><div class="msg"></div></form>',
      after: function (L) { var f = $("form", L), msg = $(".msg", f); f.addEventListener("submit", function (e) { e.preventDefault(); });
        f.addEventListener("click", function (e) { var b = e.target.closest("[data-a]"); if (!b) return; e.preventDefault(); var em = idToEmail(f.id.value), pw = f.pw.value; if (!em || pw.length < 6) { msg.textContent = "Enter your email/phone and a password (6+ characters)."; return; }
          msg.textContent = "Please wait\u2026";
          var p = b.dataset.a === "in" ? sbAuth("token?grant_type=password", { email: em, password: pw }) : sbAuth("signup", { email: em, password: pw, data: { display_name: f.nm.value || em.split("@")[0], signup_site: "cable" } });
          p.then(function (r) { if (r.ok && r.j.access_token) { LS.setItem(SKEY, JSON.stringify({ access_token: r.j.access_token, refresh_token: r.j.refresh_token, user: { id: r.j.user.id, user_metadata: { display_name: (r.j.user.user_metadata || {}).display_name } } })); toast("Welcome!"); OD.stack.pop(); push(accountScreen()); }
            else msg.textContent = (r.j && (r.j.msg || r.j.error_description || r.j.message)) || "Sign in didn't work. Check your details."; }).catch(function () { msg.textContent = "Network error - try again."; }); }); } };
  }
  // search
  function searchScreen(q) {
    var sc = { title: "Search", items: [], kb: !matchMedia("(pointer:coarse)").matches, q: q || "", kk: 0 };
    var keys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&' ".split("").concat(["DEL", "CLR", "GO"]);
    sc.pre = '<div class="od-search"><input id="odq" placeholder="Search shows, movies, actors, networks, genres, channels" value="' + esc(sc.q) + '" autocomplete="off">' +
      '<div class="kb">' + keys.map(function (k, n) { return '<button type="button" data-k="' + n + '">' + (k === " " ? "SPACE" : esc(k)) + "</button>"; }).join("") + "</div></div>";
    function run() { sc.items = searchItems(sc.q); var keep = sc.kb; render(); sc.kb = keep; kbHi(); var i = $("#odq"); if (i && d.activeElement !== i && !sc.kb) {} }
    function kbHi() { $$(".kb button").forEach(function (b, n) { b.classList.toggle("sel", sc.kb && n === sc.kk); }); if (sc.kb) $$(".od-item.sel").forEach(function (b) { b.classList.remove("sel"); }); }
    function press(n) { var k = keys[n]; if (k === "DEL") sc.q = sc.q.slice(0, -1); else if (k === "CLR") sc.q = ""; else if (k === "GO") { if (sc.items.length) { sc.kb = false; OD.sel = firstSel(sc); highlight(); } return; } else sc.q += k; run(); var i = $("#odq"); if (i) i.value = sc.q; }
    sc.after = function (L) { var i = $("#odq", L); i.addEventListener("input", function () { sc.q = i.value; clearTimeout(sc.t); sc.t = setTimeout(function () { var p = i.selectionStart; run(); var j = $("#odq"); j.focus(); try { j.setSelectionRange(p, p); } catch (e) {} }, 250); });
      i.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); i.blur(); sc.kb = false; OD.sel = firstSel(sc); highlight(); } e.stopPropagation(); });
      $(".kb", L).addEventListener("click", function (e) { var b = e.target.closest("[data-k]"); if (b) { sc.kk = +b.dataset.k; press(sc.kk); } }); kbHi(); };
    sc.kbKey = function (k) { var cols = 9; if (!sc.kb) return false;
      if (k === "left") { if (sc.kk % cols === 0) return false; sc.kk--; } else if (k === "right") { if (sc.kk % cols === cols - 1 || sc.kk === keys.length - 1) return true; sc.kk++; }
      else if (k === "up") { if (sc.kk < cols) return true; sc.kk -= cols; } else if (k === "down") { if (sc.kk + cols >= keys.length) { if (sc.items.length) { sc.kb = false; OD.sel = firstSel(sc); highlight(); } return true; } sc.kk += cols; }
      else if (k === "ok") { press(sc.kk); return true; } else if (k === "back") { if (sc.q) { sc.q = sc.q.slice(0, -1); run(); return true; } return false; } else return false;
      kbHi(); return true; };
    sc.onTop = function () { sc.kb = true; kbHi(); highlight(); };
    sc.items = q ? searchItems(q) : [];
    return sc;
  }
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019.]/g, "").replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function searchItems(q) {
    q = norm(q); if (q.length < 2) return [];
    var items = [], words = q.split(" ");
    function hit(s) { s = norm(s); return words.every(function (w) { return s.indexOf(w) >= 0; }); }
    var chs = CH.filter(function (c) { return hit(c.name + " " + c.call + " " + c.n + " " + c.g.join(" ")); });
    if (chs.length) { items.push({ hd: 1, label: "Live channels" }); chs.slice(0, 10).forEach(function (c) { items.push(chItem(c)); }); }
    var shs = SHOWS.map(function (s, n) { return n; }).filter(function (n) { return hit(SHOWS[n].n); }).sort(function (a, b) { return SHOWS[b].vids.length - SHOWS[a].vids.length; });
    if (shs.length) { items.push({ hd: 1, label: "TV shows" }); shs.slice(0, 25).forEach(function (n) { items.push(showItem(n)); }); }
    var bp = IX().byPerson, ps = Object.keys(bp).map(Number).filter(function (p) { return hit(PEOPLE[p]); });
    if (ps.length) { items.push({ hd: 1, label: "Actors & actresses" }); ps.slice(0, 15).forEach(function (p) { items.push({ label: PEOPLE[p], ic: "&#9679;", count: bp[p].s.length + bp[p].v.length, screen: function () { return personScreen(p); } }); }); }
    var ns = SRC.map(function (s, k) { return k; }).filter(function (k) { return hit(SRC[k][1]) && (IX().bySrc[k] || []).length; });
    if (ns.length) { items.push({ hd: 1, label: "Networks" }); ns.forEach(function (k) { items.push({ label: SRC[k][1], ic: "&#9658;", count: IX().bySrc[k].length, screen: function () { return srcScreen(k); } }); }); }
    var gs = GEN.map(function (g, n) { return n; }).filter(function (n) { return hit(GEN[n]) && (IX().byGenre[n] || []).length; });
    if (gs.length) { items.push({ hd: 1, label: "Genres" }); gs.forEach(function (n) { items.push({ label: GEN[n], ic: "&#9658;", count: IX().byGenre[n].length, screen: function () { return genreScreen(n); } }); }); }
    var vs = []; for (var i = 0; i < VV.length && vs.length < 60; i++) { var v = VV[i]; if (hit(v[1] + " " + (v[4] >= 0 ? SHOWS[v[4]].n : ""))) vs.push(i); }
    if (vs.length) { items.push({ hd: 1, label: "Episodes, movies & documentaries" }); vs.forEach(function (i) { items.push(vidItem(i, vs, { withShow: true })); }); }
    if (!items.length) items.push({ hd: 1, label: "No matches" });
    return items;
  }
  function mainMenu() {
    var bs = IX().bySrc, deptN = function (dp) { var t = 0; SRC.forEach(function (s, k) { if (s[2] === dp) t += (bs[k] || []).length; }); return t; };
    var D = function (lab, ic, dept) { return { label: lab, ic: ic, count: deptN(dept), screen: function () { return deptScreen(dept); }, info: "<h3>" + esc(lab) + "</h3><p>Free full episodes, movies and documentaries.</p>" }; };
    var s = session();
    var it = [
      { label: "Live TV & Channel Guide", ic: "&#9632;", go: openGuide, info: "<h3>Live TV</h3><p>" + CH.length + " channels, on a schedule - everyone sees the same thing at the same time.</p>" },
      { label: "Recently Added", ic: "&#9733;", screen: recentScreen },
      D("TV Entertainment", "&#9679;", "TV Entertainment"),
      { label: "Movies", ic: "&#9654;", count: (IX().byType.M || []).length, screen: function () { return moviesScreen(false); } },
      { label: "Free Movies", ic: "&#9654;", count: (IX().byType.M || []).length, screen: function () { return moviesScreen(true); } },
      D("Kids", "&#9679;", "Kids"), D("Music & MTV", "&#9835;", "Music/MTV"), D("Documentaries", "&#9654;", "Documentaries"), D("True Crime", "&#9679;", "True Crime"),
      D("Reality", "&#9679;", "Reality"), D("Game Shows", "&#9670;", "Game Shows"),
      { hd: 1, label: "Browse by" },
      { label: "Networks", ic: "&#9658;", screen: networksScreen }, { label: "TV Shows A-Z", ic: "&#9632;", count: SHOWS.length, screen: azScreen },
      { label: "Actors & Actresses", ic: "&#9679;", screen: peopleScreen }, { label: "Genres", ic: "&#9658;", screen: genresScreen },
      { label: "Decades", ic: "&#9658;", screen: decadeScreen }, { label: "Program Type", ic: "&#9658;", screen: typeScreen },
      { label: "Live Channels by Genre", ic: "&#9632;", screen: liveByGenreScreen },
      { label: "Search", ic: "&#9658;", screen: function () { return searchScreen(""); } },
      { hd: 1, label: "Me" },
      { label: "My Favorites", ic: "&#9733;", screen: favScreen },
      { label: s && s.user ? "My Account" : "Sign In / Create Account", ic: "&#9679;", screen: accountScreen }
    ];
    return { title: "Main Menu", items: it };
  }

  // ---------- VOD ----------
  function playVod(i, ctx) {
    S.vod = { i: i, id: VV[i][0], ctx: ctx || [i] }; killHls(); setMode("vod"); S.playing = VV[i][0];
    ytLoad(VV[i][0], 0); vodBar();
  }
  function vodNext() {
    if (!S.vod) return; var c = S.vod.ctx, k = c.indexOf(S.vod.i);
    for (var n = k + 1; n < c.length; n++) if (!S.bad[VV[c[n]][0]]) return playVod(c[n], c);
    S.vod = null; openOD();
  }
  function vodBar(ms) {
    if (!S.vod) return; var b = $("#vodbar"), v = V(S.vod.i);
    $(".vb-title", b).textContent = vtitle(v) + "  \u00b7  " + SRC[v.src][1];
    b.hidden = false; vodTick(); clearTimeout(vodBar.t); vodBar.t = setTimeout(function () { if (!$("#vodbar").contains(d.activeElement) || IS_TV) b.hidden = true; }, ms || 4500);
  }
  function vodTick() { if (!S.vod || !ytReady) return; try { var t = YTP.getCurrentTime() || 0, D = YTP.getDuration() || VV[S.vod.i][2]; $(".vb-t").textContent = dur(t); $(".vb-d").textContent = dur(D); $(".vb-prog i").style.width = (t / D * 100) + "%"; $('[data-v="pp"]').innerHTML = YTP.getPlayerState() === 1 ? "&#10074;&#10074; Pause" : "&#9654; Play"; } catch (e) {} }
  setInterval(function () { if (S.mode === "vod" && !$("#vodbar").hidden) vodTick(); }, 1000);
  function vodAct(a) {
    if (!ytReady) return; try {
      if (a === "pp") { if (YTP.getPlayerState() === 1) YTP.pauseVideo(); else YTP.playVideo(); }
      if (a === "rw") YTP.seekTo(Math.max(0, YTP.getCurrentTime() - 30), true);
      if (a === "ff") YTP.seekTo(YTP.getCurrentTime() + 30, true);
      if (a === "next") return vodNext();
      if (a === "back") { S.vod = null; ytStop(); return openOD(); }
    } catch (e) {}
    vodBar(); setTimeout(vodTick, 300);
  }
  $("#vodbar").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) vodAct(b.dataset.v); });
  $(".vb-prog").addEventListener("click", function (e) { var r = this.getBoundingClientRect(); try { YTP.seekTo((e.clientX - r.left) / r.width * YTP.getDuration(), true); } catch (x) {} vodBar(); });
  function vodKey(k) {
    var bs = $$("#vodbar .fbtn"), f = bs.indexOf(d.querySelector("#vodbar .fbtn.focus"));
    if ($("#vodbar").hidden && k !== "back") { vodBar(); if (f < 0) { bs[2].classList.add("focus"); } return; }
    if (k === "left" || k === "right") { bs.forEach(function (b) { b.classList.remove("focus"); }); f = (f < 0 ? 2 : f) + (k === "left" ? -1 : 1); f = Math.max(0, Math.min(bs.length - 1, f)); bs[f].classList.add("focus"); vodBar(); return; }
    if (k === "ok") { vodAct(f >= 0 ? bs[f].dataset.v : "pp"); return; }
    if (k === "back") return vodAct("back");
    if (k === "up" || k === "down") return vodBar();
    if (k === "guide") { S.vod = null; return openGuide(); }
    if (k === "od") { S.vod = null; ytStop(); return openOD(); }
  }

  // ---------- input ----------
  var num = "", numT = null;
  function numKey(dg) {
    num = (num + dg).slice(-3); var e = $("#numentry"); e.textContent = num + "-"; e.hidden = false;
    clearTimeout(numT); numT = setTimeout(function () { var n = +num; num = ""; e.hidden = true; var c = CH.filter(function (c) { return c.n === n; })[0]; if (c) { if (S.mode !== "tv") setMode("tv"); tune(c.idx); } else toast("Channel " + n + " is not available"); }, 1600);
  }
  function key(k) {
    if (!S.started) { if (k === "ok") powerOn(); return; }
    if (S.mode === "guide") return guideKey(k);
    if (S.mode === "od") return odKey(k);
    if (S.mode === "vod") return vodKey(k);
    // tv
    if (k === "up" || k === "chup") return chUp(1);
    if (k === "down" || k === "chdn") return chUp(-1);
    if (k === "ok" || k === "info" || k === "left" || k === "right") { if (S.soundOK === false) unmute(); return showBanner(8000); }
    if (k === "guide") return openGuide();
    if (k === "od") return openOD();
    if (k === "last") return tune(S.last);
    if (k === "back") { if (!$("#banner").hidden) { $("#banner").hidden = true; return; } return tune(S.last); }
  }
  var KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", " ": "ok", Escape: "back", Backspace: "back", BrowserBack: "back", GoBack: "back",
    PageUp: "pgup", PageDown: "pgdn", ChannelUp: "chup", ChannelDown: "chdn", MediaTrackNext: "chup", MediaTrackPrevious: "chdn", g: "guide", G: "guide", ContextMenu: "guide", Guide: "guide",
    d: "od", D: "od", i: "info", I: "info", Info: "info", l: "last", L: "last", "+": "chup", "-": "chdn", "=": "chup", MediaPlayPause: "pp" };
  d.addEventListener("keydown", function (e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && !/Escape|ArrowUp|ArrowDown/.test(e.key)) return;
    if (/^[0-9]$/.test(e.key) && S.started && S.mode !== "od") { e.preventDefault(); return numKey(e.key); }
    var k = KEYMAP[e.key] || (e.keyCode === 4 || e.keyCode === 461 || e.keyCode === 10009 ? "back" : e.keyCode === 427 ? "chup" : e.keyCode === 428 ? "chdn" : e.keyCode === 457 ? "info" : null);
    if (!k) return;
    if (S.mode === "guide" && (k === "chup" || k === "chdn")) k = k === "chup" ? "pgup" : "pgdn";
    if (S.mode === "od" && (k === "chup" || k === "chdn")) k = k === "chup" ? "pgup" : "pgdn";
    if (k === "pp") { if (S.mode === "vod") vodAct("pp"); return; }
    e.preventDefault(); e.stopPropagation(); key(k);
  }, true);
  $("#tap").addEventListener("click", function () { if (!S.started) return powerOn(); if (S.mode === "vod") return vodBar(); if (S.mode === "tv") { unmute(); showBanner(); showRemote(); } else if (S.mode === "guide") goLive(); else if (S.mode === "od") goLive(); });
  $("#remote").addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (!b) return; unmute(); var r = b.dataset.r; showRemote();
    if (r === "up") chUp(1); else if (r === "down") chUp(-1); else if (r === "guide") openGuide(); else if (r === "od") openOD(); else if (r === "info") showBanner(8000); else if (r === "last") tune(S.last); });
  function unmute() { S.soundOK = true; try { if (ytReady) { YTP.unMute(); YTP.setVolume(100); } } catch (e) {} var v = $("#hls"); if (!v.hidden) { v.muted = false; v.play().catch(function () {}); } $("#unmute").hidden = true; }
  $("#unmute").addEventListener("click", function (e) { e.stopPropagation(); unmute(); });

  function powerOn() {
    if (S.started || !CH.length) return; S.started = true; S.soundOK = true; $("#power").hidden = true;
    var last = +LS.getItem("cable_ch"), c = CH.filter(function (c) { return c.n === last; })[0] || CH[0];
    setMode("tv"); tune(c.idx); showBanner(6000);
  }
  $("#pwbtn").addEventListener("click", powerOn);
  setInterval(function () { if (S.mode === "guide") { renderGuide(); } else if (S.mode === "od") $(".od-clock").textContent = clock(); else if (!$("#banner").hidden) $(".bn-clock").textContent = clock(); }, 30000);

  // ---------- boot ----------
  loadYT();
  var qv = (d.querySelector('script[src^="app.js"]') || {}).src || ""; qv = (qv.split("?")[1] || "");
  Promise.all([fetch("catalog.json" + (location.search.indexOf("nocache") >= 0 ? "?" + Date.now() : "")).then(function (r) { return r.json(); }), fetch("live.json?" + Math.floor(Date.now() / 3600000)).then(function (r) { return r.json(); })]).then(function (a) {
    CAT = a[0]; LIVE = a[1]; prep();
    $(".pw-load").textContent = CH.length + " channels \u00b7 " + VV.length.toLocaleString() + " free programs ON DEMAND";
    var b = $("#pwbtn"); b.disabled = false; if (IS_TV) b.classList.add("focus"); try { b.focus(); } catch (e) {}
    W.CABLE = { S: S, CH: CH, at: at, tune: tune, key: key, V: V, openOD: openOD, openGuide: openGuide, YTP: function () { return YTP; }, search: searchItems, push: push, screens: { peopleScreen: peopleScreen, genresScreen: genresScreen, decadeScreen: decadeScreen, typeScreen: typeScreen, networksScreen: networksScreen, azScreen: azScreen, searchScreen: searchScreen } };
    if (/[?&]autostart=1/.test(location.search)) powerOn();
  }).catch(function (e) { $(".pw-load").textContent = "Couldn't load the lineup - check your connection."; });
})();

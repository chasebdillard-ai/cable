/* Cable - 2006 digital cable mimic. Live channels = deterministic schedules over free full-length YouTube videos (+8 real HLS networks).
   Modes: tv (full video + flip-bar banner), guide (i-Guide grid), od (ON DEMAND menus), vod (on-demand playback). One persistent YouTube player. */
(function () {
  "use strict";
  var d = document, W = window, $ = function (s, r) { return (r || d).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || d).querySelectorAll(s)); };
  var UA = navigator.userAgent;
  var IS_TV = /SMART-TV|SmartTV|Tizen|Web0S|webOS|AFT[A-Z]|CrKey|BRAVIA|Android TV|GoogleTV|AppleTV|HbbTV|NetCast|Roku|Silk\/.*TV|DTV|Large Screen/i.test(UA) || !!W.TVNative || /[?&]tv=1/.test(location.search);
  if (IS_TV) d.documentElement.classList.add("tv");
  var APPLE = /iP(hone|ad|od)/.test(UA) || (/Safari\//.test(UA) && /Apple/.test(navigator.vendor || "") && !/Chrome|Chromium|CriOS|Android/.test(UA));
  var CAT = null, LIVE = null, SRC = [], SHOWS = [], PEOPLE = [], GEN = [], VV = [], CH = [], VIDX = {};
  var TYPEN = { E: "Episode", M: "Movie", D: "Documentary", S: "Special", K: "Marathon", F: "Full Event", W: "Full Match" }, TYPEP = { W: "Full Matches", D: "Documentaries" };
  var S = { mode: "boot", ch: 0, last: 0, playing: null, vod: null, override: null, started: false, soundOK: false, bad: {} };
  var LS = W.localStorage || { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
  S.cc = LS.getItem("cable_cc") === "1"; // closed captions: OFF unless this device turned them on
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
  // real network logos (Wikimedia Commons / Wikipedia, downloaded into logos/): LIVE.logos[id] = [plate l|d, aspect, mono aspect]
  var SRCLOGO = { AETV: "ae", NCIS: "cbs", CBS: "cbs", FortyEight: "cbs", SixtyMin: "cbs", TwoHalfMen: "cbs", Showtime: "showtime", History: "history", PawnStars: "history",
    Lifetime: "lifetime", TLC: "tlc", MTVRealityUK: "mtv", MTVVault: "mtv", Discovery: "discovery", Science: "science", NatGeo: "natgeo", COPS: "realcops", TruBlu: "trublu", WWF: "wwf", TheCW: "thecw",
    CWSports: "thecw", Reelz: "reelz", GSN: "gsn", OWN: "own", PBS: "pbs", PBSDocs: "pbs", Starz: "starz", WEtv: "wetv", Oxygen: "oxygen", BET: "bet",
    PokemonTV: "kidswb", Pokemon: "kidswb", RegularShow: "cn", TotalDrama: "cn", AquaTeen: "cn", RickMorty: "cn" };
  function lgInfo(id) { return LIVE && LIVE.logos && LIVE.logos[id]; }
  function imgLogo(id, alt, extra) { var L = lgInfo(id); return '<span class="lg lgi ' + (L[0] === "d" ? "pd" : "pl") + (extra || "") + '"><img src="logos/' + id + '.png" alt="' + esc(alt) + '" decoding="async" style="aspect-ratio:' + L[1] + '"></span>'; }
  function logo(c, big) {
    var st = c.sty || ["#123", "#fff", "sans"];
    if (lgInfo(c.id)) return imgLogo(c.id, c.name, c.hls ? " live" : "");
    return '<span class="lg ' + esc(st[2]) + (c.hls ? " live" : "") + '" style="background:' + st[0] + ";color:" + st[1] + '">' + esc(big ? c.name.length > 14 ? c.call : c.name : c.call) + "</span>";
  }
  function srcLogoId(k) { var id = SRCLOGO[SRC[k] && SRC[k][0]]; return id && lgInfo(id) ? id : null; }
  function srcLogo(k) { var id = srcLogoId(k); return id ? imgLogo(id, SRC[k][1]) : ""; }
  function prep() {
    SRC = CAT.src; SHOWS = CAT.shows; PEOPLE = CAT.people; GEN = CAT.genres; VV = CAT.v; CH = LIVE.ch;
    VV.forEach(function (v, i) { VIDX[v[0]] = i; });
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

  // ---------- YouTube player: two players (A/B) with cable-box cuts (2026-11-19) ----------
  // The ACTIVE player is on screen; the STANDBY player loads the next program / channel off screen and is cut in only when it really
  // plays (or when YouTube runs an ad, which has to stay visible). Until then the previous picture stays up (muted) or our own slate covers.
  // Every load starts muted (sound autoplay is blocked without a user gesture, which used to leave players stuck "buffering");
  // sound comes on as soon as the page has a user gesture (remembered). Watchdog: an error, or no picture within ~6 s -> next scheduled item.
  var YTP = null, ytReady = false, ytQ = null, PL = [], act = 0, job = null, LOG = W.CABLE_LOG = [];
  var BADK = "cable_bad", NOWD = /[?&]nowd=1/.test(location.search); // nowd=1: no timeout skips (headless tests where YouTube never decodes)
  try { var bb0 = JSON.parse(LS.getItem(BADK) || "{}"), tn0 = Date.now(); Object.keys(bb0).forEach(function (k) { if (tn0 - bb0[k] < 7 * 864e5) S.bad[k] = 1; }); } catch (e) {}
  function markBad(id, why) { S.bad[id] = 1; LOG.push(["bad", id, why, Date.now()]); try { var bb = JSON.parse(LS.getItem(BADK) || "{}"); bb[id] = Date.now(); LS.setItem(BADK, JSON.stringify(bb)); } catch (e) {} }
  function loadYT() {
    var s = d.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; d.head.appendChild(s);
    W.onYouTubeIframeAPIReady = function () { mkPlayer(0); mkPlayer(1); };
  }
  function mkPlayer(n) {
    var p = new YT.Player("yt" + n, { width: "100%", height: "100%", host: "https://www.youtube.com",
      playerVars: { autoplay: 0, mute: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, enablejsapi: 1, origin: location.origin,
        cc_load_policy: S.cc ? 1 : 0, cc_lang_pref: "en" },
      events: { onReady: function () { p.rdy = 1; var f = p.getIframe && p.getIframe(); if (f) { f.setAttribute("allow", "autoplay; encrypted-media"); f.setAttribute("tabindex", "-1"); f.setAttribute("aria-hidden", "true"); }
          if (PL[0] && PL[0].rdy && PL[1] && PL[1].rdy && !ytReady) { ytReady = true; YTP = PL[act]; if (ytQ) { var q = ytQ; ytQ = null; ytLoad(q.id, q.at, q.o); } } },
        onStateChange: function (e) { onYTState(n, e); }, onError: function (e) { onYTError(n, e); }, onApiChange: function () { if (n === act) applyCC(); } } });
    PL[n] = p;
  }
  function hasGesture() { return !!W.CableNative || S.gesture || !!(navigator.userActivation && navigator.userActivation.hasBeenActive); }
  // our own layers over the picture: #cover = black slate with the channel (tuning / please stand by), #tunefx = quick static on a channel change
  function cover(mode, txt) {
    var cv = $("#cover");
    if (!mode) { cv.hidden = true; $("#snow").hidden = true; return; }
    if (mode === "snow") { cv.hidden = true; $("#snow").hidden = false; return; }
    var c = CH[S.ch], vod = S.vod;
    $(".cv-num", cv).textContent = vod ? "" : c ? c.n : "";
    $(".cv-logo", cv).innerHTML = vod ? "" : c ? logo(c) : "";
    $(".cv-txt", cv).textContent = txt || (mode === "stand" ? "Please stand by" : vod ? "Loading program\u2026" : "Tuning\u2026");
    cv.className = "cv-" + mode; cv.hidden = false;
  }
  function flash() { var f = $("#tunefx"); f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { f.hidden = true; }, 380); }
  function ytLoad(id, start, o) {
    o = o || {}; LOG.push(["load", id, Math.round(start || 0), Date.now()]);
    if (!ytReady) { ytQ = { id: id, at: start, o: o }; cover("tune"); return; }
    var sb = 1 - act, p = PL[sb];
    if (job && !job.done) job.done = true;
    var j = job = { id: id, start: Math.max(0, Math.floor(start || 0)), t0: Date.now(), n: sb, ok: false, ad: false, last: null, kick: false, o: o };
    try { p.mute(); p.loadVideoById({ videoId: id, startSeconds: j.start }); p.playVideo(); } catch (e) {}
    try { PL[act].mute(); } catch (e) {}
    if (!o.keep || !S.picOK) { S.picOK = false; cover("tune"); }
    S.ccFor = null; clearTimeout(tick.t); tick.t = setTimeout(tick, 250); refocus();
  }
  // Start-up watchdog for a freshly loaded program (2026-11-19, Chase: never give up on a program because of YouTube pre-roll ads).
  // Ads and buffering are healthy: an ad shows the player at once and we keep waiting; buffering just waits. A program is only skipped on a real
  // player error (onError: 100/101/150/5/2 -> fail) or when NOTHING happens - no picture progress, no ad, no buffering - for 60 s
  // (90 s hard cap with no progress at all, 6 min cap on one ad break). When the program itself starts after an ad it is seeked to the
  // schedule offset (live channels), so every viewer stays in sync.
  function tick() {
    var j = job; if (!j || j.done) return;
    var p = PL[j.n], st = -2, ct = 0, tn = Date.now(); try { st = p.getPlayerState(); ct = p.getCurrentTime() || 0; } catch (e) {}
    var el = tn - j.t0, moving = j.last != null && ct > j.last + 0.08; j.last = ct;
    if (j.lastMove == null) j.lastMove = j.t0;
    if (moving) j.lastMove = tn;
    if (st === 3) j.lastBuf = tn;
    var want = j.start + el / 1000;   // where the program should be now
    if (st === 1 && moving && (Math.abs(ct - j.start) < 30 + el / 1000 || (j.start < 5 && !j.ad))) return live(j, false);
    if (moving && Math.abs(ct - j.start) > 4 && Math.abs(ct - want) > 4) { // something else is playing = a pre-roll ad
      if (!j.ad) { j.ad = tn; LOG.push(["ad", j.id, tn]); live(j, true); }
      j.adSeen = tn;
    }
    if ((!moving && el > 2500 && !j.kick) || (!moving && (st === 2 || st === 5 || st === -1) && el > 4000 && tn - (j.kickAt || 0) > 10000)) { j.kick = true; j.kickAt = tn; try { p.mute(); p.playVideo(); } catch (e) {} }
    if (!S.picOK && !j.ad && el > 8000 && !j.stby) { j.stby = 1; cover("tune", "Please stand by\u2026"); }
    var idle = tn - j.lastMove, bufRecent = j.lastBuf && tn - j.lastBuf < 4000, adRecent = j.adSeen && tn - j.adSeen < 4000;
    if (!NOWD) {
      if (idle > 60000 && !bufRecent && !adRecent) return fail(j, "no-picture");
      if (idle > 90000) return fail(j, "no-picture");
      if (j.ad && tn - j.ad > 360000) return fail(j, "ad-stall");
    }
    tick.t = setTimeout(tick, 250);
  }
  function cut(n) {
    if (n === act) return; var old = act; act = n; YTP = PL[act];
    $("#yp" + act).classList.add("on"); $("#yp" + old).classList.remove("on");
    try { PL[old].mute(); PL[old].stopVideo(); } catch (e) {}
  }
  function live(j, isAd) {
    cut(j.n); $("#ytwrap").classList.toggle("ad", !!isAd); $("#screen").classList.toggle("adon", !!isAd); cover(null); S.picOK = true; S.skips = 0; S.tmo = 0;
    sound();
    if (isAd) return;
    j.ok = j.done = true; j.okAt = Date.now(); LOG.push(["playing", j.id, j.okAt - j.t0, j.okAt]);
    if (j.ad && !j.o.vod && !S.vod) { // the ad ate into the slot: jump to where the schedule is now
      var want = j.start + (j.okAt - j.t0) / 1000, p = PL[j.n], dur = 0, ct = 0; try { dur = p.getDuration() || 0; ct = p.getCurrentTime() || 0; } catch (e) {}
      if (want - ct > 3 && (!dur || want < dur - 5)) { try { p.seekTo(want, true); } catch (e) {} LOG.push(["resync", j.id, Math.round(ct), Math.round(want), j.okAt]); }
    }
    if (S.ccFor !== S.playing) { S.ccFor = S.playing; applyCC(); setTimeout(applyCC, 1500); }
    refocus();
  }
  function sound() { // unmute when the browser allows it; otherwise stay muted with "Tap for sound"
    var p = PL[act];
    if (S.soundOK && hasGesture()) {
      try { p.unMute(); p.setVolume(100); } catch (e) {}
      setTimeout(function () { try { if (p !== PL[act]) return; if (p.getPlayerState() === 2) { p.mute(); p.playVideo(); needSound(); } else if (!p.isMuted()) $("#unmute").hidden = true; } catch (e) {} }, 900);
    } else needSound();
  }
  function needSound() { var u = $("#unmute"); u.textContent = IS_TV ? "Press OK for sound" : "Tap for sound"; u.hidden = false; }
  function fail(j, why, sessionOnly) {
    j.done = true;
    if (sessionOnly) { S.bad[j.id] = 1; LOG.push(["bad", j.id, why, Date.now()]); }
    else if (why === "no-picture") { // could be the video, could be the connection: only remember it for this session, and after
      S.bad[j.id] = 1; LOG.push(["bad", j.id, why, Date.now()]); // 3 timeouts in a row assume a weak connection and retry instead of skipping
      if ((S.tmo = (S.tmo || 0) + 1) >= 3) { S.tmo = 0; delete S.bad[j.id]; cover("stand", "Weak signal – please stand by"); clearTimeout(fail.rt); fail.rt = setTimeout(function () { if (!S.vod && CH[S.ch] && !CH[S.ch].hls) { S.override = null; tune(S.ch, { quiet: true, keepLast: true }); } }, 8000); return; }
    } else markBad(j.id, why);
    if (j.o.vod || S.vod) { toast("This program is unavailable - skipping"); return vodNext(); }
    var c = CH[S.ch]; if (!c || c.hls) return;
    if ((S.skips = (S.skips || 0) + 1) > 6) { S.skips = 0; cover("snow"); return; }
    var p = S.override && S.override.ch === S.ch ? S.override : at(c, now()), n = nextOf(c, p), tries = 0;
    while (S.bad[VV[n.i][0]] && tries++ < 30) n = nextOf(c, n);
    S.override = { k: n.k, i: n.i, start: now(), end: now() + VV[n.i][2], ch: S.ch };
    S.playing = VV[n.i][0]; ytLoad(S.playing, 0, { keep: true }); if (S.mode === "tv" && !$("#banner").hidden) showBanner();
  }
  function ytStop() { if (job) job.done = true; job = null; S.picOK = false; clearTimeout(tick.t); try { PL[0].stopVideo(); PL[1].stopVideo(); } catch (e) {} }
  function onYTState(n, e) {
    LOG.push(["state", e.data, Date.now(), n]);
    if (n !== act || (job && !job.done && job.n === n)) return; // the standby player is handled by tick()
    if (e.data === 0) { // ended: our slate instead of YouTube's end screen, then the next program
      cover("tune", S.vod ? "Loading next program\u2026" : "");
      if (S.mode === "vod" || S.vod) return vodNext();
      S.override = null; S.picOK = false; tune(S.ch, { quiet: true, keepLast: true });
    }
    if (e.data === 1) { $("#ytwrap").classList.remove("ad"); $("#screen").classList.remove("adon"); cover(null); }
  }
  // Only 100/101/150/153 (removed, private, embedding disabled / blocked) mean the video itself is bad and get remembered.
  // 5 (HTML5 player error) and 2 are usually transient (ad hand-off, autoplay race): retry the same program at its schedule offset first.
  var HARD = { 100: 1, 101: 1, 150: 1, 153: 1 };
  function onYTError(n, e) {
    LOG.push(["error", e.data, Date.now(), n]);
    if (!HARD[e.data]) {
      var jj = job && !job.done && job.n === n ? job : null, id = jj ? jj.id : S.playing, key = id + ":" + (S.vod ? "v" : S.ch);
      S.soft = S.soft || {}; S.soft[key] = (S.soft[key] || 0) + 1;
      if (S.soft[key] <= 2 && (jj || n === act)) {
        var off = jj ? jj.start + (Date.now() - jj.t0) / 1000 : (function () { try { return PL[n].getCurrentTime() || 0; } catch (x) { return 0; } })();
        LOG.push(["retry", id, e.data, Date.now()]); var o = jj ? jj.o : { keep: true, vod: !!S.vod };
        setTimeout(function () { if (S.playing === id || (S.vod && S.vod.id === id)) ytLoad(id, off + 1.5, o); }, 1500); if (jj) jj.done = true; return;
      }
      if (jj) { jj.done = true; S.bad[id] = 1; return fail(jj, "soft " + e.data, true); }
    }
    if (job && !job.done && job.n === n) return fail(job, "error " + e.data);
    if (n !== act) return;
    if (HARD[e.data]) markBad(S.playing, "error " + e.data); else S.bad[S.playing] = 1;
    if (S.vod) { toast("This program is unavailable - skipping"); return vodNext(); }
    S.override = null; S.picOK = false; tune(S.ch, { quiet: true, keepLast: true });
  }
  // mid-program buffering on the active player: our "Please stand by" slate instead of YouTube's spinner
  setInterval(function () {
    if (!ytReady || !S.picOK || (job && !job.done) || $("#ytwrap").classList.contains("ad")) return;
    var cv = $("#cover"), st = -2; try { st = YTP.getPlayerState(); } catch (e) {}
    var c = CH[S.ch]; if (!S.vod && (!c || c.hls)) return;
    if (st === 3 || st === -1) { stall.n = (stall.n || 0) + 1; if (stall.n >= 3) cover("stand"); } else { stall.n = 0; if (st === 1 && !cv.hidden && cv.className === "cv-stand") cover(null); }
  }, 500);
  function stall() {}
  // pre-cue the next program in the standby player ~20 s before the boundary (metadata + first frames ready for the cut)
  function precue() {
    if (!ytReady || S.vod || !S.started || (job && !job.done)) return; var c = CH[S.ch]; if (!c || c.hls) return;
    var p = S.override && S.override.ch === S.ch ? S.override : at(c, now()); if (p.end - now() > 20 || p.end - now() < 2) return;
    var n = nextOf(c, p), id = VV[n.i][0]; if (precue.id === id) return; precue.id = id;
    try { PL[1 - act].cueVideoById({ videoId: id, startSeconds: 0 }); LOG.push(["cue", id, Date.now()]); } catch (e) {}
  }
  setInterval(precue, 3000);
  // ---------- closed captions (default OFF; per-device choice; applied on every tune / next video) ----------
  function applyCC() {
    LOG.push(["cc", S.cc ? 1 : 0, Date.now()]);
    if (ytReady) try {
      if (S.cc) { YTP.loadModule("captions"); YTP.setOption("captions", "track", { languageCode: "en" }); }
      else { YTP.setOption("captions", "track", {}); YTP.unloadModule("captions"); YTP.unloadModule("cc"); }
    } catch (e) {}
    hlsCC();
  }
  function hlsCC() {
    var v = $("#hls"); if (!v) return;
    try { for (var i = 0; i < v.textTracks.length; i++) { var t = v.textTracks[i]; if (/captions|subtitles/.test(t.kind) || !t.kind) t.mode = S.cc ? "showing" : "hidden"; } } catch (e) {}
    if (hls) try { hls.subtitleDisplay = !!S.cc; if (!S.cc) hls.subtitleTrack = -1; } catch (e) {}
  }
  function toggleCC() { S.cc = !S.cc; LS.setItem("cable_cc", S.cc ? "1" : "0"); applyCC(); ccUI(); toast("Closed Captions " + (S.cc ? "ON" : "OFF")); }
  function ccUI() { $$('[data-r="cc"],[data-b="cc"],[data-v="cc"]').forEach(function (b) { b.classList.toggle("on", !!S.cc); b.setAttribute("aria-pressed", S.cc ? "true" : "false"); b.textContent = S.cc ? "CC ON" : "CC OFF"; }); }
  // the YouTube iframe must never keep keyboard focus (keys would go to YouTube, not the remote handler)
  function refocus() { setTimeout(function () { var a = d.activeElement; if (a && a.tagName === "IFRAME") { try { a.blur(); } catch (e) {} try { W.focus(); } catch (e) {} if (d.body) { d.body.setAttribute("tabindex", "-1"); d.body.focus({ preventScroll: true }); } } }, 0); }
  W.addEventListener("blur", function () { setTimeout(refocus, 30); });

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
    var hadYT = S.picOK && $("#hls").hidden; killHls(); if (job) job.done = true; job = null; try { PL[act].mute(); } catch (e) {}
    if (!hadYT) { ytStop(); cover("tune"); }
    var v = $("#hls"), srcs = c.hls.slice(), i = 0, round = 0, medRec = 0, me = c;
    v.hidden = false; v.style.opacity = 0; v.muted = !(S.soundOK && hasGesture());
    function go() { var q = v.play(); if (q && q.catch) q.catch(function () { v.muted = true; needSound(); v.play().catch(function () {}); }); }
    function fail() {
      if (CH[S.ch] !== me) return;
      if (hls) { try { hls.destroy(); } catch (e) {} hls = null; } clearInterval(hlsWd);
      i++; if (i < srcs.length) return play();
      ytStop(); cover("snow"); toast(me.name + " isn't responding - retrying", 4000);
      hlsRetry = setTimeout(function () { if (CH[S.ch] === me) { i = 0; round++; play(); } }, Math.min(60, 15 * (round + 1)) * 1000);
    }
    function watch() { var last = -1, still = 0; hlsWd = setInterval(function () { if (CH[S.ch] !== me || v.paused) { still = 0; return; } if (v.currentTime === last) { if (++still >= 2) fail(); } else { still = 0; last = v.currentTime; $("#snow").hidden = true; } }, 10000); }
    function play() {
      if (CH[S.ch] !== me) return; medRec = 0; var u = srcs[i]; LOG.push(["hls", u, Date.now()]);
      if (/^yql:/.test(u)) {  // Yahoo video: resolve the current live URL from Yahoo's public streams API (CORS *), then play it
        fetch("https://video-api.yql.yahoo.com/v1/video/sapi/streams/" + u.slice(4) + "?protocol=http&format=m3u8&site=sports&region=US&lang=en-US").then(function (r) { return r.json(); }).then(function (j) {
          var st = j.query.results.mediaObj[0].streams[0]; srcs[i] = st.host + st.path.split("?")[0]; play();
        }).catch(function () { fail(); }); return;
      }
      if (APPLE && v.canPlayType("application/vnd.apple.mpegurl")) { v.onerror = fail; v.src = u; go(); watch(); return; }
      hlsLib().then(function () {
        if (CH[S.ch] !== me) return;
        if (!W.Hls || !Hls.isSupported()) { if (v.canPlayType("application/vnd.apple.mpegurl")) { v.onerror = fail; v.src = u; go(); watch(); } else fail(); return; }
        hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 3, fragLoadingMaxRetry: 3, subtitleDisplay: !!S.cc });
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, hlsCC); hls.on(Hls.Events.NON_NATIVE_TEXT_TRACKS_FOUND, function () { setTimeout(hlsCC, 0); });
        hls.on(Hls.Events.ERROR, function (e, data) { if (!data.fatal) return; if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !medRec) { medRec = 1; try { hls.recoverMediaError(); } catch (x) { fail(); } return; } fail(); });
        hls.on(Hls.Events.MANIFEST_PARSED, go);
        hls.loadSource(u); hls.attachMedia(v); watch();
      }, function () { fail(); });
    }
    v.onplaying = function () { if (CH[S.ch] !== me) return; v.style.opacity = 1; ytStop(); S.picOK = true; cover(null); if (!v.muted) $("#unmute").hidden = true; else needSound(); hlsCC(); refocus(); };
    try { v.textTracks.onaddtrack = function () { hlsCC(); }; } catch (e) {}
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
    if (!o.quiet) flash();   // cable-box channel change: a quick burst of static, previous picture held until the new one plays
    if (c.hls) { S.playing = "hls:" + c.id; tuneHls(c); }
    else {
      var fromHls = !$("#hls").hidden; killHls(); if (fromHls) S.picOK = false;
      var p = at(c, now()), tries = 0;
      while (S.bad[VV[p.i][0]] && tries++ < 30) p = nextOf(c, p);
      if (tries) S.override = { k: p.k, i: p.i, start: p.start, end: p.end, ch: n };
      S.playing = VV[p.i][0]; ytLoad(VV[p.i][0], Math.max(0, now() - p.start), { keep: true });
    }
    if (c.hls) { setBug(null, ""); $("#bug").dataset.own = c.id; } else { setBug(c.id, c.call); $("#bug").dataset.own = ""; } // live feeds already burn in their own bug
    if (!o.quiet || S.mode === "tv") { if (S.mode === "tv") showBanner(); }
    if (S.mode === "guide") { guideInfo(); gCur(); }
    refocus();
  }
  // ---------- network "bug": see-through white logo, bottom-right of the picture (inside the 16:9 image, title-safe margin) ----------
  function setBug(id, txt) {
    var b = $("#bug"), im = $("img", b), sp = $("span", b), L = id && lgInfo(id);
    b.dataset.id = id || ""; b.hidden = !id && !txt;
    if (L) { if (im.getAttribute("src") !== "logos/" + id + "-w.png") im.src = "logos/" + id + "-w.png"; im.hidden = false; sp.textContent = ""; b.style.setProperty("--ar", L[2]); }
    else { im.hidden = true; im.removeAttribute("src"); sp.textContent = txt || ""; b.style.setProperty("--ar", 2.2); }
    placeBug();
  }
  function vodNet(i) { // the item's own network logo, else the live channel that carries it
    var v = VV[i], id = srcLogoId(v[3]); if (id) return { id: id };
    var chs = Object.keys((v[4] >= 0 ? IX().chShow[v[4]] : IX().chSrc[v[3]]) || {}).map(function (k) { return CH[k]; });
    var c = chs.filter(function (c) { return lgInfo(c.id); })[0] || chs[0]; return c ? { id: lgInfo(c.id) ? c.id : null, txt: c.call } : { txt: "" };
  }
  function placeBug() { // geometry from the screen box only (no reads inside animation frames)
    var sc = $("#screen"), b = $("#bug"), W0 = sc.offsetWidth, H0 = sc.offsetHeight; if (!W0 || !H0) return;
    var vw = Math.min(W0, H0 * 16 / 9), vh = vw * 9 / 16, ar = +b.style.getPropertyValue("--ar") || 2;
    var h = Math.max(10, vh * (ar > 2.6 ? .055 : ar > 1.6 ? .075 : .1)), w = Math.min(h * ar, vw * .17); h = w / ar;
    var m = Math.max(4, vw * .035);
    b.style.width = Math.round(w) + "px"; b.style.height = Math.round(h) + "px";
    b.style.right = Math.round((W0 - vw) / 2 + m) + "px"; b.style.bottom = Math.round((H0 - vh) / 2 + m * .8) + "px";
    b.style.fontSize = Math.round(h * .72) + "px";
  }
  function chUp(dx) { var n = S.ch, list = guideList(), k = list.indexOf(n); if (k < 0) k = 0; tune(list[(k + dx + list.length) % list.length]); }
  setInterval(function () { // keep live channels on schedule
    if (!S.started || S.vod) return; var c = CH[S.ch]; if (!c || c.hls) return;
    if (S.override) { if (now() >= S.override.end) { S.override = null; tune(S.ch, { quiet: true, keepLast: true }); } return; }
    var p = at(c, now()); if (VV[p.i][0] !== S.playing && !S.bad[VV[p.i][0]]) tune(S.ch, { quiet: true, keepLast: true });
  }, 5000);
  // schedule drift (a mid-roll ad, a long buffer, an ad we took for the program): once the program has played continuously for two
  // checks in a row and sits > 12 s behind (or > 20 s ahead of) the schedule, seek it back on time. A jump in currentTime (ad start/end) resets the check.
  setInterval(function () {
    var dr = S.drift || (S.drift = {});
    if (!S.started || S.vod || !ytReady || !S.picOK || (job && !job.done) || $("#ytwrap").classList.contains("ad")) { dr.id = null; return; }
    var c = CH[S.ch]; if (!c || c.hls) { dr.id = null; return; }
    var p = S.override && S.override.ch === S.ch ? S.override : at(c, now()); if (VV[p.i][0] !== S.playing) { dr.id = null; return; }
    var st = -2, ct = 0, tn = Date.now(); try { st = YTP.getPlayerState(); ct = YTP.getCurrentTime() || 0; } catch (e) { return; }
    if (st !== 1) { dr.id = null; return; }
    var cont = dr.id === S.playing && Math.abs(ct - (dr.ct + (tn - dr.t) / 1000)) < 2.5;
    dr.ok = cont ? (dr.ok || 0) + 1 : 0; dr.id = S.playing; dr.ct = ct; dr.t = tn;
    var want = now() - p.start, d = want - ct;
    if (dr.ok >= 2 && (d > 12 || d < -20) && want > 0 && want < VV[p.i][2] - 5) { try { YTP.seekTo(want, true); } catch (e) {} LOG.push(["resync", S.playing, Math.round(ct), Math.round(want), tn]); dr.ok = 0; dr.id = null; }
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
    var rp = !c.hls && recState(c, S.override && S.override.ch === S.ch ? S.override : at(c, now())); $(".bn-title", b).classList.toggle("recd", !!(rp && (rp.one || rp.ser)));
    recUI(); ccUI();
    b.hidden = false; clearTimeout(showBanner.t); if (!portrait()) showBanner.t = setTimeout(function () { b.hidden = true; }, ms || 5000);
    if (!IS_TV && matchMedia("(pointer:coarse)").matches) showRemote();
  }
  function showRemote() { var r = $("#remote"); r.hidden = false; clearTimeout(showRemote.t); if (!portrait()) showRemote.t = setTimeout(function () { r.hidden = true; }, 6000); }
  function portrait() { return matchMedia("(orientation:portrait) and (max-width:820px)").matches; }

  // ---------- screen placement ----------
  function place() {
    var sc = $("#screen"), r = null;
    if (portrait()) { var tv0 = d.getElementById("tv"), st = sat(); r = { left: 0, top: st, width: tv0.clientWidth, height: tv0.clientWidth * 9 / 16 }; tv0.classList.add("portrait-bg"); }
    else if (S.mode === "guide") r = $("#gprev").getBoundingClientRect();
    else if (S.mode === "od") { var pv = $("#odprev"); pv.style.display = "block"; r = pv.getBoundingClientRect(); }
    if (S.mode !== "od") $("#odprev").style.display = "none";
    if (r && r.width) { sc.style.left = r.left + "px"; sc.style.top = r.top + "px"; sc.style.width = r.width + "px"; sc.style.height = r.height + "px"; sc.style.zIndex = S.mode === "tv" || S.mode === "vod" ? 5 : 25; }
    else { sc.style.left = "0"; sc.style.top = "0"; sc.style.width = "100%"; sc.style.height = "100%"; sc.style.zIndex = 5; }
    if (!portrait()) d.getElementById("tv").classList.remove("portrait-bg");
    placeBug();
  }
  function sat() { // safe-area inset top (env() can't be read from a custom property, so measure a probe)
    if (!sat.p) { sat.p = d.createElement("div"); sat.p.style.cssText = "position:fixed;left:0;top:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none"; d.body.appendChild(sat.p); }
    return sat.p.offsetHeight || 0; }
  var rzT = 0; addEventListener("resize", function () { cancelAnimationFrame(rzT); rzT = requestAnimationFrame(function () { place(); if (S.mode === "guide") { G.m = null; renderGuide(); } }); });

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
  var G = { row: 0, top: 0, t: 0, w0: 0, filter: "all", menu: null, m: null, rows: {}, lo: 0, hi: -1, st: 0, list: null, n: 0 };
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
  // Guide grid: virtualised + natively scrolled. Only the visible channel rows (+ overscan) exist in the DOM; rows are absolutely positioned inside a
  // spacer and recycled as you scroll. Touch/wheel = the browser's own (compositor, iOS momentum) scrolling; keys/remote = short rAF tweens.
  var OVER = 4;
  function gm() {
    if (G.m) return G.m; var el = $("#grows"), h = el.clientHeight || 300, w = el.clientWidth || 600, fs = parseFloat(getComputedStyle(el).fontSize) || 14;
    var n = Math.max(3, Math.min(12, Math.floor(h / (fs * 3.1)))), rh = Math.floor(h / n);
    G.m = { h: h, w: w, n: n, rh: rh }; el.style.setProperty("--rh", rh + "px"); return G.m;
  }
  function rowsVisible() { return gm().n; }
  function winLen() { var w = gm().w; return w < 520 ? 3600 : w > 1500 ? 7200 : 5400; }
  function openGuide() {
    setMode("guide"); G.m = null; var t = now(); G.w0 = Math.floor(t / 1800) * 1800; G.t = t;
    var list = guideList(), k = list.indexOf(S.ch); if (k < 0) { G.filter = "all"; list = guideList(); k = list.indexOf(S.ch); }
    G.row = Math.max(0, k); var n = rowsVisible(); G.top = Math.max(0, Math.min(G.row - Math.floor(n / 2), list.length - n));
    renderGuide(); place();
  }
  function selProg() { var list = guideList(), c = CH[list[G.row]]; if (!c) return null; var p = c.hls ? { live: 1, start: G.w0, end: G.w0 + winLen() } : at(c, Math.max(G.t, G.w0)); return { c: c, p: p }; }
  function gRowHtml(r, list, fv, wl, w1) {
    var c = CH[list[r]], cells = "", rh = G.m.rh;
    progs(c, G.w0, w1).forEach(function (p) {
      var a = Math.max(p.start, G.w0), b = Math.min(p.end, w1), L = (a - G.w0) / wl * 100, Wd = (b - a) / wl * 100;
      if (Wd <= 0) return;
      var label, sub, cls = "", rec = "";
      if (p.live) { label = c.name + " - Live Feed"; sub = c.tag; cls = " live"; }
      else { var v = V(p.i); label = v.sh >= 0 ? SHOWS[v.sh].n : v.t; sub = v.sh >= 0 ? v.t : TYPEN[v.ty] + (v.yr ? " (" + v.yr + ")" : ""); if (v.ty === "M") cls = " mv"; rec = recMark(c, p); }
      cells += '<div class="g-cell' + cls + (rec ? " recd" : "") + '" data-r="' + r + '" data-t="' + (p.live ? G.w0 : p.start) + '" data-e="' + (p.live ? w1 : p.end) + '" style="left:' + L + "%;width:" + Wd + '%">' +
        (p.start < G.w0 && !p.live ? '<span class="arr">&#9664;</span>' : "") + rec + esc(label) + "<small>" + esc(sub) + "</small></div>";
    });
    return '<div class="g-row' + (c.idx === S.ch ? " cur" : "") + '" data-r="' + r + '" data-c="' + c.idx + '" style="top:' + (r * rh) + 'px"><div class="g-ch" data-r="' + r + '"><span class="num">' + c.n + "</span>" + logo(c) +
      (fv.indexOf(c.id) >= 0 ? '<span class="fav">&#9733;</span>' : "") + '</div><div class="g-prog">' + cells + "</div></div>";
  }
  function renderGuide() { // full refresh: header + every rendered row (window change, filter, clock tick, resize)
    if (S.mode !== "guide") return;
    var list = guideList(), m = gm(), n = m.n, wl = winLen(), gr = $("#grows");
    if (G.row >= list.length) G.row = list.length - 1; if (G.row < 0) G.row = 0;
    if (G.row < G.top) G.top = G.row; if (G.row >= G.top + n) G.top = G.row - n + 1; G.top = Math.max(0, Math.min(G.top, Math.max(0, list.length - n)));
    var dt = new Date(G.w0 * 1000), th = "";
    $(".g-date").textContent = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()] + " " + (dt.getMonth() + 1) + "/" + dt.getDate();
    for (var k = 0; k < wl / 1800; k++) th += '<span style="left:' + (k * 1800 / wl * 100) + '%">' + hm(G.w0 + k * 1800) + "</span>";
    $(".g-times").innerHTML = th;
    $("#gfilter").innerHTML = "Guide: " + esc(FILTERS.filter(function (f) { return f[0] === G.filter; })[0][1]) + " &#9662;";
    var sp = $(".g-sp", gr); if (!sp) { sp = d.createElement("div"); sp.className = "g-sp"; gr.innerHTML = ""; gr.appendChild(sp); }
    sp.innerHTML = ""; G.rows = {}; G.lo = 0; G.hi = -1; G.list = list; G.n = list.length;
    sp.style.height = list.length * m.rh + "px";
    G.ign = true; gr.scrollTop = G.top * m.rh; G.st = G.top * m.rh;
    gSync(G.st); gSel(); guideInfo();
    requestAnimationFrame(function () { G.ign = false; });
  }
  function gSync(st) { // add/remove rows so [first-OVER, last+OVER] exist; never touches rows already on screen
    var m = G.m, list = G.list; if (!m || !list) return;
    var first = Math.floor(st / m.rh), lo = Math.max(0, first - OVER), hi = Math.min(list.length - 1, first + m.n + OVER);
    if (lo === G.lo && hi === G.hi) return;
    var sp = $("#grows .g-sp"), r, html = "", fv = favs().ch, wl = winLen(), w1 = G.w0 + wl;
    for (r in G.rows) if (r < lo || r > hi) { G.rows[r].remove(); delete G.rows[r]; }
    for (r = lo; r <= hi; r++) if (!G.rows[r]) html += gRowHtml(r, list, fv, wl, w1);
    if (html) { var tmp = d.createElement("div"); tmp.innerHTML = html; while (tmp.firstChild) { var e = tmp.firstChild; G.rows[e.dataset.r] = e; sp.appendChild(e); } }
    G.lo = lo; G.hi = hi; if (G.rows[G.row]) gSel();
  }
  function gSel() { // move the yellow highlight without re-rendering
    $$("#grows .g-cell.sel").forEach(function (e) { e.classList.remove("sel"); });
    var row = G.rows && G.rows[G.row]; if (!row) return;
    var cells = $$(".g-cell", row), t = Math.max(G.t, G.w0), hit = cells.filter(function (e) { return +e.dataset.t <= t && t < +e.dataset.e; })[0] || cells[0];
    if (hit) hit.classList.add("sel");
  }
  function gCur() { if (!G.rows) return; for (var r in G.rows) G.rows[r].classList.toggle("cur", +G.rows[r].dataset.c === S.ch); }
  function gEnsure(ms) { // keep the selected row on screen; tween the scroll (remote/keyboard paging)
    var n = G.m.n; if (G.row < G.top) G.top = G.row; if (G.row >= G.top + n) G.top = G.row - n + 1;
    G.top = Math.max(0, Math.min(G.top, Math.max(0, G.n - n))); gTween(G.top * G.m.rh, ms);
  }
  function gTween(to, ms) {
    var gr = $("#grows"), from = G.st; cancelAnimationFrame(G.tw);
    if (Math.abs(to - from) < 1) return;
    if (!ms) { G.ign = true; gr.scrollTop = to; G.st = to; gSync(to); requestAnimationFrame(function () { G.ign = false; }); return; }
    var t0 = performance.now(); G.ign = true;
    (function step(t) { var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3), y = from + (to - from) * e; gr.scrollTop = y; G.st = y; gSync(y);
      if (k < 1) G.tw = requestAnimationFrame(step); else requestAnimationFrame(function () { G.ign = false; }); })(t0);
  }
  // the grid's height depends on the info text above it: re-measure whenever the scroller's box actually changes size
  if (W.ResizeObserver) new ResizeObserver(function () { if (S.mode !== "guide" || !G.m) return; var h = $("#grows").clientHeight, w = $("#grows").clientWidth; if (Math.abs(h - G.m.h) > 1 || Math.abs(w - G.m.w) > 1) { G.m = null; renderGuide(); } }).observe($("#grows"));
  var gInfoQ = 0; function guideInfoSoon() { if (gInfoQ) return; gInfoQ = requestAnimationFrame(function () { gInfoQ = 0; guideInfo(); }); }
  // native scrolling (touch momentum / wheel / trackpad): passive listener, all work batched into one rAF
  var gRaf = 0, gIdleT = 0;
  $("#grows").addEventListener("scroll", function () {
    if (G.ign) return;
    if (!gRaf) gRaf = requestAnimationFrame(function () { gRaf = 0; var st = $("#grows").scrollTop; G.st = st; gSync(st); });
    clearTimeout(gIdleT); gIdleT = setTimeout(function () { // scrolling settled: keep the highlight inside the visible rows
      var m = G.m; if (!m) return; G.top = Math.round(G.st / m.rh);
      var r = Math.max(G.top, Math.min(G.row, G.top + m.n - 1)); if (r !== G.row) { G.row = r; gSel(); guideInfo(); }
    }, 140);
  }, { passive: true });
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
    var list = G.list || guideList(), sp;
    if (G.menu) return gmenuKey(k);
    if (k === "up" || k === "down") { var r0 = G.row; G.row = Math.max(0, Math.min(list.length - 1, G.row + (k === "up" ? -1 : 1))); if (r0 !== G.row) { gEnsure(90); gSel(); guideInfoSoon(); } return; }
    if (k === "pgup" || k === "pgdn") { var n = rowsVisible(); G.row = Math.max(0, Math.min(list.length - 1, G.row + (k === "pgup" ? -n : n))); G.top = Math.max(0, Math.min(G.row, list.length - n)); gEnsure(220); gSel(); guideInfoSoon(); return; }
    if (k === "right") {
      sp = selProg(); var t2 = sp.p.end, w0 = G.w0; if (sp.c.hls) t2 = G.w0 + winLen();
      G.t = t2 + 1; if (G.t >= G.w0 + winLen()) G.w0 += 1800; if (G.w0 > now() + 86400) G.w0 = Math.floor(now() / 1800) * 1800 + 86400;
      if (G.w0 !== w0) renderGuide(); else { gSel(); guideInfo(); } return;
    }
    if (k === "left") {
      sp = selProg(); var t1 = sp.p.start - 1, min = Math.floor(now() / 1800) * 1800, w0b = G.w0;
      if (sp.c.hls || t1 < min) { if (G.w0 > min) { G.w0 -= 1800; G.t = Math.max(now(), G.w0); } else { setFilterMenu(); return; } } else { G.t = Math.max(t1, now()); if (G.t < G.w0) G.w0 = Math.max(min, G.w0 - 1800); }
      if (G.w0 !== w0b) renderGuide(); else { gSel(); guideInfo(); } return;
    }
    if (k === "ok") { sp = selProg(); if (!sp) return; if (sp.c.hls || sp.p.start <= now() + 1) { tune(sp.c.idx); goLive(); } else { toast(hm(sp.p.start) + ": " + (V(sp.p.i).sh >= 0 ? SHOWS[V(sp.p.i).sh].n : V(sp.p.i).t) + " - not on yet. Press R to record it, or find it in ON DEMAND."); } return; }
    if (k === "rec") { sp = selProg(); if (sp) recDialog(sp.c, sp.p); return; }
    if (k === "back" || k === "guide") return goLive();
    if (k === "od") return openOD();
    if (k === "dvr") return openDVR();
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
    if (cell) { var r = +cell.dataset.r, t = +cell.dataset.t; if (r === G.row && cell.classList.contains("sel")) { return guideKey("ok"); } G.row = r; G.t = Math.max(t, now()); gSel(); guideInfo(); return; }
    if (ch) { G.row = +ch.dataset.r; G.t = now(); G.w0 = Math.floor(now() / 1800) * 1800; guideKey("ok"); }
  });
  $("#gfilter").addEventListener("click", function () { if (G.menu) { G.menu.el.remove(); G.menu = null; } else setFilterMenu(); });
  $(".g-foot").addEventListener("click", function (e) { var b = e.target.closest("[data-g]"); if (!b) return; var a = b.dataset.g;
    if (a === "live") goLive(); else if (a === "od") openOD(); else if (a === "rec") guideKey("rec"); else if (a === "later") { G.w0 += 1800; G.t = Math.max(G.t, G.w0); renderGuide(); } else if (a === "earlier") { var min = Math.floor(now() / 1800) * 1800; G.w0 = Math.max(min, G.w0 - 1800); G.t = Math.max(now(), G.w0); renderGuide(); } });

  // ---------- favorites + members ----------
  var SB = "https://cubbuiahnhgfpdeubldu.supabase.co", SBK = "sb_publishable_Sj8SNl5Zi0AwjxsIrNGNtQ_B--yHhYi", SKEY = "hvplus_session", PHONE_DOMAIN = "phone.blockbuster-plus.app";
  function session() { try { return JSON.parse(LS.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function uid() { var s = session(); return s && s.user ? s.user.id : "guest"; }
  function favs() { try { return JSON.parse(LS.getItem("cable_fav_" + uid()) || '{"ch":[],"sh":[]}'); } catch (e) { return { ch: [], sh: [] }; } }
  function setFavs(f) { LS.setItem("cable_fav_" + uid(), JSON.stringify(f)); }
  function toggleFav(kind, id) { var f = favs(), a = f[kind], k = a.indexOf(id); if (k >= 0) a.splice(k, 1); else a.push(id); setFavs(f); toast(k >= 0 ? "Removed from Favorites" : "Added to Favorites \u2605"); }
  function sbAuth(path, body) { return fetch(SB + "/auth/v1/" + path, { method: "POST", headers: { apikey: SBK, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); }
  function idToEmail(x) { x = (x || "").trim(); if (x.indexOf("@") > 0) return x.toLowerCase(); var dg = x.replace(/\D/g, ""); if (dg.length === 10) dg = "1" + dg; return dg.length >= 11 ? "p" + dg + "@" + PHONE_DOMAIN : x; }


  // ---------- DVR / RECORD (a 2006 Comcast-style DVR that is really a watchlist: "recorded" programs play from the start, on demand) ----------
  // Stored per account (signed-in member id, else "guest") in this device's localStorage: cable_dvr_<uid> = {r:[recordings], s:[series rules]}.
  //  r: {v: YouTube id, ch: channel id ("" = from ON DEMAND), st/en: airtime (unix s), add}   s: {key: "sh:<show>" | "v:<id>", name, add, del:[ids deleted]}
  var DV = { ver: 0, idx: null };
  function dvrKey() { return "cable_dvr_" + uid(); }
  function dvr() { try { var x = JSON.parse(LS.getItem(dvrKey()) || "null"); return x && x.r ? x : { r: [], s: [] }; } catch (e) { return { r: [], s: [] }; } }
  function dvrSave(x) { LS.setItem(dvrKey(), JSON.stringify(x)); DV.ver++; DV.idx = null; dvrRefresh(); }
  function serKey(i) { var v = VV[i]; return v[4] >= 0 ? "sh:" + SHOWS[v[4]].n : "v:" + v[0]; }
  function serName(i) { var v = VV[i]; return v[4] >= 0 ? SHOWS[v[4]].n : v[1]; }
  function dvrIdx() {
    if (DV.idx) return DV.idx; var x = dvr(), one = {}, ser = {}, vids = {};
    x.r.forEach(function (r) { if (r.ch) one[r.ch + ":" + r.st] = 1; vids[r.v] = 1; });
    x.s.forEach(function (s) { ser[s.key] = s; });
    return DV.idx = { one: one, ser: ser, vids: vids, x: x };
  }
  function recMark(c, p) { // red dot for a recorded airing, double dot for a series recording
    if (!p || p.live) return ""; var X = dvrIdx();
    if (X.one[c.id + ":" + p.start]) return '<i class="rd" title="Recording"></i>';
    if (X.ser[serKey(p.i)]) return '<i class="rd rs" title="Series recording"></i>';
    return "";
  }
  function recState(c, p) { var X = dvrIdx(); return { one: !!(c && p && !p.live && X.one[c.id + ":" + p.start]), ser: !!(p && !p.live && X.ser[serKey(p.i)]) }; }
  function addRec(c, p) { var x = dvr(); if (!x.r.some(function (r) { return r.ch === (c ? c.id : "") && r.v === VV[p.i][0] && r.st === p.start; })) x.r.push({ v: VV[p.i][0], ch: c ? c.id : "", st: Math.round(p.start), en: Math.round(p.end), add: Math.round(now()) }); dvrSave(x); }
  function delRec(c, p) { var x = dvr(); x.r = x.r.filter(function (r) { return !(r.ch === c.id && r.st === p.start); }); dvrSave(x); }
  function addSeries(i) { var x = dvr(), k = serKey(i); if (!x.s.some(function (s) { return s.key === k; })) x.s.push({ key: k, name: serName(i), add: Math.round(now()), del: [] }); dvrSave(x); }
  function delSeries(k) { var x = dvr(); x.s = x.s.filter(function (s) { return s.key !== k; }); dvrSave(x); }
  function dvrRefresh() {
    if (S.mode === "guide") renderGuide(); else if (S.mode === "od" && OD.stack.length) { var sc = cur(), keep = OD.sel; if (sc.rebuild) { sc.items = sc.rebuild().items; }
      else sc.items = sc.items.map(function (it) { return it.vi != null ? vidItem(it.vi, it.ctx, it.opt) : it.showN != null && it.screen ? showItem(it.showN) : it; });
      OD.sel = keep; render(); }
    if (S.mode === "tv" && !$("#banner").hidden) showBanner(8000); recUI();
  }
  function recUI() { // light up the REC buttons when the program in front of you is being recorded
    var on = false;
    if (S.mode === "vod" && S.vod) on = !!dvrIdx().vids[S.vod.id];
    else if (CH[S.ch] && !CH[S.ch].hls && LIVE) { var p = at(CH[S.ch], now()), st = recState(CH[S.ch], p); on = st.one || st.ser; }
    $$('[data-r="rec"],[data-b="rec"],[data-v="rec"]').forEach(function (b) { b.classList.toggle("on", on); });
  }
  function recDialog(c, p) { // guide cell / banner / remote: the Comcast "Record" options box
    if (!c || c.hls || !p || p.live) { toast("Live network feeds can't be recorded - try a scheduled channel"); return; }
    var v = V(p.i), nm = v.sh >= 0 ? SHOWS[v.sh].n : v.t, st = recState(c, p), when = hm(p.start) + " - " + hm(p.end) + "  \u00b7  " + c.n + " " + c.call, btn = [];
    if (!st.one) btn.push({ l: "\u25cf Record this " + (v.ty === "M" ? "movie" : "episode"), f: function () { addRec(c, p); toast(p.start > now() ? "Scheduled to record \u25cf " + hm(p.start) : "Recording \u25cf " + nm); } });
    else btn.push({ l: "Cancel this recording", f: function () { delRec(c, p); toast("Recording cancelled"); } });
    if (!st.ser) btn.push({ l: "\u25cf\u25cf Record series" + (v.sh >= 0 ? " (all airings of " + nm + ")" : " (every airing)"), f: function () { addSeries(p.i); toast("Series recording set \u25cf\u25cf " + nm); } });
    else btn.push({ l: "Cancel series recording", f: function () { delSeries(serKey(p.i)); toast("Series recording cancelled"); } });
    btn.push({ l: "Cancel", f: function () {} });
    dialog("Record: " + (v.sh >= 0 ? nm + " - " + v.t : v.t), when, btn);
  }
  function recVodDialog(i) { // ON DEMAND item: "record" = keep it in My DVR
    var v = V(i), X = dvrIdx(), has = !!X.vids[v.id], k = serKey(i), ser = !!X.ser[k], btn = [];
    btn.push(has ? { l: "Delete from My DVR", f: function () { var x = dvr(); x.r = x.r.filter(function (r) { return r.v !== v.id; }); dvrSave(x); toast("Deleted from My DVR"); } }
                 : { l: "\u25cf Record to My DVR", f: function () { addRec(null, { i: i, start: now(), end: now() + v.d }); toast("Recorded \u25cf " + (v.sh >= 0 ? SHOWS[v.sh].n + ": " : "") + v.t); } });
    if (v.sh >= 0) btn.push(ser ? { l: "Cancel series recording", f: function () { delSeries(k); toast("Series recording cancelled"); } } : { l: "\u25cf\u25cf Record series (" + SHOWS[v.sh].n + ")", f: function () { addSeries(i); toast("Series recording set \u25cf\u25cf"); } });
    btn.push({ l: "Cancel", f: function () {} });
    dialog("Record: " + vtitle(v), mins(v.d) + "  \u00b7  " + SRC[v.src][1], btn);
  }
  // expand series rules into airings: recorded since the rule was set (max 7 days back), scheduled for the next 24 h
  function seriesAirings(rule, t0, t1, cap) {
    var out = [], seen = {}, isSh = rule.key.slice(0, 3) === "sh:", nm = rule.key.slice(isSh ? 3 : 2), del = rule.del || [];
    CH.forEach(function (c) {
      if (!c.seq) return; var p = at(c, t0), n = 0;
      while (p.start < t1 && n++ < 1200 && out.length < cap) {
        var v = VV[p.i], ok = isSh ? v[4] >= 0 && SHOWS[v[4]].n === nm : v[0] === nm;
        if (ok && p.end > t0 && !seen[v[0] + (t1 > now() ? ":" + p.start : "")] && del.indexOf(v[0]) < 0) { seen[v[0] + (t1 > now() ? ":" + p.start : "")] = 1; out.push({ c: c, p: p, ser: rule.key }); }
        p = nextOf(c, p);
      }
    });
    return out;
  }
  function dvrEntries() {
    var x = dvr(), t = now(), rec = [], sch = [], seenV = {};
    x.r.forEach(function (r) { var i = VIDX[r.v]; if (i == null) return; var c = CH.filter(function (c) { return c.id === r.ch; })[0] || null;
      var e = { i: i, c: c, p: { i: i, start: r.st, end: r.en }, one: r }; if (r.st > t) sch.push(e); else { rec.push(e); seenV[r.v] = 1; } });
    x.s.forEach(function (rule) {
      seriesAirings(rule, Math.max(rule.add, t - 7 * 86400), t, 200).forEach(function (a) { if (seenV[VV[a.p.i][0]]) return; seenV[VV[a.p.i][0]] = 1; rec.push({ i: a.p.i, c: a.c, p: a.p, ser: rule }); });
      seriesAirings(rule, t, t + 86400, 30).forEach(function (a) { if (a.p.start > t) sch.push({ i: a.p.i, c: a.c, p: a.p, ser: rule }); });
    });
    rec.sort(function (a, b) { return b.p.start - a.p.start; }); sch.sort(function (a, b) { return a.p.start - b.p.start; });
    return { rec: rec, sch: sch, rules: x.s };
  }
  function dvrWhen(e) { var dt = new Date(e.p.start * 1000); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()] + " " + (dt.getMonth() + 1) + "/" + dt.getDate() + " " + hm(e.p.start); }
  function dvrItem(e, ctx) {
    var v = V(e.i), t = now(), status = e.p.start > t ? "Scheduled" : e.p.end > t && e.c ? "\u25cf Recording now" : "Recorded";
    var lab = (v.sh >= 0 ? (v.s ? "S" + v.s + (v.e ? " E" + v.e : "") + " - " : "") + v.t : v.t);
    var info = "<h3>" + esc(v.sh >= 0 ? SHOWS[v.sh].n : v.t) + "</h3>" + (v.sh >= 0 ? '<div class="m">' + esc(lab) + "</div>" : "") +
      '<div><span class="k">Status:</span> <b class="' + (status === "Scheduled" ? "sch" : "rcd") + '">' + status + "</b>" + (e.ser ? " (series)" : "") + "</div>" +
      (e.c ? '<div><span class="k">' + (status === "Scheduled" ? "Airs" : "Aired") + ":</span> " + dvrWhen(e) + " on " + e.c.n + " " + esc(e.c.name) + "</div>" : '<div><span class="k">From:</span> ON DEMAND</div>') +
      '<div><span class="k">Length:</span> ' + mins(v.d) + '</div><p>' + (status === "Scheduled" ? "Becomes playable at airtime." : "OK: play from the start, or delete.") + "</p>";
    return { label: (e.p.start > t ? "\u25f7 " : "") + (ctx === "flat" && v.sh >= 0 ? SHOWS[v.sh].n + ": " : "") + lab, count: e.c ? dvrWhen(e) : mins(v.d), art: thumb(v.id), ic: '<i class="rd' + (e.ser ? " rs" : "") + (e.p.start > t ? " sch" : "") + '"></i>', info: info,
      go: function () { dvrAct(e); } };
  }
  function dvrAct(e) {
    var v = V(e.i), t = now(), del = function () {
      if (e.one) { var x = dvr(); x.r = x.r.filter(function (r) { return !(r.v === e.one.v && r.st === e.one.st && r.ch === e.one.ch); }); dvrSave(x); }
      else if (e.ser) { var y = dvr(); y.s.forEach(function (s) { if (s.key === e.ser.key) (s.del = s.del || []).push(v.id); }); dvrSave(y); }
      toast("Deleted"); };
    if (e.p.start > t) return dialog("Scheduled: " + vtitle(v), dvrWhen(e) + (e.c ? " on " + e.c.n + " " + e.c.call : ""), [{ l: "Cancel this recording", f: del }, { l: "Keep", f: function () {} }]);
    dialog(vtitle(v), "Recorded " + (e.c ? dvrWhen(e) + " \u00b7 " + e.c.call : "from ON DEMAND"), [{ l: "\u25b6 Play from start", f: function () { var ctx = dvrEntries().rec.map(function (x) { return x.i; }); playVod(e.i, ctx); } }, { l: "Delete recording", f: del }, { l: "Cancel", f: function () {} }]);
  }
  function dvrScreen() {
    var E = dvrEntries(), items = [], groups = {}, order = [];
    items.push({ hd: 1, label: "Recorded (" + E.rec.length + ")" });
    E.rec.forEach(function (e) { var g = VV[e.i][4] >= 0 ? SHOWS[VV[e.i][4]].n : "\u00a7" + e.i; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(e); });
    order.forEach(function (g) {
      var l = groups[g]; if (l.length === 1) { items.push(dvrItem(l[0], "flat")); return; }
      items.push({ label: g, count: l.length + " recorded", ic: "&#9632;", art: thumb(VV[l[0].i][0]), info: "<h3>" + esc(g) + "</h3><p>" + l.length + " recordings. OK to open.</p>",
        screen: function () { var sc = { title: g, rebuild: function () { var ll = dvrEntries().rec.filter(function (e) { return VV[e.i][4] >= 0 && SHOWS[VV[e.i][4]].n === g; }); return { items: ll.length ? ll.map(function (e) { return dvrItem(e); }) : [{ hd: 1, label: "No recordings left" }] }; } }; sc.items = sc.rebuild().items; return sc; } });
    });
    if (!E.rec.length) items.push({ hd: 1, label: "Nothing recorded yet - press R or \u25cf REC on a program in the Guide, the info banner or ON DEMAND." });
    items.push({ hd: 1, label: "Scheduled (" + E.sch.length + ")" });
    E.sch.slice(0, 40).forEach(function (e) { items.push(dvrItem(e, "flat")); });
    items.push({ hd: 1, label: "Series Recordings (" + E.rules.length + ")" });
    E.rules.forEach(function (rule) { var n = E.rec.filter(function (e) { return e.ser && e.ser.key === rule.key; }).length;
      items.push({ label: "\u25cf\u25cf " + rule.name, count: n + " recorded", ic: "", info: "<h3>Series: " + esc(rule.name) + '</h3><div class="m">Records every airing on every channel</div><p>Set ' + dvrWhen({ p: { start: rule.add } }) + ". OK to manage.</p>",
        go: function () { dialog("Series: " + rule.name, n + " recorded", [{ l: "Cancel series recording", f: function () { delSeries(rule.key); toast("Series recording cancelled"); } }, { l: "Keep", f: function () {} }]); } }); });
    return { title: "My DVR", items: items };
  }
  function openDVR() { var sc = dvrScreen(); sc.rebuild = function () { return dvrScreen(); }; setMode("od"); OD.stack = []; push(mainMenu()); push(sc); }

  // ---------- action dialog (record options etc.): keys, remote and touch ----------
  var DLG = null;
  function dialog(title, sub, btns) {
    var el = $("#dlg"); $(".dlg-t", el).textContent = title; $(".dlg-s", el).textContent = sub || "";
    $(".dlg-b", el).innerHTML = btns.map(function (b, n) { return '<button type="button" class="fbtn' + (n === 0 ? " focus" : "") + '" data-n="' + n + '">' + esc(b.l) + "</button>"; }).join("");
    DLG = { b: btns, k: 0 }; el.hidden = false;
  }
  function dlgClose() { $("#dlg").hidden = true; DLG = null; }
  function dlgKey(k) {
    var bs = $$("#dlg .dlg-b button");
    if (k === "up" || k === "left") DLG.k = (DLG.k - 1 + bs.length) % bs.length;
    else if (k === "down" || k === "right") DLG.k = (DLG.k + 1) % bs.length;
    else if (k === "ok") { var f = DLG.b[DLG.k].f; dlgClose(); f(); return; }
    else if (k === "back" || k === "rec") { dlgClose(); return; }
    bs.forEach(function (b, n) { b.classList.toggle("focus", n === DLG.k); });
  }
  $("#dlg").addEventListener("click", function (e) { var b = e.target.closest("button[data-n]"); if (b && DLG) { DLG.k = +b.dataset.n; dlgKey("ok"); } else if (e.target.id === "dlg") dlgClose(); });

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
    if (it.netlogo) art.innerHTML = '<span class="art-bug">' + imgLogo(it.netlogo, "") + "</span>";
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
    if (k === "rec") return odRec();
    if (k === "od") { OD.stack = []; push(mainMenu()); }
  }
  function activate(it) { if (it.screen) push(typeof it.screen === "function" ? it.screen() : it.screen); else if (it.go) it.go(); }
  $("#odlist").addEventListener("click", function (e) { var b = e.target.closest(".od-item[data-n]"); if (!b) return; var n = +b.dataset.n; if (n === OD.sel || matchMedia("(pointer:coarse)").matches) { OD.sel = n; highlight(); activate(cur().items[n]); } else { OD.sel = n; highlight(); } });
  $(".od-foot").addEventListener("click", function (e) { var b = e.target.closest("[data-o]"); if (!b) return; var a = b.dataset.o; if (a === "back") pop(); else if (a === "live") goLive(); else if (a === "dvr") openDVR(); else openGuide(); });
  $("#odside").addEventListener("click", function (e) { var b = e.target.closest("[data-rec]"); if (b) recVodDialog(+b.dataset.rec); });
  function odRec() { var it = cur().items[OD.sel]; if (!it || it.hd) return;
    if (it.vi != null) return recVodDialog(it.vi);
    if (it.showN != null) { var s = SHOWS[it.showN], on = !!dvrIdx().ser["sh:" + s.n]; return dialog("Series: " + s.n, s.vids.length + " episodes ON DEMAND", [on ? { l: "Cancel series recording", f: function () { delSeries("sh:" + s.n); toast("Series recording cancelled"); } } : { l: "\u25cf\u25cf Record series", f: function () { addSeries(s.vids[0]); toast("Series recording set \u25cf\u25cf " + s.n); } }, { l: "Cancel", f: function () {} }]); }
    if (it.ch && !it.ch.hls) return recDialog(it.ch, at(it.ch, now()));
    toast("Pick a program, show or episode to record"); }

  // item builders
  function vidItem(i, ctx, opt) {
    var v = V(i), sh = v.sh >= 0 ? SHOWS[v.sh] : null; opt = opt || {};
    var lab = (opt.withShow && sh ? sh.n + ": " : "") + (v.s && !opt.noSE ? "S" + v.s + (v.e ? " E" + v.e : "") + " - " : v.e && !opt.noSE ? "Ep " + v.e + " - " : "") + v.t;
    var gs = v.g.map(function (g) { return GEN[g]; }).join(", "), cast = (v.cast.length ? v.cast : sh ? sh.cast.slice(0, 6) : []).map(function (p) { return esc(PEOPLE[p]); }).join(", ");
    return { label: lab, count: mins(v.d), art: thumb(v.id), ic: v.ty === "M" ? "&#9654;" : v.ty === "D" ? "&#9654;" : "&#9654;",
      info: "<h3>" + esc(v.t) + "</h3>" + (sh ? '<div class="m">' + esc(sh.n) + (v.s ? " \u00b7 Season " + v.s + (v.e ? ", Episode " + v.e : "") : "") + "</div>" : "") +
        '<div class="m">' + TYPEN[v.ty] + " \u00b7 " + mins(v.d) + (v.yr ? " \u00b7 " + v.yr : "") + " \u00b7 FREE</div>" +
        '<div><span class="k">Network:</span> ' + esc(SRC[v.src][1]) + '</div><div><span class="k">Genre:</span> ' + esc(gs) + "</div>" + (cast ? '<div><span class="k">' + (v.cast.length ? "Starring" : "Cast") + ":</span> " + cast + "</div>" : "") +
        (v.up ? '<div><span class="k">Added:</span> ' + v.up.slice(4, 6) + "/" + v.up.slice(6, 8) + "/" + v.up.slice(0, 4) + "</div>" : "") +
        "<p>Press OK to watch \u00b7 R to record.</p>" + '<p class="od-acts"><button type="button" class="fbtn rec' + (dvrIdx().vids[v.id] ? " on" : "") + '" data-rec="' + i + '">&#9679; ' + (dvrIdx().vids[v.id] ? "In My DVR" : "Record") + "</button></p>",
      vi: i, ctx: ctx, opt: opt, ic: dvrIdx().vids[v.id] ? '<i class="rd"></i>' : "&#9654;", go: function () { playVod(i, ctx); } };
  }
  function showItem(n) {
    var s = SHOWS[n], f = s.vids[0], chs = Object.keys(IX().chShow[n] || {}).map(function (k) { return CH[k]; });
    return { label: s.n, count: s.vids.length, art: s.img || (f != null ? thumb(VV[f][0]) : ""), ic: dvrIdx().ser["sh:" + s.n] ? '<i class="rd rs"></i>' : "&#9632;", showN: n, logo: srcLogo(s.k), screen: function () { return showScreen(n); },
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
    var serOn = !!dvrIdx().ser["sh:" + s.n];
    items.push({ label: serOn ? "Cancel Series Recording" : "\u25cf\u25cf Record Series", ic: serOn ? '<i class="rd rs"></i>' : "", art: base.art, showN: n, info: base.info + "<p>A series recording keeps every airing of " + esc(s.n) + " on any channel in My DVR.</p>",
      go: function () { if (serOn) delSeries("sh:" + s.n); else if (s.vids.length) addSeries(s.vids[0]); toast(serOn ? "Series recording cancelled" : "Series recording set \u25cf\u25cf " + s.n); OD.stack[OD.stack.length - 1] = showScreen(n); render(); } });
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
  function WWFK() { for (var n = 0; n < SRC.length; n++) if (SRC[n][0] === "WWF") return n; return -1; }
  function srcScreen(k) {
    var vids = IX().bySrc[k] || [], shs = {}, loose = [];
    vids.forEach(function (i) { var x = VV[i][4]; if (x >= 0) shs[x] = 1; else loose.push(i); });
    var items = [], chs = Object.keys(IX().chSrc[k] || {}).map(function (n) { return CH[n]; });
    if (chs.length) { items.push({ hd: 1, label: "On live TV" }); chs.forEach(function (c) { items.push({ label: c.n + " " + c.name, logo: logo(c), go: function () { tune(c.idx); goLive(); } }); }); }
    var sl = Object.keys(shs).map(Number).sort(function (a, b) { return SHOWS[b].vids.length - SHOWS[a].vids.length; });
    if (sl.length) { items.push({ hd: 1, label: "Shows" }); sl.forEach(function (n) { items.push(showItem(n)); }); }
    if (SRC[k][0] === "WWF") { // WWF Network: events + year facets (2026-11-19)
      var yrs = {}; vids.forEach(function (i) { var y = VV[i][8]; if (y) (yrs[y] = yrs[y] || []).push(i); });
      items.push({ hd: 1, label: "By year" });
      Object.keys(yrs).sort().forEach(function (y) { var l = yrs[y].slice().sort(function (a, b) { return (VV[a][9] || "").localeCompare(VV[b][9] || ""); }); items.push({ label: "WWF " + y, count: l.length, ic: "&#9658;", art: thumb(VV[l[0]][0]), screen: function () { return listScreen("WWF " + y, l); } }); });
      ["F", "W"].forEach(function (t) { var l = vids.filter(function (i) { return VV[i][7] === t; }); if (l.length) items.push({ label: TYPEP[t] || TYPEN[t] + "s", count: l.length, ic: "&#9658;", screen: function () { return listScreen("WWF " + (TYPEP[t] || TYPEN[t] + "s"), l); } }); });
    }
    if (loose.length) { items.push({ hd: 1, label: SRC[k][0] === "WWF" ? "More full matches & events" : "Movies, documentaries & specials" }); loose.slice(0, 400).forEach(function (i) { items.push(vidItem(i, loose)); }); }
    return { title: SRC[k][1], items: items, netlogo: srcLogoId(k) };
  }
  function deptScreen(dept) {
    var srcs = SRC.map(function (s, n) { return s[2] === dept ? n : -1; }).filter(function (n) { return n >= 0; });
    var shs = [], loose = [];
    srcs.forEach(function (k) { (IX().bySrc[k] || []).forEach(function (i) { var x = VV[i][4]; if (x >= 0) { if (shs.indexOf(x) < 0) shs.push(x); } else loose.push(i); }); });
    shs.sort(function (a, b) { return SHOWS[b].vids.length - SHOWS[a].vids.length; });
    var items = [{ hd: 1, label: "Networks" }];
    srcs.forEach(function (k) { var c = (IX().bySrc[k] || []).length; if (c) items.push({ label: SRC[k][1], count: c, ic: srcLogo(k) ? "" : "&#9658;", logo: srcLogo(k), screen: function () { return srcScreen(k); } }); });
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
  function typeScreen() { var bt = IX().byType; return { title: "Program Type", items: ["E", "M", "D", "S", "K", "F", "W"].filter(function (t) { return (bt[t] || []).length; }).map(function (t) { return { label: TYPEP[t] || TYPEN[t] + "s", count: bt[t].length, ic: "&#9658;", art: thumb(VV[bt[t][0]][0]), screen: function () { return listScreen(TYPEN[t] + "s (newest first)", bt[t], { withShow: true, max: 500 }); } }; }) }; }
  function networksScreen() { var bs = IX().bySrc; return { title: "Networks", items: SRC.map(function (s, k) { return k; }).filter(function (k) { return (bs[k] || []).length; }).sort(function (a, b) { return SRC[a][1].localeCompare(SRC[b][1]); }).map(function (k) { return { label: SRC[k][1], count: bs[k].length, ic: srcLogo(k) ? "" : "&#9658;", logo: srcLogo(k), art: thumb(VV[bs[k][0]][0]), netlogo: srcLogoId(k), info: (srcLogo(k) ? '<div class="od-netlogo">' + srcLogo(k) + "</div>" : "") + "<h3>" + esc(SRC[k][1]) + '</h3><div class="m">' + esc(SRC[k][2]) + " \u00b7 YouTube " + esc(SRC[k][4]) + "</div><p>" + bs[k].length + " free full-length programs.</p>", screen: function () { return srcScreen(k); } }; }) }; }
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
    return { label: c.n + "  " + c.name, logo: logo(c), biglogo: logo(c, 1), info: info, ch: c, go: function () { tune(c.idx); goLive(); } };
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
        { label: "My DVR / Recordings", ic: '<i class="rd"></i>', go: openDVR, info: "<h3>My DVR</h3><p>Your recordings, scheduled recordings and series recordings. Recorded programs play from the start, any time.</p>" },
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
      { label: "WWF Network", ic: "&#9733;", count: (IX().bySrc[WWFK()] || []).length, screen: function () { return srcScreen(WWFK()); }, info: "<h3>WWF Network</h3><p>1980s &amp; early-'90s WWF: WrestleMania I-IX, Royal Rumble, SummerSlam, Survivor Series, Saturday Night's Main Event, MSG and more. By event and by year.</p>" },
      { hd: 1, label: "Browse by" },
      { label: "Networks", ic: "&#9658;", screen: networksScreen }, { label: "TV Shows A-Z", ic: "&#9632;", count: SHOWS.length, screen: azScreen },
      { label: "Actors & Actresses", ic: "&#9679;", screen: peopleScreen }, { label: "Genres", ic: "&#9658;", screen: genresScreen },
      { label: "Decades", ic: "&#9658;", screen: decadeScreen }, { label: "Program Type", ic: "&#9658;", screen: typeScreen },
      { label: "Live Channels by Genre", ic: "&#9632;", screen: liveByGenreScreen },
      { label: "Search", ic: "&#9658;", screen: function () { return searchScreen(""); } },
      { hd: 1, label: "Me" },
      { label: "My DVR / Recordings", ic: '<i class="rd"></i>', go: openDVR, info: "<h3>My DVR</h3><p>Your recordings, scheduled recordings and series recordings. Recorded programs play from the start, any time.</p>" },
      { label: "My Favorites", ic: "&#9733;", screen: favScreen },
      { label: s && s.user ? "My Account" : "Sign In / Create Account", ic: "&#9679;", screen: accountScreen },
      { label: "Get the App / Watch on TV", ic: "&#9632;", go: function () { location.href = "tv.html"; }, info: "<h3>Get the App</h3><p>Cable on Fire TV, Google TV, Android TV, phones, tablets, iPhone and iPad. Fire TV / Google TV: Downloader code <b>4793854</b>.</p>" },
      { label: "DONATE \u00b7 Support us on Cash App", ic: "$", go: function () { if (W.HKDonate) W.HKDonate.go(); else W.open("https://cash.app/$WrestleWorldPlus", "_blank", "noopener"); }, info: "<h3>DONATE</h3><p>Support us on Cash App: <b>$WrestleWorldPlus</b> (cash.app/$WrestleWorldPlus).</p><p>" + (IS_TV ? "Press OK for a QR code to scan with your phone." : "Opens Cash App in a new tab.") + "</p>" }
    ];
    return { title: "Main Menu", items: it };
  }

  // ---------- VOD ----------
  function playVod(i, ctx) {
    S.vod = { i: i, id: VV[i][0], ctx: ctx || [i] }; killHls(); setMode("vod"); S.playing = VV[i][0];
    var nb = vodNet(i); setBug(nb.id, nb.txt); $("#bug").dataset.own = ""; recUI();
    ytLoad(VV[i][0], 0, { vod: true, keep: false }); vodBar();
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
    if (a === "cc") { toggleCC(); return vodBar(); }
    if (a === "rec") return S.vod && recVodDialog(S.vod.i);
    if (a === "next") return vodNext();
    if (a === "back") { S.vod = null; ytStop(); return openOD(); }
    if (!ytReady) return; try {
      if (a === "pp") { if (YTP.getPlayerState() === 1) YTP.pauseVideo(); else YTP.playVideo(); }
      if (a === "rw") YTP.seekTo(Math.max(0, YTP.getCurrentTime() - 30), true);
      if (a === "ff") YTP.seekTo(YTP.getCurrentTime() + 30, true);
      if (a === "next") return vodNext();
      if (a === "cc") toggleCC();
      if (a === "rec") return recVodDialog(S.vod.i);
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
    if (k === "rec") return recVodDialog(S.vod.i);
    if (k === "pp") return vodAct("pp");
  }

  // ---------- input ----------
  var num = "", numT = null;
  function numKey(dg) {
    num = (num + dg).slice(-3); var e = $("#numentry"); e.textContent = num + "-"; e.hidden = false;
    clearTimeout(numT); numT = setTimeout(function () { var n = +num; num = ""; e.hidden = true; var c = CH.filter(function (c) { return c.n === n; })[0]; if (c) { if (S.mode !== "tv") setMode("tv"); tune(c.idx); } else toast("Channel " + n + " is not available"); }, 1600);
  }
  function key(k) {
    if (!S.started) {   // power-on screen: OK = watch TV; Down/Right moves to DONATE, Up/Left back to the OK button (2026-11-19)
      var pd = $("#pwdonate"), pb = $("#pwbtn");
      if (pd && (k === "down" || k === "right")) { pd.classList.add("focus"); pb.classList.remove("focus"); try { pd.focus(); } catch (e) {} return; }
      if (pd && (k === "up" || k === "left")) { pd.classList.remove("focus"); if (IS_TV) pb.classList.add("focus"); try { pb.focus(); } catch (e) {} return; }
      if (k === "ok" && pd && (d.activeElement === pd || pd.classList.contains("focus"))) { if (W.HKDonate) W.HKDonate.go(pd); else W.open(pd.href, "_blank", "noopener"); return; }
      if (k === "ok") powerOn(); return;
    }
    LOG.push(["key", k, S.mode, Date.now()]);
    if (DLG) return dlgKey(k);
    if (k === "cc") return toggleCC();
    if (k === "fs") return toggleFS();
    if (k === "dvr" && S.mode !== "vod") return openDVR();
    if (k === "dvr") { S.vod = null; ytStop(); return openDVR(); }
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
    if (k === "rec") { var c = CH[S.ch]; return recDialog(c, c.hls ? null : S.override && S.override.ch === S.ch ? S.override : at(c, now())); }
    if (k === "back") { if (!$("#banner").hidden) { $("#banner").hidden = true; return; } return tune(S.last); }
  }
  function toggleFS() {
    var de = d.documentElement, fe = d.fullscreenElement || d.webkitFullscreenElement;
    try { if (fe) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else (de.requestFullscreen || de.webkitRequestFullscreen).call(de); } catch (e) { toast("Full screen isn't available here"); }
  }
  ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) { d.addEventListener(ev, function () { place(); refocus(); }); });
  var KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", " ": "ok", Escape: "back", Backspace: "back", BrowserBack: "back", GoBack: "back",
    PageUp: "pgup", PageDown: "pgdn", ChannelUp: "chup", ChannelDown: "chdn", MediaTrackNext: "chup", MediaTrackPrevious: "chdn", g: "guide", G: "guide", ContextMenu: "guide", Guide: "guide",
    d: "od", D: "od", i: "info", I: "info", Info: "info", l: "last", L: "last", "+": "chup", "-": "chdn", "=": "chup", MediaPlayPause: "pp",
    r: "rec", R: "rec", MediaRecord: "rec", v: "dvr", V: "dvr", c: "cc", C: "cc", Subtitle: "cc", ClosedCaptionToggle: "cc", f: "fs", F: "fs",
    MediaFastForward: "ff", MediaRewind: "rw", FastFwd: "ff", Rewind: "rw", ColorF0Red: "rec", ColorF1Green: "cc", ColorF2Yellow: "dvr", ColorF3Blue: "od", DVR: "dvr", MediaLast: "last", MediaPlay: "pp", MediaPause: "pp" };
  d.addEventListener("keydown", function (e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && !/Escape|ArrowUp|ArrowDown/.test(e.key)) return;
    if (/^[0-9]$/.test(e.key) && S.started && S.mode !== "od") { e.preventDefault(); return numKey(e.key); }
    var k = KEYMAP[e.key] || (e.keyCode === 4 || e.keyCode === 461 || e.keyCode === 10009 ? "back" : e.keyCode === 427 ? "chup" : e.keyCode === 428 ? "chdn" : e.keyCode === 457 ? "info" : e.keyCode === 416 ? "rec" : e.keyCode === 460 ? "cc" : e.keyCode === 403 ? "rec" : e.keyCode === 404 ? "cc" : e.keyCode === 405 ? "dvr" : e.keyCode === 406 ? "od" : e.keyCode === 417 ? "ff" : e.keyCode === 412 ? "rw" : e.keyCode === 415 || e.keyCode === 19 ? "pp" : null);
    if (!k) return;
    // FF / RW: +/-30 s in ON DEMAND playback, otherwise channel up/down (guide/menus: page) - for remotes with no CH buttons (Fire TV, Google TV)
    if (k === "ff" || k === "rw") { if (S.mode === "vod" && !DLG) { e.preventDefault(); e.stopPropagation(); vodAct(k); return; } k = k === "ff" ? "chup" : "chdn"; }
    if (S.mode === "guide" && (k === "chup" || k === "chdn")) k = k === "chup" ? "pgup" : "pgdn";
    if (S.mode === "od" && (k === "chup" || k === "chdn")) k = k === "chup" ? "pgup" : "pgdn";
    if (k === "pp") { e.preventDefault(); if (S.mode === "vod" && !DLG) vodAct("pp"); return; }
    e.preventDefault(); e.stopPropagation(); key(k);
  }, true);
  $("#tap").addEventListener("click", function () { if (!S.started) return powerOn(); if (S.mode === "vod") return vodBar(); if (S.mode === "tv") { unmute(); showBanner(); showRemote(); } else if (S.mode === "guide") goLive(); else if (S.mode === "od") goLive(); });
  $("#remote").addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (!b) return; unmute(); var r = b.dataset.r; showRemote(); LOG.push(["remote", r, Date.now()]);
    if (r === "up") chUp(1); else if (r === "down") chUp(-1); else if (r === "guide") openGuide(); else if (r === "od") openOD(); else if (r === "info") showBanner(8000);
    else if (r === "last") tune(S.last); else if (r === "rec") key("rec"); else if (r === "dvr") openDVR(); else if (r === "cc") toggleCC(); else if (r === "fs") toggleFS(); });
  $("#banner").addEventListener("click", function (e) { var b = e.target.closest("[data-b]"); if (!b) return; e.stopPropagation(); if (b.dataset.b === "cc") toggleCC(); else key("rec"); showBanner(8000); });
  // a pressed on-screen button must not keep focus (Enter/OK would re-press it instead of reaching the remote handler)
  d.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button"); if (b && !b.closest(".od-form") && !b.closest(".od-search")) setTimeout(function () { try { b.blur(); } catch (x) {} }, 0); });
  if (!d.documentElement.requestFullscreen && !d.documentElement.webkitRequestFullscreen) $$('[data-r="fs"]').forEach(function (b) { b.hidden = true; });
  function unmute() { S.soundOK = true; S.gesture = true; LS.setItem("cable_sound", "1"); try { if (ytReady) { YTP.unMute(); YTP.setVolume(100); if (YTP.getPlayerState() === 2) YTP.playVideo(); } } catch (e) {} var v = $("#hls"); if (!v.hidden) { v.muted = false; v.play().catch(function () {}); } $("#unmute").hidden = true; }
  // the first touch / click / key anywhere counts as the gesture that turns sound on (remembered per device)
  ["pointerdown", "keydown", "touchend"].forEach(function (ev) { d.addEventListener(ev, function () { S.gesture = true; if (S.started && !$("#unmute").hidden) setTimeout(unmute, 0); }, true); });
  $("#unmute").addEventListener("click", function (e) { e.stopPropagation(); unmute(); });

  function powerOn() {
    if (W.CABLE_GATE && W.CABLE_GATE.locked) return; // launch gate (gate.js): nothing plays before launch
    if (S.started || !CH.length) return; S.started = true; S.soundOK = true; $("#power").hidden = true;
    var last = +LS.getItem("cable_ch"), c = CH.filter(function (c) { return c.n === last; })[0] || CH[0];
    setMode("tv"); tune(c.idx); showBanner(6000);
  }
  $("#pwbtn").addEventListener("click", powerOn);
  setInterval(function () { if (S.mode === "guide") { $(".g-clock").textContent = clock(); if (now() >= G.w0 + 1800 && Math.floor(now() / 1800) * 1800 > G.w0) { G.w0 = Math.floor(now() / 1800) * 1800; G.t = Math.max(G.t, now()); renderGuide(); } } else if (S.mode === "od") $(".od-clock").textContent = clock(); else if (!$("#banner").hidden) $(".bn-clock").textContent = clock(); }, 30000);

  // ---------- boot ----------
  loadYT();
  var qv = (d.querySelector('script[src^="app.js"]') || {}).src || ""; qv = (qv.split("?")[1] || "");
  Promise.all([fetch("catalog.json" + (location.search.indexOf("nocache") >= 0 ? "?" + Date.now() : "")).then(function (r) { return r.json(); }), fetch("live.json?" + Math.floor(Date.now() / 3600000)).then(function (r) { return r.json(); })]).then(function (a) {
    CAT = a[0]; LIVE = a[1]; prep();
    $(".pw-load").textContent = CH.length + " channels \u00b7 " + VV.length.toLocaleString() + " free programs ON DEMAND";
    var b = $("#pwbtn"); b.disabled = false; if (IS_TV) b.classList.add("focus"); try { b.focus(); } catch (e) {}
    ccUI(); recUI();
    W.CABLE = { S: S, CH: CH, at: at, tune: tune, key: key, V: V, openOD: openOD, openGuide: openGuide, openDVR: openDVR, dvr: dvr, dvrEntries: dvrEntries, G: G, dlg: function () { return DLG; }, nextOf: nextOf, VIDX: VIDX, YTP: function () { return YTP; }, job: function () { return job; }, search: searchItems, push: push, screens: { srcScreen: srcScreen, WWFK: WWFK, typeScreen2: typeScreen, peopleScreen: peopleScreen, genresScreen: genresScreen, decadeScreen: decadeScreen, typeScreen: typeScreen, networksScreen: networksScreen, azScreen: azScreen, searchScreen: searchScreen } };
    W.addEventListener("cable-unlock", function () { try { if (!S.started) $("#pwbtn").focus(); } catch (e) {} });
    if (/[?&]autostart=1/.test(location.search)) { if (W.CABLE_GATE && W.CABLE_GATE.locked) W.addEventListener("cable-unlock", function () { powerOn(); }); else powerOn(); }
  }).catch(function (e) { $(".pw-load").textContent = "Couldn't load the lineup - check your connection."; });
})();

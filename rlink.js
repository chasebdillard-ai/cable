/* Cable Remote link (2026-11-21): the shared transport for the phone remote (remote/) and the TV side (remote-tv.js).
   No accounts, no keys in this file. A TV makes a random 128-bit secret K when it is first paired; everything is derived from it:
     - MQTT topics  cable-rc/<H("mqtt:"+K)>/c (commands) and /s (TV state)  on two free public brokers at once (HiveMQ + EMQX, Mosquitto as a spare),
     - ntfy topics  cbl<H("ntfy:"+K)>c / s  on ntfy.sh (fallback relay; the Roku app listens here),
     - every message carries an HMAC-SHA256(K) tag, so anyone who sees a public MQTT topic still can't send commands (they don't have K).
   Pairing by code: the TV listens on ntfy topic cable-pair-<CODE> while its pairing screen is open; the phone posts {t:"pair"} there and the TV answers
   with K (ntfy cache=no, so the answer is never stored on the server). Pairing by QR: the QR holds K in the URL fragment (never sent to a server).
   Plain ES5 (old TV WebViews). Exposes window.CableLink. */
(function (W) {
  "use strict";
  // ---------- SHA-256 / HMAC (sync, small; avoids crypto.subtle so it also works on http:// and old WebViews) ----------
  var KK = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(s) { var o = [], i, c; s = unescape(encodeURIComponent(String(s))); for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); o.push(c); } return o; }
  function sha256(bytes) { // bytes: array of 0..255 -> array of 32 bytes
    var m = bytes.slice(), l = m.length * 8, i, j, H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array(64);
    m.push(0x80); while (m.length % 64 !== 56) m.push(0);
    for (i = 7; i >= 0; i--) m.push(i >= 4 ? 0 : (l >>> (i * 8)) & 255);
    for (i = 0; i < m.length; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (m[i + j * 4] << 24) | (m[i + j * 4 + 1] << 16) | (m[i + j * 4 + 2] << 8) | m[i + j * 4 + 3];
      for (j = 16; j < 64; j++) {
        var x = w[j - 15], y = w[j - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3), s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + KK[j] + w[j]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = []; for (i = 0; i < 8; i++) out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255); return out;
  }
  function hex(b) { var s = "", i; for (i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16); return s; }
  function hmac(key, msg) { var k = utf8(key), i, ip = [], op = []; if (k.length > 64) k = sha256(k); while (k.length < 64) k.push(0);
    for (i = 0; i < 64; i++) { ip.push(k[i] ^ 0x36); op.push(k[i] ^ 0x5c); } return hex(sha256(op.concat(sha256(ip.concat(utf8(msg)))))); }
  function H(s) { return hex(sha256(utf8(s))); }
  function rnd(n, abc) { abc = abc || "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"; var o = "", a = new Uint8Array(n), i;
    (W.crypto || W.msCrypto).getRandomValues(a); for (i = 0; i < n; i++) o += abc.charAt(a[i] % abc.length); return o; }
  var CODEABC = "ACDEFGHJKMNPQRTUVWXY34679"; // 25 symbols, no 0/O/1/I/L/B/8/S/5/Z/2 look-alikes; 25^6 = 244M codes

  // ---------- MQTT 3.1.1 over WebSocket (QoS 0 only: CONNECT, SUBSCRIBE, PUBLISH, PING) ----------
  var BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081/mqtt"];
  function u8(arr) { return new Uint8Array(arr); }
  function mstr(s) { var b = utf8(s); return [b.length >> 8, b.length & 255].concat(b); }
  function mlen(n) { var o = []; do { var x = n % 128; n = Math.floor(n / 128); o.push(n > 0 ? x | 128 : x); } while (n > 0); return o; }
  function pkt(type, body) { return u8([type].concat(mlen(body.length), body)); }
  function dec(bytes) { try { return decodeURIComponent(escape(String.fromCharCode.apply(null, bytes))); } catch (e) { var s = "", i; for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; } }
  function Mqtt(url, topics, onMsg, onState) {
    var me = this; me.url = url; me.topics = topics; me.onMsg = onMsg; me.onState = onState || function () {}; me.ok = false; me.dead = false; me.fails = 0; me.open();
  }
  Mqtt.prototype.open = function () {
    var me = this; if (me.dead) return;
    var ws; try { ws = new WebSocket(me.url, ["mqtt"]); } catch (e) { return me.retry(); }
    me.ws = ws; ws.binaryType = "arraybuffer"; me.buf = [];
    var to = setTimeout(function () { try { ws.close(); } catch (e) {} }, 10000);
    ws.onopen = function () {
      var vh = mstr("MQTT").concat([4, 2, 0, 60], mstr("cbl-" + rnd(14, "abcdefghijklmnopqrstuvwxyz0123456789")));
      ws.send(pkt(0x10, vh));
    };
    ws.onmessage = function (ev) {
      var b = new Uint8Array(ev.data), i; for (i = 0; i < b.length; i++) me.buf.push(b[i]);
      while (me.buf.length >= 2) {
        var mul = 1, len = 0, p = 1, c;
        do { if (p >= me.buf.length) return; c = me.buf[p++]; len += (c & 127) * mul; mul *= 128; } while (c & 128);
        if (me.buf.length < p + len) return;
        var t = me.buf[0] >> 4, body = me.buf.slice(p, p + len); me.buf = me.buf.slice(p + len);
        if (t === 2) { // CONNACK
          clearTimeout(to);
          if (body[1] !== 0) { try { ws.close(); } catch (e) {} return; }
          var sb = [0, 1]; me.topics.forEach(function (tp) { sb = sb.concat(mstr(tp), [0]); }); ws.send(pkt(0x82, sb));
        } else if (t === 9) { me.ok = true; me.fails = 0; me.onState(true); clearInterval(me.ping); me.ping = setInterval(function () { try { ws.send(u8([0xc0, 0])); } catch (e) {} }, 30000); }
        else if (t === 3) { var tl = (body[0] << 8) | body[1], topic = dec(body.slice(2, 2 + tl)), q = 2 + tl; me.onMsg(dec(body.slice(q)), topic); }
      }
    };
    ws.onclose = ws.onerror = function () { clearTimeout(to); clearInterval(me.ping); if (me.ws !== ws) return; me.ws = null; var was = me.ok; me.ok = false; if (was) me.onState(false); me.retry(); };
  };
  Mqtt.prototype.retry = function () { var me = this; if (me.dead) return; me.fails++; clearTimeout(me.rt); me.rt = setTimeout(function () { me.open(); }, Math.min(30000, 1000 * Math.pow(2, Math.min(me.fails, 5))) + Math.random() * 500); };
  Mqtt.prototype.pub = function (topic, s) { if (!this.ok || !this.ws) return false; try { this.ws.send(pkt(0x30, mstr(topic).concat(utf8(s)))); return true; } catch (e) { return false; } };
  Mqtt.prototype.close = function () { this.dead = true; clearTimeout(this.rt); clearInterval(this.ping); var ws = this.ws; this.ws = null; this.ok = false; if (ws) try { ws.close(); } catch (e) {} };

  // ---------- ntfy.sh (SSE subscribe, POST publish) ----------
  var NTFY = "https://ntfy.sh/";
  function Ntfy(topic, onMsg, onState, opts) { this.topic = topic; this.onMsg = onMsg; this.onState = onState || function () {}; this.ok = false; this.dead = false; this.fails = 0; this.last = null; this.srvOff = 0; this.opts = opts || {}; this.open(); }
  Ntfy.prototype.open = function () {
    var me = this; if (me.dead) return;
    if (!W.EventSource) return;
    var u = NTFY + me.topic + "/sse" + (me.last ? "?since=" + me.last : "");
    var es; try { es = new EventSource(u); } catch (e) { return me.retry(); }
    me.es = es; me.seen = Date.now();
    es.onmessage = function (ev) {
      me.seen = Date.now(); var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.time) me.srvOff = m.time * 1000 - Date.now();
      if (m.event === "open") { if (!me.ok) { me.ok = true; me.fails = 0; me.onState(true); } return; }
      if (m.event !== "message") return;
      me.last = m.id;
      // stale: anything the server stored more than 20 s before now (a reconnect replays since the last id) is dropped
      if (m.time && m.time * 1000 < Date.now() + me.srvOff - 20000) return;
      me.onMsg(m.message || "", me.topic);
    };
    // ntfy sends "event: open" / "event: keepalive" as NAMED events (onmessage only sees the messages); the native open event has the same type
    var up = function (ev) { me.seen = Date.now(); try { var j = ev && ev.data ? JSON.parse(ev.data) : null; if (j && j.time) me.srvOff = j.time * 1000 - Date.now(); } catch (e) {} if (!me.ok) { me.ok = true; me.fails = 0; me.onState(true); } };
    es.addEventListener("open", up); es.addEventListener("keepalive", up);
    es.onerror = function () { if (me.es !== es) return; try { es.close(); } catch (e) {} me.es = null; var was = me.ok; me.ok = false; if (was) me.onState(false); me.retry(); };
    clearInterval(me.wd); me.wd = setInterval(function () { if (me.es === es && Date.now() - me.seen > 100000) { es.onerror(); } }, 20000); // ntfy keepalive is every 45 s
  };
  Ntfy.prototype.retry = function () { var me = this; if (me.dead) return; me.fails++; clearTimeout(me.rt); me.rt = setTimeout(function () { me.open(); }, Math.min(60000, 1500 * Math.pow(2, Math.min(me.fails, 5))) + Math.random() * 800); };
  Ntfy.prototype.close = function () { this.dead = true; clearTimeout(this.rt); clearInterval(this.wd); var es = this.es; this.es = null; this.ok = false; if (es) try { es.close(); } catch (e) {} };
  function ntfyPost(topic, body, nocache) { // text/plain body, no custom headers -> no CORS preflight
    return fetch(NTFY + topic + (nocache ? "?cache=no" : ""), { method: "POST", body: body, mode: "cors", credentials: "omit" }).then(function (r) { if (r.status === 429) throw new Error("limit"); if (!r.ok) throw new Error("http " + r.status); return r; });
  }

  // ---------- a paired link: both relays, signed messages ----------
  function topics(K) { var m = H("mqtt:" + K).slice(0, 32), n = H("ntfy:" + K).slice(0, 32); return { mc: "cable-rc/" + m + "/c", ms: "cable-rc/" + m + "/s", nc: "cbl" + n + "c", ns: "cbl" + n + "s" }; }
  function sign(K, o) { return hmac(K, o.f + "|" + o.s + "|" + o.ts + "|" + JSON.stringify(o.d)); }
  /* Link(K, role "tv"|"phone", opts): role tv listens on the command topics and publishes state; phone the reverse.
     opts.onMsg(d, meta{f, s, via}), opts.onStatus({mqtt:n, ntfy:bool}), opts.ntfy (default true), opts.mqtt (default true). */
  function Link(K, role, opts) {
    var me = this; me.K = K; me.role = role; me.T = topics(K); me.opts = opts || {}; me.seq = 0; me.id = opts.id || rnd(10); me.seen = {}; me.mq = []; me.nt = null;
    try { me.seen = JSON.parse(localStorage.getItem("cable_rseen_" + me.T.mc.slice(9, 17)) || "{}") || {}; } catch (e) { me.seen = {}; }
    var sub = role === "tv" ? [me.T.mc] : [me.T.ms], nsub = role === "tv" ? me.T.nc : me.T.ns;
    var st = function () { if (me.opts.onStatus) me.opts.onStatus(me.status()); };
    if (me.opts.mqtt !== false && W.WebSocket) BROKERS.slice(0, 2).forEach(function (u) { me.mq.push(new Mqtt(u, sub, function (s, tp) { me.recv(s, "mqtt"); }, st)); });
    if (me.opts.mqtt !== false && W.WebSocket) setTimeout(function () { if (!me.dead && !me.mq.some(function (m) { return m.ok; })) me.mq.push(new Mqtt(BROKERS[2], sub, function (s) { me.recv(s, "mqtt"); }, st)); }, 12000);
    if (me.opts.ntfy !== false) me.nt = new Ntfy(nsub, function (s) { me.recv(s, "ntfy"); }, st);
  }
  Link.prototype.status = function () { return { mqtt: this.mq.filter(function (m) { return m.ok; }).length, ntfy: !!(this.nt && this.nt.ok) }; };
  Link.prototype.recv = function (s, via) {
    var o; try { o = JSON.parse(s); } catch (e) { return; }
    if (!o || o.v !== 1 || !o.f || typeof o.s !== "number" || o.f === this.id) return;
    if (o.h !== sign(this.K, o)) return;                          // not signed with our K: ignore
    var last = this.seen[o.f] || 0; if (o.s <= last) return;      // duplicate (second broker / second relay) or a replay: seq is time-based and only grows
    this.seen[o.f] = o.s;
    if (this.role === "tv") { var ks = Object.keys(this.seen); if (ks.length > 40) delete this.seen[ks[0]]; try { localStorage.setItem("cable_rseen_" + this.T.mc.slice(9, 17), JSON.stringify(this.seen)); } catch (e) {} }
    if (this.opts.onMsg) this.opts.onMsg(o.d, { f: o.f, s: o.s, via: via });
  };
  /* send(d, how): how = "auto" (MQTT when connected, else ntfy), "mqtt", "ntfy", "both". Returns a Promise of the relay used. */
  Link.prototype.send = function (d, how) {
    var me = this; how = how || "auto";
    var seq = me.seq = Math.max(me.seq + 1, Date.now()); if (me.opts.nextSeq) seq = me.seq = me.opts.nextSeq(seq);
    var o = { v: 1, f: me.id, s: seq, ts: Date.now(), d: d }; o.h = sign(me.K, o); var s = JSON.stringify(o);
    var tm = me.role === "tv" ? me.T.ms : me.T.mc, tn = me.role === "tv" ? me.T.ns : me.T.nc, sent = false;
    if (how !== "ntfy") me.mq.forEach(function (m) { if (m.pub(tm, s)) sent = true; });
    if (sent && how !== "both") return Promise.resolve("mqtt");
    if (how === "mqtt") return Promise.reject(new Error("offline"));
    if (s.length > 3900) return sent ? Promise.resolve("mqtt") : Promise.reject(new Error("too big for ntfy"));
    return ntfyPost(tn, s).then(function () { return sent ? "both" : "ntfy"; });
  };
  Link.prototype.close = function () { this.dead = true; this.mq.forEach(function (m) { m.close(); }); if (this.nt) this.nt.close(); };

  W.CableLink = { Link: Link, Ntfy: Ntfy, ntfyPost: ntfyPost, topics: topics, sha256hex: H, hmac: hmac, rnd: rnd, code: function () { return rnd(6, CODEABC); }, CODEABC: CODEABC,
    pairTopic: function (code) { return "cable-pair-" + String(code).toUpperCase().replace(/[^A-Z0-9]/g, ""); }, newKey: function () { return rnd(22); },
    REMOTE_URL: "https://chasebdillard-ai.github.io/cable/remote/" };
})(window);

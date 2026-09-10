/* Beam offline pairing: WebRTC without a signaling server.
   The offer and answer are squeezed into short codes that fit in a QR (or can be pasted), so two
   devices on the same Wi-Fi or hotspot can connect with no internet and no third party.
   Exposes window.BeamDirect with makeOffer, acceptOffer, finish, and a DataConnection-like wrapper
   that plugs into the same link code as PeerJS connections. */
(function () {
  'use strict';

  var PREFIX = 'beam1:';

  // --- tiny event emitter, same shape PeerJS gives us ---
  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; };
  Emitter.prototype.emit = function (ev) { var a = Array.prototype.slice.call(arguments, 1); (this._h[ev] || []).slice().forEach(function (f) { try { f.apply(null, a); } catch (e) { console.error(e); } }); };

  // Wraps an RTCPeerConnection + RTCDataChannel to look like a PeerJS DataConnection.
  function RawConn(pc, id) {
    Emitter.call(this);
    var s = this;
    s.peer = id; s.peerConnection = pc; s.dataChannel = null; s.open = false; s.direct = true;
    s._attach = function (dc) {
      s.dataChannel = dc; dc.binaryType = 'arraybuffer';
      dc.onopen = function () { s.open = true; s.emit('open'); };
      dc.onmessage = function (e) { s.emit('data', e.data); };
      dc.onclose = function () { if (s.open) { s.open = false; s.emit('close'); } };
      dc.onerror = function (e) { s.emit('error', e.error || e); };
    };
    pc.oniceconnectionstatechange = function () {
      s.emit('iceStateChanged', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') { if (s.open) { s.open = false; s.emit('close'); } }
    };
  }
  RawConn.prototype = Object.create(Emitter.prototype);
  RawConn.prototype.send = function (d) { this.dataChannel.send(d); };
  RawConn.prototype.close = function () {
    var was = this.open; this.open = false;
    try { this.dataChannel && this.dataChannel.close(); } catch (e) { /* ignore */ }
    try { this.peerConnection.close(); } catch (e) { /* ignore */ }
    if (was) this.emit('close');
  };

  // --- SDP squeeze: keep only what the other side needs, rebuild the boilerplate on arrival ---
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; var s = atob(str), o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; }

  function squeeze(sdp, role) {
    var get = function (re) { var m = re.exec(sdp); return m ? m[1] : ''; };
    var ufrag = get(/a=ice-ufrag:(\S+)/), pwd = get(/a=ice-pwd:(\S+)/);
    var fp = get(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/);
    var cands = [];
    var re = /a=candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)(?: raddr (\S+) rport (\d+))?/g, m;
    while ((m = re.exec(sdp))) {
      if (m[2] !== '1') continue;                       // one component for data channels
      var proto = m[3].toLowerCase(), type = m[7];
      if (proto !== 'udp') continue;                    // tcp candidates rarely help and bloat the code
      if (type !== 'host' && type !== 'srflx') continue;
      cands.push([type === 'host' ? 'h' : 's', m[5], parseInt(m[6], 10)]);
    }
    if (!ufrag || !pwd || !fp) throw new Error('unexpected SDP');
    var obj = { r: role, u: ufrag, p: pwd, f: fp.replace(/:/g, ''), c: cands };
    return PREFIX + b64u(new TextEncoder().encode(JSON.stringify(obj)));
  }

  function unsqueeze(code) {
    code = (code || '').trim();
    if (code.indexOf(PREFIX) !== 0) throw new Error('not an offline pairing code');
    var obj = JSON.parse(new TextDecoder().decode(unb64u(code.slice(PREFIX.length))));
    if (!obj.u || !obj.p || !obj.f || !obj.c) throw new Error('bad pairing code');
    var fp = obj.f.match(/.{2}/g).join(':').toUpperCase();
    var lines = [
      'v=0', 'o=- ' + Date.now() + ' 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
      'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:' + obj.u, 'a=ice-pwd:' + obj.p, 'a=ice-options:trickle',
      'a=fingerprint:sha-256 ' + fp,
      'a=setup:' + (obj.r === 'o' ? 'actpass' : 'active'),
      'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144'
    ];
    var n = 0;
    obj.c.forEach(function (c) {
      n++;
      var type = c[0] === 'h' ? 'host' : 'srflx';
      var prio = (type === 'host' ? 2113937151 : 1677729535) - n;
      lines.push('a=candidate:' + n + ' 1 udp ' + prio + ' ' + c[1] + ' ' + c[2] + ' typ ' + type + (type === 'srflx' ? ' raddr 0.0.0.0 rport 0' : '') + ' generation 0');
    });
    lines.push('a=end-of-candidates');
    return { type: obj.r === 'o' ? 'offer' : 'answer', sdp: lines.join('\r\n') + '\r\n' };
  }

  function isCode(text) { return typeof text === 'string' && text.trim().indexOf(PREFIX) === 0; }

  // Wait until ICE gathering is done (or a short timeout when there is no internet for STUN).
  function gathered(pc, ms) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      var done = false, t = setTimeout(function () { if (!done) { done = true; resolve(); } }, ms || 2500);
      pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete' && !done) { done = true; clearTimeout(t); resolve(); } });
    });
  }

  function newPc(iceServers) {
    return new RTCPeerConnection({ iceServers: iceServers || [], iceCandidatePoolSize: 0 });
  }

  // Host side, step 1: build an offer code to show as a QR.
  function makeOffer(iceServers) {
    var pc = newPc(iceServers);
    var conn = new RawConn(pc, 'direct-' + Math.random().toString(36).slice(2, 8));
    var dc = pc.createDataChannel('beam', { ordered: true });
    conn._attach(dc);
    return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
      .then(function () { return gathered(pc, 3000); })
      .then(function () { return { conn: conn, code: squeeze(pc.localDescription.sdp, 'o') }; });
  }

  // Host side, step 2: feed the guest's answer code in.
  function finish(conn, answerCode) {
    return conn.peerConnection.setRemoteDescription(unsqueeze(answerCode));
  }

  // Guest side: take the host's offer code, produce an answer code.
  function acceptOffer(offerCode, iceServers) {
    var pc = newPc(iceServers);
    var conn = new RawConn(pc, 'direct-host');
    pc.ondatachannel = function (e) { conn._attach(e.channel); };
    var desc = unsqueeze(offerCode);
    if (desc.type !== 'offer') return Promise.reject(new Error('that is a reply code, not a host code'));
    return pc.setRemoteDescription(desc)
      .then(function () { return pc.createAnswer(); })
      .then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { return gathered(pc, 3000); })
      .then(function () { return { conn: conn, code: squeeze(pc.localDescription.sdp, 'a') }; });
  }

  window.BeamDirect = { makeOffer: makeOffer, acceptOffer: acceptOffer, finish: finish, isCode: isCode, PREFIX: PREFIX };
})();

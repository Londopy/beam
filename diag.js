/* Beam connection check: finds VPNs, blocked UDP, broken STUN/TURN, extensions that cripple WebRTC,
   and the other usual reasons two devices cannot connect. Everything runs in the browser. */
(function () {
  'use strict';

  function withTimeout(p, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
      p.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } }, function () { if (!done) { done = true; clearTimeout(t); resolve(fallback); } });
    });
  }

  function parseCandidate(c) {
    // candidate:foundation component protocol priority address port typ type ...
    var m = /candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)(?: raddr (\S+) rport (\d+))?/.exec(c);
    if (!m) return null;
    return { protocol: m[3].toLowerCase(), address: m[5], port: parseInt(m[6], 10), type: m[7], raddr: m[8] || '', rport: m[9] ? parseInt(m[9], 10) : 0 };
  }

  // Gather ICE candidates with the given servers and policy. Resolves with the parsed list.
  function gather(iceServers, policy, ms) {
    return new Promise(function (resolve) {
      var out = [], pc, done = false;
      var finish = function () { if (done) return; done = true; try { pc.close(); } catch (e) { /* ignore */ } resolve(out); };
      try {
        pc = new RTCPeerConnection({ iceServers: iceServers, iceTransportPolicy: policy || 'all', iceCandidatePoolSize: 0 });
      } catch (e) { resolve(out); return; }
      pc.onicecandidate = function (ev) {
        if (!ev.candidate) { finish(); return; }
        var p = parseCandidate(ev.candidate.candidate);
        if (p) out.push(p);
      };
      pc.onicegatheringstatechange = function () { if (pc.iceGatheringState === 'complete') finish(); };
      pc.createDataChannel('probe');
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).catch(finish);
      setTimeout(finish, ms || 6000);
    });
  }

  // Loopback: two peer connections in this page, real ICE, real data channel. Proves the path works.
  function loopback(iceServers, policy, ms) {
    return new Promise(function (resolve) {
      var a, b, done = false, t0 = performance.now();
      var finish = function (ok, detail) {
        if (done) return; done = true;
        try { a.close(); } catch (e) { /* ignore */ } try { b.close(); } catch (e) { /* ignore */ }
        resolve({ ok: ok, ms: Math.round(performance.now() - t0), detail: detail || '' });
      };
      try {
        a = new RTCPeerConnection({ iceServers: iceServers, iceTransportPolicy: policy || 'all' });
        b = new RTCPeerConnection({ iceServers: iceServers, iceTransportPolicy: policy || 'all' });
      } catch (e) { resolve({ ok: false, ms: 0, detail: e.message }); return; }
      a.onicecandidate = function (e) { if (e.candidate) b.addIceCandidate(e.candidate).catch(function () {}); };
      b.onicecandidate = function (e) { if (e.candidate) a.addIceCandidate(e.candidate).catch(function () {}); };
      var dc = a.createDataChannel('t');
      dc.onopen = function () { dc.send('ping'); };
      b.ondatachannel = function (e) { e.channel.onmessage = function (m) { if (m.data === 'ping') selected(); }; };
      function selected() {
        a.getStats().then(function (report) {
          var pairs = {}, cands = {}, sel = null;
          report.forEach(function (r) {
            if (r.type === 'candidate-pair') pairs[r.id] = r;
            else if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands[r.id] = r;
          });
          report.forEach(function (r) { if (r.type === 'transport' && r.selectedCandidatePairId) sel = pairs[r.selectedCandidatePairId]; });
          if (!sel) for (var k in pairs) if (pairs[k].state === 'succeeded' && pairs[k].nominated) { sel = pairs[k]; break; }
          var l = sel && cands[sel.localCandidateId], r2 = sel && cands[sel.remoteCandidateId];
          finish(true, (l ? l.candidateType : '?') + ' to ' + (r2 ? r2.candidateType : '?') + (l && l.protocol ? ' over ' + l.protocol : ''));
        }).catch(function () { finish(true, ''); });
      }
      a.oniceconnectionstatechange = function () { if (a.iceConnectionState === 'failed') finish(false, 'ICE failed'); };
      a.createOffer().then(function (o) { return a.setLocalDescription(o); })
        .then(function () { return b.setRemoteDescription(a.localDescription); })
        .then(function () { return b.createAnswer(); })
        .then(function (ans) { return b.setLocalDescription(ans); })
        .then(function () { return a.setRemoteDescription(b.localDescription); })
        .catch(function (e) { finish(false, e.message); });
      setTimeout(function () { finish(false, 'timed out'); }, ms || 12000);
    });
  }

  function uniq(arr) { var s = {}, o = []; arr.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  // Runs every check. report(step) is called as each result lands; resolves with the full list.
  function run(settings, report) {
    var results = [];
    var add = function (id, level, title, detail, advice) {
      var r = { id: id, level: level, title: title, detail: detail || '', advice: advice || '' };
      results.push(r); if (report) report(r, results); return r;
    };
    var ice = [];
    try { ice = JSON.parse(settings.ice); if (!Array.isArray(ice)) ice = []; } catch (e) { ice = []; }
    var stunOnly = ice.filter(function (s) { var u = [].concat(s.urls || []); return u.some(function (x) { return /^stuns?:/.test(x); }); })
      .map(function (s) { return { urls: [].concat(s.urls).filter(function (x) { return /^stuns?:/.test(x); }) }; });
    var turnOnly = ice.filter(function (s) { var u = [].concat(s.urls || []); return u.some(function (x) { return /^turns?:/.test(x); }); });
    var facts = {};

    return Promise.resolve().then(function () {
      // 1. Basics
      var secure = window.isSecureContext;
      add('secure', secure ? 'ok' : 'fail', 'Secure page (HTTPS)', secure ? location.origin : 'Not a secure context', secure ? '' : 'Camera, clipboard, and WebRTC need HTTPS. Use the GitHub Pages address.');
      var rtc = !!window.RTCPeerConnection;
      add('webrtc', rtc ? 'ok' : 'fail', 'WebRTC available', rtc ? 'RTCPeerConnection present' : 'RTCPeerConnection is missing',
        rtc ? '' : 'WebRTC is disabled. In Firefox check media.peerconnection.enabled; in Brave check Shields; some privacy extensions disable it.');
      facts.rtc = rtc;
      add('online', navigator.onLine ? 'ok' : 'fail', 'Browser reports online', navigator.onLine ? 'yes' : 'no');
      var ni = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (ni && (ni.effectiveType || ni.type)) add('netinfo', 'info', 'Network type', (ni.type ? ni.type + ', ' : '') + (ni.effectiveType || '') + (ni.rtt ? ', ~' + ni.rtt + ' ms RTT' : '') + (ni.saveData ? ', data saver on' : ''));
      var ls = true; try { localStorage.setItem('beam.probe', '1'); localStorage.removeItem('beam.probe'); } catch (e) { ls = false; }
      add('storage', ls ? 'ok' : 'warn', 'Settings storage', ls ? 'localStorage works' : 'localStorage blocked (private mode or site data blocked)', ls ? '' : 'Settings will not be remembered.');
    }).then(function () {
      // 2. Signaling server over HTTPS
      var host = settings.host || '0.peerjs.com';
      var port = settings.host ? (settings.port || 443) : 443;
      var path = settings.host ? (settings.path || '/') : '/';
      var secure = settings.host ? (settings.secure === 'no' ? false : settings.secure === 'yes' ? true : location.protocol === 'https:') : true;
      var base = (secure ? 'https' : 'http') + '://' + host + ':' + port + path.replace(/\/?$/, '/');
      var t0 = performance.now();
      return withTimeout(fetch(base + (settings.key || 'peerjs') + '/id', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)); }), 8000, null)
        .then(function (id) {
          var ms = Math.round(performance.now() - t0);
          facts.signalHttp = !!id;
          add('signal-http', id ? 'ok' : 'fail', 'Signaling server reachable', id ? host + ' answered in ' + ms + ' ms' : host + ' did not answer',
            id ? '' : 'An ad blocker, VPN, DNS filter, or firewall is blocking ' + host + '. Allow it, or point Beam at your own PeerServer in Connection settings.');
        });
    }).then(function () {
      // 3. Signaling over WebSocket via PeerJS itself
      if (!window.Peer) { add('signal-ws', 'warn', 'Signaling over WebSocket', 'PeerJS library not loaded on this page'); return; }
      return new Promise(function (resolve) {
        var done = false, t0 = performance.now(), p;
        var finish = function (ok, msg) { if (done) return; done = true; try { p.destroy(); } catch (e) { /* ignore */ } facts.signalWs = ok;
          add('signal-ws', ok ? 'ok' : 'fail', 'Signaling over WebSocket', msg, ok ? '' : 'HTTPS works but the WebSocket does not: a proxy, corporate firewall, or extension is blocking wss. Try another network or self-host PeerServer on port 443.'); resolve(); };
        try { p = new Peer(undefined, window.Beam.peerOptions(settings)); } catch (e) { finish(false, e.message); return; }
        p.on('open', function () { finish(true, 'connected in ' + Math.round(performance.now() - t0) + ' ms'); });
        p.on('error', function (e) { finish(false, e.type || e.message || 'error'); });
        setTimeout(function () { finish(false, 'no answer after 8 s'); }, 8000);
      });
    }).then(function () {
      if (!facts.rtc) return;
      // 4. Candidate gathering: host, srflx (STUN), relay (TURN)
      return gather(ice, 'all', 7000).then(function (cands) {
        facts.cands = cands;
        var host = cands.filter(function (c) { return c.type === 'host'; });
        var srflx = cands.filter(function (c) { return c.type === 'srflx'; });
        var relay = cands.filter(function (c) { return c.type === 'relay'; });
        var ifaces = uniq(host.map(function (c) { return c.address; })).length;
        facts.ifaces = ifaces;
        facts.mdns = host.some(function (c) { return /\.local$/.test(c.address); });
        add('host', host.length ? 'ok' : 'fail', 'Local network candidates', host.length ? ifaces + ' interface' + (ifaces === 1 ? '' : 's') + (facts.mdns ? ' (addresses hidden behind mDNS, normal)' : '') : 'none',
          host.length ? '' : 'The browser is hiding all local addresses. This is the "prevent WebRTC IP leak" option in uBlock Origin / Brave / Edge, or a WebRTC IP handling policy. Turn it off for this site.');
        var pub = uniq(srflx.map(function (c) { return c.address; }));
        facts.stunIp = pub[0] || '';
        add('stun', srflx.length ? 'ok' : (stunOnly.length ? 'fail' : 'warn'), 'STUN (finds your public address)',
          srflx.length ? 'public address ' + pub.join(', ') + ' via ' + (srflx[0].protocol) : (stunOnly.length ? 'no reply from any STUN server' : 'no STUN server configured'),
          srflx.length ? '' : 'UDP to the STUN servers is blocked. VPNs and strict firewalls do this. Without STUN, only same-network or relayed connections work.');
        facts.relayOk = relay.length > 0;
        facts.relayProtos = uniq(relay.map(function (c) { return c.protocol + (c.raddr ? '' : ''); }));
        add('turn', relay.length ? 'ok' : (turnOnly.length ? 'fail' : 'warn'), 'TURN relay (fallback path)',
          relay.length ? relay.length + ' relay candidate' + (relay.length === 1 ? '' : 's') + ' (' + facts.relayProtos.join(', ') + ')' : (turnOnly.length ? 'relay server did not allocate' : 'no TURN server configured'),
          relay.length ? '' : (turnOnly.length ? 'The TURN server is unreachable or the credentials are wrong. If UDP is blocked, make sure the list includes a turns: entry on port 443.' : 'Add a TURN server in Connection settings so devices on different networks can still connect.'));
        if (ifaces > 1) add('ifaces', 'warn', 'Multiple network interfaces', ifaces + ' active interfaces seen',
          'More than one interface usually means a VPN, virtual machine, or Hyper-V/WSL adapter is active. A VPN can route WebRTC through its tunnel or block it entirely; try with the VPN off.');
      });
    }).then(function () {
      if (!facts.rtc) return;
      // 5. UDP vs TCP: does relay work over UDP at all?
      if (!turnOnly.length) return;
      var udpTurn = turnOnly.map(function (s) { return { urls: [].concat(s.urls).filter(function (u) { return /^turn:/.test(u) && !/transport=tcp/.test(u); }), username: s.username, credential: s.credential }; }).filter(function (s) { return s.urls.length; });
      var tcpTurn = turnOnly.map(function (s) { return { urls: [].concat(s.urls).filter(function (u) { return /^turns:/.test(u) || /transport=tcp/.test(u); }), username: s.username, credential: s.credential }; }).filter(function (s) { return s.urls.length; });
      return Promise.all([
        udpTurn.length ? gather(udpTurn, 'relay', 6000) : Promise.resolve(null),
        tcpTurn.length ? gather(tcpTurn, 'relay', 6000) : Promise.resolve(null)
      ]).then(function (r) {
        var udp = r[0] ? r[0].some(function (c) { return c.type === 'relay'; }) : null;
        var tcp = r[1] ? r[1].some(function (c) { return c.type === 'relay'; }) : null;
        facts.udp = udp; facts.tcp = tcp;
        if (udp === false && tcp === true) add('udp', 'warn', 'UDP blocked', 'relay works over TCP/TLS only',
          'This network (or a VPN) blocks UDP, so everything goes through the relay over TCP: slower, but it works. Common on corporate Wi-Fi, hotel networks, and some VPNs.');
        else if (udp === false && tcp === false) add('udp', 'fail', 'Relay unreachable over UDP and TCP', 'no allocation either way', 'The relay host is blocked. Try another network or another TURN server.');
        else if (udp === true) add('udp', 'ok', 'UDP works', 'relay allocated over UDP' + (tcp === true ? ' and TCP' : ''));
      });
    }).then(function () {
      // 6. HTTP egress address vs STUN address: VPN / proxy / split tunnel detection, plus Cloudflare WARP flag
      return withTimeout(fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' }).then(function (r) { return r.text(); }), 6000, '')
        .then(function (txt) {
          if (!txt) { add('egress', 'info', 'Public address check', 'could not reach the lookup service'); return; }
          var kv = {}; txt.split('\n').forEach(function (l) { var i = l.indexOf('='); if (i > 0) kv[l.slice(0, i)] = l.slice(i + 1); });
          facts.httpIp = kv.ip || ''; facts.warp = kv.warp; facts.loc = kv.loc;
          var d = 'web traffic leaves from ' + (kv.ip || '?') + (kv.loc ? ' (' + kv.loc + ')' : '');
          if (kv.warp && kv.warp !== 'off') add('warp', 'warn', 'Cloudflare WARP / 1.1.1.1 VPN is on', 'warp=' + kv.warp, 'WARP tunnels WebRTC too and sometimes blocks the relay. Turn it off for Beam if connections fail.');
          if (facts.stunIp && kv.ip && facts.stunIp !== kv.ip) {
            add('egress', 'warn', 'Web and WebRTC leave from different addresses', d + ', WebRTC from ' + facts.stunIp,
              'That split usually means a VPN, proxy, or split tunnel: browser traffic goes one way and UDP goes another. Other devices may fail to reach you. Try with the VPN or proxy off.');
          } else if (facts.stunIp) {
            add('egress', 'ok', 'Public address consistent', d);
          } else {
            add('egress', 'info', 'Public address', d);
          }
          // Datacenter / VPN range hint: STUN address in well-known private-relay or CGNAT ranges
          var ip = facts.stunIp || kv.ip || '';
          if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) add('cgnat', 'warn', 'Carrier-grade NAT', ip + ' is a shared carrier address',
            'Mobile carriers and some ISPs put you behind a second NAT. Direct connections often fail; the relay will be used.');
        });
    }).then(function () {
      if (!facts.rtc || !stunOnly.length) return;
      // 7. NAT type: same reflexive port from two different STUN servers means an easy NAT
      var urls = []; stunOnly.forEach(function (s) { urls = urls.concat(s.urls); });
      urls = uniq(urls);
      if (urls.length < 2) return;
      return Promise.all([gather([{ urls: urls[0] }], 'all', 5000), gather([{ urls: urls[1] }], 'all', 5000)]).then(function (r) {
        var a = r[0].filter(function (c) { return c.type === 'srflx'; })[0], b = r[1].filter(function (c) { return c.type === 'srflx'; })[0];
        if (!a || !b) return;
        if (a.address === b.address && a.port === b.port) add('nat', 'ok', 'NAT type', 'consistent mapping (' + a.address + ':' + a.port + '), direct connections should work');
        else add('nat', 'warn', 'NAT type', 'symmetric: ' + a.address + ':' + a.port + ' vs ' + b.address + ':' + b.port,
          'Your router gives every destination a different port, so hole punching fails. Connections will need the relay. Enabling UPnP or "full cone" NAT on the router helps, as does turning off a VPN.');
      });
    }).then(function () {
      if (!facts.rtc) return;
      // 8. End-to-end loopback through the configured servers, then relay-only
      return loopback(ice, 'all', 12000).then(function (r) {
        add('loop', r.ok ? 'ok' : 'fail', 'Local WebRTC connection', r.ok ? 'data channel opened in ' + r.ms + ' ms (' + r.detail + ')' : 'failed: ' + r.detail,
          r.ok ? '' : 'Two connections inside this browser could not talk to each other. A WebRTC-blocking extension or security software is interfering.');
        if (!turnOnly.length) return;
        return loopback(ice, 'relay', 15000).then(function (r2) {
          add('loop-relay', r2.ok ? 'ok' : 'fail', 'Connection through the relay only', r2.ok ? 'data channel opened in ' + r2.ms + ' ms' : 'failed: ' + r2.detail,
            r2.ok ? '' : 'The relay allocates but does not pass traffic. Try a different TURN server.');
        });
      });
    }).then(function () {
      // 9. Extras that affect features, not connectivity
      var cam = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices ? withTimeout(navigator.mediaDevices.enumerateDevices(), 3000, []) : Promise.resolve([]);
      return cam.then(function (devs) {
        var n = devs.filter(function (d) { return d.kind === 'videoinput'; }).length;
        add('camera', n ? 'ok' : 'info', 'Camera for QR scanning', n ? n + ' camera' + (n === 1 ? '' : 's') + (('BarcodeDetector' in window) ? ', native QR detector' : ', jsQR fallback') : 'no camera found (type the code instead)');
        var noti = 'Notification' in window ? Notification.permission : 'unsupported';
        add('notify', noti === 'granted' ? 'ok' : 'info', 'Notifications', noti);
        add('clipboard', navigator.clipboard ? 'ok' : 'info', 'Clipboard API', navigator.clipboard ? 'available' : 'not available');
        add('fsa', window.showDirectoryPicker ? 'ok' : 'info', 'Save straight to a folder', window.showDirectoryPicker ? 'supported' : 'not in this browser (files are held in memory until Save)');
      });
    }).then(function () {
      // Summary
      var fails = results.filter(function (r) { return r.level === 'fail'; });
      var warns = results.filter(function (r) { return r.level === 'warn'; });
      var verdict;
      if (fails.some(function (r) { return /^signal/.test(r.id) || r.id === 'webrtc' || r.id === 'secure'; })) verdict = { level: 'fail', text: 'Beam cannot connect from this browser right now. Fix the red items first.' };
      else if (facts.relayOk && (facts.stunIp || facts.udp === false)) verdict = { level: warns.length ? 'warn' : 'ok', text: warns.length ? 'Connections should work, possibly through the relay. The yellow items explain why direct links may fail.' : 'Everything looks good. Direct connections should work.' };
      else if (facts.stunIp) verdict = { level: 'warn', text: 'Direct connections should work on friendly networks, but there is no working relay to fall back on.' };
      else verdict = { level: 'fail', text: 'Neither STUN nor a relay is reachable, so only same-network connections can work.' };
      return { results: results, verdict: verdict, facts: facts };
    });
  }

  function reportText(out) {
    var lines = ['Beam connection check, ' + new Date().toISOString(), navigator.userAgent, ''];
    out.results.forEach(function (r) { lines.push('[' + r.level.toUpperCase() + '] ' + r.title + (r.detail ? ': ' + r.detail : '') + (r.advice ? '\n    ' + r.advice : '')); });
    lines.push('', 'Verdict: ' + out.verdict.text);
    return lines.join('\n');
  }

  window.BeamDiag = { run: run, reportText: reportText };
})();

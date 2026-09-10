/* Beam: shared settings, theme, and small helpers used by index.html and settings.html */
(function () {
  'use strict';

  var STORAGE_KEY = 'beam.settings';

  function guessDevice() {
    var ua = navigator.userAgent;
    var os = /iPhone/.test(ua) ? 'iPhone'
      : /iPad/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows'
      : /Mac/.test(ua) ? 'Mac'
      : /CrOS/.test(ua) ? 'ChromeOS'
      : /Linux/.test(ua) ? 'Linux' : 'device';
    var br = /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return br + ' on ' + os;
  }

  var DEFAULTS = {
    name: '',                 // empty means "use guessDevice()"
    theme: 'system',          // system | light | dark
    autoAccept: true,
    autoDownload: false,
    notify: false,
    sound: false,
    preview: true,
    pin: false,
    stableCode: false,
    chunk: 32768,
    host: '', port: '', path: '', key: '',
    secure: 'auto',           // auto | yes | no
    ice: JSON.stringify([{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }], null, 2)
  };

  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    var s = {};
    for (var k in DEFAULTS) s[k] = (k in saved && saved[k] !== undefined) ? saved[k] : DEFAULTS[k];
    // Older versions stored the guessed name; treat it as the default so a new device keeps auto-naming.
    if (typeof s.name !== 'string') s.name = '';
    s.chunk = parseInt(s.chunk, 10) || DEFAULTS.chunk;
    return s;
  }

  function save(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }

  function displayName(s) { return (s.name || '').trim() || guessDevice(); }

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var dark = theme === 'dark' || (theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      meta.setAttribute('content', dark ? '#0f1513' : '#f3f5f2');
    }
  }

  function peerOptions(s) {
    var o = { debug: 1 };
    if (s.host) {
      o.host = s.host;
      o.port = s.port ? parseInt(s.port, 10) : 443;
      o.path = s.path || '/';
      if (s.secure === 'yes') o.secure = true;
      else if (s.secure === 'no') o.secure = false;
      // 'auto' leaves it to PeerJS, which follows the page protocol.
      if (s.key) o.key = s.key;
    }
    try {
      var ice = JSON.parse(s.ice);
      if (Array.isArray(ice) && ice.length) o.config = { iceServers: ice };
    } catch (e) { /* keep library default */ }
    return o;
  }

  function fmtBytes(n) {
    if (!isFinite(n) || n < 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  // Short two-note chime, generated so no audio file is needed.
  function chime() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      var ctx = new Ctx(), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1175, ctx.currentTime + 0.09);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.36);
      setTimeout(function () { if (ctx.close) ctx.close(); }, 600);
    } catch (e) { /* ignore */ }
  }

  window.Beam = {
    chime: chime,
    STORAGE_KEY: STORAGE_KEY,
    DEFAULTS: DEFAULTS,
    load: load,
    save: save,
    displayName: displayName,
    guessDevice: guessDevice,
    applyTheme: applyTheme,
    peerOptions: peerOptions,
    fmtBytes: fmtBytes,
    toast: toast
  };

  // Apply the theme as early as possible to avoid a flash.
  applyTheme(load().theme);
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { applyTheme(load().theme); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
})();

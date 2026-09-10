/* Beam background: slowly drifting topographic contour lines drawn on a canvas.
   Contours come from layered Perlin noise run through marching squares. */
(function () {
  'use strict';
  var canvas = document.getElementById('topo');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, dpr = 1, CELL = 9;

  // --- Perlin noise ---
  var perm = new Uint8Array(512);
  (function () {
    var p = [];
    for (var i = 0; i < 256; i++) p[i] = i;
    var seed = 1337;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var j = 255; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var t = p[j]; p[j] = p[k]; p[k] = t; }
    for (var m = 0; m < 512; m++) perm[m] = p[m & 255];
  })();
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad(h, x, y) {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  }
  function noise(x, y) {
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    var u = fade(x), v = fade(y);
    var a = perm[X] + Y, b = perm[X + 1] + Y;
    var n00 = grad(perm[a], x, y), n10 = grad(perm[b], x - 1, y);
    var n01 = grad(perm[a + 1], x, y - 1), n11 = grad(perm[b + 1], x - 1, y - 1);
    var nx0 = n00 + u * (n10 - n00), nx1 = n01 + u * (n11 - n01);
    return nx0 + v * (nx1 - nx0);
  }
  function field(x, y, t) {
    // Three octaves; the drift moves each octave at a slightly different speed so ridges breathe.
    var s = 0.0032;
    return noise(x * s + t * 0.020, y * s + t * 0.011) * 0.62
      + noise(x * s * 2.1 + 5.2 - t * 0.008, y * s * 2.1 + 1.7 + t * 0.015) * 0.27
      + noise(x * s * 4.3 + 9.1 + t * 0.03, y * s * 4.3 + 3.3 - t * 0.02) * 0.11;
  }

  var cols = 0, rows = 0, vals = null;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    cols = Math.ceil(W / CELL) + 1; rows = Math.ceil(H / CELL) + 1;
    vals = new Float32Array(cols * rows);
  }

  function color() {
    var c = getComputedStyle(document.documentElement).getPropertyValue('--topo').trim();
    return c || 'rgba(31,122,85,0.16)';
  }

  var LEVELS = [];
  for (var l = -0.55; l <= 0.55; l += 0.1) LEVELS.push(l);

  function draw(t) {
    var x, y, i;
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) vals[y * cols + x] = field(x * CELL, y * CELL, t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var stroke = color();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (i = 0; i < LEVELS.length; i++) {
      var lv = LEVELS[i];
      var index = (i % 4 === 0);
      ctx.beginPath();
      ctx.lineWidth = index ? 1.4 : 0.8;
      ctx.strokeStyle = stroke;
      ctx.globalAlpha = index ? 1 : 0.6;
      for (y = 0; y < rows - 1; y++) {
        for (x = 0; x < cols - 1; x++) {
          var a = vals[y * cols + x], b = vals[y * cols + x + 1], c = vals[(y + 1) * cols + x + 1], d = vals[(y + 1) * cols + x];
          var code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
          if (code === 0 || code === 15) continue;
          var px = x * CELL, py = y * CELL;
          // Edge points, interpolated: top, right, bottom, left
          var top = [px + CELL * frac(a, b, lv), py];
          var right = [px + CELL, py + CELL * frac(b, c, lv)];
          var bottom = [px + CELL * frac(d, c, lv), py + CELL];
          var left = [px, py + CELL * frac(a, d, lv)];
          switch (code) {
            case 1: case 14: seg(left, bottom); break;
            case 2: case 13: seg(bottom, right); break;
            case 3: case 12: seg(left, right); break;
            case 4: case 11: seg(top, right); break;
            case 5: seg(left, top); seg(bottom, right); break;
            case 6: case 9: seg(top, bottom); break;
            case 7: case 8: seg(left, top); break;
            case 10: seg(top, right); seg(left, bottom); break;
          }
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function frac(v1, v2, lv) { var d = v2 - v1; return d === 0 ? 0.5 : Math.min(1, Math.max(0, (lv - v1) / d)); }
  function seg(p, q) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }

  var start = performance.now(), last = 0, running = true;
  function frame(now) {
    if (!running) return;
    if (now - last > 90) { last = now; draw((now - start) / 1000); }
    requestAnimationFrame(frame);
  }
  function startLoop() { if (running) return; running = true; last = 0; requestAnimationFrame(frame); }
  function stopLoop() { running = false; }

  resize();
  draw(0);
  var resizeTimer = null;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { resize(); draw(reduce ? 0 : (performance.now() - start) / 1000); }, 120); });
  if (!reduce) {
    requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopLoop(); else startLoop(); });
  }
  // Redraw when the theme changes so the line colour follows it.
  new MutationObserver(function () { draw((performance.now() - start) / 1000); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var re = function () { draw((performance.now() - start) / 1000); };
    if (mq.addEventListener) mq.addEventListener('change', re); else if (mq.addListener) mq.addListener(re);
  }
})();

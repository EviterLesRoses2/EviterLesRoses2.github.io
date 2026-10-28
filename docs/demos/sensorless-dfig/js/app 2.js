/* Interactive companion page — UI, charts and animations. Canvas charts; local KaTeX handles formula typesetting. */
(function () {
  'use strict';
  const M = window.Models;
  const EXP = window.EXP;
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const isZh = () => root.dataset.lang === 'zh';
  const tr = (en, zh) => (isZh() ? zh : en);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Typeset generated chart labels as LaTeX, cached for live playback.
  const mathLabelCache = new Map();
  const sub = (s) => String(s).replace(/(Δθ|ψ|[A-Za-z])_([A-Za-z0-9]+(?:,[A-Za-z0-9]+)?)(\*)?/g, (_, symbol, index, star) => {
    const tex = (symbol === 'Δθ' ? String.raw`\Delta\theta` : symbol === 'ψ' ? String.raw`\psi` : symbol) + '_{' + (index === 'ref' ? String.raw`\mathrm{ref}` : index) + '}' + (star ? '^{*}' : '');
    if (!mathLabelCache.has(tex)) mathLabelCache.set(tex, katex.renderToString(tex, { throwOnError: true, strict: 'error', trust: false }));
    return mathLabelCache.get(tex);
  });
  const plain = (s) => String(s).replace(/_/g, '');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };

  // ------------------------------------------------------------------ colours / redraw
  const C = {};
  function readColors() {
    const cs = getComputedStyle(root);
    ['ink', 'ink-2', 'muted', 'grid', 'axis', 'surface', 'surface-2', 's1', 's2', 's3', 's4', 's5', 's7',
      'critical', 'good', 'fault-band', 'accent'].forEach((k) => { C[k] = cs.getPropertyValue('--' + k).trim(); });
  }
  const redrawers = [];
  const onRedraw = (fn) => { redrawers.push(fn); return fn; };
  function redrawAll() { readColors(); redrawers.slice().forEach((f) => f()); }
  readColors();

  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function watchSize(el, fn) {
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => fn()); observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }

  function niceTicks(a, b, n = 5) {
    const span = b - a;
    if (!(span > 0)) return [a];
    const s0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(s0))), e = s0 / mag;
    const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const fmtTick = (v) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v * 100) / 100) : String(+v.toFixed(2)));

  // Draw a framed axis box; returns mapping helpers
  function frame(ctx, w, h, xr, yr, o = {}) {
    const m = Object.assign({ l: 44, r: 10, t: 8, b: 22 }, o.margin || {});
    const X = (x) => m.l + (x - xr[0]) / (xr[1] - xr[0]) * (w - m.l - m.r);
    const Y = (y) => h - m.b - (y - yr[0]) / (yr[1] - yr[0]) * (h - m.t - m.b);
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    ctx.lineWidth = 1;
    // bands
    (o.bands || []).forEach((bd) => {
      ctx.fillStyle = bd.color || C['fault-band'];
      ctx.fillRect(X(bd.x0), m.t, X(bd.x1) - X(bd.x0), h - m.t - m.b);
    });
    ctx.strokeStyle = C.grid; ctx.fillStyle = C.muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    (o.yTicks || niceTicks(yr[0], yr[1], o.ny || 4)).forEach((v) => {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillText((o.yFmt || fmtTick)(v), m.l - 6, y);
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    (o.xTicks || niceTicks(xr[0], xr[1], o.nx || 5)).forEach((v) => {
      const x = Math.round(X(v)) + 0.5;
      if (o.xGrid) { ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke(); }
      ctx.fillText((o.xFmt || fmtTick)(v), x, h - m.b + 5);
    });
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(m.l + 0.5, m.t); ctx.lineTo(m.l + 0.5, h - m.b + 0.5); ctx.lineTo(w - m.r, h - m.b + 0.5); ctx.stroke();
    if (o.xLabel) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xLabel, w - m.r, h - m.b - 3); }
    return { X, Y, m, clip() { ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t - 1, w - m.l - m.r, h - m.t - m.b + 2); ctx.clip(); } };
  }

  function polyline(ctx, xs, ys, X, Y, i0, i1, step = 1) {
    ctx.beginPath();
    let first = true;
    for (let i = i0; i <= i1; i += step) {
      const x = X(xs(i)), y = Y(ys[i]);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ------------------------------------------------------------------ time-series plot
  // cfg: { n, dt, series:[{y, c, dash, name, w}], y:[lo,hi], unit, bands:[{x0,x1,color}], vlines:[{x,label,c}] }
  class TimePlot {
    constructor(canvas, cfg, group) {
      this.cv = canvas; this.cfg = cfg; this.group = group; this.play = null; this.hover = null;
      let wrap = canvas.parentElement;
      if (!wrap.classList.contains('plot-wrap')) {
        wrap = document.createElement('div'); wrap.className = 'plot-wrap';
        canvas.parentElement.insertBefore(wrap, canvas); wrap.appendChild(canvas);
      }
      this.tip = document.createElement('div'); this.tip.className = 'tooltip'; this.tip.hidden = true; wrap.appendChild(this.tip);
      canvas.addEventListener('pointermove', (e) => this.onMove(e));
      canvas.addEventListener('pointerleave', () => { this.setHover(null); this.tip.hidden = true; });
      this.unwatchSize = watchSize(canvas, () => this.draw());
      this.redraw = onRedraw(() => { if (canvas.isConnected) this.draw(); });
    }
    destroy() {
      this.unwatchSize();
      const index = redrawers.indexOf(this.redraw);
      if (index >= 0) redrawers.splice(index, 1);
    }
    setHover(i) { (this.group ? this.group.plots : [this]).forEach((p) => { p.hover = i; p.draw(); }); }
    onMove(e) {
      const r = this.cv.getBoundingClientRect();
      const { n, dt } = this.cfg, l = 44, rr = 10;
      const frac = (e.clientX - r.left - l) / (r.width - l - rr);
      if (frac < 0 || frac > 1) { this.setHover(null); this.tip.hidden = true; return; }
      const i = clamp(Math.round(frac * (n - 1)), 0, n - 1);
      this.setHover(i);
      const unit = this.cfg.unit || '';
      let html = `<div class="tt">t = ${(i * dt + (this.cfg.xStart || 0)).toFixed(3)} s</div>`;
      this.cfg.series.forEach((s) => {
        if (s.hideTip) return;
        html += `<div><span class="sw" style="background:${C[s.c] || s.c}"></span>${sub(s.name)}: <b>${(+s.y[i]).toFixed(s.dec ?? 2)}</b> ${unit}</div>`;
      });
      this.tip.innerHTML = html; this.tip.hidden = false;
      const x = e.clientX - r.left, tw = this.tip.offsetWidth;
      this.tip.style.left = (x + 14 + tw > r.width ? x - tw - 14 : x + 14) + 'px';
      this.tip.style.top = '6px';
    }
    draw() {
      const { ctx, w, h } = fit(this.cv);
      const { n, dt, series, y } = this.cfg;
      const T = (n - 1) * dt;
      const xStart = this.cfg.xStart || 0;
      const F = frame(ctx, w, h, [xStart, xStart + T], y, { bands: this.cfg.bands, nx: 5, ny: 4, xLabel: this.cfg.xLabel });
      const xs = (i) => i * dt + xStart;
      const play = this.play == null ? n - 1 : this.play;
      F.clip();
      const step = n > 2 * w ? 2 : 1;
      series.forEach((s) => {
        ctx.strokeStyle = C[s.c] || s.c; ctx.lineWidth = s.w || 1.4; ctx.setLineDash(s.dash ? [5, 4] : []);
        ctx.lineJoin = 'round';
        if (play < n - 1) { ctx.globalAlpha = 0.14; polyline(ctx, xs, s.y, F.X, F.Y, play, n - 1, step); }
        ctx.globalAlpha = s.alpha || 1;
        polyline(ctx, xs, s.y, F.X, F.Y, 0, play, step);
      });
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      (this.cfg.hlines || []).forEach((hl) => {
        ctx.strokeStyle = C[hl.c] || hl.c; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        const yy = Math.round(F.Y(hl.y)) + 0.5;
        ctx.beginPath(); ctx.moveTo(F.m.l, yy); ctx.lineTo(w - F.m.r, yy); ctx.stroke(); ctx.setLineDash([]);
      });
      ctx.restore();
      (this.cfg.vlines || []).forEach((vl) => {
        const x = Math.round(F.X(vl.x)) + 0.5;
        ctx.strokeStyle = C[vl.c] || C.critical; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, F.m.t); ctx.lineTo(x, h - F.m.b); ctx.stroke(); ctx.setLineDash([]);
        if (vl.label) { ctx.fillStyle = C[vl.c] || C.critical; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily; ctx.fillText(vl.label, x + 4, F.m.t + 2); }
      });
      if (this.play != null && this.play < n - 1) {
        const x = Math.round(F.X(xs(play))) + 0.5;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(x, F.m.t); ctx.lineTo(x, h - F.m.b); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (this.hover != null) {
        const x = Math.round(F.X(xs(this.hover))) + 0.5;
        ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, F.m.t); ctx.lineTo(x, h - F.m.b); ctx.stroke();
        series.forEach((s) => {
          const yv = s.y[this.hover]; if (yv < y[0] || yv > y[1]) return;
          ctx.fillStyle = C[s.c] || s.c; ctx.strokeStyle = C.surface; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(F.X(xs(this.hover)), F.Y(yv), 3.5, 0, 7); ctx.fill(); ctx.stroke();
        });
      }
    }
  }

  function rangeOf(arrs, pad = 0.08, symmetric = false) {
    let lo = Infinity, hi = -Infinity;
    arrs.forEach((a) => { for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; } });
    if (symmetric) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
    const p = (hi - lo) * pad || 1;
    const t = niceTicks(lo - p, hi + p, 4); const st = t.length > 1 ? t[1] - t[0] : 1;
    return [Math.floor((lo - p) / st) * st, Math.ceil((hi + p) / st) * st];
  }

  // ------------------------------------------------------------------ simple player (rAF clock)
  class Player {
    constructor({ n, fs, speed = 0.25, onFrame, onState, loop = false }) {
      Object.assign(this, { n, fs, speed, onFrame, onState, loop });
      this.idx = n - 1; this.running = false; this.last = 0;
      this._tick = (ts) => this.tick(ts);
    }
    start() {
      if (this.idx >= this.n - 1) this.idx = 0;
      this.running = true; this.last = performance.now(); this.onState && this.onState(true);
      requestAnimationFrame(this._tick);
    }
    stop() { this.running = false; this.onState && this.onState(false); }
    toggle() { this.running ? this.stop() : this.start(); }
    seek(i) { this.idx = clamp(Math.round(i), 0, this.n - 1); this.onFrame(this.idx); }
    tick(ts) {
      if (!this.running) return;
      const dt = clamp((ts - this.last) / 1000, 0, 0.1); this.last = ts;
      this.idx += dt * this.fs * this.speed;
      if (this.idx >= this.n - 1) {
        if (this.loop) this.idx = 0; else { this.idx = this.n - 1; this.onFrame(this.idx); this.stop(); return; }
      }
      this.onFrame(Math.floor(this.idx));
      requestAnimationFrame(this._tick);
    }
  }
  function wirePlayButton(btn, player) {
    btn.addEventListener('click', () => player.toggle());
    const lbl = btn.querySelector('.lbl');
    const path = btn.querySelector('path');
    return (running) => {
      path.setAttribute('d', running ? 'M2 1h2v8H2zM6 1h2v8H6z' : 'M2 1l7 4-7 4z');
      if (lbl) lbl.innerHTML = running ? '<span class="en">Pause</span><span class="zh">暂停</span>' : '<span class="en">Play</span><span class="zh">播放</span>';
    };
  }
  function whenVisible(el, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold: 0.35 });
    io.observe(el);
  }

  // ------------------------------------------------------------------ experiment helpers
  function vmagPhase(d) {
    const out = new Float32Array(d.n);
    for (let i = 0; i < d.n; i++) out[i] = Math.sqrt((d.ua[i] ** 2 + d.ub[i] ** 2 + d.uc[i] ** 2) * 2 / 3);
    return out;
  }
  // fault occurrence / clearance from the voltage magnitude (sustained 10 samples)
  function faultMarks(d) {
    if (!d.ua) return { f: 500, c: 1000 };
    const v = vmagPhase(d);
    let ref = 0; for (let i = 0; i < 200; i++) ref += v[i] / 200;
    const thr = 0.6 * ref;
    const sustained = (i, below) => { for (let k = i; k < Math.min(d.n, i + 10); k++) if ((v[k] < thr) !== below) return false; return true; };
    let f = -1, c = -1;
    for (let i = 0; i < d.n - 10; i++) if (sustained(i, true)) { f = i; break; }
    if (f >= 0) for (let i = f + 50; i < d.n - 10; i++) if (sustained(i, false)) { c = i; break; }
    return { f, c, v, ref };
  }
  const peakAbs = (a, i0 = 0, i1 = a.length - 1) => { let m = 0; for (let i = i0; i <= i1; i++) m = Math.max(m, Math.abs(a[i])); return m; };

  // ================================================================== HERO
  (function hero() {
    const d = EXP.sym_sl, mk = faultMarks(d);
    const dial = $('#heroDial'), spark = $('#heroSpark');
    $('#heroPeak').textContent = Math.round(peakAbs(d.err)) + '°';
    let k = 0, phi = 0, last = performance.now(), paused = reduceMotion;
    const heroPlay = $('#heroPlay');
    function syncHeroButton() {
      heroPlay.innerHTML = paused ? '<span class="en">Play</span><span class="zh">播放</span>' : '<span class="en">Pause</span><span class="zh">暂停</span>';
      heroPlay.setAttribute('aria-pressed', String(paused));
      heroPlay.setAttribute('aria-label', paused ? tr('Play rotor animation', '播放转子动画') : tr('Pause rotor animation', '暂停转子动画'));
    }
    heroPlay.addEventListener('click', () => { paused = !paused; syncHeroButton(); });
    syncHeroButton();
    onRedraw(syncHeroButton);
    if (reduceMotion) k = mk.f + 60;
    function drawDial() {
      const { ctx, w, h } = fit(dial);
      const cx = w / 2, cy = h * 0.47, R = Math.min(w, h) * 0.335;
      const i = Math.floor(k), vr = clamp(mk.v[i] / mk.ref, 0, 1.1);
      const inFault = i >= mk.f && (mk.c < 0 || i < mk.c);
      const dark = getComputedStyle(root).colorScheme === 'dark';
      const font = getComputedStyle(document.body).fontFamily;
      const TAU = Math.PI * 2;
      const circle = (x, y, r, fill, stroke, line = 1) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
      };
      const metal = (r, stops) => {
        const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        stops.forEach(([t, c]) => g.addColorStop(t, c)); return g;
      };
      const silver = metal(R, [[0, '#edf1f2'], [.24, '#9cabb0'], [.44, '#dce4e6'], [.65, '#6b7e85'], [1, '#bcc9cd']]);
      const steel = metal(R, [[0, '#a7b7bd'], [.38, '#617780'], [.55, '#8b9fa6'], [1, '#425d68']]);
      const copper = metal(R, [[0, '#f2ce92'], [.36, '#c98c53'], [.7, '#8b4c2b'], [1, '#d5a267']]);
      // Gauge and calibrated ticks remain separate from the mechanical cross-section.
      const gauge = R * 1.19;
      ctx.lineCap = 'round'; ctx.lineWidth = 5;
      circle(cx, cy, gauge, null, C['surface-2'], 5);
      ctx.beginPath(); ctx.arc(cx, cy, gauge, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, vr));
      ctx.strokeStyle = inFault ? C.critical : C.s1; ctx.stroke();
      for (let j = 0; j < 60; j++) {
        const a = j * TAU / 60, r0 = R * (j % 5 ? 1.115 : 1.09);
        ctx.strokeStyle = C.axis; ctx.lineWidth = j % 5 ? .6 : 1;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * R * 1.135, cy + Math.sin(a) * R * 1.135); ctx.stroke();
      }
      // Cast housing, machined flange, cooling ribs and eight socket-head bolts.
      ctx.save(); ctx.shadowColor = 'rgba(9,28,36,.18)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
      circle(cx, cy, R * 1.035, silver, '#60767f', 1.1); ctx.restore();
      for (let j = 0; j < 64; j++) {
        const a = j * TAU / 64;
        ctx.strokeStyle = j % 2 ? '#758b94' : '#dae4e7'; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * .975, cy + Math.sin(a) * R * .975);
        ctx.lineTo(cx + Math.cos(a) * R * 1.028, cy + Math.sin(a) * R * 1.028); ctx.stroke();
      }
      circle(cx, cy, R * .96, steel, '#dce5e7', 1);
      circle(cx, cy, R * .90, '#344b55', '#b8c8ce', 1);
      for (let j = 0; j < 8; j++) {
        const a = (j + .5) * TAU / 8, x = cx + Math.cos(a) * R * .965, y = cy + Math.sin(a) * R * .965;
        circle(x, y, R * .025, '#71858d', '#e0e8eb', .75);
        ctx.beginPath();
        for (let z = 0; z < 6; z++) {
          const b = z * TAU / 6; ctx[z ? 'lineTo' : 'moveTo'](x + Math.cos(b) * R * .012, y + Math.sin(b) * R * .012);
        }
        ctx.closePath(); ctx.fillStyle = '#2e444d'; ctx.fill();
      }
      // Stator laminations and copper coils within 36 stationary slots.
      for (let j = 0; j < 6; j++) circle(cx, cy, R * (.775 + j * .018), null, 'rgba(181,201,208,.3)', .6);
      for (let j = 0; j < 36; j++) {
        const a = j * TAU / 36;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        ctx.fillStyle = '#243b45'; ctx.fillRect(R * .716, -R * .027, R * .16, R * .054);
        ctx.fillStyle = copper; ctx.fillRect(R * .745, -R * .018, R * .115, R * .036);
        ctx.strokeStyle = '#f1cc92'; ctx.lineWidth = .55;
        for (let z = 0; z < 3; z++) {
          ctx.beginPath(); ctx.moveTo(R * (.759 + z * .035), -R * .015); ctx.lineTo(R * (.759 + z * .035), R * .015); ctx.stroke();
        }
        ctx.restore();
      }
      // Air gap: a visible continuous ring between stationary and rotating iron.
      circle(cx, cy, R * .707, dark ? '#14232a' : '#e5eeed', '#a3b7bd', 1);
      circle(cx, cy, R * .667, steel, '#d5e0e2', 1.2);
      // Wound rotor: iron laminations, embedded winding slots and ventilation holes.
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(phi);
      for (let j = 0; j < 5; j++) circle(0, 0, R * (.46 + j * .037), null, 'rgba(205,221,226,.25)', .6);
      for (let j = 0; j < 24; j++) {
        ctx.save(); ctx.rotate(j * TAU / 24);
        ctx.fillStyle = '#29434e'; ctx.fillRect(R * .526, -R * .022, R * .125, R * .044);
        ctx.fillStyle = copper; ctx.fillRect(R * .545, -R * .013, R * .096, R * .026);
        ctx.restore();
      }
      for (let j = 0; j < 6; j++) {
        const a = j * TAU / 6, x = Math.cos(a) * R * .397, y = Math.sin(a) * R * .397;
        circle(x, y, R * .062, '#233e49', '#b0c1c7', .8);
        circle(x - R * .009, y - R * .009, R * .043, '#192f39');
      }
      // A unique keyed hub and fasteners make rotation visible even with symmetric slots.
      circle(0, 0, R * .285, silver, '#344f5c', 1);
      for (let j = 0; j < 4; j++) {
        const a = j * TAU / 4 + Math.PI / 4;
        circle(Math.cos(a) * R * .23, Math.sin(a) * R * .23, R * .018, '#334e59', '#c8d6da', .7);
      }
      circle(0, 0, R * .18, '#314d59', '#d9e3e6', 1.2);
      for (let j = 0; j < 12; j++) {
        const a = j * TAU / 12;
        circle(Math.cos(a) * R * .155, Math.sin(a) * R * .155, R * .015, '#c4d0d4', '#edf3f4', .5);
      }
      circle(0, 0, R * .132, silver, '#506a74', 1);
      ctx.fillStyle = '#324d58'; ctx.fillRect(R * .075, -R * .025, R * .066, R * .05);
      ctx.fillStyle = '#e7c18b'; ctx.fillRect(R * .082, -R * .017, R * .047, R * .034);
      // Encoder-reference marker rotates with the rotor.
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(R * .29, 0); ctx.lineTo(R * .64, 0); ctx.stroke();
      ctx.restore();
      // Sensorless position is offset by the recorded angle error, without exaggeration.
      const est = phi - d.err[i] * Math.PI / 180;
      ctx.strokeStyle = C.s1; ctx.lineWidth = 2.1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(est) * R * .29, cy + Math.sin(est) * R * .29);
      ctx.lineTo(cx + Math.cos(est) * R * .74, cy + Math.sin(est) * R * .74); ctx.stroke();
      circle(cx + Math.cos(est) * R * .74, cy + Math.sin(est) * R * .74, 2.8, C.s1, C.surface, 1);
      // Discrete engineering callouts sit outside the housing.
      ctx.font = (w < 350 ? '10px ' : '11px ') + font;
      ctx.fillStyle = C['ink-2']; ctx.textBaseline = 'middle';
      function callout(text, a, right, radius) {
        const x = cx + Math.cos(a) * R * radius, y = cy + Math.sin(a) * R * radius;
        const ex = right ? w - 3 : 3, ey = cy + Math.sin(a) * R * 1.34;
        ctx.strokeStyle = C.axis; ctx.lineWidth = .7;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx + Math.cos(a) * R * 1.10, ey); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.textAlign = right ? 'right' : 'left'; ctx.fillText(text, ex, ey - 10);
      }
      callout(tr('Stator · copper coils', '定子 · 铜绕组'), -2.25, false, .82);
      callout(tr('Wound rotor', '绕线转子'), -.80, true, .57);
      callout(tr('Air gap', '气隙'), 2.25, false, .69);
      callout(tr('Shaft & bearing', '转轴与轴承'), .80, true, .155);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = inFault ? C.critical : C['ink-2']; ctx.font = '600 12px ' + font;
      ctx.fillText(tr('GRID VOLTAGE  ', '电网电压  ') + Math.round(vr * 100) + '%', cx, 16);
      ctx.fillStyle = C.ink; ctx.font = '500 19px ' + font;
      ctx.fillText('Δθ = ' + (d.err[i] >= 0 ? '+' : '') + d.err[i].toFixed(1) + '°', cx, h - 21);
    }
    function drawSpark() {
      const { ctx, w, h } = fit(spark);
      const F = frame(ctx, w, h, [0, (d.n - 1) / EXP.fs], [-10, 10], { margin: { l: 30, b: 16, t: 4 }, yTicks: [-10, 0, 10], xTicks: [], bands: mk.f > 0 ? [{ x0: mk.f / EXP.fs, x1: (mk.c > 0 ? mk.c : d.n) / EXP.fs }] : [] });
      F.clip();
      ctx.strokeStyle = C.s1; ctx.lineWidth = 1.3;
      polyline(ctx, (j) => j / EXP.fs, d.err, F.X, F.Y, 0, Math.floor(k));
      ctx.restore();
      ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(tr('Δθ (°) · measured', 'Δθ (°) · 实测'), 34, h - 14);
    }
    function frameFn(ts) {
      const dt = clamp((ts - last) / 1000, 0, 0.05); last = ts;
      if (!paused && !document.hidden) {
        k += dt * EXP.fs * 0.3; if (k >= d.n - 1) k = 0;
        phi += dt * 2 * Math.PI * 0.35;
      }
      drawDial(); drawSpark();
      requestAnimationFrame(frameFn);
    }
    requestAnimationFrame(frameFn);
  })();

  // ================================================================== 1. PROBLEM
  (function problem() {
    const RSC_LIMIT = 0.45;
    const fluxCv = $('#s1Flux'), emfCv = $('#s1Emf');
    let type = 'sym', dip = 0.8, sim, k = 0, running = false, last = 0;
    function compute() {
      sim = M.fluxTrajectory({ dip, type });
      $('#s1DipOut').textContent = Math.round(dip * 100) + '%';
      $('#s1Nat').textContent = sim.nat0.toFixed(2) + ' p.u.';
      const r = Math.max(...sim.emf) / RSC_LIMIT;
      $('#s1Ratio').textContent = r.toFixed(1) + '×';
      $('#s1EmfBox').className = 'ro ' + (r > 1 ? 'bad' : 'ok');
    }
    function draw() {
      const n = sim.t.length, i = Math.min(n - 1, Math.floor(k));
      // flux plane
      let { ctx, w, h } = fit(fluxCv);
      const L = 1.9;
      let F = frame(ctx, w, h, [-L, L], [-L, L], { margin: { l: 30, r: 8, t: 8, b: 22 }, xTicks: [-1, 0, 1], yTicks: [-1, 0, 1], xGrid: true });
      ctx.strokeStyle = C.axis; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.ellipse(F.X(0), F.Y(0), F.X(1) - F.X(0), F.Y(0) - F.Y(1), 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      F.clip();
      const tail = Math.floor(0.06 / (sim.t[1] - sim.t[0]));
      ctx.lineWidth = 1.2; ctx.strokeStyle = C.s1; ctx.globalAlpha = 0.25;
      polyline(ctx, (j) => sim.a[j], sim.b, F.X, F.Y, 0, i);
      ctx.globalAlpha = 1; ctx.lineWidth = 2.2;
      polyline(ctx, (j) => sim.a[j], sim.b, F.X, F.Y, Math.max(0, i - tail), i);
      // natural component (DC offset of the circle centre)
      if (sim.t[i] >= sim.tFault && sim.nat0 > 0.01) {
        const d = Math.exp(-(sim.t[i] - sim.tFault) / M.TAU_S);
        const j = Math.round(sim.tFault / (sim.t[1] - sim.t[0]));
        const f = M.dipSequences(dip, type);
        const W = M.W0, tf = sim.t[j];
        const pre = [Math.sin(W * tf), -Math.cos(W * tf)];
        const post = [(f.v1 + f.v2) * Math.sin(W * tf), (-f.v1 + f.v2) * Math.cos(W * tf)];
        const na = (pre[0] - post[0]) * d, nb = (pre[1] - post[1]) * d;
        ctx.strokeStyle = C.s2; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(F.X(0), F.Y(0)); ctx.lineTo(F.X(na), F.Y(nb)); ctx.stroke();
        ctx.fillStyle = C.s2; ctx.beginPath(); ctx.arc(F.X(na), F.Y(nb), 4, 0, 7); ctx.fill();
        ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily;
        const right = F.X(na) > w * 0.55;
        ctx.textAlign = right ? 'right' : 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(tr('natural DC flux ψsn', '暂态直流磁链 ψsn'), F.X(na) + (right ? -8 : 8), F.Y(nb) - 6);
      }
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(F.X(sim.a[i]), F.Y(sim.b[i]), 4.5, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText((sim.t[i] < sim.tFault ? tr('pre-fault', '故障前') : tr('fault', '故障中')) + '  t = ' + ((sim.t[i] - sim.tFault) * 1000).toFixed(0) + ' ms', F.m.l + 6, F.m.t + 4);
      // EMF plot
      ({ ctx, w, h } = fit(emfCv));
      const ymax = Math.max(1.5, Math.ceil(Math.max(...sim.emf) * 2) / 2 + 0.2);
      F = frame(ctx, w, h, [0, sim.t[n - 1] - sim.tFault + 0.045], [0, ymax], { margin: { l: 32, r: 8 }, bands: [{ x0: 0.045, x1: 1 }], xFmt: (v) => v.toFixed(1), xLabel: 't (s)' });
      F.clip();
      ctx.strokeStyle = C.critical; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(F.X(0), F.Y(RSC_LIMIT)); ctx.lineTo(w, F.Y(RSC_LIMIT)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = C.s2; ctx.lineWidth = 2;
      polyline(ctx, (j) => sim.t[j], sim.emf, F.X, F.Y, 0, i);
      ctx.restore();
      ctx.fillStyle = C.critical; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily;
      ctx.fillText(tr('RSC voltage limit (typical)', 'RSC 电压上限（典型值）'), w - 10, F.Y(RSC_LIMIT) - 3);
    }
    function loop(ts) {
      if (!running) return;
      const dt = clamp((ts - last) / 1000, 0, 0.05); last = ts;
      k += dt / 8 / (sim.t[1] - sim.t[0]);
      if (k >= sim.t.length - 1) { k = sim.t.length - 1; running = false; }
      draw();
      if (running) requestAnimationFrame(loop);
    }
    function replay() { k = 0; if (reduceMotion) { k = sim.t.length - 1; draw(); return; } if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
    $('#s1Dip').addEventListener('input', (e) => { dip = e.target.value / 100; compute(); k = sim.t.length - 1; draw(); });
    $$('#s1Type button').forEach((b) => b.addEventListener('click', () => {
      $$('#s1Type button').forEach((x) => x.classList.toggle('on', x === b)); type = b.dataset.v; compute(); replay();
    }));
    $('#s1Play').addEventListener('click', replay);
    compute(); k = sim.t.length - 1;
    [fluxCv, emfCv].forEach((c) => watchSize(c, draw));
    onRedraw(draw);
    whenVisible(fluxCv, replay);
  })();

  // ================================================================== 2. ERROR FUNCTION
  (function errorFunction() {
    const errCv = $('#s2Err'), polCv = $('#s2Poles'), respCv = $('#s2Resp');
    let e0 = 150, gain = 0.3, rip = 3, resp;
    const gEff = () => (Math.abs(e0) < 1e-6 ? gain : gain * Math.sin(e0 / DEG) / (e0 / DEG));
    const DEG = M.DEG;
    function compute() {
      resp = M.observerResponse({ e0Deg: e0, gain, ripple: rip });
      $('#s2E0Out').textContent = e0 + '°';
      $('#s2GainOut').textContent = gain.toFixed(2) + '×';
      $('#s2RipOut').textContent = rip + '°';
      const g = gEff();
      $('#s2G').textContent = g.toFixed(2) + (g < 0.3 ? tr(' · sluggish', ' · 迟缓') : '');
      $('#s2GBox').className = 'ro ' + (g < 0.3 ? 'bad' : g < 0.7 ? '' : 'ok');
    }
    function drawErr() {
      const { ctx, w, h } = fit(errCv);
      const F = frame(ctx, w, h, [-180, 180], [-3.4, 3.4], { margin: { l: 30, r: 8 }, xTicks: [-180, -90, 0, 90, 180], yTicks: [-3, 0, 3], xLabel: 'Δθ (°)', xGrid: true,
        bands: [{ x0: -180, x1: -90, color: C['fault-band'] }, { x0: 90, x1: 180, color: C['fault-band'] }] });
      F.clip();
      const N = 240, xs = (j) => -180 + 360 * j / N;
      const cross = [], at = [];
      for (let j = 0; j <= N; j++) { cross.push(gain * Math.sin(xs(j) / DEG)); at.push(xs(j) / DEG); }
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.s1; polyline(ctx, xs, at, F.X, F.Y, 0, N);
      ctx.strokeStyle = C.s2; polyline(ctx, xs, cross, F.X, F.Y, 0, N);
      const x = F.X(e0);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.setLineDash([]);
      [[C.s1, e0 / DEG], [C.s2, gain * Math.sin(e0 / DEG)]].forEach(([c, v]) => {
        ctx.fillStyle = c; ctx.strokeStyle = C.surface; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, F.Y(v), 5, 0, 7); ctx.fill(); ctx.stroke();
      });
      ctx.restore();
      ctx.fillStyle = C.critical; ctx.font = '11px ' + getComputedStyle(document.body).fontFamily; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(tr('weakening', '纠偏减弱'), F.X(135), F.m.t + 4);
      ctx.fillText(tr('weakening', '纠偏减弱'), F.X(-135), F.m.t + 4);
    }
    function drawPoles() {
      const { ctx, w, h } = fit(polCv);
      const xr = [-400, 200], yr = [-250, 250];
      const F = frame(ctx, w, h, xr, yr, { margin: { l: 36, r: 8 }, xTicks: [-400, -200, 0, 200], yTicks: [-200, 0, 200], xGrid: true, xLabel: 'Re',
        bands: [{ x0: 0, x1: 200, color: C['fault-band'] }] });
      const mark = (p, c, cross) => {
        let x = p[0], y = p[1], off = false;
        if (x < xr[0]) { x = xr[0] + 8; off = true; } if (x > xr[1]) { x = xr[1] - 8; off = true; }
        const X = F.X(x), Y = F.Y(clamp(y, yr[0], yr[1]));
        ctx.strokeStyle = c; ctx.lineWidth = 2.4;
        if (cross) { ctx.beginPath(); ctx.moveTo(X - 6, Y - 6); ctx.lineTo(X + 6, Y + 6); ctx.moveTo(X + 6, Y - 6); ctx.lineTo(X - 6, Y + 6); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(X, Y, 6, 0, 7); ctx.stroke(); }
        if (off) { ctx.fillStyle = c; ctx.textAlign = p[0] < 0 ? 'left' : 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(Math.round(p[0]) + ' ◂', X + (p[0] < 0 ? 4 : -4), Y - 7); }
      };
      ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
      M.poles(1).forEach((p) => mark(p, C.s1, false));
      M.poles(gEff()).forEach((p) => mark(p, C.s2, true));
      ctx.fillStyle = C.critical; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(tr('unstable region', '不稳定区'), w - 12, F.m.t + 4);
      ctx.fillStyle = C.muted; ctx.textAlign = 'left';
      ctx.fillText(tr('faster ←', '更快 ←'), F.m.l + 4, F.m.t + 4);
    }
    let rp;
    function buildResp() {
      const n = resp.atan2.e.length;
      const cfg = { n, dt: 1e-3, unit: '°', y: [-180, 180], series: [
        { y: resp.cross.e, c: 's2', name: tr('cross product', '叉乘'), dec: 1, w: 1.8 },
        { y: resp.atan2.e, c: 's1', name: 'atan2', dec: 1, w: 1.8 }],
        hlines: [{ y: 0, c: 'axis' }] };
      if (!rp) rp = new TimePlot(respCv, cfg); else { rp.cfg = cfg; rp.draw(); }
    }
    function all() { compute(); drawErr(); drawPoles(); buildResp(); }
    $('#s2E0').addEventListener('input', (e) => { e0 = +e.target.value; all(); });
    $('#s2Gain').addEventListener('input', (e) => { gain = +e.target.value; all(); });
    $('#s2Rip').addEventListener('input', (e) => { rip = +e.target.value; all(); });
    // drag on the error-function plot sets Δθ0
    const dragTo = (ev) => {
      const r = errCv.getBoundingClientRect();
      const v = clamp(Math.round(-180 + (ev.clientX - r.left - 30) / (r.width - 38) * 360), -175, 175);
      e0 = v; $('#s2E0').value = v; all();
    };
    let dragging = false;
    errCv.style.cursor = 'ew-resize';
    errCv.addEventListener('pointerdown', (e) => { dragging = true; errCv.setPointerCapture(e.pointerId); dragTo(e); });
    errCv.addEventListener('pointermove', (e) => { if (dragging) dragTo(e); });
    errCv.addEventListener('pointerup', () => { dragging = false; });
    all();
    [errCv, polCv].forEach((c) => watchSize(c, () => { drawErr(); drawPoles(); }));
    onRedraw(() => { drawErr(); drawPoles(); buildResp(); });
  })();

  // ================================================================== 3. FLUX OBSERVER
  (function fluxObserver() {
    const fluxCv = $('#s3Flux'), errCv = $('#s3ErrPlot'), voltCv = $('#s3Volt');
    const show = { ideal: false, conv: true, prop: true };
    const META = {
      ideal: { c: 's4', en: 'pure integrator', zh: '纯积分器' },
      conv: { c: 's2', en: 'DC-blocking', zh: '隔直积分' },
      prop: { c: 's1', en: 'mode-switching (proposed)', zh: '模式切换（本文）' },
    };
    const DEC = 10; // 10 kHz sim -> 1 kHz display
    let sim, ds, ep;
    const player = new Player({ n: 1, fs: 1000, speed: 1 / 6, onFrame: (i) => frameAt(i) });
    function compute(voff) {
      sim = M.fluxObserverSim({ voffPct: voff });
      const n = Math.floor((sim.n - 1) / DEC) + 1;
      const pick = (a) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[i * DEC]; return o; };
      ds = { n, ta: pick(sim.ta), tb: pick(sim.tb), ia: pick(sim.ia), ib: pick(sim.ib), ca: pick(sim.ca), cb: pick(sim.cb),
        pa: pick(sim.pa), pb: pick(sim.pb), mode: pick(sim.mode), v: pick(sim.vmag),
        eI: pick(sim.eIdeal), eC: pick(sim.eConv), eP: pick(sim.eProp) };
      player.n = n;
      $('#s3VoffOut').textContent = voff.toFixed(1) + '%';
      $('#s3PkIdeal').textContent = peakAbs(ds.eI).toFixed(2);
      $('#s3PkConv').textContent = peakAbs(ds.eC).toFixed(2);
      $('#s3PkProp').textContent = peakAbs(ds.eP).toFixed(2);
      $('#s3RoIdeal').className = 'ro ' + (peakAbs(ds.eI) > 0.1 ? 'bad' : '');
      // retention window: from fault until the observer returns to steady mode
      let back = ds.n - 1; for (let i = Math.round(sim.tClear * 1000); i < ds.n; i++) if (!ds.mode[i]) { back = i; break; }
      const cfg = { n: ds.n, dt: 1e-3, unit: 'p.u.', y: [0, 0.8], series: [],
        bands: [{ x0: sim.tFault, x1: sim.tClear }, { x0: sim.tClear, x1: back / 1000, color: C['accent'] ? hexA(C.accent, 0.08) : undefined }] };
      ['ideal', 'conv', 'prop'].forEach((k) => {
        if (!show[k]) return;
        cfg.series.push({ y: k === 'ideal' ? ds.eI : k === 'conv' ? ds.eC : ds.eP, c: META[k].c, name: tr(META[k].en, META[k].zh), dec: 3, w: 1.8 });
      });
      if (!ep) ep = new TimePlot(errCv, cfg); else ep.cfg = cfg;
      $('#s3Legend').innerHTML = ['ideal', 'conv', 'prop'].filter((k) => show[k]).map((k) => `<span><i style="border-color:var(--${META[k].c})"></i>${tr(META[k].en, META[k].zh)}</span>`).join('');
      $('#s3Scrub').max = ds.n - 1;
      frameAt(Math.min(Math.floor(player.idx), ds.n - 1));
    }
    function hexA(hex, a) {
      const m = hex.match(/^#([0-9a-f]{6})$/i); if (!m) return hex;
      const v = parseInt(m[1], 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
    }
    function drawFlux(i) {
      const { ctx, w, h } = fit(fluxCv);
      const L = 1.6;
      const F = frame(ctx, w, h, [-L, L], [-L, L], { margin: { l: 28, r: 6, t: 6, b: 20 }, xTicks: [-1, 0, 1], yTicks: [-1, 0, 1], xGrid: true });
      F.clip();
      const from = Math.max(0, i - 120);
      const tail = (xa, ya, c, wdt) => {
        ctx.strokeStyle = c; ctx.lineWidth = wdt; ctx.globalAlpha = 1;
        polyline(ctx, (j) => xa[j], ya, F.X, F.Y, from, i);
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(F.X(xa[i]), F.Y(ya[i]), 4, 0, 7); ctx.fill();
      };
      tail(ds.ta, ds.tb, C['ink-2'], 3.5);
      if (show.ideal) tail(ds.ia, ds.ib, C.s4, 1.6);
      if (show.conv) tail(ds.ca, ds.cb, C.s2, 1.6);
      if (show.prop) tail(ds.pa, ds.pb, C.s1, 1.6);
      ctx.restore();
    }
    function drawVolt(i) {
      const { ctx, w, h } = fit(voltCv);
      const F = frame(ctx, w, h, [0, (ds.n - 1) / 1000], [0, 1.1], { margin: { l: 44, r: 10, t: 4, b: 16 }, yTicks: [0.2, 1], xTicks: [] });
      // mode band
      for (let j = 0; j < ds.n; j++) if (ds.mode[j]) { ctx.fillStyle = C['fault-band']; ctx.fillRect(F.X(j / 1000), F.m.t, F.X(1 / 1000) - F.X(0) + 0.6, h - F.m.t - F.m.b); }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6;
      polyline(ctx, (j) => j / 1000, ds.v, F.X, F.Y, 0, ds.n - 1);
      ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(F.X(i / 1000), F.m.t); ctx.lineTo(F.X(i / 1000), h - F.m.b); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(tr('|vs| (p.u.) · shaded: proposed in fault mode', '|vs|（p.u.）· 阴影：本文处于故障模式'), F.m.l + 4, h - 2);
    }
    function frameAt(i) {
      i = clamp(i, 0, ds.n - 1);
      drawFlux(i); drawVolt(i);
      ep.play = i >= ds.n - 1 ? null : i; ep.draw();
      $('#s3Scrub').value = i;
      $('#s3Time').textContent = (i / 1000).toFixed(3) + ' s';
      const f = ds.mode[i] === 1;
      const lamp = $('#s3Lamp');
      lamp.classList.toggle('fault', f);
      lamp.innerHTML = f ? '<span class="en">Fault mode · open loop</span><span class="zh">故障模式 · 开环积分</span>' : '<span class="en">Steady mode · closed loop</span><span class="zh">稳态模式 · 闭环</span>';
    }
    const setBtn = wirePlayButton($('#s3Play'), player);
    player.onState = setBtn;
    $('#s3Scrub').addEventListener('input', (e) => { player.stop(); player.seek(+e.target.value); });
    $('#s3Voff').addEventListener('input', (e) => compute(+e.target.value));
    $$('#s3Show button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.v; show[k] = !show[k]; b.classList.toggle('on', show[k]); compute(+$('#s3Voff').value);
    }));
    compute(1);
    player.idx = ds.n - 1; frameAt(ds.n - 1);
    [fluxCv, voltCv].forEach((c) => watchSize(c, () => frameAt(Math.floor(player.idx))));
    onRedraw(() => compute(+$('#s3Voff').value));
    whenVisible(fluxCv, () => { if (!reduceMotion) player.start(); });
  })();

  // ================================================================== 4. SATURATION LUT
  (function saturation() {
    const cv = $('#s4Curve');
    let psi = 1.2, is = 1.0, anim = null;
    const IS_ANGLE = -80;
    function update() {
      const r = M.lutError(psi, is, IS_ANGLE);
      $('#s4PsiOut').textContent = psi.toFixed(2) + ' p.u.';
      $('#s4IsOut').textContent = is.toFixed(1) + ' p.u.';
      $('#s4Lm').textContent = r.LmTrue.toFixed(2);
      $('#s4ErrN').textContent = Math.abs(r.nominal).toFixed(1) + '°';
      $('#s4ErrL').textContent = Math.abs(r.withLut).toFixed(2) + '°';
      $('#s4Psi').value = psi; $('#s4Is').value = is;
      draw();
    }
    let F;
    function draw() {
      const { ctx, w, h } = fit(cv);
      F = frame(ctx, w, h, [0, 1.5], [0, 1.4], { margin: { l: 40, r: 10, b: 24 }, xTicks: [0, 0.5, 1, 1.5], yTicks: [0, 0.5, 1], xGrid: true, xLabel: '|ψm| (p.u.)',
        bands: [{ x0: 1, x1: 1.5, color: C['fault-band'] }] });
      F.clip();
      const N = 200, xs = (j) => 0.02 + 1.48 * j / N, ys = [];
      for (let j = 0; j <= N; j++) ys.push(M.lmOf(xs(j)));
      ctx.strokeStyle = C.s1; ctx.lineWidth = 2.2; polyline(ctx, xs, ys, F.X, F.Y, 0, N);
      ctx.strokeStyle = C.s2; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(F.X(0), F.Y(1)); ctx.lineTo(F.X(1.5), F.Y(1)); ctx.stroke(); ctx.setLineDash([]);
      M.LUT.forEach(([p, l]) => { if (p < 0.02) return; ctx.fillStyle = C.s3; ctx.beginPath(); ctx.arc(F.X(p), F.Y(l), 3, 0, 7); ctx.fill(); });
      // operating point
      const lm = M.lmOf(psi);
      ctx.strokeStyle = C.ink; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(F.X(psi), F.Y(0)); ctx.lineTo(F.X(psi), F.Y(Math.max(1, lm))); ctx.stroke(); ctx.setLineDash([]);
      if (Math.abs(lm - 1) > 0.02) {
        ctx.strokeStyle = C.critical; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(F.X(psi), F.Y(1)); ctx.lineTo(F.X(psi), F.Y(lm)); ctx.stroke();
      }
      ctx.fillStyle = C.surface; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(F.X(psi), F.Y(lm), 8, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Lm / Lm,N', F.m.l + 4, F.m.t + 2);
      ctx.fillStyle = C.critical; ctx.textAlign = 'right';
      ctx.fillText(tr('saturation', '饱和区'), F.X(1.5) - 4, F.m.t + 2);
      ctx.fillStyle = C['ink-2']; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(tr('rated (knee)', '额定点（膝点）'), F.X(1), F.Y(1) - 10);
    }
    let dragging = false;
    const dragTo = (e) => {
      const r = cv.getBoundingClientRect();
      psi = clamp(+((e.clientX - r.left - 40) / (r.width - 50) * 1.5).toFixed(2), 0.2, 1.4); update();
    };
    cv.style.cursor = 'grab';
    cv.addEventListener('pointerdown', (e) => { dragging = true; cv.setPointerCapture(e.pointerId); if (anim) anim = null; dragTo(e); });
    cv.addEventListener('pointermove', (e) => { if (dragging) dragTo(e); });
    cv.addEventListener('pointerup', () => { dragging = false; });
    $('#s4Psi').addEventListener('input', (e) => { psi = +e.target.value; update(); });
    $('#s4Is').addEventListener('input', (e) => { is = +e.target.value; update(); });
    // fault surge: rated → saturated peak → dip level → recovery (key-frames, 3 s)
    const KEYS = [[0, 1.0, 1.0], [0.25, 1.36, 2.3], [1.0, 1.05, 1.6], [1.8, 0.35, 1.1], [2.4, 0.9, 1.0], [3.0, 1.0, 1.0]];
    $('#s4Surge').addEventListener('click', () => {
      const t0 = performance.now(); anim = t0;
      const step = (ts) => {
        if (anim !== t0) return;
        const t = (ts - t0) / 1000;
        let j = 0; while (j < KEYS.length - 2 && t > KEYS[j + 1][0]) j++;
        const [ta, pa, ia] = KEYS[j], [tb, pb, ib] = KEYS[j + 1];
        const u = clamp((t - ta) / (tb - ta), 0, 1), s = u * u * (3 - 2 * u);
        psi = pa + (pb - pa) * s; is = ia + (ib - ia) * s; update();
        if (t < KEYS[KEYS.length - 1][0]) requestAnimationFrame(step); else anim = null;
      };
      requestAnimationFrame(step);
    });
    update();
    watchSize(cv, draw);
    onRedraw(draw);
  })();

  // ================================================================== 5. EXPERIMENT PLAYER
  (function experiments() {
    const grid = $('#s5Grid');
    const PH = [['s1', 'a'], ['s2', 'b'], ['s3', 'c']];
    const CASES = {
      step: {
        sl: 'step', enc: null,
        en: 'Active-power reference stepped from 2 kW to 3 kW under a healthy grid (Fig. 7).',
        zh: '电网正常，有功功率指令由 2 kW 阶跃至 3 kW（图 7）。',
        panels: [
          { t: ['Stator phase voltage u_s,abc', '定子相电压 u_s,abc'], unit: 'V', ch: PH.map(([c, p]) => ({ k: 'u' + p, c, n: 'u_s' + p })) },
          { t: ['Stator current i_s,abc', '定子电流 i_s,abc'], unit: 'A', ch: PH.map(([c, p]) => ({ k: 'is' + p, c, n: 'i_s' + p })) },
          { t: ['Rotor current i_r,abc', '转子电流 i_r,abc'], unit: 'A', ch: PH.map(([c, p]) => ({ k: 'ir' + p, c, n: 'i_r' + p })) },
          { t: ['Active power P_s', '有功功率 P_s'], unit: 'kW', ch: [{ k: 'p', c: 's1', n: 'P_s' }, { k: 'pref', c: 'ink-2', n: 'P_ref', dash: true }] },
          { t: ['Rotor-angle estimation error Δθ_r', '转子角度估计误差 Δθ_r'], unit: '°', err: true, wide: true, ch: [{ k: 'err', c: 's1', n: 'Δθ_r' }] },
        ],
      },
      sym: {
        sl: 'sym_sl', enc: 'sym_enc',
        en: 'Chinese grid code LVRT profile: 20% residual voltage for 500 ms, recovery to 90% (Figs. 8–9). Active power is cut to zero and reactive current is injected; demagnetisation control relies on the estimated angle.',
        zh: '中国电网规范低电压穿越曲线：残压 20% 持续 500 ms，随后恢复至 90%（图 8–9）。有功降为零并注入无功电流；去磁控制依赖估计出的转子角。',
        panels: [
          { t: ['Stator phase voltage u_s,abc', '定子相电压 u_s,abc'], unit: 'V', wide: true, ch: PH.map(([c, p]) => ({ k: 'u' + p, c, n: 'u_s' + p })) },
          { t: ['Rotor d-axis current & reference', '转子 d 轴电流及参考'], unit: 'A', ch: [{ k: 'ird', c: 's1', n: 'i_rd' }, { k: 'ird_ref', c: 'ink-2', n: 'i_rd*', dash: true }] },
          { t: ['Rotor q-axis current & reference', '转子 q 轴电流及参考'], unit: 'A', ch: [{ k: 'irq', c: 's1', n: 'i_rq' }, { k: 'irq_ref', c: 'ink-2', n: 'i_rq*', dash: true }] },
          { t: ['Stator flux in dq frame', 'dq 坐标系下的定子磁链'], unit: 'Wb', ch: [{ k: 'psd', c: 's1', n: 'ψ_sd', dec: 3 }, { k: 'psq', c: 's2', n: 'ψ_sq', dec: 3 }] },
          { t: ['Rotor-angle estimation error Δθ_r', '转子角度估计误差 Δθ_r'], unit: '°', err: true, wide: true, ch: [{ k: 'err', c: 's1', n: 'Δθ_r' }] },
        ],
      },
      asym: {
        sl: 'asym_sl', enc: 'asym_enc',
        en: '60% dip on one phase for 500 ms — a strong negative sequence (Figs. 10–11). The 2nd-harmonic ripple in the currents comes from the RSC’s DC-link voltage limit, not from the observer.',
        zh: '单相电压跌落 60%，持续 500 ms，产生很强的负序分量（图 10–11）。电流中的二次谐波来自 RSC 直流母线电压不足，而非观测器本身。',
        panels: [
          { t: ['Stator line voltage', '定子线电压'], unit: 'V', wide: true, ch: [{ k: 'uab', c: 's1', n: 'u_AB' }, { k: 'ubc', c: 's2', n: 'u_BC' }, { k: 'uca', c: 's3', n: 'u_CA' }] },
          { t: ['Stator current i_s,abc', '定子电流 i_s,abc'], unit: 'A', ch: PH.map(([c, p]) => ({ k: 'is' + p, c, n: 'i_s' + p })) },
          { t: ['Rotor current i_r,abc', '转子电流 i_r,abc'], unit: 'A', ch: PH.map(([c, p]) => ({ k: 'ir' + p, c, n: 'i_r' + p })) },
          { t: ['Rotor-angle estimation error Δθ_r', '转子角度估计误差 Δθ_r'], unit: '°', err: true, wide: true, ch: [{ k: 'err', c: 's1', n: 'Δθ_r' }] },
        ],
      },
      rs: {
        sl: 'rs_sl', enc: 'rs_enc',
        en: 'Same 80% dip, but the stator resistance used by the observer is 20% off (Figs. 12–13). The mismatch loses part of the transient DC flux, so the 50 Hz ripple in Δθ_r grows — yet stays bounded.',
        zh: '同样的 80% 跌落，但观测器使用的定子电阻偏差 20%（图 12–13）。电阻失配会损失部分暂态直流磁链，因此 Δθ_r 中的 50 Hz 波动变大，但始终有界。',
        panels: null, // same layout as `sym`
      },
    };
    CASES.rs.panels = CASES.sym.panels;

    let cur = 'sym', plots = [], d = null, enc = null, mk = null, timeOrigin = 0;
    let plotObservers = [];
    const player = new Player({ n: 2000, fs: EXP.fs, speed: 0.25, onFrame: (i) => frameAt(i) });
    player.onState = wirePlayButton($('#s5Play'), player);

    function marks(record) {
      return cur === 'asym' ? { f: 500, c: 1000 } : faultMarks(record);
    }
    function preparePair(c) {
      const sensorless = EXP[c.sl], encoder = c.enc ? EXP[c.enc] : null;
      if (!encoder) { d = sensorless; enc = null; timeOrigin = 0; return; }
      const a = marks(sensorless), b = marks(encoder);
      const pre = Math.min(Math.round(EXP.fs * .5), a.f, b.f);
      const startA = a.f - pre, startB = b.f - pre;
      const n = Math.min(sensorless.n - startA, encoder.n - startB);
      const crop = (r, start) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? v.slice(start, start + n) : k === 'n' ? n : v]));
      d = crop(sensorless, startA); enc = crop(encoder, startB);
      timeOrigin = -pre / EXP.fs;
    }
    function addPlot(p, record, parent, yr, method) {
      const card = document.createElement('div');
      card.className = 'card' + (p.err ? ' exp-error' : '') + (p.wide ? ' wide' : '');
      if (method) {
        const label = document.createElement('div'); label.className = 'exp-method'; label.textContent = method; card.appendChild(label);
      }
      const title = document.createElement('div'); title.className = 'panel-title';
      title.innerHTML = `<span>${sub(tr(p.t[0], p.t[1]))}</span><span class="hint">${p.unit || ''}</span>`;
      card.appendChild(title);
      const legend = document.createElement('div'); legend.className = 'legend';
      legend.innerHTML = p.ch.map((s) => `<span><i class="${s.dash ? 'dash' : ''}" style="border-color:var(--${s.c})"></i>${sub(s.n)}</span>`).join('');
      card.appendChild(legend);
      const canvas = document.createElement('canvas'); canvas.className = 'plot';
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', tr(p.t[0], p.t[1]) + (method ? ' · ' + method : ''));
      card.appendChild(canvas); parent.appendChild(card);
      const localMarks = enc ? marks(record) : mk;
      const bands = localMarks.f >= 0 ? [{ x0: localMarks.f / EXP.fs + timeOrigin, x1: (localMarks.c > 0 ? localMarks.c : record.n) / EXP.fs + timeOrigin }] : [];
      const cfg = { n: record.n, dt: 1 / EXP.fs, xStart: timeOrigin, xLabel: 't (s)', unit: p.unit, y: yr, bands,
        series: p.ch.map((s) => ({ y: record[s.k], c: s.c, name: s.n, dash: s.dash, dec: s.dec ?? 2, w: s.dash ? 1.4 : 1.5 })),
        vlines: cur === 'step' ? [{ x: mk.step / EXP.fs, label: tr('step', '阶跃'), c: 'ink-2' }] : [] };
      if (p.err) cfg.hlines = [{ y: 0, c: 'axis' }];
      const plot = new TimePlot(canvas, cfg, { plots }); plots.push(plot);
      plotObservers.push(plot);
      return card;
    }
    function build() {
      // Release old plot observers and redraw callbacks before rebuilding the comparison.
      plotObservers.forEach((p) => p.destroy()); plotObservers = [];
      const c = CASES[cur]; preparePair(c); mk = marks(d);
      if (cur === 'step') {
        let step = 0; for (let i = 1; i < d.n; i++) if (d.pref[i] !== d.pref[0]) { step = i; break; }
        mk = { step };
      }
      grid.innerHTML = ''; plots = [];
      const shared = document.createElement('div'); shared.className = 'exp-shared'; grid.appendChild(shared);
      const voltage = c.panels[0];
      addPlot(voltage, d, shared, rangeOf(voltage.ch.map((s) => d[s.k])));
      if (enc) {
        shared.querySelector('.panel-title').insertAdjacentHTML('beforeend', `<span class="hint">${tr('Shared fault profile · sensorless voltage record', '共用故障工况 · 电压取无传感器实验记录')}</span>`);
        const headings = document.createElement('div'); headings.className = 'exp-pair exp-headings';
        headings.innerHTML = `<div class="exp-column-heading"><b>${tr('Position-sensorless control', '无位置传感器控制')}</b><small>${tr('Proposed method', '本文方法')}</small></div><div class="exp-column-heading"><b>${tr('Position-sensor-based control', '有位置传感器控制')}</b><small>${tr('Encoder-based benchmark', '编码器基准')}</small></div>`;
        grid.appendChild(headings);
      }
      let single = null;
      if (!enc) { single = document.createElement('div'); single.className = 'exp-single'; grid.appendChild(single); }
      c.panels.slice(1).forEach((p) => {
        const arrays = p.ch.flatMap((s) => enc && !p.err ? [d[s.k], enc[s.k]] : [d[s.k]]);
        const yr = p.err ? rangeOf(arrays, .12, true) : rangeOf(arrays);
        if (enc && !p.err) {
          const pair = document.createElement('div'); pair.className = 'exp-pair'; pair.dataset.quantity = p.ch[0].k;
          grid.appendChild(pair);
          addPlot(p, d, pair, yr, tr('Position-sensorless control', '无位置传感器控制'));
          addPlot(p, enc, pair, yr, tr('Position-sensor-based control', '有位置传感器控制'));
        } else {
          addPlot(p, d, single || grid, yr, p.err ? tr('Sensorless estimation error', '无传感器位置估计误差') : null);
        }
      });
      const comparisonNote = enc ? tr(' Records are aligned at fault inception (t = 0); corresponding response plots use identical axis limits. The voltage is shown once as the common test profile. As in the paper, the position-estimation error is reported for sensorless control only. The current and flux responses are similar to the encoder-based benchmark.',
        ' 两组记录按故障发生时刻（t = 0）对齐，对应响应波形采用相同坐标范围；电压仅展示一组以说明共同测试工况。与论文一致，位置估计误差仅展示无传感器结果。电流及磁链的动态响应与有传感器基准接近。') : tr(' Only the sensorless power-step record is available for this case.', ' 此工况目前仅有无传感器功率阶跃记录。');
      $('#s5Note').innerHTML = sub(tr(c.en, c.zh) + comparisonNote);
      $('#s5Scrub').max = d.n - 1; player.n = d.n;
      frameAt(Math.min(Math.floor(player.idx), d.n - 1));
    }
    function frameAt(i) {
      i = clamp(i, 0, d.n - 1);
      const p = i >= d.n - 1 && !player.running ? null : i;
      plots.forEach((plot) => { plot.play = p; plot.draw(); });
      $('#s5Scrub').value = i;
      const time = i / EXP.fs + timeOrigin;
      $('#s5Time').textContent = (time >= 0 && enc ? '+' : '') + time.toFixed(3) + ' s';
      let phase, cls = '';
      if (cur === 'step') phase = i < mk.step ? '2 kW' : '3 kW';
      else if (i < mk.f) phase = tr('Pre-fault', '故障前');
      else if (mk.c < 0 || i < mk.c) { phase = tr('Grid fault', '电网故障中'); cls = 'bad'; }
      else phase = tr('Recovered', '已恢复');
      $('#s5Info').innerHTML = `<div class="ro ${cls}"><div class="k">${cur === 'step' ? tr('Power command', '功率指令') : tr('Grid state', '电网状态')}</div><div class="v">${phase}</div></div>`
        + `<div class="ro"><div class="k">${sub(tr('Δθ_r now', '当前 Δθ_r'))}</div><div class="v">${d.err[i].toFixed(2)}°</div></div>`
        + `<div class="ro ok"><div class="k">${sub(tr('Peak |Δθ_r| so far', '截至当前 |Δθ_r| 峰值'))}</div><div class="v">${peakAbs(d.err, 0, i).toFixed(2)}°</div></div>`;
    }
    $$('#s5Tabs .tab').forEach((b) => b.addEventListener('click', () => {
      $$('#s5Tabs .tab').forEach((x) => x.classList.toggle('on', x === b)); cur = b.dataset.case;
      player.stop(); player.idx = 0; build();
    }));
    $('#s5Scrub').addEventListener('input', (e) => { player.stop(); player.seek(+e.target.value); });
    $('#s5Speed').addEventListener('change', (e) => { player.speed = +e.target.value; });
    build(); onRedraw(build);
  })();

  // ================================================================== 6. COMPARISON RACE
  (function comparison() {
    const LANES = [
      { k: 'prop80', me: true, c: 's1', en: 'Proposed method', zh: '本文方法', cond: ['80% symmetric dip', '80% 对称跌落'] },
      { k: 'sfmo60', c: 's2', en: 'SFMO [4]', zh: 'SFMO [4]', cond: ['60% symmetric dip', '60% 对称跌落'] },
      { k: 'rcmo60', c: 's3', en: 'Traditional RCMO [5]', zh: '传统 RCMO [5]', cond: ['60% symmetric dip', '60% 对称跌落'] },
      { k: 'rcmo80', c: 's3', en: 'Traditional RCMO [5]', zh: '传统 RCMO [5]', cond: ['80% symmetric dip', '80% 对称跌落'] },
      { k: 'cross80', c: 's5', en: 'Proposed, but cross-product error', zh: '本文方法，但改用叉乘误差', cond: ['80% symmetric dip', '80% 对称跌落'] },
    ];
    const race = $('#s6Race');
    const n = Math.min(...LANES.map((l) => EXP[l.k].n));
    const player = new Player({ n, fs: EXP.fs, speed: 0.25, onFrame: (i) => frameAt(i) });
    player.onState = wirePlayButton($('#s6Play'), player);
    let lanes = [];
    function build() {
      race.innerHTML = ''; lanes = [];
      LANES.forEach((L) => {
        const d = EXP[L.k];
        const el = document.createElement('div'); el.className = 'lane' + (L.me ? ' me' : '');
        el.innerHTML = `<div class="who"><b><i style="background:var(--${L.c})"></i>${tr(L.en, L.zh)}</b><small>${tr(L.cond[0], L.cond[1])}</small></div>
          <canvas class="plot"></canvas><canvas class="plot"></canvas>
          <div class="status"><span class="chip"></span><span class="pk"></span></div>`;
        race.appendChild(el);
        const [cvI, cvE] = el.querySelectorAll('canvas');
        const end = d.trip ?? d.n - 1;
        const vlines = d.trip ? [{ x: d.trip / EXP.fs, label: tr('trip', '跳闸'), c: 'critical' }] : [];
        const fb = [{ x0: d.fault / EXP.fs, x1: Math.min(d.n, d.fault + 500) / EXP.fs }];
        const pI = new TimePlot(cvI, { n, dt: 1 / EXP.fs, unit: 'A', y: [-50, 50], bands: fb, vlines,
          series: [['isa', 's1', 'i_sa'], ['isb', 's2', 'i_sb'], ['isc', 's3', 'i_sc']].map(([k, c, nm]) => ({ y: d[k], c, name: nm, w: 1.1 })) });
        const pE = new TimePlot(cvE, { n, dt: 1 / EXP.fs, unit: '°', y: [-90, 90], bands: fb, vlines, hlines: [{ y: 0, c: 'axis' }],
          series: [{ y: d.err, c: L.c, name: 'Δθ_r', w: 1.4 }] });
        lanes.push({ L, d, el, pI, pE, end, chip: el.querySelector('.chip'), pk: el.querySelector('.pk') });
      });
      frameAt(Math.floor(player.idx));
      table();
    }
    function frameAt(i) {
      i = clamp(i, 0, n - 1);
      const p = i >= n - 1 && !player.running ? null : i;
      lanes.forEach((ln) => {
        ln.pI.play = p; ln.pE.play = p; ln.pI.draw(); ln.pE.draw();
        const { d } = ln;
        let cls = 'chip', txt;
        if (i < d.fault) txt = tr('● Normal operation', '● 正常运行');
        else if (d.trip != null && i >= d.trip) { cls += ' bad'; txt = '✕ ' + tr('Grid disconnected', '脱网') + ` (+${Math.round((d.trip - d.fault) * 1000 / EXP.fs)} ms)`; }
        else if (i < d.fault + 650) { cls += ' warn'; txt = '▲ ' + tr('Riding through…', '穿越中…'); }
        else { cls += ' ok'; txt = '✓ ' + tr('FRT success', '穿越成功'); }
        ln.chip.className = cls; ln.chip.textContent = txt;
        ln.el.classList.toggle('tripped', d.trip != null && i >= d.trip);
        const upto = Math.min(i, ln.end);
        ln.pk.innerHTML = i >= d.fault ? sub(tr('peak |Δθ_r| ', '|Δθ_r| 峰值 ')) + peakAbs(d.err, d.fault, upto).toFixed(1) + '°' : '';
      });
      $('#s6Scrub').value = i;
      $('#s6Time').textContent = ((i - EXP.prop80.fault) / EXP.fs >= 0 ? '+' : '') + ((i - EXP.prop80.fault) / EXP.fs).toFixed(3) + ' s';
    }
    function table() {
      $('#s6Table').innerHTML = LANES.map((L) => {
        const d = EXP[L.k];
        const pk = peakAbs(d.err, d.fault, d.trip ?? Math.min(d.n - 1, d.fault + 600));
        const ok = d.trip == null;
        const res = ok ? `<span class="chip ok">✓ ${tr('Success', '成功')}</span>` : `<span class="chip bad">✕ ${tr('Failure', '失败')}</span>`;
        const err = ok ? `${pk.toFixed(1)}° · ${pk > 10 ? tr('large', '大') : tr('minor', '小')}` : `${pk.toFixed(1)}° → ${tr('diverged', '发散')}`;
        return `<tr class="${L.me ? 'me' : ''}"><td>${tr(L.en, L.zh)}</td><td>${tr(L.cond[0], L.cond[1])}</td><td class="num">${err}</td><td>${res}</td></tr>`;
      }).join('');
    }
    $('#s6Scrub').addEventListener('input', (e) => { player.stop(); player.seek(+e.target.value); });
    $('#s6Speed').addEventListener('change', (e) => { player.speed = +e.target.value; });
    build();
    onRedraw(build);
    whenVisible(race, () => { if (!reduceMotion) { player.idx = 0; player.start(); } });
  })();

  // ================================================================== chrome: language, theme, nav, copy
  function setLang(l) {
    root.dataset.lang = l; root.lang = l === 'zh' ? 'zh-CN' : 'en';
    store.set('frt-lang', l); redrawAll();
  }
  $('#langBtn').addEventListener('click', () => setLang(isZh() ? 'en' : 'zh'));
  $('#themeBtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark'; store.set('frt-theme', root.dataset.theme);
    redrawAll();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);
  $('#copyBib').addEventListener('click', (e) => {
    const txt = $('#bib').textContent, btn = e.currentTarget;
    const done = () => { btn.innerHTML = '<span class="en">Copied ✓</span><span class="zh">已复制 ✓</span>'; setTimeout(() => { btn.innerHTML = '<span class="en">Copy</span><span class="zh">复制</span>'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => selectBib());
    else selectBib();
    function selectBib() { const r = document.createRange(); r.selectNodeContents($('#bib')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  });
  // highlight the section in view
  const links = $$('#nav a');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    $$('section.chapter').forEach((s) => io.observe(s));
  }
})();

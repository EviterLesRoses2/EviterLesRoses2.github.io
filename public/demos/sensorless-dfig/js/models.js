// Illustrative models behind the explainer sections (per-unit, 50 Hz grid).
// They follow the equations of the paper but are simplified on purpose;
// the real measurements live in data.js.
(function (root) {
  'use strict';
  const W0 = 2 * Math.PI * 50;          // grid angular frequency (rad/s)
  const TAU_S = 0.1902 / 1.726;         // Ls / Rs of the 5-kW test DFIG ≈ 0.11 s
  const DEG = 180 / Math.PI;

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------------------------------------------------------------------------
  // Section 1 — stator flux under a grid dip, eq. (7)
  // Voltages in p.u.; flux in p.u. of the rated flux (psi = v / j).
  // type: 'sym' (three-phase) or 'single' (phase-a dip, creates a negative sequence)
  function dipSequences(dip, type) {
    if (type === 'single') return { v1: 1 - dip / 3, v2: -dip / 3 };
    return { v1: 1 - dip, v2: 0 };
  }

  function fluxTrajectory(opts) {
    const { dip, type = 'sym', tFault = 0.045, tEnd = 0.44, dt = 1 / 4000,
            tau = TAU_S, slip = -0.2, kLm = 0.98 } = opts;
    const { v1, v2 } = dipSequences(dip, type);
    // forced flux for v = V1 e^{jwt} + V2 e^{-jwt}  ->  psi = V1 e^{jwt}/j + V2 e^{-jwt}/(-j)
    const forced = (V1, V2, t) => {
      const c = Math.cos(W0 * t), s = Math.sin(W0 * t);
      return [V1 * s + V2 * s, -V1 * c + V2 * c];
    };
    const pre = forced(1, 0, tFault);
    const post = forced(v1, v2, tFault);
    const nat0 = [pre[0] - post[0], pre[1] - post[1]];
    const n = Math.round(tEnd / dt) + 1;
    const t = new Float64Array(n), a = new Float64Array(n), b = new Float64Array(n);
    const emf = new Float64Array(n), natMag = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ti = i * dt;
      t[i] = ti;
      if (ti < tFault) {
        const f = forced(1, 0, ti);
        a[i] = f[0]; b[i] = f[1];
        emf[i] = kLm * Math.abs(slip);
      } else {
        const f = forced(v1, v2, ti);
        const d = Math.exp(-(ti - tFault) / tau);
        a[i] = f[0] + nat0[0] * d; b[i] = f[1] + nat0[1] * d;
        const nm = Math.hypot(nat0[0], nat0[1]) * d;
        natMag[i] = nm;
        // rotor-induced EMF envelope (p.u. of stator voltage, referred):
        // forced term at slip s, natural term at (1-s), negative sequence at (2-s)
        emf[i] = kLm * (Math.abs(slip) * v1 + (1 - slip) * nm + (2 - slip) * Math.abs(v2));
      }
    }
    return { t, a, b, emf, natMag, nat0: Math.hypot(nat0[0], nat0[1]), v1, v2, tFault };
  }

  // ---------------------------------------------------------------------------
  // Section 2 — observer loop of Fig. 2 with the two error functions, eq. (10)/(11)
  // State: e = θr − θ̂r (estimation error), x = ∫ε.   ε = f(e + δ(t))
  //   d e /dt = −(Kp ε + Ki x)   (true speed constant; absorbed in x)
  const PI_GAINS = (() => {
    const wn = 2 * Math.PI * 15, zeta = 0.8;
    return { kp: 2 * zeta * wn, ki: wn * wn };
  })();

  function errFn(kind, e, gain) {
    return kind === 'atan2' ? wrap(e) : gain * Math.sin(e);
  }

  function observerResponse(opts) {
    const { e0Deg, gain = 1, ripple = 0, tEnd = 0.3, dt = 2e-5, store = 1e-3 } = opts;
    const { kp, ki } = PI_GAINS;
    const out = {};
    for (const kind of ['cross', 'atan2']) {
      let e = e0Deg / DEG, x = 0;
      const ts = [], es = [];
      const every = Math.round(store / dt);
      const n = Math.round(tEnd / dt);
      for (let i = 0; i <= n; i++) {
        const t = i * dt;
        if (i % every === 0) { ts.push(t); es.push(e * DEG); }
        const delta = ripple / DEG * Math.sin(W0 * t);
        const eps = errFn(kind, e + delta, gain);
        x += eps * dt;
        e += -(kp * eps + ki * x) * dt;
      }
      out[kind] = { t: ts, e: es };
    }
    return out;
  }

  // Closed-loop poles of the error dynamics linearised at the error e0:
  //   s² + g·Kp·s + g·Ki = 0 with g = ∂ε/∂e  (=1 for atan2, = k²·cos e0 for cross-product)
  function poles(g) {
    const { kp, ki } = PI_GAINS;
    const b = g * kp, c = g * ki;
    const disc = b * b - 4 * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      return [[(-b + r) / 2, 0], [(-b - r) / 2, 0]];
    }
    const r = Math.sqrt(-disc);
    return [[-b / 2, r / 2], [-b / 2, -r / 2]];
  }

  // ---------------------------------------------------------------------------
  // Section 3 — flux observers with a sensor DC offset, Fig. 3
  // Profile: 1 p.u. → (1−dip) at tFault for `dur` → 0.9 p.u. (grid-code style)
  function fluxObserverSim(opts) {
    const { voffPct = 1, dip = 0.8, tFault = 0.1, dur = 0.5, tEnd = 1.1,
            dt = 1 / 10000, fcConv = 5, hold = 0.3, tau = TAU_S, offAngleDeg = 30 } = opts;
    const n = Math.round(tEnd / dt) + 1;
    const voffMag = voffPct / 100;
    const voff = [voffMag * Math.cos(offAngleDeg / DEG), voffMag * Math.sin(offAngleDeg / DEG)];
    const levels = [[0, 1], [tFault, 1 - dip], [tFault + dur, 0.9]];
    // true flux: piecewise forced + natural (eq. 7), symmetric
    let nat = [0, 0], tNat = 0, lvlIdx = 0, V = 1;
    const forced = (Vm, t) => [Vm * Math.sin(W0 * t), -Vm * Math.cos(W0 * t)];
    const wc = 2 * Math.PI * fcConv;
    // conventional: LPF-type integrator ψ' = e − ωc ψ, fundamental gain/phase compensated
    // proposed: same structure in steady mode with the offset estimate removed,
    //           pure integration with the frozen offset in fault mode
    const comp = [1, -wc / W0];              // (jω0 + ωc)/(jω0) = 1 − j ωc/ω0
    const cmul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
    const cdiv = (p, q) => { const d = q[0] * q[0] + q[1] * q[1]; return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d]; };
    let ideal = forced(1, 0), conv = cdiv(forced(1, 0), comp), prop = conv.slice();
    // offset estimate: assume the slow LPF has converged pre-fault (to within 3 %)
    const voffHat = [voff[0] * 0.97, voff[1] * 0.97];
    let mode = 'steady', tClear = -1;
    const R = { t: new Float32Array(n), ta: new Float32Array(n), tb: new Float32Array(n),
      ia: new Float32Array(n), ib: new Float32Array(n), ca: new Float32Array(n), cb: new Float32Array(n),
      pa: new Float32Array(n), pb: new Float32Array(n), mode: new Uint8Array(n), vmag: new Float32Array(n),
      eIdeal: new Float32Array(n), eConv: new Float32Array(n), eProp: new Float32Array(n) };
    let prevTrue = forced(1, 0);
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      if (lvlIdx + 1 < levels.length && t >= levels[lvlIdx + 1][0]) {
        lvlIdx++;
        const now = [prevTrue[0] + 0, prevTrue[1] + 0];
        const f = forced(levels[lvlIdx][1], t);
        nat = [now[0] - f[0], now[1] - f[1]]; tNat = t;
        V = levels[lvlIdx][1];
      }
      const f = forced(V, t), d = Math.exp(-(t - tNat) / tau);
      const psi = [f[0] + nat[0] * d, f[1] + nat[1] * d];
      // back-EMF e = dψ/dt (in p.u.: v − Rs·i), what the sensors "see" plus offset
      const emf = [(psi[0] - prevTrue[0]) / dt / W0, (psi[1] - prevTrue[1]) / dt / W0];
      prevTrue = psi;
      const em = [emf[0] + voff[0], emf[1] + voff[1]];
      // fault detection on stator-voltage magnitude, retention `hold` after clearance
      if (V < 0.5) { if (mode === 'steady') prop = cmul(prop, comp); mode = 'fault'; tClear = -1; }
      else if (mode === 'fault') {
        if (tClear < 0) tClear = t;
        // back to steady mode: re-seed the filtered state so the output is continuous
        if (t - tClear > hold) { mode = 'steady'; prop = cdiv(prop, comp); }
      }
      if (i > 0) {
        ideal = [ideal[0] + em[0] * W0 * dt, ideal[1] + em[1] * W0 * dt];
        conv = [conv[0] + (em[0] * W0 - wc * conv[0]) * dt, conv[1] + (em[1] * W0 - wc * conv[1]) * dt];
        const ec = [em[0] - voffHat[0], em[1] - voffHat[1]];
        if (mode === 'steady') prop = [prop[0] + (ec[0] * W0 - wc * prop[0]) * dt, prop[1] + (ec[1] * W0 - wc * prop[1]) * dt];
        else prop = [prop[0] + ec[0] * W0 * dt, prop[1] + ec[1] * W0 * dt];
      }
      function propOut() { return mode === 'steady' ? cmul(prop, comp) : prop; }
      const cOut = cmul(conv, comp), pOut = propOut();
      R.t[i] = t; R.ta[i] = psi[0]; R.tb[i] = psi[1];
      R.ia[i] = ideal[0]; R.ib[i] = ideal[1];
      R.ca[i] = cOut[0]; R.cb[i] = cOut[1];
      R.pa[i] = pOut[0]; R.pb[i] = pOut[1];
      R.mode[i] = mode === 'fault' ? 1 : 0;
      R.vmag[i] = V;
      // flux-vector estimation error |ψ̂ − ψ| (p.u.) — it maps directly into î_r via eq. (8)
      const err = (p) => Math.hypot(p[0] - psi[0], p[1] - psi[1]);
      R.eIdeal[i] = err(ideal); R.eConv[i] = err(cOut); R.eProp[i] = err(pOut);
    }
    R.n = n; R.tFault = tFault; R.tClear = tFault + dur;
    return R;
  }

  // ---------------------------------------------------------------------------
  // Section 4 — magnetising characteristic (same shape as Fig. 4 / noload.m)
  // i0 = k1 ψm + k2 ψm^9, Lm = ψm / i0, normalised so Lm(ψm = 1) = 1 (rated knee point)
  const K1 = 0.85, K2 = 0.15;
  const lmOf = (psi) => (psi < 1e-6 ? 1 / K1 : psi / (K1 * psi + K2 * Math.pow(psi, 9)));
  // LUT built from a coarse no-load sweep, linear interpolation in between
  const LUT = (() => { const pts = []; for (let k = 0; k <= 16; k++) { const p = k * 1.5 / 16; pts.push([p, lmOf(p)]); } return pts; })();
  function lmLUT(psi) {
    const s = 1.5 / 16, k = Math.min(15, Math.max(0, Math.floor(psi / s)));
    const [p0, l0] = LUT[k], [p1, l1] = LUT[k + 1];
    return l0 + (l1 - l0) * (psi - p0) / (p1 - p0);
  }

  // Rotor-current angle error of the reference model, eq. (8)/(14), at one operating point.
  // Per-unit machine (Table II, base 400 V / 5 kVA): Lm,N = 1.83, Lσs = 0.037.
  // ψs = 1∠0 (stator-flux frame); stator current |is| at angle φ (generator: φ ≈ −90°…).
  function lutError(psiM, isMag, isAngDeg) {
    const LmN = 1.83, Lls = 0.037;
    const LmTrue = LmN * lmOf(psiM);
    const ph = isAngDeg / DEG;
    const is = [isMag * Math.cos(ph), isMag * Math.sin(ph)];
    const ps = [psiM, 0];                     // air-gap ≈ stator flux, magnitude from the slider
    const ir = (Lm) => [(ps[0] - (Lm + Lls) * is[0]) / Lm, (ps[1] - (Lm + Lls) * is[1]) / Lm];
    const truth = ir(LmTrue);
    const ang = (p) => Math.atan2(p[1], p[0]);
    const nominal = wrap(ang(ir(LmN)) - ang(truth)) * DEG;
    const withLut = wrap(ang(ir(LmN * lmLUT(psiM))) - ang(truth)) * DEG;
    return { LmTrue: LmTrue / LmN, nominal, withLut };
  }

  root.Models = { W0, TAU_S, DEG, wrap, fluxTrajectory, observerResponse, poles, PI_GAINS,
    fluxObserverSim, lmOf, lmLUT, LUT, lutError, dipSequences };
})(typeof window !== 'undefined' ? window : globalThis);

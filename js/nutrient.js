/* Nutrient field — toroidal, bilinear sampling, diffusion, logistic regen */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mod = (n, m) => ((n % m) + m) % m;

  class NutrientField {
    constructor(w, h, gw, gh) {
      this.w = w;
      this.h = h;
      this.gw = gw;
      this.gh = gh;
      this.cw = w / gw;
      this.ch = h / gh;
      this.n = new Float32Array(gw * gh);
      this.tmp = new Float32Array(gw * gh);
    }

    reset(rng, level) {
      level = level == null ? 0.78 : level;
      const { n, gw, gh } = this;
      for (let i = 0; i < n.length; i++) {
        n[i] = clamp(level + (rng.next() - 0.5) * 0.24, 0.12, 1);
      }
      // A handful of richer patches make early spatial structure visible.
      for (let k = 0; k < 18; k++) {
        const cx = rng.next() * gw;
        const cy = rng.next() * gh;
        const r = 6 + rng.next() * 16;
        const amp = 0.12 + rng.next() * 0.18;
        const r2 = r * r;
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            let dx = x - cx;
            let dy = y - cy;
            if (dx > gw * 0.5) dx -= gw; else if (dx < -gw * 0.5) dx += gw;
            if (dy > gh * 0.5) dy -= gh; else if (dy < -gh * 0.5) dy += gh;
            const d2 = dx * dx + dy * dy;
            if (d2 < r2 * 2.5) {
              n[y * gw + x] = clamp(n[y * gw + x] + amp * Math.exp(-d2 / (r2 * 0.45)), 0, 1);
            }
          }
        }
      }
    }

    sample(x, y) {
      const gx = x / this.cw - 0.5;
      const gy = y / this.ch - 0.5;
      let x0 = Math.floor(gx);
      let y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const gw = this.gw, gh = this.gh, n = this.n;
      let x1 = x0 + 1, y1 = y0 + 1;
      x0 = mod(x0, gw); x1 = mod(x1, gw);
      y0 = mod(y0, gh); y1 = mod(y1, gh);
      const a = n[y0 * gw + x0], b = n[y0 * gw + x1];
      const c = n[y1 * gw + x0], d = n[y1 * gw + x1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }

    take(x, y, rate, dt) {
      const gx = x / this.cw - 0.5;
      const gy = y / this.ch - 0.5;
      let x0 = Math.floor(gx);
      let y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const gw = this.gw, gh = this.gh, n = this.n;
      let x1 = x0 + 1, y1 = y0 + 1;
      x0 = mod(x0, gw); x1 = mod(x1, gw);
      y0 = mod(y0, gh); y1 = mod(y1, gh);
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const i00 = y0 * gw + x0, i10 = y0 * gw + x1;
      const i01 = y1 * gw + x0, i11 = y1 * gw + x1;
      const avail = n[i00] * w00 + n[i10] * w10 + n[i01] * w01 + n[i11] * w11;
      const take = Math.min(avail, Math.min(1, avail) * rate * dt);
      if (take <= 0) return 0;
      n[i00] = Math.max(0, n[i00] - take * w00);
      n[i10] = Math.max(0, n[i10] - take * w10);
      n[i01] = Math.max(0, n[i01] - take * w01);
      n[i11] = Math.max(0, n[i11] - take * w11);
      return take;
    }

    consume(x, y, amount) {
      const gx = x / this.cw - 0.5;
      const gy = y / this.ch - 0.5;
      let x0 = Math.floor(gx);
      let y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const gw = this.gw, gh = this.gh, n = this.n;
      let x1 = x0 + 1, y1 = y0 + 1;
      x0 = mod(x0, gw); x1 = mod(x1, gw);
      y0 = mod(y0, gh); y1 = mod(y1, gh);
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const i00 = y0 * gw + x0, i10 = y0 * gw + x1;
      const i01 = y1 * gw + x0, i11 = y1 * gw + x1;
      const avail = n[i00] * w00 + n[i10] * w10 + n[i01] * w01 + n[i11] * w11;
      const take = Math.min(avail, amount);
      if (take <= 0) return 0;
      n[i00] = Math.max(0, n[i00] - take * w00);
      n[i10] = Math.max(0, n[i10] - take * w10);
      n[i01] = Math.max(0, n[i01] - take * w01);
      n[i11] = Math.max(0, n[i11] - take * w11);
      return take;
    }

    deposit(x, y, amount) {
      const gx = clamp(Math.floor(x / this.cw), 0, this.gw - 1);
      const gy = clamp(Math.floor(y / this.ch), 0, this.gh - 1);
      const i = gy * this.gw + gx;
      this.n[i] = Math.min(1, this.n[i] + amount);
    }

    update(dt, supply) {
      const { n, tmp, gw, gh } = this;
      const r = 0.08 * supply;
      for (let i = 0; i < n.length; i++) {
        const v = n[i];
        n[i] = clamp(v + r * v * (1 - v) * dt, 0, 1);
      }
      // 5-point toroidal diffusion. k is expressed per nominal 1/60 s step
      // (k = 0.06 at dt = 1/60) and scaled by dt so that the diffusion rate
      // per simulated second is independent of the integration step.
      // Explicit stability requires k <= 0.25.
      const k = Math.min(0.24, 3.6 * dt);
      for (let y = 0; y < gh; y++) {
        const ym = (y - 1 + gh) % gh;
        const yp = (y + 1) % gh;
        const row = y * gw, rowm = ym * gw, rowp = yp * gw;
        for (let x = 0; x < gw; x++) {
          const xm = (x - 1 + gw) % gw;
          const xp = (x + 1) % gw;
          const i = row + x;
          const avg = (n[rowm + x] + n[rowp + x] + n[row + xm] + n[row + xp]) * 0.25;
          tmp[i] = n[i] + k * (avg - n[i]);
        }
      }
      n.set(tmp);
    }
  }

  global.ORIGIN_NUTRIENT = NutrientField;
})(typeof window !== 'undefined' ? window : globalThis);

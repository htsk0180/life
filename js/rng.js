/* Deterministic PRNG — mulberry32 + Box-Muller */
(function (global) {
  'use strict';

  class RNG {
    constructor(seed) {
      this.s = (seed >>> 0) || 1;
      this.spare = null;
    }

    next() {
      let t = (this.s += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    int(n) { return Math.floor(this.next() * n); }

    range(a, b) { return a + this.next() * (b - a); }

    gauss() {
      if (this.spare !== null) {
        const v = this.spare;
        this.spare = null;
        return v;
      }
      let u = 0, v = 0;
      while (u === 0) u = this.next();
      while (v === 0) v = this.next();
      const mag = Math.sqrt(-2 * Math.log(u));
      this.spare = mag * Math.sin(2 * Math.PI * v);
      return mag * Math.cos(2 * Math.PI * v);
    }

    pick(arr) { return arr[this.int(arr.length)]; }
  }

  global.ORIGIN_RNG = RNG;
})(typeof window !== 'undefined' ? window : globalThis);

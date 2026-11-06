/* ORIGIN — individual-based multilevel selection model */
(function (global) {
  'use strict';

  const CFG = global.ORIGIN_CONFIG.CONFIG;
  const TH = global.ORIGIN_CONFIG.VERDICT_THRESHOLDS;
  const MODEL_VERSION = global.ORIGIN_CONFIG.MODEL_VERSION;
  const RNG = global.ORIGIN_RNG;
  const NutrientField = global.ORIGIN_NUTRIENT;

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (v, m) => ((v % m) + m) % m;

  const HIST_BINS = [1, 3, 7, 15, 31, 63, 100000];
  const HIST_LABELS = ['1', '2–3', '4–7', '8–15', '16–31', '32–63', '64+'];

  class Simulation {
    constructor(params) {
      this.params = Object.assign({}, global.ORIGIN_CONFIG.DEFAULT_PARAMS, params || {});
      this.worldW = CFG.worldW;
      this.worldH = CFG.worldH;
      this.maxCells = CFG.maxCells;

      const N = this.maxCells;
      this.x = new Float32Array(N);
      this.y = new Float32Array(N);
      this.vx = new Float32Array(N);
      this.vy = new Float32Array(N);
      this.energy = new Float32Array(N);
      this.age = new Float32Array(N);
      this.radius = new Float32Array(N);
      this.generation = new Float32Array(N);
      this.clade = new Uint32Array(N);
      this.gAdh = new Float32Array(N);
      this.gCoop = new Float32Array(N);
      this.gSoma = new Float32Array(N);
      this.alive = new Uint8Array(N);
      this.somaState = new Uint8Array(N);
      this.bondCountArr = new Uint8Array(N);
      this.shareBudget = new Float32Array(N);
      this.parent = new Int32Array(N);
      this.rank = new Uint8Array(N);
      this.clusterId = new Int32Array(N);
      this.clusterSize = new Int32Array(N);
      this.clusterSeen = new Int32Array(N);
      this.clusterAdhSum = new Float32Array(N);
      this.clusterCoopSum = new Float32Array(N);
      this.seenToken = 0;
      this.hashNext = new Int32Array(N);
      this.freeList = new Int32Array(N);
      this.freeCount = 0;
      this.pendingFree = [];
      this.slotCount = 0;
      this.pop = 0;
      this.failedSpawns = 0;

      this.bondX1 = new Float32Array(CFG.maxBonds);
      this.bondY1 = new Float32Array(CFG.maxBonds);
      this.bondX2 = new Float32Array(CFG.maxBonds);
      this.bondY2 = new Float32Array(CFG.maxBonds);
      this.bondS = new Float32Array(CFG.maxBonds);
      this.bondCount = 0;

      this.cols = Math.ceil(this.worldW / 18);
      this.rows = Math.ceil(this.worldH / 18);
      this.binW = this.worldW / this.cols;
      this.binH = this.worldH / this.rows;
      this.hashHead = new Int32Array(this.cols * this.rows);

      this.field = new NutrientField(this.worldW, this.worldH, CFG.gridW, CFG.gridH);

      this.time = 0;
      this.tick = 0;
      this.maxGen = 0;
      this.pulseTimer = 0;
      this.pulseFlash = 0;
      this.pulseCount = 0;
      this.births = 0;
      this.deaths = 0;
      this.lastHistory = -1;
      this.history = [];
      this.events = [];
      this.metrics = this._emptyMetrics();
      this.initialMetrics = this._emptyMetrics();
      this.verdict = null;
      this.flags = {};

      this.reset(this.params.seed);
    }

    _emptyMetrics() {
      return {
        pop: 0, mcFrac: 0, meanCluster: 0, maxCluster: 0,
        meanAdh: 0, meanCoop: 0, meanSoma: 0, somaFrac: 0,
        meanGen: 0, clusterCount: 0, clusters8: 0, clusters20: 0,
        histogram: [0, 0, 0, 0, 0, 0, 0]
      };
    }

    reset(seed) {
      this.seed = (seed >>> 0) || 1;
      this.rng = new RNG(this.seed);
      this.time = 0;
      this.tick = 0;
      this.maxGen = 0;
      this.pop = 0;
      this.slotCount = 0;
      this.freeCount = 0;
      this.failedSpawns = 0;
      this.pendingFree.length = 0;
      this.bondCount = 0;
      this.pulseTimer = 0;
      this.pulseFlash = 0;
      this.pulseCount = 0;
      this.births = 0;
      this.deaths = 0;
      this.lastHistory = -1;
      this.history = [];
      this.events = [];
      this.flags = {
        cluster8: false, cluster20: false, soma: false,
        adhHigh: false, mcHigh: false, adhLow: false, popHigh: false
      };
      this.alive.fill(0);
      this.somaState.fill(0);
      this.bondCountArr.fill(0);
      this.clusterSize.fill(0);
      this.clusterSeen.fill(0);
      this.field.reset(this.rng, 0.78);

      for (let i = 0; i < CFG.initialCells; i++) {
        const x = this.rng.next() * this.worldW;
        const y = this.rng.next() * this.worldH;
        const clade = i % CFG.initialClades;
        const adh = clamp(0.30 + this.rng.gauss() * 0.10, 0, 1);
        const coop = clamp(0.30 + this.rng.gauss() * 0.10, 0, 1);
        const soma = clamp(0.16 + this.rng.gauss() * 0.07, 0, 1);
        this._spawn(x, y, adh, coop, soma, clade, 0.9, 0, 3.2 + this.rng.next() * 1.2);
      }
      // Initial placement is not a birth event; count only births after t=0.
      this.births = 0;

      this._computeMetrics(true);
      this.initialMetrics = Object.assign({}, this.metrics, {
        histogram: this.metrics.histogram.slice()
      });
      this._log('Deney başladı — tohum ' + this.seed);
      this.verdict = this._computeVerdict();
    }

    _spawn(x, y, adh, coop, soma, clade, energy, gen, radius) {
      let i;
      if (this.freeCount > 0) {
        i = this.freeList[--this.freeCount];
      } else if (this.slotCount < this.maxCells) {
        i = this.slotCount++;
      } else {
        this.failedSpawns++;
        return -1;
      }
      this.x[i] = wrap(x, this.worldW);
      this.y[i] = wrap(y, this.worldH);
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.energy[i] = energy;
      this.age[i] = 0;
      this.radius[i] = radius;
      this.generation[i] = gen;
      this.clade[i] = clade;
      this.gAdh[i] = adh;
      this.gCoop[i] = coop;
      this.gSoma[i] = soma;
      this.alive[i] = 1;
      this.somaState[i] = 0;
      this.bondCountArr[i] = 0;
      this.shareBudget[i] = 0;
      this.clusterId[i] = i;
      this.clusterSize[i] = 1;
      this.parent[i] = i;
      this.rank[i] = 0;
      this.pop++;
      this.births++;
      return i;
    }

    _kill(i) {
      if (!this.alive[i]) return;
      this.alive[i] = 0;
      this.pop--;
      this.deaths++;
      this.pendingFree.push(i);
      this.field.deposit(this.x[i], this.y[i], 0.28);
    }

    _flushPendingFree() {
      const pending = this.pendingFree;
      if (!pending.length) return;
      for (let k = 0; k < pending.length; k++) {
        this.freeList[this.freeCount++] = pending[k];
      }
      pending.length = 0;
    }

    _beginClusters() {
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        this.parent[i] = i;
        this.rank[i] = 0;
        this.clusterSize[i] = 0;
      }
    }

    _find(a) {
      let root = a;
      while (this.parent[root] !== root) root = this.parent[root];
      while (this.parent[a] !== a) {
        const p = this.parent[a];
        this.parent[a] = root;
        a = p;
      }
      return root;
    }

    _union(a, b) {
      let ra = this._find(a);
      let rb = this._find(b);
      if (ra === rb) return;
      if (this.rank[ra] < this.rank[rb]) {
        const t = ra; ra = rb; rb = t;
      }
      this.parent[rb] = ra;
      if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
    }

    _finishClusters() {
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        const r = this._find(i);
        this.clusterId[i] = r;
        this.clusterSize[r]++;
      }
    }

    _recountClusters() {
      this.clusterSize.fill(0);
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        this.clusterSize[this.clusterId[i]]++;
      }
    }

    _buildHash() {
      const head = this.hashHead;
      head.fill(-1);
      const cols = this.cols, rows = this.rows;
      const bw = this.binW, bh = this.binH;
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        let bx = Math.floor(this.x[i] / bw);
        let by = Math.floor(this.y[i] / bh);
        if (bx < 0) bx = 0; else if (bx >= cols) bx = cols - 1;
        if (by < 0) by = 0; else if (by >= rows) by = rows - 1;
        const idx = by * cols + bx;
        this.hashNext[i] = head[idx];
        head[idx] = i;
      }
    }

    _pair(i, j, dt) {
      let dx = this.x[j] - this.x[i];
      let dy = this.y[j] - this.y[i];
      const W = this.worldW, H = this.worldH;
      if (dx > W * 0.5) dx -= W; else if (dx < -W * 0.5) dx += W;
      if (dy > H * 0.5) dy -= H; else if (dy < -H * 0.5) dy += H;
      const d2 = dx * dx + dy * dy;
      const contact = this.radius[i] + this.radius[j];
      const maxD = contact * CFG.bondRange;
      if (d2 > maxD * maxD) return;

      const d = Math.sqrt(d2) + 1e-6;
      const inv = 1 / d;
      const ai = Math.min(1, this.gAdh[i] + (this.somaState[i] ? 0.25 : 0));
      const aj = Math.min(1, this.gAdh[j] + (this.somaState[j] ? 0.25 : 0));
      const strength = Math.min(ai, aj);

      let bonded = false;
      const capI = 2 + Math.round(4 * ai);
      const capJ = 2 + Math.round(4 * aj);
      if (strength > CFG.bondMinAdhesion &&
          this.clade[i] === this.clade[j] &&
          this.bondCountArr[i] < Math.min(CFG.maxBondsPerCell, capI) &&
          this.bondCountArr[j] < Math.min(CFG.maxBondsPerCell, capJ)) {
        bonded = true;
        this.bondCountArr[i]++;
        this.bondCountArr[j]++;
        this._union(i, j);
        if (this.bondCount < CFG.maxBonds) {
          const b = this.bondCount++;
          this.bondX1[b] = this.x[i];
          this.bondY1[b] = this.y[i];
          this.bondX2[b] = this.x[j];
          this.bondY2[b] = this.y[j];
          this.bondS[b] = strength;
        }
      }

      let f = 0;
      if (bonded) {
        const rest = contact * 1.02;
        f += 36 * strength * (d - rest);
      }
      if (d < contact) {
        f -= 110 * (contact - d);
      }
      if (f !== 0) {
        const fx = f * dx * inv * dt;
        const fy = f * dy * inv * dt;
        this.vx[i] += fx;
        this.vy[i] += fy;
        this.vx[j] -= fx;
        this.vy[j] -= fy;
      }

      if (bonded && this.clade[i] === this.clade[j]) {
        if (this.shareBudget[i] > 1e-7 && this.energy[i] > this.energy[j] + 1e-4) {
          const amt = Math.min(this.shareBudget[i], (this.energy[i] - this.energy[j]) * 0.08);
          this.energy[i] -= amt;
          this.energy[j] += amt * 0.86;
          this.shareBudget[i] -= amt;
        }
        if (this.shareBudget[j] > 1e-7 && this.energy[j] > this.energy[i] + 1e-4) {
          const amt = Math.min(this.shareBudget[j], (this.energy[j] - this.energy[i]) * 0.08);
          this.energy[j] -= amt;
          this.energy[i] += amt * 0.86;
          this.shareBudget[j] -= amt;
        }
      }
    }

    _applyPairs(dt) {
      const cols = this.cols, rows = this.rows;
      const head = this.hashHead, next = this.hashNext;
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        let bx = Math.floor(this.x[i] / this.binW);
        let by = Math.floor(this.y[i] / this.binH);
        if (bx < 0) bx = 0; else if (bx >= cols) bx = cols - 1;
        if (by < 0) by = 0; else if (by >= rows) by = rows - 1;
        for (let oy = -1; oy <= 1; oy++) {
          const cy = (by + oy + rows) % rows;
          for (let ox = -1; ox <= 1; ox++) {
            const cx = (bx + ox + cols) % cols;
            let j = head[cy * cols + cx];
            while (j !== -1) {
              if (j > i && this.alive[j]) this._pair(i, j, dt);
              j = next[j];
            }
          }
        }
      }
    }

    _metabolize(dt) {
      const p = this.params;
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        this.age[i] += dt;
        const s = this.clusterSize[this.clusterId[i]];
        if (!this.somaState[i] && s >= TH.soma.minCluster &&
            this.gSoma[i] > TH.soma.geneThreshold) {
          this.somaState[i] = 1;
        }
        const uptake = this.field.take(this.x[i], this.y[i], 0.50, dt);

        let e = uptake;
        e -= (0.035 +
              p.adhesionCost * this.gAdh[i] +
              p.cooperationCost * this.gCoop[i] +
              0.004 * this.bondCountArr[i] +
              (this.somaState[i] ? 0.015 : 0)) * dt;
        this.energy[i] = Math.min(20, this.energy[i] + e);

        if (this.energy[i] <= 0.20) {
          this._kill(i);
        } else if (this.age[i] > 35 && this.rng.next() < 0.04 * dt) {
          this._kill(i);
        } else if (this.age[i] > 75) {
          this._kill(i);
        }
      }
    }

    _integrate(dt) {
      const W = this.worldW, H = this.worldH;
      // Velocity follows a discrete Ornstein–Uhlenbeck process. The nominal
      // step (dt = 1/60 s) uses damping 0.90 and a uniform innovation with
      // half-width 13*dt. For other steps, both the damping and the
      // innovation variance are scaled so that the stationary velocity
      // variance is invariant. At dt = 1/60 the expression reduces exactly to
      // the original update, preserving nominal trajectories.
      const dt0 = CFG.dt;
      const damp = dt === dt0 ? 0.90 : Math.pow(0.90, dt / dt0);
      const noiseScale = 26 * dt0 * Math.sqrt((1 - damp * damp) / (1 - 0.81));
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        this.vx[i] = this.vx[i] * damp + (this.rng.next() - 0.5) * noiseScale;
        this.vy[i] = this.vy[i] * damp + (this.rng.next() - 0.5) * noiseScale;
        this.x[i] = wrap(this.x[i] + this.vx[i] * dt, W);
        this.y[i] = wrap(this.y[i] + this.vy[i] * dt, H);
      }
    }

    _reproduce(dt) {
      const p = this.params;
      // Cells that died during metabolism are still in pendingFree. Make
      // their slots available before any birth is attempted.
      this._flushPendingFree();
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i] || this.somaState[i]) continue;
        if (this.energy[i] < 1.55 || this.age[i] < 1.2) continue;

        const excess = Math.min(6, this.energy[i] - 1.55);
        const prob = 1 - Math.exp(-1.15 * (0.25 + excess) * dt);
        if (this.rng.next() >= prob) continue;

        // Crowding: a birth replaces the least-energetic cell. This keeps the
        // population bounded without turning reproduction into a slot lottery.
        if (this.pop >= this.maxCells) {
          let victim = -1;
          let minE = Infinity;
          for (let k = 0; k < this.slotCount; k++) {
            if (!this.alive[k] || k === i) continue;
            if (this.energy[k] < minE) {
              minE = this.energy[k];
              victim = k;
            }
          }
          if (victim < 0) continue;
          this._kill(victim);
          // Recycle the victim's slot immediately so the birth can actually
          // replace it. Without this flush the spawn would fail whenever the
          // free list happened to be empty, killing a cell without a birth.
          this._flushPendingFree();
        }

        const E = this.energy[i];
        const childE = E * 0.5 * 0.97;
        this.energy[i] = E * 0.5;

        let adh = this.gAdh[i];
        let coop = this.gCoop[i];
        let soma = this.gSoma[i];
        if (this.rng.next() < p.mutationRate) adh = clamp(adh + this.rng.gauss() * 0.12, 0, 1);
        if (this.rng.next() < p.mutationRate) coop = clamp(coop + this.rng.gauss() * 0.12, 0, 1);
        if (this.rng.next() < p.mutationRate) soma = clamp(soma + this.rng.gauss() * 0.12, 0, 1);

        const ang = this.rng.next() * TAU;
        const dist = this.radius[i] * 1.25 + 0.4;
        const cx = this.x[i] + Math.cos(ang) * dist;
        const cy = this.y[i] + Math.sin(ang) * dist;
        const gen = this.generation[i] + 1;
        const rad = clamp(this.radius[i] + this.rng.gauss() * 0.15, 2.8, 5.4);
        const child = this._spawn(cx, cy, adh, coop, soma, this.clade[i], childE, gen, rad);
        if (child < 0) {
          this.energy[i] = E;
          break;
        }
        if (gen > this.maxGen) this.maxGen = gen;
      }
    }

    _applyPulse() {
      const gs = this.params.groupSelection;
      if (gs <= 0.01) return;
      this._recountClusters();

      const token = ++this.seenToken;
      const seen = this.clusterSeen;
      const adhSum = this.clusterAdhSum;
      const coopSum = this.clusterCoopSum;
      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        const c = this.clusterId[i];
        if (seen[c] !== token) {
          seen[c] = token;
          adhSum[c] = 0;
          coopSum[c] = 0;
        }
        const effAdh = Math.min(1, this.gAdh[i] + (this.somaState[i] ? 0.25 : 0));
        adhSum[c] += effAdh;
        coopSum[c] += this.gCoop[i];
      }

      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        const c = this.clusterId[i];
        const s = this.clusterSize[c];
        if (s >= TH.multicellularMinSize) {
          const meanAdh = adhSum[c] / s;
          const meanCoop = coopSum[c] / s;
          const groupFitness = 0.02 +
            0.08 * Math.min(1, s / 50) +
            0.60 * meanAdh +
            0.30 * meanCoop;
          this.energy[i] = Math.min(20, this.energy[i] + gs * groupFitness);
        } else {
          const p = gs * (s <= 1 ? 0.22 : 0.09);
          if (this.rng.next() < p) this._kill(i);
        }
      }
      this.pulseFlash = 1;
      this.pulseCount++;
      if (this.pulseCount % 5 === 0) {
        this._log('Seçilim darbesi #' + this.pulseCount + ' — grup baskısı ' + gs.toFixed(2));
      }
    }

    _handlePulse(dt) {
      this.pulseTimer += dt;
      if (this.pulseTimer >= CFG.pulseInterval) {
        this.pulseTimer -= CFG.pulseInterval;
        this._applyPulse();
      }
      this.pulseFlash = Math.max(0, this.pulseFlash - dt * 1.6);
    }

    step(dt) {
      this._flushPendingFree();
      this.time += dt;
      this.tick++;
      this.field.update(dt, this.params.nutrientSupply);

      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        this.bondCountArr[i] = 0;
        const coop = this.somaState[i] ? 0.9 : this.gCoop[i];
        this.shareBudget[i] = coop * 0.07 * dt * Math.min(1, Math.max(0, this.energy[i]));
      }

      this._beginClusters();
      this._buildHash();
      this._applyPairs(dt);
      this._finishClusters();
      this._metabolize(dt);
      this._integrate(dt);
      this._reproduce(dt);
      this._handlePulse(dt);

      if (this.time - this.lastHistory >= CFG.metricsInterval) {
        this._computeMetrics(false);
      }
    }

    _computeMetrics(initial) {
      this._recountClusters();
      let pop = 0, sumS = 0, mc = 0, maxCluster = 0, soma = 0;
      let sumAdh = 0, sumCoop = 0, sumSoma = 0, sumGen = 0;
      let sumEnergy = 0, sumAge = 0;
      let clusterCount = 0, clusters8 = 0, clusters20 = 0;
      const histogram = [0, 0, 0, 0, 0, 0, 0];
      const token = ++this.seenToken;
      const seen = this.clusterSeen;

      for (let i = 0; i < this.slotCount; i++) {
        if (!this.alive[i]) continue;
        pop++;
        const s = this.clusterSize[this.clusterId[i]];
        sumS += s;
        if (s > maxCluster) maxCluster = s;
        if (s >= TH.multicellularMinSize) mc++;
        if (this.somaState[i]) soma++;
        sumAdh += this.gAdh[i];
        sumCoop += this.gCoop[i];
        sumSoma += this.gSoma[i];
        sumGen += this.generation[i];
        sumEnergy += this.energy[i];
        sumAge += this.age[i];

        const c = this.clusterId[i];
        if (seen[c] !== token) {
          seen[c] = token;
          clusterCount++;
          if (s >= TH.multicellularMinSize) clusters8++;
          if (s >= TH.tissueMinSize) clusters20++;
          let b = 0;
          while (b < HIST_BINS.length - 1 && s > HIST_BINS[b]) b++;
          histogram[b]++;
        }
      }

      const inv = pop > 0 ? 1 / pop : 0;
      this.metrics = {
        pop,
        mcFrac: pop > 0 ? mc / pop : 0,
        meanCluster: pop > 0 ? sumS / pop : 0,
        maxCluster,
        meanAdh: sumAdh * inv,
        meanCoop: sumCoop * inv,
        meanSoma: sumSoma * inv,
        somaFrac: pop > 0 ? soma / pop : 0,
        meanGen: sumGen * inv,
        meanEnergy: sumEnergy * inv,
        meanAge: sumAge * inv,
        clusterCount,
        clusters8,
        clusters20,
        histogram
      };

      if (initial) {
        this.history.push(this._historyPoint());
        this.lastHistory = this.time;
      } else if (this.time - this.lastHistory >= CFG.historyInterval) {
        this.history.push(this._historyPoint());
        this.lastHistory = this.time;
        if (this.history.length > CFG.historyLimit) this.history.shift();
        this._checkEvents();
        this.verdict = this._computeVerdict();
      }
    }

    _historyPoint() {
      const m = this.metrics;
      return {
        t: this.time, pop: m.pop, mcFrac: m.mcFrac,
        meanAdh: m.meanAdh, meanCoop: m.meanCoop, meanSoma: m.meanSoma,
        meanCluster: m.meanCluster, maxCluster: m.maxCluster, somaFrac: m.somaFrac
      };
    }

    _checkEvents() {
      const m = this.metrics;
      const f = this.flags;
      if (!f.cluster8 && m.clusters8 > 0) {
        f.cluster8 = true;
        this._log('İlk çok hücreli küme — ' + m.clusters8 + ' küme ≥8 hücre');
      }
      if (!f.cluster20 && m.maxCluster >= 20) {
        f.cluster20 = true;
        this._log('Doku düzeyi küme — en büyük küme ' + m.maxCluster + ' hücre');
      }
      if (!f.soma && m.somaFrac > 0.004) {
        f.soma = true;
        this._log('İlk somatik hücre — işbölümü başladı');
      }
      if (!f.adhHigh && m.meanAdh > 0.5) {
        f.adhHigh = true;
        this._log('Yapışma geni ortalama 0.50 eşiğini geçti');
      }
      if (!f.mcHigh && m.mcFrac > 0.3) {
        f.mcHigh = true;
        this._log('Çok hücreli hücre oranı %30 eşiğini geçti');
      }
      if (!f.adhLow && this.time > 30 && m.meanAdh < 0.2) {
        f.adhLow = true;
        this._log('Yapışma geni 0.20 altına düştü — kümeler çözülüyor');
      }
      if (!f.popHigh && m.pop > 3000) {
        f.popHigh = true;
        this._log('Popülasyon 3.000 hücreyi geçti');
      }
    }

    _computeVerdict() {
      const m = this.metrics;
      const t = this.time;
      const est = TH.established;
      const col = TH.collapsed;

      if (t < TH.minTime) {
        return {
          status: 'running',
          title: 'Gözlem sürüyor',
          text: 'Seçilim rejimi uygulanıyor. Değerlendirme, önceden tanımlı eşikler ve en az ' +
            TH.minTime + ' saniyelik simülasyon süresi gerektirir.',
          meter: clamp(t / TH.minTime, 0, 1),
          foot: Math.ceil(TH.minTime - t) + ' sn simülasyon kaldı'
        };
      }
      if (m.pop < TH.minPopulation) {
        return {
          status: 'extinct',
          title: 'Popülasyon tükendi',
          text: 'Bu tohum için popülasyon ' + TH.minPopulation +
            ' hücrenin altına düştü; model değerlendirmesi yapılamaz.',
          meter: 1,
          foot: 'popülasyon ' + m.pop
        };
      }

      let past = null;
      for (let i = this.history.length - 1; i >= 0; i--) {
        if (this.history[i].t <= t - TH.decline.window) { past = this.history[i]; break; }
      }
      const deltaMc = past ? m.mcFrac - past.mcFrac : 0;

      if (m.mcFrac > est.mcFrac && m.meanAdh > est.meanAdh && m.maxCluster >= est.maxCluster) {
        if (deltaMc < TH.decline.deltaMc) {
          return {
            status: 'declining',
            title: 'Kümeleşme geriliyor',
            text: 'Kümeler hâlâ var, ancak çok hücreli hücre oranı son ' +
              TH.decline.window + ' saniyede ' +
              Math.abs(TH.decline.deltaMc * 100).toFixed(0) +
              ' puandan fazla düştü. Bu, koşudaki yapının kararlı olmadığını gösterir.',
            meter: clamp(0.5 + deltaMc, 0, 1),
            foot: 'Δ çok hücreli oran ' + (deltaMc * 100).toFixed(1) + ' puan'
          };
        }
        return {
          status: 'established',
          title: 'Basit çok hücrelilik kuruldu',
          text: 'Bu koşuda önceden tanımlı eşikler aşıldı: popülasyonun >%' +
            (est.mcFrac * 100).toFixed(0) + '\'u ≥' + TH.multicellularMinSize +
            ' hücreli kümelerde, ortalama yapışma >' + est.meanAdh.toFixed(2) +
            ' ve en büyük küme ≥' + est.maxCluster +
            ' hücre. Bu, seçilim altında küme yapısının korunduğunu gösterir; yeni gen kökeninin kanıtı değildir.',
          meter: clamp(m.mcFrac, 0, 1),
          foot: 'ort. küme ' + m.meanCluster.toFixed(1) +
            (m.somaFrac > 0.01
              ? ' · işbölümü %' + (m.somaFrac * 100).toFixed(0)
              : ' · işbölümü henüz yok')
        };
      }

      if (m.mcFrac < col.mcFrac && m.meanAdh < col.meanAdh) {
        return {
          status: 'collapsed',
          title: 'Kümeleşme çöktü',
          text: 'Bu koşuda çok hücreli oran %' + (col.mcFrac * 100).toFixed(0) +
            '\'in, ortalama yapışma ' + col.meanAdh.toFixed(2) +
            '\'nin altına düştü. Bireysel seçilim, yapışma ve işbirliğinin maliyetini cezalandırdı; tek hücreli yaşam baskın.',
          meter: clamp(1 - m.mcFrac, 0, 1),
          foot: 'yapışma geni ' + m.meanAdh.toFixed(2) +
            ' · tek hücre %' + ((1 - m.mcFrac) * 100).toFixed(0)
        };
      }

      return {
        status: 'transition',
        title: 'Geçiş dönemi',
        text: 'Önceden tanımlı “basit çok hücrelilik kuruldu” veya “kümeleşme çöktü” eşikleri aşılmadı; sonuç ara durumda. ' +
          'Mutasyon, yapışma maliyeti ve seçilim düzeyi bu aralıkta belirleyici olabilir.',
        meter: clamp(m.mcFrac / est.mcFrac, 0, 1),
        foot: 'çok hücreli oran %' + (m.mcFrac * 100).toFixed(0) +
          ' · eşik %' + (est.mcFrac * 100).toFixed(0)
      };
    }

    _log(text) {
      this.events.push({
        t: this.time,
        gen: this.maxGen,
        text
      });
      if (this.events.length > 80) this.events.shift();
    }

    setParams(partial) {
      if (partial.seed !== undefined && (partial.seed >>> 0) !== this.seed) {
        Object.assign(this.params, partial);
        this.reset(this.params.seed);
        return;
      }
      Object.assign(this.params, partial);
    }

    runHeadless(seconds, dt) {
      const step = dt == null ? CFG.dt : dt;
      if (!(step > 0) || !Number.isFinite(step)) {
        throw new Error('Geçersiz entegrasyon adımı: ' + step);
      }
      const steps = Math.ceil(seconds / step);
      for (let i = 0; i < steps; i++) this.step(step);
      this._computeMetrics(false);
      this.verdict = this._computeVerdict();
      return this.summary();
    }

    summary() {
      return {
        modelVersion: MODEL_VERSION,
        seed: this.seed,
        time: +this.time.toFixed(2),
        maxGen: this.maxGen,
        births: this.births,
        deaths: this.deaths,
        failedSpawns: this.failedSpawns,
        fieldMean: +(this.field.n.reduce((a, b) => a + b, 0) / this.field.n.length).toFixed(3),
        params: Object.assign({}, this.params),
        metrics: Object.assign({}, this.metrics, { histogram: this.metrics.histogram.slice() }),
        initialMetrics: Object.assign({}, this.initialMetrics, {
          histogram: this.initialMetrics.histogram.slice()
        }),
        verdict: this.verdict ? Object.assign({}, this.verdict) : null,
        events: this.events.slice(-12)
      };
    }
  }

  Simulation.HIST_LABELS = HIST_LABELS;
  global.ORIGIN_SIM = Simulation;
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * ORIGIN LAB — browser-console replication harness
 *
 * Open index.html, then run:
 *   const rows = await ORIGIN_REPLICATE.run();
 *   ORIGIN_REPLICATE.download(rows);
 *
 * The default design is 20 paired seeds per regime at 60 simulated seconds.
 * The same seed set is used in every regime (paired design). This is the
 * primary replication reported in README.md; the headless Python runner is
 * scripts/headless_replication.py.
 */
(function (global) {
  'use strict';

  const PRESETS = global.ORIGIN_CONFIG.PRESETS;
  const TH = global.ORIGIN_CONFIG.VERDICT_THRESHOLDS;

  function yieldToUI() {
    return new Promise((resolve) => global.setTimeout(resolve, 0));
  }

  async function run(options) {
    options = options || {};
    const regimes = options.regimes || ['control', 'group', 'predation', 'mutation'];
    const count = options.n || 20;
    const seconds = options.seconds || 60;
    const seedBase = options.seedBase == null ? 500000 : options.seedBase;
    const rows = [];

    for (const key of regimes) {
      const preset = PRESETS[key];
      if (!preset) throw new Error('Bilinmeyen rejim: ' + key);
      for (let r = 0; r < count; r++) {
        const seed = (seedBase + r * 7919) >>> 0;
        const sim = new global.ORIGIN_SIM(Object.assign({}, preset.params, { seed }));
        const out = sim.runHeadless(seconds);
        rows.push({
          modelVersion: out.modelVersion,
          regime: key,
          label: preset.label,
          seed,
          time: out.time,
          dt: global.ORIGIN_CONFIG.CONFIG.dt,
          maxGen: out.maxGen,
          births: out.births,
          deaths: out.deaths,
          failedSpawns: out.failedSpawns,
          pop: out.metrics.pop,
          mcFrac: out.metrics.mcFrac,
          meanCluster: out.metrics.meanCluster,
          maxCluster: out.metrics.maxCluster,
          clusters8: out.metrics.clusters8,
          clusters20: out.metrics.clusters20,
          meanAdh: out.metrics.meanAdh,
          meanCoop: out.metrics.meanCoop,
          somaFrac: out.metrics.somaFrac,
          meanGen: out.metrics.meanGen,
          initialMcFrac: out.initialMetrics.mcFrac,
          initialMeanAdh: out.initialMetrics.meanAdh,
          deltaMcFrac: out.metrics.mcFrac - out.initialMetrics.mcFrac,
          deltaMeanAdh: out.metrics.meanAdh - out.initialMetrics.meanAdh,
          verdict: out.verdict.status
        });
        await yieldToUI();
      }
    }
    return rows;
  }

  function toCSV(rows) {
    if (!rows.length) return '';
    const header = Object.keys(rows[0]);
    const cell = (value) => {
      const text = String(value == null ? '' : value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    return '\ufeff' + [header].concat(rows.map((row) => header.map((key) => row[key])))
      .map((line) => line.map(cell).join(','))
      .join('\r\n') + '\r\n';
  }

  function download(rows) {
    const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'origin-lab-replicates.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.ORIGIN_REPLICATE = { run, toCSV, download, thresholds: TH };
})(typeof window !== 'undefined' ? window : globalThis);

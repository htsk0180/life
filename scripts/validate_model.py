#!/usr/bin/env python3
"""Fast model-level validation for ORIGIN LAB.

Runs the browser-independent core in JavaScriptCore and checks:
- model version and frozen thresholds,
- deterministic replay for a fixed seed,
- finite metrics,
- initial-condition invariants,
- summary schema,
- a coarse dt sanity check (not a formal convergence proof).

Usage:
    python3 scripts/validate_model.py
"""

import json
import os
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'
JSC = os.environ.get('JSC', DEFAULT_JSC)

CORE = '\n'.join(
    (ROOT / name).read_text(encoding='utf-8')
    for name in ('js/config.js', 'js/rng.js', 'js/nutrient.js', 'js/simulation.js')
)

SCRIPT = CORE + r"""
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail });
}
function finiteMetrics(m) {
  return ['pop', 'mcFrac', 'meanCluster', 'maxCluster', 'meanAdh', 'meanCoop',
          'somaFrac', 'meanGen'].every(function (k) {
    return Number.isFinite(m[k]);
  });
}

const cfg = ORIGIN_CONFIG;
check('model version', cfg.MODEL_VERSION === '1.3.0', cfg.MODEL_VERSION);
check('thresholds frozen', Object.isFrozen(cfg.VERDICT_THRESHOLDS),
      String(Object.isFrozen(cfg.VERDICT_THRESHOLDS)));
check('established threshold', cfg.VERDICT_THRESHOLDS.established.mcFrac === 0.30,
      cfg.VERDICT_THRESHOLDS.established.mcFrac);

const a = new ORIGIN_SIM({ seed: 424242, groupSelection: 0.9 });
const b = new ORIGIN_SIM({ seed: 424242, groupSelection: 0.9 });
const ra = a.runHeadless(5);
const rb = b.runHeadless(5);
const same = ra.metrics.pop === rb.metrics.pop &&
  ra.metrics.mcFrac === rb.metrics.mcFrac &&
  ra.metrics.meanAdh === rb.metrics.meanAdh &&
  ra.metrics.maxCluster === rb.metrics.maxCluster;
check('deterministic replay', same, {
  a: ra.metrics, b: rb.metrics
});
check('finite metrics', finiteMetrics(ra.metrics), ra.metrics);
check('summary schema',
  ra.modelVersion === '1.3.0' && !!ra.initialMetrics && !!ra.verdict &&
  typeof ra.verdict.status === 'string',
  { modelVersion: ra.modelVersion, verdict: ra.verdict.status });

function auditAccounting(sim, out) {
  let alive = 0;
  for (let i = 0; i < sim.slotCount; i++) if (sim.alive[i]) alive++;
  const free = new Set();
  for (let i = 0; i < sim.freeCount; i++) free.add(sim.freeList[i]);
  const pending = new Set(sim.pendingFree);
  let overlap = 0;
  for (const slot of free) if (pending.has(slot)) overlap++;
  return {
    popMatchesAlive: out.metrics.pop === alive,
    birthDeathBalance: out.births - out.deaths === out.metrics.pop - 320,
    noFailedSpawns: out.failedSpawns === 0,
    slotAccounting: alive + sim.freeCount + sim.pendingFree.length === sim.slotCount,
    freePendingOverlap: overlap === 0,
    alive: alive,
    pop: out.metrics.pop,
    births: out.births,
    deaths: out.deaths,
    failedSpawns: out.failedSpawns,
    slotCount: sim.slotCount,
    freeCount: sim.freeCount,
    pendingCount: sim.pendingFree.length
  };
}
const accounting = auditAccounting(a, ra);
check('population accounting', accounting.popMatchesAlive &&
      accounting.birthDeathBalance && accounting.noFailedSpawns &&
      accounting.slotAccounting && accounting.freePendingOverlap,
      accounting);

const initial = new ORIGIN_SIM({ seed: 987654 });
check('initial population', initial.initialMetrics.pop === 320,
      initial.initialMetrics.pop);
check('initial no clusters', initial.initialMetrics.mcFrac === 0 &&
      initial.initialMetrics.maxCluster === 1,
      { mcFrac: initial.initialMetrics.mcFrac,
        maxCluster: initial.initialMetrics.maxCluster });

const coarse = new ORIGIN_SIM({ seed: 424242, groupSelection: 0.9 });
const fine = new ORIGIN_SIM({ seed: 424242, groupSelection: 0.9 });
const rc = coarse.runHeadless(20, 1 / 60);
const rf = fine.runHeadless(20, 1 / 120);
check('dt sanity: finite', finiteMetrics(rc.metrics) && finiteMetrics(rf.metrics),
      { coarse: rc.metrics, fine: rf.metrics });
check('dt sanity: bounded mcFrac',
      Math.abs(rc.metrics.mcFrac - rf.metrics.mcFrac) < 0.25,
      { coarse: rc.metrics.mcFrac, fine: rf.metrics.mcFrac });

print(JSON.stringify({
  passed: checks.every(function (c) { return c.pass; }),
  checks,
  dtComparison: {
    coarse: { time: rc.time, pop: rc.metrics.pop, mcFrac: rc.metrics.mcFrac },
    fine: { time: rf.time, pop: rf.metrics.pop, mcFrac: rf.metrics.mcFrac }
  }
}, null, 2));
"""


def main():
    if not pathlib.Path(JSC).exists():
        raise SystemExit('JavaScriptCore bulunamadı: %s' % JSC)
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as handle:
        handle.write(SCRIPT)
        path = handle.name
    try:
        result = subprocess.run([JSC, path], capture_output=True, text=True, timeout=180)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        raise SystemExit(result.returncode)
    payload = json.loads(result.stdout)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    if not payload['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

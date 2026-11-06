#!/usr/bin/env python3
"""60-second integration-step check for the two nominal seeds.

Runs the control and group-selection presets at dt = 1/60, 1/120 and 1/240
for 60 simulated seconds. This is a coarse robustness check, not a formal
convergence proof: different dt values consume the PRNG differently, so the
trajectories are not expected to be identical.

Outputs:
    data/dt60_check.json
"""

import json
import os
import pathlib
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'
JSC = os.environ.get('JSC', DEFAULT_JSC)
SECONDS = 60.0
CASES = (
    ('control', 4117, 1 / 60),
    ('control', 4117, 1 / 120),
    ('control', 4117, 1 / 240),
    ('group', 20261103, 1 / 60),
    ('group', 20261103, 1 / 120),
    ('group', 20261103, 1 / 240),
)

CORE = '\n'.join(
    (ROOT / name).read_text(encoding='utf-8')
    for name in ('js/config.js', 'js/rng.js', 'js/nutrient.js', 'js/simulation.js')
)

SCRIPT_TEMPLATE = CORE + """
const regime = __REGIME__;
const seed = __SEED__;
const dt = __DT__;
const preset = ORIGIN_CONFIG.PRESETS[regime];
const sim = new ORIGIN_SIM(Object.assign({}, preset.params, { seed }));
const out = sim.runHeadless(__SECONDS__, dt);
print(JSON.stringify({
  modelVersion: out.modelVersion,
  regime,
  seed,
  dt,
  time: out.time,
  pop: out.metrics.pop,
  mcFrac: +out.metrics.mcFrac.toFixed(6),
  meanAdh: +out.metrics.meanAdh.toFixed(6),
  maxCluster: out.metrics.maxCluster,
  failedSpawns: out.failedSpawns,
  verdict: out.verdict.status
}));
"""


def run_case(case):
    regime, seed, dt = case
    script = (SCRIPT_TEMPLATE
              .replace('__REGIME__', json.dumps(regime))
              .replace('__SEED__', json.dumps(seed))
              .replace('__DT__', json.dumps(dt))
              .replace('__SECONDS__', json.dumps(SECONDS)))
    handle = tempfile.NamedTemporaryFile('w', suffix='.js', delete=False)
    handle.write(script)
    handle.close()
    try:
        result = subprocess.run([JSC, handle.name], capture_output=True, text=True, timeout=1800)
    finally:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def main():
    if not pathlib.Path(JSC).exists():
        raise SystemExit('JavaScriptCore bulunamadı: %s' % JSC)
    started = time.time()
    with ThreadPoolExecutor(max_workers=len(CASES)) as pool:
        rows = list(pool.map(run_case, CASES))
    rows.sort(key=lambda row: (row['regime'], row['dt']))

    print('| Rejim | Tohum | dt | pop | mcFrac | meanAdh | maxCluster | Başarısız doğum | Sonuç |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |')
    for row in rows:
        print('| %s | %d | 1/%.0f | %d | %.4f | %.4f | %d | %d | %s |' % (
            row['regime'], row['seed'], round(1 / row['dt']), row['pop'],
            row['mcFrac'], row['meanAdh'], row['maxCluster'],
            row['failedSpawns'], row['verdict'],
        ))

    by_regime = {}
    for row in rows:
        by_regime.setdefault(row['regime'], {})[round(1 / row['dt'])] = row
    for regime, table in by_regime.items():
        base = table[60]['mcFrac']
        for step in (120, 240):
            print('%s dt=1/%d: ΔmcFrac = %+.4f' % (regime, step, table[step]['mcFrac'] - base))

    json_path = ROOT / 'data/dt60_check.json'
    json_path.write_text(json.dumps({
        'modelVersion': rows[0].get('modelVersion'),
        'design': {'seconds': SECONDS, 'cases': CASES},
        'rows': rows,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({
        'runs': len(rows),
        'wallSeconds': round(time.time() - started, 1),
        'json': str(json_path),
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

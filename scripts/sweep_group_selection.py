#!/usr/bin/env python3
"""One-at-a-time group-selection dose-response sweep.

Holds mutation, nutrient supply and costs at the default values and varies only
groupSelection. Uses the first eight paired seeds so that levels are paired.

Default: 5 levels x 8 seeds x 60 s = 40 runs. Each level runs in its own
JavaScriptCore process; levels are independent and can run concurrently.

Outputs:
    data/sweep_group_selection.json
    data/sweep_group_selection.csv
"""

import csv
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

LEVELS = (0.0, 0.25, 0.5, 0.75, 1.0)
SEEDS = [(500000 + i * 7919) & 0xFFFFFFFF for i in range(8)]
SECONDS = 60.0

CORE = '\n'.join(
    (ROOT / name).read_text(encoding='utf-8')
    for name in ('js/config.js', 'js/rng.js', 'js/nutrient.js', 'js/simulation.js')
)

SCRIPT_TEMPLATE = CORE + """
const level = __LEVEL__;
const seeds = __SEEDS__;
const seconds = __SECONDS__;
const rows = [];
for (const seed of seeds) {
  const params = Object.assign({}, ORIGIN_CONFIG.DEFAULT_PARAMS, {
    groupSelection: level,
    seed
  });
  const sim = new ORIGIN_SIM(params);
  const out = sim.runHeadless(seconds);
  rows.push({
    modelVersion: out.modelVersion,
    groupSelection: level,
    seed,
    time: out.time,
    dt: ORIGIN_CONFIG.CONFIG.dt,
    maxGen: out.maxGen,
    births: out.births,
    deaths: out.deaths,
    failedSpawns: out.failedSpawns,
    pop: out.metrics.pop,
    mcFrac: +out.metrics.mcFrac.toFixed(6),
    meanCluster: +out.metrics.meanCluster.toFixed(6),
    maxCluster: out.metrics.maxCluster,
    clusters8: out.metrics.clusters8,
    clusters20: out.metrics.clusters20,
    meanAdh: +out.metrics.meanAdh.toFixed(6),
    meanCoop: +out.metrics.meanCoop.toFixed(6),
    somaFrac: +out.metrics.somaFrac.toFixed(6),
    meanGen: +out.metrics.meanGen.toFixed(4),
    initialMcFrac: +out.initialMetrics.mcFrac.toFixed(6),
    initialMeanAdh: +out.initialMetrics.meanAdh.toFixed(6),
    deltaMcFrac: +(out.metrics.mcFrac - out.initialMetrics.mcFrac).toFixed(6),
    deltaMeanAdh: +(out.metrics.meanAdh - out.initialMetrics.meanAdh).toFixed(6),
    verdict: out.verdict.status
  });
}
print(JSON.stringify(rows));
"""


def run_level(level):
    script = (SCRIPT_TEMPLATE
              .replace('__LEVEL__', json.dumps(level))
              .replace('__SEEDS__', json.dumps(SEEDS))
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
    with ThreadPoolExecutor(max_workers=len(LEVELS)) as pool:
        by_level = list(pool.map(run_level, LEVELS))
    rows = [row for level_rows in by_level for row in level_rows]

    json_path = ROOT / 'data/sweep_group_selection.json'
    csv_path = ROOT / 'data/sweep_group_selection.csv'
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps({
        'modelVersion': rows[0]['modelVersion'],
        'design': {
            'levels': list(LEVELS),
            'seeds': SEEDS,
            'seconds': SECONDS,
            'nPerLevel': len(SEEDS),
        },
        'rows': rows,
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    fields = [
        'modelVersion', 'groupSelection', 'seed', 'time', 'dt', 'maxGen',
        'births', 'deaths', 'failedSpawns',
        'pop', 'mcFrac', 'meanCluster', 'maxCluster', 'clusters8', 'clusters20',
        'meanAdh', 'meanCoop', 'somaFrac', 'meanGen',
        'initialMcFrac', 'initialMeanAdh', 'deltaMcFrac', 'deltaMeanAdh', 'verdict',
    ]
    with csv_path.open('w', newline='', encoding='utf-8-sig') as out:
        writer = csv.DictWriter(out, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, '') for key in fields})

    print(json.dumps({
        'runs': len(rows),
        'wallSeconds': round(time.time() - started, 1),
        'json': str(json_path),
        'csv': str(csv_path),
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

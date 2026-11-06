#!/usr/bin/env python3
"""Run the four default presets at their default seeds.

These are the representative runs quoted in README.md. They are separate from
the paired replication because the preset seeds are not the paired seed set.

Outputs:
    data/nominal_runs.json
    data/nominal_runs.csv

Usage:
    python3 scripts/nominal_runs.py
"""

import csv
import json
import os
import pathlib
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'
JSC = os.environ.get('JSC', DEFAULT_JSC)

REGIMES = ('control', 'group', 'predation', 'mutation')
SECONDS = 60.0
CORE = '\n'.join(
    (ROOT / name).read_text(encoding='utf-8')
    for name in ('js/config.js', 'js/rng.js', 'js/nutrient.js', 'js/simulation.js')
)

SCRIPT = CORE + f"""
const regimes = {json.dumps(REGIMES)};
const seconds = {json.dumps(SECONDS)};
const rows = [];
for (const regime of regimes) {{
  const preset = ORIGIN_CONFIG.PRESETS[regime];
  const sim = new ORIGIN_SIM(Object.assign({{}}, preset.params));
  const out = sim.runHeadless(seconds);
  rows.push({{
    modelVersion: out.modelVersion,
    regime,
    label: preset.label,
    seed: out.seed,
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
  }});
}}
print(JSON.stringify(rows));
"""


def main():
    if not pathlib.Path(JSC).exists():
        raise SystemExit('JavaScriptCore bulunamadı: %s' % JSC)
    started = time.time()
    handle = tempfile.NamedTemporaryFile('w', suffix='.js', delete=False)
    handle.write(SCRIPT)
    handle.close()
    try:
        result = subprocess.run([JSC, handle.name], capture_output=True, text=True, timeout=1800)
    finally:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
    if result.returncode != 0:
        raise SystemExit(result.stderr)
    rows = json.loads(result.stdout)

    json_path = ROOT / 'data/nominal_runs.json'
    csv_path = ROOT / 'data/nominal_runs.csv'
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps({
        'modelVersion': rows[0]['modelVersion'],
        'design': {'regimes': list(REGIMES), 'seconds': SECONDS},
        'rows': rows,
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    fields = [
        'modelVersion', 'regime', 'label', 'seed', 'time', 'dt', 'maxGen',
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

    print('| Rejim | Tohum | pop | mcFrac | meanAdh | meanCoop | maxCluster | somaFrac | Başarısız doğum | Sonuç |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |')
    for row in rows:
        print('| %s | %d | %d | %.4f | %.4f | %.4f | %d | %.4f | %d | %s |' % (
            row['label'], row['seed'], row['pop'], row['mcFrac'], row['meanAdh'],
            row['meanCoop'], row['maxCluster'], row['somaFrac'], row['failedSpawns'],
            row['verdict'],
        ))
    print(json.dumps({
        'runs': len(rows),
        'wallSeconds': round(time.time() - started, 1),
        'json': str(json_path),
        'csv': str(csv_path),
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

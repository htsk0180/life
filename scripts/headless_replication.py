#!/usr/bin/env python3
"""Headless paired-seed replication for ORIGIN LAB.

This runner is intentionally dependency-free (Python standard library only).
It evaluates the browser-independent simulation core in JavaScriptCore (JSC),
which ships with macOS. On other systems, set JSC to a compatible JavaScript
engine binary or use the browser console harness in scripts/replicate.js.

Design
------
- Four selection regimes.
- One common seed set shared by every regime (paired design).
- Default: 20 seeds x 4 regimes x 60 simulated seconds = 80 runs.

Outputs
-------
- data/replicates_paired.json  (raw rows + design metadata)
- data/replicates_paired.csv   (one row per run)

Usage
-----
    python3 scripts/headless_replication.py
    python3 scripts/headless_replication.py --n 10 --seconds 60
"""

import argparse
import csv
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'
JSC = os.environ.get('JSC', DEFAULT_JSC)

REGIMES = ('control', 'group', 'predation', 'mutation')
LABELS = {
    'control': 'Kontrol',
    'group': 'Grup seçilimi',
    'predation': 'Güçlü baskı',
    'mutation': 'Yüksek mutasyon',
}
SEED_BASE = 500000
SEED_STRIDE = 7919

CORE_FILES = ('js/config.js', 'js/rng.js', 'js/nutrient.js', 'js/simulation.js')


def build_core():
    return '\n'.join((ROOT / name).read_text(encoding='utf-8') for name in CORE_FILES)


def make_script(core, regime, seeds, seconds):
    return core + f"""
const regime = {json.dumps(regime)};
const seeds = {json.dumps(seeds)};
const seconds = {json.dumps(seconds)};
const preset = ORIGIN_CONFIG.PRESETS[regime];
const rows = [];
for (const seed of seeds) {{
  const params = Object.assign({{}}, preset.params, {{ seed }});
  const sim = new ORIGIN_SIM(params);
  const out = sim.runHeadless(seconds);
  rows.push({{
    modelVersion: out.modelVersion,
    regime,
    label: preset.label,
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
  }});
}}
print(JSON.stringify(rows));
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--n', type=int, default=20, help='seeds per regime')
    parser.add_argument('--seconds', type=float, default=60.0)
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--output-json', default=str(ROOT / 'data/replicates_paired.json'))
    parser.add_argument('--output-csv', default=str(ROOT / 'data/replicates_paired.csv'))
    args = parser.parse_args()

    if not pathlib.Path(JSC).exists():
        raise SystemExit(
            'JavaScriptCore bulunamadı: %s\n'
            'JSC ortam değişkeniyle uyumlu bir motor yolu verin veya '
            'scripts/replicate.js tarayıcı koşucusunu kullanın.' % JSC
        )

    seeds = [(SEED_BASE + i * SEED_STRIDE) & 0xFFFFFFFF for i in range(args.n)]
    core = build_core()
    processes = []
    temp_paths = []
    started = time.time()

    print('Paired design: %d seeds x %d regimes x %.1f s = %d runs'
          % (args.n, len(REGIMES), args.seconds, args.n * len(REGIMES)), flush=True)
    print('Seeds: %s ... %s' % (seeds[0], seeds[-1]), flush=True)

    for regime in REGIMES:
        handle = tempfile.NamedTemporaryFile('w', suffix='.js', delete=False)
        handle.write(make_script(core, regime, seeds, args.seconds))
        handle.close()
        temp_paths.append(handle.name)
        processes.append((regime, subprocess.Popen(
            [JSC, handle.name],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )))

    rows = []
    for regime, process in processes:
        stdout, stderr = process.communicate()
        if process.returncode != 0:
            raise RuntimeError('%s failed:\n%s' % (regime, stderr))
        parsed = json.loads(stdout.strip())
        rows.extend(parsed)
        print('  %-9s %d runs' % (regime, len(parsed)), flush=True)

    for path in temp_paths:
        try:
            os.unlink(path)
        except OSError:
            pass

    rows.sort(key=lambda row: (REGIMES.index(row['regime']), row['seed']))
    payload = {
        'modelVersion': rows[0]['modelVersion'] if rows else None,
        'design': {
            'pairedSeeds': True,
            'seedBase': SEED_BASE,
            'seedStride': SEED_STRIDE,
            'seeds': seeds,
            'regimes': list(REGIMES),
            'seconds': args.seconds,
            'nPerRegime': args.n,
        },
        'rows': rows,
    }

    json_path = pathlib.Path(args.output_json)
    csv_path = pathlib.Path(args.output_csv)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')

    fields = [
        'modelVersion', 'regime', 'label', 'seed', 'time', 'dt', 'maxGen',
        'births', 'deaths', 'failedSpawns',
        'pop', 'mcFrac', 'meanCluster', 'maxCluster', 'clusters8', 'clusters20',
        'meanAdh', 'meanCoop', 'somaFrac', 'meanGen',
        'initialMcFrac', 'initialMeanAdh', 'deltaMcFrac', 'deltaMeanAdh', 'verdict',
    ]
    with csv_path.open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
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

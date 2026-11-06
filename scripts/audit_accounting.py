#!/usr/bin/env python3
"""Post-hoc population-accounting audit of the primary group-selection runs.

The primary paired CSV was generated with the first v1.3.0 runner, before
births/deaths/failedSpawns were added to its output schema. This audit re-runs
the 20 group-selection seeds with the current runner and checks:

- failedSpawns == 0 for every seed,
- pop == births - deaths + 320 (initial population),
- the final mcFrac matches the primary CSV to 1e-6.

It is a reproducibility/accounting check, not a new primary analysis.

Outputs:
    data/accounting_audit.csv
    data/accounting_audit.json
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
SEED_BASE = 500000
SEED_STRIDE = 7919
N_SEEDS = 20
SECONDS = 60.0
WORKERS = 4
INITIAL_POP = 320

CORE = '\n'.join(
    (ROOT / name).read_text(encoding='utf-8')
    for name in ('js/config.js', 'js/rng.js', 'js/nutrient.js', 'js/simulation.js')
)

SCRIPT_TEMPLATE = CORE + """
const seed = __SEED__;
const preset = ORIGIN_CONFIG.PRESETS.group;
const sim = new ORIGIN_SIM(Object.assign({}, preset.params, { seed }));
const out = sim.runHeadless(__SECONDS__);
print(JSON.stringify({
  seed: out.seed,
  time: out.time,
  pop: out.metrics.pop,
  births: out.births,
  deaths: out.deaths,
  failedSpawns: out.failedSpawns,
  mcFrac: +out.metrics.mcFrac.toFixed(6),
  meanAdh: +out.metrics.meanAdh.toFixed(6),
  maxCluster: out.metrics.maxCluster,
  verdict: out.verdict.status
}));
"""


def run_seed(seed):
    script = (SCRIPT_TEMPLATE
              .replace('__SEED__', json.dumps(seed))
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


def load_primary_group():
    path = ROOT / 'data/replicates_paired.csv'
    with path.open(newline='', encoding='utf-8-sig') as handle:
        rows = list(csv.DictReader(handle))
    return {
        int(row['seed']): float(row['mcFrac'])
        for row in rows if row['regime'] == 'group'
    }


def main():
    if not pathlib.Path(JSC).exists():
        raise SystemExit('JavaScriptCore bulunamadı: %s' % JSC)
    started = time.time()
    seeds = [(SEED_BASE + i * SEED_STRIDE) & 0xFFFFFFFF for i in range(N_SEEDS)]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        rows = list(pool.map(run_seed, seeds))
    rows.sort(key=lambda row: row['seed'])
    primary = load_primary_group()

    for row in rows:
        row['expectedMcFrac'] = primary.get(row['seed'])
        row['mcFracMatches'] = (
            row['expectedMcFrac'] is not None
            and abs(row['mcFrac'] - row['expectedMcFrac']) <= 1e-6
        )
        row['accountingMatches'] = row['pop'] == row['births'] - row['deaths'] + INITIAL_POP

    failures = [
        row for row in rows
        if row['failedSpawns'] != 0 or not row['mcFracMatches'] or not row['accountingMatches']
    ]

    csv_path = ROOT / 'data/accounting_audit.csv'
    json_path = ROOT / 'data/accounting_audit.json'
    fields = [
        'seed', 'time', 'pop', 'births', 'deaths', 'failedSpawns',
        'mcFrac', 'expectedMcFrac', 'mcFracMatches', 'accountingMatches',
        'meanAdh', 'maxCluster', 'verdict',
    ]
    with csv_path.open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, '') for key in fields})
    json_path.write_text(json.dumps({
        'modelVersion': json.loads((ROOT / 'data/replicates_paired.json').read_text(encoding='utf-8'))['modelVersion'],
        'design': {
            'regime': 'group',
            'seeds': seeds,
            'seconds': SECONDS,
            'initialPopulation': INITIAL_POP,
        },
        'passed': not failures,
        'failures': failures,
        'rows': rows,
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    print('| Tohum | pop | doğum | ölüm | başarısız doğum | mcFrac | beklenen | eşleşme | muhasebe |')
    print('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |')
    for row in rows:
        print('| %d | %d | %d | %d | %d | %.6f | %.6f | %s | %s |' % (
            row['seed'], row['pop'], row['births'], row['deaths'],
            row['failedSpawns'], row['mcFrac'], row['expectedMcFrac'],
            'evet' if row['mcFracMatches'] else 'HAYIR',
            'evet' if row['accountingMatches'] else 'HAYIR',
        ))
    print(json.dumps({
        'passed': not failures,
        'failures': failures,
        'runs': len(rows),
        'wallSeconds': round(time.time() - started, 1),
        'csv': str(csv_path),
        'json': str(json_path),
    }, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Paired statistical analysis for ORIGIN LAB.

Primary endpoint (pre-specified)
--------------------------------
Difference in final multicellular fraction (mcFrac) between the group-selection
regime and the individual-selection control, using the same seed in both
regimes (paired design). Two-sided exact sign-flip permutation test, alpha=0.05.

Secondary analyses
------------------
Other regimes and metrics are exploratory. They use the same paired design but
are not used to confirm the primary hypothesis. No alpha adjustment is applied
to exploratory comparisons; they are reported with effect sizes and intervals.

The script uses only the Python standard library.
"""

import csv
import json
import math
import pathlib
import random
import statistics

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'data/replicates_paired.csv'
OUT = ROOT / 'data/paired_summary.json'
METRICS = ('mcFrac', 'meanAdh', 'maxCluster', 'meanCoop', 'somaFrac')
REGIMES = ('control', 'group', 'predation', 'mutation')
LABELS = {
    'control': 'Kontrol',
    'group': 'Grup seçilimi',
    'predation': 'Güçlü baskı',
    'mutation': 'Yüksek mutasyon',
}
CRITERIA = {
    'base': {'mcFrac': 0.30, 'meanAdh': 0.30, 'maxCluster': 12},
    'strict': {'mcFrac': 0.40, 'meanAdh': 0.35, 'maxCluster': 20},
    'loose': {'mcFrac': 0.20, 'meanAdh': 0.28, 'maxCluster': 8},
}
COMPARISONS = (
    ('group', 'control', 'Grup seçilimi − Kontrol', 'primary'),
    ('predation', 'control', 'Güçlü baskı − Kontrol', 'exploratory'),
    ('mutation', 'control', 'Yüksek mutasyon − Kontrol', 'exploratory'),
    ('predation', 'group', 'Güçlü baskı − Grup seçilimi', 'exploratory'),
    ('mutation', 'group', 'Yüksek mutasyon − Grup seçilimi', 'exploratory'),
)
RNG = random.Random(20261105)
BOOTSTRAP_N = 10000
PERMUTATION_N = 100000


def load_rows():
    with SRC.open(newline='', encoding='utf-8-sig') as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        for metric in METRICS:
            row[metric] = float(row[metric])
    return rows


def percentile(values, p):
    values = sorted(values)
    if len(values) == 1:
        return values[0]
    pos = (len(values) - 1) * p
    lo = int(pos)
    hi = min(lo + 1, len(values) - 1)
    frac = pos - lo
    return values[lo] * (1 - frac) + values[hi] * frac


def bootstrap_median_ci(diffs, n=BOOTSTRAP_N):
    medians = []
    size = len(diffs)
    for _ in range(n):
        sample = [diffs[RNG.randrange(size)] for _ in range(size)]
        medians.append(statistics.median(sample))
    return percentile(medians, 0.025), percentile(medians, 0.975)


def sign_flip_p_value(diffs, exact=False):
    observed = statistics.mean(diffs)
    size = len(diffs)
    if exact:
        total = 1 << size
        count = 0
        for mask in range(total):
            value = 0.0
            for i, diff in enumerate(diffs):
                value += diff if (mask >> i) & 1 else -diff
            if abs(value / size) >= abs(observed) - 1e-15:
                count += 1
        return count / total, total
    count = 0
    for _ in range(PERMUTATION_N):
        value = 0.0
        for diff in diffs:
            value += diff if RNG.random() < 0.5 else -diff
        if abs(value / size) >= abs(observed) - 1e-15:
            count += 1
    return (count + 1) / (PERMUTATION_N + 1), PERMUTATION_N


def describe(values):
    return {
        'n': len(values),
        'median': statistics.median(values),
        'q1': percentile(values, 0.25),
        'q3': percentile(values, 0.75),
        'min': min(values),
        'max': max(values),
    }


def summarize(diffs, exact=False):
    mean_diff = statistics.mean(diffs)
    median_diff = statistics.median(diffs)
    sd = statistics.stdev(diffs) if len(diffs) > 1 else 0.0
    dz = mean_diff / sd if sd > 0 else float('inf') if mean_diff != 0 else 0.0
    ci_low, ci_high = bootstrap_median_ci(diffs)
    p_value, permutations = sign_flip_p_value(diffs, exact=exact)
    superiority = sum(1 for diff in diffs if diff > 0) / len(diffs)
    return {
        'n': len(diffs),
        'meanDifference': mean_diff,
        'medianDifference': median_diff,
        'sdDifference': sd,
        'minDifference': min(diffs),
        'maxDifference': max(diffs),
        'positive': sum(1 for diff in diffs if diff > 0),
        'negative': sum(1 for diff in diffs if diff < 0),
        'zero': sum(1 for diff in diffs if diff == 0),
        'cohenDz': dz,
        'medianDifferenceCI95': [ci_low, ci_high],
        'pValue': p_value,
        'permutations': permutations,
        'probabilityOfSuperiority': superiority,
    }


def main():
    rows = load_rows()
    by_regime = {}
    for row in rows:
        by_regime.setdefault(row['regime'], {})[int(row['seed'])] = row

    seeds = sorted(by_regime['control'])
    for regime, table in by_regime.items():
        if sorted(table) != seeds:
            raise SystemExit('Eşleştirilmiş tohum kümesi uyuşmuyor: ' + regime)

    results = {
        'modelVersion': rows[0]['modelVersion'],
        'design': {
            'pairedSeeds': True,
            'nPerRegime': len(seeds),
            'seeds': seeds,
            'metrics': list(METRICS),
            'bootstrapResamples': BOOTSTRAP_N,
            'permutationResamples': PERMUTATION_N,
            'primaryEndpoint': 'mcFrac',
            'primaryComparison': 'group - control',
            'alpha': 0.05,
        },
        'comparisons': {},
    }

    print('| Karşılaştırma | Metrik | Medyan fark [%95 CI] | Cohen dz | p | Üstünlük | Rol |')
    print('| --- | --- | ---: | ---: | ---: | ---: | --- |')

    for left, right, label, role in COMPARISONS:
        comparison = {}
        for metric in METRICS:
            diffs = [
                by_regime[left][seed][metric] - by_regime[right][seed][metric]
                for seed in seeds
            ]
            exact = role == 'primary' and metric == 'mcFrac'
            stats = summarize(diffs, exact=exact)
            if exact:
                endpoint_role = 'birincil'
            elif role == 'primary':
                endpoint_role = 'ikincil'
            else:
                endpoint_role = 'keşifsel'
            stats['endpointRole'] = endpoint_role
            comparison[metric] = stats
            print(
                '| %s | %s | %+.4f [%+.4f, %+.4f] | %+.3f | %.6g | %.2f | %s |'
                % (
                    label,
                    metric,
                    stats['medianDifference'],
                    stats['medianDifferenceCI95'][0],
                    stats['medianDifferenceCI95'][1],
                    stats['cohenDz'],
                    stats['pValue'],
                    stats['probabilityOfSuperiority'],
                    endpoint_role,
                )
            )
        results['comparisons']['%s-%s' % (left, right)] = {
            'label': label,
            'role': role,
            'metrics': comparison,
        }

    results['descriptives'] = {}
    print('\n### Betimsel özet (60 s)')
    print('| Rejim | n | mcFrac medyan [IQR] | meanAdh medyan [IQR] | maxCluster medyan [IQR] | somaFrac medyan [IQR] | Sonuçlar |')
    print('| --- | ---: | ---: | ---: | ---: | ---: | --- |')
    for regime in REGIMES:
        table = [by_regime[regime][seed] for seed in seeds]
        entry = {}
        for metric in ('mcFrac', 'meanAdh', 'maxCluster', 'somaFrac'):
            entry[metric] = describe([row[metric] for row in table])
        verdicts = {}
        for row in table:
            verdicts[row['verdict']] = verdicts.get(row['verdict'], 0) + 1
        entry['verdicts'] = verdicts
        results['descriptives'][regime] = entry
        print(
            '| %s | %d | %.3f [%.3f–%.3f] | %.3f [%.3f–%.3f] | %.1f [%.1f–%.1f] | %.4f [%.4f–%.4f] | %s |'
            % (
                LABELS[regime], len(table),
                entry['mcFrac']['median'], entry['mcFrac']['q1'], entry['mcFrac']['q3'],
                entry['meanAdh']['median'], entry['meanAdh']['q1'], entry['meanAdh']['q3'],
                entry['maxCluster']['median'], entry['maxCluster']['q1'], entry['maxCluster']['q3'],
                entry['somaFrac']['median'], entry['somaFrac']['q1'], entry['somaFrac']['q3'],
                ', '.join('%s: %d' % (key, value) for key, value in sorted(verdicts.items())),
            )
        )

    results['thresholdSensitivity'] = {}
    print('\n### Eşik duyarlılığı (keşifsel)')
    print('| Rejim | Taban | Sıkı | Gevşek |')
    print('| --- | ---: | ---: | ---: |')
    for regime in REGIMES:
        table = [by_regime[regime][seed] for seed in seeds]
        entry = {}
        for name, criterion in CRITERIA.items():
            count = sum(
                1 for row in table
                if row['mcFrac'] > criterion['mcFrac']
                and row['meanAdh'] > criterion['meanAdh']
                and row['maxCluster'] >= criterion['maxCluster']
            )
            entry[name] = {'established': count, 'n': len(table)}
        results['thresholdSensitivity'][regime] = entry
        print(
            '| %s | %d/%d | %d/%d | %d/%d |'
            % (
                LABELS[regime],
                entry['base']['established'], entry['base']['n'],
                entry['strict']['established'], entry['strict']['n'],
                entry['loose']['established'], entry['loose']['n'],
            )
        )

    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print('\nYazıldı: %s' % OUT)


if __name__ == '__main__':
    main()

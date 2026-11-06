#!/usr/bin/env python3
"""Exploratory analysis of the group-selection dose-response sweep.

The sweep varies only groupSelection (0, 0.25, 0.50, 0.75, 1.00) on the first
eight paired seeds. This script reports descriptive summaries, paired
differences versus the zero level, a within-seed linear slope, and a
within-seed Spearman rank correlation. All inference here is exploratory:
there is no multiplicity correction and no confirmatory claim.

Usage:
    python3 scripts/analyze_sweep.py
"""

import csv
import json
import math
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'data/sweep_group_selection.csv'
OUT = ROOT / 'data/sweep_summary.json'


def percentile(values, p):
    values = sorted(values)
    if len(values) == 1:
        return values[0]
    pos = (len(values) - 1) * p
    lo = int(pos)
    hi = min(lo + 1, len(values) - 1)
    frac = pos - lo
    return values[lo] * (1 - frac) + values[hi] * frac


def rankdata(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        average = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = average
        i = j + 1
    return ranks


def spearman(xs, ys):
    rx = rankdata(xs)
    ry = rankdata(ys)
    mx = statistics.mean(rx)
    my = statistics.mean(ry)
    num = sum((x - mx) * (y - my) for x, y in zip(rx, ry))
    denx = math.sqrt(sum((x - mx) ** 2 for x in rx))
    deny = math.sqrt(sum((y - my) ** 2 for y in ry))
    return num / (denx * deny) if denx > 0 and deny > 0 else 0.0


def slope(xs, ys):
    mx = statistics.mean(xs)
    my = statistics.mean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den


def exact_sign_flip_p(diffs):
    observed = statistics.mean(diffs)
    size = len(diffs)
    total = 1 << size
    count = 0
    for mask in range(total):
        value = 0.0
        for i, diff in enumerate(diffs):
            value += diff if (mask >> i) & 1 else -diff
        if abs(value / size) >= abs(observed) - 1e-15:
            count += 1
    return count / total


def paired_summary(diffs):
    return {
        'n': len(diffs),
        'medianDifference': statistics.median(diffs),
        'meanDifference': statistics.mean(diffs),
        'minDifference': min(diffs),
        'maxDifference': max(diffs),
        'positive': sum(1 for value in diffs if value > 0),
        'negative': sum(1 for value in diffs if value < 0),
        'zero': sum(1 for value in diffs if value == 0),
        'pExactSignFlip': exact_sign_flip_p(diffs),
    }


def main():
    with SRC.open(newline='', encoding='utf-8-sig') as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise SystemExit('Boş veri: %s' % SRC)

    for row in rows:
        row['groupSelection'] = float(row['groupSelection'])
        row['seed'] = int(row['seed'])
        for key in ('mcFrac', 'meanAdh', 'maxCluster', 'meanCluster', 'somaFrac'):
            row[key] = float(row[key])

    levels = sorted({row['groupSelection'] for row in rows})
    by_seed = {}
    for row in rows:
        by_seed.setdefault(row['seed'], {})[row['groupSelection']] = row

    for seed, table in by_seed.items():
        if sorted(table) != levels:
            raise SystemExit('Eksik doz seviyesi: tohum %s' % seed)

    summary = {
        'modelVersion': rows[0]['modelVersion'],
        'design': {
            'levels': levels,
            'seeds': sorted(by_seed),
            'nPerLevel': len(by_seed),
            'seconds': float(rows[0]['time']),
            'exploratory': True,
        },
        'levels': {},
        'pairedVsZero': {},
        'withinSeedSlope': {},
        'withinSeedSpearman': {},
    }

    print('| groupSelection | n | mcFrac medyan [IQR] | meanAdh medyan [IQR] | maxCluster medyan [IQR] | Sonuçlar |')
    print('| ---: | ---: | ---: | ---: | ---: | --- |')

    for level in levels:
        table = [by_seed[seed][level] for seed in sorted(by_seed)]
        mc = [row['mcFrac'] for row in table]
        adh = [row['meanAdh'] for row in table]
        maxc = [row['maxCluster'] for row in table]
        verdicts = {}
        for row in table:
            verdicts[row['verdict']] = verdicts.get(row['verdict'], 0) + 1
        summary['levels']['%.2f' % level] = {
            'n': len(table),
            'mcFrac': {
                'median': statistics.median(mc),
                'q1': percentile(mc, 0.25),
                'q3': percentile(mc, 0.75),
            },
            'meanAdh': {
                'median': statistics.median(adh),
                'q1': percentile(adh, 0.25),
                'q3': percentile(adh, 0.75),
            },
            'maxCluster': {
                'median': statistics.median(maxc),
                'q1': percentile(maxc, 0.25),
                'q3': percentile(maxc, 0.75),
            },
            'verdicts': verdicts,
        }
        print(
            '| %.2f | %d | %.3f [%.3f–%.3f] | %.3f [%.3f–%.3f] | %.1f [%.1f–%.1f] | %s |'
            % (
                level, len(table),
                statistics.median(mc), percentile(mc, 0.25), percentile(mc, 0.75),
                statistics.median(adh), percentile(adh, 0.25), percentile(adh, 0.75),
                statistics.median(maxc), percentile(maxc, 0.25), percentile(maxc, 0.75),
                ', '.join('%s: %d' % (key, value) for key, value in sorted(verdicts.items())),
            )
        )

    zero = 0.0
    if zero not in levels:
        raise SystemExit('Sıfır doz seviyesi bulunamadı')

    print('\n| groupSelection | mcFrac farkı vs 0, medyan [min, max] | Pozitif | Tam işaret-flip p |')
    print('| ---: | ---: | ---: | ---: |')
    for level in levels:
        if level == zero:
            continue
        diffs = [
            by_seed[seed][level]['mcFrac'] - by_seed[seed][zero]['mcFrac']
            for seed in sorted(by_seed)
        ]
        stats = paired_summary(diffs)
        summary['pairedVsZero']['%.2f' % level] = stats
        print(
            '| %.2f | %+.3f [%+.3f, %+.3f] | %d/%d | %.6g |'
            % (level, stats['medianDifference'], stats['minDifference'],
               stats['maxDifference'], stats['positive'], stats['n'],
               stats['pExactSignFlip'])
        )

    slopes = []
    rhos = []
    for seed in sorted(by_seed):
        xs = levels
        ys = [by_seed[seed][level]['mcFrac'] for level in levels]
        slopes.append(slope(xs, ys))
        rhos.append(spearman(xs, ys))
    slope_stats = paired_summary(slopes)
    summary['withinSeedSlope'] = slope_stats
    summary['withinSeedSpearman'] = {
        'median': statistics.median(rhos),
        'min': min(rhos),
        'max': max(rhos),
        'positive': sum(1 for value in rhos if value > 0),
        'n': len(rhos),
    }

    print('\n**Keşifsel doz-yanıt özeti**')
    print('- Tohum içi doğrusal eğim (mcFrac / groupSelection): medyan %+.3f '
          '[%+.3f, %+.3f]; pozitif %d/%d; tam işaret-flip p = %.6g.'
          % (slope_stats['medianDifference'], slope_stats['minDifference'],
             slope_stats['maxDifference'], slope_stats['positive'],
             slope_stats['n'], slope_stats['pExactSignFlip']))
    print('- Tohum içi Spearman ρ: medyan %+.3f [%+.3f, %+.3f]; pozitif %d/%d.'
          % (statistics.median(rhos), min(rhos), max(rhos),
             sum(1 for value in rhos if value > 0), len(rhos)))

    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print('\nYazıldı: %s' % OUT)


if __name__ == '__main__':
    main()

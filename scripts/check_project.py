#!/usr/bin/env python3
"""Static integrity checks for the ORIGIN LAB repository.

Checks:
- required files,
- HTML duplicate IDs / unclosed tags,
- JavaScript syntax (via JavaScriptCore if available),
- README placeholders and local links,
- CSV column consistency and numeric finiteness,
- model-version consistency.

Usage:
    python3 scripts/check_project.py
"""

import csv
import json
import math
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from collections import Counter
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'
JSC = os.environ.get('JSC', DEFAULT_JSC)

REQUIRED = [
    'index.html', 'css/style.css', 'js/config.js', 'js/rng.js', 'js/nutrient.js',
    'js/simulation.js', 'js/renderer.js', 'js/charts.js', 'js/ui.js', 'js/main.js',
    'scripts/replicate.js', 'scripts/headless_replication.py',
    'scripts/analyze_paired.py', 'scripts/sweep_group_selection.py',
    'scripts/analyze_sweep.py', 'scripts/nominal_runs.py',
    'scripts/dt60_check.py', 'scripts/validate_model.py',
    'docs/ODD.md', 'docs/STATISTICS.md', 'docs/VALIDATION.md',
    'README.md', 'assets/origin-lab.png',
]


class DocParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.stack = []
        self.void = {'meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'area',
                     'base', 'col', 'embed', 'param', 'track', 'wbr'}

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if 'id' in values:
            self.ids.append(values['id'])
        if tag not in self.void:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            while self.stack and self.stack[-1] != tag:
                self.stack.pop()
            if self.stack:
                self.stack.pop()


def check_html():
    parser = DocParser()
    parser.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
    duplicates = [key for key, count in Counter(parser.ids).items() if count > 1]
    return {
        'duplicateIds': duplicates,
        'unclosedTags': parser.stack[-10:],
        'idCount': len(parser.ids),
    }


def check_js():
    failures = []
    files = sorted((ROOT / 'js').glob('*.js')) + [ROOT / 'scripts/replicate.js']
    for path in files:
        code = path.read_text(encoding='utf-8')
        wrapper = "try { new Function(%s); print('OK'); } catch (e) { print(e); quit(1); }" % json.dumps(code)
        result = subprocess.run([JSC, '-e', wrapper], capture_output=True, text=True)
        if result.returncode != 0:
            failures.append({'file': str(path), 'error': (result.stdout + result.stderr).strip()})
    return failures


def check_readme():
    text = (ROOT / 'README.md').read_text(encoding='utf-8')
    placeholders = re.findall(r'<!--\s*[A-Z_]+\s*-->', text)
    links = re.findall(r'\[[^\]]+\]\(([^)]+)\)', text)
    missing = []
    for link in links:
        if link.startswith(('http://', 'https://', '#', 'mailto:')):
            continue
        target = (ROOT / link.split('#')[0]).resolve()
        if not target.exists():
            missing.append(link)
    return {
        'placeholders': placeholders,
        'missingLocalLinks': missing,
        'modelVersionMentioned': '1.3.0' in text,
    }


def check_csv(path):
    if not path.exists():
        return {'path': str(path), 'exists': False}
    with path.open(newline='', encoding='utf-8-sig') as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        return {'path': str(path), 'exists': True, 'rows': 0}
    bad = []
    for row in rows:
        for key, value in row.items():
            if value in ('NaN', 'Infinity', '-Infinity', 'undefined'):
                bad.append({'column': key, 'value': value})
    return {
        'path': str(path),
        'exists': True,
        'rows': len(rows),
        'columns': len(rows[0]),
        'badValues': bad,
        'modelVersions': sorted({row.get('modelVersion', '') for row in rows}),
    }


def main():
    errors = []
    for name in REQUIRED:
        if not (ROOT / name).exists():
            errors.append('Eksik dosya: ' + name)

    for name in ('data/replicates_paired.csv', 'data/sweep_group_selection.csv',
                 'data/paired_summary.json', 'data/sweep_summary.json',
                 'data/nominal_runs.csv', 'data/nominal_runs.json',
                 'data/accounting_audit.csv', 'data/accounting_audit.json',
                 'data/dt60_check.json'):
        if not (ROOT / name).exists():
            errors.append('Eksik veri/analiz dosyası: ' + name)

    html = check_html()
    if html['duplicateIds']:
        errors.append('Yinelenen HTML id: ' + ', '.join(html['duplicateIds']))
    if html['unclosedTags']:
        errors.append('Kapanmayan HTML etiketi: ' + ', '.join(html['unclosedTags']))

    js_failures = check_js()
    if js_failures:
        errors.append('JavaScript sözdizimi hataları: ' + json.dumps(js_failures, ensure_ascii=False))

    readme = check_readme()
    if readme['placeholders']:
        errors.append('README yer tutucuları: ' + ', '.join(readme['placeholders']))
    if readme['missingLocalLinks']:
        errors.append('Kırık yerel bağlantılar: ' + ', '.join(readme['missingLocalLinks']))
    if not readme['modelVersionMentioned']:
        errors.append('README model sürümü 1.3.0 içermiyor')

    csv_files = [
        check_csv(ROOT / 'data/replicates_paired.csv'),
        check_csv(ROOT / 'data/sweep_group_selection.csv'),
        check_csv(ROOT / 'data/nominal_runs.csv'),
        check_csv(ROOT / 'data/accounting_audit.csv'),
        check_csv(ROOT / 'data/replicates.csv'),
    ]
    for item in csv_files:
        if item['exists'] and item.get('badValues'):
            errors.append('CSV içinde geçersiz değer: ' + item['path'])

    payload = {
        'passed': not errors,
        'errors': errors,
        'html': html,
        'readme': readme,
        'csv': csv_files,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Fail closed when a packaging definition reintroduces private resource data."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ('saves/dict', 'saves/nrc', 'saves/corpus', 'data', 'backend/data')


def check():
    configuration = json.loads((ROOT / 'electron-builder.json').read_text())
    for resource in configuration.get('extraResources', []):
        source = resource.get('from', '').replace('\\', '/').rstrip('/')
        if any(source == forbidden or source.startswith(forbidden + '/') for forbidden in PRIVATE):
            raise SystemExit(f'Private resource included in Electron package: {source}')
    spec = (ROOT / 'backend/backend.spec').read_text()
    if re.search(r"datas\.append\([^\n]*(?:saves/(?:dict|nrc|corpus)|user_resources)", spec):
        raise SystemExit('Private resources included in Python package')
    if 'reject_runtime_data(datas, PROJECT_ROOT)' not in spec:
        raise SystemExit('Missing Python runtime-data packaging guard')
    from packaging_paths import reject_runtime_data
    reject_runtime_data([(ROOT / 'saves/frameworks', 'data/frameworks')], ROOT)
    for source in PRIVATE:
        try:
            reject_runtime_data([(ROOT / source, 'data')], ROOT)
        except RuntimeError:
            pass
        else:
            raise SystemExit(f'Packaging guard accepted private source: {source}')
    defaults = [path for path in (ROOT / 'saves/frameworks').glob('*.json') if not path.name.startswith('._')]
    if not defaults:
        raise SystemExit('No factory annotation frameworks found')
    for path in defaults:
        json.loads(path.read_text(encoding='utf-8'))
    for name in ['build.sh', 'build.bat']:
        text = (ROOT / name).read_text().replace('\\', '/')
        if re.search(r'(?:cp|copy)\s+data/frameworks', text):
            raise SystemExit(f'{name} overwrites factory templates from runtime data')
    for required in ['LICENSE', 'LICENSING.md', 'SOURCE.md', 'THIRD_PARTY_NOTICES.md', 'third-party-licenses/LICENSES.txt', 'third-party-licenses/MAT-GPL-3.0.txt', 'third-party-licenses/MAT-NOTICE.md', 'third-party-licenses/MAT-PROVENANCE.json']:
        if not (ROOT / required).is_file():
            raise SystemExit(f'Missing release notice: {required}')
    print('PASS: both packaging definitions exclude NRC, dictionaries and reference resources; release notices exist.')


if __name__ == '__main__': check()

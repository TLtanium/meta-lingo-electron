#!/usr/bin/env python3
"""Verify the in-app documents are exact copies, including file:// release assets."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {'LICENSE': 'AGPL-3.0.txt', 'LICENSING.md': 'LICENSING.md',
          'third-party-licenses/LICENSES.txt': 'THIRD-PARTY-NOTICES.txt'}


def check(built=False):
    for folder in [ROOT, ROOT / 'public'] + ([ROOT / 'dist'] if built else []):
        for name in ['LICENSE_CN.txt', 'LICENSE_EN.txt']:
            if (folder / name).exists():
                raise SystemExit(f'Obsolete duplicate application license: {folder / name}')
    for source, target in ASSETS.items():
        expected = (ROOT / source).read_bytes()
        folders = ['public/licenses', 'dist/licenses'] if built else ['public/licenses']
        for folder in folders:
            actual = ROOT / folder / target
            if not actual.is_file() or actual.read_bytes() != expected:
                raise SystemExit(f'License asset is missing or stale: {actual}')
    if 'AGPL-3.0-only' not in (ROOT / 'LICENSING.md').read_text():
        raise SystemExit('Missing explicit application license-version grant')
    print('PASS: canonical AGPL, historical grant and third-party notices match all in-app assets.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--built', action='store_true')
    check(parser.parse_args().built)

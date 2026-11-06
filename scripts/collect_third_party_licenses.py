#!/usr/bin/env python3
"""Collect installed dependency notices for a release; run in its build environment."""
import hashlib
import importlib.metadata as metadata
import json
import re
from pathlib import Path
from packaging.requirements import Requirement

ROOT = Path(__file__).resolve().parents[1]


def collect():
    pending = []
    for line in (ROOT / 'requirements.txt').read_text().splitlines():
        try:
            requirement = Requirement(line.split(' #')[0].strip())
            if not requirement.marker or requirement.marker.evaluate():
                pending.append(requirement.name)
        except Exception:
            continue  # Comments, pip options and URL-based model instructions.
    seen, records, texts = set(), [], {}

    def add_text(owner, filename, text):
        digest = hashlib.sha256(text.encode()).hexdigest()
        entry = texts.setdefault(digest, {'owners': [], 'text': text})
        entry['owners'].append(f'{owner}: {filename}')

    while pending:
        name = pending.pop()
        normalized = re.sub(r'[-_.]+', '-', name.lower())
        if normalized in seen:
            continue
        seen.add(normalized)
        try:
            dist = metadata.distribution(name)
        except metadata.PackageNotFoundError:
            records.append({'name': name, 'status': 'not installed in this build environment'})
            continue
        owner = f"Python {dist.metadata['Name']} {dist.version}"
        records.append({'name': owner, 'license': dist.metadata.get('License-Expression') or dist.metadata.get('License', ''), 'source': dist.metadata.get_all('Project-URL') or dist.metadata.get('Home-page', '')})
        for file in dist.files or []:
            if re.match(r'^(license|copying|notice)([._-].*)?$', file.name, re.I):
                path = dist.locate_file(file)
                if path.is_file():
                    add_text(owner, str(file), path.read_text(encoding='utf-8', errors='replace'))
        for value in dist.requires or []:
            try:
                requirement = Requirement(value)
                if not requirement.marker or requirement.marker.evaluate():
                    pending.append(requirement.name)
            except Exception:
                pass
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    for relative, info in lock.get('packages', {}).items():
        if not relative or info.get('dev'):
            continue
        folder = ROOT / relative
        manifest = folder / 'package.json'
        if not manifest.is_file():
            continue
        package = json.loads(manifest.read_text())
        owner = f"npm {package.get('name', relative)} {package.get('version', '')}"
        records.append({'name': owner, 'license': package.get('license', ''), 'source': package.get('repository', '')})
        for path in folder.iterdir():
            if path.is_file() and re.match(r'^(license|copying|notice)([._-].*)?$', path.name, re.I):
                add_text(owner, path.name, path.read_text(encoding='utf-8', errors='replace'))
    mat_license = ROOT / 'third-party-licenses' / 'MAT-GPL-3.0.txt'
    if mat_license.is_file():
        add_text('MAT / MDA adaptation — Andrea Nini and contributors; modified by Tommy Leo',
                 'MAT-GPL-3.0.txt', mat_license.read_text())
        records.append({'name': 'MAT / MDA source adaptation', 'license': 'GPL-3.0-only',
                        'source': 'https://github.com/andreanini/multidimensionalanalysistagger',
                        'provenance': 'MAT-PROVENANCE.json', 'notice': 'MAT-NOTICE.md'})
    output = ROOT / 'third-party-licenses' 
    output.mkdir(exist_ok=True)
    (output / 'inventory.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    sections = ['Third-party notices collected from this release build environment.\nOriginal upstream terms remain applicable. See inventory.json for versions and source links.\n']
    for entry in texts.values():
        sections.append('\n' + '=' * 72 + '\n' + '\n'.join(entry['owners']) + '\n\n' + entry['text'])
    (output / 'LICENSES.txt').write_text('\n'.join(sections), encoding='utf-8')
    print(f'Collected {len(records)} dependency records and {len(texts)} distinct license texts.')


if __name__ == '__main__':
    collect()

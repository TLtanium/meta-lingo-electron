"""Reject application/user data in Python bundle data sources."""
from pathlib import Path


def reject_runtime_data(datas, project_root):
    root = Path(project_root).resolve()
    forbidden = [root / name for name in ('data', 'backend/data', 'saves/dict', 'saves/nrc', 'saves/corpus')]
    for source, destination in datas:
        path = Path(source).resolve()
        if any(path == parent or parent in path.parents for parent in forbidden):
            raise RuntimeError(f'Runtime/private data must not be bundled: {path} -> {destination}')

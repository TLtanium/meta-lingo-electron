"""Reset application-owned runtime state without deleting project fixtures."""
import sys
from pathlib import Path
from config import get_data_dir
from services.user_resource_store import _remove_tree


def reset_agent_tasks() -> list[str]:
    data = get_data_dir()
    current = data / 'agent_tasks'
    _remove_tree(current)
    current.mkdir(parents=True, exist_ok=True)
    removed = ['Agent task plans and results']
    # Older frozen versions wrote beneath the bundled Python directory. Never
    # touch backend/data in a source checkout: those may be tracked fixtures.
    if getattr(sys, 'frozen', False) and getattr(sys, '_MEIPASS', None):
        legacy = Path(sys._MEIPASS) / 'data' / 'agent_tasks'
        if legacy != current and legacy.exists():
            _remove_tree(legacy)
            removed.append('Legacy packaged agent task files')
    return removed


def reset_runtime_settings(reset_usas: bool) -> list[str]:
    data = get_data_dir()
    settings = data / 'settings'
    settings.mkdir(parents=True, exist_ok=True)
    for item in list(settings.iterdir()):
        if not reset_usas and item.name in {'usas_settings.json', '._usas_settings.json'}:
            continue
        if item.is_dir() and not item.is_symlink():
            _remove_tree(item)
        else:
            item.unlink(missing_ok=True)
    removed = ['Runtime settings including BERTopic preprocessing and model-path overrides']
    if getattr(sys, 'frozen', False):
        prepared = data.parent / 'openai-plugin'
        if prepared.exists():
            _remove_tree(prepared)
            removed.append('Prepared private desktop connection')
    return removed

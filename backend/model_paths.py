"""
Model path resolution for Meta-Lingo.

Goal:
- Prefer user-downloaded models under `userData/models`.
- Fall back to bundled models (PyInstaller datas) when needed.
- Treat some models as "built-in" and protect them from factory-reset deletion.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Optional, Sequence, Set


BUILTIN_MODEL_RELATIVE_PATHS: Sequence[str] = (
    "nltk",
    "multimodal_analyzer/torchcrepe-master",
)

BUILTIN_MODELS_MARKER_FILE = ".built-in-models.json"
DOWNLOAD_ROOT_SETTINGS_FILE = "model_management_settings.json"


def _get_project_root() -> Path:
    # backend/model_paths.py -> backend/ -> project_root/
    return Path(__file__).resolve().parent.parent


def get_user_models_dir() -> Path:
    """
    User models directory (download target).

    Electron sets:
    - METALINGO_DATA_PATH = userData/data
    """
    override = read_download_root_override()
    if override:
        override.mkdir(parents=True, exist_ok=True)
        return override

    # Important:
    # - Packaged (Electron) runtime: use persistent userData directory.
    # - Dev runtime: ALWAYS default to ./saves/models, even if METALINGO_DATA_PATH
    #   is present in the environment (prevents accidental deletion of repo ./models).
    if getattr(sys, "frozen", False):
        env_data_path = os.environ.get("METALINGO_DATA_PATH")
        if env_data_path:
            # METALINGO_DATA_PATH is userData/data, so userData is its parent.
            user_models_dir = Path(env_data_path).resolve().parent / "models"
        else:
            # Fallback for edge cases.
            user_models_dir = _get_project_root() / "saves" / "models"
    else:
        # Dev fallback: must NOT point at repo ./models, otherwise factory reset
        # could delete the original source models on disk.
        user_models_dir = _get_project_root() / "saves" / "models"

    user_models_dir.mkdir(parents=True, exist_ok=True)
    return user_models_dir


def _get_settings_file_path() -> Path:
    """
    Settings are stored under:
    - packaged: userData/data/settings/model_management_settings.json
    - dev:      ./data/settings/model_management_settings.json (repo-local)
    """
    # Same rule as get_user_models_dir():
    # - packaged: store under userData/data/settings
    # - dev: store under repo ./data/settings
    if getattr(sys, "frozen", False):
        env_data_path = os.environ.get("METALINGO_DATA_PATH")
        if env_data_path:
            data_dir = Path(env_data_path).resolve()
        else:
            data_dir = _get_project_root() / "data"
    else:
        data_dir = _get_project_root() / "data"
    settings_dir = data_dir / "settings"
    settings_dir.mkdir(parents=True, exist_ok=True)
    return settings_dir / DOWNLOAD_ROOT_SETTINGS_FILE


def read_download_root_override() -> Optional[Path]:
    """
    Read custom models download root (absolute path).

    Returns None if not configured / invalid.
    """
    settings_file = _get_settings_file_path()
    try:
        if not settings_file.exists():
            return None
        payload = json.loads(settings_file.read_text(encoding="utf-8"))
        raw = payload.get("downloadRoot", None)
        if not isinstance(raw, str) or not raw.strip():
            return None
        return Path(raw).expanduser().resolve()
    except Exception:
        return None


def write_download_root_override(download_root: Optional[Path]) -> None:
    """
    Persist custom models download root.

    If download_root is None, clears the override file.
    """
    settings_file = _get_settings_file_path()
    if download_root is None:
        try:
            if settings_file.exists():
                settings_file.unlink()
        except Exception:
            pass
        return

    settings_file.write_text(
        json.dumps({"downloadRoot": str(download_root)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def set_download_root_override(download_root: str) -> Path:
    """
    Set a new models download root (absolute directory path).
    Creates the directory if missing.
    """
    new_root = Path(download_root).expanduser().resolve()
    new_root.mkdir(parents=True, exist_ok=True)
    write_download_root_override(new_root)
    return new_root


def _candidate_bundled_models_dirs() -> Sequence[Path]:
    candidates = []

    # Packaged runtime:
    if getattr(sys, "frozen", False):
        # PyInstaller extracts to sys._MEIPASS.
        try:
            meipass = Path(sys._MEIPASS)  # type: ignore[attr-defined]
            candidates.append(meipass / "models")
        except Exception:
            pass

        # Some builds may copy assets into resourcesPath (best-effort).
        resources_path = os.environ.get("METALINGO_RESOURCES_PATH")
        if resources_path:
            resources_models = Path(resources_path) / "models"
            candidates.append(resources_models)

            # Alternative common layout: backend/_internal/models.
            candidates.append(Path(resources_path) / "backend" / "_internal" / "models")

    # Dev runtime:
    candidates.append(_get_project_root() / "models")
    return candidates


def get_bundled_models_dir() -> Path:
    """
    Bundled models directory shipped with the app.

    Prefer the PyInstaller `_MEIPASS/models` location, but keep best-effort
    fallbacks for dev/packaged edge cases.
    """
    for candidate in _candidate_bundled_models_dirs():
        if candidate.exists():
            return candidate

    # Final fallback (may not exist yet).
    return _candidate_bundled_models_dirs()[0]


def resolve_model_path(model_relative_path: str) -> Optional[Path]:
    """
    Resolve a model path for `model_relative_path` (relative to the models root).

    Priority:
    1) user models dir (e.g. userData/models after download from Model Management)
    2) bundled models dir (PyInstaller `_MEIPASS/models` — only small built-ins like nltk/torchcrepe)

    Note: **PyMUSAS-Neural-Multilingual-Base-BEM** is not shipped in the app bundle by design
    (`backend.spec` does not add it to `datas`); use downloads or dev repo `./models/...`.
    """
    user_candidate = get_user_models_dir() / model_relative_path
    if user_candidate.exists():
        return user_candidate

    bundled_candidate = get_bundled_models_dir() / model_relative_path
    if bundled_candidate.exists():
        return bundled_candidate

    return None


def get_builtin_models_marker_path() -> Path:
    return get_user_models_dir() / BUILTIN_MODELS_MARKER_FILE


def read_builtin_models_marker() -> Set[str]:
    """
    Read built-in marker file.

    If missing/corrupt, fall back to `BUILTIN_MODEL_RELATIVE_PATHS`.
    """
    marker_path = get_builtin_models_marker_path()
    try:
        if marker_path.exists():
            data = json.loads(marker_path.read_text(encoding="utf-8"))
            rels = data.get("built_in_relative_paths", None)
            if isinstance(rels, list) and all(isinstance(x, str) for x in rels):
                return set(rels)
    except Exception:
        pass

    return set(BUILTIN_MODEL_RELATIVE_PATHS)


def write_builtin_models_marker(built_in_relative_paths: Sequence[str] | None = None) -> None:
    marker_path = get_builtin_models_marker_path()
    payload = {
        "built_in_relative_paths": list(built_in_relative_paths or BUILTIN_MODEL_RELATIVE_PATHS),
    }
    marker_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def copy_built_in_models_to_user_models() -> None:
    """
    Copy built-in model directories from bundled resources to user models dir.

    Best-effort:
    - If a directory is already present, it is not copied.
    - Copy failures are logged to stdout, but do not raise.
    """
    user_models_dir = get_user_models_dir()
    bundled_models_dir = get_bundled_models_dir()

    # Ensure marker is present even if copies are partial.
    write_builtin_models_marker(BUILTIN_MODEL_RELATIVE_PATHS)

    for rel in BUILTIN_MODEL_RELATIVE_PATHS:
        src = bundled_models_dir / rel
        dst = user_models_dir / rel

        try:
            if dst.exists() and any(dst.iterdir()):
                continue
        except Exception:
            # If we can't stat/iterate, attempt copy anyway (will likely fail, but that's ok).
            pass

        if not src.exists():
            # Bundled doesn't contain it; keep going for graceful degradation.
            print(f"[ModelPaths] Built-in model missing in bundle: {src}")
            continue

        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dst, dirs_exist_ok=True)
            print(f"[ModelPaths] Copied built-in model: {rel}")
        except Exception as e:
            print(f"[ModelPaths] Failed to copy built-in model '{rel}': {e}")


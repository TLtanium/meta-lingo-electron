"""
Meta-Lingo Backend Configuration
Handles data paths for both development and production (packaged) modes
"""

import os
import sys
from pathlib import Path


def get_data_dir() -> Path:
    """
    Get the data directory path.
    
    In packaged mode (Electron): Uses METALINGO_DATA_PATH environment variable
    In development mode: Uses relative path from project root
    
    Returns:
        Path to the data directory
    """
    # Check for environment variable (set by Electron in production)
    env_data_path = os.environ.get('METALINGO_DATA_PATH')
    
    if env_data_path:
        data_dir = Path(env_data_path)
        # Ensure directory exists
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir
    
    # Development mode: use relative path from backend directory
    # __file__ is backend/config.py, so go up one level to project root
    backend_dir = Path(__file__).parent
    project_root = backend_dir.parent
    data_dir = project_root / "data"
    
    return data_dir


def get_saves_dir() -> Path:
    """
    Get the saves directory path (for default frameworks, dictionaries, etc.)
    
    In packaged mode: Uses resources path from Electron
    In development mode: Uses relative path from project root
    
    Returns:
        Path to the saves directory
    """
    # Check if we're in packaged mode
    if getattr(sys, 'frozen', False):
        # First try METALINGO_RESOURCES_PATH (set by Electron)
        resources_path = os.environ.get('METALINGO_RESOURCES_PATH')
        if resources_path:
            saves_dir = Path(resources_path) / "saves"
            if saves_dir.exists():
                return saves_dir
        
        # Fallback to PyInstaller _MEIPASS
        base_path = Path(sys._MEIPASS)
        saves_dir = base_path / "saves"
        if saves_dir.exists():
            return saves_dir
    
    # Development mode or fallback
    backend_dir = Path(__file__).parent
    project_root = backend_dir.parent
    saves_dir = project_root / "saves"
    
    return saves_dir


def get_models_dir() -> Path:
    """
    Get the models directory path (for ML models)
    
    In packaged mode: Uses resources path from Electron
    In development mode: Uses relative path from project root
    
    Returns:
        Path to the models directory
    """
    # Check if we're in packaged mode
    if getattr(sys, 'frozen', False):
        # First try METALINGO_RESOURCES_PATH (set by Electron)
        resources_path = os.environ.get('METALINGO_RESOURCES_PATH')
        if resources_path:
            models_dir = Path(resources_path) / "models"
            if models_dir.exists():
                return models_dir
        
        # Fallback to PyInstaller _MEIPASS
        base_path = Path(sys._MEIPASS)
        models_dir = base_path / "models"
        if models_dir.exists():
            return models_dir
    
    # Development mode or fallback
    backend_dir = Path(__file__).parent
    project_root = backend_dir.parent
    models_dir = project_root / "models"
    
    return models_dir


def get_help_dir() -> Path:
    """
    Get the help directory path
    
    Returns:
        Path to the help directory
    """
    # Check if we're in packaged mode
    if getattr(sys, 'frozen', False):
        # First try METALINGO_RESOURCES_PATH (set by Electron)
        resources_path = os.environ.get('METALINGO_RESOURCES_PATH')
        if resources_path:
            help_dir = Path(resources_path) / "help"
            if help_dir.exists():
                return help_dir
        
        # Fallback to PyInstaller _MEIPASS
        base_path = Path(sys._MEIPASS)
        help_dir = base_path / "help"
        if help_dir.exists():
            return help_dir
    
    # Development mode or fallback
    backend_dir = Path(__file__).parent
    project_root = backend_dir.parent
    help_dir = project_root / "help"
    
    return help_dir


def is_packaged() -> bool:
    """
    Check if we're running in packaged (production) mode
    
    Returns:
        True if packaged, False if development
    """
    return getattr(sys, 'frozen', False)


# Export commonly used paths as module-level constants
DATA_DIR = get_data_dir()
SAVES_DIR = get_saves_dir()
MODELS_DIR = get_models_dir()
HELP_DIR = get_help_dir()

# Derived paths
DATABASE_PATH = DATA_DIR / "database.sqlite"
CORPORA_DIR = DATA_DIR / "corpora"
ANNOTATIONS_DIR = DATA_DIR / "annotations"
FRAMEWORKS_DIR = DATA_DIR / "frameworks"
SETTINGS_DIR = DATA_DIR / "settings"
TOPIC_MODELING_DIR = DATA_DIR / "topic_modeling"
WORD2VEC_DIR = DATA_DIR / "word2vec_models"

# Ensure critical directories exist
for dir_path in [CORPORA_DIR, ANNOTATIONS_DIR, FRAMEWORKS_DIR, SETTINGS_DIR, 
                 TOPIC_MODELING_DIR, TOPIC_MODELING_DIR / "embeddings", 
                 TOPIC_MODELING_DIR / "results", WORD2VEC_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)


def get_default_frameworks_dir() -> Path:
    """
    Get the default frameworks directory path (bundled with app)
    
    In packaged mode: Returns path from bundled resources (METALINGO_RESOURCES_PATH or _MEIPASS)
    In development mode: Returns saves/frameworks (source of default frameworks)
    
    Returns:
        Path to the default frameworks directory
    """
    if getattr(sys, 'frozen', False):
        # Packaged mode: try bundled resources
        # First try METALINGO_RESOURCES_PATH (set by Electron)
        resources_path = os.environ.get('METALINGO_RESOURCES_PATH')
        if resources_path:
            default_fw_dir = Path(resources_path) / "data" / "frameworks"
            if default_fw_dir.exists():
                return default_fw_dir
        
        # Fallback to PyInstaller _MEIPASS
        base_path = Path(sys._MEIPASS)
        default_fw_dir = base_path / "data" / "frameworks"
        if default_fw_dir.exists():
            return default_fw_dir
        
        # In packaged mode, if neither exists, return the _MEIPASS path anyway
        # (it should exist in a properly packaged app)
        return default_fw_dir
    
    # Development mode: use saves/frameworks as the source of default frameworks
    # IMPORTANT: Do NOT use data/frameworks as it's the user frameworks directory (same as FRAMEWORKS_DIR)
    backend_dir = Path(__file__).parent
    project_root = backend_dir.parent
    return project_root / "saves" / "frameworks"


def initialize_default_frameworks():
    """
    Initialize default frameworks if user frameworks directory is empty.
    Copies bundled default frameworks to user data directory on first run.
    """
    import shutil
    
    # Check if user frameworks directory is empty
    existing_frameworks = list(FRAMEWORKS_DIR.glob("*.json"))
    if existing_frameworks:
        print(f"[Config] User frameworks found: {len(existing_frameworks)} frameworks")
        return
    
    # Get default frameworks from bundled resources
    default_fw_dir = get_default_frameworks_dir()
    if not default_fw_dir.exists():
        print(f"[Config] Default frameworks directory not found: {default_fw_dir}")
        return
    
    default_frameworks = list(default_fw_dir.glob("*.json"))
    if not default_frameworks:
        print(f"[Config] No default frameworks found in: {default_fw_dir}")
        return
    
    # Copy default frameworks to user directory
    copied = 0
    for fw_path in default_frameworks:
        try:
            shutil.copy(fw_path, FRAMEWORKS_DIR / fw_path.name)
            copied += 1
        except Exception as e:
            print(f"[Config] Failed to copy framework {fw_path.name}: {e}")
    
    print(f"[Config] Initialized {copied} default frameworks from {default_fw_dir}")


# Initialize default frameworks on startup
initialize_default_frameworks()


def print_config():
    """Print current configuration for debugging"""
    print(f"[Config] Packaged mode: {is_packaged()}")
    print(f"[Config] DATA_DIR: {DATA_DIR}")
    print(f"[Config] SAVES_DIR: {SAVES_DIR}")
    print(f"[Config] MODELS_DIR: {MODELS_DIR}")
    print(f"[Config] DATABASE_PATH: {DATABASE_PATH}")
    print(f"[Config] METALINGO_DATA_PATH env: {os.environ.get('METALINGO_DATA_PATH', 'Not set')}")
    print(f"[Config] METALINGO_RESOURCES_PATH env: {os.environ.get('METALINGO_RESOURCES_PATH', 'Not set')}")


# Always print config on module load for debugging packaged builds
print_config()


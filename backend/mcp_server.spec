# -*- mode: python ; coding: utf-8 -*-
# Meta-Lingo MCP Server PyInstaller Spec File
# Builds a standalone MCP server executable

import os
import sys

block_cipher = None

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(SPEC)))
BACKEND_PATH = os.path.join(PROJECT_ROOT, 'backend')

hiddenimports = [
    # MCP SDK
    'mcp',
    'mcp.server',
    'mcp.server.fastmcp',
    'mcp.server.stdio',
    'mcp.types',

    # HTTP
    'httpx',
    'httpx_sse',
    'anyio',
    'sniffio',
    'h11',
    'httpcore',

    # Pydantic
    'pydantic',
    'pydantic_core',
    'pydantic_settings',
    'typing_inspection',

    # SSE / Starlette (required by mcp)
    'sse_starlette',
    'starlette',
    'uvicorn',

    # Standard
    'argparse',
    'json',
    'io',
    'base64',
]

a = Analysis(
    [os.path.join(BACKEND_PATH, 'mcp_server', '__main__.py')],
    pathex=[BACKEND_PATH],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy ML packages not needed by MCP server
        'torch', 'torchaudio', 'torchvision',
        'transformers', 'spacy', 'numpy', 'pandas',
        'scipy', 'sklearn', 'matplotlib', 'plotly',
        'bertopic', 'gensim', 'umap', 'hdbscan',
        'ultralytics', 'cv2', 'PIL',
        'librosa', 'soundfile', 'parselmouth',
        'pymusas', 'nltk', 'jieba',
        'wordcloud', 'pyLDAvis',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='meta-lingo-mcp',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='meta-lingo-mcp',
)

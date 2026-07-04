# -*- mode: python ; coding: utf-8 -*-
# Meta-Lingo MCP Server PyInstaller Spec File
# Builds a standalone MCP server executable

import os
import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(SPEC)))
BACKEND_PATH = os.path.join(PROJECT_ROOT, 'backend')

hiddenimports = [
    # Meta-Lingo MCP server + ALL tool modules (server.py imports the 12 tool modules
    # statically, but list them explicitly so no tool is ever dropped from the bundle).
    'mcp_server',
    'mcp_server.server',
    'mcp_server.api_client',

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

    # Chart export — matplotlib
    'matplotlib',
    'matplotlib.pyplot',
    'matplotlib.figure',
    'matplotlib.axes',
    'matplotlib.cm',
    'matplotlib.patches',
    'matplotlib.backends',
    'matplotlib.backends.backend_agg',
    'numpy',

    # Chart export — wordcloud / networkx
    'wordcloud',
    'networkx',
    'PIL',
    'PIL.Image',

    # Chart export — plotly + kaleido (BERTopic charts)
    'plotly',
    'plotly.graph_objects',
    'plotly.io',
    'kaleido',
]

# Pull in every mcp_server.tools.* submodule (all 13 tool modules / 63 tools) explicitly,
# so adding a tool never silently fails to package.
hiddenimports += collect_submodules('mcp_server.tools')

datas = []
binaries = []

# Collect matplotlib data files (fonts, backends, style sheets, etc.)
try:
    mpl_datas, mpl_bins, mpl_hidden = collect_all('matplotlib')
    mpl_datas = [d for d in mpl_datas if not os.path.basename(d[0]).startswith('._')]
    datas += mpl_datas
    binaries += mpl_bins
    hiddenimports += mpl_hidden
    print("Info: Collected matplotlib data files")
except Exception as e:
    print(f"Warning: Could not collect matplotlib: {e}")

# Collect plotly data files
try:
    plotly_datas, plotly_bins, plotly_hidden = collect_all('plotly')
    plotly_datas = [d for d in plotly_datas if not os.path.basename(d[0]).startswith('._')]
    datas += plotly_datas
    binaries += plotly_bins
    hiddenimports += plotly_hidden
    print("Info: Collected plotly data files")
except Exception as e:
    print(f"Warning: Could not collect plotly: {e}")

# Collect kaleido data files (needed for fig.write_image())
try:
    kal_datas, kal_bins, kal_hidden = collect_all('kaleido')
    kal_datas = [d for d in kal_datas if not os.path.basename(d[0]).startswith('._')]
    datas += kal_datas
    binaries += kal_bins
    hiddenimports += kal_hidden
    print("Info: Collected kaleido data files")
except Exception as e:
    print(f"Warning: Could not collect kaleido: {e}")

a = Analysis(
    [os.path.join(BACKEND_PATH, 'mcp_server', '__main__.py')],
    pathex=[BACKEND_PATH],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy ML packages not needed by MCP server
        'torch', 'torchaudio', 'torchvision',
        'transformers', 'spacy', 'pandas',
        'scipy', 'sklearn',
        'bertopic', 'gensim', 'umap', 'hdbscan',
        'ultralytics', 'cv2',
        'librosa', 'soundfile', 'parselmouth',
        'pymusas', 'nltk', 'jieba',
        'pyLDAvis',
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

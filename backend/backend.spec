# -*- mode: python ; coding: utf-8 -*-
# Meta-Lingo Backend PyInstaller Spec File
# 用于将 Python 后端打包成独立可执行文件

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, collect_all

block_cipher = None

# 项目路径
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(SPEC)))
BACKEND_PATH = os.path.join(PROJECT_ROOT, 'backend')
MODELS_PATH = os.path.join(PROJECT_ROOT, 'models')
DATA_PATH = os.path.join(PROJECT_ROOT, 'data')
SAVES_PATH = os.path.join(PROJECT_ROOT, 'saves')
HELP_PATH = os.path.join(PROJECT_ROOT, 'help')

# 收集隐藏导入
hiddenimports = [
    # FastAPI 相关
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'starlette',
    'pydantic',
    'pydantic_core',
    'httpx',
    'anyio',
    'sniffio',
    'h11',
    'httptools',
    'websockets',
    'watchfiles',
    'python_multipart',
    
    # 数据处理
    'numpy',
    'pandas',
    
    # NLP
    'nltk',
    'nltk.tokenize',
    'nltk.corpus',
    'jieba',
    'spacy',
    'spacy.lang.en',
    'spacy.lang.zh',
    
    # Keyword Extraction
    'yake',
    'rake_nltk',
    
    # Constituency Parsing
    'benepar',
    
    # SpaCy 模型
    'en_core_web_lg',
    'zh_core_web_lg',
    
    # PyMUSAS (USAS Semantic Tagging)
    'pymusas',
    'pymusas.spacy_api',
    'pymusas.spacy_api.taggers',
    'pymusas.spacy_api.taggers.rule_based',
    
    # PyMUSAS 模型 (规则)
    'en_dual_none_contextual',
    'cmn_dual_upos2usas_contextual',
    
    # PyMUSAS Neural (神经网络)
    'wsd_torch_models',
    'wsd_torch_models.bem',
    
    # 深度学习
    'torch',
    'torchaudio',
    'torchvision',
    'transformers',
    'transformers.models.whisper',
    'transformers.models.deberta',
    'transformers.models.deberta_v2',
    
    # YOLO
    'ultralytics',
    'cv2',
    
    # FFmpeg (for audio extraction)
    'imageio_ffmpeg',
    
    # Audio Loading (for Whisper)
    'librosa',
    'librosa.core',
    'librosa.util',
    'soundfile',
    
    # Audio Resampling (for TorchCrepe pitch extraction)
    'resampy',
    'resampy.core',
    'resampy.filters',
    'resampy.interpn',
    
    # Numba (required by resampy for JIT compilation)
    'numba',
    'numba.core',
    'numba.np',
    'llvmlite',
    
    # 主题建模
    'bertopic',
    'sentence_transformers',
    'umap',
    'hdbscan',
    'sklearn',
    'sklearn.decomposition',
    'sklearn.feature_extraction.text',
    
    # LDA/LSA (Gensim)
    'gensim',
    'gensim.corpora',
    'gensim.models',
    'gensim.models.ldamodel',
    'gensim.models.coherencemodel',
    'gensim.matutils',
    'gensim.utils',
    'scipy',
    'scipy.sparse',
    
    # 信度分析
    'krippendorff',
    
    # 可视化
    'matplotlib',
    'matplotlib.pyplot',
    'matplotlib.backends',
    'matplotlib.backends.backend_agg',
    'matplotlib.font_manager',
    'wordcloud',
    'plotly',
    'plotly.io',
    'plotly.graph_objects',
    'plotly.express',
    
    # 其他
    'PIL',
    'PIL.Image',
]

# 收集包数据
datas = []

# NLTK 数据
nltk_data_path = os.path.join(MODELS_PATH, 'nltk')
if os.path.exists(nltk_data_path):
    datas.append((nltk_data_path, 'models/nltk'))

# SpaCy 模型 - 从 site-packages 收集
try:
    spacy_en_datas = collect_all('en_core_web_lg')[0]
    # 过滤掉 macOS 资源叉文件
    spacy_en_datas = [d for d in spacy_en_datas if not os.path.basename(d[0]).startswith('._')]
    datas += spacy_en_datas
except Exception as e:
    print(f"Warning: Could not collect en_core_web_lg: {e}")

try:
    spacy_zh_datas = collect_all('zh_core_web_lg')[0]
    # 过滤掉 macOS 资源叉文件
    spacy_zh_datas = [d for d in spacy_zh_datas if not os.path.basename(d[0]).startswith('._')]
    datas += spacy_zh_datas
except Exception as e:
    print(f"Warning: Could not collect zh_core_web_lg: {e}")

# PyMUSAS 模型
try:
    pymusas_en_datas = collect_all('en_dual_none_contextual')[0]
    # 过滤掉 macOS 资源叉文件
    pymusas_en_datas = [d for d in pymusas_en_datas if not os.path.basename(d[0]).startswith('._')]
    datas += pymusas_en_datas
except Exception as e:
    print(f"Warning: Could not collect en_dual_none_contextual: {e}")

try:
    pymusas_zh_datas = collect_all('cmn_dual_upos2usas_contextual')[0]
    # 过滤掉 macOS 资源叉文件
    pymusas_zh_datas = [d for d in pymusas_zh_datas if not os.path.basename(d[0]).startswith('._')]
    datas += pymusas_zh_datas
except Exception as e:
    print(f"Warning: Could not collect cmn_dual_upos2usas_contextual: {e}")

# spacy_pkuseg 字典文件 (中文分词需要)
try:
    pkuseg_datas = collect_data_files('spacy_pkuseg')
    # 过滤掉 macOS 资源叉文件
    pkuseg_datas = [d for d in pkuseg_datas if not os.path.basename(d[0]).startswith('._')]
    datas += pkuseg_datas
except Exception as e:
    print(f"Warning: Could not collect spacy_pkuseg: {e}")

# Sentence Transformers 模型
sbert_path = os.path.join(MODELS_PATH, 'sentence_embeddings')
if os.path.exists(sbert_path):
    datas.append((sbert_path, 'models/sentence_embeddings'))

# Whisper 模型
whisper_path = os.path.join(MODELS_PATH, 'multimodal_analyzer', 'whisper-large-v3-turbo')
if os.path.exists(whisper_path):
    datas.append((whisper_path, 'models/multimodal_analyzer/whisper-large-v3-turbo'))

# YOLO 模型
yolo_path = os.path.join(MODELS_PATH, 'multimodal_analyzer', 'yolov8')
if os.path.exists(yolo_path):
    datas.append((yolo_path, 'models/multimodal_analyzer/yolov8'))

# CLIP 模型
clip_path = os.path.join(MODELS_PATH, 'multimodal_analyzer', 'clip-vit-large-patch14')
if os.path.exists(clip_path):
    datas.append((clip_path, 'models/multimodal_analyzer/clip-vit-large-patch14'))

# Wav2Vec2 模型 (强制对齐)
wav2vec2_path = os.path.join(MODELS_PATH, 'multimodal_analyzer', 'wav2vec2-base-960h')
if os.path.exists(wav2vec2_path):
    datas.append((wav2vec2_path, 'models/multimodal_analyzer/wav2vec2-base-960h'))

# TorchCrepe 模型 (音高提取)
torchcrepe_path = os.path.join(MODELS_PATH, 'multimodal_analyzer', 'torchcrepe-master')
if os.path.exists(torchcrepe_path):
    datas.append((torchcrepe_path, 'models/multimodal_analyzer/torchcrepe-master'))

# PyMUSAS Neural 模型
pymusas_neural_path = os.path.join(MODELS_PATH, 'pymusas', 'PyMUSAS-Neural-Multilingual-Base-BEM')
if os.path.exists(pymusas_neural_path):
    datas.append((pymusas_neural_path, 'models/pymusas/PyMUSAS-Neural-Multilingual-Base-BEM'))

# MIPVU 隐喻识别模型 - HiTZ DeBERTa
hitz_model_path = os.path.join(MODELS_PATH, 'metaphor_identification', 'deberta-large-metaphor-detection-en')
if os.path.exists(hitz_model_path):
    datas.append((hitz_model_path, 'models/metaphor_identification/deberta-large-metaphor-detection-en'))

# MIPVU 隐喻识别模型 - 微调 DeBERTa
finetuned_model_path = os.path.join(MODELS_PATH, 'metaphor_identification', 'deberta-v3-large-metaphor-in-dt-rb-rp')
if os.path.exists(finetuned_model_path):
    datas.append((finetuned_model_path, 'models/metaphor_identification/deberta-v3-large-metaphor-in-dt-rb-rp'))

# 数据目录 (只包含框架定义，不包含用户数据)
frameworks_path = os.path.join(DATA_PATH, 'frameworks')
if os.path.exists(frameworks_path):
    datas.append((frameworks_path, 'data/frameworks'))

# saves 目录 (只包含框架和词典，不包含用户数据)
saves_frameworks_path = os.path.join(SAVES_PATH, 'frameworks')
if os.path.exists(saves_frameworks_path):
    datas.append((saves_frameworks_path, 'saves/frameworks'))

saves_dict_path = os.path.join(SAVES_PATH, 'dict')
if os.path.exists(saves_dict_path):
    datas.append((saves_dict_path, 'saves/dict'))

# MIPVU 隐喻过滤词表
saves_metaphor_path = os.path.join(SAVES_PATH, 'metaphor')
if os.path.exists(saves_metaphor_path):
    datas.append((saves_metaphor_path, 'saves/metaphor'))

# help 目录
if os.path.exists(HELP_PATH):
    datas.append((HELP_PATH, 'help'))

# USAS 语义域配置文件
usas_domains_file = os.path.join(PROJECT_ROOT, 'usas_semantic_domains.txt')
if os.path.exists(usas_domains_file):
    datas.append((usas_domains_file, '.'))

# 收集 transformers 数据
transformers_datas = collect_data_files('transformers', include_py_files=True)
# 过滤掉 macOS 资源叉文件
transformers_datas = [d for d in transformers_datas if not os.path.basename(d[0]).startswith('._')]
datas += transformers_datas

# 收集 ultralytics 数据
try:
    ultralytics_datas = collect_data_files('ultralytics')
    # 过滤掉 macOS 资源叉文件
    ultralytics_datas = [d for d in ultralytics_datas if not os.path.basename(d[0]).startswith('._')]
    datas += ultralytics_datas
except:
    pass

# 收集 imageio_ffmpeg 数据 (包含 ffmpeg 二进制文件)
try:
    ffmpeg_datas = collect_data_files('imageio_ffmpeg')
    # 过滤掉 macOS 资源叉文件
    ffmpeg_datas = [d for d in ffmpeg_datas if not os.path.basename(d[0]).startswith('._')]
    datas += ffmpeg_datas
except Exception as e:
    print(f"Warning: Could not collect imageio_ffmpeg: {e}")

# 收集 gensim 数据 (LDA 主题建模)
try:
    gensim_datas = collect_data_files('gensim')
    # 过滤掉 macOS 资源叉文件
    gensim_datas = [d for d in gensim_datas if not os.path.basename(d[0]).startswith('._')]
    datas += gensim_datas
except Exception as e:
    print(f"Warning: Could not collect gensim: {e}")

# 收集 librosa 数据和子模块 (音频处理)
# 注意: librosa 在 conda 环境中可能不是标准包格式，使用 try-except 处理
try:
    librosa_datas, librosa_binaries, librosa_hiddenimports = collect_all('librosa')
    # 过滤掉 macOS 资源叉文件
    librosa_datas = [d for d in librosa_datas if not os.path.basename(d[0]).startswith('._')]
    datas += librosa_datas
    hiddenimports += librosa_hiddenimports
    print(f"Info: Collected librosa data files (excluding macOS resource forks)")
except Exception as e:
    # librosa 可能不在标准位置，但已在 hiddenimports 中，运行时应该可用
    print(f"Warning: Could not collect librosa data (may still work at runtime): {e}")

# 收集 resampy 数据文件 (filter coefficients for audio resampling)
try:
    resampy_datas, resampy_binaries, resampy_hiddenimports = collect_all('resampy')
    # 过滤掉 macOS 资源叉文件
    resampy_datas = [d for d in resampy_datas if not os.path.basename(d[0]).startswith('._')]
    datas += resampy_datas
    hiddenimports += resampy_hiddenimports
    print(f"Info: Collected resampy data files (excluding macOS resource forks)")
except Exception as e:
    print(f"Warning: Could not collect resampy data: {e}")

# 收集 numba 数据文件 (required by resampy for JIT compilation)
try:
    numba_datas, numba_binaries, numba_hiddenimports = collect_all('numba')
    # 过滤掉 macOS 资源叉文件
    numba_datas = [d for d in numba_datas if not os.path.basename(d[0]).startswith('._')]
    datas += numba_datas
    hiddenimports += numba_hiddenimports
    print(f"Info: Collected numba data files (excluding macOS resource forks)")
except Exception as e:
    print(f"Warning: Could not collect numba data: {e}")

# 收集 soundfile 数据和二进制文件
# 注意: soundfile 在 conda 环境中可能不是标准包格式，使用 try-except 处理
try:
    soundfile_datas, soundfile_binaries, soundfile_hiddenimports = collect_all('soundfile')
    # 过滤掉 macOS 资源叉文件
    soundfile_datas = [d for d in soundfile_datas if not os.path.basename(d[0]).startswith('._')]
    datas += soundfile_datas
    hiddenimports += soundfile_hiddenimports
    # soundfile 需要 libsndfile DLL
    if soundfile_binaries:
        print(f"Info: Collected soundfile binaries: {len(soundfile_binaries)} files")
except Exception as e:
    # soundfile 可能不在标准位置，但已在 hiddenimports 中，运行时应该可用
    print(f"Warning: Could not collect soundfile data (may still work at runtime): {e}")

# 手动添加 soundfile 的 _soundfile_data 目录（包含 libsndfile）
# 仅在 soundfile 模块可用时尝试
try:
    import soundfile
    sf_path = os.path.dirname(soundfile.__file__)
    sf_data_path = os.path.join(sf_path, '_soundfile_data')
    if os.path.exists(sf_data_path):
        datas.append((sf_data_path, 'soundfile/_soundfile_data'))
        print(f"Info: Added soundfile data from {sf_data_path}")
except ImportError:
    # soundfile 未安装，跳过（Whisper 会使用其他方法加载音频）
    print(f"Info: soundfile not available, will use alternative audio loading methods")
except Exception as e:
    print(f"Warning: Could not add soundfile data: {e}")

# 收集 matplotlib 数据 (字体、样式等)
# 排除测试数据以避免警告
try:
    matplotlib_datas, matplotlib_binaries, matplotlib_hiddenimports = collect_all('matplotlib')
    # 过滤掉测试相关的数据文件和 macOS 资源叉文件
    matplotlib_datas = [d for d in matplotlib_datas if 'tests' not in d[0].lower() and not os.path.basename(d[0]).startswith('._')]
    datas += matplotlib_datas
    hiddenimports += matplotlib_hiddenimports
    # 排除 matplotlib.tests 子模块
    hiddenimports = [h for h in hiddenimports if 'matplotlib.tests' not in h]
    print(f"Info: Collected matplotlib data files (excluding tests and macOS resource forks)")
except Exception as e:
    print(f"Warning: Could not collect matplotlib: {e}")

# 收集 plotly 数据
try:
    plotly_datas, plotly_binaries, plotly_hiddenimports = collect_all('plotly')
    # 过滤掉 macOS 资源叉文件
    plotly_datas = [d for d in plotly_datas if not os.path.basename(d[0]).startswith('._')]
    datas += plotly_datas
    hiddenimports += plotly_hiddenimports
    print(f"Info: Collected plotly data files (excluding macOS resource forks)")
except Exception as e:
    print(f"Warning: Could not collect plotly: {e}")

# 收集 wordcloud 数据
try:
    wordcloud_datas, wordcloud_binaries, wordcloud_hiddenimports = collect_all('wordcloud')
    # 过滤掉 macOS 资源叉文件
    wordcloud_datas = [d for d in wordcloud_datas if not os.path.basename(d[0]).startswith('._')]
    datas += wordcloud_datas
    hiddenimports += wordcloud_hiddenimports
    print(f"Info: Collected wordcloud data files (excluding macOS resource forks)")
except Exception as e:
    print(f"Warning: Could not collect wordcloud: {e}")

# 最终过滤：确保所有 datas 中都没有 macOS 资源叉文件（以 ._ 开头）
print(f"Info: Filtering macOS resource fork files from datas...")
original_count = len(datas)
datas = [d for d in datas if not os.path.basename(d[0]).startswith('._')]
filtered_count = original_count - len(datas)
if filtered_count > 0:
    print(f"Info: Filtered out {filtered_count} macOS resource fork files")

a = Analysis(
    ['main.py'],
    pathex=[BACKEND_PATH],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'IPython',
        'jupyter',
        'notebook',
        'matplotlib.tests',  # 排除测试数据，避免打包警告
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
    name='meta-lingo-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # 保持控制台输出用于调试
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# 最终过滤：在 COLLECT 阶段过滤掉所有 macOS 资源叉文件
# 这是最后一道防线，确保打包时不包含任何 ._ 开头的文件
print(f"Info: Final filtering of macOS resource fork files in COLLECT stage...")

# 过滤 datas
original_datas_count = len(a.datas)
filtered_datas = []
for item in a.datas:
    # item 是一个元组: (destination_path, source_path, type)
    dest_path = item[0]
    # 检查目标路径中的文件名是否以 ._ 开头
    filename = os.path.basename(dest_path)
    if not filename.startswith('._'):
        filtered_datas.append(item)
    else:
        print(f"Info: Filtering out resource fork file from datas: {dest_path}")

datas_filtered_count = original_datas_count - len(filtered_datas)
print(f"Info: Filtered out {datas_filtered_count} resource fork files from {original_datas_count} data files")

# 过滤 binaries
original_binaries_count = len(a.binaries)
filtered_binaries = []
for item in a.binaries:
    # item 是一个元组: (name, path, type)
    name = item[0]
    filename = os.path.basename(name)
    if not filename.startswith('._'):
        filtered_binaries.append(item)
    else:
        print(f"Info: Filtering out resource fork file from binaries: {name}")

binaries_filtered_count = original_binaries_count - len(filtered_binaries)
print(f"Info: Filtered out {binaries_filtered_count} resource fork files from {original_binaries_count} binaries")

# 过滤 zipfiles
original_zipfiles_count = len(a.zipfiles)
filtered_zipfiles = []
for item in a.zipfiles:
    # item 是一个元组: (name, path, type)
    name = item[0]
    filename = os.path.basename(name)
    if not filename.startswith('._'):
        filtered_zipfiles.append(item)
    else:
        print(f"Info: Filtering out resource fork file from zipfiles: {name}")

zipfiles_filtered_count = original_zipfiles_count - len(filtered_zipfiles)
print(f"Info: Filtered out {zipfiles_filtered_count} resource fork files from {original_zipfiles_count} zipfiles")

total_filtered = datas_filtered_count + binaries_filtered_count + zipfiles_filtered_count
print(f"Info: Total resource fork files filtered: {total_filtered}")

coll = COLLECT(
    exe,
    filtered_binaries,  # 使用过滤后的 binaries
    filtered_zipfiles,  # 使用过滤后的 zipfiles
    filtered_datas,  # 使用过滤后的 datas
    strip=False,
    upx=True,
    upx_exclude=[],
    name='meta-lingo-backend',
)


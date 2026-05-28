<p align="center">
  <img src="assets/icons/icon_256x256.png" alt="Meta-Lingo Logo" width="128" height="128">
</p>

<h1 align="center">Meta-Lingo</h1>

<p align="center">
  <strong>A Modern Multimodal Corpus Research Software</strong>
</p>

<p align="center">
  <a href="#features">Features</a> |
  <a href="#installation">Installation</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="#documentation">Documentation</a> |
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v4.8.45-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/license-Non--Commercial-green.svg" alt="License">
  <a href="https://doi.org/10.5281/zenodo.20091931"><img src="https://zenodo.org/badge/1143968310.svg" alt="DOI"></a>
</p>

<p align="center">
  <a href="https://huggingface.co/tommyleo2077"><img src="https://img.shields.io/badge/Hugging%20Face-FFD21E?style=flat&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="https://space.bilibili.com/294707614"><img src="https://img.shields.io/badge/Bilibili-00A1D6?style=flat&logo=bilibili&logoColor=white" alt="Bilibili"></a>
  <a href="https://www.xiaohongshu.com/user/profile/6337c399000000001802d464"><img src="https://img.shields.io/badge/Xiaohongshu-FF2442?style=flat&logo=xiaohongshu&logoColor=white" alt="Xiaohongshu"></a>
  <a href="https://v.douyin.com/euiu1OJ9jB4/"><img src="https://img.shields.io/badge/Douyin-000000?style=flat&logo=tiktok&logoColor=white" alt="Douyin"></a>
  <a href="mailto:1683619168tl@gmail.com"><img src="https://img.shields.io/badge/Email-D14836?style=flat&logo=gmail&logoColor=white" alt="Email"></a>
</p>

---

## Overview

**Meta-Lingo** is a comprehensive desktop application designed for corpus linguistics research. Built with modern technologies (Electron + React + Python FastAPI), it provides powerful tools for multimodal corpus management, linguistic analysis, and annotation.

<p align="center">
  <img src="assets/Background2.jpg" alt="Meta-Lingo Screenshot" width="800">
</p>

## Features

### Corpus Management
- **Multimodal Support**: Text, audio, and video files with drag-and-drop upload
- **Audio Transcription**: Whisper Large V3 Turbo with word-level timestamps
- **Forced Alignment**: Wav2Vec2 word-level alignment for English audio (automatic)
- **Pitch Extraction**: TorchCrepe F0 extraction for English audio (automatic)
- **Video Analysis**: YOLOv8 object detection and CLIP semantic classification
- **Automatic Annotation**: SpaCy NLP (POS/NER/Dependency), USAS semantic domains, MIPVU metaphor identification
- **Metadata Management**: Language, author, source, text type with tag system

### Analysis Tools

| Module | Description |
|--------|-------------|
| **Word Frequency** | Frequency analysis with POS filtering, lemma/word form selection, visualization |
| **N-gram Analysis** | 2-6 gram support, nested grouping, Sankey diagrams |
| **Keyword Extraction** | TF-IDF, TextRank, YAKE!, RAKE, and 9 keyness statistics methods |
| **Collocation** | KWIC search with 6 modes, CQL query language, CQL Builder |
| **Synonym Analysis** | WordNet integration with network visualization |
| **Semantic Domain** | USAS-based analysis with dual view (by domain/by word) |
| **Sentiment Analysis** | NRC-EmoLex polarity + emotion dimension analysis (pie/radar) |
| **Metaphor Analysis** | MIPVU-based detection; 3-step pipeline (word filter → rules → Clause model); source color-coding by POS |
| **Word Sketch** | Grammar pattern analysis (50 relations), logDice scoring, difference comparison |
| **Topic Modeling** | BERTopic, LDA, LSA, NMF with dynamic topic analysis |
| **Bibliography** | Refworks parsing (WOS/CNKI), shadow corpus for abstracts, network visualization, burst detection; analysis modules support corpus/literature toggle and library selection (all / by keyword / manual). |

### Annotation Mode
- **Text Annotation**: Sentence-level display, intelligent segmentation, batch annotation
- **Multimodal Annotation**: Video frame tracking, DAW-style timeline, YOLO overlay
- **Audio Waveform Annotation**: Wavesurfer.js waveform visualization with word alignment, pitch curve overlay, box drawing annotation (English audio only)
- **Framework Management**: 49 preset frameworks (SFL, UAM, etc.), custom framework support
- **Inter-coder Reliability**: Fleiss' Kappa, Cohen's Kappa, Krippendorff's Alpha, Gold Standard support (plain text archives only)
- **Syntax Visualization**: Constituency and dependency parsing

### Additional Features
- **Dictionary Lookup**: Macmillan, Longman Collocations with fuzzy search
- **Bilingual Interface**: Chinese and English with real-time switching
- **Custom Wallpaper**: Personalized application background
- **Export Options**: CSV, PNG, SVG for all visualizations
- **AI Assistant (optional)**: context-aware assistant for analysis modules (Ollama or OpenAI-compatible API)
- **MCP Server Integration (optional)**: enable an MCP server so external AI assistants (e.g., Claude Desktop/Cursor) can call Meta-Lingo tools directly
- **OpenAI-Compatible API Support (optional)**: configure compatible endpoints/keys for AI-assisted features and better model naming

## System Architecture

```
+----------------------------------------------------------+
|                      Meta-Lingo                           |
+----------------------------------------------------------+
|  Frontend (Electron + React + TypeScript)                 |
|  - Material-UI components                                 |
|  - Zustand state management                               |
|  - D3.js / Plotly.js visualizations                       |
|  - i18next internationalization                           |
+----------------------------------------------------------+
|                    HTTP REST API                          |
+----------------------------------------------------------+
|  Backend (Python FastAPI)                                 |
|  - SpaCy NLP processing                                   |
|  - USAS semantic tagging (PyMUSAS)                        |
|  - MIPVU metaphor detection (DeBERTa)                     |
|  - BERTopic / LDA / LSA / NMF topic modeling              |
|  - Whisper / YOLO / CLIP multimodal analysis              |
+----------------------------------------------------------+
|  Data Storage                                             |
|  - SQLite database (metadata)                             |
|  - File system (corpora, annotations)                     |
+----------------------------------------------------------+
```

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| Electron 28+ | Desktop application framework |
| React 18 | UI framework |
| TypeScript 5 | Type safety |
| Material-UI 5 | Component library |
| D3.js 7 | Data visualization |
| Plotly.js | Interactive charts |

### Backend
| Technology | Purpose |
|------------|---------|
| Python 3.12 | Runtime environment |
| FastAPI | Web framework |
| SpaCy 3.8+ | NLP processing |
| PyMUSAS | Semantic tagging |
| BERTopic | Topic modeling |
| Transformers | Whisper/CLIP models |
| Ultralytics | YOLOv8 |

## Installation

### Download

Visit our official website to download the latest version:

**[https://tltanium.github.io/meta-lingo-website/](https://tltanium.github.io/meta-lingo-website/)**

Source code in this repository is provided for reference and academic verification only. Please use the official distribution above to run Meta-Lingo.

## Quick Start

After installing from the website, launch the application and follow the in-app guidance. For documentation, use the Help module inside the application.

## Documentation

- **In-app Help**: Access via the Help module with bilingual documentation
- **API Documentation**: http://localhost:8000/docs (when backend is running)

## API Overview

| Category | Endpoints |
|----------|-----------|
| Corpus | `/api/corpus/*` - CRUD, upload, annotation |
| Analysis | `/api/analysis/*` - Word frequency, N-gram, keywords, etc. |
| Collocation | `/api/collocation/*` - KWIC search, CQL parsing |
| Topic Modeling | `/api/topic-modeling/*` - BERTopic, LDA, LSA, NMF |
| Annotation | `/api/annotation/*`, `/api/framework/*` |
| Word Sketch | `/api/sketch/*` - Grammar patterns, difference |
| Bibliography | `/api/biblio/*` - Libraries, visualization |

Full API documentation available at `/docs` endpoint.

## Models & Resources

Meta-Lingo integrates several pre-trained models:

| Model | Purpose | Source |
|-------|---------|--------|
| Whisper Large V3 Turbo | Audio transcription | OpenAI |
| Wav2Vec2-base-960h | Forced alignment (English) | [ModelScope — facebook/wav2vec2-base-960h](https://modelscope.cn/models/facebook/wav2vec2-base-960h/summary) |
| TorchCrepe Full | Pitch extraction (F0) | [maxrmorrison/torchcrepe](https://github.com/maxrmorrison/torchcrepe) |
| YOLOv8 | Object detection | Ultralytics |
| CLIP ViT-Large-Patch14 | Image classification | OpenAI |
| SpaCy en/zh_core_web_sm | NLP processing (no static word vectors) | Explosion |
| metalingo-deberta-metaphor | MIPVU metaphor detection (F1 81.24) | [TommyLeo](https://modelscope.cn/models/TommyLeo/metalingo-deberta-metaphor/summary) |
| Sentence-BERT | Text embeddings | sentence-transformers |

## Contributing

This project is currently maintained for academic research purposes. For bug reports or feature requests, please open an issue.

## Changelog

Recent releases below mirror `PROJECT.md` (abbreviated). For the full version history, see **`PROJECT.md`** at the repository root or the Git commit log.

### v4.8.44 (2026-05-28)
- **Regex support for exclusion words across all modules**: All analysis modules (word frequency, keyword extraction, N-gram, semantic domain, metaphor, collocation, word sketch, sketch difference) now support regular expressions in their exclusion word fields. Invalid regex patterns automatically fall back to exact-match literals. LDA/LSA/NMF topic modeling gains a new "Exclusion Words" preprocessing option with full regex support. Uses a new shared `backend/utils/exclusion_utils.py` utility. Frontend helper text updated in both EN and ZH to explain regex usage.

### v4.8.41 (2026-05-28)
- **MIPVU — metalingo-deberta-metaphor**: Replaced `deberta-v3-large-clause-metaphor` with `metalingo-deberta-metaphor` (two-stage knowledge distillation, VUAMC NAACL FLP 2018 split). New metrics: F1 81.24, Precision 83.82%, Recall 78.81%, Accuracy 95.78%. ModelScope download via `TommyLeo/metalingo-deberta-metaphor`. All references updated across backend, frontend, i18n, and help docs.
- **MCP — corpus/text metadata update tools**: Added `update_corpus_metadata` and `update_text_metadata` tools to the MCP server and Agent Chat tool registry.
- **MCP — keyword/keyness search types**: Added `search_word` + `search_type` parameters to `keyword_extraction`, `keyness_analysis`, and `keyness_resource_analysis` tools (contains/exact/starts/ends/regex/wordlist).
- **Agent Chat — loop guard**: Loop guard now uses argument fingerprints instead of call counts; allows up to 3 calls per tool per turn with different parameters; resets on every new user message.
- **Settings — citation DOI**: Added DOI link (`https://doi.org/10.5281/zenodo.20091932`) to citation block in License/Citation settings.

### v4.7.98 (2026-04-06)
- **Wav2Vec2 (multimodal alignment)**: ModelScope download id `facebook/wav2vec2-base-960h` in `model_manifest_constants.py`; docs/help/README updated. Model Management dialog does not show an extra ModelScope link line (avoid redundancy). See `PROJECT.md`.
- **Video transcript auto-annotation (MIPVU)**: `corpus.py` video upload path now passes SpaCy token `start`/`end` into MIPVU merge (parity with audio). Re-run MIPVU or re-upload to refresh old transcripts.
- **BERTopic dynamic / topics over time**: Embeddings now save `{id}_docs.json` so chunk texts with newlines cannot desync document rows from vectors (fixes missing evolution chart when dates exist). Recreate embeddings if load fails; visualization tab also keys off `topics_over_time` data.

### v4.7.85 (2026-04-02)
- **Help — Corpus SpaCy table**: In `help/zh.md` and `help/en.md`, the language/model table no longer includes a “common ISO / aliases” column; it keeps only UI language name, corpus language code, and SpaCy package name.

### v4.7.84 (2026-04-02)
- **Help — Corpus SpaCy**: Corpus Management section adds tables for supported languages vs. SpaCy packages (11 languages, `SPACY_MODEL_MAP`) and for annotation output; `src/pages/CorpusManagement/mldoc.md` links to the full help tables.

### v4.7.83 (2026-04-02)
- **SpaCy EN/ZH (lg → sm)**: Defaults switched from `en_core_web_lg` / `zh_core_web_lg` to `en_core_web_sm` / `zh_core_web_sm`; updates across `spacy_service`, `backend.spec`, BERTopic PartOfSpeech UI, preprocess, Benepar, `build.sh` / `build.bat`, help text, etc.

### v4.7.82 (2026-04-02)
- **Corpus Management — text type display**: Fixes the text-type dropdown briefly showing codes (e.g. `GEN`) before `/api/usas/text-types` loads; adds `usasTextTypeLabel` and `corpus.textTypeCodes` i18n fallbacks.

### v4.7.81 (2026-04-02)
- **Corpus resource dialog — refresh robustness**: Fixes parsing when `api.get()` returns `{ success, data }`; increases timeout for requests with `refresh=1` so refresh does not fail when rebuilds exceed ~60s.
- **Corpus resource dialog — refresh fix**: Corrects frontend parsing for `/api/corpus-resource/list` and `/tags` so the list reloads reliably after **Refresh**.
- **Keyness — default reference corpus**: Default reference corpus changed from `OANC` to `AmE06` (full corpus: `ame06_total`).
- **Corpus resource cache — startup**: Persistent cache for `corpus_resource_service`; rebuild only when **Refresh** is clicked, avoiding heavy CSV work on every app launch.
- **Corpus resource dialog — dialog cache**: **Refresh** button added; without it, the dialog uses cached data to avoid rebuilding the resource list every time it opens.
- **Keyness — NOW card**: `NOW` (News on the Web) country breakdown time range set to `2010–2024`; help examples completed for COCA/COHA/GloWbE/Coronavirus/iWeb/TV/Movies/SOAP/Wikipedia.
- **Corpus resource intro — NOW**: `NOW` description updated to `2010–2024`; resource name and tags unchanged.
- **Corpus resource colors**: Distinct color per corpus prefix; fixes TV/SOAP vs. Brown being too similar.

### v3.9.56 (2026-03-07)
- **Metaphor Analysis — Clause-only pipeline**: Removed HiTZ model entirely. All tokens now annotated by a single `deberta-v3-large-clause-metaphor` model using full-sentence context (max_length=192). 3-step pipeline: word-form filter → SpaCy rule filter → Clause model. Function words (IN/DT/RB/RP) keep orange tag (`finetuned`); other words use green tag (`clause`). Legacy `hitz` source in existing annotations treated as `clause` (green). Help docs updated with Clause model accuracy (Precision 78.08%, Recall 73.69%, F1 75.83; DT F1 90.87, IN F1 87.87).

### v3.9.55 (2026-03-07)
- **Sentiment Analysis — USAS mode**: Search panel adds "USAS Semantic Domain" mode; results aggregate sentiment scores by domain code with full domain name tooltip; word cloud uses domain names; CSV export adds `domain_name` column.

### v3.9.54–v3.9.51 (2026-03-06)
- **Bibliography Visualization**: PDF export rewritten via Electron IPC (`printToPDF`) to fix blank-page issue on large documents. Paper column with PDF upload and first-page thumbnail. 11 AI-generated fields per entry (research goal, questions, design, conclusions, mechanism, contribution, limitations, value, dialogue, future work, summary). Batch AI generation for multiple entries. Column visibility control. Export to styled PDF report.

### v3.9.46 (2026-03-04)
- **Sentiment Analysis (NRC)**: Full NRC-EmoLex annotation added to corpus pipeline after MIPVU. New analysis page with polarity (pie chart + word cloud) and emotion dimensions (radar chart + word cloud). Result table cross-links to collocation/word sketch/N-gram/semantic domain. Backend: `nrc_service.py`, `sentiment_analysis_service.py`, `POST /api/analysis/sentiment`.

### v3.9.44–v3.9.45 (2026-03-02)
- Cross-module links default to case-insensitive search. Collocation wordlist search mode (multi-word input, one per line).

### v3.9.43 (2026-03-02)
- **Bibliography**: Bulk delete for selected entries. Relevance rating (0–5 stars), tags, and notes columns added to entry table and detail dialog. CSV export.

### v3.9.36 (2026-02-27)
- **Metaphor Analysis**: Added Clause model (`deberta-v3-large-clause-metaphor`) to MIPVU pipeline for function-word annotation. POS-group statistics (IN/DT/RB/RP/OTHER metaphor rates) shown in results table header.

### v3.9.34–v3.9.35 (2026-02-26–27)
- Cross-module corpus selection sync across all analysis modules. Topic modeling bibliography mode with publication year for dynamic analysis.

### v3.9.27–v3.9.33 (2026-02-24–26)
- **AI Assistant**: Robot icon in all analysis modules' left panel (requires Ollama or OpenAI-compatible API); sends current page state as context. OpenAI-compatible API support in Settings (address / key / model). Cross-module library-mode link sync fixes.

### v3.9.22–v3.9.26 (2026-02-24)
- Semantic domain analysis: CQL cross-link, word cloud, domain name display. Collocation network expand on click, MinSense fix, Word Sketch Difference word-form/lemma mode. Topic modeling: N-gram preprocessing mode, LDA/LSA/NMF dynamic topic analysis.

### v3.9.15–v3.9.18 (2026-02-17–22)
- **Praat acoustic analysis**: Spectrogram, formants (F1–F5), intensity, HNR, jitter, shimmer. Chinese audio full visualization support. Corpus building script (`saves/corpus/corpus_building.py`) for 13 English corpora.

### v3.9.0–v3.9.14 (2026-02-08–16)
- Ridge plot SVG/PNG full export, CQL top-level OR operator and template auto-fill. Collocation search mode (lemma/word form). Result table search fix across all modules. Unified UI spacing and labeling. Cross-module N-gram link.

### v3.8.96–v3.8.99 (2026-01-28–2026-02-08)
- Audio waveform annotation (Wavesurfer.js + TorchCrepe pitch + box drawing). Full annotation pipeline for audio/video transcripts. Inter-coder reliability gold standard fix. CQL distance selector fix.

### v3.8.86–v3.8.95 (2026-01-18–28)
- LLM topic naming (Ollama). USAS annotation modes (rule / neural / hybrid). Stopword removal (20+ languages). Custom wallpaper. Keyword extraction enhancements. Theme/Rheme auto-annotation. Dark theme for all topic modeling visualizations.

## License

**Meta-Lingo Software License (Non-Commercial)**

Meta-Lingo is an independently developed corpus research software by Tommy Leo, protected under the Copyright Law of the People's Republic of China.

This software is licensed only for:
- Personal learning
- Academic research
- Non-commercial corpus analysis and linguistic research

Commercial use is prohibited without written permission.

See [LICENSE_CN.txt](LICENSE_CN.txt) (Chinese) or [LICENSE_EN.txt](LICENSE_EN.txt) (English) for full terms.

---

<p align="center">
  <strong>Copyright 2026 Tommy Leo. All rights reserved.</strong>
</p>

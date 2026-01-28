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
  <img src="https://img.shields.io/badge/version-v3.8.95-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/license-Non--Commercial-green.svg" alt="License">
</p>

<p align="center">
  <a href="https://huggingface.co/tommyleo2077"><img src="https://img.shields.io/badge/Hugging%20Face-FFD21E?style=flat&logo=huggingface&logoColor=black" alt="Hugging Face"></a>
  <a href="https://space.bilibili.com/294707614"><img src="https://img.shields.io/badge/Bilibili-00A1D6?style=flat&logo=bilibili&logoColor=white" alt="Bilibili"></a>
  <a href="https://xhslink.com/m/9z8ubyF4b4N"><img src="https://img.shields.io/badge/Xiaohongshu-FF2442?style=flat&logo=xiaohongshu&logoColor=white" alt="Xiaohongshu"></a>
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
| **Metaphor Analysis** | MIPVU-based detection with HiTZ and fine-tuned models |
| **Word Sketch** | Grammar pattern analysis (50 relations), logDice scoring, difference comparison |
| **Topic Modeling** | BERTopic, LDA, LSA, NMF with dynamic topic analysis |
| **Bibliography** | Refworks parsing (WOS/CNKI), network visualization, burst detection |

### Annotation Mode
- **Text Annotation**: Sentence-level display, intelligent segmentation, batch annotation
- **Multimodal Annotation**: Video frame tracking, DAW-style timeline, YOLO overlay
- **Framework Management**: 49 preset frameworks (SFL, UAM, etc.), custom framework support
- **Inter-coder Reliability**: Fleiss' Kappa, Cohen's Kappa, Krippendorff's Alpha, Gold Standard support
- **Syntax Visualization**: Constituency and dependency parsing

### Additional Features
- **Dictionary Lookup**: Macmillan, Longman Collocations with fuzzy search
- **Bilingual Interface**: Chinese and English with real-time switching
- **Custom Wallpaper**: Personalized application background
- **Export Options**: CSV, PNG, SVG for all visualizations

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

### Build from Source

#### Prerequisites
- Node.js 18+
- Python 3.12
- Conda (recommended)
- FFmpeg

#### Steps

1. **Clone the repository**
```bash
git clone git@github.com:TLtanium/meta-lingo-electron.git
cd meta-lingo-electron
```

2. **Create Conda environment**
```bash
conda create -n meta-lingo-electron python=3.12 -y
conda activate meta-lingo-electron
```

3. **Install dependencies**
```bash
# Backend
pip install -r requirements.txt

# Frontend
npm install
```

4. **Download ML models**

Place the following models in the `models/` directory:
- `whisper-large-v3-turbo`
- `yolov8`
- `clip-vit-large-patch14`
- `paraphrase-multilingual-MiniLM-L12-v2`
- SpaCy models (`en_core_web_lg`, `zh_core_web_lg`)

## Quick Start

### Development Mode

**One-click start (macOS):**
```bash
./start.sh
```

**Manual start:**

Terminal 1 - Backend:
```bash
conda activate meta-lingo-electron
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Terminal 2 - Frontend:
```bash
npm run dev
```

Access the application at: **http://localhost:5173**

### Build for Production

**macOS:**
```bash
./build.sh
```

**Windows:**
```cmd
build.bat
```

Output will be in the `release/` directory.

## Documentation

- **In-app Help**: Access via the Help module with bilingual documentation
- **API Documentation**: http://localhost:8000/docs (when backend is running)
- **Project Details**: See [PROJECT.md](PROJECT.md) for detailed technical documentation

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
| YOLOv8 | Object detection | Ultralytics |
| CLIP ViT-Large-Patch14 | Image classification | OpenAI |
| SpaCy en/zh_core_web_lg | NLP processing | Explosion |
| HiTZ DeBERTa | Metaphor detection | [HiTZ](https://huggingface.co/HiTZ/deberta-large-metaphor-detection-en) |
| IDRRP DeBERTa | Fine-tuned metaphor | [tommyleo2077](https://huggingface.co/tommyleo2077/deberta-v3-large-metaphor-in-dt-rb-rp) |
| Sentence-BERT | Text embeddings | sentence-transformers |

## Contributing

This project is currently maintained for academic research purposes. For bug reports or feature requests, please open an issue.

## Changelog

### v3.8.95 (2026-01-28)
- Syntax visualization support for audio/video transcripts
- Disable auto-annotation for audio/video transcripts (segment-based data complexity)
- Fix MIPVU data loading from segment-based format

### v3.8.94 (2026-01-28)
- Full annotation pipeline for audio/video transcripts (SpaCy + USAS + MIPVU)
- Progress display for upload and re-annotation stages

### v3.8.93 (2026-01-28)
- **Keyword Extraction**: Stopword filtering, corpus resource support (BNC/Brown/NOW/OANC), statistical thresholds
- New corpus resource service with pre-built frequency data

### v3.8.92 (2026-01-28)
- **Auto-annotation button**: MIPVU metaphor and Theme/Rheme auto-annotation
- Theme/Rheme analysis service based on SFL theory

### v3.8.91 (2026-01-28)
- Documentation: Metaphor analysis guide with MIPVU methodology
- Documentation: Collocation and semantic domain metaphor highlighting

### v3.8.89 (2026-01-25)
- **Custom wallpaper**: Upload, preview, transparency adjustment
- **Word frequency**: Stopword removal with NLTK support (20+ languages)

### v3.8.88 (2026-01-24)
- **USAS annotation modes**: Rule-based / Neural / Hybrid
- PyMUSAS-Neural-Multilingual-Base-BEM model integration

### v3.8.87 (2026-01-21)
- LDA/LSA/NMF CSV export with topic name column

### v3.8.86 (2026-01-18)
- **Topic naming**: Ollama LLM naming for LDA/LSA/NMF topics
- Custom label editing for all topic modeling methods

### v3.8.78
- Fix license display in packaged app
- Fix pyLDAvis slow loading (70s → few seconds)

### v3.8.77 (2026-01-11)
- Fix framework management: delete button, category colors, reset function

### v3.8.76
- Improve PNG export clarity (2x → 3x scale) for all D3 visualizations

### v3.8.74 (2026-01-10)
- Fix BERTopic hierarchy visualization (only showing one level)

### v3.8.73 (2026-01-10)
- Real-time regex validation in text editor

### v3.8.72 (2026-01-10)
- Fix large text upload progress and annotation issues

For detailed changelog, see [PROJECT.md](PROJECT.md).

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

#!/usr/bin/env python3
"""
云端算力版：语料构建脚本，PTB POS + lemma + USAS (neural n=1)。
- 全部相对路径：解压后在本目录运行即可。语料 ./corpus，输出 ./output，模型 ./PyMUSAS-Neural-Multilingual-Base-BEM。
- SpaCy 使用 en_core_web_lg（可选 GPU：需安装 spacy[cuda*] 后本脚本会尝试 prefer_gpu）；PyMUSAS 神经模型上 GPU。
- 收集文件时过滤 ._*、.DS_Store 等 macOS 系统文件。
Run: 解压后 cd 到本目录，conda activate <env> && python corpus_building.py
"""

from __future__ import annotations

import csv
import logging
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

# 全部相对路径：以脚本所在目录为根（解压后的云端算力目录）
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_BASE = SCRIPT_DIR / "output"
CORPUS_BASE = SCRIPT_DIR / "corpus"
NEURAL_MODEL_DIR = SCRIPT_DIR / "PyMUSAS-Neural-Multilingual-Base-BEM"

# 单卡 32GB 显存：限制批大小与单次 predict 词数，避免 OOM（BEM 长句会暴显存）
CHUNK_SIZE_CHARS = 120_000
SPACY_PIPE_BATCH_SIZE = 8
MAX_TOKENS_PER_PYMUSAS_CALL = 384  # 单句超过此数则分段再 predict，避免 40GB+ 分配

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("corpus_building")


def _skip_macos_system(path: Path) -> bool:
    """过滤 macOS 系统文件：._*、.DS_Store 等，避免误读或解析错误。"""
    name = path.name
    return name.startswith("._") or name == ".DS_Store" or (name.startswith(".") and name != "." and name != "..")


# ---------------------------------------------------------------------------
# Brown: file prefix -> genre (15 genres)
# Brown corpus: ca01-04=news, ca05-08=editorial, ca09-14=reviews, cb*=religion,
# cc*=hobbies, cd*=lore, ce*=belles_lettres, cf*=government, cg*=learned,
# ch*=romance, cj*=mystery, ck*=science_fiction, cl*=adventure, cm*=humor,
# cn/cp/cr*=fiction (generic).
# ---------------------------------------------------------------------------
def _brown_file_to_genre(filename: str) -> str | None:
    name = filename.lower().strip()
    if not re.match(r"c[a-z]\d{2}$", name):
        return None
    letter = name[1]
    num = int(name[2:])
    if letter == "a":
        if num <= 4:
            return "news"
        if num <= 8:
            return "editorial"
        if num <= 14:
            return "reviews"
        return "news"
    if letter == "b":
        return "religion"
    if letter == "c":
        return "hobbies"
    if letter == "d":
        return "lore"
    if letter == "e":
        return "belles_lettres"
    if letter == "f":
        return "government"
    if letter == "g":
        return "learned"
    if letter == "h":
        return "romance"
    if letter == "j":
        return "mystery"
    if letter == "k":
        return "science_fiction"
    if letter == "l":
        return "adventure"
    if letter == "m":
        return "humor"
    if letter in ("n", "p", "r"):
        return "fiction"
    return None


# ---------------------------------------------------------------------------
# BNC: domain letter (from path) -> category id
# ---------------------------------------------------------------------------
BNC_LETTER_TO_CAT = {
    "A": "applied_science",
    "B": "arts",
    "C": "belief_thought",
    "D": "world_affairs",
    "E": "commerce_finance",
    "F": "leisure",
    "G": "natural_science",  # education / science in BNC
    "H": "social_science",
    "J": "imaginative",
    "K": "imaginative",
}
BNC_SPOKEN_MARKER = "S"  # path contains S for spoken


def _bnc_xml_to_text(xml_path: Path) -> str:
    """Extract plain text from BNC XML (all w and c elements)."""
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        ns = {"bnc": "http://www.natcorp.ox.ac.uk/ns/"} if "{" in root.tag else {}
        words = []
        for w in root.iter():
            tag = w.tag.split("}")[-1] if "}" in w.tag else w.tag
            if tag in ("w", "c", "mw"):
                if w.text:
                    words.append(w.text)
                for c in w:
                    if c.text:
                        words.append(c.text)
                    if c.tail:
                        words.append(c.tail)
            elif w.text and tag not in ("s", "u", "stext", "bncDoc", "teiHeader"):
                words.append(w.text)
        return " ".join(words)
    except Exception as e:
        logger.warning("BNC XML parse %s: %s", xml_path, e)
        return ""


def _bnc_xml_root_tag(xml_path: Path) -> str | None:
    """Peek BNC XML root: 'stext' (口语) or 'wtext' (书面). 只读文件头，避免全量解析。"""
    try:
        with open(xml_path, "rb") as f:
            chunk = f.read(3000)
    except Exception:
        return None
    # 根元素多为 <stext> 或 <wtext>（可能有命名空间），在文件前部出现
    pos_stext = chunk.find(b"<stext")
    if pos_stext == -1:
        pos_stext = chunk.find(b"stext>")
    pos_wtext = chunk.find(b"<wtext")
    if pos_wtext == -1:
        pos_wtext = chunk.find(b"wtext>")
    if pos_stext != -1 and (pos_wtext == -1 or pos_stext < pos_wtext):
        return "stext"
    if pos_wtext != -1:
        return "wtext"
    return None


def _bnc_path_to_category(relative_path: str) -> str | None:
    """路径首字母 → 书面 9 领域。口语/书面 由 XML 根元素 stext/wtext 区分，不在此处。"""
    parts = Path(relative_path).parts
    if len(parts) < 2:
        return None
    first = parts[1].upper()
    return BNC_LETTER_TO_CAT.get(first)


# ---------------------------------------------------------------------------
# NOW: filename like 24-US.txt -> country US
# ---------------------------------------------------------------------------
NOW_COUNTRY_CODES = [
    "AU", "BD", "CA", "GB", "GH", "HK", "IE", "IN", "JM", "KE",
    "LK", "MY", "NG", "NZ", "PH", "PK", "SG", "TZ", "US", "ZA",
]
NOW_CODE_TO_NAME = {
    "AU": "Australia", "BD": "Bangladesh", "CA": "Canada", "GB": "UK",
    "GH": "Ghana", "HK": "HongKong", "IE": "Ireland", "IN": "India",
    "JM": "Jamaica", "KE": "Kenya", "LK": "SriLanka", "MY": "Malaysia",
    "NG": "Nigeria", "NZ": "NewZealand", "PH": "Philippines", "PK": "Pakistan",
    "SG": "Singapore", "TZ": "Tanzania", "US": "USA", "ZA": "SouthAfrica",
}


# ---------------------------------------------------------------------------
# Corpus config: id, name, output_dir, prefix, categories, total_merge_spec
# total_merge_spec: "all" | "spoken_written" | "nine_domains" (BNC 仅合并 9 领域) | None
# total_merge_categories: 可选，指定合并为 total 的类别列表（如 BNC 的 9 领域）
# ---------------------------------------------------------------------------
BNC_NINE_DOMAINS = [
    "applied_science", "arts", "belief_thought", "commerce_finance",
    "imaginative", "leisure", "natural_science", "social_science", "world_affairs",
]
CORPORA = [
    {
        "id": "bnc",
        "name": "British National Corpus 1994",
        "source_dir": "British National Corpus 1994",
        "out_dir": "bnc",
        "prefix": "bnc",
        "categories": [
            "applied_science", "arts", "belief_thought", "commerce_finance",
            "imaginative", "leisure", "natural_science", "social_science",
            "world_affairs", "spoken", "written", "total",
        ],
        "total_merge": "nine_domains",
        "total_merge_categories": BNC_NINE_DOMAINS,
    },
    {
        "id": "brown",
        "name": "Brown Corpus",
        "source_dir": "Brown Corpus",
        "out_dir": "brown",
        "prefix": "brown",
        "categories": [
            "adventure", "belles_lettres", "editorial", "fiction", "government",
            "hobbies", "humor", "learned", "lore", "mystery", "news", "religion",
            "reviews", "romance", "science_fiction", "imaginative", "informative", "total",
        ],
        "total_merge": "all",
    },
    {
        "id": "now",
        "name": "NOW",
        "source_dir": "NOW",
        "out_dir": "now",
        "prefix": "now",
        "categories": [*[NOW_CODE_TO_NAME[c] for c in NOW_COUNTRY_CODES], "total"],
        "total_merge": "all",
    },
    {
        "id": "oanc",
        "name": "OANC",
        "source_dir": "OANC",
        "out_dir": "oanc",
        "prefix": "oanc",
        "categories": [
            "journal", "letters", "fiction", "non_fiction", "travel_guides",
            "spoken", "face_to_face", "telephone", "government", "911report",
            "biomed", "plos", "written", "total",
        ],
        "total_merge": "all",
    },
    {
        "id": "coca",
        "name": "COCA",
        "source_dir": "COCA",
        "out_dir": "coca",
        "prefix": "coca",
        "categories": ["acad", "blog", "fic", "mag", "news", "spok", "tvm", "web", "total"],
        "total_merge": "all",
    },
    {
        "id": "coha",
        "name": "COHA",
        "source_dir": "COHA",
        "out_dir": "coha",
        "prefix": "coha",
        "categories": ["fic", "mag", "news", "nf", "total"],
        "total_merge": "all",
    },
    {
        "id": "glowbe",
        "name": "GloWbE",
        "source_dir": "GloWbE",
        "out_dir": "glowbe",
        "prefix": "glowbe",
        "categories": [*[NOW_CODE_TO_NAME[c] for c in NOW_COUNTRY_CODES], "total"],
        "total_merge": "all",
    },
    {
        "id": "coronavirus",
        "name": "Coronavirus",
        "source_dir": "Coronavirus",
        "out_dir": "coronavirus",
        "prefix": "coronavirus",
        "categories": ["total"],
        "total_merge": None,
    },
    {
        "id": "iweb",
        "name": "iWeb",
        "source_dir": "iWeb",
        "out_dir": "iweb",
        "prefix": "iweb",
        "categories": ["total"],
        "total_merge": None,
    },
    {
        "id": "movies",
        "name": "Movies",
        "source_dir": "Movies",
        "out_dir": "movies",
        "prefix": "movies",
        "categories": ["total"],
        "total_merge": None,
    },
    {
        "id": "soap",
        "name": "SOAP",
        "source_dir": "SOAP",
        "out_dir": "soap",
        "prefix": "soap",
        "categories": ["total"],
        "total_merge": None,
    },
    {
        "id": "tv",
        "name": "TV",
        "source_dir": "TV",
        "out_dir": "tv",
        "prefix": "tv",
        "categories": ["total"],
        "total_merge": None,
    },
    {
        "id": "wikipedia",
        "name": "Wikipedia",
        "source_dir": "Wikipedia",
        "out_dir": "wikipedia",
        "prefix": "wikipedia",
        "categories": ["total"],
        "total_merge": None,
    },
]


def collect_files(corpus_id: str, category_id: str, base: Path | None) -> list[Path]:
    """Return list of source files for this corpus + category. 自动过滤 ._* 等 macOS 系统文件。"""
    base = base or CORPUS_BASE
    cfg = next((c for c in CORPORA if c["id"] == corpus_id), None)
    if not cfg:
        return []
    src = base / cfg["source_dir"]
    if not src.exists():
        logger.warning("Source dir not found: %s", src)
        return []

    out: list[Path] = []

    if corpus_id == "bnc":
        texts_dir = src / "Texts"
        if not texts_dir.exists():
            pass
        elif category_id == "spoken":
            for xml_path in texts_dir.rglob("*.xml"):
                if _skip_macos_system(xml_path):
                    continue
                if _bnc_xml_root_tag(xml_path) == "stext":
                    out.append(xml_path)
        elif category_id == "written":
            for xml_path in texts_dir.rglob("*.xml"):
                if _skip_macos_system(xml_path):
                    continue
                if _bnc_xml_root_tag(xml_path) == "wtext":
                    out.append(xml_path)
        else:
            for xml_path in texts_dir.rglob("*.xml"):
                if _skip_macos_system(xml_path):
                    continue
                if _bnc_xml_root_tag(xml_path) != "wtext":
                    continue
                try:
                    rel = xml_path.relative_to(src)
                    cat = _bnc_path_to_category(str(rel))
                    if cat == category_id:
                        out.append(xml_path)
                except ValueError:
                    pass

    elif corpus_id == "brown":
        imaginative_genres = {"romance", "mystery", "science_fiction", "adventure", "humor", "fiction"}
        informative_genres = {"news", "editorial", "reviews", "religion", "hobbies", "lore", "belles_lettres", "government", "learned"}
        for f in src.iterdir():
            if not f.is_file() or _skip_macos_system(f) or f.name in ("CONTENTS", "README", "cats.txt"):
                continue
            genre = _brown_file_to_genre(f.name)
            if genre is None:
                continue
            if category_id == genre:
                out.append(f)
            elif category_id == "imaginative" and genre in imaginative_genres:
                out.append(f)
            elif category_id == "informative" and genre in informative_genres:
                out.append(f)

    elif corpus_id == "now":
        for sub in ("2010-2024",):
            d = src / sub
            if d.exists():
                for f in d.glob("*.txt"):
                    if _skip_macos_system(f):
                        continue
                    m = re.match(r"\d{2}-([A-Z]{2})\.txt", f.name)
                    if m and m.group(1) in NOW_CODE_TO_NAME and NOW_CODE_TO_NAME[m.group(1)] == category_id:
                        out.append(f)

    elif corpus_id == "oanc":
        data = src / "data"
        if not data.exists():
            return []
        # spoken: data/spoken/**; written_1/journal, written_1/letters, written_1/fiction;
        # written_2/non_fiction, written_2/travel_guides, written_2/technical/government, plos, biomed, 911report
        def _add(dir_path: Path, cat: str):
            if dir_path.exists() and cat == category_id:
                for f in dir_path.rglob("*.txt"):
                    if not _skip_macos_system(f):
                        out.append(f)
                for f in dir_path.rglob("*.xml"):
                    if not _skip_macos_system(f):
                        out.append(f)
        _add(data / "spoken", "spoken")
        _add(data / "spoken" / "face-to-face", "face_to_face")
        _add(data / "spoken" / "telephone", "telephone")
        _add(data / "written_1" / "journal", "journal")
        _add(data / "written_1" / "letters", "letters")
        _add(data / "written_1" / "fiction", "fiction")
        _add(data / "written_2" / "non-fiction", "non_fiction")
        _add(data / "written_2" / "travel_guides", "travel_guides")
        _add(data / "written_2" / "technical" / "government", "government")
        _add(data / "written_2" / "technical" / "911report", "911report")
        _add(data / "written_2" / "technical" / "biomed", "biomed")
        _add(data / "written_2" / "technical" / "plos", "plos")
        if category_id == "written":
            for d in (data / "written_1", data / "written_2"):
                if d.exists():
                    for f in d.rglob("*.txt"):
                        if not _skip_macos_system(f):
                            out.append(f)
                    for f in d.rglob("*.xml"):
                        if not _skip_macos_system(f):
                            out.append(f)

    elif corpus_id == "coca":
        # text_<genre>.txt
        if category_id != "total":
            f = src / f"text_{category_id}.txt"
            if f.exists():
                out.append(f)

    elif corpus_id == "coha":
        # fic_*.txt, mag_*.txt, news_*.txt, nf_*.txt
        if category_id != "total":
            for f in src.glob(f"{category_id}_*.txt"):
                out.append(f)

    elif corpus_id == "glowbe":
        # w_<cc>_b.txt, w_<cc>_g.txt per country
        if category_id != "total":
            name_to_code = {v: k for k, v in NOW_CODE_TO_NAME.items()}
            cc = name_to_code.get(category_id)
            if cc:
                for suf in ("b", "g"):
                    f = src / f"w_{cc.lower()}_{suf}.txt"
                    if f.exists():
                        out.append(f)

    else:
        if category_id == "total":
            for f in src.rglob("*.txt"):
                if not _skip_macos_system(f):
                    out.append(f)
    out = [p for p in out if not _skip_macos_system(p)]
    return sorted(set(out))


def read_file_text(path: Path, is_bnc_xml: bool = False) -> str:
    if is_bnc_xml:
        return _bnc_xml_to_text(path)
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        logger.warning("Read %s: %s", path, e)
        return ""


def _sentence_boundary(text: str, target_pos: int, chunk_size: int) -> int:
    """Find a split position near target_pos at sentence or word boundary."""
    n = len(text)
    if target_pos >= n - 100:
        return n
    window = max(1000, chunk_size // 5)
    lo = max(0, target_pos - window)
    hi = min(n, target_pos + window)
    best = target_pos
    for i in range(hi - 1, lo - 1, -1):
        if i > 0 and text[i] in ".!?" and (i + 1 >= n or text[i + 1] in " \t\n\r"):
            if abs(i + 1 - target_pos) < abs(best - target_pos):
                best = i + 1
            break
    if best == target_pos:
        for i in range(target_pos, min(n, target_pos + 500)):
            if text[i] in " \t\n\r":
                return i + 1
    return best


def chunk_text_local(text: str, chunk_size: int) -> list[tuple[int, int, str]]:
    """Split text into ~chunk_size chunks at sentence boundaries."""
    chunks = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            end = _sentence_boundary(text, end, chunk_size)
        chunks.append((start, end, text[start:end]))
        start = end
        if start >= n:
            break
    return chunks


def csv_has_usas_header(csv_path: Path) -> bool:
    if not csv_path.exists():
        return False
    try:
        with open(csv_path, "r", encoding="utf-8", newline="") as f:
            row = next(csv.reader(f))
            return "usas" in [c.strip().lower() for c in row]
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Standalone SpaCy + PyMUSAS neural (top_n=1). No backend dependency.
# ---------------------------------------------------------------------------
_nlp = None
_neural_model = None
_neural_tokenizer = None


def _get_nlp():
    """Lazy-load SpaCy en_core_web_lg；若已安装 spacy[cuda*] 会尝试使用 GPU。仅保留 tagger+lemmatizer，用 sentencizer 分句。"""
    global _nlp
    if _nlp is None:
        import spacy
        t0 = time.time()
        try:
            spacy.prefer_gpu()
            logger.info("[模型] SpaCy 将尝试使用 GPU（需已安装 spacy[cuda*]）")
        except Exception:
            pass
        _nlp = spacy.load("en_core_web_lg")
        if "sentencizer" not in _nlp.pipe_names:
            _nlp.add_pipe("sentencizer", first=True)
        _nlp.disable_pipes("parser", "ner")
        logger.info("[模型] SpaCy en_core_web_lg 加载完成（已关 parser/ner），耗时 %.2f 秒", time.time() - t0)
    return _nlp


def _get_neural():
    """Lazy-load PyMUSAS neural model (BEM) and tokenizer."""
    global _neural_model, _neural_tokenizer
    if _neural_model is not None:
        return _neural_model, _neural_tokenizer
    if not NEURAL_MODEL_DIR.is_dir() or not (NEURAL_MODEL_DIR / "config.json").exists():
        logger.error("[模型] PyMUSAS 神经模型未找到，路径: %s", NEURAL_MODEL_DIR)
        return None, None
    try:
        import torch
        from wsd_torch_models.bem import BEM
        from transformers import AutoTokenizer
        t0 = time.time()
        _neural_model = BEM.from_pretrained(str(NEURAL_MODEL_DIR))
        _neural_tokenizer = AutoTokenizer.from_pretrained(
            str(NEURAL_MODEL_DIR),
            add_prefix_space=True,
            fix_mistral_regex=True,
        )
        _neural_model.eval()
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        _neural_model.to(device=_device)
        logger.info("[模型] PyMUSAS 神经模型 (top_n=1) 加载完成，设备=%s，耗时 %.2f 秒", _device, time.time() - t0)
        return _neural_model, _neural_tokenizer
    except Exception as e:
        logger.exception("[模型] 加载 PyMUSAS 神经模型失败: %s", e)
        return None, None


def _doc_to_tokens_with_usas(doc, model, tokenizer) -> tuple[list[dict], float]:
    """对单个 SpaCy doc 做 PyMUSAS 预测，返回 (tokens_out, pymusas_s)。长句分段调用 predict 避免 OOM。"""
    import torch
    t0 = time.time()
    all_predictions = []
    max_tokens = MAX_TOKENS_PER_PYMUSAS_CALL
    for sent in doc.sents:
        sent_tokens = [t.text for t in sent]
        if not sent_tokens:
            continue
        if len(sent_tokens) <= max_tokens:
            with torch.inference_mode(mode=True):
                preds = model.predict(sent_tokens, sub_word_tokenizer=tokenizer, top_n=1)
            all_predictions.extend(preds)
        else:
            for start in range(0, len(sent_tokens), max_tokens):
                seg = sent_tokens[start : start + max_tokens]
                with torch.inference_mode(mode=True):
                    preds = model.predict(seg, sub_word_tokenizer=tokenizer, top_n=1)
                all_predictions.extend(preds)
    pymusas_s = time.time() - t0
    tokens_out = []
    for i, token in enumerate(doc):
        pred_tags = all_predictions[i] if i < len(all_predictions) else ["Z99"]
        usas_tag = pred_tags[0] if pred_tags else "Z99"
        tokens_out.append({
            "text": token.text,
            "lemma": token.lemma_,
            "tag": token.tag_,
            "usas_tag": usas_tag,
            "is_punct": token.is_punct,
            "is_space": token.is_space,
        })
    return tokens_out, pymusas_s


def annotate_chunk_neural(chunk_text: str) -> tuple[list[dict] | None, dict[str, float] | None]:
    """
    对一块文本做 SpaCy（PTB+词元）与 PyMUSAS 神经（USAS top_n=1）标注。
    返回 (token 列表, {"spacy_s": float, "pymusas_s": float})，失败时返回 (None, None)。
    """
    nlp = _get_nlp()
    model, tokenizer = _get_neural()
    if model is None or tokenizer is None:
        return None, None
    try:
        t0_spacy = time.time()
        doc = nlp(chunk_text)
        spacy_s = time.time() - t0_spacy
        tokens_out, pymusas_s = _doc_to_tokens_with_usas(doc, model, tokenizer)
        return tokens_out, {"spacy_s": spacy_s, "pymusas_s": pymusas_s}
    except Exception as e:
        logger.exception("[标注] 本块标注异常: %s", e)
        return None, None


def annotate_batch_neural(batch_texts: list[str]) -> list[tuple[list[dict] | None, dict[str, float] | None]]:
    """
    批量处理多块文本：SpaCy 用 nlp.pipe 一次跑完，再逐 doc 做 PyMUSAS。节省时间。
    返回与 batch_texts 等长的 [(tokens, timings), ...]，失败块为 (None, None)。
    """
    if not batch_texts:
        return []
    nlp = _get_nlp()
    model, tokenizer = _get_neural()
    if model is None or tokenizer is None:
        return [(None, None)] * len(batch_texts)
    try:
        t0_pipe = time.time()
        docs = list(nlp.pipe(batch_texts))
        spacy_batch_s = time.time() - t0_pipe
        spacy_per_chunk = spacy_batch_s / len(batch_texts) if batch_texts else 0
        results = []
        for doc in docs:
            tokens_out, pymusas_s = _doc_to_tokens_with_usas(doc, model, tokenizer)
            results.append((tokens_out, {"spacy_s": spacy_per_chunk, "pymusas_s": pymusas_s}))
        return results
    except Exception as e:
        logger.exception("[标注] 批量标注异常: %s", e)
        return [(None, None)] * len(batch_texts)


def _format_eta(seconds: float) -> str:
    """将秒数格式化为 时:分:秒 或 分:秒。"""
    if seconds < 0 or seconds >= 86400:
        return "预计中..."
    m, s = divmod(int(round(seconds)), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}小时{m}分{s}秒"
    if m > 0:
        return f"{m}分{s}秒"
    return f"{s}秒"


def run_category(
    corpus_id: str,
    category_id: str,
    base_src: Path,
    out_dir: Path,
    prefix: str,
    skip_if_has_usas: bool,
) -> bool:
    """处理一个类别：收集文件、分块、SpaCy + 神经 n=1 标注、汇总、写 CSV。"""
    output_csv = out_dir / f"{prefix}_{category_id}.csv"
    if skip_if_has_usas and csv_has_usas_header(output_csv):
        logger.info("[跳过] 该类别 CSV 已含 usas 列: %s", output_csv)
        return True

    files = collect_files(corpus_id, category_id, base_src)
    if not files:
        logger.warning("[收集] 未找到源文件: 语料=%s 类别=%s", corpus_id, category_id)
        return False

    if _get_neural()[0] is None:
        logger.error("[模型] PyMUSAS 神经模型不可用，请检查: %s", NEURAL_MODEL_DIR)
        return False

    # 预先统计总块数，用于 ETA
    total_chunks = 0
    file_chunk_counts = []
    for path in files:
        if corpus_id == "bnc":
            text = read_file_text(path, is_bnc_xml=True)
        else:
            text = read_file_text(path, is_bnc_xml=False)
        if text.strip():
            chunks = chunk_text_local(text, CHUNK_SIZE_CHARS)
            file_chunk_counts.append((path, len(chunks)))
            total_chunks += len(chunks)

    logger.info("[开始] 语料=%s 类别=%s 文件数=%d 总块数=%d（SpaCy lg + PyMUSAS 神经 n=1）", corpus_id, category_id, len(files), total_chunks)

    counts: dict[tuple[str, str, str, str], int] = defaultdict(int)
    total_tokens = 0
    t0 = time.time()
    is_bnc = corpus_id == "bnc"
    done_chunks = 0
    total_spacy_s = 0.0
    total_pymusas_s = 0.0

    for fi, path in enumerate(files):
        text = read_file_text(path, is_bnc_xml=is_bnc)
        if not text.strip():
            continue
        chunks = chunk_text_local(text, CHUNK_SIZE_CHARS)
        logger.info("[文件 %d/%d] %s 字符数=%d 本文件块数=%d", fi + 1, len(files), path.name, len(text), len(chunks))

        # 按批处理：SpaCy 用 nlp.pipe 一次处理多块，再逐块做 PyMUSAS
        batch_texts = []
        batch_indices = []  # (ci,) 在 chunks 中的下标
        for ci, (_, _, ctext) in enumerate(chunks):
            if not ctext.strip():
                continue
            batch_texts.append(ctext)
            batch_indices.append(ci)
            if len(batch_texts) >= SPACY_PIPE_BATCH_SIZE:
                t_batch_start = time.time()
                try:
                    batch_results = annotate_batch_neural(batch_texts)
                except Exception as e:
                    logger.exception("[标注] 本批异常: %s", e)
                    batch_results = [(None, None)] * len(batch_texts)
                t_batch_s = time.time() - t_batch_start
                for (tokens, timings), ci in zip(batch_results, batch_indices):
                    if tokens is None:
                        logger.warning("[标注] 第 %d/%d 块标注失败", done_chunks + 1, total_chunks)
                        done_chunks += 1
                        continue
                    spacy_s = timings.get("spacy_s", 0) if timings else 0
                    pymusas_s = timings.get("pymusas_s", 0) if timings else 0
                    total_spacy_s += spacy_s
                    total_pymusas_s += pymusas_s
                    done_chunks += 1
                    n_content = sum(1 for t in tokens if not t.get("is_punct") and not t.get("is_space"))
                    total_tokens += n_content
                    eta_s = (total_chunks - done_chunks) / (done_chunks / (time.time() - t0)) if done_chunks > 0 and total_chunks > done_chunks else None
                    eta_str = _format_eta(eta_s) if eta_s is not None else "预计中..."
                    logger.info(
                        "[块 %d/%d] 本块 (SpaCy≈%.2fs PyMUSAS=%.2fs) 词数=%d | 累计=%d | 预计剩余 %s",
                        done_chunks, total_chunks, spacy_s, pymusas_s, n_content, total_tokens, eta_str
                    )
                    for t in tokens:
                        if t.get("is_punct") or t.get("is_space"):
                            continue
                        key = (t.get("text", ""), t.get("lemma", ""), t.get("tag", ""), t.get("usas_tag", "") or "Z99")
                        counts[key] += 1
                logger.info("[批] 本批 %d 块共耗时 %.2fs", len(batch_texts), t_batch_s)
                batch_texts, batch_indices = [], []
        # 剩余不足一批的块
        if batch_texts:
            t_batch_start = time.time()
            try:
                batch_results = annotate_batch_neural(batch_texts)
            except Exception as e:
                logger.exception("[标注] 本批异常: %s", e)
                batch_results = [(None, None)] * len(batch_texts)
            t_batch_s = time.time() - t_batch_start
            for (tokens, timings), ci in zip(batch_results, batch_indices):
                if tokens is None:
                    done_chunks += 1
                    continue
                spacy_s = timings.get("spacy_s", 0) if timings else 0
                pymusas_s = timings.get("pymusas_s", 0) if timings else 0
                total_spacy_s += spacy_s
                total_pymusas_s += pymusas_s
                done_chunks += 1
                n_content = sum(1 for t in tokens if not t.get("is_punct") and not t.get("is_space"))
                total_tokens += n_content
                eta_s = (total_chunks - done_chunks) / (done_chunks / (time.time() - t0)) if done_chunks > 0 and total_chunks > done_chunks else None
                eta_str = _format_eta(eta_s) if eta_s is not None else "预计中..."
                logger.info(
                    "[块 %d/%d] 本块 (SpaCy≈%.2fs PyMUSAS=%.2fs) 词数=%d | 累计=%d | 预计剩余 %s",
                    done_chunks, total_chunks, spacy_s, pymusas_s, n_content, total_tokens, eta_str
                )
                for t in tokens:
                    if t.get("is_punct") or t.get("is_space"):
                        continue
                    key = (t.get("text", ""), t.get("lemma", ""), t.get("tag", ""), t.get("usas_tag", "") or "Z99")
                    counts[key] += 1
            logger.info("[批] 本批 %d 块共耗时 %.2fs", len(batch_texts), t_batch_s)

    elapsed = time.time() - t0
    logger.info(
        "[完成] 总词数=%d 总耗时=%.2fs (SpaCy 合计=%.2fs PyMUSAS 合计=%.2fs) 输出=%s",
        total_tokens, elapsed, total_spacy_s, total_pymusas_s, output_csv
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    rows = [({"word": w, "lemma": le, "pos": p, "usas": u, "freq": c}) for (w, le, p, u), c in counts.items()]
    rows.sort(key=lambda r: (-r["freq"], r["word"], r["lemma"], r["pos"], r["usas"]))

    with open(output_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["word", "lemma", "pos", "usas", "freq"])
        w.writeheader()
        w.writerows(rows)
    logger.info("[写入] CSV 已保存 %s 行数=%d", output_csv, len(rows))
    return True


def merge_total_csvs(
    corpus_id: str,
    out_dir: Path,
    prefix: str,
    category_ids: list[str],
) -> bool:
    """合并各类别 CSV 为 total（按 word,lemma,pos,usas 汇总 freq）。"""
    total_path = out_dir / f"{prefix}_total.csv"
    counts: dict[tuple[str, str, str, str], int] = defaultdict(int)
    for cid in category_ids:
        p = out_dir / f"{prefix}_{cid}.csv"
        if not p.exists():
            logger.warning("[合并] 缺少类别 CSV: %s", p)
            return False
        try:
            with open(p, "r", encoding="utf-8", newline="") as f:
                r = csv.DictReader(f)
                if "usas" not in (r.fieldnames or []):
                    logger.warning("[合并] CSV 无 usas 列: %s", p)
                    return False
                for row in r:
                    key = (row.get("word", ""), row.get("lemma", ""), row.get("pos", ""), row.get("usas", ""))
                    counts[key] += int(row.get("freq", 0) or 0)
        except Exception as e:
            logger.exception("[合并] 读取 %s 失败: %s", p, e)
            return False
    rows = [{"word": w, "lemma": le, "pos": p, "usas": u, "freq": c} for (w, le, p, u), c in counts.items()]
    rows.sort(key=lambda r: (-r["freq"], r["word"], r["lemma"], r["pos"], r["usas"]))
    with open(total_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["word", "lemma", "pos", "usas", "freq"])
        w.writeheader()
        w.writerows(rows)
    logger.info("[合并] total 已写入 %s 行数=%d", total_path, len(rows))
    return True


def main() -> None:
    if not CORPUS_BASE.exists():
        logger.error("[启动] 语料目录不存在: %s（请将语料放入 ./corpus）", CORPUS_BASE)
        sys.exit(1)

    print("语料库列表:")
    for i, c in enumerate(CORPORA, 1):
        print(f"  {i}. {c['name']} ({c['out_dir']}/)")
    try:
        idx = int(input("请选择语料库（输入序号）: ").strip())
        corpus = CORPORA[idx - 1]
    except (ValueError, IndexError):
        logger.error("[选择] 无效的语料库序号")
        sys.exit(1)

    corpus_id = corpus["id"]
    categories = corpus["categories"]
    out_dir = OUTPUT_BASE / corpus["out_dir"]

    print("类别列表:")
    print("  0. 跑完全部分类（挂机：按顺序跑完所有分类，已有 CSV 则跳过，最后合并 total）")
    for i, cat in enumerate(categories, 1):
        print(f"  {i}. {cat}")
    try:
        raw = input("请选择类别（输入序号）: ").strip()
        cidx = int(raw)
        if cidx == 0:
            category_id = "__run_all__"
        elif 1 <= cidx <= len(categories):
            category_id = categories[cidx - 1]
        else:
            raise IndexError("out of range")
    except (ValueError, IndexError):
        logger.error("[选择] 无效的类别序号")
        sys.exit(1)

    if category_id == "__run_all__":
        # 挂机模式：按顺序跑完所有分类，已有 CSV（且含 usas）则跳过，最后做 total 合并
        merge_spec = corpus.get("total_merge")
        to_run = [c for c in categories if c != "total"]
        for i, cat in enumerate(to_run, 1):
            csv_path = out_dir / f"{corpus['prefix']}_{cat}.csv"
            if csv_path.exists() and csv_has_usas_header(csv_path):
                logger.info("[挂机] 跳过（已有） %s %d/%d", cat, i, len(to_run))
                continue
            logger.info("[挂机] 开始 %s %d/%d", cat, i, len(to_run))
            run_category(
                corpus_id, cat, CORPUS_BASE, out_dir, corpus["prefix"],
                skip_if_has_usas=True,
            )
        if "total" in categories:
            if merge_spec is None:
                csv_path = out_dir / f"{corpus['prefix']}_total.csv"
                if csv_path.exists() and csv_has_usas_header(csv_path):
                    logger.info("[挂机] 跳过 total（已有）")
                else:
                    logger.info("[挂机] 开始 total")
                    run_category(
                        corpus_id, "total", CORPUS_BASE, out_dir, corpus["prefix"],
                        skip_if_has_usas=True,
                    )
            else:
                if merge_spec == "spoken_written":
                    to_merge = ["spoken", "written"]
                elif merge_spec == "nine_domains" and "total_merge_categories" in corpus:
                    to_merge = list(corpus["total_merge_categories"])
                else:
                    to_merge = [c for c in categories if c != "total"]
                to_merge = [c for c in to_merge if (out_dir / f"{corpus['prefix']}_{c}.csv").exists()]
                if not to_merge:
                    logger.warning("[挂机] 合并 total 跳过：无已存在的待合并 CSV")
                else:
                    logger.info("[挂机] 合并 total：%s", to_merge)
                    merge_total_csvs(corpus_id, out_dir, corpus["prefix"], to_merge)
        logger.info("[挂机] 本语料库全部完成")
        sys.exit(0)

    if category_id == "total":
        merge_spec = corpus.get("total_merge")
        if merge_spec is None:
            ok = run_category(
                corpus_id,
                "total",
                CORPUS_BASE,
                out_dir,
                corpus["prefix"],
                skip_if_has_usas=True,
            )
            sys.exit(0 if ok else 1)
        if merge_spec == "spoken_written":
            to_merge = [c for c in ["spoken", "written"] if (out_dir / f"{corpus['prefix']}_{c}.csv").exists()]
        elif merge_spec == "nine_domains" and "total_merge_categories" in corpus:
            to_merge = [c for c in corpus["total_merge_categories"] if (out_dir / f"{corpus['prefix']}_{c}.csv").exists()]
        else:
            to_merge = [c for c in categories if c != "total"]
        if not to_merge:
            logger.error("[合并] 缺少 CSV，无法生成 total")
            sys.exit(1)
        ok = merge_total_csvs(corpus_id, out_dir, corpus["prefix"], to_merge)
        sys.exit(0 if ok else 1)
    else:
        ok = run_category(
            corpus_id,
            category_id,
            CORPUS_BASE,
            out_dir,
            corpus["prefix"],
            skip_if_has_usas=True,
        )
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

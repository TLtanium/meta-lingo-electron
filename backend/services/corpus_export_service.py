"""
Corpus Export Service

Naming / packaging rules
------------------------
TXT  (always zip):
    metalingo_<corpus>.zip
    └── <text_stem>/
        ├── universal_pos.txt
        ├── penn_pos.txt
        └── ...

JSON / XML – single text:
    metalingo_<text_stem>.json  (or .xml)   → raw bytes, no zip

JSON / XML – multiple texts:
    metalingo_<corpus>.zip
    └── <text_stem>/
        └── <text_stem>.json  (or .xml)
"""

import io
import json
import re
import zipfile
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET
from xml.dom import minidom

logger = logging.getLogger(__name__)

PREFIX = "metalingo_"

ANNOTATION_TYPES = {
    "universal_pos": {"label": "Universal POS"},
    "penn_pos":      {"label": "Penn POS"},
    "lemma":         {"label": "Lemma"},
    "dep":           {"label": "Dependency"},
    "usas":          {"label": "USAS"},
    "mipvu":         {"label": "MIPVU Metaphor"},
}


def _safe_stem(filename: str) -> str:
    """Return a filesystem-safe folder/stem name from a raw filename."""
    stem = Path(filename).stem
    # Replace characters that are problematic in zip paths
    stem = re.sub(r'[^\w\-. ]', '_', stem)
    return stem or "text"


class CorpusExportService:
    """Export annotated corpus texts in txt / json / xml format."""

    # ================================================================ #
    #  Public entry point
    # ================================================================ #

    def export_texts(
        self,
        texts: List[Dict[str, Any]],
        annotation_types: List[str],
        fmt: str = "txt",
        corpus_name: str = "corpus",
    ) -> tuple[bytes, str, str]:
        """
        Build the export payload.

        Returns:
            (file_bytes, filename, media_type)
        """
        if fmt == "json":
            return self._export_json(texts, corpus_name)
        if fmt == "xml":
            return self._export_xml(texts, corpus_name)
        return self._export_txt(texts, annotation_types, corpus_name)

    # ================================================================ #
    #  TXT – always a zip, one folder per text
    # ================================================================ #

    def _export_txt(
        self,
        texts: List[Dict[str, Any]],
        annotation_types: List[str],
        corpus_name: str,
    ) -> tuple[bytes, str, str]:
        if not annotation_types:
            annotation_types = list(ANNOTATION_TYPES.keys())

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for text in texts:
                tokens = self._load_tokens(text)
                if not tokens:
                    continue
                all_token_rows = [tokens]
                folder = _safe_stem(text.get("filename", "text"))

                for ann_type in annotation_types:
                    if ann_type not in ANNOTATION_TYPES:
                        continue
                    content = self._build_txt_content(all_token_rows, ann_type)
                    zf.writestr(f"{folder}/{ann_type}.txt", content)

        safe_corpus = re.sub(r'[^\w\-. ]', '_', corpus_name)
        filename   = f"{PREFIX}{safe_corpus}.zip"
        return buf.getvalue(), filename, "application/zip"

    # ================================================================ #
    #  JSON
    # ================================================================ #

    def _export_json(
        self,
        texts: List[Dict[str, Any]],
        corpus_name: str,
    ) -> tuple[bytes, str, str]:
        if len(texts) == 1:
            # Single text → single JSON file
            record    = self._build_text_record(texts[0])
            raw_bytes = json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8")
            stem      = _safe_stem(texts[0].get("filename", "text"))
            filename  = f"{PREFIX}{stem}.json"
            return raw_bytes, filename, "application/json"

        # Multiple texts → zip, one folder per text
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for text in texts:
                record    = self._build_text_record(text)
                content   = json.dumps(record, ensure_ascii=False, indent=2)
                stem      = _safe_stem(text.get("filename", "text"))
                zf.writestr(f"{stem}/{stem}.json", content)

        safe_corpus = re.sub(r'[^\w\-. ]', '_', corpus_name)
        filename    = f"{PREFIX}{safe_corpus}.zip"
        return buf.getvalue(), filename, "application/zip"

    # ================================================================ #
    #  XML
    # ================================================================ #

    def _export_xml(
        self,
        texts: List[Dict[str, Any]],
        corpus_name: str,
    ) -> tuple[bytes, str, str]:
        if len(texts) == 1:
            # Single text → single XML file
            record    = self._build_text_record(texts[0])
            xml_bytes = self._record_to_xml_bytes(record, root_tag="text")
            stem      = _safe_stem(texts[0].get("filename", "text"))
            filename  = f"{PREFIX}{stem}.xml"
            return xml_bytes, filename, "application/xml"

        # Multiple texts → zip, one folder per text
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for text in texts:
                record  = self._build_text_record(text)
                content = self._record_to_xml_bytes(record, root_tag="text").decode("utf-8")
                stem    = _safe_stem(text.get("filename", "text"))
                zf.writestr(f"{stem}/{stem}.xml", content)

        safe_corpus = re.sub(r'[^\w\-. ]', '_', corpus_name)
        filename    = f"{PREFIX}{safe_corpus}.zip"
        return buf.getvalue(), filename, "application/zip"

    # ================================================================ #
    #  Shared annotation record builder
    # ================================================================ #

    def _build_text_record(self, text: Dict[str, Any]) -> Dict[str, Any]:
        tokens     = self._load_tokens(text)
        sentences  = self._split_into_sentences(tokens) if tokens else []

        sentence_records = []
        for sent_toks in sentences:
            sent_text = " ".join(
                t.get("text", "") for t in sent_toks if t.get("text", "").strip()
            )
            token_records = [
                self._build_token_record(t)
                for t in sent_toks
                if t.get("text", "").strip()
            ]
            sentence_records.append({"text": sent_text, "tokens": token_records})

        raw_meta     = text.get("metadata") or {}
        custom_fields = raw_meta.get("customFields") or raw_meta.get("custom_fields") or {}

        return {
            "id":                text.get("id", ""),
            "filename":          text.get("filename", ""),
            "original_filename": text.get("original_filename", ""),
            "media_type":        text.get("media_type", "text"),
            "word_count":        text.get("word_count") or 0,
            "duration":          text.get("duration"),
            "tags":              text.get("tags") or [],
            "metadata": {
                "author":     raw_meta.get("author", ""),
                "date":       raw_meta.get("date", ""),
                "source":     raw_meta.get("source", ""),
                "text_type":  custom_fields.get("textType", ""),
                "language":   raw_meta.get("language", ""),
                "custom_fields": {
                    k: v for k, v in custom_fields.items() if k != "textType"
                },
            },
            "annotations": {
                "sentence_count": len(sentence_records),
                "token_count":    sum(len(s["tokens"]) for s in sentence_records),
                "sentences":      sentence_records,
            },
        }

    @staticmethod
    def _build_token_record(tok: Dict[str, Any]) -> Dict[str, Any]:
        record: Dict[str, Any] = {
            "text":  tok.get("text", ""),
            "start": tok.get("start"),
            "end":   tok.get("end"),
            "lemma": tok.get("lemma", ""),
            "pos":   tok.get("pos", ""),
            "tag":   tok.get("tag", ""),
            "dep":   tok.get("dep", ""),
            "morph": tok.get("morph", ""),
        }
        if "usas_tag" in tok:
            record["usas_tag"]  = tok["usas_tag"]
            record["usas_tags"] = tok.get("usas_tags", [])
            record["is_mwe"]    = tok.get("is_mwe", False)
        if "is_metaphor" in tok:
            record["is_metaphor"]         = tok["is_metaphor"]
            record["metaphor_confidence"] = tok.get("metaphor_confidence", 0.0)
        return record

    # ================================================================ #
    #  XML helpers
    # ================================================================ #

    @staticmethod
    def _record_to_xml_bytes(record: Dict[str, Any], root_tag: str = "text") -> bytes:
        root_el = CorpusExportService._dict_to_xml(root_tag, record)
        raw     = ET.tostring(root_el, encoding="unicode")
        pretty  = minidom.parseString(raw).toprettyxml(indent="  ")
        lines   = pretty.split("\n")
        if lines[0].startswith("<?xml"):
            lines = lines[1:]
        xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + "\n".join(lines)
        return xml_str.encode("utf-8")

    @staticmethod
    def _dict_to_xml(tag: str, data: Any) -> ET.Element:
        safe_tag = re.sub(r'[^\w]', '_', str(tag)) or "item"
        # XML tags cannot start with a digit
        if safe_tag[0].isdigit():
            safe_tag = "_" + safe_tag
        el = ET.Element(safe_tag)

        if isinstance(data, dict):
            for key, val in data.items():
                el.append(CorpusExportService._dict_to_xml(key, val))
        elif isinstance(data, list):
            for item in data:
                el.append(CorpusExportService._dict_to_xml("item", item))
        elif data is None:
            el.text = ""
        else:
            el.text = str(data)

        return el

    # ================================================================ #
    #  Token loading helpers
    # ================================================================ #

    def _load_tokens(self, text: Dict[str, Any]) -> List[Dict[str, Any]]:
        media_type          = text.get("media_type", "text")
        content_path        = text.get("content_path")
        transcript_json_path = text.get("transcript_json_path")

        if media_type in ("audio", "video") and transcript_json_path:
            return self._load_from_transcript(transcript_json_path)
        if content_path:
            return self._load_from_sidecar_files(content_path)
        return []

    def _load_from_transcript(self, transcript_json_path: str) -> List[Dict[str, Any]]:
        path = Path(transcript_json_path)
        if not path.exists():
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load transcript: {e}")
            return []

        spacy_anns = data.get("spacy_annotations")
        usas_anns  = data.get("usas_annotations")
        mipvu_anns = data.get("mipvu_annotations")

        tokens: List[Dict] = []
        if spacy_anns and "segments" in spacy_anns:
            for seg in spacy_anns["segments"]:
                tokens.extend(seg.get("tokens", []))
        elif isinstance(spacy_anns, list):
            for seg in spacy_anns:
                tokens.extend(seg.get("tokens", []))

        if usas_anns:
            usas_tokens: List[Dict] = []
            if "segments" in usas_anns:
                for seg in usas_anns["segments"]:
                    usas_tokens.extend(seg.get("tokens", []))
            elif isinstance(usas_anns, list):
                for seg in usas_anns:
                    usas_tokens.extend(seg.get("tokens", []))
            tokens = self._merge_usas(tokens, usas_tokens)

        if mipvu_anns:
            mipvu_tokens: List[Dict] = (
                mipvu_anns if isinstance(mipvu_anns, list)
                else mipvu_anns.get("tokens", [])
            )
            tokens = self._merge_mipvu(tokens, mipvu_tokens)

        return tokens

    def _load_from_sidecar_files(self, content_path: str) -> List[Dict[str, Any]]:
        cp     = Path(content_path)
        stem   = cp.stem
        parent = cp.parent

        spacy_path = parent / f"{stem}.spacy.json"
        usas_path  = parent / f"{stem}.usas.json"
        mipvu_path = parent / f"{stem}.mipvu.json"

        if usas_path.exists():
            tokens = self._load_json_tokens(usas_path)
        elif spacy_path.exists():
            tokens = self._load_json_tokens(spacy_path)
        else:
            logger.warning(f"No annotation files found for: {content_path}")
            return []

        if mipvu_path.exists():
            tokens = self._merge_mipvu(tokens, self._load_json_tokens(mipvu_path, list_ok=True))

        return tokens

    def _load_json_tokens(self, path: Path, list_ok: bool = False) -> List[Dict[str, Any]]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if list_ok and isinstance(data, list):
                return data
            return data.get("tokens", [])
        except Exception as e:
            logger.warning(f"Failed to load {path}: {e}")
            return []

    # ------------------------------------------------------------------ #
    #  Merge helpers
    # ------------------------------------------------------------------ #

    def _merge_usas(self, spacy_tokens: List[Dict], usas_tokens: List[Dict]) -> List[Dict]:
        if not usas_tokens:
            return spacy_tokens
        usas_map = {t["start"]: t for t in usas_tokens if "start" in t}
        return [
            {**tok,
             "usas_tag":  usas_map.get(tok.get("start"), {}).get("usas_tag", "Z99"),
             "usas_tags": usas_map.get(tok.get("start"), {}).get("usas_tags", []),
             "is_mwe":    usas_map.get(tok.get("start"), {}).get("is_mwe", False)}
            for tok in spacy_tokens
        ]

    def _merge_mipvu(self, tokens: List[Dict], mipvu_tokens: List[Dict]) -> List[Dict]:
        if not mipvu_tokens:
            return tokens
        mipvu_map = {t["start"]: t for t in mipvu_tokens if "start" in t}
        return [
            {**tok,
             "is_metaphor":         mipvu_map.get(tok.get("start"), {}).get("is_metaphor", False),
             "metaphor_confidence": mipvu_map.get(tok.get("start"), {}).get("metaphor_confidence", 0.0)}
            for tok in tokens
        ]

    # ================================================================ #
    #  TXT helpers
    # ================================================================ #

    def _build_txt_content(
        self,
        all_token_rows: List[List[Dict[str, Any]]],
        ann_type: str,
    ) -> str:
        lines: List[str] = []
        for token_rows in all_token_rows:
            for sent_toks in self._split_into_sentences(token_rows):
                tagged = [self._tag_token(t, ann_type) for t in sent_toks]
                tagged = [t for t in tagged if t]
                if tagged:
                    lines.append(" ".join(tagged))
            lines.append("")
        while lines and lines[-1] == "":
            lines.pop()
        return "\n".join(lines) + "\n"

    def _split_into_sentences(self, tokens: List[Dict]) -> List[List[Dict]]:
        if not tokens:
            return []
        sentences: List[List[Dict]] = []
        current: List[Dict] = []
        for tok in tokens:
            if tok.get("sent_start") and current:
                sentences.append(current)
                current = []
            current.append(tok)
        if current:
            sentences.append(current)
        return sentences if sentences else [tokens]

    def _tag_token(self, tok: Dict[str, Any], ann_type: str) -> Optional[str]:
        text = tok.get("text", "")
        if not text or not text.strip():
            return None
        if ann_type == "universal_pos":
            return f"{text}_{tok.get('pos', 'X') or 'X'}"
        if ann_type == "penn_pos":
            return f"{text}_{tok.get('tag', 'X') or 'X'}"
        if ann_type == "lemma":
            return f"{text}_{tok.get('lemma', text) or text}"
        if ann_type == "dep":
            return f"{text}_{tok.get('dep', 'dep') or 'dep'}"
        if ann_type == "usas":
            primary    = tok.get("usas_tag", "Z99") or "Z99"
            candidates = tok.get("usas_tags", [])
            if len(candidates) > 1 and candidates[1] != primary:
                return f"{text}_{primary}_{candidates[1]}"
            return f"{text}_{primary}"
        if ann_type == "mipvu":
            return f"{text}_{'MET' if tok.get('is_metaphor') else 'LIT'}"
        return None

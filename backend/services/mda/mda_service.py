"""
Multidimensional Analysis (MDA) service.

Computes Biber (1988) dimension scores for corpus texts directly from stored
SpaCy annotations (PTB tags), following the MAT v1.3.2 pipeline:

    SpaCy tokens → Biber feature tagging → frequencies per 100 tokens
    → z-scores against Biber's norms → dimension scores
    → closest genre (per dimension) and closest text type (Biber 1989)

Because everything is rule-based over already-stored annotations, a full
corpus is analyzed in one pass with no model inference.
"""

import json
import logging
import math
from collections import Counter
from typing import Any, Dict, List, Optional

from models.database import TextDB
from services.corpus_path_utils import resolve_stored_path
from services.mda.biber_tagger import Tok, tag_tokens
from services.mda.biber_norms import (
    BIBER_FEATURES,
    BIBER_MEANS,
    BIBER_SDS,
    DIMENSION_FEATURES,
    EXCLUDED_COUNT_TAGS,
    FEATURE_INFO,
    GENRES,
    GENRE_DIMENSION_STATS,
    TEXT_TYPES,
)

logger = logging.getLogger(__name__)

TAG_FEATURES = [f for f in BIBER_FEATURES if f not in ("AWL", "TTR")]


class MDAService:
    """Biber multidimensional analysis over stored SpaCy annotations."""

    def analyze(
        self,
        corpus_id: str,
        text_ids: List[str] | str = "all",
        ttr_tokens: int = 400,
        z_correction: bool = False,
        excluded_features: Optional[List[str]] = None,
        top_words: int = 20,
    ) -> Dict[str, Any]:
        try:
            if text_ids == "all":
                texts = TextDB.list_by_corpus(corpus_id)
            else:
                texts = [TextDB.get_by_id(tid) for tid in text_ids if TextDB.get_by_id(tid)]
            if not texts:
                return {"success": False, "error": "No texts found in corpus"}

            excluded = set(excluded_features or [])
            text_results: List[Dict[str, Any]] = []
            feature_words: Dict[str, Counter] = {f: Counter() for f in TAG_FEATURES}
            # Word-form (lowercased) -> lemma, accumulated across all texts so
            # top_words can carry a lemma for cross-module lemma-based linking
            # (collocation/word sketch/etc. — see WordActionMenu wordLemma prop).
            word_lemmas: Dict[str, str] = {}
            skipped: List[str] = []

            for text in texts:
                tagged = self._load_and_tag(text)
                if tagged is None:
                    skipped.append(text.get("filename") or text.get("id") or "?")
                    continue
                stats = self._text_statistics(tagged, ttr_tokens, feature_words, word_lemmas)
                if stats["tokens"] == 0:
                    skipped.append(text.get("filename") or text.get("id") or "?")
                    continue
                zscores = self._zscores(stats, ttr_tokens)
                dims = self._dimensions(zscores, z_correction, excluded)
                text_results.append({
                    "text_id": text.get("id"),
                    "filename": text.get("filename") or text.get("id"),
                    "tokens": stats["tokens"],
                    "awl": round(stats["awl"], 2),
                    "ttr": stats["ttr"],
                    "normalized": {f: round(stats["normalized"].get(f, 0.0), 4) for f in TAG_FEATURES},
                    "counts": {f: stats["counts"].get(f, 0) for f in TAG_FEATURES},
                    "zscores": {f: round(z, 2) for f, z in zscores.items()},
                    "dimensions": {str(d): round(v, 2) for d, v in dims.items()},
                    "closest_text_type": self._closest_text_type(dims),
                })

            if not text_results:
                return {
                    "success": False,
                    "error": "No SpaCy annotations found for the selected texts",
                    "skipped_texts": skipped,
                }

            corpus_summary = self._corpus_summary(text_results)
            features = self._feature_summary(text_results, feature_words, top_words, word_lemmas)

            return {
                "success": True,
                "texts": text_results,
                "corpus": corpus_summary,
                "features": features,
                "skipped_texts": skipped,
                "params": {
                    "ttr_tokens": ttr_tokens,
                    "z_correction": z_correction,
                    "excluded_features": sorted(excluded),
                },
            }
        except Exception as e:
            logger.exception("MDA analysis error")
            return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # Annotation loading
    # ------------------------------------------------------------------

    def _load_and_tag(self, text: Dict[str, Any]) -> Optional[List[Tok]]:
        """Load SpaCy annotation for a text and run the Biber tagger."""
        data = self._load_spacy_annotation(text)
        if not data:
            return None
        if "tokens" in data:
            return tag_tokens(data["tokens"])
        if "segments" in data:
            tagged: List[Tok] = []
            seg_keys = sorted(
                data["segments"].keys(),
                key=lambda k: (int(k) if str(k).isdigit() else 999999, str(k)),
            )
            for seg_id in seg_keys:
                seg = data["segments"][seg_id]
                if isinstance(seg, dict) and "tokens" in seg:
                    tagged.extend(tag_tokens(seg["tokens"]))
            return tagged
        return None

    def _load_spacy_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        media_type = text.get("media_type", "text")
        if media_type in ("audio", "video"):
            tjp = resolve_stored_path(text.get("transcript_json_path"))
            if tjp and tjp.is_file():
                try:
                    with open(tjp, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if "spacy_annotations" in data:
                        return data["spacy_annotations"]
                except Exception as e:
                    logger.warning(f"MDA: failed to load transcript SpaCy: {e}")
        content_path = resolve_stored_path(text.get("content_path"))
        if not content_path:
            return None
        spacy_path = content_path.parent / f"{content_path.stem}.spacy.json"
        if spacy_path.exists():
            try:
                with open(spacy_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"MDA: failed to load SpaCy annotation: {e}")
        return None

    # ------------------------------------------------------------------
    # Counting (mirrors MAT count_only.pl, "Biber tags only" mode)
    # ------------------------------------------------------------------

    def _text_statistics(
        self,
        tagged: List[Tok],
        ttr_tokens: int,
        feature_words: Dict[str, Counter],
        word_lemmas: Dict[str, str],
    ) -> Dict[str, Any]:
        counts: Counter = Counter()
        token_count = 0
        total_chars = 0
        word_forms: List[str] = []

        for t in tagged:
            is_punct = t.is_punct or (bool(t.tag) and not t.tag[:1].isalnum())
            if not is_punct and t.tag != "POS":
                token_count += 1
                total_chars += len(t.w)
                word_forms.append(t.lw)
                if t.tag not in EXCLUDED_COUNT_TAGS:
                    counts[t.tag] += 1
                    if t.tag in feature_words:
                        feature_words[t.tag][t.lw] += 1
                        word_lemmas.setdefault(t.lw, t.lemma)
            for extra in t.extra:
                key = f"[{extra}]"
                counts[key] += 1
                if key in feature_words:
                    feature_words[key][t.lw] += 1
                    word_lemmas.setdefault(t.lw, t.lemma)

        # Type-token ratio over the first ttr_tokens word tokens
        ttr_types = len(set(word_forms[:ttr_tokens])) if word_forms else 0

        normalized = {
            f: (counts.get(f, 0) / token_count * 100.0) if token_count else 0.0
            for f in TAG_FEATURES
        }
        return {
            "tokens": token_count,
            "awl": (total_chars / token_count) if token_count else 0.0,
            "ttr": ttr_types,
            "counts": {f: counts.get(f, 0) for f in TAG_FEATURES},
            "normalized": normalized,
        }

    # ------------------------------------------------------------------
    # Scores
    # ------------------------------------------------------------------

    def _zscores(self, stats: Dict[str, Any], ttr_tokens: int) -> Dict[str, float]:
        z: Dict[str, float] = {}
        z["AWL"] = (stats["awl"] - BIBER_MEANS["AWL"]) / BIBER_SDS["AWL"]
        if ttr_tokens == 400 and stats["tokens"] >= 400:
            z["TTR"] = (stats["ttr"] / 4.0 - BIBER_MEANS["TTR"]) / BIBER_SDS["TTR"]
        else:
            # Not comparable with Biber's 400-token TTR baseline
            z["TTR"] = 0.0
        for f in TAG_FEATURES:
            z[f] = (stats["normalized"][f] - BIBER_MEANS[f]) / BIBER_SDS[f]
        return z

    def _dimensions(
        self,
        zscores: Dict[str, float],
        z_correction: bool,
        excluded: set,
    ) -> Dict[int, float]:
        def zval(feature: str) -> float:
            if feature in excluded:
                return 0.0
            v = zscores.get(feature, 0.0)
            if z_correction:
                v = max(-5.0, min(5.0, v))
            return v

        dims: Dict[int, float] = {}
        for d, loadings in DIMENSION_FEATURES.items():
            dims[d] = sum(sign * zval(f) for f, sign in loadings.items())
        return dims

    def _closest_text_type(self, dims: Dict[int, float]) -> str:
        best_type, best_dist = "", math.inf
        vec = [dims.get(d, 0.0) for d in (1, 2, 3, 4, 5)]
        for name, centroid in TEXT_TYPES.items():
            dist = math.sqrt(sum((v - c) ** 2 for v, c in zip(vec, centroid)))
            if dist < best_dist:
                best_type, best_dist = name, dist
        return best_type

    # ------------------------------------------------------------------
    # Aggregation
    # ------------------------------------------------------------------

    def _corpus_summary(self, text_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        n = len(text_results)
        dims_mean = {
            str(d): round(sum(t["dimensions"][str(d)] for t in text_results) / n, 2)
            for d in DIMENSION_FEATURES
        }
        z_mean = {
            f: round(sum(t["zscores"].get(f, 0.0) for t in text_results) / n, 2)
            for f in BIBER_FEATURES
        }
        closest_genres = {}
        for d in DIMENSION_FEATURES:
            score = float(dims_mean[str(d)])
            stats = GENRE_DIMENSION_STATS[d]
            best_i = min(range(len(GENRES)), key=lambda i: abs(score - stats[i][0]))
            closest_genres[str(d)] = GENRES[best_i]

        dims_float = {d: float(dims_mean[str(d)]) for d in DIMENSION_FEATURES}
        overused = [f for f in BIBER_FEATURES if z_mean[f] > 2]
        underused = [f for f in BIBER_FEATURES if z_mean[f] < -2]

        return {
            "text_count": n,
            "total_tokens": sum(t["tokens"] for t in text_results),
            "awl": round(sum(t["awl"] for t in text_results) / n, 2),
            "ttr": round(sum(t["ttr"] for t in text_results) / n, 2),
            "dimensions": dims_mean,
            "dimension_ranges": {
                str(d): [
                    round(min(t["dimensions"][str(d)] for t in text_results), 2),
                    round(max(t["dimensions"][str(d)] for t in text_results), 2),
                ]
                for d in DIMENSION_FEATURES
            },
            "zscores": z_mean,
            "closest_text_type": self._closest_text_type(dims_float),
            "closest_genres": closest_genres,
            "overused_features": overused,
            "underused_features": underused,
        }

    def _feature_summary(
        self,
        text_results: List[Dict[str, Any]],
        feature_words: Dict[str, Counter],
        top_words: int,
        word_lemmas: Dict[str, str],
    ) -> List[Dict[str, Any]]:
        n = len(text_results)
        features: List[Dict[str, Any]] = []

        # Which dimension (and sign) each feature loads on
        loading_map: Dict[str, Dict[str, int]] = {}
        for d, loadings in DIMENSION_FEATURES.items():
            for f, sign in loadings.items():
                loading_map[f] = {"dimension": d, "sign": sign}

        for f in BIBER_FEATURES:
            info = FEATURE_INFO.get(f, {})
            if f == "AWL":
                values = [t["awl"] for t in text_results]
                raw_total = None
            elif f == "TTR":
                values = [float(t["ttr"]) for t in text_results]
                raw_total = None
            else:
                values = [t["normalized"][f] for t in text_results]
                raw_total = sum(t["counts"][f] for t in text_results)
            mean_v = sum(values) / n
            sd_v = math.sqrt(sum((v - mean_v) ** 2 for v in values) / n) if n > 1 else 0.0
            z_mean = sum(t["zscores"].get(f, 0.0) for t in text_results) / n
            entry: Dict[str, Any] = {
                "code": f,
                "name_en": info.get("en", f),
                "name_zh": info.get("zh", f),
                "raw_total": raw_total,
                "mean": round(mean_v, 4),
                "sd": round(sd_v, 4),
                "biber_mean": BIBER_MEANS.get(f),
                "biber_sd": BIBER_SDS.get(f),
                "zscore": round(z_mean, 2),
                "loading": loading_map.get(f),
            }
            if f in feature_words and feature_words[f]:
                entry["top_words"] = [
                    {"word": wd, "count": c, "lemma": word_lemmas.get(wd, wd)}
                    for wd, c in feature_words[f].most_common(top_words)
                ]
            features.append(entry)
        return features


_mda_service: Optional[MDAService] = None


def get_mda_service() -> MDAService:
    global _mda_service
    if _mda_service is None:
        _mda_service = MDAService()
    return _mda_service

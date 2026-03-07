"""
Sentiment analysis service using NRC emotion annotations.
Aggregates NRC token-level scores by polarity (positive/negative/neutral) or
by dimension (anger, anticipation, disgust, fear, joy, sadness, surprise, trust, others).
"""

import os
import re
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

from models.database import TextDB

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.usas.domain_config import get_domain_description

logger = logging.getLogger(__name__)

# Eight emotion dimensions (excluding positive/negative for dimension mode)
NRC_DIMENSIONS = [
    "anger", "anticipation", "disgust", "fear", "joy",
    "sadness", "surprise", "trust"
]


class SentimentAnalysisService:
    """Aggregates NRC annotations into polarity or dimension statistics."""

    def analyze(
        self,
        corpus_id: str,
        text_ids: List[str] | str = "all",
        pos_filter: Optional[Dict[str, Any]] = None,
        search_config: Optional[Dict[str, Any]] = None,
        min_freq: int = 1,
        max_freq: Optional[int] = None,
        lowercase: bool = True,
        search_target: str = "word",
        language: str = "english",
        analysis_mode: str = "polarity",
    ) -> Dict[str, Any]:
        """
        Run sentiment analysis on corpus texts using NRC annotations.
        analysis_mode: "polarity" -> positive/negative/neutral; "dimension" -> 8 emotions + others.
        search_target: "word" | "lemma" | "usas" — when "usas", groups by semantic domain.
        """
        try:
            if text_ids == "all":
                texts = TextDB.list_by_corpus(corpus_id)
            else:
                texts = [TextDB.get_by_id(tid) for tid in text_ids if TextDB.get_by_id(tid)]

            if not texts:
                return {
                    "success": False,
                    "error": "No texts found in corpus",
                    "summary": {},
                    "results": [],
                }

            target = search_config.get("searchTarget", search_target) if search_config else search_target

            # USAS domain mode — group by semantic domain instead of individual words
            if target == "usas":
                return self._analyze_usas_mode(
                    texts, pos_filter, search_config or {}, min_freq, max_freq, lowercase, analysis_mode, language
                )

            all_pairs: List[Tuple[str, Dict[str, int]]] = []

            for text in texts:
                spacy_data = self._load_spacy_annotation(text)
                nrc_scores = self._load_nrc_for_text(text)
                if not spacy_data or not nrc_scores:
                    continue
                tokens = spacy_data.get("tokens", [])
                if "segments" in spacy_data:
                    tokens = []
                    seg_keys = sorted(
                        spacy_data["segments"].keys(),
                        key=lambda k: (int(k) if str(k).isdigit() else 999999, k),
                    )
                    for seg_id in seg_keys:
                        tokens.extend(spacy_data["segments"][seg_id].get("tokens", []))
                if len(nrc_scores) != len(tokens):
                    logger.warning(f"NRC token count mismatch for text {text.get('id')}: {len(nrc_scores)} vs {len(tokens)}")
                    continue
                for t, scores in zip(tokens, nrc_scores):
                    word = (t.get("lemma") if target == "lemma" else t.get("text", "")).strip()
                    if not word or t.get("is_punct") or t.get("is_space"):
                        continue
                    pos = t.get("pos", "")
                    if not self._pass_pos_filter(t, pos_filter):
                        continue
                    if lowercase:
                        word = word.lower()
                    all_pairs.append((word, scores))
            if not all_pairs:
                return self._empty_response(analysis_mode)

            word_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
            for word, scores in all_pairs:
                if analysis_mode == "polarity":
                    label = self._polarity_label(scores)
                    word_counts[word][label] += 1
                else:
                    label = self._dimension_label(scores)
                    word_counts[word][label] += 1

            search_config = search_config or {}
            word_counts = self._apply_search_filters(word_counts, search_config, language)
            total_per_word = {w: sum(word_counts[w].values()) for w in word_counts}
            word_counts = {
                w: dict(counts)
                for w, counts in word_counts.items()
                if min_freq <= total_per_word[w] and (max_freq is None or total_per_word[w] <= max_freq)
            }
            if not word_counts:
                return self._empty_response(analysis_mode)

            summary = self._build_summary(word_counts, analysis_mode)
            results = self._build_results(word_counts, analysis_mode)
            return {
                "success": True,
                "summary": summary,
                "results": results,
                "analysis_mode": analysis_mode,
            }
        except Exception as e:
            logger.error(f"Sentiment analysis error: {e}")
            return {
                "success": False,
                "error": str(e),
                "summary": {},
                "results": [],
            }

    def _analyze_usas_mode(
        self,
        texts: List[Dict[str, Any]],
        pos_filter: Optional[Dict[str, Any]],
        search_config: Dict[str, Any],
        min_freq: int,
        max_freq: Optional[int],
        lowercase: bool,
        analysis_mode: str,
        language: str,
    ) -> Dict[str, Any]:
        """
        Analyze sentiment grouped by USAS semantic domain.
        Loads both SpaCy/NRC annotations and USAS domain tags, then aggregates
        emotion scores per semantic domain instead of per word.
        """
        # domain_code -> emotion_label -> count
        domain_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        # domain_code -> domain_name (for display)
        domain_names: Dict[str, str] = {}

        for text in texts:
            spacy_data = self._load_spacy_annotation(text)
            nrc_scores = self._load_nrc_for_text(text)
            usas_tags = self._load_usas_tags_for_text(text)
            if not spacy_data or not nrc_scores or not usas_tags:
                continue

            # Flatten tokens from segments if needed
            tokens = spacy_data.get("tokens", [])
            if "segments" in spacy_data:
                tokens = []
                seg_keys = sorted(
                    spacy_data["segments"].keys(),
                    key=lambda k: (int(k) if str(k).isdigit() else 999999, k),
                )
                for seg_id in seg_keys:
                    tokens.extend(spacy_data["segments"][seg_id].get("tokens", []))

            if len(nrc_scores) != len(tokens):
                logger.warning(
                    f"NRC token count mismatch for text {text.get('id')}: {len(nrc_scores)} vs {len(tokens)}"
                )
                continue
            if len(usas_tags) != len(tokens):
                logger.warning(
                    f"USAS token count mismatch for text {text.get('id')}: {len(usas_tags)} vs {len(tokens)}"
                )
                continue

            for t, scores, raw_tag in zip(tokens, nrc_scores, usas_tags):
                if t.get("is_punct") or t.get("is_space"):
                    continue
                if not self._pass_pos_filter(t, pos_filter):
                    continue
                if not raw_tag:
                    continue
                # Normalise: strip _MWE suffix
                domain_code = raw_tag.replace("_MWE", "") if "_MWE" in raw_tag else raw_tag
                # Skip grammatical/unclassified tags
                if domain_code in ("Z99", "PUNCT", ""):
                    continue

                if domain_code not in domain_names:
                    domain_names[domain_code] = get_domain_description(domain_code)

                if analysis_mode == "polarity":
                    label = self._polarity_label(scores)
                else:
                    label = self._dimension_label(scores)
                domain_counts[domain_code][label] += 1

        if not domain_counts:
            return self._empty_response(analysis_mode)

        # Apply search filters (filter by domain_code or domain_name)
        search_type = search_config.get("searchType", "all")
        search_value = (search_config.get("searchValue") or "").strip().lower()
        exclude_words = search_config.get("excludeWords", [])
        if isinstance(exclude_words, str):
            exclude_set = set(w.strip().lower() for w in exclude_words.split("\n") if w.strip())
        else:
            exclude_set = set(w.lower() for w in exclude_words)

        filtered_domain_counts: Dict[str, Dict[str, int]] = {}
        for code, counts in domain_counts.items():
            code_lower = code.lower()
            name_lower = domain_names.get(code, "").lower()
            if code_lower in exclude_set or name_lower in exclude_set:
                continue
            searchable = f"{code_lower} {name_lower}"
            if search_type == "all" or not search_value:
                filtered_domain_counts[code] = dict(counts)
            elif search_type == "starts" and (code_lower.startswith(search_value) or name_lower.startswith(search_value)):
                filtered_domain_counts[code] = dict(counts)
            elif search_type == "ends" and (code_lower.endswith(search_value) or name_lower.endswith(search_value)):
                filtered_domain_counts[code] = dict(counts)
            elif search_type == "contains" and search_value in searchable:
                filtered_domain_counts[code] = dict(counts)
            elif search_type == "regex":
                try:
                    if re.search(search_value, searchable, re.IGNORECASE):
                        filtered_domain_counts[code] = dict(counts)
                except re.error:
                    pass
            elif search_type == "wordlist":
                wordlist = set(w.strip().lower() for w in search_value.split("\n") if w.strip())
                if code_lower in wordlist or name_lower in wordlist:
                    filtered_domain_counts[code] = dict(counts)

        # Apply frequency filters
        total_per_domain = {d: sum(c.values()) for d, c in filtered_domain_counts.items()}
        filtered_domain_counts = {
            d: c
            for d, c in filtered_domain_counts.items()
            if min_freq <= total_per_domain[d] and (max_freq is None or total_per_domain[d] <= max_freq)
        }
        if not filtered_domain_counts:
            return self._empty_response(analysis_mode)

        summary = self._build_summary(filtered_domain_counts, analysis_mode)
        results = self._build_domain_results(filtered_domain_counts, domain_names, analysis_mode)
        return {
            "success": True,
            "summary": summary,
            "results": results,
            "analysis_mode": analysis_mode,
            "search_target": "usas",
        }

    def _load_spacy_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Load SpaCy annotation for a text (same pattern as word_frequency_service)."""
        media_type = text.get("media_type", "text")
        if media_type in ["audio", "video"]:
            transcript_json = text.get("transcript_json_path")
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if "spacy_annotations" in data:
                        return data["spacy_annotations"]
                except Exception as e:
                    logger.warning(f"Failed to load transcript SpaCy: {e}")
        content_path = text.get("content_path")
        if not content_path:
            return None
        content_path = Path(content_path)
        spacy_path = content_path.parent / f"{content_path.stem}.spacy.json"
        if spacy_path.exists():
            try:
                with open(spacy_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load SpaCy annotation: {e}")
        return None

    def _load_usas_tags_for_text(self, text: Dict[str, Any]) -> List[str]:
        """Load USAS domain tags for a text, returning one tag per SpaCy token (aligned by index)."""
        media_type = text.get("media_type", "text")
        if media_type in ["audio", "video"]:
            transcript_json = text.get("transcript_json_path")
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    usas = data.get("usas_annotations", {})
                    return self._extract_usas_tags_flat(usas)
                except Exception as e:
                    logger.warning(f"Failed to load transcript USAS: {e}")
            return []
        content_path = text.get("content_path")
        if not content_path:
            return []
        content_path = Path(content_path)
        usas_path = content_path.parent / f"{content_path.stem}.usas.json"
        if not usas_path.exists():
            return []
        try:
            with open(usas_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return self._extract_usas_tags_flat(data)
        except Exception as e:
            logger.warning(f"Failed to load USAS annotation: {e}")
        return []

    def _extract_usas_tags_flat(self, usas_data: Dict[str, Any]) -> List[str]:
        """Flatten USAS annotation tokens to a list of usas_tag strings (one per token)."""
        tags: List[str] = []
        if "tokens" in usas_data:
            for tok in usas_data["tokens"]:
                tags.append(tok.get("usas_tag", "") or "")
        elif "segments" in usas_data:
            seg_keys = sorted(
                usas_data["segments"].keys(),
                key=lambda k: (int(k) if str(k).isdigit() else 999999, k),
            )
            for seg_id in seg_keys:
                for tok in usas_data["segments"][seg_id].get("tokens", []):
                    tags.append(tok.get("usas_tag", "") or "")
        return tags

    def _load_nrc_for_text(self, text: Dict[str, Any]) -> List[Dict[str, int]]:
        """Load NRC token_scores for a text. Plain text: .nrc.json; media: transcript nrc_annotations."""
        media_type = text.get("media_type", "text")
        if media_type in ["audio", "video"]:
            transcript_json = text.get("transcript_json_path")
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    nrc = data.get("nrc_annotations", {})
                    if not nrc.get("success") or "segments" not in nrc:
                        return []
                    seg_scores = {s.get("id", i): s.get("token_scores", []) for i, s in enumerate(nrc["segments"])}
                    out = []
                    for seg_id in sorted(seg_scores.keys(), key=lambda k: (int(k) if str(k).isdigit() else 999999, k)):
                        out.extend(seg_scores[seg_id])
                    return out
                except Exception as e:
                    logger.warning(f"Failed to load transcript NRC: {e}")
            return []
        content_path = text.get("content_path")
        if not content_path:
            return []
        content_path = Path(content_path)
        nrc_path = content_path.parent / f"{content_path.stem}.nrc.json"
        if not nrc_path.exists():
            return []
        try:
            with open(nrc_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("token_scores", [])
        except Exception as e:
            logger.warning(f"Failed to load NRC annotation: {e}")
            return []

    def _pass_pos_filter(self, token: Dict, pos_filter: Optional[Dict]) -> bool:
        if not pos_filter:
            return True
        selected = pos_filter.get("selectedPOS", [])
        keep = pos_filter.get("keepMode", True)
        pos = token.get("pos", "")
        if not selected:
            return True
        if keep:
            return pos in selected
        return pos not in selected

    def _polarity_label(self, scores: Dict[str, int]) -> str:
        pos = scores.get("positive", 0)
        neg = scores.get("negative", 0)
        if pos > neg:
            return "positive"
        if neg > pos:
            return "negative"
        return "neutral"

    def _dimension_label(self, scores: Dict[str, int]) -> str:
        for dim in NRC_DIMENSIONS:
            if scores.get(dim, 0) > 0:
                return dim
        return "others"

    def _apply_search_filters(
        self,
        word_counts: Dict[str, Dict[str, int]],
        search_config: Dict[str, Any],
        language: str,
    ) -> Dict[str, Dict[str, int]]:
        search_type = search_config.get("searchType", "all")
        search_value = (search_config.get("searchValue") or "").strip()
        exclude_words = search_config.get("excludeWords", [])
        remove_stopwords = search_config.get("removeStopwords", False)
        if isinstance(exclude_words, str):
            exclude_set = set(w.strip().lower() for w in exclude_words.split("\n") if w.strip())
        else:
            exclude_set = set(w.lower() for w in exclude_words)
        stopwords_set = set()
        if remove_stopwords:
            try:
                from services.word_frequency_service import get_word_frequency_service
                stopwords_set = get_word_frequency_service().load_stopwords(language)
            except Exception as e:
                logger.warning(f"Could not load stopwords for sentiment filter: {e}")
        filtered = {}
        for word, counts in word_counts.items():
            wl = word.lower()
            if remove_stopwords and wl in stopwords_set:
                continue
            if wl in exclude_set:
                continue
            if search_type == "all" or not search_value:
                filtered[word] = counts
            elif search_type == "starts" and wl.startswith(search_value.lower()):
                filtered[word] = counts
            elif search_type == "ends" and wl.endswith(search_value.lower()):
                filtered[word] = counts
            elif search_type == "contains" and search_value.lower() in wl:
                filtered[word] = counts
            elif search_type == "regex":
                try:
                    if re.search(search_value, word, re.IGNORECASE):
                        filtered[word] = counts
                except re.error:
                    pass
            elif search_type == "wordlist":
                wordlist = set(w.strip().lower() for w in search_value.split("\n") if w.strip())
                if wl in wordlist:
                    filtered[word] = counts
        return filtered

    def _build_summary(self, word_counts: Dict[str, Dict[str, int]], mode: str) -> Dict[str, int]:
        summary = defaultdict(int)
        for counts in word_counts.values():
            for label, c in counts.items():
                summary[label] += c
        return dict(summary)

    def _build_results(
        self,
        word_counts: Dict[str, Dict[str, int]],
        analysis_mode: str,
    ) -> List[Dict[str, Any]]:
        total_per_word = {w: sum(counts.values()) for w, counts in word_counts.items()}
        total_all = sum(total_per_word.values())
        results = []
        for word in sorted(word_counts.keys(), key=lambda w: -total_per_word[w]):
            counts = word_counts[word]
            total = total_per_word[word]
            row = {"word": word, "total": total}
            if total_all > 0:
                row["percentage"] = round(100 * total / total_all, 4)
            else:
                row["percentage"] = 0
            for k, v in counts.items():
                row[k] = v
            results.append(row)
        return results

    def _build_domain_results(
        self,
        domain_counts: Dict[str, Dict[str, int]],
        domain_names: Dict[str, str],
        analysis_mode: str,
    ) -> List[Dict[str, Any]]:
        """Build results list for USAS domain mode (word field = domain code, adds domain_name)."""
        total_per_domain = {d: sum(c.values()) for d, c in domain_counts.items()}
        total_all = sum(total_per_domain.values())
        results = []
        for domain in sorted(domain_counts.keys(), key=lambda d: -total_per_domain[d]):
            counts = domain_counts[domain]
            total = total_per_domain[domain]
            row: Dict[str, Any] = {
                "word": domain,
                "domain_name": domain_names.get(domain, ""),
                "total": total,
                "percentage": round(100 * total / total_all, 4) if total_all > 0 else 0,
            }
            for k, v in counts.items():
                row[k] = v
            results.append(row)
        return results

    def _empty_response(self, analysis_mode: str) -> Dict[str, Any]:
        if analysis_mode == "polarity":
            summary = {"positive": 0, "negative": 0, "neutral": 0}
        else:
            summary = {d: 0 for d in NRC_DIMENSIONS}
            summary["others"] = 0
        return {
            "success": True,
            "summary": summary,
            "results": [],
            "analysis_mode": analysis_mode,
        }


_sentiment_service: Optional[SentimentAnalysisService] = None


def get_sentiment_analysis_service() -> SentimentAnalysisService:
    global _sentiment_service
    if _sentiment_service is None:
        _sentiment_service = SentimentAnalysisService()
    return _sentiment_service

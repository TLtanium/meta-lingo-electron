"""
Semantic Domain Analysis Service
Provides semantic domain statistics using USAS annotation data
"""

import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from collections import Counter, defaultdict
from pathlib import Path

from models.database import TextDB, CorpusDB
from services.usas.domain_config import (
    get_domain_description,
    get_major_category,
    USAS_MAJOR_CATEGORIES,
    USAS_DOMAINS,
    parse_usas_domains_file
)
from utils.exclusion_utils import compile_exclusion_patterns, matches_exclusion, normalize_exclusion_words
from services.usas.annotation_meta import infer_disambiguation_enabled
from services.usas.disambiguator import parse_compound_tag
from services.corpus_path_utils import resolve_stored_path, find_usas_sidecar_path

logger = logging.getLogger(__name__)


class SemanticAnalysisService:
    """Semantic domain analysis service using USAS annotations"""
    
    def __init__(self):
        # Ensure domains are loaded
        if not USAS_DOMAINS:
            parse_usas_domains_file()
    
    def analyze(
        self,
        corpus_id: str,
        text_ids: List[str] | str = "all",
        pos_filter: Optional[Dict[str, Any]] = None,
        search_config: Optional[Dict[str, Any]] = None,
        min_freq: int = 1,
        max_freq: Optional[int] = None,
        lowercase: bool = True,
        result_mode: str = "domain"  # "domain" or "word"
    ) -> Dict[str, Any]:
        """
        Perform semantic domain analysis
        
        Args:
            corpus_id: Corpus ID
            text_ids: List of text IDs or "all" for all texts
            pos_filter: POS filter config {selectedPOS: [], keepMode: bool}
            search_config: Search config {searchType, searchValue, excludeWords}
            min_freq: Minimum frequency threshold
            max_freq: Maximum frequency threshold (optional)
            lowercase: Convert all to lowercase
            result_mode: "domain" for domain statistics, "word" for word-level
            
        Returns:
            Analysis results with domain/word frequencies
        """
        try:
            # Get texts from corpus
            if text_ids == "all":
                texts = TextDB.list_by_corpus(corpus_id)
            else:
                texts = [TextDB.get_by_id(tid) for tid in text_ids if TextDB.get_by_id(tid)]
            
            if not texts:
                return {
                    "success": False,
                    "error": "No texts found in corpus",
                    "results": []
                }
            
            # Collect all tokens with USAS tags
            all_tokens = []
            
            for text in texts:
                tokens = self._get_tokens_from_text(text, pos_filter, lowercase)
                all_tokens.extend(tokens)
            
            if not all_tokens:
                return {
                    "success": True,
                    "results": [],
                    "total_tokens": 0,
                    "unique_domains": 0,
                    "unique_words": 0
                }
            
            # Apply search filters to tokens
            if search_config:
                all_tokens = self._apply_search_filters(all_tokens, search_config)
            
            # Calculate results based on mode
            if result_mode == "domain":
                results = self._calculate_domain_results(all_tokens, min_freq, max_freq)
            else:
                results = self._calculate_word_results(all_tokens, min_freq, max_freq)
            
            total_tokens = len(all_tokens)
            unique_domains = len(set(t['domain'] for t in all_tokens if t.get('domain')))
            unique_words = len(set(t['word'] for t in all_tokens))
            
            return {
                "success": True,
                "results": results,
                "total_tokens": total_tokens,
                "unique_domains": unique_domains,
                "unique_words": unique_words,
                "result_mode": result_mode
            }
            
        except Exception as e:
            logger.error(f"Semantic analysis error: {e}")
            return {
                "success": False,
                "error": str(e),
                "results": []
            }
    
    def _get_tokens_from_text(
        self,
        text: Dict[str, Any],
        pos_filter: Optional[Dict[str, Any]],
        lowercase: bool
    ) -> List[Dict[str, Any]]:
        """
        Extract tokens with USAS tags from a text
        
        Args:
            text: Text database entry
            pos_filter: POS filter config
            lowercase: Whether to lowercase tokens
            
        Returns:
            List of token dictionaries with word, domain, pos, is_metaphor
        """
        tokens = []
        
        # Get USAS annotation data
        usas_data = self._load_usas_annotation(text)
        if not usas_data:
            logger.debug("No USAS annotation for text %s, skipping", text.get('id'))
            return tokens
        
        # Get MIPVU annotation data for metaphor info
        mipvu_data = self._load_mipvu_annotation(text)
        mipvu_tokens_map = self._build_mipvu_tokens_map(mipvu_data) if mipvu_data else {}
        
        # Align with saved tagging_mode when key omitted (neural → multi-tag stats).
        disambiguation_enabled = infer_disambiguation_enabled(usas_data)

        # Handle different annotation formats
        if "tokens" in usas_data:
            # Standard text annotation format
            tokens = self._extract_from_tokens(
                usas_data["tokens"], pos_filter, lowercase, mipvu_tokens_map,
                disambiguation_enabled=disambiguation_enabled
            )
        elif "segments" in usas_data:
            # Segment-based annotation format (for audio/video)
            seg_keys = sorted(
                usas_data["segments"].keys(),
                key=lambda k: (int(k) if str(k).isdigit() else 999999, str(k)),
            )
            for seg_id in seg_keys:
                seg_data = usas_data["segments"][seg_id]
                if "tokens" in seg_data:
                    seg_tokens = self._extract_from_tokens(
                        seg_data["tokens"], pos_filter, lowercase, mipvu_tokens_map,
                        disambiguation_enabled=disambiguation_enabled
                    )
                    tokens.extend(seg_tokens)
        
        return tokens
    
    def _load_usas_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Load USAS annotation for a text
        
        Args:
            text: Text database entry
            
        Returns:
            USAS annotation data or None
        """
        media_type = text.get('media_type', 'text')
        
        # For audio/video, check transcript JSON first
        if media_type in ['audio', 'video']:
            tjp = resolve_stored_path(text.get('transcript_json_path'))
            if tjp and tjp.is_file():
                try:
                    with open(tjp, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if 'usas_annotations' in data:
                        return data['usas_annotations']
                except Exception as e:
                    logger.warning(f"Failed to load transcript USAS: {e}")
        
        # For plain text, use .usas.json file
        content_path = resolve_stored_path(text.get('content_path'))
        if not content_path:
            logger.warning(
                "USAS: cannot resolve content_path for text %s: %r",
                text.get('id'), text.get('content_path')
            )
            return None

        usas_path = find_usas_sidecar_path(content_path)
        sidecar_present = bool(usas_path and usas_path.exists())

        if sidecar_present:
            try:
                with open(usas_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return data
            except Exception as e:
                logger.warning(f"Failed to load USAS annotation: {e}")
                return None

        canon = content_path.parent / f"{content_path.stem}.usas.json"
        logger.warning(
            "USAS annotation not found for text %s: tried sidecar near %s (canonical %s)",
            text.get('id'), content_path, canon
        )

        # No sidecar on disk (common when packaged async pipeline skipped USAS write). Regenerate once and persist.
        if media_type == 'text' and content_path.is_file():
            regen = self._regenerate_usas_sidecar_if_missing(text, content_path)
            if regen is not None:
                return regen

        return None

    def _regenerate_usas_sidecar_if_missing(
        self, text: Dict[str, Any], content_path: Path
    ) -> Optional[Dict[str, Any]]:
        """Run USAS on file text and save ``{stem}.usas.json`` when sidecar was never written."""
        corpus_id = text.get("corpus_id")
        if not corpus_id:
            return None
        corpus = CorpusDB.get_by_id(corpus_id)
        if not corpus:
            return None
        language = corpus.get("language") or "english"
        text_type = corpus.get("text_type")
        try:
            from services.usas_service import get_usas_service

            usas_svc = get_usas_service()
            if not usas_svc.is_available(language):
                return None
            with open(content_path, "r", encoding="utf-8") as f:
                raw = f.read()
            if not raw.strip():
                return None
            result = usas_svc.annotate_text(raw, language, text_type)
            if not result.get("success"):
                return None
            out_path = content_path.parent / f"{content_path.stem}.usas.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            logger.info(
                "Wrote missing USAS sidecar for text %s at %s",
                text.get("id"),
                out_path,
            )
            return result
        except Exception as e:
            logger.warning("USAS lazy regeneration failed: %s", e)
            return None

    def _load_mipvu_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Load MIPVU annotation for a text
        
        Args:
            text: Text database entry
            
        Returns:
            MIPVU annotation data or None
        """
        media_type = text.get('media_type', 'text')
        
        # For audio/video, check transcript JSON first
        if media_type in ['audio', 'video']:
            tjp = resolve_stored_path(text.get('transcript_json_path'))
            if tjp and tjp.is_file():
                try:
                    with open(tjp, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if 'mipvu_annotations' in data:
                        return data['mipvu_annotations']
                except Exception as e:
                    logger.warning(f"Failed to load transcript MIPVU: {e}")
        
        # For plain text, use .mipvu.json file
        content_path = resolve_stored_path(text.get('content_path'))
        if not content_path:
            return None
        
        mipvu_path = content_path.parent / f"{content_path.stem}.mipvu.json"
        
        if mipvu_path.exists():
            try:
                with open(mipvu_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load MIPVU annotation: {e}")
        
        return None
    
    def _build_mipvu_tokens_map(self, mipvu_data: Dict[str, Any]) -> Dict[Tuple[int, int], bool]:
        """
        Build a map from (start, end) positions to is_metaphor values
        
        Args:
            mipvu_data: MIPVU annotation data
            
        Returns:
            Dictionary mapping (start, end) -> is_metaphor
        """
        tokens_map = {}
        
        if not mipvu_data or not mipvu_data.get('success', False):
            return tokens_map
        
        sentences = mipvu_data.get('sentences', [])
        for sentence in sentences:
            tokens = sentence.get('tokens', [])
            for token in tokens:
                start = token.get('start', -1)
                end = token.get('end', -1)
                is_metaphor = token.get('is_metaphor', False)
                if start >= 0 and end >= 0:
                    tokens_map[(start, end)] = is_metaphor
                # Also store by word+lemma for fallback matching
                word = token.get('word', '').lower()
                lemma = token.get('lemma', '').lower()
                if word:
                    # Store word-level metaphor info (will be used as fallback)
                    if word not in tokens_map:
                        tokens_map[('word', word)] = is_metaphor
                    elif is_metaphor:  # If any occurrence is metaphor, mark as metaphor
                        tokens_map[('word', word)] = True
        
        return tokens_map
    
    def _extract_from_tokens(
        self,
        tokens: List[Dict[str, Any]],
        pos_filter: Optional[Dict[str, Any]],
        lowercase: bool,
        mipvu_tokens_map: Optional[Dict] = None,
        disambiguation_enabled: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Extract word and domain info from token data

        For compound tags like 'Df/I2.2', creates separate records for each domain.
        When disambiguation is OFF, iterates over ALL candidate tags in usas_tags,
        creating records for each unique domain per token.

        Args:
            tokens: List of token dictionaries from USAS
            pos_filter: POS filter config
            lowercase: Whether to lowercase
            mipvu_tokens_map: Optional map from positions to is_metaphor values
            disambiguation_enabled: Whether disambiguation was applied

        Returns:
            List of token dictionaries with word, domain, pos, domain_name, is_metaphor
        """
        result = []

        selected_pos = pos_filter.get("selectedPOS", []) if pos_filter else []
        keep_mode = pos_filter.get("keepMode", True) if pos_filter else True
        mipvu_map = mipvu_tokens_map or {}

        for token in tokens:
            # Skip punctuation and spaces
            if token.get("is_punct") or token.get("is_space"):
                continue

            text = token.get("text") or token.get("word") or ""
            pos = token.get("pos", "")
            usas_tag = token.get("usas_tag", "") or ""

            # Skip empty surface form
            if not text.strip():
                continue

            # Build candidate tag list before applying primary-only skips (aligns with
            # sentiment USAS path: when disambiguation is off, Z99 primary may still
            # have valid domains in usas_tags — e.g. rule-based multi-candidate tokens.)
            if not disambiguation_enabled:
                all_tags = token.get("usas_tags") or []
                if not all_tags:
                    all_tags = [usas_tag] if usas_tag else []
            else:
                all_tags = [usas_tag] if usas_tag else []

            if not all_tags:
                continue

            # Apply POS filter if configured
            if selected_pos:
                if keep_mode:
                    if pos not in selected_pos:
                        continue
                else:
                    if pos in selected_pos:
                        continue
            elif keep_mode and selected_pos == []:
                pass

            # Apply lowercase if requested
            word = text.lower() if lowercase else text

            # MWE / metaphor: use primary tag if present, else first non-empty candidate
            primary_for_mwe = usas_tag or next((t for t in all_tags if t), "")
            is_mwe = "_MWE" in primary_for_mwe or any("_MWE" in t for t in all_tags if t)

            # Look up is_metaphor from MIPVU data
            start = token.get("start", -1)
            end = token.get("end", -1)
            is_metaphor = mipvu_map.get((start, end), None)
            if is_metaphor is None:
                is_metaphor = mipvu_map.get(("word", text.lower()), False)

            # Deduplicate domains for this token
            seen_domains = set()

            for tag in all_tags:
                if not tag or tag in ("Z99", "PUNCT"):
                    continue

                # Parse compound tag - split by '/' to get individual domains
                individual_domains = parse_compound_tag(tag)

                # Create a record for each individual domain
                for domain in individual_domains:
                    # Skip Z99 domains
                    if domain == "Z99" or domain == "Z99_MWE":
                        continue

                    # Deduplicate: each domain counted once per token
                    if domain in seen_domains:
                        continue
                    seen_domains.add(domain)

                    # Get domain description (strip _MWE for lookup)
                    domain_for_lookup = domain.replace("_MWE", "") if "_MWE" in domain else domain
                    domain_name = get_domain_description(domain_for_lookup)

                    # Get major category
                    category, category_name = get_major_category(domain_for_lookup)

                    result.append({
                        "word": word,
                        "domain": domain,
                        "domain_display": domain_for_lookup,
                        "domain_name": domain_name,
                        "category": category,
                        "category_name": category_name,
                        "pos": pos,
                        "is_mwe": is_mwe or "_MWE" in domain,
                        "is_metaphor": is_metaphor
                    })

        return result
    
    def _apply_search_filters(
        self,
        tokens: List[Dict[str, Any]],
        search_config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Apply search filters to tokens
        
        Args:
            tokens: List of token dictionaries
            search_config: Search configuration
            
        Returns:
            Filtered tokens
        """
        search_type = search_config.get("searchType", "all")
        search_value = search_config.get("searchValue", "").strip()
        exclude_words = search_config.get("excludeWords", [])

        # Compile exclusion patterns (supports regex)
        exclusion_patterns = compile_exclusion_patterns(normalize_exclusion_words(exclude_words))

        filtered = []

        for token in tokens:
            word = token.get("word", "")
            word_lower = word.lower()

            # Apply exclusion filter (regex-aware)
            if exclusion_patterns and matches_exclusion(word_lower, exclusion_patterns):
                continue
            
            # Apply search filter
            if search_type == "all" or not search_value:
                filtered.append(token)
            elif search_type == "starts":
                if word_lower.startswith(search_value.lower()):
                    filtered.append(token)
            elif search_type == "ends":
                if word_lower.endswith(search_value.lower()):
                    filtered.append(token)
            elif search_type == "contains":
                if search_value.lower() in word_lower:
                    filtered.append(token)
            elif search_type == "regex":
                try:
                    if re.search(search_value, word, re.IGNORECASE):
                        filtered.append(token)
                except re.error:
                    pass
            elif search_type == "wordlist":
                wordlist = set(w.strip().lower() for w in search_value.split('\n') if w.strip())
                if word_lower in wordlist:
                    filtered.append(token)
        
        return filtered
    
    def _calculate_domain_results(
        self,
        tokens: List[Dict[str, Any]],
        min_freq: int,
        max_freq: Optional[int]
    ) -> List[Dict[str, Any]]:
        """
        Calculate results by semantic domain
        
        Args:
            tokens: List of token dictionaries
            min_freq: Minimum frequency
            max_freq: Maximum frequency
            
        Returns:
            List of domain result dictionaries
        """
        # Normalize domain for aggregation: strip _MWE only (A1.5.1_MWE -> A1.5.1)
        def _normalize_domain(d: str) -> str:
            return d.replace("_MWE", "") if "_MWE" in d else d

        domain_counts = Counter()
        domain_words = defaultdict(set)
        domain_info = {}

        for token in tokens:
            raw_domain = token.get("domain", "")
            if not raw_domain:
                continue
            domain = _normalize_domain(raw_domain)
            domain_counts[domain] += 1
            domain_words[domain].add(token.get("word", ""))

            if domain not in domain_info:
                domain_info[domain] = {
                    "domain_name": get_domain_description(domain),
                    "category": get_major_category(domain)[0],
                    "category_name": get_major_category(domain)[1],
                }
                # Prefer token's category if we have it
                if token.get("category"):
                    domain_info[domain]["category"] = token.get("category", "")
                if token.get("category_name"):
                    domain_info[domain]["category_name"] = token.get("category_name", "")

        # Apply frequency filters
        filtered_domains = {}
        for domain, count in domain_counts.items():
            if count < min_freq:
                continue
            if max_freq is not None and count > max_freq:
                continue
            filtered_domains[domain] = count
        
        # Calculate percentages
        total = sum(filtered_domains.values())
        results = []
        
        for rank, (domain, count) in enumerate(
            sorted(filtered_domains.items(), key=lambda x: x[1], reverse=True),
            start=1
        ):
            percentage = (count / total * 100) if total > 0 else 0
            info = domain_info.get(domain, {})
            
            results.append({
                "rank": rank,
                "domain": domain,
                "domain_name": info.get("domain_name", ""),
                "category": info.get("category", ""),
                "category_name": info.get("category_name", ""),
                "frequency": count,
                "percentage": round(percentage, 4),
                "words": list(domain_words[domain])[:50]  # Limit words list
            })
        
        return results
    
    def _calculate_word_results(
        self,
        tokens: List[Dict[str, Any]],
        min_freq: int,
        max_freq: Optional[int]
    ) -> List[Dict[str, Any]]:
        """
        Calculate results by word
        
        Args:
            tokens: List of token dictionaries
            min_freq: Minimum frequency
            max_freq: Maximum frequency
            
        Returns:
            List of word result dictionaries
        """
        # Count words with their domains
        word_domain_counts = Counter()
        word_info = {}
        
        for token in tokens:
            word = token.get("word", "")
            domain = token.get("domain", "")
            
            if not word or not domain:
                continue
            
            key = (word, domain)
            word_domain_counts[key] += 1
            
            if key not in word_info:
                word_info[key] = {
                    "domain_name": token.get("domain_name", ""),
                    "category": token.get("category", ""),
                    "category_name": token.get("category_name", ""),
                    "pos": token.get("pos", ""),
                    "is_metaphor": token.get("is_metaphor", False)
                }
            elif token.get("is_metaphor", False):
                # If any occurrence is metaphor, mark as metaphor
                word_info[key]["is_metaphor"] = True
        
        # Apply frequency filters
        filtered = {}
        for key, count in word_domain_counts.items():
            if count < min_freq:
                continue
            if max_freq is not None and count > max_freq:
                continue
            filtered[key] = count
        
        # Calculate percentages
        total = sum(filtered.values())
        results = []
        
        for rank, (key, count) in enumerate(
            sorted(filtered.items(), key=lambda x: x[1], reverse=True),
            start=1
        ):
            word, domain = key
            percentage = (count / total * 100) if total > 0 else 0
            info = word_info.get(key, {})
            
            results.append({
                "rank": rank,
                "word": word,
                "domain": domain,
                "domain_name": info.get("domain_name", ""),
                "category": info.get("category", ""),
                "category_name": info.get("category_name", ""),
                "pos": info.get("pos", ""),
                "frequency": count,
                "percentage": round(percentage, 4),
                "is_metaphor": info.get("is_metaphor", False)
            })
        
        return results
    
    def get_domain_words(
        self,
        corpus_id: str,
        domain: str,
        text_ids: List[str] | str = "all",
        lowercase: bool = True
    ) -> Dict[str, Any]:
        """
        Get all words tagged with a specific domain
        
        Args:
            corpus_id: Corpus ID
            domain: Domain code
            text_ids: List of text IDs or "all"
            lowercase: Whether to lowercase
            
        Returns:
            Dictionary with word list and frequencies
        """
        try:
            # Get texts from corpus
            if text_ids == "all":
                texts = TextDB.list_by_corpus(corpus_id)
            else:
                texts = [TextDB.get_by_id(tid) for tid in text_ids if TextDB.get_by_id(tid)]
            
            word_counts = Counter()
            word_metaphor_info = {}  # Track metaphor status for each word
            
            # Normalized domain matches both domain and domain_MWE
            domain_mwe = domain + "_MWE" if "_MWE" not in domain else None
            for text in texts:
                tokens = self._get_tokens_from_text(text, None, lowercase)
                for token in tokens:
                    t_domain = token.get("domain", "")
                    if t_domain == domain or (domain_mwe and t_domain == domain_mwe):
                        word = token.get("word", "")
                        word_counts[word] += 1
                        # Track metaphor status - if any occurrence is metaphor, mark as metaphor
                        if word not in word_metaphor_info:
                            word_metaphor_info[word] = token.get("is_metaphor", False)
                        elif token.get("is_metaphor", False):
                            word_metaphor_info[word] = True
            
            # Sort by frequency
            results = [
                {
                    "word": word, 
                    "frequency": count,
                    "is_metaphor": word_metaphor_info.get(word, False)
                }
                for word, count in sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
            ]
            
            return {
                "success": True,
                "domain": domain,
                "domain_name": get_domain_description(domain),
                "words": results,
                "total_words": len(results)
            }
            
        except Exception as e:
            logger.error(f"Get domain words error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_major_categories(self) -> List[Dict[str, str]]:
        """
        Get list of USAS major categories
        
        Returns:
            List of category dictionaries
        """
        return [
            {"code": code, "name": name}
            for code, name in sorted(USAS_MAJOR_CATEGORIES.items())
        ]


# Singleton instance
_semantic_analysis_service = None


def get_semantic_analysis_service() -> SemanticAnalysisService:
    """Get SemanticAnalysisService singleton"""
    global _semantic_analysis_service
    if _semantic_analysis_service is None:
        _semantic_analysis_service = SemanticAnalysisService()
    return _semantic_analysis_service

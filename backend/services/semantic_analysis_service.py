"""
Semantic Domain Analysis Service
Provides semantic domain statistics using USAS annotation data
"""

import os
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
from services.usas.disambiguator import parse_compound_tag

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
            return tokens
        
        # Get MIPVU annotation data for metaphor info
        mipvu_data = self._load_mipvu_annotation(text)
        mipvu_tokens_map = self._build_mipvu_tokens_map(mipvu_data) if mipvu_data else {}
        
        # Handle different annotation formats
        if "tokens" in usas_data:
            # Standard text annotation format
            tokens = self._extract_from_tokens(
                usas_data["tokens"], pos_filter, lowercase, mipvu_tokens_map
            )
        elif "segments" in usas_data:
            # Segment-based annotation format (for audio/video)
            for seg_id, seg_data in usas_data["segments"].items():
                if "tokens" in seg_data:
                    seg_tokens = self._extract_from_tokens(
                        seg_data["tokens"], pos_filter, lowercase, mipvu_tokens_map
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
            transcript_json = text.get('transcript_json_path')
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if 'usas_annotations' in data:
                        return data['usas_annotations']
                except Exception as e:
                    logger.warning(f"Failed to load transcript USAS: {e}")
        
        # For plain text, use .usas.json file
        content_path = text.get('content_path')
        if not content_path:
            return None
        
        content_path = Path(content_path)
        usas_path = content_path.parent / f"{content_path.stem}.usas.json"
        
        if usas_path.exists():
            try:
                with open(usas_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load USAS annotation: {e}")
        
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
            transcript_json = text.get('transcript_json_path')
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if 'mipvu_annotations' in data:
                        return data['mipvu_annotations']
                except Exception as e:
                    logger.warning(f"Failed to load transcript MIPVU: {e}")
        
        # For plain text, use .mipvu.json file
        content_path = text.get('content_path')
        if not content_path:
            return None
        
        content_path = Path(content_path)
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
        mipvu_tokens_map: Optional[Dict] = None
    ) -> List[Dict[str, Any]]:
        """
        Extract word and domain info from token data
        
        For compound tags like 'Df/I2.2', creates separate records for each domain.
        This means a word tagged with 'N3.8+/A2.1' will produce two records:
        - one with domain 'N3.8+'
        - one with domain 'A2.1'
        
        Args:
            tokens: List of token dictionaries from USAS
            pos_filter: POS filter config
            lowercase: Whether to lowercase
            mipvu_tokens_map: Optional map from positions to is_metaphor values
            
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
            
            text = token.get("text", "")
            pos = token.get("pos", "")
            usas_tag = token.get("usas_tag", "")
            
            # Skip empty tokens or tokens without USAS tag
            if not text.strip() or not usas_tag:
                continue
            
            # Skip grammatical words (Z99) and PUNCT
            if usas_tag in ("Z99", "PUNCT"):
                continue
            
            # Apply POS filter if configured
            if selected_pos:
                if keep_mode:
                    # Keep only selected POS
                    if pos not in selected_pos:
                        continue
                else:
                    # Filter out selected POS
                    if pos in selected_pos:
                        continue
            elif keep_mode and selected_pos == []:
                # Keep mode with empty selection - allow all
                pass
            
            # Apply lowercase if requested
            word = text.lower() if lowercase else text
            
            # Check if it's a MWE token (has _MWE suffix)
            is_mwe = '_MWE' in usas_tag
            
            # Look up is_metaphor from MIPVU data
            # First try by position, then by word as fallback
            start = token.get("start", -1)
            end = token.get("end", -1)
            is_metaphor = mipvu_map.get((start, end), None)
            if is_metaphor is None:
                # Fallback: check by word (lowercase)
                is_metaphor = mipvu_map.get(('word', text.lower()), False)
            
            # Parse compound tag - split by '/' to get individual domains
            # This will split 'N3.8+/A2.1' into ['N3.8+', 'A2.1']
            # And 'Df/I2.2_MWE' into ['Df_MWE', 'I2.2_MWE']
            individual_domains = parse_compound_tag(usas_tag)
            
            # Create a record for each individual domain
            for domain in individual_domains:
                # Skip Z99 domains
                if domain == 'Z99' or domain == 'Z99_MWE':
                    continue
                
                # Get domain description (strip _MWE for lookup)
                domain_for_lookup = domain.replace('_MWE', '') if '_MWE' in domain else domain
                domain_name = get_domain_description(domain_for_lookup)
                
                # Get major category
                category, category_name = get_major_category(domain_for_lookup)
                
                result.append({
                    "word": word,
                    "domain": domain,  # Keep full domain including _MWE suffix
                    "domain_display": domain_for_lookup,  # Without _MWE for display
                    "domain_name": domain_name,
                    "category": category,
                    "category_name": category_name,
                    "pos": pos,
                    "is_mwe": is_mwe or '_MWE' in domain,
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
        
        # Convert exclude list to set for faster lookup
        if isinstance(exclude_words, str):
            exclude_set = set(w.strip().lower() for w in exclude_words.split('\n') if w.strip())
        else:
            exclude_set = set(w.lower() for w in exclude_words)
        
        filtered = []
        
        for token in tokens:
            word = token.get("word", "")
            word_lower = word.lower()
            
            # Apply exclusion filter
            if word_lower in exclude_set:
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
        # Count domains
        domain_counts = Counter()
        domain_words = defaultdict(set)
        domain_info = {}
        
        for token in tokens:
            domain = token.get("domain", "")
            if not domain:
                continue
            
            domain_counts[domain] += 1
            domain_words[domain].add(token.get("word", ""))
            
            # Store domain info
            if domain not in domain_info:
                domain_info[domain] = {
                    "domain_name": token.get("domain_name", ""),
                    "category": token.get("category", ""),
                    "category_name": token.get("category_name", "")
                }
        
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
            
            for text in texts:
                tokens = self._get_tokens_from_text(text, None, lowercase)
                for token in tokens:
                    if token.get("domain") == domain:
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

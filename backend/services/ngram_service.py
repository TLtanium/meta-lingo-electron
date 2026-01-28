"""
N-gram Analysis Service
Provides N-gram statistics using SpaCy annotation data
Supports 2-6 grams, multiple N selection, Nest N-gram grouping, POS filtering
"""

import os
import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
from collections import Counter, defaultdict
from pathlib import Path

from models.database import TextDB, CorpusDB

logger = logging.getLogger(__name__)


class NGramService:
    """N-gram analysis service using SpaCy annotations"""
    
    def __init__(self):
        pass
    
    def analyze(
        self,
        corpus_id: str,
        text_ids: List[str] | str = "all",
        n_values: List[int] = [2],
        pos_filter: Optional[Dict[str, Any]] = None,
        search_config: Optional[Dict[str, Any]] = None,
        min_freq: int = 1,
        max_freq: Optional[int] = None,
        min_word_length: int = 1,
        lowercase: bool = True,
        nest_ngram: bool = False
    ) -> Dict[str, Any]:
        """
        Perform N-gram analysis
        
        Args:
            corpus_id: Corpus ID
            text_ids: List of text IDs or "all" for all texts
            n_values: List of N values (2-6), can select multiple
            pos_filter: POS filter config {selectedPOS: [], keepMode: bool}
            search_config: Search config {searchType, searchValue, excludeWords}
            min_freq: Minimum frequency threshold
            max_freq: Maximum frequency threshold (optional)
            min_word_length: Minimum word length in characters
            lowercase: Convert all to lowercase
            nest_ngram: Enable Nest N-gram grouping
            
        Returns:
            Analysis results with N-gram frequencies
        """
        try:
            # Validate n_values
            n_values = [n for n in n_values if 2 <= n <= 6]
            if not n_values:
                n_values = [2]
            
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
            
            # Collect all tokens with POS info from SpaCy annotations
            all_token_data = []  # List of (text, pos, lemma) tuples
            
            for text in texts:
                token_data = self._get_token_data_from_text(text, lowercase)
                all_token_data.extend(token_data)
            
            if not all_token_data:
                return {
                    "success": True,
                    "results": [],
                    "total_ngrams": 0,
                    "n_values": n_values
                }
            
            # Generate N-grams for each N value
            all_ngram_counts: Dict[int, Counter] = {}
            
            for n in n_values:
                ngram_counts = self._generate_ngrams(
                    all_token_data, n, pos_filter, min_word_length
                )
                all_ngram_counts[n] = ngram_counts
            
            # Apply frequency filters
            filtered_counts: Dict[int, Dict[str, int]] = {}
            for n, counts in all_ngram_counts.items():
                filtered_counts[n] = self._apply_frequency_filters(
                    counts, min_freq, max_freq
                )
            
            # Apply search filters
            if search_config:
                for n in filtered_counts:
                    filtered_counts[n] = self._apply_search_filters(
                        filtered_counts[n], search_config
                    )
            
            # Build results
            results = []
            
            if nest_ngram and len(n_values) > 1:
                # Nest N-gram mode: group shorter N-grams under longer ones
                results = self._build_nested_results(filtered_counts, n_values)
            else:
                # Flat mode: just combine all results
                results = self._build_flat_results(filtered_counts)
            
            # Calculate total for percentage
            total_ngrams = sum(r["frequency"] for r in results)
            
            # Add percentage and rank
            for rank, result in enumerate(results, start=1):
                result["percentage"] = round(
                    (result["frequency"] / total_ngrams * 100) if total_ngrams > 0 else 0, 
                    4
                )
                result["rank"] = rank
            
            return {
                "success": True,
                "results": results,
                "total_ngrams": total_ngrams,
                "unique_ngrams": len(results),
                "n_values": n_values
            }
            
        except Exception as e:
            logger.error(f"N-gram analysis error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "results": []
            }
    
    def _get_token_data_from_text(
        self,
        text: Dict[str, Any],
        lowercase: bool
    ) -> List[Tuple[str, str, str]]:
        """
        Extract token data (text, pos, lemma) from a text's SpaCy annotation
        
        Args:
            text: Text database entry
            lowercase: Whether to lowercase tokens
            
        Returns:
            List of (text, pos, lemma) tuples
        """
        token_data = []
        
        # Get SpaCy annotation data
        spacy_data = self._load_spacy_annotation(text)
        if not spacy_data:
            return token_data
        
        # Handle different annotation formats
        if "tokens" in spacy_data:
            # Standard text annotation format
            token_data = self._extract_token_data(spacy_data["tokens"], lowercase)
        elif "segments" in spacy_data:
            # Segment-based annotation format (for audio/video)
            for seg_id, seg_data in spacy_data["segments"].items():
                if "tokens" in seg_data:
                    seg_tokens = self._extract_token_data(seg_data["tokens"], lowercase)
                    token_data.extend(seg_tokens)
        
        return token_data
    
    def _load_spacy_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Load SpaCy annotation for a text
        
        Args:
            text: Text database entry
            
        Returns:
            SpaCy annotation data or None
        """
        media_type = text.get('media_type', 'text')
        
        # For audio/video, check transcript JSON first
        if media_type in ['audio', 'video']:
            transcript_json = text.get('transcript_json_path')
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if 'spacy_annotations' in data:
                        return data['spacy_annotations']
                except Exception as e:
                    logger.warning(f"Failed to load transcript SpaCy: {e}")
        
        # For plain text, use .spacy.json file
        content_path = text.get('content_path')
        if not content_path:
            return None
        
        content_path = Path(content_path)
        spacy_path = content_path.parent / f"{content_path.stem}.spacy.json"
        
        if spacy_path.exists():
            try:
                with open(spacy_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load SpaCy annotation: {e}")
        
        return None
    
    def _extract_token_data(
        self,
        tokens: List[Dict[str, Any]],
        lowercase: bool
    ) -> List[Tuple[str, str, str]]:
        """
        Extract (text, pos, lemma) tuples from token list
        
        Args:
            tokens: List of token dictionaries from SpaCy
            lowercase: Whether to lowercase
            
        Returns:
            List of (text, pos, lemma) tuples
        """
        result = []
        
        for token in tokens:
            # Skip punctuation and spaces
            if token.get("is_punct") or token.get("is_space"):
                continue
            
            text = token.get("text", "")
            pos = token.get("pos", "")
            lemma = token.get("lemma", text)
            
            # Skip empty tokens
            if not text.strip():
                continue
            
            # Apply lowercase if requested
            if lowercase:
                text = text.lower()
                lemma = lemma.lower()
            
            result.append((text, pos, lemma))
        
        return result
    
    def _generate_ngrams(
        self,
        token_data: List[Tuple[str, str, str]],
        n: int,
        pos_filter: Optional[Dict[str, Any]],
        min_word_length: int
    ) -> Counter:
        """
        Generate N-grams from token data
        
        Args:
            token_data: List of (text, pos, lemma) tuples
            n: N-gram size
            pos_filter: POS filter config
            min_word_length: Minimum word length
            
        Returns:
            Counter of N-gram frequencies
        """
        ngram_counts = Counter()
        
        selected_pos = pos_filter.get("selectedPOS", []) if pos_filter else []
        keep_mode = pos_filter.get("keepMode", True) if pos_filter else True
        
        for i in range(len(token_data) - n + 1):
            ngram_tokens = token_data[i:i+n]
            
            # Check minimum word length for all tokens in N-gram
            if min_word_length > 1:
                if not all(len(t[0]) >= min_word_length for t in ngram_tokens):
                    continue
            
            # Apply POS filter - all tokens must satisfy the condition
            if selected_pos:
                pos_list = [t[1] for t in ngram_tokens]
                
                if keep_mode:
                    # Keep mode: all tokens must have selected POS
                    if not all(pos in selected_pos for pos in pos_list):
                        continue
                else:
                    # Filter mode: all tokens must NOT have selected POS
                    if any(pos in selected_pos for pos in pos_list):
                        continue
            elif keep_mode and pos_filter and len(selected_pos) == 0:
                # Keep mode with no selection - skip all (user warning should be shown)
                continue
            
            # Build N-gram string
            ngram_str = ' '.join(t[0] for t in ngram_tokens)
            ngram_counts[ngram_str] += 1
        
        return ngram_counts
    
    def _apply_frequency_filters(
        self,
        ngram_counts: Counter,
        min_freq: int,
        max_freq: Optional[int]
    ) -> Dict[str, int]:
        """
        Apply frequency filters to N-gram counts
        
        Args:
            ngram_counts: N-gram frequency counter
            min_freq: Minimum frequency
            max_freq: Maximum frequency (optional)
            
        Returns:
            Filtered N-gram counts
        """
        filtered = {}
        
        for ngram, count in ngram_counts.items():
            if count < min_freq:
                continue
            if max_freq is not None and count > max_freq:
                continue
            filtered[ngram] = count
        
        return filtered
    
    def _apply_search_filters(
        self,
        ngram_counts: Dict[str, int],
        search_config: Dict[str, Any]
    ) -> Dict[str, int]:
        """
        Apply search filters to N-gram counts
        
        Args:
            ngram_counts: N-gram frequency dictionary
            search_config: Search configuration
            
        Returns:
            Filtered N-gram counts
        """
        search_type = search_config.get("searchType", "all")
        search_value = search_config.get("searchValue", "").strip()
        exclude_words = search_config.get("excludeWords", [])
        
        # Convert exclude list to set for faster lookup
        if isinstance(exclude_words, str):
            exclude_set = set(w.strip().lower() for w in exclude_words.split('\n') if w.strip())
        else:
            exclude_set = set(w.lower() for w in exclude_words)
        
        filtered = {}
        
        for ngram, count in ngram_counts.items():
            ngram_lower = ngram.lower()
            
            # Check if any word in N-gram is in exclude list
            ngram_words = ngram_lower.split()
            if any(word in exclude_set for word in ngram_words):
                continue
            
            # Apply search filter
            if search_type == "all" or not search_value:
                filtered[ngram] = count
            elif search_type == "starts":
                # N-gram starts with search value
                if ngram_lower.startswith(search_value.lower()):
                    filtered[ngram] = count
            elif search_type == "ends":
                # N-gram ends with search value
                if ngram_lower.endswith(search_value.lower()):
                    filtered[ngram] = count
            elif search_type == "contains":
                # N-gram contains search value (as substring)
                if search_value.lower() in ngram_lower:
                    filtered[ngram] = count
            elif search_type == "contains_word":
                # N-gram contains search value as a word
                search_lower = search_value.lower()
                if search_lower in ngram_words:
                    filtered[ngram] = count
            elif search_type == "regex":
                try:
                    if re.search(search_value, ngram, re.IGNORECASE):
                        filtered[ngram] = count
                except re.error:
                    pass
            elif search_type == "wordlist":
                # Word list mode: N-gram must contain at least one word from list
                wordlist = set(w.strip().lower() for w in search_value.split('\n') if w.strip())
                if any(word in wordlist for word in ngram_words):
                    filtered[ngram] = count
        
        return filtered
    
    def _build_flat_results(
        self,
        filtered_counts: Dict[int, Dict[str, int]]
    ) -> List[Dict[str, Any]]:
        """
        Build flat results (no nesting)
        
        Args:
            filtered_counts: Dictionary of N -> {ngram: count}
            
        Returns:
            List of result dictionaries sorted by frequency
        """
        results = []
        
        for n, counts in filtered_counts.items():
            for ngram, count in counts.items():
                results.append({
                    "ngram": ngram,
                    "n": n,
                    "frequency": count,
                    "words": ngram.split()
                })
        
        # Sort by frequency descending
        results.sort(key=lambda x: x["frequency"], reverse=True)
        
        return results
    
    def _build_nested_results(
        self,
        filtered_counts: Dict[int, Dict[str, int]],
        n_values: List[int]
    ) -> List[Dict[str, Any]]:
        """
        Build nested results (Nest N-gram mode)
        
        Shorter N-grams that are sub-sequences of longer N-grams
        are grouped under the longer N-gram.
        
        Args:
            filtered_counts: Dictionary of N -> {ngram: count}
            n_values: List of N values
            
        Returns:
            List of result dictionaries with nested structure
        """
        # Sort N values in descending order to process longest first
        sorted_n = sorted(n_values, reverse=True)
        
        # Track which N-grams have been nested
        nested_set: Set[Tuple[int, str]] = set()
        
        results = []
        
        for n in sorted_n:
            if n not in filtered_counts:
                continue
                
            for ngram, count in filtered_counts[n].items():
                # Skip if already nested under another N-gram
                if (n, ngram) in nested_set:
                    continue
                
                # Find shorter N-grams that are sub-sequences of this N-gram
                nested = []
                ngram_words = ngram.split()
                
                for smaller_n in sorted_n:
                    if smaller_n >= n:
                        continue
                    
                    if smaller_n not in filtered_counts:
                        continue
                    
                    for smaller_ngram, smaller_count in filtered_counts[smaller_n].items():
                        # Check if smaller_ngram is a sub-sequence of ngram
                        smaller_words = smaller_ngram.split()
                        
                        if self._is_subsequence(smaller_words, ngram_words):
                            # Mark as nested
                            nested_set.add((smaller_n, smaller_ngram))
                            
                            nested.append({
                                "ngram": smaller_ngram,
                                "n": smaller_n,
                                "frequency": smaller_count,
                                "words": smaller_words
                            })
                
                result = {
                    "ngram": ngram,
                    "n": n,
                    "frequency": count,
                    "words": ngram_words
                }
                
                if nested:
                    # Sort nested by frequency
                    nested.sort(key=lambda x: x["frequency"], reverse=True)
                    result["nested"] = nested
                
                results.append(result)
        
        # Add any remaining un-nested N-grams
        for n in sorted_n:
            if n not in filtered_counts:
                continue
                
            for ngram, count in filtered_counts[n].items():
                if (n, ngram) not in nested_set:
                    # Already added as a parent
                    pass
        
        # Sort by frequency descending
        results.sort(key=lambda x: x["frequency"], reverse=True)
        
        return results
    
    def _is_subsequence(
        self,
        smaller: List[str],
        larger: List[str]
    ) -> bool:
        """
        Check if smaller word list is a contiguous subsequence of larger
        
        Args:
            smaller: Smaller word list
            larger: Larger word list
            
        Returns:
            True if smaller is a contiguous subsequence of larger
        """
        if len(smaller) >= len(larger):
            return False
        
        smaller_str = ' '.join(smaller)
        larger_str = ' '.join(larger)
        
        return smaller_str in larger_str


# Singleton instance
_ngram_service = None


def get_ngram_service() -> NGramService:
    """Get NGramService singleton"""
    global _ngram_service
    if _ngram_service is None:
        _ngram_service = NGramService()
    return _ngram_service

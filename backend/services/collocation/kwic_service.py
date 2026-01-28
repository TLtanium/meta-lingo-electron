"""
KWIC (Key Word In Context) Service
Provides KWIC search functionality with 6 search modes based on Sketch Engine

Search Modes:
- simple: Match words or lemmas with wildcards (*, ?, |, --)
- lemma: Lemma-based search with regex support
- phrase: Exact phrase match with regex support
- word: Exact word form match with regex support
- character: Contains specific character/string
- cql: Corpus Query Language
"""

import os
import re
import json
import random
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
from pathlib import Path
from collections import Counter

from models.database import TextDB, CorpusDB
from .pos_filter import POSFilter
from .cql_engine import CQLEngine, CQLParseError

logger = logging.getLogger(__name__)


class KWICService:
    """
    KWIC Search Service with 6 search modes
    """
    
    # Search mode constants
    MODE_SIMPLE = 'simple'
    MODE_LEMMA = 'lemma'
    MODE_PHRASE = 'phrase'
    MODE_WORD = 'word'
    MODE_CHARACTER = 'character'
    MODE_CQL = 'cql'
    
    # Sort mode constants
    SORT_LEFT_CONTEXT = 'left_context'
    SORT_RIGHT_CONTEXT = 'right_context'
    SORT_POSITION = 'position'
    SORT_FREQUENCY = 'frequency'
    SORT_RANDOM = 'random'
    
    def __init__(self):
        self.cql_engine = CQLEngine()
    
    def search(
        self,
        corpus_id: str,
        text_ids: List[str] | str,
        search_mode: str,
        search_value: str,
        context_size: int = 5,
        lowercase: bool = False,
        pos_filter: Optional[Dict[str, Any]] = None,
        sort_by: str = None,
        sort_levels: List[str] = None,
        sort_descending: bool = False,
        max_results: int = None
    ) -> Dict[str, Any]:
        """
        Perform KWIC search
        
        Args:
            corpus_id: Corpus ID
            text_ids: List of text IDs or "all"
            search_mode: Search mode (simple, lemma, phrase, word, character, cql)
            search_value: Search value/query
            context_size: Number of context words on each side
            lowercase: Convert to lowercase for matching
            pos_filter: POS filter config {selectedPOS: [], keepMode: bool}
            sort_by: Sort mode (left_context, right_context, position, frequency, random)
            sort_levels: Sort levels for context sorting (e.g., ["1L", "2L", "3L"])
            sort_descending: Sort descending
            max_results: Maximum number of results
            
        Returns:
            Search results dictionary
        """
        try:
            # Get texts from corpus
            if text_ids == "all":
                texts = TextDB.list_by_corpus(corpus_id)
            else:
                texts = [TextDB.get_by_id(tid) for tid in text_ids if TextDB.get_by_id(tid)]
            
            if not texts:
                return {
                    'success': False,
                    'error': 'No texts found',
                    'results': [],
                    'total_count': 0
                }
            
            # Create POS filter if provided
            pos_filter_obj = None
            if pos_filter and pos_filter.get('selectedPOS'):
                pos_filter_obj = POSFilter(
                    selected_pos=pos_filter['selectedPOS'],
                    keep_mode=pos_filter.get('keepMode', True)
                )
            
            # Validate: in keep mode with no POS selected, return warning
            if pos_filter and pos_filter.get('keepMode', False) and not pos_filter.get('selectedPOS'):
                return {
                    'success': False,
                    'error': 'Keep mode requires at least one POS tag selected',
                    'results': [],
                    'total_count': 0
                }
            
            # Collect all KWIC results
            all_results = []
            
            for text in texts:
                # Load SpaCy annotation
                spacy_data = self._load_spacy_annotation(text)
                if not spacy_data:
                    continue
                
                # Get tokens
                tokens = self._get_tokens_from_spacy(spacy_data)
                if not tokens:
                    continue
                
                # Load MIPVU data for metaphor info
                mipvu_map = self._load_mipvu_map(text)
                
                # Apply lowercase if requested
                if lowercase:
                    for token in tokens:
                        token['word_lower'] = token.get('text', '').lower()
                        token['lemma_lower'] = token.get('lemma', '').lower()
                
                # Search based on mode
                matches = self._search_tokens(
                    tokens, search_mode, search_value, 
                    context_size, lowercase, pos_filter_obj
                )
                
                # Add source info and metaphor status to matches
                for match in matches:
                    match['text_id'] = text['id']
                    match['filename'] = text.get('filename', 'unknown')
                    match['corpus_id'] = corpus_id
                    # Check if keyword is metaphor using position
                    match['is_metaphor'] = self._check_is_metaphor(match, mipvu_map)
                
                all_results.extend(matches)
            
            # Sort results
            if sort_by or sort_levels:
                all_results = self._sort_results(
                    all_results, sort_by, sort_levels, sort_descending
                )
            
            # Apply max results limit
            total_count = len(all_results)
            if max_results and len(all_results) > max_results:
                all_results = all_results[:max_results]
            
            return {
                'success': True,
                'results': all_results,
                'total_count': total_count,
                'displayed_count': len(all_results)
            }
            
        except CQLParseError as e:
            return {
                'success': False,
                'error': f'CQL parse error: {str(e)}',
                'results': [],
                'total_count': 0
            }
        except Exception as e:
            logger.error(f"KWIC search error: {e}")
            return {
                'success': False,
                'error': str(e),
                'results': [],
                'total_count': 0
            }
    
    def _load_spacy_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Load SpaCy annotation for a text"""
        media_type = text.get('media_type', 'text')
        
        # For audio/video, check transcript JSON
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
    
    def _load_mipvu_map(self, text: Dict[str, Any]) -> Dict[Tuple[int, int], bool]:
        """
        Load MIPVU annotation data and build a position -> is_metaphor map
        
        Args:
            text: Text database entry
            
        Returns:
            Dictionary mapping (start, end) positions to is_metaphor bool
        """
        mipvu_map = {}
        
        media_type = text.get('media_type', 'text')
        
        # For audio/video, check transcript JSON
        if media_type in ['audio', 'video']:
            transcript_json = text.get('transcript_json_path')
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    mipvu_data = data.get('mipvu_annotations')
                    if mipvu_data:
                        return self._build_mipvu_map_from_data(mipvu_data)
                except Exception as e:
                    logger.debug(f"Failed to load transcript MIPVU: {e}")
        
        # For plain text, use .mipvu.json file
        content_path = text.get('content_path')
        if not content_path:
            return mipvu_map
        
        content_path = Path(content_path)
        mipvu_path = content_path.parent / f"{content_path.stem}.mipvu.json"
        
        if mipvu_path.exists():
            try:
                with open(mipvu_path, 'r', encoding='utf-8') as f:
                    mipvu_data = json.load(f)
                return self._build_mipvu_map_from_data(mipvu_data)
            except Exception as e:
                logger.debug(f"Failed to load MIPVU annotation: {e}")
        
        return mipvu_map
    
    def _build_mipvu_map_from_data(self, mipvu_data: Dict[str, Any]) -> Dict[Tuple[int, int], bool]:
        """Build position map from MIPVU data"""
        mipvu_map = {}
        
        if not mipvu_data or not mipvu_data.get('success', False):
            return mipvu_map
        
        sentences = mipvu_data.get('sentences', [])
        for sentence in sentences:
            tokens = sentence.get('tokens', [])
            for token in tokens:
                start = token.get('start', -1)
                end = token.get('end', -1)
                is_metaphor = token.get('is_metaphor', False)
                if start >= 0 and end >= 0:
                    mipvu_map[(start, end)] = is_metaphor
        
        return mipvu_map
    
    def _check_is_metaphor(self, match: Dict[str, Any], mipvu_map: Dict[Tuple[int, int], bool]) -> bool:
        """
        Check if the matched keyword is a metaphor
        
        Args:
            match: Match result with matched_tokens
            mipvu_map: Position to is_metaphor map
            
        Returns:
            True if keyword is metaphor
        """
        if not mipvu_map:
            return False
        
        matched_tokens = match.get('matched_tokens', [])
        for token in matched_tokens:
            start = token.get('start', -1)
            end = token.get('end', -1)
            if (start, end) in mipvu_map and mipvu_map[(start, end)]:
                return True
        
        return False
    
    def _get_tokens_from_spacy(self, spacy_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract tokens from SpaCy data"""
        tokens = []
        
        if "tokens" in spacy_data:
            # Standard text annotation format
            raw_tokens = spacy_data["tokens"]
            for idx, token in enumerate(raw_tokens):
                tokens.append({
                    'text': token.get('text', ''),
                    'word': token.get('text', ''),
                    'lemma': token.get('lemma', ''),
                    'pos': token.get('pos', ''),
                    'tag': token.get('tag', ''),
                    'dep': token.get('dep', ''),
                    'head': token.get('head', idx),  # Head index for dependency
                    'idx': idx,  # Token index
                    'start': token.get('start', 0),
                    'end': token.get('end', 0),
                    'is_punct': token.get('is_punct', False),
                    'is_space': token.get('is_space', False)
                })
            
            # Post-process: populate head-based attributes for CQL matching
            for token in tokens:
                head_idx = token.get('head', token.get('idx', 0))
                if 0 <= head_idx < len(tokens):
                    head_token = tokens[head_idx]
                    token['headword'] = head_token.get('word', '')
                    token['headlemma'] = head_token.get('lemma', '')
                    token['headpos'] = head_token.get('pos', '')
                    token['headdep'] = head_token.get('dep', '')
                else:
                    token['headword'] = ''
                    token['headlemma'] = ''
                    token['headpos'] = ''
                    token['headdep'] = ''
                    
        elif "segments" in spacy_data:
            # Segment-based format (audio/video)
            for seg_id, seg_data in spacy_data["segments"].items():
                if "tokens" in seg_data:
                    seg_start = seg_data.get('segment_start', 0)
                    raw_tokens = seg_data["tokens"]
                    seg_offset = len(tokens)  # Offset for this segment
                    
                    for idx, token in enumerate(raw_tokens):
                        tokens.append({
                            'text': token.get('text', ''),
                            'word': token.get('text', ''),
                            'lemma': token.get('lemma', ''),
                            'pos': token.get('pos', ''),
                            'tag': token.get('tag', ''),
                            'dep': token.get('dep', ''),
                            'head': token.get('head', idx),  # Head index (relative to segment)
                            'idx': seg_offset + idx,  # Global token index
                            'start': token.get('start', 0),
                            'end': token.get('end', 0),
                            'segment_id': seg_id,
                            'segment_start': seg_start,
                            'is_punct': token.get('is_punct', False),
                            'is_space': token.get('is_space', False)
                        })
                    
                    # Post-process: populate head-based attributes for this segment
                    for i in range(seg_offset, len(tokens)):
                        token = tokens[i]
                        head_idx = token.get('head', 0) + seg_offset
                        if seg_offset <= head_idx < len(tokens):
                            head_token = tokens[head_idx]
                            token['headword'] = head_token.get('word', '')
                            token['headlemma'] = head_token.get('lemma', '')
                            token['headpos'] = head_token.get('pos', '')
                            token['headdep'] = head_token.get('dep', '')
                        else:
                            token['headword'] = ''
                            token['headlemma'] = ''
                            token['headpos'] = ''
                            token['headdep'] = ''
        
        return tokens
    
    def _search_tokens(
        self,
        tokens: List[Dict[str, Any]],
        search_mode: str,
        search_value: str,
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """
        Search tokens based on mode
        """
        if search_mode == self.MODE_CQL:
            return self._search_cql(tokens, search_value, context_size, pos_filter)
        elif search_mode == self.MODE_SIMPLE:
            return self._search_simple(tokens, search_value, context_size, lowercase, pos_filter)
        elif search_mode == self.MODE_LEMMA:
            return self._search_lemma(tokens, search_value, context_size, lowercase, pos_filter)
        elif search_mode == self.MODE_PHRASE:
            return self._search_phrase(tokens, search_value, context_size, lowercase, pos_filter)
        elif search_mode == self.MODE_WORD:
            return self._search_word(tokens, search_value, context_size, lowercase, pos_filter)
        elif search_mode == self.MODE_CHARACTER:
            return self._search_character(tokens, search_value, context_size, lowercase, pos_filter)
        else:
            # Default to simple search
            return self._search_simple(tokens, search_value, context_size, lowercase, pos_filter)
    
    def _wildcard_to_regex(self, pattern: str) -> str:
        """
        Convert wildcard pattern to regex
        
        Wildcards:
        - * : any number of characters (becomes .*)
        - ? : exactly one character (becomes .)
        - -- : optional hyphen or space (becomes [-\\s]?)
        
        Note: | for alternatives is handled separately at phrase level
        """
        # First escape regex special chars except our wildcards
        escaped = ''
        i = 0
        while i < len(pattern):
            char = pattern[i]
            if char == '*':
                escaped += '.*'
            elif char == '?':
                escaped += '.'
            elif i < len(pattern) - 1 and pattern[i:i+2] == '--':
                escaped += '[-\\s]?'
                i += 1  # Skip extra -
            elif char in r'\.^$+{}[]()':
                escaped += '\\' + char
            else:
                escaped += char
            i += 1
        
        return escaped
    
    def _search_simple(
        self,
        tokens: List[Dict[str, Any]],
        search_value: str,
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """
        Simple search - matches words or lemmas with wildcard support
        
        Wildcards:
        - * : any number of characters
        - ? : exactly one character  
        - | : alternatives (word1|word2)
        - -- : hyphen variants (multi--billion matches multi-billion, multibillion, multi billion)
        """
        results = []
        
        # Handle | for alternatives - split and search each
        if '|' in search_value:
            alternatives = search_value.split('|')
            for alt in alternatives:
                alt = alt.strip()
                if alt:
                    results.extend(self._search_simple_single(
                        tokens, alt, context_size, lowercase, pos_filter
                    ))
            return results
        
        return self._search_simple_single(tokens, search_value, context_size, lowercase, pos_filter)
    
    def _search_simple_single(
        self,
        tokens: List[Dict[str, Any]],
        search_value: str,
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """Search for a single simple pattern (word or phrase with wildcards)"""
        results = []
        
        # Check if it's a multi-word phrase
        words = search_value.split()
        if len(words) > 1:
            # Multi-word simple search
            return self._search_simple_phrase(tokens, words, context_size, lowercase, pos_filter)
        
        # Single word search - convert wildcards to regex
        pattern = self._wildcard_to_regex(search_value)
        
        try:
            if lowercase:
                regex = re.compile(f'^{pattern}$', re.IGNORECASE)
            else:
                regex = re.compile(f'^{pattern}$')
        except re.error:
            # If regex fails, do literal match
            regex = None
        
        for i, token in enumerate(tokens):
            # Skip punctuation and spaces
            if token.get('is_punct') or token.get('is_space'):
                continue
            
            # Apply POS filter
            if pos_filter and not pos_filter.should_include(token.get('pos', '')):
                continue
            
            # Get word and lemma
            word = token.get('word_lower' if lowercase else 'text', '')
            lemma = token.get('lemma_lower' if lowercase else 'lemma', '')
            
            # Check match against word or lemma
            match = False
            if regex:
                match = regex.match(word) is not None or regex.match(lemma) is not None
            else:
                # Literal match
                target = search_value.lower() if lowercase else search_value
                match = word == target or lemma == target
            
            if match:
                result = self._build_result(tokens, i, 1, context_size)
                results.append(result)
        
        return results
    
    def _search_simple_phrase(
        self,
        tokens: List[Dict[str, Any]],
        words: List[str],
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """Search for multi-word simple phrase with wildcards"""
        results = []
        n_tokens = len(tokens)
        n_words = len(words)
        
        # Build regex patterns for each word
        patterns = []
        for word in words:
            pattern = self._wildcard_to_regex(word)
            try:
                if lowercase:
                    patterns.append(re.compile(f'^{pattern}$', re.IGNORECASE))
                else:
                    patterns.append(re.compile(f'^{pattern}$'))
            except re.error:
                patterns.append(None)
        
        # Filter non-content tokens for matching
        content_indices = []
        for i, token in enumerate(tokens):
            if not token.get('is_punct') and not token.get('is_space'):
                content_indices.append(i)
        
        # Search for phrase
        for start_idx in range(len(content_indices) - n_words + 1):
            match = True
            matched_indices = []
            all_pos_valid = True
            
            for j, pattern in enumerate(patterns):
                token_idx = content_indices[start_idx + j]
                token = tokens[token_idx]
                
                word_val = token.get('word_lower' if lowercase else 'text', '')
                lemma_val = token.get('lemma_lower' if lowercase else 'lemma', '')
                
                # Check match
                if pattern:
                    word_match = pattern.match(word_val) is not None or pattern.match(lemma_val) is not None
                else:
                    target = words[j].lower() if lowercase else words[j]
                    word_match = word_val == target or lemma_val == target
                
                if not word_match:
                    match = False
                    break
                
                # Check POS filter for ALL words in phrase
                if pos_filter and not pos_filter.should_include(token.get('pos', '')):
                    all_pos_valid = False
                    break
                
                matched_indices.append(token_idx)
            
            if match and all_pos_valid:
                result = self._build_result(
                    tokens, 
                    matched_indices[0], 
                    matched_indices[-1] - matched_indices[0] + 1,
                    context_size
                )
                results.append(result)
        
        return results
    
    def _search_lemma(
        self,
        tokens: List[Dict[str, Any]],
        search_value: str,
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """
        Lemma search - find all word forms of a lemma
        Supports regular expressions
        """
        results = []
        
        # Build regex pattern
        try:
            if lowercase:
                regex = re.compile(f'^{search_value}$', re.IGNORECASE)
            else:
                regex = re.compile(f'^{search_value}$')
        except re.error:
            # If regex fails, do literal match
            regex = None
        
        for i, token in enumerate(tokens):
            # Skip punctuation and spaces
            if token.get('is_punct') or token.get('is_space'):
                continue
            
            # Apply POS filter
            if pos_filter and not pos_filter.should_include(token.get('pos', '')):
                continue
            
            # Get lemma
            lemma = token.get('lemma_lower' if lowercase else 'lemma', '')
            
            # Check match against lemma only
            match = False
            if regex:
                match = regex.match(lemma) is not None
            else:
                target = search_value.lower() if lowercase else search_value
                match = lemma == target
            
            if match:
                result = self._build_result(tokens, i, 1, context_size)
                results.append(result)
        
        return results
    
    def _search_phrase(
        self,
        tokens: List[Dict[str, Any]],
        phrase: str,
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """
        Phrase search - exact phrase match
        Supports regular expressions
        """
        results = []
        n_tokens = len(tokens)
        
        # Tokenize phrase
        phrase_words = phrase.split()
        if not phrase_words:
            return results
        
        n_phrase = len(phrase_words)
        
        # Build regex patterns
        patterns = []
        for word in phrase_words:
            try:
                if lowercase:
                    patterns.append(re.compile(f'^{word}$', re.IGNORECASE))
                else:
                    patterns.append(re.compile(f'^{word}$'))
            except re.error:
                patterns.append(None)
        
        # Filter non-content tokens for matching
        content_indices = []
        for i, token in enumerate(tokens):
            if not token.get('is_punct') and not token.get('is_space'):
                content_indices.append(i)
        
        # Search for phrase
        for start_idx in range(len(content_indices) - n_phrase + 1):
            match = True
            matched_indices = []
            all_pos_valid = True
            
            for j, pattern in enumerate(patterns):
                token_idx = content_indices[start_idx + j]
                token = tokens[token_idx]
                token_word = token.get('word_lower' if lowercase else 'text', '')
                
                # Check match
                if pattern:
                    if not pattern.match(token_word):
                        match = False
                        break
                else:
                    target = phrase_words[j].lower() if lowercase else phrase_words[j]
                    if token_word != target:
                        match = False
                        break
                
                # Check POS filter for ALL words
                if pos_filter and not pos_filter.should_include(token.get('pos', '')):
                    all_pos_valid = False
                    break
                
                matched_indices.append(token_idx)
            
            if match and all_pos_valid:
                result = self._build_result(
                    tokens, 
                    matched_indices[0], 
                    matched_indices[-1] - matched_indices[0] + 1,
                    context_size
                )
                result['matched_phrase'] = phrase
                results.append(result)
        
        return results
    
    def _search_word(
        self,
        tokens: List[Dict[str, Any]],
        search_value: str,
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """
        Word search - exact word form match
        Supports regular expressions
        """
        results = []
        
        # Build regex pattern
        try:
            if lowercase:
                regex = re.compile(f'^{search_value}$', re.IGNORECASE)
            else:
                regex = re.compile(f'^{search_value}$')
        except re.error:
            regex = None
        
        for i, token in enumerate(tokens):
            # Skip punctuation and spaces
            if token.get('is_punct') or token.get('is_space'):
                continue
            
            # Apply POS filter
            if pos_filter and not pos_filter.should_include(token.get('pos', '')):
                continue
            
            # Get word form
            word = token.get('word_lower' if lowercase else 'text', '')
            
            # Check exact word form match
            match = False
            if regex:
                match = regex.match(word) is not None
            else:
                target = search_value.lower() if lowercase else search_value
                match = word == target
            
            if match:
                result = self._build_result(tokens, i, 1, context_size)
                results.append(result)
        
        return results
    
    def _search_character(
        self,
        tokens: List[Dict[str, Any]],
        search_value: str,
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """
        Character search - find tokens containing specific characters
        """
        results = []
        
        search_val = search_value.lower() if lowercase else search_value
        
        for i, token in enumerate(tokens):
            # Skip punctuation and spaces
            if token.get('is_punct') or token.get('is_space'):
                continue
            
            # Apply POS filter
            if pos_filter and not pos_filter.should_include(token.get('pos', '')):
                continue
            
            # Get word
            word = token.get('word_lower' if lowercase else 'text', '')
            
            # Check if contains the character/string
            if search_val in word:
                result = self._build_result(tokens, i, 1, context_size)
                results.append(result)
        
        return results
    
    def _search_cql(
        self,
        tokens: List[Dict[str, Any]],
        cql_query: str,
        context_size: int,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """Search using CQL query - CQL has priority over POS filter"""
        results = []
        
        # Parse CQL query
        parsed = self.cql_engine.parse(cql_query)
        
        # Find matches
        for match in self.cql_engine.find_matches(tokens, parsed, context_size):
            # For CQL, we do NOT apply external POS filter as CQL has its own pos conditions
            # The POS filter in UI should be ignored for CQL mode
            
            result = {
                'position': match['position'],
                'keyword': ' '.join(t.get('text', '') for t in match['matched_tokens']),
                'left_context': [t.get('text', '') for t in match['left_context']],
                'right_context': [t.get('text', '') for t in match['right_context']],
                'matched_tokens': match['matched_tokens'],
                'pos': match['matched_tokens'][0].get('pos', '') if match['matched_tokens'] else ''
            }
            results.append(result)
        
        return results
    
    def _build_result(
        self,
        tokens: List[Dict[str, Any]],
        match_start: int,
        match_length: int,
        context_size: int
    ) -> Dict[str, Any]:
        """Build a KWIC result dictionary"""
        n_tokens = len(tokens)
        match_end = match_start + match_length
        
        # Get matched tokens
        matched_tokens = tokens[match_start:match_end]
        
        # Get context (exclude punct/space for cleaner display)
        left_context = []
        right_context = []
        
        # Left context
        left_start = max(0, match_start - context_size * 2)  # Get more to filter
        for i in range(match_start - 1, left_start - 1, -1):
            if i < 0:
                break
            token = tokens[i]
            if not token.get('is_space'):
                left_context.insert(0, token.get('text', ''))
                if len(left_context) >= context_size:
                    break
        
        # Right context
        right_end = min(n_tokens, match_end + context_size * 2)
        for i in range(match_end, right_end):
            token = tokens[i]
            if not token.get('is_space'):
                right_context.append(token.get('text', ''))
                if len(right_context) >= context_size:
                    break
        
        return {
            'position': match_start,
            'keyword': ' '.join(t.get('text', '') for t in matched_tokens),
            'left_context': left_context,
            'right_context': right_context,
            'matched_tokens': matched_tokens,
            'pos': matched_tokens[0].get('pos', '') if matched_tokens else ''
        }
    
    def _sort_results(
        self,
        results: List[Dict[str, Any]],
        sort_by: str,
        sort_levels: List[str],
        descending: bool
    ) -> List[Dict[str, Any]]:
        """Sort KWIC results"""
        if sort_by == self.SORT_RANDOM:
            random.shuffle(results)
            return results
        
        if sort_by == self.SORT_POSITION:
            return sorted(
                results,
                key=lambda x: (x.get('text_id', ''), x.get('position', 0)),
                reverse=descending
            )
        
        if sort_by == self.SORT_FREQUENCY:
            # Sort by keyword frequency
            keyword_counts = Counter(r['keyword'] for r in results)
            return sorted(
                results,
                key=lambda x: keyword_counts[x['keyword']],
                reverse=not descending  # Higher frequency first by default
            )
        
        # Sort by context (left or right)
        if sort_levels:
            def get_sort_key(result):
                keys = []
                for level_str in sort_levels:
                    # Parse level string: "position:attribute:options"
                    # e.g., "1L:lemma:ignoreCase", "KWIC:pos", "1R"
                    parts = level_str.split(':')
                    position = parts[0]
                    attribute = parts[1] if len(parts) > 1 else 'word'
                    ignore_case = 'ignoreCase' in parts
                    retrograde = 'retrograde' in parts
                    
                    # Get matched tokens for attribute extraction
                    matched_tokens = result.get('matched_tokens', [])
                    
                    if position == 'KWIC':
                        # Sort by KWIC (keyword) attribute
                        if matched_tokens:
                            token = matched_tokens[0]
                            if attribute == 'pos':
                                value = token.get('pos', '')
                            elif attribute == 'lemma':
                                value = token.get('lemma', token.get('text', ''))
                            else:  # word
                                value = token.get('text', '')
                        else:
                            value = result.get('keyword', '')
                        
                        if ignore_case:
                            value = value.lower()
                        if retrograde:
                            value = value[::-1]  # Reverse string for retrograde
                        keys.append(value)
                    elif position.endswith('L'):
                        # Left context
                        idx = int(position[:-1]) - 1
                        context = result.get('left_context', [])
                        if idx < len(context):
                            # For context positions, we only have text, so attribute is ignored
                            # (context tokens don't have lemma/pos info stored)
                            value = context[-(idx + 1)]
                            if ignore_case:
                                value = value.lower()
                            if retrograde:
                                value = value[::-1]
                            keys.append(value)
                        else:
                            keys.append('')
                    elif position.endswith('R'):
                        # Right context
                        idx = int(position[:-1]) - 1
                        context = result.get('right_context', [])
                        if idx < len(context):
                            # For context positions, we only have text, so attribute is ignored
                            # (context tokens don't have lemma/pos info stored)
                            value = context[idx]
                            if ignore_case:
                                value = value.lower()
                            if retrograde:
                                value = value[::-1]
                            keys.append(value)
                        else:
                            keys.append('')
                    elif position == 'C':
                        # Keyword (same as KWIC)
                        if matched_tokens:
                            token = matched_tokens[0]
                            if attribute == 'pos':
                                value = token.get('pos', '')
                            elif attribute == 'lemma':
                                value = token.get('lemma', token.get('text', ''))
                            else:
                                value = token.get('text', '')
                        else:
                            value = result.get('keyword', '')
                        if ignore_case:
                            value = value.lower()
                        if retrograde:
                            value = value[::-1]
                        keys.append(value)
                    elif position == 'frec':
                        # Frequency - handled separately
                        keys.append(0)
                    elif position == 'loc':
                        keys.append(result.get('position', 0))
                    elif position == 'file ID':
                        keys.append(result.get('text_id', ''))
                    else:
                        # Unknown position, use empty string
                        keys.append('')
                return tuple(keys)
            
            return sorted(results, key=get_sort_key, reverse=descending)
        
        # Default sort by left context
        if sort_by == self.SORT_LEFT_CONTEXT:
            return sorted(
                results,
                key=lambda x: ' '.join(x.get('left_context', [])).lower(),
                reverse=descending
            )
        
        if sort_by == self.SORT_RIGHT_CONTEXT:
            return sorted(
                results,
                key=lambda x: ' '.join(x.get('right_context', [])).lower(),
                reverse=descending
            )
        
        return results
    
    def get_extended_context(
        self,
        corpus_id: str,
        text_id: str,
        position: int,
        context_chars: int = 200
    ) -> Dict[str, Any]:
        """
        Get extended context for a KWIC result
        """
        try:
            text = TextDB.get_by_id(text_id)
            if not text:
                return {'success': False, 'error': 'Text not found'}
            
            # Load SpaCy annotation to find character position
            spacy_data = self._load_spacy_annotation(text)
            if not spacy_data:
                return {'success': False, 'error': 'SpaCy annotation not found'}
            
            tokens = self._get_tokens_from_spacy(spacy_data)
            if position >= len(tokens):
                return {'success': False, 'error': 'Position out of range'}
            
            token = tokens[position]
            keyword_text = token.get('text', '')
            
            # Load full text content
            content_path = text.get('content_path')
            if not content_path or not os.path.exists(content_path):
                return {'success': False, 'error': 'Content file not found'}
            
            with open(content_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Normalize line endings to Unix style (\n) to match frontend display
            # This is critical: Windows \r\n (2 chars) vs Unix \n (1 char) causes
            # character offset drift that breaks highlight alignment
            content = content.replace('\r\n', '\n').replace('\r', '\n')
            
            # For standard text format, use stored positions
            if "tokens" in spacy_data:
                char_start = token.get('start', 0)
                char_end = token.get('end', char_start + len(keyword_text))
            else:
                # For segments format, reconstruct by finding the keyword
                occurrence_count = 0
                for i in range(position):
                    if tokens[i].get('text', '') == keyword_text:
                        occurrence_count += 1
                
                search_start = 0
                for _ in range(occurrence_count + 1):
                    found_pos = content.find(keyword_text, search_start)
                    if found_pos == -1:
                        avg_token_len = len(content) / max(len(tokens), 1)
                        char_start = int(position * avg_token_len)
                        char_end = char_start + len(keyword_text)
                        break
                    search_start = found_pos + 1
                else:
                    char_start = content.find(keyword_text, search_start - 1)
                    if char_start == -1:
                        char_start = search_start - 1
                    char_end = char_start + len(keyword_text)
            
            # Ensure positions are within bounds
            char_start = max(0, min(char_start, len(content) - 1))
            char_end = max(char_start, min(char_end, len(content)))
            
            # Extract extended context
            ext_start = max(0, char_start - context_chars)
            ext_end = min(len(content), char_end + context_chars)
            
            extended_text = content[ext_start:ext_end]
            keyword_in_context = content[char_start:char_end]
            
            # Calculate relative position for highlighting
            highlight_start = char_start - ext_start
            highlight_end = char_end - ext_start
            
            # Verify highlight position by checking if keyword matches
            if extended_text[highlight_start:highlight_end] != keyword_in_context:
                keyword_pos = extended_text.find(keyword_text)
                if keyword_pos != -1:
                    highlight_start = keyword_pos
                    highlight_end = keyword_pos + len(keyword_text)
            
            return {
                'success': True,
                'text': extended_text,
                'keyword': keyword_in_context,
                'highlight_start': highlight_start,
                'highlight_end': highlight_end,
                'text_id': text_id,
                'filename': text.get('filename', 'unknown')
            }
            
        except Exception as e:
            logger.error(f"Get extended context error: {e}")
            return {'success': False, 'error': str(e)}
    
    def parse_cql(self, query: str) -> Dict[str, Any]:
        """
        Parse and validate a CQL query
        """
        return self.cql_engine.validate_query(query)


# Singleton instance
_kwic_service = None


def get_kwic_service() -> KWICService:
    """Get KWIC service singleton"""
    global _kwic_service
    if _kwic_service is None:
        _kwic_service = KWICService()
    return _kwic_service

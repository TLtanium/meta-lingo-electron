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
- wordlist: Multiple words/phrases, one per line; results for all that exist (missing entries do not affect others)
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
from services.corpus_path_utils import resolve_stored_path, find_usas_sidecar_path
from .pos_filter import POSFilter
from .cql_engine import (
    CQLEngine,
    CQLParseError,
    CQLQuery,
    WithinQuery,
    ContainingQuery,
    MeetQuery,
    StructuralPattern,
    TokenPattern,
)

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
    MODE_WORDLIST = 'wordlist'
    
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
                # Merge USAS tags for CQL usas attribute
                self._merge_usas_into_tokens(tokens, text)
                # Merge NRC emotion tags for CQL nrc attribute
                self._merge_nrc_into_tokens(tokens, text)

                # Load MIPVU data for metaphor info and CQL mipvu attribute
                mipvu_map = self._load_mipvu_map(text)
                # Merge mipvu_tag into tokens for CQL [mipvu=="indirect"] etc.
                self._merge_mipvu_into_tokens(tokens, mipvu_map)

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
                    # Check keyword MIPVU labels using position
                    match['is_metaphor'] = self._check_is_metaphor(match, mipvu_map)
                    match['is_direct_metaphor'] = self._check_mipvu_flag(match, mipvu_map, 'is_direct')
                    match['is_mflag'] = self._check_mipvu_flag(match, mipvu_map, 'is_mflag')
                
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
    
    def _load_mipvu_map(self, text: Dict[str, Any]) -> Dict[Tuple[int, int], Dict[str, bool]]:
        """
        Load MIPVU annotation data and build a position → mipvu-labels map.

        Returns:
            Dict mapping (start, end) → {'is_metaphor': bool, 'is_direct': bool, 'is_mflag': bool}
        """
        mipvu_map: Dict[Tuple[int, int], Dict[str, bool]] = {}
        
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
    
    def _build_mipvu_map_from_data(self, mipvu_data: Dict[str, Any]) -> Dict[Tuple[int, int], Dict[str, bool]]:
        """
        Build position map from MIPVU data.

        Returns:
            Dict mapping (start, end) → {'is_metaphor': bool, 'is_direct': bool, 'is_mflag': bool}
        """
        mipvu_map: Dict[Tuple[int, int], Dict[str, bool]] = {}

        if not mipvu_data or not mipvu_data.get('success', False):
            return mipvu_map

        sentences = mipvu_data.get('sentences', [])
        for sentence in sentences:
            tokens = sentence.get('tokens', [])
            for token in tokens:
                start = token.get('start', -1)
                end = token.get('end', -1)
                if start >= 0 and end >= 0:
                    mipvu_map[(start, end)] = {
                        'is_metaphor': bool(token.get('is_metaphor', False)),
                        'is_direct': bool(token.get('is_direct_metaphor', False)),
                        'is_mflag': bool(token.get('is_mflag', False)),
                    }

        return mipvu_map
    
    def _check_is_metaphor(self, match: Dict[str, Any], mipvu_map: Dict[Tuple[int, int], Dict[str, bool]]) -> bool:
        """Return True if any matched token is an indirect metaphor (is_metaphor=True)."""
        if not mipvu_map:
            return False
        matched_tokens = match.get('matched_tokens', [])
        for token in matched_tokens:
            start = token.get('start', -1)
            end = token.get('end', -1)
            entry = mipvu_map.get((start, end))
            if entry and entry.get('is_metaphor', False):
                return True
        return False

    def _check_mipvu_flag(
        self,
        match: Dict[str, Any],
        mipvu_map: Dict[Tuple[int, int], Dict[str, bool]],
        flag: str,
    ) -> bool:
        """Return True if any matched token has the given MIPVU flag set."""
        if not mipvu_map:
            return False
        for token in match.get('matched_tokens', []):
            entry = mipvu_map.get((token.get('start', -1), token.get('end', -1)))
            if entry and entry.get(flag, False):
                return True
        return False

    def _merge_mipvu_into_tokens(
        self,
        tokens: List[Dict[str, Any]],
        mipvu_map: Dict[Tuple[int, int], Dict[str, bool]],
    ) -> None:
        """
        Merge MIPVU labels into token list as a ``mipvu_tag`` field.

        The field contains space-separated applicable labels drawn from
        {'indirect', 'direct', 'mflag'}.  A token with no MIPVU annotation
        gets ``mipvu_tag = 'none'``.

        This mirrors the NRC pattern so CQL can use ``mipvu=="indirect"`` etc.
        """
        if not mipvu_map:
            for t in tokens:
                t.setdefault('mipvu_tag', 'none')
            return

        for t in tokens:
            start = t.get('start', -1)
            end = t.get('end', -1)
            entry = mipvu_map.get((start, end))
            if entry is None:
                t['mipvu_tag'] = 'none'
            else:
                labels = []
                if entry.get('is_metaphor'):
                    labels.append('indirect')
                if entry.get('is_direct'):
                    labels.append('direct')
                if entry.get('is_mflag'):
                    labels.append('mflag')
                t['mipvu_tag'] = ' '.join(labels) if labels else 'none'

    def _load_usas_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Load USAS annotation for a text (for CQL usas attribute)."""
        media_type = text.get('media_type', 'text')
        if media_type in ('audio', 'video'):
            tjp = resolve_stored_path(text.get('transcript_json_path'))
            if tjp and tjp.is_file():
                try:
                    with open(tjp, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if 'usas_annotations' in data:
                        return data['usas_annotations']
                except Exception as e:
                    logger.debug(f"Failed to load transcript USAS: {e}")
            return None
        content_path = resolve_stored_path(text.get('content_path'))
        if not content_path:
            return None
        usas_path = find_usas_sidecar_path(content_path)
        if not usas_path:
            return None
        try:
            with open(usas_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.debug(f"Failed to load USAS annotation: {e}")
        return None

    def _usas_tokens_flat(self, usas_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Flatten USAS tokens from either 'tokens' or 'segments' in document order."""
        if not usas_data:
            return []
        if "tokens" in usas_data:
            return list(usas_data["tokens"])
        if "segments" in usas_data:
            out = []
            for seg_id in sorted(usas_data["segments"].keys()):
                seg = usas_data["segments"][seg_id]
                out.extend(seg.get("tokens", []))
            return out
        return []

    def _merge_usas_into_tokens(
        self, tokens: List[Dict[str, Any]], text: Dict[str, Any]
    ) -> None:
        """Merge USAS usas_tag into token list by index (or by start/end if lengths differ)."""
        usas_data = self._load_usas_annotation(text)
        if not usas_data:
            for t in tokens:
                t['usas_tag'] = ''
            return
        usas_tokens = self._usas_tokens_flat(usas_data)
        if len(usas_tokens) == len(tokens):
            for t, u in zip(tokens, usas_tokens):
                t['usas_tag'] = u.get('usas_tag', '')
        else:
            # Align by (start, end)
            by_pos = {(u.get('start', -1), u.get('end', -1)): u.get('usas_tag', '') for u in usas_tokens}
            for t in tokens:
                key = (t.get('start', -1), t.get('end', -1))
                t['usas_tag'] = by_pos.get(key, '')

    # Eight NRC emotion dimensions (same as sentiment_analysis_service)
    _NRC_DIMENSIONS = ["anger", "anticipation", "disgust", "fear", "joy", "sadness", "surprise", "trust"]

    def _load_nrc_annotation(self, text: Dict[str, Any]) -> List[Dict[str, int]]:
        """Load NRC token-level scores for a text (list aligned with spaCy tokens)."""
        media_type = text.get('media_type', 'text')
        if media_type in ('audio', 'video'):
            transcript_json = text.get('transcript_json_path')
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    nrc = data.get('nrc_annotations', {})
                    if not nrc.get('success') or 'segments' not in nrc:
                        return []
                    seg_scores = {s.get('id', i): s.get('token_scores', []) for i, s in enumerate(nrc['segments'])}
                    out = []
                    for seg_id in sorted(seg_scores.keys(), key=lambda k: (int(k) if str(k).isdigit() else 999999, k)):
                        out.extend(seg_scores[seg_id])
                    return out
                except Exception as e:
                    logger.debug(f"Failed to load transcript NRC: {e}")
            return []
        content_path = text.get('content_path')
        if not content_path:
            return []
        content_path = Path(content_path)
        nrc_path = content_path.parent / f"{content_path.stem}.nrc.json"
        if not nrc_path.exists():
            return []
        try:
            with open(nrc_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data.get('token_scores', [])
        except Exception as e:
            logger.debug(f"Failed to load NRC annotation: {e}")
        return []

    def _nrc_tag_from_scores(self, scores: Dict[str, int]) -> str:
        """
        Build a space-joined NRC label string from score dict.
        Includes polarity labels (positive/negative/neutral) and active emotion dims.
        Example: {"positive": 1, "joy": 1, "trust": 1} -> "positive joy trust"
        """
        labels = []
        pos = scores.get('positive', 0)
        neg = scores.get('negative', 0)
        if pos > 0:
            labels.append('positive')
        if neg > 0:
            labels.append('negative')
        if pos == 0 and neg == 0:
            labels.append('neutral')
        for dim in self._NRC_DIMENSIONS:
            if scores.get(dim, 0) > 0:
                labels.append(dim)
        if not any(scores.get(d, 0) > 0 for d in self._NRC_DIMENSIONS):
            labels.append('others')
        return ' '.join(labels)

    def _merge_nrc_into_tokens(
        self, tokens: List[Dict[str, Any]], text: Dict[str, Any]
    ) -> None:
        """Merge NRC emotion labels into token list as nrc_tag field."""
        nrc_scores = self._load_nrc_annotation(text)
        if not nrc_scores:
            for t in tokens:
                t['nrc_tag'] = ''
            return
        if len(nrc_scores) == len(tokens):
            for t, scores in zip(tokens, nrc_scores):
                t['nrc_tag'] = self._nrc_tag_from_scores(scores)
        else:
            # Count mismatch: leave empty (safe fallback)
            logger.debug(f"NRC/spaCy token count mismatch: {len(nrc_scores)} vs {len(tokens)}")
            for t in tokens:
                t['nrc_tag'] = ''

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

        # Post-process: detect sentence starts using terminal punctuation
        if tokens:
            tokens[0]['is_sent_start'] = True
            TERM_PUNCT = {'.', '!', '?', '…', '...'}
            for i in range(1, len(tokens)):
                tokens[i].setdefault('is_sent_start', False)
            # Find terminal punct tokens and mark the next real token as sent_start
            for i, token in enumerate(tokens):
                if token.get('is_punct') and token.get('text', '') in TERM_PUNCT:
                    for j in range(i + 1, len(tokens)):
                        if not tokens[j].get('is_space') and not tokens[j].get('is_punct'):
                            tokens[j]['is_sent_start'] = True
                            break

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
        elif search_mode == self.MODE_WORDLIST:
            return self._search_wordlist(tokens, search_value, context_size, lowercase, pos_filter)
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

    def _search_wordlist(
        self,
        tokens: List[Dict[str, Any]],
        search_value: str,
        context_size: int,
        lowercase: bool,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """
        Wordlist search: one word or phrase per line. For each non-empty line,
        run phrase search (if line contains space) or simple search (single token).
        Aggregate all results; entries not found in corpus do not affect others.
        """
        lines = [line.strip() for line in search_value.splitlines() if line.strip()]
        if not lines:
            return []
        results = []
        for line in lines:
            if ' ' in line:
                # Multi-word: use phrase search
                results.extend(
                    self._search_phrase(tokens, line, context_size, lowercase, pos_filter)
                )
            else:
                # Single word: use simple search
                results.extend(
                    self._search_simple(tokens, line, context_size, lowercase, pos_filter)
                )
        return results
    
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
    
    @staticmethod
    def _token_info_static(token: Dict[str, Any]) -> Dict[str, Any]:
        """Extract clean token info dict with annotation fields.
        Preserves start/end for metaphor highlighting (MIPVU position lookup)."""
        out = {
            'text': token.get('text', ''),
            'lemma': token.get('lemma', ''),
            'pos': token.get('pos', ''),
            'tag': token.get('tag', ''),
            'dep': token.get('dep', ''),
        }
        if 'start' in token and 'end' in token:
            out['start'] = token['start']
            out['end'] = token['end']
        return out

    def _search_cql(
        self,
        tokens: List[Dict[str, Any]],
        cql_query: str,
        context_size: int,
        pos_filter: Optional[POSFilter]
    ) -> List[Dict[str, Any]]:
        """Search using CQL query. Dispatches to specialised handlers for meet/within/containing."""
        parsed = self.cql_engine.parse(cql_query)

        if parsed.meet_query:
            return self._execute_meet_query(tokens, parsed.meet_query, context_size)
        if parsed.within_query:
            return self._execute_within_query(tokens, parsed.within_query, context_size)
        if parsed.containing_query:
            return self._execute_containing_query(tokens, parsed.containing_query, context_size)

        # Standard query — structure+token order semantics or plain pattern match
        if parsed.ordered_segments and parsed.structural_patterns and parsed.patterns:
            return self._execute_standard_structure_token(tokens, parsed, context_size)

        results = []
        sentence_spans = self._get_sentence_spans(tokens) if parsed.structural_patterns else None
        for match in self.cql_engine.find_matches(tokens, parsed, context_size):
            if parsed.structural_patterns:
                if not self._check_structural_constraints(
                    tokens, match['position'], match['end_position'], parsed.structural_patterns, sentence_spans
                ):
                    continue
            matched_tokens = match['matched_tokens']
            results.append({
                'position': match['position'],
                'keyword': ' '.join(t.get('text', '') for t in matched_tokens),
                'left_context': [self._token_info_static(t) for t in match['left_context']],
                'right_context': [self._token_info_static(t) for t in match['right_context']],
                'matched_tokens': [self._token_info_static(t) for t in matched_tokens],
                'pos': matched_tokens[0].get('pos', '') if matched_tokens else ''
            })

        # Token frequency filter (no structure): only keep if doc-level match count in [min,max]
        if not parsed.structural_patterns and parsed.patterns:
            freq_pat = next(
                (p for p in parsed.patterns if (p.min_count != 1 or p.max_count != 1) and not p.is_any),
                None
            )
            if freq_pat and results:
                doc_count = self._count_token_matches_in_span(tokens, freq_pat)
                if doc_count < freq_pat.min_count or doc_count > freq_pat.max_count:
                    return []
        return results

    # -----------------------------------------------------------------
    # Sentence / paragraph span helpers
    # -----------------------------------------------------------------

    def _get_sentence_spans(self, tokens: List[Dict[str, Any]]) -> List[Tuple[int, int]]:
        """Return (start_idx, end_idx) for each sentence (end_idx is exclusive)."""
        if not tokens:
            return []
        spans: List[Tuple[int, int]] = []
        start = 0
        for i in range(1, len(tokens)):
            if tokens[i].get('is_sent_start'):
                spans.append((start, i))
                start = i
        spans.append((start, len(tokens)))
        return spans

    def _get_paragraph_spans(self, tokens: List[Dict[str, Any]]) -> List[Tuple[int, int]]:
        """Return (start_idx, end_idx) for each paragraph, detected via space tokens with \\n\\n."""
        if not tokens:
            return []
        spans: List[Tuple[int, int]] = []
        start = 0
        for i in range(1, len(tokens)):
            tok = tokens[i]
            # A space token whose text contains double-newline marks a paragraph break
            if tok.get('is_space') and '\n\n' in tok.get('text', ''):
                if start < i:
                    spans.append((start, i))
                start = i + 1
        if start < len(tokens):
            spans.append((start, len(tokens)))
        # Fallback to sentence spans if no paragraph breaks detected
        if not spans:
            spans = self._get_sentence_spans(tokens)
        return spans

    # -----------------------------------------------------------------
    # Structural constraint checking
    # -----------------------------------------------------------------

    def _check_structural_constraints(
        self,
        tokens: List[Dict[str, Any]],
        match_start: int,
        match_end: int,
        structural_patterns: List,
        sentence_spans: Optional[List[Tuple[int, int]]] = None
    ) -> bool:
        """Check that a match satisfies all structural constraints."""
        if sentence_spans is None:
            sentence_spans = self._get_sentence_spans(tokens)

        def _span_text(span_start: int, span_end: int) -> str:
            # Preserve spacing by keeping space tokens; strip for stable keys.
            return ''.join(t.get('text', '') for t in tokens[span_start:span_end]).strip()

        repeat_counts: Optional[Dict[str, int]] = None
        def _get_repeat_counts() -> Dict[str, int]:
            nonlocal repeat_counts
            if repeat_counts is None:
                counts: Dict[str, int] = {}
                for ss, ee in sentence_spans:
                    key = _span_text(ss, ee)
                    if not key:
                        continue
                    counts[key] = counts.get(key, 0) + 1
                repeat_counts = counts
            return repeat_counts

        for sp in structural_patterns:
            if not isinstance(sp, StructuralPattern):
                continue
            if sp.tag == 's':
                sent = next((s for s in sentence_spans if s[0] <= match_start < s[1]), None)
                if sent is None:
                    return False
                # <s/>{min,max}: sentence span must repeat in document within [min_count, max_count]
                if not (sp.min_count == 1 and sp.max_count == 1):
                    key = _span_text(sent[0], sent[1])
                    c = _get_repeat_counts().get(key, 0)
                    if c < sp.min_count or c > sp.max_count:
                        return False
                if sp.self_closing:
                    # match must be fully within one sentence
                    if match_end > sent[1]:
                        return False
                elif sp.closing:
                    # last matched token should be end of a sentence
                    if match_end != sent[1]:
                        return False
                else:
                    # opening <s>: match must start at sentence boundary
                    if match_start != sent[0]:
                        return False
            # <p> and <doc> constraints could be added similarly
        return True

    # -----------------------------------------------------------------
    # Frequency helpers for quantifiers (token / structure / meet) (2026-03)
    # -----------------------------------------------------------------

    @staticmethod
    def _clone_pattern_as_single(pattern: TokenPattern) -> TokenPattern:
        """Clone a TokenPattern as a single-token matcher (ignore sequential repetition)."""
        return TokenPattern(
            conditions=pattern.conditions,
            or_conditions=pattern.or_conditions,
            is_any=pattern.is_any,
            min_count=1,
            max_count=1,
            optional=False,
            ws_condition=pattern.ws_condition
        )

    def _count_token_matches_in_span(
        self,
        span_tokens: List[Dict[str, Any]],
        pattern: TokenPattern
    ) -> int:
        base = self._clone_pattern_as_single(pattern)
        return sum(1 for t in span_tokens if self.cql_engine.match_token(t, base))

    def _span_text(self, tokens: List[Dict[str, Any]], start: int, end: int) -> str:
        return ''.join(t.get('text', '') for t in tokens[start:end]).strip()

    def _build_repeat_counts_for_spans(
        self,
        tokens: List[Dict[str, Any]],
        spans: List[Tuple[int, int]]
    ) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for s, e in spans:
            key = self._span_text(tokens, s, e)
            if not key:
                continue
            counts[key] = counts.get(key, 0) + 1
        return counts

    def _execute_standard_structure_token(
        self,
        tokens: List[Dict[str, Any]],
        parsed: CQLQuery,
        context_size: int
    ) -> List[Dict[str, Any]]:
        """Standard query with structure + token/distance: order defines result span.

        - Opening first with leading []: <s> []{1,2} [lemma="make"] → match from span start, keyword = that segment (e.g. "Belows made").
        - Opening first without leading []: <s> [lemma="make"] → keyword = whole sentence containing make.
        - Pattern first then closing: []{1,2} </s> → keyword = last 1-2 words of sentence (distance left of </s>).
        - Closing first: </s> []{1,2} → keyword = 1-2 words after sentence (distance right of </s>).
        - Pattern first then opening: [lemma="make"] <s> → keyword = from make to end of sentence.
        """
        from .cql_engine import CQLQuery as _CQLQuery

        ordered = getattr(parsed, 'ordered_segments', None) or []
        if not ordered:
            return []

        first_seg = ordered[0]
        last_seg = ordered[-1]
        structs = [v for t, v in ordered if t == 'structural']
        pattern_list = [v for t, v in ordered if t == 'pattern']
        if not structs or not pattern_list:
            return []

        sp = structs[0]
        first_is_opening = (
            first_seg[0] == 'structural'
            and isinstance(first_seg[1], StructuralPattern)
            and not first_seg[1].closing
        )
        first_is_closing = (
            first_seg[0] == 'structural'
            and isinstance(first_seg[1], StructuralPattern)
            and first_seg[1].closing
        )
        last_is_closing = (
            last_seg[0] == 'structural'
            and isinstance(last_seg[1], StructuralPattern)
            and last_seg[1].closing
        )

        use_paragraph = sp.tag == 'p'
        spans = self._get_paragraph_spans(tokens) if use_paragraph else self._get_sentence_spans(tokens)
        repeat_counts = self._build_repeat_counts_for_spans(tokens, spans)

        token_freq_min, token_freq_max = 1, 10**9
        freq_pat: Optional[TokenPattern] = None
        if len(pattern_list) == 1 and not pattern_list[0].is_any and (
            pattern_list[0].min_count != 1 or pattern_list[0].max_count != 1
        ):
            token_freq_min = pattern_list[0].min_count
            token_freq_max = pattern_list[0].max_count
            freq_pat = pattern_list[0]

        def apply_span_filters(span_start: int, span_end: int) -> bool:
            if not (sp.min_count == 1 and sp.max_count == 1):
                key = self._span_text(tokens, span_start, span_end)
                c = repeat_counts.get(key, 0)
                if c < sp.min_count or c > sp.max_count:
                    return False
            if freq_pat is not None:
                cnt = self._count_token_matches_in_span(tokens[span_start:span_end], freq_pat)
                if cnt < token_freq_min or cnt > token_freq_max:
                    return False
            return True

        results: List[Dict[str, Any]] = []
        n_tokens = len(tokens)

        # ----- Closing first: </s> []{1,2} — keyword = 1-2 words after sentence end -----
        if first_is_closing:
            patterns_after = [v for t, v in ordered[1:] if t == 'pattern']
            if not patterns_after:
                return []
            # Only [] (distance) after </s>: take min..max tokens after span_end
            min_len, max_len = self.cql_engine._pattern_sequence_length_range(patterns_after)
            for span_start, span_end in spans:
                if not apply_span_filters(span_start, span_end):
                    continue
                available = n_tokens - span_end
                if available < min_len:
                    continue
                k = min(max_len, available)
                end = span_end + k
                results.append(self._build_match_result(tokens, span_end, end, context_size))
            return results

        # ----- Closing last: []{1,2} </s> — keyword = last 1-2 words of sentence -----
        if last_is_closing:
            patterns_before = [v for t, v in ordered[:-1] if t == 'pattern']
            if not patterns_before:
                return []
            for span_start, span_end in spans:
                if not apply_span_filters(span_start, span_end):
                    continue
                span_tokens = tokens[span_start:span_end]
                res = self.cql_engine.try_match_sequence_ending_at(
                    tokens, patterns_before, span_end
                )
                if res is not None:
                    seg_start, seg_end, _ = res
                    results.append(self._build_match_result(tokens, seg_start, seg_end, context_size))
            return results

        # ----- Opening first: <s> []{1,2} [lemma="make"] or <s> [lemma="make"] -----
        if first_is_opening:
            patterns_after_first = [v for t, v in ordered[1:] if t == 'pattern']
            patterns_to_use = (
                [v for t, v in ordered[1:-1] if t == 'pattern']
                if last_is_closing and len(ordered) > 2
                else patterns_after_first
            )
            if not patterns_to_use:
                return []
            # If first pattern is [] (distance), match from span start and return segment
            match_from_start = patterns_to_use[0].is_any
            content_q = _CQLQuery(patterns=patterns_to_use, raw_query=parsed.raw_query)
            for span_start, span_end in spans:
                if not apply_span_filters(span_start, span_end):
                    continue
                span_tokens = tokens[span_start:span_end]
                if match_from_start:
                    # <s> []{1,2} [lemma="make"]: match from span start, keyword = segment ending at make
                    for m in self.cql_engine.find_matches(span_tokens, content_q, 0):
                        g_start = span_start + m['position']
                        g_end = span_start + m['end_position']
                        results.append(self._build_match_result(tokens, g_start, g_end, context_size))
                else:
                    # <s> [lemma="make"]: whole span containing pattern
                    if any(True for _ in self.cql_engine.find_matches(span_tokens, content_q, 0)):
                        results.append(self._build_match_result(tokens, span_start, span_end, context_size))
            return results

        # ----- Pattern first then opening: [lemma="make"] <s> — keyword = from match to end of span -----
        token_pats = [self._clone_pattern_as_single(p) for p in pattern_list]
        content_q = _CQLQuery(patterns=token_pats, raw_query=parsed.raw_query)
        for match in self.cql_engine.find_matches(tokens, content_q, context_size):
            match_start, match_end = match['position'], match['end_position']
            span = next((s for s in spans if s[0] <= match_start < s[1]), None)
            if span is None:
                continue
            span_start, span_end = span
            if not apply_span_filters(span_start, span_end):
                continue
            results.append(self._build_match_result(tokens, match_start, span_end, context_size))
        return results

    # -----------------------------------------------------------------
    # Meet / within / containing execution
    # -----------------------------------------------------------------

    def _build_match_result(
        self,
        tokens: List[Dict[str, Any]],
        start: int,
        end: int,
        context_size: int
    ) -> Dict[str, Any]:
        """Build a match result dict for tokens[start:end]."""
        n = len(tokens)
        matched = tokens[start:end]

        left_ctx: List[Dict] = []
        for i in range(start - 1, max(-1, start - context_size * 2 - 1), -1):
            if not tokens[i].get('is_space'):
                left_ctx.insert(0, tokens[i])
            if len(left_ctx) >= context_size:
                break

        right_ctx: List[Dict] = []
        for i in range(end, min(n, end + context_size * 2)):
            if not tokens[i].get('is_space'):
                right_ctx.append(tokens[i])
            if len(right_ctx) >= context_size:
                break

        return {
            'position': start,
            'keyword': ' '.join(t.get('text', '') for t in matched),
            'left_context': [self._token_info_static(t) for t in left_ctx],
            'right_context': [self._token_info_static(t) for t in right_ctx],
            'matched_tokens': [self._token_info_static(t) for t in matched],
            'pos': matched[0].get('pos', '') if matched else ''
        }

    def _execute_meet_query(
        self,
        tokens: List[Dict[str, Any]],
        meet_query: MeetQuery,
        context_size: int
    ) -> List[Dict[str, Any]]:
        """Execute (meet P Q -n m): find positions where P and Q co-occur within distance."""
        n = len(tokens)
        s2_positions = {
            i for i in range(n)
            if self.cql_engine.match_token(tokens[i], meet_query.pattern2)
        }
        results = []
        for i in range(n):
            if not self.cql_engine.match_token(tokens[i], meet_query.pattern1):
                continue
            # Check if any s2 position is within [left_dist, right_dist] of i
            for offset in range(meet_query.left_dist, meet_query.right_dist + 1):
                j = i + offset
                if j != i and 0 <= j < n and j in s2_positions:
                    results.append(self._build_match_result(tokens, i, i + 1, context_size))
                    break
        # Quantifier on meet expression is a frequency filter on number of meet matches in this document.
        if not (meet_query.min_count == 1 and meet_query.max_count == 1):
            if len(results) < meet_query.min_count or len(results) > meet_query.max_count:
                return []
        return results

    def _execute_within_query(
        self,
        tokens: List[Dict[str, Any]],
        within_query: WithinQuery,
        context_size: int
    ) -> List[Dict[str, Any]]:
        """Execute P within Q.

        - Result is the word/phrase on the left of 'within' (left side highlighted).
        - Structure quantifier (<s/>{min,max}) filters by how many times the structure span repeats in the document.
        - Token quantifier on the left (e.g. [lemma="make"]{1,2}) filters by occurrence count inside the right structure span.
        - Invalid: left contains structural marker; structure within token (right is token-only) returns no results.
        """
        from .cql_engine import CQLQuery as _CQLQuery

        # Invalid: left has structural markers
        if any(isinstance(p, StructuralPattern) for p in within_query.left_patterns):
            return []

        left_pats = [p for p in within_query.left_patterns if isinstance(p, TokenPattern)]
        right_structs = [p for p in within_query.right_patterns if isinstance(p, StructuralPattern)]
        right_pats = [p for p in within_query.right_patterns if isinstance(p, TokenPattern)]
        if not left_pats:
            return []

        # Structure-based within (right side is a structure marker)
        if right_structs:
            sp = right_structs[0]
            spans = self._get_paragraph_spans(tokens) if sp.tag == 'p' else self._get_sentence_spans(tokens)
            repeat_counts = self._build_repeat_counts_for_spans(tokens, spans)

            # Left token frequency constraint: support single TokenPattern with {min,max}
            token_freq_min, token_freq_max = 1, 10**9
            freq_pat: Optional[TokenPattern] = None
            if len(left_pats) == 1 and (left_pats[0].min_count != 1 or left_pats[0].max_count != 1) and not left_pats[0].is_any:
                token_freq_min, token_freq_max = left_pats[0].min_count, left_pats[0].max_count
                freq_pat = left_pats[0]
                left_pats = [self._clone_pattern_as_single(left_pats[0])]

            left_q = _CQLQuery(patterns=left_pats, raw_query='')

            qualifying_ranges: List[Tuple[int, int]] = []
            for span_start, span_end in spans:
                # Structure repeat filter
                if not (sp.min_count == 1 and sp.max_count == 1):
                    key = self._span_text(tokens, span_start, span_end)
                    c = repeat_counts.get(key, 0)
                    if c < sp.min_count or c > sp.max_count:
                        continue
                # Token frequency filter (within span)
                if freq_pat is not None:
                    c = self._count_token_matches_in_span(tokens[span_start:span_end], freq_pat)
                    if c < token_freq_min or c > token_freq_max:
                        continue
                qualifying_ranges.append((span_start, span_end))

            # Non-negated: emit left matches inside qualifying spans
            if not within_query.negated:
                results: List[Dict[str, Any]] = []
                for span_start, span_end in qualifying_ranges:
                    for m in self.cql_engine.find_matches(tokens[span_start:span_end], left_q, context_size):
                        gs = span_start + m['position']
                        ge = span_start + m['end_position']
                        results.append(self._build_match_result(tokens, gs, ge, context_size))
                return results

            # Negated: emit left matches NOT inside any qualifying span
            out: List[Dict[str, Any]] = []
            for m in self.cql_engine.find_matches(tokens, left_q, context_size):
                in_any = any(rs <= m['position'] and m['end_position'] <= re for rs, re in qualifying_ranges)
                if not in_any:
                    out.append(self._build_match_result(tokens, m['position'], m['end_position'], context_size))
            return out

        # Token-based within (legacy)
        if not right_pats:
            return []
        right_q = _CQLQuery(patterns=right_pats, raw_query='')
        right_spans = [(m['position'], m['end_position']) for m in self.cql_engine.find_matches(tokens, right_q, 0)]
        left_q = _CQLQuery(patterns=left_pats, raw_query='')
        results = []
        for match in self.cql_engine.find_matches(tokens, left_q, context_size):
            in_span = any(rs <= match['position'] and match['end_position'] <= re for rs, re in right_spans)
            if (in_span and not within_query.negated) or (not in_span and within_query.negated):
                results.append(self._build_match_result(tokens, match['position'], match['end_position'], context_size))
        return results

    def _execute_containing_query(
        self,
        tokens: List[Dict[str, Any]],
        containing_query: ContainingQuery,
        context_size: int
    ) -> List[Dict[str, Any]]:
        """Execute C containing P.

        - Result is the whole structure span (structure highlighted).
        - Structure quantifier filters by how many times the span repeats in the document.
        - Token quantifier on the right filters by occurrence count within the span.
        - Invalid: token containing structure returns no results.
        """
        from .cql_engine import CQLQuery as _CQLQuery

        # Determine container spans (structural or token-based)
        container_structs = [p for p in containing_query.container_patterns
                             if isinstance(p, StructuralPattern)]
        if not container_structs:
            # Disallow token-based container for the requested semantics
            return []
        content_pats = [p for p in containing_query.content_patterns
                        if isinstance(p, TokenPattern)]
        if any(isinstance(p, StructuralPattern) for p in containing_query.content_patterns):
            return []
        if not content_pats:
            return []

        # Choose container: <s/> → sentence spans, <p/> → paragraph spans, default → sentence spans
        sp = container_structs[0]
        container_spans = self._get_paragraph_spans(tokens) if sp.tag == 'p' else self._get_sentence_spans(tokens)
        repeat_counts = self._build_repeat_counts_for_spans(tokens, container_spans)

        # Token frequency constraint: support single-token pattern with {min,max}
        token_freq_min, token_freq_max = 1, 10**9
        freq_pat: Optional[TokenPattern] = None
        if len(content_pats) == 1 and (content_pats[0].min_count != 1 or content_pats[0].max_count != 1) and not content_pats[0].is_any:
            token_freq_min, token_freq_max = content_pats[0].min_count, content_pats[0].max_count
            freq_pat = content_pats[0]
            content_pats = [self._clone_pattern_as_single(content_pats[0])]

        content_q = _CQLQuery(patterns=content_pats, raw_query='')
        results = []
        for span_start, span_end in container_spans:
            # Structure repeat filter
            if not (sp.min_count == 1 and sp.max_count == 1):
                key = self._span_text(tokens, span_start, span_end)
                c = repeat_counts.get(key, 0)
                if c < sp.min_count or c > sp.max_count:
                    continue
            span_tokens = tokens[span_start:span_end]
            if freq_pat is not None:
                c = self._count_token_matches_in_span(span_tokens, freq_pat)
                has_content = token_freq_min <= c <= token_freq_max
            else:
                has_content = any(True for _ in self.cql_engine.find_matches(span_tokens, content_q, 0))
            if (has_content and not containing_query.negated) or \
               (not has_content and containing_query.negated):
                results.append(self._build_match_result(tokens, span_start, span_end, context_size))
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
        
        # Get context tokens with full annotation (exclude space tokens for cleaner display)
        left_context = []
        right_context = []

        # Helper to extract token info for context
        def _token_info(token: Dict[str, Any]) -> Dict[str, Any]:
            return {
                'text': token.get('text', ''),
                'lemma': token.get('lemma', ''),
                'pos': token.get('pos', ''),
                'tag': token.get('tag', ''),
                'dep': token.get('dep', ''),
            }

        # Left context
        left_start = max(0, match_start - context_size * 2)  # Get more to filter
        for i in range(match_start - 1, left_start - 1, -1):
            if i < 0:
                break
            token = tokens[i]
            if not token.get('is_space'):
                left_context.insert(0, _token_info(token))
                if len(left_context) >= context_size:
                    break

        # Right context
        right_end = min(n_tokens, match_end + context_size * 2)
        for i in range(match_end, right_end):
            token = tokens[i]
            if not token.get('is_space'):
                right_context.append(_token_info(token))
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
                            token = context[-(idx + 1)]
                            if isinstance(token, dict):
                                if attribute == 'pos':
                                    value = token.get('pos', '')
                                elif attribute == 'lemma':
                                    value = token.get('lemma', token.get('text', ''))
                                else:
                                    value = token.get('text', '')
                            else:
                                value = str(token)
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
                            token = context[idx]
                            if isinstance(token, dict):
                                if attribute == 'pos':
                                    value = token.get('pos', '')
                                elif attribute == 'lemma':
                                    value = token.get('lemma', token.get('text', ''))
                                else:
                                    value = token.get('text', '')
                            else:
                                value = str(token)
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
        context_chars: int = 200,
        highlight_lemmas: Optional[List[str]] = None,
        keyword: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get extended context for a KWIC result.

        Args:
            keyword: Full keyword text (e.g., multi-word N-gram "of the").
                     When provided, the highlight span covers all tokens of the keyword
                     starting from `position`, not just the single token at `position`.
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

            # For multi-word keywords (e.g., N-grams), determine the last token index
            # so we can highlight the entire phrase, not just the first token.
            last_keyword_token_idx = position  # default: single token
            if keyword and ' ' in keyword:
                # Count how many non-space tokens make up this keyword, walking forward
                # through the token stream (which may include space/punct tokens in between)
                keyword_words = keyword.split()
                n_keyword_words = len(keyword_words)
                if n_keyword_words > 1:
                    idx = position
                    words_matched = 0
                    while idx < len(tokens) and words_matched < n_keyword_words:
                        if not tokens[idx].get('is_space'):
                            words_matched += 1
                            last_keyword_token_idx = idx
                        idx += 1
                    keyword_text = keyword
            
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
                if last_keyword_token_idx > position:
                    # Multi-word keyword: span from first token start to last token end
                    last_token = tokens[last_keyword_token_idx]
                    char_end = last_token.get('end', char_start + len(keyword_text))
                else:
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

            # Find collocate spans by lemma matching within the extended context range
            collocate_spans = None
            if highlight_lemmas:
                lemma_set = {l.lower() for l in highlight_lemmas}
                collocate_spans = []
                for tk in tokens:
                    tk_lemma = tk.get('lemma', '').lower()
                    if tk_lemma not in lemma_set:
                        continue
                    tk_start = tk.get('start', -1)
                    tk_end = tk.get('end', -1)
                    if tk_start < 0 or tk_end < 0:
                        continue
                    # Check if this token falls within the extended context character range
                    if tk_start >= ext_start and tk_end <= ext_end:
                        # Convert to relative position within extended_text
                        rel_start = tk_start - ext_start
                        rel_end = tk_end - ext_start
                        collocate_spans.append({
                            'start': rel_start,
                            'end': rel_end,
                            'text': tk.get('text', '')
                        })

            return {
                'success': True,
                'text': extended_text,
                'keyword': keyword_in_context,
                'highlight_start': highlight_start,
                'highlight_end': highlight_end,
                'text_id': text_id,
                'filename': text.get('filename', 'unknown'),
                'collocate_spans': collocate_spans
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

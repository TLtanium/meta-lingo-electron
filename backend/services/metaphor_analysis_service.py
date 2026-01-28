"""
Metaphor Analysis Service

Provides analysis functions for MIPVU metaphor annotations.
Similar to semantic_analysis_service but for metaphor data.
"""

import os
import json
import re
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from collections import Counter, defaultdict

from models.database import CorpusDB, TextDB

logger = logging.getLogger(__name__)


class MetaphorAnalysisService:
    """
    Service for analyzing metaphor annotations from MIPVU data.
    
    Provides:
    - Frequency analysis of metaphor/literal words
    - Grouping by source (filter, rule, hitz, finetuned)
    - POS filtering
    - Search filtering
    """
    
    SOURCE_NAMES = {
        'filter': {'en': 'Word Filter', 'zh': '词表过滤'},
        'rule': {'en': 'Rule Filter', 'zh': '规则过滤'},
        'hitz': {'en': 'HiTZ Model', 'zh': 'HiTZ模型'},
        'finetuned': {'en': 'Fine-tuned Model', 'zh': '微调模型'},
        'unknown': {'en': 'Unknown', 'zh': '未知'},
    }
    
    def __init__(self):
        pass
    
    def _get_text_ids(self, corpus_id: str, text_ids: Any) -> List[str]:
        """Get actual text IDs from 'all' or list"""
        if text_ids == "all" or (isinstance(text_ids, list) and len(text_ids) == 0):
            texts = TextDB.list_by_corpus(corpus_id)
            return [t['id'] for t in texts]
        return text_ids if isinstance(text_ids, list) else [text_ids]
    
    def _load_mipvu_data(self, text_id: str) -> Optional[Dict[str, Any]]:
        """Load MIPVU annotation data for a text"""
        text = TextDB.get_by_id(text_id)
        if not text:
            logger.warning(f"Text not found: {text_id}")
            return None
        
        media_type = text.get('media_type', 'text')
        logger.debug(f"Loading MIPVU data for text {text_id}, media_type={media_type}")
        
        # For audio/video, check transcript JSON
        if media_type in ['audio', 'video']:
            transcript_json = text.get('transcript_json_path')
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, 'r', encoding='utf-8') as f:
                        transcript_data = json.load(f)
                    mipvu_data = transcript_data.get('mipvu_annotations')
                    if mipvu_data:
                        logger.debug(f"Loaded MIPVU from transcript: {len(mipvu_data.get('sentences', []))} sentences")
                    return mipvu_data
                except Exception as e:
                    logger.warning(f"Failed to load transcript MIPVU: {e}")
                    return None
        
        # For text files, check .mipvu.json file
        content_path = text.get('content_path')
        if content_path:
            # Try both naming conventions
            base_path = Path(content_path)
            possible_paths = [
                base_path.with_suffix('').with_suffix('.mipvu.json'),  # file.txt -> file.mipvu.json
                base_path.parent / f"{base_path.stem}.mipvu.json",     # file.txt -> file.mipvu.json (explicit)
            ]
            
            for mipvu_path in possible_paths:
                logger.debug(f"Checking MIPVU path: {mipvu_path}")
                if mipvu_path.exists():
                    try:
                        with open(mipvu_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        logger.debug(f"Loaded MIPVU from {mipvu_path}: success={data.get('success')}, sentences={len(data.get('sentences', []))}")
                        return data
                    except Exception as e:
                        logger.warning(f"Failed to load MIPVU annotation from {mipvu_path}: {e}")
                        continue
            
            logger.warning(f"No MIPVU file found for content_path: {content_path}")
        
        return None
    
    def _apply_pos_filter(self, tokens: List[Dict], pos_filter: Optional[Dict]) -> List[Dict]:
        """Apply POS filtering to tokens"""
        if not pos_filter or not pos_filter.get('selectedPOS'):
            return tokens
        
        selected_pos = set(pos_filter.get('selectedPOS', []))
        keep_mode = pos_filter.get('keepMode', True)
        
        filtered = []
        for token in tokens:
            pos = token.get('pos', '')
            if keep_mode:
                if pos in selected_pos:
                    filtered.append(token)
            else:
                if pos not in selected_pos:
                    filtered.append(token)
        
        return filtered
    
    def _apply_search_filter(self, word: str, search_config: Optional[Dict]) -> bool:
        """Check if word passes search filter"""
        if not search_config:
            return True
        
        search_type = search_config.get('searchType', 'all')
        search_value = search_config.get('searchValue', '').strip()
        exclude_words = search_config.get('excludeWords', [])
        
        # Check exclusion first
        if word.lower() in [w.lower() for w in exclude_words]:
            return False
        
        if search_type == 'all' or not search_value:
            return True
        
        if search_type == 'starts':
            return word.lower().startswith(search_value.lower())
        elif search_type == 'ends':
            return word.lower().endswith(search_value.lower())
        elif search_type == 'contains':
            return search_value.lower() in word.lower()
        elif search_type == 'regex':
            try:
                return bool(re.search(search_value, word, re.IGNORECASE))
            except:
                return False
        elif search_type == 'wordlist':
            wordlist = [w.strip().lower() for w in search_value.split('\n') if w.strip()]
            return word.lower() in wordlist
        
        return True
    
    def _normalize_source(self, source: str) -> str:
        """Normalize metaphor source string"""
        if not source:
            return 'unknown'
        
        source = source.lower()
        if source.startswith('rule:'):
            return 'rule'
        if source in ('filter', 'rule', 'hitz', 'finetuned'):
            return source
        return 'unknown'
    
    def analyze(
        self,
        corpus_id: str,
        text_ids: Any = "all",
        pos_filter: Optional[Dict] = None,
        search_config: Optional[Dict] = None,
        min_freq: int = 1,
        max_freq: Optional[int] = None,
        lowercase: bool = True,
        result_mode: str = "word"  # "word" or "source"
    ) -> Dict[str, Any]:
        """
        Analyze metaphor annotations from corpus.
        
        Args:
            corpus_id: Corpus ID
            text_ids: List of text IDs or "all"
            pos_filter: POS filter configuration
            search_config: Search filter configuration
            min_freq: Minimum frequency
            max_freq: Maximum frequency (optional)
            lowercase: Whether to lowercase words
            result_mode: "word" for word-level results, "source" for source grouping
            
        Returns:
            Analysis results with statistics
        """
        try:
            actual_text_ids = self._get_text_ids(corpus_id, text_ids)
            logger.info(f"Analyzing metaphors for corpus {corpus_id}, {len(actual_text_ids)} texts")
            
            if not actual_text_ids:
                return {
                    'success': False,
                    'error': 'No texts found in corpus',
                    'results': [],
                    'statistics': {
                        'total_tokens': 0,
                        'metaphor_tokens': 0,
                        'literal_tokens': 0,
                        'metaphor_rate': 0.0,
                        'source_distribution': {}
                    }
                }
            
            # Collect all tokens from MIPVU data
            all_tokens = []
            texts_with_data = 0
            texts_without_data = 0
            
            for text_id in actual_text_ids:
                mipvu_data = self._load_mipvu_data(text_id)
                if not mipvu_data:
                    logger.debug(f"No MIPVU data for text {text_id}")
                    texts_without_data += 1
                    continue
                
                if not mipvu_data.get('success', False):
                    logger.debug(f"MIPVU data not successful for text {text_id}")
                    texts_without_data += 1
                    continue
                
                texts_with_data += 1
                sentences = mipvu_data.get('sentences', [])
                for sentence in sentences:
                    tokens = sentence.get('tokens', [])
                    # Apply POS filter
                    filtered_tokens = self._apply_pos_filter(tokens, pos_filter)
                    all_tokens.extend(filtered_tokens)
            
            logger.info(f"Loaded MIPVU data: {texts_with_data} texts with data, {texts_without_data} without, {len(all_tokens)} total tokens")
            
            # Count words - separate metaphor and non-metaphor for same word
            # Key format: (word, is_metaphor) to keep them separate
            word_data = defaultdict(lambda: {
                'frequency': 0,
                'lemma': '',
                'pos': '',
                'sources': Counter()
            })
            
            total_tokens = 0
            metaphor_tokens = 0
            source_distribution = Counter()
            
            for token in all_tokens:
                word = token.get('word', '')
                if not word or not word.isalpha():
                    continue
                
                # Apply search filter
                if not self._apply_search_filter(word, search_config):
                    continue
                
                if lowercase:
                    word = word.lower()
                
                is_metaphor = token.get('is_metaphor', False)
                source = self._normalize_source(token.get('metaphor_source', ''))
                
                total_tokens += 1
                if is_metaphor:
                    metaphor_tokens += 1
                    source_distribution[source] += 1
                
                # Use (word, is_metaphor) as key to separate metaphor/non-metaphor
                key = (word, is_metaphor)
                word_data[key]['frequency'] += 1
                word_data[key]['lemma'] = token.get('lemma', word)
                word_data[key]['pos'] = token.get('pos', '')
                word_data[key]['sources'][source] += 1
            
            # Filter by frequency
            filtered_words = {}
            for key, data in word_data.items():
                freq = data['frequency']
                if freq >= min_freq and (max_freq is None or freq <= max_freq):
                    filtered_words[key] = data
            
            # Calculate statistics
            literal_tokens = total_tokens - metaphor_tokens
            metaphor_rate = metaphor_tokens / total_tokens if total_tokens > 0 else 0.0
            
            statistics = {
                'total_tokens': total_tokens,
                'metaphor_tokens': metaphor_tokens,
                'literal_tokens': literal_tokens,
                'metaphor_rate': metaphor_rate,
                'source_distribution': dict(source_distribution)
            }
            
            # Generate results based on mode
            if result_mode == "source":
                # Group by source
                results = []
                for source, count in source_distribution.items():
                    results.append({
                        'source': source,
                        'name': self.SOURCE_NAMES.get(source, {}).get('en', source),
                        'count': count,
                        'percentage': count / metaphor_tokens * 100 if metaphor_tokens > 0 else 0
                    })
                results.sort(key=lambda x: x['count'], reverse=True)
            else:
                # Word-level results - key is now (word, is_metaphor) tuple
                results = []
                sorted_words = sorted(filtered_words.items(), key=lambda x: x[1]['frequency'], reverse=True)
                
                for key, data in sorted_words:
                    word, is_metaphor = key
                    # Get most common source
                    most_common_source = data['sources'].most_common(1)
                    source = most_common_source[0][0] if most_common_source else 'unknown'
                    
                    results.append({
                        'word': word,
                        'lemma': data['lemma'],
                        'pos': data['pos'],
                        'is_metaphor': is_metaphor,
                        'frequency': data['frequency'],
                        'percentage': data['frequency'] / total_tokens * 100 if total_tokens > 0 else 0,
                        'source': source
                    })
            
            return {
                'success': True,
                'results': results,
                'statistics': statistics,
                'error': None
            }
            
        except Exception as e:
            logger.error(f"Metaphor analysis error: {e}")
            return {
                'success': False,
                'error': str(e),
                'results': [],
                'statistics': {
                    'total_tokens': 0,
                    'metaphor_tokens': 0,
                    'literal_tokens': 0,
                    'metaphor_rate': 0.0,
                    'source_distribution': {}
                }
            }
    
    def get_words(
        self,
        corpus_id: str,
        text_ids: Any = "all",
        is_metaphor: bool = True,
        source: Optional[str] = None,
        lowercase: bool = True
    ) -> Dict[str, Any]:
        """
        Get list of metaphor or literal words.
        
        Args:
            corpus_id: Corpus ID
            text_ids: List of text IDs or "all"
            is_metaphor: True for metaphor words, False for literal
            source: Filter by specific source
            lowercase: Whether to lowercase words
            
        Returns:
            List of words with details
        """
        try:
            actual_text_ids = self._get_text_ids(corpus_id, text_ids)
            
            if not actual_text_ids:
                return {
                    'success': False,
                    'error': 'No texts found in corpus',
                    'words': [],
                    'total': 0
                }
            
            # Collect words
            word_data = defaultdict(lambda: {
                'frequency': 0,
                'lemma': '',
                'pos': '',
                'contexts': []
            })
            
            for text_id in actual_text_ids:
                mipvu_data = self._load_mipvu_data(text_id)
                if not mipvu_data or not mipvu_data.get('success', False):
                    continue
                
                sentences = mipvu_data.get('sentences', [])
                for sentence in sentences:
                    sentence_text = sentence.get('text', '')
                    tokens = sentence.get('tokens', [])
                    
                    for token in tokens:
                        word = token.get('word', '')
                        if not word or not word.isalpha():
                            continue
                        
                        token_is_metaphor = token.get('is_metaphor', False)
                        token_source = self._normalize_source(token.get('metaphor_source', ''))
                        
                        # Filter by metaphor status
                        if token_is_metaphor != is_metaphor:
                            continue
                        
                        # Filter by source if specified
                        if source and token_source != source:
                            continue
                        
                        if lowercase:
                            word = word.lower()
                        
                        word_data[word]['frequency'] += 1
                        word_data[word]['lemma'] = token.get('lemma', word)
                        word_data[word]['pos'] = token.get('pos', '')
                        
                        # Store context (limit to 3)
                        if len(word_data[word]['contexts']) < 3:
                            word_data[word]['contexts'].append(sentence_text)
            
            # Convert to list
            words = []
            for word, data in sorted(word_data.items(), key=lambda x: x[1]['frequency'], reverse=True):
                words.append({
                    'word': word,
                    'lemma': data['lemma'],
                    'pos': data['pos'],
                    'frequency': data['frequency'],
                    'contexts': data['contexts']
                })
            
            return {
                'success': True,
                'words': words,
                'total': len(words),
                'error': None
            }
            
        except Exception as e:
            logger.error(f"Get metaphor words error: {e}")
            return {
                'success': False,
                'error': str(e),
                'words': [],
                'total': 0
            }


# Global service instance
_metaphor_analysis_service: Optional[MetaphorAnalysisService] = None


def get_metaphor_analysis_service() -> MetaphorAnalysisService:
    """Get the global metaphor analysis service instance."""
    global _metaphor_analysis_service
    if _metaphor_analysis_service is None:
        _metaphor_analysis_service = MetaphorAnalysisService()
    return _metaphor_analysis_service

"""
Synonym Analysis Service
Provides synonym analysis using NLTK WordNet and omw-1.4
Uses SpaCy annotation data from corpus management
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional, Set
from collections import Counter
from pathlib import Path

import nltk
from nltk.corpus import wordnet as wn

from models.database import TextDB, CorpusDB

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import MODELS_DIR
from model_paths import get_user_models_dir, get_bundled_models_dir

logger = logging.getLogger(__name__)

# Configure NLTK data path.
# Priority:
# 1) user models dir (downloaded/updated models)
# 2) bundled models dir (packaged with app)
#
# Important: user models dir may exist but be incomplete (e.g. models/nltk exists
# but corpora/wordnet is missing). In that case we must fall back to the bundled
# wordnet to avoid startup crashes.
def _has_wordnet(nltk_root: Path) -> bool:
    return (nltk_root / "corpora" / "wordnet").exists() or (nltk_root / "corpora" / "wordnet.zip").exists()

_user_nltk_root = get_user_models_dir() / "nltk"
_bundled_nltk_root = get_bundled_models_dir() / "nltk"

if _has_wordnet(_user_nltk_root):
    NLTK_DATA_PATH = _user_nltk_root
elif _has_wordnet(_bundled_nltk_root):
    NLTK_DATA_PATH = _bundled_nltk_root
else:
    # Final best-effort fallback; _init_wordnet will handle failure gracefully.
    NLTK_DATA_PATH = _user_nltk_root if _user_nltk_root.exists() else (_bundled_nltk_root if _bundled_nltk_root.exists() else (MODELS_DIR / "nltk"))

nltk.data.path.insert(0, str(NLTK_DATA_PATH))

# SpaCy POS to WordNet POS mapping.
# Use literal POS codes to avoid touching WordNet corpus at import time.
SPACY_TO_WORDNET_POS = {
    'ADJ': 'a',      # adjective
    'ADV': 'r',      # adverb
    'NOUN': 'n',     # noun
    'VERB': 'v',     # verb
}

# POS filter options mapping
POS_FILTER_OPTIONS = {
    'auto': None,           # Auto-detect from SpaCy
    'adjective': 'ADJ',
    'adverb': 'ADV',
    'noun': 'NOUN',
    'verb': 'VERB',
    'pronoun': 'PRON',      # Note: WordNet doesn't have pronouns
}

# Reverse mapping for display
WORDNET_TO_DISPLAY_POS = {
    'a': 'adjective',
    'r': 'adverb',
    'n': 'noun',
    'v': 'verb',
    's': 'adjective',  # adjective satellite
}


class SynonymService:
    """Synonym analysis service using NLTK WordNet"""
    
    def __init__(self):
        self._initialized = False
        self._init_wordnet()
    
    def _init_wordnet(self):
        """Initialize WordNet with local data"""
        try:
            # Test if WordNet is accessible
            wn.synsets('test')
            self._initialized = True
            logger.info("WordNet initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize WordNet: {e}")
            self._initialized = False
    
    def analyze(
        self,
        corpus_id: str,
        text_ids: List[str] | str = "all",
        pos_filter: str = "auto",
        search_query: str = "",
        min_freq: int = 1,
        max_results: int = 100,
        lowercase: bool = True,
        search_target: str = "lemma"
    ) -> Dict[str, Any]:
        """
        Perform synonym analysis on corpus texts

        Args:
            corpus_id: Corpus ID
            text_ids: List of text IDs or "all" for all texts
            pos_filter: POS filter (auto/adjective/adverb/noun/verb/pronoun)
            search_query: Optional search query to filter words
            min_freq: Minimum frequency threshold
            max_results: Maximum number of results to return
            lowercase: Convert all to lowercase
            search_target: "lemma" to match query against lemma (default),
                           "word" to match against original word forms

        Returns:
            Analysis results with synonyms for each word
        """
        if not self._initialized:
            return {
                "success": False,
                "error": "WordNet not initialized",
                "results": []
            }
        
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
            
            # Collect words from SpaCy annotations (separated by POS)
            word_data = self._collect_words_from_texts(texts, pos_filter, lowercase)
            
            if not word_data:
                return {
                    "success": True,
                    "results": [],
                    "total_words": 0,
                    "unique_words": 0
                }
            
            # Build corpus vocabulary: only synonyms that appear in corpus are retained
            corpus_vocab = set(k[0] for k in word_data.keys())
            
            # Filter by search query if provided
            if search_query:
                q = search_query.lower() if lowercase else search_query
                if search_target == "word":
                    # Match against stored word forms
                    word_data = {
                        key: data for key, data in word_data.items()
                        if q in {wf.lower() if lowercase else wf for wf in data.get('word_forms', set())}
                    }
                else:
                    # Default: match against lemma (key[0] is already lowercased in lowercase mode)
                    word_data = {
                        key: data for key, data in word_data.items()
                        if (key[0].lower() if lowercase else key[0]) == q
                    }
            
            # Filter by minimum frequency
            word_data = {
                key: data for key, data in word_data.items()
                if data['frequency'] >= min_freq
            }
            
            # Sort by frequency and limit results
            sorted_words = sorted(
                word_data.items(),
                key=lambda x: x[1]['frequency'],
                reverse=True
            )[:max_results]
            
            # Get synonyms for each word-POS combination; retain only synonyms that appear in corpus
            results = []
            for (word, pos), data in sorted_words:
                synonyms_info = self._get_synonyms(word, {pos})
                # Filter to only synonyms that actually appear in the corpus
                filtered = self._filter_synonyms_by_corpus(synonyms_info, corpus_vocab)
                if filtered['synonym_count'] > 0:
                    results.append({
                        "word": word,
                        "frequency": data['frequency'],
                        "pos_tags": [pos],
                        "synsets": filtered['synsets'],
                        "all_synonyms": filtered['all_synonyms'],
                        "synonym_count": filtered['synonym_count']
                    })
            
            return {
                "success": True,
                "results": results,
                "total_words": sum(d['frequency'] for d in word_data.values()),
                "unique_words": len(word_data)
            }
            
        except Exception as e:
            logger.error(f"Synonym analysis error: {e}")
            return {
                "success": False,
                "error": str(e),
                "results": []
            }
    
    def _collect_words_from_texts(
        self,
        texts: List[Dict[str, Any]],
        pos_filter: str,
        lowercase: bool
    ) -> Dict[tuple, Dict[str, Any]]:
        """
        Collect words from texts using SpaCy annotations
        Each word-POS combination is stored separately
        
        Args:
            texts: List of text entries
            pos_filter: POS filter option
            lowercase: Whether to lowercase words
            
        Returns:
            Dictionary mapping (word, pos) tuples to their frequency
        """
        word_data: Dict[tuple, Dict[str, Any]] = {}
        
        # Get target POS from filter
        target_spacy_pos = POS_FILTER_OPTIONS.get(pos_filter)
        
        for text in texts:
            spacy_data = self._load_spacy_annotation(text)
            if not spacy_data:
                continue
            
            tokens = self._extract_tokens(spacy_data)
            
            for token in tokens:
                # Skip punctuation and spaces
                if token.get('is_punct') or token.get('is_space'):
                    continue
                
                word = token.get('text', '').strip()
                if not word:
                    continue
                
                pos = token.get('pos', '')
                lemma = token.get('lemma', word)
                
                # Apply POS filter
                if target_spacy_pos and pos != target_spacy_pos:
                    continue
                
                # For pronouns, we can't use WordNet, but still show them
                # For auto mode, only include POS that WordNet supports
                if pos_filter == 'auto' and pos not in SPACY_TO_WORDNET_POS and pos != 'PRON':
                    continue
                
                # Use lemma for consistency
                word_key = lemma.lower() if lowercase else lemma

                # Use (word, pos) as key to separate by POS
                key = (word_key, pos)

                if key not in word_data:
                    word_data[key] = {
                        'frequency': 0,
                        'pos_tags': set([pos]),
                        'word_forms': set()
                    }

                word_data[key]['frequency'] += 1
                word_data[key]['word_forms'].add(word.lower() if lowercase else word)
        
        return word_data
    
    def _load_spacy_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Load SpaCy annotation for a text"""
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
    
    def _extract_tokens(self, spacy_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract tokens from SpaCy annotation data"""
        tokens = []
        
        if "tokens" in spacy_data:
            tokens = spacy_data["tokens"]
        elif "segments" in spacy_data:
            for seg_id, seg_data in spacy_data["segments"].items():
                if "tokens" in seg_data:
                    tokens.extend(seg_data["tokens"])
        
        return tokens
    
    def _get_synonyms(
        self,
        word: str,
        pos_tags: Set[str]
    ) -> Dict[str, Any]:
        """
        Get synonyms for a word using WordNet
        
        Args:
            word: The word to find synonyms for
            pos_tags: Set of SpaCy POS tags for this word
            
        Returns:
            Dictionary with synsets and all synonyms
        """
        synsets_info = []
        all_synonyms: Set[str] = set()
        
        # Convert SpaCy POS to WordNet POS
        wordnet_pos_list = []
        for pos in pos_tags:
            if pos in SPACY_TO_WORDNET_POS:
                wordnet_pos_list.append(SPACY_TO_WORDNET_POS[pos])
        
        # If no valid WordNet POS, try all POS
        if not wordnet_pos_list:
            wordnet_pos_list = [None]  # None means all POS
        
        seen_synsets = set()
        
        for wn_pos in wordnet_pos_list:
            try:
                if wn_pos:
                    synsets = wn.synsets(word, pos=wn_pos)
                else:
                    synsets = wn.synsets(word)
                
                for synset in synsets:
                    if synset.name() in seen_synsets:
                        continue
                    seen_synsets.add(synset.name())
                    
                    # Get lemma names (synonyms)
                    synonyms = [
                        lemma.name().replace('_', ' ')
                        for lemma in synset.lemmas()
                        if lemma.name().lower() != word.lower()
                    ]
                    
                    all_synonyms.update(synonyms)
                    
                    synsets_info.append({
                        "name": synset.name(),
                        "pos": WORDNET_TO_DISPLAY_POS.get(synset.pos(), synset.pos()),
                        "definition": synset.definition(),
                        "examples": synset.examples()[:3],  # Limit examples
                        "synonyms": synonyms  # Return all synonyms for each synset
                    })
                    
            except Exception as e:
                logger.warning(f"Error getting synsets for '{word}': {e}")
        
        return {
            "synsets": synsets_info,
            "all_synonyms": list(all_synonyms),
            "synonym_count": len(all_synonyms)
        }
    
    def _filter_synonyms_by_corpus(
        self,
        synonyms_info: Dict[str, Any],
        corpus_vocab: Set[str]
    ) -> Dict[str, Any]:
        """
        Retain only synonyms that actually appear in the corpus vocabulary.
        This ensures displayed synonym pairs are both dictionary-valid and
        present in the user's corpus (research-context relevant).
        """
        def in_corpus(syn: str) -> bool:
            low = syn.lower()
            return low in corpus_vocab or low.replace(' ', '_') in corpus_vocab
        
        filtered_synonyms = [s for s in synonyms_info['all_synonyms'] if in_corpus(s)]
        # Case-insensitive set so synset synonyms match even if WordNet uses different casing
        filtered_synset_set_lower = {s.lower() for s in filtered_synonyms}
        # Keep canonical form for display (first occurrence in filtered list)
        synonym_lower_to_canonical = {}
        for s in filtered_synonyms:
            if s.lower() not in synonym_lower_to_canonical:
                synonym_lower_to_canonical[s.lower()] = s
        
        filtered_synsets = []
        for synset in synonyms_info['synsets']:
            syns_in_synset = [
                synonym_lower_to_canonical.get(s.lower(), s)
                for s in synset['synonyms']
                if s.lower() in filtered_synset_set_lower
            ]
            if syns_in_synset:
                filtered_synsets.append({
                    **synset,
                    "synonyms": syns_in_synset
                })
        
        # Ensure every synonym appears in at least one synset (no orphan synonyms)
        covered_lower = set()
        for synset in filtered_synsets:
            for s in synset['synonyms']:
                covered_lower.add(s.lower())
        orphans = [
            s for s in filtered_synonyms
            if s.lower() not in covered_lower
        ]
        if orphans:
            filtered_synsets.append({
                "name": "_in_corpus",
                "pos": "",
                "definition": "",
                "examples": [],
                "synonyms": orphans
            })
        
        return {
            "synsets": filtered_synsets,
            "all_synonyms": filtered_synonyms,
            "synonym_count": len(filtered_synonyms)
        }
    
    def get_word_synonyms(self, word: str, pos: str = "auto") -> Dict[str, Any]:
        """
        Get synonyms for a single word (for quick lookup)
        
        Args:
            word: The word to find synonyms for
            pos: POS filter option
            
        Returns:
            Synonym information for the word
        """
        if not self._initialized:
            return {
                "success": False,
                "error": "WordNet not initialized",
                "word": word,
                "synsets": []
            }
        
        try:
            # Map POS filter to WordNet POS
            target_pos = POS_FILTER_OPTIONS.get(pos)
            wn_pos = SPACY_TO_WORDNET_POS.get(target_pos) if target_pos else None
            
            pos_tags = {target_pos} if target_pos else set()
            synonyms_info = self._get_synonyms(word, pos_tags)
            
            return {
                "success": True,
                "word": word,
                "synsets": synonyms_info['synsets'],
                "all_synonyms": synonyms_info['all_synonyms'],
                "synonym_count": synonyms_info['synonym_count']
            }
            
        except Exception as e:
            logger.error(f"Error getting synonyms for '{word}': {e}")
            return {
                "success": False,
                "error": str(e),
                "word": word,
                "synsets": []
            }
    
    def get_pos_options(self) -> List[Dict[str, str]]:
        """Get available POS filter options"""
        return [
            {"value": "auto", "label_en": "Auto-detect", "label_zh": "自动检测"},
            {"value": "adjective", "label_en": "Adjective", "label_zh": "形容词"},
            {"value": "adverb", "label_en": "Adverb", "label_zh": "副词"},
            {"value": "noun", "label_en": "Noun", "label_zh": "名词"},
            {"value": "verb", "label_en": "Verb", "label_zh": "动词"},
            {"value": "pronoun", "label_en": "Pronoun", "label_zh": "代词"},
        ]


# Singleton instance
_synonym_service = None


def get_synonym_service() -> SynonymService:
    """Get SynonymService singleton"""
    global _synonym_service
    if _synonym_service is None:
        _synonym_service = SynonymService()
    return _synonym_service

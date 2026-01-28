"""
Topic Modeling Preprocess Service
Uses SpaCy annotations from corpus management for text preprocessing
"""

import logging
import json
import os
from typing import Dict, List, Any, Optional, Set
from pathlib import Path

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import DATA_DIR, CORPORA_DIR, MODELS_DIR

logger = logging.getLogger(__name__)

# NLTK stopwords directory
NLTK_STOPWORDS_DIR = MODELS_DIR / "nltk" / "corpora" / "stopwords"


class TopicPreprocessService:
    """Service for preprocessing texts using SpaCy annotations"""
    
    def __init__(self):
        self.data_dir = DATA_DIR
        self.corpora_dir = CORPORA_DIR
        self._stopwords_cache: Dict[str, Set[str]] = {}
        self._corpus_name_cache: Dict[str, str] = {}
    
    def _get_corpus_dir(self, corpus_id: str) -> Path:
        """Get corpus directory path by corpus ID"""
        import sqlite3
        
        # Check cache
        if corpus_id in self._corpus_name_cache:
            return self.corpora_dir / self._corpus_name_cache[corpus_id]
        
        # Get corpus name from database
        db_path = self.data_dir / "database.sqlite"
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM corpora WHERE id = ?", (corpus_id,))
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    corpus_name = row[0]
                    self._corpus_name_cache[corpus_id] = corpus_name
                    return self.corpora_dir / corpus_name
            except Exception as e:
                logger.warning(f"Error getting corpus name: {e}")
        
        # Fallback to using corpus_id directly
        return self.corpora_dir / corpus_id
    
    def load_stopwords(self, language: str) -> Set[str]:
        """
        Load stopwords for a specific language from ./models/nltk
        
        Args:
            language: Language name (e.g., 'english', 'chinese', 'german')
            
        Returns:
            Set of stopwords
        """
        # Check cache first
        if language in self._stopwords_cache:
            return self._stopwords_cache[language]
        
        stopwords = set()
        
        # Try to load from NLTK stopwords directory
        stopwords_file = NLTK_STOPWORDS_DIR / language
        if stopwords_file.exists():
            try:
                with open(stopwords_file, 'r', encoding='utf-8') as f:
                    stopwords = set(word.strip().lower() for word in f if word.strip())
                logger.info(f"Loaded {len(stopwords)} stopwords for {language}")
            except Exception as e:
                logger.error(f"Error loading stopwords for {language}: {e}")
        else:
            logger.warning(f"Stopwords file not found for language: {language}")
            # Try lowercase
            stopwords_file = NLTK_STOPWORDS_DIR / language.lower()
            if stopwords_file.exists():
                try:
                    with open(stopwords_file, 'r', encoding='utf-8') as f:
                        stopwords = set(word.strip().lower() for word in f if word.strip())
                    logger.info(f"Loaded {len(stopwords)} stopwords for {language}")
                except Exception as e:
                    logger.error(f"Error loading stopwords for {language}: {e}")
        
        # Cache the result
        self._stopwords_cache[language] = stopwords
        return stopwords
    
    def get_available_languages(self) -> List[str]:
        """Get list of available stopwords languages"""
        languages = []
        if NLTK_STOPWORDS_DIR.exists():
            for f in NLTK_STOPWORDS_DIR.iterdir():
                if f.is_file() and not f.name.startswith('.'):
                    languages.append(f.name)
        return sorted(languages)
    
    def get_spacy_annotations(self, corpus_id: str, text_id: str) -> Optional[Dict]:
        """
        Get SpaCy annotations for a specific text
        
        Args:
            corpus_id: Corpus identifier
            text_id: Text identifier
            
        Returns:
            SpaCy annotation data or None
        """
        import sqlite3
        
        try:
            corpus_dir = self._get_corpus_dir(corpus_id)
            
            # First, get filename from database
            db_path = self.data_dir / "database.sqlite"
            filename_base = None
            media_type = 'text'
            
            if db_path.exists():
                try:
                    conn = sqlite3.connect(str(db_path))
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT filename, media_type FROM texts WHERE id = ?",
                        (text_id,)
                    )
                    row = cursor.fetchone()
                    conn.close()
                    
                    if row:
                        # Remove extension to get base filename
                        filename_base = Path(row['filename']).stem
                        media_type = row['media_type']
                except Exception as e:
                    logger.warning(f"Error getting filename from database: {e}")
            
            # Try to find spacy annotation file with actual filename
            if filename_base:
                if media_type == 'text':
                    spacy_path = corpus_dir / "files" / f"{filename_base}.spacy.json"
                    if spacy_path.exists():
                        with open(spacy_path, 'r', encoding='utf-8') as f:
                            return json.load(f)
                elif media_type == 'audio':
                    spacy_path = corpus_dir / "audios" / f"{filename_base}.spacy.json"
                    if spacy_path.exists():
                        with open(spacy_path, 'r', encoding='utf-8') as f:
                            return json.load(f)
                elif media_type == 'video':
                    spacy_path = corpus_dir / "videos" / f"{filename_base}.spacy.json"
                    if spacy_path.exists():
                        with open(spacy_path, 'r', encoding='utf-8') as f:
                            return json.load(f)
            
            # Fallback: try with text_id
            spacy_path = corpus_dir / "files" / f"{text_id}_spacy.json"
            if spacy_path.exists():
                with open(spacy_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            
            spacy_path = corpus_dir / "audios" / f"{text_id}_spacy.json"
            if spacy_path.exists():
                with open(spacy_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            
            spacy_path = corpus_dir / "videos" / f"{text_id}_spacy.json"
            if spacy_path.exists():
                with open(spacy_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            
            return None
            
        except Exception as e:
            logger.error(f"Error loading SpaCy annotations: {e}")
            return None
    
    def chunk_text_with_spacy(
        self,
        text: str,
        spacy_data: Optional[Dict],
        max_tokens: int = 256,
        overlap_tokens: int = 0,
        min_tokens: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Split text into chunks based on token count using SpaCy annotations.
        
        New Flow:
        1. Pre-check: Detect if any sentence exceeds 512 tokens, raise error if so
        2. Split by paragraphs (newlines) - natural segmentation
        3. Merge small paragraphs (< min_tokens) with next paragraph
        4. Within each merged block, split by sentence boundaries
        5. Concatenate sentences: when current + next exceeds max_tokens,
           move the last sentence to start of next chunk
        6. Special case: sentence > max_tokens but <= 512 becomes standalone chunk
        
        Args:
            text: Original text
            spacy_data: SpaCy annotation data with tokens and sentences
            max_tokens: Target max tokens per chunk (default 256)
            overlap_tokens: Number of overlapping tokens between chunks (unused in new logic)
            min_tokens: Minimum tokens per chunk (default 100), smaller paragraphs will be merged
            
        Returns:
            List of chunk dicts with:
                - text: chunk text
                - start: start char position in original text
                - end: end char position in original text
                - token_count: number of tokens
                - tokens: list of token data for this chunk
                
        Raises:
            ValueError: If any sentence exceeds 512 tokens
        """
        # Hard limit for SBERT
        HARD_MAX_TOKENS = 512
        
        if not spacy_data or 'tokens' not in spacy_data:
            # Fallback: simple paragraph splitting
            return self._simple_chunk_text(text, max_tokens)
        
        tokens = spacy_data.get('tokens', [])
        sentences = spacy_data.get('sentences', [])
        
        if not tokens:
            return [{'text': text, 'start': 0, 'end': len(text), 'token_count': 0, 'tokens': []}]
        
        # Step 1: Pre-check - detect sentences exceeding 512 tokens
        sentences_with_tokens = self._get_sentences_with_token_count(text, tokens, sentences)
        
        for sent in sentences_with_tokens:
            if sent['token_count'] > HARD_MAX_TOKENS:
                raise ValueError(
                    f"SENTENCE_EXCEEDS_LIMIT:{sent['token_count']}:{HARD_MAX_TOKENS}"
                )
        
        # Step 2: Split text by paragraphs (newlines) - natural segmentation
        paragraphs = self._split_into_paragraphs(text, tokens)
        
        if not paragraphs:
            # No paragraphs found, treat entire text as one paragraph
            paragraphs = [{'text': text, 'start': 0, 'end': len(text), 'tokens': tokens}]
        
        # Step 3: Merge small paragraphs (< min_tokens) with next paragraph
        merged_paragraphs = self._merge_small_paragraphs_forward(paragraphs, min_tokens)
        
        # Step 4 & 5: Within each merged block, split by sentences and concatenate
        final_chunks = []
        
        for para in merged_paragraphs:
            para_start = para['start']
            para_end = para['end']
            
            # Get sentences within this paragraph
            para_sentences = [
                s for s in sentences_with_tokens
                if s['start'] >= para_start and s['end'] <= para_end
            ]
            
            if not para_sentences:
                # No sentence data, keep paragraph as is
                token_count = sum(1 for t in para['tokens'] if not t.get('is_space', False))
                if token_count > 0:
                    final_chunks.append({
                        'text': para['text'],
                        'start': para_start,
                        'end': para_end,
                        'token_count': token_count,
                        'tokens': para['tokens']
                    })
                continue
            
            # Split paragraph into chunks by sentence boundaries
            para_chunks = self._split_by_sentences_within_block(
                para_sentences, max_tokens, HARD_MAX_TOKENS, text, tokens
            )
            final_chunks.extend(para_chunks)
        
        # Remove empty chunks
        final_chunks = [c for c in final_chunks if c['text'].strip() and c['token_count'] > 0]
        
        logger.info(f"Split text into {len(final_chunks)} chunks (min_tokens={min_tokens}, max_tokens={max_tokens})")
        return final_chunks
    
    def _get_sentences_with_token_count(
        self, 
        text: str, 
        tokens: List[Dict], 
        sentences: List[Dict]
    ) -> List[Dict[str, Any]]:
        """
        Get sentences with their token counts.
        
        Args:
            text: Original text
            tokens: SpaCy tokens
            sentences: SpaCy sentences
            
        Returns:
            List of sentence dicts with token_count added
        """
        result = []
        
        for sent in sentences:
            sent_start = sent.get('start', 0)
            sent_end = sent.get('end', 0)
            sent_text = sent.get('text', text[sent_start:sent_end])
            
            # Get tokens in this sentence
            sent_tokens = [
                t for t in tokens
                if t.get('start', 0) >= sent_start and t.get('end', 0) <= sent_end
            ]
            
            # Count non-space tokens
            token_count = sum(1 for t in sent_tokens if not t.get('is_space', False))
            
            result.append({
                'text': sent_text,
                'start': sent_start,
                'end': sent_end,
                'token_count': token_count,
                'tokens': sent_tokens
            })
        
        return result
    
    def _merge_small_paragraphs_forward(
        self, 
        paragraphs: List[Dict[str, Any]], 
        min_tokens: int
    ) -> List[Dict[str, Any]]:
        """
        Merge paragraphs smaller than min_tokens with the NEXT paragraph.
        
        Args:
            paragraphs: List of paragraph dicts
            min_tokens: Minimum tokens threshold
            
        Returns:
            List of merged paragraph dicts
        """
        if not paragraphs:
            return []
        
        # Calculate token counts for each paragraph
        for para in paragraphs:
            para['token_count'] = sum(
                1 for t in para.get('tokens', []) 
                if not t.get('is_space', False)
            )
        
        merged = []
        i = 0
        
        while i < len(paragraphs):
            current = {
                'text': paragraphs[i]['text'],
                'start': paragraphs[i]['start'],
                'end': paragraphs[i]['end'],
                'token_count': paragraphs[i]['token_count'],
                'tokens': list(paragraphs[i].get('tokens', []))
            }
            
            # Keep merging with next paragraph while current is too small
            while current['token_count'] < min_tokens and i + 1 < len(paragraphs):
                i += 1
                next_para = paragraphs[i]
                # Merge with next
                current['text'] = current['text'] + '\n' + next_para['text']
                current['end'] = next_para['end']
                current['token_count'] += next_para['token_count']
                current['tokens'].extend(next_para.get('tokens', []))
            
            merged.append(current)
            i += 1
        
        return merged
    
    def _split_by_sentences_within_block(
        self,
        sentences: List[Dict[str, Any]],
        max_tokens: int,
        hard_max: int,
        text: str,
        all_tokens: List[Dict]
    ) -> List[Dict[str, Any]]:
        """
        Split a block of sentences into chunks, respecting max_tokens.
        
        Logic:
        - Concatenate sentences one by one
        - When adding next sentence would exceed max_tokens:
          - Save current chunk
          - Start new chunk with the sentence that didn't fit
        - Special case: if a sentence > max_tokens but <= hard_max, it becomes standalone
        
        Args:
            sentences: List of sentence dicts with token_count
            max_tokens: Target max tokens per chunk
            hard_max: Hard maximum (512)
            text: Original text
            all_tokens: All tokens
            
        Returns:
            List of chunk dicts
        """
        if not sentences:
            return []
        
        chunks = []
        current_chunk = {
            'sentences': [],
            'token_count': 0
        }
        
        for sent in sentences:
            sent_token_count = sent['token_count']
            
            # Special case: sentence exceeds max_tokens but within hard limit
            if sent_token_count > max_tokens:
                # Save current chunk if it has content
                if current_chunk['sentences']:
                    chunks.append(self._build_chunk_from_sentences(
                        current_chunk['sentences'], text, all_tokens
                    ))
                    current_chunk = {'sentences': [], 'token_count': 0}
                
                # This sentence becomes its own chunk
                chunks.append(self._build_chunk_from_sentences([sent], text, all_tokens))
                continue
            
            # Check if adding this sentence would exceed max_tokens
            if current_chunk['token_count'] + sent_token_count > max_tokens:
                # Save current chunk if it has content
                if current_chunk['sentences']:
                    chunks.append(self._build_chunk_from_sentences(
                        current_chunk['sentences'], text, all_tokens
                    ))
                
                # Start new chunk with this sentence
                current_chunk = {
                    'sentences': [sent],
                    'token_count': sent_token_count
                }
            else:
                # Add sentence to current chunk
                current_chunk['sentences'].append(sent)
                current_chunk['token_count'] += sent_token_count
        
        # Don't forget the last chunk
        if current_chunk['sentences']:
            chunks.append(self._build_chunk_from_sentences(
                current_chunk['sentences'], text, all_tokens
            ))
        
        return chunks
    
    def _build_chunk_from_sentences(
        self,
        sentences: List[Dict[str, Any]],
        text: str,
        all_tokens: List[Dict]
    ) -> Dict[str, Any]:
        """
        Build a chunk dict from a list of sentences.
        
        Args:
            sentences: List of sentence dicts
            text: Original text
            all_tokens: All tokens
            
        Returns:
            Chunk dict
        """
        if not sentences:
            return {'text': '', 'start': 0, 'end': 0, 'token_count': 0, 'tokens': []}
        
        start = sentences[0]['start']
        end = sentences[-1]['end']
        chunk_text = text[start:end]
        
        # Collect tokens in this range
        chunk_tokens = [
            t for t in all_tokens
            if t.get('start', 0) >= start and t.get('end', 0) <= end
        ]
        
        token_count = sum(1 for t in chunk_tokens if not t.get('is_space', False))
        
        return {
            'text': chunk_text,
            'start': start,
            'end': end,
            'token_count': token_count,
            'tokens': chunk_tokens
        }
    
    def _split_into_paragraphs(self, text: str, tokens: List[Dict]) -> List[Dict[str, Any]]:
        """Split text into paragraphs based on newline characters"""
        paragraphs = []
        current_para = {
            'text': '',
            'start': None,
            'end': None,
            'tokens': []
        }
        
        for token in tokens:
            token_text = token.get('text', '')
            token_start = token.get('start', 0)
            token_end = token.get('end', 0)
            
            # Check if this token is a paragraph break (contains newline)
            if '\n' in token_text or '\r' in token_text:
                # Finish current paragraph if it has content
                if current_para['tokens']:
                    # Get actual text from original
                    if current_para['start'] is not None and current_para['end'] is not None:
                        current_para['text'] = text[current_para['start']:current_para['end']]
                    paragraphs.append(current_para)
                
                # Start new paragraph
                current_para = {
                    'text': '',
                    'start': None,
                    'end': None,
                    'tokens': []
                }
            else:
                # Add token to current paragraph
                if current_para['start'] is None:
                    current_para['start'] = token_start
                current_para['end'] = token_end
                current_para['tokens'].append(token)
        
        # Don't forget the last paragraph
        if current_para['tokens']:
            if current_para['start'] is not None and current_para['end'] is not None:
                current_para['text'] = text[current_para['start']:current_para['end']]
            paragraphs.append(current_para)
        
        return paragraphs
    
    def _split_paragraph_by_sentences(
        self,
        para: Dict[str, Any],
        all_sentences: List[Dict],
        max_tokens: int,
        overlap_tokens: int = 0
    ) -> List[Dict[str, Any]]:
        """Split a long paragraph by sentence boundaries"""
        para_start = para['start']
        para_end = para['end']
        para_tokens = para['tokens']
        
        # Find sentences that overlap with this paragraph
        relevant_sentences = []
        for sent in all_sentences:
            sent_start = sent.get('start', 0)
            sent_end = sent.get('end', 0)
            # Check if sentence overlaps with paragraph
            if sent_start < para_end and sent_end > para_start:
                relevant_sentences.append(sent)
        
        if not relevant_sentences:
            # No sentence info, fall back to token-based splitting
            return self._split_by_token_count(para, max_tokens, overlap_tokens)
        
        # Group sentences into chunks
        chunks = []
        current_chunk = {
            'text': '',
            'start': None,
            'end': None,
            'token_count': 0,
            'tokens': [],
            'sentences': []
        }
        
        for sent in relevant_sentences:
            sent_start = sent.get('start', 0)
            sent_end = sent.get('end', 0)
            sent_text = sent.get('text', '')
            
            # Get tokens for this sentence
            sent_tokens = [t for t in para_tokens 
                          if t.get('start', 0) >= sent_start and t.get('end', 0) <= sent_end]
            sent_token_count = sum(1 for t in sent_tokens if not t.get('is_space', False))
            
            # Check if adding this sentence would exceed max_tokens
            if current_chunk['token_count'] + sent_token_count > max_tokens and current_chunk['token_count'] > 0:
                # Save current chunk and start new one
                if current_chunk['start'] is not None:
                    chunks.append(current_chunk)
                
                # Start new chunk (with potential overlap)
                current_chunk = {
                    'text': '',
                    'start': sent_start,
                    'end': sent_end,
                    'token_count': sent_token_count,
                    'tokens': sent_tokens.copy(),
                    'sentences': [sent]
                }
            else:
                # Add sentence to current chunk
                if current_chunk['start'] is None:
                    current_chunk['start'] = sent_start
                current_chunk['end'] = sent_end
                current_chunk['token_count'] += sent_token_count
                current_chunk['tokens'].extend(sent_tokens)
                current_chunk['sentences'].append(sent)
        
        # Don't forget the last chunk
        if current_chunk['token_count'] > 0:
            chunks.append(current_chunk)
        
        # Build text for each chunk
        for chunk in chunks:
            if chunk.get('sentences'):
                chunk['text'] = ' '.join(s.get('text', '') for s in chunk['sentences'])
            del chunk['sentences']  # Remove temporary data
        
        return chunks
    
    def _split_by_token_count(
        self,
        para: Dict[str, Any],
        max_tokens: int,
        overlap_tokens: int = 0
    ) -> List[Dict[str, Any]]:
        """Fall back: split paragraph by token count when no sentence info"""
        tokens = para['tokens']
        chunks = []
        
        # Filter out space tokens for counting
        non_space_tokens = [t for t in tokens if not t.get('is_space', False)]
        
        i = 0
        while i < len(non_space_tokens):
            chunk_tokens = non_space_tokens[i:i + max_tokens]
            if chunk_tokens:
                chunk_start = chunk_tokens[0].get('start', 0)
                chunk_end = chunk_tokens[-1].get('end', 0)
                chunk_text = ' '.join(t.get('text', '') for t in chunk_tokens)
                
                chunks.append({
                    'text': chunk_text,
                    'start': chunk_start,
                    'end': chunk_end,
                    'token_count': len(chunk_tokens),
                    'tokens': chunk_tokens
                })
            
            i += max_tokens - overlap_tokens if overlap_tokens > 0 else max_tokens
        
        return chunks
    
    def _simple_chunk_text(self, text: str, max_tokens: int) -> List[Dict[str, Any]]:
        """Simple chunking without SpaCy data, based on whitespace tokens"""
        # Split by paragraphs first
        paragraphs = text.split('\n')
        chunks = []
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            words = para.split()
            if len(words) <= max_tokens:
                chunks.append({
                    'text': para,
                    'start': 0,
                    'end': len(para),
                    'token_count': len(words),
                    'tokens': []
                })
            else:
                # Split long paragraph
                for i in range(0, len(words), max_tokens):
                    chunk_words = words[i:i + max_tokens]
                    chunk_text = ' '.join(chunk_words)
                    chunks.append({
                        'text': chunk_text,
                        'start': 0,
                        'end': len(chunk_text),
                        'token_count': len(chunk_words),
                        'tokens': []
                    })
        
        return chunks
    
    def preprocess_text_with_spacy(
        self,
        text: str,
        spacy_data: Optional[Dict],
        config: Dict[str, Any],
        language: str = 'english'
    ) -> str:
        """
        Preprocess text using SpaCy annotations
        
        Args:
            text: Original text
            spacy_data: SpaCy annotation data
            config: Preprocessing configuration
                - remove_stopwords: bool
                - remove_punctuation: bool
                - lemmatize: bool
                - lowercase: bool
                - min_token_length: int
                - pos_filter: List[str] (e.g., ['NOUN', 'VERB', 'ADJ'])
            language: Language for stopwords
                
        Returns:
            Preprocessed text
        """
        if not spacy_data or 'tokens' not in spacy_data:
            # Fallback to simple preprocessing if no SpaCy data
            return self._simple_preprocess(text, config, language)
        
        tokens = spacy_data.get('tokens', [])
        processed_tokens = []
        
        # Note: stopwords and punctuation should be handled by vectorizer, not during embedding
        remove_stopwords = config.get('remove_stopwords', False)
        remove_punctuation = config.get('remove_punctuation', False)
        lemmatize = config.get('lemmatize', False)
        lowercase = config.get('lowercase', False)  # Keep original case for embedding
        min_token_length = config.get('min_token_length', 1)
        pos_filter = config.get('pos_filter', [])
        
        # Load stopwords if needed
        custom_stopwords = set()
        if remove_stopwords:
            custom_stopwords = self.load_stopwords(language)
        
        for token in tokens:
            # Skip based on various criteria
            # Use SpaCy's is_stop flag AND custom stopwords
            if remove_stopwords:
                if token.get('is_stop', False):
                    continue
                # Also check against custom stopwords
                token_lower = token.get('text', '').lower()
                if token_lower in custom_stopwords:
                    continue
            
            if remove_punctuation and token.get('is_punct', False):
                continue
            
            if token.get('is_space', False):
                continue
            
            # Get token text
            if lemmatize:
                token_text = token.get('lemma', token.get('text', ''))
            else:
                token_text = token.get('text', '')
            
            # Apply lowercase
            if lowercase:
                token_text = token_text.lower()
            
            # Check minimum length
            if len(token_text) < min_token_length:
                continue
            
            # Apply POS filter if specified
            if pos_filter:
                token_pos = token.get('pos', '')
                if token_pos not in pos_filter:
                    continue
            
            if token_text.strip():
                processed_tokens.append(token_text)
        
        return ' '.join(processed_tokens)
    
    def _simple_preprocess(self, text: str, config: Dict[str, Any], language: str = 'english') -> str:
        """Simple preprocessing without SpaCy data"""
        import re
        
        result = text
        
        # Note: lowercase, stopwords, and punctuation should be handled by vectorizer
        if config.get('lowercase', False):
            result = result.lower()
        
        if config.get('remove_punctuation', False):
            result = re.sub(r'[^\w\s]', '', result)
        
        # Basic tokenization
        tokens = result.split()
        
        # Remove stopwords if enabled (default False for embedding)
        if config.get('remove_stopwords', False):
            stopwords = self.load_stopwords(language)
            tokens = [t for t in tokens if t.lower() not in stopwords]
        
        min_length = config.get('min_token_length', 1)
        tokens = [t for t in tokens if len(t) >= min_length]
        
        return ' '.join(tokens)
    
    def preprocess_corpus_texts(
        self,
        corpus_id: str,
        text_ids: List[str],
        config: Dict[str, Any],
        language: str = 'english',
        chunking_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Preprocess multiple texts from a corpus with optional chunking
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            config: Preprocessing configuration
            language: Language for stopwords
            chunking_config: Optional chunking configuration
                - enabled: bool - whether to enable chunking
                - max_tokens: int - max tokens per chunk (default 256)
                - overlap_tokens: int - overlap between chunks (default 0)
            
        Returns:
            Dictionary with:
                - documents: List of preprocessed texts (or chunks)
                - original_texts: List of original texts
                - text_ids: List of text IDs (matching order, may have duplicates if chunked)
                - chunk_indices: List of chunk indices per original text (if chunking enabled)
                - stats: Processing statistics
        """
        documents = []
        original_texts = []
        valid_text_ids = []
        chunk_indices = []  # Track which chunks belong to which original text
        
        # Parse chunking config
        chunking_enabled = chunking_config.get('enabled', False) if chunking_config else False
        min_tokens = chunking_config.get('min_tokens', 100) if chunking_config else 100
        max_tokens = chunking_config.get('max_tokens', 256) if chunking_config else 256
        overlap_tokens = chunking_config.get('overlap_tokens', 0) if chunking_config else 0
        
        stats = {
            'total': len(text_ids),
            'processed': 0,
            'skipped': 0,
            'with_spacy': 0,
            'without_spacy': 0,
            'language': language,
            'chunking_enabled': chunking_enabled,
            'total_chunks': 0,
            'avg_chunks_per_text': 0
        }
        
        corpus_dir = self._get_corpus_dir(corpus_id)
        original_text_index = 0
        
        for text_id in text_ids:
            try:
                # Load original text
                text_content = self._load_text_content(corpus_dir, text_id)
                if not text_content or not text_content.strip():
                    stats['skipped'] += 1
                    continue
                
                # Load SpaCy annotations
                spacy_data = self.get_spacy_annotations(corpus_id, text_id)
                
                if spacy_data:
                    stats['with_spacy'] += 1
                else:
                    stats['without_spacy'] += 1
                
                if chunking_enabled:
                    # Step 1: Chunk the text BEFORE preprocessing
                    chunks = self.chunk_text_with_spacy(
                        text_content, 
                        spacy_data, 
                        max_tokens=max_tokens,
                        overlap_tokens=overlap_tokens,
                        min_tokens=min_tokens
                    )
                    
                    if not chunks:
                        stats['skipped'] += 1
                        continue
                    
                    # Step 2: Preprocess each chunk
                    chunk_count = 0
                    for chunk in chunks:
                        chunk_text = chunk['text']
                        chunk_tokens = chunk.get('tokens', [])
                        
                        # Create chunk-specific spacy data for preprocessing
                        chunk_spacy_data = {
                            'tokens': chunk_tokens,
                            'sentences': []  # Sentences not needed for individual chunk preprocessing
                        } if chunk_tokens else None
                        
                        # Preprocess the chunk
                        processed = self.preprocess_text_with_spacy(
                            chunk_text, 
                            chunk_spacy_data, 
                            config, 
                            language
                        )
                        
                        if processed.strip():
                            documents.append(processed)
                            original_texts.append(text_content)  # Keep reference to full original
                            valid_text_ids.append(text_id)
                            chunk_indices.append({
                                'original_index': original_text_index,
                                'chunk_index': chunk_count,
                                'total_chunks': len(chunks)
                            })
                            chunk_count += 1
                    
                    if chunk_count > 0:
                        stats['processed'] += 1
                        stats['total_chunks'] += chunk_count
                    else:
                        stats['skipped'] += 1
                else:
                    # Default: split by paragraphs (newlines)
                    chunks = self._split_by_paragraphs(text_content, spacy_data)
                    
                    if not chunks:
                        stats['skipped'] += 1
                        continue
                    
                    chunk_count = 0
                    for chunk in chunks:
                        chunk_text = chunk['text']
                        chunk_tokens = chunk.get('tokens', [])
                        
                        chunk_spacy_data = {
                            'tokens': chunk_tokens,
                            'sentences': []
                        } if chunk_tokens else None
                        
                        processed = self.preprocess_text_with_spacy(
                            chunk_text, 
                            chunk_spacy_data, 
                            config, 
                            language
                        )
                        
                        if processed.strip():
                            documents.append(processed)
                            original_texts.append(text_content)
                            valid_text_ids.append(text_id)
                            chunk_indices.append({
                                'original_index': original_text_index,
                                'chunk_index': chunk_count,
                                'total_chunks': len(chunks)
                            })
                            chunk_count += 1
                    
                    if chunk_count > 0:
                        stats['processed'] += 1
                        stats['total_chunks'] += chunk_count
                    else:
                        stats['skipped'] += 1
                
                original_text_index += 1
                    
            except Exception as e:
                logger.error(f"Error processing text {text_id}: {e}")
                stats['skipped'] += 1
        
        # Calculate average chunks per text
        if stats['processed'] > 0:
            stats['avg_chunks_per_text'] = round(stats['total_chunks'] / stats['processed'], 2)
        
        return {
            'documents': documents,
            'original_texts': original_texts,
            'text_ids': valid_text_ids,
            'chunk_indices': chunk_indices,
            'stats': stats
        }
    
    def _load_text_content(self, corpus_dir: Path, text_id: str) -> Optional[str]:
        """Load text content from corpus"""
        import sqlite3
        
        # First, get file info from database
        db_path = self.data_dir / "database.sqlite"
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT filename, content_path, media_type, transcript_path FROM texts WHERE id = ?",
                    (text_id,)
                )
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    # For text files, use content_path or construct from filename
                    if row['media_type'] == 'text':
                        if row['content_path'] and Path(row['content_path']).exists():
                            with open(row['content_path'], 'r', encoding='utf-8') as f:
                                return f.read()
                        # Fallback: try with filename
                        text_path = corpus_dir / "files" / row['filename']
                        if text_path.exists():
                            with open(text_path, 'r', encoding='utf-8') as f:
                                return f.read()
                    
                    # For audio/video, load transcript
                    elif row['media_type'] in ('audio', 'video'):
                        if row['transcript_path'] and Path(row['transcript_path']).exists():
                            with open(row['transcript_path'], 'r', encoding='utf-8') as f:
                                data = json.load(f)
                                if 'segments' in data:
                                    return ' '.join(seg.get('text', '') for seg in data['segments'])
                                return data.get('text', '')
            except Exception as e:
                logger.error(f"Error loading text from database: {e}")
        
        # Fallback: try direct file paths
        # Check in files directory
        text_path = corpus_dir / "files" / f"{text_id}.txt"
        if text_path.exists():
            with open(text_path, 'r', encoding='utf-8') as f:
                return f.read()
        
        # Check for transcript JSON in audios
        transcript_path = corpus_dir / "audios" / f"{text_id}_transcript.json"
        if transcript_path.exists():
            with open(transcript_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'segments' in data:
                    return ' '.join(seg.get('text', '') for seg in data['segments'])
                return data.get('text', '')
        
        # Check for transcript JSON in videos
        transcript_path = corpus_dir / "videos" / f"{text_id}_transcript.json"
        if transcript_path.exists():
            with open(transcript_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'segments' in data:
                    return ' '.join(seg.get('text', '') for seg in data['segments'])
                return data.get('text', '')
        
        return None
    
    def preview_preprocess(
        self,
        corpus_id: str,
        text_ids: List[str],
        config: Dict[str, Any],
        max_preview: int = 5,
        language: str = 'english'
    ) -> Dict[str, Any]:
        """
        Preview preprocessing results for a few texts
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            config: Preprocessing configuration
            max_preview: Maximum number of texts to preview
            language: Language for stopwords
            
        Returns:
            Preview data with before/after comparison
        """
        preview_ids = text_ids[:max_preview]
        previews = []
        
        corpus_dir = self._get_corpus_dir(corpus_id)
        
        for text_id in preview_ids:
            try:
                text_content = self._load_text_content(corpus_dir, text_id)
                if not text_content:
                    continue
                
                spacy_data = self.get_spacy_annotations(corpus_id, text_id)
                processed = self.preprocess_text_with_spacy(text_content, spacy_data, config, language)
                
                previews.append({
                    'text_id': text_id,
                    'original': text_content[:500] + ('...' if len(text_content) > 500 else ''),
                    'processed': processed[:500] + ('...' if len(processed) > 500 else ''),
                    'original_word_count': len(text_content.split()),
                    'processed_word_count': len(processed.split()),
                    'has_spacy': spacy_data is not None
                })
            except Exception as e:
                logger.error(f"Error previewing text {text_id}: {e}")
        
        return {
            'previews': previews,
            'total_texts': len(text_ids),
            'preview_count': len(previews),
            'config': config,
            'language': language
        }
    
    def preview_preprocess_chunks(
        self,
        corpus_id: str,
        text_ids: List[str],
        config: Dict[str, Any],
        max_preview: int = 10,
        language: str = 'english',
        chunking_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Preview preprocessing results with chunking.
        Shows total chunk count and first N chunks.
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            config: Preprocessing configuration
            max_preview: Maximum number of chunks to preview
            language: Language for stopwords
            chunking_config: Chunking configuration
            
        Returns:
            Preview data with chunk information
        """
        # Parse chunking config - default to paragraph-based chunking
        chunking_enabled = chunking_config.get('enabled', False) if chunking_config else False
        min_tokens = chunking_config.get('min_tokens', 100) if chunking_config else 100
        max_tokens = chunking_config.get('max_tokens', 256) if chunking_config else 256
        overlap_tokens = chunking_config.get('overlap_tokens', 0) if chunking_config else 0
        
        corpus_dir = self._get_corpus_dir(corpus_id)
        
        all_chunks = []
        total_chunk_count = 0
        texts_processed = 0
        
        for text_id in text_ids:
            try:
                text_content = self._load_text_content(corpus_dir, text_id)
                if not text_content:
                    continue
                
                spacy_data = self.get_spacy_annotations(corpus_id, text_id)
                texts_processed += 1
                
                if chunking_enabled:
                    # Use SpaCy-based chunking with token limits
                    chunks = self.chunk_text_with_spacy(
                        text_content, 
                        spacy_data, 
                        max_tokens=max_tokens,
                        overlap_tokens=overlap_tokens,
                        min_tokens=min_tokens
                    )
                else:
                    # Default: split by paragraphs (newlines)
                    chunks = self._split_by_paragraphs(text_content, spacy_data)
                
                for i, chunk in enumerate(chunks):
                    chunk_text = chunk['text']
                    chunk_tokens = chunk.get('tokens', [])
                    
                    # Create chunk-specific spacy data for preprocessing
                    chunk_spacy_data = {
                        'tokens': chunk_tokens,
                        'sentences': []
                    } if chunk_tokens else None
                    
                    # Preprocess the chunk
                    processed = self.preprocess_text_with_spacy(
                        chunk_text, 
                        chunk_spacy_data, 
                        config, 
                        language
                    )
                    
                    if processed.strip():
                        total_chunk_count += 1
                        
                        # Only keep detailed info for preview chunks
                        # No truncation needed - chunks are already limited to 512 tokens max
                        if len(all_chunks) < max_preview:
                            all_chunks.append({
                                'chunk_index': total_chunk_count - 1,
                                'text_id': text_id,
                                'original': chunk_text,
                                'processed': processed,
                                'original_token_count': chunk.get('token_count', len(chunk_text.split())),
                                'processed_word_count': len(processed.split()),
                                'has_spacy': spacy_data is not None
                            })
                            
            except Exception as e:
                logger.error(f"Error previewing text {text_id}: {e}")
        
        return {
            'previews': all_chunks,
            'total_chunks': total_chunk_count,
            'total_texts': len(text_ids),
            'texts_processed': texts_processed,
            'preview_count': len(all_chunks),
            'config': config,
            'language': language,
            'chunking_enabled': chunking_enabled,
            'max_tokens': max_tokens if chunking_enabled else None
        }
    
    def _split_by_paragraphs(
        self, 
        text: str, 
        spacy_data: Optional[Dict] = None
    ) -> List[Dict[str, Any]]:
        """
        Split text by paragraphs (newlines) - default chunking when not using token-based chunking.
        Each non-empty line becomes a chunk.
        
        Args:
            text: Original text
            spacy_data: Optional SpaCy annotation data
            
        Returns:
            List of chunk dicts
        """
        chunks = []
        tokens = spacy_data.get('tokens', []) if spacy_data else []
        
        # Split by newlines
        lines = text.split('\n')
        current_pos = 0
        
        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                current_pos += len(line) + 1  # +1 for newline
                continue
            
            # Find start position in original text
            line_start = text.find(line, current_pos)
            if line_start == -1:
                line_start = current_pos
            line_end = line_start + len(line)
            
            # Get tokens for this line
            line_tokens = []
            if tokens:
                line_tokens = [
                    t for t in tokens 
                    if t.get('start', 0) >= line_start and t.get('end', 0) <= line_end
                ]
            
            # Count non-space tokens
            token_count = sum(1 for t in line_tokens if not t.get('is_space', False)) if line_tokens else len(line_stripped.split())
            
            chunks.append({
                'text': line_stripped,
                'start': line_start,
                'end': line_end,
                'token_count': token_count,
                'tokens': line_tokens
            })
            
            current_pos = line_end + 1
        
        return chunks


# Singleton instance
_preprocess_service = None


def get_topic_preprocess_service() -> TopicPreprocessService:
    """Get topic preprocess service singleton"""
    global _preprocess_service
    if _preprocess_service is None:
        _preprocess_service = TopicPreprocessService()
    return _preprocess_service

"""
SpaCy NLP Service
Provides POS tagging, morphological analysis, NER, and dependency parsing
With enhanced sentence boundary detection for special cases (emails, URLs, decimals, name abbreviations)
And Markdown structure recognition (headings, lists, blockquotes)
With chunking support for long texts
"""

import logging
import re
import time
import json
import traceback
from typing import Dict, List, Any, Optional, Set, Tuple
from .spacy_chunking import (
    chunk_text, merge_annotations, DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ==================== Custom Sentence Boundary Detection ====================

# Patterns that should NOT trigger sentence boundaries
# These patterns help identify contexts where a period should not end a sentence

# Email pattern: user@domain.com
EMAIL_PATTERN = re.compile(r'[\w.-]+@[\w.-]+\.\w+')

# URL patterns: http://... https://... www....
URL_PATTERN = re.compile(r'https?://\S+|www\.\S+')

# Decimal numbers: 3.14, 100.5, etc.
DECIMAL_PATTERN = re.compile(r'\d+\.\d+')

# Name abbreviations: single capital letter followed by period
# Examples: J. P. Morgan, Dr. Smith, Prof. Lee, Mr. John, Mrs. Jane
NAME_ABBREV_PATTERN = re.compile(r'\b[A-Z]\.\s*(?=[A-Z]|\s|$)')

# Ordered list item pattern: 1. 2. 3. etc. at line start
ORDERED_LIST_PATTERN = re.compile(r'(?:^|\n)\s*\d+\.\s')

# Common titles/abbreviations that should not end sentences
COMMON_ABBREVIATIONS = {
    'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'inc', 'ltd',
    'corp', 'co', 'no', 'vol', 'rev', 'gen', 'col', 'lt', 'st', 'ave', 'blvd',
    'dept', 'univ', 'assn', 'bros', 'ph', 'ed', 'est', 'approx', 'govt',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
}

# ==================== Markdown Pattern Detection ====================

# Markdown heading pattern: # ## ### #### ##### ###### at line start
MARKDOWN_HEADING_PATTERN = re.compile(r'(?:^|\n)(#{1,6})\s+')

# Markdown unordered list pattern: - * + at line start (with optional indentation)
MARKDOWN_UNORDERED_LIST_PATTERN = re.compile(r'(?:^|\n)\s*[-*+]\s+')

# Markdown blockquote pattern: > at line start
MARKDOWN_BLOCKQUOTE_PATTERN = re.compile(r'(?:^|\n)\s*>\s*')

# Empty line pattern (paragraph separator)
EMPTY_LINE_PATTERN = re.compile(r'\n\s*\n')


def find_protected_spans(text: str) -> Set[Tuple[int, int]]:
    """
    Find all character positions that contain periods which should NOT end sentences.
    Returns a set of (start, end) tuples for protected spans.
    """
    protected = set()
    
    # Find email spans
    for match in EMAIL_PATTERN.finditer(text):
        protected.add((match.start(), match.end()))
    
    # Find URL spans
    for match in URL_PATTERN.finditer(text):
        protected.add((match.start(), match.end()))
    
    # Find decimal number spans
    for match in DECIMAL_PATTERN.finditer(text):
        protected.add((match.start(), match.end()))
    
    # Find name abbreviation spans (e.g., "J. P." in "J. P. Morgan")
    for match in NAME_ABBREV_PATTERN.finditer(text):
        protected.add((match.start(), match.end()))
    
    # Find ordered list number spans (e.g., "1. " "2. " at line start)
    for match in ORDERED_LIST_PATTERN.finditer(text):
        protected.add((match.start(), match.end()))
    
    return protected


def find_native_newlines(text: str) -> Set[int]:
    """
    Find character positions where native newlines occur (excluding empty lines).
    A native newline is a single newline that starts a new line with actual content.
    Empty lines (consecutive newlines or lines with only whitespace) are excluded.
    
    Returns a set of character positions that should start new segments.
    """
    boundaries = set()
    
    # Find all single newline positions
    i = 0
    while i < len(text):
        if text[i] == '\n':
            # Check if this is part of an empty line (consecutive newlines or newline followed by whitespace then newline)
            # Look ahead to see if there's content before the next newline
            j = i + 1
            
            # Skip spaces/tabs (not newlines)
            while j < len(text) and text[j] in ' \t':
                j += 1
            
            # If we hit another newline or end of text, this is an empty line - skip
            if j >= len(text) or text[j] == '\n':
                i += 1
                continue
            
            # This is a native newline with content following
            # The boundary is at the start of actual content (after whitespace)
            boundaries.add(j)
        
        i += 1
    
    return boundaries


def find_markdown_boundaries(text: str) -> Set[int]:
    """
    Find character positions where Markdown structures start a new segment.
    Returns a set of character positions that should start new sentences/paragraphs.
    """
    boundaries = set()
    
    # Find empty line boundaries (paragraph separators)
    for match in EMPTY_LINE_PATTERN.finditer(text):
        # The boundary is at the start of non-whitespace after the empty line
        end_pos = match.end()
        # Skip any remaining whitespace to find actual content start
        while end_pos < len(text) and text[end_pos] in ' \t':
            end_pos += 1
        if end_pos < len(text):
            boundaries.add(end_pos)
    
    # Find Markdown heading boundaries
    for match in MARKDOWN_HEADING_PATTERN.finditer(text):
        # Start of the # character (skip newline if present)
        start = match.start()
        if start > 0 and text[start] == '\n':
            start += 1
        boundaries.add(start)
    
    # Find unordered list item boundaries
    for match in MARKDOWN_UNORDERED_LIST_PATTERN.finditer(text):
        start = match.start()
        if start > 0 and text[start] == '\n':
            start += 1
        # Skip whitespace to the list marker
        while start < len(text) and text[start] in ' \t':
            start += 1
        boundaries.add(start)
    
    # Find ordered list item boundaries
    for match in ORDERED_LIST_PATTERN.finditer(text):
        start = match.start()
        if start > 0 and text[start] == '\n':
            start += 1
        # Skip whitespace to the number
        while start < len(text) and text[start] in ' \t':
            start += 1
        boundaries.add(start)
    
    # Find blockquote boundaries
    for match in MARKDOWN_BLOCKQUOTE_PATTERN.finditer(text):
        start = match.start()
        if start > 0 and text[start] == '\n':
            start += 1
        # Skip whitespace to the >
        while start < len(text) and text[start] in ' \t':
            start += 1
        boundaries.add(start)
    
    return boundaries


def is_sentence_boundary_valid(text: str, boundary_pos: int, protected_spans: Set[Tuple[int, int]]) -> bool:
    """
    Check if a sentence boundary at the given position is valid.
    Returns False if the boundary falls within a protected span or after a protected period.
    """
    if boundary_pos <= 0:
        return True
    
    # Check if the character before the boundary is a period
    check_pos = boundary_pos - 1
    # Skip whitespace backwards
    while check_pos > 0 and text[check_pos] in ' \t\n\r':
        check_pos -= 1
    
    # If we found a period, check if it's protected
    if check_pos >= 0 and text[check_pos] == '.':
        if is_position_protected(check_pos, protected_spans):
            return False
        if is_abbreviation_period(text, check_pos):
            return False
    
    return True


def post_process_sentences(text: str, raw_sentences: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Post-process SpaCy sentence boundaries to fix special cases.
    
    This function corrects sentence boundaries that SpaCy's parser may have incorrectly set,
    especially for:
    - Email addresses (user@domain.com)
    - URLs (https://... www....)
    - Decimal numbers (3.14, 100.5)
    - Name abbreviations (J. P. Morgan, Dr. Smith)
    - Common abbreviations (Mr., Mrs., Inc., etc.)
    - Ordered list numbers at line start (1. 2. 3.)
    
    And ensures proper segmentation for:
    - Native newlines (highest priority, excluding empty lines)
    - Markdown structures (headings, lists, blockquotes, empty lines)
    - Sentence-ending punctuation (. ! ?)
    
    Priority: Native newlines > Markdown boundaries > Sentence punctuation
    
    Args:
        text: Original text
        raw_sentences: List of sentence dicts from SpaCy with 'text', 'start', 'end'
        
    Returns:
        Corrected list of sentence dicts
    """
    if not raw_sentences:
        return raw_sentences
    
    # PERFORMANCE: Skip post-processing for very long texts (>100k chars or >3000 sentences)
    # The post-processing is O(n*m) where n=text_len and m=num_sentences
    # For large texts, SpaCy's sentence detection is usually good enough
    if len(text) > 100000 or len(raw_sentences) > 3000:
        logger.info(f"Skipping sentence post-processing for large text ({len(text):,} chars, {len(raw_sentences):,} sentences)")
        return raw_sentences
    
    # Find protected spans, native newlines and Markdown boundaries
    protected_spans = find_protected_spans(text)
    native_newlines = find_native_newlines(text)
    markdown_boundaries = find_markdown_boundaries(text)
    
    # Combine native newlines and Markdown boundaries (native newlines have priority)
    # Both are segmentation points, but native newlines should always split
    all_segment_boundaries = native_newlines | markdown_boundaries
    
    # First pass: Merge sentences that were incorrectly split at protected positions
    merged_sentences = []
    i = 0
    
    while i < len(raw_sentences):
        current = raw_sentences[i].copy()
        
        # Check if we need to merge with next sentences
        while i + 1 < len(raw_sentences):
            next_sent = raw_sentences[i + 1]
            
            # Check if the boundary between current and next is invalid (protected)
            if not is_sentence_boundary_valid(text, next_sent['start'], protected_spans):
                # Merge: extend current sentence to include next
                current['text'] = text[current['start']:next_sent['end']]
                current['end'] = next_sent['end']
                i += 1
            else:
                break
        
        merged_sentences.append(current)
        i += 1
    
    # Second pass: Split sentences at native newlines and Markdown boundaries
    final_sentences = []
    
    for sent in merged_sentences:
        sent_start = sent['start']
        sent_end = sent['end']
        sent_text = text[sent_start:sent_end]
        
        # Find all segment boundaries within this sentence
        boundaries_in_sent = []
        for boundary in all_segment_boundaries:
            if sent_start < boundary < sent_end:
                boundaries_in_sent.append(boundary)
        
        if not boundaries_in_sent:
            # No boundaries, keep sentence as is
            final_sentences.append(sent)
        else:
            # Split at boundaries
            boundaries_in_sent.sort()
            boundaries_in_sent.insert(0, sent_start)
            boundaries_in_sent.append(sent_end)
            
            for j in range(len(boundaries_in_sent) - 1):
                sub_start = boundaries_in_sent[j]
                sub_end = boundaries_in_sent[j + 1]
                sub_text = text[sub_start:sub_end].strip()
                
                if sub_text:  # Only add non-empty sentences
                    # Adjust start to skip leading whitespace
                    actual_start = sub_start
                    while actual_start < sub_end and text[actual_start] in ' \t\n\r':
                        actual_start += 1
                    
                    # Adjust end to skip trailing whitespace
                    actual_end = sub_end
                    while actual_end > actual_start and text[actual_end - 1] in ' \t\n\r':
                        actual_end -= 1
                    
                    if actual_start < actual_end:
                        final_sentences.append({
                            'text': text[actual_start:actual_end],
                            'start': actual_start,
                            'end': actual_end
                        })
    
    # Third pass: Further split by sentence-ending punctuation within each segment
    result_sentences = []
    
    for sent in final_sentences:
        sent_start = sent['start']
        sent_end = sent['end']
        sent_text = text[sent_start:sent_end]
        
        # Find sentence-ending punctuation
        sentence_endings = []
        for match in re.finditer(r'[.!?]', sent_text):
            pos_in_sent = match.start()
            pos_in_text = sent_start + pos_in_sent
            
            # Check if this is a valid sentence boundary
            if is_position_protected(pos_in_text, protected_spans):
                continue
            if is_abbreviation_period(text, pos_in_text):
                continue
            
            # Check if followed by space and uppercase (or end of segment)
            after_pos = pos_in_sent + 1
            if after_pos < len(sent_text):
                # Skip whitespace
                while after_pos < len(sent_text) and sent_text[after_pos] in ' \t\n\r':
                    after_pos += 1
                
                # If next char is lowercase, not a sentence boundary
                if after_pos < len(sent_text) and sent_text[after_pos].islower():
                    continue
            
            sentence_endings.append(pos_in_sent + 1)  # Include the punctuation
        
        if not sentence_endings:
            result_sentences.append(sent)
        else:
            # Split at sentence endings
            sentence_endings.insert(0, 0)
            sentence_endings.append(len(sent_text))
            
            for j in range(len(sentence_endings) - 1):
                sub_start_rel = sentence_endings[j]
                sub_end_rel = sentence_endings[j + 1]
                
                # Skip leading whitespace
                while sub_start_rel < sub_end_rel and sent_text[sub_start_rel] in ' \t\n\r':
                    sub_start_rel += 1
                
                # Skip trailing whitespace
                while sub_end_rel > sub_start_rel and sent_text[sub_end_rel - 1] in ' \t\n\r':
                    sub_end_rel -= 1
                
                if sub_start_rel < sub_end_rel:
                    actual_start = sent_start + sub_start_rel
                    actual_end = sent_start + sub_end_rel
                    result_sentences.append({
                        'text': text[actual_start:actual_end],
                        'start': actual_start,
                        'end': actual_end
                    })
    
    # Sort by start position
    result_sentences.sort(key=lambda x: x['start'])
    
    # Remove duplicates and ensure no overlaps
    if result_sentences:
        deduped = [result_sentences[0]]
        for sent in result_sentences[1:]:
            if sent['start'] >= deduped[-1]['end']:
                deduped.append(sent)
            elif sent['end'] > deduped[-1]['end']:
                # Overlapping but extends further - merge
                deduped[-1]['end'] = sent['end']
                deduped[-1]['text'] = text[deduped[-1]['start']:sent['end']]
        result_sentences = deduped
    
    return result_sentences


def is_position_protected(pos: int, protected_spans: Set[Tuple[int, int]]) -> bool:
    """Check if a character position falls within any protected span."""
    for start, end in protected_spans:
        if start <= pos < end:
            return True
    return False


def is_abbreviation_period(text: str, period_pos: int) -> bool:
    """
    Check if a period at the given position is likely part of an abbreviation.
    """
    if period_pos <= 0:
        return False
    
    # Find the word before the period
    word_start = period_pos - 1
    while word_start > 0 and text[word_start - 1].isalpha():
        word_start -= 1
    
    word_before = text[word_start:period_pos].lower()
    
    # Check if it's a known abbreviation
    if word_before in COMMON_ABBREVIATIONS:
        return True
    
    # Single letter followed by period (like initials: J. K. Rowling)
    if len(word_before) == 1 and word_before.isupper():
        return True
    
    return False


def set_custom_sentence_boundaries(doc):
    """
    Custom component to set sentence boundaries, protecting special patterns
    and recognizing Markdown structure boundaries.
    This function is called as a SpaCy pipeline component.
    """
    protected_spans = find_protected_spans(doc.text)
    markdown_boundaries = find_markdown_boundaries(doc.text)
    
    for i, token in enumerate(doc):
        # Default: don't start a new sentence
        if i == 0:
            token.is_sent_start = True
            continue
        
        prev_token = doc[i - 1]
        token_pos = token.idx
        
        # Check if this token starts at a Markdown boundary
        if token_pos in markdown_boundaries:
            token.is_sent_start = True
            continue
        
        # Check for newline before token (potential Markdown line start)
        # Look for Markdown markers at line start
        # ONLY mark as sentence start if this token IS the markdown marker itself
        if token_pos > 0:
            # Check if there's a newline before this token
            text_before = doc.text[:token_pos]
            last_newline = text_before.rfind('\n')
            if last_newline >= 0:
                line_start = last_newline + 1
                # Calculate the position where actual content starts (after leading whitespace)
                content_start = line_start
                while content_start < len(doc.text) and doc.text[content_start] in ' \t':
                    content_start += 1
                
                # Only mark as new sentence if this token is AT the content start position
                # This prevents marking every word in the line as a new sentence
                if token_pos == content_start:
                    line_content = doc.text[line_start:token_pos + len(token.text)]
                    line_stripped = line_content.lstrip()
                    
                    # Check for Markdown patterns at line start
                    if line_stripped.startswith('#'):
                        # This is a heading line - token is the # marker
                        token.is_sent_start = True
                        continue
                    elif line_stripped and line_stripped[0] in '-*+':
                        # Could be unordered list item - token is the list marker
                        if len(line_stripped) > 1 and line_stripped[1] in ' \t':
                            token.is_sent_start = True
                            continue
                    elif line_stripped.startswith('>'):
                        # Blockquote - token is the > marker
                        token.is_sent_start = True
                        continue
        
        # Check if previous token ends with a sentence-ending punctuation
        if prev_token.text in '.!?':
            # Check if this period is protected
            period_pos = prev_token.idx + len(prev_token.text) - 1
            
            if is_position_protected(period_pos, protected_spans):
                # Protected position - don't start new sentence
                token.is_sent_start = False
            elif is_abbreviation_period(doc.text, period_pos):
                # Abbreviation - don't start new sentence
                token.is_sent_start = False
            elif token.text[0].isupper() or token.text[0] in '"\'([':
                # Normal sentence boundary - start new sentence
                token.is_sent_start = True
            else:
                # Lowercase after period - might be continuation
                token.is_sent_start = False
        else:
            token.is_sent_start = False
    
    return doc


# Register the custom component with SpaCy
try:
    import spacy
    from spacy.language import Language
    
    @Language.component("custom_sentencizer")
    def custom_sentencizer_component(doc):
        return set_custom_sentence_boundaries(doc)
except ImportError:
    pass  # SpaCy not available


class SpacyService:
    """SpaCy NLP annotation service"""
    
    def __init__(self):
        self.nlp_en = None
        self.nlp_zh = None
        self._spacy_available = None
    
    def _check_spacy(self) -> bool:
        """Check if spacy is available"""
        if self._spacy_available is None:
            try:
                import spacy
                self._spacy_available = True
                logger.info("SpaCy is available")
            except ImportError:
                self._spacy_available = False
                logger.warning("SpaCy is not installed")
        return self._spacy_available
    
    def _add_custom_sentencizer(self, nlp):
        """
        Add custom sentencizer component to the pipeline.
        This improves sentence boundary detection for special cases.
        """
        try:
            # Remove the default sentencizer if exists
            if "sentencizer" in nlp.pipe_names:
                nlp.remove_pipe("sentencizer")
            
            # Add our custom sentencizer before parser (if parser exists)
            # Our component will run after tokenization but before other components
            if "custom_sentencizer" not in nlp.pipe_names:
                if "parser" in nlp.pipe_names:
                    nlp.add_pipe("custom_sentencizer", before="parser")
                elif "ner" in nlp.pipe_names:
                    nlp.add_pipe("custom_sentencizer", before="ner")
                else:
                    nlp.add_pipe("custom_sentencizer", last=True)
                logger.info("Added custom_sentencizer to pipeline")
        except Exception as e:
            logger.warning(f"Could not add custom sentencizer: {e}")
        
        return nlp
    
    def load_model(self, language: str):
        """
        Load SpaCy model for the specified language
        
        Args:
            language: Language code (english, chinese, etc.)
            
        Returns:
            SpaCy nlp object or None
        """
        if not self._check_spacy():
            return None
        
        import spacy
        
        # Normalize language
        lang = language.lower()
        
        if lang in ['chinese', 'zh', 'zh-cn', 'mandarin']:
            if self.nlp_zh is None:
                try:
                    self.nlp_zh = spacy.load("zh_core_web_lg")
                    logger.info("Loaded zh_core_web_lg model")
                    self.nlp_zh = self._add_custom_sentencizer(self.nlp_zh)
                except OSError:
                    try:
                        self.nlp_zh = spacy.load("zh_core_web_sm")
                        logger.info("Loaded zh_core_web_sm model (fallback)")
                        self.nlp_zh = self._add_custom_sentencizer(self.nlp_zh)
                    except OSError:
                        logger.error("No Chinese SpaCy model found. Install with: pip install ./models/zh_core_web_lg-3.8.0-py3-none-any.whl")
                        return None
            return self.nlp_zh
        else:
            # Default to English
            if self.nlp_en is None:
                try:
                    self.nlp_en = spacy.load("en_core_web_lg")
                    logger.info("Loaded en_core_web_lg model")
                    self.nlp_en = self._add_custom_sentencizer(self.nlp_en)
                except OSError:
                    try:
                        self.nlp_en = spacy.load("en_core_web_sm")
                        logger.info("Loaded en_core_web_sm model (fallback)")
                        self.nlp_en = self._add_custom_sentencizer(self.nlp_en)
                    except OSError:
                        logger.error("No English SpaCy model found. Install with: pip install ./models/en_core_web_lg-3.8.0-py3-none-any.whl")
                        return None
            return self.nlp_en
    
    def is_available(self, language: str = "english") -> bool:
        """Check if SpaCy model is available for the language"""
        return self.load_model(language) is not None
    
    def annotate_text(self, text: str, language: str = "english", chunk_size: Optional[int] = None) -> Dict[str, Any]:
        """
        Perform full SpaCy annotation on text.
        Automatically uses chunking for long texts.
        
        Args:
            text: Text to annotate
            language: Language code
            chunk_size: Optional chunk size override (default: DEFAULT_CHUNK_SIZE)
            
        Returns:
            Dictionary containing:
            - tokens: List of token info (text, pos, tag, lemma, dep, morph)
            - entities: List of named entities
            - sentences: List of sentence boundaries (post-processed for special cases)
        """
        # Normalize line endings to Unix style (\n) to match frontend display
        # This is critical: Windows \r\n (2 chars) vs Unix \n (1 char) causes
        # character offset drift that breaks annotation alignment
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        
        # Process normally (chunking disabled to avoid hanging issues)
        result = {
            "success": False,
            "tokens": [],
            "entities": [],
            "sentences": [],
            "error": None
        }
        
        nlp = self.load_model(language)
        if nlp is None:
            result["error"] = f"SpaCy model not available for {language}"
            return result
        
        try:
            doc = nlp(text)
            
            # Extract tokens with all annotations
            for token in doc:
                token_info = {
                    "text": token.text,
                    "start": token.idx,
                    "end": token.idx + len(token.text),
                    "pos": token.pos_,  # Universal POS tag
                    "tag": token.tag_,  # Fine-grained POS tag
                    "lemma": token.lemma_,
                    "dep": token.dep_,  # Dependency relation
                    "head": token.head.i,  # Index of head token
                    "morph": str(token.morph) if token.morph else "",
                    "is_stop": token.is_stop,
                    "is_punct": token.is_punct,
                    "is_space": token.is_space
                }
                result["tokens"].append(token_info)
            
            # Extract named entities
            for ent in doc.ents:
                entity_info = {
                    "text": ent.text,
                    "start": ent.start_char,
                    "end": ent.end_char,
                    "label": ent.label_,
                    "description": self._get_entity_description(ent.label_)
                }
                result["entities"].append(entity_info)
            
            # Extract raw sentence boundaries from SpaCy
            raw_sentences = []
            for sent in doc.sents:
                raw_sentences.append({
                    "text": sent.text,
                    "start": sent.start_char,
                    "end": sent.end_char
                })
            
            # PERFORMANCE: Skip post-processing for large texts
            # Post-processing is O(n*m) and very slow for large texts
            if len(text) > 100000 or len(raw_sentences) > 3000:
                logger.info(f"Skipping post-processing for large text: {len(text):,} chars, {len(raw_sentences):,} sentences")
                result["sentences"] = raw_sentences
            else:
                # Post-process sentences to fix special cases only for smaller texts
                # (emails, URLs, decimals, abbreviations, Markdown structures)
                result["sentences"] = post_process_sentences(text, raw_sentences)
            
            # DEBUG: Log sentence boundary verification
            for i, sent in enumerate(result["sentences"][:3]):
                actual_text = text[sent["start"]:sent["end"]]
                match = actual_text == sent["text"]
                logger.info(f"DEBUG Sentence {i}: start={sent['start']}, end={sent['end']}, text_match={match}, sent_text='{sent['text'][:40]}...', actual='{actual_text[:40]}...'")
            
            result["success"] = True
            logger.info(f"Annotated text: {len(result['tokens'])} tokens, {len(result['entities'])} entities, {len(result['sentences'])} sentences (post-processed)")
            
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"SpaCy annotation error: {e}")
        
        return result
    
    def annotate_text_chunked(
        self, 
        text: str, 
        language: str = "english", 
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        Perform SpaCy annotation on long text using chunking.
        
        Args:
            text: Text to annotate
            language: Language code
            chunk_size: Size of each chunk in characters
            progress_callback: Optional callback function(chunk_num, total_chunks, message)
            
        Returns:
            Merged annotation result with adjusted indices
        """
        result = {
            "success": False,
            "tokens": [],
            "entities": [],
            "sentences": [],
            "error": None
        }
        
        nlp = self.load_model(language)
        if nlp is None:
            result["error"] = f"SpaCy model not available for {language}"
            return result
        
        try:
            # Split text into chunks
            chunks = chunk_text(text, chunk_size)
            total_chunks = len(chunks)
            
            logger.info(f"Processing {total_chunks} chunks for text of {len(text):,} characters")
            
            if progress_callback:
                progress_callback(0, total_chunks, f"Starting chunked annotation ({total_chunks} chunks)")
            
            # Process each chunk
            chunk_results = []
            chunk_boundaries = []
            
            for i, (chunk_start, chunk_end, chunk_text_segment) in enumerate(chunks):
                chunk_num = i + 1
                
                # Send progress update BEFORE processing each chunk to avoid timeout
                if progress_callback:
                    progress_callback(chunk_num - 1, total_chunks, f"Starting chunk {chunk_num}/{total_chunks} ({chunk_end - chunk_start:,} chars)")
                
                logger.info(f"Processing chunk {chunk_num}/{total_chunks}: positions {chunk_start:,}-{chunk_end:,} ({chunk_end - chunk_start:,} chars)")
                
                try:
                    # Process chunk using normal annotation
                    # Note: We pass the nlp model to avoid reloading for each chunk
                    # Also pass progress callback to allow periodic updates during processing
                    chunk_result = self._annotate_single_chunk(
                        chunk_text_segment, 
                        language, 
                        nlp,
                        progress_callback=lambda msg: progress_callback(chunk_num, total_chunks, f"Chunk {chunk_num}/{total_chunks}: {msg}") if progress_callback else None,
                        chunk_num=chunk_num,
                        total_chunks=total_chunks
                    )
                    
                    # Send progress update AFTER processing each chunk
                    if progress_callback:
                        progress_callback(chunk_num, total_chunks, f"Completed chunk {chunk_num}/{total_chunks} ({len(chunk_result.get('tokens', []))} tokens)")
                    chunk_results.append(chunk_result)
                    chunk_boundaries.append((chunk_start, chunk_end))
                    
                    if not chunk_result.get("success"):
                        logger.warning(f"Chunk {chunk_num} failed: {chunk_result.get('error')}")
                    else:
                        logger.info(f"Chunk {chunk_num} completed: {len(chunk_result.get('tokens', []))} tokens, {len(chunk_result.get('entities', []))} entities")
                
                except Exception as e:
                    logger.error(f"Error processing chunk {chunk_num}: {e}")
                    import traceback
                    traceback.print_exc()
                    chunk_results.append({
                        "success": False,
                        "tokens": [],
                        "entities": [],
                        "sentences": [],
                        "error": str(e)
                    })
                    chunk_boundaries.append((chunk_start, chunk_end))
            
            # Merge results
            if progress_callback:
                progress_callback(total_chunks, total_chunks, "Merging chunk results...")
            
            merged_result = merge_annotations(chunk_results, chunk_boundaries, text)
            
            if progress_callback:
                progress_callback(total_chunks, total_chunks, "Chunked annotation completed")
            
            return merged_result
            
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"SpaCy chunked annotation error: {e}")
            return result
    
    def _annotate_single_chunk(self, chunk_text: str, language: str, nlp, progress_callback=None, chunk_num=0, total_chunks=0) -> Dict[str, Any]:
        """
        Annotate a single chunk of text (internal method).
        
        Args:
            chunk_text: Text chunk to annotate
            language: Language code
            nlp: Loaded SpaCy model
            progress_callback: Optional callback for progress updates during chunk processing
            chunk_num: Current chunk number (for progress reporting)
            total_chunks: Total number of chunks (for progress reporting)
            
        Returns:
            Annotation result for the chunk
        """
        result = {
            "success": False,
            "tokens": [],
            "entities": [],
            "sentences": [],
            "error": None
        }
        
        try:
            # #region agent log
            chunk_annotate_start = time.time()
            # #endregion
            
            # Process with SpaCy - this is the time-consuming part
            doc = nlp(chunk_text)
            
            # Extract tokens with all annotations
            for token in doc:
                token_info = {
                    "text": token.text,
                    "start": token.idx,
                    "end": token.idx + len(token.text),
                    "pos": token.pos_,  # Universal POS tag
                    "tag": token.tag_,  # Fine-grained POS tag
                    "lemma": token.lemma_,
                    "dep": token.dep_,  # Dependency relation
                    "head": token.head.i,  # Index of head token (relative to chunk)
                    "morph": str(token.morph) if token.morph else "",
                    "is_stop": token.is_stop,
                    "is_punct": token.is_punct,
                    "is_space": token.is_space
                }
                result["tokens"].append(token_info)
            
            # Extract named entities
            for ent in doc.ents:
                entity_info = {
                    "text": ent.text,
                    "start": ent.start_char,
                    "end": ent.end_char,
                    "label": ent.label_,
                    "description": self._get_entity_description(ent.label_)
                }
                result["entities"].append(entity_info)
            
            # Extract raw sentence boundaries from SpaCy
            raw_sentences = []
            for sent in doc.sents:
                raw_sentences.append({
                    "text": sent.text,
                    "start": sent.start_char,
                    "end": sent.end_char
                })
            
            # Post-process sentences to fix special cases
            result["sentences"] = post_process_sentences(chunk_text, raw_sentences)
            
            result["success"] = True
            
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Error annotating chunk: {e}")
        
        return result
    
    def annotate_segments(self, segments: List[Dict], language: str = "english") -> Dict[str, Any]:
        """
        Annotate transcript segments individually, preserving timestamps
        
        Args:
            segments: List of segment dicts with 'id', 'text', 'start', 'end'
            language: Language code
            
        Returns:
            Dictionary with segment-level annotations
        """
        result = {
            "success": False,
            "segments": {},
            "total_tokens": 0,
            "total_entities": 0,
            "error": None
        }
        
        nlp = self.load_model(language)
        if nlp is None:
            result["error"] = f"SpaCy model not available for {language}"
            return result
        
        try:
            for segment in segments:
                seg_id = segment.get("id", 0)
                seg_text = segment.get("text", "")
                
                if not seg_text.strip():
                    continue
                
                doc = nlp(seg_text)
                
                seg_result = {
                    "segment_start": segment.get("start", 0),
                    "segment_end": segment.get("end", 0),
                    "tokens": [],
                    "entities": []
                }
                
                # Extract tokens
                for token in doc:
                    seg_result["tokens"].append({
                        "text": token.text,
                        "start": token.idx,
                        "end": token.idx + len(token.text),
                        "pos": token.pos_,
                        "tag": token.tag_,
                        "lemma": token.lemma_,
                        "dep": token.dep_,
                        "morph": str(token.morph) if token.morph else ""
                    })
                
                # Extract entities
                for ent in doc.ents:
                    seg_result["entities"].append({
                        "text": ent.text,
                        "start": ent.start_char,
                        "end": ent.end_char,
                        "label": ent.label_,
                        "description": self._get_entity_description(ent.label_)
                    })
                
                result["segments"][seg_id] = seg_result
                result["total_tokens"] += len(seg_result["tokens"])
                result["total_entities"] += len(seg_result["entities"])
            
            result["success"] = True
            logger.info(f"Annotated {len(result['segments'])} segments: {result['total_tokens']} tokens, {result['total_entities']} entities")
            
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"SpaCy segment annotation error: {e}")
        
        return result
    
    def split_into_sentences(self, text: str, language: str = "english") -> List[Dict]:
        """
        Split text into sentences using SpaCy with post-processing for special cases
        
        Args:
            text: Text to split
            language: Language code
            
        Returns:
            List of sentence dicts with 'id', 'text', 'start', 'end'
        """
        sentences = []
        
        nlp = self.load_model(language)
        if nlp is None:
            # Fallback: use post_process_sentences with empty raw sentences
            # This will use the Markdown and punctuation-based splitting
            fallback_result = post_process_sentences(text, [{"text": text, "start": 0, "end": len(text)}])
            for i, sent in enumerate(fallback_result):
                sentences.append({
                    "id": i,
                    "text": sent["text"],
                    "start": sent["start"],
                    "end": sent["end"]
                })
            return sentences
        
        try:
            doc = nlp(text)
            
            # Get raw sentences from SpaCy
            raw_sentences = []
            for sent in doc.sents:
                raw_sentences.append({
                    "text": sent.text,
                    "start": sent.start_char,
                    "end": sent.end_char
                })
            
            # Post-process to fix special cases
            processed = post_process_sentences(text, raw_sentences)
            
            for i, sent in enumerate(processed):
                sentences.append({
                    "id": i,
                    "text": sent["text"].strip(),
                    "start": sent["start"],
                    "end": sent["end"]
                })
        except Exception as e:
            logger.error(f"Sentence splitting error: {e}")
        
        return sentences
    
    def _get_entity_description(self, label: str) -> str:
        """Get human-readable description for entity label"""
        descriptions = {
            # English entities
            "PERSON": "Person name",
            "NORP": "Nationalities, religious or political groups",
            "FAC": "Buildings, airports, highways, bridges, etc.",
            "ORG": "Organizations, companies, agencies",
            "GPE": "Countries, cities, states",
            "LOC": "Non-GPE locations, mountain ranges, bodies of water",
            "PRODUCT": "Objects, vehicles, foods, etc.",
            "EVENT": "Named hurricanes, battles, wars, sports events",
            "WORK_OF_ART": "Titles of books, songs, etc.",
            "LAW": "Named documents made into laws",
            "LANGUAGE": "Any named language",
            "DATE": "Absolute or relative dates or periods",
            "TIME": "Times smaller than a day",
            "PERCENT": "Percentage, including %",
            "MONEY": "Monetary values, including unit",
            "QUANTITY": "Measurements, as of weight or distance",
            "ORDINAL": "first, second, etc.",
            "CARDINAL": "Numerals that do not fall under another type",
            # Chinese entities
            "PER": "Person name",
            "LOC": "Location",
            "ORG": "Organization",
            "GPE": "Geo-political entity"
        }
        return descriptions.get(label, label)
    
    def get_pos_description(self, pos: str) -> str:
        """Get human-readable description for POS tag"""
        descriptions = {
            "ADJ": "Adjective",
            "ADP": "Adposition",
            "ADV": "Adverb",
            "AUX": "Auxiliary verb",
            "CCONJ": "Coordinating conjunction",
            "DET": "Determiner",
            "INTJ": "Interjection",
            "NOUN": "Noun",
            "NUM": "Numeral",
            "PART": "Particle",
            "PRON": "Pronoun",
            "PROPN": "Proper noun",
            "PUNCT": "Punctuation",
            "SCONJ": "Subordinating conjunction",
            "SYM": "Symbol",
            "VERB": "Verb",
            "X": "Other"
        }
        return descriptions.get(pos, pos)


# Singleton instance
_spacy_service = None


def get_spacy_service() -> SpacyService:
    """Get SpaCy service singleton"""
    global _spacy_service
    if _spacy_service is None:
        _spacy_service = SpacyService()
    return _spacy_service


"""
Theme/Rheme Analysis Service
Provides automatic theme and rheme identification based on SFL (Systemic Functional Linguistics) theory
Using SpaCy dependency parsing data
"""

import logging
from typing import Dict, List, Any, Optional, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ThemeAnalysisService:
    """
    Service for automatic theme/rheme identification based on SFL theory.
    
    Theme Structure (from SFL theory):
    - Textual Theme: conjunctions, continuatives (e.g., "However", "And", "Well")
    - Interpersonal Theme: modal adjuncts, vocatives (e.g., "Probably", "John,")
    - Topical Theme (experiential): first experiential element, usually the subject
    
    The Theme ends after the first Topical Theme.
    The Rheme is everything after the Theme.
    """
    
    # Dependency relations that indicate subject (topical theme)
    SUBJECT_DEPS = {'nsubj', 'nsubjpass', 'csubj', 'csubjpass', 'expl'}
    
    # Dependency relations for textual themes
    TEXTUAL_DEPS = {'cc', 'mark', 'advmod'}
    
    # POS tags for textual theme elements (conjunctions, adverbs at start)
    TEXTUAL_POS = {'CCONJ', 'SCONJ', 'ADV'}
    
    # Common textual theme markers (conjunctions and connectives)
    TEXTUAL_MARKERS = {
        'and', 'but', 'or', 'so', 'yet', 'for', 'nor',
        'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
        'meanwhile', 'consequently', 'thus', 'hence', 'accordingly',
        'then', 'also', 'besides', 'indeed', 'in fact', 'actually',
        'well', 'now', 'ok', 'okay', 'anyway', 'so', 'right'
    }
    
    # Interpersonal theme markers (modal adjuncts, etc.)
    INTERPERSONAL_MARKERS = {
        'probably', 'possibly', 'certainly', 'definitely', 'perhaps',
        'maybe', 'surely', 'obviously', 'clearly', 'apparently',
        'fortunately', 'unfortunately', 'hopefully', 'honestly',
        'frankly', 'personally', 'generally', 'usually', 'often'
    }
    
    def __init__(self):
        logger.info("Theme analysis service initialized")
    
    def identify_theme_rheme(
        self,
        spacy_data: Dict[str, Any],
        sentences: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Identify theme and rheme boundaries for each sentence.
        
        Args:
            spacy_data: SpaCy annotation data containing tokens with dependency info
            sentences: List of sentence dictionaries with 'start' and 'end' positions
            
        Returns:
            List of dictionaries, each containing:
            - sentence_index: int
            - sentence_text: str
            - theme_start: int (character position)
            - theme_end: int (character position)
            - rheme_start: int (character position)
            - rheme_end: int (character position)
            - theme_text: str
            - rheme_text: str
        """
        if not spacy_data or not sentences:
            logger.warning("No spacy data or sentences provided")
            return []
        
        tokens = spacy_data.get('tokens', [])
        if not tokens:
            logger.warning("No tokens in spacy data")
            return []
        
        results = []
        
        for sent_idx, sentence in enumerate(sentences):
            sent_start = sentence.get('start', 0)
            sent_end = sentence.get('end', 0)
            sent_text = sentence.get('text', '')
            
            # Get tokens for this sentence
            sent_tokens = self._get_sentence_tokens(tokens, sent_start, sent_end)
            
            if not sent_tokens:
                # No tokens found, mark whole sentence as theme
                results.append({
                    'sentence_index': sent_idx,
                    'sentence_text': sent_text,
                    'theme_start': sent_start,
                    'theme_end': sent_end,
                    'rheme_start': sent_end,
                    'rheme_end': sent_end,
                    'theme_text': sent_text,
                    'rheme_text': ''
                })
                continue
            
            # Find theme boundary
            theme_end_pos = self._find_theme_boundary(sent_tokens, sent_start)
            
            # Create result
            theme_text = ''
            rheme_text = ''
            
            if theme_end_pos > sent_start:
                # Find actual character positions from tokens
                theme_tokens = [t for t in sent_tokens if t['start'] < theme_end_pos]
                if theme_tokens:
                    actual_theme_end = max(t['end'] for t in theme_tokens)
                    theme_text = self._extract_text(sent_text, sent_start, actual_theme_end, sent_start)
                    rheme_text = self._extract_text(sent_text, actual_theme_end, sent_end, sent_start)
                    
                    results.append({
                        'sentence_index': sent_idx,
                        'sentence_text': sent_text,
                        'theme_start': sent_start,
                        'theme_end': actual_theme_end,
                        'rheme_start': actual_theme_end,
                        'rheme_end': sent_end,
                        'theme_text': theme_text.strip(),
                        'rheme_text': rheme_text.strip()
                    })
                    continue
            
            # Fallback: entire sentence as theme if no clear boundary found
            results.append({
                'sentence_index': sent_idx,
                'sentence_text': sent_text,
                'theme_start': sent_start,
                'theme_end': sent_end,
                'rheme_start': sent_end,
                'rheme_end': sent_end,
                'theme_text': sent_text,
                'rheme_text': ''
            })
        
        return results
    
    def _get_sentence_tokens(
        self,
        tokens: List[Dict[str, Any]],
        sent_start: int,
        sent_end: int
    ) -> List[Dict[str, Any]]:
        """Get tokens that belong to a specific sentence based on character positions."""
        return [
            t for t in tokens
            if t.get('start', 0) >= sent_start and t.get('end', 0) <= sent_end
        ]
    
    def _find_theme_boundary(
        self,
        tokens: List[Dict[str, Any]],
        sent_start: int
    ) -> int:
        """
        Find the theme boundary position.
        
        Theme ends after:
        1. Any textual themes (conjunctions, connectives)
        2. Any interpersonal themes (modal adjuncts)
        3. The first topical theme (usually the subject)
        
        Returns:
            Character position where theme ends
        """
        if not tokens:
            return sent_start
        
        # Sort tokens by position
        sorted_tokens = sorted(tokens, key=lambda t: t.get('start', 0))
        
        # Track the end position of the theme
        theme_end = sent_start
        found_topical_theme = False
        
        for i, token in enumerate(sorted_tokens):
            text_lower = token.get('text', '').lower()
            pos = token.get('pos', '')
            dep = token.get('dep', '')
            token_start = token.get('start', 0)
            token_end = token.get('end', 0)
            
            # Skip punctuation at the start
            if pos == 'PUNCT':
                continue
            
            # Check for textual theme (conjunctions, connectives at start)
            if not found_topical_theme:
                if (dep in self.TEXTUAL_DEPS or 
                    pos in self.TEXTUAL_POS or 
                    text_lower in self.TEXTUAL_MARKERS):
                    # This is a textual theme, include it
                    theme_end = token_end
                    continue
                
                # Check for interpersonal theme
                if text_lower in self.INTERPERSONAL_MARKERS:
                    theme_end = token_end
                    continue
            
            # Check for subject (topical theme)
            if dep in self.SUBJECT_DEPS:
                # Found the subject - this is the topical theme
                # Theme ends after the entire subject phrase
                subject_end = self._find_phrase_end(sorted_tokens, i)
                theme_end = subject_end
                found_topical_theme = True
                break
            
            # If we haven't found a subject yet and this is a content word,
            # it might be the topical theme (marked theme)
            if not found_topical_theme and pos in {'NOUN', 'PROPN', 'PRON', 'NUM'}:
                # This could be a fronted element (marked theme)
                phrase_end = self._find_phrase_end(sorted_tokens, i)
                theme_end = phrase_end
                found_topical_theme = True
                break
            
            # If this is the finite verb and we haven't found a subject,
            # check if it's imperative (verb as theme) or a question
            if not found_topical_theme and pos == 'VERB' and dep == 'ROOT':
                # Imperative or question - the verb might be the theme
                theme_end = token_end
                found_topical_theme = True
                break
        
        # If no clear theme found, use the first noun phrase or first few words
        if not found_topical_theme and sorted_tokens:
            # Default: first content word ends the theme
            for token in sorted_tokens:
                if token.get('pos', '') not in {'PUNCT', 'SPACE'}:
                    theme_end = token.get('end', sent_start)
                    break
        
        return theme_end
    
    def _find_phrase_end(
        self,
        tokens: List[Dict[str, Any]],
        head_idx: int
    ) -> int:
        """
        Find the end position of a phrase headed by the token at head_idx.
        Includes all modifiers and dependents that are part of the phrase.
        """
        if head_idx >= len(tokens):
            return tokens[-1].get('end', 0) if tokens else 0
        
        head_token = tokens[head_idx]
        head_start = head_token.get('start', 0)
        head_end = head_token.get('end', 0)
        head_token_idx = head_idx  # Position in sorted list
        
        # Find all tokens that are part of this phrase (continuous span)
        phrase_end = head_end
        
        # Look at tokens immediately following the head
        for i in range(head_idx + 1, len(tokens)):
            token = tokens[i]
            token_dep = token.get('dep', '')
            token_head = token.get('head', -1)
            token_pos = token.get('pos', '')
            token_start = token.get('start', 0)
            token_end = token.get('end', 0)
            
            # Stop if we hit a verb (start of predicate)
            if token_pos == 'VERB' and token_dep in {'ROOT', 'ccomp', 'xcomp', 'advcl'}:
                break
            
            # Include modifiers that are part of the subject phrase
            if token_dep in {'det', 'amod', 'compound', 'nummod', 'nmod', 'poss', 'case', 'appos', 'flat', 'fixed'}:
                # Only include if it's adjacent or part of the same phrase
                if token_start <= phrase_end + 5:  # Allow small gaps (spaces)
                    phrase_end = max(phrase_end, token_end)
                    continue
            
            # Stop if we hit a different major constituent
            if token_dep in {'nsubj', 'dobj', 'iobj', 'ROOT', 'conj', 'advcl', 'ccomp'}:
                break
        
        return phrase_end
    
    def _extract_text(
        self,
        sent_text: str,
        start: int,
        end: int,
        sent_start: int
    ) -> str:
        """Extract text from sentence given absolute character positions."""
        relative_start = start - sent_start
        relative_end = end - sent_start
        
        if relative_start < 0:
            relative_start = 0
        if relative_end > len(sent_text):
            relative_end = len(sent_text)
        
        return sent_text[relative_start:relative_end]
    
    def analyze_text(
        self,
        spacy_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Analyze a text and return theme/rheme for all sentences.
        
        Args:
            spacy_data: SpaCy annotation data with 'tokens' and 'sentences'
            
        Returns:
            List of theme/rheme analysis results for each sentence
        """
        sentences = spacy_data.get('sentences', [])
        return self.identify_theme_rheme(spacy_data, sentences)


# Singleton instance
_theme_analysis_service: Optional[ThemeAnalysisService] = None


def get_theme_analysis_service() -> ThemeAnalysisService:
    """Get theme analysis service singleton"""
    global _theme_analysis_service
    if _theme_analysis_service is None:
        _theme_analysis_service = ThemeAnalysisService()
    return _theme_analysis_service

"""
USAS Semantic Tagging Service
Main service integrating tagging, disambiguation, and settings management

Supports three tagging modes:
- rule_based: Traditional PyMUSAS rule-based tagger with custom disambiguation
- neural: Neural network based tagger (PyMUSAS-Neural-Multilingual-Base-BEM)
- hybrid: Combines rule-based and neural (neural for unknown words)
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Literal

from .usas import (
    USASTagger,
    get_usas_tagger,
    USASDisambiguator,
    NeuralUSASTagger,
    get_neural_tagger,
    USAS_DOMAINS,
    USAS_MAJOR_CATEGORIES,
    TEXT_TYPE_PRIORITY_MAP,
    get_domain_description,
    get_major_category,
    get_domains_by_category,
    parse_usas_domains_file
)

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import SETTINGS_DIR

logger = logging.getLogger(__name__)

# Settings file path
USAS_SETTINGS_FILE = SETTINGS_DIR / "usas_settings.json"

# Tagging mode type
TaggingMode = Literal['rule_based', 'neural', 'hybrid']


class USASService:
    """
    USAS Semantic Tagging Service
    Provides complete semantic annotation with disambiguation
    
    Supports three tagging modes:
    - rule_based: Traditional PyMUSAS rule-based tagger with custom disambiguation
    - neural: Neural network based tagger (direct prediction, no disambiguation)
    - hybrid: Combines rule-based and neural (neural for unknown Z99 words)
    """
    
    def __init__(self):
        self.tagger = get_usas_tagger()  # Rule-based tagger
        self.neural_tagger = None  # Lazy loaded
        self.settings = self._load_settings()
        self._ensure_domains_loaded()
    
    def _get_neural_tagger(self) -> NeuralUSASTagger:
        """Get or lazily load the neural tagger"""
        if self.neural_tagger is None:
            self.neural_tagger = get_neural_tagger()
        return self.neural_tagger
    
    def _ensure_domains_loaded(self):
        """Ensure USAS domains are loaded"""
        if not USAS_DOMAINS:
            parse_usas_domains_file()
    
    def _load_settings(self) -> Dict[str, Any]:
        """Load user settings from file"""
        default_settings = {
            'priority_domains': [],
            'default_text_type': 'GEN',
            'custom_text_types': {},
            'text_type_overrides': {},  # User modifications to preset text types
            'tagging_mode': 'rule_based'  # Default tagging mode
        }
        
        try:
            SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
            
            if USAS_SETTINGS_FILE.exists():
                with open(USAS_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                    return {**default_settings, **settings}
        except Exception as e:
            logger.error(f"Error loading USAS settings: {e}")
        
        return default_settings
    
    def get_tagging_mode(self) -> TaggingMode:
        """Get current tagging mode"""
        mode = self.settings.get('tagging_mode', 'rule_based')
        if mode not in ('rule_based', 'neural', 'hybrid'):
            mode = 'rule_based'
        return mode
    
    def set_tagging_mode(self, mode: TaggingMode) -> Dict[str, Any]:
        """
        Set tagging mode
        
        Args:
            mode: 'rule_based', 'neural', or 'hybrid'
            
        Returns:
            Result dict with success status
        """
        if mode not in ('rule_based', 'neural', 'hybrid'):
            return {
                'success': False,
                'error': f'Invalid tagging mode: {mode}. Must be rule_based, neural, or hybrid.'
            }
        
        self.settings['tagging_mode'] = mode
        success = self._save_settings()
        
        return {
            'success': success,
            'tagging_mode': mode
        }
    
    def get_mode_status(self) -> Dict[str, Any]:
        """
        Get status of all tagging modes
        
        Returns:
            Dict with availability status for each mode
        """
        neural = self._get_neural_tagger()
        
        return {
            'current_mode': self.get_tagging_mode(),
            'modes': {
                'rule_based': {
                    'available': True,  # Rule-based is always available if USAS models are installed
                    'description': 'PyMUSAS rule-based tagger with custom disambiguation'
                },
                'neural': {
                    'available': neural.is_available(),
                    'description': 'Neural network tagger (PyMUSAS-Neural-Multilingual-Base-BEM)'
                },
                'hybrid': {
                    'available': neural.is_available(),  # Hybrid requires neural
                    'description': 'Combines rule-based and neural (neural for unknown words)'
                }
            }
        }
    
    def _save_settings(self) -> bool:
        """Save user settings to file"""
        try:
            SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
            
            with open(USAS_SETTINGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.settings, f, ensure_ascii=False, indent=2)
            
            return True
        except Exception as e:
            logger.error(f"Error saving USAS settings: {e}")
            return False
    
    def is_available(self, language: str = 'english') -> bool:
        """Check if USAS service is available for the language"""
        # Only support English and Chinese
        lang = language.lower()
        if lang not in ['english', 'en', 'chinese', 'zh', 'zh-cn', 'mandarin', 'cmn']:
            return False
        
        return self.tagger.is_available(language)
    
    def get_supported_languages(self) -> List[str]:
        """Get list of supported languages"""
        return ['english', 'chinese']
    
    def annotate_text(
        self,
        text: str,
        language: str = 'english',
        text_type: Optional[str] = None,
        progress_callback: Optional[callable] = None,
        mode_override: Optional[TaggingMode] = None
    ) -> Dict[str, Any]:
        """
        Annotate text with USAS semantic domains
        
        Supports three tagging modes:
        - rule_based: PyMUSAS rule-based tagger with custom disambiguation
        - neural: Neural network tagger (no disambiguation, direct prediction)
        - hybrid: Rule-based first, neural for unknown (Z99) words, then disambiguate
        
        Args:
            text: Text to annotate
            language: Language code (english or chinese)
            text_type: Optional text type for priority disambiguation
            progress_callback: Optional callback(progress, message) for large texts
            mode_override: Override the configured tagging mode for this call
            
        Returns:
            Dictionary with annotated tokens and metadata
        """
        result = {
            'success': False,
            'tokens': [],
            'domain_distribution': {},
            'dominant_domain': None,
            'text_type_priority': text_type,
            'disambiguation_stats': {},
            'tagging_mode': None,
            'error': None
        }
        
        # Determine tagging mode
        mode = mode_override if mode_override else self.get_tagging_mode()
        result['tagging_mode'] = mode
        
        # Check language support (for rule_based, check if USAS is available)
        if mode in ('rule_based', 'hybrid'):
            if not self.is_available(language):
                result['error'] = f'USAS not available for language: {language}'
                return result
        
        # For neural mode, check if neural model is available
        if mode == 'neural':
            neural = self._get_neural_tagger()
            if not neural.is_available():
                result['error'] = 'Neural model not available'
                return result
        
        try:
            if mode == 'neural':
                return self._annotate_text_neural(text, language, progress_callback)
            elif mode == 'hybrid':
                return self._annotate_text_hybrid(text, language, text_type, progress_callback)
            else:
                # Default: rule_based
                return self._annotate_text_rule_based(text, language, text_type, progress_callback)
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"USAS annotation error: {e}")
            return result
    
    def _annotate_text_rule_based(
        self,
        text: str,
        language: str,
        text_type: Optional[str],
        progress_callback: Optional[callable]
    ) -> Dict[str, Any]:
        """
        Annotate text using rule-based mode (original behavior)
        """
        result = {
            'success': False,
            'tokens': [],
            'domain_distribution': {},
            'dominant_domain': None,
            'text_type_priority': text_type,
            'disambiguation_stats': {},
            'tagging_mode': 'rule_based',
            'error': None
        }
        
        try:
            # Step 1: Initial tagging with rule-based tagger
            if progress_callback:
                progress_callback(10, "USAS tagging (rule-based)...")
            tag_result = self.tagger.tag_text(text, language)
            
            if not tag_result['success']:
                result['error'] = tag_result.get('error', 'Tagging failed')
                return result
            
            # Step 2: Disambiguation
            if progress_callback:
                progress_callback(50, "Disambiguating...")
            priority_domains = self.get_priority_domains_for_type(text_type) if text_type else []
            
            disambiguator = USASDisambiguator(priority_domains=priority_domains)
            disamb_result = disambiguator.disambiguate(tag_result['tokens'], text_type=text_type)
            
            # Step 3: Propagate senses (one-sense-per-discourse)
            if progress_callback:
                progress_callback(70, "Propagating senses...")
            final_tokens = disambiguator.propagate_senses(disamb_result['tokens'])
            
            # Step 4: Add _MWE suffix AFTER disambiguation
            for token in final_tokens:
                if token.get('is_mwe'):
                    tag = token.get('usas_tag', '')
                    if tag and tag not in ('Z99', 'PUNCT') and not tag.endswith('_MWE'):
                        token['usas_tag'] = f"{tag}_MWE"
            
            # Step 5: Add descriptions
            self._add_token_descriptions(final_tokens, progress_callback)
            
            result['success'] = True
            result['tokens'] = final_tokens
            result['domain_distribution'] = disamb_result['domain_distribution']
            result['dominant_domain'] = disamb_result['dominant_domain']
            result['disambiguation_stats'] = disamb_result['disambiguation_stats']
            
            if progress_callback:
                progress_callback(100, "Complete")
            logger.info(f"Rule-based annotated: {len(final_tokens)} tokens, dominant: {disamb_result['dominant_domain']}")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Rule-based annotation error: {e}")
        
        return result
    
    def _annotate_text_neural(
        self,
        text: str,
        language: str,
        progress_callback: Optional[callable]
    ) -> Dict[str, Any]:
        """
        Annotate text using neural mode (no disambiguation)
        """
        result = {
            'success': False,
            'tokens': [],
            'domain_distribution': {},
            'dominant_domain': None,
            'text_type_priority': None,
            'disambiguation_stats': {},
            'tagging_mode': 'neural',
            'error': None
        }
        
        try:
            if progress_callback:
                progress_callback(10, "USAS tagging (neural)...")
            
            neural = self._get_neural_tagger()
            tag_result = neural.tag_text(text, language)
            
            if not tag_result['success']:
                result['error'] = tag_result.get('error', 'Neural tagging failed')
                return result
            
            if progress_callback:
                progress_callback(70, "Processing results...")
            
            final_tokens = tag_result['tokens']
            
            # Calculate domain distribution from neural predictions
            domain_counts = {}
            for token in final_tokens:
                if token.get('is_punct') or token.get('is_space'):
                    continue
                tag = token.get('usas_tag', '')
                if tag and tag != 'Z99':
                    # Get major category
                    category = tag[0] if tag else ''
                    if category:
                        domain_counts[category] = domain_counts.get(category, 0) + 1
            
            # Find dominant domain
            dominant = None
            max_count = 0
            for domain, count in domain_counts.items():
                if count > max_count:
                    max_count = count
                    dominant = domain
            
            # Add descriptions
            self._add_token_descriptions(final_tokens, progress_callback)
            
            result['success'] = True
            result['tokens'] = final_tokens
            result['domain_distribution'] = domain_counts
            result['dominant_domain'] = dominant
            result['disambiguation_stats'] = {
                'total_tokens': len(final_tokens),
                'method': 'neural_direct'
            }
            
            if progress_callback:
                progress_callback(100, "Complete")
            logger.info(f"Neural annotated: {len(final_tokens)} tokens, dominant: {dominant}")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Neural annotation error: {e}")
        
        return result
    
    def _extract_base_tag(self, tag: str) -> str:
        """
        Extract base semantic domain from a tag, removing suffixes like +, -, _MWE
        Examples:
            'A1.1.1+' -> 'A1.1.1'
            'A1.1.1-' -> 'A1.1.1'
            'A1.1.1_MWE' -> 'A1.1.1'
            'A1.1.1+_MWE' -> 'A1.1.1'
        """
        if not tag:
            return tag
        # Remove _MWE suffix first
        base = tag.replace('_MWE', '')
        # Remove + or - suffix
        if base.endswith('+') or base.endswith('-'):
            base = base[:-1]
        return base
    
    def _match_neural_with_candidates(self, neural_tags: List[str], candidate_tags: List[str]) -> Optional[str]:
        """
        Match neural network predictions with rule-based candidate tags.
        Neural tags are compared against base domains of candidates (without suffixes).
        Returns the original candidate tag (with suffix) if matched, None otherwise.
        
        Args:
            neural_tags: List of neural predictions (no suffixes), ordered by priority
            candidate_tags: List of rule-based candidate tags (may have suffixes)
        
        Returns:
            The matched candidate tag with original suffix, or None if no match
        """
        # Create a mapping from base tag to original tag(s)
        base_to_original = {}
        for candidate in candidate_tags:
            base = self._extract_base_tag(candidate)
            if base not in base_to_original:
                base_to_original[base] = candidate  # Keep first occurrence
        
        # Match in priority order (neural predictions are already ordered by priority)
        for neural_tag in neural_tags:
            neural_base = self._extract_base_tag(neural_tag)
            if neural_base in base_to_original:
                return base_to_original[neural_base]
        
        return None
    
    def _detect_sentence_boundaries(self, tokens: List[Dict]) -> List[tuple]:
        """
        Detect sentence boundaries from token list.
        
        Args:
            tokens: List of token dicts with 'text', 'is_punct' keys
            
        Returns:
            List of (start_idx, end_idx) tuples for each sentence
        """
        boundaries = []
        sent_start = 0
        sentence_end_punct = {'.', '!', '?', '。', '！', '？', '；', '…'}
        
        for i, token in enumerate(tokens):
            text = token.get('text', '')
            is_punct = token.get('is_punct', False)
            
            # Check for sentence-ending punctuation
            if is_punct and text in sentence_end_punct:
                # End of sentence
                boundaries.append((sent_start, i + 1))
                sent_start = i + 1
        
        # Add final sentence if not ended with punctuation
        if sent_start < len(tokens):
            boundaries.append((sent_start, len(tokens)))
        
        return boundaries
    
    def _annotate_text_hybrid(
        self,
        text: str,
        language: str,
        text_type: Optional[str],
        progress_callback: Optional[callable]
    ) -> Dict[str, Any]:
        """
        Annotate text using hybrid mode with enhanced neural matching:
        
        Flow:
        1. Rule-based tagging (including MWE recognition)
        2. For multi-tag tokens (non-MWE, non-Z99): use neural top_n=5 to match with candidates
           - Match by base domain name (without suffixes)
           - Preserve original suffix if matched
           - Neural processes tokens within sentence context
        3. For Z99 tokens: use neural top_n=1 directly (with sentence context)
        4. For unmatched multi-tag tokens: apply disambiguation rules
        5. For tokens where disambiguation failed: use neural top_n=1 as final fallback
        """
        result = {
            'success': False,
            'tokens': [],
            'domain_distribution': {},
            'dominant_domain': None,
            'text_type_priority': text_type,
            'disambiguation_stats': {},
            'tagging_mode': 'hybrid',
            'error': None
        }
        
        try:
            # Step 1: Rule-based tagging
            if progress_callback:
                progress_callback(10, "USAS tagging (hybrid - rule-based)...")
            tag_result = self.tagger.tag_text(text, language)
            
            if not tag_result['success']:
                result['error'] = tag_result.get('error', 'Rule-based tagging failed')
                return result
            
            tokens = tag_result['tokens']
            neural = self._get_neural_tagger()
            
            # Detect sentence boundaries for context-aware neural processing
            sentence_boundaries = self._detect_sentence_boundaries(tokens)
            logger.info(f"Hybrid: detected {len(sentence_boundaries)} sentences")
            
            # Step 2: Categorize tokens for different processing
            if progress_callback:
                progress_callback(20, "USAS tagging (hybrid - neural matching)...")
            
            # Collect tokens by category
            z99_indices = []  # Unknown tokens -> neural top_n=1
            multi_tag_indices = []  # Multi-tag tokens -> neural top_n=5 matching
            
            for i, token in enumerate(tokens):
                # Skip punctuation and spaces
                if token.get('is_punct') or token.get('is_space'):
                    continue
                # Skip MWE tokens (already processed by rule-based)
                if token.get('is_mwe'):
                    continue
                
                usas_tag = token.get('usas_tag', '')
                usas_tags = token.get('usas_tags', [])
                
                # Check if Z99 (unknown)
                is_z99 = (
                    usas_tag == 'Z99' or 
                    not usas_tags or 
                    (len(usas_tags) == 1 and usas_tags[0] == 'Z99')
                )
                
                if is_z99:
                    z99_indices.append(i)
                elif len(usas_tags) > 1:
                    # Multi-tag token (polysemous)
                    multi_tag_indices.append(i)
            
            # Step 2a: Process Z99 tokens with neural top_n=1 (with sentence context)
            if neural.is_available() and z99_indices:
                logger.info(f"Hybrid: {len(z99_indices)} Z99 tokens, using neural top_n=1 with context")
                neural_predictions = neural.tag_tokens_in_context(
                    z99_indices, tokens, sentence_boundaries, top_n=1
                )
                
                for token_idx, pred in neural_predictions.items():
                    if pred and pred[0] != 'Z99':
                        tokens[token_idx]['usas_tag'] = pred[0]
                        tokens[token_idx]['usas_tags'] = pred
                        tokens[token_idx]['neural_fallback'] = True
                        tokens[token_idx]['disambiguation_method'] = 'neural_z99'
            
            # Step 2b: Process multi-tag tokens with neural top_n=5 matching (with sentence context)
            neural_matched_count = 0
            unmatched_indices = []  # Tokens that need disambiguation
            
            if neural.is_available() and multi_tag_indices:
                if progress_callback:
                    progress_callback(35, "USAS tagging (hybrid - neural candidate matching)...")
                
                logger.info(f"Hybrid: {len(multi_tag_indices)} multi-tag tokens, using neural top_n=5 matching with context")
                neural_predictions = neural.tag_tokens_in_context(
                    multi_tag_indices, tokens, sentence_boundaries, top_n=5
                )
                
                for token_idx in multi_tag_indices:
                    neural_tags = neural_predictions.get(token_idx, [])
                    candidate_tags = tokens[token_idx].get('usas_tags', [])
                    
                    # Try to match neural predictions with candidates
                    matched_tag = self._match_neural_with_candidates(neural_tags, candidate_tags)
                    
                    if matched_tag:
                        tokens[token_idx]['usas_tag'] = matched_tag
                        tokens[token_idx]['neural_fallback'] = True
                        tokens[token_idx]['disambiguation_method'] = 'neural_match'
                        neural_matched_count += 1
                    else:
                        # No match found, will need disambiguation
                        unmatched_indices.append(token_idx)
            else:
                # Neural not available, all multi-tag tokens need disambiguation
                unmatched_indices = multi_tag_indices
            
            logger.info(f"Hybrid: neural matched {neural_matched_count}/{len(multi_tag_indices)} multi-tag tokens")
            
            # Step 3: Disambiguation for unmatched tokens
            if progress_callback:
                progress_callback(50, "Disambiguating...")
            
            priority_domains = self.get_priority_domains_for_type(text_type) if text_type else []
            disambiguator = USASDisambiguator(priority_domains=priority_domains)
            
            # Mark tokens that need disambiguation (unmatched multi-tag tokens)
            # Other tokens should be marked as already processed
            for i, token in enumerate(tokens):
                if i not in unmatched_indices:
                    # Already processed (single tag, MWE, neural matched, etc.)
                    if not token.get('disambiguation_method'):
                        usas_tags = token.get('usas_tags', [])
                        if len(usas_tags) <= 1:
                            token['disambiguation_method'] = 'single_tag'
                        elif token.get('is_mwe'):
                            token['disambiguation_method'] = 'mwe'
            
            # Run disambiguation on all tokens (disambiguator will skip already processed ones)
            disamb_result = disambiguator.disambiguate(tokens, text_type=text_type)
            disamb_tokens = disamb_result['tokens']
            
            # Step 4: Final neural fallback for tokens where disambiguation used 'default'
            if progress_callback:
                progress_callback(65, "USAS tagging (hybrid - final fallback)...")
            
            default_indices = []
            
            if neural.is_available():
                for i, token in enumerate(disamb_tokens):
                    # Check if disambiguation method was 'default'
                    if token.get('disambiguation_method') == 'default':
                        # Skip punctuation and spaces
                        if token.get('is_punct') or token.get('is_space'):
                            continue
                        # Skip MWE tokens
                        if token.get('is_mwe'):
                            continue
                        default_indices.append(i)
                
                # Get neural predictions for default-selected tokens (with sentence context)
                if default_indices:
                    logger.info(f"Hybrid: {len(default_indices)} tokens with default disambiguation, using neural top_n=1 fallback with context")
                    neural_predictions = neural.tag_tokens_in_context(
                        default_indices, disamb_tokens, sentence_boundaries, top_n=1
                    )
                    
                    for token_idx, pred in neural_predictions.items():
                        if pred and pred[0] != 'Z99':
                            disamb_tokens[token_idx]['usas_tag'] = pred[0]
                            disamb_tokens[token_idx]['neural_fallback'] = True
                            disamb_tokens[token_idx]['disambiguation_method'] = 'neural_final'
            
            # Step 5: Propagate senses
            if progress_callback:
                progress_callback(75, "Propagating senses...")
            final_tokens = disambiguator.propagate_senses(disamb_tokens)
            
            # Step 6: Add _MWE suffix AFTER disambiguation
            for token in final_tokens:
                if token.get('is_mwe'):
                    tag = token.get('usas_tag', '')
                    if tag and tag not in ('Z99', 'PUNCT') and not tag.endswith('_MWE'):
                        token['usas_tag'] = f"{tag}_MWE"
            
            # Step 7: Add descriptions
            self._add_token_descriptions(final_tokens, progress_callback)
            
            # Count neural fallback tokens
            neural_fallback_count = sum(1 for t in final_tokens if t.get('neural_fallback'))
            neural_z99_count = sum(1 for t in final_tokens if t.get('disambiguation_method') == 'neural_z99')
            neural_match_count = sum(1 for t in final_tokens if t.get('disambiguation_method') == 'neural_match')
            neural_final_count = sum(1 for t in final_tokens if t.get('disambiguation_method') == 'neural_final')
            
            result['success'] = True
            result['tokens'] = final_tokens
            result['domain_distribution'] = disamb_result['domain_distribution']
            result['dominant_domain'] = disamb_result['dominant_domain']
            result['disambiguation_stats'] = {
                **disamb_result['disambiguation_stats'],
                'neural_fallback_tokens': neural_fallback_count,
                'neural_z99_tokens': neural_z99_count,
                'neural_match_tokens': neural_match_count,
                'neural_final_tokens': neural_final_count
            }
            
            if progress_callback:
                progress_callback(100, "Complete")
            logger.info(f"Hybrid annotated: {len(final_tokens)} tokens, neural: {neural_fallback_count} total ({neural_z99_count} Z99, {neural_match_count} match, {neural_final_count} final), dominant: {disamb_result['dominant_domain']}")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Hybrid annotation error: {e}")
        
        return result
    
    def _add_token_descriptions(
        self,
        tokens: List[Dict],
        progress_callback: Optional[callable] = None
    ):
        """Add descriptions to tokens"""
        if progress_callback:
            progress_callback(85, "Adding descriptions...")
        
        for token in tokens:
            tag = token.get('usas_tag', '')
            # Get description using base tag (without _MWE suffix)
            base_tag = tag.replace('_MWE', '') if tag.endswith('_MWE') else tag
            token['usas_description'] = get_domain_description(base_tag)
            
            category, category_name = get_major_category(base_tag)
            token['usas_category'] = category
            token['usas_category_name'] = category_name
    
    def _annotate_text_chunked(
        self,
        text: str,
        language: str,
        text_type: Optional[str],
        chunk_size: int,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        Annotate large text using chunking for better performance
        
        Args:
            text: Text to annotate
            language: Language code
            text_type: Optional text type
            chunk_size: Size of each chunk
            progress_callback: Optional progress callback
        """
        result = {
            'success': False,
            'tokens': [],
            'domain_distribution': {},
            'dominant_domain': None,
            'text_type_priority': text_type,
            'disambiguation_stats': {},
            'chunk_info': {},
            'error': None
        }
        
        try:
            # Simple chunking at word boundaries
            chunks = []
            current_pos = 0
            text_len = len(text)
            
            while current_pos < text_len:
                end_pos = min(current_pos + chunk_size, text_len)
                
                # Find word boundary
                if end_pos < text_len:
                    # Look for space or newline
                    for i in range(end_pos, max(current_pos, end_pos - 1000), -1):
                        if text[i] in ' \t\n\r':
                            end_pos = i + 1
                            break
                
                chunks.append((current_pos, end_pos, text[current_pos:end_pos]))
                current_pos = end_pos
            
            total_chunks = len(chunks)
            logger.info(f"USAS: Processing {total_chunks} chunks for {text_len:,} chars")
            
            if progress_callback:
                progress_callback(5, f"Processing {total_chunks} chunks...")
            
            all_tokens = []
            all_domain_counts = {}
            
            for i, (chunk_start, chunk_end, chunk_text) in enumerate(chunks):
                chunk_num = i + 1
                
                if progress_callback:
                    progress = 5 + int((chunk_num / total_chunks) * 85)
                    progress_callback(progress, f"USAS chunk {chunk_num}/{total_chunks}...")
                
                # Tag this chunk
                tag_result = self.tagger.tag_text(chunk_text, language)
                
                if not tag_result['success']:
                    logger.warning(f"USAS chunk {chunk_num} failed: {tag_result.get('error')}")
                    continue
                
                # Disambiguate
                priority_domains = self.get_priority_domains_for_type(text_type) if text_type else []
                disambiguator = USASDisambiguator(priority_domains=priority_domains)
                disamb_result = disambiguator.disambiguate(tag_result['tokens'], text_type=text_type)
                
                # Propagate senses within chunk
                chunk_tokens = disambiguator.propagate_senses(disamb_result['tokens'])
                
                # Adjust indices and add to results
                for token in chunk_tokens:
                    # Adjust indices
                    token['start'] = token['start'] + chunk_start
                    token['end'] = token['end'] + chunk_start
                    
                    # Add MWE suffix
                    if token.get('is_mwe'):
                        tag = token.get('usas_tag', '')
                        if tag and tag not in ('Z99', 'PUNCT') and not tag.endswith('_MWE'):
                            token['usas_tag'] = f"{tag}_MWE"
                    
                    # Add descriptions
                    tag = token.get('usas_tag', '')
                    base_tag = tag.replace('_MWE', '') if tag.endswith('_MWE') else tag
                    token['usas_description'] = get_domain_description(base_tag)
                    category, category_name = get_major_category(base_tag)
                    token['usas_category'] = category
                    token['usas_category_name'] = category_name
                    
                    all_tokens.append(token)
                
                # Accumulate domain counts
                for domain, count in disamb_result.get('domain_distribution', {}).items():
                    all_domain_counts[domain] = all_domain_counts.get(domain, 0) + count
            
            # Calculate dominant domain from all chunks
            dominant_domain = None
            max_count = 0
            for domain, count in all_domain_counts.items():
                if domain not in ('Z99', 'PUNCT') and count > max_count:
                    max_count = count
                    dominant_domain = domain
            
            result['success'] = True
            result['tokens'] = all_tokens
            result['domain_distribution'] = all_domain_counts
            result['dominant_domain'] = dominant_domain
            result['chunk_info'] = {
                'total_chunks': total_chunks,
                'chunk_size': chunk_size
            }
            
            if progress_callback:
                progress_callback(100, "Complete")
            
            logger.info(f"USAS chunked: {len(all_tokens)} tokens, {total_chunks} chunks, dominant: {dominant_domain}")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"USAS chunked annotation error: {e}")
        
        return result
    
    def annotate_segments(
        self,
        segments: List[Dict],
        language: str = 'english',
        text_type: Optional[str] = None,
        mode_override: Optional[TaggingMode] = None
    ) -> Dict[str, Any]:
        """
        Annotate transcript segments with USAS semantic domains
        
        Supports three tagging modes (same as annotate_text)
        
        Args:
            segments: List of segment dicts with 'id', 'text', 'start', 'end'
            language: Language code
            text_type: Optional text type for priority disambiguation
            mode_override: Override the configured tagging mode for this call
            
        Returns:
            Dictionary with segment-level annotations
        """
        result = {
            'success': False,
            'segments': {},
            'total_tokens': 0,
            'domain_distribution': {},
            'dominant_domain': None,
            'tagging_mode': None,
            'error': None
        }
        
        # Determine tagging mode
        mode = mode_override if mode_override else self.get_tagging_mode()
        result['tagging_mode'] = mode
        
        # Check availability based on mode
        if mode in ('rule_based', 'hybrid'):
            if not self.is_available(language):
                result['error'] = f'USAS not available for language: {language}'
                return result
        
        if mode == 'neural':
            neural = self._get_neural_tagger()
            if not neural.is_available():
                result['error'] = 'Neural model not available'
                return result
        
        try:
            if mode == 'neural':
                return self._annotate_segments_neural(segments, language)
            elif mode == 'hybrid':
                return self._annotate_segments_hybrid(segments, language, text_type)
            else:
                return self._annotate_segments_rule_based(segments, language, text_type)
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"USAS segment annotation error: {e}")
            return result
    
    def _annotate_segments_rule_based(
        self,
        segments: List[Dict],
        language: str,
        text_type: Optional[str]
    ) -> Dict[str, Any]:
        """Annotate segments using rule-based mode"""
        result = {
            'success': False,
            'segments': {},
            'total_tokens': 0,
            'domain_distribution': {},
            'dominant_domain': None,
            'tagging_mode': 'rule_based',
            'error': None
        }
        
        try:
            all_tokens = []
            segment_token_ranges = {}
            
            for segment in segments:
                seg_id = segment.get('id', 0)
                seg_text = segment.get('text', '')
                
                if not seg_text.strip():
                    continue
                
                tag_result = self.tagger.tag_text(seg_text, language)
                
                if tag_result['success']:
                    start_idx = len(all_tokens)
                    
                    for token in tag_result['tokens']:
                        token['segment_id'] = seg_id
                        token['segment_start'] = segment.get('start', 0)
                        token['segment_end'] = segment.get('end', 0)
                        all_tokens.append(token)
                    
                    end_idx = len(all_tokens)
                    segment_token_ranges[seg_id] = (start_idx, end_idx)
            
            if not all_tokens:
                result['success'] = True
                return result
            
            # Disambiguation
            priority_domains = self.get_priority_domains_for_type(text_type) if text_type else []
            disambiguator = USASDisambiguator(priority_domains=priority_domains)
            disamb_result = disambiguator.disambiguate(all_tokens, text_type=text_type)
            final_tokens = disambiguator.propagate_senses(disamb_result['tokens'])
            
            # Add MWE suffix
            for token in final_tokens:
                if token.get('is_mwe'):
                    tag = token.get('usas_tag', '')
                    if tag and tag not in ('Z99', 'PUNCT') and not tag.endswith('_MWE'):
                        token['usas_tag'] = f"{tag}_MWE"
            
            # Add descriptions
            self._add_token_descriptions(final_tokens)
            
            # Reconstruct segments
            for seg_id, (start_idx, end_idx) in segment_token_ranges.items():
                segment_tokens = final_tokens[start_idx:end_idx]
                if segment_tokens:
                    result['segments'][seg_id] = {
                        'segment_start': segment_tokens[0].get('segment_start', 0),
                        'segment_end': segment_tokens[0].get('segment_end', 0),
                        'tokens': segment_tokens
                    }
            
            result['success'] = True
            result['total_tokens'] = len(final_tokens)
            result['domain_distribution'] = disamb_result['domain_distribution']
            result['dominant_domain'] = disamb_result['dominant_domain']
            
            logger.info(f"Rule-based segments: {len(result['segments'])} segments, {result['total_tokens']} tokens")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Rule-based segment annotation error: {e}")
        
        return result
    
    def _annotate_segments_neural(
        self,
        segments: List[Dict],
        language: str
    ) -> Dict[str, Any]:
        """Annotate segments using neural mode"""
        result = {
            'success': False,
            'segments': {},
            'total_tokens': 0,
            'domain_distribution': {},
            'dominant_domain': None,
            'tagging_mode': 'neural',
            'error': None
        }
        
        try:
            neural = self._get_neural_tagger()
            domain_counts = {}
            
            for segment in segments:
                seg_id = segment.get('id', 0)
                seg_text = segment.get('text', '')
                
                if not seg_text.strip():
                    continue
                
                tag_result = neural.tag_text(seg_text, language)
                
                if tag_result['success']:
                    seg_result = {
                        'segment_start': segment.get('start', 0),
                        'segment_end': segment.get('end', 0),
                        'tokens': []
                    }
                    
                    for token in tag_result['tokens']:
                        token['segment_id'] = seg_id
                        token['segment_start'] = segment.get('start', 0)
                        token['segment_end'] = segment.get('end', 0)
                        seg_result['tokens'].append(token)
                        
                        # Count domains
                        if not token.get('is_punct') and not token.get('is_space'):
                            tag = token.get('usas_tag', '')
                            if tag and tag != 'Z99':
                                category = tag[0] if tag else ''
                                if category:
                                    domain_counts[category] = domain_counts.get(category, 0) + 1
                    
                    # Add descriptions
                    self._add_token_descriptions(seg_result['tokens'])
                    
                    result['segments'][seg_id] = seg_result
                    result['total_tokens'] += len(seg_result['tokens'])
            
            # Find dominant domain
            dominant = None
            max_count = 0
            for domain, count in domain_counts.items():
                if count > max_count:
                    max_count = count
                    dominant = domain
            
            result['success'] = True
            result['domain_distribution'] = domain_counts
            result['dominant_domain'] = dominant
            
            logger.info(f"Neural segments: {len(result['segments'])} segments, {result['total_tokens']} tokens")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Neural segment annotation error: {e}")
        
        return result
    
    def _annotate_segments_hybrid(
        self,
        segments: List[Dict],
        language: str,
        text_type: Optional[str]
    ) -> Dict[str, Any]:
        """Annotate segments using hybrid mode"""
        result = {
            'success': False,
            'segments': {},
            'total_tokens': 0,
            'domain_distribution': {},
            'dominant_domain': None,
            'tagging_mode': 'hybrid',
            'error': None
        }
        
        try:
            all_tokens = []
            segment_token_ranges = {}
            
            # First pass: rule-based tagging
            for segment in segments:
                seg_id = segment.get('id', 0)
                seg_text = segment.get('text', '')
                
                if not seg_text.strip():
                    continue
                
                tag_result = self.tagger.tag_text(seg_text, language)
                
                if tag_result['success']:
                    start_idx = len(all_tokens)
                    
                    for token in tag_result['tokens']:
                        token['segment_id'] = seg_id
                        token['segment_start'] = segment.get('start', 0)
                        token['segment_end'] = segment.get('end', 0)
                        all_tokens.append(token)
                    
                    end_idx = len(all_tokens)
                    segment_token_ranges[seg_id] = (start_idx, end_idx)
            
            if not all_tokens:
                result['success'] = True
                return result
            
            # Neural fallback for Z99 tokens
            neural = self._get_neural_tagger()
            neural_fallback_count = 0
            
            if neural.is_available():
                unknown_indices = []
                unknown_tokens_text = []
                
                for i, token in enumerate(all_tokens):
                    usas_tag = token.get('usas_tag', '')
                    usas_tags = token.get('usas_tags', [])
                    
                    is_unknown = (
                        usas_tag == 'Z99' or 
                        not usas_tags or 
                        (len(usas_tags) == 1 and usas_tags[0] == 'Z99')
                    )
                    
                    if token.get('is_punct') or token.get('is_space'):
                        is_unknown = False
                    
                    if is_unknown:
                        unknown_indices.append(i)
                        unknown_tokens_text.append(token['text'])
                
                if unknown_tokens_text:
                    neural_predictions = neural.tag_tokens(unknown_tokens_text, top_n=1)
                    
                    for idx, token_idx in enumerate(unknown_indices):
                        if idx < len(neural_predictions):
                            pred = neural_predictions[idx]
                            if pred and pred[0] != 'Z99':
                                all_tokens[token_idx]['usas_tag'] = pred[0]
                                all_tokens[token_idx]['usas_tags'] = pred
                                all_tokens[token_idx]['neural_fallback'] = True
                                neural_fallback_count += 1
            
            # Disambiguation
            priority_domains = self.get_priority_domains_for_type(text_type) if text_type else []
            disambiguator = USASDisambiguator(priority_domains=priority_domains)
            disamb_result = disambiguator.disambiguate(all_tokens, text_type=text_type)
            final_tokens = disambiguator.propagate_senses(disamb_result['tokens'])
            
            # Add MWE suffix
            for token in final_tokens:
                if token.get('is_mwe'):
                    tag = token.get('usas_tag', '')
                    if tag and tag not in ('Z99', 'PUNCT') and not tag.endswith('_MWE'):
                        token['usas_tag'] = f"{tag}_MWE"
            
            # Add descriptions
            self._add_token_descriptions(final_tokens)
            
            # Reconstruct segments
            for seg_id, (start_idx, end_idx) in segment_token_ranges.items():
                segment_tokens = final_tokens[start_idx:end_idx]
                if segment_tokens:
                    result['segments'][seg_id] = {
                        'segment_start': segment_tokens[0].get('segment_start', 0),
                        'segment_end': segment_tokens[0].get('segment_end', 0),
                        'tokens': segment_tokens
                    }
            
            result['success'] = True
            result['total_tokens'] = len(final_tokens)
            result['domain_distribution'] = disamb_result['domain_distribution']
            result['dominant_domain'] = disamb_result['dominant_domain']
            
            logger.info(f"Hybrid segments: {len(result['segments'])} segments, {result['total_tokens']} tokens, {neural_fallback_count} neural fallback")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Hybrid segment annotation error: {e}")
        
        return result
    
    def get_domains(self) -> Dict[str, Any]:
        """Get all USAS domains grouped by category"""
        self._ensure_domains_loaded()
        
        return {
            'major_categories': USAS_MAJOR_CATEGORIES,
            'domains_by_category': get_domains_by_category(),
            'text_type_priorities': TEXT_TYPE_PRIORITY_MAP,
            'total_domains': len(USAS_DOMAINS)
        }
    
    def get_priority_settings(self) -> Dict[str, Any]:
        """Get current priority domain settings"""
        return {
            'priority_domains': self.settings.get('priority_domains', []),
            'default_text_type': self.settings.get('default_text_type', 'GEN')
        }
    
    def update_priority_settings(
        self, 
        priority_domains: List[str],
        default_text_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update priority domain settings"""
        self.settings['priority_domains'] = priority_domains
        if default_text_type is not None:
            self.settings['default_text_type'] = default_text_type
        success = self._save_settings()
        
        return {
            'success': success,
            'priority_domains': self.settings['priority_domains'],
            'default_text_type': self.settings.get('default_text_type', 'GEN')
        }
    
    def get_domain_info(self, code: str) -> Dict[str, Any]:
        """Get information about a specific domain code"""
        self._ensure_domains_loaded()
        
        description = get_domain_description(code)
        category, category_name = get_major_category(code)
        
        return {
            'code': code,
            'description': description,
            'category': category,
            'category_name': category_name,
            'found': bool(description)
        }
    
    def get_text_type_configs(self) -> Dict[str, Any]:
        """
        Get all text type configurations (preset + custom).
        Merges preset types with user overrides and custom types.
        """
        result = {}
        
        # Start with preset types
        for code, config in TEXT_TYPE_PRIORITY_MAP.items():
            result[code] = {
                'name': config['name'],
                'name_zh': config['name_zh'],
                'priority_domains': config['priority_domains'].copy(),
                'description': config.get('description', ''),
                'is_custom': False
            }
        
        # Apply user overrides for preset types
        overrides = self.settings.get('text_type_overrides', {})
        for code, domains in overrides.items():
            if code in result:
                result[code]['priority_domains'] = domains
        
        # Add custom types
        custom_types = self.settings.get('custom_text_types', {})
        for code, config in custom_types.items():
            result[code] = {
                'name': config.get('name', code),
                'name_zh': config.get('name_zh', config.get('name', code)),
                'priority_domains': config.get('priority_domains', []),
                'description': config.get('description', ''),
                'is_custom': True
            }
        
        return result
    
    def update_text_type_domains(self, code: str, priority_domains: List[str]) -> Dict[str, Any]:
        """Update priority domains for a text type"""
        # Check if it's a preset type
        if code in TEXT_TYPE_PRIORITY_MAP:
            # Store as override
            if 'text_type_overrides' not in self.settings:
                self.settings['text_type_overrides'] = {}
            self.settings['text_type_overrides'][code] = priority_domains
        else:
            # It's a custom type
            if 'custom_text_types' not in self.settings:
                self.settings['custom_text_types'] = {}
            if code in self.settings['custom_text_types']:
                self.settings['custom_text_types'][code]['priority_domains'] = priority_domains
            else:
                return {'success': False, 'error': f'Text type {code} not found'}
        
        success = self._save_settings()
        return {
            'success': success,
            'code': code,
            'priority_domains': priority_domains
        }
    
    def create_custom_text_type(
        self,
        code: str,
        name: str,
        name_zh: str,
        priority_domains: List[str] = None
    ) -> Dict[str, Any]:
        """Create a custom text type"""
        code = code.upper()
        
        # Check if code already exists
        if code in TEXT_TYPE_PRIORITY_MAP:
            return {'success': False, 'error': f'Text type {code} already exists as preset'}
        
        if 'custom_text_types' not in self.settings:
            self.settings['custom_text_types'] = {}
        
        if code in self.settings['custom_text_types']:
            return {'success': False, 'error': f'Text type {code} already exists'}
        
        self.settings['custom_text_types'][code] = {
            'name': name,
            'name_zh': name_zh,
            'priority_domains': priority_domains or [],
            'description': ''
        }
        
        success = self._save_settings()
        return {
            'success': success,
            'code': code,
            'config': self.settings['custom_text_types'][code]
        }
    
    def delete_custom_text_type(self, code: str) -> Dict[str, Any]:
        """Delete a custom text type"""
        code = code.upper()
        
        if code in TEXT_TYPE_PRIORITY_MAP:
            return {'success': False, 'error': 'Cannot delete preset text types'}
        
        custom_types = self.settings.get('custom_text_types', {})
        if code not in custom_types:
            return {'success': False, 'error': f'Custom text type {code} not found'}
        
        del self.settings['custom_text_types'][code]
        success = self._save_settings()
        
        return {
            'success': success,
            'deleted': code
        }
    
    def get_priority_domains_for_type(self, text_type: str) -> List[str]:
        """Get priority domains for a specific text type"""
        configs = self.get_text_type_configs()
        if text_type in configs:
            return configs[text_type]['priority_domains']
        return []
    
    def ensure_text_type_exists(self, text_type: str) -> bool:
        """
        Ensure a text type exists. If it's a new custom type, create it.
        Returns True if the type exists or was created.
        """
        if not text_type:
            return False
        
        configs = self.get_text_type_configs()
        
        # Check if type already exists
        if text_type in configs:
            return True
        
        # Create new custom type
        # Generate a code from the name (first 3-4 uppercase letters)
        import re
        # Remove non-alphanumeric characters and take first 4 uppercase letters
        code = re.sub(r'[^a-zA-Z]', '', text_type).upper()[:4]
        if len(code) < 2:
            code = text_type.upper()[:4]
        
        # Ensure unique code
        original_code = code
        counter = 1
        while code in configs or code in TEXT_TYPE_PRIORITY_MAP:
            code = f"{original_code[:3]}{counter}"
            counter += 1
        
        # Create the custom type
        result = self.create_custom_text_type(
            code=code,
            name=text_type,
            name_zh=text_type,
            priority_domains=[]
        )
        
        return result.get('success', False)


# Singleton instance
_usas_service = None


def get_usas_service() -> USASService:
    """Get USAS service singleton"""
    global _usas_service
    if _usas_service is None:
        _usas_service = USASService()
    return _usas_service

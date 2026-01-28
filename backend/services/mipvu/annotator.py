"""
MIPVU Annotator

Core annotation logic implementing the 4-step MIPVU metaphor detection pipeline:
1. Word form filtering (metaphor_filter.json)
2. SpaCy-based rule filtering (POS, dependency, high-confidence rules)
3. HiTZ model prediction
4. Fine-tuned model for IN/DT/RB/RP POS tags
"""

import logging
from typing import Dict, List, Optional, Any, Callable

from .filter import MetaphorFilter
from .rules import SpaCyRuleFilter
from .models import MetaphorModelLoader

logger = logging.getLogger(__name__)


class MIPVUAnnotator:
    """
    MIPVU-based metaphor annotator.
    
    Implements a 4-step pipeline:
    1. Word form filtering - filter out high-frequency non-metaphor words
    2. SpaCy rule filtering - filter based on POS, dependency, and high-confidence rules
    3. HiTZ model - primary metaphor detection model
    4. Fine-tuned model - secondary model for IN/DT/RB/RP words that HiTZ misses
    """
    
    def __init__(
        self,
        filter_path: Optional[str] = None,
        hitz_model_path: Optional[str] = None,
        finetuned_model_path: Optional[str] = None,
        device: Optional[str] = None
    ):
        """
        Initialize the annotator.
        
        Args:
            filter_path: Path to metaphor_filter.json
            hitz_model_path: Path to HiTZ model
            finetuned_model_path: Path to fine-tuned model
            device: Device for model inference
        """
        self.filter = MetaphorFilter(filter_path)
        self.rules = SpaCyRuleFilter()
        self.models = MetaphorModelLoader(
            hitz_model_path=hitz_model_path,
            finetuned_model_path=finetuned_model_path,
            device=device
        )
        self._models_loaded = False
    
    def load_models(self) -> bool:
        """Load the models."""
        self._models_loaded = self.models.load_models()
        return self._models_loaded
    
    def is_ready(self) -> bool:
        """Check if the annotator is ready."""
        return self._models_loaded
    
    def annotate_sentence(
        self,
        tokens: List[Dict[str, Any]],
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> List[Dict[str, Any]]:
        """
        Annotate a single sentence.
        
        Args:
            tokens: List of token dictionaries from SpaCy, each containing:
                - word: The word form
                - lemma: The lemma
                - tag: Penn Treebank POS tag
                - dep: Dependency relation
                - pos: Universal POS tag
            progress_callback: Optional callback(progress, message) for progress updates
            
        Returns:
            List of annotated token dictionaries with additional fields:
                - is_metaphor: bool
                - metaphor_confidence: float (0-1)
                - metaphor_source: str ('filter', 'rule', 'hitz', 'finetuned', 'hitz_other')
        """
        if not tokens:
            return []
        
        # Extract words for batch prediction
        words = [t.get('word', '') for t in tokens]
        
        # Initialize results
        results = []
        for t in tokens:
            results.append({
                **t,
                'is_metaphor': False,
                'metaphor_confidence': 0.0,
                'metaphor_source': 'pending'
            })
        
        # Track which tokens still need processing
        needs_model = [True] * len(tokens)
        needs_finetuned = [False] * len(tokens)
        
        # Step 1: Word form filtering
        for i, token in enumerate(tokens):
            word = token.get('word', '')
            if self.filter.is_non_metaphor(word):
                results[i]['is_metaphor'] = False
                results[i]['metaphor_confidence'] = 1.0
                results[i]['metaphor_source'] = 'filter'
                needs_model[i] = False
        
        # Step 2: SpaCy rule filtering
        for i, token in enumerate(tokens):
            if not needs_model[i]:
                continue
            
            next_token = tokens[i + 1] if i + 1 < len(tokens) else None
            is_non_metaphor, rule_name = self.rules.apply_rules(token, next_token)
            
            if is_non_metaphor:
                results[i]['is_metaphor'] = False
                results[i]['metaphor_confidence'] = 1.0
                results[i]['metaphor_source'] = f'rule:{rule_name}'
                needs_model[i] = False
        
        # Step 3: HiTZ model prediction
        # Only process words that passed the filters
        model_indices = [i for i, need in enumerate(needs_model) if need]
        if model_indices and self._models_loaded:
            model_words = [words[i] for i in model_indices]
            hitz_preds = self.models.predict_hitz(model_words)
            
            for idx, orig_idx in enumerate(model_indices):
                pred = hitz_preds[idx]
                if pred == 1:
                    # HiTZ says metaphor
                    results[orig_idx]['is_metaphor'] = True
                    results[orig_idx]['metaphor_confidence'] = 0.9  # High confidence from model
                    results[orig_idx]['metaphor_source'] = 'hitz'
                else:
                    # HiTZ says non-metaphor
                    tag = tokens[orig_idx].get('tag', '')
                    if self.rules.is_target_pos(tag):
                        # IN/DT/RB/RP needs finetuned model
                        needs_finetuned[orig_idx] = True
                    else:
                        # Other POS, trust HiTZ
                        results[orig_idx]['is_metaphor'] = False
                        results[orig_idx]['metaphor_confidence'] = 0.9
                        results[orig_idx]['metaphor_source'] = 'hitz'
        
        # Step 4: Fine-tuned model for IN/DT/RB/RP
        finetuned_indices = [i for i, need in enumerate(needs_finetuned) if need]
        if finetuned_indices and self._models_loaded:
            finetuned_words = [words[i] for i in finetuned_indices]
            finetuned_preds = self.models.predict_finetuned(finetuned_words)
            
            for idx, orig_idx in enumerate(finetuned_indices):
                pred, confidence = finetuned_preds[idx]
                results[orig_idx]['is_metaphor'] = pred == 1
                results[orig_idx]['metaphor_confidence'] = confidence
                results[orig_idx]['metaphor_source'] = 'finetuned'
        
        # Handle any remaining pending tokens
        for i, result in enumerate(results):
            if result['metaphor_source'] == 'pending':
                result['is_metaphor'] = False
                result['metaphor_confidence'] = 0.0
                result['metaphor_source'] = 'unknown'
        
        return results
    
    def annotate_text(
        self,
        spacy_data: Dict[str, Any],
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> Dict[str, Any]:
        """
        Annotate a full text using SpaCy annotation data.
        
        Args:
            spacy_data: SpaCy annotation result containing 'sentences' list
            progress_callback: Optional callback(progress, message)
            
        Returns:
            Dictionary containing:
                - success: bool
                - sentences: List of annotated sentences
                - statistics: Summary statistics
        """
        if not spacy_data or 'sentences' not in spacy_data:
            return {
                'success': False,
                'error': 'Invalid SpaCy data',
                'sentences': [],
                'statistics': {}
            }
        
        sentences = spacy_data.get('sentences', [])
        if not sentences:
            return {
                'success': True,
                'sentences': [],
                'statistics': {
                    'total_tokens': 0,
                    'metaphor_tokens': 0,
                    'literal_tokens': 0,
                    'metaphor_rate': 0.0
                }
            }
        
        annotated_sentences = []
        total_tokens = 0
        metaphor_tokens = 0
        source_counts = {
            'filter': 0,
            'rule': 0,
            'hitz': 0,
            'finetuned': 0,
            'unknown': 0
        }
        
        total_sentences = len(sentences)
        for sent_idx, sentence in enumerate(sentences):
            tokens = sentence.get('tokens', [])
            if not tokens:
                annotated_sentences.append({
                    'text': sentence.get('text', ''),
                    'tokens': []
                })
                continue
            
            # Annotate sentence
            annotated_tokens = self.annotate_sentence(tokens, progress_callback)
            
            # Update statistics
            for token in annotated_tokens:
                if token.get('word', '').isalpha():  # Only count alphabetic words
                    total_tokens += 1
                    if token.get('is_metaphor', False):
                        metaphor_tokens += 1
                    
                    source = token.get('metaphor_source', 'unknown')
                    if source.startswith('rule:'):
                        source_counts['rule'] += 1
                    elif source in source_counts:
                        source_counts[source] += 1
                    else:
                        source_counts['unknown'] += 1
            
            annotated_sentences.append({
                'text': sentence.get('text', ''),
                'tokens': annotated_tokens
            })
            
            # Progress callback
            if progress_callback:
                progress = int((sent_idx + 1) / total_sentences * 100)
                progress_callback(progress, f"Annotating sentence {sent_idx + 1}/{total_sentences}")
        
        literal_tokens = total_tokens - metaphor_tokens
        metaphor_rate = metaphor_tokens / total_tokens if total_tokens > 0 else 0.0
        
        return {
            'success': True,
            'sentences': annotated_sentences,
            'statistics': {
                'total_tokens': total_tokens,
                'metaphor_tokens': metaphor_tokens,
                'literal_tokens': literal_tokens,
                'metaphor_rate': metaphor_rate,
                'source_counts': source_counts
            }
        }
    
    def unload_models(self) -> None:
        """Unload models from memory."""
        self.models.unload_models()
        self._models_loaded = False

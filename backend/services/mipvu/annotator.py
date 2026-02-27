"""
MIPVU Annotator

Core annotation logic implementing the hybrid MIPVU metaphor detection pipeline:
1. Word form filtering (metaphor_filter.json)
2. SpaCy-based rule filtering (POS, dependency, high-confidence rules)
3. HiTZ model prediction (primary model)
4. Clause-level DeBERTa model for IN/DT/RB/RP POS tags (secondary model)
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
    
    Implements a hybrid pipeline:
    1. Word form filtering - filter out high-frequency non-metaphor words
    2. SpaCy rule filtering - filter based on POS, dependency, and high-confidence rules
    3. HiTZ model - primary metaphor detection model
    4. Clause model - secondary model for IN/DT/RB/RP words that HiTZ marks as non-metaphor
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
        
        annotated_sentences: List[Dict[str, Any]] = []
        total_tokens = 0
        metaphor_tokens = 0
        source_counts = {
            'filter': 0,
            'rule': 0,
            'hitz': 0,
            'finetuned': 0,
            'unknown': 0
        }
        # POS-grouped statistics (overall + function words vs others)
        pos_groups = {
            'ALL': {
                'total_tokens': 0,
                'metaphor_tokens': 0,
                'literal_tokens': 0,
                'metaphor_rate': 0.0,
            },
            'IN': {
                'total_tokens': 0,
                'metaphor_tokens': 0,
                'literal_tokens': 0,
                'metaphor_rate': 0.0,
            },
            'DT': {
                'total_tokens': 0,
                'metaphor_tokens': 0,
                'literal_tokens': 0,
                'metaphor_rate': 0.0,
            },
            'RB': {
                'total_tokens': 0,
                'metaphor_tokens': 0,
                'literal_tokens': 0,
                'metaphor_rate': 0.0,
            },
            'RP': {
                'total_tokens': 0,
                'metaphor_tokens': 0,
                'literal_tokens': 0,
                'metaphor_rate': 0.0,
            },
            'OTHER': {
                'total_tokens': 0,
                'metaphor_tokens': 0,
                'literal_tokens': 0,
                'metaphor_rate': 0.0,
            },
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
            
            # Annotate sentence (treated as a clause for the clause model)
            annotated_tokens = self.annotate_sentence(tokens, progress_callback)
            
            # Update statistics
            for token in annotated_tokens:
                word = token.get('word', '')
                if word and word.isalpha():  # Only count alphabetic words
                    total_tokens += 1
                    is_met = bool(token.get('is_metaphor', False))
                    
                    # Determine POS group based on Penn tag
                    tag = token.get('tag', '')
                    if tag in SpaCyRuleFilter.TARGET_POS:
                        group_key = tag if tag in ('IN', 'DT', 'RB', 'RP') else 'OTHER'
                    else:
                        group_key = 'OTHER'
                    
                    # Update overall group
                    pos_groups['ALL']['total_tokens'] += 1
                    if is_met:
                        metaphor_tokens += 1
                        pos_groups['ALL']['metaphor_tokens'] += 1
                    
                    # Update POS-specific group
                    if group_key in pos_groups:
                        pos_groups[group_key]['total_tokens'] += 1
                        if is_met:
                            pos_groups[group_key]['metaphor_tokens'] += 1
                    
                    # Update source distribution
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
        
        # Finalize POS-group statistics
        for key, stats in pos_groups.items():
            tt = stats['total_tokens']
            mt = stats['metaphor_tokens']
            lt = tt - mt
            stats['literal_tokens'] = lt
            stats['metaphor_rate'] = mt / tt if tt > 0 else 0.0
        
        return {
            'success': True,
            'sentences': annotated_sentences,
            'statistics': {
                'total_tokens': total_tokens,
                'metaphor_tokens': metaphor_tokens,
                'literal_tokens': literal_tokens,
                'metaphor_rate': metaphor_rate,
                'source_counts': source_counts,
                'pos_group_stats': pos_groups,
            }
        }
    
    def unload_models(self) -> None:
        """Unload models from memory."""
        self.models.unload_models()
        self._models_loaded = False

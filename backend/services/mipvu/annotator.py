"""
MIPVU Annotator

Core annotation logic implementing the MIPVU metaphor detection pipeline:
1. Word form filtering (metaphor_filter.json)
2. SpaCy-based rule filtering (POS, dependency, high-confidence rules)
3. Clause model prediction (deberta-v3-large-clause-metaphor) for ALL remaining tokens
   - Function words (IN/DT/RB/RP): source tagged as 'finetuned' (orange in UI)
   - Non-function words (OTHER): source tagged as 'clause' (green in UI)
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

    Implements a three-step pipeline:
    1. Word form filtering  - filter out high-frequency non-metaphor words
    2. SpaCy rule filtering - filter based on POS, dependency, and high-confidence rules
    3. Clause model         - deberta-v3-large-clause-metaphor for ALL remaining tokens
       * Full sentence words are passed for clause-level context
       * Function words (IN/DT/RB/RP) → source='finetuned'
       * Non-function words → source='clause'
    """

    def __init__(
        self,
        filter_path: Optional[str] = None,
        finetuned_model_path: Optional[str] = None,
        device: Optional[str] = None
    ):
        """
        Initialize the annotator.

        Args:
            filter_path: Path to metaphor_filter.json
            finetuned_model_path: Path to clause-level metaphor model
            device: Device for model inference
        """
        self.filter = MetaphorFilter(filter_path)
        self.rules = SpaCyRuleFilter()
        self.models = MetaphorModelLoader(
            finetuned_model_path=finetuned_model_path,
            device=device
        )
        self._models_loaded = False

    def load_models(self) -> bool:
        """Load the clause model."""
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
                - metaphor_source: str ('filter', 'rule', 'clause', 'finetuned', 'unknown')
                  * 'clause'    – non-function word judged by clause model
                  * 'finetuned' – function word (IN/DT/RB/RP) judged by clause model
        """
        if not tokens:
            return []

        # Extract words for model input
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

        # Track which tokens still need processing by the model
        needs_model = [True] * len(tokens)

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

        # Step 3: Clause model prediction for ALL remaining tokens
        # Pass the full sentence word list for clause-level context.
        model_indices = [i for i, need in enumerate(needs_model) if need]
        if model_indices and self._models_loaded:
            # predict_clause returns (pred, confidence) for every word in `words`
            clause_preds = self.models.predict_clause(words)

            for orig_idx in model_indices:
                pred, confidence = clause_preds[orig_idx]
                tag = tokens[orig_idx].get('tag', '')
                is_func = self.rules.is_target_pos(tag)

                results[orig_idx]['is_metaphor'] = pred == 1
                results[orig_idx]['metaphor_confidence'] = confidence
                # Distinguish function words vs non-function words for UI coloring:
                #   'finetuned' → orange  (function words: IN/DT/RB/RP)
                #   'clause'   → green   (non-function words)
                results[orig_idx]['metaphor_source'] = 'finetuned' if is_func else 'clause'

        # Handle any remaining pending tokens (model not loaded, etc.)
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
            'clause': 0,
            'finetuned': 0,
            'unknown': 0
        }
        # POS-grouped statistics
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

            # Annotate sentence (full sentence passed for clause-level context)
            annotated_tokens = self.annotate_sentence(tokens, progress_callback)

            # Update statistics
            for token in annotated_tokens:
                word = token.get('word', '')
                if word and word.isalpha():  # Only count alphabetic words
                    total_tokens += 1
                    is_met = bool(token.get('is_metaphor', False))

                    # Determine POS group
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
            stats['literal_tokens'] = tt - mt
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

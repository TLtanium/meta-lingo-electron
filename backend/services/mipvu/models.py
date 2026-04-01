"""
Metaphor Detection Model Loader

Loads and manages the clause-level DeBERTa model for metaphor detection.

Model:
- Clause model: deberta-v3-large-clause-metaphor
  - Binary token classifier trained on SpaCy clause segments
  - id2label: {0: non_metaphor, 1: metaphor}
  - Judgment threshold: P(LABEL_1) >= 0.5
  - Max sequence length: 192
"""

import os
import sys
import logging
from typing import Dict, List, Optional, Tuple, Any

import torch
from transformers import AutoTokenizer, AutoModelForTokenClassification

logger = logging.getLogger(__name__)


class MetaphorModelLoader:
    """
    Loads and manages the Clause metaphor detection model used in the MIPVU pipeline.

    Model:
    - Clause model: deberta-v3-large-clause-metaphor
      - Binary token classifier on clause segments
      - id 0: non_metaphor (O)
      - id 1: metaphor (METAPHOR)
      - Uses threshold: P(id=1) >= 0.5 -> metaphor
      - Trained with max_length=192

    For backward compatibility, older fine-tuned models with 3 labels
    (O/B-METAPHOR/I-METAPHOR) are still supported at inference time.
    """

    # Default probability threshold for the clause model.
    CLAUSE_THRESHOLD = 0.5
    # Max sequence length as per clause model training configuration.
    CLAUSE_MAX_LENGTH = 192

    def __init__(
        self,
        finetuned_model_path: Optional[str] = None,
        device: Optional[str] = None
    ):
        """
        Initialize the model loader.

        Args:
            finetuned_model_path: Path to clause-level metaphor model.
                                  If None, uses default location.
            device: Device to use ('cuda', 'mps', 'cpu'). If None, auto-detect.
        """
        self.clause_model = None
        self.clause_tokenizer = None
        self._loaded = False

        # Determine device
        if device is None:
            if torch.backends.mps.is_available():
                self.device = torch.device('mps')
            elif torch.cuda.is_available():
                self.device = torch.device('cuda')
            else:
                self.device = torch.device('cpu')
        else:
            self.device = torch.device(device)

        logger.info(f"Using device: {self.device}")

        # Find clause model path
        self.clause_model_path = self._find_model_path(
            finetuned_model_path,
            'deberta-v3-large-clause-metaphor'
        )

    def _find_model_path(self, provided_path: Optional[str], model_name: str) -> Optional[str]:
        """Find the model path from provided path or default locations."""
        if provided_path and os.path.exists(provided_path):
            return provided_path

        # Resolve via shared model path logic:
        # - userData/models first (downloaded models)
        # - bundled fallbacks second (built-in bundle, if any)
        from model_paths import resolve_model_path

        rel = f"metaphor_identification/{model_name}"
        resolved = resolve_model_path(rel)
        if resolved and resolved.exists():
            logger.info(f"Found model {model_name} at {resolved}")
            return str(resolved)

        logger.warning(f"Model {model_name} not found. Tried relative path: {rel}")
        return None

    def load_models(self) -> bool:
        """
        Load the clause model into memory.

        Returns:
            True if model loaded successfully, False otherwise
        """
        try:
            if self.clause_model_path:
                logger.info(f"Loading clause-level metaphor model from {self.clause_model_path}")
                self.clause_tokenizer = AutoTokenizer.from_pretrained(self.clause_model_path)
                self.clause_model = AutoModelForTokenClassification.from_pretrained(self.clause_model_path)
                self.clause_model.to(self.device)
                self.clause_model.eval()
                logger.info(f"Clause model loaded, labels: {self.clause_model.config.id2label}")
            else:
                logger.error("Clause model path not found - MIPVU annotation will not work")

            self._loaded = self.clause_model is not None
            if not self._loaded:
                logger.error("Clause model failed to load - _loaded is False")
            return self._loaded

        except Exception as e:
            logger.error(f"Failed to load clause model: {e}", exc_info=True)
            return False

    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        return self._loaded

    def predict_clause(
        self,
        words: List[str],
        threshold: float = None
    ) -> List[Tuple[int, float]]:
        """
        Get clause model predictions for a full list of words (sentence/clause context).

        Passing the complete sentence provides the model with full context, which
        aligns with its clause-level training approach.

        Two supported label configurations:
        - **Binary clause model** (deberta-v3-large-clause-metaphor):
          - id 0: non_metaphor (O)
          - id 1: metaphor (METAPHOR)
          - Uses threshold: P(id=1) >= threshold -> metaphor

        - **Legacy 3-label model** (backward compatible):
          - id 0: O (non-metaphor)
          - id 1: B-METAPHOR (metaphor start)
          - id 2: I-METAPHOR (metaphor continuation)
          - Uses threshold: P(1) + P(2) >= threshold -> metaphor

        Args:
            words: Full word list for the sentence/clause (for context)
            threshold: Probability threshold (default 0.5)

        Returns:
            List of (prediction, confidence) tuples, one per word
        """
        if threshold is None:
            threshold = self.CLAUSE_THRESHOLD

        if not self.clause_model or not words:
            return [(0, 0.0)] * len(words)

        try:
            enc = self.clause_tokenizer(
                words,
                is_split_into_words=True,
                return_tensors='pt',
                truncation=True,
                max_length=self.CLAUSE_MAX_LENGTH,
            )
            word_ids = enc.word_ids(batch_index=0)
            enc_dev = {k: v.to(self.device) for k, v in enc.items()}

            with torch.no_grad():
                logits = self.clause_model(**enc_dev).logits
                probs = torch.softmax(logits, dim=-1)

            num_labels = self.clause_model.config.num_labels

            # Map subword predictions to word predictions (first subword wins)
            word_pred: Dict[int, Tuple[int, float]] = {}
            for idx, wid in enumerate(word_ids):
                if wid is None or wid in word_pred:
                    continue

                if num_labels == 2:
                    # Binary clause model: id 1 is metaphor
                    p_metaphor = probs[0, idx, 1].item()
                elif num_labels >= 3:
                    # Legacy 3-label scheme: B-METAPHOR (1) + I-METAPHOR (2)
                    p_metaphor = probs[0, idx, 1].item() + probs[0, idx, 2].item()
                else:
                    p_metaphor = float(probs[0, idx, 1:].sum().item())

                pred = 1 if p_metaphor >= threshold else 0
                word_pred[wid] = (pred, p_metaphor)

            return [word_pred.get(wi, (0, 0.0)) for wi in range(len(words))]

        except Exception as e:
            logger.error(f"Clause model prediction failed: {e}")
            return [(0, 0.0)] * len(words)

    # ---------------------------------------------------------------------------
    # Backward-compatibility aliases
    # ---------------------------------------------------------------------------

    def predict_finetuned(self, words: List[str], threshold: float = None) -> List[Tuple[int, float]]:
        """Alias for predict_clause (backward compatibility)."""
        return self.predict_clause(words, threshold)

    def unload_models(self) -> None:
        """Unload model from memory."""
        self.clause_model = None
        self.clause_tokenizer = None
        self._loaded = False

        import gc
        gc.collect()

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info("Clause model unloaded")

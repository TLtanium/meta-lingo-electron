"""
Metaphor Detection Model Loader

Loads and manages the HiTZ and fine-tuned DeBERTa models for metaphor detection.
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
    Loads and manages metaphor detection models.
    
    Models:
    1. HiTZ: deberta-large-metaphor-detection-en
       - LABEL_0/1 = metaphor (B-METAPHOR/I-METAPHOR)
       - LABEL_2 = non-metaphor (O)
    
    2. Fine-tuned: deberta-v3-large-metaphor-in-dt-rb-rp
       - O (id=0) = non-metaphor
       - B-METAPHOR (id=1) = metaphor start
       - I-METAPHOR (id=2) = metaphor continuation
       - Uses threshold 0.4 for P(metaphor)
    """
    
    FINETUNED_THRESHOLD = 0.4
    
    def __init__(
        self,
        hitz_model_path: Optional[str] = None,
        finetuned_model_path: Optional[str] = None,
        device: Optional[str] = None
    ):
        """
        Initialize the model loader.
        
        Args:
            hitz_model_path: Path to HiTZ model. If None, uses default location.
            finetuned_model_path: Path to fine-tuned model. If None, uses default location.
            device: Device to use ('cuda', 'mps', 'cpu'). If None, auto-detect.
        """
        self.hitz_model = None
        self.hitz_tokenizer = None
        self.finetuned_model = None
        self.finetuned_tokenizer = None
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
        
        # Find model paths
        self.hitz_model_path = self._find_model_path(
            hitz_model_path,
            'deberta-large-metaphor-detection-en'
        )
        self.finetuned_model_path = self._find_model_path(
            finetuned_model_path,
            'deberta-v3-large-metaphor-in-dt-rb-rp'
        )
    
    def _find_model_path(self, provided_path: Optional[str], model_name: str) -> Optional[str]:
        """Find the model path from provided path or default locations."""
        if provided_path and os.path.exists(provided_path):
            return provided_path
        
        # Check if running in PyInstaller bundle
        if getattr(sys, 'frozen', False):
            base_path = sys._MEIPASS
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
        
        possible_paths = [
            os.path.join(base_path, '..', '..', '..', 'models', 'metaphor_identification', model_name),
            os.path.join(base_path, '..', '..', 'models', 'metaphor_identification', model_name),
            os.path.join('models', 'metaphor_identification', model_name),
            f'/Volumes/TL-TANIUM/Meta-Lingo-Electron/models/metaphor_identification/{model_name}',
        ]
        
        for path in possible_paths:
            abs_path = os.path.abspath(path)
            if os.path.exists(abs_path):
                logger.info(f"Found model {model_name} at {abs_path}")
                return abs_path
        
        logger.warning(f"Model {model_name} not found in default locations. Searched: {possible_paths}")
        return None
    
    def load_models(self) -> bool:
        """
        Load both models into memory.
        
        Returns:
            True if models loaded successfully, False otherwise
        """
        try:
            # Load HiTZ model
            if self.hitz_model_path:
                logger.info(f"Loading HiTZ model from {self.hitz_model_path}")
                self.hitz_tokenizer = AutoTokenizer.from_pretrained(self.hitz_model_path)
                self.hitz_model = AutoModelForTokenClassification.from_pretrained(self.hitz_model_path)
                self.hitz_model.to(self.device)
                self.hitz_model.eval()
                logger.info(f"HiTZ model loaded, labels: {self.hitz_model.config.id2label}")
            else:
                logger.error("HiTZ model path not found - MIPVU annotation will not work")
            
            # Load fine-tuned model
            if self.finetuned_model_path:
                logger.info(f"Loading IDRRP model from {self.finetuned_model_path}")
                self.finetuned_tokenizer = AutoTokenizer.from_pretrained(self.finetuned_model_path)
                self.finetuned_model = AutoModelForTokenClassification.from_pretrained(self.finetuned_model_path)
                self.finetuned_model.to(self.device)
                self.finetuned_model.eval()
                logger.info(f"IDRRP model loaded, labels: {self.finetuned_model.config.id2label}")
            else:
                logger.warning("IDRRP model path not found - secondary detection will not work")
            
            self._loaded = self.hitz_model is not None
            if not self._loaded:
                logger.error("HiTZ model failed to load - _loaded is False")
            return self._loaded
            
        except Exception as e:
            logger.error(f"Failed to load models: {e}", exc_info=True)
            return False
    
    def is_loaded(self) -> bool:
        """Check if models are loaded."""
        return self._loaded
    
    def predict_hitz(self, words: List[str]) -> List[int]:
        """
        Get HiTZ model predictions for a list of words (pre-tokenized).
        
        HiTZ labels:
        - LABEL_0 (id=0): B-METAPHOR -> metaphor (1)
        - LABEL_1 (id=1): I-METAPHOR -> metaphor (1)
        - LABEL_2 (id=2): O -> non-metaphor (0)
        
        Args:
            words: List of words (already tokenized by SpaCy)
            
        Returns:
            List of predictions (1=metaphor, 0=non-metaphor)
        """
        if not self.hitz_model or not words:
            return [0] * len(words)
        
        try:
            enc = self.hitz_tokenizer(
                words,
                is_split_into_words=True,
                return_tensors='pt',
                truncation=True,
                max_length=512,
            )
            word_ids = enc.word_ids(batch_index=0)
            enc_dev = {k: v.to(self.device) for k, v in enc.items()}
            
            with torch.no_grad():
                logits = self.hitz_model(**enc_dev).logits
            preds = logits.argmax(dim=-1)[0].cpu().tolist()
            
            # Map subword predictions to word predictions
            word_pred = {}
            for idx, wid in enumerate(word_ids):
                if wid is not None and wid not in word_pred:
                    # HiTZ: LABEL_0/1 is metaphor, LABEL_2 is non-metaphor
                    word_pred[wid] = 1 if preds[idx] in (0, 1) else 0
            
            return [word_pred.get(wi, 0) for wi in range(len(words))]
            
        except Exception as e:
            logger.error(f"HiTZ prediction failed: {e}")
            return [0] * len(words)
    
    def predict_finetuned(self, words: List[str], threshold: float = None) -> List[Tuple[int, float]]:
        """
        Get fine-tuned model predictions for a list of words.
        
        Fine-tuned labels:
        - O (id=0): non-metaphor
        - B-METAPHOR (id=1): metaphor start
        - I-METAPHOR (id=2): metaphor continuation
        
        Uses threshold: P(B-METAPHOR) + P(I-METAPHOR) >= threshold -> metaphor
        
        Args:
            words: List of words (already tokenized by SpaCy)
            threshold: Probability threshold (default 0.4)
            
        Returns:
            List of (prediction, confidence) tuples
        """
        if threshold is None:
            threshold = self.FINETUNED_THRESHOLD
        
        if not self.finetuned_model or not words:
            return [(0, 0.0)] * len(words)
        
        try:
            enc = self.finetuned_tokenizer(
                words,
                is_split_into_words=True,
                return_tensors='pt',
                truncation=True,
                max_length=512,
            )
            word_ids = enc.word_ids(batch_index=0)
            enc_dev = {k: v.to(self.device) for k, v in enc.items()}
            
            with torch.no_grad():
                logits = self.finetuned_model(**enc_dev).logits
                probs = torch.softmax(logits, dim=-1)
            
            # Map subword predictions to word predictions
            word_pred = {}
            for idx, wid in enumerate(word_ids):
                if wid is not None and wid not in word_pred:
                    # P(metaphor) = P(B-METAPHOR) + P(I-METAPHOR) = probs[1] + probs[2]
                    p_metaphor = probs[0, idx, 1].item() + probs[0, idx, 2].item()
                    pred = 1 if p_metaphor >= threshold else 0
                    word_pred[wid] = (pred, p_metaphor)
            
            return [word_pred.get(wi, (0, 0.0)) for wi in range(len(words))]
            
        except Exception as e:
            logger.error(f"Fine-tuned prediction failed: {e}")
            return [(0, 0.0)] * len(words)
    
    def unload_models(self) -> None:
        """Unload models from memory."""
        self.hitz_model = None
        self.hitz_tokenizer = None
        self.finetuned_model = None
        self.finetuned_tokenizer = None
        self._loaded = False
        
        # Force garbage collection
        import gc
        gc.collect()
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        logger.info("Models unloaded")

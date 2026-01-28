"""
USAS Neural Semantic Tagger
Neural network based tagging using PyMUSAS-Neural-Multilingual-Base-BEM model
"""

import os
import sys
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

# Import MODELS_DIR from config
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import MODELS_DIR

logger = logging.getLogger(__name__)

# Model path - 使用 config.py 中的 MODELS_DIR (支持打包后的路径)
NEURAL_MODEL_PATH = MODELS_DIR / "pymusas" / "PyMUSAS-Neural-Multilingual-Base-BEM"


class NeuralUSASTagger:
    """
    Neural Network based USAS Semantic Tagger
    Uses the PyMUSAS-Neural-Multilingual-Base-BEM model for semantic tagging
    """
    
    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize the neural tagger
        
        Args:
            model_path: Path to the neural model. If None, uses default path.
        """
        self.model_path = Path(model_path) if model_path else NEURAL_MODEL_PATH
        self.model = None
        self.tokenizer = None
        self.device = None
        self._available = None
        self._label_to_definition = None
    
    def _check_dependencies(self) -> bool:
        """Check if required dependencies are available"""
        try:
            import torch
            from wsd_torch_models.bem import BEM
            from transformers import AutoTokenizer
            return True
        except ImportError as e:
            logger.warning(f"Neural tagger dependencies not available: {e}")
            return False
    
    def _check_model_exists(self) -> bool:
        """Check if the model files exist"""
        if not self.model_path.exists():
            logger.warning(f"Neural model not found at: {self.model_path}")
            return False
        
        # Check for essential model files
        required_files = ["config.json"]
        for f in required_files:
            if not (self.model_path / f).exists():
                logger.warning(f"Required model file not found: {f}")
                return False
        
        return True
    
    def is_available(self) -> bool:
        """Check if neural tagger is available"""
        if self._available is None:
            self._available = self._check_dependencies() and self._check_model_exists()
        return self._available
    
    def load_model(self) -> bool:
        """
        Load the neural model
        
        Returns:
            True if model loaded successfully, False otherwise
        """
        if self.model is not None:
            return True
        
        if not self.is_available():
            return False
        
        try:
            import torch
            from wsd_torch_models.bem import BEM
            from transformers import AutoTokenizer
            
            logger.info(f"Loading neural USAS model from: {self.model_path}")
            
            # Load model
            self.model = BEM.from_pretrained(str(self.model_path))
            self.tokenizer = AutoTokenizer.from_pretrained(
                str(self.model_path), 
                add_prefix_space=True
            )
            
            # Set to evaluation mode
            self.model.eval()
            
            # Choose device
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model.to(device=self.device)
            
            # Store label definitions for reference
            self._label_to_definition = self.model.label_to_definition
            
            logger.info(f"Neural USAS model loaded successfully on {self.device}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load neural model: {e}")
            self.model = None
            self.tokenizer = None
            return False
    
    def tag_tokens(
        self, 
        tokens: List[str], 
        top_n: int = 1
    ) -> List[List[str]]:
        """
        Tag a list of tokens with USAS semantic tags
        
        Args:
            tokens: List of token strings
            top_n: Number of top predictions to return per token
            
        Returns:
            List of lists, where each inner list contains top_n predicted tags
        """
        if not self.load_model():
            # Return empty predictions if model not available
            return [['Z99'] for _ in tokens]
        
        try:
            import torch
            
            with torch.inference_mode(mode=True):
                predictions = self.model.predict(
                    tokens, 
                    sub_word_tokenizer=self.tokenizer, 
                    top_n=top_n
                )
            
            return predictions
            
        except Exception as e:
            logger.error(f"Neural tagging error: {e}")
            return [['Z99'] for _ in tokens]
    
    def tag_text(self, text: str, language: str = 'english') -> Dict[str, Any]:
        """
        Tag text with USAS semantic domains using neural model.
        Processes text sentence by sentence to preserve context and handle long texts.
        
        Args:
            text: Text to tag
            language: Language code (used for tokenization)
            
        Returns:
            Dictionary containing:
            - tokens: List of token info with USAS tags
            - success: Boolean indicating success
            - error: Error message if failed
        """
        result = {
            'success': False,
            'tokens': [],
            'error': None
        }
        
        if not self.load_model():
            result['error'] = 'Neural model not available'
            return result
        
        try:
            # Use spacy for tokenization to get POS, lemma, etc.
            import spacy
            
            # Load appropriate spacy model for tokenization
            lang = language.lower()
            is_chinese = lang in ['chinese', 'zh', 'zh-cn', 'mandarin', 'cmn']
            
            try:
                if is_chinese:
                    nlp = spacy.load('zh_core_web_lg')
                else:
                    nlp = spacy.load('en_core_web_lg')
            except OSError:
                result['error'] = f'SpaCy model not available for {language}'
                return result
            
            # Process with spacy
            doc = nlp(text)
            
            # Process sentence by sentence for better context handling
            all_predictions = []
            for sent in doc.sents:
                sent_tokens = [token.text for token in sent]
                if sent_tokens:
                    # Tag each sentence with full context
                    sent_predictions = self.tag_tokens(sent_tokens, top_n=1)
                    all_predictions.extend(sent_predictions)
            
            # Build result tokens
            for i, token in enumerate(doc):
                # Get neural prediction
                pred_tags = all_predictions[i] if i < len(all_predictions) else ['Z99']
                primary_tag = pred_tags[0] if pred_tags else 'Z99'
                
                token_info = {
                    'text': token.text,
                    'start': token.idx,
                    'end': token.idx + len(token.text),
                    'usas_tag': primary_tag,
                    'usas_tags': pred_tags,  # Neural only returns requested top_n
                    'is_mwe': False,  # Neural model doesn't support MWE
                    'mwe_indexes': [],
                    'pos': token.pos_,
                    'tag': token.tag_,
                    'lemma': token.lemma_,
                    'dep': token.dep_,
                    'is_stop': token.is_stop,
                    'is_punct': token.is_punct,
                    'is_space': token.is_space
                }
                
                result['tokens'].append(token_info)
            
            result['success'] = True
            logger.info(f"Neural tagged text: {len(result['tokens'])} tokens in {len(list(doc.sents))} sentences")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Neural USAS tagging error: {e}")
        
        return result
    
    def tag_tokens_in_context(
        self,
        target_indices: List[int],
        all_tokens: List[Dict],
        sentence_boundaries: List[tuple],
        top_n: int = 1
    ) -> Dict[int, List[str]]:
        """
        Tag specific tokens within their sentence context.
        This is used by hybrid mode to tag Z99/multi-tag tokens with proper context.
        
        Args:
            target_indices: List of token indices to tag
            all_tokens: List of all token dicts (with 'text' key)
            sentence_boundaries: List of (start_idx, end_idx) tuples for each sentence
            top_n: Number of top predictions to return
            
        Returns:
            Dictionary mapping token index to list of predicted tags
        """
        if not self.load_model():
            return {idx: ['Z99'] for idx in target_indices}
        
        # Build index to sentence mapping
        idx_to_sentence = {}
        for sent_start, sent_end in sentence_boundaries:
            for i in range(sent_start, sent_end):
                idx_to_sentence[i] = (sent_start, sent_end)
        
        # Group target indices by sentence
        sentence_targets = {}  # (start, end) -> [target_indices]
        for idx in target_indices:
            if idx in idx_to_sentence:
                sent_bounds = idx_to_sentence[idx]
                if sent_bounds not in sentence_targets:
                    sentence_targets[sent_bounds] = []
                sentence_targets[sent_bounds].append(idx)
        
        # Process each sentence and collect predictions
        results = {}
        
        for (sent_start, sent_end), indices in sentence_targets.items():
            # Get sentence tokens
            sent_tokens = [all_tokens[i].get('text', '') for i in range(sent_start, sent_end)]
            
            if not sent_tokens:
                for idx in indices:
                    results[idx] = ['Z99']
                continue
            
            # Get predictions for the entire sentence
            try:
                import torch
                with torch.inference_mode(mode=True):
                    sent_predictions = self.model.predict(
                        sent_tokens,
                        sub_word_tokenizer=self.tokenizer,
                        top_n=top_n
                    )
                
                # Extract predictions for target tokens
                for idx in indices:
                    local_idx = idx - sent_start
                    if 0 <= local_idx < len(sent_predictions):
                        results[idx] = sent_predictions[local_idx]
                    else:
                        results[idx] = ['Z99']
                        
            except Exception as e:
                logger.error(f"Neural tagging error for sentence: {e}")
                for idx in indices:
                    results[idx] = ['Z99']
        
        # Handle any indices not in a sentence
        for idx in target_indices:
            if idx not in results:
                results[idx] = ['Z99']
        
        return results
    
    def tag_segments(
        self, 
        segments: List[Dict], 
        language: str = 'english'
    ) -> Dict[str, Any]:
        """
        Tag transcript segments with USAS semantic domains using neural model
        
        Args:
            segments: List of segment dicts with 'id', 'text', 'start', 'end'
            language: Language code
            
        Returns:
            Dictionary with segment-level USAS annotations
        """
        result = {
            'success': False,
            'segments': {},
            'total_tokens': 0,
            'error': None
        }
        
        if not self.load_model():
            result['error'] = 'Neural model not available'
            return result
        
        try:
            for segment in segments:
                seg_id = segment.get('id', 0)
                seg_text = segment.get('text', '')
                
                if not seg_text.strip():
                    continue
                
                # Tag this segment
                tag_result = self.tag_text(seg_text, language)
                
                if tag_result['success']:
                    seg_result = {
                        'segment_start': segment.get('start', 0),
                        'segment_end': segment.get('end', 0),
                        'tokens': []
                    }
                    
                    for token in tag_result['tokens']:
                        seg_result['tokens'].append({
                            'text': token['text'],
                            'start': token['start'],
                            'end': token['end'],
                            'usas_tag': token['usas_tag'],
                            'usas_tags': token['usas_tags'],
                            'is_mwe': False,
                            'mwe_indexes': [],
                            'pos': token['pos'],
                            'lemma': token['lemma']
                        })
                    
                    result['segments'][seg_id] = seg_result
                    result['total_tokens'] += len(seg_result['tokens'])
            
            result['success'] = True
            logger.info(f"Neural tagged {len(result['segments'])} segments: {result['total_tokens']} tokens")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Neural USAS segment tagging error: {e}")
        
        return result
    
    def get_tag_definition(self, tag: str) -> str:
        """
        Get the definition/description for a USAS tag
        
        Args:
            tag: USAS tag code
            
        Returns:
            Definition string or empty string if not found
        """
        if not self.load_model():
            return ""
        
        if self._label_to_definition and tag in self._label_to_definition:
            return self._label_to_definition[tag]
        
        return ""


# Singleton instance
_neural_tagger = None


def get_neural_tagger(model_path: Optional[str] = None) -> NeuralUSASTagger:
    """
    Get neural tagger singleton
    
    Args:
        model_path: Optional custom model path
        
    Returns:
        NeuralUSASTagger instance
    """
    global _neural_tagger
    if _neural_tagger is None:
        _neural_tagger = NeuralUSASTagger(model_path)
    return _neural_tagger

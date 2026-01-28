"""
MIPVU Metaphor Identification Service

Main service interface for MIPVU-based metaphor detection.
Provides text and segment annotation with progress callbacks for async processing.
"""

import os
import sys
import json
import logging
from typing import Dict, List, Optional, Any, Callable
from pathlib import Path

from .mipvu import MIPVUAnnotator

logger = logging.getLogger(__name__)


class MIPVUService:
    """
    Main service for MIPVU metaphor identification.
    
    This service provides:
    - Text annotation (using SpaCy data)
    - Segment annotation (for transcribed audio/video)
    - Progress callbacks for async processing
    - Language availability checking (only English supported)
    """
    
    _instance: Optional['MIPVUService'] = None
    
    def __new__(cls, *args, **kwargs):
        """Singleton pattern to avoid loading models multiple times."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(
        self,
        filter_path: Optional[str] = None,
        hitz_model_path: Optional[str] = None,
        finetuned_model_path: Optional[str] = None,
        device: Optional[str] = None
    ):
        """
        Initialize the MIPVU service.
        
        Args:
            filter_path: Path to metaphor_filter.json
            hitz_model_path: Path to HiTZ model
            finetuned_model_path: Path to fine-tuned model
            device: Device for model inference ('cuda', 'mps', 'cpu')
        """
        if self._initialized:
            return
        
        self._filter_path = filter_path
        self._hitz_model_path = hitz_model_path
        self._finetuned_model_path = finetuned_model_path
        self._device = device
        
        self._annotator: Optional[MIPVUAnnotator] = None
        self._models_loaded = False
        self._initialized = True
        
        logger.info("MIPVU service initialized")
    
    def _ensure_annotator(self) -> bool:
        """Ensure the annotator is created and models are loaded."""
        if self._annotator is None:
            self._annotator = MIPVUAnnotator(
                filter_path=self._filter_path,
                hitz_model_path=self._hitz_model_path,
                finetuned_model_path=self._finetuned_model_path,
                device=self._device
            )
        
        if not self._models_loaded:
            self._models_loaded = self._annotator.load_models()
        
        return self._models_loaded
    
    def is_available(self, language: str) -> bool:
        """
        Check if MIPVU annotation is available for the given language.
        Currently only English is supported.
        
        Args:
            language: Language code (e.g., 'en', 'zh')
            
        Returns:
            True if the language is supported (only 'en')
        """
        return language.lower() in ('en', 'english')
    
    def is_ready(self) -> bool:
        """Check if the service is ready (models loaded)."""
        return self._models_loaded and self._annotator is not None and self._annotator.is_ready()
    
    def _restructure_spacy_data(self, spacy_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Restructure SpaCy data to group tokens by sentence.
        
        SpaCy returns:
            tokens: [all tokens at top level]
            sentences: [{text, start, end}, ...]
            
        MIPVU expects:
            sentences: [{text, tokens: [...]}, ...]
        """
        tokens = spacy_data.get('tokens', [])
        sentences = spacy_data.get('sentences', [])
        
        if not tokens or not sentences:
            return spacy_data
        
        # Group tokens by sentence boundaries
        restructured_sentences = []
        
        for sent in sentences:
            sent_start = sent.get('start', 0)
            sent_end = sent.get('end', 0)
            sent_text = sent.get('text', '')
            
            # Find tokens that belong to this sentence
            sent_tokens = []
            for token in tokens:
                token_start = token.get('start', 0)
                token_end = token.get('end', 0)
                # Token belongs to sentence if it overlaps
                if token_start >= sent_start and token_end <= sent_end:
                    # Convert SpaCy token format to MIPVU expected format
                    sent_tokens.append({
                        'word': token.get('text', ''),
                        'lemma': token.get('lemma', ''),
                        'pos': token.get('pos', ''),  # Universal POS
                        'tag': token.get('tag', ''),  # Penn Treebank tag
                        'dep': token.get('dep', ''),
                        'start': token_start,
                        'end': token_end
                    })
            
            restructured_sentences.append({
                'text': sent_text,
                'start': sent_start,
                'end': sent_end,
                'tokens': sent_tokens
            })
        
        return {
            'success': True,
            'sentences': restructured_sentences
        }
    
    def annotate_text(
        self,
        content: str,
        language: str,
        spacy_data: Dict[str, Any],
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> Dict[str, Any]:
        """
        Annotate text for metaphors using SpaCy data.
        
        Args:
            content: Original text content (for reference)
            language: Language code
            spacy_data: SpaCy annotation data with 'tokens' and 'sentences'
            progress_callback: Optional callback(progress, message)
            
        Returns:
            Dictionary containing:
                - success: bool
                - sentences: List of annotated sentences
                - statistics: Summary statistics
                - error: Error message if failed
        """
        if not self.is_available(language):
            return {
                'success': False,
                'error': f'Language {language} not supported for MIPVU annotation (only English)',
                'sentences': [],
                'statistics': {}
            }
        
        if not spacy_data:
            logger.warning("MIPVU: SpaCy data is None or empty")
            return {
                'success': False,
                'error': 'SpaCy data is required for MIPVU annotation',
                'sentences': [],
                'statistics': {}
            }
        
        # Log spacy_data structure for debugging
        logger.info(f"MIPVU: Received SpaCy data with keys: {list(spacy_data.keys())}")
        logger.info(f"MIPVU: tokens count: {len(spacy_data.get('tokens', []))}, sentences count: {len(spacy_data.get('sentences', []))}")
        
        try:
            if progress_callback:
                progress_callback(5, "Loading MIPVU models...")
            
            if not self._ensure_annotator():
                logger.error("MIPVU: Failed to ensure annotator - models may not have loaded")
                return {
                    'success': False,
                    'error': 'Failed to load MIPVU models',
                    'sentences': [],
                    'statistics': {}
                }
            
            if progress_callback:
                progress_callback(10, "Restructuring SpaCy data...")
            
            # Restructure SpaCy data to group tokens by sentence
            restructured_data = self._restructure_spacy_data(spacy_data)
            
            if progress_callback:
                progress_callback(15, "Annotating text for metaphors...")
            
            # Create a wrapped callback that maps to the appropriate range
            def wrapped_callback(progress: int, message: str):
                if progress_callback:
                    # Map 0-100 to 15-95
                    mapped_progress = 15 + int(progress * 0.80)
                    progress_callback(mapped_progress, message)
            
            result = self._annotator.annotate_text(restructured_data, wrapped_callback)
            
            if progress_callback:
                progress_callback(100, "MIPVU annotation complete")
            
            return result
            
        except Exception as e:
            logger.error(f"MIPVU annotation failed: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'sentences': [],
                'statistics': {}
            }
    
    def annotate_segments(
        self,
        segments: List[Dict[str, Any]],
        language: str,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> List[Dict[str, Any]]:
        """
        Annotate transcript segments for metaphors.
        Each segment should have 'spacy_data' containing the SpaCy annotations.
        
        Args:
            segments: List of segments, each with 'text', 'spacy_data', etc.
            language: Language code
            progress_callback: Optional callback(progress, message)
            
        Returns:
            List of segments with added 'mipvu_data' field
        """
        if not self.is_available(language):
            logger.warning(f"Language {language} not supported for MIPVU annotation")
            return segments
        
        if not segments:
            return []
        
        try:
            if progress_callback:
                progress_callback(5, "Loading MIPVU models...")
            
            if not self._ensure_annotator():
                logger.error("Failed to load MIPVU models")
                return segments
            
            total_segments = len(segments)
            annotated_segments = []
            
            for idx, segment in enumerate(segments):
                spacy_data = segment.get('spacy_data', {})
                
                if spacy_data:
                    # Annotate segment
                    result = self._annotator.annotate_text(spacy_data)
                    
                    # Add MIPVU data to segment
                    annotated_segment = {
                        **segment,
                        'mipvu_data': result
                    }
                else:
                    annotated_segment = {
                        **segment,
                        'mipvu_data': {
                            'success': False,
                            'error': 'No SpaCy data available',
                            'sentences': [],
                            'statistics': {}
                        }
                    }
                
                annotated_segments.append(annotated_segment)
                
                if progress_callback:
                    progress = int((idx + 1) / total_segments * 90) + 5
                    progress_callback(progress, f"Annotating segment {idx + 1}/{total_segments}")
            
            if progress_callback:
                progress_callback(100, "MIPVU annotation complete")
            
            return annotated_segments
            
        except Exception as e:
            logger.error(f"MIPVU segment annotation failed: {e}", exc_info=True)
            return segments
    
    def get_statistics(self, mipvu_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract statistics from MIPVU annotation result.
        
        Args:
            mipvu_data: MIPVU annotation result
            
        Returns:
            Statistics dictionary
        """
        if not mipvu_data or not mipvu_data.get('success', False):
            return {
                'total_tokens': 0,
                'metaphor_tokens': 0,
                'literal_tokens': 0,
                'metaphor_rate': 0.0,
                'source_counts': {}
            }
        
        return mipvu_data.get('statistics', {})
    
    def unload_models(self) -> None:
        """Unload models from memory to free resources."""
        if self._annotator:
            self._annotator.unload_models()
        self._models_loaded = False
        logger.info("MIPVU models unloaded")
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get service status information.
        
        Returns:
            Dictionary with status information
        """
        return {
            'initialized': self._initialized,
            'models_loaded': self._models_loaded,
            'supported_languages': ['en'],
            'ready': self.is_ready()
        }


# Global service instance
_mipvu_service: Optional[MIPVUService] = None


def get_mipvu_service() -> MIPVUService:
    """Get the global MIPVU service instance."""
    global _mipvu_service
    if _mipvu_service is None:
        _mipvu_service = MIPVUService()
    return _mipvu_service

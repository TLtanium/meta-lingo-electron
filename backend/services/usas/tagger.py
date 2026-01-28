"""
USAS Semantic Tagger
Core tagging functionality using PyMUSAS
"""

import logging
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# 确保 PyMUSAS 组件在 spacy 中注册
# 必须导入 RuleBasedTagger 类来触发 @Language.factory 装饰器注册
try:
    import pymusas
    from pymusas.spacy_api.taggers.rule_based import RuleBasedTagger
    logger.info("PyMUSAS RuleBasedTagger component registered")
except ImportError as e:
    logger.warning(f"Failed to import PyMUSAS: {e}")


def is_mwe_token(mwe_indexes: List[Tuple[int, int]]) -> bool:
    """
    Check if a token is part of a Multi-Word Expression (MWE)
    
    Args:
        mwe_indexes: List of (start, end) tuples from pymusas_mwe_indexes
        
    Returns:
        True if token is part of MWE (range spans more than 1 token)
    """
    if not mwe_indexes:
        return False
    
    for start, end in mwe_indexes:
        if end - start > 1:  # MWE spans multiple tokens
            return True
    
    return False


class USASTagger:
    """
    USAS Semantic Tagger using PyMUSAS
    Supports English and Chinese
    """
    
    def __init__(self):
        self.nlp_en = None
        self.nlp_zh = None
        self._spacy_available = None
        self._pymusas_available = None
    
    def _check_dependencies(self) -> bool:
        """Check if spacy and pymusas are available"""
        if self._spacy_available is None:
            try:
                import spacy
                self._spacy_available = True
            except ImportError:
                self._spacy_available = False
                logger.warning("SpaCy is not installed")
        
        if self._pymusas_available is None:
            try:
                import pymusas
                self._pymusas_available = True
            except ImportError:
                self._pymusas_available = False
                logger.warning("PyMUSAS is not installed")
        
        return self._spacy_available and self._pymusas_available
    
    def load_model(self, language: str) -> Optional[Any]:
        """
        Load SpaCy model with PyMUSAS tagger for the specified language
        
        Args:
            language: Language code (english, chinese, en, zh, etc.)
            
        Returns:
            SpaCy nlp object with PyMUSAS pipeline or None
        """
        if not self._check_dependencies():
            return None
        
        import spacy
        
        # Normalize language
        lang = language.lower()
        is_chinese = lang in ['chinese', 'zh', 'zh-cn', 'mandarin', 'cmn']
        
        if is_chinese:
            if self.nlp_zh is None:
                try:
                    # Load Chinese SpaCy model
                    nlp = spacy.load('zh_core_web_lg')
                    logger.info("Loaded zh_core_web_lg model")
                    
                    # Load Chinese PyMUSAS tagger
                    try:
                        pymusas_tagger = spacy.load('cmn_dual_upos2usas_contextual')
                        nlp.add_pipe('pymusas_rule_based_tagger', source=pymusas_tagger)
                        logger.info("Added Chinese PyMUSAS tagger to pipeline")
                    except OSError as e:
                        logger.error(f"Failed to load Chinese PyMUSAS model: {e}")
                        logger.info("Install with: pip install ./cmn_dual_upos2usas_contextual-0.3.3-py3-none-any.whl")
                        return None
                    
                    self.nlp_zh = nlp
                    
                except OSError as e:
                    logger.error(f"Failed to load Chinese SpaCy model: {e}")
                    return None
            
            return self.nlp_zh
        else:
            # Default to English
            if self.nlp_en is None:
                try:
                    # Load English SpaCy model
                    nlp = spacy.load('en_core_web_lg')
                    logger.info("Loaded en_core_web_lg model")
                    
                    # Load English PyMUSAS tagger
                    try:
                        pymusas_tagger = spacy.load('en_dual_none_contextual')
                        nlp.add_pipe('pymusas_rule_based_tagger', source=pymusas_tagger)
                        logger.info("Added English PyMUSAS tagger to pipeline")
                    except OSError as e:
                        logger.error(f"Failed to load English PyMUSAS model: {e}")
                        logger.info("Install with: pip install ./en_dual_none_contextual-0.3.3-py3-none-any.whl")
                        return None
                    
                    self.nlp_en = nlp
                    
                except OSError as e:
                    logger.error(f"Failed to load English SpaCy model: {e}")
                    return None
            
            return self.nlp_en
    
    def is_available(self, language: str = 'english') -> bool:
        """Check if USAS tagger is available for the language"""
        return self.load_model(language) is not None
    
    def tag_text(self, text: str, language: str = 'english') -> Dict[str, Any]:
        """
        Tag text with USAS semantic domains
        
        Args:
            text: Text to tag
            language: Language code
            
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
        
        nlp = self.load_model(language)
        if nlp is None:
            result['error'] = f'USAS model not available for {language}'
            return result
        
        try:
            doc = nlp(text)
            
            for token in doc:
                # Get USAS tags (pymusas_tags is a list)
                usas_tags = token._.pymusas_tags if hasattr(token._, 'pymusas_tags') else []
                
                # Get MWE indexes
                mwe_indexes = token._.pymusas_mwe_indexes if hasattr(token._, 'pymusas_mwe_indexes') else []
                
                # Check if it's a MWE (Multi-Word Expression) - spans multiple tokens
                is_mwe = is_mwe_token(mwe_indexes)
                
                # Get primary tag (first one) - keep ORIGINAL tags without _MWE suffix
                # _MWE suffix will be added AFTER disambiguation in usas_service.py
                primary_tag = usas_tags[0] if usas_tags else 'Z99'
                
                token_info = {
                    'text': token.text,
                    'start': token.idx,
                    'end': token.idx + len(token.text),
                    'usas_tag': primary_tag,  # Original tag (no _MWE suffix yet)
                    'usas_tags': list(usas_tags),  # Original candidate tags (no _MWE suffix)
                    'is_mwe': is_mwe,  # MWE flag - used later to add _MWE suffix after disambiguation
                    'mwe_indexes': mwe_indexes,  # Store MWE indexes for reference
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
            logger.info(f"Tagged text: {len(result['tokens'])} tokens")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"USAS tagging error: {e}")
        
        return result
    
    def tag_segments(self, segments: List[Dict], language: str = 'english') -> Dict[str, Any]:
        """
        Tag transcript segments with USAS semantic domains
        
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
        
        nlp = self.load_model(language)
        if nlp is None:
            result['error'] = f'USAS model not available for {language}'
            return result
        
        try:
            for segment in segments:
                seg_id = segment.get('id', 0)
                seg_text = segment.get('text', '')
                
                if not seg_text.strip():
                    continue
                
                doc = nlp(seg_text)
                
                seg_result = {
                    'segment_start': segment.get('start', 0),
                    'segment_end': segment.get('end', 0),
                    'tokens': []
                }
                
                for token in doc:
                    usas_tags = token._.pymusas_tags if hasattr(token._, 'pymusas_tags') else []
                    mwe_indexes = token._.pymusas_mwe_indexes if hasattr(token._, 'pymusas_mwe_indexes') else []
                    
                    # Check if it's a MWE (spans multiple tokens)
                    is_mwe = is_mwe_token(mwe_indexes)
                    
                    # Get primary tag - keep ORIGINAL tags without _MWE suffix
                    # _MWE suffix will be added AFTER disambiguation
                    primary_tag = usas_tags[0] if usas_tags else 'Z99'
                    
                    seg_result['tokens'].append({
                        'text': token.text,
                        'start': token.idx,
                        'end': token.idx + len(token.text),
                        'usas_tag': primary_tag,  # Original tag (no _MWE suffix yet)
                        'usas_tags': list(usas_tags),  # Original candidate tags
                        'is_mwe': is_mwe,  # MWE flag - used later after disambiguation
                        'mwe_indexes': mwe_indexes,
                        'pos': token.pos_,
                        'lemma': token.lemma_
                    })
                
                result['segments'][seg_id] = seg_result
                result['total_tokens'] += len(seg_result['tokens'])
            
            result['success'] = True
            logger.info(f"Tagged {len(result['segments'])} segments: {result['total_tokens']} tokens")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"USAS segment tagging error: {e}")
        
        return result
    
    def get_raw_tags(self, text: str, language: str = 'english') -> List[Tuple[str, str, List[str]]]:
        """
        Get raw USAS tags without full token info
        
        Args:
            text: Text to tag
            language: Language code
            
        Returns:
            List of tuples (token_text, lemma, usas_tags)
        """
        nlp = self.load_model(language)
        if nlp is None:
            return []
        
        try:
            doc = nlp(text)
            return [
                (
                    token.text,
                    token.lemma_,
                    token._.pymusas_tags if hasattr(token._, 'pymusas_tags') else ['Z99']
                )
                for token in doc
            ]
        except Exception as e:
            logger.error(f"Error getting raw tags: {e}")
            return []


# Singleton instance
_usas_tagger = None


def get_usas_tagger() -> USASTagger:
    """Get USAS tagger singleton"""
    global _usas_tagger
    if _usas_tagger is None:
        _usas_tagger = USASTagger()
    return _usas_tagger

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


# Language → rule-based PyMUSAS model package name
PYMUSAS_MODEL_MAP = {
    'english':    'en_dual_none_contextual',
    'chinese':    'cmn_dual_upos2usas_contextual',
    'french':     'fr_dual_upos2usas_contextual',
    'spanish':    'es_dual_upos2usas_contextual',
    'italian':    'it_dual_upos2usas_contextual',
    'portuguese': 'pt_dual_upos2usas_contextual',
    'dutch':      'nl_dual_upos2usas_contextual',
    'russian':    'ru_dual_upos2usas_contextual',
    'swedish':    'sv_dual_upos2usas_contextual',
    'danish':     'da_dual_upos2usas_contextual',
    'finnish':    'fi_dual_upos2usas_contextual',
}

# ISO / variant aliases → canonical language name (mirrors spacy_service)
_LANG_ALIASES = {
    'en': 'english', 'zh': 'chinese', 'zh-cn': 'chinese', 'mandarin': 'chinese', 'cmn': 'chinese',
    'da': 'danish', 'nl': 'dutch', 'fi': 'finnish', 'fr': 'french',
    'it': 'italian', 'pt': 'portuguese', 'ru': 'russian', 'es': 'spanish', 'sv': 'swedish',
}

ALL_SUPPORTED_LANGUAGES = list(PYMUSAS_MODEL_MAP.keys())


def _normalize_lang(language: str) -> str:
    lang = (language or 'english').lower().strip()
    return _LANG_ALIASES.get(lang, lang)


class USASTagger:
    """
    USAS Semantic Tagger using PyMUSAS rule-based models.
    Supports English, Chinese, and 9 European languages.
    If a rule-based model for a language is not installed, load_model() returns None
    so the caller can fall back to the neural BEM tagger.
    """

    def __init__(self):
        self._rule_models = {}  # canonical lang → loaded nlp (SpaCy + PyMUSAS pipeline)
        self._spacy_available = None
        self._pymusas_available = None

    # Legacy attribute compatibility
    @property
    def nlp_en(self):
        return self._rule_models.get('english')

    @property
    def nlp_zh(self):
        return self._rule_models.get('chinese')
    
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
        Load SpaCy model with PyMUSAS rule-based tagger for the specified language.

        Returns the cached nlp pipeline if already loaded.
        Returns None if the SpaCy base model or the PyMUSAS rule-based package for
        this language is not installed — the caller should then fall back to neural.
        """
        if not self._check_dependencies():
            return None

        import spacy
        from services.spacy_service import SPACY_MODEL_MAP

        lang = _normalize_lang(language)

        if lang in self._rule_models:
            return self._rule_models[lang]

        # SpaCy base model
        spacy_models = SPACY_MODEL_MAP.get(lang)
        if spacy_models is None:
            logger.warning(f"No SpaCy model configured for '{language}'")
            return None

        base_nlp = None
        for model_name in spacy_models:
            try:
                base_nlp = spacy.load(model_name)
                logger.info(f"Loaded SpaCy base model: {model_name}")
                break
            except OSError:
                continue

        if base_nlp is None:
            logger.error(f"No SpaCy base model found for language '{language}'")
            return None

        # PyMUSAS rule-based tagger
        pymusas_model = PYMUSAS_MODEL_MAP.get(lang)
        if pymusas_model is None:
            logger.warning(f"No rule-based PyMUSAS model defined for '{language}'")
            return None

        try:
            pymusas_tagger = spacy.load(pymusas_model)
            base_nlp.add_pipe('pymusas_rule_based_tagger', source=pymusas_tagger)
            logger.info(f"Added PyMUSAS rule-based tagger '{pymusas_model}' for {lang}")
        except OSError as e:
            logger.warning(f"PyMUSAS rule-based model '{pymusas_model}' not installed "
                           f"for {lang}: {e}. Caller should use neural tagger.")
            return None

        self._rule_models[lang] = base_nlp
        return base_nlp

    def is_available(self, language: str = 'english') -> bool:
        """Check if rule-based USAS tagger is available for the language.
        Returns True for all known languages (rule-based OR neural BEM)."""
        lang = _normalize_lang(language)
        return lang in PYMUSAS_MODEL_MAP
    
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

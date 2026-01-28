"""
Syntax Analysis Service
Provides constituency parsing (benepar) and dependency parsing (SpaCy displacy)
"""

import logging
import sys
from typing import Dict, List, Any, Optional
from pathlib import Path
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_base_path() -> Path:
    """
    Get base path for resources, supporting both development and PyInstaller packaged modes
    
    Returns:
        Base path as Path object
    """
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        # Running in PyInstaller bundle
        return Path(sys._MEIPASS)
    else:
        # Running in development mode
        # __file__ is backend/services/syntax_service.py
        # parent.parent is backend/, parent.parent.parent is project root
        return Path(__file__).parent.parent.parent


class SyntaxService:
    """Syntax analysis service for constituency and dependency parsing"""
    
    def __init__(self):
        self.nlp_en = None
        self.nlp_zh = None
        self.benepar_nlp = None
        self._spacy_available = None
        self._benepar_available = None
        
        # Model paths - support both development and packaged modes
        base_path = get_base_path()
        self.models_dir = base_path / "models"
        self.benepar_model_path = self.models_dir / "nltk" / "models" / "benepar_en3"
        
        logger.info(f"Syntax service initialized. Base path: {base_path}")
        logger.info(f"Benepar model path: {self.benepar_model_path}")
        logger.info(f"Model path exists: {self.benepar_model_path.exists()}")
    
    def _check_spacy(self) -> bool:
        """Check if spacy is available"""
        if self._spacy_available is None:
            try:
                import spacy
                self._spacy_available = True
                logger.info("SpaCy is available")
            except ImportError:
                self._spacy_available = False
                logger.warning("SpaCy is not installed")
        return self._spacy_available
    
    def _load_spacy_model(self, language: str):
        """Load SpaCy model for the specified language"""
        if not self._check_spacy():
            return None
        
        import spacy
        
        lang = language.lower()
        
        if lang in ['chinese', 'zh', 'zh-cn', 'mandarin']:
            if self.nlp_zh is None:
                try:
                    self.nlp_zh = spacy.load("zh_core_web_lg")
                    logger.info("Loaded zh_core_web_lg model")
                except OSError:
                    try:
                        self.nlp_zh = spacy.load("zh_core_web_sm")
                        logger.info("Loaded zh_core_web_sm model (fallback)")
                    except OSError:
                        logger.error("No Chinese SpaCy model found")
                        return None
            return self.nlp_zh
        else:
            if self.nlp_en is None:
                try:
                    self.nlp_en = spacy.load("en_core_web_lg")
                    logger.info("Loaded en_core_web_lg model")
                except OSError:
                    try:
                        self.nlp_en = spacy.load("en_core_web_sm")
                        logger.info("Loaded en_core_web_sm model (fallback)")
                    except OSError:
                        logger.error("No English SpaCy model found")
                        return None
            return self.nlp_en
    
    def _load_benepar(self) -> bool:
        """Load benepar constituency parser"""
        if self._benepar_available is not None:
            return self._benepar_available
        
        try:
            import benepar
            import spacy
            
            # Check if model exists
            if not self.benepar_model_path.exists():
                logger.error(f"Benepar model not found at: {self.benepar_model_path}")
                self._benepar_available = False
                return False
            
            # Load SpaCy model first
            try:
                nlp = spacy.load("en_core_web_lg")
            except OSError:
                try:
                    nlp = spacy.load("en_core_web_sm")
                except OSError:
                    logger.error("No English SpaCy model found for benepar")
                    self._benepar_available = False
                    return False
            
            # Add benepar pipeline
            if not nlp.has_pipe("benepar"):
                try:
                    # Try loading from local path first
                    model_path_str = str(self.benepar_model_path)
                    logger.info(f"Attempting to load benepar from: {model_path_str}")
                    
                    nlp.add_pipe(
                        "benepar",
                        config={"model": model_path_str}
                    )
                    logger.info(f"Loaded benepar model from {model_path_str}")
                except Exception as e:
                    logger.warning(f"Failed to load from path, trying default model name: {e}")
                    try:
                        # Fallback to model name (requires download)
                        nlp.add_pipe("benepar", config={"model": "benepar_en3"})
                        logger.info("Loaded benepar_en3 model by name")
                    except Exception as e2:
                        logger.error(f"Failed to add benepar pipe: {e2}")
                        self._benepar_available = False
                        return False
            
            self.benepar_nlp = nlp
            self._benepar_available = True
            return True
            
        except ImportError as e:
            logger.warning(f"Benepar import error: {e}")
            self._benepar_available = False
            return False
        except Exception as e:
            logger.error(f"Failed to load benepar: {e}")
            self._benepar_available = False
            return False
    
    def is_constituency_available(self) -> bool:
        """Check if constituency parsing is available"""
        return self._load_benepar()
    
    def is_dependency_available(self, language: str = "english") -> bool:
        """Check if dependency parsing is available"""
        return self._load_spacy_model(language) is not None
    
    def analyze_constituency(self, sentence: str, language: str = "english") -> Dict[str, Any]:
        """
        Perform constituency parsing using benepar
        
        Args:
            sentence: Sentence to parse
            language: Language code (currently only English is supported)
            
        Returns:
            Dictionary containing:
            - success: bool
            - tree_string: String representation of the parse tree
            - tree_data: Hierarchical tree data for visualization
            - error: Error message if any
        """
        result = {
            "success": False,
            "tree_string": "",
            "tree_data": None,
            "sentence": sentence,
            "error": None
        }
        
        # Currently only support English
        if language.lower() not in ['english', 'en']:
            result["error"] = "Constituency parsing currently only supports English"
            return result
        
        if not self._load_benepar():
            result["error"] = "Benepar model not available"
            return result
        
        try:
            from nltk import Tree
            
            doc = self.benepar_nlp(sentence)
            
            for sent in doc.sents:
                if hasattr(sent._, 'parse_string'):
                    tree_str = sent._.parse_string
                    result["tree_string"] = tree_str
                    
                    # Parse tree string to get hierarchical data
                    try:
                        parse_tree = Tree.fromstring(tree_str)
                        result["tree_data"] = self._tree_to_dict(parse_tree)
                    except Exception as e:
                        logger.warning(f"Failed to convert tree to dict: {e}")
                        result["tree_data"] = None
                    
                    result["success"] = True
                    break
            
            if not result["success"]:
                result["error"] = "No parse tree generated"
                
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Constituency parsing error: {e}")
        
        return result
    
    def _tree_to_dict(self, tree) -> Dict[str, Any]:
        """Convert NLTK Tree to dictionary for JSON serialization"""
        from nltk import Tree
        
        if isinstance(tree, Tree):
            children = []
            for child in tree:
                children.append(self._tree_to_dict(child))
            
            return {
                "label": tree.label(),
                "children": children,
                "text": " ".join(tree.leaves()) if tree.leaves() else ""
            }
        else:
            # Leaf node (word)
            return {
                "label": tree,
                "children": [],
                "text": tree,
                "isLeaf": True
            }
    
    def analyze_dependency(
        self, 
        sentence: str, 
        language: str = "english",
        compact: bool = False,
        collapse_punct: bool = True,
        collapse_phrases: bool = False
    ) -> Dict[str, Any]:
        """
        Perform dependency parsing using SpaCy displacy
        
        Args:
            sentence: Sentence to parse
            language: Language code
            compact: Use compact mode (straight lines instead of arcs)
            collapse_punct: Collapse punctuation
            collapse_phrases: Collapse phrases
            
        Returns:
            Dictionary containing:
            - success: bool
            - svg_html: SVG visualization HTML
            - tokens: List of token info with dependency relations
            - error: Error message if any
        """
        result = {
            "success": False,
            "svg_html": "",
            "tokens": [],
            "arcs": [],
            "sentence": sentence,
            "error": None
        }
        
        nlp = self._load_spacy_model(language)
        if nlp is None:
            result["error"] = f"SpaCy model not available for {language}"
            return result
        
        try:
            from spacy import displacy
            
            doc = nlp(sentence)
            
            # Generate SVG visualization with options
            options = {
                "compact": compact,
                "collapse_punct": collapse_punct,
                "collapse_phrases": collapse_phrases,
                "bg": "transparent",
                "color": "#333333",
                "font": "Arial, sans-serif",
                "distance": 100 if compact else 120,
                "word_spacing": 30 if compact else 45,
                "arrow_spacing": 12 if compact else 20,
                "arrow_width": 8 if compact else 10,
                "arrow_stroke": 2
            }
            
            svg_html = displacy.render(doc, style="dep", options=options)
            result["svg_html"] = svg_html
            
            # Extract token information
            tokens = []
            for token in doc:
                token_info = {
                    "id": token.i,
                    "text": token.text,
                    "lemma": token.lemma_,
                    "pos": token.pos_,
                    "tag": token.tag_,
                    "dep": token.dep_,
                    "head_id": token.head.i,
                    "head_text": token.head.text
                }
                tokens.append(token_info)
            
            result["tokens"] = tokens
            
            # Extract arcs (dependency relations)
            arcs = []
            for token in doc:
                if token.dep_ != "ROOT":
                    arc = {
                        "start": min(token.i, token.head.i),
                        "end": max(token.i, token.head.i),
                        "label": token.dep_,
                        "dir": "left" if token.i < token.head.i else "right"
                    }
                    arcs.append(arc)
            
            result["arcs"] = arcs
            result["success"] = True
            
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Dependency parsing error: {e}")
        
        return result
    
    def get_dependency_labels(self) -> Dict[str, str]:
        """Get dependency relation label descriptions"""
        return {
            "nsubj": "Nominal subject",
            "nsubjpass": "Passive nominal subject",
            "dobj": "Direct object",
            "iobj": "Indirect object",
            "csubj": "Clausal subject",
            "csubjpass": "Passive clausal subject",
            "ccomp": "Clausal complement",
            "xcomp": "Open clausal complement",
            "amod": "Adjectival modifier",
            "advmod": "Adverbial modifier",
            "neg": "Negation modifier",
            "nmod": "Nominal modifier",
            "appos": "Appositional modifier",
            "nummod": "Numeric modifier",
            "compound": "Compound",
            "det": "Determiner",
            "case": "Case marking",
            "mark": "Marker",
            "cc": "Coordinating conjunction",
            "conj": "Conjunct",
            "aux": "Auxiliary",
            "auxpass": "Passive auxiliary",
            "cop": "Copula",
            "punct": "Punctuation",
            "ROOT": "Root",
            "prep": "Prepositional modifier",
            "pobj": "Object of preposition",
            "poss": "Possession modifier",
            "attr": "Attribute",
            "acl": "Adnominal clause",
            "relcl": "Relative clause modifier",
            "advcl": "Adverbial clause modifier",
            "expl": "Expletive",
            "agent": "Agent",
            "prt": "Particle",
            "dep": "Unspecified dependency"
        }
    
    def get_constituency_labels(self) -> Dict[str, str]:
        """Get constituency phrase label descriptions"""
        return {
            "S": "Simple declarative clause",
            "SBAR": "Clause introduced by subordinating conjunction",
            "SBARQ": "Direct question introduced by wh-word",
            "SINV": "Inverted declarative sentence",
            "SQ": "Inverted yes/no question",
            "NP": "Noun Phrase",
            "VP": "Verb Phrase",
            "PP": "Prepositional Phrase",
            "ADJP": "Adjective Phrase",
            "ADVP": "Adverb Phrase",
            "QP": "Quantifier Phrase",
            "CONJP": "Conjunction Phrase",
            "FRAG": "Fragment",
            "INTJ": "Interjection",
            "LST": "List marker",
            "NAC": "Not a Constituent",
            "NX": "Head of NP",
            "PRN": "Parenthetical",
            "PRT": "Particle",
            "RRC": "Reduced Relative Clause",
            "UCP": "Unlike Coordinated Phrase",
            "WHADJP": "Wh-adjective Phrase",
            "WHADVP": "Wh-adverb Phrase",
            "WHNP": "Wh-noun Phrase",
            "WHPP": "Wh-prepositional Phrase",
            "X": "Unknown or uncertain constituent"
        }


# Singleton instance
_syntax_service = None


def get_syntax_service() -> SyntaxService:
    """Get syntax service singleton"""
    global _syntax_service
    if _syntax_service is None:
        _syntax_service = SyntaxService()
    return _syntax_service

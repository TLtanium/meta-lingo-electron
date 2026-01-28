"""
SpaCy-based Rule Filter for MIPVU

Applies high-confidence rules based on SpaCy annotations to filter out
words that are almost certainly non-metaphor based on their POS tags,
dependency relations, and specific word+dependency combinations.
"""

import logging
from typing import Dict, List, Optional, Tuple, Any

logger = logging.getLogger(__name__)


class SpaCyRuleFilter:
    """
    Rule-based filter using SpaCy annotations.
    
    Filters out words based on:
    1. POS tags that are almost never metaphorical (CD, NNP, SYM)
    2. "to" followed by a verb (infinitive marker)
    3. High-confidence dep+word combinations
    """
    
    # POS tags that are almost never metaphorical
    NON_METAPHOR_POS = {'CD', 'NNP', 'NNPS', 'SYM'}
    
    # Target POS tags for the finetuned model (IN, DT, RB, RP)
    TARGET_POS = {'IN', 'DT', 'RB', 'RP'}
    
    # High-confidence dep+word rules (字面率 > 99%, 实例数 >= 50)
    # Format: {dep: [list of words]}
    BASIC_DEP_WORD_RULES = {
        'det': ['the', 'a', 'an', 'some', 'no', 'any'],
        'neg': ["n't", 'not', 'never'],
        'mark': ['if', 'as', 'cos', 'because'],
        'advmod': ['so', 'just', 'when', 'very', 'only', 'really', 'too', 'more'],
        'predet': ['all'],
        'intj': ['well'],
    }
    
    # Pure dependency rules (100% literal rate)
    PURE_DEP_RULES = ['agent']
    
    def __init__(self):
        """Initialize the rule filter."""
        # Build a lookup dict for faster matching
        self._dep_word_set = {}
        for dep, words in self.BASIC_DEP_WORD_RULES.items():
            self._dep_word_set[dep] = set(w.lower() for w in words)
    
    def is_non_metaphor_by_pos(self, pos_tag: str) -> bool:
        """
        Check if the POS tag indicates a non-metaphor word.
        
        Args:
            pos_tag: The Penn Treebank POS tag (e.g., 'CD', 'NNP')
            
        Returns:
            True if the POS tag is in the non-metaphor list
        """
        return pos_tag in self.NON_METAPHOR_POS
    
    def is_infinitive_to(self, token_data: Dict[str, Any], next_token_data: Optional[Dict[str, Any]]) -> bool:
        """
        Check if "to" is an infinitive marker (followed by a verb).
        
        Args:
            token_data: Current token data with 'word' and 'tag' fields
            next_token_data: Next token data, if available
            
        Returns:
            True if this is an infinitive "to"
        """
        word = token_data.get('word', '').lower()
        if word != 'to':
            return False
        
        if next_token_data:
            next_tag = next_token_data.get('tag', '')
            # VB, VBP, VBZ, VBD, VBG, VBN are verb tags
            if next_tag.startswith('VB'):
                return True
        
        return False
    
    def is_non_metaphor_by_dep_word(self, word: str, dep: str) -> bool:
        """
        Check if word+dep combination is a high-confidence non-metaphor.
        
        Args:
            word: The word (will be lowercased)
            dep: The dependency relation
            
        Returns:
            True if the word+dep combination is in the high-confidence rules
        """
        # Pure dep rules (no word check needed)
        if dep in self.PURE_DEP_RULES:
            return True
        
        # Dep+word rules
        if dep in self._dep_word_set:
            return word.lower() in self._dep_word_set[dep]
        
        return False
    
    def is_target_pos(self, pos_tag: str) -> bool:
        """
        Check if the POS tag is one of the target tags for the finetuned model.
        
        Args:
            pos_tag: The Penn Treebank POS tag
            
        Returns:
            True if the tag is IN, DT, RB, or RP
        """
        return pos_tag in self.TARGET_POS
    
    def apply_rules(
        self,
        token_data: Dict[str, Any],
        next_token_data: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Apply all rules to determine if a token is non-metaphor.
        
        Args:
            token_data: Token data with 'word', 'tag', 'dep' fields
            next_token_data: Next token data for context rules
            
        Returns:
            Tuple of (is_non_metaphor, rule_name)
            rule_name is None if not filtered, otherwise describes the rule
        """
        word = token_data.get('word', '')
        tag = token_data.get('tag', '')
        dep = token_data.get('dep', '')
        
        # Rule 1: Non-metaphor POS tags
        if self.is_non_metaphor_by_pos(tag):
            return True, f'pos_{tag}'
        
        # Rule 2: Infinitive "to"
        if self.is_infinitive_to(token_data, next_token_data):
            return True, 'infinitive_to'
        
        # Rule 3: High-confidence dep+word combinations
        if self.is_non_metaphor_by_dep_word(word, dep):
            return True, f'dep_word_{dep}_{word.lower()}'
        
        return False, None

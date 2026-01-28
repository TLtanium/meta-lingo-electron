"""
USAS Disambiguation Logic
Implements discourse domain recognition and one-sense-per-discourse heuristics
"""

import logging
from collections import Counter, defaultdict
from typing import Dict, List, Any, Optional, Tuple

from .domain_config import (
    get_major_category,
    get_text_type_priority,
    TEXT_TYPE_PRIORITY_MAP
)

logger = logging.getLogger(__name__)


def parse_compound_tag(tag: str) -> List[str]:
    """
    Parse a compound USAS tag that may contain '/' separator
    
    Args:
        tag: USAS tag like 'Df/I2.2' or 'N3.8+/A2.1' or 'N3.8+'
        
    Returns:
        List of individual tags: ['Df', 'I2.2'] or ['N3.8+', 'A2.1'] or ['N3.8+']
        
    Note:
        - '+' suffix is preserved (A3+ and A3 are different tags)
        - '/' indicates compound (multiple domains apply)
        - '_MWE' suffix is also preserved
    """
    if not tag or tag in ('Z99', 'PUNCT'):
        return [tag] if tag else []
    
    # Check for _MWE suffix and preserve it
    mwe_suffix = ''
    if tag.endswith('_MWE'):
        mwe_suffix = '_MWE'
        tag = tag[:-4]  # Remove _MWE temporarily
    
    # Split by '/' to get individual domains
    parts = [p.strip() for p in tag.split('/') if p.strip()]
    
    # Add back _MWE suffix if present
    if mwe_suffix:
        parts = [f"{p}{mwe_suffix}" for p in parts]
    
    return parts if parts else ['Z99']


def expand_compound_tags(usas_tags: List[str]) -> List[str]:
    """
    Expand all compound tags in a list
    
    Args:
        usas_tags: List of USAS tags, some may be compound like 'Df/I2.2'
        
    Returns:
        Expanded list with compound tags split
        
    Example:
        ['Df/I2.2', 'A3+'] -> ['Df', 'I2.2', 'A3+']
    """
    expanded = []
    seen = set()
    
    for tag in usas_tags:
        for part in parse_compound_tag(tag):
            if part not in seen:
                expanded.append(part)
                seen.add(part)
    
    return expanded


class USASDisambiguator:
    """
    USAS Disambiguation using:
    1. Discourse domain recognition - identify dominant domain of text
    2. One-sense-per-discourse - consistent sense within same document
    3. Text type priority - use text type hints for disambiguation
    """
    
    def __init__(self, priority_domains: Optional[List[str]] = None):
        """
        Initialize disambiguator
        
        Args:
            priority_domains: User-configured priority domains for disambiguation
        """
        self.priority_domains = priority_domains or []
    
    def disambiguate(
        self,
        tokens: List[Dict[str, Any]],
        text_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Apply disambiguation to tagged tokens
        
        Args:
            tokens: List of token dictionaries with usas_tags
            text_type: Optional text type code for priority-based disambiguation
            
        Returns:
            Dictionary with:
            - tokens: Disambiguated tokens (each with single usas_tag)
            - domain_distribution: Distribution of major categories
            - dominant_domain: Most frequent major category
            - text_type_priority: Text type code used
            - disambiguation_stats: Statistics about disambiguation
        """
        if not tokens:
            return {
                'tokens': [],
                'domain_distribution': {},
                'dominant_domain': None,
                'text_type_priority': text_type,
                'disambiguation_stats': {}
            }
        
        # Step 1: Get text type priority domains
        priority_domains = self._get_priority_domains(text_type)
        
        # Step 1.5: Preprocess - expand compound tags BEFORE domain recognition
        # This ensures that compound tags like 'Df/I2.2' are expanded to ['Df', 'I2.2']
        # before computing domain distribution and collecting word sense votes
        tokens = self._preprocess_tokens(tokens)
        
        # Step 2: First pass - compute initial domain distribution (uses expanded tags)
        initial_distribution = self._compute_domain_distribution(tokens)
        dominant_domain = self._get_dominant_domain(initial_distribution)
        
        # Step 3: Apply one-sense-per-discourse
        word_sense_votes = self._collect_word_sense_votes(tokens)
        
        # Step 4: Disambiguate each token
        disambiguated_tokens = []
        stats = {
            'total_tokens': len(tokens),
            'ambiguous_tokens': 0,
            'disambiguated_by_priority': 0,
            'disambiguated_by_domain': 0,
            'disambiguated_by_ospc': 0,
            'default_selection': 0
        }
        
        for token in tokens:
            usas_tags = token.get('usas_tags', [])
            
            if len(usas_tags) <= 1:
                # No disambiguation needed
                disambiguated_tokens.append(token)
                continue
            
            stats['ambiguous_tokens'] += 1
            
            # Try disambiguation methods in order
            selected_tag, method = self._select_best_tag(
                token,
                usas_tags,
                priority_domains,
                dominant_domain,
                word_sense_votes
            )
            
            # Update stats
            if method == 'priority':
                stats['disambiguated_by_priority'] += 1
            elif method == 'domain':
                stats['disambiguated_by_domain'] += 1
            elif method == 'ospc':
                stats['disambiguated_by_ospc'] += 1
            else:
                stats['default_selection'] += 1
            
            # Update token with selected tag
            token_copy = token.copy()
            token_copy['usas_tag'] = selected_tag
            token_copy['disambiguation_method'] = method
            disambiguated_tokens.append(token_copy)
        
        # Recompute final distribution after disambiguation
        final_distribution = self._compute_domain_distribution(disambiguated_tokens)
        
        return {
            'tokens': disambiguated_tokens,
            'domain_distribution': final_distribution,
            'dominant_domain': dominant_domain,
            'text_type_priority': text_type,
            'disambiguation_stats': stats
        }
    
    def _get_priority_domains(self, text_type: Optional[str]) -> List[str]:
        """Get priority domains from text type and user config"""
        priority = []
        
        # Add user-configured priority domains first
        if self.priority_domains:
            priority.extend(self.priority_domains)
        
        # Add text type specific domains
        if text_type:
            text_type_priority = get_text_type_priority(text_type)
            for domain in text_type_priority:
                if domain not in priority:
                    priority.append(domain)
        
        return priority
    
    def _preprocess_tokens(self, tokens: List[Dict]) -> List[Dict]:
        """
        Preprocess tokens: expand compound tags before disambiguation
        This must run BEFORE discourse domain recognition and one-sense-per-discourse
        
        For each token:
        - Expands all compound tags in usas_tags list
        - Sets usas_tag_primary to first non-compound tag (for voting)
        - Stores usas_tags_expanded for disambiguation candidate selection
        
        Args:
            tokens: List of token dictionaries with usas_tags
            
        Returns:
            Preprocessed tokens with expanded tag information
        """
        for token in tokens:
            usas_tags = token.get('usas_tags', [])
            
            # Expand all compound tags (e.g., 'Df/I2.2' -> ['Df', 'I2.2'])
            expanded_tags = expand_compound_tags(usas_tags)
            token['usas_tags_expanded'] = expanded_tags
            
            # Get primary tag for voting (first non-compound tag)
            # If original usas_tag is compound, use first expanded part
            original_tag = token.get('usas_tag', '')
            if '/' in original_tag:
                parts = parse_compound_tag(original_tag)
                token['usas_tag_primary'] = parts[0] if parts else original_tag
            else:
                token['usas_tag_primary'] = original_tag
        
        return tokens
    
    def _compute_domain_distribution(self, tokens: List[Dict]) -> Dict[str, float]:
        """
        Compute distribution of major categories
        Uses expanded tags (from preprocessing) for accurate distribution
        
        For compound tags like 'Df/I2.2', both 'Df' and 'I2.2' contribute
        to the distribution after expansion.
        """
        category_counts = Counter()
        total = 0
        
        for token in tokens:
            # Skip punctuation and spaces
            if token.get('is_punct') or token.get('is_space'):
                continue
            
            # Use expanded tags if available (from preprocessing)
            # Otherwise fall back to usas_tag for backward compatibility
            expanded_tags = token.get('usas_tags_expanded')
            if expanded_tags:
                # Count each expanded tag's category
                for tag in expanded_tags:
                    if not tag or tag in ('Z99', 'PUNCT'):
                        continue
                    category, _ = get_major_category(tag)
                    if category:
                        category_counts[category] += 1
                        total += 1
            else:
                # Fallback: use original tag
                tag = token.get('usas_tag', '')
                if not tag or tag in ('Z99', 'PUNCT'):
                    continue
                category, _ = get_major_category(tag)
                if category:
                    category_counts[category] += 1
                    total += 1
        
        if total == 0:
            return {}
        
        return {cat: count / total for cat, count in category_counts.items()}
    
    def _get_dominant_domain(self, distribution: Dict[str, float]) -> Optional[str]:
        """Get the dominant major category"""
        if not distribution:
            return None
        
        # Find category with highest proportion
        max_cat = max(distribution.keys(), key=lambda k: distribution[k])
        
        # Only return if it's significantly dominant (> 20%)
        if distribution[max_cat] > 0.2:
            return max_cat
        
        return None
    
    def _collect_word_sense_votes(self, tokens: List[Dict]) -> Dict[str, Counter]:
        """
        Collect sense votes for each word lemma
        Implements one-sense-per-discourse heuristic
        
        Uses usas_tag_primary (from preprocessing) which is a non-compound tag.
        For compound tags like 'Df/I2.2', votes are cast for 'Df' (first part).
        This ensures more accurate voting for the one-sense-per-discourse heuristic.
        """
        word_votes = defaultdict(Counter)
        
        for token in tokens:
            lemma = token.get('lemma', '').lower()
            if not lemma or token.get('is_punct') or token.get('is_space'):
                continue
            
            # Use preprocessed primary tag (non-compound) if available
            # Otherwise fall back to usas_tag for backward compatibility
            tag = token.get('usas_tag_primary', token.get('usas_tag', ''))
            
            if tag and tag not in ('Z99', 'PUNCT'):
                word_votes[lemma][tag] += 1
        
        return word_votes
    
    def _select_best_tag(
        self,
        token: Dict,
        candidate_tags: List[str],
        priority_domains: List[str],
        dominant_domain: Optional[str],
        word_sense_votes: Dict[str, Counter]
    ) -> Tuple[str, str]:
        """
        Select the best tag from candidates
        
        Uses preprocessed expanded tags (usas_tags_expanded) for matching,
        which ensures compound tags are properly handled.
        
        Strategy:
        1. Use expanded candidates from preprocessing
        2. Match priority domains against expanded tags
        3. Match dominant domain against expanded tags
        4. Use one-sense-per-discourse with expanded tags
        5. Default to first expanded candidate
        
        Returns:
            Tuple of (selected_tag, method_used)
        """
        # Use preprocessed expanded tags if available
        expanded_candidates = token.get('usas_tags_expanded', [])
        
        if not expanded_candidates:
            # Fallback: expand candidate_tags manually
            expanded_candidates = expand_compound_tags(candidate_tags)
        
        if not expanded_candidates:
            return ('Z99', 'default')
        
        if len(expanded_candidates) == 1:
            return (expanded_candidates[0], 'single')
        
        # Method 1: Text type / user priority
        for priority in priority_domains:
            for tag in expanded_candidates:
                # Strip _MWE suffix for matching
                tag_for_match = tag.replace('_MWE', '')
                if tag_for_match.startswith(priority) or tag_for_match == priority:
                    return (tag, 'priority')
        
        # Method 2: Dominant domain preference
        if dominant_domain:
            for tag in expanded_candidates:
                category, _ = get_major_category(tag)
                if category == dominant_domain:
                    return (tag, 'domain')
        
        # Method 3: One-sense-per-discourse
        lemma = token.get('lemma', '').lower()
        if lemma and lemma in word_sense_votes:
            votes = word_sense_votes[lemma]
            if votes:
                # Get most voted tag that matches an expanded candidate
                for voted_tag, count in votes.most_common():
                    if voted_tag in expanded_candidates:
                        total_votes = sum(votes.values())
                        if count / total_votes > 0.5:
                            return (voted_tag, 'ospc')
        
        # Default: use first expanded candidate
        return (expanded_candidates[0], 'default')
    
    def propagate_senses(self, tokens: List[Dict]) -> List[Dict]:
        """
        Propagate consistent senses across same lemmas
        One-sense-per-discourse post-processing
        
        Args:
            tokens: Already disambiguated tokens
            
        Returns:
            Tokens with propagated senses
        """
        # Collect final sense votes
        final_votes = defaultdict(Counter)
        
        for token in tokens:
            lemma = token.get('lemma', '').lower()
            if not lemma or token.get('is_punct') or token.get('is_space'):
                continue
            
            tag = token.get('usas_tag', '')
            if tag and tag != 'Z99':
                final_votes[lemma][tag] += 1
        
        # Propagate majority sense to all occurrences
        propagated = []
        for token in tokens:
            token_copy = token.copy()
            lemma = token.get('lemma', '').lower()
            
            if lemma and lemma in final_votes:
                votes = final_votes[lemma]
                if votes:
                    majority_tag, count = votes.most_common(1)[0]
                    total = sum(votes.values())
                    
                    # Only propagate if clear majority (> 60%) and multiple occurrences
                    if total >= 2 and count / total > 0.6:
                        current_tag = token_copy.get('usas_tag', '')
                        if current_tag != majority_tag:
                            token_copy['usas_tag'] = majority_tag
                            token_copy['propagated'] = True
            
            propagated.append(token_copy)
        
        return propagated

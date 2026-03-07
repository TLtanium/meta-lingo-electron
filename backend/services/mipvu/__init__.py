"""
MIPVU Metaphor Identification Service Module

This module provides MIPVU-based metaphor detection using a three-step pipeline:
1. Word form filtering (metaphor_filter.json)
2. SpaCy-based rule filtering (POS, dependency, high-confidence rules)
3. Clause model full annotation (deberta-v3-large-clause-metaphor) for all remaining tokens
"""

from .filter import MetaphorFilter
from .rules import SpaCyRuleFilter
from .models import MetaphorModelLoader
from .annotator import MIPVUAnnotator

__all__ = [
    'MetaphorFilter',
    'SpaCyRuleFilter', 
    'MetaphorModelLoader',
    'MIPVUAnnotator'
]

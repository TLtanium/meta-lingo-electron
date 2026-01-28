"""
MIPVU Metaphor Identification Service Module

This module provides MIPVU-based metaphor detection using a hybrid approach:
1. Word form filtering (metaphor_filter.json)
2. SpaCy-based rule filtering (POS, dependency, high-confidence rules)
3. HiTZ model prediction
4. Fine-tuned model for IN/DT/RB/RP POS tags
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

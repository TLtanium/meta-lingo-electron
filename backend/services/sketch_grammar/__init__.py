"""
Sketch Grammar Module
Implements Word Sketch functionality based on Sketch Engine's approach
"""

from .grammar_patterns import (
    VERB_RELATIONS,
    NOUN_RELATIONS,
    ADJECTIVE_RELATIONS,
    ADVERB_RELATIONS,
    ALL_RELATIONS,
    get_relations_for_pos,
    POS_OPTIONS
)
from .log_dice import calculate_log_dice, calculate_batch_log_dice
from .sketch_engine import SketchGrammarEngine
from .sketch_service import SketchService, get_sketch_service

__all__ = [
    'VERB_RELATIONS',
    'NOUN_RELATIONS', 
    'ADJECTIVE_RELATIONS',
    'ADVERB_RELATIONS',
    'ALL_RELATIONS',
    'get_relations_for_pos',
    'POS_OPTIONS',
    'calculate_log_dice',
    'calculate_batch_log_dice',
    'SketchGrammarEngine',
    'SketchService',
    'get_sketch_service'
]


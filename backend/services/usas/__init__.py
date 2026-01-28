"""
USAS Semantic Tagging Module
Provides semantic domain annotation using PyMUSAS

Supports three tagging modes:
- rule_based: Traditional PyMUSAS rule-based tagger with custom disambiguation
- neural: Neural network based tagger (PyMUSAS-Neural-Multilingual-Base-BEM)
- hybrid: Combines rule-based and neural (neural for unknown words)
"""

from .tagger import USASTagger, get_usas_tagger, is_mwe_token
from .disambiguator import USASDisambiguator, parse_compound_tag, expand_compound_tags
from .neural_tagger import NeuralUSASTagger, get_neural_tagger
from .domain_config import (
    USAS_DOMAINS,
    USAS_MAJOR_CATEGORIES,
    TEXT_TYPE_PRIORITY_MAP,
    get_domain_description,
    get_major_category,
    get_domains_by_category,
    get_text_type_priority,
    parse_usas_domains_file
)

__all__ = [
    # Rule-based tagger
    'USASTagger',
    'get_usas_tagger',
    'is_mwe_token',
    # Neural tagger
    'NeuralUSASTagger',
    'get_neural_tagger',
    # Disambiguator
    'USASDisambiguator',
    'parse_compound_tag',
    'expand_compound_tags',
    # Domain config
    'USAS_DOMAINS',
    'USAS_MAJOR_CATEGORIES',
    'TEXT_TYPE_PRIORITY_MAP',
    'get_domain_description',
    'get_major_category',
    'get_domains_by_category',
    'get_text_type_priority',
    'parse_usas_domains_file'
]

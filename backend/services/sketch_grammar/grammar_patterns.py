"""
Grammar Patterns for Word Sketch
Defines 50 fixed grammatical relation templates based on Sketch Engine's approach
Each pattern is defined with:
- name: Internal name for the relation
- display_en: English display name
- display_zh: Chinese display name  
- description: Description of the relation
- center_pos: POS of the center word (VERB, NOUN, ADJ, ADV)
- dep_patterns: List of dependency patterns to match
- collocate_pos: Expected POS of collocate word
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field


@dataclass
class GrammarPattern:
    """Represents a grammatical relation pattern"""
    name: str
    display_en: str
    display_zh: str
    description: str
    center_pos: str  # VERB, NOUN, ADJ, ADV
    dep_patterns: List[Dict[str, Any]]  # Dependency matching patterns
    collocate_pos: List[str] = field(default_factory=list)  # Expected collocate POS
    is_dynamic: bool = False  # True for dynamically generated patterns (phrasal verbs)
    

# ============================================================================
# VERB-CENTERED RELATIONS (15 patterns)
# ============================================================================

VERB_RELATIONS: List[GrammarPattern] = [
    # 1. object - Direct object of verb
    GrammarPattern(
        name="object",
        display_en='objects of "[verb]"',
        display_zh='"[动词]"的宾语',
        description="Direct object of the verb",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "dobj", "direction": "child"},
            {"dep": "obj", "direction": "child"},
        ],
        collocate_pos=["NOUN", "PROPN", "PRON"]
    ),
    
    # 2. subject - Subject of verb
    GrammarPattern(
        name="subject",
        display_en='subjects of "[verb]"',
        display_zh='"[动词]"的主语',
        description="Subject of the verb",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "nsubj", "direction": "child"},
            {"dep": "nsubjpass", "direction": "child"},
        ],
        collocate_pos=["NOUN", "PROPN", "PRON"]
    ),
    
    # 3. modifier - Adverb modifying verb
    GrammarPattern(
        name="modifier",
        display_en='modifiers of "[verb]"',
        display_zh='修饰"[动词]"的副词',
        description="Adverb modifying the verb",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "advmod", "direction": "child"},
        ],
        collocate_pos=["ADV"]
    ),
    
    # 4. and_or - Coordinated verbs
    GrammarPattern(
        name="and_or",
        display_en='"[verb]" and/or ...',
        display_zh='"[动词]"和/或...',
        description="Words coordinated with the verb",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "conj", "direction": "child"},
            {"dep": "conj", "direction": "parent"},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 5. prepositional_phrases - Prepositional phrases with verb
    GrammarPattern(
        name="prepositional_phrases",
        display_en="prepositional phrases",
        display_zh="介词短语",
        description="Prepositional phrases associated with the verb",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "prep", "direction": "child"},
            {"dep": "obl", "direction": "child"},
        ],
        collocate_pos=["ADP"]
    ),
    
    # 6. particles_intransitive - Particles after verb (intransitive)
    GrammarPattern(
        name="particles_intransitive",
        display_en='particles after "[verb]"',
        display_zh='"[动词]"后的小品词',
        description="Particles after verb (intransitive phrasal verb)",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "prt", "direction": "child"},
            {"dep": "compound:prt", "direction": "child"},
        ],
        collocate_pos=["PART", "ADP"]
    ),
    
    # 7. particles_transitive - Particles after verb with object
    GrammarPattern(
        name="particles_transitive",
        display_en='particles after "[verb]" with object',
        display_zh='"[动词]"后的小品词（及物）',
        description="Particles after verb (transitive phrasal verb)",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "prt", "direction": "child", "has_object": True},
            {"dep": "compound:prt", "direction": "child", "has_object": True},
        ],
        collocate_pos=["PART", "ADP"]
    ),
    
    # 8. pronominal_objects - Pronominal objects
    GrammarPattern(
        name="pronominal_objects",
        display_en='pronominal objects of "[verb]"',
        display_zh='"[动词]"的代词宾语',
        description="Pronoun objects of the verb",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "dobj", "direction": "child", "collocate_pos": "PRON"},
            {"dep": "obj", "direction": "child", "collocate_pos": "PRON"},
        ],
        collocate_pos=["PRON"]
    ),
    
    # 9. pronominal_subjects - Pronominal subjects
    GrammarPattern(
        name="pronominal_subjects",
        display_en='pronominal subjects of "[verb]"',
        display_zh='"[动词]"的代词主语',
        description="Pronoun subjects of the verb",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "nsubj", "direction": "child", "collocate_pos": "PRON"},
        ],
        collocate_pos=["PRON"]
    ),
    
    # 10. wh_words - Wh-words following verb
    GrammarPattern(
        name="wh_words",
        display_en='wh-words following "[verb]"',
        display_zh='"[动词]"后的疑问词',
        description="Wh-words following the verb",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "ccomp", "direction": "child", "wh_word": True},
            {"dep": "advcl", "direction": "child", "wh_word": True},
        ],
        collocate_pos=["SCONJ", "ADV", "PRON"]
    ),
    
    # 11. infinitive_objects - Infinitive objects
    GrammarPattern(
        name="infinitive_objects",
        display_en='infinitive objects of "[verb]"',
        display_zh='"[动词]"的不定式宾语',
        description="Infinitive verb objects",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "xcomp", "direction": "child", "morph": "VerbForm=Inf"},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 12. ing_objects - Gerund objects
    GrammarPattern(
        name="ing_objects",
        display_en='-ing objects of "[verb]"',
        display_zh='"[动词]"的动名词宾语',
        description="Gerund (-ing) verb objects",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "xcomp", "direction": "child", "morph": "VerbForm=Ger"},
            {"dep": "ccomp", "direction": "child", "morph": "VerbForm=Ger"},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 13. complements - Verb complements
    GrammarPattern(
        name="complements",
        display_en='complements of "[verb]"',
        display_zh='"[动词]"的补语',
        description="Complements of the verb (noun or clause)",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "ccomp", "direction": "child"},
            {"dep": "xcomp", "direction": "child"},
        ],
        collocate_pos=["VERB", "NOUN", "ADJ"]
    ),
    
    # 14. adjectives_after - Adjectives after verb (predicative)
    GrammarPattern(
        name="adjectives_after",
        display_en='adjectives after "[verb]"',
        display_zh='"[动词]"后的形容词',
        description="Adjective complements (predicative adjectives)",
        center_pos="VERB",
        dep_patterns=[
            {"dep": "acomp", "direction": "child"},
            {"dep": "xcomp", "direction": "child", "collocate_pos": "ADJ"},
        ],
        collocate_pos=["ADJ"]
    ),
    
    # 15. usage_patterns - Usage patterns
    GrammarPattern(
        name="usage_patterns",
        display_en="usage patterns",
        display_zh="用法模式",
        description="Common usage patterns of the verb",
        center_pos="VERB",
        dep_patterns=[],  # Computed from multiple patterns
        collocate_pos=[]
    ),
]


# ============================================================================
# NOUN-CENTERED RELATIONS (16 patterns)
# ============================================================================

NOUN_RELATIONS: List[GrammarPattern] = [
    # 16. nouns_modified_by - Nouns modified by noun (compound)
    GrammarPattern(
        name="nouns_modified_by",
        display_en='nouns modified by "[noun]"',
        display_zh='被"[名词]"修饰的名词',
        description="Nouns modified by this noun (compound nouns)",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "compound", "direction": "parent"},
        ],
        collocate_pos=["NOUN", "PROPN"]
    ),
    
    # 17. verbs_with_as_object - Verbs with noun as object
    GrammarPattern(
        name="verbs_with_as_object",
        display_en='verbs with "[noun]" as object',
        display_zh='以"[名词]"为宾语的动词',
        description="Verbs that take this noun as direct object",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "dobj", "direction": "parent"},
            {"dep": "obj", "direction": "parent"},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 18. verbs_with_as_subject - Verbs with noun as subject
    GrammarPattern(
        name="verbs_with_as_subject",
        display_en='verbs with "[noun]" as subject',
        display_zh='以"[名词]"为主语的动词',
        description="Verbs that take this noun as subject",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "nsubj", "direction": "parent"},
            {"dep": "nsubjpass", "direction": "parent"},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 19. noun_and_or - Coordinated nouns
    GrammarPattern(
        name="noun_and_or",
        display_en='"[noun]" and/or ...',
        display_zh='"[名词]"和/或...',
        description="Words coordinated with the noun",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "conj", "direction": "child"},
            {"dep": "conj", "direction": "parent"},
        ],
        collocate_pos=["NOUN", "PROPN"]
    ),
    
    # 20. noun_prepositional_phrases - Prepositional phrases with noun
    GrammarPattern(
        name="noun_prepositional_phrases",
        display_en="prepositional phrases",
        display_zh="介词短语",
        description="Prepositional phrases associated with the noun",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "prep", "direction": "child"},
            {"dep": "nmod", "direction": "child"},
        ],
        collocate_pos=["ADP"]
    ),
    
    # 21. adjective_predicates - Adjective predicates of noun
    GrammarPattern(
        name="adjective_predicates",
        display_en='adjective predicates of "[noun]"',
        display_zh='"[名词]"的形容词谓语',
        description="Adjectives used predicatively with noun as subject",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "nsubj", "direction": "parent", "head_pos": "ADJ"},
        ],
        collocate_pos=["ADJ"]
    ),
    
    # 22. noun_is_a - Noun is a ... (copula complement)
    GrammarPattern(
        name="noun_is_a",
        display_en='"[noun]" is a ...',
        display_zh='"[名词]"是...',
        description="Nouns appearing as copula complement",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "nsubj", "direction": "parent", "head_dep": "attr"},
        ],
        collocate_pos=["NOUN", "PROPN"]
    ),
    
    # 23. possessive - Noun's possessive
    GrammarPattern(
        name="possessive",
        display_en="[noun]'s ...",
        display_zh='"[名词]"的...',
        description="Possessive constructions (noun's ...)",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "poss", "direction": "parent"},
        ],
        collocate_pos=["NOUN", "PROPN"]
    ),
    
    # 24. possessors - Possessors of noun
    GrammarPattern(
        name="possessors",
        display_en='possessors of "[noun]"',
        display_zh='"[名词]"的所有者',
        description="Nouns/names possessing this noun",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "poss", "direction": "child", "collocate_pos_not": "PRON"},
        ],
        collocate_pos=["NOUN", "PROPN"]
    ),
    
    # 25. pronominal_possessors - Pronominal possessors
    GrammarPattern(
        name="pronominal_possessors",
        display_en='pronominal possessors of "[noun]"',
        display_zh='"[名词]"的代词所有者',
        description="Pronouns possessing this noun",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "poss", "direction": "child", "collocate_pos": "PRON"},
        ],
        collocate_pos=["PRON"]
    ),
    
    # 26. is_a_noun - ... is a [noun]
    GrammarPattern(
        name="is_a_noun",
        display_en='... is a "[noun]"',
        display_zh='...是"[名词]"',
        description="Nouns appearing as subject with this noun as complement",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "attr", "direction": "parent"},
        ],
        collocate_pos=["NOUN", "PROPN"]
    ),
    
    # 27. verbs_with_particle_object - Verbs with particle and noun as object
    GrammarPattern(
        name="verbs_with_particle_object",
        display_en='verbs with particle and "[noun]" as object',
        display_zh='带小品词且以"[名词]"为宾语的动词',
        description="Phrasal verbs taking this noun as object",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "dobj", "direction": "parent", "parent_has_particle": True},
            {"dep": "obj", "direction": "parent", "parent_has_particle": True},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 28. noun_usage_patterns - Usage patterns
    GrammarPattern(
        name="noun_usage_patterns",
        display_en="usage patterns",
        display_zh="用法模式",
        description="Common usage patterns of the noun",
        center_pos="NOUN",
        dep_patterns=[],
        collocate_pos=[]
    ),
    
    # 29. modifiers_of_noun - Adjective modifiers of noun
    GrammarPattern(
        name="modifiers_of_noun",
        display_en='modifiers of "[noun]"',
        display_zh='修饰"[名词]"的形容词',
        description="Adjectives modifying this noun",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "amod", "direction": "child"},
        ],
        collocate_pos=["ADJ"]
    ),
    
    # 30. object_of - Noun is object of (reverse of verbs_with_as_object)
    GrammarPattern(
        name="object_of",
        display_en='"[noun]" is object of',
        display_zh='"[名词]"是...的宾语',
        description="Verbs that this noun is object of",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "dobj", "direction": "parent"},
            {"dep": "obj", "direction": "parent"},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 31. subject_of - Noun is subject of
    GrammarPattern(
        name="subject_of",
        display_en='"[noun]" is subject of',
        display_zh='"[名词]"是...的主语',
        description="Verbs that this noun is subject of",
        center_pos="NOUN",
        dep_patterns=[
            {"dep": "nsubj", "direction": "parent"},
            {"dep": "nsubjpass", "direction": "parent"},
        ],
        collocate_pos=["VERB"]
    ),
]


# ============================================================================
# ADJECTIVE-CENTERED RELATIONS (6 patterns)
# ============================================================================

ADJECTIVE_RELATIONS: List[GrammarPattern] = [
    # 32. adj_modifies - Adjective modifies (nouns)
    GrammarPattern(
        name="adj_modifies",
        display_en='"[adjective]" modifies',
        display_zh='"[形容词]"修饰的名词',
        description="Nouns modified by this adjective",
        center_pos="ADJ",
        dep_patterns=[
            {"dep": "amod", "direction": "parent"},
        ],
        collocate_pos=["NOUN", "PROPN"]
    ),
    
    # 33. adj_subject - Subject of adjective (predicative)
    GrammarPattern(
        name="adj_subject",
        display_en='subject of "[adjective]"',
        display_zh='"[形容词]"的主语',
        description="Nouns that are subject of predicative adjective",
        center_pos="ADJ",
        dep_patterns=[
            {"dep": "nsubj", "direction": "child"},
        ],
        collocate_pos=["NOUN", "PROPN", "PRON"]
    ),
    
    # 34. adj_comp_of - Adjective is complement of
    GrammarPattern(
        name="adj_comp_of",
        display_en='"[adjective]" is complement of',
        display_zh='"[形容词]"是...的补语',
        description="Verbs that this adjective is complement of",
        center_pos="ADJ",
        dep_patterns=[
            {"dep": "acomp", "direction": "parent"},
            {"dep": "xcomp", "direction": "parent"},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 35. adj_and_or - Coordinated adjectives
    GrammarPattern(
        name="adj_and_or",
        display_en='"[adjective]" and/or ...',
        display_zh='"[形容词]"和/或...',
        description="Adjectives coordinated with this adjective",
        center_pos="ADJ",
        dep_patterns=[
            {"dep": "conj", "direction": "child"},
            {"dep": "conj", "direction": "parent"},
        ],
        collocate_pos=["ADJ"]
    ),
    
    # 36. nouns_modified_by_adj - Nouns modified by adjective (derived pattern)
    GrammarPattern(
        name="nouns_modified_by_adj",
        display_en='nouns modified by "[adjective]"',
        display_zh='被"[形容词]"修饰的名词',
        description="Nouns modified by this adjective",
        center_pos="ADJ",
        dep_patterns=[
            {"dep": "amod", "direction": "parent"},
        ],
        collocate_pos=["NOUN", "PROPN"]
    ),
    
    # 37. verbs_with_adj_complement - Verbs with adjective as complement
    GrammarPattern(
        name="verbs_with_adj_complement",
        display_en='verbs with "[adjective]" as complement',
        display_zh='以"[形容词]"为补语的动词',
        description="Verbs taking this adjective as complement",
        center_pos="ADJ",
        dep_patterns=[
            {"dep": "acomp", "direction": "parent"},
            {"dep": "xcomp", "direction": "parent"},
        ],
        collocate_pos=["VERB"]
    ),
]


# ============================================================================
# ADVERB-CENTERED RELATIONS (4 patterns)
# ============================================================================

ADVERB_RELATIONS: List[GrammarPattern] = [
    # 38. modifiers_of_adv - Modifiers of adverb
    GrammarPattern(
        name="modifiers_of_adv",
        display_en='modifiers of "[adverb]"',
        display_zh='修饰"[副词]"的词',
        description="Words modifying this adverb",
        center_pos="ADV",
        dep_patterns=[
            {"dep": "advmod", "direction": "child"},
        ],
        collocate_pos=["ADV"]
    ),
    
    # 39. verbs_modified_by_adv - Verbs modified by adverb
    GrammarPattern(
        name="verbs_modified_by_adv",
        display_en='verbs modified by "[adverb]"',
        display_zh='被"[副词]"修饰的动词',
        description="Verbs modified by this adverb",
        center_pos="ADV",
        dep_patterns=[
            {"dep": "advmod", "direction": "parent", "head_pos": "VERB"},
        ],
        collocate_pos=["VERB"]
    ),
    
    # 40. adverbs_modified_by_adv - Adverbs modified by adverb
    GrammarPattern(
        name="adverbs_modified_by_adv",
        display_en='adverbs modified by "[adverb]"',
        display_zh='被"[副词]"修饰的副词',
        description="Adverbs modified by this adverb",
        center_pos="ADV",
        dep_patterns=[
            {"dep": "advmod", "direction": "parent", "head_pos": "ADV"},
        ],
        collocate_pos=["ADV"]
    ),
    
    # 41. adjectives_modified_by_adv - Adjectives modified by adverb
    GrammarPattern(
        name="adjectives_modified_by_adv",
        display_en='adjectives modified by "[adverb]"',
        display_zh='被"[副词]"修饰的形容词',
        description="Adjectives modified by this adverb",
        center_pos="ADV",
        dep_patterns=[
            {"dep": "advmod", "direction": "parent", "head_pos": "ADJ"},
        ],
        collocate_pos=["ADJ"]
    ),
]


# ============================================================================
# ALL RELATIONS COMBINED
# ============================================================================

ALL_RELATIONS: List[GrammarPattern] = (
    VERB_RELATIONS + 
    NOUN_RELATIONS + 
    ADJECTIVE_RELATIONS + 
    ADVERB_RELATIONS
)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_relations_for_pos(pos: str) -> List[GrammarPattern]:
    """
    Get all relation patterns for a specific POS
    
    Args:
        pos: Part of speech (VERB, NOUN, ADJ, ADV, or 'auto')
        
    Returns:
        List of applicable grammar patterns
    """
    pos = pos.upper()
    
    if pos == 'AUTO':
        return ALL_RELATIONS
    elif pos == 'VERB':
        return VERB_RELATIONS
    elif pos in ['NOUN', 'PROPN']:
        return NOUN_RELATIONS
    elif pos in ['ADJ', 'ADJECTIVE']:
        return ADJECTIVE_RELATIONS
    elif pos in ['ADV', 'ADVERB']:
        return ADVERB_RELATIONS
    elif pos == 'PRON':
        # Pronouns can use noun relations
        return NOUN_RELATIONS
    else:
        return ALL_RELATIONS


def get_pattern_by_name(name: str) -> Optional[GrammarPattern]:
    """
    Get a specific pattern by its name
    
    Args:
        name: Pattern name
        
    Returns:
        GrammarPattern or None if not found
    """
    for pattern in ALL_RELATIONS:
        if pattern.name == name:
            return pattern
    return None


# POS options for frontend
POS_OPTIONS = [
    {"value": "auto", "label_en": "Auto", "label_zh": "自动"},
    {"value": "adjective", "label_en": "Adjective", "label_zh": "形容词"},
    {"value": "adverb", "label_en": "Adverb", "label_zh": "副词"},
    {"value": "noun", "label_en": "Noun", "label_zh": "名词"},
    {"value": "verb", "label_en": "Verb", "label_zh": "动词"},
    {"value": "pronoun", "label_en": "Pronoun", "label_zh": "代词"},
]


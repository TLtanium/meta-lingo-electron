"""
Sketch Grammar Engine
Extracts grammatical relations from SpaCy-annotated corpus data
Based on Sketch Engine's Word Sketch approach
"""

import logging
from typing import Dict, List, Any, Optional, Tuple, Set
from collections import defaultdict
from dataclasses import dataclass, field

from .grammar_patterns import (
    GrammarPattern,
    ALL_RELATIONS,
    VERB_RELATIONS,
    NOUN_RELATIONS,
    ADJECTIVE_RELATIONS,
    ADVERB_RELATIONS,
    get_relations_for_pos
)

logger = logging.getLogger(__name__)


@dataclass
class RelationInstance:
    """Represents a single instance of a grammatical relation"""
    word1: str  # Center word
    word1_lemma: str
    word1_pos: str
    relation: str  # Relation name
    word2: str  # Collocate word
    word2_lemma: str
    word2_pos: str
    sentence_id: int
    word1_idx: int
    word2_idx: int
    preposition: Optional[str] = None  # For prepositional relations
    particle: Optional[str] = None  # For phrasal verbs


@dataclass
class RelationFrequency:
    """Aggregated frequency data for a relation"""
    word1_lemma: str
    word1_pos: str
    relation: str
    word2_lemma: str
    word2_pos: str
    frequency: int = 0
    instances: List[Tuple[int, int, int]] = field(default_factory=list)  # (sent_id, w1_idx, w2_idx)
    prepositions: Dict[str, int] = field(default_factory=dict)  # prep -> count
    particles: Dict[str, int] = field(default_factory=dict)  # particle -> count


class SketchGrammarEngine:
    """
    Engine for extracting grammatical relations from SpaCy-annotated data
    """
    
    # WH-words for detecting wh-clauses
    WH_WORDS = {'what', 'who', 'whom', 'whose', 'which', 'when', 'where', 'why', 'how', 'whether', 'if'}
    
    def __init__(self):
        self.patterns = ALL_RELATIONS
        
    def extract_relations(
        self,
        spacy_data: Dict[str, Any],
        target_word: Optional[str] = None,
        target_pos: Optional[str] = None,
        use_lemma: bool = True
    ) -> List[RelationInstance]:
        """
        Extract grammatical relations from SpaCy-annotated data
        
        Args:
            spacy_data: SpaCy annotation data (tokens, sentences, etc.)
            target_word: Optional specific word to find relations for
            target_pos: Optional POS filter for target word
            use_lemma: Whether to match by lemma (True) or word form (False)
            
        Returns:
            List of RelationInstance objects
        """
        relations = []
        
        tokens = spacy_data.get('tokens', [])
        if not tokens:
            return relations
        
        # Build token lookup by index
        token_by_idx = {i: tok for i, tok in enumerate(tokens)}
        
        # Get sentence boundaries
        sentences = spacy_data.get('sentences', [])
        
        # Process each token
        for idx, token in enumerate(tokens):
            # Skip punctuation and spaces
            if token.get('is_punct') or token.get('is_space'):
                continue
                
            token_lemma = token.get('lemma', '').lower()
            token_text = token.get('text', '').lower()
            token_pos = token.get('pos', '')
            
            # Apply target word filter if specified
            if target_word:
                target_lower = target_word.lower()
                if use_lemma:
                    if token_lemma != target_lower:
                        continue
                else:
                    if token_text != target_lower:
                        continue
            
            # Apply POS filter if specified
            if target_pos and target_pos.upper() != 'AUTO':
                pos_map = {
                    'VERB': ['VERB'],
                    'NOUN': ['NOUN', 'PROPN'],
                    'ADJECTIVE': ['ADJ'],
                    'ADJ': ['ADJ'],
                    'ADVERB': ['ADV'],
                    'ADV': ['ADV'],
                    'PRONOUN': ['PRON'],
                    'PRON': ['PRON']
                }
                allowed_pos = pos_map.get(target_pos.upper(), [target_pos.upper()])
                if token_pos not in allowed_pos:
                    continue
            
            # Find sentence ID for this token
            sent_id = self._get_sentence_id(token, sentences)
            
            # Get applicable patterns for this token's POS
            patterns = get_relations_for_pos(token_pos)
            
            # Extract relations using each pattern
            for pattern in patterns:
                if pattern.center_pos != token_pos:
                    continue
                    
                extracted = self._extract_pattern_relations(
                    token, idx, token_by_idx, pattern, sent_id
                )
                relations.extend(extracted)
        
        return relations
    
    def _extract_pattern_relations(
        self,
        center_token: Dict,
        center_idx: int,
        token_by_idx: Dict[int, Dict],
        pattern: GrammarPattern,
        sent_id: int
    ) -> List[RelationInstance]:
        """Extract relations matching a specific pattern"""
        relations = []
        
        center_lemma = center_token.get('lemma', '').lower()
        center_text = center_token.get('text', '')
        center_pos = center_token.get('pos', '')
        center_dep = center_token.get('dep', '')
        head_idx = center_token.get('head', center_idx)
        
        for dep_pattern in pattern.dep_patterns:
            required_dep = dep_pattern.get('dep', '')
            direction = dep_pattern.get('direction', 'child')
            required_collocate_pos = dep_pattern.get('collocate_pos')
            required_head_pos = dep_pattern.get('head_pos')
            exclude_collocate_pos = dep_pattern.get('collocate_pos_not')
            check_has_object = dep_pattern.get('has_object', False)
            check_wh_word = dep_pattern.get('wh_word', False)
            check_morph = dep_pattern.get('morph')
            check_parent_has_particle = dep_pattern.get('parent_has_particle', False)
            
            if direction == 'child':
                # Find children with matching dependency
                for idx, token in token_by_idx.items():
                    if token.get('head') == center_idx and token.get('dep') == required_dep:
                        collocate = token
                        collocate_idx = idx
                        
                        # Apply filters
                        if not self._check_collocate_filters(
                            collocate, required_collocate_pos, exclude_collocate_pos,
                            check_wh_word, check_morph
                        ):
                            continue
                        
                        # Check for object requirement (phrasal verbs)
                        if check_has_object:
                            if not self._has_object(center_idx, token_by_idx):
                                continue
                        
                        # Create relation instance
                        relation = self._create_relation_instance(
                            center_token, center_idx, center_lemma, center_pos,
                            collocate, collocate_idx, pattern.name, sent_id,
                            token_by_idx
                        )
                        if relation:
                            relations.append(relation)
                            
            elif direction == 'parent':
                # Find parent with matching dependency
                if center_dep == required_dep and head_idx != center_idx:
                    head_token = token_by_idx.get(head_idx)
                    if head_token:
                        # Apply head POS filter if specified
                        if required_head_pos and head_token.get('pos') != required_head_pos:
                            continue
                        
                        # Apply collocate filters to head
                        if not self._check_collocate_filters(
                            head_token, required_collocate_pos, exclude_collocate_pos,
                            check_wh_word, check_morph
                        ):
                            continue
                        
                        # Check parent has particle
                        if check_parent_has_particle:
                            if not self._has_particle(head_idx, token_by_idx):
                                continue
                        
                        relation = self._create_relation_instance(
                            center_token, center_idx, center_lemma, center_pos,
                            head_token, head_idx, pattern.name, sent_id,
                            token_by_idx
                        )
                        if relation:
                            relations.append(relation)
        
        return relations
    
    def _check_collocate_filters(
        self,
        collocate: Dict,
        required_pos: Optional[str],
        exclude_pos: Optional[str],
        check_wh: bool,
        check_morph: Optional[str]
    ) -> bool:
        """Check if collocate passes all filters"""
        collocate_pos = collocate.get('pos', '')
        
        # POS requirement
        if required_pos and collocate_pos != required_pos:
            return False
        
        # POS exclusion
        if exclude_pos and collocate_pos == exclude_pos:
            return False
        
        # WH-word check
        if check_wh:
            collocate_text = collocate.get('text', '').lower()
            if collocate_text not in self.WH_WORDS:
                return False
        
        # Morphology check
        if check_morph:
            morph = collocate.get('morph', '')
            if check_morph not in morph:
                return False
        
        return True
    
    def _has_object(self, verb_idx: int, token_by_idx: Dict[int, Dict]) -> bool:
        """Check if verb has a direct object"""
        for idx, token in token_by_idx.items():
            if token.get('head') == verb_idx:
                dep = token.get('dep', '')
                if dep in ['dobj', 'obj']:
                    return True
        return False
    
    def _has_particle(self, verb_idx: int, token_by_idx: Dict[int, Dict]) -> bool:
        """Check if verb has a particle"""
        for idx, token in token_by_idx.items():
            if token.get('head') == verb_idx:
                dep = token.get('dep', '')
                if dep in ['prt', 'compound:prt']:
                    return True
        return False
    
    def _get_particle(self, verb_idx: int, token_by_idx: Dict[int, Dict]) -> Optional[str]:
        """Get particle associated with verb"""
        for idx, token in token_by_idx.items():
            if token.get('head') == verb_idx:
                dep = token.get('dep', '')
                if dep in ['prt', 'compound:prt']:
                    return token.get('text', '').lower()
        return None
    
    def _get_preposition(self, token: Dict, center_idx: int, token_by_idx: Dict[int, Dict]) -> Optional[str]:
        """Get preposition for prepositional relations"""
        dep = token.get('dep', '')
        if dep in ['prep', 'obl', 'nmod']:
            # For prep dependency, the token itself might be the preposition
            if token.get('pos') == 'ADP':
                return token.get('text', '').lower()
            # Otherwise look for preposition child
            token_idx = None
            for idx, t in token_by_idx.items():
                if t is token:
                    token_idx = idx
                    break
            if token_idx is not None:
                for idx, t in token_by_idx.items():
                    if t.get('head') == token_idx and t.get('pos') == 'ADP':
                        return t.get('text', '').lower()
        return None
    
    def _create_relation_instance(
        self,
        center_token: Dict,
        center_idx: int,
        center_lemma: str,
        center_pos: str,
        collocate: Dict,
        collocate_idx: int,
        relation_name: str,
        sent_id: int,
        token_by_idx: Dict[int, Dict]
    ) -> Optional[RelationInstance]:
        """Create a RelationInstance from matched tokens"""
        collocate_text = collocate.get('text', '')
        collocate_lemma = collocate.get('lemma', '').lower()
        collocate_pos = collocate.get('pos', '')
        
        # Skip if collocate is empty
        if not collocate_lemma or collocate.get('is_punct') or collocate.get('is_space'):
            return None
        
        # Get preposition/particle if applicable
        prep = self._get_preposition(collocate, center_idx, token_by_idx)
        particle = self._get_particle(center_idx, token_by_idx) if center_pos == 'VERB' else None
        
        return RelationInstance(
            word1=center_token.get('text', ''),
            word1_lemma=center_lemma,
            word1_pos=center_pos,
            relation=relation_name,
            word2=collocate_text,
            word2_lemma=collocate_lemma,
            word2_pos=collocate_pos,
            sentence_id=sent_id,
            word1_idx=center_idx,
            word2_idx=collocate_idx,
            preposition=prep,
            particle=particle
        )
    
    def _get_sentence_id(self, token: Dict, sentences: List[Dict]) -> int:
        """Get sentence ID for a token"""
        token_start = token.get('start', 0)
        for i, sent in enumerate(sentences):
            if sent.get('start', 0) <= token_start < sent.get('end', 0):
                return i
        return 0
    
    def aggregate_relations(
        self,
        relations: List[RelationInstance],
        min_frequency: int = 1
    ) -> Dict[str, List[RelationFrequency]]:
        """
        Aggregate relation instances by (word1_lemma, relation, word2_lemma)
        
        Args:
            relations: List of RelationInstance objects
            min_frequency: Minimum frequency threshold
            
        Returns:
            Dict mapping relation names to lists of RelationFrequency
        """
        # Group by (word1_lemma, relation, word2_lemma)
        freq_map: Dict[Tuple, RelationFrequency] = {}
        
        for rel in relations:
            key = (rel.word1_lemma, rel.relation, rel.word2_lemma)
            
            if key not in freq_map:
                freq_map[key] = RelationFrequency(
                    word1_lemma=rel.word1_lemma,
                    word1_pos=rel.word1_pos,
                    relation=rel.relation,
                    word2_lemma=rel.word2_lemma,
                    word2_pos=rel.word2_pos
                )
            
            freq = freq_map[key]
            freq.frequency += 1
            freq.instances.append((rel.sentence_id, rel.word1_idx, rel.word2_idx))
            
            if rel.preposition:
                freq.prepositions[rel.preposition] = freq.prepositions.get(rel.preposition, 0) + 1
            if rel.particle:
                freq.particles[rel.particle] = freq.particles.get(rel.particle, 0) + 1
        
        # Filter by minimum frequency and group by relation
        result: Dict[str, List[RelationFrequency]] = defaultdict(list)
        
        for key, freq in freq_map.items():
            if freq.frequency >= min_frequency:
                result[freq.relation].append(freq)
        
        # Sort each relation by frequency
        for relation_name in result:
            result[relation_name].sort(key=lambda x: x.frequency, reverse=True)
        
        return dict(result)
    
    def extract_phrasal_verb_relations(
        self,
        spacy_data: Dict[str, Any],
        target_verb: Optional[str] = None
    ) -> List[RelationInstance]:
        """
        Extract dynamically generated phrasal verb relations
        
        Args:
            spacy_data: SpaCy annotation data
            target_verb: Optional specific verb to find
            
        Returns:
            List of RelationInstance for phrasal verbs
        """
        relations = []
        tokens = spacy_data.get('tokens', [])
        token_by_idx = {i: tok for i, tok in enumerate(tokens)}
        sentences = spacy_data.get('sentences', [])
        
        for idx, token in enumerate(tokens):
            if token.get('pos') != 'VERB':
                continue
            
            verb_lemma = token.get('lemma', '').lower()
            verb_text = token.get('text', '')
            
            if target_verb and verb_lemma != target_verb.lower():
                continue
            
            # Find particles for this verb
            particle = self._get_particle(idx, token_by_idx)
            if not particle:
                continue
            
            sent_id = self._get_sentence_id(token, sentences)
            
            # Find objects of this phrasal verb
            for obj_idx, obj_token in token_by_idx.items():
                if obj_token.get('head') == idx:
                    dep = obj_token.get('dep', '')
                    if dep in ['dobj', 'obj']:
                        obj_lemma = obj_token.get('lemma', '').lower()
                        obj_pos = obj_token.get('pos', '')
                        
                        relation = RelationInstance(
                            word1=verb_text,
                            word1_lemma=verb_lemma,
                            word1_pos='VERB',
                            relation=f'objects_of_{verb_lemma}_{particle}',
                            word2=obj_token.get('text', ''),
                            word2_lemma=obj_lemma,
                            word2_pos=obj_pos,
                            sentence_id=sent_id,
                            word1_idx=idx,
                            word2_idx=obj_idx,
                            particle=particle
                        )
                        relations.append(relation)
        
        return relations


# Singleton instance
_engine: Optional[SketchGrammarEngine] = None


def get_sketch_engine() -> SketchGrammarEngine:
    """Get Sketch Grammar engine singleton"""
    global _engine
    if _engine is None:
        _engine = SketchGrammarEngine()
    return _engine


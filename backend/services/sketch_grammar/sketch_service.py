"""
Word Sketch Service
High-level service for generating Word Sketches and Sketch Differences
"""

import logging
import json
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime
from collections import defaultdict

from .sketch_engine import SketchGrammarEngine, get_sketch_engine, RelationFrequency
from .log_dice import (
    calculate_sketch_scores,
    compare_sketches,
    CollocationScore,
    calculate_log_dice
)
from .grammar_patterns import (
    get_relations_for_pos,
    get_pattern_by_name,
    POS_OPTIONS,
    ALL_RELATIONS
)

logger = logging.getLogger(__name__)


class SketchService:
    """
    Service for generating Word Sketches from corpus data
    """
    
    def __init__(self):
        self.engine = get_sketch_engine()
    
    def generate_word_sketch(
        self,
        word: str,
        pos: str,
        corpus_spacy_data: List[Dict[str, Any]],
        min_frequency: int = 2,
        min_score: float = 0.0,
        max_results_per_relation: int = 12
    ) -> Dict[str, Any]:
        """
        Generate a Word Sketch for a specific word
        
        Args:
            word: Target word to analyze
            pos: Part of speech filter (auto, verb, noun, adjective, adverb, pronoun)
            corpus_spacy_data: List of SpaCy annotation dicts from corpus texts
            min_frequency: Minimum collocation frequency
            min_score: Minimum logDice score threshold
            max_results_per_relation: Maximum collocations per relation
            
        Returns:
            Word sketch data with relations and collocations
        """
        target_word = word.lower()
        target_pos = pos.upper() if pos != 'auto' else 'AUTO'
        
        # Collect all relations from corpus
        all_relations = []
        
        for spacy_data in corpus_spacy_data:
            relations = self.engine.extract_relations(
                spacy_data,
                target_word=target_word,
                target_pos=target_pos if target_pos != 'AUTO' else None,
                use_lemma=True
            )
            all_relations.extend(relations)
            
            # Also extract phrasal verb relations for verbs
            if target_pos in ['AUTO', 'VERB']:
                phrasal_relations = self.engine.extract_phrasal_verb_relations(
                    spacy_data,
                    target_verb=target_word
                )
                all_relations.extend(phrasal_relations)
        
        if not all_relations:
            return {
                'success': True,
                'word': word,
                'pos': pos,
                'total_instances': 0,
                'relations': {},
                'message': 'No relations found for this word'
            }
        
        # Aggregate relations
        aggregated = self.engine.aggregate_relations(all_relations, min_frequency)
        
        # Calculate logDice scores
        scored_relations = calculate_sketch_scores(
            word, target_pos, aggregated
        )
        
        # Format results
        relations_data = {}
        total_instances = 0
        
        for relation_name, collocations in scored_relations.items():
            # Get pattern info for display names
            pattern = get_pattern_by_name(relation_name)
            
            # Filter by min_score and limit results
            filtered_colls = [c for c in collocations if c.log_dice >= min_score]
            limited_colls = filtered_colls[:max_results_per_relation]
            
            coll_list = []
            for coll in limited_colls:
                total_instances += coll.frequency
                coll_list.append({
                    'word': coll.word2,
                    'lemma': coll.word2_lemma,
                    'pos': coll.word2_pos,
                    'frequency': coll.frequency,
                    'score': coll.log_dice,
                    'positions': coll.positions[:10]  # Limit position data
                })
            
            if coll_list:
                relations_data[relation_name] = {
                    'name': relation_name,
                    'display_en': pattern.display_en.replace('[verb]', word).replace('[noun]', word).replace('[adjective]', word).replace('[adverb]', word) if pattern else relation_name,
                    'display_zh': pattern.display_zh.replace('[动词]', word).replace('[名词]', word).replace('[形容词]', word).replace('[副词]', word) if pattern else relation_name,
                    'description': pattern.description if pattern else '',
                    'collocations': coll_list,
                    'total_count': len(collocations)
                }
        
        return {
            'success': True,
            'word': word,
            'pos': pos,
            'total_instances': total_instances,
            'relation_count': len(relations_data),
            'relations': relations_data
        }
    
    def generate_sketch_difference(
        self,
        word1: str,
        word2: str,
        pos: str,
        corpus_spacy_data: List[Dict[str, Any]],
        min_frequency: int = 2,
        compare_mode: str = "lemmas",
        max_results_per_relation: int = 20
    ) -> Dict[str, Any]:
        """
        Generate a Sketch Difference comparing two words
        
        Args:
            word1: First word to compare
            word2: Second word to compare
            pos: Part of speech filter
            corpus_spacy_data: SpaCy annotation data from corpus
            min_frequency: Minimum collocation frequency
            compare_mode: "lemmas" or "word_form" - determines how collocations are matched
            
        Returns:
            Sketch difference data showing shared and unique collocations
        """
        # Use lemma matching for "lemmas" mode, word form for "word_form" mode
        use_lemma = compare_mode == "lemmas"
        
        # Generate sketches for both words with appropriate max results
        sketch1_data = self.generate_word_sketch(
            word1, pos, corpus_spacy_data, min_frequency, min_score=0.0, max_results_per_relation=100
        )
        sketch2_data = self.generate_word_sketch(
            word2, pos, corpus_spacy_data, min_frequency, min_score=0.0, max_results_per_relation=100
        )
        
        if not sketch1_data['success'] or not sketch2_data['success']:
            return {
                'success': False,
                'error': 'Failed to generate sketches for comparison'
            }
        
        # Build CollocationScore objects for comparison
        def build_scored_relations(sketch_data: Dict) -> Dict[str, List[CollocationScore]]:
            result = {}
            for rel_name, rel_data in sketch_data.get('relations', {}).items():
                scores = []
                for coll in rel_data.get('collocations', []):
                    scores.append(CollocationScore(
                        word1=sketch_data['word'],
                        word1_lemma=sketch_data['word'].lower(),
                        word1_pos=sketch_data['pos'],
                        relation=rel_name,
                        word2=coll['word'],
                        word2_lemma=coll['lemma'],
                        word2_pos=coll['pos'],
                        frequency=coll['frequency'],
                        log_dice=coll['score'],
                        positions=coll.get('positions', [])
                    ))
                result[rel_name] = scores
            return result
        
        scored1 = build_scored_relations(sketch1_data)
        scored2 = build_scored_relations(sketch2_data)
        
        # Compare sketches
        comparison = compare_sketches(scored1, scored2, word1, word2)
        
        # Format results
        relations_data = {}
        
        for relation_name, categories in comparison.items():
            pattern = get_pattern_by_name(relation_name)
            
            def format_collocations(colls: List[CollocationScore], limit: int) -> List[Dict]:
                result = []
                for coll in colls[:limit]:
                    item = {
                        'word': coll.word2,
                        'lemma': coll.word2_lemma,
                        'pos': coll.word2_pos,
                        'frequency': coll.frequency,
                        'score': coll.log_dice
                    }
                    # Add comparison data for shared collocations
                    if hasattr(coll, 'freq1'):
                        item['freq1'] = coll.__dict__.get('freq1', 0)
                        item['freq2'] = coll.__dict__.get('freq2', 0)
                        item['score1'] = coll.__dict__.get('score1', 0)
                        item['score2'] = coll.__dict__.get('score2', 0)
                    result.append(item)
                return result
            
            shared = format_collocations(categories['shared'], max_results_per_relation)
            word1_only = format_collocations(categories['word1_only'], max_results_per_relation)
            word2_only = format_collocations(categories['word2_only'], max_results_per_relation)
            
            if shared or word1_only or word2_only:
                relations_data[relation_name] = {
                    'name': relation_name,
                    'display_en': pattern.display_en if pattern else relation_name,
                    'display_zh': pattern.display_zh if pattern else relation_name,
                    'shared': shared,
                    'word1_only': word1_only,
                    'word2_only': word2_only,
                    'shared_count': len(categories['shared']),
                    'word1_only_count': len(categories['word1_only']),
                    'word2_only_count': len(categories['word2_only'])
                }
        
        return {
            'success': True,
            'word1': word1,
            'word2': word2,
            'pos': pos,
            'relations': relations_data,
            'summary': {
                'word1_total_relations': len(sketch1_data.get('relations', {})),
                'word2_total_relations': len(sketch2_data.get('relations', {})),
                'common_relations': len(relations_data)
            }
        }
    
    def annotate_corpus_sketch(
        self,
        corpus_spacy_data: List[Dict[str, Any]],
        text_ids: List[str],
        min_frequency: int = 1
    ) -> Dict[str, Any]:
        """
        Pre-compute sketch data for an entire corpus
        
        Args:
            corpus_spacy_data: List of SpaCy annotation dicts
            text_ids: Corresponding text IDs
            min_frequency: Minimum frequency threshold
            
        Returns:
            Aggregated sketch data for the corpus
        """
        all_relations = []
        
        for i, spacy_data in enumerate(corpus_spacy_data):
            text_id = text_ids[i] if i < len(text_ids) else str(i)
            
            # Extract all relations (no target word filter)
            relations = self.engine.extract_relations(spacy_data)
            
            # Add text_id to each relation
            for rel in relations:
                rel.__dict__['text_id'] = text_id
            
            all_relations.extend(relations)
            
            # Extract phrasal verb relations
            phrasal = self.engine.extract_phrasal_verb_relations(spacy_data)
            for rel in phrasal:
                rel.__dict__['text_id'] = text_id
            all_relations.extend(phrasal)
        
        # Aggregate all relations
        aggregated = self.engine.aggregate_relations(all_relations, min_frequency)
        
        # Build relation index for fast lookup
        relation_index = defaultdict(lambda: defaultdict(list))
        
        for relation_name, freq_list in aggregated.items():
            for freq in freq_list:
                # Index by word1 lemma
                relation_index[freq.word1_lemma][relation_name].append({
                    'word2_lemma': freq.word2_lemma,
                    'word2_pos': freq.word2_pos,
                    'frequency': freq.frequency,
                    'instances': freq.instances
                })
        
        return {
            'success': True,
            'total_relations': len(all_relations),
            'unique_relations': sum(len(v) for v in aggregated.values()),
            'relation_types': list(aggregated.keys()),
            'index': dict(relation_index),
            'annotated_at': datetime.now().isoformat()
        }
    
    def search_collocations(
        self,
        query: str,
        corpus_spacy_data: List[Dict[str, Any]],
        search_type: str = 'contains',
        pos_filter: Optional[str] = None,
        min_frequency: int = 1,
        max_frequency: Optional[int] = None,
        exclude_words: Optional[List[str]] = None,
        lowercase: bool = True,
        use_regex: bool = False
    ) -> Dict[str, Any]:
        """
        Search for collocations matching specific criteria
        
        Args:
            query: Search query
            corpus_spacy_data: SpaCy data
            search_type: 'exact', 'starts', 'ends', 'contains', 'regex', 'wordlist'
            pos_filter: POS filter
            min_frequency: Min frequency
            max_frequency: Max frequency
            exclude_words: Words to exclude
            lowercase: Lowercase matching
            use_regex: Use regex matching
            
        Returns:
            Matching collocations
        """
        import re
        
        # Prepare query
        if lowercase:
            query = query.lower()
        
        # Build matcher function
        if search_type == 'exact':
            def matches(word: str) -> bool:
                w = word.lower() if lowercase else word
                return w == query
        elif search_type == 'starts':
            def matches(word: str) -> bool:
                w = word.lower() if lowercase else word
                return w.startswith(query)
        elif search_type == 'ends':
            def matches(word: str) -> bool:
                w = word.lower() if lowercase else word
                return w.endswith(query)
        elif search_type == 'contains':
            def matches(word: str) -> bool:
                w = word.lower() if lowercase else word
                return query in w
        elif search_type == 'regex' or use_regex:
            try:
                pattern = re.compile(query, re.IGNORECASE if lowercase else 0)
                def matches(word: str) -> bool:
                    return bool(pattern.search(word))
            except re.error:
                return {'success': False, 'error': 'Invalid regex pattern'}
        elif search_type == 'wordlist':
            words = set(w.strip().lower() if lowercase else w.strip() 
                       for w in query.split('\n') if w.strip())
            def matches(word: str) -> bool:
                w = word.lower() if lowercase else word
                return w in words
        else:
            def matches(word: str) -> bool:
                return True
        
        # Extract and filter relations
        matching_results = []
        
        for spacy_data in corpus_spacy_data:
            tokens = spacy_data.get('tokens', [])
            
            for idx, token in enumerate(tokens):
                lemma = token.get('lemma', '').lower() if lowercase else token.get('lemma', '')
                text = token.get('text', '').lower() if lowercase else token.get('text', '')
                
                if not matches(lemma) and not matches(text):
                    continue
                
                # Apply POS filter
                if pos_filter and pos_filter != 'auto':
                    token_pos = token.get('pos', '')
                    pos_map = {'verb': 'VERB', 'noun': 'NOUN', 'adjective': 'ADJ', 
                              'adverb': 'ADV', 'pronoun': 'PRON'}
                    if token_pos != pos_map.get(pos_filter.lower(), pos_filter.upper()):
                        continue
                
                # Apply exclusion
                if exclude_words:
                    excluded = set(w.lower() for w in exclude_words)
                    if lemma in excluded or text in excluded:
                        continue
                
                matching_results.append({
                    'word': token.get('text', ''),
                    'lemma': token.get('lemma', ''),
                    'pos': token.get('pos', ''),
                    'index': idx
                })
        
        # Aggregate by lemma
        lemma_counts = defaultdict(lambda: {'count': 0, 'pos': '', 'forms': set()})
        for r in matching_results:
            key = r['lemma'].lower()
            lemma_counts[key]['count'] += 1
            lemma_counts[key]['pos'] = r['pos']
            lemma_counts[key]['forms'].add(r['word'])
        
        # Filter by frequency
        results = []
        for lemma, data in lemma_counts.items():
            if data['count'] < min_frequency:
                continue
            if max_frequency and data['count'] > max_frequency:
                continue
            
            results.append({
                'lemma': lemma,
                'pos': data['pos'],
                'frequency': data['count'],
                'forms': list(data['forms'])
            })
        
        # Sort by frequency
        results.sort(key=lambda x: x['frequency'], reverse=True)
        
        return {
            'success': True,
            'query': query,
            'search_type': search_type,
            'total_matches': len(results),
            'results': results
        }


# Singleton instance
_sketch_service: Optional[SketchService] = None


def get_sketch_service() -> SketchService:
    """Get Sketch Service singleton"""
    global _sketch_service
    if _sketch_service is None:
        _sketch_service = SketchService()
    return _sketch_service


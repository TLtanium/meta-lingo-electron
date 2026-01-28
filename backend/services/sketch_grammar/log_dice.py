"""
logDice Score Calculation
Implements the logDice association measure used by Sketch Engine

logDice is based on the Dice coefficient and is designed to:
- Be stable across different corpus sizes
- Have a theoretical maximum of 14
- Balance relative and absolute frequencies

Formula: Score = 14 + log2(2 * f(w1,R,w2) / (f(w1,R,*) + f(*,R,w2)))

Where:
- f(w1,R,w2) = frequency of word1 and word2 in relation R
- f(w1,R,*) = frequency of word1 in relation R with any word
- f(*,R,w2) = frequency of any word in relation R with word2
"""

import math
import logging
from typing import Dict, List, Any, Tuple, Optional
from dataclasses import dataclass, field
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class CollocationScore:
    """Stores collocation with its logDice score"""
    word1: str
    word1_lemma: str
    word1_pos: str
    relation: str
    word2: str
    word2_lemma: str
    word2_pos: str
    frequency: int
    log_dice: float
    positions: List[Tuple[int, int, int]] = field(default_factory=list)


def calculate_log_dice(
    joint_frequency: int,
    word1_marginal: int,
    word2_marginal: int
) -> float:
    """
    Calculate logDice score for a word pair
    
    Args:
        joint_frequency: f(w1,R,w2) - co-occurrence frequency
        word1_marginal: f(w1,R,*) - frequency of word1 in this relation
        word2_marginal: f(*,R,w2) - frequency of word2 in this relation
        
    Returns:
        logDice score (theoretical max = 14, higher = stronger association)
    """
    if joint_frequency == 0:
        return 0.0
    
    denominator = word1_marginal + word2_marginal
    if denominator == 0:
        return 0.0
    
    # Dice coefficient: 2 * |A ∩ B| / (|A| + |B|)
    dice = (2.0 * joint_frequency) / denominator
    
    # logDice: 14 + log2(dice)
    # We add 14 so typical values are positive and easy to interpret
    if dice > 0:
        log_dice = 14.0 + math.log2(dice)
    else:
        log_dice = 0.0
    
    return round(log_dice, 3)


def calculate_batch_log_dice(
    relation_data: Dict[str, List[Dict[str, Any]]],
    min_frequency: int = 2,
    min_score: float = 0.0
) -> Dict[str, List[CollocationScore]]:
    """
    Calculate logDice scores for all collocations in relation data
    
    Args:
        relation_data: Dict mapping relation names to lists of collocation dicts
                      Each dict should have: word1_lemma, word2_lemma, frequency, etc.
        min_frequency: Minimum frequency threshold
        min_score: Minimum logDice score threshold
        
    Returns:
        Dict mapping relation names to lists of CollocationScore sorted by score
    """
    results: Dict[str, List[CollocationScore]] = {}
    
    for relation_name, collocations in relation_data.items():
        if not collocations:
            continue
        
        # Calculate marginal frequencies for this relation
        word1_frequencies: Dict[str, int] = defaultdict(int)
        word2_frequencies: Dict[str, int] = defaultdict(int)
        
        for coll in collocations:
            w1 = coll.get('word1_lemma', '')
            w2 = coll.get('word2_lemma', '')
            freq = coll.get('frequency', 0)
            
            word1_frequencies[w1] += freq
            word2_frequencies[w2] += freq
        
        # Calculate logDice for each collocation
        scored_collocations: List[CollocationScore] = []
        
        for coll in collocations:
            w1 = coll.get('word1_lemma', '')
            w2 = coll.get('word2_lemma', '')
            freq = coll.get('frequency', 0)
            
            if freq < min_frequency:
                continue
            
            # Get marginal frequencies
            w1_marginal = word1_frequencies[w1]
            w2_marginal = word2_frequencies[w2]
            
            # Calculate score
            score = calculate_log_dice(freq, w1_marginal, w2_marginal)
            
            if score < min_score:
                continue
            
            scored_coll = CollocationScore(
                word1=coll.get('word1', w1),
                word1_lemma=w1,
                word1_pos=coll.get('word1_pos', ''),
                relation=relation_name,
                word2=coll.get('word2', w2),
                word2_lemma=w2,
                word2_pos=coll.get('word2_pos', ''),
                frequency=freq,
                log_dice=score,
                positions=coll.get('instances', [])
            )
            scored_collocations.append(scored_coll)
        
        # Sort by logDice score
        scored_collocations.sort(key=lambda x: x.log_dice, reverse=True)
        results[relation_name] = scored_collocations
    
    return results


def calculate_sketch_scores(
    word: str,
    word_pos: str,
    aggregated_relations: Dict[str, List[Any]],
    global_frequencies: Optional[Dict[str, Dict[str, int]]] = None
) -> Dict[str, List[CollocationScore]]:
    """
    Calculate logDice scores for a word's sketch
    
    Args:
        word: Target word
        word_pos: POS of target word
        aggregated_relations: Aggregated relation data from SketchGrammarEngine
        global_frequencies: Optional pre-computed global frequencies for better scoring
        
    Returns:
        Dict mapping relation names to scored collocations
    """
    results: Dict[str, List[CollocationScore]] = {}
    
    for relation_name, freq_list in aggregated_relations.items():
        # Convert RelationFrequency objects to dicts for batch processing
        coll_dicts = []
        for freq_obj in freq_list:
            coll_dicts.append({
                'word1': word,
                'word1_lemma': freq_obj.word1_lemma,
                'word1_pos': freq_obj.word1_pos,
                'word2': '',  # Will use lemma
                'word2_lemma': freq_obj.word2_lemma,
                'word2_pos': freq_obj.word2_pos,
                'frequency': freq_obj.frequency,
                'instances': freq_obj.instances
            })
        
        if coll_dicts:
            scored = calculate_batch_log_dice({relation_name: coll_dicts})
            if relation_name in scored:
                results[relation_name] = scored[relation_name]
    
    return results


def compare_sketches(
    sketch1: Dict[str, List[CollocationScore]],
    sketch2: Dict[str, List[CollocationScore]],
    word1: str,
    word2: str
) -> Dict[str, Dict[str, List[CollocationScore]]]:
    """
    Compare two word sketches to find shared and unique collocations
    
    Args:
        sketch1: Word sketch for word1
        sketch2: Word sketch for word2
        word1: First word
        word2: Second word
        
    Returns:
        Dict with keys for each relation, containing:
        - 'shared': Collocations shared by both words
        - 'word1_only': Collocations unique to word1
        - 'word2_only': Collocations unique to word2
    """
    results: Dict[str, Dict[str, List[CollocationScore]]] = {}
    
    # Get all relation names from both sketches
    all_relations = set(sketch1.keys()) | set(sketch2.keys())
    
    for relation in all_relations:
        colls1 = sketch1.get(relation, [])
        colls2 = sketch2.get(relation, [])
        
        # Build lookup sets by collocate lemma
        lemmas1 = {c.word2_lemma for c in colls1}
        lemmas2 = {c.word2_lemma for c in colls2}
        
        shared_lemmas = lemmas1 & lemmas2
        word1_only_lemmas = lemmas1 - lemmas2
        word2_only_lemmas = lemmas2 - lemmas1
        
        # Categorize collocations
        shared = []
        word1_only = []
        word2_only = []
        
        # Process word1 collocations
        for coll in colls1:
            if coll.word2_lemma in shared_lemmas:
                # Find corresponding collocation in sketch2
                for coll2 in colls2:
                    if coll2.word2_lemma == coll.word2_lemma:
                        # Create merged collocation with both frequencies
                        merged = CollocationScore(
                            word1=f"{word1}/{word2}",
                            word1_lemma=coll.word2_lemma,  # Use collocate as main
                            word1_pos=coll.word2_pos,
                            relation=relation,
                            word2=coll.word2,
                            word2_lemma=coll.word2_lemma,
                            word2_pos=coll.word2_pos,
                            frequency=coll.frequency,  # word1's frequency
                            log_dice=coll.log_dice,
                            positions=coll.positions
                        )
                        # Store both frequencies as custom attributes
                        merged.__dict__['freq1'] = coll.frequency
                        merged.__dict__['freq2'] = coll2.frequency
                        merged.__dict__['score1'] = coll.log_dice
                        merged.__dict__['score2'] = coll2.log_dice
                        shared.append(merged)
                        break
            elif coll.word2_lemma in word1_only_lemmas:
                word1_only.append(coll)
        
        # Process word2 unique collocations
        for coll in colls2:
            if coll.word2_lemma in word2_only_lemmas:
                word2_only.append(coll)
        
        # Sort by frequency/score
        shared.sort(key=lambda x: x.frequency, reverse=True)
        word1_only.sort(key=lambda x: x.log_dice, reverse=True)
        word2_only.sort(key=lambda x: x.log_dice, reverse=True)
        
        results[relation] = {
            'shared': shared,
            'word1_only': word1_only,
            'word2_only': word2_only
        }
    
    return results


# Additional statistical measures for reference

def calculate_mi(
    joint_frequency: int,
    word1_frequency: int,
    word2_frequency: int,
    corpus_size: int
) -> float:
    """
    Calculate Mutual Information score
    
    MI = log2(f(w1,w2) * N / (f(w1) * f(w2)))
    """
    if joint_frequency == 0 or word1_frequency == 0 or word2_frequency == 0:
        return 0.0
    
    expected = (word1_frequency * word2_frequency) / corpus_size
    if expected == 0:
        return 0.0
    
    return math.log2(joint_frequency / expected)


def calculate_t_score(
    joint_frequency: int,
    word1_frequency: int,
    word2_frequency: int,
    corpus_size: int
) -> float:
    """
    Calculate T-score
    
    T = (f(w1,w2) - expected) / sqrt(f(w1,w2))
    """
    if joint_frequency == 0:
        return 0.0
    
    expected = (word1_frequency * word2_frequency) / corpus_size
    return (joint_frequency - expected) / math.sqrt(joint_frequency)


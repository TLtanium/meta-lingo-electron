"""
SpaCy Text Chunking Service
Handles chunking of long texts for SpaCy annotation with proper index adjustment
"""

import logging
import re
import json
import time
from typing import Dict, List, Any, Tuple, Optional

logger = logging.getLogger(__name__)

# Configuration constants
# 100k characters per chunk for more frequent progress updates and better memory management
# This reduces the time between progress updates and prevents timeout issues
DEFAULT_CHUNK_SIZE = 100000  # 100k characters for faster progress updates
MAX_CHUNK_SIZE = 500000  # 500k characters max (lowered from 2M)
MIN_CHUNK_SIZE = 50000  # 50k minimum chunk size


def find_sentence_boundaries(text: str, start_pos: int = 0) -> List[int]:
    """
    Find sentence boundary positions in text.
    Uses simple heuristics: sentence-ending punctuation followed by space and uppercase.
    
    Args:
        text: Text to analyze
        start_pos: Starting position offset (for chunked text)
        
    Returns:
        List of character positions where sentences end (inclusive of punctuation)
    """
    boundaries = []
    
    # Pattern for sentence-ending punctuation
    pattern = re.compile(r'[.!?]+')
    
    for match in pattern.finditer(text):
        pos = match.end() - 1  # Position of the punctuation
        
        # Check if followed by space and uppercase (or end of text)
        after_pos = match.end()
        if after_pos < len(text):
            # Skip whitespace
            while after_pos < len(text) and text[after_pos] in ' \t\n\r':
                after_pos += 1
            
            # If at end of text or next char is uppercase, it's a boundary
            if after_pos >= len(text) or text[after_pos].isupper():
                boundaries.append(pos + 1)  # Include punctuation in boundary
    
    # Always include end of text as a boundary
    if len(text) > 0:
        boundaries.append(len(text))
    
    return boundaries


def find_safe_chunk_boundary(text: str, target_pos: int, chunk_size: int) -> int:
    """
    Find a safe position to split text, preferably at a sentence boundary.
    
    Args:
        text: Full text
        target_pos: Target split position (chunk_size from start)
        chunk_size: Desired chunk size
        
    Returns:
        Safe split position (at sentence boundary if possible, otherwise at word boundary)
    """
    # #region agent log
    start_time = time.time()
    # #endregion
    
    text_len = len(text)
    
    # If target position is near end of text, just return end
    if target_pos >= text_len - 100:
        return text_len
    
    # Look for sentence boundaries near target position
    # Search window: ±20% of chunk size
    search_window = max(1000, chunk_size // 5)
    search_start = max(0, target_pos - search_window)
    search_end = min(text_len, target_pos + search_window)
    
    search_text = text[search_start:search_end]
    boundaries = find_sentence_boundaries(search_text, search_start)
    
    # Find the boundary closest to target_pos
    best_boundary = target_pos
    min_distance = abs(target_pos - best_boundary)
    
    for boundary in boundaries:
        if search_start <= boundary <= search_end:
            distance = abs(target_pos - boundary)
            if distance < min_distance:
                min_distance = distance
                best_boundary = boundary
    
    # If no good sentence boundary found, try word boundary
    if min_distance > search_window:
        # Find nearest space or newline
        for i in range(target_pos, min(text_len, target_pos + 1000)):
            if text[i] in ' \t\n\r':
                best_boundary = i + 1
                break
        else:
            # Fallback: just use target position
            best_boundary = target_pos
    
    return best_boundary


def chunk_text(text: str, chunk_size: int = DEFAULT_CHUNK_SIZE) -> List[Tuple[int, int, str]]:
    """
    Split text into chunks, trying to preserve sentence boundaries.
    
    Args:
        text: Text to chunk
        chunk_size: Target size for each chunk (in characters)
        
    Returns:
        List of tuples: (start_pos, end_pos, chunk_text)
        Positions are relative to the original text
    """
    text_len = len(text)
    
    # If text is small enough, return as single chunk
    if text_len <= chunk_size:
        return [(0, text_len, text)]
    
    chunks = []
    current_pos = 0
    
    while current_pos < text_len:
        # Calculate target end position
        target_end = min(current_pos + chunk_size, text_len)
        
        # Find safe boundary
        safe_end = find_safe_chunk_boundary(text, target_end, chunk_size)
        
        # Extract chunk
        chunk_text_segment = text[current_pos:safe_end]
        chunks.append((current_pos, safe_end, chunk_text_segment))
        
        # Move to next chunk
        current_pos = safe_end
        
        # Avoid infinite loop
        if safe_end == current_pos:
            # Force advance if no progress
            current_pos = min(current_pos + chunk_size, text_len)
    
    logger.info(f"Split text into {len(chunks)} chunks: {[f'{end-start:,} chars' for start, end, _ in chunks]}")
    return chunks


def adjust_token_indices(tokens: List[Dict[str, Any]], offset: int) -> List[Dict[str, Any]]:
    """
    Adjust token indices by adding offset.
    
    Args:
        tokens: List of token dictionaries
        offset: Character offset to add
        
    Returns:
        List of tokens with adjusted indices
    """
    adjusted = []
    for token in tokens:
        adjusted_token = token.copy()
        adjusted_token['start'] = token['start'] + offset
        adjusted_token['end'] = token['end'] + offset
        adjusted.append(adjusted_token)
    return adjusted


def adjust_entity_indices(entities: List[Dict[str, Any]], offset: int) -> List[Dict[str, Any]]:
    """
    Adjust entity indices by adding offset.
    
    Args:
        entities: List of entity dictionaries
        offset: Character offset to add
        
    Returns:
        List of entities with adjusted indices
    """
    adjusted = []
    for entity in entities:
        adjusted_entity = entity.copy()
        adjusted_entity['start'] = entity['start'] + offset
        adjusted_entity['end'] = entity['end'] + offset
        adjusted.append(adjusted_entity)
    return adjusted


def adjust_sentence_indices(sentences: List[Dict[str, Any]], offset: int) -> List[Dict[str, Any]]:
    """
    Adjust sentence indices by adding offset.
    
    Args:
        sentences: List of sentence dictionaries
        offset: Character offset to add
        
    Returns:
        List of sentences with adjusted indices
    """
    adjusted = []
    for sentence in sentences:
        adjusted_sentence = sentence.copy()
        adjusted_sentence['start'] = sentence['start'] + offset
        adjusted_sentence['end'] = sentence['end'] + offset
        # Re-extract text from original positions (will be done in merge)
        adjusted.append(adjusted_sentence)
    return adjusted


def merge_annotations(
    chunk_results: List[Dict[str, Any]],
    chunk_boundaries: List[Tuple[int, int]],
    original_text: str
) -> Dict[str, Any]:
    """
    Merge annotation results from multiple chunks, adjusting indices.
    
    Args:
        chunk_results: List of annotation results from each chunk
        chunk_boundaries: List of (start, end) tuples for each chunk
        original_text: Original full text (for sentence text extraction)
        
    Returns:
        Merged annotation result
    """
    # #region agent log
    merge_start = time.time()
    total_tokens = sum(len(r.get("tokens", [])) for r in chunk_results if r.get("success"))
    total_entities = sum(len(r.get("entities", [])) for r in chunk_results if r.get("success"))
    total_sentences = sum(len(r.get("sentences", [])) for r in chunk_results if r.get("success"))
    # #endregion
    
    if not chunk_results:
        return {
            "success": False,
            "tokens": [],
            "entities": [],
            "sentences": [],
            "error": "No chunk results to merge"
        }
    
    # Check if all chunks succeeded
    failed_chunks = [i for i, result in enumerate(chunk_results) if not result.get("success")]
    if failed_chunks:
        logger.warning(f"Some chunks failed: {failed_chunks}")
    
    # Merge tokens
    # #region agent log
    token_start = time.time()
    # #endregion
    all_tokens = []
    for i, (result, (chunk_start, chunk_end)) in enumerate(zip(chunk_results, chunk_boundaries)):
        if result.get("success"):
            tokens = result.get("tokens", [])
            adjusted_tokens = adjust_token_indices(tokens, chunk_start)
            all_tokens.extend(adjusted_tokens)
    
    # Merge entities
    all_entities = []
    for i, (result, (chunk_start, chunk_end)) in enumerate(zip(chunk_results, chunk_boundaries)):
        if result.get("success"):
            entities = result.get("entities", [])
            adjusted_entities = adjust_entity_indices(entities, chunk_start)
            all_entities.extend(adjusted_entities)
    
    # Merge sentences
    all_sentences = []
    for i, (result, (chunk_start, chunk_end)) in enumerate(zip(chunk_results, chunk_boundaries)):
        if result.get("success"):
            sentences = result.get("sentences", [])
            adjusted_sentences = adjust_sentence_indices(sentences, chunk_start)
            
            # Re-extract sentence text from original text
            for sent in adjusted_sentences:
                sent_start = sent['start']
                sent_end = sent['end']
                if sent_start < len(original_text) and sent_end <= len(original_text):
                    sent['text'] = original_text[sent_start:sent_end]
            
            all_sentences.extend(adjusted_sentences)
    
    # Sort by start position to ensure order
    all_tokens.sort(key=lambda x: x['start'])
    all_entities.sort(key=lambda x: x['start'])
    all_sentences.sort(key=lambda x: x['start'])
    
    # Build merged result
    merged_result = {
        "success": len(failed_chunks) == 0 or len(failed_chunks) < len(chunk_results),
        "tokens": all_tokens,
        "entities": all_entities,
        "sentences": all_sentences,
        "error": None,
        "chunk_info": {
            "total_chunks": len(chunk_results),
            "successful_chunks": len(chunk_results) - len(failed_chunks),
            "failed_chunks": failed_chunks
        }
    }
    
    if failed_chunks:
        merged_result["error"] = f"Some chunks failed: {failed_chunks}"
        merged_result["warning"] = f"Processed {len(chunk_results) - len(failed_chunks)}/{len(chunk_results)} chunks successfully"
    
    logger.info(f"Merged {len(chunk_results)} chunks: {len(all_tokens)} tokens, {len(all_entities)} entities, {len(all_sentences)} sentences")
    
    return merged_result

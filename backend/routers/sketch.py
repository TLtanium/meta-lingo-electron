"""
Word Sketch API Router
Provides endpoints for Word Sketch and Sketch Difference functionality
"""

import logging
import json
import os
from pathlib import Path
from typing import List, Optional, Union
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.sketch_grammar import (
    get_sketch_service,
    POS_OPTIONS
)
from models.database import CorpusDB, TextDB

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sketch", tags=["sketch"])


# ============================================================================
# Request/Response Models
# ============================================================================

class WordSketchRequest(BaseModel):
    """Request model for generating a Word Sketch"""
    corpus_id: str
    text_ids: Union[str, List[str]] = "all"  # "all" or list of text IDs
    word: str
    pos: str = "auto"  # auto, verb, noun, adjective, adverb, pronoun
    min_frequency: int = Field(default=2, ge=1)
    min_score: float = Field(default=0.0, ge=0.0)  # minimum logDice score
    max_results: int = Field(default=12, ge=1, le=200)


class SketchDifferenceRequest(BaseModel):
    """Request model for generating a Sketch Difference"""
    corpus_id: str
    text_ids: Union[str, List[str]] = "all"
    word1: str
    word2: str
    pos: str = "auto"
    min_frequency: int = Field(default=2, ge=1)
    compare_mode: str = "lemmas"  # "lemmas" or "word_form"


class LemmaFormsRequest(BaseModel):
    """Request model for getting word forms of a lemma in the corpus"""
    corpus_id: str
    text_ids: Union[str, List[str]] = "all"
    lemma: str


class SearchCollocationsRequest(BaseModel):
    """Request model for searching collocations"""
    corpus_id: str
    text_ids: Union[str, List[str]] = "all"
    query: str
    search_type: str = "contains"  # exact, starts, ends, contains, regex, wordlist
    pos_filter: Optional[str] = None
    min_frequency: int = Field(default=1, ge=1)
    max_frequency: Optional[int] = None
    exclude_words: Optional[List[str]] = None
    lowercase: bool = True


class AnnotateCorpusRequest(BaseModel):
    """Request model for annotating corpus with sketch data"""
    corpus_id: str
    text_ids: Union[str, List[str]] = "all"
    min_frequency: int = Field(default=1, ge=1)


# ============================================================================
# Helper Functions
# ============================================================================

def _spacy_data_to_flat_tokens(spacy_data: dict) -> Optional[list]:
    """
    Normalize SpaCy data to a single list of tokens for the sketch engine.
    Handles: (1) top-level 'tokens'; (2) transcript segment format { segments: { id: { tokens } } }.
    Returns the token list or None if empty.
    """
    if not spacy_data:
        return None
    if spacy_data.get('tokens'):
        return spacy_data['tokens']
    if spacy_data.get('segments'):
        tokens = []
        for _seg_id, seg_data in spacy_data['segments'].items():
            if isinstance(seg_data, dict) and seg_data.get('tokens'):
                tokens.extend(seg_data['tokens'])
        return tokens if tokens else None
    return None


async def get_corpus_spacy_data(corpus_id: str, text_ids: Union[str, List[str]]) -> tuple:
    """
    Load SpaCy annotation data for specified texts in a corpus.
    Converts transcript segment-based format to flat tokens so the sketch engine can use it.
    
    Returns:
        Tuple of (spacy_data_list, text_id_list)
    """
    # Get corpus
    corpus = CorpusDB.get_by_id(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail=f"Corpus not found: {corpus_id}")
    
    # Get texts
    if text_ids == "all":
        texts = TextDB.list_by_corpus(corpus_id)
    else:
        texts = []
        all_texts = TextDB.list_by_corpus(corpus_id)
        text_id_set = set(text_ids) if isinstance(text_ids, list) else {text_ids}
        for t in all_texts:
            if t['id'] in text_id_set:
                texts.append(t)
    
    if not texts:
        raise HTTPException(status_code=404, detail="No texts found in corpus")
    
    # Load SpaCy data for each text
    spacy_data_list = []
    text_id_list = []
    
    for text in texts:
        try:
            text_id = text['id']
            media_type = text.get('media_type', 'text')
            
            spacy_data = None
            
            # For audio/video, prioritize transcript JSON with segment-based annotations
            if media_type in ['audio', 'video']:
                transcript_json = text.get('transcript_json_path')
                if transcript_json and os.path.exists(transcript_json):
                    try:
                        with open(transcript_json, 'r', encoding='utf-8') as f:
                            transcript_data = json.load(f)
                        if 'spacy_annotations' in transcript_data:
                            spacy_data = transcript_data['spacy_annotations']
                    except Exception as e:
                        logger.warning(f"Failed to load transcript SpaCy for {text_id}: {e}")
            
            # For plain text or fallback, use .spacy.json file
            if not spacy_data:
                content_path = text.get('content_path')
                if content_path:
                    content_path = Path(content_path)
                    spacy_path = content_path.parent / f"{content_path.stem}.spacy.json"
                    
                    if spacy_path.exists():
                        try:
                            with open(spacy_path, 'r', encoding='utf-8') as f:
                                spacy_data = json.load(f)
                        except Exception as e:
                            logger.warning(f"Failed to load SpaCy file for {text_id}: {e}")
            
            # Normalize: sketch engine expects each item to have top-level 'tokens'
            tokens = _spacy_data_to_flat_tokens(spacy_data) if spacy_data else None
            if tokens:
                spacy_data_list.append({'tokens': tokens})
                text_id_list.append(text_id)
                
        except Exception as e:
            logger.warning(f"Failed to load SpaCy data for text {text.get('id', 'unknown')}: {e}")
            continue
    
    if not spacy_data_list:
        raise HTTPException(
            status_code=400, 
            detail="No SpaCy annotation data available. Please annotate the corpus first."
        )
    
    return spacy_data_list, text_id_list


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/word-sketch")
async def generate_word_sketch(request: WordSketchRequest):
    """
    Generate a Word Sketch for a specific word
    
    Returns grammatical relations and collocations with logDice scores
    """
    try:
        # Load SpaCy data
        spacy_data_list, text_id_list = await get_corpus_spacy_data(
            request.corpus_id, request.text_ids
        )
        
        # Generate sketch
        sketch_service = get_sketch_service()
        result = sketch_service.generate_word_sketch(
            word=request.word,
            pos=request.pos,
            corpus_spacy_data=spacy_data_list,
            min_frequency=request.min_frequency,
            min_score=request.min_score,
            max_results_per_relation=request.max_results
        )
        
        return {
            "success": True,
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Word Sketch generation failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/difference")
async def generate_sketch_difference(request: SketchDifferenceRequest):
    """
    Generate a Sketch Difference comparing two words
    
    Shows shared and unique collocations for each word
    """
    try:
        # Load SpaCy data
        spacy_data_list, text_id_list = await get_corpus_spacy_data(
            request.corpus_id, request.text_ids
        )
        
        # Generate difference
        sketch_service = get_sketch_service()
        result = sketch_service.generate_sketch_difference(
            word1=request.word1,
            word2=request.word2,
            pos=request.pos,
            corpus_spacy_data=spacy_data_list,
            min_frequency=request.min_frequency,
            compare_mode=request.compare_mode
        )
        
        return {
            "success": True,
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sketch Difference generation failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/lemma-forms")
async def get_lemma_forms(request: LemmaFormsRequest):
    """
    Return all distinct word forms for a given lemma in the selected corpus.
    Used by Word Sketch Difference lemma mode: user enters a lemma, then
    selects two different word forms from dropdowns. If the input is not
    a lemma present in the corpus (e.g. "goes"), returns empty list.
    """
    try:
        spacy_data_list, _ = await get_corpus_spacy_data(
            request.corpus_id, request.text_ids
        )
        sketch_service = get_sketch_service()
        forms = sketch_service.get_lemma_forms(
            lemma=request.lemma,
            corpus_spacy_data=spacy_data_list
        )
        return {"success": True, "forms": forms}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lemma forms failed: {e}")
        return {"success": False, "forms": [], "error": str(e)}


@router.post("/search")
async def search_collocations(request: SearchCollocationsRequest):
    """
    Search for words/collocations in the corpus matching specific criteria
    """
    try:
        # Load SpaCy data
        spacy_data_list, text_id_list = await get_corpus_spacy_data(
            request.corpus_id, request.text_ids
        )
        
        # Search
        sketch_service = get_sketch_service()
        result = sketch_service.search_collocations(
            query=request.query,
            corpus_spacy_data=spacy_data_list,
            search_type=request.search_type,
            pos_filter=request.pos_filter,
            min_frequency=request.min_frequency,
            max_frequency=request.max_frequency,
            exclude_words=request.exclude_words,
            lowercase=request.lowercase
        )
        
        return {
            "success": True,
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Collocation search failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/annotate")
async def annotate_corpus(request: AnnotateCorpusRequest):
    """
    Pre-compute sketch data for a corpus
    
    This creates an index that speeds up subsequent Word Sketch queries
    """
    try:
        # Load SpaCy data
        spacy_data_list, text_id_list = await get_corpus_spacy_data(
            request.corpus_id, request.text_ids
        )
        
        # Annotate
        sketch_service = get_sketch_service()
        result = sketch_service.annotate_corpus_sketch(
            corpus_spacy_data=spacy_data_list,
            text_ids=text_id_list,
            min_frequency=request.min_frequency
        )
        
        return {
            "success": True,
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Corpus annotation failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/pos-options")
async def get_pos_options():
    """
    Get available POS filter options for Word Sketch
    """
    return {
        "success": True,
        "data": POS_OPTIONS
    }


@router.get("/relations")
async def get_relation_types():
    """
    Get all available grammatical relation types
    """
    from services.sketch_grammar.grammar_patterns import ALL_RELATIONS
    
    relations = []
    for pattern in ALL_RELATIONS:
        relations.append({
            "name": pattern.name,
            "display_en": pattern.display_en,
            "display_zh": pattern.display_zh,
            "description": pattern.description,
            "center_pos": pattern.center_pos
        })
    
    return {
        "success": True,
        "data": relations
    }


"""
Preprocessing API Router
Full text preprocessing with multi-language support
"""

import os
import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.preprocess import (
    TextPreprocessor, 
    PreprocessConfig as ServicePreprocessConfig,
    preprocess_single,
    quick_preprocess
)
from services.corpus_service import get_corpus_service
from models.database import TextDB

router = APIRouter()


# ==================== Request/Response Models ====================

class PreprocessConfigRequest(BaseModel):
    """Preprocessing configuration request"""
    normalize_text: bool = True
    remove_punctuation: bool = True
    to_lowercase: bool = True
    remove_stopwords: bool = True
    stopwords_language: str = "english"
    tokenize: bool = True
    extract_entities: bool = False
    custom_stopwords: Optional[List[str]] = None
    advanced_patterns: Optional[List[str]] = None


class PreprocessTextRequest(BaseModel):
    """Preprocess single text request"""
    text: str
    config: PreprocessConfigRequest = PreprocessConfigRequest()


class PreprocessCorpusRequest(BaseModel):
    """Preprocess corpus request"""
    corpus_id: str
    text_ids: Optional[List[str]] = None  # If None, process all
    config: PreprocessConfigRequest = PreprocessConfigRequest()
    save_results: bool = True


class PreprocessPreviewRequest(BaseModel):
    """Preview preprocessing on sample text"""
    text: str
    config: PreprocessConfigRequest = PreprocessConfigRequest()


# ==================== API Endpoints ====================

@router.post("/text")
async def preprocess_text(data: PreprocessTextRequest):
    """
    Preprocess a single text
    
    Returns processed text, tokens, and optional entities
    """
    config = ServicePreprocessConfig(
        normalize_text=data.config.normalize_text,
        remove_punctuation=data.config.remove_punctuation,
        to_lowercase=data.config.to_lowercase,
        remove_stopwords=data.config.remove_stopwords,
        stopwords_language=data.config.stopwords_language,
        tokenize=data.config.tokenize,
        extract_entities=data.config.extract_entities,
        custom_stopwords=data.config.custom_stopwords or [],
        advanced_patterns=data.config.advanced_patterns or []
    )
    
    result = preprocess_single(data.text, config)
    
    return {
        "success": True,
        "data": {
            "original_text": result.original_text,
            "processed_text": result.processed_text,
            "tokens": result.tokens,
            "word_count": result.word_count,
            "entities": [
                {"text": e.text, "label": e.label, "start": e.start, "end": e.end}
                for e in (result.entities or [])
            ]
        }
    }


@router.post("/preview")
async def preview_preprocessing(data: PreprocessPreviewRequest):
    """
    Preview preprocessing result on sample text
    Good for testing configuration before batch processing
    """
    config = ServicePreprocessConfig(
        normalize_text=data.config.normalize_text,
        remove_punctuation=data.config.remove_punctuation,
        to_lowercase=data.config.to_lowercase,
        remove_stopwords=data.config.remove_stopwords,
        stopwords_language=data.config.stopwords_language,
        tokenize=data.config.tokenize,
        extract_entities=data.config.extract_entities,
        custom_stopwords=data.config.custom_stopwords or [],
        advanced_patterns=data.config.advanced_patterns or []
    )
    
    result = preprocess_single(data.text, config)
    
    # Calculate statistics
    original_words = len(data.text.split())
    processed_words = result.word_count
    reduction_rate = round((1 - processed_words / original_words) * 100, 2) if original_words > 0 else 0
    
    return {
        "success": True,
        "data": {
            "original_text": result.original_text[:500] + "..." if len(result.original_text) > 500 else result.original_text,
            "processed_text": result.processed_text[:500] + "..." if len(result.processed_text) > 500 else result.processed_text,
            "tokens_sample": result.tokens[:50],
            "statistics": {
                "original_chars": len(result.original_text),
                "processed_chars": len(result.processed_text),
                "original_words": original_words,
                "processed_words": processed_words,
                "token_count": len(result.tokens),
                "reduction_rate": reduction_rate
            }
        }
    }


@router.post("/corpus")
async def preprocess_corpus(data: PreprocessCorpusRequest):
    """
    Preprocess texts in a corpus
    
    Can process all texts or specific ones by ID
    Optionally saves results to preprocessed/ directory
    """
    service = get_corpus_service()
    corpus = service.get_corpus(data.corpus_id)
    
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    # Get texts to process
    all_texts = service.list_texts(data.corpus_id)
    
    if data.text_ids:
        texts_to_process = [t for t in all_texts if t['id'] in data.text_ids]
    else:
        texts_to_process = all_texts
    
    if not texts_to_process:
        raise HTTPException(status_code=400, detail="No texts to process")
    
    config = ServicePreprocessConfig(
        normalize_text=data.config.normalize_text,
        remove_punctuation=data.config.remove_punctuation,
        to_lowercase=data.config.to_lowercase,
        remove_stopwords=data.config.remove_stopwords,
        stopwords_language=data.config.stopwords_language,
        tokenize=data.config.tokenize,
        extract_entities=data.config.extract_entities,
        custom_stopwords=data.config.custom_stopwords or [],
        advanced_patterns=data.config.advanced_patterns or []
    )
    
    preprocessor = TextPreprocessor(config)
    
    results = []
    success_count = 0
    
    # Determine preprocessed directory
    corpus_dir = Path(os.path.join(
        os.path.dirname(__file__), 
        "..", "..", "data", "corpora", corpus['name']
    ))
    preprocessed_dir = corpus_dir / "preprocessed"
    preprocessed_dir.mkdir(exist_ok=True)
    
    for text_entry in texts_to_process:
        text_id = text_entry['id']
        content_path = text_entry.get('content_path') or text_entry.get('transcript_path')
        
        if not content_path or not os.path.exists(content_path):
            results.append({
                "text_id": text_id,
                "filename": text_entry.get('filename'),
                "success": False,
                "error": "Content file not found"
            })
            continue
        
        try:
            # Read content
            with open(content_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Preprocess
            result = preprocessor.process(content)
            
            # Save if requested
            save_path = None
            if data.save_results:
                filename = Path(text_entry['filename']).stem
                save_path = preprocessed_dir / f"{filename}_preprocessed.txt"
                
                with open(save_path, 'w', encoding='utf-8') as f:
                    f.write(result.processed_text)
                
                # Also save tokens as JSON
                tokens_path = preprocessed_dir / f"{filename}_tokens.json"
                with open(tokens_path, 'w', encoding='utf-8') as f:
                    json.dump({
                        "tokens": result.tokens,
                        "word_count": result.word_count,
                        "config": {
                            "language": data.config.stopwords_language,
                            "lowercase": data.config.to_lowercase,
                            "remove_stopwords": data.config.remove_stopwords
                        }
                    }, f, ensure_ascii=False, indent=2)
            
            results.append({
                "text_id": text_id,
                "filename": text_entry.get('filename'),
                "success": True,
                "word_count": result.word_count,
                "token_count": len(result.tokens),
                "save_path": str(save_path) if save_path else None
            })
            success_count += 1
            
        except Exception as e:
            results.append({
                "text_id": text_id,
                "filename": text_entry.get('filename'),
                "success": False,
                "error": str(e)
            })
    
    return {
        "success": True,
        "data": {
            "total": len(texts_to_process),
            "success": success_count,
            "failed": len(texts_to_process) - success_count,
            "results": results
        },
        "message": f"Processed {success_count} of {len(texts_to_process)} texts"
    }


@router.post("/quick")
async def quick_preprocess_text(data: dict):
    """
    Quick preprocessing with minimal options
    
    Request body:
    {
        "text": "Text to preprocess",
        "language": "english",
        "lowercase": true,
        "remove_stopwords": true,
        "remove_punct": true
    }
    """
    text = data.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Text required")
    
    result = quick_preprocess(
        text,
        language=data.get("language", "english"),
        lowercase=data.get("lowercase", True),
        remove_stopwords=data.get("remove_stopwords", True),
        remove_punct=data.get("remove_punct", True)
    )
    
    return {
        "success": True,
        "data": {
            "processed_text": result
        }
    }


@router.get("/languages")
async def get_supported_languages():
    """Get list of supported stopwords languages"""
    return {
        "success": True,
        "data": [
            {"code": "english", "name": "English", "native": "English"},
            {"code": "chinese", "name": "Chinese", "native": "中文"},
            {"code": "spanish", "name": "Spanish", "native": "Espanol"},
            {"code": "french", "name": "French", "native": "Francais"},
            {"code": "german", "name": "German", "native": "Deutsch"},
            {"code": "italian", "name": "Italian", "native": "Italiano"},
            {"code": "portuguese", "name": "Portuguese", "native": "Portugues"},
            {"code": "russian", "name": "Russian", "native": "Russkij"},
            {"code": "arabic", "name": "Arabic", "native": "Arabiy"},
            {"code": "japanese", "name": "Japanese", "native": "Nihongo"}
        ]
    }


@router.get("/stopwords/{language}")
async def get_stopwords(language: str):
    """Get stopwords for a language"""
    config = ServicePreprocessConfig(stopwords_language=language)
    preprocessor = TextPreprocessor(config)
    
    stopwords = list(preprocessor._stopwords)
    stopwords.sort()
    
    return {
        "success": True,
        "data": {
            "language": language,
            "count": len(stopwords),
            "stopwords": stopwords
        }
    }

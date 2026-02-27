"""
Collocation Analysis API Router
Provides endpoints for window-based collocation analysis with statistical measures.
"""

from fastapi import APIRouter
from typing import List, Optional
from pydantic import BaseModel

from services.collocation_analysis import get_collocation_analysis_service
from models.database import CorpusDB

router = APIRouter()


class POSFilterConfig(BaseModel):
    """POS filter configuration"""
    selectedPOS: List[str] = []
    keepMode: bool = True


class CollocationAnalysisRequest(BaseModel):
    """Collocation analysis request"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    node_word: str
    span: int = 5
    pos_filter: Optional[POSFilterConfig] = None
    min_freq: int = 1
    max_freq: Optional[int] = None
    lowercase: bool = True
    remove_stopwords: bool = False
    exclude_words: List[str] = []
    statistics_methods: List[str] = ["logdice", "mi", "deltap1", "deltap2"]
    match_mode: str = "lemma"  # 'lemma' or 'word'


@router.post("/analyze")
async def analyze_collocations(request: CollocationAnalysisRequest):
    """
    Perform collocation analysis for a node word.
    Returns collocates with co-occurrence frequencies and statistical scores.
    """
    service = get_collocation_analysis_service()

    # Get corpus language for stopwords
    language = "english"
    try:
        corpus = CorpusDB.get_by_id(request.corpus_id)
        if corpus and corpus.get("language"):
            language = corpus["language"]
    except Exception:
        pass

    result = service.analyze(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        node_word=request.node_word,
        span=request.span,
        pos_filter=request.pos_filter.dict() if request.pos_filter else None,
        min_freq=request.min_freq,
        max_freq=request.max_freq,
        lowercase=request.lowercase,
        remove_stopwords=request.remove_stopwords,
        exclude_words=request.exclude_words,
        statistics_methods=request.statistics_methods,
        language=language,
        match_mode=request.match_mode
    )

    return result

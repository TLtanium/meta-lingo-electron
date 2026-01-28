"""
Analysis API Router
"""

import base64
from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from services.word_frequency_service import get_word_frequency_service
from services.ngram_service import get_ngram_service
from services.synonym_service import get_synonym_service
from services.semantic_analysis_service import get_semantic_analysis_service
from services.keyword_service import get_keyword_service
from services.wordcloud_service import get_wordcloud_service
from models.database import CorpusDB

router = APIRouter()


class CorpusSelection(BaseModel):
    corpus_id: str
    text_ids: List[str] | str  # list of IDs or "all"
    filters: dict = {}
    preprocess_config: dict = {}


class POSFilterConfig(BaseModel):
    """POS filter configuration"""
    selectedPOS: List[str] = []
    keepMode: bool = True  # True=keep selected, False=filter selected


class SearchConfig(BaseModel):
    """Search filter configuration"""
    searchType: str = "all"  # all, starts, ends, contains, regex, wordlist
    searchValue: str = ""
    excludeWords: List[str] = []
    searchTarget: str = "word"  # word or lemma
    removeStopwords: bool = False  # Remove stopwords based on corpus language


class WordFrequencyRequest(BaseModel):
    """Word frequency analysis request"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    pos_filter: Optional[POSFilterConfig] = None
    search_config: Optional[SearchConfig] = None
    min_freq: int = 1
    max_freq: Optional[int] = None
    lowercase: bool = True


class WordFrequencyResult(BaseModel):
    word: str
    frequency: int
    percentage: float
    rank: int


class WordFrequencyResponse(BaseModel):
    """Word frequency analysis response"""
    success: bool
    results: List[WordFrequencyResult]
    total_tokens: int = 0
    unique_words: int = 0
    error: Optional[str] = None


class POSTagInfo(BaseModel):
    """POS tag information"""
    tag: str
    description_en: str
    description_zh: str


class KeywordResult(BaseModel):
    keyword: str
    score: float
    frequency: int
    keyness: float


# ==================== Keyword Extraction Models ====================

class TFIDFConfig(BaseModel):
    """TF-IDF configuration"""
    maxFeatures: int = 50
    minDf: float = 0.01
    maxDf: float = 0.95
    ngramRange: List[int] = [1, 2]


class TextRankConfig(BaseModel):
    """TextRank configuration"""
    windowSize: int = 4
    damping: float = 0.85
    maxIter: int = 100
    topN: int = 50


class YAKEConfig(BaseModel):
    """YAKE configuration"""
    maxNgramSize: int = 3
    dedupThreshold: float = 0.9
    topN: int = 50
    windowSize: int = 2


class RAKEConfig(BaseModel):
    """RAKE configuration"""
    minLength: int = 1
    maxLength: int = 3
    minFrequency: int = 1
    topN: int = 50


class StopwordsConfig(BaseModel):
    """Stopwords configuration"""
    removeStopwords: bool = False
    excludeWords: List[str] = []


class ThresholdConfig(BaseModel):
    """Statistical threshold configuration"""
    minScore: Optional[float] = None
    maxPValue: Optional[float] = None


class SingleDocKeywordRequest(BaseModel):
    """Single document keyword extraction request"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    algorithm: str = "tfidf"  # tfidf, textrank, yake, rake
    config: Dict[str, Any] = {}
    pos_filter: Optional[POSFilterConfig] = None
    lowercase: bool = True
    stopwords_config: Optional[StopwordsConfig] = None
    language: str = "english"


class SingleDocKeywordResult(BaseModel):
    """Single keyword result"""
    keyword: str
    score: float
    frequency: int
    rank: int
    algorithm: str


class SingleDocKeywordResponse(BaseModel):
    """Single document keyword extraction response"""
    success: bool
    results: List[SingleDocKeywordResult] = []
    total_keywords: int = 0
    algorithm: str = ""
    error: Optional[str] = None


class KeynessConfig(BaseModel):
    """Keyness analysis configuration"""
    minFreqStudy: int = 3
    minFreqRef: int = 3
    pValue: float = 0.05
    showNegative: bool = False
    effectSizeThreshold: float = 0


class KeynessRequest(BaseModel):
    """Keyness comparison request"""
    study_corpus_id: str
    study_text_ids: List[str] | str = "all"
    reference_corpus_id: str
    reference_text_ids: List[str] | str = "all"
    statistic: str = "log_likelihood"  # log_likelihood, chi_squared, log_ratio, dice, mi, mi3, t_score, simple_keyness, fishers_exact
    config: KeynessConfig = KeynessConfig()
    pos_filter: Optional[POSFilterConfig] = None
    lowercase: bool = True
    stopwords_config: Optional[StopwordsConfig] = None
    language: str = "english"
    threshold_config: Optional[ThresholdConfig] = None


class KeynessResourceRequest(BaseModel):
    """Keyness comparison with corpus resource request"""
    study_corpus_id: str
    study_text_ids: List[str] | str = "all"
    resource_id: str  # Corpus resource ID (e.g., 'oanc_total', 'bnc_spoken')
    statistic: str = "log_likelihood"
    config: KeynessConfig = KeynessConfig()
    pos_filter: Optional[POSFilterConfig] = None
    lowercase: bool = True
    stopwords_config: Optional[StopwordsConfig] = None
    language: str = "english"
    threshold_config: Optional[ThresholdConfig] = None


class KeynessKeywordResult(BaseModel):
    """Keyness keyword result"""
    keyword: str
    study_freq: int
    ref_freq: int
    study_norm: float
    ref_norm: float
    score: float
    effect_size: float
    p_value: float
    significance: str
    direction: str
    rank: int


class KeynessResponse(BaseModel):
    """Keyness analysis response"""
    success: bool
    results: List[KeynessKeywordResult] = []
    total_keywords: int = 0
    study_corpus_size: int = 0
    ref_corpus_size: int = 0
    statistic: str = ""
    error: Optional[str] = None


class AlgorithmInfo(BaseModel):
    """Algorithm information"""
    id: str
    name_en: str
    name_zh: str
    description_en: str
    description_zh: str


class StatisticInfo(BaseModel):
    """Statistic information"""
    id: str
    name_en: str
    name_zh: str
    description_en: str
    description_zh: str


class NGramRequest(BaseModel):
    """N-gram analysis request"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    n_values: List[int] = [2]  # 2-6, can select multiple
    pos_filter: Optional[POSFilterConfig] = None
    search_config: Optional[SearchConfig] = None
    min_freq: int = 1
    max_freq: Optional[int] = None
    min_word_length: int = 1
    lowercase: bool = True
    nest_ngram: bool = False  # Enable Nest N-gram grouping


class NGramResultItem(BaseModel):
    """Single N-gram result item"""
    ngram: str
    n: int
    frequency: int
    percentage: float
    rank: int
    words: List[str]
    nested: Optional[List[Dict[str, Any]]] = None  # For Nest N-gram mode


class NGramResponse(BaseModel):
    """N-gram analysis response"""
    success: bool
    results: List[NGramResultItem] = []
    total_ngrams: int = 0
    unique_ngrams: int = 0
    n_values: List[int] = []
    error: Optional[str] = None


# Legacy model for backward compatibility
class NGramResult(BaseModel):
    ngram: List[str]
    frequency: int
    percentage: float


class CollocationResult(BaseModel):
    collocate: str
    frequency: int
    score: float
    position: str


class KWICResult(BaseModel):
    left: str
    keyword: str
    right: str
    source_text: str
    position: int


class TopicWord(BaseModel):
    word: str
    weight: float


class Topic(BaseModel):
    id: int
    words: List[TopicWord]
    label: Optional[str] = None


class TopicModelResult(BaseModel):
    topics: List[Topic]


@router.post("/word-frequency", response_model=WordFrequencyResponse)
async def word_frequency(request: WordFrequencyRequest):
    """
    Analyze word frequency from corpus SpaCy annotations
    
    Supports:
    - POS filtering (keep/filter mode)
    - Frequency range filtering
    - Search filtering (starts/ends/contains/regex/wordlist)
    - Exclusion words
    - Case normalization
    - Stopwords removal (based on corpus language)
    """
    service = get_word_frequency_service()
    
    # Get corpus language for stopwords
    language = "english"  # Default
    try:
        corpus = CorpusDB.get_by_id(request.corpus_id)
        if corpus and corpus.get("language"):
            language = corpus.get("language")
    except Exception as e:
        pass  # Use default language
    
    pos_filter = request.pos_filter.model_dump() if request.pos_filter else None
    search_config = request.search_config.model_dump() if request.search_config else None
    
    result = service.analyze(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        pos_filter=pos_filter,
        search_config=search_config,
        min_freq=request.min_freq,
        max_freq=request.max_freq,
        lowercase=request.lowercase,
        language=language
    )
    
    return WordFrequencyResponse(**result)


@router.get("/pos-tags", response_model=List[POSTagInfo])
async def get_pos_tags():
    """Get available SpaCy POS tags with descriptions"""
    service = get_word_frequency_service()
    return service.get_available_pos_tags()


class SynonymRequest(BaseModel):
    """Synonym analysis request"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    pos_filter: str = "auto"  # auto/adjective/adverb/noun/verb/pronoun
    search_query: str = ""
    min_freq: int = 1
    max_results: int = 100
    lowercase: bool = True


class SynsetInfo(BaseModel):
    """Synset information"""
    name: str
    pos: str
    definition: str
    examples: List[str] = []
    synonyms: List[str] = []


class SynonymResultItem(BaseModel):
    """Single synonym result item"""
    word: str
    frequency: int
    pos_tags: List[str]
    synsets: List[SynsetInfo]
    all_synonyms: List[str]
    synonym_count: int


class SynonymResponse(BaseModel):
    """Synonym analysis response"""
    success: bool
    results: List[SynonymResultItem] = []
    total_words: int = 0
    unique_words: int = 0
    error: Optional[str] = None


class POSOption(BaseModel):
    """POS filter option"""
    value: str
    label_en: str
    label_zh: str


class WordSynonymResponse(BaseModel):
    """Single word synonym response"""
    success: bool
    word: str
    synsets: List[SynsetInfo] = []
    all_synonyms: List[str] = []
    synonym_count: int = 0
    error: Optional[str] = None


@router.post("/synonym", response_model=SynonymResponse)
async def synonym_analysis(request: SynonymRequest):
    """
    Analyze synonyms from corpus using NLTK WordNet
    
    Supports:
    - POS filtering (auto/adjective/adverb/noun/verb/pronoun)
    - Search query filtering
    - Frequency filtering
    - Uses SpaCy annotation data for word extraction
    """
    service = get_synonym_service()
    
    result = service.analyze(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        pos_filter=request.pos_filter,
        search_query=request.search_query,
        min_freq=request.min_freq,
        max_results=request.max_results,
        lowercase=request.lowercase
    )
    
    return SynonymResponse(**result)


@router.get("/synonym/word/{word}", response_model=WordSynonymResponse)
async def get_word_synonyms(word: str, pos: str = "auto"):
    """Get synonyms for a single word"""
    service = get_synonym_service()
    result = service.get_word_synonyms(word, pos)
    return WordSynonymResponse(**result)


@router.get("/synonym/pos-options", response_model=List[POSOption])
async def get_synonym_pos_options():
    """Get available POS filter options for synonym analysis"""
    service = get_synonym_service()
    return service.get_pos_options()


@router.post("/word-family")
async def word_family(selection: CorpusSelection):
    """Analyze word families (deprecated - use /synonym instead)"""
    # Redirect to synonym analysis
    return []


# ==================== Semantic Domain Analysis ====================

class SemanticAnalysisRequest(BaseModel):
    """Semantic domain analysis request"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    pos_filter: Optional[POSFilterConfig] = None
    search_config: Optional[SearchConfig] = None
    min_freq: int = 1
    max_freq: Optional[int] = None
    lowercase: bool = True
    result_mode: str = "domain"  # "domain" or "word"


class SemanticDomainResult(BaseModel):
    """Single semantic domain result"""
    rank: int
    domain: str
    domain_name: str
    category: str
    category_name: str
    frequency: int
    percentage: float
    words: Optional[List[str]] = None


class SemanticWordResult(BaseModel):
    """Single word with semantic domain result"""
    rank: int
    word: str
    domain: str
    domain_name: str
    category: str
    category_name: str
    pos: str
    frequency: int
    percentage: float


class SemanticAnalysisResponse(BaseModel):
    """Semantic domain analysis response"""
    success: bool
    results: List[Dict[str, Any]] = []
    total_tokens: int = 0
    unique_domains: int = 0
    unique_words: int = 0
    result_mode: str = "domain"
    error: Optional[str] = None


class DomainWordsRequest(BaseModel):
    """Request for words in a specific domain"""
    corpus_id: str
    domain: str
    text_ids: List[str] | str = "all"
    lowercase: bool = True


class DomainWordsResponse(BaseModel):
    """Response with words in a domain"""
    success: bool
    domain: str
    domain_name: str
    words: List[Dict[str, Any]] = []
    total_words: int = 0
    error: Optional[str] = None


class MajorCategory(BaseModel):
    """USAS major category"""
    code: str
    name: str


@router.post("/semantic-domains", response_model=SemanticAnalysisResponse)
async def semantic_domain_analysis(request: SemanticAnalysisRequest):
    """
    Analyze semantic domains from corpus USAS annotations
    
    Supports:
    - Two result modes: by domain or by word
    - POS filtering (keep/filter mode)
    - Frequency range filtering
    - Search filtering (starts/ends/contains/regex/wordlist)
    - Exclusion words
    - Case normalization
    """
    service = get_semantic_analysis_service()
    
    pos_filter = request.pos_filter.model_dump() if request.pos_filter else None
    search_config = request.search_config.model_dump() if request.search_config else None
    
    result = service.analyze(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        pos_filter=pos_filter,
        search_config=search_config,
        min_freq=request.min_freq,
        max_freq=request.max_freq,
        lowercase=request.lowercase,
        result_mode=request.result_mode
    )
    
    return SemanticAnalysisResponse(**result)


@router.post("/semantic-domains/words", response_model=DomainWordsResponse)
async def get_domain_words(request: DomainWordsRequest):
    """Get all words tagged with a specific semantic domain"""
    service = get_semantic_analysis_service()
    
    result = service.get_domain_words(
        corpus_id=request.corpus_id,
        domain=request.domain,
        text_ids=request.text_ids,
        lowercase=request.lowercase
    )
    
    return DomainWordsResponse(**result)


@router.get("/semantic-domains/categories", response_model=List[MajorCategory])
async def get_major_categories():
    """Get list of USAS major categories"""
    service = get_semantic_analysis_service()
    return service.get_major_categories()


# ==================== Metaphor Analysis Endpoints ====================

class MetaphorAnalysisRequest(BaseModel):
    """Metaphor analysis request"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    pos_filter: Optional[POSFilterConfig] = None
    search_config: Optional[SearchConfig] = None
    min_freq: int = 1
    max_freq: Optional[int] = None
    lowercase: bool = True
    result_mode: str = "word"  # "word" or "source"


class MetaphorResult(BaseModel):
    """Single metaphor analysis result"""
    word: str
    lemma: str
    pos: str
    is_metaphor: bool
    frequency: int
    percentage: float
    source: str  # 'filter', 'rule', 'hitz', 'finetuned'


class MetaphorSourceResult(BaseModel):
    """Metaphor result grouped by source"""
    source: str
    name: str
    count: int
    percentage: float


class MetaphorStatistics(BaseModel):
    """Metaphor analysis statistics"""
    total_tokens: int
    metaphor_tokens: int
    literal_tokens: int
    metaphor_rate: float
    source_distribution: Dict[str, int]


class MetaphorAnalysisResponse(BaseModel):
    """Metaphor analysis response"""
    success: bool
    results: List[MetaphorResult] | List[MetaphorSourceResult]
    statistics: MetaphorStatistics
    error: Optional[str] = None


class MetaphorWordsRequest(BaseModel):
    """Request for metaphor/literal word list"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    is_metaphor: bool = True
    source: Optional[str] = None  # Filter by source
    lowercase: bool = True


class MetaphorWordsResponse(BaseModel):
    """Response for metaphor/literal word list"""
    success: bool
    words: List[Dict[str, Any]]
    total: int
    error: Optional[str] = None


@router.post("/metaphor-analysis", response_model=MetaphorAnalysisResponse)
async def metaphor_analysis(request: MetaphorAnalysisRequest):
    """
    Analyze metaphors from corpus MIPVU annotations
    
    Supports:
    - Two result modes: by word or by source
    - POS filtering (keep/filter mode)
    - Frequency range filtering
    - Search filtering (starts/ends/contains/regex/wordlist)
    - Exclusion words
    - Case normalization
    """
    from services.metaphor_analysis_service import get_metaphor_analysis_service
    
    service = get_metaphor_analysis_service()
    
    pos_filter = request.pos_filter.model_dump() if request.pos_filter else None
    search_config = request.search_config.model_dump() if request.search_config else None
    
    result = service.analyze(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        pos_filter=pos_filter,
        search_config=search_config,
        min_freq=request.min_freq,
        max_freq=request.max_freq,
        lowercase=request.lowercase,
        result_mode=request.result_mode
    )
    
    return MetaphorAnalysisResponse(**result)


@router.post("/metaphor-analysis/words", response_model=MetaphorWordsResponse)
async def get_metaphor_words(request: MetaphorWordsRequest):
    """Get list of metaphor or literal words"""
    from services.metaphor_analysis_service import get_metaphor_analysis_service
    
    service = get_metaphor_analysis_service()
    
    result = service.get_words(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        is_metaphor=request.is_metaphor,
        source=request.source,
        lowercase=request.lowercase
    )
    
    return MetaphorWordsResponse(**result)


@router.get("/metaphor-analysis/sources")
async def get_metaphor_sources():
    """Get list of metaphor detection sources"""
    return [
        {"id": "filter", "name_en": "Word Filter", "name_zh": "词表过滤"},
        {"id": "rule", "name_en": "Rule Filter", "name_zh": "规则过滤"},
        {"id": "hitz", "name_en": "HiTZ Model", "name_zh": "HiTZ模型"},
        {"id": "finetuned", "name_en": "Fine-tuned Model", "name_zh": "微调模型"},
    ]


@router.post("/keyword", response_model=List[KeywordResult])
async def keyword_extraction(
    selection: CorpusSelection,
    reference_corpus_id: Optional[str] = None
):
    """Extract keywords (legacy endpoint)"""
    # Legacy endpoint - use /keyword/single-doc or /keyword/keyness instead
    return []


# ==================== Keyword Extraction Endpoints ====================

@router.post("/keyword/single-doc", response_model=SingleDocKeywordResponse)
async def keyword_single_doc(request: SingleDocKeywordRequest):
    """
    Single document keyword extraction
    
    Algorithms:
    - tfidf: TF-IDF based extraction
    - textrank: Graph-based TextRank algorithm
    - yake: YAKE! unsupervised extraction
    - rake: RAKE phrase extraction
    
    Supports:
    - Stopwords filtering
    - POS filtering
    """
    service = get_keyword_service()
    
    pos_filter = request.pos_filter.model_dump() if request.pos_filter else None
    stopwords_config = request.stopwords_config.model_dump() if request.stopwords_config else None
    
    # Get corpus language if not specified
    language = request.language
    if language == "english":
        try:
            corpus = CorpusDB.get_by_id(request.corpus_id)
            if corpus and corpus.get("language"):
                language = corpus.get("language")
        except Exception:
            pass
    
    result = service.analyze_single_doc(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        algorithm=request.algorithm,
        config=request.config,
        pos_filter=pos_filter,
        lowercase=request.lowercase,
        stopwords_config=stopwords_config,
        language=language
    )
    
    return SingleDocKeywordResponse(**result)


@router.post("/keyword/keyness", response_model=KeynessResponse)
async def keyword_keyness(request: KeynessRequest):
    """
    Keyness comparison between study corpus and reference corpus
    
    Statistics:
    - log_likelihood: Log-Likelihood (G2) - most reliable
    - chi_squared: Chi-squared with Yates correction
    - log_ratio: Log Ratio effect size
    - dice: Dice coefficient
    - mi: Mutual Information
    - mi3: MI3 (cubed MI)
    - t_score: T-score
    - simple_keyness: Simple frequency ratio
    - fishers_exact: Fisher's Exact Test
    
    Supports:
    - Stopwords filtering
    - Statistical threshold filtering
    - POS filtering
    """
    service = get_keyword_service()
    
    pos_filter = request.pos_filter.model_dump() if request.pos_filter else None
    config = request.config.model_dump() if request.config else {}
    stopwords_config = request.stopwords_config.model_dump() if request.stopwords_config else None
    threshold_config = request.threshold_config.model_dump() if request.threshold_config else None
    
    # Get corpus language if not specified
    language = request.language
    if language == "english":
        try:
            corpus = CorpusDB.get_by_id(request.study_corpus_id)
            if corpus and corpus.get("language"):
                language = corpus.get("language")
        except Exception:
            pass
    
    result = service.analyze_keyness(
        study_corpus_id=request.study_corpus_id,
        study_text_ids=request.study_text_ids,
        reference_corpus_id=request.reference_corpus_id,
        reference_text_ids=request.reference_text_ids,
        statistic=request.statistic,
        config=config,
        pos_filter=pos_filter,
        lowercase=request.lowercase,
        stopwords_config=stopwords_config,
        language=language,
        threshold_config=threshold_config
    )
    
    return KeynessResponse(**result)


@router.post("/keyword/keyness-resource", response_model=KeynessResponse)
async def keyword_keyness_resource(request: KeynessResourceRequest):
    """
    Keyness comparison between study corpus and a corpus resource (CSV)
    
    Use this endpoint to compare against pre-built corpus resources like
    BNC, OANC, NOW, or Brown Corpus word frequency data.
    
    Supports:
    - Stopwords filtering
    - Statistical threshold filtering
    - POS filtering
    """
    service = get_keyword_service()
    
    pos_filter = request.pos_filter.model_dump() if request.pos_filter else None
    config = request.config.model_dump() if request.config else {}
    stopwords_config = request.stopwords_config.model_dump() if request.stopwords_config else None
    threshold_config = request.threshold_config.model_dump() if request.threshold_config else None
    
    # Get corpus language if not specified
    language = request.language
    if language == "english":
        try:
            corpus = CorpusDB.get_by_id(request.study_corpus_id)
            if corpus and corpus.get("language"):
                language = corpus.get("language")
        except Exception:
            pass
    
    result = service.analyze_keyness_with_resource(
        study_corpus_id=request.study_corpus_id,
        study_text_ids=request.study_text_ids,
        resource_id=request.resource_id,
        statistic=request.statistic,
        config=config,
        pos_filter=pos_filter,
        lowercase=request.lowercase,
        stopwords_config=stopwords_config,
        language=language,
        threshold_config=threshold_config
    )
    
    return KeynessResponse(**result)


@router.get("/keyword/algorithms", response_model=List[AlgorithmInfo])
async def get_keyword_algorithms():
    """Get available single-document keyword extraction algorithms"""
    service = get_keyword_service()
    return service.get_single_doc_algorithms()


@router.get("/keyword/statistics", response_model=List[StatisticInfo])
async def get_keyness_statistics():
    """Get available keyness statistics"""
    service = get_keyword_service()
    return service.get_keyness_statistics()


@router.get("/keyword/thresholds")
async def get_default_thresholds():
    """Get default statistical thresholds for keyness analysis"""
    service = get_keyword_service()
    return {
        "success": True,
        "data": service.get_default_thresholds()
    }


@router.post("/ngram", response_model=NGramResponse)
async def ngram_analysis(request: NGramRequest):
    """
    N-gram analysis from corpus SpaCy annotations
    
    Supports:
    - Multiple N values (2-6)
    - Nest N-gram grouping (shorter N-grams grouped under longer ones)
    - POS filtering (keep/filter mode, all words must match)
    - Frequency range filtering
    - Search filtering (starts/ends/contains/regex/wordlist)
    - Minimum word length
    - Case normalization
    """
    service = get_ngram_service()
    
    pos_filter = request.pos_filter.model_dump() if request.pos_filter else None
    search_config = request.search_config.model_dump() if request.search_config else None
    
    result = service.analyze(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        n_values=request.n_values,
        pos_filter=pos_filter,
        search_config=search_config,
        min_freq=request.min_freq,
        max_freq=request.max_freq,
        min_word_length=request.min_word_length,
        lowercase=request.lowercase,
        nest_ngram=request.nest_ngram
    )
    
    return NGramResponse(**result)


@router.post("/collocation", response_model=List[CollocationResult])
async def collocation_analysis(
    selection: CorpusSelection,
    node_word: str,
    window_size: int = 5,
    measure: str = "mi",
    min_frequency: int = 3,
    mode: str = "standard"
):
    """Co-occurrence analysis"""
    # TODO: Implement collocation analysis
    return []


@router.post("/word-sketch")
async def word_sketch(selection: CorpusSelection, word: str):
    """Generate word sketch"""
    # TODO: Implement word sketch
    return {"word": word, "grammar_relations": []}


@router.post("/kwic", response_model=List[KWICResult])
async def kwic_concordance(
    selection: CorpusSelection,
    keyword: str,
    context_size: int = 50
):
    """KWIC concordance"""
    # TODO: Implement KWIC
    return []


@router.post("/topic-modeling", response_model=TopicModelResult)
async def topic_modeling(
    selection: CorpusSelection,
    model_type: str = "lda",
    num_topics: int = 5
):
    """Topic modeling"""
    # TODO: Implement topic modeling
    # Supported models: bertopic, lda, lsa, nmf, dtm
    return TopicModelResult(topics=[])


# ==================== Word Cloud Generation ====================

class WordCloudGenerateRequest(BaseModel):
    """Word cloud generation request"""
    word_freq: Dict[str, int]  # Word frequency dictionary
    max_words: int = 100
    mask_image: Optional[str] = None  # Base64 encoded image (optional)
    colormap: Optional[str] = None  # Colormap name (optional)
    style: str = "默认"  # 默认, 使用蒙版, 基于图片颜色
    contour_width: int = 0
    contour_color: str = "black"


class WordCloudGenerateResponse(BaseModel):
    """Word cloud generation response"""
    success: bool
    image_data: Optional[str] = None  # Base64 encoded image data URL
    error: Optional[str] = None


@router.post("/wordcloud/generate", response_model=WordCloudGenerateResponse)
async def generate_wordcloud(request: WordCloudGenerateRequest):
    """
    Generate word cloud image using legacy Python wordcloud engine
    
    Args:
        request: Word cloud generation request with word frequencies and parameters
        
    Returns:
        Word cloud image as base64 data URL
    """
    try:
        # Validate word frequency data
        if not request.word_freq or len(request.word_freq) == 0:
            return WordCloudGenerateResponse(
                success=False,
                error="Word frequency dictionary is empty. Please run word frequency analysis first."
            )
        
        # Decode mask image if provided
        mask_image_data = None
        if request.mask_image:
            try:
                # Remove data URL prefix if present
                if request.mask_image.startswith('data:image'):
                    # Extract base64 part
                    base64_data = request.mask_image.split(',')[1]
                    mask_image_data = base64.b64decode(base64_data)
                else:
                    # Assume it's already base64
                    mask_image_data = base64.b64decode(request.mask_image)
            except Exception as e:
                return WordCloudGenerateResponse(
                    success=False,
                    error=f"Failed to decode mask image: {str(e)}"
                )
        
        # Get word cloud service
        wc_service = get_wordcloud_service()
        
        # Generate word cloud
        image_data, error = wc_service.generate_wordcloud(
            word_freq=request.word_freq,
            max_words=request.max_words,
            mask_image_data=mask_image_data,
            colormap=request.colormap,
            wc_style=request.style,
            contour_width=request.contour_width,
            contour_color=request.contour_color,
            output_format="base64"
        )
        
        if error:
            return WordCloudGenerateResponse(
                success=False,
                error=error
            )
        
        return WordCloudGenerateResponse(
            success=True,
            image_data=image_data
        )
        
    except Exception as e:
        import traceback
        error_msg = f"Failed to generate word cloud: {str(e)}\n{traceback.format_exc()}"
        return WordCloudGenerateResponse(
            success=False,
            error=error_msg
        )


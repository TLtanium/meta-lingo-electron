"""
Topic Modeling API Router
BERTopic-based topic modeling endpoints
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import numpy as np

logger = logging.getLogger(__name__)
router = APIRouter()


# ============ Request/Response Models ============

class PreprocessConfig(BaseModel):
    # Note: remove_stopwords and remove_punctuation are now handled by vectorizer
    # These are kept for backward compatibility but default to False
    remove_stopwords: bool = False
    remove_punctuation: bool = False
    lemmatize: bool = False
    lowercase: bool = False  # Keep original case for embedding
    min_token_length: int = 1  # Don't filter by token length for embedding
    pos_filter: List[str] = []


class ChunkingConfig(BaseModel):
    enabled: bool = False
    min_tokens: int = 100  # Paragraphs smaller than this will be merged
    max_tokens: int = 256  # Target max tokens (SBERT supports up to 512)
    overlap_tokens: int = 0


class PreprocessPreviewRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    config: PreprocessConfig
    max_preview: int = 10
    language: str = "english"
    chunking: Optional[ChunkingConfig] = None


class PreprocessRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    config: PreprocessConfig
    language: str = "english"
    chunking: Optional[ChunkingConfig] = None


class EmbeddingRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    preprocess_config: PreprocessConfig
    batch_size: int = 32
    device: str = "cpu"
    normalize: bool = False
    language: str = "english"
    chunking: Optional[ChunkingConfig] = None


class DimReductionConfig(BaseModel):
    method: str = "UMAP"
    params: Dict[str, Any] = {}


class ClusteringConfig(BaseModel):
    method: str = "HDBSCAN"
    params: Dict[str, Any] = {}


class VectorizerConfig(BaseModel):
    type: str = "CountVectorizer"
    params: Dict[str, Any] = {}


class RepresentationModelConfig(BaseModel):
    type: Optional[str] = None
    params: Dict[str, Any] = {}


class OutlierConfig(BaseModel):
    enabled: bool = False
    strategy: str = "distributions"
    threshold: float = 0.0


class DynamicTopicConfig(BaseModel):
    enabled: bool = False
    date_format: str = "year_only"  # "year_only" or "full_date"
    nr_bins: Optional[int] = None
    evolution_tuning: bool = True
    global_tuning: bool = True
    corpus_id: Optional[str] = None
    text_ids: Optional[List[str]] = None


class AnalysisRequest(BaseModel):
    embedding_id: str
    dim_reduction: DimReductionConfig = DimReductionConfig()
    clustering: ClusteringConfig = ClusteringConfig()
    vectorizer: VectorizerConfig = VectorizerConfig()
    representation_model: RepresentationModelConfig = RepresentationModelConfig()
    reduce_outliers: OutlierConfig = OutlierConfig()
    calculate_probabilities: bool = False
    dynamic_topic: Optional[DynamicTopicConfig] = None
    language: str = "english"  # Corpus language for vectorizer tokenization


class OllamaNamingRequest(BaseModel):
    topics: List[Dict[str, Any]]
    base_url: str
    model: str
    prompt_template: Optional[str] = None
    language: str = "en"
    delay: float = 0.5
    top_n_words: int = 10  # Number of keywords to use for naming


# ============ Preprocess Endpoints ============

@router.post("/preprocess/preview")
async def preview_preprocess(request: PreprocessPreviewRequest):
    """Preview preprocessing results with chunking"""
    try:
        from services.topic_modeling import get_topic_preprocess_service
        
        # Prepare chunking config
        chunking_config = None
        if request.chunking:
            chunking_config = request.chunking.model_dump()
        
        service = get_topic_preprocess_service()
        result = service.preview_preprocess_chunks(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            config=request.config.model_dump(),
            max_preview=request.max_preview,
            language=request.language,
            chunking_config=chunking_config
        )
        
        return result
        
    except ValueError as e:
        error_str = str(e)
        if error_str.startswith("SENTENCE_EXCEEDS_LIMIT:"):
            # Parse error: SENTENCE_EXCEEDS_LIMIT:actual_tokens:limit
            # A sentence exceeds 512 tokens - user needs to manually split it
            parts = error_str.split(":")
            actual_tokens = parts[1] if len(parts) > 1 else "unknown"
            limit = parts[2] if len(parts) > 2 else "512"
            raise HTTPException(
                status_code=400, 
                detail=f"SENTENCE_EXCEEDS_LIMIT:{actual_tokens}:{limit}"
            )
        if error_str.startswith("CHUNK_EXCEEDS_LIMIT:"):
            # Parse error: CHUNK_EXCEEDS_LIMIT:actual_tokens:limit
            parts = error_str.split(":")
            actual_tokens = parts[1] if len(parts) > 1 else "unknown"
            limit = parts[2] if len(parts) > 2 else "512"
            raise HTTPException(
                status_code=400, 
                detail=f"CHUNK_EXCEEDS_LIMIT:{actual_tokens}:{limit}"
            )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Preprocess preview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preprocess")
async def preprocess_texts(request: PreprocessRequest):
    """Preprocess texts for embedding"""
    try:
        from services.topic_modeling import get_topic_preprocess_service
        
        service = get_topic_preprocess_service()
        result = service.preprocess_corpus_texts(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            config=request.config.model_dump(),
            language=request.language
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Preprocess error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stopwords/languages")
async def get_stopwords_languages():
    """Get available stopwords languages"""
    try:
        from services.topic_modeling import get_topic_preprocess_service
        
        service = get_topic_preprocess_service()
        languages = service.get_available_languages()
        
        return {"languages": languages}
        
    except Exception as e:
        logger.error(f"Get stopwords languages error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Embedding Endpoints ============

@router.post("/embedding")
async def create_embedding(request: EmbeddingRequest):
    """Create text embeddings with optional chunking"""
    try:
        from services.topic_modeling import get_topic_preprocess_service, get_topic_embedding_service
        
        # Prepare chunking config
        chunking_config = None
        if request.chunking:
            chunking_config = request.chunking.model_dump()
        
        # First preprocess with language-specific stopwords and optional chunking
        preprocess_service = get_topic_preprocess_service()
        preprocess_result = preprocess_service.preprocess_corpus_texts(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            config=request.preprocess_config.model_dump(),
            language=request.language,
            chunking_config=chunking_config
        )
        
        documents = preprocess_result.get('documents', [])
        if not documents:
            raise HTTPException(status_code=400, detail="No documents after preprocessing")
        
        # Get text_ids for each chunk (for date metadata mapping)
        chunk_text_ids = preprocess_result.get('text_ids', [])
        
        # Create embeddings with text_ids mapping
        embedding_service = get_topic_embedding_service()
        result = embedding_service.create_embeddings(
            documents=documents,
            corpus_id=request.corpus_id,
            text_ids=chunk_text_ids,  # Each chunk's corresponding text_id
            batch_size=request.batch_size,
            device=request.device,
            normalize=request.normalize
        )
        
        # Add preprocess stats and chunk info
        result['preprocess_stats'] = preprocess_result.get('stats', {})
        result['chunk_indices'] = preprocess_result.get('chunk_indices', [])
        result['text_ids'] = chunk_text_ids
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/embedding/list")
async def list_embeddings(corpus_id: Optional[str] = None):
    """List available embedding files"""
    try:
        from services.topic_modeling import get_topic_embedding_service
        
        service = get_topic_embedding_service()
        embeddings = service.list_embeddings(corpus_id=corpus_id)
        
        return {"embeddings": embeddings}
        
    except Exception as e:
        logger.error(f"List embeddings error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/embedding/{embedding_id}")
async def delete_embedding(embedding_id: str):
    """Delete an embedding file"""
    try:
        from services.topic_modeling import get_topic_embedding_service
        
        service = get_topic_embedding_service()
        deleted = service.delete_embedding(embedding_id)
        
        if deleted:
            return {"message": "Embedding deleted", "id": embedding_id}
        else:
            raise HTTPException(status_code=404, detail="Embedding not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class RenameEmbeddingRequest(BaseModel):
    new_name: str


@router.put("/embedding/{embedding_id}/rename")
async def rename_embedding(embedding_id: str, request: RenameEmbeddingRequest):
    """Rename an embedding file"""
    try:
        from services.topic_modeling import get_topic_embedding_service
        
        service = get_topic_embedding_service()
        result = service.rename_embedding(embedding_id, request.new_name)
        
        return {"message": "Embedding renamed", "embedding": result}
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Rename embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/embedding/model-info")
async def get_model_info():
    """Get SBERT model information"""
    try:
        from services.topic_modeling import get_topic_embedding_service
        
        service = get_topic_embedding_service()
        return service.get_model_info()
        
    except Exception as e:
        logger.error(f"Model info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Analysis Endpoints ============

# Store analysis results temporarily for visualization
_analysis_cache: Dict[str, Any] = {}


@router.post("/analyze")
async def analyze_topics(request: AnalysisRequest):
    """Perform BERTopic analysis"""
    try:
        from services.topic_modeling import get_topic_embedding_service, get_bertopic_service, get_dynamic_topic_service
        
        # Load embeddings with text_ids mapping
        embedding_service = get_topic_embedding_service()
        embeddings, documents, chunk_text_ids = embedding_service.load_embeddings(request.embedding_id)
        
        if len(documents) == 0:
            raise HTTPException(status_code=400, detail="No documents found for embedding")
        
        # Prepare config
        clustering_data = request.clustering.model_dump()
        # Ensure alpha has valid value for HDBSCAN
        if request.clustering.method == "HDBSCAN":
            if clustering_data['params'].get('alpha') is None or clustering_data['params'].get('alpha', 0) <= 0:
                clustering_data['params']['alpha'] = 1.0
                logger.info(f"Fixed alpha to 1.0, original params: {request.clustering.params}")
        
        config = {
            'dim_reduction': request.dim_reduction.model_dump(),
            'clustering': clustering_data,
            'vectorizer': request.vectorizer.model_dump(),
            'representation_model': request.representation_model.model_dump(),
            'reduce_outliers': request.reduce_outliers.model_dump(),
            'calculate_probabilities': request.calculate_probabilities
        }
        logger.info(f"Clustering config: {clustering_data}")
        
        # Handle dynamic topic analysis
        timestamps = None
        dynamic_config = None
        if request.dynamic_topic and request.dynamic_topic.enabled:
            dynamic_service = get_dynamic_topic_service()
            
            corpus_id = request.dynamic_topic.corpus_id
            
            # Use chunk_text_ids if available (chunked embeddings)
            # Otherwise fall back to request text_ids
            if chunk_text_ids and len(chunk_text_ids) == len(documents):
                # Get timestamps for each chunk using its corresponding text_id
                logger.info(f"Using chunk-level text_ids mapping ({len(chunk_text_ids)} chunks)")
                timestamps_int, _, stats = dynamic_service.get_timestamps_for_chunks(
                    corpus_id=corpus_id,
                    chunk_text_ids=chunk_text_ids,
                    date_format=request.dynamic_topic.date_format
                )
            elif corpus_id and request.dynamic_topic.text_ids:
                # Legacy: one-to-one mapping (no chunking)
                timestamps_int, _, stats = dynamic_service.get_timestamps_from_corpus(
                    corpus_id=corpus_id,
                    text_ids=request.dynamic_topic.text_ids,
                    date_format=request.dynamic_topic.date_format
                )
            else:
                timestamps_int = []
                stats = {'with_date': 0, 'total': 0}
            
            # Validate timestamps
            is_valid, error_msg = dynamic_service.validate_timestamps(timestamps_int, len(documents))
            if is_valid:
                timestamps = timestamps_int
                dynamic_config = {
                    'nr_bins': request.dynamic_topic.nr_bins,
                    'evolution_tuning': request.dynamic_topic.evolution_tuning,
                    'global_tuning': request.dynamic_topic.global_tuning
                }
                logger.info(f"Dynamic topic analysis enabled: {stats['with_date']}/{stats['total']} items have dates")
            else:
                logger.warning(f"Dynamic topic analysis skipped: {error_msg}")
        
        # Run analysis with language-aware vectorization
        bertopic_service = get_bertopic_service()
        result = bertopic_service.analyze(
            embeddings=embeddings,
            documents=documents,
            config=config,
            timestamps=timestamps,
            dynamic_config=dynamic_config,
            language=request.language
        )
        
        # Generate a result ID and cache for visualization
        from datetime import datetime
        result_id = f"{request.embedding_id}_{datetime.now().strftime('%H%M%S')}"
        
        _analysis_cache[result_id] = {
            'topics': result.get('topics', []),
            'document_topics': result.get('document_topics', []),
            'stats': result.get('stats', {}),
            'topics_over_time': result.get('topics_over_time'),
            'has_dynamic_topics': result.get('has_dynamic_topics', False),
            '_topic_model': result.get('_topic_model'),
            '_embeddings': result.get('_embeddings'),
            '_documents': documents,
            '_topics_over_time_df': result.get('_topics_over_time_df'),
            '_raw_topics': result.get('_raw_topics'),
            '_probs': result.get('_probs'),
            '_date_format': request.dynamic_topic.date_format if request.dynamic_topic else 'year_only'
        }
        
        # Remove internal references from response
        response_result = {k: v for k, v in result.items() if not k.startswith('_')}
        response_result['result_id'] = result_id
        
        # Save results
        bertopic_service.save_results(response_result, result_id)
        
        return response_result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============ Visualization Endpoints ============

@router.post("/visualization/{result_id}/{viz_type}")
async def get_visualization(result_id: str, viz_type: str, params: dict = None):
    """Get Plotly visualization data for a specific type with parameters"""
    try:
        from services.topic_modeling.visualization_service import get_topic_visualization_service
        
        # Get cached result
        if result_id not in _analysis_cache:
            raise HTTPException(status_code=404, detail="Analysis result not found. Please run analysis first.")
        
        cached = _analysis_cache[result_id]
        topics = cached.get('topics', [])
        topic_model = cached.get('_topic_model')
        embeddings = cached.get('_embeddings')
        documents = cached.get('_documents', [])
        topic_info = cached.get('_topic_info')
        
        if topic_model is None:
            raise HTTPException(status_code=400, detail="Topic model not available")
        
        # Default params
        if params is None:
            params = {}
        
        viz_service = get_topic_visualization_service()
        
        # Use Plotly.js methods as standard implementation
        if viz_type == "barchart":
            return viz_service.generate_barchart_plotly(topic_model, topics, params)
        
        elif viz_type == "topics":
            return viz_service.generate_topics_plotly(topic_model, topics, params)
        
        elif viz_type == "documents":
            return viz_service.generate_documents_plotly(topic_model, documents, embeddings, topics, params)
        
        elif viz_type == "hierarchy":
            return viz_service.generate_hierarchy_plotly(topic_model, topics, params, documents)
        
        elif viz_type == "heatmap":
            return viz_service.generate_heatmap_plotly(topic_model, topics, params)
        
        elif viz_type == "term_rank":
            return viz_service.generate_term_rank_plotly(topic_model, topics, params)
        
        elif viz_type == "topics_over_time":
            topics_over_time_df = cached.get('_topics_over_time_df')
            if topics_over_time_df is None:
                raise HTTPException(status_code=400, detail="No dynamic topic data available. Enable dynamic topic analysis first.")
            # Pass date_format from analysis config
            date_format = cached.get('_date_format', 'year_only')
            return viz_service.generate_topics_over_time_plotly(topic_model, topics_over_time_df, topics, params, date_format)
        
        elif viz_type == "sankey":
            # Sankey is not a standard BERTopic visualization, keep using ECharts method
            return viz_service.generate_sankey(topic_model, documents, topics, params)
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown visualization type: {viz_type}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Visualization error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/visualization/{result_id}/{viz_type}")
async def get_visualization_get(result_id: str, viz_type: str):
    """GET version for backwards compatibility - uses default params"""
    return await get_visualization(result_id, viz_type, {})


# ============ Ollama Endpoints ============

@router.get("/ollama/check")
async def check_ollama(url: str = "http://localhost:11434"):
    """Check Ollama connection status"""
    try:
        from services.topic_modeling import get_ollama_naming_service
        
        service = get_ollama_naming_service()
        result = await service.check_connection(url)
        
        return result
        
    except Exception as e:
        logger.error(f"Ollama check error: {e}")
        return {"connected": False, "models": [], "error": str(e)}


@router.post("/ollama/naming")
async def generate_topic_names(request: OllamaNamingRequest):
    """Generate topic names using Ollama"""
    try:
        from services.topic_modeling import get_ollama_naming_service
        
        service = get_ollama_naming_service()
        
        # Check connection first
        connection = await service.check_connection(request.base_url)
        if not connection.get('connected'):
            raise HTTPException(status_code=503, detail="Ollama service not available")
        
        # Generate names
        updated_topics = await service.generate_all_topic_names(
            topics=request.topics,
            base_url=request.base_url,
            model=request.model,
            prompt_template=request.prompt_template,
            language=request.language,
            delay=request.delay,
            top_n_words=request.top_n_words
        )
        
        return {"topics": updated_topics}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ollama naming error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Outlier Estimation ============

class EstimateOutliersRequest(BaseModel):
    result_id: str
    strategy: str = "distributions"
    threshold: float = 0.0


@router.post("/estimate-outliers")
async def estimate_outliers(request: EstimateOutliersRequest):
    """
    Estimate outlier count with given strategy and threshold.
    This allows users to preview how many outliers would be reduced
    before actually running the reduction.
    """
    try:
        import numpy as np
        
        # Get cached result
        if request.result_id not in _analysis_cache:
            raise HTTPException(status_code=404, detail="Analysis result not found. Please run analysis first.")
        
        cached = _analysis_cache[request.result_id]
        topic_model = cached.get('_topic_model')
        documents = cached.get('_documents', [])
        raw_topics = cached.get('_raw_topics')
        probs = cached.get('_probs')
        embeddings = cached.get('_embeddings')  # Get embeddings for outlier reduction
        
        if topic_model is None or raw_topics is None:
            raise HTTPException(status_code=400, detail="Model data not available for outlier estimation")
        
        # Check if probabilities strategy is used but no probs available
        if request.strategy == "probabilities" and probs is None:
            raise HTTPException(
                status_code=400, 
                detail="Probabilities strategy requires probability values. Please re-run analysis with 'calculate_probabilities' enabled."
            )
        
        # Check if embeddings strategy is used but no embeddings available
        if request.strategy == "embeddings" and embeddings is None:
            raise HTTPException(
                status_code=400,
                detail="Embeddings strategy requires embeddings data. Please re-run analysis."
            )
        
        # Current outlier count
        current_outliers = int(np.sum(np.array(raw_topics) == -1))
        total_docs = len(raw_topics)
        
        # Estimate new outlier count using reduce_outliers
        # IMPORTANT: For 'distributions' strategy, BERTopic's reduce_outliers internally uses
        # the model's topics_ attribute, not the passed topics parameter.
        # If outlier reduction was already applied during analysis, the model's topics_
        # will be different from raw_topics, causing incorrect estimation results.
        # We need to temporarily restore the original topics_ before estimation.
        try:
            # Save current model topics_ state (may have been modified by outlier reduction)
            saved_topics = topic_model.topics_.copy() if hasattr(topic_model, 'topics_') and topic_model.topics_ is not None else None
            
            # Temporarily set model topics_ to raw_topics for accurate estimation
            # This is critical for 'distributions' strategy which uses transform() internally
            if hasattr(topic_model, 'topics_'):
                topic_model.topics_ = list(raw_topics)
            
            new_topics = topic_model.reduce_outliers(
                documents,
                raw_topics,
                embeddings=embeddings,  # Pass embeddings for accurate estimation
                probabilities=probs,
                strategy=request.strategy,
                threshold=request.threshold
            )
            
            # Restore the original model topics_ state
            if saved_topics is not None:
                topic_model.topics_ = saved_topics
            
            new_outliers = int(np.sum(np.array(new_topics) == -1))
            reduced_count = current_outliers - new_outliers
            
            return {
                "success": True,
                "current_outliers": current_outliers,
                "estimated_outliers": new_outliers,
                "reduced_count": reduced_count,
                "total_documents": total_docs,
                "current_percentage": round(current_outliers / total_docs * 100, 1) if total_docs > 0 else 0,
                "estimated_percentage": round(new_outliers / total_docs * 100, 1) if total_docs > 0 else 0,
                "strategy": request.strategy,
                "threshold": request.threshold
            }
        except Exception as e:
            logger.error(f"Error estimating outliers: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to estimate outliers: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Outlier estimation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Results Management ============

@router.get("/results")
async def list_results():
    """List cached analysis results"""
    results = []
    for result_id, data in _analysis_cache.items():
        results.append({
            'id': result_id,
            'topic_count': len([t for t in data.get('topics', []) if t.get('id', -1) != -1]),
            'document_count': len(data.get('document_topics', []))
        })
    return {"results": results}


@router.delete("/results/{result_id}")
async def delete_result(result_id: str):
    """Delete a cached analysis result"""
    if result_id in _analysis_cache:
        del _analysis_cache[result_id]
        return {"message": "Result deleted", "id": result_id}
    raise HTTPException(status_code=404, detail="Result not found")


@router.put("/results/{result_id}/topics")
async def update_topics(result_id: str, topics: List[Dict[str, Any]]):
    """Update topics (e.g., after Ollama naming) in cached result"""
    if result_id not in _analysis_cache:
        raise HTTPException(status_code=404, detail="Result not found")
    
    _analysis_cache[result_id]['topics'] = topics
    return {"message": "Topics updated", "id": result_id}


# ============ Topic Merge Endpoints ============

class MergeTopicsRequest(BaseModel):
    result_id: str
    topics_to_merge: List[int]  # List of topic IDs to merge (at least 2)


@router.post("/merge")
async def merge_topics(request: MergeTopicsRequest):
    """
    Merge multiple topics into one.
    Uses BERTopic's merge_topics method.
    
    Args:
        result_id: Analysis result ID
        topics_to_merge: List of topic IDs to merge (minimum 2)
    
    Returns:
        Updated topic list after merging
    """
    try:
        if request.result_id not in _analysis_cache:
            raise HTTPException(status_code=404, detail="Analysis result not found. Please run analysis first.")
        
        if len(request.topics_to_merge) < 2:
            raise HTTPException(status_code=400, detail="At least 2 topics are required for merging")
        
        cached = _analysis_cache[request.result_id]
        topic_model = cached.get('_topic_model')
        documents = cached.get('_documents', [])
        
        if topic_model is None:
            raise HTTPException(status_code=400, detail="Topic model not available")
        
        if not documents:
            raise HTTPException(status_code=400, detail="Documents not available for merge operation")
        
        # Validate all topic IDs exist (not -1 outlier)
        current_topics = cached.get('topics', [])
        valid_topic_ids = {t.get('id') for t in current_topics if t.get('id', -1) != -1}
        
        for tid in request.topics_to_merge:
            if tid not in valid_topic_ids:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid topic ID: {tid}. Must be a valid non-outlier topic."
                )
        
        logger.info(f"Merging topics: {request.topics_to_merge}")
        
        # Perform merge using BERTopic's merge_topics
        # merge_topics expects a list of lists, where each inner list contains topics to merge
        topic_model.merge_topics(documents, [request.topics_to_merge])
        
        # Get updated topic info
        updated_topic_info = topic_model.get_topic_info()
        
        # Rebuild topics list
        updated_topics = []
        custom_labels = {t.get('id'): t.get('custom_label', '') for t in current_topics}
        
        for _, row in updated_topic_info.iterrows():
            topic_id = int(row['Topic'])
            topic_words = topic_model.get_topic(topic_id)
            words = []
            if topic_words:
                for w, s in topic_words[:20]:
                    if w and str(w).strip():
                        words.append({'word': str(w), 'weight': float(s)})
            
            updated_topics.append({
                'id': topic_id,
                'name': row.get('Name', f'Topic {topic_id}'),
                'count': int(row['Count']),
                'words': words,
                'custom_label': custom_labels.get(topic_id, '')
            })
        
        # Update cache
        _analysis_cache[request.result_id]['topics'] = updated_topics
        _analysis_cache[request.result_id]['_raw_topics'] = topic_model.topics_
        
        # Recalculate stats
        valid_topics = [t for t in updated_topics if t['id'] != -1]
        outlier_count = sum(1 for t in topic_model.topics_ if t == -1)
        total_docs = len(documents)
        
        _analysis_cache[request.result_id]['stats'] = {
            'total_documents': total_docs,
            'total_topics': len(valid_topics),
            'outlier_count': outlier_count,
            'outlier_percentage': round(outlier_count / total_docs * 100, 2) if total_docs > 0 else 0
        }
        
        logger.info(f"Merge completed. Now have {len(valid_topics)} topics")
        
        return {
            "success": True,
            "message": f"Successfully merged {len(request.topics_to_merge)} topics",
            "topics": updated_topics,
            "stats": _analysis_cache[request.result_id]['stats']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Topic merge error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============ Custom Label Endpoints ============

class UpdateLabelRequest(BaseModel):
    topic_id: int
    custom_label: str


# ============ LDA Request/Response Models ============

class LDAPreprocessConfig(BaseModel):
    remove_stopwords: bool = True
    remove_punctuation: bool = True  # Remove punctuation and symbols
    lemmatize: bool = True
    lowercase: bool = True
    min_word_length: int = 2
    pos_filter: List[str] = ['PUNCT', 'SYM', 'X', 'NUM', 'INTJ']  # Default filter these
    pos_keep_mode: bool = False  # True for keep mode, False for filter mode (default: filter mode)


class LDAConfig(BaseModel):
    num_topics: int = 10
    # Gensim params
    passes: int = 10
    iterations: int = 50
    chunksize: int = 2000
    update_every: int = 1
    eval_every: int = 10
    minimum_probability: float = 0.01
    # Common params
    alpha: str = "auto"  # "auto", "symmetric", "asymmetric", or float value as string (Gensim supports asymmetric and custom array)
    eta: str = "auto"  # "auto", "symmetric", or float value as string
    min_df: int = 2
    max_df: float = 0.95
    top_n_keywords: int = 10
    random_state: int = 42


class LDAPreprocessPreviewRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    config: LDAPreprocessConfig
    max_preview: int = 5


class LDAAnalyzeRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    preprocess_config: LDAPreprocessConfig
    lda_config: LDAConfig


class LDAOptimizeRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    preprocess_config: LDAPreprocessConfig
    lda_config: LDAConfig
    topic_min: int = 2
    topic_max: int = 20
    step: int = 2


# ============ LDA Endpoints ============

# Store LDA results temporarily
_lda_analysis_cache: Dict[str, Any] = {}


@router.get("/lda/pos-tags")
async def get_lda_pos_tags():
    """Get available POS tags with descriptions"""
    try:
        from services.topic_modeling.lda_preprocess_service import get_lda_preprocess_service
        
        service = get_lda_preprocess_service()
        tags = service.get_pos_tags_info()
        
        return {"tags": tags}
        
    except Exception as e:
        logger.error(f"Get POS tags error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lda/preprocess/preview")
async def preview_lda_preprocess(request: LDAPreprocessPreviewRequest):
    """Preview LDA preprocessing results"""
    try:
        from services.topic_modeling.lda_preprocess_service import get_lda_preprocess_service
        
        service = get_lda_preprocess_service()
        result = service.preview_preprocess(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            config=request.config.model_dump(),
            max_preview=request.max_preview
        )
        
        return result
        
    except Exception as e:
        logger.error(f"LDA preprocess preview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lda/analyze")
async def analyze_lda(request: LDAAnalyzeRequest):
    """Perform LDA topic modeling analysis"""
    try:
        from services.topic_modeling.lda_service import get_lda_service
        
        service = get_lda_service()
        
        # Build LDA config dict
        lda_config = request.lda_config.model_dump()
        
        result = service.analyze(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            preprocess_config=request.preprocess_config.model_dump(),
            lda_config=lda_config
        )
        
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'LDA analysis failed'))
        
        # Cache result for visualization
        result_id = result.get('result_id')
        if result_id:
            _lda_analysis_cache[result_id] = result
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LDA analysis error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lda/optimize-topics")
async def optimize_lda_topics(request: LDAOptimizeRequest):
    """Find optimal number of topics"""
    try:
        from services.topic_modeling.lda_service import get_lda_service
        
        service = get_lda_service()
        
        result = service.optimize_num_topics(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            preprocess_config=request.preprocess_config.model_dump(),
            lda_config=request.lda_config.model_dump(),
            topic_range=(request.topic_min, request.topic_max),
            step=request.step
        )
        
        return result
        
    except Exception as e:
        logger.error(f"LDA optimize topics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lda/results/{result_id}")
async def get_lda_result(result_id: str):
    """Get cached LDA result by ID"""
    if result_id not in _lda_analysis_cache:
        raise HTTPException(status_code=404, detail="LDA result not found")
    
    return _lda_analysis_cache[result_id]


@router.get("/lda/results/{result_id}/similarity")
async def get_lda_topic_similarity(result_id: str):
    """Get topic similarity matrix for visualization"""
    try:
        from services.topic_modeling.lda_service import get_lda_service
        
        service = get_lda_service()
        result = service.get_topic_similarity_matrix(result_id)
        
        if result is None:
            raise HTTPException(status_code=404, detail="LDA result not found or invalid")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LDA similarity matrix error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/lda/results/{result_id}")
async def delete_lda_result(result_id: str):
    """Delete cached LDA result"""
    if result_id in _lda_analysis_cache:
        del _lda_analysis_cache[result_id]
        return {"message": "LDA result deleted", "id": result_id}
    raise HTTPException(status_code=404, detail="LDA result not found")


# ============ LDA Dynamic Topic Analysis ============

class LDADynamicConfig(BaseModel):
    """Dynamic topic analysis configuration for LDA"""
    enabled: bool = False
    date_format: str = "year_only"  # "year_only" or "full_date"
    nr_bins: Optional[int] = None


class LDADynamicAnalyzeRequest(BaseModel):
    """Request for LDA dynamic topic analysis"""
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    preprocess_config: LDAPreprocessConfig
    lda_config: LDAConfig
    dynamic_config: LDADynamicConfig
    text_dates: Dict[str, str]  # text_id -> date string mapping


@router.post("/lda/analyze-dynamic")
async def analyze_lda_dynamic(request: LDADynamicAnalyzeRequest):
    """Perform LDA topic modeling with dynamic topic evolution analysis"""
    try:
        from services.topic_modeling.lda_service import get_lda_service
        
        service = get_lda_service()
        
        result = service.analyze_dynamic(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            preprocess_config=request.preprocess_config.model_dump(),
            lda_config=request.lda_config.model_dump(),
            dynamic_config=request.dynamic_config.model_dump(),
            text_dates=request.text_dates
        )
        
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'LDA dynamic analysis failed'))
        
        # Cache result for visualization
        result_id = result.get('result_id')
        if result_id:
            _lda_analysis_cache[result_id] = result
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LDA dynamic analysis error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lda/results/{result_id}/evolution")
async def get_lda_topic_evolution(result_id: str):
    """Get topic evolution data for time-series visualization"""
    try:
        from services.topic_modeling.lda_service import get_lda_service
        
        service = get_lda_service()
        result = service.get_evolution_data(result_id)
        
        if result is None:
            raise HTTPException(status_code=404, detail="LDA result not found or no dynamic data available")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LDA evolution data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lda/results/{result_id}/sankey")
async def get_lda_sankey_data(result_id: str):
    """Get sankey diagram data for topic flow visualization"""
    try:
        from services.topic_modeling.lda_service import get_lda_service
        
        service = get_lda_service()
        result = service.get_sankey_data(result_id)
        
        if result is None:
            raise HTTPException(status_code=404, detail="LDA result not found or no dynamic data available")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LDA sankey data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lda/results")
async def list_lda_results():
    """List all cached LDA results"""
    results = []
    for result_id, data in _lda_analysis_cache.items():
        results.append({
            'id': result_id,
            'engine': data.get('engine'),
            'num_topics': data.get('num_topics'),
            'num_documents': data.get('num_documents'),
            'timestamp': data.get('timestamp')
        })
    return {"results": results}


# ============ LDA Ollama Naming & Custom Label Endpoints ============

class LDAOllamaNamingRequest(BaseModel):
    result_id: str
    base_url: str
    model: str
    prompt_template: Optional[str] = None
    language: str = "en"
    delay: float = 0.5
    top_n_words: int = 10


class LDAUpdateLabelRequest(BaseModel):
    topic_id: int
    custom_label: str


@router.post("/lda/ollama/naming")
async def generate_lda_topic_names(request: LDAOllamaNamingRequest):
    """Generate topic names for LDA using Ollama"""
    try:
        from services.topic_modeling import get_ollama_naming_service
        
        if request.result_id not in _lda_analysis_cache:
            raise HTTPException(status_code=404, detail="LDA result not found")
        
        cached = _lda_analysis_cache[request.result_id]
        topics = cached.get('topics', [])
        
        if not topics:
            raise HTTPException(status_code=400, detail="No topics found in LDA result")
        
        # Convert LDA topics to format expected by Ollama naming service
        # LDA topics have 'keywords' instead of 'words'
        ollama_topics = []
        for topic in topics:
            # Get keywords from LDA topic
            keywords = topic.get('keywords', [])
            words = [kw.get('word', '') for kw in keywords if kw.get('word')]
            
            ollama_topics.append({
                'id': topic.get('topic_id', -1),
                'words': [{'word': w} for w in words]
            })
        
        service = get_ollama_naming_service()
        
        # Check connection first
        connection = await service.check_connection(request.base_url)
        if not connection.get('connected'):
            raise HTTPException(status_code=503, detail="Ollama service not available")
        
        # Generate names
        updated_topics = await service.generate_all_topic_names(
            topics=ollama_topics,
            base_url=request.base_url,
            model=request.model,
            prompt_template=request.prompt_template,
            language=request.language,
            delay=request.delay,
            top_n_words=request.top_n_words
        )
        
        # Update original LDA topics with custom labels
        for updated in updated_topics:
            topic_id = updated.get('id')
            custom_label = updated.get('custom_label', '')
            for topic in topics:
                if topic.get('topic_id') == topic_id:
                    topic['custom_label'] = custom_label
                    break
        
        # Update cache
        _lda_analysis_cache[request.result_id]['topics'] = topics
        
        return {"success": True, "topics": topics}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LDA Ollama naming error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/lda/results/{result_id}/label")
async def update_lda_topic_label(result_id: str, request: LDAUpdateLabelRequest):
    """Update custom label for a single LDA topic"""
    try:
        if result_id not in _lda_analysis_cache:
            raise HTTPException(status_code=404, detail="LDA result not found")
        
        cached = _lda_analysis_cache[result_id]
        topics = cached.get('topics', [])
        
        # Find and update the topic
        topic_found = False
        for topic in topics:
            if topic.get('topic_id') == request.topic_id:
                topic['custom_label'] = request.custom_label.strip()
                topic_found = True
                break
        
        if not topic_found:
            raise HTTPException(status_code=404, detail=f"Topic {request.topic_id} not found")
        
        # Update cache
        _lda_analysis_cache[result_id]['topics'] = topics
        
        logger.info(f"Updated LDA label for topic {request.topic_id}: '{request.custom_label}'")
        
        return {
            "success": True,
            "message": f"Label updated for topic {request.topic_id}",
            "topic": next((t for t in topics if t.get('topic_id') == request.topic_id), None)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update LDA label error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/lda/results/{result_id}/topics")
async def update_lda_topics(result_id: str, topics: List[Dict[str, Any]]):
    """Update all LDA topics (e.g., after bulk Ollama naming)"""
    if result_id not in _lda_analysis_cache:
        raise HTTPException(status_code=404, detail="LDA result not found")
    
    _lda_analysis_cache[result_id]['topics'] = topics
    return {"message": "LDA topics updated", "id": result_id}


# ============ PyLDAvis Visualization Endpoint ============

@router.get("/lda/results/{result_id}/pyldavis")
async def get_lda_pyldavis(result_id: str):
    """
    Get pyLDAvis interactive visualization HTML for LDA result.
    
    Returns HTML string that can be embedded in iframe or displayed directly.
    Uses Gensim model data cached during analysis.
    """
    try:
        from services.topic_modeling.pyldavis_service import get_pyldavis_service
        from services.topic_modeling.lda_service import get_lda_service
        
        # Get cached LDA result
        lda_service = get_lda_service()
        result = lda_service.get_cached_result(result_id)
        
        if result is None:
            # Try from router cache
            if result_id in _lda_analysis_cache:
                result = _lda_analysis_cache[result_id]
            else:
                raise HTTPException(status_code=404, detail="LDA result not found")
        
        # Check for Gensim model data
        gensim_model = result.get('_gensim_model')
        gensim_corpus = result.get('_gensim_corpus')
        gensim_dictionary = result.get('_gensim_dictionary')
        
        if gensim_model is None or gensim_corpus is None or gensim_dictionary is None:
            raise HTTPException(
                status_code=400, 
                detail="Gensim model data not available. Please re-run LDA analysis."
            )
        
        # Generate pyLDAvis visualization
        pyldavis_service = get_pyldavis_service()
        
        n_topics = result.get('num_topics', 10)
        n_docs = result.get('num_documents', 0)
        cache_key = f"pyldavis_{result_id}"
        
        vis_result = pyldavis_service.generate_pyldavis_html(
            gensim_model=gensim_model,
            gensim_corpus=gensim_corpus,
            gensim_dictionary=gensim_dictionary,
            n_topics=n_topics,
            n_docs=n_docs,
            cache_key=cache_key
        )
        
        if not vis_result.get('success'):
            error_type = vis_result.get('error_type', 'unknown')
            error_msg = vis_result.get('error', 'Unknown error')
            
            if error_type == 'import_error':
                raise HTTPException(status_code=503, detail=error_msg)
            elif error_type == 'insufficient_data':
                return {
                    'success': False,
                    'error': error_msg,
                    'error_type': error_type,
                    'suggestions': vis_result.get('suggestions', []),
                    'n_topics': n_topics,
                    'n_docs': n_docs
                }
            else:
                raise HTTPException(status_code=500, detail=error_msg)
        
        return {
            'success': True,
            'html': vis_result.get('html'),
            'strategy': vis_result.get('strategy'),
            'cached': vis_result.get('cached', False),
            'n_topics': n_topics,
            'n_docs': n_docs
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PyLDAvis generation error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/results/{result_id}/label")
async def update_topic_label(result_id: str, request: UpdateLabelRequest):
    """
    Update custom label for a single topic.
    
    Args:
        result_id: Analysis result ID
        topic_id: Topic ID to update
        custom_label: New custom label (empty string to clear)
    
    Returns:
        Updated topic info
    """
    try:
        if result_id not in _analysis_cache:
            raise HTTPException(status_code=404, detail="Analysis result not found")
        
        cached = _analysis_cache[result_id]
        topics = cached.get('topics', [])
        topic_model = cached.get('_topic_model')
        
        # Find and update the topic
        topic_found = False
        for topic in topics:
            if topic.get('id') == request.topic_id:
                topic['custom_label'] = request.custom_label.strip()
                topic_found = True
                break
        
        if not topic_found:
            raise HTTPException(status_code=404, detail=f"Topic {request.topic_id} not found")
        
        # Update topic model's custom labels if available
        if topic_model is not None:
            try:
                # Build custom labels dict for the model
                custom_labels_dict = {}
                for t in topics:
                    if t.get('custom_label'):
                        custom_labels_dict[t['id']] = t['custom_label']
                
                if custom_labels_dict:
                    topic_model.set_topic_labels(custom_labels_dict)
                    logger.info(f"Updated topic model labels: {custom_labels_dict}")
            except Exception as e:
                logger.warning(f"Could not update topic model labels: {e}")
        
        # Update cache
        _analysis_cache[result_id]['topics'] = topics
        
        logger.info(f"Updated label for topic {request.topic_id}: '{request.custom_label}'")
        
        return {
            "success": True,
            "message": f"Label updated for topic {request.topic_id}",
            "topic": next((t for t in topics if t.get('id') == request.topic_id), None)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update label error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ LSA Request/Response Models ============

class LSAPreprocessConfig(BaseModel):
    """LSA preprocessing config - reuses LDA preprocessing service"""
    remove_stopwords: bool = True
    remove_punctuation: bool = True
    lemmatize: bool = True
    lowercase: bool = True
    min_word_length: int = 2
    pos_filter: List[str] = ['PUNCT', 'SYM', 'X', 'NUM', 'INTJ']
    pos_keep_mode: bool = False  # True for keep mode, False for filter mode


class LSAConfig(BaseModel):
    """LSA model configuration"""
    num_topics: int = 10
    num_keywords: int = 10
    svd_algorithm: str = "randomized"  # "randomized", "arpack"
    max_features: int = 10000
    min_df: int = 2
    max_df: float = 0.95
    tol: float = 0.0
    random_state: int = 42
    # Advanced parameters for randomized SVD
    n_iter: int = 5
    n_oversamples: int = 10
    power_iteration_normalizer: str = "auto"  # "auto", "QR", "LU", "none"


class LSAPreprocessPreviewRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    config: LSAPreprocessConfig
    max_preview: int = 5


class LSAAnalyzeRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    preprocess_config: LSAPreprocessConfig
    lsa_config: LSAConfig


class LSAOptimizeRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    preprocess_config: LSAPreprocessConfig
    lsa_config: LSAConfig
    topic_min: int = 2
    topic_max: int = 20
    step: int = 1


# ============ LSA Endpoints ============

# Store LSA results temporarily
_lsa_analysis_cache: Dict[str, Any] = {}


@router.post("/lsa/preprocess/preview")
async def preview_lsa_preprocess(request: LSAPreprocessPreviewRequest):
    """Preview LSA preprocessing results (uses same service as LDA)"""
    try:
        from services.topic_modeling.lda_preprocess_service import get_lda_preprocess_service
        
        service = get_lda_preprocess_service()
        result = service.preview_preprocess(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            config=request.config.model_dump(),
            max_preview=request.max_preview
        )
        
        return result
        
    except Exception as e:
        logger.error(f"LSA preprocess preview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lsa/analyze")
async def analyze_lsa(request: LSAAnalyzeRequest):
    """Perform LSA topic modeling analysis using TruncatedSVD"""
    try:
        from services.topic_modeling.lsa_service import get_lsa_service
        
        service = get_lsa_service()
        
        result = service.analyze(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            preprocess_config=request.preprocess_config.model_dump(),
            lsa_config=request.lsa_config.model_dump()
        )
        
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'LSA analysis failed'))
        
        # Cache result for visualization
        result_id = result.get('result_id')
        if result_id:
            _lsa_analysis_cache[result_id] = result
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LSA analysis error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lsa/optimize-topics")
async def optimize_lsa_topics(request: LSAOptimizeRequest):
    """Find optimal number of topics based on explained variance"""
    try:
        from services.topic_modeling.lsa_service import get_lsa_service
        
        service = get_lsa_service()
        
        result = service.optimize_topics(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            preprocess_config=request.preprocess_config.model_dump(),
            lsa_config=request.lsa_config.model_dump(),
            topic_range=(request.topic_min, request.topic_max),
            step=request.step
        )
        
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'LSA optimization failed'))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LSA optimize topics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lsa/results/{result_id}")
async def get_lsa_result(result_id: str):
    """Get cached LSA result by ID"""
    if result_id not in _lsa_analysis_cache:
        raise HTTPException(status_code=404, detail="LSA result not found")
    
    return _lsa_analysis_cache[result_id]


@router.get("/lsa/results/{result_id}/similarity")
async def get_lsa_topic_similarity(result_id: str):
    """Get topic similarity matrix for visualization"""
    try:
        from services.topic_modeling.lsa_service import get_lsa_service
        
        service = get_lsa_service()
        result = service.get_topic_similarity_matrix(result_id)
        
        if result is None:
            raise HTTPException(status_code=404, detail="LSA result not found or invalid")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LSA similarity matrix error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/lsa/results/{result_id}")
async def delete_lsa_result(result_id: str):
    """Delete cached LSA result"""
    if result_id in _lsa_analysis_cache:
        del _lsa_analysis_cache[result_id]
        return {"message": "LSA result deleted", "id": result_id}
    raise HTTPException(status_code=404, detail="LSA result not found")


@router.get("/lsa/results")
async def list_lsa_results():
    """List all cached LSA results"""
    results = []
    for result_id, data in _lsa_analysis_cache.items():
        results.append({
            'id': result_id,
            'num_topics': data.get('num_topics'),
            'num_documents': data.get('num_documents'),
            'explained_variance_ratio': data.get('explained_variance_ratio'),
            'timestamp': data.get('timestamp')
        })
    return {"results": results}


# ============ LSA Ollama Naming & Custom Label Endpoints ============

class LSAOllamaNamingRequest(BaseModel):
    result_id: str
    base_url: str
    model: str
    prompt_template: Optional[str] = None
    language: str = "en"
    delay: float = 0.5
    top_n_words: int = 10


class LSAUpdateLabelRequest(BaseModel):
    topic_id: int
    custom_label: str


@router.post("/lsa/ollama/naming")
async def generate_lsa_topic_names(request: LSAOllamaNamingRequest):
    """Generate topic names for LSA using Ollama"""
    try:
        from services.topic_modeling import get_ollama_naming_service
        
        if request.result_id not in _lsa_analysis_cache:
            raise HTTPException(status_code=404, detail="LSA result not found")
        
        cached = _lsa_analysis_cache[request.result_id]
        topics = cached.get('topics', [])
        
        if not topics:
            raise HTTPException(status_code=400, detail="No topics found in LSA result")
        
        # Convert LSA topics to format expected by Ollama naming service
        ollama_topics = []
        for topic in topics:
            keywords = topic.get('keywords', [])
            words = [kw.get('word', '') for kw in keywords if kw.get('word')]
            
            ollama_topics.append({
                'id': topic.get('topic_id', -1),
                'words': [{'word': w} for w in words]
            })
        
        service = get_ollama_naming_service()
        
        # Check connection first
        connection = await service.check_connection(request.base_url)
        if not connection.get('connected'):
            raise HTTPException(status_code=503, detail="Ollama service not available")
        
        # Generate names
        updated_topics = await service.generate_all_topic_names(
            topics=ollama_topics,
            base_url=request.base_url,
            model=request.model,
            prompt_template=request.prompt_template,
            language=request.language,
            delay=request.delay,
            top_n_words=request.top_n_words
        )
        
        # Update original LSA topics with custom labels
        for updated in updated_topics:
            topic_id = updated.get('id')
            custom_label = updated.get('custom_label', '')
            for topic in topics:
                if topic.get('topic_id') == topic_id:
                    topic['custom_label'] = custom_label
                    break
        
        # Update cache
        _lsa_analysis_cache[request.result_id]['topics'] = topics
        
        return {"success": True, "topics": topics}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LSA Ollama naming error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/lsa/results/{result_id}/label")
async def update_lsa_topic_label(result_id: str, request: LSAUpdateLabelRequest):
    """Update custom label for a single LSA topic"""
    try:
        if result_id not in _lsa_analysis_cache:
            raise HTTPException(status_code=404, detail="LSA result not found")
        
        cached = _lsa_analysis_cache[result_id]
        topics = cached.get('topics', [])
        
        # Find and update the topic
        topic_found = False
        for topic in topics:
            if topic.get('topic_id') == request.topic_id:
                topic['custom_label'] = request.custom_label.strip()
                topic_found = True
                break
        
        if not topic_found:
            raise HTTPException(status_code=404, detail=f"Topic {request.topic_id} not found")
        
        # Update cache
        _lsa_analysis_cache[result_id]['topics'] = topics
        
        logger.info(f"Updated LSA label for topic {request.topic_id}: '{request.custom_label}'")
        
        return {
            "success": True,
            "message": f"Label updated for topic {request.topic_id}",
            "topic": next((t for t in topics if t.get('topic_id') == request.topic_id), None)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update LSA label error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/lsa/results/{result_id}/topics")
async def update_lsa_topics(result_id: str, topics: List[Dict[str, Any]]):
    """Update all LSA topics (e.g., after bulk Ollama naming)"""
    if result_id not in _lsa_analysis_cache:
        raise HTTPException(status_code=404, detail="LSA result not found")
    
    _lsa_analysis_cache[result_id]['topics'] = topics
    return {"message": "LSA topics updated", "id": result_id}


# ============ NMF Request/Response Models ============

class NMFPreprocessConfig(BaseModel):
    """NMF preprocessing config - reuses LDA preprocessing service"""
    remove_stopwords: bool = True
    remove_punctuation: bool = True
    lemmatize: bool = True
    lowercase: bool = True
    min_word_length: int = 2
    pos_filter: List[str] = ['PUNCT', 'SYM', 'X', 'NUM', 'INTJ']
    pos_keep_mode: bool = False  # True for keep mode, False for filter mode


class NMFConfig(BaseModel):
    """NMF model configuration"""
    num_topics: int = 10
    num_keywords: int = 10
    init: str = "nndsvd"  # "nndsvd", "nndsvda", "nndsvdar", "random"
    solver: str = "cd"  # "cd", "mu"
    max_iter: int = 200
    tol: float = 1e-4
    alpha_W: float = 0.0
    alpha_H: float = 0.0
    l1_ratio: float = 0.0
    beta_loss: str = "frobenius"  # "frobenius", "kullback-leibler", "itakura-saito"
    shuffle: bool = False
    random_state: int = 42
    max_features: int = 10000
    min_df: int = 2
    max_df: float = 0.95


class NMFPreprocessPreviewRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    config: NMFPreprocessConfig
    max_preview: int = 5


class NMFAnalyzeRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    preprocess_config: NMFPreprocessConfig
    nmf_config: NMFConfig


class NMFOptimizeRequest(BaseModel):
    corpus_id: str
    text_ids: List[str]
    language: str = "english"
    preprocess_config: NMFPreprocessConfig
    nmf_config: NMFConfig
    topic_min: int = 2
    topic_max: int = 20
    step: int = 1


# ============ NMF Endpoints ============

# Store NMF results temporarily
_nmf_analysis_cache: Dict[str, Any] = {}


@router.post("/nmf/preprocess/preview")
async def preview_nmf_preprocess(request: NMFPreprocessPreviewRequest):
    """Preview NMF preprocessing results (uses same service as LDA)"""
    try:
        from services.topic_modeling.lda_preprocess_service import get_lda_preprocess_service
        
        service = get_lda_preprocess_service()
        result = service.preview_preprocess(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            config=request.config.model_dump(),
            max_preview=request.max_preview
        )
        
        return result
        
    except Exception as e:
        logger.error(f"NMF preprocess preview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nmf/analyze")
async def analyze_nmf(request: NMFAnalyzeRequest):
    """Perform NMF topic modeling analysis"""
    try:
        from services.topic_modeling.nmf_service import get_nmf_service
        
        service = get_nmf_service()
        
        result = service.analyze(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            preprocess_config=request.preprocess_config.model_dump(),
            nmf_config=request.nmf_config.model_dump()
        )
        
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'NMF analysis failed'))
        
        # Cache result for visualization
        result_id = result.get('result_id')
        if result_id:
            _nmf_analysis_cache[result_id] = result
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"NMF analysis error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nmf/optimize-topics")
async def optimize_nmf_topics(request: NMFOptimizeRequest):
    """Find optimal number of topics based on reconstruction error"""
    try:
        from services.topic_modeling.nmf_service import get_nmf_service
        
        service = get_nmf_service()
        
        result = service.optimize_topics(
            corpus_id=request.corpus_id,
            text_ids=request.text_ids,
            language=request.language,
            preprocess_config=request.preprocess_config.model_dump(),
            nmf_config=request.nmf_config.model_dump(),
            topic_range=(request.topic_min, request.topic_max),
            step=request.step
        )
        
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'NMF optimization failed'))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"NMF optimize topics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nmf/results/{result_id}")
async def get_nmf_result(result_id: str):
    """Get cached NMF result by ID"""
    if result_id not in _nmf_analysis_cache:
        raise HTTPException(status_code=404, detail="NMF result not found")
    
    return _nmf_analysis_cache[result_id]


@router.get("/nmf/results/{result_id}/similarity")
async def get_nmf_topic_similarity(result_id: str):
    """Get topic similarity matrix for visualization"""
    try:
        from services.topic_modeling.nmf_service import get_nmf_service
        
        service = get_nmf_service()
        result = service.get_topic_similarity_matrix(result_id)
        
        if result is None:
            raise HTTPException(status_code=404, detail="NMF result not found or invalid")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"NMF similarity matrix error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/nmf/results/{result_id}")
async def delete_nmf_result(result_id: str):
    """Delete cached NMF result"""
    if result_id in _nmf_analysis_cache:
        del _nmf_analysis_cache[result_id]
        return {"message": "NMF result deleted", "id": result_id}
    raise HTTPException(status_code=404, detail="NMF result not found")


@router.get("/nmf/results")
async def list_nmf_results():
    """List all cached NMF results"""
    results = []
    for result_id, data in _nmf_analysis_cache.items():
        results.append({
            'id': result_id,
            'num_topics': data.get('num_topics'),
            'num_documents': data.get('num_documents'),
            'reconstruction_error': data.get('reconstruction_error'),
            'sparsity': data.get('sparsity'),
            'timestamp': data.get('timestamp')
        })
    return {"results": results}


# ============ NMF Ollama Naming & Custom Label Endpoints ============

class NMFOllamaNamingRequest(BaseModel):
    result_id: str
    base_url: str
    model: str
    prompt_template: Optional[str] = None
    language: str = "en"
    delay: float = 0.5
    top_n_words: int = 10


class NMFUpdateLabelRequest(BaseModel):
    topic_id: int
    custom_label: str


@router.post("/nmf/ollama/naming")
async def generate_nmf_topic_names(request: NMFOllamaNamingRequest):
    """Generate topic names for NMF using Ollama"""
    try:
        from services.topic_modeling import get_ollama_naming_service
        
        if request.result_id not in _nmf_analysis_cache:
            raise HTTPException(status_code=404, detail="NMF result not found")
        
        cached = _nmf_analysis_cache[request.result_id]
        topics = cached.get('topics', [])
        
        if not topics:
            raise HTTPException(status_code=400, detail="No topics found in NMF result")
        
        # Convert NMF topics to format expected by Ollama naming service
        ollama_topics = []
        for topic in topics:
            keywords = topic.get('keywords', [])
            words = [kw.get('word', '') for kw in keywords if kw.get('word')]
            
            ollama_topics.append({
                'id': topic.get('topic_id', -1),
                'words': [{'word': w} for w in words]
            })
        
        service = get_ollama_naming_service()
        
        # Check connection first
        connection = await service.check_connection(request.base_url)
        if not connection.get('connected'):
            raise HTTPException(status_code=503, detail="Ollama service not available")
        
        # Generate names
        updated_topics = await service.generate_all_topic_names(
            topics=ollama_topics,
            base_url=request.base_url,
            model=request.model,
            prompt_template=request.prompt_template,
            language=request.language,
            delay=request.delay,
            top_n_words=request.top_n_words
        )
        
        # Update original NMF topics with custom labels
        for updated in updated_topics:
            topic_id = updated.get('id')
            custom_label = updated.get('custom_label', '')
            for topic in topics:
                if topic.get('topic_id') == topic_id:
                    topic['custom_label'] = custom_label
                    break
        
        # Update cache
        _nmf_analysis_cache[request.result_id]['topics'] = topics
        
        return {"success": True, "topics": topics}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"NMF Ollama naming error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/nmf/results/{result_id}/label")
async def update_nmf_topic_label(result_id: str, request: NMFUpdateLabelRequest):
    """Update custom label for a single NMF topic"""
    try:
        if result_id not in _nmf_analysis_cache:
            raise HTTPException(status_code=404, detail="NMF result not found")
        
        cached = _nmf_analysis_cache[result_id]
        topics = cached.get('topics', [])
        
        # Find and update the topic
        topic_found = False
        for topic in topics:
            if topic.get('topic_id') == request.topic_id:
                topic['custom_label'] = request.custom_label.strip()
                topic_found = True
                break
        
        if not topic_found:
            raise HTTPException(status_code=404, detail=f"Topic {request.topic_id} not found")
        
        # Update cache
        _nmf_analysis_cache[result_id]['topics'] = topics
        
        logger.info(f"Updated NMF label for topic {request.topic_id}: '{request.custom_label}'")
        
        return {
            "success": True,
            "message": f"Label updated for topic {request.topic_id}",
            "topic": next((t for t in topics if t.get('topic_id') == request.topic_id), None)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update NMF label error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/nmf/results/{result_id}/topics")
async def update_nmf_topics(result_id: str, topics: List[Dict[str, Any]]):
    """Update all NMF topics (e.g., after bulk Ollama naming)"""
    if result_id not in _nmf_analysis_cache:
        raise HTTPException(status_code=404, detail="NMF result not found")
    
    _nmf_analysis_cache[result_id]['topics'] = topics
    return {"message": "NMF topics updated", "id": result_id}

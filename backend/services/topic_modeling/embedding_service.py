"""
Topic Modeling Embedding Service
SBERT-based text embedding for topic modeling
"""

import logging
import os
import time
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import DATA_DIR, MODELS_DIR, TOPIC_MODELING_DIR

logger = logging.getLogger(__name__)

# Fixed SBERT model path
SBERT_MODEL_PATH = MODELS_DIR / "sentence_embeddings" / "paraphrase-multilingual-MiniLM-L12-v2"


class TopicEmbeddingService:
    """Service for creating text embeddings using SBERT"""
    
    def __init__(self):
        self.data_dir = DATA_DIR
        self.embedding_dir = TOPIC_MODELING_DIR / "embeddings"
        self.embedding_dir.mkdir(parents=True, exist_ok=True)
        self._model = None
        self._model_loaded = False
    
    def _load_model(self):
        """Lazy load the SBERT model"""
        if self._model_loaded:
            return self._model
        
        try:
            from sentence_transformers import SentenceTransformer
            
            model_path = SBERT_MODEL_PATH
            if not model_path.exists():
                raise ValueError(f"SBERT model not found at {model_path}")
            
            logger.info(f"Loading SBERT model from {model_path}")
            start_time = time.time()
            
            self._model = SentenceTransformer(str(model_path))
            # paraphrase-multilingual-MiniLM-L12-v2 default is 128, but can handle up to 512
            self._model.max_seq_length = 256
            
            logger.info(f"SBERT model loaded in {time.time() - start_time:.2f}s")
            self._model_loaded = True
            
            return self._model
            
        except ImportError:
            logger.error("sentence-transformers not installed")
            raise ImportError("Please install sentence-transformers: pip install sentence-transformers")
        except Exception as e:
            logger.error(f"Error loading SBERT model: {e}")
            raise
    
    def create_embeddings(
        self,
        documents: List[str],
        corpus_id: str,
        text_ids: Optional[List[str]] = None,
        batch_size: int = 32,
        device: str = "cpu",
        normalize: bool = False,
        show_progress: bool = True
    ) -> Dict[str, Any]:
        """
        Create embeddings for documents
        
        Args:
            documents: List of preprocessed documents (chunks)
            corpus_id: Corpus identifier for naming
            text_ids: List of text IDs for each document/chunk (for date metadata mapping)
            batch_size: Batch size for encoding
            device: Device to use (cpu/cuda)
            normalize: Whether to normalize embeddings
            show_progress: Show progress bar
            
        Returns:
            Dictionary with:
                - embedding_path: Path to saved embedding file
                - documents_path: Path to saved documents file
                - shape: Embedding shape
                - stats: Processing statistics
        """
        if not documents:
            raise ValueError("No documents provided for embedding")
        
        # Load model
        model = self._load_model()
        
        logger.info(f"Creating embeddings for {len(documents)} documents")
        start_time = time.time()
        
        # Create embeddings
        embeddings = model.encode(
            documents,
            batch_size=batch_size,
            show_progress_bar=show_progress,
            convert_to_numpy=True,
            device=device,
            normalize_embeddings=normalize
        )
        
        encoding_time = time.time() - start_time
        logger.info(f"Encoding completed in {encoding_time:.2f}s")
        logger.info(f"Embedding shape: {embeddings.shape}")
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"{corpus_id}_{timestamp}"
        
        # Save embeddings
        embedding_path = self.embedding_dir / f"{base_name}.npy"
        np.save(str(embedding_path), embeddings)
        logger.info(f"Embeddings saved to {embedding_path}")
        
        # Save corresponding documents (for matching during analysis)
        documents_path = self.embedding_dir / f"{base_name}_docs.txt"
        with open(documents_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(documents))
        logger.info(f"Documents saved to {documents_path}")
        
        # Save text_ids mapping (for date metadata in dynamic topic analysis)
        if text_ids and len(text_ids) == len(documents):
            import json
            text_ids_path = self.embedding_dir / f"{base_name}_text_ids.json"
            with open(text_ids_path, 'w', encoding='utf-8') as f:
                json.dump(text_ids, f)
            logger.info(f"Text IDs saved to {text_ids_path}")
        
        return {
            'embedding_path': str(embedding_path),
            'documents_path': str(documents_path),
            'embedding_id': base_name,
            'shape': list(embeddings.shape),
            'stats': {
                'document_count': len(documents),
                'embedding_dim': embeddings.shape[1],
                'encoding_time': round(encoding_time, 2),
                'model': SBERT_MODEL_PATH.name
            }
        }
    
    def load_embeddings(self, embedding_id: str) -> Tuple[np.ndarray, List[str], Optional[List[str]]]:
        """
        Load embeddings, documents, and text_ids mapping
        
        Args:
            embedding_id: Embedding identifier (filename without extension)
            
        Returns:
            Tuple of (embeddings array, documents list, text_ids list or None)
        """
        embedding_path = self.embedding_dir / f"{embedding_id}.npy"
        documents_path = self.embedding_dir / f"{embedding_id}_docs.txt"
        text_ids_path = self.embedding_dir / f"{embedding_id}_text_ids.json"
        
        if not embedding_path.exists():
            raise FileNotFoundError(f"Embedding file not found: {embedding_path}")
        
        embeddings = np.load(str(embedding_path))
        
        documents = []
        if documents_path.exists():
            with open(documents_path, 'r', encoding='utf-8') as f:
                documents = f.read().split('\n')
        
        # Load text_ids mapping if exists (for chunked embeddings)
        text_ids = None
        if text_ids_path.exists():
            import json
            with open(text_ids_path, 'r', encoding='utf-8') as f:
                text_ids = json.load(f)
        
        return embeddings, documents, text_ids
    
    def list_embeddings(self, corpus_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List available embedding files
        
        Args:
            corpus_id: Optional corpus ID to filter by
            
        Returns:
            List of embedding file info
        """
        embeddings = []
        
        for npy_file in self.embedding_dir.glob("*.npy"):
            file_name = npy_file.stem
            
            # Skip if filtering by corpus and doesn't match
            if corpus_id and not file_name.startswith(corpus_id):
                continue
            
            # Get file stats
            stat = npy_file.stat()
            
            # Try to get shape without loading full file
            try:
                with open(npy_file, 'rb') as f:
                    version = np.lib.format.read_magic(f)
                    shape, _, _ = np.lib.format._read_array_header(f, version)
            except:
                shape = None
            
            # Check if documents file exists
            docs_path = self.embedding_dir / f"{file_name}_docs.txt"
            has_docs = docs_path.exists()
            
            # Parse corpus_id and timestamp from filename
            parts = file_name.rsplit('_', 2)
            if len(parts) >= 3:
                parsed_corpus_id = '_'.join(parts[:-2])
                timestamp_str = f"{parts[-2]}_{parts[-1]}"
            else:
                parsed_corpus_id = file_name
                timestamp_str = ""
            
            embeddings.append({
                'id': file_name,
                'corpus_id': parsed_corpus_id,
                'path': str(npy_file),
                'shape': list(shape) if shape else None,
                'size_mb': round(stat.st_size / (1024 * 1024), 2),
                'created_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                'has_documents': has_docs,
                'timestamp': timestamp_str
            })
        
        # Sort by creation time, newest first
        embeddings.sort(key=lambda x: x['created_at'], reverse=True)
        
        return embeddings
    
    def delete_embedding(self, embedding_id: str) -> bool:
        """
        Delete an embedding file and its associated documents
        
        Args:
            embedding_id: Embedding identifier
            
        Returns:
            True if deleted successfully
        """
        embedding_path = self.embedding_dir / f"{embedding_id}.npy"
        documents_path = self.embedding_dir / f"{embedding_id}_docs.txt"
        text_ids_path = self.embedding_dir / f"{embedding_id}_text_ids.json"
        
        deleted = False
        
        if embedding_path.exists():
            embedding_path.unlink()
            deleted = True
            logger.info(f"Deleted embedding file: {embedding_path}")
        
        if documents_path.exists():
            documents_path.unlink()
            logger.info(f"Deleted documents file: {documents_path}")
        
        if text_ids_path.exists():
            text_ids_path.unlink()
            logger.info(f"Deleted text_ids file: {text_ids_path}")
        
        return deleted
    
    def rename_embedding(self, embedding_id: str, new_name: str) -> Dict[str, Any]:
        """
        Rename an embedding file and its associated documents
        
        Args:
            embedding_id: Current embedding identifier
            new_name: New name for the embedding
            
        Returns:
            Dict with new embedding info
        """
        # Validate new name (no special characters except underscore and hyphen)
        import re
        if not re.match(r'^[\w\-]+$', new_name):
            raise ValueError("Invalid name. Use only letters, numbers, underscore and hyphen.")
        
        embedding_path = self.embedding_dir / f"{embedding_id}.npy"
        documents_path = self.embedding_dir / f"{embedding_id}_docs.txt"
        text_ids_path = self.embedding_dir / f"{embedding_id}_text_ids.json"
        
        if not embedding_path.exists():
            raise FileNotFoundError(f"Embedding not found: {embedding_id}")
        
        new_embedding_path = self.embedding_dir / f"{new_name}.npy"
        new_documents_path = self.embedding_dir / f"{new_name}_docs.txt"
        new_text_ids_path = self.embedding_dir / f"{new_name}_text_ids.json"
        
        # Check if new name already exists
        if new_embedding_path.exists():
            raise ValueError(f"Embedding with name '{new_name}' already exists")
        
        # Rename files
        embedding_path.rename(new_embedding_path)
        logger.info(f"Renamed embedding: {embedding_path} -> {new_embedding_path}")
        
        if documents_path.exists():
            documents_path.rename(new_documents_path)
            logger.info(f"Renamed documents: {documents_path} -> {new_documents_path}")
        
        if text_ids_path.exists():
            text_ids_path.rename(new_text_ids_path)
            logger.info(f"Renamed text_ids: {text_ids_path} -> {new_text_ids_path}")
        
        # Get file stats
        stat = new_embedding_path.stat()
        
        # Get shape
        try:
            with open(new_embedding_path, 'rb') as f:
                version = np.lib.format.read_magic(f)
                shape, _, _ = np.lib.format._read_array_header(f, version)
        except:
            shape = None
        
        return {
            'id': new_name,
            'path': str(new_embedding_path),
            'shape': list(shape) if shape else None,
            'size_mb': round(stat.st_size / (1024 * 1024), 2),
            'created_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
            'has_documents': new_documents_path.exists()
        }
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the SBERT model"""
        model_path = Path(SBERT_MODEL_PATH)
        
        info = {
            'model_path': str(model_path),
            'model_name': model_path.name,
            'exists': model_path.exists(),
            'loaded': self._model_loaded
        }
        
        if model_path.exists():
            # Try to get model config
            config_path = model_path / "config.json"
            if config_path.exists():
                try:
                    import json
                    with open(config_path, 'r') as f:
                        config = json.load(f)
                    info['hidden_size'] = config.get('hidden_size')
                    info['max_position_embeddings'] = config.get('max_position_embeddings')
                except:
                    pass
        
        return info


# Singleton instance
_embedding_service = None


def get_topic_embedding_service() -> TopicEmbeddingService:
    """Get topic embedding service singleton"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = TopicEmbeddingService()
    return _embedding_service

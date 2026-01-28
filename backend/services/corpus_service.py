"""
Corpus Management Service
Handles file storage, metadata management, and processing orchestration
"""

import os
import uuid
import json
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from models.database import CorpusDB, TextDB, TagDB, TaskDB
from models.corpus import (
    MediaType, TaskStatus, TaskType,
    CorpusCreate, CorpusUpdate, Corpus,
    TextMetadata, CorpusText,
    UploadConfig, UploadResult
)

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import DATA_DIR, CORPORA_DIR, ANNOTATIONS_DIR

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def ensure_dirs():
    """Ensure data directories exist"""
    CORPORA_DIR.mkdir(parents=True, exist_ok=True)


class CorpusService:
    """Corpus management service"""
    
    def __init__(self):
        ensure_dirs()
    
    # ==================== Corpus CRUD ====================
    
    def create_corpus(self, data: CorpusCreate) -> Dict[str, Any]:
        """Create a new corpus"""
        try:
            corpus_id = str(uuid.uuid4())
            
            # Create corpus directory
            corpus_dir = CORPORA_DIR / data.name
            if corpus_dir.exists():
                return {"success": False, "error": f"Corpus '{data.name}' already exists"}
            
            corpus_dir.mkdir(parents=True)
            (corpus_dir / "files").mkdir()
            (corpus_dir / "audios").mkdir()
            (corpus_dir / "videos").mkdir()
            (corpus_dir / "preprocessed").mkdir()
            
            # Save to database
            corpus_data = {
                'id': corpus_id,
                'name': data.name,
                'language': data.language,
                'author': data.author,
                'source': data.source,
                'text_type': data.text_type,
                'description': data.description,
                'tags': data.tags
            }
            
            corpus = CorpusDB.create(corpus_data)
            
            # Save metadata to file
            self._save_corpus_metadata(data.name, corpus)
            
            logger.info(f"Created corpus: {data.name}")
            return {"success": True, "data": corpus}
            
        except Exception as e:
            logger.error(f"Failed to create corpus: {e}")
            return {"success": False, "error": str(e)}
    
    def get_corpus(self, corpus_id: str) -> Optional[Dict[str, Any]]:
        """Get corpus by ID"""
        return CorpusDB.get_by_id(corpus_id)
    
    def get_corpus_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get corpus by name"""
        return CorpusDB.get_by_name(name)
    
    def list_corpora(self) -> List[Dict[str, Any]]:
        """List all corpora"""
        return CorpusDB.list_all()
    
    def update_corpus(self, corpus_id: str, data: CorpusUpdate) -> Dict[str, Any]:
        """Update corpus metadata"""
        try:
            corpus = CorpusDB.get_by_id(corpus_id)
            if not corpus:
                return {"success": False, "error": "Corpus not found"}
            
            old_name = corpus['name']
            
            update_data = data.dict(exclude_unset=True)
            
            # Handle name change (directory rename)
            if 'name' in update_data and update_data['name'] != old_name:
                new_name = update_data['name']
                
                # Rename corpus directory
                old_dir = CORPORA_DIR / old_name
                new_dir = CORPORA_DIR / new_name
                if new_dir.exists():
                    return {"success": False, "error": f"Corpus '{new_name}' already exists"}
                if old_dir.exists():
                    old_dir.rename(new_dir)
                
                # Also rename annotations directory to keep archives accessible
                old_annotations_dir = ANNOTATIONS_DIR / old_name
                new_annotations_dir = ANNOTATIONS_DIR / new_name
                if old_annotations_dir.exists():
                    if new_annotations_dir.exists():
                        logger.warning(f"Annotations directory {new_annotations_dir} already exists, merging not supported")
                    else:
                        old_annotations_dir.rename(new_annotations_dir)
                        logger.info(f"Renamed annotations directory: {old_annotations_dir} -> {new_annotations_dir}")
                        
                        # Update corpusName field in all archive files
                        self._update_archives_corpus_name(new_annotations_dir, new_name)
            
            updated = CorpusDB.update(corpus_id, update_data)
            
            # Update metadata file
            if updated:
                self._save_corpus_metadata(updated['name'], updated)
            
            return {"success": True, "data": updated}
            
        except Exception as e:
            logger.error(f"Failed to update corpus: {e}")
            return {"success": False, "error": str(e)}
    
    def delete_corpus(self, corpus_id: str) -> Dict[str, Any]:
        """Delete corpus and all its related files including annotations and embeddings"""
        try:
            corpus = CorpusDB.get_by_id(corpus_id)
            if not corpus:
                return {"success": False, "error": "Corpus not found"}
            
            corpus_name = corpus['name']
            deleted_items = []
            
            # Use onexc handler to ignore FileNotFoundError (macOS AppleDouble race condition)
            def rmtree_onexc(func, path, exc):
                """Handle errors during rmtree - ignore FileNotFoundError for race conditions"""
                if isinstance(exc, FileNotFoundError):
                    # File was already deleted (e.g., macOS AppleDouble metadata files)
                    pass
                else:
                    raise exc
            
            # 1. Delete main corpus directory
            corpus_dir = CORPORA_DIR / corpus_name
            if corpus_dir.exists():
                shutil.rmtree(corpus_dir, onexc=rmtree_onexc)
                deleted_items.append(f"Corpus directory: {corpus_dir}")
            
            # 2. Delete annotations directory for this corpus
            corpus_annotations_dir = ANNOTATIONS_DIR / corpus_name
            if corpus_annotations_dir.exists():
                shutil.rmtree(corpus_annotations_dir, onexc=rmtree_onexc)
                deleted_items.append(f"Annotations: {corpus_annotations_dir}")
            
            # 3. Delete topic modeling embeddings for this corpus
            embeddings_dir = Path("./data/topic_modeling/embeddings")
            if embeddings_dir.exists():
                for emb_file in embeddings_dir.glob(f"{corpus_id}_*.npz"):
                    emb_file.unlink()
                    deleted_items.append(f"Embedding: {emb_file.name}")
                for doc_file in embeddings_dir.glob(f"{corpus_id}_*.json"):
                    doc_file.unlink()
                    deleted_items.append(f"Embedding docs: {doc_file.name}")
            
            # 4. Delete topic modeling results for this corpus
            results_dir = Path("./data/topic_modeling/results")
            if results_dir.exists():
                for result_file in results_dir.glob(f"{corpus_id}_*.json"):
                    result_file.unlink()
                    deleted_items.append(f"Topic result: {result_file.name}")
            
            # 5. Delete from database (this will also delete related texts via cascade)
            CorpusDB.delete(corpus_id)
            
            logger.info(f"Deleted corpus '{corpus_name}' and {len(deleted_items)} related items")
            return {
                "success": True, 
                "message": f"Corpus '{corpus_name}' deleted successfully",
                "deleted_items": deleted_items
            }
            
        except Exception as e:
            logger.error(f"Failed to delete corpus: {e}")
            return {"success": False, "error": str(e)}
    
    # ==================== Text CRUD ====================
    
    def list_texts(self, corpus_id: str) -> List[Dict[str, Any]]:
        """List all texts in a corpus"""
        return TextDB.list_by_corpus(corpus_id)
    
    def get_text(self, text_id: str) -> Optional[Dict[str, Any]]:
        """Get text by ID"""
        return TextDB.get_by_id(text_id)
    
    def get_text_content(self, text_id: str) -> Dict[str, Any]:
        """Get text content and metadata"""
        text = TextDB.get_by_id(text_id)
        if not text:
            return {"success": False, "error": "Text not found"}
        
        content = None
        transcript = None
        
        # Read text content
        if text.get('content_path') and os.path.exists(text['content_path']):
            try:
                with open(text['content_path'], 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception as e:
                logger.error(f"Failed to read content: {e}")
        
        # Read transcript JSON if available
        if text.get('transcript_json_path') and os.path.exists(text['transcript_json_path']):
            try:
                with open(text['transcript_json_path'], 'r', encoding='utf-8') as f:
                    transcript = json.load(f)
            except Exception as e:
                logger.error(f"Failed to read transcript: {e}")
        
        return {
            "success": True,
            "data": text,
            "content": content,
            "transcript": transcript
        }
    
    def update_text(self, text_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update text metadata"""
        try:
            text = TextDB.get_by_id(text_id)
            if not text:
                return {"success": False, "error": "Text not found"}
            
            updated = TextDB.update(text_id, data)
            return {"success": True, "data": updated}
            
        except Exception as e:
            logger.error(f"Failed to update text: {e}")
            return {"success": False, "error": str(e)}
    
    def update_text_content(self, text_id: str, content: str) -> Dict[str, Any]:
        """Update text file content and regenerate SpaCy and USAS annotations"""
        try:
            text = TextDB.get_by_id(text_id)
            if not text:
                return {"success": False, "error": "Text not found"}
            
            if not text.get('content_path'):
                return {"success": False, "error": "No content path"}
            
            # Get corpus language and text type for annotations
            corpus_id = text.get('corpus_id')
            corpus = CorpusDB.get_by_id(corpus_id) if corpus_id else None
            corpus_language = corpus.get('language', 'english') if corpus else 'english'
            
            # Get text type from metadata
            text_metadata = text.get('metadata', {})
            if isinstance(text_metadata, str):
                try:
                    text_metadata = json.loads(text_metadata)
                except:
                    text_metadata = {}
            text_type = text_metadata.get('textType')
            
            with open(text['content_path'], 'w', encoding='utf-8') as f:
                f.write(content)
            
            # Update word count
            word_count = len(content.split())
            TextDB.update(text_id, {'word_count': word_count})
            
            content_path = Path(text['content_path'])
            
            # Regenerate SpaCy annotations for the updated content
            spacy_result = None
            try:
                spacy_result = self._annotate_text_with_spacy(
                    content, 
                    corpus_language,
                    content_path.parent,
                    content_path.stem
                )
            except Exception as e:
                logger.warning(f"Failed to regenerate SpaCy annotations: {e}")
            
            # Regenerate USAS annotations for the updated content
            usas_result = None
            try:
                usas_result = self._annotate_text_with_usas(
                    content,
                    corpus_language,
                    content_path.parent,
                    content_path.stem,
                    text_type
                )
            except Exception as e:
                logger.warning(f"Failed to regenerate USAS annotations: {e}")
            
            # Regenerate MIPVU annotations for the updated content (only for English)
            mipvu_result = None
            try:
                mipvu_result = self._annotate_text_with_mipvu(
                    content,
                    corpus_language,
                    content_path.parent,
                    content_path.stem,
                    spacy_result
                )
            except Exception as e:
                logger.warning(f"Failed to regenerate MIPVU annotations: {e}")
            
            return {
                "success": True, 
                "message": "Content updated", 
                "spacy_regenerated": spacy_result is not None,
                "usas_regenerated": usas_result is not None,
                "mipvu_regenerated": mipvu_result is not None
            }
            
        except Exception as e:
            logger.error(f"Failed to update content: {e}")
            return {"success": False, "error": str(e)}
    
    def delete_text(self, text_id: str) -> Dict[str, Any]:
        """Delete text and its files, including annotation archives"""
        try:
            text = TextDB.get_by_id(text_id)
            if not text:
                return {"success": False, "error": "Text not found"}
            
            # Delete files
            for path_key in ['content_path', 'transcript_path', 'transcript_json_path', 
                           'audio_path', 'yolo_annotation_path']:
                if text.get(path_key) and os.path.exists(text[path_key]):
                    os.remove(text[path_key])
            
            # Delete associated annotation archives
            from routers.annotation import delete_archives_by_text_id
            deleted_archives = delete_archives_by_text_id(text_id)
            if deleted_archives > 0:
                logger.info(f"Deleted {deleted_archives} annotation archive(s) for text {text_id}")
            
            # Delete from database
            TextDB.delete(text_id)
            
            return {"success": True, "message": "Text deleted", "deleted_archives": deleted_archives}
            
        except Exception as e:
            logger.error(f"Failed to delete text: {e}")
            return {"success": False, "error": str(e)}
    
    # ==================== File Upload ====================
    
    def save_uploaded_file(
        self,
        corpus_id: str,
        file_content: bytes,
        filename: str,
        media_type: MediaType,
        config: UploadConfig,
        skip_spacy: bool = True  # Always skip SpaCy for async processing
    ) -> Dict[str, Any]:
        """
        Save uploaded file and create text entry (SpaCy annotation done async)
        
        Args:
            corpus_id: Corpus ID
            file_content: File content bytes
            filename: Original filename
            media_type: Media type
            config: Upload configuration
            skip_spacy: If True, skip SpaCy annotation (for async processing)
            
        Returns:
            Upload result with 'needs_async_spacy' flag for text files
        """
        try:
            corpus = CorpusDB.get_by_id(corpus_id)
            if not corpus:
                return {"success": False, "error": "Corpus not found"}
            
            corpus_name = corpus['name']
            corpus_language = corpus.get('language', 'english')
            corpus_dir = CORPORA_DIR / corpus_name
            
            # Generate unique filename
            safe_filename = self._sanitize_filename(filename)
            text_id = str(uuid.uuid4())
            
            # Determine save path based on media type
            if media_type == MediaType.TEXT:
                save_dir = corpus_dir / "files"
                save_path = save_dir / safe_filename
            elif media_type == MediaType.AUDIO:
                audio_name = Path(safe_filename).stem
                save_dir = corpus_dir / "audios" / audio_name
                save_dir.mkdir(parents=True, exist_ok=True)
                save_path = save_dir / safe_filename
            else:  # VIDEO
                video_name = Path(safe_filename).stem
                save_dir = corpus_dir / "videos" / video_name
                save_dir.mkdir(parents=True, exist_ok=True)
                (save_dir / "images").mkdir(exist_ok=True)
                save_path = save_dir / safe_filename
            
            # Ensure unique filename
            save_path = self._get_unique_path(save_path)
            
            # Write file
            with open(save_path, 'wb') as f:
                f.write(file_content)
            
            logger.info(f"Saved file: {save_path}")
            
            # Create text entry
            text_data = {
                'id': text_id,
                'corpus_id': corpus_id,
                'filename': save_path.name,
                'original_filename': filename,
                'media_type': media_type.value,
                'tags': config.tags,
                'metadata': config.metadata.dict() if config.metadata else {}
            }
            
            spacy_result = None
            usas_result = None
            needs_async_spacy = False
            
            if media_type == MediaType.TEXT:
                text_data['content_path'] = str(save_path)
                # Count words and check if async processing needed
                try:
                    content = file_content.decode('utf-8')
                    text_data['word_count'] = len(content.split())
                    
                    # All text files use async SpaCy processing for better UX
                    if skip_spacy:
                        logger.info(f"[save_uploaded_file] Text ({len(content)} chars) will be processed async (skip_spacy={skip_spacy})")
                        needs_async_spacy = True
                    else:
                        logger.info(f"[save_uploaded_file] Text ({len(content)} chars) will be processed sync (skip_spacy={skip_spacy})")
                        # Perform SpaCy annotation synchronously (if explicitly requested)
                        spacy_result = self._annotate_text_with_spacy(
                            content, 
                            corpus_language,
                            save_dir,
                            Path(safe_filename).stem
                        )
                    
                    # Perform USAS semantic annotation (only for English and Chinese)
                    text_type = config.metadata.customFields.get('textType') if config.metadata and config.metadata.customFields else None
                    
                    # Ensure custom text type exists in settings
                    if text_type:
                        from services.usas_service import get_usas_service
                        usas_svc = get_usas_service()
                        usas_svc.ensure_text_type_exists(text_type)
                    
                    # USAS annotation only if SpaCy was done synchronously
                    if spacy_result and not needs_async_spacy:
                        usas_result = self._annotate_text_with_usas(
                            content,
                            corpus_language,
                            save_dir,
                            Path(safe_filename).stem,
                            text_type
                        )
                        
                        # MIPVU annotation only if SpaCy was done synchronously (English only)
                        mipvu_result = self._annotate_text_with_mipvu(
                            content,
                            corpus_language,
                            save_dir,
                            Path(safe_filename).stem,
                            spacy_result
                        )
                except Exception as e:
                    logger.warning(f"Annotation failed: {e}")
            elif media_type == MediaType.AUDIO:
                # For audio, content_path is the original audio file
                # transcript_path and transcript_json_path will be set after transcription
                text_data['content_path'] = str(save_path)
                text_data['audio_path'] = str(save_path)
            else:  # VIDEO
                # For video, content_path is the original video file
                # transcript and yolo paths will be set after processing
                text_data['content_path'] = str(save_path)
            
            text = TextDB.create(text_data)
            
            logger.info(f"[save_uploaded_file] Returning: text_id={text_id}, needs_async_spacy={needs_async_spacy}")
            return {
                "success": True,
                "data": {
                    "text_id": text_id,
                    "filename": save_path.name,
                    "media_type": media_type.value,
                    "save_path": str(save_path),
                    "save_dir": str(save_dir),
                    "spacy_annotation": spacy_result,
                    "usas_annotation": usas_result,
                    "needs_async_spacy": needs_async_spacy,
                    "corpus_language": corpus_language
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to save file: {e}")
            return {"success": False, "error": str(e)}
    
    def _annotate_text_with_spacy(
        self, 
        content: str, 
        language: str,
        output_dir: Path,
        base_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Perform SpaCy annotation on text content
        
        Args:
            content: Text content
            language: Language code
            output_dir: Directory to save annotation
            base_name: Base filename for output
            
        Returns:
            SpaCy annotation result or None
        """
        try:
            from services.spacy_service import get_spacy_service
            
            spacy_svc = get_spacy_service()
            if not spacy_svc.is_available(language):
                logger.warning(f"SpaCy not available for {language}")
                return None
            
            # Annotate text
            result = spacy_svc.annotate_text(content, language)
            
            if result.get("success"):
                # Save annotation to JSON file
                spacy_path = output_dir / f"{base_name}.spacy.json"
                with open(spacy_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                
                logger.info(f"Saved SpaCy annotation: {spacy_path}")
                return {
                    "path": str(spacy_path),
                    "tokens": len(result.get("tokens", [])),
                    "entities": len(result.get("entities", [])),
                    "sentences": len(result.get("sentences", []))
                }
            
            return None
            
        except Exception as e:
            logger.error(f"SpaCy annotation error: {e}")
            return None
    
    def _annotate_text_with_usas(
        self,
        content: str,
        language: str,
        output_dir: Path,
        base_name: str,
        text_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Perform USAS semantic domain annotation on text content
        
        Args:
            content: Text content
            language: Language code (only english and chinese supported)
            output_dir: Directory to save annotation
            base_name: Base filename for output
            text_type: Optional text type for priority disambiguation
            
        Returns:
            USAS annotation result or None
        """
        try:
            from services.usas_service import get_usas_service
            
            usas_svc = get_usas_service()
            if not usas_svc.is_available(language):
                logger.warning(f"USAS not available for {language}")
                return None
            
            # Annotate text
            result = usas_svc.annotate_text(content, language, text_type)
            
            if result.get("success"):
                # Save annotation to JSON file
                usas_path = output_dir / f"{base_name}.usas.json"
                with open(usas_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                
                logger.info(f"Saved USAS annotation: {usas_path}")
                return {
                    "path": str(usas_path),
                    "tokens": len(result.get("tokens", [])),
                    "dominant_domain": result.get("dominant_domain"),
                    "domain_distribution": result.get("domain_distribution", {})
                }
            
            return None
            
        except Exception as e:
            logger.error(f"USAS annotation error: {e}")
            return None
    
    def _annotate_segments_with_usas(
        self,
        segments: List[Dict],
        language: str,
        text_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Perform USAS semantic domain annotation on transcript segments
        
        Args:
            segments: List of segment dicts with 'id', 'text', 'start', 'end'
            language: Language code
            text_type: Optional text type for priority disambiguation
            
        Returns:
            USAS segment annotation result or None
        """
        try:
            from services.usas_service import get_usas_service
            
            usas_svc = get_usas_service()
            if not usas_svc.is_available(language):
                logger.warning(f"USAS not available for {language}")
                return None
            
            result = usas_svc.annotate_segments(segments, language, text_type)
            
            if result.get("success"):
                logger.info(f"USAS annotated {len(result.get('segments', {}))} segments")
                return result
            
            return None
            
        except Exception as e:
            logger.error(f"USAS segment annotation error: {e}")
            return None
    
    def _annotate_text_with_mipvu(
        self,
        content: str,
        language: str,
        output_dir: Path,
        base_name: str,
        spacy_data: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Perform MIPVU metaphor annotation on text
        
        Args:
            content: Text content to annotate
            language: Language code (only 'en' or 'english' supported)
            output_dir: Directory to save annotation
            base_name: Base filename for output
            spacy_data: SpaCy annotation data (required for MIPVU)
            
        Returns:
            MIPVU annotation result or None
        """
        try:
            from services.mipvu_service import get_mipvu_service
            
            mipvu_svc = get_mipvu_service()
            if not mipvu_svc.is_available(language):
                logger.info(f"MIPVU not available for {language} (only English supported)")
                return None
            
            if not spacy_data:
                # Try to load SpaCy data from file
                spacy_path = output_dir / f"{base_name}.spacy.json"
                if spacy_path.exists():
                    with open(spacy_path, 'r', encoding='utf-8') as f:
                        spacy_data = json.load(f)
                else:
                    logger.warning("SpaCy annotation not available for MIPVU")
                    return None
            
            # Annotate text
            result = mipvu_svc.annotate_text(content, language, spacy_data)
            
            if result.get("success"):
                # Save annotation to JSON file
                mipvu_path = output_dir / f"{base_name}.mipvu.json"
                with open(mipvu_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                
                logger.info(f"Saved MIPVU annotation: {mipvu_path}")
                stats = result.get("statistics", {})
                return {
                    "path": str(mipvu_path),
                    "metaphor_tokens": stats.get("metaphor_tokens", 0),
                    "total_tokens": stats.get("total_tokens", 0),
                    "metaphor_rate": stats.get("metaphor_rate", 0)
                }
            
            return None
            
        except Exception as e:
            logger.error(f"MIPVU annotation error: {e}")
            return None
    
    def _annotate_segments_with_mipvu(
        self,
        segments: List[Dict],
        language: str
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Perform MIPVU metaphor annotation on transcript segments
        
        Args:
            segments: List of segment dicts with SpaCy data
            language: Language code (only 'en' or 'english' supported)
            
        Returns:
            List of annotated segments or None
        """
        try:
            from services.mipvu_service import get_mipvu_service
            
            mipvu_svc = get_mipvu_service()
            if not mipvu_svc.is_available(language):
                logger.info(f"MIPVU not available for {language} (only English supported)")
                return None
            
            result = mipvu_svc.annotate_segments(segments, language)
            
            if result:
                logger.info(f"MIPVU annotated {len(result)} segments")
                return result
            
            return None
            
        except Exception as e:
            logger.error(f"MIPVU segment annotation error: {e}")
            return None
    
    def process_audio(
        self,
        text_id: str,
        audio_path: str,
        language: str = None,
        progress_callback: callable = None
    ) -> Dict[str, Any]:
        """
        Process audio file with Whisper transcription and SpaCy annotation
        Synchronous processing - blocks until complete
        
        Args:
            text_id: Text entry ID
            audio_path: Path to audio file
            language: Language hint
            progress_callback: Progress callback
            
        Returns:
            Processing result with transcription and SpaCy annotation
        """
        try:
            from services.whisper_service import get_whisper_service
            from services.spacy_service import get_spacy_service
            
            whisper = get_whisper_service()
            if not whisper.is_available():
                return {"success": False, "error": "Whisper model not available"}
            
            audio_path = Path(audio_path)
            output_dir = audio_path.parent
            audio_name = audio_path.stem
            
            # Transcribe audio
            logger.info(f"Transcribing audio: {audio_path}")
            result = whisper.transcribe_and_save(
                str(audio_path),
                output_dir=str(output_dir),
                language=language,
                progress_callback=progress_callback
            )
            
            if not result.get("success"):
                return result
            
            spacy_result = None
            usas_result = None
            
            # Perform SpaCy and USAS annotation on transcript segments
            try:
                spacy_svc = get_spacy_service()
                spacy_lang = language or 'english'
                
                # Load transcript JSON to get segments
                json_path = result.get('json_path')
                if json_path and os.path.exists(json_path):
                    with open(json_path, 'r', encoding='utf-8') as f:
                        transcript_data = json.load(f)
                    
                    segments = transcript_data.get('segments', [])
                    
                    if segments:
                        # SpaCy annotation
                        if spacy_svc.is_available(spacy_lang):
                            logger.info(f"Annotating {len(segments)} segments with SpaCy")
                            spacy_result = spacy_svc.annotate_segments(segments, spacy_lang)
                            
                            if spacy_result.get("success"):
                                transcript_data['spacy_annotations'] = spacy_result
                                logger.info(f"Added SpaCy annotations to transcript")
                        
                        # USAS semantic annotation (only for English and Chinese)
                        # Get text_type from text metadata
                        text_entry = TextDB.get_by_id(text_id)
                        text_type = None
                        if text_entry and text_entry.get('metadata'):
                            metadata = text_entry.get('metadata', {})
                            if isinstance(metadata, dict):
                                custom_fields = metadata.get('customFields', {})
                                if isinstance(custom_fields, dict):
                                    text_type = custom_fields.get('textType')
                        
                        # Ensure custom text type exists
                        if text_type:
                            from services.usas_service import get_usas_service
                            usas_svc_check = get_usas_service()
                            usas_svc_check.ensure_text_type_exists(text_type)
                        
                        usas_result = self._annotate_segments_with_usas(segments, spacy_lang, text_type)
                        if usas_result:
                            transcript_data['usas_annotations'] = usas_result
                            logger.info(f"Added USAS annotations to transcript")
                        
                        # MIPVU annotation (only for English)
                        mipvu_result = self._annotate_segments_with_mipvu(segments, spacy_lang)
                        if mipvu_result:
                            transcript_data['mipvu_annotations'] = {
                                "success": True,
                                "segments": mipvu_result
                            }
                            logger.info(f"Added MIPVU annotations to transcript")
                        
                        # Save updated transcript with annotations
                        with open(json_path, 'w', encoding='utf-8') as f:
                            json.dump(transcript_data, f, ensure_ascii=False, indent=2)
            except Exception as e:
                logger.warning(f"Annotation failed: {e}")
            
            # Update text entry
            update_data = {
                'content_path': result.get('txt_path'),
                'transcript_path': result.get('txt_path'),
                'transcript_json_path': result.get('json_path'),
                'has_timestamps': True,
                'word_count': result['data'].get('total_words', 0),
                'duration': result['data'].get('total_duration')
            }
            
            TextDB.update(text_id, update_data)
            
            return {
                "success": True,
                "data": result['data'],
                "paths": {
                    "json": result.get('json_path'),
                    "txt": result.get('txt_path')
                },
                "spacy": spacy_result,
                "usas": usas_result
            }
            
        except Exception as e:
            logger.error(f"Audio processing failed: {e}")
            return {"success": False, "error": str(e)}
    
    def process_video(
        self,
        text_id: str,
        video_path: str,
        transcribe: bool = True,
        yolo_annotation: bool = False,
        clip_annotation: bool = False,
        clip_labels: List[str] = None,
        language: str = None,
        progress_callback: callable = None
    ) -> Dict[str, Any]:
        """
        Process video file synchronously with transcription, SpaCy, YOLO and CLIP annotation
        
        Args:
            text_id: Text entry ID
            video_path: Path to video file
            transcribe: Whether to transcribe audio
            yolo_annotation: Whether to run YOLO
            clip_annotation: Whether to run CLIP
            clip_labels: Labels for CLIP classification
            language: Language hint for transcription
            progress_callback: Progress callback
            
        Returns:
            Processing result with transcript, SpaCy, YOLO and CLIP annotations
        """
        try:
            video_path = Path(video_path)
            output_dir = video_path.parent
            video_name = video_path.stem
            
            results = {
                "transcript": None,
                "yolo": None,
                "clip": None,
                "spacy": None,
                "usas": None
            }
            
            # Extract audio and transcribe
            if transcribe:
                from services.yolo_service import get_yolo_service
                from services.whisper_service import get_whisper_service
                from services.spacy_service import get_spacy_service
                
                yolo_svc = get_yolo_service()
                
                # Extract audio
                logger.info(f"Extracting audio from video: {video_path}")
                audio_path = output_dir / f"{video_name}_audio.wav"
                extracted = yolo_svc.extract_audio(str(video_path), str(audio_path))
                
                if extracted:
                    whisper = get_whisper_service()
                    if whisper.is_available():
                        logger.info(f"Transcribing video audio")
                        transcript_result = whisper.transcribe_and_save(
                            extracted,
                            output_dir=str(output_dir),
                            language=language
                        )
                        results["transcript"] = transcript_result
                        
                        if transcript_result.get("success"):
                            # Perform SpaCy and USAS annotation on segments
                            spacy_lang = language or 'english'
                            spacy_svc = get_spacy_service()
                            
                            json_path = transcript_result.get('json_path')
                            if json_path and os.path.exists(json_path):
                                with open(json_path, 'r', encoding='utf-8') as f:
                                    transcript_data = json.load(f)
                                
                                segments = transcript_data.get('segments', [])
                                
                                if segments:
                                    # SpaCy annotation
                                    if spacy_svc.is_available(spacy_lang):
                                        logger.info(f"Annotating {len(segments)} video transcript segments with SpaCy")
                                        spacy_result = spacy_svc.annotate_segments(segments, spacy_lang)
                                        results["spacy"] = spacy_result
                                        
                                        if spacy_result.get("success"):
                                            transcript_data['spacy_annotations'] = spacy_result
                                            logger.info(f"Added SpaCy annotations to video transcript")
                                    
                                    # USAS semantic annotation
                                    # Get text_type from text metadata
                                    text_entry = TextDB.get_by_id(text_id)
                                    text_type = None
                                    if text_entry and text_entry.get('metadata'):
                                        metadata = text_entry.get('metadata', {})
                                        if isinstance(metadata, dict):
                                            custom_fields = metadata.get('customFields', {})
                                            if isinstance(custom_fields, dict):
                                                text_type = custom_fields.get('textType')
                                    
                                    # Ensure custom text type exists
                                    if text_type:
                                        from services.usas_service import get_usas_service
                                        usas_svc_check = get_usas_service()
                                        usas_svc_check.ensure_text_type_exists(text_type)
                                    
                                    usas_result = self._annotate_segments_with_usas(segments, spacy_lang, text_type)
                                    results["usas"] = usas_result
                                    if usas_result:
                                        transcript_data['usas_annotations'] = usas_result
                                        logger.info(f"Added USAS annotations to video transcript")
                                    
                                    # MIPVU annotation (only for English)
                                    mipvu_result = self._annotate_segments_with_mipvu(segments, spacy_lang)
                                    results["mipvu"] = mipvu_result
                                    if mipvu_result:
                                        transcript_data['mipvu_annotations'] = {
                                            "success": True,
                                            "segments": mipvu_result
                                        }
                                        logger.info(f"Added MIPVU annotations to video transcript")
                                    
                                    # Save updated transcript with annotations
                                    with open(json_path, 'w', encoding='utf-8') as f:
                                        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                            
                            # Update text entry
                            update_data = {
                                'audio_path': extracted,
                                'content_path': transcript_result.get('txt_path'),
                                'transcript_path': transcript_result.get('txt_path'),
                                'transcript_json_path': transcript_result.get('json_path'),
                                'has_timestamps': True,
                                'word_count': transcript_result['data'].get('total_words', 0),
                                'duration': transcript_result['data'].get('total_duration')
                            }
                            TextDB.update(text_id, update_data)
            
            # Run YOLO
            if yolo_annotation:
                from services.yolo_service import get_yolo_service
                
                yolo = get_yolo_service()
                if yolo.is_available():
                    logger.info(f"Running YOLO detection on video")
                    yolo_result = yolo.process_video(
                        str(video_path),
                        output_dir=str(output_dir),
                        extract_frames=True
                    )
                    results["yolo"] = yolo_result
                    
                    if yolo_result.get("success"):
                        TextDB.update(text_id, {
                            'yolo_annotation_path': yolo_result.get('json_path')
                        })
            
            # Run CLIP
            if clip_annotation:
                from services.clip_service import get_clip_service
                
                clip = get_clip_service()
                if clip.is_available():
                    logger.info(f"Running CLIP classification on video")
                    clip_result = clip.process_video(
                        str(video_path),
                        output_dir=str(output_dir),
                        labels=clip_labels
                    )
                    results["clip"] = clip_result
                    
                    if clip_result.get("success"):
                        TextDB.update(text_id, {
                            'clip_annotation_path': clip_result.get('json_path')
                        })
            
            return {
                "success": True,
                "data": results
            }
            
        except Exception as e:
            logger.error(f"Video processing failed: {e}")
            return {"success": False, "error": str(e)}
    
    # ==================== Tag Management ====================
    
    def add_corpus_tag(self, corpus_id: str, tag: str) -> bool:
        return CorpusDB.add_tag(corpus_id, tag)
    
    def remove_corpus_tag(self, corpus_id: str, tag: str) -> bool:
        return CorpusDB.remove_tag(corpus_id, tag)
    
    def add_text_tag(self, text_id: str, tag: str) -> bool:
        return TextDB.add_tag(text_id, tag)
    
    def remove_text_tag(self, text_id: str, tag: str) -> bool:
        return TextDB.remove_tag(text_id, tag)
    
    def list_all_tags(self) -> List[str]:
        return TagDB.list_all()
    
    # ==================== Helper Methods ====================
    
    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename"""
        # Replace spaces and special chars
        safe = filename.replace(" ", "_")
        # Remove problematic characters
        for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
            safe = safe.replace(char, '_')
        return safe
    
    def _get_unique_path(self, path: Path) -> Path:
        """Get unique file path by appending number if exists"""
        if not path.exists():
            return path
        
        stem = path.stem
        suffix = path.suffix
        parent = path.parent
        counter = 1
        
        while True:
            new_path = parent / f"{stem}_{counter}{suffix}"
            if not new_path.exists():
                return new_path
            counter += 1
    
    def _update_archives_corpus_name(self, annotations_dir: Path, new_corpus_name: str) -> None:
        """Update corpusName field in all archive files when corpus is renamed"""
        try:
            for archive_path in annotations_dir.glob("*.json"):
                try:
                    with open(archive_path, 'r', encoding='utf-8') as f:
                        archive = json.load(f)
                    
                    if 'corpusName' in archive:
                        archive['corpusName'] = new_corpus_name
                        with open(archive_path, 'w', encoding='utf-8') as f:
                            json.dump(archive, f, ensure_ascii=False, indent=2)
                        logger.info(f"Updated corpusName in archive: {archive_path}")
                except Exception as e:
                    logger.warning(f"Failed to update archive {archive_path}: {e}")
        except Exception as e:
            logger.error(f"Failed to update archives corpus name: {e}")
    
    def _save_corpus_metadata(self, corpus_name: str, metadata: Dict) -> None:
        """Save corpus metadata to JSON file"""
        corpus_dir = CORPORA_DIR / corpus_name
        metadata_path = corpus_dir / "metadata.json"
        
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2, default=str)
    
    # ==================== Batch SpaCy Annotation ====================
    
    def batch_spacy_annotate(self, corpus_id: str, force: bool = False) -> Dict[str, Any]:
        """
        Batch annotate all texts in a corpus with SpaCy
        
        Args:
            corpus_id: Corpus ID
            force: If True, re-annotate even if annotation already exists
            
        Returns:
            Result with counts of annotated texts
        """
        try:
            corpus = CorpusDB.get_by_id(corpus_id)
            if not corpus:
                return {"success": False, "error": "Corpus not found"}
            
            corpus_name = corpus['name']
            corpus_language = corpus.get('language', 'english')
            corpus_dir = CORPORA_DIR / corpus_name
            files_dir = corpus_dir / "files"
            
            texts = TextDB.list_by_corpus(corpus_id)
            
            annotated_count = 0
            skipped_count = 0
            failed_count = 0
            results = []
            
            for text in texts:
                text_id = text['id']
                content_path = text.get('content_path')
                
                if not content_path or not os.path.exists(content_path):
                    skipped_count += 1
                    results.append({
                        "text_id": text_id,
                        "filename": text.get('filename', 'unknown'),
                        "status": "skipped",
                        "reason": "No content path"
                    })
                    continue
                
                content_path = Path(content_path)
                base_name = content_path.stem
                output_dir = content_path.parent
                
                # Check if annotation already exists
                spacy_path = output_dir / f"{base_name}.spacy.json"
                if spacy_path.exists() and not force:
                    skipped_count += 1
                    results.append({
                        "text_id": text_id,
                        "filename": text.get('filename', 'unknown'),
                        "status": "skipped",
                        "reason": "Already annotated"
                    })
                    continue
                
                # Read text content
                try:
                    with open(content_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                except Exception as e:
                    failed_count += 1
                    results.append({
                        "text_id": text_id,
                        "filename": text.get('filename', 'unknown'),
                        "status": "failed",
                        "reason": f"Read error: {str(e)}"
                    })
                    continue
                
                # Perform SpaCy annotation
                spacy_result = self._annotate_text_with_spacy(
                    content,
                    corpus_language,
                    output_dir,
                    base_name
                )
                
                if spacy_result:
                    annotated_count += 1
                    results.append({
                        "text_id": text_id,
                        "filename": text.get('filename', 'unknown'),
                        "status": "success",
                        "tokens": spacy_result.get('tokens', 0),
                        "entities": spacy_result.get('entities', 0),
                        "sentences": spacy_result.get('sentences', 0)
                    })
                else:
                    failed_count += 1
                    results.append({
                        "text_id": text_id,
                        "filename": text.get('filename', 'unknown'),
                        "status": "failed",
                        "reason": "SpaCy annotation failed"
                    })
            
            logger.info(f"Batch SpaCy annotation for corpus {corpus_name}: "
                       f"{annotated_count} annotated, {skipped_count} skipped, {failed_count} failed")
            
            return {
                "success": True,
                "data": {
                    "corpus_id": corpus_id,
                    "corpus_name": corpus_name,
                    "total": len(texts),
                    "annotated": annotated_count,
                    "skipped": skipped_count,
                    "failed": failed_count,
                    "results": results
                }
            }
            
        except Exception as e:
            logger.error(f"Batch SpaCy annotation failed: {e}")
            return {"success": False, "error": str(e)}
    
    def annotate_single_text(self, corpus_id: str, text_id: str, force: bool = False) -> Dict[str, Any]:
        """
        Annotate a single text with SpaCy
        
        Args:
            corpus_id: Corpus ID
            text_id: Text ID
            force: If True, re-annotate even if annotation already exists
            
        Returns:
            Annotation result
        """
        try:
            corpus = CorpusDB.get_by_id(corpus_id)
            if not corpus:
                return {"success": False, "error": "Corpus not found"}
            
            text = TextDB.get_by_id(text_id)
            if not text:
                return {"success": False, "error": "Text not found"}
            
            corpus_language = corpus.get('language', 'english')
            content_path = text.get('content_path')
            
            if not content_path or not os.path.exists(content_path):
                return {"success": False, "error": "No content path"}
            
            content_path = Path(content_path)
            base_name = content_path.stem
            output_dir = content_path.parent
            
            # Check if annotation already exists
            spacy_path = output_dir / f"{base_name}.spacy.json"
            if spacy_path.exists() and not force:
                return {"success": False, "error": "Already annotated. Use force=true to re-annotate"}
            
            # Read text content
            with open(content_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Perform SpaCy annotation
            spacy_result = self._annotate_text_with_spacy(
                content,
                corpus_language,
                output_dir,
                base_name
            )
            
            if spacy_result:
                return {
                    "success": True,
                    "data": {
                        "text_id": text_id,
                        "filename": text.get('filename', 'unknown'),
                        "tokens": spacy_result.get('tokens', 0),
                        "entities": spacy_result.get('entities', 0),
                        "sentences": spacy_result.get('sentences', 0),
                        "path": spacy_result.get('path')
                    }
                }
            else:
                return {"success": False, "error": "SpaCy annotation failed"}
            
        except Exception as e:
            logger.error(f"Single text SpaCy annotation failed: {e}")
            return {"success": False, "error": str(e)}


# Singleton instance
_corpus_service = None


def get_corpus_service() -> CorpusService:
    """Get corpus service singleton"""
    global _corpus_service
    if _corpus_service is None:
        _corpus_service = CorpusService()
    return _corpus_service


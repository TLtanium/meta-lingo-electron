"""
Whisper Audio Transcription Service
Uses Whisper Large V3 Turbo for speech-to-text with timestamps
For English audio, also performs forced alignment (Wav2Vec2) and pitch extraction (TorchCrepe)
"""

import os
import re
import json
import logging
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

from config import MODELS_DIR

# Import alignment and pitch services for English audio processing
from services.alignment_service import get_alignment_service
from services.pitch_service import get_pitch_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _ensure_ffmpeg_in_path():
    """
    Ensure FFmpeg from imageio-ffmpeg is available for audio loading.
    Creates a copy named 'ffmpeg.exe' if the binary has a different name (Windows).
    """
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        ffmpeg_dir = os.path.dirname(ffmpeg_exe)
        ffmpeg_basename = os.path.basename(ffmpeg_exe)
        
        # Add FFmpeg directory to PATH if not already there
        current_path = os.environ.get('PATH', '')
        if ffmpeg_dir not in current_path:
            os.environ['PATH'] = ffmpeg_dir + os.pathsep + current_path
            logger.info(f"Added FFmpeg to PATH: {ffmpeg_dir}")
        
        # If the binary is not named 'ffmpeg' or 'ffmpeg.exe', create a copy
        # This is needed because audio libraries look for 'ffmpeg' in PATH
        # Windows symlinks require admin rights, so we copy instead
        ffmpeg_target = 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg'
        if not ffmpeg_basename.lower().startswith('ffmpeg.'):
            target_path = os.path.join(ffmpeg_dir, ffmpeg_target)
            if not os.path.exists(target_path):
                try:
                    import shutil
                    shutil.copy2(ffmpeg_exe, target_path)
                    logger.info(f"Copied ffmpeg binary: {ffmpeg_exe} -> {target_path}")
                except (OSError, PermissionError, shutil.Error) as e:
                    logger.warning(f"Could not copy ffmpeg binary: {e}")
                    # Fallback: set IMAGEIO_FFMPEG_EXE environment variable
                    os.environ['IMAGEIO_FFMPEG_EXE'] = ffmpeg_exe
            else:
                logger.info(f"FFmpeg target already exists: {target_path}")
        
        # Also set environment variables that some libraries check
        os.environ['FFMPEG_BINARY'] = ffmpeg_exe
        
        return ffmpeg_exe
    except ImportError as e:
        logger.warning("imageio-ffmpeg not available")
        return None
    except Exception as e:
        logger.warning(f"Failed to configure FFmpeg path: {e}")
        return None

# Model path - 使用 config.py 中的 MODELS_DIR
WHISPER_MODEL_PATH = str(MODELS_DIR / "multimodal_analyzer" / "whisper-large-v3-turbo")


@dataclass
class TranscriptWord:
    """Word-level transcript"""
    word: str
    start: float
    end: float
    probability: float = 1.0
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class TranscriptSegment:
    """Segment-level transcript"""
    id: int
    start: float
    end: float
    text: str
    words: List[Dict] = None
    
    def __post_init__(self):
        if self.words is None:
            self.words = []
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'start': self.start,
            'end': self.end,
            'text': self.text,
            'words': self.words
        }
    
    @property
    def duration(self) -> float:
        return self.end - self.start


class WhisperService:
    """Whisper transcription service"""
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or WHISPER_MODEL_PATH
        self.model = None
        self.processor = None
        self.pipe = None
        self.device = None
        self._initialized = False
        
    def _check_dependencies(self) -> bool:
        """Check if required dependencies are installed"""
        try:
            import torch
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"PyTorch available, device: {self.device}")
            return True
        except ImportError:
            logger.error("PyTorch not installed. Run: pip install torch torchaudio")
            return False
    
    def initialize(self) -> bool:
        """Initialize the Whisper model"""
        if self._initialized:
            return True
            
        if not self._check_dependencies():
            return False
        
        # Ensure FFmpeg is available for audio loading
        _ensure_ffmpeg_in_path()
        
        try:
            import torch
            from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
            
            if not os.path.exists(self.model_path):
                logger.error(f"Whisper model not found: {self.model_path}")
                return False
            
            logger.info(f"Loading Whisper model from: {self.model_path}")
            
            torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
            
            # Load model
            self.model = AutoModelForSpeechSeq2Seq.from_pretrained(
                self.model_path,
                torch_dtype=torch_dtype,
                low_cpu_mem_usage=True,
                use_safetensors=True
            )
            self.model.to(self.device)
            
            # Load processor
            self.processor = AutoProcessor.from_pretrained(self.model_path)
            
            # Configure alignment heads for word-level timestamps
            if not hasattr(self.model.generation_config, 'alignment_heads') or \
               self.model.generation_config.alignment_heads is None:
                num_layers = getattr(self.model.config, 'decoder_layers', 32)
                num_heads = getattr(self.model.config, 'decoder_attention_heads', 20)
                
                alignment_heads = []
                start_layer = num_layers // 4
                end_layer = num_layers * 3 // 4
                for layer in range(start_layer, min(end_layer, num_layers)):
                    for head in range(min(6, num_heads)):
                        alignment_heads.append([layer, head])
                
                self.model.generation_config.alignment_heads = alignment_heads
            
            # Create pipeline
            self.pipe = pipeline(
                "automatic-speech-recognition",
                model=self.model,
                tokenizer=self.processor.tokenizer,
                feature_extractor=self.processor.feature_extractor,
                torch_dtype=torch_dtype,
                device=self.device,
            )
            
            self._initialized = True
            logger.info("Whisper model loaded successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def transcribe(
        self, 
        audio_path: str, 
        language: str = None,
        return_timestamps: bool = True,
        use_word_timestamps: bool = True,
        progress_callback: callable = None,
        skip_alignment_pitch: bool = False
    ) -> Dict[str, Any]:
        """
        Transcribe audio file
        
        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'zh'), None for auto-detect
            return_timestamps: Whether to return timestamps
            use_word_timestamps: Whether to use word-level timestamps
            progress_callback: Progress callback function
            skip_alignment_pitch: Whether to skip Wav2Vec2 alignment and pitch extraction (for video files)
            
        Returns:
            Transcription result dictionary
        """
        if not self.initialize():
            return {"success": False, "error": "Model initialization failed"}
        
        audio_path = Path(audio_path)
        if not audio_path.exists():
            return {"success": False, "error": f"Audio file not found: {audio_path}"}
        
        logger.info(f"Starting transcription: {audio_path}")
        
        if progress_callback:
            progress_callback(0, 100, "Starting transcription...")
        
        try:
            # Load audio - try multiple methods
            audio_input = None
            
            # Method 1: Try soundfile (works well for WAV files, no ffmpeg needed)
            try:
                import soundfile as sf
                import numpy as np
                audio_data, sample_rate = sf.read(str(audio_path))
                # Convert to mono if stereo
                if len(audio_data.shape) > 1:
                    audio_data = np.mean(audio_data, axis=1)
                # Resample to 16kHz if needed
                if sample_rate != 16000:
                    # Simple resampling using numpy
                    duration = len(audio_data) / sample_rate
                    target_samples = int(duration * 16000)
                    indices = np.linspace(0, len(audio_data) - 1, target_samples).astype(int)
                    audio_data = audio_data[indices]
                    sample_rate = 16000
                audio_data = audio_data.astype(np.float32)
                audio_input = {"raw": audio_data, "sampling_rate": sample_rate}
                logger.info(f"Loaded audio with soundfile: {len(audio_data)} samples at {sample_rate}Hz")
            except Exception as sf_error:
                logger.warning(f"Failed to load with soundfile: {sf_error}")
                
                # Method 2: Try librosa
                try:
                    import librosa
                    audio_data, sample_rate = librosa.load(str(audio_path), sr=16000, mono=True)
                    audio_input = {"raw": audio_data, "sampling_rate": sample_rate}
                    logger.info(f"Loaded audio with librosa: {len(audio_data)} samples at {sample_rate}Hz")
                except Exception as librosa_error:
                    logger.warning(f"Failed to load with librosa: {librosa_error}")
                    # Method 3: Fall back to file path (requires ffmpeg in PATH)
                    audio_input = str(audio_path)
                    logger.info(f"Falling back to file path: {audio_input}")
            
            generate_kwargs = {}
            if language:
                generate_kwargs["language"] = language
            
            all_words = []
            chunks = []
            full_text = ""
            word_level_success = False
            
            if use_word_timestamps and return_timestamps:
                logger.info("Using word-level timestamp mode...")
                try:
                    result = self.pipe(
                        audio_input,
                        chunk_length_s=30,
                        stride_length_s=[6, 4],
                        batch_size=1,
                        return_timestamps="word",
                        generate_kwargs={
                            **generate_kwargs,
                            "num_beams": 1,
                        }
                    )
                    full_text = result.get("text", "")
                    chunks = result.get("chunks", [])
                    word_level_success = True
                    logger.info("Word-level timestamps successful")
                except Exception as e:
                    logger.warning(f"Word-level timestamps failed: {e}")
                    logger.info("Falling back to chunk-level timestamps...")
                    
                    result = self.pipe(
                        audio_input,
                        chunk_length_s=30,
                        batch_size=16,
                        return_timestamps=True,
                        generate_kwargs=generate_kwargs
                    )
                    full_text = result.get("text", "")
                    raw_chunks = result.get("chunks", [])
                    chunks = self._estimate_word_timestamps(raw_chunks)
                    word_level_success = True
            else:
                logger.info("Using chunk-level timestamp mode...")
                result = self.pipe(
                    audio_input,
                    chunk_length_s=30,
                    batch_size=16,
                    return_timestamps=return_timestamps,
                    generate_kwargs=generate_kwargs
                )
                full_text = result.get("text", "")
                chunks = result.get("chunks", [])
            
            if progress_callback:
                progress_callback(80, 100, "Processing results...")
            
            # Process results
            if word_level_success:
                for chunk in chunks:
                    timestamp = chunk.get("timestamp", (0, 0))
                    start_time = timestamp[0] if timestamp[0] is not None else 0
                    end_time = timestamp[1] if timestamp[1] is not None else start_time + 0.5
                    word_text = chunk.get("text", "").strip()
                    
                    if word_text:
                        word_obj = TranscriptWord(
                            word=word_text,
                            start=start_time,
                            end=end_time
                        )
                        all_words.append(word_obj)
                
                segments = self._build_sentences_from_words(all_words)
            else:
                segments = []
                for i, chunk in enumerate(chunks):
                    timestamp = chunk.get("timestamp", (0, 0))
                    start_time = timestamp[0] if timestamp[0] is not None else 0
                    end_time = timestamp[1] if timestamp[1] is not None else start_time + 1
                    
                    segment = TranscriptSegment(
                        id=i,
                        start=start_time,
                        end=end_time,
                        text=chunk.get("text", "").strip(),
                        words=[]
                    )
                    segments.append(segment)
            
            total_duration = segments[-1].end if segments else 0
            total_words = len(all_words) if all_words else len(full_text.split())
            
            if progress_callback:
                progress_callback(100, 100, "Transcription complete")
            
            transcript_data = {
                "audio_path": str(audio_path),
                "audio_name": audio_path.stem,
                "language": language or "auto",
                "full_text": full_text,
                "total_duration": total_duration,
                "total_segments": len(segments),
                "total_words": total_words,
                "segments": [seg.to_dict() for seg in segments],
                "words": [w.to_dict() for w in all_words] if all_words else [],
                "word_level_timestamps": word_level_success
            }
            
            logger.info(f"Transcription complete: {len(segments)} segments, {total_words} words")
            
            # For English audio (not video), perform forced alignment and pitch extraction
            # Skip alignment/pitch for video files or non-English audio
            detected_language = language or "auto"
            # Check if language is English (either explicitly set or detected)
            is_english = detected_language.lower() in ['en', 'english', 'auto']
            # For auto-detection, check the first few words for common English patterns
            if detected_language == 'auto' and full_text:
                # Simple heuristic: check for common English words and characters
                text_lower = full_text.lower()
                english_indicators = ['the ', 'is ', 'are ', 'was ', 'were ', 'have ', 'has ', 'and ', 'or ', 'but ']
                chinese_chars = sum(1 for c in full_text if '\u4e00' <= c <= '\u9fff')
                english_score = sum(1 for ind in english_indicators if ind in text_lower)
                # If has Chinese characters, not English
                if chinese_chars > len(full_text) * 0.1:
                    is_english = False
                elif english_score >= 2:
                    is_english = True
                else:
                    is_english = False
            
            # Only perform alignment and pitch extraction for English audio files (not video)
            if is_english and not skip_alignment_pitch:
                logger.info("English audio detected, performing forced alignment and pitch extraction...")
                
                # Forced alignment with Wav2Vec2
                try:
                    if progress_callback:
                        progress_callback(85, 100, "Performing forced alignment...")
                    
                    alignment_svc = get_alignment_service()
                    alignment_result = alignment_svc.align_audio(
                        str(audio_path), 
                        full_text,
                        progress_callback=lambda p, m: logger.info(f"Alignment: {p}% - {m}")
                    )
                    
                    if alignment_result.get("success"):
                        transcript_data["alignment"] = {
                            "enabled": True,
                            "word_alignments": alignment_result.get("word_alignments", []),
                            "char_alignments": alignment_result.get("char_alignments", [])
                        }
                        logger.info(f"Forced alignment complete: {len(alignment_result.get('word_alignments', []))} words aligned")
                    else:
                        logger.warning(f"Forced alignment failed: {alignment_result.get('error')}")
                        transcript_data["alignment"] = {"enabled": False, "error": alignment_result.get("error")}
                        
                except Exception as e:
                    logger.error(f"Forced alignment error: {e}")
                    transcript_data["alignment"] = {"enabled": False, "error": str(e)}
                
                # Pitch extraction with TorchCrepe
                try:
                    if progress_callback:
                        progress_callback(92, 100, "Extracting pitch...")
                    
                    pitch_svc = get_pitch_service()
                    pitch_result = pitch_svc.extract_pitch(
                        str(audio_path),
                        hop_length_ms=10.0,
                        fmin=50.0,
                        fmax=550.0,
                        progress_callback=lambda p, m: logger.info(f"Pitch: {p}% - {m}")
                    )
                    
                    if pitch_result.get("success"):
                        transcript_data["pitch"] = {
                            "enabled": True,
                            "hop_length_ms": pitch_result.get("hop_length_ms", 10.0),
                            "sample_rate": pitch_result.get("sample_rate", 16000),
                            "fmin": pitch_result.get("fmin", 50.0),
                            "fmax": pitch_result.get("fmax", 550.0),
                            "f0": pitch_result.get("f0", []),
                            "periodicity": pitch_result.get("periodicity", []),
                            "times": pitch_result.get("times", [])
                        }
                        logger.info(f"Pitch extraction complete: {len(pitch_result.get('f0', []))} frames")
                    else:
                        logger.warning(f"Pitch extraction failed: {pitch_result.get('error')}")
                        transcript_data["pitch"] = {"enabled": False, "error": pitch_result.get("error")}
                        
                except Exception as e:
                    logger.error(f"Pitch extraction error: {e}")
                    transcript_data["pitch"] = {"enabled": False, "error": str(e)}
            else:
                if skip_alignment_pitch:
                    reason = "Video file - alignment/pitch only for audio"
                    logger.info("Video file detected, skipping alignment and pitch extraction")
                else:
                    reason = "Non-English audio"
                    logger.info("Non-English audio detected, skipping alignment and pitch extraction")
                transcript_data["alignment"] = {"enabled": False, "reason": reason}
                transcript_data["pitch"] = {"enabled": False, "reason": reason}
            
            if progress_callback:
                progress_callback(100, 100, "Processing complete")
            
            return {
                "success": True,
                "data": transcript_data
            }
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def _estimate_word_timestamps(self, chunks: List[Dict]) -> List[Dict]:
        """Estimate word-level timestamps from chunk-level timestamps"""
        word_chunks = []
        
        for chunk in chunks:
            timestamp = chunk.get("timestamp", (0, 0))
            start_time = timestamp[0] if timestamp[0] is not None else 0
            end_time = timestamp[1] if timestamp[1] is not None else start_time + 1
            text = chunk.get("text", "").strip()
            
            if not text:
                continue
            
            words = text.split()
            if not words:
                continue
            
            duration = end_time - start_time
            word_duration = duration / len(words)
            
            for i, word in enumerate(words):
                word_start = start_time + i * word_duration
                word_end = word_start + word_duration
                
                word_chunks.append({
                    "text": word,
                    "timestamp": (word_start, word_end)
                })
        
        return word_chunks
    
    def _build_sentences_from_words(self, words: List[TranscriptWord]) -> List[TranscriptSegment]:
        """Build sentence-level segments from word-level timestamps"""
        if not words:
            return []
        
        segments = []
        current_sentence_words = []
        sentence_id = 0
        
        sentence_end_pattern = re.compile(r'[.!?;:]+$')
        
        for word in words:
            current_sentence_words.append(word)
            
            if sentence_end_pattern.search(word.word):
                sentence_text = ' '.join(w.word for w in current_sentence_words)
                sentence_start = current_sentence_words[0].start
                sentence_end = current_sentence_words[-1].end
                
                segment = TranscriptSegment(
                    id=sentence_id,
                    start=sentence_start,
                    end=sentence_end,
                    text=sentence_text.strip(),
                    words=[w.to_dict() for w in current_sentence_words]
                )
                segments.append(segment)
                
                sentence_id += 1
                current_sentence_words = []
        
        # Handle remaining words
        if current_sentence_words:
            sentence_text = ' '.join(w.word for w in current_sentence_words)
            sentence_start = current_sentence_words[0].start
            sentence_end = current_sentence_words[-1].end
            
            segment = TranscriptSegment(
                id=sentence_id,
                start=sentence_start,
                end=sentence_end,
                text=sentence_text.strip(),
                words=[w.to_dict() for w in current_sentence_words]
            )
            segments.append(segment)
        
        return segments
    
    def transcribe_and_save(
        self, 
        audio_path: str, 
        output_dir: str = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Transcribe audio and save results
        
        Args:
            audio_path: Path to audio file
            output_dir: Output directory, defaults to audio's directory
            **kwargs: Additional arguments for transcribe()
            
        Returns:
            Transcription result with saved paths
        """
        result = self.transcribe(audio_path, **kwargs)
        
        if not result.get("success"):
            return result
        
        audio_path = Path(audio_path)
        
        if output_dir is None:
            output_dir = audio_path.parent
        else:
            output_dir = Path(output_dir)
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Save JSON transcript
            json_path = output_dir / f"{audio_path.stem}_transcript.json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(result["data"], f, ensure_ascii=False, indent=2)
            
            # Save plain text
            txt_path = output_dir / f"{audio_path.stem}.txt"
            with open(txt_path, 'w', encoding='utf-8') as f:
                f.write(result["data"]["full_text"])
            
            logger.info(f"Transcript saved: {json_path}")
            
            result["json_path"] = str(json_path)
            result["txt_path"] = str(txt_path)
            
        except Exception as e:
            logger.error(f"Failed to save transcript: {e}")
            result["save_error"] = str(e)
        
        return result
    
    def export_srt(self, transcript_data: Dict, output_path: str) -> bool:
        """Export SRT subtitle file"""
        try:
            segments = transcript_data.get("segments", [])
            
            with open(output_path, 'w', encoding='utf-8') as f:
                for i, segment in enumerate(segments, 1):
                    start = self._seconds_to_srt_time(segment["start"])
                    end = self._seconds_to_srt_time(segment["end"])
                    text = segment["text"]
                    
                    f.write(f"{i}\n")
                    f.write(f"{start} --> {end}\n")
                    f.write(f"{text}\n\n")
            
            logger.info(f"SRT exported: {output_path}")
            return True
            
        except Exception as e:
            logger.error(f"SRT export failed: {e}")
            return False
    
    def _seconds_to_srt_time(self, seconds: float) -> str:
        """Convert seconds to SRT time format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
    
    def is_available(self) -> bool:
        """Check if Whisper service is available"""
        return os.path.exists(self.model_path)


# Singleton instance
_whisper_service = None


def get_whisper_service() -> WhisperService:
    """Get Whisper service singleton"""
    global _whisper_service
    if _whisper_service is None:
        _whisper_service = WhisperService()
    return _whisper_service

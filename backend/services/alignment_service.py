"""
Wav2Vec2 Forced Alignment Service
Uses Wav2Vec2 model for CTC-based forced alignment of audio with transcript.

Weights are loaded from the local directory resolved by `model_paths.resolve_model_path`
(typically downloaded via Settings → Model Management from ModelScope:
`facebook/wav2vec2-base-960h`, https://modelscope.cn/models/facebook/wav2vec2-base-960h/summary).

Reference: https://pytorch.org/audio/stable/tutorials/forced_alignment_tutorial.html
"""

import os
import logging
import torch
import numpy as np
import soundfile as sf
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict

from model_paths import resolve_model_path, get_user_models_dir

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Relative path inside the models root for wav2vec2
WAV2VEC2_MODEL_REL = "multimodal_analyzer/wav2vec2-base-960h"


def get_wav2vec2_model_path() -> Optional[str]:
    """Resolve the wav2vec2 model directory at call time (supports custom download roots)."""
    resolved = resolve_model_path(WAV2VEC2_MODEL_REL)
    if resolved:
        return str(resolved)
    return None


# Backward-compat constant – reflects the default user-models location.
# Prefer get_wav2vec2_model_path() when you need the live-resolved path.
WAV2VEC2_MODEL_PATH = str(get_user_models_dir() / WAV2VEC2_MODEL_REL)


@dataclass
class AlignedWord:
    word: str
    start: float
    end: float
    score: float

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class AlignedChar:
    char: str
    start: float
    end: float
    score: float

    def to_dict(self) -> Dict:
        return asdict(self)


class AlignmentService:
    """Forced alignment using Wav2Vec2 (HuggingFace Transformers backend)."""

    def __init__(self):
        self.model = None
        self.processor = None
        self.device = None
        self.sample_rate = 16000
        self.labels: List[str] = []
        self.dictionary: Dict[str, int] = {}
        self._initialized = False

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def initialize(self) -> bool:
        if self._initialized:
            return True

        model_path = get_wav2vec2_model_path()
        if not model_path:
            logger.error(
                "Wav2Vec2 model not found. "
                "Please download it from Settings > Model Management."
            )
            return False

        logger.info(f"Loading Wav2Vec2 model from: {model_path}")

        try:
            from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            logger.info(f"Using device: {self.device}")

            self.processor = Wav2Vec2Processor.from_pretrained(
                model_path, local_files_only=True
            )
            self.model = Wav2Vec2ForCTC.from_pretrained(
                model_path, local_files_only=True
            )
            self.model.to(self.device)
            self.model.eval()

            vocab = self.processor.tokenizer.get_vocab()
            sorted_vocab = sorted(vocab.items(), key=lambda x: x[1])
            self.labels = [item[0] for item in sorted_vocab]
            self.dictionary = vocab

            logger.info(
                f"Wav2Vec2 ready. "
                f"Vocab size: {len(self.labels)}, sample rate: {self.sample_rate}"
            )
            self._initialized = True
            return True

        except Exception as e:
            logger.error(f"Failed to load Wav2Vec2 model: {e}")
            import traceback
            traceback.print_exc()
            return False

    # ------------------------------------------------------------------
    # Audio loading
    # ------------------------------------------------------------------

    def _load_audio(self, audio_path: str) -> Tuple[torch.Tensor, int]:
        """Load and resample audio to 16 kHz mono."""
        import resampy

        data, sr = sf.read(audio_path, dtype="float32")
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)
        if sr != self.sample_rate:
            data = resampy.resample(data, sr, self.sample_rate)

        waveform = torch.from_numpy(data).unsqueeze(0)  # (1, samples)
        return waveform, self.sample_rate

    # ------------------------------------------------------------------
    # Emission computation
    # ------------------------------------------------------------------

    def _get_emissions(self, waveform: torch.Tensor) -> torch.Tensor:
        with torch.inference_mode():
            waveform_np = waveform.squeeze().numpy()
            inputs = self.processor(
                waveform_np,
                sampling_rate=self.sample_rate,
                return_tensors="pt",
                padding=True,
            )
            input_values = inputs.input_values.to(self.device)
            outputs = self.model(input_values)
            emissions = torch.log_softmax(outputs.logits, dim=-1)
        return emissions[0].cpu().detach()

    # ------------------------------------------------------------------
    # CTC alignment algorithm
    # ------------------------------------------------------------------

    def _get_trellis(
        self, emission: torch.Tensor, tokens: List[int], blank_id: int = 0
    ) -> torch.Tensor:
        num_frame = emission.size(0)
        num_tokens = len(tokens)

        trellis = torch.zeros((num_frame, num_tokens))
        trellis[1:, 0] = torch.cumsum(emission[1:, blank_id], 0)
        trellis[0, 1:] = -float("inf")
        trellis[-num_tokens + 1 :, 0] = float("inf")

        for t in range(num_frame - 1):
            trellis[t + 1, 1:] = torch.maximum(
                trellis[t, 1:] + emission[t, blank_id],
                trellis[t, :-1] + emission[t, tokens[1:]],
            )
        return trellis

    def _backtrack(
        self,
        trellis: torch.Tensor,
        emission: torch.Tensor,
        tokens: List[int],
        blank_id: int = 0,
    ) -> List[Dict]:
        t, j = trellis.size(0) - 1, trellis.size(1) - 1
        path = [
            {
                "token_index": j,
                "time_index": t,
                "score": emission[t, blank_id].exp().item(),
            }
        ]

        while j > 0:
            assert t > 0
            p_stay = emission[t - 1, blank_id]
            p_change = emission[t - 1, tokens[j]]
            stayed = trellis[t - 1, j] + p_stay
            changed = trellis[t - 1, j - 1] + p_change
            t -= 1
            if changed > stayed:
                j -= 1
            prob = (p_change if changed > stayed else p_stay).exp().item()
            path.append({"token_index": j, "time_index": t, "score": prob})

        while t > 0:
            prob = emission[t - 1, blank_id].exp().item()
            path.append({"token_index": j, "time_index": t - 1, "score": prob})
            t -= 1

        return path[::-1]

    def _merge_repeats(self, path: List[Dict], transcript: str) -> List[Dict]:
        i1, i2 = 0, 0
        segments = []
        while i1 < len(path):
            while i2 < len(path) and path[i1]["token_index"] == path[i2]["token_index"]:
                i2 += 1
            score = sum(path[k]["score"] for k in range(i1, i2)) / (i2 - i1)
            segments.append(
                {
                    "label": transcript[path[i1]["token_index"]],
                    "start": path[i1]["time_index"],
                    "end": path[i2 - 1]["time_index"] + 1,
                    "score": score,
                }
            )
            i1 = i2
        return segments

    def _merge_words(
        self, segments: List[Dict], separator: str = "|"
    ) -> List[Dict]:
        words = []
        i1, i2 = 0, 0
        while i1 < len(segments):
            if i2 >= len(segments) or segments[i2]["label"] == separator:
                if i1 != i2:
                    segs = segments[i1:i2]
                    word = "".join(seg["label"] for seg in segs)
                    total_length = sum(seg["end"] - seg["start"] for seg in segs)
                    if total_length > 0:
                        score = (
                            sum(
                                seg["score"] * (seg["end"] - seg["start"])
                                for seg in segs
                            )
                            / total_length
                        )
                    else:
                        score = sum(seg["score"] for seg in segs) / len(segs)
                    words.append(
                        {
                            "word": word,
                            "start": segments[i1]["start"],
                            "end": segments[i2 - 1]["end"],
                            "score": score,
                        }
                    )
                i1 = i2 + 1
                i2 = i1
            else:
                i2 += 1
        return words

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def align_audio(
        self,
        audio_path: str,
        transcript: str,
        progress_callback: Optional[callable] = None,
    ) -> Dict[str, Any]:
        if not self._initialized:
            if not self.initialize():
                return {"success": False, "error": "Failed to initialize alignment model"}

        try:
            if progress_callback:
                progress_callback(10, "Loading audio...")

            waveform, sr = self._load_audio(audio_path)
            duration = waveform.shape[1] / sr

            if progress_callback:
                progress_callback(20, "Computing emissions...")

            emission = self._get_emissions(waveform)

            # Prepare transcript
            transcript_clean = " ".join(transcript.upper().strip().split())

            # Filter to vocabulary characters
            filtered_chars = []
            for c in transcript_clean:
                if c in self.dictionary:
                    filtered_chars.append(c)
                elif c == " ":
                    filtered_chars.append(c)
            transcript_filtered = " ".join("".join(filtered_chars).split())

            # Add word-boundary markers
            transcript_with_boundaries = "|" + "|".join(transcript_filtered.split()) + "|"

            logger.info(
                f"Transcript len: {len(transcript_clean)}, "
                f"filtered: {len(transcript_filtered)}, "
                f"with boundaries: {len(transcript_with_boundaries)}"
            )

            if progress_callback:
                progress_callback(40, "Building trellis...")

            tokens = []
            for c in transcript_with_boundaries:
                if c in self.dictionary:
                    tokens.append(self.dictionary[c])
                elif c == " ":
                    tokens.append(self.dictionary.get("|", 4))
                else:
                    logger.warning(f"Unexpected char not in vocab: '{c}'")

            if not tokens:
                return {"success": False, "error": "No valid tokens in transcript"}

            trellis = self._get_trellis(emission, tokens)

            if progress_callback:
                progress_callback(60, "Backtracking alignment...")

            path = self._backtrack(trellis, emission, tokens)

            if progress_callback:
                progress_callback(80, "Merging segments...")

            char_segments = self._merge_repeats(path, transcript_with_boundaries)
            word_segments = self._merge_words(char_segments)

            # Convert frame indices to time
            samples_per_frame = waveform.shape[1] / emission.shape[0]
            frame_duration = samples_per_frame / sr
            logger.info(
                f"Frame info: {emission.shape[0]} frames, "
                f"{samples_per_frame:.1f} samples/frame, "
                f"{frame_duration * 1000:.1f} ms/frame"
            )

            char_alignments = [
                AlignedChar(
                    char=seg["label"],
                    start=round(seg["start"] * frame_duration, 3),
                    end=round(seg["end"] * frame_duration, 3),
                    score=round(seg["score"], 3),
                )
                for seg in char_segments
                if seg["label"] != "|"
            ]

            word_alignments = [
                AlignedWord(
                    word=seg["word"],
                    start=round(seg["start"] * frame_duration, 3),
                    end=round(seg["end"] * frame_duration, 3),
                    score=round(seg["score"], 3),
                )
                for seg in word_segments
            ]

            if progress_callback:
                progress_callback(100, "Alignment complete")

            logger.info(
                f"Aligned {len(word_alignments)} words, "
                f"{len(char_alignments)} characters"
            )

            return {
                "success": True,
                "enabled": True,
                "duration": duration,
                "word_alignments": [w.to_dict() for w in word_alignments],
                "char_alignments": [c.to_dict() for c in char_alignments],
            }

        except Exception as e:
            logger.error(f"Alignment failed: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}


# Singleton instance
_alignment_service: Optional[AlignmentService] = None


def get_alignment_service() -> AlignmentService:
    global _alignment_service
    if _alignment_service is None:
        _alignment_service = AlignmentService()
    return _alignment_service

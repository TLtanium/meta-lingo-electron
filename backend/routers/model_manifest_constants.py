"""
Identifiers and documentation URLs for optional models in MODEL_MANIFEST.

Wav2Vec2 weights for forced alignment are fetched via ModelScope `snapshot_download`
(Settings → Model Management), not from the Hugging Face Hub at runtime.
"""

# Forced alignment (English audio) — same weights as Hugging Face `facebook/wav2vec2-base-960h`
WAV2VEC2_MODELSCOPE_MODEL_ID = "facebook/wav2vec2-base-960h"

"""
Praat Acoustic Analysis Service
Uses praat-parselmouth for spectrogram, formant, intensity, HNR, jitter, and shimmer extraction.
"""

import os
import logging
import numpy as np
from typing import Dict, Any, Optional, List

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Maximum number of time frames for spectrogram data sent to frontend.
# Higher = more detail but bigger JSON and slower rendering.
# 2000 frames is a good balance for visualization.
MAX_SPECTROGRAM_TIME_FRAMES = 2000

# Maximum number of frequency bins
MAX_SPECTROGRAM_FREQ_BINS = 128


def median_filter_1d(arr: list, kernel_size: int = 5) -> list:
    """Apply a 1D median filter to smooth formant/pitch tracks.
    Zeros are treated as missing data and preserved."""
    if len(arr) < kernel_size:
        return arr
    half = kernel_size // 2
    result = arr[:]
    for i in range(half, len(arr) - half):
        if arr[i] <= 0:
            continue  # preserve missing data markers
        window = [arr[j] for j in range(i - half, i + half + 1) if arr[j] > 0]
        if window:
            window.sort()
            result[i] = window[len(window) // 2]
    return result


class AcousticService:
    """Service for acoustic analysis using Praat (via parselmouth)"""

    def __init__(self):
        self._initialized = False
        self._parselmouth = None

    def initialize(self) -> bool:
        """Initialize the parselmouth library"""
        if self._initialized:
            return True

        try:
            import parselmouth
            self._parselmouth = parselmouth
            self._initialized = True
            logger.info(f"Parselmouth initialized: version {parselmouth.__version__}")
            return True
        except ImportError as e:
            logger.error(f"Failed to import parselmouth: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize parselmouth: {e}")
            return False

    def is_available(self) -> bool:
        """Check if parselmouth is available"""
        if not self._initialized:
            return self.initialize()
        return self._initialized

    def analyze(
        self,
        audio_path: str,
        max_formant: int = 5500,
        max_number_of_formants: int = 5,
        time_step: float = 0.01,
        dynamic_range: float = 50.0,
        gender: str = "male",
        progress_callback: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """
        Perform full acoustic analysis on an audio file.

        Args:
            audio_path: Path to audio file
            max_formant: Maximum formant frequency (5500 for male, 6000 for female)
            max_number_of_formants: Number of formants to extract (default 5)
            time_step: Time step in seconds (default 0.01 = 10ms)
            dynamic_range: Dynamic range for spectrogram in dB (default 50)
            gender: Speaker gender ('male' or 'female')
            progress_callback: Optional callback(percentage, message)

        Returns:
            Dictionary with acoustic analysis results
        """
        if not self._initialized:
            if not self.initialize():
                return {"success": False, "error": "Failed to initialize parselmouth"}

        try:
            if progress_callback:
                progress_callback(5, "Loading audio for acoustic analysis...")

            # Load audio file
            sound = self._parselmouth.Sound(audio_path)
            duration = sound.get_total_duration()
            logger.info(f"Loaded audio: {duration:.2f}s, sample rate: {sound.sampling_frequency}")

            if progress_callback:
                progress_callback(10, "Extracting spectrogram...")

            # 1. Extract spectrogram
            spectrogram_data = self._extract_spectrogram(
                sound, dynamic_range, time_step, max_formant
            )

            if progress_callback:
                progress_callback(40, "Extracting formants...")

            # 2. Extract formants (F1-F5)
            formant_data = self._extract_formants(
                sound, max_formant, max_number_of_formants, time_step
            )

            if progress_callback:
                progress_callback(60, "Extracting intensity and HNR...")

            # 3. Extract optional features
            from services.acoustic_features import (
                extract_intensity,
                extract_hnr,
                extract_jitter_shimmer,
            )

            intensity_data = extract_intensity(sound, time_step)

            if progress_callback:
                progress_callback(75, "Extracting HNR...")

            hnr_data = extract_hnr(sound, time_step)

            if progress_callback:
                progress_callback(85, "Extracting jitter and shimmer...")

            jitter_data, shimmer_data = extract_jitter_shimmer(sound)

            if progress_callback:
                progress_callback(100, "Acoustic analysis complete")

            result = {
                "enabled": True,
                "spectrogram": spectrogram_data,
                "formants": formant_data,
                "intensity": intensity_data,
                "hnr": hnr_data,
                "jitter": jitter_data,
                "shimmer": shimmer_data,
                "parameters": {
                    "max_formant": max_formant,
                    "max_number_of_formants": max_number_of_formants,
                    "time_step": time_step,
                    "dynamic_range": dynamic_range,
                    "gender": gender,
                },
            }

            logger.info(
                f"Acoustic analysis complete: spectrogram {len(spectrogram_data.get('times', []))} frames, "
                f"formants {len(formant_data.get('times', []))} frames"
            )

            return {"success": True, "data": result}

        except Exception as e:
            logger.error(f"Acoustic analysis failed: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    def _extract_spectrogram(
        self,
        sound,
        dynamic_range: float,
        time_step: float,
        max_freq: float,
    ) -> Dict[str, Any]:
        """
        Extract spectrogram using Praat algorithm.
        Time axis is downsampled to MAX_SPECTROGRAM_TIME_FRAMES for efficient
        JSON serialization and frontend rendering.

        Uses parselmouth's numpy interface (spectrogram.values) which is the
        correct and reliable API. Do NOT use get_value_in_frame_bin() — that
        method does not exist in parselmouth and will throw AttributeError.

        Returns:
            Dict with times, frequencies, energy_matrix (dB), dynamic_range
        """
        try:
            # Create spectrogram object
            spectrogram = sound.to_spectrogram(
                time_step=time_step,
                maximum_frequency=max_freq,
                window_length=0.025,  # 25ms window (standard for speech)
                frequency_step=20.0,  # Hz step for frequency resolution
            )

            # Access dimensions via parselmouth's SampledXY attributes
            # spectrogram.nx = number of time frames
            # spectrogram.ny = number of frequency bins
            # spectrogram.values = numpy ndarray of shape (n_freqs, n_times) with power values
            n_times = spectrogram.nx
            n_freqs = spectrogram.ny

            # Compute frequency axis: y1 = centre of first bin, dy = bin spacing
            freq_indices = np.linspace(0, n_freqs - 1, min(MAX_SPECTROGRAM_FREQ_BINS, n_freqs), dtype=int)
            all_freqs = spectrogram.y1 + np.arange(n_freqs) * spectrogram.dy
            frequencies = [round(float(all_freqs[i]), 1) for i in freq_indices]

            # Compute time axis: x1 = centre of first frame, dx = frame spacing
            target_time_bins = min(MAX_SPECTROGRAM_TIME_FRAMES, n_times)
            time_indices = (
                np.linspace(0, n_times - 1, target_time_bins, dtype=int)
                if n_times > target_time_bins
                else np.arange(n_times)
            )
            all_times = spectrogram.x1 + np.arange(n_times) * spectrogram.dx
            times = [round(float(all_times[i]), 4) for i in time_indices]

            # Extract energy matrix using numpy (vectorized — no per-frame loop).
            # spectrogram.values shape: (n_freqs, n_times) — power spectral density values.
            spec_values = spectrogram.values  # (n_freqs, n_times)
            sub = spec_values[np.ix_(freq_indices, time_indices)]  # (n_freq_bins, n_time_bins)

            # Convert power to dB: 10 * log10(power). Silence → -dynamic_range dB.
            with np.errstate(divide='ignore', invalid='ignore'):
                db_sub = np.where(
                    sub > 0,
                    10.0 * np.log10(np.maximum(sub, 1e-30)),
                    -float(dynamic_range),
                )

            # Dynamic range clipping relative to peak
            max_db = float(np.max(db_sub))
            if not np.isfinite(max_db):
                max_db = 0.0
            min_db = max_db - dynamic_range
            db_sub = np.clip(db_sub, min_db, max_db)
            db_sub = np.round(db_sub, 1)

            # Transpose to (n_times, n_freqs) for JSON as energy_matrix[time][freq]
            energy_matrix = db_sub.T.tolist()

            logger.info(
                f"Spectrogram: {n_times} original frames → {len(times)} downsampled × {len(freq_indices)} freq bins, "
                f"range [{min_db:.1f}, {max_db:.1f}] dB, "
                f"data size ≈ {len(times) * len(freq_indices) * 6 / 1024:.0f} KB"
            )

            return {
                "times": times,
                "frequencies": frequencies,
                "energy_matrix": energy_matrix,
                "dynamic_range": dynamic_range,
            }

        except Exception as e:
            logger.error(f"Spectrogram extraction failed: {e}")
            import traceback
            traceback.print_exc()
            return {
                "times": [],
                "frequencies": [],
                "energy_matrix": [],
                "dynamic_range": dynamic_range,
            }

    def _extract_formants(
        self,
        sound,
        max_formant: float,
        max_number_of_formants: int,
        time_step: float,
    ) -> Dict[str, Any]:
        """
        Extract F1-F5 formant trajectories using Burg method.
        Applies median smoothing to reduce noise.

        Returns:
            Dict with times, f1, f2, f3, f4, f5 arrays
        """
        try:
            formant_obj = sound.to_formant_burg(
                time_step=time_step,
                max_number_of_formants=max_number_of_formants,
                maximum_formant=max_formant,
                window_length=0.025,
                pre_emphasis_from=50.0,
            )

            n_frames = formant_obj.get_number_of_frames()

            times = []
            f1, f2, f3, f4, f5 = [], [], [], [], []
            formant_arrays = [f1, f2, f3, f4, f5]

            for i in range(n_frames):
                t = formant_obj.get_time_from_frame_number(i + 1)
                times.append(round(t, 4))

                for fi in range(min(5, max_number_of_formants)):
                    try:
                        value = formant_obj.get_value_at_time(
                            formant_number=fi + 1, time=t
                        )
                        if value is None or np.isnan(value):
                            formant_arrays[fi].append(0.0)
                        else:
                            formant_arrays[fi].append(round(float(value), 1))
                    except Exception:
                        formant_arrays[fi].append(0.0)

                # Fill remaining formants with 0 if max_number_of_formants < 5
                for fi in range(max_number_of_formants, 5):
                    formant_arrays[fi].append(0.0)

            # Clamp formants to plausible speech ranges before smoothing
            # (removes acoustic analysis outliers that blow up far outside vocal tract range)
            speech_ranges = [(200, 1200), (500, 3500), (1000, 4500), (1500, 5000), (2000, 5500)]
            for fi, (lo, hi) in enumerate(speech_ranges):
                arr = formant_arrays[fi]
                for j in range(len(arr)):
                    if arr[j] > 0 and (arr[j] < lo or arr[j] > hi):
                        arr[j] = 0.0  # mark as unvoiced/invalid

            # Apply median smoothing to reduce noise.
            # kernel=11 → 110ms smoothing window at 10ms step (≈ Praat's standard smoothing).
            kernel = 11
            f1 = median_filter_1d(f1, kernel)
            f2 = median_filter_1d(f2, kernel)
            f3 = median_filter_1d(f3, kernel)
            f4 = median_filter_1d(f4, kernel)
            f5 = median_filter_1d(f5, kernel)

            logger.info(f"Formants: {n_frames} frames extracted (clamped + smoothed with median k={kernel})")

            return {
                "times": times,
                "f1": f1,
                "f2": f2,
                "f3": f3,
                "f4": f4,
                "f5": f5,
            }

        except Exception as e:
            logger.error(f"Formant extraction failed: {e}")
            return {
                "times": [],
                "f1": [], "f2": [], "f3": [], "f4": [], "f5": [],
            }


# Singleton instance
_acoustic_service: Optional[AcousticService] = None


def get_acoustic_service() -> AcousticService:
    """Get or create the singleton AcousticService instance"""
    global _acoustic_service
    if _acoustic_service is None:
        _acoustic_service = AcousticService()
    return _acoustic_service

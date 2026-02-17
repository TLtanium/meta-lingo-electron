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

            # Get time and frequency axes
            n_times = spectrogram.get_number_of_frames()
            n_freqs = spectrogram.get_number_of_bins()

            # Extract time points
            times = [round(spectrogram.get_time_from_frame_number(i + 1), 4) for i in range(n_times)]

            # Original frequency bins
            orig_frequencies = [
                spectrogram.get_frequency_from_bin_number(i + 1) for i in range(n_freqs)
            ]

            # Downsample frequency axis to ~128 bins
            target_freq_bins = min(128, n_freqs)
            freq_indices = np.linspace(0, n_freqs - 1, target_freq_bins, dtype=int)
            frequencies = [round(orig_frequencies[i], 1) for i in freq_indices]

            # Extract energy matrix in dB (power spectral density)
            # energy_matrix[time_idx][freq_idx]
            energy_matrix = []
            for t_idx in range(n_times):
                frame = []
                for f_idx in freq_indices:
                    # Get power spectral density value
                    value = spectrogram.get_value_in_frame_bin(t_idx + 1, int(f_idx) + 1)
                    if value is not None and value > 0:
                        # Convert to dB: 10 * log10(value)
                        db_value = 10.0 * np.log10(value + 1e-30)
                    else:
                        db_value = -dynamic_range
                    frame.append(round(float(db_value), 1))
                energy_matrix.append(frame)

            # Apply dynamic range clipping
            # Find the maximum dB value
            max_db = max(max(frame) for frame in energy_matrix) if energy_matrix else 0
            min_db = max_db - dynamic_range

            for t_idx in range(len(energy_matrix)):
                for f_idx in range(len(energy_matrix[t_idx])):
                    energy_matrix[t_idx][f_idx] = max(
                        min_db, energy_matrix[t_idx][f_idx]
                    )

            logger.info(
                f"Spectrogram: {n_times} frames x {target_freq_bins} freq bins, "
                f"range [{min_db:.1f}, {max_db:.1f}] dB"
            )

            return {
                "times": times,
                "frequencies": frequencies,
                "energy_matrix": energy_matrix,
                "dynamic_range": dynamic_range,
            }

        except Exception as e:
            logger.error(f"Spectrogram extraction failed: {e}")
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

            logger.info(f"Formants: {n_frames} frames extracted")

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

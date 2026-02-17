"""
Acoustic Features Extraction Functions
Extracts optional acoustic features: Intensity, HNR, Jitter, Shimmer
using Praat (via parselmouth).
"""

import logging
import numpy as np
from typing import Dict, Any, Tuple

logger = logging.getLogger(__name__)


def extract_intensity(sound, time_step: float = 0.01) -> Dict[str, Any]:
    """
    Extract intensity contour from a Praat Sound object.

    Args:
        sound: parselmouth.Sound object
        time_step: Time step in seconds

    Returns:
        Dict with times and values (dB) arrays
    """
    try:
        intensity_obj = sound.to_intensity(
            minimum_pitch=75.0,
            time_step=time_step,
        )

        n_frames = intensity_obj.get_number_of_frames()
        times = []
        values = []

        for i in range(n_frames):
            t = intensity_obj.get_time_from_frame_number(i + 1)
            val = intensity_obj.get_value(time=t)

            times.append(round(t, 4))
            if val is not None and not np.isnan(val):
                values.append(round(float(val), 2))
            else:
                values.append(0.0)

        logger.info(f"Intensity: {n_frames} frames extracted")
        return {"times": times, "values": values}

    except Exception as e:
        logger.error(f"Intensity extraction failed: {e}")
        return {"times": [], "values": []}


def extract_hnr(sound, time_step: float = 0.01) -> Dict[str, Any]:
    """
    Extract Harmonics-to-Noise Ratio (HNR) from a Praat Sound object.

    Args:
        sound: parselmouth.Sound object
        time_step: Time step in seconds

    Returns:
        Dict with times and values (dB) arrays
    """
    try:
        import parselmouth

        harmonicity_obj = sound.to_harmonicity_cc(
            time_step=time_step,
            minimum_pitch=75.0,
            silence_threshold=0.1,
            periods_per_window=1.0,
        )

        n_frames = harmonicity_obj.get_number_of_frames()
        times = []
        values = []

        for i in range(n_frames):
            t = harmonicity_obj.get_time_from_frame_number(i + 1)
            val = harmonicity_obj.get_value(time=t)

            times.append(round(t, 4))
            if val is not None and not np.isnan(val) and val != -200:
                # Praat uses -200 for undefined HNR
                values.append(round(float(val), 2))
            else:
                values.append(0.0)

        logger.info(f"HNR: {n_frames} frames extracted")
        return {"times": times, "values": values}

    except Exception as e:
        logger.error(f"HNR extraction failed: {e}")
        return {"times": [], "values": []}


def extract_jitter_shimmer(sound) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Extract Jitter and Shimmer scalar measurements from a Praat Sound object.

    These are global voice quality metrics (not time-series).

    Args:
        sound: parselmouth.Sound object

    Returns:
        Tuple of (jitter_dict, shimmer_dict)
    """
    try:
        import parselmouth
        from parselmouth.praat import call

        # Create PointProcess (pitch detection for jitter/shimmer)
        point_process = call(sound, "To PointProcess (periodic, cc)", 75, 600)

        # --- Jitter ---
        jitter_local = _safe_call(
            call, point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3
        )
        jitter_local_abs = _safe_call(
            call, point_process, "Get jitter (local, absolute)", 0, 0, 0.0001, 0.02, 1.3
        )
        jitter_rap = _safe_call(
            call, point_process, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3
        )
        jitter_ppq5 = _safe_call(
            call, point_process, "Get jitter (ppq5)", 0, 0, 0.0001, 0.02, 1.3
        )
        jitter_ddp = _safe_call(
            call, point_process, "Get jitter (ddp)", 0, 0, 0.0001, 0.02, 1.3
        )

        jitter_data = {
            "local": _safe_round(jitter_local, 6),
            "local_absolute": _safe_round(jitter_local_abs, 8),
            "rap": _safe_round(jitter_rap, 6),
            "ppq5": _safe_round(jitter_ppq5, 6),
            "ddp": _safe_round(jitter_ddp, 6),
        }

        # --- Shimmer ---
        shimmer_local = _safe_call(
            call, [sound, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6
        )
        shimmer_local_db = _safe_call(
            call, [sound, point_process], "Get shimmer (local_dB)", 0, 0, 0.0001, 0.02, 1.3, 1.6
        )
        shimmer_apq3 = _safe_call(
            call, [sound, point_process], "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6
        )
        shimmer_apq5 = _safe_call(
            call, [sound, point_process], "Get shimmer (apq5)", 0, 0, 0.0001, 0.02, 1.3, 1.6
        )
        shimmer_apq11 = _safe_call(
            call, [sound, point_process], "Get shimmer (apq11)", 0, 0, 0.0001, 0.02, 1.3, 1.6
        )
        shimmer_dda = _safe_call(
            call, [sound, point_process], "Get shimmer (dda)", 0, 0, 0.0001, 0.02, 1.3, 1.6
        )

        shimmer_data = {
            "local": _safe_round(shimmer_local, 6),
            "local_db": _safe_round(shimmer_local_db, 4),
            "apq3": _safe_round(shimmer_apq3, 6),
            "apq5": _safe_round(shimmer_apq5, 6),
            "apq11": _safe_round(shimmer_apq11, 6),
            "dda": _safe_round(shimmer_dda, 6),
        }

        logger.info(
            f"Jitter: local={jitter_data['local']}, Shimmer: local={shimmer_data['local']}"
        )
        return jitter_data, shimmer_data

    except Exception as e:
        logger.error(f"Jitter/Shimmer extraction failed: {e}")
        return (
            {"local": 0, "local_absolute": 0, "rap": 0, "ppq5": 0, "ddp": 0},
            {"local": 0, "local_db": 0, "apq3": 0, "apq5": 0, "apq11": 0, "dda": 0},
        )


def _safe_call(call_fn, *args) -> float:
    """Safely call a Praat function, returning 0 on failure."""
    try:
        result = call_fn(*args)
        if result is not None and not np.isnan(result):
            return float(result)
        return 0.0
    except Exception:
        return 0.0


def _safe_round(value: float, decimals: int) -> float:
    """Safely round a value, returning 0 on failure."""
    try:
        if value is None or np.isnan(value):
            return 0.0
        return round(value, decimals)
    except Exception:
        return 0.0

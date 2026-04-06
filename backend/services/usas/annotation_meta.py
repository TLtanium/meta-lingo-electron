"""
Metadata helpers for saved USAS JSON (.usas.json / transcript usas_annotations).

Used by semantic domain stats, sentiment USAS mode, etc. so behavior matches
upload-time tagging when optional keys are missing.
"""

from typing import Any, Dict


def infer_disambiguation_enabled(usas_data: Dict[str, Any]) -> bool:
    """
    Effective disambiguation flag for downstream aggregation.

    - If ``disambiguation_enabled`` is present, use it.
    - If missing: neural-tagged files default to False (matches DEFAULT_USAS_SETTINGS
      and top_n=5 multi-candidate storage); rule/hybrid legacy files default to True.
    """
    if "disambiguation_enabled" in usas_data:
        return bool(usas_data["disambiguation_enabled"])
    if usas_data.get("tagging_mode") == "neural":
        return False
    return True

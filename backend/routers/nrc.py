"""
NRC Emotion Lexicon API Router
Provides emotion/sentiment category information for CQL attribute support
"""

from fastapi import APIRouter
from typing import List, Dict, Any

router = APIRouter(prefix="/api/nrc", tags=["NRC"])

# NRC polarity labels
NRC_POLARITY_LABELS = [
    {"value": "positive", "label_zh": "积极", "label_en": "Positive"},
    {"value": "negative", "label_zh": "消极", "label_en": "Negative"},
    {"value": "neutral", "label_zh": "中性", "label_en": "Neutral"},
]

# NRC emotion dimension labels
NRC_EMOTION_LABELS = [
    {"value": "anger", "label_zh": "愤怒", "label_en": "Anger"},
    {"value": "anticipation", "label_zh": "期待", "label_en": "Anticipation"},
    {"value": "disgust", "label_zh": "厌恶", "label_en": "Disgust"},
    {"value": "fear", "label_zh": "恐惧", "label_en": "Fear"},
    {"value": "joy", "label_zh": "喜悦", "label_en": "Joy"},
    {"value": "sadness", "label_zh": "悲伤", "label_en": "Sadness"},
    {"value": "surprise", "label_zh": "惊讶", "label_en": "Surprise"},
    {"value": "trust", "label_zh": "信任", "label_en": "Trust"},
    {"value": "others", "label_zh": "其他/无情感", "label_en": "Others/No Emotion"},
]


@router.get("/emotions")
async def get_nrc_emotions() -> Dict[str, Any]:
    """
    Return all NRC emotion/polarity labels available for CQL nrc attribute.
    Format mirrors /api/usas/domains for frontend parity.
    """
    return {
        "success": True,
        "polarity": NRC_POLARITY_LABELS,
        "emotions": NRC_EMOTION_LABELS,
        "all_labels": [item["value"] for item in NRC_POLARITY_LABELS + NRC_EMOTION_LABELS],
    }

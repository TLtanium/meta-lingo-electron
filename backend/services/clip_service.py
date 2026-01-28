"""
CLIP Video Frame Classification Service
Uses CLIP (Contrastive Language-Image Pre-training) for video frame semantic classification
"""

import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, asdict

from config import MODELS_DIR

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model path - 使用 config.py 中的 MODELS_DIR
CLIP_MODEL_PATH = str(MODELS_DIR / "multimodal_analyzer" / "clip-vit-large-patch14")

# Predefined label categories
PRESET_LABELS = {
    "objects": ["person", "animal", "vehicle", "food", "text", "logo"],
    "scenes": ["indoor", "outdoor", "nature", "building", "urban", "rural"],
    "mood": ["bright", "dark", "colorful", "monochrome", "warm", "cool"],
    "dynamics": ["action", "static", "crowded", "empty", "fast", "slow"]
}

# Default labels (flattened from preset categories)
DEFAULT_LABELS = [
    "person", "animal", "vehicle", "food",
    "indoor", "outdoor", "nature", "building",
    "bright", "dark", "colorful",
    "action", "static", "crowded", "empty"
]


@dataclass
class ClipFrameResult:
    """Single frame classification result"""
    frame_number: int
    timestamp_seconds: float
    classifications: Dict[str, float]  # label -> confidence
    top_label: str
    confidence: float
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass 
class ClipVideoResult:
    """Complete video classification result"""
    video_path: str
    video_name: str
    fps: float
    total_frames: int
    width: int
    height: int
    duration: float
    frame_interval: int
    labels: List[str]
    frame_results: List[ClipFrameResult] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "video_path": self.video_path,
            "video_name": self.video_name,
            "fps": self.fps,
            "total_frames": self.total_frames,
            "width": self.width,
            "height": self.height,
            "duration": self.duration,
            "frame_interval": self.frame_interval,
            "labels": self.labels,
            "frame_results": [r.to_dict() for r in self.frame_results]
        }


class ClipService:
    """CLIP video frame classification service"""
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or CLIP_MODEL_PATH
        self.model = None
        self.processor = None
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
            logger.error("PyTorch not installed. Run: pip install torch")
            return False
    
    def initialize(self) -> bool:
        """Initialize the CLIP model"""
        if self._initialized:
            return True
            
        if not self._check_dependencies():
            return False
        
        try:
            from transformers import CLIPProcessor, CLIPModel
            import torch
            
            if not os.path.exists(self.model_path):
                logger.error(f"CLIP model not found: {self.model_path}")
                return False
            
            logger.info(f"Loading CLIP model from: {self.model_path}")
            
            # Load model and processor from local path
            self.processor = CLIPProcessor.from_pretrained(self.model_path)
            self.model = CLIPModel.from_pretrained(self.model_path)
            self.model = self.model.to(self.device)
            self.model.eval()
            
            self._initialized = True
            logger.info("CLIP model loaded successfully")
            return True
            
        except ImportError:
            logger.error("transformers not installed. Run: pip install transformers")
            return False
        except Exception as e:
            logger.error(f"Failed to load CLIP model: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def classify_image(self, image, labels: List[str]) -> Dict[str, float]:
        """
        Classify a single image with given labels
        
        Args:
            image: PIL Image or numpy array
            labels: List of text labels to classify against
            
        Returns:
            Dictionary mapping labels to confidence scores (0-1)
        """
        if not self._initialized:
            if not self.initialize():
                return {}
        
        try:
            import torch
            from PIL import Image
            import numpy as np
            
            # Convert numpy array to PIL Image if needed
            if isinstance(image, np.ndarray):
                image = Image.fromarray(image)
            
            # Prepare text prompts (add "a photo of" prefix for better results)
            text_prompts = [f"a photo of {label}" for label in labels]
            
            # Process inputs
            inputs = self.processor(
                text=text_prompts,
                images=image,
                return_tensors="pt",
                padding=True
            )
            
            # Move to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Get model outputs
            with torch.no_grad():
                outputs = self.model(**inputs)
                
                # Get image-text similarity scores
                logits_per_image = outputs.logits_per_image
                
                # Apply softmax to get probabilities
                probs = torch.nn.functional.softmax(logits_per_image, dim=1)
                probs = probs.cpu().numpy()[0]
            
            # Build result dictionary
            result = {label: float(prob) for label, prob in zip(labels, probs)}
            return result
            
        except Exception as e:
            logger.error(f"Image classification failed: {e}")
            import traceback
            traceback.print_exc()
            return {}
    
    def process_video(
        self,
        video_path: str,
        output_dir: str = None,
        labels: List[str] = None,
        frame_interval: int = 30,
        progress_callback: callable = None
    ) -> Dict[str, Any]:
        """
        Process video for frame classification
        
        Args:
            video_path: Path to video file
            output_dir: Output directory for results
            labels: List of labels to classify (uses defaults if not provided)
            frame_interval: Process every Nth frame
            progress_callback: Progress callback function(current, total, message)
            
        Returns:
            Processing result dictionary
        """
        if not self.initialize():
            return {"success": False, "error": "Model initialization failed"}
        
        video_path = Path(video_path)
        if not video_path.exists():
            return {"success": False, "error": f"Video file not found: {video_path}"}
        
        # Use default labels if not provided
        if labels is None or len(labels) == 0:
            labels = DEFAULT_LABELS
        
        # Set output directory
        if output_dir is None:
            output_dir = video_path.parent
        else:
            output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        video_name = video_path.stem
        
        # Get video info
        try:
            import cv2
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                return {"success": False, "error": "Cannot open video file"}
            
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = total_frames / fps if fps > 0 else 0
            
            logger.info(f"Video info: {width}x{height}, {fps}fps, {total_frames} frames, {duration:.2f}s")
        except ImportError:
            logger.error("OpenCV not installed. Run: pip install opencv-python")
            return {"success": False, "error": "OpenCV not installed"}
        
        if progress_callback:
            progress_callback(0, total_frames, "Starting CLIP analysis...")
        
        try:
            frame_results = []
            frames_to_process = total_frames // frame_interval + 1
            processed_count = 0
            
            frame_number = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Process every Nth frame
                if frame_number % frame_interval == 0:
                    timestamp = frame_number / fps if fps > 0 else 0
                    
                    # Convert BGR to RGB
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    
                    # Classify frame
                    classifications = self.classify_image(frame_rgb, labels)
                    
                    if classifications:
                        # Find top label
                        top_label = max(classifications, key=classifications.get)
                        confidence = classifications[top_label]
                        
                        frame_result = ClipFrameResult(
                            frame_number=frame_number,
                            timestamp_seconds=timestamp,
                            classifications=classifications,
                            top_label=top_label,
                            confidence=confidence
                        )
                        frame_results.append(frame_result)
                    
                    processed_count += 1
                    
                    if progress_callback and processed_count % 5 == 0:
                        progress_callback(
                            processed_count, 
                            frames_to_process,
                            f"Processing frame {frame_number}/{total_frames}..."
                        )
                
                frame_number += 1
            
            cap.release()
            
            if progress_callback:
                progress_callback(frames_to_process, frames_to_process, "CLIP analysis complete")
            
            # Build result
            result_data = ClipVideoResult(
                video_path=str(video_path),
                video_name=video_name,
                fps=fps,
                total_frames=total_frames,
                width=width,
                height=height,
                duration=duration,
                frame_interval=frame_interval,
                labels=labels,
                frame_results=frame_results
            )
            
            # Save JSON result
            json_path = output_dir / f"{video_name}_clip.json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(result_data.to_dict(), f, ensure_ascii=False, indent=2)
            
            logger.info(f"CLIP result saved: {json_path}")
            logger.info(f"Processed {len(frame_results)} frames with {len(labels)} labels")
            
            return {
                "success": True,
                "data": result_data.to_dict(),
                "json_path": str(json_path)
            }
            
        except Exception as e:
            logger.error(f"Video processing failed: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
        finally:
            if 'cap' in locals():
                cap.release()
    
    def get_preset_labels(self) -> Dict[str, List[str]]:
        """Get preset label categories"""
        return PRESET_LABELS
    
    def get_default_labels(self) -> List[str]:
        """Get default labels list"""
        return DEFAULT_LABELS.copy()
    
    def is_available(self) -> bool:
        """Check if CLIP service is available"""
        return os.path.exists(self.model_path)


# Singleton instance
_clip_service = None


def get_clip_service() -> ClipService:
    """Get CLIP service singleton"""
    global _clip_service
    if _clip_service is None:
        _clip_service = ClipService()
    return _clip_service


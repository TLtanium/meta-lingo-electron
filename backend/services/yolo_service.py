"""
YOLO Video Object Detection and Tracking Service
Uses YOLOv8 + BoT-SORT for video analysis
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
YOLO_MODEL_PATH = str(MODELS_DIR / "multimodal_analyzer" / "yolov8" / "yolov8x.pt")


@dataclass
class Detection:
    """Single detection result"""
    track_id: int
    class_id: int
    class_name: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]
    frame_number: int
    timestamp_seconds: float
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class TrackSegment:
    """Tracking segment for an object"""
    track_id: int
    class_name: str
    start_frame: int
    end_frame: int
    start_time: float
    end_time: float
    detections: List[Detection] = field(default_factory=list)
    color: str = ""
    
    def to_dict(self) -> Dict:
        return {
            "track_id": self.track_id,
            "class_name": self.class_name,
            "start_frame": self.start_frame,
            "end_frame": self.end_frame,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "color": self.color,
            "detections": [d.to_dict() for d in self.detections]
        }


class YoloService:
    """YOLO object detection and tracking service"""
    
    # COCO 80 class names
    COCO_CLASSES = [
        'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
        'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
        'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
        'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
        'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
        'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
        'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
        'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
        'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
        'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
    ]
    
    # Predefined colors for visualization
    COLORS = [
        "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
        "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
        "#F8B500", "#00CED1", "#FF69B4", "#32CD32", "#FF4500",
        "#9370DB", "#20B2AA", "#FFD700", "#DC143C", "#00FA9A"
    ]
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or YOLO_MODEL_PATH
        self.model = None
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
            logger.error("PyTorch not installed. Run: pip install torch torchvision")
            return False
    
    def initialize(self) -> bool:
        """Initialize the YOLO model"""
        if self._initialized:
            return True
            
        if not self._check_dependencies():
            return False
        
        try:
            from ultralytics import YOLO
            
            if not os.path.exists(self.model_path):
                logger.error(f"YOLO model not found: {self.model_path}")
                return False
            
            logger.info(f"Loading YOLO model from: {self.model_path}")
            self.model = YOLO(self.model_path)
            self._initialized = True
            logger.info("YOLO model loaded successfully")
            return True
            
        except ImportError:
            logger.error("ultralytics not installed. Run: pip install ultralytics")
            return False
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            return False
    
    def process_video(
        self,
        video_path: str,
        output_dir: str = None,
        conf_threshold: float = 0.5,
        extract_frames: bool = True,
        frame_interval: int = 30,
        progress_callback: callable = None
    ) -> Dict[str, Any]:
        """
        Process video for object detection and tracking
        
        Args:
            video_path: Path to video file
            output_dir: Output directory
            conf_threshold: Confidence threshold
            extract_frames: Whether to extract frame images
            frame_interval: Frame extraction interval
            progress_callback: Progress callback function
            
        Returns:
            Processing result dictionary
        """
        if not self.initialize():
            return {"success": False, "error": "Model initialization failed"}
        
        video_path = Path(video_path)
        if not video_path.exists():
            return {"success": False, "error": f"Video file not found: {video_path}"}
        
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
            cap.release()
            
            logger.info(f"Video info: {width}x{height}, {fps}fps, {total_frames} frames, {duration:.2f}s")
        except ImportError:
            logger.error("OpenCV not installed. Run: pip install opencv-python")
            return {"success": False, "error": "OpenCV not installed"}
        
        if progress_callback:
            progress_callback(0, total_frames, "Starting YOLO analysis...")
        
        try:
            # Run YOLO tracking
            results = self.model.track(
                source=str(video_path),
                persist=True,
                tracker="botsort.yaml",
                conf=conf_threshold,
                verbose=False,
                stream=True
            )
            
            all_detections = []
            track_segments = {}
            frames_dir = None
            
            if extract_frames:
                frames_dir = output_dir / f"{video_name}_frames"
                frames_dir.mkdir(exist_ok=True)
            
            frame_count = 0
            for result in results:
                frame_number = frame_count
                timestamp = frame_number / fps if fps > 0 else 0
                
                # Extract frames at interval
                if extract_frames and frame_count % frame_interval == 0:
                    frame = result.orig_img
                    frame_path = frames_dir / f"frame_{frame_number:06d}.jpg"
                    cv2.imwrite(str(frame_path), frame)
                
                # Process detections
                if result.boxes is not None and len(result.boxes) > 0:
                    boxes = result.boxes
                    
                    for i in range(len(boxes)):
                        bbox = boxes.xyxy[i].cpu().numpy().tolist()
                        conf = float(boxes.conf[i].cpu().numpy())
                        cls_id = int(boxes.cls[i].cpu().numpy())
                        
                        track_id = -1
                        if boxes.id is not None:
                            track_id = int(boxes.id[i].cpu().numpy())
                        
                        class_name = self.COCO_CLASSES[cls_id] if cls_id < len(self.COCO_CLASSES) else f"class_{cls_id}"
                        
                        detection = Detection(
                            track_id=track_id,
                            class_id=cls_id,
                            class_name=class_name,
                            confidence=conf,
                            bbox=bbox,
                            frame_number=frame_number,
                            timestamp_seconds=timestamp
                        )
                        all_detections.append(detection)
                        
                        # Update track segments
                        if track_id >= 0:
                            if track_id not in track_segments:
                                color = self.COLORS[track_id % len(self.COLORS)]
                                track_segments[track_id] = TrackSegment(
                                    track_id=track_id,
                                    class_name=class_name,
                                    start_frame=frame_number,
                                    end_frame=frame_number,
                                    start_time=timestamp,
                                    end_time=timestamp,
                                    color=color
                                )
                            else:
                                track_segments[track_id].end_frame = frame_number
                                track_segments[track_id].end_time = timestamp
                            
                            track_segments[track_id].detections.append(detection)
                
                frame_count += 1
                
                if progress_callback and frame_count % 30 == 0:
                    progress_callback(frame_count, total_frames, 
                                    f"Processing... {frame_count}/{total_frames}")
            
            if progress_callback:
                progress_callback(total_frames, total_frames, "Analysis complete")
            
            # Build result
            result_data = {
                "video_path": str(video_path),
                "video_name": video_name,
                "fps": fps,
                "total_frames": total_frames,
                "width": width,
                "height": height,
                "duration": duration,
                "conf_threshold": conf_threshold,
                "total_detections": len(all_detections),
                "total_tracks": len(track_segments),
                "track_segments": [seg.to_dict() for seg in track_segments.values()],
                "frames_dir": str(frames_dir) if frames_dir else None
            }
            
            # Save JSON result
            json_path = output_dir / f"{video_name}_yolo.json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(result_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"YOLO result saved: {json_path}")
            logger.info(f"Detected {len(track_segments)} tracks, {len(all_detections)} detections")
            
            return {
                "success": True,
                "data": result_data,
                "json_path": str(json_path)
            }
            
        except Exception as e:
            logger.error(f"Video processing failed: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def extract_audio(self, video_path: str, output_path: str = None) -> Optional[str]:
        """
        Extract audio from video using ffmpeg (via imageio-ffmpeg for bundled apps)
        
        Args:
            video_path: Path to video file
            output_path: Output audio path
            
        Returns:
            Audio file path or None if failed
        """
        video_path = Path(video_path)
        if not video_path.exists():
            logger.error(f"Video file not found: {video_path}")
            return None
        
        if output_path is None:
            output_path = video_path.parent / f"{video_path.stem}_audio.wav"
        
        try:
            import subprocess
            
            # Try to get ffmpeg path from imageio-ffmpeg (bundled with app)
            ffmpeg_exe = 'ffmpeg'
            try:
                import imageio_ffmpeg
                ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
                logger.info(f"Using imageio-ffmpeg: {ffmpeg_exe}")
            except ImportError:
                logger.info("imageio-ffmpeg not available, using system ffmpeg")
            except Exception as e:
                logger.warning(f"imageio-ffmpeg error: {e}, falling back to system ffmpeg")
            
            cmd = [
                ffmpeg_exe, '-i', str(video_path),
                '-vn',
                '-acodec', 'pcm_s16le',
                '-ar', '16000',
                '-ac', '1',
                '-y',
                str(output_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                logger.info(f"Audio extracted: {output_path}")
                return str(output_path)
            else:
                logger.error(f"ffmpeg error: {result.stderr}")
                return None
                
        except FileNotFoundError:
            logger.error("ffmpeg not found. Please install ffmpeg or imageio-ffmpeg")
            return None
        except Exception as e:
            logger.error(f"Audio extraction failed: {e}")
            return None
    
    def is_available(self) -> bool:
        """Check if YOLO service is available"""
        return os.path.exists(self.model_path)


# Singleton instance
_yolo_service = None


def get_yolo_service() -> YoloService:
    """Get YOLO service singleton"""
    global _yolo_service
    if _yolo_service is None:
        _yolo_service = YoloService()
    return _yolo_service


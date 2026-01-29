/**
 * MultimodalWorkspace Component
 * 多模态标注工作区 - 完全按照旧版 CorpusCortex 范式设计
 * 
 * 布局:
 * 1. 视频区域 - 视频 + Canvas 叠加层
 * 2. 播放控制 - -5s, <, 播放/暂停, >, +5s, 时间显示, 帧显示
 * 3. 画框控制 - 显示YOLO检测开关, 开启画框模式按钮, 框信息显示
 * 4. 帧追踪控制 - 帧间隔输入, 追踪到上一帧/下一帧, 确认框选, 清除, 保存序列
 * 5. 字幕显示区
 * 6. 时间轴 - YOLO轨道, 转录轨道, 播放针
 * 7. 转录文本标注区
 * 8. 标注表格
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Button,
  Stack,
  Chip,
  TextField,
  FormControlLabel,
  Checkbox,
  Alert,
  Tabs,
  Tab,
  Tooltip,
  useTheme,
  LinearProgress
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import Replay5Icon from '@mui/icons-material/Replay5'
import Forward5Icon from '@mui/icons-material/Forward5'
import CropFreeIcon from '@mui/icons-material/CropFree'
import CheckIcon from '@mui/icons-material/Check'
import ClearIcon from '@mui/icons-material/Clear'
import SaveIcon from '@mui/icons-material/Save'
import type {
  Annotation,
  SelectedLabel,
  YoloTrack,
  TranscriptSegment,
  VideoKeyframe,
  AudioBox
} from '../../types'
import { AnnotationTable } from './index'
import TranscriptAnnotator from './TranscriptAnnotator'
import WavesurferWaveform, { WavesurferWaveformRef } from './WavesurferWaveform'

// Word alignment data from Wav2Vec2
interface WordAlignment {
  word: string
  start: number
  end: number
  score: number
}

// Alignment data from forced alignment
interface AlignmentData {
  enabled: boolean
  word_alignments?: WordAlignment[]
  char_alignments?: Array<{ char: string; start: number; end: number; score: number }>
  error?: string
  reason?: string
}

// Pitch data from TorchCrepe
interface PitchData {
  enabled: boolean
  hop_length_ms?: number
  sample_rate?: number
  fmin?: number
  fmax?: number
  f0?: number[]
  periodicity?: number[]
  times?: number[]
  error?: string
  reason?: string
}

interface VideoBox {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  color: string
  time: number
  frame: number
}

interface SpacyToken {
  text: string
  start: number
  end: number
  pos: string
  tag: string
  lemma: string
  dep: string
}

interface SpacyEntity {
  text: string
  start: number
  end: number
  label: string
}

// CLIP frame result type
interface ClipFrameResult {
  frame_number: number
  timestamp_seconds: number
  classifications: Record<string, number>
  top_label: string
  confidence: number
}

// CLIP annotation data type
interface ClipAnnotationData {
  video_path: string
  video_name: string
  fps: number
  total_frames: number
  width: number
  height: number
  duration: number
  frame_interval: number
  labels: string[]
  frame_results: ClipFrameResult[]
}

// 搜索高亮接口
interface SearchHighlight {
  start: number
  end: number
}

interface MultimodalWorkspaceProps {
  mediaPath: string
  mediaType: 'video' | 'audio'
  transcriptText: string
  transcriptSegments: TranscriptSegment[]
  yoloTracks: YoloTrack[]
  annotations: Annotation[]
  selectedLabel: SelectedLabel | null
  onAnnotationAdd: (annotation: Omit<Annotation, 'id'>) => void
  onAnnotationRemove: (id: string) => void
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void
  spacyTokens?: SpacyToken[]
  spacyEntities?: SpacyEntity[]
  showSpacyAnnotations?: boolean
  clipAnnotation?: ClipAnnotationData | null
  searchHighlights?: SearchHighlight[]  // 来自父组件的搜索高亮
  // Audio waveform data (English only)
  alignmentData?: AlignmentData | null
  pitchData?: PitchData | null
  // Pre-computed waveform peaks (to avoid Web Audio API crash in Electron packaged app)
  waveformData?: {
    enabled: boolean
    peaks?: number[]
    duration?: number
    sample_rate?: number
    error?: string
  } | null
  // 音频画框标注
  savedAudioBoxes?: AudioBox[]
  onAudioBoxAdd?: (box: Omit<AudioBox, 'id'>) => void
  // 导出波形 SVG 的回调（注册导出函数）
  onWaveformExportReady?: (exportFn: () => string | null) => void
}

// Format time in seconds to MM:SS.ms format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`
}

// Linear interpolation
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Interpolate frames between two keyframes
function interpolateFrames(startKf: VideoKeyframe, endKf: VideoKeyframe): Array<{
  frameNumber: number
  bbox: [number, number, number, number]
  time: number
  label: string
}> {
  const frames: Array<{
    frameNumber: number
    bbox: [number, number, number, number]
    time: number
    label: string
  }> = []
  const frameCount = endKf.frameNumber - startKf.frameNumber
  if (frameCount <= 0) return frames

  for (let i = 0; i <= frameCount; i++) {
    const t = frameCount > 0 ? i / frameCount : 0
    frames.push({
      frameNumber: startKf.frameNumber + i,
      bbox: [
        Math.round(lerp(startKf.bbox[0], endKf.bbox[0], t)),
        Math.round(lerp(startKf.bbox[1], endKf.bbox[1], t)),
        Math.round(lerp(startKf.bbox[2], endKf.bbox[2], t)),
        Math.round(lerp(startKf.bbox[3], endKf.bbox[3], t))
      ],
      time: lerp(startKf.time, endKf.time, t),
      label: startKf.label
    })
  }
  return frames
}

export default function MultimodalWorkspace({
  mediaPath,
  mediaType,
  transcriptText,
  transcriptSegments,
  yoloTracks,
  annotations,
  selectedLabel,
  onAnnotationAdd,
  onAnnotationRemove,
  onAnnotationUpdate,
  spacyTokens = [],
  spacyEntities = [],
  showSpacyAnnotations = true,
  clipAnnotation = null,
  searchHighlights: externalSearchHighlights = [],
  alignmentData = null,
  pitchData = null,
  waveformData = null,
  savedAudioBoxes = [],
  onAudioBoxAdd,
  onWaveformExportReady
}: MultimodalWorkspaceProps) {
  // showSpacyAnnotations is no longer used (removed from UI)
  void showSpacyAnnotations
  
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const wavesurferRef = useRef<WavesurferWaveformRef>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [fps] = useState(25)
  const [totalFrames, setTotalFrames] = useState(0)

  // Video dimensions for canvas scaling
  const [videoWidth, setVideoWidth] = useState(0)
  const [videoHeight, setVideoHeight] = useState(0)
  const [videoScale, setVideoScale] = useState(1)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  // Actual video content position within the container (for object-fit: contain)
  const [videoContentOffset, setVideoContentOffset] = useState({ x: 0, y: 0 })

  // Drawing state (for video)
  const [drawMode, setDrawMode] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)  // For box dragging
  // Audio draw mode (separate from video)
  const [audioDrawMode, setAudioDrawMode] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [currentBox, setCurrentBox] = useState<VideoBox | null>(null)
  const [showYolo, setShowYolo] = useState(true)

  // Keyframe tracking state
  const [frameInterval, setFrameInterval] = useState(5)
  const [keyframeSequence, setKeyframeSequence] = useState<VideoKeyframe[]>([])
  const [savedVideoBoxes, setSavedVideoBoxes] = useState<any[]>([])
  const [frameMessage, setFrameMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  // UI state
  const [currentSubtitle, setCurrentSubtitle] = useState('')
  const [highlightedAnnotationId, setHighlightedAnnotationId] = useState<string | null>(null)
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null)
  const [bottomTabIndex, setBottomTabIndex] = useState(0)

  // 注册波形导出函数（音频模式）- 延迟调用避免渲染问题
  const exportRegisteredRef = useRef(false)
  useEffect(() => {
    if (mediaType === 'audio' && onWaveformExportReady && !exportRegisteredRef.current) {
      // 延迟注册，确保 WaveSurfer 已完全初始化
      const timer = setTimeout(() => {
        exportRegisteredRef.current = true
        onWaveformExportReady(() => wavesurferRef.current?.exportToSVG() || null)
      }, 3000)  // 3秒后注册
      return () => clearTimeout(timer)
    }
  }, [mediaType, onWaveformExportReady])

  // Get media element
  const mediaRef = mediaType === 'video' ? videoRef : audioRef

  // Show frame message (auto-hide after 3 seconds)
  const showFrameMsg = useCallback((text: string, type: 'success' | 'error' | 'info') => {
    setFrameMessage({ text, type })
    setTimeout(() => setFrameMessage(null), 3000)
  }, [])

  // Handle media time update
  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current
    if (media) {
      const time = media.currentTime
      setCurrentTime(time)
      setCurrentFrame(Math.round(time * fps))

      // Update subtitle and highlighted segment
      const segment = transcriptSegments.find(
        s => time >= s.start && time <= s.end
      )
      setCurrentSubtitle(segment?.text || '')
      // Auto-highlight current segment during playback
      if (segment && isPlaying) {
        setHighlightedSegmentId(String(segment.id))
      }
    }
  }, [fps, transcriptSegments, mediaRef, isPlaying])

  // Get current segment's time range
  const currentSegment = useMemo(() => {
    return transcriptSegments.find(s => currentTime >= s.start && currentTime <= s.end)
  }, [transcriptSegments, currentTime])

  // Auto-highlight current segment for audio with WaveSurfer (video uses handleTimeUpdate)
  useEffect(() => {
    if (mediaType === 'audio' && currentSegment && isPlaying) {
      setHighlightedSegmentId(String(currentSegment.id))
    }
  }, [mediaType, currentSegment, isPlaying])

  // Get YOLO labels active within current segment's time range
  const currentYoloLabels = useMemo(() => {
    if (!currentSegment || yoloTracks.length === 0) return []
    
    const { start, end } = currentSegment
    const labelCounts: Record<string, { count: number; color: string }> = {}
    
    yoloTracks.forEach(track => {
      // Check if track overlaps with current segment
      if (track.startTime <= end && track.endTime >= start) {
        const className = track.className
        if (!labelCounts[className]) {
          labelCounts[className] = { count: 0, color: track.color || '#4CAF50' }
        }
        labelCounts[className].count++
      }
    })
    
    return Object.entries(labelCounts).map(([label, { count, color }]) => ({
      label,
      count,
      color
    }))
  }, [currentSegment, yoloTracks])

  // Get CLIP classification for current frame
  const currentClipResult = useMemo(() => {
    if (!clipAnnotation || !clipAnnotation.frame_results.length) return null
    
    // Find the closest frame result to current frame
    const results = clipAnnotation.frame_results
    const frameInterval = clipAnnotation.frame_interval || 30
    
    // Calculate which index to use based on current frame
    const targetFrame = currentFrame
    let closestResult: ClipFrameResult | null = null
    let minDiff = Infinity
    
    for (const result of results) {
      const diff = Math.abs(result.frame_number - targetFrame)
      if (diff < minDiff) {
        minDiff = diff
        closestResult = result
      }
      // If we've passed the target frame and diff is increasing, we can break
      if (result.frame_number > targetFrame && diff > frameInterval) break
    }
    
    return closestResult
  }, [clipAnnotation, currentFrame])

  // Get all CLIP labels with their current confidence
  const clipLabelsWithConfidence = useMemo(() => {
    if (!clipAnnotation || !currentClipResult) return []
    
    return clipAnnotation.labels.map(label => ({
      label,
      confidence: currentClipResult.classifications[label] || 0,
      isTop: label === currentClipResult.top_label
    })).sort((a, b) => b.confidence - a.confidence)
  }, [clipAnnotation, currentClipResult])

  // Calculate video content area (accounting for object-fit: contain letterboxing)
  const calculateVideoContentArea = useCallback(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (vw === 0 || vh === 0) return

    // Container dimensions
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    // Video aspect ratio
    const videoAspect = vw / vh
    const containerAspect = containerWidth / containerHeight

    // Calculate actual displayed video size (object-fit: contain)
    let displayWidth: number, displayHeight: number
    if (videoAspect > containerAspect) {
      // Video is wider - fit to width, letterbox top/bottom
      displayWidth = containerWidth
      displayHeight = containerWidth / videoAspect
    } else {
      // Video is taller - fit to height, letterbox left/right
      displayHeight = containerHeight
      displayWidth = containerHeight * videoAspect
    }

    // Calculate offset to center the video content
    const offsetX = (containerWidth - displayWidth) / 2
    const offsetY = (containerHeight - displayHeight) / 2

    setCanvasSize({ width: displayWidth, height: displayHeight })
    setVideoContentOffset({ x: offsetX, y: offsetY })
    setVideoScale(vw / displayWidth)
  }, [])

  // Handle media loaded - Setup canvas with video dimensions
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (video && mediaType === 'video') {
      setDuration(video.duration)
      setTotalFrames(Math.round(video.duration * fps))
      
      // Get actual video dimensions
      const vw = video.videoWidth
      const vh = video.videoHeight
      setVideoWidth(vw)
      setVideoHeight(vh)
      
      // Setup canvas size to match video dimensions
      if (canvasRef.current) {
        canvasRef.current.width = vw
        canvasRef.current.height = vh
      }
      
      // Calculate video content area after a short delay
      setTimeout(calculateVideoContentArea, 50)
    } else if (audioRef.current && mediaType === 'audio') {
      setDuration(audioRef.current.duration)
      setTotalFrames(Math.round(audioRef.current.duration * fps))
    }
  }, [mediaType, fps, calculateVideoContentArea])

  // Update video scale on resize
  useEffect(() => {
    window.addEventListener('resize', calculateVideoContentArea)
    // Also update after a short delay to catch layout changes
    const timer = setTimeout(calculateVideoContentArea, 100)
    return () => {
      window.removeEventListener('resize', calculateVideoContentArea)
      clearTimeout(timer)
    }
  }, [calculateVideoContentArea, videoWidth])

  // Play/Pause toggle
  const handlePlayPause = useCallback(() => {
    const media = mediaRef.current
    if (media) {
      if (isPlaying) {
        media.pause()
      } else {
        media.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [isPlaying, mediaRef])

  // Seek to specific time
  const seekTo = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(duration, time))
    
    // Try WaveSurfer first (for audio with alignment)
    if (wavesurferRef.current) {
      wavesurferRef.current.seekTo(clampedTime)
      setCurrentTime(clampedTime)
      setCurrentFrame(Math.round(clampedTime * fps))
      return
    }
    
    // Fall back to native media element
    const media = mediaRef.current
    if (media) {
      media.currentTime = clampedTime
      setCurrentTime(media.currentTime)
      setCurrentFrame(Math.round(media.currentTime * fps))
    }
  }, [mediaRef, duration, fps])

  // Skip backward 5 seconds
  const skipBackward = useCallback(() => {
    seekTo(currentTime - 5)
  }, [currentTime, seekTo])

  // Skip forward 5 seconds
  const skipForward = useCallback(() => {
    seekTo(currentTime + 5)
  }, [currentTime, seekTo])

  // Previous frame
  const prevFrame = useCallback(() => {
    const media = mediaRef.current
    if (media) {
      media.pause()
      setIsPlaying(false)
      seekTo(currentTime - 1 / fps)
    }
  }, [mediaRef, currentTime, fps, seekTo])

  // Next frame
  const nextFrame = useCallback(() => {
    const media = mediaRef.current
    if (media) {
      media.pause()
      setIsPlaying(false)
      seekTo(currentTime + 1 / fps)
    }
  }, [mediaRef, currentTime, fps, seekTo])

  // Toggle draw mode
  const toggleDrawMode = useCallback(() => {
    setDrawMode(!drawMode)
    if (drawMode) {
      // Exiting draw mode
    }
  }, [drawMode])

  // Check if point is inside the current box
  const isPointInBox = useCallback((x: number, y: number) => {
    if (!currentBox) return false
    return x >= currentBox.x1 && x <= currentBox.x2 && 
           y >= currentBox.y1 && y <= currentBox.y2
  }, [currentBox])

  // Canvas mouse handlers - Convert display coordinates to video coordinates
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    
    // Convert canvas display coordinates to video native coordinates
    const displayX = e.clientX - rect.left
    const displayY = e.clientY - rect.top
    const x = displayX * videoScale
    const y = displayY * videoScale

    // Check if clicking inside existing box (for dragging)
    if (currentBox && isPointInBox(x, y)) {
      setIsDragging(true)
      setDragStart({ x, y })
      return
    }

    // Normal drawing mode
    if (!drawMode) return
    setIsDrawing(true)
    setDrawStart({ x, y })
  }, [drawMode, videoScale, currentBox, isPointInBox, mediaType, audioDrawMode])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    
    // Convert canvas display coordinates to video native coordinates
    const displayX = e.clientX - rect.left
    const displayY = e.clientY - rect.top
    const x = displayX * videoScale
    const y = displayY * videoScale

    // Handle dragging existing box
    if (isDragging && dragStart && currentBox) {
      const dx = x - dragStart.x
      const dy = y - dragStart.y
      
      // Move the box
      setCurrentBox({
        ...currentBox,
        x1: currentBox.x1 + dx,
        y1: currentBox.y1 + dy,
        x2: currentBox.x2 + dx,
        y2: currentBox.y2 + dy,
        time: currentTime,
        frame: currentFrame
      })
      setDragStart({ x, y })
      return
    }

    // Handle drawing new box
    if (!isDrawing || !drawStart) return

    const x1 = Math.min(drawStart.x, x)
    const y1 = Math.min(drawStart.y, y)
    const x2 = Math.max(drawStart.x, x)
    const y2 = Math.max(drawStart.y, y)

    setCurrentBox({
      x1, y1, x2, y2,
      label: selectedLabel?.node.name || '未选择标签',
      color: selectedLabel?.color || '#2196F3',
      time: currentTime,
      frame: currentFrame
    })
  }, [isDrawing, isDragging, drawStart, dragStart, currentBox, selectedLabel, currentTime, currentFrame, videoScale])

  const handleCanvasMouseUp = useCallback(() => {
    setIsDrawing(false)
    setIsDragging(false)
    setDrawStart(null)
    setDragStart(null)
  }, [])

  // Confirm box selection (确认框选)
  const confirmBox = useCallback(() => {
    if (!currentBox) {
      showFrameMsg('请先在视频上画框', 'error')
      return
    }

    // Add as video annotation
    const annotation: Omit<Annotation, 'id'> = {
      text: `[视频框选] ${currentBox.label}`,
      startPosition: 0,
      endPosition: 0,
      label: currentBox.label,
      labelPath: selectedLabel?.path || currentBox.label,
      color: currentBox.color,
      type: 'video',
      bbox: [currentBox.x1, currentBox.y1, currentBox.x2, currentBox.y2],
      timestamp: currentBox.time,
      frameNumber: currentBox.frame
    }

    onAnnotationAdd(annotation)
    showFrameMsg('框选已确认并添加到标注', 'success')
  }, [currentBox, selectedLabel, onAnnotationAdd, showFrameMsg, mediaType])

  // Clear current box
  const clearBox = useCallback(() => {
    setCurrentBox(null)
    setKeyframeSequence([])
    showFrameMsg('已清除当前框选', 'info')
  }, [showFrameMsg])

  // Check if we can go to previous frame (only if we have keyframes recorded)
  const canGoPrevFrame = keyframeSequence.length > 0

  // Track to previous frame (追踪到上一帧) - only for adjusting end position
  const trackToPrevFrame = useCallback(() => {
    if (!currentBox) {
      showFrameMsg('请先在视频上画框', 'error')
      return
    }

    if (keyframeSequence.length === 0) {
      showFrameMsg('第一帧是起点，不能向前追踪', 'error')
      return
    }

    const media = mediaRef.current
    if (!media) return

    media.pause()
    setIsPlaying(false)

    const targetFrame = currentFrame - frameInterval
    const startFrame = keyframeSequence[0].frameNumber
    
    if (targetFrame < startFrame) {
      showFrameMsg('不能早于起始帧', 'error')
      return
    }

    // Remove keyframes that are after the target frame (going backwards)
    setKeyframeSequence(prev => prev.filter(kf => kf.frameNumber < targetFrame))

    // Jump to target frame
    const targetTime = targetFrame / fps
    seekTo(targetTime)

    // Keep box position (user can adjust)
    setCurrentBox({
      ...currentBox,
      time: targetTime,
      frame: targetFrame
    })

    showFrameMsg(`已跳转到帧 ${targetFrame}，请检查并调整框位置`, 'info')
  }, [currentBox, currentFrame, currentTime, fps, frameInterval, mediaRef, seekTo, showFrameMsg])

  // Track to next frame (追踪到下一帧)
  const trackToNextFrame = useCallback(() => {
    if (!currentBox) {
      showFrameMsg('请先在视频上画框', 'error')
      return
    }

    const media = mediaRef.current
    if (!media) return

    media.pause()
    setIsPlaying(false)

    const targetFrame = currentFrame + frameInterval
    if (targetFrame >= totalFrames) {
      showFrameMsg('已到达视频末尾', 'error')
      return
    }

    // Save current box as keyframe (this becomes a key position in the sequence)
    // If this is the first keyframe, it's the starting point
    const newKeyframe: VideoKeyframe = {
      frameNumber: currentFrame,
      bbox: [currentBox.x1, currentBox.y1, currentBox.x2, currentBox.y2],
      time: currentTime,
      label: currentBox.label,
      color: currentBox.color
    }

    // Check if we already have a keyframe at this frame, update it if so
    setKeyframeSequence(prev => {
      const existing = prev.findIndex(kf => kf.frameNumber === currentFrame)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = newKeyframe
        return updated
      }
      return [...prev, newKeyframe]
    })

    // Jump to target frame
    const targetTime = targetFrame / fps
    seekTo(targetTime)

    // Keep box position (user can adjust)
    setCurrentBox({
      ...currentBox,
      time: targetTime,
      frame: targetFrame
    })

    showFrameMsg(`已跳转到帧 ${targetFrame}，请检查并调整框位置`, 'info')
  }, [currentBox, currentFrame, currentTime, fps, frameInterval, totalFrames, mediaRef, seekTo, showFrameMsg])

  // Save keyframe sequence (保存序列)
  const saveKeyframeSequence = useCallback(() => {
    if (keyframeSequence.length === 0 && !currentBox) {
      showFrameMsg('没有keyframe序列可保存', 'error')
      return
    }

    // Add current box as keyframe if not already added
    let finalSequence = [...keyframeSequence]
    if (currentBox) {
      const exists = finalSequence.some(kf => kf.frameNumber === currentFrame)
      if (!exists) {
        finalSequence.push({
          frameNumber: currentFrame,
          bbox: [currentBox.x1, currentBox.y1, currentBox.x2, currentBox.y2],
          time: currentTime,
          label: currentBox.label,
          color: currentBox.color
        })
      }
    }

    // Sort by frame number
    finalSequence.sort((a, b) => a.frameNumber - b.frameNumber)

    if (finalSequence.length === 0) {
      showFrameMsg('没有keyframe序列可保存', 'error')
      return
    }

    // Calculate all frames with interpolation
    let allFrames: Array<{ frameNumber: number; bbox: [number, number, number, number]; time: number; label: string }> = []
    
    if (finalSequence.length === 1) {
      allFrames = [{
        frameNumber: finalSequence[0].frameNumber,
        bbox: finalSequence[0].bbox,
        time: finalSequence[0].time,
        label: finalSequence[0].label
      }]
    } else {
      for (let i = 0; i < finalSequence.length - 1; i++) {
        const interpolated = interpolateFrames(finalSequence[i], finalSequence[i + 1])
        if (i === 0) {
          allFrames = allFrames.concat(interpolated)
        } else {
          allFrames = allFrames.concat(interpolated.slice(1))
        }
      }
    }

    // Create video box object
    const videoBox = {
      id: Date.now(),
      label: finalSequence[0].label,
      color: finalSequence[0].color || '#E91E63',
      startFrame: finalSequence[0].frameNumber,
      endFrame: finalSequence[finalSequence.length - 1].frameNumber,
      frameCount: allFrames.length,
      startTime: finalSequence[0].time,
      endTime: finalSequence[finalSequence.length - 1].time,
      keyframes: finalSequence,
      frames: allFrames
    }

    setSavedVideoBoxes(prev => [...prev, videoBox])

    // Add as annotation
    const annotation: Omit<Annotation, 'id'> = {
      text: `[视频序列] ${videoBox.label} (${videoBox.frameCount}帧)`,
      startPosition: 0,
      endPosition: 0,
      label: videoBox.label,
      labelPath: selectedLabel?.path || videoBox.label,
      color: videoBox.color,
      type: 'video',
      bbox: finalSequence[0].bbox,
      timestamp: videoBox.startTime,
      frameNumber: videoBox.startFrame,
      frameCount: videoBox.frameCount
    }

    onAnnotationAdd(annotation)

    // Clear current state
    setCurrentBox(null)
    setKeyframeSequence([])
    setDrawMode(false)

    showFrameMsg(`已保存序列: ${videoBox.frameCount}帧, ${(videoBox.endTime - videoBox.startTime).toFixed(2)}秒`, 'success')
  }, [keyframeSequence, currentBox, currentFrame, currentTime, selectedLabel, onAnnotationAdd, showFrameMsg])

  // Draw canvas - use video native coordinates
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ensure canvas matches video dimensions
    if (videoWidth > 0 && videoHeight > 0) {
      canvas.width = videoWidth
      canvas.height = videoHeight
    }

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw YOLO detections using video native coordinates
    if (showYolo && yoloTracks.length > 0) {
      yoloTracks.forEach(track => {
        if (currentTime >= track.startTime && currentTime <= track.endTime) {
          // Find the detection closest to current time
          let detection = track.detections.find(d => Math.abs(d.timestamp - currentTime) < 0.1)
          
          // If no exact match, find the closest one
          if (!detection && track.detections.length > 0) {
            detection = track.detections.reduce((prev, curr) => 
              Math.abs(curr.timestamp - currentTime) < Math.abs(prev.timestamp - currentTime) ? curr : prev
            )
          }
          
          if (detection) {
            const [x1, y1, x2, y2] = detection.bbox
            
            // Draw detection box
            ctx.strokeStyle = track.color
            ctx.lineWidth = 3
            ctx.setLineDash([])
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

            // Draw label background
            const label = `${track.className} #${track.trackId}`
            ctx.font = '14px Arial'
            const textWidth = ctx.measureText(label).width
            ctx.fillStyle = track.color
            ctx.fillRect(x1, y1 - 22, textWidth + 10, 22)
            
            // Draw label text
            ctx.fillStyle = '#fff'
            ctx.fillText(label, x1 + 5, y1 - 6)
          }
        }
      })
    }

    // Draw current box (user drawing)
    if (currentBox) {
      const boxColor = currentBox.color || '#2196F3'
      
      // Box border
      ctx.strokeStyle = boxColor
      ctx.lineWidth = 3
      ctx.setLineDash([])
      ctx.strokeRect(currentBox.x1, currentBox.y1, currentBox.x2 - currentBox.x1, currentBox.y2 - currentBox.y1)

      // Semi-transparent fill
      ctx.fillStyle = boxColor + '33'
      ctx.fillRect(currentBox.x1, currentBox.y1, currentBox.x2 - currentBox.x1, currentBox.y2 - currentBox.y1)

      // Label background
      const label = currentBox.label || '未选择标签'
      ctx.font = '14px Arial'
      const textWidth = ctx.measureText(label).width
      ctx.fillStyle = boxColor
      ctx.fillRect(currentBox.x1, currentBox.y1 - 22, textWidth + 10, 22)
      
      // Label text
      ctx.fillStyle = '#fff'
      ctx.fillText(label, currentBox.x1 + 5, currentBox.y1 - 6)
    }

    // Draw saved video boxes at current frame
    savedVideoBoxes.forEach(vb => {
      if (currentFrame >= vb.startFrame && currentFrame <= vb.endFrame) {
        const frameData = vb.frames.find((f: any) => f.frameNumber === currentFrame)
        if (frameData) {
          const boxColor = vb.color || '#2196F3'
          
          ctx.strokeStyle = boxColor
          ctx.lineWidth = 2
          ctx.setLineDash([5, 3])
          ctx.strokeRect(frameData.bbox[0], frameData.bbox[1], frameData.bbox[2] - frameData.bbox[0], frameData.bbox[3] - frameData.bbox[1])
          ctx.setLineDash([])

          // Label
          const label = vb.label
          ctx.font = '12px Arial'
          const textWidth = ctx.measureText(label).width
          ctx.fillStyle = boxColor + 'CC'
          ctx.fillRect(frameData.bbox[0], frameData.bbox[1] - 18, textWidth + 8, 18)
          ctx.fillStyle = '#fff'
          ctx.fillText(label, frameData.bbox[0] + 4, frameData.bbox[1] - 4)
        }
      }
    })
    
    // Draw video annotations from annotations prop (for loaded archives)
    // These are stored as single-frame bbox data in the archive
    annotations.filter(a => a.type === 'video' && a.bbox).forEach(ann => {
      const startFrame = ann.frameNumber || 0
      const frameCount = ann.frameCount || 1
      const endFrame = startFrame + frameCount - 1
      
      // Check if current frame is within this annotation's range
      if (currentFrame >= startFrame && currentFrame <= endFrame) {
        const bbox = ann.bbox as number[]
        const boxColor = ann.color || '#2196F3'
        
        ctx.strokeStyle = boxColor
        ctx.lineWidth = 2
        ctx.setLineDash([5, 3])
        ctx.strokeRect(bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1])
        ctx.setLineDash([])

        // Label
        const label = ann.label
        ctx.font = '12px Arial'
        const textWidth = ctx.measureText(label).width
        ctx.fillStyle = boxColor + 'CC'
        ctx.fillRect(bbox[0], bbox[1] - 18, textWidth + 8, 18)
        ctx.fillStyle = '#fff'
        ctx.fillText(label, bbox[0] + 4, bbox[1] - 4)
      }
    })

  }, [currentBox, currentTime, currentFrame, yoloTracks, showYolo, savedVideoBoxes, annotations, videoWidth, videoHeight])

  // Handle segment click from timeline
  const handleSegmentClick = useCallback((segment: TranscriptSegment) => {
    seekTo(segment.start)
    setHighlightedSegmentId(String(segment.id))
  }, [seekTo])

  // Filter annotations
  const textAnnotations = useMemo(() => annotations.filter(a => a.type !== 'video'), [annotations])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2, overflow: 'auto' }}>
      {/* Info Bar */}
      <Paper sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="body2"><strong>时长:</strong> {formatTime(duration)}</Typography>
          <Typography variant="body2"><strong>帧:</strong> {currentFrame} / {totalFrames}</Typography>
          {videoWidth > 0 && (
            <Typography variant="body2" color="text.secondary">
              {videoWidth}x{videoHeight}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="body2" color="text.primary">
            <strong>{t('annotation.selectedLabel', '当前标签')}:</strong>{' '}
            <Chip 
              label={selectedLabel?.node.name || t('annotation.noLabelSelected', '未选择')} 
              size="small" 
              sx={{ bgcolor: selectedLabel?.color || 'action.disabledBackground', color: selectedLabel ? 'white' : 'text.secondary' }}
            />
          </Typography>
        </Stack>
      </Paper>

      {/* Video Section */}
      {mediaType === 'video' && (
        <Paper sx={{ p: 2 }}>
          {/* Video Container */}
          <Box 
            ref={containerRef}
            sx={{ 
              position: 'relative', 
              bgcolor: 'black', 
              borderRadius: 1, 
              overflow: 'hidden', 
              minHeight: 300,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <video
              ref={videoRef}
              src={mediaPath}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              crossOrigin="anonymous"
              style={{ 
                width: '100%', 
                maxHeight: 450, 
                display: 'block',
                objectFit: 'contain'
              }}
            />
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              style={{
                position: 'absolute',
                top: videoContentOffset.y,
                left: videoContentOffset.x,
                width: canvasSize.width > 0 ? canvasSize.width : '100%',
                height: canvasSize.height > 0 ? canvasSize.height : '100%',
                cursor: drawMode ? 'crosshair' : (currentBox ? 'move' : 'default'),
                pointerEvents: showYolo || drawMode || currentBox ? 'auto' : 'none'
              }}
            />
          </Box>

          {/* CLIP Classification Display - below video, above playback controls */}
          {clipAnnotation && clipLabelsWithConfidence.length > 0 && (
            <Paper 
              variant="outlined"
              sx={{ 
                mt: 1, 
                p: 1.5,
                bgcolor: isDarkMode ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.04)',
                borderColor: isDarkMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="caption" fontWeight={600} color="primary">
                  CLIP
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  @ {currentClipResult?.frame_number || '-'}
                </Typography>
              </Stack>
              
              <Stack spacing={0.75}>
                {clipLabelsWithConfidence.slice(0, 6).map(({ label, confidence, isTop }) => (
                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        minWidth: 80, 
                        fontWeight: isTop ? 700 : 400,
                        color: isTop ? 'primary.main' : 'text.secondary'
                      }}
                    >
                      {label}
                    </Typography>
                    <Box sx={{ flex: 1, position: 'relative' }}>
                      <LinearProgress
                        variant="determinate"
                        value={confidence * 100}
                        sx={{
                          height: 14,
                          borderRadius: 1,
                          bgcolor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                          '& .MuiLinearProgress-bar': {
                            bgcolor: isTop 
                              ? (isDarkMode ? '#818cf8' : '#6366f1')
                              : (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(99, 102, 241, 0.4)'),
                            borderRadius: 1,
                            transition: 'transform 0.15s ease-out'
                          }
                        }}
                      />
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          position: 'absolute', 
                          right: 4, 
                          top: '50%', 
                          transform: 'translateY(-50%)',
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          color: confidence > 0.5 ? 'white' : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'text.secondary')
                        }}
                      >
                        {(confidence * 100).toFixed(0)}%
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Playback Controls */}
          <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <Tooltip title="后退5秒"><IconButton onClick={skipBackward} size="small"><Replay5Icon /></IconButton></Tooltip>
              <Tooltip title="上一帧"><IconButton onClick={prevFrame} size="small"><SkipPreviousIcon /></IconButton></Tooltip>
              <Tooltip title={isPlaying ? '暂停' : '播放'}>
                <IconButton onClick={handlePlayPause} color="primary" size="large">
                  {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
              </Tooltip>
              <Tooltip title="下一帧"><IconButton onClick={nextFrame} size="small"><SkipNextIcon /></IconButton></Tooltip>
              <Tooltip title="前进5秒"><IconButton onClick={skipForward} size="small"><Forward5Icon /></IconButton></Tooltip>
              
              <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 120 }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Typography>
              
              <Typography variant="caption" color="text.secondary">
                帧: {currentFrame}/{totalFrames}
              </Typography>
            </Stack>
          </Paper>

          {/* Draw Controls */}
          <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <FormControlLabel
                control={<Checkbox checked={showYolo} onChange={(e) => setShowYolo(e.target.checked)} size="small" />}
                label={<Typography variant="body2">显示YOLO检测</Typography>}
              />
              <Button
                variant={drawMode ? 'contained' : 'outlined'}
                size="small"
                startIcon={<CropFreeIcon />}
                onClick={toggleDrawMode}
                color={drawMode ? 'primary' : 'inherit'}
              >
                {drawMode ? '画框中...' : '开启画框'}
              </Button>
              
              <Box sx={{ 
                px: 1.5, py: 0.5, 
                bgcolor: currentBox ? 'success.light' : 'grey.100',
                color: currentBox ? 'success.contrastText' : 'text.secondary',
                borderRadius: 1,
                fontSize: '0.75rem'
              }}>
                {currentBox 
                  ? `[${currentBox.label}] X1=${Math.round(currentBox.x1)}, Y1=${Math.round(currentBox.y1)}, X2=${Math.round(currentBox.x2)}, Y2=${Math.round(currentBox.y2)}`
                  : '未画框'
                }
              </Box>
            </Stack>
          </Paper>

          {/* Frame Tracking Controls */}
          <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">帧间隔:</Typography>
              <TextField
                type="number"
                value={frameInterval}
                onChange={(e) => setFrameInterval(Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
                size="small"
                inputProps={{ min: 1, max: 30, style: { width: 50 } }}
              />
              
              <Button 
                size="small" 
                variant="outlined" 
                onClick={trackToPrevFrame} 
                disabled={!currentBox || !canGoPrevFrame}
                title="回退到上一个关键帧位置"
              >
                上一帧
              </Button>
              <Button 
                size="small" 
                variant="outlined" 
                onClick={trackToNextFrame} 
                disabled={!currentBox}
                title="前进到下一帧并保存当前位置"
              >
                下一帧
              </Button>
              
              <Button size="small" variant="contained" startIcon={<CheckIcon />} onClick={confirmBox} disabled={!currentBox}>
                确认框选
              </Button>
              <Button size="small" variant="outlined" startIcon={<ClearIcon />} onClick={clearBox}>
                清除
              </Button>
              <Button 
                size="small" 
                variant="contained" 
                color="warning"
                startIcon={<SaveIcon />}
                onClick={saveKeyframeSequence}
                disabled={keyframeSequence.length === 0 && !currentBox}
                title="保存序列并自动补全中间帧"
              >
                保存序列 ({keyframeSequence.length})
              </Button>
              
              {/* Sequence status */}
              {keyframeSequence.length > 0 && (
                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                  起始帧: {keyframeSequence[0].frameNumber} | 当前: {currentFrame}
                </Typography>
              )}
            </Stack>
            
            {frameMessage && (
              <Alert severity={frameMessage.type} sx={{ mt: 1, py: 0 }}>
                {frameMessage.text}
              </Alert>
            )}
          </Paper>

          {/* Subtitle Display with YOLO Labels */}
          <Paper 
            sx={{ 
              mt: 1, 
              bgcolor: isDarkMode ? 'rgba(0,0,0,0.6)' : 'background.paper',
              border: isDarkMode ? 'none' : '1px solid',
              borderColor: 'divider',
              overflow: 'hidden' 
            }}
          >
            {/* Subtitle text */}
            <Box sx={{ p: 1.5, textAlign: 'center', minHeight: 40 }}>
              <Typography variant="body2" color={isDarkMode ? 'white' : 'text.primary'}>
                {currentSubtitle || '...'}
              </Typography>
            </Box>
            
            {/* YOLO labels for current segment */}
            {currentYoloLabels.length > 0 && (
              <Box sx={{ 
                px: 1.5, 
                py: 1, 
                borderTop: '1px solid',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'divider',
                bgcolor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.02)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap'
              }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>
                  YOLO:
                </Typography>
                {currentYoloLabels.map(({ label, count, color }) => (
                  <Chip
                    key={label}
                    label={`${label} (${count})`}
                    size="small"
                    sx={{
                      bgcolor: color,
                      color: 'white',
                      height: 22,
                      fontSize: '0.7rem',
                      '& .MuiChip-label': { px: 1 }
                    }}
                  />
                ))}
              </Box>
            )}

            {/* CLIP labels for media selection - compact display */}
            {clipAnnotation && currentClipResult && (
              <Box sx={{ 
                px: 1.5, 
                py: 1, 
                borderTop: '1px solid',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'divider',
                bgcolor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.02)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap'
              }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>
                  CLIP:
                </Typography>
                <Chip
                  label={`${currentClipResult.top_label} (${(currentClipResult.confidence * 100).toFixed(0)}%)`}
                  size="small"
                  sx={{
                    bgcolor: isDarkMode ? '#6366f1' : '#818cf8',
                    color: 'white',
                    height: 22,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    '& .MuiChip-label': { px: 1 }
                  }}
                />
                {clipLabelsWithConfidence.slice(1, 3).map(({ label, confidence }) => (
                  <Chip
                    key={label}
                    label={`${label} (${(confidence * 100).toFixed(0)}%)`}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 22,
                      fontSize: '0.65rem',
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                      color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'text.secondary',
                      '& .MuiChip-label': { px: 0.75 }
                    }}
                  />
                ))}
              </Box>
            )}
          </Paper>
        </Paper>
      )}

      {/* Audio Section */}
      {mediaType === 'audio' && (
        <Paper sx={{ p: 2 }}>
          {/* Use WavesurferWaveform for English audio with alignment data */}
          {alignmentData?.enabled && alignmentData.word_alignments && alignmentData.word_alignments.length > 0 ? (
            <>
              {/* WaveSurfer handles all audio playback - no separate audio element needed */}
              <WavesurferWaveform
                ref={wavesurferRef}
                audioUrl={mediaPath}
                duration={duration}
                currentTime={currentTime}
                wordAlignments={alignmentData.word_alignments}
                pitchData={pitchData?.enabled && pitchData?.f0 ? pitchData as any : undefined}
                precomputedPeaks={waveformData?.enabled && waveformData?.peaks ? waveformData.peaks : undefined}
                onSeek={(time) => {
                  setCurrentTime(time)
                  setCurrentFrame(Math.round(time * fps))
                }}
                onTimeUpdate={(time) => {
                  setCurrentTime(time)
                  setCurrentFrame(Math.round(time * fps))
                }}
                onDurationChange={(dur) => {
                  setDuration(dur)
                }}
                onRangeSelect={(range) => {
                  // Create annotation from selected range
                  if (selectedLabel) {
                    const rangeText = transcriptText.substring(
                      Math.floor(range.start * 10),
                      Math.floor(range.end * 10)
                    ) || `[${range.start.toFixed(2)}s - ${range.end.toFixed(2)}s]`
                    
                    onAnnotationAdd({
                      text: rangeText,
                      startPosition: 0,
                      endPosition: 0,
                      label: selectedLabel.node.name,
                      labelPath: selectedLabel.path,
                      color: selectedLabel.color,
                      type: 'audio',
                      timestamp: range.start,
                      frameNumber: Math.floor(range.start * fps)
                    })
                  }
                }}
                onWordClick={(word) => {
                  // Add annotation for clicked word
                  if (selectedLabel) {
                    onAnnotationAdd({
                      text: word.word,
                      startPosition: 0,
                      endPosition: 0,
                      label: selectedLabel.node.name,
                      labelPath: selectedLabel.path,
                      color: selectedLabel.color,
                      type: 'audio',
                      timestamp: word.start,
                      frameNumber: Math.floor(word.start * fps)
                    })
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                height={300}  // 与视频播放框高度一致
                // 画框标注功能
                selectedLabel={selectedLabel}
                savedAudioBoxes={savedAudioBoxes}
                onAudioBoxAdd={onAudioBoxAdd}
                onDrawModeChange={(mode) => {
                  setAudioDrawMode(mode);
                }}
              />
            </>
          ) : (
            /* Standard audio player for non-English or no alignment */
            <audio
              ref={audioRef}
              src={mediaPath}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              controls
              style={{ width: '100%' }}
            />
          )}
        </Paper>
      )}

      {/* Bottom Section: Transcript & Annotations */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 250 }}>
        <Tabs value={bottomTabIndex} onChange={(_, v) => setBottomTabIndex(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="转录文本标注" />
          <Tab label={`标注列表 (${annotations.length})`} />
        </Tabs>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {bottomTabIndex === 0 && transcriptText && (
            <TranscriptAnnotator
              transcriptSegments={transcriptSegments}
              annotations={textAnnotations}
              selectedLabel={selectedLabel}
              highlightedSegmentId={highlightedSegmentId}
              onAnnotationAdd={onAnnotationAdd}
              onAnnotationRemove={onAnnotationRemove}
              onSegmentClick={(segId) => {
                const seg = transcriptSegments.find(s => s.id === segId)
                if (seg) {
                  handleSegmentClick(seg)
                }
              }}
              yoloTracks={yoloTracks}
              clipAnnotation={clipAnnotation}
              searchHighlights={externalSearchHighlights}
              disabled={audioDrawMode || drawMode}
            />
          )}

          {bottomTabIndex === 1 && (
            <AnnotationTable
              annotations={annotations}
              onDelete={onAnnotationRemove}
              onUpdate={onAnnotationUpdate}
              onHighlight={setHighlightedAnnotationId}
              highlightedId={highlightedAnnotationId}
              spacyTokens={spacyTokens}
              spacyEntities={spacyEntities}
              showVideoColumns={mediaType === 'video'}
            />
          )}
        </Box>
      </Paper>
    </Box>
  )
}

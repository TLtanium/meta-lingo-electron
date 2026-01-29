/**
 * MultimodalAnnotation Page
 * Main page for multimodal (video/audio) annotation with framework-based labeling
 * 
 * Layout:
 * - Left: Framework selection + Framework tree visualization + Archive management
 * - Right: Video/Audio player + Transcript annotation + Timeline
 * 
 * Features:
 * - Video and audio support
 * - Multi-track timeline (YOLO/transcript/annotations/keyframes)
 * - Keyframe-based video box annotation
 * - Audio waveform with range selection
 * - SpaCy annotation display from corpus transcription
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItemButton,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary'
import AudiotrackIcon from '@mui/icons-material/Audiotrack'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTranslation } from 'react-i18next'
import { useCorpusStore } from '../../stores/corpusStore'
import { frameworkApi, annotationApi, createMultimodalAnnotationRequest, corpusApi } from '../../api'
import { FrameworkTree, MultimodalWorkspace, SearchAnnotateBox, BatchAnnotateDialog } from '../../components/Annotation'
import type { SearchMatch } from '../../components/Annotation/SearchAnnotateBox'
import type { 
  Framework, 
  FrameworkCategory, 
  Annotation, 
  SelectedLabel,
  AnnotationArchiveListItem,
  Corpus,
  CorpusText,
  YoloTrack,
  TranscriptSegment,
  AudioBox
} from '../../types'

// SpaCy annotation types
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

// CLIP annotation types
interface ClipFrameResult {
  frame_number: number
  timestamp_seconds: number
  classifications: Record<string, number>
  top_label: string
  confidence: number
}

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

export default function MultimodalAnnotation() {
  const { t } = useTranslation()
  const { corpora, currentCorpus, setCurrentCorpus, setCorpora } = useCorpusStore()

  // Framework state
  const [frameworks, setFrameworks] = useState<FrameworkCategory[]>([])
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('')
  const [currentFramework, setCurrentFramework] = useState<Framework | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<SelectedLabel | null>(null)
  const [frameworkLoading, setFrameworkLoading] = useState(false)

  // Media state
  const [selectedMedia, setSelectedMedia] = useState<CorpusText | null>(null)
  const [mediaPath, setMediaPath] = useState('')
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video')
  const [transcriptText, setTranscriptText] = useState('')
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([])
  const [yoloTracks, setYoloTracks] = useState<YoloTrack[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  
  // Key to force MultimodalWorkspace remount when selecting same media
  const [workspaceKey, setWorkspaceKey] = useState(0)

  // SpaCy annotation state (kept for data loading, not displayed)
  const [spacyTokens, setSpacyTokens] = useState<SpacyToken[]>([])
  const [spacyEntities, setSpacyEntities] = useState<SpacyEntity[]>([])
  
  // CLIP annotation state
  const [clipAnnotation, setClipAnnotation] = useState<ClipAnnotationData | null>(null)

  // Audio waveform state (for English audio with alignment)
  const [alignmentData, setAlignmentData] = useState<{
    enabled: boolean
    word_alignments?: Array<{ word: string; start: number; end: number; score: number }>
    char_alignments?: Array<{ char: string; start: number; end: number; score: number }>
    error?: string
    reason?: string
  } | null>(null)
  const [pitchData, setPitchData] = useState<{
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
  } | null>(null)
  
  // Pre-computed waveform peaks (to avoid Web Audio API decode crash in Electron packaged app)
  const [waveformData, setWaveformData] = useState<{
    enabled: boolean
    peaks?: number[]
    duration?: number
    sample_rate?: number
    error?: string
  } | null>(null)

  // Annotation state
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [savedAudioBoxes, setSavedAudioBoxes] = useState<AudioBox[]>([])  // 音频画框标注
  const [waveformExportFn, setWaveformExportFn] = useState<(() => string | null) | null>(null)  // 波形导出函数
  const [currentArchiveId, setCurrentArchiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  // Alignment processing state
  const [alignmentProcessing, setAlignmentProcessing] = useState(false)

  // Archive state
  const [archives, setArchives] = useState<AnnotationArchiveListItem[]>([])
  const [, setLoadingArchives] = useState(false)
  
  // Archive operation state
  const [editingArchive, setEditingArchive] = useState<AnnotationArchiveListItem | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [newArchiveName, setNewArchiveName] = useState('')
  const [archiveOperating, setArchiveOperating] = useState(false)
  
  // 保存对话框状态
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [coderName, setCoderName] = useState('')

  // 搜索批量标注状态
  const [searchHighlights, setSearchHighlights] = useState<Array<{ start: number; end: number }>>([])
  const [batchAnnotateDialogOpen, setBatchAnnotateDialogOpen] = useState(false)
  const [pendingMatches, setPendingMatches] = useState<SearchMatch[]>([])

  // Left panel width state
  const [leftPanelWidth, setLeftPanelWidth] = useState(400)
  const dividerRef = useRef<HTMLDivElement>(null)

  // Load frameworks and corpora on mount
  useEffect(() => {
    loadFrameworks()
    loadCorpora()
  }, [])
  
  // Load archives after corpora are loaded (to filter out non-existent corpora)
  useEffect(() => {
    if (corpora.length > 0) {
      loadAllArchives()
    }
  }, [corpora])
  
  // Load corpora from API
  const loadCorpora = async () => {
    try {
      const response = await corpusApi.listCorpora()
      if (response.success && response.data) {
        const corporaWithTexts = await Promise.all(
          response.data.map(async (corpus: Corpus) => {
            try {
              const textsResponse = await corpusApi.getTexts(corpus.id)
              return {
                ...corpus,
                texts: textsResponse.success ? textsResponse.data : [],
                textCount: textsResponse.success ? textsResponse.data.length : 0
              }
            } catch {
              return { ...corpus, texts: [], textCount: 0 }
            }
          })
        )
        setCorpora(corporaWithTexts)
      }
    } catch (error) {
      console.error('Failed to load corpora:', error)
    }
  }

  // 存档列表不再依赖语料库选择，始终显示所有存档

  const loadFrameworks = async () => {
    setFrameworkLoading(true)
    try {
      const response = await frameworkApi.list()
      if (response.success && response.data) {
        const backendResponse = response.data as any
        const categories = backendResponse.data?.categories || backendResponse.categories || []
        setFrameworks(categories)
      }
    } catch (error) {
      console.error('Failed to load frameworks:', error)
    } finally {
      setFrameworkLoading(false)
    }
  }

  const loadFramework = async (frameworkId: string) => {
    if (!frameworkId) return
    
    setFrameworkLoading(true)
    try {
      const response = await frameworkApi.get(frameworkId)
      if (response.success && response.data) {
        const data = response.data as any
        const framework = data.data || data
        setCurrentFramework(framework)
        setSelectedLabel(null)
      }
    } catch (error) {
      console.error('Failed to load framework:', error)
    } finally {
      setFrameworkLoading(false)
    }
  }

  // 加载所有多模态存档（不限于特定语料库）
  const loadAllArchives = async () => {
    setLoadingArchives(true)
    try {
      const response = await annotationApi.listAll('multimodal')
      if (response.success && response.data?.data?.archives) {
        // Filter out archives whose corpus no longer exists
        const allArchives = response.data.data.archives as AnnotationArchiveListItem[]
        const validArchives = allArchives.filter(archive => {
          if (!archive.corpusName) return true // Keep archives without corpusName
          // Check if corpus exists in our loaded corpora list
          return corpora.some(c => c.name === archive.corpusName)
        })
        setArchives(validArchives)
      }
    } catch (error) {
      console.error('Failed to load all archives:', error)
    } finally {
      setLoadingArchives(false)
    }
  }

  // 刷新存档列表
  const refreshArchives = async () => {
    await loadAllArchives()
  }
  
  // Handle archive rename
  const handleRenameArchive = async () => {
    if (!editingArchive || !newArchiveName.trim()) return
    
    setArchiveOperating(true)
    try {
      const corpusName = editingArchive.corpusName || currentCorpus?.name
      if (!corpusName) return
      const response = await annotationApi.rename(corpusName, editingArchive.id, newArchiveName.trim())
      if (response.success) {
        await refreshArchives()
        setRenameDialogOpen(false)
        setEditingArchive(null)
      }
    } catch (error) {
      console.error('Failed to rename archive:', error)
    } finally {
      setArchiveOperating(false)
    }
  }
  
  // Handle archive delete
  const handleDeleteArchive = async () => {
    if (!editingArchive) return
    
    setArchiveOperating(true)
    try {
      const corpusName = editingArchive.corpusName || currentCorpus?.name
      if (!corpusName) return
      const response = await annotationApi.delete(corpusName, editingArchive.id)
      if (response.success) {
        await refreshArchives()
        setDeleteDialogOpen(false)
        setEditingArchive(null)
        // If deleted archive was current, clear it
        if (currentArchiveId === editingArchive.id) {
          setCurrentArchiveId(null)
        }
      }
    } catch (error) {
      console.error('Failed to delete archive:', error)
    } finally {
      setArchiveOperating(false)
    }
  }

  // Load SpaCy annotations for a text
  const loadSpacyAnnotations = async (corpusId: string, textId: string, segments?: TranscriptSegment[]) => {
    try {
      const response = await corpusApi.getSpacyAnnotation(corpusId, textId)
      console.log('[SpaCy] Response:', response)
      
      if (response.success && response.data) {
        const data = response.data as any
        
        // Handle segment-based format (from transcript SpaCy annotations)
        if (data.segments) {
          const allTokens: SpacyToken[] = []
          const allEntities: SpacyEntity[] = []
          
          // Use provided segments or fall back to state
          const segsToUse = segments || transcriptSegments
          
          // Calculate global offset for each segment
          let globalOffset = 0
          const segmentIds = Object.keys(data.segments).sort((a, b) => Number(a) - Number(b))
          
          for (const segId of segmentIds) {
            const segData = data.segments[segId]
            
            // Add tokens with global position offset
            if (segData.tokens) {
              for (const token of segData.tokens) {
                allTokens.push({
                  text: token.text,
                  start: globalOffset + token.start,
                  end: globalOffset + token.end,
                  pos: token.pos,
                  tag: token.tag,
                  lemma: token.lemma,
                  dep: token.dep
                })
              }
            }
            
            // Add entities with global position offset
            if (segData.entities) {
              for (const entity of segData.entities) {
                allEntities.push({
                  text: entity.text,
                  start: globalOffset + entity.start,
                  end: globalOffset + entity.end,
                  label: entity.label
                })
              }
            }
            
            // Update global offset using segment text from data or provided segments
            const segFromData = segsToUse.find(s => String(s.id) === segId)
            const segText = segFromData?.text || ''
            globalOffset += segText.length
          }
          
          console.log('[SpaCy] Parsed tokens:', allTokens.length, 'entities:', allEntities.length, 'offset calculation segments:', segsToUse.length)
          setSpacyTokens(allTokens)
          setSpacyEntities(allEntities)
        }
        // Handle flat format (for plain text files)
        else {
          if (data.tokens) {
            setSpacyTokens(data.tokens)
          }
          if (data.entities) {
            setSpacyEntities(data.entities)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load SpaCy annotations:', error)
      setSpacyTokens([])
      setSpacyEntities([])
    }
  }

  // Load YOLO annotations
  const loadYoloAnnotations = async (corpusId: string, textId: string) => {
    try {
      console.log('[YOLO] Loading annotations for:', corpusId, textId)
      const response = await corpusApi.getYoloAnnotation(corpusId, textId)
      console.log('[YOLO] Response:', response)
      if (response.success && response.data) {
        const data = response.data as any
        if (data.tracks && data.tracks.length > 0) {
          console.log('[YOLO] Loaded tracks:', data.tracks.length)
          setYoloTracks(data.tracks)
        } else {
          console.log('[YOLO] No tracks found in response')
          setYoloTracks([])
        }
      } else {
        console.log('[YOLO] Response unsuccessful:', response.message || response.error)
        setYoloTracks([])
      }
    } catch (error) {
      console.error('[YOLO] Failed to load annotations:', error)
      setYoloTracks([])
    }
  }

  // Load CLIP annotations
  const loadClipAnnotations = async (corpusId: string, textId: string) => {
    try {
      console.log('[CLIP] Loading annotations for:', corpusId, textId)
      const response = await corpusApi.getClipAnnotation(corpusId, textId)
      console.log('[CLIP] Response:', response)
      if (response.success && response.data) {
        console.log('[CLIP] Loaded labels:', response.data.labels?.length, 'frames:', response.data.frame_results?.length)
        setClipAnnotation(response.data as ClipAnnotationData)
      } else {
        console.log('[CLIP] Response unsuccessful:', response.message)
        setClipAnnotation(null)
      }
    } catch (error) {
      console.error('[CLIP] Failed to load annotations:', error)
      setClipAnnotation(null)
    }
  }

  const handleFrameworkChange = (frameworkId: string) => {
    setSelectedFrameworkId(frameworkId)
    loadFramework(frameworkId)
  }

  const handleCorpusChange = (corpusId: string) => {
    const corpus = corpora.find(c => c.id === corpusId)
    setCurrentCorpus(corpus || null)
    setSelectedMedia(null)
    setMediaPath('')
    setTranscriptText('')
    setAnnotations([])
    setCurrentArchiveId(null)
    setSpacyTokens([])
    setSpacyEntities([])
    setYoloTracks([])
    setClipAnnotation(null)
    setAlignmentData(null)
    setPitchData(null)
  }

  const handleMediaSelect = async (media: CorpusText) => {
    // 每次选择媒体都完全重置状态，准备新的标注
    // 即使是同一个媒体也重置，让用户可以开始新的标注存档
    
    // 增加 workspaceKey 强制 MultimodalWorkspace 重新挂载
    setWorkspaceKey(prev => prev + 1)
    
    // 先清空 mediaPath，强制视频元素重新加载
    setMediaPath('')
    
    setSelectedMedia(media)
    setAnnotations([])
    setCurrentArchiveId(null)
    setCoderName('')
    setSpacyTokens([])
    setSpacyEntities([])
    setYoloTracks([])
    setClipAnnotation(null)
    setAlignmentData(null)
    setPitchData(null)
    setMediaLoading(true)
    
    // Set media type
    const type = media.mediaType === 'audio' ? 'audio' : 'video'
    setMediaType(type)
    
    try {
      if (currentCorpus) {
        const response = await corpusApi.getText(currentCorpus.id, media.id)
        if (response.success) {
          // Set media path - use streaming URL for playback with cache buster
          const streamUrl = corpusApi.getMediaStreamUrl(currentCorpus.id, media.id)
          // Add timestamp to force reload even for same media
          const urlWithCacheBuster = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`
          setMediaPath(urlWithCacheBuster)
          
          // Load transcript content
          if (response.content) {
            setTranscriptText(response.content)
          } else if (response.transcript?.text) {
            setTranscriptText(response.transcript.text)
          }
          
          // Load transcript segments with timestamps
          let loadedSegments: TranscriptSegment[] = []
          if (response.transcript?.segments) {
            loadedSegments = response.transcript.segments.map((seg: any, idx: number) => ({
              id: String(idx),
              start: seg.start || 0,
              end: seg.end || 0,
              text: seg.text || ''
            }))
            setTranscriptSegments(loadedSegments)
          }
          
          // Load alignment data (for English audio with Wav2Vec2 forced alignment)
          if (response.transcript?.alignment) {
            setAlignmentData(response.transcript.alignment)
          }
          
          // Load pitch data (for English audio with TorchCrepe F0 extraction)
          if (response.transcript?.pitch) {
            setPitchData(response.transcript.pitch)
          }
          
          // Load pre-computed waveform peaks (to avoid Web Audio API crash in Electron packaged app)
          if (response.transcript?.waveform) {
            setWaveformData(response.transcript.waveform)
          }
          
          // Load SpaCy annotations (pass segments to avoid stale state)
          await loadSpacyAnnotations(currentCorpus.id, media.id, loadedSegments)
          
          // Load YOLO and CLIP annotations if video
          if (type === 'video') {
            await loadYoloAnnotations(currentCorpus.id, media.id)
            await loadClipAnnotations(currentCorpus.id, media.id)
          }
          
          // 不再根据媒体筛选存档，存档列表显示所有存档
        }
      }
    } catch (error) {
      console.error('Failed to load media content:', error)
      setTranscriptText('')
      setTranscriptSegments([])
    } finally {
      setMediaLoading(false)
    }
  }

  const handleLoadArchive = async (archive: AnnotationArchiveListItem) => {
    // 使用存档中的语料库名称
    const corpusName = archive.corpusName
    if (!corpusName) {
      console.error('Archive has no corpus name')
      return
    }
    
    // 如果存档属于不同的语料库，自动切换
    let targetCorpus = currentCorpus
    if (!currentCorpus || currentCorpus.name !== corpusName) {
      targetCorpus = corpora.find(c => c.name === corpusName) || null
      if (targetCorpus) {
        setCurrentCorpus(targetCorpus)
      } else {
        console.error(`Corpus ${corpusName} not found`)
        return
      }
    }
    
    setMediaLoading(true)
    
    // 强制 MultimodalWorkspace 重新挂载以正确显示加载的存档数据
    setWorkspaceKey(prev => prev + 1)
    
    try {
      const response = await annotationApi.load(corpusName, archive.id)
      if (response.success && response.data?.data) {
        const data = response.data.data
        
        setTranscriptText(data.text)
        setAnnotations(data.annotations)
        setCurrentArchiveId(data.id)
        
        if (data.transcriptSegments) {
          setTranscriptSegments(data.transcriptSegments)
        }
        if (data.yoloAnnotations) {
          setYoloTracks(data.yoloAnnotations)
        }
        if (data.mediaPath) {
          setMediaPath(data.mediaPath)
        }
        if (data.mediaType) {
          setMediaType(data.mediaType)
        }
        // 恢复音频画框数据
        if (data.audioBoxes && Array.isArray(data.audioBoxes)) {
          setSavedAudioBoxes(data.audioBoxes)
        } else {
          setSavedAudioBoxes([])
        }
        // Find the corresponding media by textId or resourceName and load SpaCy annotations
        if (targetCorpus) {
          let matchingMedia = null
          if (data.textId) {
            matchingMedia = targetCorpus.texts.find(t => t.id === data.textId)
          }
          if (!matchingMedia && data.resourceName) {
            matchingMedia = targetCorpus.texts.find(t => t.filename === data.resourceName)
          }
          
          if (matchingMedia) {
            setSelectedMedia(matchingMedia)
            // Load SpaCy annotations
            const segments = data.transcriptSegments || transcriptSegments
            await loadSpacyAnnotations(matchingMedia, segments)
            
            // Load CLIP data: prefer archive data, fallback to video directory
            if (data.clipAnnotations) {
              setClipAnnotation(data.clipAnnotations)
            } else if (data.mediaType === 'video') {
              // Try to load from video directory if archive doesn't have CLIP data
              await loadClipAnnotations(targetCorpus.id, matchingMedia.id)
            }
            
            // 重新加载对齐和音高数据（音频专用）
            if (data.mediaType === 'audio') {
              try {
                const contentResponse = await corpusApi.getText(targetCorpus.id, matchingMedia.id)
                if (contentResponse.success) {
                  // 加载对齐数据 (transcript 直接在响应对象上)
                  if (contentResponse.transcript?.alignment) {
                    setAlignmentData(contentResponse.transcript.alignment)
                  }
                  // 加载音高数据
                  if (contentResponse.transcript?.pitch) {
                    setPitchData(contentResponse.transcript.pitch)
                  }
                }
              } catch (err) {
                console.warn('[handleLoadArchive] Failed to reload alignment/pitch data:', err)
              }
            }
          } else {
            setSelectedMedia(null)
            setSpacyTokens([])
            setSpacyEntities([])
            if (data.clipAnnotations) {
              setClipAnnotation(data.clipAnnotations)
            }
          }
        } else {
          setSelectedMedia(null)
          setSpacyTokens([])
          setSpacyEntities([])
          if (data.clipAnnotations) {
            setClipAnnotation(data.clipAnnotations)
          }
        }
        
        // Try to load the framework used
        if (data.framework) {
          for (const category of frameworks) {
            const fw = category.frameworks.find(f => f.name === data.framework)
            if (fw) {
              setSelectedFrameworkId(fw.id)
              loadFramework(fw.id)
              break
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load archive:', error)
    } finally {
      setMediaLoading(false)
    }
  }

  const handleLabelSelect = useCallback((label: SelectedLabel | null) => {
    setSelectedLabel(label)
  }, [])

  const handleAnnotationAdd = useCallback((newAnn: Omit<Annotation, 'id'>) => {
    const annotation: Annotation = {
      ...newAnn,
      id: `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
    setAnnotations(prev => [...prev, annotation])
  }, [])

  const handleAnnotationRemove = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id))
    
    // 如果是音频画框标注，同时删除 savedAudioBoxes 中的对应项
    if (id.startsWith('audio-box-')) {
      const audioBoxId = parseInt(id.replace('audio-box-', ''), 10)
      setSavedAudioBoxes(prev => prev.filter(box => box.id !== audioBoxId))
    }
  }, [])

  const handleAnnotationUpdate = useCallback((id: string, updates: Partial<Annotation>) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }, [])

  // 添加音频画框标注
  const handleAudioBoxAdd = useCallback((box: Omit<AudioBox, 'id'>) => {
    const audioBox: AudioBox = {
      ...box,
      id: Date.now()
    }
    setSavedAudioBoxes(prev => [...prev, audioBox])
    
    // 同时添加到标注列表（用于在标注界面显示和删除）
    const annotation: Annotation = {
      id: `audio-box-${audioBox.id}`,
      text: `[${box.label}] ${box.startTime.toFixed(1)}s - ${box.endTime.toFixed(1)}s`,
      startPosition: 0,
      endPosition: 0,
      label: box.label,
      labelPath: box.label,
      color: box.color,
      type: 'audio',
      timestamp: box.startTime,
      frameNumber: Math.floor(box.startTime * 25)
    }
    setAnnotations(prev => [...prev, annotation])
  }, [])

  // 注册波形导出函数
  const handleWaveformExportReady = useCallback((fn: () => string | null) => {
    setWaveformExportFn(() => fn)
  }, [])

  // Reprocess alignment and pitch for English audio
  const handleReprocessAlignment = async () => {
    if (!currentCorpus || !selectedMedia) return
    
    setAlignmentProcessing(true)
    setSaveMessage(null)
    
    try {
      const response = await corpusApi.reAnnotateAlignment(currentCorpus.id, selectedMedia.id)
      
      if (response.success && response.task_id) {
        // Poll for completion
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await corpusApi.getTaskStatus(response.task_id!)
            if (statusResponse.data?.status === 'completed') {
              clearInterval(pollInterval)
              setAlignmentProcessing(false)
              // Reload media data to get new alignment
              handleMediaSelect(selectedMedia)
              setSaveMessage({ type: 'success', text: t('annotation.alignmentComplete', 'Alignment processing complete') })
              setTimeout(() => setSaveMessage(null), 3000)
            } else if (statusResponse.data?.status === 'failed') {
              clearInterval(pollInterval)
              setAlignmentProcessing(false)
              setSaveMessage({ type: 'error', text: statusResponse.data?.message || 'Alignment failed' })
            }
          } catch {
            clearInterval(pollInterval)
            setAlignmentProcessing(false)
          }
        }, 1000)
        
        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval)
          setAlignmentProcessing(false)
        }, 300000)
      } else {
        setAlignmentProcessing(false)
        setSaveMessage({ type: 'error', text: response.message || 'Failed to start alignment' })
      }
    } catch (error) {
      setAlignmentProcessing(false)
      setSaveMessage({ type: 'error', text: String(error) })
    }
  }

  // 打开保存对话框
  const handleSaveClick = () => {
    // 如果已有存档，使用已保存的编码者名称
    if (currentArchiveId) {
      const currentArchive = archives.find(a => a.id === currentArchiveId)
      setCoderName(currentArchive?.coderName || '')
    }
    setSaveDialogOpen(true)
  }
  
  // 执行保存
  const handleSave = async () => {
    if (!currentCorpus || !currentFramework || !selectedMedia) return

    setSaving(true)
    setSaveMessage(null)
    setSaveDialogOpen(false)
    
    // Helper functions to find POS and Entity for annotation range
    const findPosForRange = (start: number, end: number): string => {
      if (!spacyTokens || spacyTokens.length === 0) return '-'
      const matching = spacyTokens.filter(t => t.start >= start && t.end <= end)
      if (matching.length === 0) return '-'
      const uniquePos = [...new Set(matching.map(t => t.pos))]
      return uniquePos.length > 1 ? 'Mul' : uniquePos[0]
    }
    
    const findEntityForRange = (start: number, end: number): string => {
      if (!spacyEntities || spacyEntities.length === 0) return '-'
      const matching = spacyEntities.filter(e =>
        (e.start >= start && e.start < end) ||
        (e.end > start && e.end <= end) ||
        (e.start <= start && e.end >= end)
      )
      if (matching.length === 0) return '-'
      const uniqueLabels = [...new Set(matching.map(e => e.label))]
      return uniqueLabels.length > 1 ? 'Mul' : uniqueLabels[0]
    }
    
    // Enrich annotations with POS and Entity data before saving
    const enrichedAnnotations = annotations.map(ann => ({
      ...ann,
      pos: ann.pos || findPosForRange(ann.startPosition, ann.endPosition),
      entity: ann.entity || findEntityForRange(ann.startPosition, ann.endPosition)
    }))
    
    try {
      // 准备音高数据用于存档
      const pitchDataArchive = pitchData?.enabled && pitchData.f0 && pitchData.times ? {
        enabled: true,
        f0: pitchData.f0,
        times: pitchData.times,
        fmin: pitchData.fmin || 50,
        fmax: pitchData.fmax || 550
      } : undefined
      
      // 导出音频波形 SVG（音频模式）
      let audioVisualizationSvg: string | undefined
      if (mediaType === 'audio' && waveformExportFn) {
        const svg = waveformExportFn()
        if (svg) {
          audioVisualizationSvg = svg
          console.log('[handleSave] Audio visualization SVG exported, size:', svg.length)
        }
      }
      
      const request = createMultimodalAnnotationRequest(
        currentCorpus.name,
        selectedMedia.filename,
        currentFramework.name,
        currentFramework.category,
        transcriptText,
        enrichedAnnotations,
        mediaType,
        mediaPath,
        {
          yoloAnnotations: yoloTracks,
          transcriptSegments,
          clipAnnotations: clipAnnotation || undefined,
          archiveId: currentArchiveId || undefined,
          coderName: coderName || undefined,
          textId: selectedMedia.id || undefined,
          // 音频专用数据
          audioBoxes: savedAudioBoxes.length > 0 ? savedAudioBoxes : undefined,
          pitchData: pitchDataArchive,
          audioVisualizationSvg
        }
      )

      const response = await annotationApi.save(request)
      
      if (response.success && response.data?.data) {
        setCurrentArchiveId(response.data.data.id)
        setSaveMessage({ 
          type: 'success', 
          text: t('annotation.saveSuccess', '已保存 {{count}} 条标注', { count: enrichedAnnotations.length })
        })
        // 保存后刷新存档列表
        await refreshArchives()
      } else {
        setSaveMessage({ type: 'error', text: t('annotation.saveFailed', '保存失败') })
      }
    } catch (error) {
      console.error('Save error:', error)
      setSaveMessage({ type: 'error', text: t('annotation.saveFailed', '保存失败') })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMessage(null), 3000)
    }
  }

  // 拼接转录文本用于搜索
  const fullTranscriptText = transcriptSegments.map(s => s.text).join('')

  // 搜索变化处理
  const handleSearchChange = useCallback((searchTerm: string, matches: SearchMatch[]) => {
    // 转换为高亮格式
    setSearchHighlights(matches.map(m => ({ start: m.start, end: m.end })))
  }, [])

  // 确认批量标注
  const handleSearchConfirm = useCallback((matches: SearchMatch[]) => {
    if (!selectedLabel || matches.length === 0) return
    setPendingMatches(matches)
    setBatchAnnotateDialogOpen(true)
  }, [selectedLabel])

  // 执行批量标注
  const handleBatchAnnotateConfirm = useCallback(() => {
    if (!selectedLabel || pendingMatches.length === 0) return
    
    // 为每个匹配创建标注
    pendingMatches.forEach(match => {
      handleAnnotationAdd({
        text: match.text,
        startPosition: match.start,
        endPosition: match.end,
        label: selectedLabel.node.name,
        labelPath: selectedLabel.path,
        color: selectedLabel.color,
        type: 'text'
      })
    })
    
    // 清除搜索状态
    setSearchHighlights([])
    setPendingMatches([])
    setBatchAnnotateDialogOpen(false)
    
    setSaveMessage({ type: 'success', text: t('annotation.batchAnnotateSuccess', { count: pendingMatches.length }) })
    setTimeout(() => setSaveMessage(null), 3000)
  }, [selectedLabel, pendingMatches, handleAnnotationAdd, t])

  // Get video and audio texts
  // Chinese audio is filtered out from multimodal annotation (should use plain text annotation instead)
  const videoTexts = currentCorpus?.texts.filter(t => t.mediaType === 'video') || []
  const isChineseCorpus = currentCorpus?.language?.toLowerCase() === 'chinese'
  const allAudioTexts = currentCorpus?.texts.filter(t => t.mediaType === 'audio') || []
  const audioTexts = isChineseCorpus ? [] : allAudioTexts

  // Flatten frameworks for select
  const allFrameworks = frameworks.flatMap(cat => 
    cat.frameworks.map(fw => ({ ...fw, categoryName: cat.name }))
  )

  // Resizable split panel handlers
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const startX = e.clientX
    const startWidth = leftPanelWidth
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      moveEvent.stopPropagation()
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(250, Math.min(800, startWidth + delta))
      setLeftPanelWidth(newWidth)
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault()
      upEvent.stopPropagation()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [leftPanelWidth])

  return (
    <Box sx={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Left Panel - Framework & Media Selection */}
      <Box 
        sx={{ 
          width: leftPanelWidth,
          minWidth: 250,
          maxWidth: '50%',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          overflow: 'hidden'
        }}
      >
        {/* 上半部分：框架设置和框架树 - 使用 flex: 1 让框架树有足够空间 */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Framework Settings */}
          <Accordion defaultExpanded sx={{ flexShrink: 0 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>{t('annotation.frameworkSettings')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('annotation.selectFramework')}</InputLabel>
                  <Select
                    value={selectedFrameworkId}
                    onChange={(e) => handleFrameworkChange(e.target.value)}
                    label={t('annotation.selectFramework')}
                    MenuProps={{
                      PaperProps: {
                        sx: { maxWidth: 400 }
                      }
                    }}
                  >
                    {allFrameworks.map(fw => (
                      <MenuItem key={fw.id} value={fw.id} sx={{ maxWidth: 400 }}>
                        <Stack direction="column" spacing={0.5} sx={{ width: '100%' }}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              wordBreak: 'break-word',
                              whiteSpace: 'normal',
                              lineHeight: 1.3
                            }}
                          >
                            {fw.name}
                          </Typography>
                          <Chip 
                            label={fw.categoryName} 
                            size="small" 
                            variant="outlined" 
                            sx={{ alignSelf: 'flex-start', fontSize: '10px', height: 20 }}
                          />
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  startIcon={<RefreshIcon />}
                  onClick={loadFrameworks}
                  disabled={frameworkLoading}
                  size="small"
                >
                  {t('annotation.refreshFrameworks')}
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Framework Tree - 占据剩余空间 */}
          {currentFramework && (
            <Box sx={{ flex: 1, minHeight: 250, p: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ flexShrink: 0 }}>
                {t('annotation.clickLabelToSelect')}
              </Typography>
              <Box sx={{ flex: 1, minHeight: 200 }}>
                <FrameworkTree
                  root={currentFramework.root}
                  selectedLabel={selectedLabel}
                  onLabelSelect={handleLabelSelect}
                />
              </Box>
            </Box>
          )}
        </Box>

        {/* 选中的标签显示 - 固定在中间 */}
        {selectedLabel && (
          <Paper sx={{ mx: 1, p: 1, bgcolor: `${selectedLabel.color}20`, flexShrink: 0 }}>
            <Typography variant="body2" fontWeight={600}>
              {t('annotation.selected')}: {selectedLabel.node.name}
            </Typography>
            {selectedLabel.node.definition && (
              <Typography variant="caption" color="text.secondary">
                {selectedLabel.node.definition}
              </Typography>
            )}
          </Paper>
        )}

        <Divider sx={{ my: 0.5, flexShrink: 0 }} />

        {/* 下半部分：媒体选择和存档 - 固定高度，可滚动 */}
        <Box sx={{ flexShrink: 0, maxHeight: '35%', overflow: 'auto' }}>
          {/* Media Selection */}
          <Accordion defaultExpanded sx={{ flexShrink: 0 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>{t('annotation.mediaSelection')}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ py: 1 }}>
              <Stack spacing={1.5}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('corpus.selectCorpus')}</InputLabel>
                  <Select
                    value={currentCorpus?.id || ''}
                    onChange={(e) => handleCorpusChange(e.target.value)}
                    label={t('corpus.selectCorpus')}
                  >
                    {corpora.map(corpus => (
                      <MenuItem key={corpus.id} value={corpus.id}>
                        {corpus.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Combined Media List - 合并视频和音频列表 */}
                {currentCorpus && (videoTexts.length > 0 || audioTexts.length > 0) && (
                  <Paper variant="outlined" sx={{ maxHeight: 150, overflow: 'auto' }}>
                    <List dense disablePadding>
                      {/* Video Items */}
                      {videoTexts.map(video => (
                        <ListItemButton
                          key={video.id}
                          selected={selectedMedia?.id === video.id}
                          onClick={() => handleMediaSelect(video)}
                          sx={{ py: 0.5 }}
                        >
                          <ListItemText
                            primary={
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <VideoLibraryIcon fontSize="small" sx={{ color: 'text.secondary', fontSize: 16 }} />
                                <Typography variant="body2" noWrap>{video.filename}</Typography>
                              </Stack>
                            }
                            secondary={
                              <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                                {video.transcriptPath && (
                                  <Chip label={t('annotation.transcript')} size="small" color="success" sx={{ height: 16, fontSize: '0.6rem' }} />
                                )}
                                {video.yoloAnnotationPath && (
                                  <Chip label="YOLO" size="small" color="info" sx={{ height: 16, fontSize: '0.6rem' }} />
                                )}
                                {video.clipAnnotationPath && (
                                  <Chip label="CLIP" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#6366f1', color: 'white' }} />
                                )}
                              </Stack>
                            }
                          />
                        </ListItemButton>
                      ))}
                      {/* Audio Items */}
                      {audioTexts.map(audio => (
                        <ListItemButton
                          key={audio.id}
                          selected={selectedMedia?.id === audio.id}
                          onClick={() => handleMediaSelect(audio)}
                          sx={{ py: 0.5 }}
                        >
                          <ListItemText
                            primary={
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <AudiotrackIcon fontSize="small" sx={{ color: 'text.secondary', fontSize: 16 }} />
                                <Typography variant="body2" noWrap>{audio.filename}</Typography>
                              </Stack>
                            }
                            secondary={
                              audio.transcriptPath && (
                                <Chip label={t('annotation.transcript')} size="small" color="success" sx={{ height: 16, fontSize: '0.6rem' }} />
                              )
                            }
                          />
                        </ListItemButton>
                      ))}
                    </List>
                  </Paper>
                )}

                {currentCorpus && videoTexts.length === 0 && audioTexts.length === 0 && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                      {t('annotation.noMediaInCorpus')}
                    </Typography>
                    {/* Show hint for Chinese audio */}
                    {isChineseCorpus && allAudioTexts.length > 0 && (
                      <Typography variant="caption" color="info.main" textAlign="center" display="block" sx={{ mt: 1 }}>
                        {t('annotation.chineseAudioHint', '中文音频请在纯文本标注模式下进行标注')}
                      </Typography>
                    )}
                  </Box>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Archives - 显示所有存档 */}
          {archives.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>
                  {t('annotation.archives')} ({archives.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense disablePadding>
                  {archives.map(archive => (
                    <ListItemButton
                      key={archive.id}
                      onClick={() => handleLoadArchive(archive)}
                      selected={currentArchiveId === archive.id}
                      sx={{ pr: 0.5 }}
                    >
                      <ListItemText
                        primary={archive.resourceName || archive.filename}
                        secondary={`${archive.corpusName || ''} | ${archive.annotationCount} ${t('annotation.annotationCount')} - ${archive.timestamp}`}
                        primaryTypographyProps={{ noWrap: true, sx: { maxWidth: 150 } }}
                        secondaryTypographyProps={{ noWrap: true, sx: { maxWidth: 150 } }}
                        sx={{ mr: 1, minWidth: 0 }}
                      />
                      <Stack direction="row" spacing={0} flexShrink={0}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingArchive(archive)
                            setNewArchiveName(archive.resourceName || archive.filename)
                            setRenameDialogOpen(true)
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingArchive(archive)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </ListItemButton>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}
        </Box>
      </Box>

      {/* Resizable Divider */}
      <Box
        ref={dividerRef}
        onMouseDown={handleDividerMouseDown}
        sx={{
          width: 8,
          cursor: 'col-resize',
          bgcolor: 'divider',
          '&:hover': { bgcolor: 'primary.light' },
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '&::after': {
            content: '""',
            width: 2,
            height: 40,
            bgcolor: 'grey.400',
            borderRadius: 1
          }
        }}
      />

      {/* Right Panel - Workspace */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        minWidth: 0
      }}>
        {selectedMedia || transcriptText ? (
          <>
            {/* Toolbar */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {selectedMedia?.filename || t('annotation.multimodalMode')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {annotations.length} {t('annotation.annotationCount')}
                    {selectedLabel && ` | ${t('annotation.selectedLabel')}: ${selectedLabel.node.name}`}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  {/* 搜索框 - 需要有转录文本才显示 */}
                  {transcriptText && (
                    <>
                      <SearchAnnotateBox
                        text={fullTranscriptText}
                        onSearchChange={handleSearchChange}
                        onConfirmAnnotate={handleSearchConfirm}
                        disabled={!selectedLabel}
                        placeholder={selectedLabel 
                          ? t('annotation.searchToAnnotate', '搜索并标注为 "{{label}}"...', { label: selectedLabel.node.name })
                          : t('annotation.selectLabelFirstToSearch', '请先选择标签再搜索')
                        }
                      />
                      <Divider orientation="vertical" flexItem />
                    </>
                  )}
                  {saveMessage && (
                    <Alert severity={saveMessage.type} sx={{ py: 0 }}>
                      {saveMessage.text}
                    </Alert>
                  )}
                  <Button
                    startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                    variant="contained"
                    size="small"
                    onClick={handleSaveClick}
                    disabled={saving || !currentFramework || annotations.length === 0}
                  >
                    {t('common.save')}
                  </Button>
                </Stack>
              </Stack>
            </Box>

            {/* Alignment reprocess prompt for English audio without alignment data */}
            {mediaType === 'audio' && 
             currentCorpus?.language?.toLowerCase() === 'english' && 
             !alignmentData?.enabled && 
             !mediaLoading && (
              <Alert 
                severity="info" 
                sx={{ mx: 2, mt: 2 }}
                action={
                  <Button 
                    color="inherit" 
                    size="small"
                    onClick={handleReprocessAlignment}
                    disabled={alignmentProcessing}
                    startIcon={alignmentProcessing ? <CircularProgress size={14} /> : null}
                  >
                    {alignmentProcessing 
                      ? t('annotation.processing', 'Processing...')
                      : t('annotation.reprocessAlignment', 'Process Alignment')
                    }
                  </Button>
                }
              >
                {t('annotation.alignmentNotAvailable', 'Waveform alignment not available. Click to process forced alignment and pitch extraction for this audio.')}
              </Alert>
            )}

            {/* Multimodal Workspace */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <MultimodalWorkspace
                key={workspaceKey}
                mediaPath={mediaPath}
                mediaType={mediaType}
                transcriptText={transcriptText}
                transcriptSegments={transcriptSegments}
                yoloTracks={yoloTracks}
                annotations={annotations}
                selectedLabel={selectedLabel}
                onAnnotationAdd={handleAnnotationAdd}
                onAnnotationRemove={handleAnnotationRemove}
                onAnnotationUpdate={handleAnnotationUpdate}
                spacyTokens={spacyTokens}
                spacyEntities={spacyEntities}
                clipAnnotation={clipAnnotation}
                searchHighlights={searchHighlights}
                alignmentData={alignmentData}
                pitchData={pitchData}
                waveformData={waveformData}
                savedAudioBoxes={savedAudioBoxes}
                onAudioBoxAdd={handleAudioBoxAdd}
                onWaveformExportReady={handleWaveformExportReady}
              />
            </Box>
          </>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2
            }}
          >
            {mediaLoading ? (
              <CircularProgress />
            ) : (
              <>
                <Stack direction="row" spacing={2}>
                  <VideoLibraryIcon sx={{ fontSize: 48, color: 'grey.400' }} />
                  <AudiotrackIcon sx={{ fontSize: 48, color: 'grey.400' }} />
                </Stack>
                <Typography variant="h6" color="text.secondary">
                  {t('annotation.multimodalMode')}
                </Typography>
                <Typography color="text.secondary">
                  {t('annotation.selectMediaOrArchive', '选择视频或音频开始标注')}
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>
      
      {/* 保存对话框 */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>{t('annotation.saveArchive', '保存标注存档')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={coderName}
            onChange={(e) => setCoderName(e.target.value)}
            label={t('annotation.coderName', '编码者名称')}
            placeholder={t('annotation.coderNamePlaceholder', '输入编码者名称（可选）')}
            sx={{ mt: 1 }}
            helperText={t('annotation.coderNameHelper', '用于编码者间信度分析时识别不同编码者')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)} disabled={saving}>
            {t('common.cancel', '取消')}
          </Button>
          <Button 
            onClick={handleSave}
            variant="contained"
            disabled={saving}
          >
            {saving ? <CircularProgress size={16} /> : t('common.save', '保存')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 重命名对话框 */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>{t('annotation.renameArchive', '重命名存档')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={newArchiveName}
            onChange={(e) => setNewArchiveName(e.target.value)}
            label={t('annotation.archiveName', '存档名称')}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)} disabled={archiveOperating}>
            {t('common.cancel', '取消')}
          </Button>
          <Button 
            onClick={handleRenameArchive}
            variant="contained"
            disabled={archiveOperating || !newArchiveName.trim()}
          >
            {archiveOperating ? <CircularProgress size={16} /> : t('common.save', '保存')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('annotation.deleteArchive', '删除存档')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('annotation.deleteArchiveConfirm', '确定要删除存档 "{name}" 吗？此操作不可撤销。', { name: editingArchive?.resourceName || editingArchive?.filename || '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={archiveOperating}>
            {t('common.cancel', '取消')}
          </Button>
          <Button 
            onClick={handleDeleteArchive}
            variant="contained"
            color="error"
            disabled={archiveOperating}
          >
            {archiveOperating ? <CircularProgress size={16} /> : t('common.delete', '删除')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 批量标注确认对话框 */}
      <BatchAnnotateDialog
        open={batchAnnotateDialogOpen}
        onClose={() => setBatchAnnotateDialogOpen(false)}
        onConfirm={handleBatchAnnotateConfirm}
        matches={pendingMatches}
        labelName={selectedLabel?.node.name || ''}
        labelColor={selectedLabel?.color}
      />
    </Box>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Paper,
  Typography,
  Grid,
  Chip,
  IconButton,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Divider,
  Tooltip,
  CircularProgress,
  Alert,
  Tab,
  Tabs,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
  List,
  ListItem,
  ListItemText,
  Slider,
  LinearProgress,
  Snackbar,
  Checkbox,
  ButtonGroup
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import TextSnippetIcon from '@mui/icons-material/TextSnippet'
import AudioFileIcon from '@mui/icons-material/AudioFile'
import VideoFileIcon from '@mui/icons-material/VideoFile'
import LocalOfferIcon from '@mui/icons-material/LocalOffer'
import SearchIcon from '@mui/icons-material/Search'
import RefreshIcon from '@mui/icons-material/Refresh'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import UploadIcon from '@mui/icons-material/Upload'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import ImageSearchIcon from '@mui/icons-material/ImageSearch'
import CategoryIcon from '@mui/icons-material/Category'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import { useTranslation } from 'react-i18next'
import { corpusApi } from '../../api'
import type { 
  Corpus, 
  CorpusText, 
  MediaType, 
  TranscriptData, 
  TranscriptSegment 
} from '../../types'
import { API_BASE_URL } from '../../api/client'
import { TextEditDialog, TranscriptSegmentEdit, BatchTextEditDialog } from '../../components/Corpus'
import TextMetadataEditor from './TextMetadataEditor'
import NumberInput from '../../components/common/NumberInput'
import { useCorpusStore, type TaskInfo } from '../../stores/corpusStore'
import { taskPollingService } from '../../services/taskPollingService'

// CLIP preset label categories
const CLIP_PRESET_LABELS: Record<string, string[]> = {
  objects: ['person', 'animal', 'vehicle', 'food', 'text', 'logo'],
  scenes: ['indoor', 'outdoor', 'nature', 'building', 'urban', 'rural'],
  mood: ['bright', 'dark', 'colorful', 'monochrome', 'warm', 'cool'],
  dynamics: ['action', 'static', 'crowded', 'empty', 'fast', 'slow']
}

// Default CLIP labels
const DEFAULT_CLIP_LABELS = [
  'person', 'animal', 'vehicle', 'food',
  'indoor', 'outdoor', 'nature', 'building',
  'bright', 'dark', 'colorful',
  'action', 'static', 'crowded', 'empty'
]

interface CorpusDetailProps {
  corpus: Corpus
  onBack: () => void
  onUpload?: () => void
}

// Translation mappings for text types
const TEXT_TYPE_TRANSLATION_KEYS: Record<string, string> = {
  'General Text': 'corpus.textTypes.generalText',
  'Academic Paper': 'corpus.textTypes.academicPaper',
  'Social Media': 'corpus.textTypes.socialMedia',
  'News Article': 'corpus.textTypes.newsArticle',
  'Novel/Fiction': 'corpus.textTypes.novelFiction',
  'Video Material': 'corpus.textTypes.videoMaterial',
  'Audio Material': 'corpus.textTypes.audioMaterial',
  'Speech/Presentation': 'corpus.textTypes.speechPresentation',
  'Interview Transcript': 'corpus.textTypes.interviewTranscript',
  'Meeting Minutes': 'corpus.textTypes.meetingMinutes',
  'Technical Document': 'corpus.textTypes.technicalDocument',
  'Legal Document': 'corpus.textTypes.legalDocument',
  'Medical Literature': 'corpus.textTypes.medicalLiterature',
  'Custom': 'corpus.textTypes.custom',
  'Other': 'corpus.textTypes.other'
}

export default function CorpusDetail({ corpus, onBack, onUpload }: CorpusDetailProps) {
  const { t } = useTranslation()
  
  // Helper function to translate text type
  const translateTextType = (textType: string | undefined): string => {
    if (!textType || textType === '-') return '-'
    const translationKey = TEXT_TYPE_TRANSLATION_KEYS[textType]
    return translationKey ? t(translationKey, textType) : textType
  }
  
  // Helper function to translate language
  const translateLanguage = (language: string | undefined): string => {
    if (!language || language === '-') return '-'
    const translationKey = `corpus.languages.${language}`
    return t(translationKey, language)
  }
  
  // Data state
  const [texts, setTexts] = useState<CorpusText[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMediaType, setFilterMediaType] = useState<MediaType | ''>('')
  
  // Sorting state
  type SortKey = 'filename' | 'wordCount' | 'duration' | 'date' | 'author' | 'source' | 'textType'
  type SortDirection = 'asc' | 'desc'
  const [sortBy, setSortBy] = useState<SortKey>('filename')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  
  // Pagination
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  
  // Dialogs
  const [viewingText, setViewingText] = useState<CorpusText | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [addTagDialogOpen, setAddTagDialogOpen] = useState(false)
  const [selectedText, setSelectedText] = useState<CorpusText | null>(null)
  const [newTag, setNewTag] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  // Transcript player state
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  
  // Media playback refs
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // SpaCy annotation state
  const [spacyAnnotating, setSpacyAnnotating] = useState(false)

  // Text edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')

  // Batch text edit dialog state
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false)

  // Text metadata editor state
  const [metadataEditorOpen, setMetadataEditorOpen] = useState(false)
  const [editingTextForMetadata, setEditingTextForMetadata] = useState<CorpusText | null>(null)

  // Use global store for processing tasks (persists across tab switches)
  const { processingTasks, setTask, removeTask } = useCorpusStore()

  // Selection state for batch re-annotation
  const [selectedTextIds, setSelectedTextIds] = useState<Set<string>>(new Set())
  const [reAnnotating, setReAnnotating] = useState<string | null>(null)  // 'spacy' | 'yolo' | 'clip' | null
  
  // CLIP re-annotation dialog state
  const [clipReAnnotateDialogOpen, setClipReAnnotateDialogOpen] = useState(false)
  const [clipFrameInterval, setClipFrameInterval] = useState(30)
  const [clipLabels, setClipLabels] = useState<string[]>(DEFAULT_CLIP_LABELS)
  const [customClipLabel, setCustomClipLabel] = useState('')

  // Load texts on mount
  useEffect(() => {
    loadTexts()
  }, [corpus.id])

  const loadTexts = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await corpusApi.getTexts(corpus.id)
      console.log('[CorpusDetail] loadTexts response:', response)
      if (response.success) {
        // Debug: log first text metadata
        if (response.data.length > 0) {
          console.log('[CorpusDetail] First text metadata:', response.data[0].metadata)
        }
        setTexts(response.data)
      } else {
        setError(response.message || 'Failed to load texts')
      }
    } catch (err) {
      setError('Failed to load texts: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Start background polling for this corpus (persists even when switching tabs)
  const startBackgroundPolling = useCallback(() => {
    taskPollingService.startPolling(corpus.id, () => {
      // Callback when all tasks complete - reload texts
      loadTexts()
    })
  }, [corpus.id])

  // Check if there are active tasks and start polling if needed
  useEffect(() => {
    // Start polling immediately to check for any existing tasks
    startBackgroundPolling()
    
    // Note: We don't stop polling on unmount - this allows tasks to continue
    // The polling service will auto-stop when no more active tasks
  }, [corpus.id, startBackgroundPolling])

  // Handle sort click
  const handleSortClick = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortDirection('asc')
    }
    setPage(0)  // Reset to first page when sorting changes
  }
  
  // Filter and sort texts
  const filteredTexts = texts
    .filter(text => {
      const textTags = text.tags || []
      const matchesSearch = !searchQuery || 
        text.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        textTags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      
      const matchesType = !filterMediaType || text.mediaType === filterMediaType
      
      return matchesSearch && matchesType
    })
    .sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1
      
      switch (sortBy) {
        case 'filename':
          return multiplier * a.filename.localeCompare(b.filename)
        case 'wordCount':
          return multiplier * ((a.wordCount || 0) - (b.wordCount || 0))
        case 'duration':
          return multiplier * ((a.duration || 0) - (b.duration || 0))
        case 'date':
          const dateA = a.metadata?.date || ''
          const dateB = b.metadata?.date || ''
          return multiplier * dateA.localeCompare(dateB)
        case 'author':
          const authorA = a.metadata?.author || ''
          const authorB = b.metadata?.author || ''
          return multiplier * authorA.localeCompare(authorB)
        case 'source':
          const sourceA = a.metadata?.source || ''
          const sourceB = b.metadata?.source || ''
          return multiplier * sourceA.localeCompare(sourceB)
        case 'textType':
          const typeA = a.metadata?.customFields?.textType || ''
          const typeB = b.metadata?.customFields?.textType || ''
          return multiplier * typeA.localeCompare(typeB)
        default:
          return 0
      }
    })

  const getMediaIcon = (type: MediaType) => {
    switch (type) {
      case 'audio': return <AudioFileIcon color="primary" />
      case 'video': return <VideoFileIcon color="secondary" />
      default: return <TextSnippetIcon color="action" />
    }
  }

  const handleViewText = async (text: CorpusText) => {
    setViewingText(text)
    setTextContent(null)
    setTranscriptData(null)
    setLoadingContent(true)
    
    try {
      const response = await corpusApi.getText(corpus.id, text.id)
      if (response.success) {
        setTextContent(response.content || null)
        setTranscriptData(response.transcript || null)
      }
    } catch (err) {
      console.error('Failed to load text content:', err)
    } finally {
      setLoadingContent(false)
    }
  }

  const handleAddTag = async () => {
    if (!selectedText || !newTag.trim()) return
    
    try {
      await corpusApi.addTextTag(corpus.id, selectedText.id, newTag.trim())
      // Update local state
      setTexts(prev => prev.map(t => 
        t.id === selectedText.id 
          ? { ...t, tags: [...(t.tags || []), newTag.trim()] }
          : t
      ))
      setNewTag('')
      setAddTagDialogOpen(false)
    } catch (err) {
      console.error('Failed to add tag:', err)
    }
  }

  const handleRemoveTag = async (text: CorpusText, tag: string) => {
    try {
      await corpusApi.removeTextTag(corpus.id, text.id, tag)
      setTexts(prev => prev.map(t => 
        t.id === text.id 
          ? { ...t, tags: (t.tags || []).filter(tt => tt !== tag) }
          : t
      ))
    } catch (err) {
      console.error('Failed to remove tag:', err)
    }
  }

  const handleDeleteText = async () => {
    if (!selectedText) return
    
    setDeleting(true)
    try {
      const response = await corpusApi.deleteText(corpus.id, selectedText.id)
      if (response.success) {
        setTexts(prev => prev.filter(t => t.id !== selectedText.id))
      }
    } catch (err) {
      console.error('Failed to delete text:', err)
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setSelectedText(null)
    }
  }

  const handleOpenAddTag = (text: CorpusText, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedText(text)
    setAddTagDialogOpen(true)
  }

  const handleOpenDelete = (text: CorpusText, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedText(text)
    setDeleteDialogOpen(true)
  }

  // Handle open metadata editor
  const handleOpenMetadataEditor = (text: CorpusText, event: React.MouseEvent) => {
    event.stopPropagation()
    setEditingTextForMetadata(text)
    setMetadataEditorOpen(true)
  }

  // Handle metadata saved
  const handleMetadataSaved = (updatedText: CorpusText) => {
    console.log('[CorpusDetail] handleMetadataSaved:', updatedText)
    console.log('[CorpusDetail] updatedText.metadata:', updatedText.metadata)
    
    // Update local state immediately
    setTexts(prev => prev.map(t => 
      t.id === updatedText.id ? updatedText : t
    ))
    setSnackbarMessage(t('common.saved'))
    setSnackbarOpen(true)
    
    // Also refresh from server to ensure data consistency
    loadTexts()
  }

  // Helper function to poll task until completion
  const pollTaskUntilComplete = (taskId: string, textId: string, defaultStage: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const poll = async () => {
        try {
          const taskResponse = await corpusApi.getTaskStatus(taskId)
          if (taskResponse.success && taskResponse.data) {
            const task = taskResponse.data
            
            // Extract stage from message (format: "stage: message")
            const message = task.message || 'Processing...'
            const colonIndex = message.indexOf(':')
            const extractedStage = colonIndex > 0 ? message.substring(0, colonIndex) : defaultStage
            
            // Update task progress in store
            setTask(textId, {
              taskId: taskId,
              corpusId: corpus.id,
              textId: textId,
              progress: task.progress || 0,
              stage: extractedStage,
              message: message,
              status: task.status
            })
            
            if (task.status === 'completed') {
              removeTask(textId)
              resolve(true)
            } else if (task.status === 'failed') {
              removeTask(textId)
              resolve(false)
            } else {
              // Still processing, poll again
              setTimeout(poll, 1500)
            }
          } else {
            resolve(false)
          }
        } catch {
          resolve(false)
        }
      }
      poll()
    })
  }

  // Handle SpaCy re-annotation (sequential processing of selected texts)
  // Backend automatically runs USAS and MIPVU after SpaCy in a single task
  const handleBatchSpacyAnnotate = async (force: boolean = false) => {
    if (selectedTextIds.size === 0) {
      setError(t('corpus.selectTextsFirst', 'Please select texts first'))
      return
    }
    
    // Process selected text files and audio/video with transcripts
    const selectedTexts = texts.filter(t => {
      if (!selectedTextIds.has(t.id)) return false
      // Text files: directly supported
      if (t.mediaType === 'text') return true
      // Audio/Video: need to have transcript file
      if (t.mediaType === 'audio' || t.mediaType === 'video') {
        return !!(t.transcriptJsonPath || t.transcriptPath)
      }
      return false
    })
    
    if (selectedTexts.length === 0) {
      setError(t('corpus.noTextsToAnnotate', 'No texts or transcripts to annotate'))
      return
    }
    
    setSpacyAnnotating(true)
    setSnackbarMessage(t('corpus.fullAnnotating', 'Full annotation in progress (SpaCy + USAS + MIPVU)...'))
    setSnackbarOpen(true)
    
    let successCount = 0
    let failedCount = 0
    
    // Process texts sequentially (one at a time)
    // Backend handles full pipeline: SpaCy -> USAS -> MIPVU in a single task
    for (let i = 0; i < selectedTexts.length; i++) {
      const text = selectedTexts[i]
      
      try {
        // Start the task for this text - backend will run SpaCy, USAS, and MIPVU
        const response = await corpusApi.reAnnotateSpacy(corpus.id, text.id, force)
        
        if (response.success && response.task_id) {
          // Add task to store to show progress
          setTask(text.id, {
            taskId: response.task_id,
            corpusId: corpus.id,
            textId: text.id,
            progress: 0,
            stage: 'spacy',
            message: t('corpus.spacyAnnotating', 'SpaCy annotation in progress...'),
            status: 'pending'
          })
          
          // Wait for this task to complete before starting the next
          // The task will progress through spacy -> usas -> mipvu stages
          const success = await pollTaskUntilComplete(response.task_id, text.id, 'spacy')
          if (success) {
            successCount++
          } else {
            failedCount++
          }
        } else {
          failedCount++
        }
      } catch (err) {
        console.error('SpaCy re-annotation failed:', err)
        failedCount++
      }
    }
    
    // All tasks completed
    setSpacyAnnotating(false)
    setSelectedTextIds(new Set())
    loadTexts() // Refresh texts
    
    if (successCount > 0) {
      setSnackbarMessage(t('corpus.fullAnnotateSuccess', 'Full annotation completed for {{count}} texts', { count: successCount }))
      setSnackbarOpen(true)
    }
    if (failedCount > 0) {
      setError(`${failedCount} ${t('corpus.fullAnnotateFailed', 'text(s) annotation failed')}`)
    }
  }

  // Handle YOLO re-annotation for selected videos (sequential processing - one at a time)
  const handleYoloReAnnotate = async () => {
    if (selectedTextIds.size === 0) return
    
    const videoTexts = texts.filter(t => selectedTextIds.has(t.id) && t.mediaType === 'video')
    if (videoTexts.length === 0) {
      setError(t('corpus.noVideosSelected', ''))
      return
    }
    
    setReAnnotating('yolo')
    setSnackbarMessage(t('corpus.yoloReAnnotateStarted', 'YOLO annotation started...'))
    setSnackbarOpen(true)
    
    let successCount = 0
    let failedCount = 0
    
    // Process videos sequentially (one at a time)
    for (let i = 0; i < videoTexts.length; i++) {
      const text = videoTexts[i]
      
      try {
        // Start the task for this video
        const response = await corpusApi.reAnnotateYolo(corpus.id, text.id)
        
        if (response.success && response.task_id) {
          // Add task to store to show progress bar
          setTask(text.id, {
            taskId: response.task_id,
            corpusId: corpus.id,
            textId: text.id,
            progress: 0,
            stage: 'yolo',
            message: t('corpus.yoloStarting', 'Starting YOLO annotation...'),
            status: 'pending'
          })
          
          // Wait for this task to complete before starting the next
          const success = await pollTaskUntilComplete(response.task_id, text.id, 'yolo')
          if (success) {
            successCount++
          } else {
            failedCount++
          }
        } else {
          failedCount++
        }
      } catch (err) {
        console.error('YOLO re-annotation failed:', err)
        failedCount++
      }
    }
    
    // All tasks completed
    setReAnnotating(null)
    setSelectedTextIds(new Set())
    loadTexts()
    
    if (successCount > 0) {
      setSnackbarMessage(t('corpus.yoloReAnnotateSuccess', 'YOLO annotation completed for {{count}} videos', { count: successCount }))
      setSnackbarOpen(true)
    }
    if (failedCount > 0) {
      setError(`${failedCount} ${t('corpus.yoloReAnnotateFailed', 'YOLO annotation failed')}`)
    }
  }

  // Handle CLIP re-annotation for selected videos - open dialog to select frame interval
  const handleClipReAnnotateClick = () => {
    if (selectedTextIds.size === 0) return
    
    const videoTexts = texts.filter(t => selectedTextIds.has(t.id) && t.mediaType === 'video')
    if (videoTexts.length === 0) {
      setError(t('corpus.noVideosSelected', ''))
      return
    }
    
    setClipReAnnotateDialogOpen(true)
  }
  
  // Execute CLIP re-annotation with selected frame interval (sequential processing - one at a time)
  const handleClipReAnnotateConfirm = async () => {
    setClipReAnnotateDialogOpen(false)
    
    const videoTexts = texts.filter(t => selectedTextIds.has(t.id) && t.mediaType === 'video')
    if (videoTexts.length === 0) return
    
    setReAnnotating('clip')
    setSnackbarMessage(t('corpus.clipReAnnotateStarted', 'CLIP annotation started...'))
    setSnackbarOpen(true)
    
    let successCount = 0
    let failedCount = 0
    
    // Process videos sequentially (one at a time)
    for (let i = 0; i < videoTexts.length; i++) {
      const text = videoTexts[i]
      
      try {
        // Start the task for this video
        const response = await corpusApi.reAnnotateClip(corpus.id, text.id, clipLabels, clipFrameInterval)
        
        if (response.success && response.task_id) {
          // Add task to store to show progress bar
          setTask(text.id, {
            taskId: response.task_id,
            corpusId: corpus.id,
            textId: text.id,
            progress: 0,
            stage: 'clip',
            message: t('corpus.clipStarting', 'Starting CLIP annotation...'),
            status: 'pending'
          })
          
          // Wait for this task to complete before starting the next
          const success = await pollTaskUntilComplete(response.task_id, text.id, 'clip')
          if (success) {
            successCount++
          } else {
            failedCount++
          }
        } else {
          failedCount++
        }
      } catch (err) {
        console.error('CLIP re-annotation failed:', err)
        failedCount++
      }
    }
    
    // All tasks completed
    setReAnnotating(null)
    setSelectedTextIds(new Set())
    loadTexts()
    
    if (successCount > 0) {
      setSnackbarMessage(t('corpus.clipReAnnotateSuccess', 'CLIP annotation completed for {{count}} videos', { count: successCount }))
      setSnackbarOpen(true)
    }
    if (failedCount > 0) {
      setError(`${failedCount} ${t('corpus.clipReAnnotateFailed', 'CLIP annotation failed')}`)
    }
  }

  // Handle USAS re-annotation for selected texts (sequential processing - one at a time)
  const handleUsasReAnnotate = async () => {
    if (selectedTextIds.size === 0) return
    
    const selectedTexts = texts.filter(t => selectedTextIds.has(t.id))
    if (selectedTexts.length === 0) return
    
    setReAnnotating('usas')
    setSnackbarMessage(t('corpus.usasReAnnotateStarted', 'USAS annotation started for {{count}} texts...', { count: selectedTexts.length }))
    setSnackbarOpen(true)
    
    let successCount = 0
    let failedCount = 0
    
    // Process texts sequentially (one at a time)
    for (let i = 0; i < selectedTexts.length; i++) {
      const text = selectedTexts[i]
      
      try {
        // Start the task for this text
        const response = await corpusApi.reAnnotateUsas(corpus.id, text.id)
        
        if (response.success && response.task_id) {
          // Add task to store to show progress bar
          setTask(text.id, {
            taskId: response.task_id,
            corpusId: corpus.id,
            textId: text.id,
            progress: 0,
            stage: 'usas',
            message: t('corpus.usasStarting', 'Starting USAS annotation...'),
            status: 'pending'
          })
          
          // Wait for this task to complete before starting the next
          const success = await pollTaskUntilComplete(response.task_id, text.id, 'usas')
          if (success) {
            successCount++
          } else {
            failedCount++
          }
        } else {
          failedCount++
        }
      } catch (err) {
        console.error('USAS re-annotation failed:', err)
        failedCount++
      }
    }
    
    // All tasks completed
    setReAnnotating(null)
    setSelectedTextIds(new Set())
    loadTexts()
    
    if (successCount > 0) {
      setSnackbarMessage(t('corpus.usasReAnnotateSuccess', 'USAS annotation completed for {{count}} texts', { count: successCount }))
      setSnackbarOpen(true)
    }
    if (failedCount > 0) {
      setError(`${failedCount} ${t('corpus.usasReAnnotateFailed', 'USAS annotation failed')}`)
    }
  }

  // Handle MIPVU re-annotation for selected texts (sequential processing - one at a time)
  const handleMipvuReAnnotate = async () => {
    if (selectedTextIds.size === 0) return
    
    const selectedTexts = texts.filter(t => selectedTextIds.has(t.id))
    if (selectedTexts.length === 0) return
    
    setReAnnotating('mipvu')
    setSnackbarMessage(t('corpus.mipvuReAnnotateStarted', 'MIPVU annotation started for {{count}} texts...', { count: selectedTexts.length }))
    setSnackbarOpen(true)
    
    let successCount = 0
    let failedCount = 0
    
    // Process texts sequentially (one at a time)
    for (let i = 0; i < selectedTexts.length; i++) {
      const text = selectedTexts[i]
      
      try {
        // Start the task for this text
        const response = await corpusApi.reAnnotateMipvu(corpus.id, text.id)
        
        if (response.success && response.task_id) {
          // Add task to store to show progress bar
          setTask(text.id, {
            taskId: response.task_id,
            corpusId: corpus.id,
            textId: text.id,
            progress: 0,
            stage: 'mipvu',
            message: t('corpus.mipvuStarting', 'Starting MIPVU annotation...'),
            status: 'pending'
          })
          
          // Wait for this task to complete before starting the next
          const success = await pollTaskUntilComplete(response.task_id, text.id, 'mipvu')
          if (success) {
            successCount++
          } else {
            failedCount++
          }
        } else {
          failedCount++
        }
      } catch (err) {
        console.error('MIPVU re-annotation failed:', err)
        failedCount++
      }
    }
    
    // All tasks completed
    setReAnnotating(null)
    setSelectedTextIds(new Set())
    loadTexts()
    
    if (successCount > 0) {
      setSnackbarMessage(t('corpus.mipvuReAnnotateSuccess', 'MIPVU annotation completed for {{count}} texts', { count: successCount }))
      setSnackbarOpen(true)
    }
    if (failedCount > 0) {
      setError(`${failedCount} ${t('corpus.mipvuReAnnotateFailed', 'MIPVU annotation failed')}`)
    }
  }

  // Calculate if selection contains videos
  const selectedHasVideos = texts.some(t => selectedTextIds.has(t.id) && t.mediaType === 'video')
  
  // Handle select all
  const handleSelectAll = () => {
    if (selectedTextIds.size === filteredTexts.length) {
      setSelectedTextIds(new Set())
    } else {
      setSelectedTextIds(new Set(filteredTexts.map(t => t.id)))
    }
  }

  // Handle select single text
  const handleSelectText = (textId: string) => {
    const newSelected = new Set(selectedTextIds)
    if (newSelected.has(textId)) {
      newSelected.delete(textId)
    } else {
      newSelected.add(textId)
    }
    setSelectedTextIds(newSelected)
  }

  // Handle save edited content
  const handleSaveEdit = async (content: string | TranscriptSegmentEdit[]) => {
    if (!viewingText) return
    
    try {
      if (viewingText.mediaType === 'text') {
        // Save plain text content
        const response = await corpusApi.updateTextContent(corpus.id, viewingText.id, content as string)
        if (response.success) {
          setTextContent(content as string)
          setSnackbarMessage(t('corpus.edit.saveSuccess', ''))
          setSnackbarOpen(true)
          // Update word count in texts list
          setTexts(prev => prev.map(t => 
            t.id === viewingText.id 
              ? { ...t, wordCount: (content as string).split(/\s+/).length }
              : t
          ))
        } else {
          throw new Error(response.message)
        }
      } else {
        // Save transcript segments
        const segments = content as TranscriptSegmentEdit[]
        const response = await corpusApi.updateTranscriptSegments(
          corpus.id, 
          viewingText.id, 
          segments.map(seg => ({
            id: seg.id,
            start: seg.start,
            end: seg.end,
            text: seg.text
          }))
        )
        if (response.success) {
          // Update transcript data in state
          if (transcriptData) {
            setTranscriptData({
              ...transcriptData,
              segments: segments.map(seg => ({
                id: seg.id,
                start: seg.start,
                end: seg.end,
                text: seg.text
              })),
              totalWords: response.data?.total_words || transcriptData.totalWords
            })
          }
          // Show success message with re-annotation status
          let successMsg = t('corpus.edit.saveSuccess', '')
          if (response.data?.spacy_regenerated || response.data?.usas_regenerated || response.data?.mipvu_regenerated) {
            const parts = []
            if (response.data.spacy_regenerated) parts.push('SpaCy')
            if (response.data.usas_regenerated) parts.push('USAS')
            if (response.data.mipvu_regenerated) parts.push('MIPVU')
            successMsg += ` (${parts.join(', ')} ${t('corpus.edit.reannotated', 're-annotated')})`
          }
          setSnackbarMessage(successMsg)
          setSnackbarOpen(true)
          // Update word count in texts list
          if (response.data?.total_words) {
            setTexts(prev => prev.map(t => 
              t.id === viewingText.id 
                ? { ...t, wordCount: response.data!.total_words }
                : t
            ))
          }
        } else {
          throw new Error(response.message)
        }
      }
    } catch (err) {
      setError(t('corpus.edit.saveFailed', '') + ': ' + (err as Error).message)
      throw err
    }
  }

  // Get transcript segments for editing
  const getEditableSegments = useCallback((): TranscriptSegmentEdit[] => {
    if (!transcriptData?.segments) return []
    return transcriptData.segments.map(seg => ({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      originalText: seg.text
    }))
  }, [transcriptData])

  // Batch edit: Get selected text items (only text type files)
  const getSelectedTextItems = useCallback(() => {
    const selectedTextFiles = texts.filter(
      t => selectedTextIds.has(t.id) && t.mediaType === 'text'
    )
    return selectedTextFiles.map(t => ({
      id: t.id,
      filename: t.filename
    }))
  }, [texts, selectedTextIds])

  // Batch edit: Load content for a single text
  const loadTextContentForBatch = useCallback(async (textId: string): Promise<string> => {
    const response = await corpusApi.getText(corpus.id, textId)
    if (response.success && response.content) {
      return response.content
    }
    throw new Error(response.message || 'Failed to load content')
  }, [corpus.id])

  // Batch edit: Save content for a single text
  const saveTextContentForBatch = useCallback(async (textId: string, content: string): Promise<void> => {
    const response = await corpusApi.updateTextContent(corpus.id, textId, content)
    if (!response.success) {
      throw new Error(response.message || 'Failed to save content')
    }
    // Update word count in texts list
    setTexts(prev => prev.map(t => 
      t.id === textId 
        ? { ...t, wordCount: content.split(/\s+/).length }
        : t
    ))
  }, [corpus.id])

  // Batch edit: Handle all saves and annotations completed
  const handleBatchSaveComplete = useCallback(() => {
    // Annotation is now handled inside BatchTextEditDialog
    // Just reload texts to get updated info (no snackbar needed - green checkmark shown in dialog)
    loadTexts()
  }, [loadTexts])

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // Render transcript with timestamps
  const renderTranscript = () => {
    if (!transcriptData) return null
    
    return (
      <Box>
        {/* Transcript header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {transcriptData.totalSegments} segments, {transcriptData.totalWords} words
          </Typography>
          <Typography variant="subtitle2" color="text.secondary">
            Duration: {formatDuration(transcriptData.totalDuration)}
          </Typography>
        </Box>
        
        {/* Segments list */}
        <List sx={{ maxHeight: 400, overflow: 'auto' }}>
          {transcriptData.segments.map((segment, index) => (
            <ListItem
              key={segment.id}
              sx={{
                bgcolor: currentSegmentIndex === index ? 'action.selected' : 'transparent',
                borderRadius: 1,
                mb: 0.5,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' }
              }}
              onClick={() => setCurrentSegmentIndex(index)}
            >
              <Chip
                size="small"
                label={`${formatTimestamp(segment.start)} - ${formatTimestamp(segment.end)}`}
                sx={{ mr: 2, minWidth: 120 }}
              />
              <ListItemText primary={segment.text} />
            </ListItem>
          ))}
        </List>
      </Box>
    )
  }

  // Loading skeleton
  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="rectangular" height={56} sx={{ mb: 2 }} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Skeleton variant="rectangular" height={300} />
          </Grid>
          <Grid item xs={12} md={8}>
            <Skeleton variant="rectangular" height={400} />
          </Grid>
        </Grid>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={600}>
            {corpus.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('corpus.textsCount', '{{count}} 个文本', { count: texts.length })}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          {/* Re-annotation buttons - always visible, disabled when no selection */}
          <ButtonGroup variant="outlined" size="small">
            <Tooltip title={selectedTextIds.size === 0 ? t('corpus.selectTextsFirst', '请先选择文本') : t('corpus.spacyReAnnotate')}>
              <span>
                <Button
                  onClick={() => handleBatchSpacyAnnotate(true)}
                  disabled={selectedTextIds.size === 0 || spacyAnnotating || reAnnotating !== null}
                  startIcon={spacyAnnotating ? <CircularProgress size={16} /> : <SmartToyIcon />}
                >
                  SpaCy
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={selectedTextIds.size === 0 ? t('corpus.selectTextsFirst', '请先选择文本') : (!selectedHasVideos ? t('corpus.noVideosSelected', '请选择视频文件') : t('corpus.yoloReAnnotate', 'YOLO 重新标注'))}>
              <span>
                <Button
                  onClick={handleYoloReAnnotate}
                  disabled={selectedTextIds.size === 0 || !selectedHasVideos || reAnnotating !== null}
                  startIcon={reAnnotating === 'yolo' ? <CircularProgress size={16} /> : <VideoFileIcon />}
                >
                  YOLO
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={selectedTextIds.size === 0 ? t('corpus.selectTextsFirst', '请先选择文本') : (!selectedHasVideos ? t('corpus.noVideosSelected', '请选择视频文件') : t('corpus.clipReAnnotate', 'CLIP 重新标注'))}>
              <span>
                <Button
                  onClick={handleClipReAnnotateClick}
                  disabled={selectedTextIds.size === 0 || !selectedHasVideos || reAnnotating !== null}
                  startIcon={reAnnotating === 'clip' ? <CircularProgress size={16} /> : <ImageSearchIcon />}
                >
                  CLIP
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={selectedTextIds.size === 0 ? t('corpus.selectTextsFirst', '请先选择文本') : t('corpus.usasReAnnotate', 'USAS 语义域重新标注')}>
              <span>
                <Button
                  onClick={handleUsasReAnnotate}
                  disabled={selectedTextIds.size === 0 || reAnnotating !== null}
                  startIcon={reAnnotating === 'usas' ? <CircularProgress size={16} /> : <CategoryIcon />}
                >
                  USAS
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={
              corpus.language?.toLowerCase() !== 'english' && corpus.language?.toLowerCase() !== 'en'
                ? t('corpus.mipvuEnglishOnly', 'MIPVU 仅支持英语')
                : selectedTextIds.size === 0 
                  ? t('corpus.selectTextsFirst', '请先选择文本') 
                  : t('corpus.mipvuReAnnotate', 'MIPVU 隐喻重新标注')
            }>
              <span>
                <Button
                  onClick={handleMipvuReAnnotate}
                  disabled={
                    selectedTextIds.size === 0 || 
                    reAnnotating !== null ||
                    (corpus.language?.toLowerCase() !== 'english' && corpus.language?.toLowerCase() !== 'en')
                  }
                  startIcon={reAnnotating === 'mipvu' ? <CircularProgress size={16} /> : <AutoGraphIcon />}
                >
                  MIPVU
                </Button>
              </span>
            </Tooltip>
          </ButtonGroup>
          <Divider orientation="vertical" flexItem />
          {/* Batch edit button - only for text type files */}
          <Tooltip title={getSelectedTextItems().length === 0 ? t('corpus.selectTextFilesFirst', '请先选择文本文件') : t('corpus.batchEdit.button', '批量编辑')}>
            <span>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setBatchEditDialogOpen(true)}
                disabled={getSelectedTextItems().length === 0}
                startIcon={<EditIcon />}
              >
                {t('corpus.batchEdit.button', '批量编辑')}
              </Button>
            </span>
          </Tooltip>
          {selectedTextIds.size > 0 && (
            <Typography variant="caption" color="text.secondary">
              {t('corpus.selectedCount', '{{count}} 已选', { count: selectedTextIds.size })}
            </Typography>
          )}
          <IconButton onClick={loadTexts}>
            <RefreshIcon />
          </IconButton>
          {onUpload && (
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={onUpload}
            >
              {t('corpus.upload', '上传')}
            </Button>
          )}
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Metadata panel */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {t('corpus.metadata')}
            </Typography>
            <Stack spacing={2}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('corpus.language')}
                </Typography>
                <Typography>{translateLanguage(corpus.language)}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('corpus.author')}
                </Typography>
                <Typography>{corpus.author || '-'}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('corpus.source')}
                </Typography>
                <Typography>{corpus.source || '-'}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('corpus.textType')}
                </Typography>
                <Typography>{translateTextType(corpus.textType)}</Typography>
              </Box>
              {corpus.description && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body2">{corpus.description}</Typography>
                </Box>
              )}
              <Divider />
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('corpus.tags')}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {(corpus.tags || []).map(tag => (
                    <Chip key={tag} label={tag} size="small" />
                  ))}
                  {(corpus.tags || []).length === 0 && (
                    <Typography variant="body2" color="text.disabled">
                      No tags
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* Texts table */}
        <Grid item xs={12} md={9}>
          <Paper>
            {/* Filters */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                  size="small"
                  placeholder={t('corpus.searchTexts')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ flexGrow: 1 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    )
                  }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>{t('corpus.filterByType')}</InputLabel>
                  <Select
                    value={filterMediaType}
                    onChange={(e) => setFilterMediaType(e.target.value as MediaType | '')}
                    label={t('corpus.filterByType')}
                  >
                    <MenuItem value="">{t('corpus.allTypes')}</MenuItem>
                    <MenuItem value="text">{t('corpus.textType')}</MenuItem>
                    <MenuItem value="audio">{t('corpus.audioType')}</MenuItem>
                    <MenuItem value="video">{t('corpus.videoType')}</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Box>
            
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" width={40}>
                      <Checkbox
                        indeterminate={selectedTextIds.size > 0 && selectedTextIds.size < filteredTexts.length}
                        checked={filteredTexts.length > 0 && selectedTextIds.size === filteredTexts.length}
                        onChange={handleSelectAll}
                      />
                    </TableCell>
                    <TableCell width={50}>{t('corpus.type')}</TableCell>
                    <TableCell sortDirection={sortBy === 'filename' ? sortDirection : false}>
                      <TableSortLabel
                        active={sortBy === 'filename'}
                        direction={sortBy === 'filename' ? sortDirection : 'asc'}
                        onClick={() => handleSortClick('filename')}
                      >
                        {t('corpus.filename')}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell width={80} sortDirection={sortBy === 'wordCount' ? sortDirection : false}>
                      <TableSortLabel
                        active={sortBy === 'wordCount'}
                        direction={sortBy === 'wordCount' ? sortDirection : 'asc'}
                        onClick={() => handleSortClick('wordCount')}
                      >
                        {t('corpus.words')}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell width={80} sortDirection={sortBy === 'duration' ? sortDirection : false}>
                      <TableSortLabel
                        active={sortBy === 'duration'}
                        direction={sortBy === 'duration' ? sortDirection : 'asc'}
                        onClick={() => handleSortClick('duration')}
                      >
                        {t('corpus.duration')}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell width={100} sortDirection={sortBy === 'date' ? sortDirection : false}>
                      <TableSortLabel
                        active={sortBy === 'date'}
                        direction={sortBy === 'date' ? sortDirection : 'asc'}
                        onClick={() => handleSortClick('date')}
                      >
                        {t('corpus.date')}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell width={100} sortDirection={sortBy === 'author' ? sortDirection : false}>
                      <TableSortLabel
                        active={sortBy === 'author'}
                        direction={sortBy === 'author' ? sortDirection : 'asc'}
                        onClick={() => handleSortClick('author')}
                      >
                        {t('corpus.author')}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell width={100} sortDirection={sortBy === 'source' ? sortDirection : false}>
                      <TableSortLabel
                        active={sortBy === 'source'}
                        direction={sortBy === 'source' ? sortDirection : 'asc'}
                        onClick={() => handleSortClick('source')}
                      >
                        {t('corpus.source')}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell width={100} sortDirection={sortBy === 'textType' ? sortDirection : false}>
                      <TableSortLabel
                        active={sortBy === 'textType'}
                        direction={sortBy === 'textType' ? sortDirection : 'asc'}
                        onClick={() => handleSortClick('textType')}
                      >
                        {t('corpus.textType')}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>{t('corpus.tags')}</TableCell>
                    <TableCell align="right" width={150}>{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredTexts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          {texts.length === 0 ? t('corpus.noTexts') : t('corpus.noMatchingTexts')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTexts
                      .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                      .map((text) => {
                        const taskInfo = processingTasks.get(text.id)
                        const isProcessing = !!taskInfo
                        
                        return (
                        <TableRow 
                          key={text.id} 
                          hover 
                          sx={{ 
                            cursor: 'pointer',
                            bgcolor: isProcessing ? 'action.hover' : selectedTextIds.has(text.id) ? 'action.selected' : 'inherit'
                          }}
                          onClick={() => handleViewText(text)}
                        >
                          <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedTextIds.has(text.id)}
                              onChange={() => handleSelectText(text.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Tooltip title={text.mediaType}>
                              {isProcessing ? (
                                <CircularProgress size={24} />
                              ) : (
                                getMediaIcon(text.mediaType)
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                              {text.filename}
                            </Typography>
                            {isProcessing ? (
                              <Box sx={{ mt: 0.5 }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Chip 
                                    label={taskInfo.stage} 
                                    size="small" 
                                    color="warning" 
                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                  />
                                  <Typography variant="caption" color="warning.main">
                                    {taskInfo.progress}%
                                  </Typography>
                                </Stack>
                                <LinearProgress 
                                  variant="determinate" 
                                  value={taskInfo.progress} 
                                  sx={{ mt: 0.5, height: 4, borderRadius: 1 }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                  {taskInfo.message}
                                </Typography>
                              </Box>
                            ) : (
                              <Stack direction="row" spacing={0.5}>
                                {text.hasTimestamps && (
                                  <Chip label={t('corpus.transcribed', '已转录')} size="small" color="success" />
                                )}
                                {text.yoloAnnotationPath && (
                                  <Chip label="YOLO" size="small" color="info" />
                                )}
                                {text.clipAnnotationPath && (
                                  <Chip label="CLIP" size="small" color="secondary" />
                                )}
                              </Stack>
                            )}
                          </TableCell>
                          <TableCell>
                            {isProcessing ? (
                              <Typography variant="caption" color="text.secondary">...</Typography>
                            ) : (
                              text.wordCount || '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {isProcessing ? (
                              <Typography variant="caption" color="text.secondary">...</Typography>
                            ) : (
                              formatDuration(text.duration)
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" noWrap>
                              {text.metadata?.date || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" noWrap sx={{ maxWidth: 80, display: 'block' }}>
                              {text.metadata?.author || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" noWrap sx={{ maxWidth: 80, display: 'block' }}>
                              {text.metadata?.source || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" noWrap sx={{ maxWidth: 80, display: 'block' }}>
                              {translateTextType(text.metadata?.customFields?.textType)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
                              {(text.tags || []).slice(0, 2).map(tag => (
                                <Chip
                                  key={tag}
                                  label={tag}
                                  size="small"
                                  onDelete={(e) => {
                                    e.stopPropagation()
                                    handleRemoveTag(text, tag)
                                  }}
                                />
                              ))}
                              {(text.tags || []).length > 2 && (
                                <Chip label={`+${(text.tags || []).length - 2}`} size="small" variant="outlined" />
                              )}
                              <IconButton
                                size="small"
                                onClick={(e) => handleOpenAddTag(text, e)}
                              >
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title={t('corpus.editMetadata')}>
                              <IconButton
                                size="small"
                                onClick={(e) => handleOpenMetadataEditor(text, e)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('common.view')}>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewText(text)
                                }}
                              >
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('common.delete')}>
                              <IconButton 
                                size="small" 
                                color="error"
                                onClick={(e) => handleOpenDelete(text, e)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                        )
                      })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={filteredTexts.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10))
                setPage(0)
              }}
            />
          </Paper>
        </Grid>
      </Grid>

      {/* Add tag dialog */}
      <Dialog open={addTagDialogOpen} onClose={() => setAddTagDialogOpen(false)}>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LocalOfferIcon />
            <span>{t('corpus.addTag')}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Tag"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddTagDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleAddTag} variant="contained">
            {t('common.add')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('common.confirm')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('corpus.deleteTextConfirm', { filename: selectedText?.filename })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleDeleteText} 
            color="error" 
            variant="contained"
            disabled={deleting}
            startIcon={deleting && <CircularProgress size={16} />}
          >
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Text viewer dialog */}
      <Dialog
        open={!!viewingText}
        onClose={() => setViewingText(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            {viewingText && getMediaIcon(viewingText.mediaType)}
            <span>{viewingText?.filename}</span>
            {viewingText && (viewingText.wordCount || viewingText.duration) && (
              <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
                {viewingText.wordCount && (
                  <Chip label={`${viewingText.wordCount} words`} size="small" />
                )}
                {viewingText.duration && (
                  <Chip label={formatDuration(viewingText.duration)} size="small" color="primary" />
                )}
              </Box>
            )}
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {loadingContent ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              {/* Video Player */}
              {viewingText?.mediaType === 'video' && viewingText?.contentPath && (
                <Box sx={{ mb: 2 }}>
                  <video
                    ref={videoRef}
                    controls
                    style={{ width: '100%', maxHeight: 400, borderRadius: 8 }}
                    src={`${API_BASE_URL}/api/corpus/${corpus.id}/texts/${viewingText.id}/media`}
                  >
                    Your browser does not support the video element.
                  </video>
                </Box>
              )}
              
              {/* Audio Player */}
              {viewingText?.mediaType === 'audio' && viewingText?.contentPath && (
                <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <AudioFileIcon sx={{ fontSize: 48, color: 'primary.main' }} />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" gutterBottom>
                        {viewingText.filename}
                      </Typography>
                      <audio
                        ref={audioRef}
                        controls
                        style={{ width: '100%' }}
                        src={`${API_BASE_URL}/api/corpus/${corpus.id}/texts/${viewingText.id}/media`}
                      >
                        Your browser does not support the audio element.
                      </audio>
                    </Box>
                  </Stack>
                </Box>
              )}
              
              {/* Tab for transcript vs plain text - only for audio/video */}
              {(viewingText?.mediaType === 'audio' || viewingText?.mediaType === 'video') && transcriptData && (
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                  <Typography variant="subtitle2" color="primary" sx={{ pb: 1 }}>
                    Transcript
                  </Typography>
                </Box>
              )}
              
              {/* Transcript view */}
              {transcriptData && renderTranscript()}
              
              {/* Plain text view - for text files or as fallback */}
              {textContent && viewingText?.mediaType === 'text' && (
                <Paper
                  sx={{
                    p: 2,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                    maxHeight: 400,
                    overflow: 'auto'
                  }}
                >
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem'
                    }}
                  >
                    {textContent}
                  </Typography>
                </Paper>
              )}
              
              {/* No content message */}
              {!textContent && !transcriptData && viewingText?.mediaType === 'text' && (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  No text content available
                </Typography>
              )}
              
              {/* Processing message for audio/video without transcript */}
              {!transcriptData && (viewingText?.mediaType === 'audio' || viewingText?.mediaType === 'video') && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  {t('corpus.transcriptNotAvailable')}
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => setEditDialogOpen(true)}
            disabled={loadingContent}
          >
            {t('common.edit')}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={() => setViewingText(null)}>
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Text Edit Dialog */}
      <TextEditDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title={t('corpus.edit.title', '') + ' - ' + (viewingText?.filename || '')}
        textContent={textContent || ''}
        transcriptSegments={getEditableSegments()}
        isTranscript={viewingText?.mediaType === 'audio' || viewingText?.mediaType === 'video'}
        onSave={handleSaveEdit}
      />

      {/* Batch Text Edit Dialog */}
      <BatchTextEditDialog
        open={batchEditDialogOpen}
        onClose={() => setBatchEditDialogOpen(false)}
        corpusId={corpus.id}
        selectedTexts={getSelectedTextItems()}
        onLoadContent={loadTextContentForBatch}
        onSaveContent={saveTextContentForBatch}
        onAllSaved={handleBatchSaveComplete}
        title={t('corpus.batchEdit.title', '')}
      />

      {/* Snackbar for save feedback */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* CLIP Re-annotation Dialog with Label Selection */}
      <Dialog 
        open={clipReAnnotateDialogOpen} 
        onClose={() => setClipReAnnotateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('corpus.clipReAnnotateTitle', 'CLIP 重新标注设置')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('corpus.clipReAnnotateDesc', '选择分类标签并设置帧间隔。CLIP 将对视频帧进行语义分类。')}
          </Typography>
          
          {/* Label Selection */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('corpus.clipLabels', '选择分类标签')}
          </Typography>
          
          {/* Preset label groups */}
          {Object.entries(CLIP_PRESET_LABELS).map(([group, labels]) => (
            <Box key={group} sx={{ mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                {t(`corpus.clipGroup.${group}`, group)}
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                {labels.map(label => (
                  <Chip
                    key={label}
                    label={label}
                    size="small"
                    variant={clipLabels.includes(label) ? 'filled' : 'outlined'}
                    color={clipLabels.includes(label) ? 'primary' : 'default'}
                    onClick={() => {
                      if (clipLabels.includes(label)) {
                        setClipLabels(clipLabels.filter(l => l !== label))
                      } else {
                        setClipLabels([...clipLabels, label])
                      }
                    }}
                    sx={{ fontSize: '0.75rem' }}
                  />
                ))}
              </Stack>
            </Box>
          ))}
          
          {/* Custom labels */}
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {t('corpus.customClipLabels', '自定义标签')}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <TextField
                size="small"
                value={customClipLabel}
                onChange={(e) => setCustomClipLabel(e.target.value)}
                placeholder={t('corpus.addCustomLabel', '添加自定义标签')}
                sx={{ flexGrow: 1 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customClipLabel.trim()) {
                    if (!clipLabels.includes(customClipLabel.trim())) {
                      setClipLabels([...clipLabels, customClipLabel.trim()])
                    }
                    setCustomClipLabel('')
                  }
                }}
              />
              <IconButton 
                size="small" 
                onClick={() => {
                  if (customClipLabel.trim() && !clipLabels.includes(customClipLabel.trim())) {
                    setClipLabels([...clipLabels, customClipLabel.trim()])
                  }
                  setCustomClipLabel('')
                }}
              >
                <AddIcon />
              </IconButton>
            </Stack>
            
            {/* Show custom labels (not in presets) */}
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {clipLabels.filter(l => !Object.values(CLIP_PRESET_LABELS).flat().includes(l)).map(label => (
                <Chip
                  key={label}
                  label={label}
                  size="small"
                  onDelete={() => setClipLabels(clipLabels.filter(l => l !== label))}
                  sx={{ fontSize: '0.75rem' }}
                />
              ))}
            </Stack>
          </Box>
          
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {t('corpus.clipLabelsSelected', '已选择 {{count}} 个标签', { count: clipLabels.length })}
          </Typography>
          
          <Divider sx={{ my: 2 }} />
          
          {/* Frame Interval */}
          <NumberInput
            fullWidth
            label={t('corpus.frameInterval', '帧间隔')}
            value={clipFrameInterval}
            onChange={(val) => setClipFrameInterval(val)}
            min={1}
            max={300}
            integer
            defaultValue={30}
            helperText={t('corpus.frameIntervalHelper', '默认 30 帧，设为 1 则逐帧标注')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClipReAnnotateDialogOpen(false)}>
            {t('common.cancel', '取消')}
          </Button>
          <Button 
            variant="contained" 
            onClick={handleClipReAnnotateConfirm}
            startIcon={<ImageSearchIcon />}
            disabled={clipLabels.length === 0}
          >
            {t('corpus.startClipAnnotation', '开始标注')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Text Metadata Editor */}
      {editingTextForMetadata && (
        <TextMetadataEditor
          open={metadataEditorOpen}
          onClose={() => {
            setMetadataEditorOpen(false)
            setEditingTextForMetadata(null)
          }}
          corpusId={corpus.id}
          text={editingTextForMetadata}
          onSaved={handleMetadataSaved}
        />
      )}
    </Box>
  )
}

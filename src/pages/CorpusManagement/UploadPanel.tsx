import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  Chip,
  Stack,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Divider,
  Alert,
  Grid,
  Autocomplete,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Collapse
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import TextSnippetIcon from '@mui/icons-material/TextSnippet'
import AudioFileIcon from '@mui/icons-material/AudioFile'
import VideoFileIcon from '@mui/icons-material/VideoFile'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import dayjs, { Dayjs } from 'dayjs'
import { corpusApi } from '../../api'
import apiClient from '../../api/client'
import NumberInput from '../../components/common/NumberInput'
import type { 
  MediaType, 
  Corpus, 
  CorpusCreate, 
  UploadResult,
  ServicesStatus
} from '../../types'

// Processing stages for display
const PROCESSING_STAGES = [
  { key: 'initializing', label: 'Initializing' },
  { key: 'extract_audio', label: 'Extracting Audio' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'spacy', label: 'SpaCy Annotation' },
  { key: 'yolo', label: 'YOLO Detection' },
  { key: 'clip', label: 'CLIP Classification' },
  { key: 'database', label: 'Saving' },
  { key: 'completed', label: 'Completed' }
]

// CLIP preset label categories
const CLIP_PRESET_LABELS = {
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

const getStageIndex = (stage: string): number => {
  const index = PROCESSING_STAGES.findIndex(s => s.key === stage)
  return index >= 0 ? index : 0
}

const getStageName = (stage: string): string => {
  const found = PROCESSING_STAGES.find(s => s.key === stage)
  return found ? found.label : stage
}

// Language options for corpus (only English and Chinese supported for USAS semantic tagging)
// Language codes for storage (English values)
const LANGUAGE_OPTIONS = [
  'english',
  'chinese'
]

// Text type config interface (from USAS settings)
interface TextTypeConfig {
  name: string
  name_zh: string
  priority_domains: string[]
  is_custom?: boolean
}

// Predefined source options (English values for storage)
const SOURCE_OPTIONS = [
  'Web Crawl',
  'Manual Input',
  'File Upload',
  'Database Export',
  'API Collection',
  'Archive',
  'Library',
  'Research Dataset',
  'Social Media Platform',
  'News Agency',
  'Custom'
]

// Mapping from English value to translation key
const SOURCE_TRANSLATION_KEYS: Record<string, string> = {
  'Web Crawl': 'corpus.sources.webCrawl',
  'Manual Input': 'corpus.sources.manualInput',
  'File Upload': 'corpus.sources.fileUpload',
  'Database Export': 'corpus.sources.databaseExport',
  'API Collection': 'corpus.sources.apiCollection',
  'Archive': 'corpus.sources.archive',
  'Library': 'corpus.sources.library',
  'Research Dataset': 'corpus.sources.researchDataset',
  'Social Media Platform': 'corpus.sources.socialMediaPlatform',
  'News Agency': 'corpus.sources.newsAgency',
  'Custom': 'corpus.sources.custom'
}

interface UploadFile {
  file: File
  type: MediaType
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  message?: string
  taskId?: string
  stage?: string
  result?: {
    word_count?: number
    duration?: number
    segments?: number
    yolo_tracks?: number
    clip_frames?: number
  }
  expanded?: boolean  // For showing detailed progress
}

interface UploadPanelProps {
  selectedCorpus?: Corpus | null
  onCorpusCreated?: (corpus: Corpus) => void
  onUploadComplete?: () => void
}

export default function UploadPanel({ 
  selectedCorpus, 
  onCorpusCreated,
  onUploadComplete 
}: UploadPanelProps) {
  const { t } = useTranslation()
  
  // Corpus metadata for new corpus
  const [createNew, setCreateNew] = useState(true)
  const [metadata, setMetadata] = useState<CorpusCreate>({
    name: '',
    language: 'english',
    author: '',
    source: '',
    textType: '',
    description: '',
    tags: []
  })
  
  // Text date metadata (applied to all uploaded files)
  const [textDate, setTextDate] = useState<Dayjs | null>(null)
  
  // Text type options from USAS settings
  const [textTypeConfigs, setTextTypeConfigs] = useState<Record<string, TextTypeConfig>>({})
  const [selectedTextType, setSelectedTextType] = useState('GEN')
  const [customTextType, setCustomTextType] = useState('')
  const [isCustomTextType, setIsCustomTextType] = useState(false)
  
  // Custom input states
  const [customSource, setCustomSource] = useState('')
  const [selectedSource, setSelectedSource] = useState('File Upload')
  
  // Form validation state - only show errors after user attempts to upload
  const [hasAttemptedUpload, setHasAttemptedUpload] = useState(false)
  
  // Existing corpora for selection
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [targetCorpusId, setTargetCorpusId] = useState<string>('')
  
  // File upload state
  const [files, setFiles] = useState<UploadFile[]>([])
  const [newTag, setNewTag] = useState('')
  const [transcribeAudio, setTranscribeAudio] = useState(true)
  const [yoloAnnotation, setYoloAnnotation] = useState(true)  // Default to true for video YOLO detection
  const [clipAnnotation, setClipAnnotation] = useState(false)  // Default to false for CLIP classification
  const [clipLabels, setClipLabels] = useState<string[]>(DEFAULT_CLIP_LABELS)
  const [clipFrameInterval, setClipFrameInterval] = useState(30)  // Default frame interval for CLIP
  const [customClipLabel, setCustomClipLabel] = useState('')
  const [transcriptLanguage, setTranscriptLanguage] = useState('english')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  
  // Service status
  const [servicesStatus, setServicesStatus] = useState<ServicesStatus | null>(null)
  
  // All available tags
  const [allTags, setAllTags] = useState<string[]>([])
  
  // SSE cleanup functions
  const sseCleanupRef = useRef<Map<string, () => void>>(new Map())
  
  // Cleanup SSE connections on unmount
  useEffect(() => {
    return () => {
      sseCleanupRef.current.forEach(cleanup => cleanup())
      sseCleanupRef.current.clear()
    }
  }, [])

  // Update metadata when text type or source changes
  useEffect(() => {
    const source = selectedSource === 'Custom' ? customSource : selectedSource
    const textType = isCustomTextType ? customTextType : selectedTextType
    setMetadata(prev => ({ ...prev, textType, source }))
  }, [selectedTextType, customTextType, isCustomTextType, selectedSource, customSource])

  // Load corpora and service status on mount
  useEffect(() => {
    loadCorpora()
    loadServicesStatus()
    loadTags()
    loadTextTypes()
  }, [])

  const loadTextTypes = async () => {
    try {
      const response = await apiClient.get('/api/usas/text-types')
      if (response.data.success && response.data.data?.text_types) {
        setTextTypeConfigs(response.data.data.text_types)
      }
    } catch (error) {
      console.error('Failed to load text types:', error)
    }
  }

  // Update target corpus when selectedCorpus changes
  useEffect(() => {
    if (selectedCorpus) {
      setTargetCorpusId(selectedCorpus.id)
      setCreateNew(false)
    }
  }, [selectedCorpus])

  const loadCorpora = async () => {
    try {
      const response = await corpusApi.listCorpora()
      if (response.success && response.data) {
        const data = Array.isArray(response.data) ? response.data : []
        setCorpora(data)
        if (data.length === 0) {
          setCreateNew(true)
        }
      } else {
        setCorpora([])
        setCreateNew(true)
      }
    } catch (error) {
      console.error('Failed to load corpora:', error)
      setCorpora([])
      setCreateNew(true)
    }
  }

  const loadServicesStatus = async () => {
    try {
      const response = await corpusApi.getServicesStatus()
      if (response.success && response.data) {
        setServicesStatus(response.data)
      }
    } catch (error) {
      console.error('Failed to load services status:', error)
    }
  }

  const loadTags = async () => {
    try {
      const response = await corpusApi.getAllTags()
      if (response.success && response.data) {
        setAllTags(Array.isArray(response.data) ? response.data : [])
      } else {
        setAllTags([])
      }
    } catch (error) {
      console.error('Failed to load tags:', error)
      setAllTags([])
    }
  }

  const getFileType = (file: File): MediaType => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const audioExts = ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac']
    const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'webm', 'wmv']
    
    if (audioExts.includes(ext) || file.type.startsWith('audio/')) return 'audio'
    if (videoExts.includes(ext) || file.type.startsWith('video/')) return 'video'
    return 'text'
  }

  const getFileIcon = (type: MediaType) => {
    switch (type) {
      case 'audio': return <AudioFileIcon color="primary" />
      case 'video': return <VideoFileIcon color="secondary" />
      default: return <TextSnippetIcon color="action" />
    }
  }

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'completed': return <CheckCircleIcon color="success" />
      case 'error': return <ErrorIcon color="error" />
      case 'processing': return <HourglassEmptyIcon color="warning" />
      default: return null
    }
  }

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles) return

    const newFiles: UploadFile[] = Array.from(selectedFiles).map(file => ({
      file,
      type: getFileType(file),
      progress: 0,
      status: 'pending'
    }))

    setFiles(prev => [...prev, ...newFiles])
    event.target.value = ''
  }, [])

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const droppedFiles = event.dataTransfer.files
    if (!droppedFiles) return

    const newFiles: UploadFile[] = Array.from(droppedFiles).map(file => ({
      file,
      type: getFileType(file),
      progress: 0,
      status: 'pending'
    }))

    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddTag = () => {
    if (newTag.trim() && !metadata.tags?.includes(newTag.trim())) {
      setMetadata(prev => ({
        ...prev,
        tags: [...(prev.tags || []), newTag.trim()]
      }))
      setNewTag('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setMetadata(prev => ({
      ...prev,
      tags: prev.tags?.filter(t => t !== tag) || []
    }))
  }

  const canUpload = () => {
    if (files.length === 0) return false
    if (isUploading) return false
    // Date is required for all uploads
    if (!textDate) return false
    if (createNew) {
      return metadata.name.trim().length > 0
    } else {
      return targetCorpusId.length > 0
    }
  }

  const handleUpload = async () => {
    setHasAttemptedUpload(true)
    if (!canUpload()) return
    
    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      let corpusId = targetCorpusId

      if (createNew) {
        const createResponse = await corpusApi.createCorpus(metadata)
        if (!createResponse.success || !createResponse.data) {
          setUploadError(createResponse.message || 'Failed to create corpus')
          setIsUploading(false)
          return
        }

        corpusId = createResponse.data.id
        onCorpusCreated?.(createResponse.data)
        await loadCorpora()
      }

      if (!corpusId) {
        setUploadError('Please select or create a corpus')
        setIsUploading(false)
        return
      }

      const fileList = files.map(f => f.file)
      
      // Get corpus metadata for uploaded files
      // Text type always uses the selected value (for USAS disambiguation)
      const dateString = textDate ? textDate.format('YYYY-MM-DD') : undefined
      const effectiveTextType = isCustomTextType ? customTextType : selectedTextType
      let fileMetadata: { date?: string; author?: string; source?: string; customFields?: Record<string, string> } = {
        date: dateString,
        customFields: { textType: effectiveTextType }
      }
      
      if (createNew) {
        fileMetadata = {
          ...fileMetadata,
          author: metadata.author || undefined,
          source: metadata.source || undefined
        }
      } else {
        // Get metadata from selected corpus
        const existingCorpus = corpora.find(c => c.id === targetCorpusId)
        if (existingCorpus) {
          fileMetadata = {
            ...fileMetadata,
            author: existingCorpus.author || undefined,
            source: existingCorpus.source || undefined
          }
        }
      }
      
      const config = {
        transcribe: transcribeAudio,
        yolo_annotation: yoloAnnotation,
        clip_annotation: clipAnnotation,
        clip_labels: clipAnnotation ? clipLabels : [],
        clip_frame_interval: clipAnnotation ? clipFrameInterval : 30,
        language: transcriptLanguage,
        tags: metadata.tags || [],
        metadata: fileMetadata
      }

      setFiles(prev => prev.map(f => ({ ...f, status: 'uploading' as const })))

      const response = await corpusApi.uploadFiles(corpusId, fileList, config)

      if (response.success && response.data) {
        const results = Array.isArray(response.data) ? response.data : []
        setFiles(prev => prev.map((f, index) => {
          const result = results[index]
          if (!result) return { ...f, status: 'completed' as const }
          
          // Handle both camelCase and snake_case from backend
          const taskId = result.taskId || result.task_id
          
          const newFile = {
            ...f,
            status: result.success ? 
              (taskId ? 'processing' : 'completed') : 
              'error',
            message: result.message,
            taskId: taskId,
            progress: taskId ? 0 : 100,
            stage: taskId ? 'initializing' : 'completed',
            expanded: !!taskId  // Auto-expand processing files
          }
          
          return newFile
        }))

        // Subscribe to SSE for processing tasks
        const processingTasks = results.filter(r => r.taskId || r.task_id)
        console.log('[Upload] Processing tasks:', processingTasks.map(t => t.taskId || t.task_id))
        processingTasks.forEach(task => {
          const taskId = task.taskId || task.task_id
          if (taskId) {
            console.log('[Upload] Subscribing to task:', taskId)
            subscribeToTaskProgress(taskId)
          }
        })

        const completedCount = results.filter(r => r.success && !(r.taskId || r.task_id)).length
        const processingCount = processingTasks.length
        
        if (processingCount > 0) {
          setUploadSuccess(`${completedCount} file(s) uploaded, ${processingCount} file(s) processing in background...`)
          // Switch to detail view to show processing progress
          onUploadComplete?.()
        } else {
          setUploadSuccess(`Successfully uploaded ${completedCount} file(s)`)
          onUploadComplete?.()
        }
      } else {
        setUploadError(response.message || 'Upload failed')
        setFiles(prev => prev.map(f => ({ ...f, status: 'error' as const })))
      }
    } catch (error) {
      console.error('Upload error:', error)
      setUploadError('Upload failed: ' + (error as Error).message)
      setFiles(prev => prev.map(f => ({ ...f, status: 'error' as const })))
    }

    setIsUploading(false)
  }

  // Poll task progress (more reliable than SSE)
  const pollTaskProgress = useCallback((taskId: string) => {
    // Don't poll twice
    if (sseCleanupRef.current.has(taskId)) return
    
    let isActive = true
    
    const poll = async () => {
      if (!isActive) return
      
      try {
        const response = await corpusApi.getTaskStatus(taskId)
        if (response.success && response.data) {
          const task = response.data
          
          setFiles(prev => prev.map(f => {
            if (f.taskId !== taskId) return f
            
            // Parse stage from message (format: "stage: message")
            const messageParts = (task.message || '').split(': ')
            const stage = messageParts.length > 1 ? messageParts[0] : 'processing'
            const message = messageParts.length > 1 ? messageParts.slice(1).join(': ') : task.message
            
              if (task.status === 'completed') {
              // Build completion message with result info
              let completionMsg = message || 'Processing complete'
              if (task.result) {
                const parts = []
                if (task.result.word_count) parts.push(`${task.result.word_count} words`)
                if (task.result.duration) parts.push(`${Math.round(task.result.duration)}s`)
                if (task.result.segments) parts.push(`${task.result.segments} segments`)
                if (task.result.yolo_tracks) parts.push(`${task.result.yolo_tracks} tracks`)
                if (task.result.clip_frames) parts.push(`${task.result.clip_frames} frames`)
                if (parts.length > 0) {
                  completionMsg = `Completed: ${parts.join(', ')}`
                }
              }
              return { 
                ...f, 
                status: 'completed' as const, 
                message: completionMsg, 
                progress: 100,
                stage: 'completed',
                result: task.result
              }
            } else if (task.status === 'failed') {
              return { 
                ...f, 
                status: 'error' as const, 
                message: task.error || task.message || 'Processing failed',
                stage: 'error'
              }
            } else {
              // Still processing
              return { 
                ...f, 
                message: message || 'Processing...', 
                progress: task.progress || 0,
                stage: stage,
                status: 'processing' as const
              }
            }
          }))
          
          // Continue polling if not finished
          if (task.status !== 'completed' && task.status !== 'failed') {
            setTimeout(poll, 1500) // Poll every 1.5 seconds
          } else {
            // Cleanup and notify
            isActive = false
            sseCleanupRef.current.delete(taskId)
            if (task.status === 'completed') {
              onUploadComplete?.()
            }
          }
        }
      } catch (error) {
        console.error('Failed to check task status:', error)
        // Retry on error
        if (isActive) {
          setTimeout(poll, 3000)
        }
      }
    }
    
    // Start polling
    poll()
    
    // Store cleanup function
    sseCleanupRef.current.set(taskId, () => {
      isActive = false
    })
  }, [onUploadComplete])
  
  // Alias for compatibility
  const subscribeToTaskProgress = pollTaskProgress
  
  // Toggle file expanded state
  const toggleFileExpanded = (index: number) => {
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, expanded: !f.expanded } : f
    ))
  }

  const hasAudioVideo = files.some(f => f.type === 'audio' || f.type === 'video')
  const hasVideo = files.some(f => f.type === 'video')

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        {t('corpus.upload')}
      </Typography>

      {uploadError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUploadError(null)}>
          {uploadError}
        </Alert>
      )}

      {uploadSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setUploadSuccess(null)}>
          {uploadSuccess}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left column - Corpus selection and metadata */}
        <Grid item xs={12} md={6}>
          {/* Corpus selection */}
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {t('corpus.targetCorpus')}
            </Typography>
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={createNew}
                  onChange={(e) => setCreateNew(e.target.checked)}
                />
              }
              label={t('corpus.createNewCorpus')}
            />

            {!createNew && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('corpus.selectCorpus')}</InputLabel>
                  <Select
                    value={targetCorpusId}
                    onChange={(e) => setTargetCorpusId(e.target.value)}
                    label={t('corpus.selectCorpus')}
                  >
                    {corpora.length === 0 ? (
                      <MenuItem disabled value="">
                        {t('corpus.noCorpus')}
                      </MenuItem>
                    ) : (
                      corpora.map(corpus => (
                        <MenuItem key={corpus.id} value={corpus.id}>
                          {corpus.name} ({corpus.textCount || 0} {t('corpus.textsCount')})
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>

                {/* Text Type - from USAS settings */}
                <FormControl fullWidth size="small">
                  <InputLabel>{t('corpus.textType')}</InputLabel>
                  <Select
                    value={isCustomTextType ? '__CUSTOM__' : selectedTextType}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value === '__CUSTOM__') {
                        setIsCustomTextType(true)
                      } else {
                        setIsCustomTextType(false)
                        setSelectedTextType(value)
                      }
                    }}
                    label={t('corpus.textType')}
                  >
                    {Object.entries(textTypeConfigs)
                      .sort(([a], [b]) => {
                        if (a === 'GEN') return -1
                        if (b === 'GEN') return 1
                        return a.localeCompare(b)
                      })
                      .map(([code, config]) => (
                        <MenuItem key={code} value={code}>
                          {i18n.language === 'zh' ? (config.name_zh || config.name) : config.name}
                        </MenuItem>
                      ))}
                    <Divider />
                    <MenuItem value="__CUSTOM__">
                      {t('corpus.textTypes.custom')}
                    </MenuItem>
                  </Select>
                </FormControl>
                {isCustomTextType && (
                  <TextField
                    label={t('corpus.customTextType')}
                    value={customTextType}
                    onChange={(e) => setCustomTextType(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder={t('corpus.customTextTypePlaceholder')}
                  />
                )}
                {!isCustomTextType && selectedTextType && textTypeConfigs[selectedTextType]?.priority_domains?.length > 0 && (
                  <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('corpus.linkedDomains')}
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                      {textTypeConfigs[selectedTextType].priority_domains.slice(0, 6).map(domain => (
                        <Chip key={domain} label={domain} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      ))}
                      {textTypeConfigs[selectedTextType].priority_domains.length > 6 && (
                        <Chip label={`+${textTypeConfigs[selectedTextType].priority_domains.length - 6}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                    </Stack>
                  </Box>
                )}
                
                {/* Date field for uploaded files - Required */}
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  <DatePicker
                    label={t('corpus.date')}
                    value={textDate}
                    onChange={(newValue) => setTextDate(newValue)}
                    format="YYYY-MM-DD"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        size: 'small',
                        required: true,
                        error: hasAttemptedUpload && !textDate,
                        helperText: hasAttemptedUpload && !textDate 
                          ? t('corpus.dateRequired', '请选择日期') 
                          : t('corpus.dateHelp')
                      }
                    }}
                  />
                </LocalizationProvider>
              </Stack>
            )}
          </Paper>

          {/* Metadata for new corpus */}
          {createNew && (
            <Paper sx={{ p: 3, mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                {t('corpus.metadata')}
              </Typography>

              <Stack spacing={2}>
                <TextField
                  label={t('corpus.name')}
                  value={metadata.name}
                  onChange={(e) => setMetadata(prev => ({ ...prev, name: e.target.value }))}
                  required
                  fullWidth
                  size="small"
                  error={hasAttemptedUpload && metadata.name.length === 0}
                  helperText={hasAttemptedUpload && metadata.name.length === 0 ? t('corpus.nameRequired', '请输入语料库名称') : ''}
                />

                {/* Language Selection - NLTK based */}
                <FormControl fullWidth size="small">
                  <InputLabel>{t('corpus.language')}</InputLabel>
                  <Select
                    value={metadata.language}
                    onChange={(e) => setMetadata(prev => ({ ...prev, language: e.target.value }))}
                    label={t('corpus.language')}
                  >
                    {LANGUAGE_OPTIONS.map(langCode => {
                      const translationKey = `corpus.languages.${langCode}`
                      const translatedName = t(translationKey, langCode)
                      return (
                        <MenuItem key={langCode} value={langCode}>
                          {translatedName}
                        </MenuItem>
                      )
                    })}
                  </Select>
                </FormControl>

                {/* Text Type - from USAS settings */}
                <FormControl fullWidth size="small">
                  <InputLabel>{t('corpus.textType')}</InputLabel>
                  <Select
                    value={isCustomTextType ? '__CUSTOM__' : selectedTextType}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value === '__CUSTOM__') {
                        setIsCustomTextType(true)
                      } else {
                        setIsCustomTextType(false)
                        setSelectedTextType(value)
                      }
                    }}
                    label={t('corpus.textType')}
                  >
                    {Object.entries(textTypeConfigs)
                      .sort(([a], [b]) => {
                        if (a === 'GEN') return -1
                        if (b === 'GEN') return 1
                        return a.localeCompare(b)
                      })
                      .map(([code, config]) => (
                        <MenuItem key={code} value={code}>
                          {i18n.language === 'zh' ? (config.name_zh || config.name) : config.name}
                        </MenuItem>
                      ))}
                    <Divider />
                    <MenuItem value="__CUSTOM__">
                      {t('corpus.textTypes.custom')}
                    </MenuItem>
                  </Select>
                </FormControl>
                {isCustomTextType && (
                  <TextField
                    label={t('corpus.customTextType')}
                    value={customTextType}
                    onChange={(e) => setCustomTextType(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder={t('corpus.customTextTypePlaceholder')}
                  />
                )}
                {!isCustomTextType && selectedTextType && textTypeConfigs[selectedTextType]?.priority_domains?.length > 0 && (
                  <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('corpus.linkedDomains')}
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                      {textTypeConfigs[selectedTextType].priority_domains.slice(0, 6).map(domain => (
                        <Chip key={domain} label={domain} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      ))}
                      {textTypeConfigs[selectedTextType].priority_domains.length > 6 && (
                        <Chip label={`+${textTypeConfigs[selectedTextType].priority_domains.length - 6}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                    </Stack>
                  </Box>
                )}

                {/* Source - with presets and custom */}
                <FormControl fullWidth size="small">
                  <InputLabel>{t('corpus.source')}</InputLabel>
                  <Select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    label={t('corpus.source')}
                  >
                    {SOURCE_OPTIONS.map(src => {
                      const translationKey = SOURCE_TRANSLATION_KEYS[src] || src
                      return (
                        <MenuItem key={src} value={src}>
                          {t(translationKey, src)}
                        </MenuItem>
                      )
                    })}
                  </Select>
                </FormControl>
                {selectedSource === 'Custom' && (
                  <TextField
                    label={t('corpus.customSource')}
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder={t('corpus.customSourcePlaceholder', 'e.g., University Archive, Company Database')}
                  />
                )}

                <TextField
                  label={t('corpus.author')}
                  value={metadata.author}
                  onChange={(e) => setMetadata(prev => ({ ...prev, author: e.target.value }))}
                  fullWidth
                  size="small"
                />

                {/* Date - applied to all uploaded texts - Required */}
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  <DatePicker
                    label={t('corpus.date')}
                    value={textDate}
                    onChange={(newValue) => setTextDate(newValue)}
                    format="YYYY-MM-DD"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        size: 'small',
                        required: true,
                        error: hasAttemptedUpload && !textDate,
                        helperText: hasAttemptedUpload && !textDate 
                          ? t('corpus.dateRequired', '请选择日期') 
                          : t('corpus.dateHelp')
                      }
                    }}
                  />
                </LocalizationProvider>

                <TextField
                  label={t('corpus.descriptionField')}
                  value={metadata.description}
                  onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
                  fullWidth
                  size="small"
                  multiline
                  rows={2}
                />

                {/* Tags */}
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {t('corpus.tags')}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                    {(metadata.tags || []).map(tag => (
                      <Chip
                        key={tag}
                        label={tag}
                        size="small"
                        onDelete={() => handleRemoveTag(tag)}
                      />
                    ))}
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Autocomplete
                      freeSolo
                      size="small"
                      options={allTags.filter(t => !(metadata.tags || []).includes(t))}
                      inputValue={newTag}
                      onInputChange={(_, value, reason) => {
                        // Only update if not being reset
                        if (reason !== 'reset') {
                          setNewTag(value)
                        }
                      }}
                      onChange={(_, value) => {
                        if (value && !(metadata.tags || []).includes(value)) {
                          setMetadata(prev => ({
                            ...prev,
                            tags: [...(prev.tags || []), value]
                          }))
                        }
                        // Always clear after selection
                        setTimeout(() => setNewTag(''), 0)
                      }}
                      clearOnBlur={false}
                      renderInput={(params) => (
                        <TextField 
                          {...params} 
                          placeholder={t('corpus.addTag')} 
                          sx={{ minWidth: 150 }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              e.stopPropagation()
                              const trimmedTag = newTag.trim()
                              if (trimmedTag && !(metadata.tags || []).includes(trimmedTag)) {
                                setMetadata(prev => ({
                                  ...prev,
                                  tags: [...(prev.tags || []), trimmedTag]
                                }))
                              }
                              // Clear after a small delay to override Autocomplete behavior
                              setTimeout(() => setNewTag(''), 0)
                            }
                          }}
                        />
                      )}
                      sx={{ flexGrow: 1 }}
                    />
                    <IconButton size="small" onClick={handleAddTag}>
                      <AddIcon />
                    </IconButton>
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          )}

          {/* Upload options for audio/video */}
          {hasAudioVideo && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                {t('corpus.processingOptions')}
              </Typography>
              <Stack spacing={2}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={transcribeAudio}
                      onChange={(e) => setTranscribeAudio(e.target.checked)}
                    />
                  }
                  label={t('corpus.transcribeAudio')}
                />

                {transcribeAudio && (
                  <FormControl size="small" sx={{ ml: 4, maxWidth: 250 }}>
                    <InputLabel>{t('corpus.transcriptionLanguage', 'Transcription Language')}</InputLabel>
                    <Select
                      value={transcriptLanguage}
                      onChange={(e) => setTranscriptLanguage(e.target.value)}
                      label={t('corpus.transcriptionLanguage', 'Transcription Language')}
                    >
                      {LANGUAGE_OPTIONS.map(langCode => {
                        const translationKey = `corpus.languages.${langCode}`
                        const translatedName = t(translationKey, langCode)
                        return (
                          <MenuItem key={langCode} value={langCode}>
                            {translatedName}
                          </MenuItem>
                        )
                      })}
                    </Select>
                  </FormControl>
                )}

                {hasVideo && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={yoloAnnotation}
                        onChange={(e) => setYoloAnnotation(e.target.checked)}
                      />
                    }
                    label={t('corpus.yoloDetection', 'YOLO 物体检测')}
                  />
                )}
                
                {hasVideo && (
                  <>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={clipAnnotation}
                          onChange={(e) => setClipAnnotation(e.target.checked)}
                        />
                      }
                      label={t('corpus.clipClassification', 'CLIP 语义分类')}
                    />
                    
                    {clipAnnotation && (
                      <Box sx={{ ml: 4 }}>
                        <Typography variant="caption" color="text.secondary" gutterBottom>
                          {t('corpus.clipLabels', '选择分类标签')}
                        </Typography>
                        
                        {/* Preset label groups */}
                        {Object.entries(CLIP_PRESET_LABELS).map(([group, labels]) => (
                          <Box key={group} sx={{ mb: 1 }}>
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
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              ))}
                            </Stack>
                          </Box>
                        ))}
                        
                        {/* Custom labels */}
                        <Box sx={{ mt: 1 }}>
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
                          
                          {/* Show currently selected labels */}
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                            {clipLabels.filter(l => !Object.values(CLIP_PRESET_LABELS).flat().includes(l)).map(label => (
                              <Chip
                                key={label}
                                label={label}
                                size="small"
                                onDelete={() => setClipLabels(clipLabels.filter(l => l !== label))}
                                sx={{ fontSize: '0.7rem' }}
                              />
                            ))}
                          </Stack>
                        </Box>
                        
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          {t('corpus.clipLabelsSelected', '已选择 {{count}} 个标签', { count: clipLabels.length })}
                        </Typography>
                        
                        {/* Frame interval setting */}
                        <Box sx={{ mt: 2 }}>
                          <NumberInput
                            size="small"
                            label={t('corpus.frameInterval', '帧间隔')}
                            value={clipFrameInterval}
                            onChange={(val) => setClipFrameInterval(val)}
                            min={1}
                            max={300}
                            integer
                            defaultValue={30}
                            helperText={t('corpus.frameIntervalHelper', '默认 30 帧，设为 1 则逐帧标注')}
                            fullWidth
                          />
                        </Box>
                      </Box>
                    )}
                  </>
                )}
              </Stack>
            </Paper>
          )}
        </Grid>

        {/* Right column - File upload */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {t('corpus.uploadFiles', '上传文件')}
            </Typography>

            {/* Drop zone */}
            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover'
                }
              }}
              component="label"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                type="file"
                multiple
                hidden
                onChange={handleFileSelect}
                accept=".txt,.pdf,.doc,.docx,.mp3,.wav,.m4a,.flac,.ogg,.mp4,.avi,.mkv,.mov,.webm"
              />
              <CloudUploadIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" gutterBottom>
                {t('corpus.clickOrDrag', '点击或拖拽文件')}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('corpus.supportedFormats', '文本: .txt | 音频: .mp3, .wav | 视频: .mp4')}
              </Typography>
            </Box>

            {/* File list */}
            {files.length > 0 && (
              <Box sx={{ mt: 2, flexGrow: 1, overflow: 'auto' }}>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('corpus.filesSelected', '已选择 {{count}} 个文件', { count: files.length })}
                </Typography>
                <List dense sx={{ maxHeight: 350, overflow: 'auto' }}>
                  {files.map((uploadFile, index) => (
                    <Box key={index}>
                      <ListItem
                        sx={{ py: 0.5 }}
                        secondaryAction={
                          uploadFile.status === 'pending' ? (
                            <IconButton 
                              edge="end" 
                              size="small"
                              onClick={() => handleRemoveFile(index)}
                              disabled={isUploading}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          ) : uploadFile.status === 'processing' ? (
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => toggleFileExpanded(index)}
                            >
                              {uploadFile.expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          ) : null
                        }
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          {uploadFile.status === 'pending' ? 
                            getFileIcon(uploadFile.type) : 
                            uploadFile.status === 'processing' ? 
                              <CircularProgress size={20} /> :
                              getStatusIcon(uploadFile.status)
                          }
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography variant="body2" noWrap>
                              {uploadFile.file.name}
                            </Typography>
                          }
                          secondary={
                            uploadFile.status !== 'pending' ? (
                              <Box>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography 
                                    variant="caption" 
                                    color={
                                      uploadFile.status === 'completed' ? 'success.main' :
                                      uploadFile.status === 'error' ? 'error.main' : 
                                      'primary.main'
                                    }
                                    sx={{ fontWeight: uploadFile.status === 'processing' ? 600 : 400 }}
                                  >
                                    {uploadFile.status === 'processing' && uploadFile.stage
                                      ? `${getStageName(uploadFile.stage)}`
                                      : uploadFile.message || uploadFile.status}
                                  </Typography>
                                  {uploadFile.status === 'processing' && uploadFile.progress > 0 && (
                                    <Chip 
                                      label={`${uploadFile.progress}%`} 
                                      size="small" 
                                      color="primary"
                                      sx={{ height: 18, fontSize: '0.7rem' }}
                                    />
                                  )}
                                </Stack>
                                {(uploadFile.status === 'uploading' || uploadFile.status === 'processing') && (
                                  <LinearProgress 
                                    variant={uploadFile.progress > 0 ? 'determinate' : 'indeterminate'}
                                    value={uploadFile.progress}
                                    sx={{ mt: 0.5, height: 6, borderRadius: 1 }}
                                  />
                                )}
                                {/* Result summary for completed files */}
                                {uploadFile.status === 'completed' && uploadFile.result && (
                                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                                    {uploadFile.result.word_count && (
                                      <Chip label={`${uploadFile.result.word_count} words`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                                    )}
                                    {uploadFile.result.duration && (
                                      <Chip label={`${Math.round(uploadFile.result.duration)}s`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                                    )}
                                    {uploadFile.result.segments && (
                                      <Chip label={`${uploadFile.result.segments} segs`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                                    )}
                                  </Stack>
                                )}
                              </Box>
                            ) : (
                              <Chip 
                                label={uploadFile.type} 
                                size="small" 
                                color={
                                  uploadFile.type === 'audio' ? 'primary' :
                                  uploadFile.type === 'video' ? 'secondary' : 'default'
                                }
                              />
                            )
                          }
                        />
                      </ListItem>
                      
                      {/* Expanded progress details */}
                      <Collapse in={uploadFile.expanded && uploadFile.status === 'processing'}>
                        <Box sx={{ pl: 7, pr: 2, pb: 1 }}>
                          <Stepper 
                            activeStep={getStageIndex(uploadFile.stage || 'initializing')} 
                            alternativeLabel
                            sx={{ 
                              '& .MuiStepLabel-label': { fontSize: '0.65rem' },
                              '& .MuiStepIcon-root': { fontSize: '1rem' }
                            }}
                          >
                            {PROCESSING_STAGES.filter(s => 
                              // Show relevant stages based on file type
                              uploadFile.type === 'video' 
                                ? true 
                                : !['extract_audio', 'yolo', 'clip'].includes(s.key)
                            ).map((stage) => (
                              <Step key={stage.key}>
                                <StepLabel>{stage.label}</StepLabel>
                              </Step>
                            ))}
                          </Stepper>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                            {uploadFile.message}
                          </Typography>
                        </Box>
                      </Collapse>
                    </Box>
                  ))}
                </List>
              </Box>
            )}

            {/* Upload button */}
            <Box sx={{ mt: 'auto', pt: 2 }}>
              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={isUploading ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                onClick={handleUpload}
                disabled={!canUpload()}
              >
                {isUploading ? t('corpus.uploading') : t('corpus.uploadButton', { count: files.length })}
              </Button>
              {!canUpload() && files.length === 0 && (
                <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 1 }}>
                  {t('corpus.selectFilesToUpload')}
                </Typography>
              )}
              {!canUpload() && files.length > 0 && createNew && !metadata.name && (
                <Typography variant="caption" color="error" display="block" textAlign="center" sx={{ mt: 1 }}>
                  {t('corpus.enterCorpusName')}
                </Typography>
              )}
              {!canUpload() && files.length > 0 && !createNew && !targetCorpusId && (
                <Typography variant="caption" color="error" display="block" textAlign="center" sx={{ mt: 1 }}>
                  {t('corpus.pleaseSelectCorpus')}
                </Typography>
              )}
              {!canUpload() && files.length > 0 && !textDate && (createNew ? metadata.name : targetCorpusId) && (
                <Typography variant="caption" color="error" display="block" textAlign="center" sx={{ mt: 1 }}>
                  {t('corpus.dateRequired', '请选择日期')}
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

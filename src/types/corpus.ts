// Corpus related types

export type MediaType = 'text' | 'audio' | 'video'

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type TaskType = 'upload' | 'transcribe' | 'yolo' | 'preprocess'

// ==================== Corpus Models ====================

export interface CorpusMetadata {
  id: string
  name: string
  language?: string
  author?: string
  source?: string
  textType?: string
  description?: string
  tags: string[]
  createdAt?: string
  updatedAt?: string
}

export interface CorpusCreate {
  name: string
  language?: string
  author?: string
  source?: string
  textType?: string
  description?: string
  tags?: string[]
}

export interface CorpusUpdate {
  name?: string
  language?: string
  author?: string
  source?: string
  textType?: string
  description?: string
  tags?: string[]
}

export interface Corpus extends CorpusMetadata {
  textCount: number
  texts: CorpusText[]  // Loaded from API when corpus is selected
}

// ==================== Text Models ====================

export interface TextMetadata {
  author?: string
  date?: string
  source?: string
  description?: string
  customFields?: Record<string, string>
}

export interface CorpusText {
  id: string
  corpusId: string
  filename: string
  originalFilename?: string
  contentPath?: string
  mediaType: MediaType
  transcriptPath?: string
  transcriptJsonPath?: string
  hasTimestamps: boolean
  yoloAnnotationPath?: string
  clipAnnotationPath?: string
  usasAnnotationPath?: string
  audioPath?: string
  wordCount: number
  duration?: number
  metadata?: TextMetadata
  tags: string[]
  createdAt?: string
  updatedAt?: string
}

// ==================== USAS Models ====================

export interface USASToken {
  text: string
  start: number
  end: number
  usasTag: string
  usasTags?: string[]
  usasDescription?: string
  usasCategory?: string
  usasCategoryName?: string
  pos?: string
  lemma?: string
  isMwe?: boolean
  isPunct?: boolean
  isSpace?: boolean
}

export interface USASAnnotation {
  success: boolean
  tokens: USASToken[]
  domainDistribution: Record<string, number>
  dominantDomain?: string
  textTypePriority?: string
  disambiguationStats?: {
    totalTokens: number
    ambiguousTokens: number
    disambiguatedByPriority: number
    disambiguatedByDomain: number
    disambiguatedByOspc: number
    defaultSelection: number
  }
}

export interface USASCategory {
  code: string
  description: string
}

export interface USASDomains {
  majorCategories: Record<string, string>
  domainsByCategory: Record<string, USASCategory[]>
  totalDomains: number
}

export interface TextUpdate {
  filename?: string
  contentPath?: string
  transcriptPath?: string
  hasTimestamps?: boolean
  yoloAnnotationPath?: string
  wordCount?: number
  metadata?: TextMetadata
  tags?: string[]
}

// ==================== Transcript Models ====================

export interface TranscriptWord {
  word: string
  start: number
  end: number
  probability?: number
}

export interface TranscriptSegment {
  id: number | string
  start: number
  end: number
  text: string
  words?: TranscriptWord[]
}

export interface TranscriptData {
  audioPath?: string
  audioName?: string
  language?: string
  fullText: string
  totalDuration?: number
  totalSegments: number
  totalWords: number
  segments: TranscriptSegment[]
  words?: TranscriptWord[]
  wordLevelTimestamps: boolean
}

// ==================== YOLO Models ====================

export interface YoloDetection {
  trackId: number
  classId: number
  className: string
  confidence: number
  bbox: [number, number, number, number] // x1, y1, x2, y2
  frameNumber: number
  timestampSeconds: number
}

export interface YoloTrackSegment {
  trackId: number
  className: string
  startFrame: number
  endFrame: number
  startTime: number
  endTime: number
  color: string
  detections: YoloDetection[]
}

export interface YoloResult {
  videoPath: string
  videoName: string
  fps: number
  totalFrames: number
  width: number
  height: number
  duration: number
  confThreshold: number
  totalDetections: number
  totalTracks: number
  trackSegments: YoloTrackSegment[]
  framesDir?: string
}

// ==================== CLIP Models ====================

export interface ClipClassification {
  [label: string]: number  // label -> confidence (0-1)
}

export interface ClipFrameResult {
  frameNumber: number
  timestampSeconds: number
  classifications: ClipClassification
  topLabel: string
  confidence: number
}

export interface ClipResult {
  videoPath: string
  videoName: string
  fps: number
  totalFrames: number
  width: number
  height: number
  duration: number
  frameInterval: number
  labels: string[]
  frameResults: ClipFrameResult[]
}

export interface ClipPresetLabels {
  objects: string[]
  scenes: string[]
  mood: string[]
  dynamics: string[]
}

// ==================== Processing Task Models ====================

export interface ProcessingTask {
  id: string
  corpusId?: string
  textId?: string
  taskType: TaskType
  status: TaskStatus
  progress: number
  message?: string
  result?: Record<string, unknown>
  error?: string
  createdAt?: string
  updatedAt?: string
  completedAt?: string
}

// ==================== Progress Event Models ====================

export interface ProgressEvent {
  task_id: string
  stage: string
  progress: number
  message: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: {
    word_count?: number
    duration?: number
    segments?: number
    yolo_tracks?: number
    clip_frames?: number
  }
}

export type ProcessingStage = 
  | 'initializing'
  | 'extract_audio'
  | 'transcribing'
  | 'spacy'
  | 'yolo'
  | 'clip'
  | 'database'
  | 'completed'
  | 'error'
  | 'heartbeat'

// ==================== Upload Models ====================

export interface UploadConfig {
  corpusId: string
  transcribe: boolean
  yoloAnnotation: boolean
  clipAnnotation: boolean
  clipLabels: string[]
  language?: string
  metadata?: TextMetadata
  tags: string[]
}

export interface UploadResult {
  success: boolean
  textId?: string
  taskId?: string
  filename: string
  mediaType: MediaType
  message?: string
}

// ==================== Preprocess Models ====================

export interface PreprocessConfig {
  normalizeText: boolean
  removePunctuation: boolean
  toLowerCase: boolean
  removeStopwords: boolean
  stopwordsLanguage: string
  tokenize: boolean
  extractEntities: boolean
  customStopwords?: string[]
  advancedPatterns?: string[]
}

export const defaultPreprocessConfig: PreprocessConfig = {
  normalizeText: true,
  removePunctuation: true,
  toLowerCase: true,
  removeStopwords: true,
  stopwordsLanguage: 'english',
  tokenize: true,
  extractEntities: false,
  customStopwords: [],
  advancedPatterns: []
}

export interface PreprocessResult {
  originalText: string
  processedText: string
  tokens: string[]
  entities?: Array<{
    text: string
    label: string
    start: number
    end: number
  }>
  wordCount: number
}

export interface PreprocessPreviewStats {
  originalChars: number
  processedChars: number
  originalWords: number
  processedWords: number
  tokenCount: number
  reductionRate: number
}

// ==================== Filter Models ====================

export interface CorpusFilters {
  tags?: string[]
  language?: string
  textType?: string
  mediaType?: MediaType
  searchQuery?: string
}

export interface CorpusSelection {
  corpusId: string
  textIds: string[] | 'all'
  filters: CorpusFilters
  preprocessConfig: PreprocessConfig
}

// ==================== Service Status ====================

export interface ServiceStatus {
  available: boolean
  modelPath: string
}

export interface ServicesStatus {
  whisper: ServiceStatus
  yolo: ServiceStatus
  clip: ServiceStatus
}

// ==================== Language Support ====================

export interface LanguageOption {
  code: string
  name: string
  native: string
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'english', name: 'English', native: 'English' },
  { code: 'chinese', name: 'Chinese', native: '中文' },
  { code: 'spanish', name: 'Spanish', native: 'Espanol' },
  { code: 'french', name: 'French', native: 'Francais' },
  { code: 'german', name: 'German', native: 'Deutsch' },
  { code: 'italian', name: 'Italian', native: 'Italiano' },
  { code: 'portuguese', name: 'Portuguese', native: 'Portugues' },
  { code: 'russian', name: 'Russian', native: 'Russkij' },
  { code: 'arabic', name: 'Arabic', native: 'Arabiy' },
  { code: 'japanese', name: 'Japanese', native: 'Nihongo' }
]

// ==================== API Response Types ====================

export interface CorpusListResponse {
  success: boolean
  data: Corpus[]
  message?: string
}

export interface CorpusDetailResponse {
  success: boolean
  data: Corpus
  message?: string
}

export interface TextListResponse {
  success: boolean
  data: CorpusText[]
  message?: string
}

export interface TextDetailResponse {
  success: boolean
  data: CorpusText
  content?: string
  transcript?: TranscriptData
  message?: string
}

export interface UploadResponse {
  success: boolean
  data: UploadResult[]
  message?: string
}

export interface TaskResponse {
  success: boolean
  data: ProcessingTask
  message?: string
}

export interface TagListResponse {
  success: boolean
  data: string[]
  message?: string
}

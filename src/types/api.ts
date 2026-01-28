// API response types

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface UploadProgress {
  filename: string
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  message?: string
}

export interface TranscriptionProgress {
  progress: number
  currentSegment?: number
  totalSegments?: number
  status: 'pending' | 'transcribing' | 'completed' | 'error'
}

export interface OllamaStatus {
  connected: boolean
  models?: string[]
  currentModel?: string
  error?: string
}

export interface DictionarySearchResult {
  word: string
  definitions: Definition[]
  phonetic?: string
  examples?: string[]
}

export interface Definition {
  partOfSpeech: string
  meaning: string
  examples?: string[]
}

export interface HelpFile {
  filename: string
  content: string
}

export interface HelpSection {
  title: string
  content: string
  level: number
}


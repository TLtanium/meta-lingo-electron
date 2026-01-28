import { api, API_BASE_URL } from './client'
import type { 
  Corpus,
  CorpusCreate,
  CorpusUpdate,
  CorpusText, 
  TextUpdate,
  UploadResult,
  ProcessingTask,
  ServicesStatus
} from '../types'

const API_BASE = '/api/corpus'

// Convert snake_case backend response to camelCase frontend types
function convertCorpusText(data: any): CorpusText {
  // Convert metadata custom_fields to customFields
  let metadata = data.metadata
  if (metadata && metadata.custom_fields) {
    metadata = {
      ...metadata,
      customFields: metadata.custom_fields
    }
    delete metadata.custom_fields
  }
  
  return {
    id: data.id,
    corpusId: data.corpus_id,
    filename: data.filename,
    originalFilename: data.original_filename,
    contentPath: data.content_path,
    mediaType: data.media_type,
    transcriptPath: data.transcript_path,
    transcriptJsonPath: data.transcript_json_path,
    hasTimestamps: Boolean(data.has_timestamps),
    yoloAnnotationPath: data.yolo_annotation_path,
    clipAnnotationPath: data.clip_annotation_path,
    audioPath: data.audio_path,
    wordCount: data.word_count || 0,
    duration: data.duration,
    metadata: metadata,
    tags: data.tags || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

function convertCorpus(data: any): Corpus {
  return {
    id: data.id,
    name: data.name,
    language: data.language,
    author: data.author,
    source: data.source,
    textType: data.text_type,
    description: data.description,
    tags: data.tags || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    textCount: data.text_count || 0,
    texts: []
  }
}

// Helper to extract data from wrapped API response
function unwrap<T>(response: { success: boolean; data?: T; error?: string }): T {
  if (response.success && response.data) {
    // If data itself has success/data structure, return the inner data
    const inner = response.data as any
    if (inner && typeof inner === 'object' && 'success' in inner && 'data' in inner) {
      return inner.data
    }
    return response.data
  }
  throw new Error(response.error || 'API request failed')
}

// Corpus API endpoints
export const corpusApi = {
  // ==================== Corpus CRUD ====================
  
  // Get all corpora
  listCorpora: async (): Promise<{ success: boolean; data: Corpus[]; message?: string }> => {
    try {
      const response = await api.get<{ success: boolean; data: any[] }>(`${API_BASE}/list`)
      if (response.success && response.data) {
        const inner = response.data as any
        const rawData = inner.success !== undefined ? inner.data : response.data
        const corpora = Array.isArray(rawData) ? rawData.map(convertCorpus) : []
        return { success: true, data: corpora }
      }
      return { success: false, data: [], message: response.error }
    } catch (error) {
      return { success: false, data: [], message: String(error) }
    }
  },

  // Get corpus by ID
  getCorpus: async (id: string): Promise<{ success: boolean; data?: Corpus; message?: string }> => {
    try {
      const response = await api.get<{ success: boolean; data: Corpus }>(`${API_BASE}/${id}`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data as unknown as Corpus }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Create new corpus
  createCorpus: async (data: CorpusCreate): Promise<{ success: boolean; data?: Corpus; message?: string }> => {
    try {
      const response = await api.post<{ success: boolean; data: Corpus }>(`${API_BASE}/create`, data)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data as unknown as Corpus }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Update corpus metadata
  updateCorpus: async (id: string, data: CorpusUpdate): Promise<{ success: boolean; data?: Corpus; message?: string }> => {
    try {
      const response = await api.put<{ success: boolean; data: Corpus }>(`${API_BASE}/${id}`, data)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data as unknown as Corpus }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Delete corpus
  deleteCorpus: async (id: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.delete<{ success: boolean; message?: string }>(`${API_BASE}/${id}`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // ==================== Corpus Tags ====================
  
  // Add tag to corpus
  addCorpusTag: async (corpusId: string, tag: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.post<{ success: boolean }>(`${API_BASE}/${corpusId}/tags`, { tag })
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Remove tag from corpus
  removeCorpusTag: async (corpusId: string, tag: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.delete<{ success: boolean }>(`${API_BASE}/${corpusId}/tags/${encodeURIComponent(tag)}`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // ==================== Text CRUD ====================
  
  // Get all texts in a corpus
  getTexts: async (corpusId: string, mediaType?: string): Promise<{ success: boolean; data: CorpusText[]; message?: string }> => {
    try {
      const url = mediaType 
        ? `${API_BASE}/${corpusId}/texts?media_type=${mediaType}`
        : `${API_BASE}/${corpusId}/texts`
      const response = await api.get<{ success: boolean; data: any[] }>(url)
      if (response.success && response.data) {
        const inner = response.data as any
        const rawData = inner.success !== undefined ? inner.data : response.data
        const texts = Array.isArray(rawData) ? rawData.map(convertCorpusText) : []
        return { success: true, data: texts }
      }
      return { success: false, data: [], message: response.error }
    } catch (error) {
      return { success: false, data: [], message: String(error) }
    }
  },

  // Get text with content
  getText: async (corpusId: string, textId: string): Promise<{ success: boolean; data?: CorpusText; content?: string; transcript?: any; message?: string }> => {
    try {
      const response = await api.get<{ success: boolean; data: any; content?: string; transcript?: any }>(`${API_BASE}/${corpusId}/texts/${textId}`)
      if (response.success && response.data) {
        const inner = response.data as any
        const result = inner.success !== undefined ? inner : response.data
        return {
          success: true,
          data: result.data ? convertCorpusText(result.data) : undefined,
          content: result.content,
          transcript: result.transcript
        }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Update text metadata
  updateText: async (corpusId: string, textId: string, data: TextUpdate): Promise<{ success: boolean; data?: CorpusText; message?: string }> => {
    try {
      const response = await api.put<{ success: boolean; data: any }>(`${API_BASE}/${corpusId}/texts/${textId}`, data)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          // Convert the nested data
          return {
            success: inner.success,
            data: inner.data ? convertCorpusText(inner.data) : undefined,
            message: inner.message
          }
        }
        return { success: true, data: convertCorpusText(response.data) }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Update text content
  updateTextContent: async (corpusId: string, textId: string, content: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.put<{ success: boolean }>(`${API_BASE}/${corpusId}/texts/${textId}/content`, { content })
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Update transcript segments for audio/video
  updateTranscriptSegments: async (
    corpusId: string, 
    textId: string, 
    segments: Array<{ id: number | string; start: number; end: number; text: string }>
  ): Promise<{ 
    success: boolean
    data?: { 
      updated_segments: number
      total_segments: number
      total_words: number
      spacy_regenerated?: boolean  // Whether SpaCy annotations were regenerated
      usas_regenerated?: boolean   // Whether USAS annotations were regenerated
    }
    message?: string 
  }> => {
    try {
      const response = await api.put<{ success: boolean; data: any }>(
        `${API_BASE}/${corpusId}/texts/${textId}/transcript`,
        { segments }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data as any }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Delete text
  deleteText: async (corpusId: string, textId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.delete<{ success: boolean }>(`${API_BASE}/${corpusId}/texts/${textId}`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // ==================== Text Tags ====================
  
  // Add tag to text
  addTextTag: async (corpusId: string, textId: string, tag: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.post<{ success: boolean }>(`${API_BASE}/${corpusId}/texts/${textId}/tags`, { tag })
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Remove tag from text
  removeTextTag: async (corpusId: string, textId: string, tag: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.delete<{ success: boolean }>(
        `${API_BASE}/${corpusId}/texts/${textId}/tags/${encodeURIComponent(tag)}`
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // ==================== File Upload ====================
  
  // Upload files to corpus
  uploadFiles: async (
    corpusId: string, 
    files: File[], 
    config: {
      transcribe?: boolean
      yolo_annotation?: boolean
      language?: string
      tags?: string[]
      metadata?: Record<string, string>
    },
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; data: UploadResult[]; message?: string }> => {
    try {
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      formData.append('config', JSON.stringify(config))
      
      const response = await api.upload<{ success: boolean; data: any[]; message?: string }>(
        `${API_BASE}/${corpusId}/upload`,
        formData,
        onProgress
      )
      if (response.success && response.data) {
        const inner = response.data as any
        const rawData = inner.success !== undefined ? inner.data : response.data
        
        // Convert snake_case to camelCase for upload results
        const convertedData: UploadResult[] = (Array.isArray(rawData) ? rawData : []).map((item: any) => ({
          success: item.success,
          textId: item.text_id,
          taskId: item.task_id,  // Convert task_id to taskId
          filename: item.filename,
          mediaType: item.media_type,
          message: item.message
        }))
        
        console.log('[Upload] Converted results:', convertedData)
        return { success: true, data: convertedData }
      }
      return { success: false, data: [], message: response.error }
    } catch (error) {
      return { success: false, data: [], message: String(error) }
    }
  },

  // ==================== Task Status ====================
  
  // Get processing task status
  getTaskStatus: async (taskId: string): Promise<{ success: boolean; data?: ProcessingTask; message?: string }> => {
    try {
      const response = await api.get<{ success: boolean; data: ProcessingTask }>(`${API_BASE}/tasks/${taskId}`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data as unknown as ProcessingTask }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // List tasks for a corpus
  listCorpusTasks: async (corpusId: string): Promise<{ success: boolean; data: ProcessingTask[]; message?: string }> => {
    try {
      const response = await api.get<{ success: boolean; data: any[] }>(`${API_BASE}/${corpusId}/tasks`)
      if (response.success && response.data) {
        const inner = response.data as any
        const rawData = inner.success !== undefined ? inner.data : response.data
        
        // Convert snake_case to camelCase
        const convertedData: ProcessingTask[] = (Array.isArray(rawData) ? rawData : []).map((item: any) => ({
          id: item.id,
          corpusId: item.corpus_id,
          textId: item.text_id,
          taskType: item.task_type,
          status: item.status,
          progress: item.progress || 0,
          message: item.message,
          result: typeof item.result === 'string' ? JSON.parse(item.result) : item.result,
          error: item.error,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          completedAt: item.completed_at
        }))
        
        return { success: true, data: convertedData }
      }
      return { success: false, data: [], message: response.error }
    } catch (error) {
      return { success: false, data: [], message: String(error) }
    }
  },

  // ==================== Tags ====================
  
  // Get all tags across all corpora
  getAllTags: async (): Promise<{ success: boolean; data: string[]; message?: string }> => {
    try {
      const response = await api.get<{ success: boolean; data: string[] }>(`${API_BASE}/tags/all`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data as unknown as string[] }
      }
      return { success: false, data: [], message: response.error }
    } catch (error) {
      return { success: false, data: [], message: String(error) }
    }
  },

  // ==================== Service Status ====================
  
  // Get ML services status (Whisper, YOLO)
  getServicesStatus: async (): Promise<{ success: boolean; data?: ServicesStatus; message?: string }> => {
    try {
      const response = await api.get<{ success: boolean; data: ServicesStatus }>(`${API_BASE}/services/status`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data as unknown as ServicesStatus }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // ==================== SpaCy Annotations ====================
  
  // Get SpaCy annotation for a text
  getSpacyAnnotation: async (corpusId: string, textId: string): Promise<{ success: boolean; data?: any; message?: string }> => {
    try {
      const response = await api.get<{ success: boolean; data: any }>(`${API_BASE}/${corpusId}/texts/${textId}/spacy`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Batch annotate all texts in a corpus with SpaCy (async - returns task_id)
  batchSpacyAnnotate: async (corpusId: string, force: boolean = false): Promise<{ 
    success: boolean
    task_id?: string  // Async task ID for progress tracking
    data?: {
      corpus_id: string
      corpus_name: string
      total: number
      annotated: number
      skipped: number
      failed: number
      results: Array<{
        text_id: string
        filename: string
        status: 'success' | 'skipped' | 'failed'
        reason?: string
        tokens?: number
        entities?: number
        sentences?: number
      }>
    }
    message?: string 
  }> => {
    try {
      const response = await api.postSpacy<{ success: boolean; task_id?: string; data?: any; message?: string }>(
        `${API_BASE}/spacy/batch/${corpusId}`,
        { force }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, task_id: inner.task_id, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Annotate a single text with SpaCy
  singleSpacyAnnotate: async (corpusId: string, textId: string, force: boolean = false): Promise<{
    success: boolean
    data?: {
      text_id: string
      filename: string
      tokens: number
      entities: number
      sentences: number
      path: string
    }
    message?: string
  }> => {
    try {
      const response = await api.postSpacy<{ success: boolean; data: any }>(
        `${API_BASE}/spacy/single/${corpusId}/${textId}`,
        { force }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Re-annotate a single text with SpaCy (async - returns task_id)
  reAnnotateSpacy: async (corpusId: string, textId: string, force: boolean = true): Promise<{
    success: boolean
    task_id?: string  // Async task ID for progress tracking
    message?: string
  }> => {
    try {
      const response = await api.post<{ success: boolean; task_id?: string; message?: string }>(
        `${API_BASE}/${corpusId}/texts/${textId}/reannotate-spacy`,
        { force }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, task_id: inner.task_id }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // ==================== Media Streaming ====================

  // Get media stream URL for video/audio playback
  getMediaStreamUrl: (corpusId: string, textId: string): string => {
    return `${API_BASE_URL}${API_BASE}/${corpusId}/texts/${textId}/media`
  },

  // ==================== YOLO Annotations ====================

  // Get YOLO annotation data for a video text
  getYoloAnnotation: async (corpusId: string, textId: string): Promise<{ 
    success: boolean
    data?: {
      tracks: Array<{
        trackId: number
        className: string
        startFrame: number
        endFrame: number
        startTime: number
        endTime: number
        color: string
        detections: Array<{
          trackId: number
          classId: number
          className: string
          confidence: number
          bbox: [number, number, number, number]
          frameNumber: number
          timestamp: number
        }>
      }>
      videoInfo?: {
        width: number
        height: number
        fps: number
        frameCount: number
        duration: number
      }
    }
    message?: string 
  }> => {
    try {
      const response = await api.get<{ success: boolean; data: any }>(`${API_BASE}/${corpusId}/texts/${textId}/yolo`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Re-annotate video with YOLO
  reAnnotateYolo: async (corpusId: string, textId: string): Promise<{
    success: boolean
    task_id?: string
    message?: string
  }> => {
    try {
      const response = await api.post<{ success: boolean; task_id?: string; message?: string }>(
        `${API_BASE}/${corpusId}/texts/${textId}/reannotate-yolo`
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, task_id: (response.data as any).task_id }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // ==================== CLIP Annotations ====================

  // Get CLIP annotation data for a video text
  getClipAnnotation: async (corpusId: string, textId: string): Promise<{
    success: boolean
    data?: {
      video_path: string
      video_name: string
      fps: number
      total_frames: number
      width: number
      height: number
      duration: number
      frame_interval: number
      labels: string[]
      frame_results: Array<{
        frame_number: number
        timestamp_seconds: number
        classifications: Record<string, number>
        top_label: string
        confidence: number
      }>
    }
    message?: string
  }> => {
    try {
      const response = await api.get<{ success: boolean; data: any }>(`${API_BASE}/${corpusId}/texts/${textId}/clip`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Re-annotate video with CLIP
  reAnnotateClip: async (corpusId: string, textId: string, labels?: string[], frameInterval?: number): Promise<{
    success: boolean
    task_id?: string
    message?: string
  }> => {
    try {
      const params: { labels?: string[]; frame_interval?: number } = {}
      if (labels && labels.length > 0) params.labels = labels
      if (frameInterval !== undefined) params.frame_interval = frameInterval
      
      // Always send a valid JSON body (even empty object) for POST request
      const response = await api.post<{ success: boolean; task_id?: string; message?: string }>(
        `${API_BASE}/${corpusId}/texts/${textId}/reannotate-clip`,
        params
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, task_id: (response.data as any).task_id }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Re-annotate text with USAS semantic tagging (async - returns task_id)
  reAnnotateUsas: async (corpusId: string, textId: string): Promise<{
    success: boolean
    task_id?: string  // Async task ID for progress tracking
    data?: {
      tokens: number
      dominant_domain?: string
    }
    message?: string
  }> => {
    try {
      const response = await api.post<{ success: boolean; task_id?: string; data?: any; message?: string }>(
        `${API_BASE}/${corpusId}/texts/${textId}/reannotate-usas`
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, task_id: inner.task_id, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Re-annotate text with MIPVU metaphor tagging (async - returns task_id)
  reAnnotateMipvu: async (corpusId: string, textId: string): Promise<{
    success: boolean
    task_id?: string  // Async task ID for progress tracking
    data?: {
      metaphor_tokens: number
      total_tokens: number
      metaphor_rate: number
    }
    message?: string
  }> => {
    try {
      const response = await api.post<{ success: boolean; task_id?: string; data?: any; message?: string }>(
        `${API_BASE}/${corpusId}/texts/${textId}/reannotate-mipvu`
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, task_id: inner.task_id, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Get MIPVU annotation for a text
  getMipvuAnnotation: async (corpusId: string, textId: string): Promise<{
    success: boolean
    data?: any
    message?: string
  }> => {
    try {
      const response = await api.get<{ success: boolean; data: any; message?: string }>(
        `${API_BASE}/${corpusId}/texts/${textId}/mipvu`
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Get CLIP preset labels
  getClipPresetLabels: async (): Promise<{
    success: boolean
    data?: {
      preset_labels: Record<string, string[]>
      default_labels: string[]
    }
    message?: string
  }> => {
    try {
      const response = await api.get<{ success: boolean; data: any }>(`${API_BASE}/clip/preset-labels`)
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner
        }
        return { success: true, data: response.data }
      }
      return { success: false, message: response.error }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // ==================== SSE Progress Streaming ====================

  /**
   * Subscribe to real-time progress updates via Server-Sent Events
   * 
   * @param taskId - Task ID to subscribe to
   * @param onProgress - Callback function for progress updates
   * @param onComplete - Callback function when task completes
   * @param onError - Callback function for errors
   * @returns Cleanup function to close the connection
   */
  subscribeToProgress: (
    taskId: string,
    onProgress: (event: ProgressEvent) => void,
    onComplete?: (event: ProgressEvent) => void,
    onError?: (error: Error) => void
  ): (() => void) => {
    const url = `${API_BASE_URL}${API_BASE}/progress/${taskId}`
    console.log('[SSE] Connecting to:', url)
    const eventSource = new EventSource(url)
    
    eventSource.onopen = () => {
      console.log('[SSE] Connection opened for task:', taskId)
    }
    
    eventSource.onmessage = (event) => {
      try {
        console.log('[SSE] Received event:', event.data)
        const data: ProgressEvent = JSON.parse(event.data)
        
        // Call progress callback
        onProgress(data)
        
        // Check if task is complete or failed
        if (data.status === 'completed' || data.status === 'failed') {
          console.log('[SSE] Task completed/failed, closing connection')
          if (onComplete) {
            onComplete(data)
          }
          eventSource.close()
        }
      } catch (e) {
        console.error('[SSE] Failed to parse event:', e, 'Raw data:', event.data)
        if (onError) {
          onError(new Error('Failed to parse progress event'))
        }
      }
    }
    
    eventSource.onerror = (event) => {
      console.error('[SSE] Connection error:', event)
      // Check readyState to see if it's recoverable
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[SSE] Connection closed by server')
        if (onError) {
          onError(new Error('SSE connection closed'))
        }
      }
    }
    
    // Return cleanup function
    return () => {
      eventSource.close()
    }
  }
}

// ==================== Progress Event Type ====================

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

export default corpusApi

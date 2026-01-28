import { api } from './client'
import type { PreprocessConfig } from '../types'

const API_BASE = '/api/preprocess'

export interface PreprocessPreviewResponse {
  success: boolean
  data?: {
    originalText: string
    processedText: string
    tokensSample: string[]
    statistics: {
      originalChars: number
      processedChars: number
      originalWords: number
      processedWords: number
      tokenCount: number
      reductionRate: number
    }
  }
  message?: string
}

export interface PreprocessCorpusResponse {
  success: boolean
  data?: {
    total: number
    success: number
    failed: number
    results: Array<{
      textId: string
      filename: string
      success: boolean
      wordCount?: number
      tokenCount?: number
      savePath?: string
      error?: string
    }>
  }
  message?: string
}

export interface StopwordsResponse {
  success: boolean
  data?: {
    language: string
    count: number
    stopwords: string[]
  }
  message?: string
}

export interface LanguageOption {
  code: string
  name: string
  native: string
}

export interface LanguagesResponse {
  success: boolean
  data?: LanguageOption[]
  message?: string
}

// Helper to handle nested response
function handleResponse<T>(response: { success: boolean; data?: any; error?: string }): { success: boolean; data?: T; message?: string } {
  if (response.success && response.data) {
    const inner = response.data as any
    if (inner && typeof inner === 'object' && 'success' in inner) {
      return inner
    }
    return { success: true, data: response.data }
  }
  return { success: false, message: response.error }
}

// Request interface for preprocessText
export interface PreprocessTextRequest {
  text: string
  config: {
    normalize_text?: boolean
    remove_punctuation?: boolean
    to_lowercase?: boolean
    remove_stopwords?: boolean
    stopwords_language?: string
    tokenize?: boolean
    extract_entities?: boolean
    custom_stopwords?: string[]
    advanced_patterns?: string[]
  }
}

// Preprocess API endpoints
export const preprocessApi = {
  // Preprocess single text
  preprocessText: async (request: PreprocessTextRequest): Promise<{
    success: boolean
    data?: {
      original_text: string
      processed_text: string
      tokens: string[]
      word_count: number
      entities: Array<{ text: string; label: string; start: number; end: number }>
    }
    message?: string
  }> => {
    try {
      const response = await api.post(`${API_BASE}/text`, request)
      return handleResponse(response)
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Preview preprocessing on sample text
  previewPreprocess: async (text: string, config: PreprocessConfig): Promise<PreprocessPreviewResponse> => {
    try {
      const response = await api.post(`${API_BASE}/preview`, { text, config })
      return handleResponse(response)
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Preprocess corpus texts
  preprocessCorpus: async (
    corpusId: string,
    textIds: string[] | null,
    config: PreprocessConfig,
    saveResults: boolean = true
  ): Promise<PreprocessCorpusResponse> => {
    try {
      const response = await api.post(`${API_BASE}/corpus`, {
        corpus_id: corpusId,
        text_ids: textIds,
        config: {
          normalize_text: config.normalizeText,
          remove_punctuation: config.removePunctuation,
          to_lowercase: config.toLowerCase,
          remove_stopwords: config.removeStopwords,
          stopwords_language: config.stopwordsLanguage,
          tokenize: config.tokenize,
          extract_entities: config.extractEntities,
          custom_stopwords: config.customStopwords,
          advanced_patterns: config.advancedPatterns
        },
        save_results: saveResults
      })
      return handleResponse(response)
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Quick preprocessing with minimal options
  quickPreprocess: async (
    text: string,
    language: string = 'english',
    lowercase: boolean = true,
    removeStopwords: boolean = true,
    removePunct: boolean = true
  ): Promise<{ success: boolean; data?: { processedText: string }; message?: string }> => {
    try {
      const response = await api.post(`${API_BASE}/quick`, {
        text,
        language,
        lowercase,
        remove_stopwords: removeStopwords,
        remove_punct: removePunct
      })
      return handleResponse(response)
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Get supported languages
  getLanguages: async (): Promise<LanguagesResponse> => {
    try {
      const response = await api.get(`${API_BASE}/languages`)
      return handleResponse(response)
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  // Get stopwords for a language
  getStopwords: async (language: string): Promise<StopwordsResponse> => {
    try {
      const response = await api.get(`${API_BASE}/stopwords/${language}`)
      return handleResponse(response)
    } catch (error) {
      return { success: false, message: String(error) }
    }
  }
}

export default preprocessApi

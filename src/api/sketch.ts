/**
 * Word Sketch API Client
 */

import { api } from './client'

// ==================== Types ====================

export interface POSOption {
  value: string
  label_en: string
  label_zh: string
}

export interface Collocation {
  word: string
  lemma: string
  pos: string
  frequency: number
  score: number
  positions?: number[][]
  // For difference view
  freq1?: number
  freq2?: number
  score1?: number
  score2?: number
}

export interface RelationData {
  name: string
  display_en: string
  display_zh: string
  description?: string
  collocations: Collocation[]
  total_count: number
  // For difference view
  shared?: Collocation[]
  word1_only?: Collocation[]
  word2_only?: Collocation[]
  shared_count?: number
  word1_only_count?: number
  word2_only_count?: number
}

export interface WordSketchResult {
  success: boolean
  word: string
  pos: string
  total_instances: number
  relation_count: number
  relations: Record<string, RelationData>
  message?: string
}

export interface SketchDifferenceResult {
  success: boolean
  word1: string
  word2: string
  pos: string
  relations: Record<string, RelationData>
  summary: {
    word1_total_relations: number
    word2_total_relations: number
    common_relations: number
  }
}

export interface SearchResult {
  lemma: string
  pos: string
  frequency: number
  forms: string[]
}

export interface SearchCollocationsResult {
  success: boolean
  query: string
  search_type: string
  total_matches: number
  results: SearchResult[]
}

export interface RelationType {
  name: string
  display_en: string
  display_zh: string
  description: string
  center_pos: string
}

// ==================== Request Types ====================

export interface WordSketchRequest {
  corpus_id: string
  text_ids: string | string[]
  word: string
  pos: string
  min_frequency?: number
  min_score?: number
  max_results?: number
}

export interface SketchDifferenceRequest {
  corpus_id: string
  text_ids: string | string[]
  word1: string
  word2: string
  pos: string
  min_frequency?: number
  compare_mode?: 'lemmas' | 'word_form'
}

export interface SearchCollocationsRequest {
  corpus_id: string
  text_ids: string | string[]
  query: string
  search_type: string
  pos_filter?: string
  min_frequency?: number
  max_frequency?: number
  exclude_words?: string[]
  lowercase?: boolean
}

// ==================== API Functions ====================

export const sketchApi = {
  /**
   * Generate Word Sketch for a word
   */
  async generateWordSketch(request: WordSketchRequest) {
    const response = await api.post<{ success: boolean; data: WordSketchResult; error?: string }>(
      '/api/sketch/word-sketch',
      request
    )
    return response.data
  },

  /**
   * Generate Sketch Difference comparing two words
   */
  async generateDifference(request: SketchDifferenceRequest) {
    const response = await api.post<{ success: boolean; data: SketchDifferenceResult; error?: string }>(
      '/api/sketch/difference',
      request
    )
    return response.data
  },

  /**
   * Search collocations in corpus
   */
  async searchCollocations(request: SearchCollocationsRequest) {
    const response = await api.post<{ success: boolean; data: SearchCollocationsResult; error?: string }>(
      '/api/sketch/search',
      request
    )
    return response.data
  },

  /**
   * Get POS filter options
   */
  async getPosOptions() {
    const response = await api.get<{ success: boolean; data: POSOption[] }>(
      '/api/sketch/pos-options'
    )
    return response.data
  },

  /**
   * Get all relation types
   */
  async getRelationTypes() {
    const response = await api.get<{ success: boolean; data: RelationType[] }>(
      '/api/sketch/relations'
    )
    return response.data
  },

  /**
   * Annotate corpus with sketch data
   */
  async annotateCorpus(corpusId: string, textIds: string | string[] = 'all', minFrequency: number = 1) {
    const response = await api.post<{ success: boolean; data: any; error?: string }>(
      '/api/sketch/annotate',
      {
        corpus_id: corpusId,
        text_ids: textIds,
        min_frequency: minFrequency
      }
    )
    return response.data
  }
}

export default sketchApi


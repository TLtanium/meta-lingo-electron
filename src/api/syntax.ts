/**
 * Syntax Analysis API
 * Client for constituency and dependency parsing endpoints
 */

import { api } from './client'
import type { ApiResponse } from '../types'

// Types for syntax analysis
export interface SyntaxRequest {
  sentence: string
  language?: string
}

export interface DependencyOptions {
  compact?: boolean
  collapse_punct?: boolean
  collapse_phrases?: boolean
}

export interface TreeNode {
  label: string
  children: TreeNode[]
  text: string
  isLeaf?: boolean
}

export interface ConstituencyResponse {
  success: boolean
  tree_string: string
  tree_data: TreeNode | null
  sentence: string
  error: string | null
}

export interface DependencyToken {
  id: number
  text: string
  lemma: string
  pos: string
  tag: string
  dep: string
  head_id: number
  head_text: string
}

export interface DependencyArc {
  start: number
  end: number
  label: string
  dir: 'left' | 'right'
}

export interface DependencyResponse {
  success: boolean
  svg_html: string
  tokens: DependencyToken[]
  arcs: DependencyArc[]
  sentence: string
  error: string | null
}

export interface SyntaxStatus {
  constituency_available: boolean
  dependency_available: boolean
  dependency_languages: string[]
}

export interface LabelDescriptions {
  labels: Record<string, string>
}

/**
 * Syntax Analysis API client
 */
export const syntaxApi = {
  /**
   * Analyze constituency structure of a sentence
   */
  analyzeConstituency: async (
    sentence: string,
    language: string = 'english'
  ): Promise<ApiResponse<ConstituencyResponse>> => {
    return api.post<ConstituencyResponse>('/api/syntax/constituency', {
      sentence,
      language
    })
  },

  /**
   * Analyze dependency structure of a sentence
   */
  analyzeDependency: async (
    sentence: string,
    language: string = 'english',
    options?: DependencyOptions
  ): Promise<ApiResponse<DependencyResponse>> => {
    return api.post<DependencyResponse>('/api/syntax/dependency', {
      sentence,
      language,
      compact: options?.compact ?? false,
      collapse_punct: options?.collapse_punct ?? true,
      collapse_phrases: options?.collapse_phrases ?? false
    })
  },

  /**
   * Get syntax service status
   */
  getStatus: async (): Promise<ApiResponse<SyntaxStatus>> => {
    return api.get<SyntaxStatus>('/api/syntax/status')
  },

  /**
   * Get dependency label descriptions
   */
  getDependencyLabels: async (): Promise<ApiResponse<LabelDescriptions>> => {
    return api.get<LabelDescriptions>('/api/syntax/labels/dependency')
  },

  /**
   * Get constituency label descriptions
   */
  getConstituencyLabels: async (): Promise<ApiResponse<LabelDescriptions>> => {
    return api.get<LabelDescriptions>('/api/syntax/labels/constituency')
  }
}

export default syntaxApi

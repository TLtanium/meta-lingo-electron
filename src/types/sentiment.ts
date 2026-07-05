/**
 * Sentiment analysis types (NRC-based)
 */

import type { POSFilterConfig, SearchConfig } from './wordFrequency'

export type SentimentAnalysisMode = 'polarity' | 'dimension'

export interface SentimentRequest {
  corpus_id: string
  text_ids: string[] | 'all'
  pos_filter?: POSFilterConfig
  search_config?: SearchConfig
  min_freq: number
  max_freq?: number
  lowercase: boolean
  analysis_mode: SentimentAnalysisMode
}

export interface SentimentResultRow {
  word: string           // In USAS mode: domain code (e.g. "A1.1")
  domain_name?: string   // USAS mode only: human-readable domain name
  total: number
  percentage: number
  /** Lemma of `word`, for cross-module lemma linking (Word Sketch); not set in USAS mode */
  lemma?: string
  [key: string]: number | string | undefined  // positive, negative, neutral | anger, ... trust, others
}

export interface SentimentResponse {
  success: boolean
  summary: Record<string, number>
  results: SentimentResultRow[]
  analysis_mode: SentimentAnalysisMode
  error?: string
}

/** Which emotions to show: key = emotion key, value = visible */
export type SentimentEmotionFilterPolarity = Record<'positive' | 'negative' | 'neutral', boolean>
export type SentimentEmotionFilterDimension = Record<
  'anger' | 'anticipation' | 'disgust' | 'fear' | 'joy' | 'sadness' | 'surprise' | 'trust' | 'others',
  boolean
>

export const DEFAULT_EMOTION_FILTER_POLARITY: SentimentEmotionFilterPolarity = {
  positive: true,
  negative: true,
  neutral: true
}

export const DEFAULT_EMOTION_FILTER_DIMENSION: SentimentEmotionFilterDimension = {
  anger: true,
  anticipation: true,
  disgust: true,
  fear: true,
  joy: true,
  sadness: true,
  surprise: true,
  trust: true,
  others: true
}

/**
 * Multidimensional Analysis (Biber 1988 / MAT) types
 */

export interface MDARequest {
  corpus_id: string
  text_ids: string[] | 'all'
  ttr_tokens?: number
  z_correction?: boolean
  excluded_features?: string[]
  top_words?: number
}

export interface MDAFeatureWord {
  word: string
  count: number
}

export interface MDAFeatureLoading {
  dimension: number
  sign: 1 | -1
}

export interface MDAFeatureSummary {
  code: string
  name_en: string
  name_zh: string
  raw_total: number | null
  mean: number
  sd: number
  biber_mean: number | null
  biber_sd: number | null
  zscore: number
  loading?: MDAFeatureLoading | null
  top_words?: MDAFeatureWord[]
}

export interface MDATextResult {
  text_id: string
  filename: string
  tokens: number
  awl: number
  ttr: number
  normalized: Record<string, number>
  counts: Record<string, number>
  zscores: Record<string, number>
  dimensions: Record<string, number>
  closest_text_type: string
}

export interface MDACorpusSummary {
  text_count: number
  total_tokens: number
  awl: number
  ttr: number
  dimensions: Record<string, number>
  dimension_ranges: Record<string, [number, number]>
  zscores: Record<string, number>
  closest_text_type: string
  closest_genres: Record<string, string>
  overused_features: string[]
  underused_features: string[]
}

export interface MDAResponse {
  success: boolean
  error?: string
  texts?: MDATextResult[]
  corpus?: MDACorpusSummary
  features?: MDAFeatureSummary[]
  skipped_texts?: string[]
  params?: {
    ttr_tokens: number
    z_correction: boolean
    excluded_features: string[]
  }
}

export interface MDAVisualizationConfig {
  chartType: 'dimension' | 'texttype' | 'zscore'
  dimension: number
  showTexts: boolean
}

export const DEFAULT_MDA_VIZ_CONFIG: MDAVisualizationConfig = {
  chartType: 'dimension',
  dimension: 1,
  showTexts: true
}

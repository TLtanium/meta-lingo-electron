/**
 * N-gram Analysis Types
 */

// ==================== POS Filter ====================
// Reuse from wordFrequency types
export interface POSFilterConfig {
  selectedPOS: string[]
  keepMode: boolean  // true=keep selected POS, false=filter out selected POS
}

export interface POSTagInfo {
  tag: string
  description_en: string
  description_zh: string
}

// ==================== Search Config ====================

export type SearchType = 'all' | 'starts' | 'ends' | 'contains' | 'contains_word' | 'regex' | 'wordlist'

export interface SearchConfig {
  searchType: SearchType
  searchValue: string
  excludeWords: string[]
}

// ==================== N-gram Config ====================

export interface NGramConfig {
  nValues: number[]  // 2-6, can select multiple
  nestNgram: boolean  // Enable Nest N-gram grouping
  minWordLength: number
}

// ==================== Analysis Request/Response ====================

export interface NGramRequest {
  corpus_id: string
  text_ids: string[] | 'all'
  n_values: number[]
  pos_filter?: POSFilterConfig
  search_config?: SearchConfig
  min_freq: number
  max_freq?: number | null
  min_word_length: number
  lowercase: boolean
  nest_ngram: boolean
}

export interface NestedNGram {
  ngram: string
  n: number
  frequency: number
  words: string[]
}

export interface NGramResult {
  ngram: string
  n: number
  frequency: number
  percentage: number
  rank: number
  words: string[]
  nested?: NestedNGram[]  // For Nest N-gram mode
}

export interface NGramResponse {
  success: boolean
  results: NGramResult[]
  total_ngrams: number
  unique_ngrams: number
  n_values: number[]
  error?: string
}

// ==================== Visualization Types ====================

export type NGramChartType = 'bar' | 'network' | 'sankey' | 'wordcloud'

export interface NGramVisualizationConfig {
  chartType: NGramChartType
  maxItems: number  // For backward compatibility, but use maxItemsByType instead
  maxItemsByType?: {
    bar?: number
    network?: number
    sankey?: number
    wordcloud?: number
  }
  colorScheme: string
  showPercentage: boolean
}

// ==================== Table State ====================

export type SortDirection = 'asc' | 'desc'

export interface TableSortConfig {
  column: keyof NGramResult | 'ngram' | 'frequency' | 'percentage' | 'n'
  direction: SortDirection
}

export interface TablePaginationConfig {
  page: number
  rowsPerPage: number
}

// ==================== Default Values ====================

export const DEFAULT_POS_FILTER: POSFilterConfig = {
  selectedPOS: ['PUNCT', 'SYM', 'X'],  // Default filter punctuation, symbols, other
  keepMode: false  // Default filter mode
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  searchType: 'all',
  searchValue: '',
  excludeWords: []
}

export const DEFAULT_NGRAM_CONFIG: NGramConfig = {
  nValues: [2],  // Default to bigrams
  nestNgram: false,
  minWordLength: 1
}

export const DEFAULT_VIZ_CONFIG: NGramVisualizationConfig = {
  chartType: 'bar',
  maxItems: 20,
  colorScheme: 'green',
  showPercentage: true
}

export const DEFAULT_TABLE_SORT: TableSortConfig = {
  column: 'frequency',
  direction: 'desc'
}

export const DEFAULT_TABLE_PAGINATION: TablePaginationConfig = {
  page: 0,
  rowsPerPage: 25
}

// ==================== N Value Options ====================

export const N_VALUE_OPTIONS = [
  { value: 2, label: 'Bigram (2)' },
  { value: 3, label: 'Trigram (3)' },
  { value: 4, label: '4-gram' },
  { value: 5, label: '5-gram' },
  { value: 6, label: '6-gram' }
]

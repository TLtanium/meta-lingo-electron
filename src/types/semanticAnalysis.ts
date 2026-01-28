/**
 * Semantic Domain Analysis Types
 */

// ==================== Request Types ====================

export interface POSFilterConfig {
  selectedPOS: string[]
  keepMode: boolean  // true=keep selected, false=filter selected
}

export interface SearchConfig {
  searchType: 'all' | 'starts' | 'ends' | 'contains' | 'regex' | 'wordlist'
  searchValue: string
  excludeWords: string[]
  searchTarget?: 'word' | 'lemma'
}

export interface SemanticAnalysisRequest {
  corpus_id: string
  text_ids: string[] | 'all'
  pos_filter?: POSFilterConfig
  search_config?: SearchConfig
  min_freq: number
  max_freq?: number
  lowercase: boolean
  result_mode: 'domain' | 'word'
}

export interface DomainWordsRequest {
  corpus_id: string
  domain: string
  text_ids: string[] | 'all'
  lowercase: boolean
}

// ==================== Result Types ====================

export interface SemanticDomainResult {
  rank: number
  domain: string
  domain_name: string
  category: string
  category_name: string
  frequency: number
  percentage: number
  words?: string[]
}

export interface SemanticWordResult {
  rank: number
  word: string
  domain: string
  domain_name: string
  category: string
  category_name: string
  pos: string
  frequency: number
  percentage: number
  is_metaphor?: boolean
}

export interface SemanticAnalysisResponse {
  success: boolean
  results: SemanticDomainResult[] | SemanticWordResult[]
  total_tokens: number
  unique_domains: number
  unique_words: number
  result_mode: 'domain' | 'word'
  error?: string
}

export interface DomainWordItem {
  word: string
  frequency: number
  is_metaphor?: boolean
}

export interface DomainWordsResponse {
  success: boolean
  domain: string
  domain_name: string
  words: DomainWordItem[]
  total_words: number
  error?: string
}

// ==================== Category Types ====================

export interface MajorCategory {
  code: string
  name: string
}

// ==================== Chart Data Types ====================

export interface DomainChartData {
  domain: string
  domain_name: string
  frequency: number
  percentage: number
  category: string
}

export interface WordChartData {
  word: string
  domain: string
  frequency: number
  percentage: number
}

// ==================== Filter State Types ====================

export interface SemanticAnalysisFilters {
  posFilter: POSFilterConfig
  searchConfig: SearchConfig
  minFreq: number
  maxFreq?: number
  lowercase: boolean
  resultMode: 'domain' | 'word'
}

export const defaultSemanticAnalysisFilters: SemanticAnalysisFilters = {
  posFilter: {
    selectedPOS: [],
    keepMode: false  // 默认过滤模式
  },
  searchConfig: {
    searchType: 'all',
    searchValue: '',
    excludeWords: []
  },
  minFreq: 1,
  maxFreq: undefined,
  lowercase: true,
  resultMode: 'domain'
}

// ==================== Sort Types ====================

export type SortField = 'rank' | 'domain' | 'word' | 'frequency' | 'percentage'
export type SortOrder = 'asc' | 'desc'

export interface SortConfig {
  field: SortField
  order: SortOrder
}

// ==================== View State Types ====================

export interface SemanticAnalysisState {
  selectedCorpusId: string | null
  selectedTextIds: string[] | 'all'
  filters: SemanticAnalysisFilters
  results: SemanticAnalysisResponse | null
  domainWords: DomainWordsResponse | null
  selectedDomain: string | null
  sortConfig: SortConfig
  isLoading: boolean
  error: string | null
}

export const initialSemanticAnalysisState: SemanticAnalysisState = {
  selectedCorpusId: null,
  selectedTextIds: 'all',
  filters: defaultSemanticAnalysisFilters,
  results: null,
  domainWords: null,
  selectedDomain: null,
  sortConfig: {
    field: 'frequency',
    order: 'desc'
  },
  isLoading: false,
  error: null
}

// ==================== Visualization Types ====================

export type ChartType = 'bar' | 'pie' | 'treemap'

export interface VisualizationConfig {
  chartType: ChartType
  showTopN: number
  showLabels: boolean
  showPercentage: boolean
  colorScheme?: string
}

export const defaultVisualizationConfig: VisualizationConfig = {
  chartType: 'bar',
  showTopN: 20,
  showLabels: true,
  showPercentage: true,
  colorScheme: 'blue'
}

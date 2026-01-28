/**
 * Word Frequency Analysis Types
 */

// ==================== POS Filter ====================

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

export type SearchType = 'all' | 'starts' | 'ends' | 'contains' | 'regex' | 'wordlist'
export type SearchTarget = 'word' | 'lemma'  // word=词形, lemma=词元

export interface SearchConfig {
  searchType: SearchType
  searchValue: string
  excludeWords: string[]
  searchTarget: SearchTarget  // 搜索目标: word=词形, lemma=词元
  removeStopwords: boolean  // 移除停用词 (基于语料语言)
}

// ==================== Word Cloud Config ====================

export type WordCloudEngine = 'd3' | 'legacy'  // D3.js (default) or legacy Python wordcloud

export type WordCloudStyle = 'default' | 'mask' | 'imageColor'
// 对应旧版样式: 默认, 使用蒙版, 基于图片颜色

export const WORDCLOUD_COLORMAPS = [
  'viridis',
  'inferno',
  'autumn',
  'plasma',
  'winter',
  'rainbow',
  'ocean',
  'forest',
  'sunset'
] as const

export type WordCloudColormap = typeof WORDCLOUD_COLORMAPS[number]

export interface WordCloudConfig {
  engine?: WordCloudEngine  // Engine type: 'd3' (default) or 'legacy'
  style: WordCloudStyle
  maxWords: number  // 0 or very large number means all words
  useAllWords?: boolean  // Use all words (for legacy engine, locks maxWords)
  colormap: WordCloudColormap
  maskImage?: string | null  // base64 or URL (optional, for legacy engine)
  maskImageFile?: File | null  // File object for upload (optional, for legacy engine)
}

// ==================== Analysis Request/Response ====================

export interface WordFrequencyRequest {
  corpus_id: string
  text_ids: string[] | 'all'
  pos_filter?: POSFilterConfig
  search_config?: SearchConfig
  min_freq: number
  max_freq?: number
  lowercase: boolean
}

export interface WordFrequencyResult {
  word: string
  frequency: number
  percentage: number
  rank: number
}

export interface WordFrequencyResponse {
  success: boolean
  results: WordFrequencyResult[]
  total_tokens: number
  unique_words: number
  error?: string
}

// ==================== Visualization Types ====================

export type ChartType = 'bar' | 'pie' | 'wordcloud'

export interface VisualizationConfig {
  chartType: ChartType
  maxItems: number  // For backward compatibility, but use maxItemsByType instead
  maxItemsByType?: {
    bar?: number
    pie?: number
    wordcloud?: number
  }
  showPercentage: boolean
  colorScheme: string
  wordCloudConfig?: WordCloudConfig
  wordCloudEngine?: WordCloudEngine  // Engine type for word cloud: 'd3' (default) or 'legacy'
  legacyWordCloudConfig?: WordCloudConfig  // Separate config for legacy engine
}

// ==================== Table State ====================

export type SortDirection = 'asc' | 'desc'

export interface TableSortConfig {
  column: keyof WordFrequencyResult
  direction: SortDirection
}

export interface TablePaginationConfig {
  page: number
  rowsPerPage: number
}

// ==================== Component Props ====================

export interface WordFrequencyState {
  // Data
  results: WordFrequencyResult[]
  isLoading: boolean
  error?: string
  
  // Filters
  posFilter: POSFilterConfig
  searchConfig: SearchConfig
  minFreq: number
  maxFreq: number | null
  lowercase: boolean
  
  // Table
  sortConfig: TableSortConfig
  paginationConfig: TablePaginationConfig
  selectedWords: string[]
  
  // Visualization
  vizConfig: VisualizationConfig
  
  // Stats
  totalTokens: number
  uniqueWords: number
}

// ==================== Default Values ====================

export const DEFAULT_POS_FILTER: POSFilterConfig = {
  selectedPOS: ['PUNCT', 'SYM', 'X', 'NUM'],  // 默认过滤标点、符号、其他、数词
  keepMode: false  // 默认过滤模式
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  searchType: 'all',
  searchValue: '',
  excludeWords: [],
  searchTarget: 'word',  // 默认搜索词形
  removeStopwords: false  // 默认不移除停用词
}

export const DEFAULT_WORDCLOUD_CONFIG: WordCloudConfig = {
  engine: 'd3',  // Default to D3.js engine
  style: 'default',
  maxWords: 100,  // Default to 100 words
  colormap: 'viridis'
}

export const DEFAULT_LEGACY_WORDCLOUD_CONFIG: WordCloudConfig = {
  engine: 'legacy',
  style: 'default',  // Frontend uses English, backend expects Chinese
  maxWords: 100,
  useAllWords: false,  // Default to limit words
  colormap: 'viridis',
  contourWidth: 0,
  contourColor: 'black'
}

export const DEFAULT_VIZ_CONFIG: VisualizationConfig = {
  chartType: 'bar',
  maxItems: 20,
  showPercentage: true,
  colorScheme: 'blue',
  wordCloudConfig: DEFAULT_WORDCLOUD_CONFIG
}

export const DEFAULT_TABLE_SORT: TableSortConfig = {
  column: 'frequency',
  direction: 'desc'
}

export const DEFAULT_TABLE_PAGINATION: TablePaginationConfig = {
  page: 0,
  rowsPerPage: 25
}


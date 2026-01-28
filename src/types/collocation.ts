/**
 * Co-occurrence Analysis Types
 */

// POS Filter Configuration
export interface POSFilterConfig {
  selectedPOS: string[]
  keepMode: boolean
}

// Search Modes - 6 modes based on Sketch Engine
// simple: word/lemma match with wildcards (*, ?, |, --)
// lemma: lemma-based search with regex support
// phrase: exact phrase match with regex support
// word: exact word form match with regex support
// character: contains specific character/string
// cql: Corpus Query Language
export type SearchMode = 'simple' | 'lemma' | 'phrase' | 'word' | 'character' | 'cql'

// Sort Modes
export type SortMode = 'left_context' | 'right_context' | 'position' | 'frequency' | 'random'

// Sort Level (e.g., "1L", "2L", "3R", "C", "loc", "frec")
export type SortLevel = string

// POS Tag Info
export interface POSTagInfo {
  tag: string
  description_en: string
  description_zh: string
}

// KWIC Search Request
export interface KWICSearchRequest {
  corpus_id: string
  text_ids: string[] | 'all'
  search_mode: SearchMode
  search_value: string
  context_size?: number
  lowercase?: boolean
  pos_filter?: POSFilterConfig
  sort_by?: SortMode
  sort_levels?: SortLevel[]
  sort_descending?: boolean
  max_results?: number
}

// KWIC Result Item
export interface KWICResult {
  position: number
  keyword: string
  left_context: string[]
  right_context: string[]
  text_id: string
  filename: string
  corpus_id: string
  pos?: string
  matched_tokens?: TokenInfo[]
  is_metaphor?: boolean
}

// Token Info
export interface TokenInfo {
  text: string
  word?: string
  lemma?: string
  pos?: string
  tag?: string
  dep?: string
  start?: number
  end?: number
}

// KWIC Search Response
export interface KWICSearchResponse {
  success: boolean
  results: KWICResult[]
  total_count: number
  displayed_count: number
  error?: string
}

// Extended Context Request
export interface ExtendedContextRequest {
  corpus_id: string
  text_id: string
  position: number
  context_chars?: number
}

// Extended Context Response
export interface ExtendedContextResponse {
  success: boolean
  text?: string
  keyword?: string
  highlight_start?: number
  highlight_end?: number
  text_id?: string
  filename?: string
  error?: string
}

// CQL Parse Request
export interface CQLParseRequest {
  query: string
}

// CQL Parse Response
export interface CQLParseResponse {
  valid: boolean
  error?: string
}

// Visualization Types (only density and ridge plots)
export type VizType = 'densityPlot' | 'ridgePlot'

// Visualization Config
export interface VizConfig {
  type: VizType
  maxItems?: number
  colorScheme?: string
}

// Default values
export const DEFAULT_POS_FILTER: POSFilterConfig = {
  selectedPOS: [],  // 默认不选择任何词性
  keepMode: false  // 默认过滤模式（false=过滤掉选中词性, true=只保留选中词性）
}

export const DEFAULT_CONTEXT_SIZE = 5

export const DEFAULT_SORT_LEVELS = ['1L', '2L', '3L']

// Search Mode Labels
export const SEARCH_MODE_LABELS: Record<SearchMode, { en: string; zh: string; desc_en: string; desc_zh: string }> = {
  simple: { 
    en: 'Simple', 
    zh: '简单搜索',
    desc_en: 'Match words or lemmas. Use * for any chars, ? for one char, | for alternatives, -- for hyphen variants.',
    desc_zh: '匹配词形或词元。使用 * 匹配任意字符，? 匹配单个字符，| 表示或，-- 匹配连字符变体。'
  },
  lemma: { 
    en: 'Lemma', 
    zh: '词元搜索',
    desc_en: 'Find all word forms of a lemma. Supports regular expressions.',
    desc_zh: '查找词元的所有词形变化。支持正则表达式。'
  },
  phrase: { 
    en: 'Phrase', 
    zh: '短语搜索',
    desc_en: 'Find exact multi-word phrase. Supports regular expressions.',
    desc_zh: '精确匹配多词短语。支持正则表达式。'
  },
  word: { 
    en: 'Word', 
    zh: '词形搜索',
    desc_en: 'Find exact word form. Supports regular expressions.',
    desc_zh: '精确匹配词形。支持正则表达式。'
  },
  character: { 
    en: 'Character', 
    zh: '字符搜索',
    desc_en: 'Find tokens containing specific characters.',
    desc_zh: '查找包含特定字符或字符串的词。'
  },
  cql: { 
    en: 'CQL', 
    zh: 'CQL查询',
    desc_en: 'Corpus Query Language for complex searches.',
    desc_zh: '语料库查询语言，用于复杂搜索。'
  }
}

// Sort Mode Labels
export const SORT_MODE_LABELS: Record<SortMode, { en: string; zh: string }> = {
  left_context: { en: 'Left context', zh: '左侧上下文' },
  right_context: { en: 'Right context', zh: '右侧上下文' },
  position: { en: 'Position', zh: '出现位置' },
  frequency: { en: 'Frequency', zh: '出现频率' },
  random: { en: 'Random', zh: '随机排列' }
}

// Visualization Type Labels
export const VIZ_TYPE_LABELS: Record<VizType, { en: string; zh: string }> = {
  densityPlot: { en: 'Density Plot', zh: '密度分布图' },
  ridgePlot: { en: 'Ridge Plot', zh: '分组山脊图' }
}

/**
 * Collocation Analysis Types
 * Statistical collocation analysis with 12 association measures
 */

import type { POSFilterConfig, ChartType, VisualizationConfig, WordCloudConfig, WordCloudEngine } from './wordFrequency'

// ==================== Statistical Measures ====================

export type StatisticalMeasure =
  | 'logdice'   // LogDice
  | 'mi'        // Mutual Information
  | 'll'        // Log-Likelihood
  | 'zscore'    // Z-score
  | 'tscore'    // T-score
  | 'logratio'  // Log Ratio
  | 'mi2'       // MI²
  | 'mi3'       // MI³
  | 'dice'      // Dice coefficient
  | 'deltap1'   // Delta P1 (node → collocate)
  | 'deltap2'   // Delta P2 (collocate → node)
  | 'minsens'   // Minimum Sensitivity

// Configuration for each statistical measure card
export interface StatMeasureConfig {
  id: StatisticalMeasure
  enabled: boolean
  threshold: number | null  // null = no threshold filtering
  order: number             // determines column order in table (lower = more left)
}

// Metadata for each measure (for display in dialog)
export interface StatMeasureInfo {
  id: StatisticalMeasure
  name_en: string
  name_zh: string
  description_en: string
  description_zh: string
  defaultThreshold: number | null
  range: string  // e.g., "0-14", "-∞ to +∞", "0-1"
}

// ==================== Analysis Request/Response ====================

export type CollocationMatchMode = 'lemma' | 'word'

export interface CollocationAnalysisRequest {
  corpus_id: string
  text_ids: string[] | 'all'
  node_word: string
  span: number
  pos_filter?: POSFilterConfig
  min_freq: number
  max_freq?: number
  lowercase: boolean
  remove_stopwords: boolean
  exclude_words: string[]
  statistics_methods: StatisticalMeasure[]
  match_mode?: CollocationMatchMode
}

export interface CollocationAnalysisResult {
  collocate: string
  collocation_freq: number   // f_xy: frequency of node + collocate co-occurrence
  total_freq: number         // f_y: total frequency of collocate in corpus
  // Statistical scores (present only if requested)
  logdice?: number
  mi?: number
  ll?: number
  zscore?: number
  tscore?: number
  logratio?: number
  mi2?: number
  mi3?: number
  dice?: number
  deltap1?: number
  deltap2?: number
  minsens?: number
}

export interface CollocationAnalysisResponse {
  success: boolean
  node_word: string
  total_tokens: number
  unique_collocates: number
  node_frequency: number
  results: CollocationAnalysisResult[]
  error?: string
}

// ==================== Visualization Types ====================

export type CollocationChartType = 'bar' | 'pie' | 'network' | 'wordcloud'

export interface CollocationVizConfig {
  chartType: CollocationChartType
  maxItems: number
  maxItemsByType?: {
    bar?: number
    pie?: number
    network?: number
    wordcloud?: number
  }
  showPercentage: boolean
  colorScheme: string
  // Network graph specific
  networkScoreMetric: StatisticalMeasure  // which score to use for node sizing
  // Word cloud
  wordCloudConfig?: WordCloudConfig
  wordCloudEngine?: WordCloudEngine
  legacyWordCloudConfig?: WordCloudConfig
}

// ==================== Table State ====================

export type SortableColumn = 'collocate' | 'collocation_freq' | 'total_freq' | StatisticalMeasure

export interface CollocationTableSortConfig {
  column: SortableColumn
  direction: 'asc' | 'desc'
}

export interface CollocationTablePaginationConfig {
  page: number
  rowsPerPage: number
}

// ==================== Default Values ====================

export const STAT_MEASURE_INFO: StatMeasureInfo[] = [
  {
    id: 'logdice',
    name_en: 'LogDice',
    name_zh: 'LogDice',
    description_en: 'Logarithmic version of the Dice coefficient. Range roughly 0-14, unaffected by corpus size.',
    description_zh: 'Dice系数的对数版本。范围约0-14，不受语料库大小影响。',
    defaultThreshold: null,
    range: '0-14'
  },
  {
    id: 'mi',
    name_en: 'MI (Mutual Information)',
    name_zh: 'MI（互信息）',
    description_en: 'Measures how much more frequent the co-occurrence is than expected by chance. Favors low-frequency collocates.',
    description_zh: '衡量共现频率相对于随机期望的超出程度。倾向于低频搭配词。',
    defaultThreshold: 3.0,
    range: '-∞ to +∞'
  },
  {
    id: 'll',
    name_en: 'LL (Log-Likelihood)',
    name_zh: 'LL（对数似然）',
    description_en: 'G² statistic testing if the co-occurrence is significantly different from chance. 6.63 ≈ p<0.01.',
    description_zh: 'G²统计量，检验共现是否显著不同于随机。6.63 ≈ p<0.01。',
    defaultThreshold: 6.63,
    range: '0 to +∞'
  },
  {
    id: 'zscore',
    name_en: 'Z-score',
    name_zh: 'Z分数',
    description_en: 'Standardized deviation of observed from expected frequency. 1.96 ≈ p<0.05.',
    description_zh: '观察频率与期望频率的标准化偏差。1.96 ≈ p<0.05。',
    defaultThreshold: 1.96,
    range: '-∞ to +∞'
  },
  {
    id: 'tscore',
    name_en: 'T-score',
    name_zh: 'T分数',
    description_en: 'Similar to Z-score but uses observed frequency for variance. Favors high-frequency collocates.',
    description_zh: '类似Z分数，但使用观察频率计算方差。倾向于高频搭配词。',
    defaultThreshold: 1.96,
    range: '-∞ to +∞'
  },
  {
    id: 'logratio',
    name_en: 'Log Ratio',
    name_zh: '对数比',
    description_en: 'Log₂ of the ratio of observed to expected probability. Measures effect size.',
    description_zh: '观察概率与期望概率之比的log₂值。衡量效应大小。',
    defaultThreshold: null,
    range: '-∞ to +∞'
  },
  {
    id: 'mi2',
    name_en: 'MI² (Mutual Information²)',
    name_zh: 'MI²（互信息平方）',
    description_en: 'Squared variant of MI. Less biased toward low-frequency items than MI.',
    description_zh: 'MI的平方变体。比MI更少偏向低频项。',
    defaultThreshold: 3.0,
    range: '-∞ to +∞'
  },
  {
    id: 'mi3',
    name_en: 'MI³ (Mutual Information³)',
    name_zh: 'MI³（互信息立方）',
    description_en: 'Cubed variant of MI. Further reduces low-frequency bias, favors mid-frequency collocates.',
    description_zh: 'MI的立方变体。进一步减少低频偏差，倾向于中频搭配词。',
    defaultThreshold: 3.0,
    range: '-∞ to +∞'
  },
  {
    id: 'dice',
    name_en: 'Dice Coefficient',
    name_zh: 'Dice系数',
    description_en: 'Harmonic mean of conditional probabilities. Range 0-1.',
    description_zh: '条件概率的调和平均值。范围0-1。',
    defaultThreshold: null,
    range: '0-1'
  },
  {
    id: 'deltap1',
    name_en: 'Delta P1 (Node → Collocate)',
    name_zh: 'Delta P1（节点词→搭配词）',
    description_en: 'P(collocate|node) - P(collocate|¬node). Directional association from node to collocate.',
    description_zh: 'P(搭配词|节点词) - P(搭配词|非节点词)。从节点词到搭配词的方向性关联。',
    defaultThreshold: null,
    range: '-1 to 1'
  },
  {
    id: 'deltap2',
    name_en: 'Delta P2 (Collocate → Node)',
    name_zh: 'Delta P2（搭配词→节点词）',
    description_en: 'P(node|collocate) - P(node|¬collocate). Directional association from collocate to node.',
    description_zh: 'P(节点词|搭配词) - P(节点词|非搭配词)。从搭配词到节点词的方向性关联。',
    defaultThreshold: null,
    range: '-1 to 1'
  },
  {
    id: 'minsens',
    name_en: 'Minimum Sensitivity',
    name_zh: '最小敏感度',
    description_en: 'min(f_xy/f_x, f_xy/f_y). Conservative measure of bidirectional association.',
    description_zh: 'min(f_xy/f_x, f_xy/f_y)。保守的双向关联度量。',
    defaultThreshold: null,
    range: '0-1'
  }
]

export const DEFAULT_STAT_CONFIGS: StatMeasureConfig[] = [
  { id: 'logdice', enabled: true, threshold: null, order: 0 },
  { id: 'mi', enabled: true, threshold: 3.0, order: 1 },
  { id: 'deltap1', enabled: true, threshold: null, order: 2 },
  { id: 'deltap2', enabled: true, threshold: null, order: 3 },
  { id: 'll', enabled: false, threshold: 6.63, order: 4 },
  { id: 'zscore', enabled: false, threshold: 1.96, order: 5 },
  { id: 'tscore', enabled: false, threshold: 1.96, order: 6 },
  { id: 'logratio', enabled: false, threshold: null, order: 7 },
  { id: 'mi2', enabled: false, threshold: 3.0, order: 8 },
  { id: 'mi3', enabled: false, threshold: 3.0, order: 9 },
  { id: 'dice', enabled: false, threshold: null, order: 10 },
  { id: 'minsens', enabled: false, threshold: null, order: 11 }
]

// All statistical methods (always computed on backend, UI only filters display)
export const ALL_STAT_METHODS: StatisticalMeasure[] = [
  'logdice', 'mi', 'll', 'zscore', 'tscore', 'logratio',
  'mi2', 'mi3', 'dice', 'deltap1', 'deltap2', 'minsens'
]

export const DEFAULT_SPAN = 5
export const MIN_SPAN = 1
export const MAX_SPAN = 15

export const DEFAULT_COLLOCATION_TABLE_SORT: CollocationTableSortConfig = {
  column: 'logdice',
  direction: 'desc'
}

export const DEFAULT_COLLOCATION_TABLE_PAGINATION: CollocationTablePaginationConfig = {
  page: 0,
  rowsPerPage: 25
}

export const DEFAULT_COLLOCATION_VIZ_CONFIG: CollocationVizConfig = {
  chartType: 'bar',
  maxItems: 20,
  showPercentage: false,
  colorScheme: 'blue',
  networkScoreMetric: 'logdice',
  wordCloudConfig: {
    engine: 'd3',
    style: 'default',
    maxWords: 100,
    colormap: 'viridis'
  }
}

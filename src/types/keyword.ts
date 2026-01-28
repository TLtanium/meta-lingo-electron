/**
 * Keyword Extraction Types
 * Types for both single-document algorithms and keyness comparison methods
 */

// ==================== Common Types ====================

export interface POSFilterConfig {
  selectedPOS: string[]
  keepMode: boolean  // true=keep selected POS, false=filter out selected POS
}

export interface POSTagInfo {
  tag: string
  description_en: string
  description_zh: string
}

// ==================== Stopwords Configuration ====================

export interface StopwordsConfig {
  removeStopwords: boolean
  excludeWords: string[]
}

// ==================== Statistical Threshold Configuration ====================

export interface ThresholdConfig {
  minScore?: number      // Minimum statistical score threshold
  maxPValue?: number     // Maximum p-value threshold
}

// Default thresholds for each statistic (academic standards)
export interface StatisticThresholds {
  [key: string]: {
    min_score: number
    p_value: number | null
  }
}

// ==================== Corpus Resource Types ====================

export interface CorpusResource {
  id: string              // e.g., 'bnc_commerce_finance', 'oanc_total'
  name_en: string         // e.g., 'BNC(Commerce&Finance)'
  name_zh: string         // e.g., 'BNC(商业与金融)'
  prefix: string          // e.g., 'bnc', 'oanc', 'now', 'brown'
  category: string        // e.g., 'commerce_finance', 'total', 'spoken'
  tags_en: string[]       // e.g., ['BNC', 'commerce', 'finance']
  tags_zh: string[]       // e.g., ['BNC', '商业', '金融']
  file_size: number       // File size in bytes
  word_count: number      // Number of unique words
  description_en: string
  description_zh: string
}

export interface CorpusResourceSearchParams {
  query?: string
  tags?: string[]
  lang?: 'en' | 'zh'
}

// ==================== Single Document Algorithms ====================

export type SingleDocAlgorithm = 'tfidf' | 'textrank' | 'yake' | 'rake'

export interface TFIDFConfig {
  maxFeatures: number      // Maximum number of keywords to extract
  minDf: number           // Minimum document frequency (0-1 for proportion)
  maxDf: number           // Maximum document frequency (0-1 for proportion)
  ngramRange: [number, number]  // N-gram range for keywords
}

export interface TextRankConfig {
  windowSize: number      // Co-occurrence window size
  damping: number         // Damping factor (typically 0.85)
  maxIter: number         // Maximum iterations
  topN: number            // Top N keywords to return
}

export interface YAKEConfig {
  maxNgramSize: number    // Maximum n-gram size
  dedupThreshold: number  // Deduplication threshold
  topN: number            // Number of keywords to extract
  windowSize: number      // Window size for feature extraction
}

export interface RAKEConfig {
  minLength: number       // Minimum keyword length (in words)
  maxLength: number       // Maximum keyword length (in words)
  minFrequency: number    // Minimum word frequency
  topN: number            // Number of keywords to extract
}

export interface SingleDocConfig {
  algorithm: SingleDocAlgorithm
  tfidf: TFIDFConfig
  textrank: TextRankConfig
  yake: YAKEConfig
  rake: RAKEConfig
}

export interface SingleDocRequest {
  corpus_id: string
  text_ids: string[] | 'all'
  algorithm: SingleDocAlgorithm
  config: TFIDFConfig | TextRankConfig | YAKEConfig | RAKEConfig
  pos_filter?: POSFilterConfig
  lowercase: boolean
  stopwords_config?: StopwordsConfig
  language?: string
}

export interface SingleDocKeyword {
  keyword: string
  score: number
  frequency: number
  rank: number
  algorithm: string
}

export interface SingleDocResponse {
  success: boolean
  results: SingleDocKeyword[]
  total_keywords: number
  algorithm: string
  error?: string
}

// ==================== Keyness Comparison Methods ====================

export type KeynessStatistic = 
  | 'log_likelihood'    // Log-Likelihood (G²)
  | 'chi_squared'       // Chi-squared (χ²)
  | 'log_ratio'         // Log Ratio
  | 'dice'              // Dice coefficient
  | 'mi'                // Mutual Information
  | 'mi3'               // MI³ (cubed MI for rare words)
  | 't_score'           // T-score
  | 'simple_keyness'    // Simple frequency ratio
  | 'fishers_exact'     // Fisher's Exact Test

export interface KeynessConfig {
  statistic: KeynessStatistic
  minFreqStudy: number      // Minimum frequency in study corpus
  minFreqRef: number        // Minimum frequency in reference corpus
  pValue: number            // P-value threshold for significance
  showNegative: boolean     // Show negative keywords (unusually infrequent)
  effectSizeThreshold: number  // Minimum effect size (for Log Ratio)
}

export interface KeynessRequest {
  study_corpus_id: string
  study_text_ids: string[] | 'all'
  reference_corpus_id: string
  reference_text_ids: string[] | 'all'
  statistic: KeynessStatistic
  config: KeynessConfig
  pos_filter?: POSFilterConfig
  lowercase: boolean
  stopwords_config?: StopwordsConfig
  language?: string
  threshold_config?: ThresholdConfig
}

export interface KeynessResourceRequest {
  study_corpus_id: string
  study_text_ids: string[] | 'all'
  resource_id: string
  statistic: KeynessStatistic
  config: KeynessConfig
  pos_filter?: POSFilterConfig
  lowercase: boolean
  stopwords_config?: StopwordsConfig
  language?: string
  threshold_config?: ThresholdConfig
}

export interface KeynessKeyword {
  keyword: string
  study_freq: number        // Frequency in study corpus
  ref_freq: number          // Frequency in reference corpus
  study_norm: number        // Normalized frequency (per million) in study
  ref_norm: number          // Normalized frequency (per million) in ref
  score: number             // Statistical score (LL, χ², etc.)
  effect_size: number       // Effect size (Log Ratio)
  p_value: number           // P-value (if applicable)
  significance: string      // Significance level ('***', '**', '*', '')
  direction: 'positive' | 'negative'  // Over/under-represented
  rank: number
}

export interface KeynessResponse {
  success: boolean
  results: KeynessKeyword[]
  total_keywords: number
  study_corpus_size: number
  ref_corpus_size: number
  statistic: string
  error?: string
}

// ==================== Algorithm/Statistic Info ====================

export interface AlgorithmInfo {
  id: SingleDocAlgorithm
  name_en: string
  name_zh: string
  description_en: string
  description_zh: string
}

export interface StatisticInfo {
  id: KeynessStatistic
  name_en: string
  name_zh: string
  description_en: string
  description_zh: string
  formula?: string
}

// ==================== Visualization Types ====================

export type KeywordChartType = 'bar' | 'pie' | 'wordcloud'

export interface KeywordVisualizationConfig {
  chartType: KeywordChartType
  maxItems: number
  showPercentage: boolean
  colorScheme: string
  wordCloudConfig?: WordCloudConfig
}

export interface WordCloudConfig {
  maxWords: number
  colormap: string
}

// ==================== Table State ====================

export type SortDirection = 'asc' | 'desc'

export interface TableSortConfig {
  column: string
  direction: SortDirection
}

export interface TablePaginationConfig {
  page: number
  rowsPerPage: number
}

// ==================== Default Values ====================

export const DEFAULT_TFIDF_CONFIG: TFIDFConfig = {
  maxFeatures: 50,
  minDf: 0.01,
  maxDf: 0.95,
  ngramRange: [1, 2]
}

export const DEFAULT_TEXTRANK_CONFIG: TextRankConfig = {
  windowSize: 4,
  damping: 0.85,
  maxIter: 100,
  topN: 50
}

export const DEFAULT_YAKE_CONFIG: YAKEConfig = {
  maxNgramSize: 3,
  dedupThreshold: 0.9,
  topN: 50,
  windowSize: 2
}

export const DEFAULT_RAKE_CONFIG: RAKEConfig = {
  minLength: 1,
  maxLength: 3,
  minFrequency: 1,
  topN: 50
}

export const DEFAULT_SINGLEDOC_CONFIG: SingleDocConfig = {
  algorithm: 'tfidf',
  tfidf: DEFAULT_TFIDF_CONFIG,
  textrank: DEFAULT_TEXTRANK_CONFIG,
  yake: DEFAULT_YAKE_CONFIG,
  rake: DEFAULT_RAKE_CONFIG
}

export const DEFAULT_KEYNESS_CONFIG: KeynessConfig = {
  statistic: 'log_likelihood',
  minFreqStudy: 3,
  minFreqRef: 3,
  pValue: 0.05,
  showNegative: false,
  effectSizeThreshold: 0
}

export const DEFAULT_POS_FILTER: POSFilterConfig = {
  selectedPOS: ['PUNCT', 'SYM', 'X', 'NUM'],
  keepMode: false
}

export const DEFAULT_STOPWORDS_CONFIG: StopwordsConfig = {
  removeStopwords: false,
  excludeWords: []
}

// Academic standard thresholds for each statistic
export const DEFAULT_STATISTIC_THRESHOLDS: StatisticThresholds = {
  log_likelihood: { min_score: 6.63, p_value: 0.01 },    // LL > 6.63 -> p < 0.01
  chi_squared: { min_score: 6.63, p_value: 0.01 },       // Chi2 > 6.63 -> p < 0.01
  log_ratio: { min_score: 1.0, p_value: null },          // |Log Ratio| > 1
  dice: { min_score: 0, p_value: null },
  mi: { min_score: 0, p_value: null },
  mi3: { min_score: 0, p_value: null },
  t_score: { min_score: 1.96, p_value: 0.05 },           // T-score > 1.96 -> p < 0.05
  simple_keyness: { min_score: 0, p_value: null },
  fishers_exact: { min_score: 0, p_value: 0.01 }         // p < 0.01
}

export const DEFAULT_KEYWORD_VIZ_CONFIG: KeywordVisualizationConfig = {
  chartType: 'bar',
  maxItems: 20,
  showPercentage: false,
  colorScheme: 'blue',
  wordCloudConfig: {
    maxWords: 100,
    colormap: 'viridis'
  }
}

export const DEFAULT_TABLE_SORT: TableSortConfig = {
  column: 'score',
  direction: 'desc'
}

export const DEFAULT_TABLE_PAGINATION: TablePaginationConfig = {
  page: 0,
  rowsPerPage: 25
}

// ==================== Algorithm Descriptions ====================

export const SINGLE_DOC_ALGORITHMS: AlgorithmInfo[] = [
  {
    id: 'tfidf',
    name_en: 'TF-IDF',
    name_zh: 'TF-IDF',
    description_en: 'Term Frequency-Inverse Document Frequency. Measures word importance based on frequency within document vs. across documents.',
    description_zh: '词频-逆文档频率。基于词在文档内和文档间的频率衡量词语重要性。'
  },
  {
    id: 'textrank',
    name_en: 'TextRank',
    name_zh: 'TextRank',
    description_en: 'Graph-based ranking algorithm inspired by PageRank. Words are nodes, co-occurrence relations are edges.',
    description_zh: '受PageRank启发的图排序算法。将词作为节点，共现关系作为边构建图。'
  },
  {
    id: 'yake',
    name_en: 'YAKE!',
    name_zh: 'YAKE!',
    description_en: 'Yet Another Keyword Extractor. Unsupervised method using multiple statistical features without external corpus.',
    description_zh: '基于多种统计特征的无监督方法，无需外部语料库。'
  },
  {
    id: 'rake',
    name_en: 'RAKE',
    name_zh: 'RAKE',
    description_en: 'Rapid Automatic Keyword Extraction. Uses stop words and punctuation to identify candidate phrases.',
    description_zh: '快速自动关键词提取。使用停用词和标点识别候选短语。'
  }
]

export const KEYNESS_STATISTICS: StatisticInfo[] = [
  {
    id: 'log_likelihood',
    name_en: 'Log-Likelihood (G²)',
    name_zh: '对数似然比 (G²)',
    description_en: 'Most reliable significance test for corpus comparison, especially with unequal corpus sizes.',
    description_zh: '语料库对比中最可靠的显著性检验，特别适合语料库大小差异较大的情况。',
    formula: 'G² = 2 * Σ(O * ln(O/E))'
  },
  {
    id: 'chi_squared',
    name_en: 'Chi-squared (χ²)',
    name_zh: '卡方检验 (χ²)',
    description_en: 'Classic statistical test comparing observed and expected frequencies.',
    description_zh: '检验观察频率与期望频率差异的经典统计检验。',
    formula: 'χ² = Σ((O - E)² / E)'
  },
  {
    id: 'log_ratio',
    name_en: 'Log Ratio',
    name_zh: '对数比率',
    description_en: 'Pure effect size measure. Shows how many times more frequent a word is in study corpus.',
    description_zh: '纯效应量指标。显示词在目标语料库中频率是参照语料库的多少倍。',
    formula: 'Log Ratio = log₂(f₁/N₁) - log₂(f₂/N₂)'
  },
  {
    id: 'dice',
    name_en: 'Dice Coefficient',
    name_zh: 'Dice系数',
    description_en: 'Measures association strength between word and corpus. Range [0,1].',
    description_zh: '衡量词与语料库关联强度的指标。取值范围[0,1]。',
    formula: 'Dice = 2 * O₁₁ / (R₁ + C₁)'
  },
  {
    id: 'mi',
    name_en: 'Mutual Information',
    name_zh: '互信息',
    description_en: 'Measures how much information about corpus membership a word provides.',
    description_zh: '衡量词提供多少关于语料库成员信息的指标。',
    formula: 'MI = log₂(O₁₁ * N / (R₁ * C₁))'
  },
  {
    id: 'mi3',
    name_en: 'MI³',
    name_zh: 'MI³',
    description_en: 'Cubed MI, reduces bias towards rare words.',
    description_zh: 'MI的立方形式，减少对低频词的偏好。',
    formula: 'MI³ = log₂(O₁₁³ * N / (R₁ * C₁))'
  },
  {
    id: 't_score',
    name_en: 'T-score',
    name_zh: 'T-score',
    description_en: 'Favors high-frequency words, good for identifying typical collocates.',
    description_zh: '偏向高频词，适合识别典型搭配词。',
    formula: 'T = (O - E) / √O'
  },
  {
    id: 'simple_keyness',
    name_en: 'Simple Keyness',
    name_zh: '简单关键性',
    description_en: 'Simple normalized frequency ratio between corpora.',
    description_zh: '语料库间简单的标准化频率比值。',
    formula: 'Keyness = (f₁/N₁) / (f₂/N₂)'
  },
  {
    id: 'fishers_exact',
    name_en: "Fisher's Exact Test",
    name_zh: 'Fisher精确检验',
    description_en: 'Exact test for small samples, computes exact p-value.',
    description_zh: '适用于小样本的精确检验，计算精确p值。'
  }
]


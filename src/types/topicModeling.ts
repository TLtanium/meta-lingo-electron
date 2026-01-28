/**
 * Topic Modeling Types
 * BERTopic-based topic modeling types for the frontend
 */

// ============ Preprocess Types ============

export interface PreprocessConfig {
  remove_stopwords: boolean
  remove_punctuation: boolean
  lemmatize: boolean
  lowercase: boolean
  min_token_length: number
  pos_filter: string[]
}

export interface ChunkingConfig {
  enabled: boolean
  min_tokens: number  // Minimum tokens per chunk, smaller paragraphs will be merged
  max_tokens: number  // Target max tokens per chunk
  overlap_tokens: number
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  enabled: false,
  min_tokens: 100,   // Paragraphs smaller than this will be merged with next
  max_tokens: 256,   // Target max tokens (SBERT supports up to 512)
  overlap_tokens: 0
}

export interface PreprocessPreview {
  chunk_index?: number
  text_id: string
  original: string
  processed: string
  original_word_count?: number
  original_token_count?: number
  processed_word_count: number
  has_spacy: boolean
}

export interface PreprocessPreviewResult {
  previews: PreprocessPreview[]
  total_chunks: number
  total_texts: number
  texts_processed?: number
  preview_count: number
  config: PreprocessConfig
  chunking_enabled?: boolean
  max_tokens?: number
}

export interface PreprocessStats {
  total: number
  processed: number
  skipped: number
  with_spacy: number
  without_spacy: number
}

// ============ Embedding Types ============

export interface EmbeddingInfo {
  id: string
  corpus_id: string
  path: string
  shape: number[] | null
  size_mb: number
  created_at: string
  has_documents: boolean
  timestamp: string
}

export interface EmbeddingResult {
  embedding_path: string
  documents_path: string
  embedding_id: string
  shape: number[]
  stats: {
    document_count: number
    embedding_dim: number
    encoding_time: number
    model: string
  }
  preprocess_stats?: PreprocessStats
}

export interface ModelInfo {
  model_path: string
  model_name: string
  exists: boolean
  loaded: boolean
  hidden_size?: number
  max_position_embeddings?: number
}

// ============ Analysis Config Types ============

export interface DimReductionConfig {
  method: 'UMAP' | 'PCA'
  params: {
    // UMAP params
    n_neighbors?: number
    n_components?: number
    min_dist?: number
    metric?: string
    random_state?: number
    low_memory?: boolean
    // PCA params
    svd_solver?: string
    whiten?: boolean
  }
}

export interface ClusteringConfig {
  method: 'HDBSCAN' | 'BIRCH' | 'K-Means'
  params: {
    // HDBSCAN params
    min_cluster_size?: number
    min_samples?: number | null
    metric?: string
    cluster_selection_method?: string
    allow_single_cluster?: boolean
    alpha?: number
    // BIRCH params
    threshold?: number
    branching_factor?: number
    // K-Means params
    n_clusters?: number
    init?: string
    max_iter?: number
    tol?: number
    algorithm?: string
    random_state?: number
  }
}

export interface VectorizerConfig {
  type: 'CountVectorizer' | 'TfidfVectorizer'
  params: {
    min_df?: number
    max_df?: number
    ngram_range?: [number, number]
    stop_words?: string[] | null
  }
}

export interface RepresentationModelConfig {
  type: 'KeyBERTInspired' | 'MaximalMarginalRelevance' | 'PartOfSpeech' | 'ZeroShotClassification' | 'Ollama' | null
  params: Record<string, unknown>
}

export interface OutlierConfig {
  enabled: boolean
  strategy: 'distributions' | 'probabilities' | 'c-tf-idf' | 'embeddings'
  threshold: number
}

export interface AnalysisConfig {
  embedding_id: string
  dim_reduction: DimReductionConfig
  clustering: ClusteringConfig
  vectorizer: VectorizerConfig
  representation_model: RepresentationModelConfig
  reduce_outliers: OutlierConfig
  calculate_probabilities: boolean
  dynamic_topic?: {
    enabled: boolean
    date_format: 'year_only' | 'full_date'
    nr_bins: number | null
    evolution_tuning: boolean
    global_tuning: boolean
    corpus_id?: string
    text_ids?: string[]
  }
}

// ============ Analysis Result Types ============

export interface TopicWordItem {
  word: string
  weight: number
}

export interface TopicItem {
  id: number
  name: string
  count: number
  words: TopicWordItem[]
  custom_label?: string
}

export interface DocumentTopicItem {
  index: number
  topic: number
  text_preview: string
  probability?: number
}

export interface AnalysisStats {
  total_documents: number
  total_topics: number
  outlier_count: number
  outlier_percentage: number
  analysis_time?: number
}

export interface TopicAnalysisResult {
  result_id: string
  topics: TopicItem[]
  document_topics: DocumentTopicItem[]
  stats: AnalysisStats
  config?: AnalysisConfig
  topics_over_time?: TopicOverTimeItem[]
  has_dynamic_topics?: boolean
}

// ============ Visualization Types ============

// Available visualization types
export type VisualizationType =
  | 'barchart'
  | 'topics'
  | 'documents'
  | 'hierarchy'
  | 'heatmap'
  | 'term_rank'
  | 'topics_over_time'

export interface BarchartDataItem {
  topic_id: number
  topic_name: string
  words: Array<{ word: string; weight: number }>
}

export interface ScatterDataItem {
  topic_id?: number
  topic_name?: string
  x: number
  y: number
  z?: number
  size?: number
  count?: number
  words?: string
  topic?: number
  doc_preview?: string
}

export interface HierarchyNode {
  name: string
  value?: number
  topic_id?: number
  words?: string
  children?: HierarchyNode[]
}

export interface HeatmapData {
  data: Array<[number, number, number]>
  labels: string[]
  min_value: number
  max_value: number
}

export interface NetworkNode {
  id: string
  name: string
  value: number
  symbolSize: number
  words: string
  category: number
}

export interface NetworkLink {
  source: string
  target: string
  value: number
}

export interface NetworkData {
  nodes: NetworkNode[]
  links: NetworkLink[]
}

export interface TermRankItem {
  topic_id: number
  topic_name: string
  word: string
  rank: number
  weight: number
}

// Plotly figure data structure
export interface PlotlyData {
  data: any[]
  layout: any
  frames?: any[]
}

// Topic info table data
export interface TopicInfoTableData {
  topic_id: number
  topic_name: string
  count: number
  words: string
}

export interface VisualizationData {
  type: VisualizationType
  // Plotly.js data (standard implementation)
  plotly_data?: PlotlyData
  // Topic info table data
  table_data?: TopicInfoTableData[]
  total_topics?: number
  // Legacy ECharts data (for backward compatibility)
  echarts_data?: unknown
  echarts_option?: Record<string, unknown>
  // Error handling
  error?: string
  total_docs?: number
  sample_size?: number
}

// ============ Ollama Types ============

export interface OllamaConnectionStatus {
  connected: boolean
  models: string[]
  url?: string
  error?: string
}

export interface OllamaNamingRequest {
  topics: TopicItem[]
  base_url: string
  model: string
  prompt_template?: string
  language: 'en' | 'zh'
  delay: number
}

// ============ Default Configurations ============

export const DEFAULT_PREPROCESS_CONFIG: PreprocessConfig = {
  // Note: stopwords and punctuation removal are now handled by vectorizer, not during embedding
  remove_stopwords: false,
  remove_punctuation: false,
  lemmatize: false,
  lowercase: false,  // Keep original case for embedding
  min_token_length: 1,
  pos_filter: []
}

export const DEFAULT_DIM_REDUCTION_CONFIG: DimReductionConfig = {
  method: 'UMAP',
  params: {
    n_neighbors: 15,
    n_components: 5,
    min_dist: 0.1,
    metric: 'cosine',
    random_state: 42,
    low_memory: true
  }
}

export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  method: 'HDBSCAN',
  params: {
    min_cluster_size: 5,
    min_samples: null,
    metric: 'euclidean',
    cluster_selection_method: 'eom',
    allow_single_cluster: false,
    alpha: 1.0
  }
}

export const DEFAULT_VECTORIZER_CONFIG: VectorizerConfig = {
  type: 'CountVectorizer',
  params: {
    min_df: 1,
    max_df: 1.0,
    ngram_range: [1, 1],
    stop_words: null
  }
}

export const DEFAULT_OUTLIER_CONFIG: OutlierConfig = {
  enabled: false,
  strategy: 'distributions',
  threshold: 0.0
}

// ============ Dynamic Topic Types ============

export type DateFormatType = 'year_only' | 'full_date'

export interface DynamicTopicConfig {
  enabled: boolean
  date_format: DateFormatType
  nr_bins: number | null
  evolution_tuning: boolean
  global_tuning: boolean
}

export interface TopicOverTimeItem {
  topic: number
  topic_name: string
  words: string
  frequency: number
  timestamp: string
}

export interface TopicsOverTimeData {
  items: TopicOverTimeItem[]
  timestamps: string[]
  topics: number[]
}

export const DEFAULT_DYNAMIC_TOPIC_CONFIG: DynamicTopicConfig = {
  enabled: false,
  date_format: 'year_only',
  nr_bins: null,
  evolution_tuning: true,
  global_tuning: true
}

// ============ LDA Types ============

export interface LDAPreprocessConfig {
  remove_stopwords: boolean
  remove_punctuation: boolean  // Remove punctuation and symbols
  lemmatize: boolean
  lowercase: boolean
  min_word_length: number
  pos_filter: string[]
  pos_keep_mode: boolean  // true for keep mode, false for filter mode
  // Extreme frequency filtering
  min_df: number  // Minimum document frequency (absolute count)
  max_df: number  // Maximum document frequency (ratio 0-1)
}

export interface LDAConfig {
  num_topics: number
  // Gensim params
  passes: number
  iterations: number
  chunksize: number
  update_every: number
  eval_every: number
  minimum_probability: number
  // Common params
  alpha: string  // 'auto', 'symmetric', 'asymmetric', or float value (Gensim supports asymmetric and custom array)
  eta: string    // 'auto', 'symmetric', or float value
  min_df: number
  max_df: number
  top_n_keywords: number
  random_state: number
}

export interface LDATopicKeyword {
  word: string
  weight: number
}

export interface LDATopic {
  topic_id: number
  keywords: LDATopicKeyword[]
  total_weight: number
  custom_label?: string
}

export interface LDADocTopic {
  doc_id: number
  distribution: number[]
  dominant_topic: number
  dominant_topic_weight: number
}

export interface LDAResult {
  success: boolean
  result_id?: string
  error?: string
  num_topics?: number
  num_documents?: number
  vocabulary_size?: number
  topics?: LDATopic[]
  doc_topics?: LDADocTopic[]
  perplexity?: number
  log_likelihood?: number
  coherence?: number
  config?: LDAConfig
  preprocess_stats?: {
    total: number
    processed: number
    skipped: number
    with_spacy: number
    without_spacy: number
    total_original_tokens: number
    total_final_tokens: number
    language: string
  }
  timestamp?: string
}

export interface LDAOptimizeResult {
  success: boolean
  results: Array<{
    num_topics: number
    perplexity: number | null
    coherence: number | null
    log_likelihood: number | null
  }>
  best_by_coherence: {
    num_topics: number
    coherence: number | null
  } | null
  best_by_perplexity: {
    num_topics: number
    perplexity: number | null
  } | null
  topic_range: [number, number]
  step: number
}

export interface POSTagInfo {
  tag: string
  description_en: string
  description_zh: string
}

export const DEFAULT_LDA_PREPROCESS_CONFIG: LDAPreprocessConfig = {
  remove_stopwords: true,
  remove_punctuation: true,
  lemmatize: true,
  lowercase: true,
  min_word_length: 2,
  pos_filter: ['PUNCT', 'SYM', 'X', 'NUM', 'INTJ'],  // Default filter these tags
  pos_keep_mode: false,  // Default to filter mode
  // Extreme frequency filtering
  min_df: 2,     // Minimum document frequency
  max_df: 0.95   // Maximum document frequency ratio
}

export const DEFAULT_LDA_CONFIG: LDAConfig = {
  num_topics: 10,
  passes: 10,
  iterations: 50,
  chunksize: 2000,
  update_every: 1,
  eval_every: 10,
  minimum_probability: 0.01,
  alpha: 'auto',
  eta: 'auto',
  min_df: 2,
  max_df: 0.95,
  top_n_keywords: 10,
  random_state: 42
}


// ============ LSA Types ============

/**
 * LSA preprocessing config - reuses LDA preprocessing service
 */
export interface LSAPreprocessConfig {
  remove_stopwords: boolean
  remove_punctuation: boolean
  lemmatize: boolean
  lowercase: boolean
  min_word_length: number
  pos_filter: string[]
  pos_keep_mode: boolean  // true for keep mode, false for filter mode
  // Extreme frequency filtering
  min_df: number
  max_df: number
}

/**
 * LSA model configuration
 */
export interface LSAConfig {
  num_topics: number
  num_keywords: number
  svd_algorithm: 'randomized' | 'arpack'
  max_features: number
  min_df: number
  max_df: number
  tol: number
  random_state: number
  // Advanced parameters for randomized SVD
  n_iter: number
  n_oversamples: number
  power_iteration_normalizer: 'auto' | 'QR' | 'LU' | 'none'
}

export interface LSATopicKeyword {
  word: string
  weight: number
}

export interface LSATopic {
  topic_id: number
  keywords: LSATopicKeyword[]
  total_weight: number
  custom_label?: string
}

export interface LSADocTopic {
  doc_id: number
  distribution: number[]
  dominant_topic: number
  dominant_topic_weight: number
}

export interface LSAResult {
  success: boolean
  result_id?: string
  error?: string
  num_topics?: number
  num_documents?: number
  vocabulary_size?: number
  topics?: LSATopic[]
  doc_topics?: LSADocTopic[]
  explained_variance_ratio?: number      // Total explained variance ratio
  cumulative_variance?: number[]         // Cumulative explained variance array
  individual_variance?: number[]         // Individual variance for each topic
  singular_values_sum?: number           // Sum of singular values
  training_time?: number
  config?: LSAConfig
  preprocess_stats?: {
    total: number
    processed: number
    skipped: number
    with_spacy: number
    without_spacy: number
    total_original_tokens: number
    total_final_tokens: number
    language: string
  }
  timestamp?: string
}

/**
 * LSA optimization result for VarianceDialog
 */
export interface LSAOptimizeResult {
  success: boolean
  results: Array<{
    num_topics: number
    explained_variance: number      // Total explained variance ratio
    cumulative_variance: number     // Cumulative explained variance
  }>
  best_topic_count: number | null   // Recommended topic count (e.g., reaching 90% variance)
  topic_range: [number, number]
  step: number
}

export const DEFAULT_LSA_PREPROCESS_CONFIG: LSAPreprocessConfig = {
  remove_stopwords: true,
  remove_punctuation: true,
  lemmatize: true,
  lowercase: true,
  min_word_length: 2,
  pos_filter: ['PUNCT', 'SYM', 'X', 'NUM', 'INTJ'],
  pos_keep_mode: false,
  min_df: 2,
  max_df: 0.95
}

export const DEFAULT_LSA_CONFIG: LSAConfig = {
  num_topics: 10,
  num_keywords: 10,
  svd_algorithm: 'randomized',
  max_features: 10000,
  min_df: 2,
  max_df: 0.95,
  tol: 0.0,
  random_state: 42,
  n_iter: 5,
  n_oversamples: 10,
  power_iteration_normalizer: 'auto'
}


// ============ NMF Types ============

/**
 * NMF preprocessing config - reuses LDA preprocessing service
 */
export interface NMFPreprocessConfig {
  remove_stopwords: boolean
  remove_punctuation: boolean
  lemmatize: boolean
  lowercase: boolean
  min_word_length: number
  pos_filter: string[]
  pos_keep_mode: boolean  // true for keep mode, false for filter mode
  // Extreme frequency filtering
  min_df: number
  max_df: number
}

/**
 * NMF model configuration
 */
export interface NMFConfig {
  num_topics: number
  num_keywords: number
  init: 'nndsvd' | 'nndsvda' | 'nndsvdar' | 'random'
  solver: 'cd' | 'mu'
  max_iter: number
  tol: number
  alpha_W: number
  alpha_H: number
  l1_ratio: number
  beta_loss: 'frobenius' | 'kullback-leibler' | 'itakura-saito'
  shuffle: boolean
  random_state: number
  max_features: number
  min_df: number
  max_df: number
}

export interface NMFTopicKeyword {
  word: string
  weight: number
}

export interface NMFTopic {
  topic_id: number
  keywords: NMFTopicKeyword[]
  total_weight: number
  custom_label?: string
}

export interface NMFDocTopic {
  doc_id: number
  distribution: number[]
  dominant_topic: number
  dominant_topic_weight: number
}

export interface NMFResult {
  success: boolean
  result_id?: string
  error?: string
  num_topics?: number
  num_documents?: number
  vocabulary_size?: number
  topics?: NMFTopic[]
  doc_topics?: NMFDocTopic[]
  reconstruction_error?: number    // NMF reconstruction error (lower is better)
  sparsity?: number                // Sparsity ratio of W and H matrices
  n_iter?: number                  // Actual iterations used
  training_time?: number
  config?: NMFConfig
  preprocess_stats?: {
    total: number
    processed: number
    skipped: number
    with_spacy: number
    without_spacy: number
    total_original_tokens: number
    total_final_tokens: number
    language: string
  }
  timestamp?: string
}

/**
 * NMF optimization result for ReconstructionErrorDialog
 */
export interface NMFOptimizeResult {
  success: boolean
  results: Array<{
    num_topics: number
    reconstruction_error: number  // Reconstruction error (lower is better)
  }>
  best_topic_count: number | null       // Topic count with minimum reconstruction error
  best_reconstruction_error: number | null
  topic_range: [number, number]
  step: number
}

export const DEFAULT_NMF_PREPROCESS_CONFIG: NMFPreprocessConfig = {
  remove_stopwords: true,
  remove_punctuation: true,
  lemmatize: true,
  lowercase: true,
  min_word_length: 2,
  pos_filter: ['PUNCT', 'SYM', 'X', 'NUM', 'INTJ'],
  pos_keep_mode: false,
  min_df: 2,
  max_df: 0.95
}

export const DEFAULT_NMF_CONFIG: NMFConfig = {
  num_topics: 10,
  num_keywords: 10,
  init: 'nndsvd',
  solver: 'cd',
  max_iter: 200,
  tol: 1e-4,
  alpha_W: 0.0,
  alpha_H: 0.0,
  l1_ratio: 0.0,
  beta_loss: 'frobenius',
  shuffle: false,
  random_state: 42,
  max_features: 10000,
  min_df: 2,
  max_df: 0.95
}


// ============ LDA Dynamic Topic Types ============

/**
 * Dynamic topic analysis configuration for LDA
 */
export interface LDADynamicConfig {
  enabled: boolean
  date_format: DateFormatType
  nr_bins: number | null
}

export const DEFAULT_LDA_DYNAMIC_CONFIG: LDADynamicConfig = {
  enabled: false,
  date_format: 'year_only',
  nr_bins: null
}

/**
 * Topic evolution time series data
 */
export interface LDATopicEvolutionSeries {
  topic_id: number
  topic_name: string
  values: number[]
  words?: string
}

export interface LDATopicEvolutionData {
  type: string
  timestamps: string[]
  series: LDATopicEvolutionSeries[]
  doc_counts: number[]
}

/**
 * Sankey diagram node
 */
export interface LDASankeyNode {
  id: number
  name: string
  timestamp: string
  topic_id: number
  slice_idx: number
}

/**
 * Sankey diagram link
 */
export interface LDASankeyLink {
  source: number
  target: number
  value: number
  from_topic: number
  to_topic: number
  from_timestamp: string
  to_timestamp: string
}

/**
 * Sankey diagram data
 */
export interface LDASankeyData {
  nodes: LDASankeyNode[]
  links: LDASankeyLink[]
  timestamps: string[]
  num_topics: number
}

/**
 * Similarity matrix heatmap data
 */
export interface LDAHeatmapData {
  type: string
  data: Array<[number, number, number]>  // [row, col, value]
  labels: string[]
  min_value: number
  max_value: number
}

/**
 * Extended LDA result with dynamic analysis data
 */
export interface LDADynamicResult extends LDAResult {
  has_dynamic?: boolean
  dynamic_config?: LDADynamicConfig
  topic_evolution?: LDATopicEvolutionData
  sankey_data?: LDASankeyData
  time_slices?: {
    timestamps: string[]
    doc_slices: number[]
    num_slices: number
  }
  dynamic_error?: string
}

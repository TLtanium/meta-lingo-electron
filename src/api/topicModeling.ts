/**
 * Topic Modeling API Client
 * API functions for BERTopic and LDA topic modeling
 */

import { api } from './client'
import type {
  PreprocessConfig,
  PreprocessPreviewResult,
  PreprocessStats,
  EmbeddingInfo,
  EmbeddingResult,
  ModelInfo,
  AnalysisConfig,
  TopicAnalysisResult,
  VisualizationType,
  VisualizationData,
  OllamaConnectionStatus,
  TopicItem,
  ChunkingConfig,
  LDAPreprocessConfig,
  LDAConfig,
  LDAResult,
  LDAOptimizeResult,
  POSTagInfo,
  LDADynamicConfig,
  LDADynamicResult,
  LDATopicEvolutionData,
  LDASankeyData,
  LDAHeatmapData,
  LSAPreprocessConfig,
  LSAConfig,
  LSAResult,
  LSAOptimizeResult,
  NMFPreprocessConfig,
  NMFConfig,
  NMFResult,
  NMFOptimizeResult
} from '../types/topicModeling'

const BASE_URL = '/api/topic-modeling'

// ============ Preprocess API ============

/**
 * Preview preprocessing results with chunking
 */
export async function previewPreprocess(
  corpusId: string,
  textIds: string[],
  config: PreprocessConfig,
  maxPreview: number = 10,
  language: string = 'english',
  chunking?: ChunkingConfig
) {
  return api.post<PreprocessPreviewResult>(`${BASE_URL}/preprocess/preview`, {
    corpus_id: corpusId,
    text_ids: textIds,
    config,
    max_preview: maxPreview,
    language,
    chunking
  })
}

/**
 * Preprocess texts (without embedding)
 */
export async function preprocessTexts(
  corpusId: string,
  textIds: string[],
  config: PreprocessConfig
) {
  return api.post<{
    documents: string[]
    original_texts: string[]
    text_ids: string[]
    stats: PreprocessStats
  }>(`${BASE_URL}/preprocess`, {
    corpus_id: corpusId,
    text_ids: textIds,
    config
  })
}

// ============ Embedding API ============

/**
 * Create text embeddings with optional chunking
 */
export async function createEmbedding(
  corpusId: string,
  textIds: string[],
  preprocessConfig: PreprocessConfig,
  options: {
    batchSize?: number
    device?: string
    normalize?: boolean
    language?: string
    chunking?: ChunkingConfig
  } = {}
) {
  return api.postLong<EmbeddingResult>(`${BASE_URL}/embedding`, {
    corpus_id: corpusId,
    text_ids: textIds,
    preprocess_config: preprocessConfig,
    batch_size: options.batchSize || 32,
    device: options.device || 'cpu',
    normalize: options.normalize || false,
    language: options.language || 'english',
    chunking: options.chunking
  })
}

/**
 * List available embeddings
 */
export async function listEmbeddings(corpusId?: string) {
  const params = corpusId ? `?corpus_id=${encodeURIComponent(corpusId)}` : ''
  return api.get<{ embeddings: EmbeddingInfo[] }>(`${BASE_URL}/embedding/list${params}`)
}

/**
 * Delete an embedding file
 */
export async function deleteEmbedding(embeddingId: string) {
  return api.delete<{ message: string; id: string }>(`${BASE_URL}/embedding/${embeddingId}`)
}

/**
 * Rename an embedding file
 */
export async function renameEmbedding(embeddingId: string, newName: string) {
  return api.put<{ message: string; embedding: EmbeddingInfo }>(
    `${BASE_URL}/embedding/${embeddingId}/rename`,
    { new_name: newName }
  )
}

/**
 * Get SBERT model info
 */
export async function getModelInfo() {
  return api.get<ModelInfo>(`${BASE_URL}/embedding/model-info`)
}

// ============ Analysis API ============

/**
 * Run BERTopic analysis
 */
export async function analyzeTopics(config: AnalysisConfig) {
  return api.postLong<TopicAnalysisResult>(`${BASE_URL}/analyze`, config)
}

/**
 * List cached analysis results
 */
export async function listResults() {
  return api.get<{
    results: Array<{
      id: string
      topic_count: number
      document_count: number
    }>
  }>(`${BASE_URL}/results`)
}

/**
 * Delete a cached analysis result
 */
export async function deleteResult(resultId: string) {
  return api.delete<{ message: string; id: string }>(`${BASE_URL}/results/${resultId}`)
}

/**
 * Update topics in cached result (e.g., after Ollama naming)
 */
export async function updateTopics(resultId: string, topics: TopicItem[]) {
  return api.put<{ message: string; id: string }>(`${BASE_URL}/results/${resultId}/topics`, topics)
}

// ============ Visualization API ============

/**
 * Visualization parameters interface
 */
export interface VisualizationParams {
  // Barchart params
  top_n_topics?: number
  n_words?: number
  custom_labels?: boolean
  title?: string
  // Documents params
  hide_document_hover?: boolean
  sample_size?: number
  // Hierarchy params
  orientation?: 'horizontal' | 'vertical'
  show_hierarchical_labels?: boolean
  // Heatmap params
  n_clusters?: number
  // Term rank params
  log_scale?: boolean
  // Topics over time params
  normalize_frequency?: boolean
  // Network params
  similarity_threshold?: number
}

/**
 * Get visualization data with parameters (POST)
 */
export async function getVisualization(
  resultId: string, 
  vizType: VisualizationType,
  params: VisualizationParams = {}
) {
  return api.post<VisualizationData>(`${BASE_URL}/visualization/${resultId}/${vizType}`, params)
}

/**
 * Get all visualizations for a result (without 3D and network)
 */
export async function getAllVisualizations(resultId: string) {
  const vizTypes: VisualizationType[] = [
    'barchart',
    'topics',
    'documents',
    'hierarchy',
    'heatmap',
    'term_rank'
  ]

  const results: Partial<Record<VisualizationType, VisualizationData>> = {}

  // Fetch all visualizations in parallel
  const promises = vizTypes.map(async (type) => {
    const response = await getVisualization(resultId, type)
    if (response.success && response.data) {
      results[type] = response.data
    }
  })

  await Promise.all(promises)
  return results
}

// ============ Ollama API ============

/**
 * Check Ollama connection status
 */
export async function checkOllamaConnection(url: string = 'http://localhost:11434') {
  return api.get<OllamaConnectionStatus>(`${BASE_URL}/ollama/check?url=${encodeURIComponent(url)}`)
}

/**
 * Generate topic names using Ollama
 */
export async function generateTopicNames(
  topics: TopicItem[],
  baseUrl: string,
  model: string,
  options: {
    promptTemplate?: string
    language?: 'en' | 'zh'
    delay?: number
    topNWords?: number
  } = {}
) {
  return api.postLong<{ topics: TopicItem[] }>(`${BASE_URL}/ollama/naming`, {
    topics,
    base_url: baseUrl,
    model,
    prompt_template: options.promptTemplate,
    language: options.language || 'en',
    delay: options.delay || 0.5,
    top_n_words: options.topNWords || 10
  })
}

// ============ Outlier Estimation API ============

export interface OutlierEstimationResult {
  success: boolean
  current_outliers: number
  estimated_outliers: number
  reduced_count: number
  total_documents: number
  current_percentage: number
  estimated_percentage: number
  strategy: string
  threshold: number
}

/**
 * Estimate outlier count with given strategy and threshold
 */
export async function estimateOutliers(
  resultId: string,
  strategy: 'distributions' | 'probabilities' | 'c-tf-idf' | 'embeddings' = 'distributions',
  threshold: number = 0.0
) {
  return api.post<OutlierEstimationResult>(`${BASE_URL}/estimate-outliers`, {
    result_id: resultId,
    strategy,
    threshold
  })
}

// ============ Topic Merge API ============

export interface MergeTopicsResult {
  success: boolean
  message: string
  topics: TopicItem[]
  stats: {
    total_documents: number
    total_topics: number
    outlier_count: number
    outlier_percentage: number
  }
}

/**
 * Merge multiple topics into one
 */
export async function mergeTopics(
  resultId: string,
  topicsToMerge: number[]
) {
  return api.post<MergeTopicsResult>(`${BASE_URL}/merge`, {
    result_id: resultId,
    topics_to_merge: topicsToMerge
  })
}

// ============ Custom Label API ============

export interface UpdateLabelResult {
  success: boolean
  message: string
  topic: TopicItem
}

/**
 * Update custom label for a single topic
 */
export async function updateTopicLabel(
  resultId: string,
  topicId: number,
  customLabel: string
) {
  return api.put<UpdateLabelResult>(`${BASE_URL}/results/${resultId}/label`, {
    topic_id: topicId,
    custom_label: customLabel
  })
}

// ============ LDA API ============

/**
 * Get available POS tags for LDA filtering
 */
export async function getLDAPOSTags() {
  return api.get<{ tags: POSTagInfo[] }>(`${BASE_URL}/lda/pos-tags`)
}

/**
 * Preview LDA preprocessing results
 */
export async function previewLDAPreprocess(
  corpusId: string,
  textIds: string[],
  language: string,
  config: LDAPreprocessConfig,
  maxPreview: number = 5
) {
  return api.post<{
    previews: Array<{
      text_id: string
      original: string
      processed: string
      original_token_count: number
      processed_token_count: number
      has_spacy: boolean
      stats: Record<string, number>
    }>
    total_texts: number
    preview_count: number
    config: LDAPreprocessConfig
    language: string
  }>(`${BASE_URL}/lda/preprocess/preview`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    config,
    max_preview: maxPreview
  })
}

/**
 * Run LDA topic modeling analysis
 */
export async function analyzeLDA(
  corpusId: string,
  textIds: string[],
  language: string,
  preprocessConfig: LDAPreprocessConfig,
  ldaConfig: LDAConfig
) {
  return api.postLong<LDAResult>(`${BASE_URL}/lda/analyze`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    preprocess_config: preprocessConfig,
    lda_config: ldaConfig
  })
}

/**
 * Optimize LDA topic count
 */
export async function optimizeLDATopics(
  corpusId: string,
  textIds: string[],
  language: string,
  preprocessConfig: LDAPreprocessConfig,
  ldaConfig: LDAConfig,
  topicMin: number = 2,
  topicMax: number = 20,
  step: number = 2
) {
  return api.postLong<LDAOptimizeResult>(`${BASE_URL}/lda/optimize-topics`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    preprocess_config: preprocessConfig,
    lda_config: ldaConfig,
    topic_min: topicMin,
    topic_max: topicMax,
    step
  })
}

/**
 * Get cached LDA result
 */
export async function getLDAResult(resultId: string) {
  return api.get<LDAResult>(`${BASE_URL}/lda/results/${resultId}`)
}

/**
 * Get LDA topic similarity matrix
 */
export async function getLDATopicSimilarity(resultId: string) {
  return api.get<{
    matrix: number[][]
    labels: string[]
  }>(`${BASE_URL}/lda/results/${resultId}/similarity`)
}

/**
 * List cached LDA results
 */
export async function listLDAResults() {
  return api.get<{
    results: Array<{
      id: string
      num_topics: number
      num_documents: number
      timestamp: string
    }>
  }>(`${BASE_URL}/lda/results`)
}

/**
 * Delete cached LDA result
 */
export async function deleteLDAResult(resultId: string) {
  return api.delete<{ message: string; id: string }>(`${BASE_URL}/lda/results/${resultId}`)
}

/**
 * Generate topic names for LDA using Ollama
 */
export async function generateLDATopicNames(
  resultId: string,
  baseUrl: string,
  model: string,
  options: {
    promptTemplate?: string
    language?: 'en' | 'zh'
    delay?: number
    topNWords?: number
  } = {}
) {
  return api.postLong<{ success: boolean; topics: import('../types/topicModeling').LDATopic[] }>(`${BASE_URL}/lda/ollama/naming`, {
    result_id: resultId,
    base_url: baseUrl,
    model,
    prompt_template: options.promptTemplate,
    language: options.language || 'en',
    delay: options.delay || 0.5,
    top_n_words: options.topNWords || 10
  })
}

/**
 * Update custom label for a single LDA topic
 */
export async function updateLDATopicLabel(
  resultId: string,
  topicId: number,
  customLabel: string
) {
  return api.put<{ success: boolean; message: string; topic: import('../types/topicModeling').LDATopic }>(
    `${BASE_URL}/lda/results/${resultId}/label`,
    {
      topic_id: topicId,
      custom_label: customLabel
    }
  )
}

/**
 * Update all LDA topics (e.g., after bulk Ollama naming)
 */
export async function updateLDATopics(resultId: string, topics: import('../types/topicModeling').LDATopic[]) {
  return api.put<{ message: string; id: string }>(`${BASE_URL}/lda/results/${resultId}/topics`, topics)
}

// ============ LDA Dynamic Topic Analysis API ============

/**
 * Run LDA topic modeling with dynamic topic evolution analysis
 */
export async function analyzeLDADynamic(
  corpusId: string,
  textIds: string[],
  language: string,
  preprocessConfig: LDAPreprocessConfig,
  ldaConfig: LDAConfig,
  dynamicConfig: LDADynamicConfig,
  textDates: Record<string, string>
) {
  return api.postLong<LDADynamicResult>(`${BASE_URL}/lda/analyze-dynamic`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    preprocess_config: preprocessConfig,
    lda_config: ldaConfig,
    dynamic_config: dynamicConfig,
    text_dates: textDates
  })
}

/**
 * Get LDA topic evolution time series data for visualization
 */
export async function getLDATopicEvolution(resultId: string) {
  return api.get<LDATopicEvolutionData>(`${BASE_URL}/lda/results/${resultId}/evolution`)
}

/**
 * Get LDA sankey diagram data for topic flow visualization
 */
export async function getLDASankeyData(resultId: string) {
  return api.get<LDASankeyData>(`${BASE_URL}/lda/results/${resultId}/sankey`)
}

/**
 * Get LDA topic similarity heatmap data
 * Returns formatted data for D3 heatmap visualization
 */
export async function getLDAHeatmapData(resultId: string) {
  return api.get<LDAHeatmapData>(`${BASE_URL}/lda/results/${resultId}/similarity`)
}

// ============ LSA API ============

/**
 * Preview LSA preprocessing results (uses same service as LDA)
 */
export async function previewLSAPreprocess(
  corpusId: string,
  textIds: string[],
  language: string,
  config: LSAPreprocessConfig,
  maxPreview: number = 5
) {
  return api.post<{
    previews: Array<{
      text_id: string
      original: string
      processed: string
      original_token_count: number
      processed_token_count: number
      has_spacy: boolean
      stats: Record<string, number>
    }>
    total_texts: number
    preview_count: number
    config: LSAPreprocessConfig
    language: string
  }>(`${BASE_URL}/lsa/preprocess/preview`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    config,
    max_preview: maxPreview
  })
}

/**
 * Run LSA topic modeling analysis using TruncatedSVD
 */
export async function analyzeLSA(
  corpusId: string,
  textIds: string[],
  language: string,
  preprocessConfig: LSAPreprocessConfig,
  lsaConfig: LSAConfig
) {
  return api.postLong<LSAResult>(`${BASE_URL}/lsa/analyze`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    preprocess_config: preprocessConfig,
    lsa_config: lsaConfig
  })
}

/**
 * Optimize LSA topic count based on explained variance
 */
export async function optimizeLSATopics(
  corpusId: string,
  textIds: string[],
  language: string,
  preprocessConfig: LSAPreprocessConfig,
  lsaConfig: LSAConfig,
  topicMin: number = 2,
  topicMax: number = 20,
  step: number = 1
) {
  return api.postLong<LSAOptimizeResult>(`${BASE_URL}/lsa/optimize-topics`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    preprocess_config: preprocessConfig,
    lsa_config: lsaConfig,
    topic_min: topicMin,
    topic_max: topicMax,
    step
  })
}

/**
 * Get cached LSA result
 */
export async function getLSAResult(resultId: string) {
  return api.get<LSAResult>(`${BASE_URL}/lsa/results/${resultId}`)
}

/**
 * Get LSA topic similarity matrix
 */
export async function getLSATopicSimilarity(resultId: string) {
  return api.get<{
    matrix: number[][]
    labels: string[]
  }>(`${BASE_URL}/lsa/results/${resultId}/similarity`)
}

/**
 * List cached LSA results
 */
export async function listLSAResults() {
  return api.get<{
    results: Array<{
      id: string
      num_topics: number
      num_documents: number
      explained_variance_ratio: number
      timestamp: string
    }>
  }>(`${BASE_URL}/lsa/results`)
}

/**
 * Delete cached LSA result
 */
export async function deleteLSAResult(resultId: string) {
  return api.delete<{ message: string; id: string }>(`${BASE_URL}/lsa/results/${resultId}`)
}

/**
 * Generate topic names for LSA using Ollama
 */
export async function generateLSATopicNames(
  resultId: string,
  baseUrl: string,
  model: string,
  options: {
    promptTemplate?: string
    language?: 'en' | 'zh'
    delay?: number
    topNWords?: number
  } = {}
) {
  return api.postLong<{ success: boolean; topics: import('../types/topicModeling').LSATopic[] }>(`${BASE_URL}/lsa/ollama/naming`, {
    result_id: resultId,
    base_url: baseUrl,
    model,
    prompt_template: options.promptTemplate,
    language: options.language || 'en',
    delay: options.delay || 0.5,
    top_n_words: options.topNWords || 10
  })
}

/**
 * Update custom label for a single LSA topic
 */
export async function updateLSATopicLabel(
  resultId: string,
  topicId: number,
  customLabel: string
) {
  return api.put<{ success: boolean; message: string; topic: import('../types/topicModeling').LSATopic }>(
    `${BASE_URL}/lsa/results/${resultId}/label`,
    {
      topic_id: topicId,
      custom_label: customLabel
    }
  )
}

/**
 * Update all LSA topics (e.g., after bulk Ollama naming)
 */
export async function updateLSATopics(resultId: string, topics: import('../types/topicModeling').LSATopic[]) {
  return api.put<{ message: string; id: string }>(`${BASE_URL}/lsa/results/${resultId}/topics`, topics)
}

// ============ NMF API ============

/**
 * Preview NMF preprocessing (uses same service as LDA)
 */
export async function previewNMFPreprocess(
  corpusId: string,
  textIds: string[],
  language: string,
  config: NMFPreprocessConfig,
  maxPreview: number = 5
) {
  return api.post<{
    previews: Array<{
      text_id: string
      original: string
      processed: string
      original_tokens: number
      final_tokens: number
    }>
    stats: {
      total: number
      processed: number
      skipped: number
    }
    language: string
  }>(`${BASE_URL}/nmf/preprocess/preview`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    config,
    max_preview: maxPreview
  })
}

/**
 * Run NMF topic modeling analysis
 */
export async function analyzeNMF(
  corpusId: string,
  textIds: string[],
  language: string,
  preprocessConfig: NMFPreprocessConfig,
  nmfConfig: NMFConfig
) {
  return api.postLong<NMFResult>(`${BASE_URL}/nmf/analyze`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    preprocess_config: preprocessConfig,
    nmf_config: nmfConfig
  })
}

/**
 * Optimize NMF topic count based on reconstruction error
 */
export async function optimizeNMFTopics(
  corpusId: string,
  textIds: string[],
  language: string,
  preprocessConfig: NMFPreprocessConfig,
  nmfConfig: NMFConfig,
  topicMin: number = 2,
  topicMax: number = 20,
  step: number = 1
) {
  return api.postLong<NMFOptimizeResult>(`${BASE_URL}/nmf/optimize-topics`, {
    corpus_id: corpusId,
    text_ids: textIds,
    language,
    preprocess_config: preprocessConfig,
    nmf_config: nmfConfig,
    topic_min: topicMin,
    topic_max: topicMax,
    step
  })
}

/**
 * Get cached NMF result
 */
export async function getNMFResult(resultId: string) {
  return api.get<NMFResult>(`${BASE_URL}/nmf/results/${resultId}`)
}

/**
 * Get NMF topic similarity matrix
 */
export async function getNMFTopicSimilarity(resultId: string) {
  return api.get<{
    matrix: number[][]
    labels: string[]
  }>(`${BASE_URL}/nmf/results/${resultId}/similarity`)
}

/**
 * List cached NMF results
 */
export async function listNMFResults() {
  return api.get<{
    results: Array<{
      id: string
      num_topics: number
      num_documents: number
      reconstruction_error: number
      sparsity: number
      timestamp: string
    }>
  }>(`${BASE_URL}/nmf/results`)
}

/**
 * Delete cached NMF result
 */
export async function deleteNMFResult(resultId: string) {
  return api.delete<{ message: string; id: string }>(`${BASE_URL}/nmf/results/${resultId}`)
}

/**
 * Generate topic names for NMF using Ollama
 */
export async function generateNMFTopicNames(
  resultId: string,
  baseUrl: string,
  model: string,
  options: {
    promptTemplate?: string
    language?: 'en' | 'zh'
    delay?: number
    topNWords?: number
  } = {}
) {
  return api.postLong<{ success: boolean; topics: import('../types/topicModeling').NMFTopic[] }>(`${BASE_URL}/nmf/ollama/naming`, {
    result_id: resultId,
    base_url: baseUrl,
    model,
    prompt_template: options.promptTemplate,
    language: options.language || 'en',
    delay: options.delay || 0.5,
    top_n_words: options.topNWords || 10
  })
}

/**
 * Update custom label for a single NMF topic
 */
export async function updateNMFTopicLabel(
  resultId: string,
  topicId: number,
  customLabel: string
) {
  return api.put<{ success: boolean; message: string; topic: import('../types/topicModeling').NMFTopic }>(
    `${BASE_URL}/nmf/results/${resultId}/label`,
    {
      topic_id: topicId,
      custom_label: customLabel
    }
  )
}

/**
 * Update all NMF topics (e.g., after bulk Ollama naming)
 */
export async function updateNMFTopics(resultId: string, topics: import('../types/topicModeling').NMFTopic[]) {
  return api.put<{ message: string; id: string }>(`${BASE_URL}/nmf/results/${resultId}/topics`, topics)
}

// ============ Export all functions ============

export const topicModelingApi = {
  // Preprocess
  previewPreprocess,
  preprocessTexts,
  // Embedding
  createEmbedding,
  listEmbeddings,
  deleteEmbedding,
  renameEmbedding,
  getModelInfo,
  // Analysis
  analyzeTopics,
  listResults,
  deleteResult,
  updateTopics,
  // Visualization
  getVisualization,
  getAllVisualizations,
  // Ollama
  checkOllamaConnection,
  generateTopicNames,
  // Outlier estimation
  estimateOutliers,
  // Topic merge
  mergeTopics,
  // Custom label
  updateTopicLabel,
  // LDA
  getLDAPOSTags,
  previewLDAPreprocess,
  analyzeLDA,
  optimizeLDATopics,
  getLDAResult,
  getLDATopicSimilarity,
  listLDAResults,
  deleteLDAResult,
  generateLDATopicNames,
  updateLDATopicLabel,
  updateLDATopics,
  // LDA Dynamic
  analyzeLDADynamic,
  getLDATopicEvolution,
  getLDASankeyData,
  getLDAHeatmapData,
  // LSA
  previewLSAPreprocess,
  analyzeLSA,
  optimizeLSATopics,
  getLSAResult,
  getLSATopicSimilarity,
  listLSAResults,
  deleteLSAResult,
  generateLSATopicNames,
  updateLSATopicLabel,
  updateLSATopics,
  // NMF
  previewNMFPreprocess,
  analyzeNMF,
  optimizeNMFTopics,
  getNMFResult,
  getNMFTopicSimilarity,
  listNMFResults,
  deleteNMFResult,
  generateNMFTopicNames,
  updateNMFTopicLabel,
  updateNMFTopics
}

export default topicModelingApi

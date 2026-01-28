import { api } from './client'
import type {
  CorpusSelection,
  WordFrequencyResult,
  WordFamilyResult,
  KeywordResult,
  NGramResult,
  CollocationResult,
  KWICResult,
  WordSketchResult,
  TopicModelResult,
  TopicModelType,
  CollocationMode
} from '../types'
import type {
  WordFrequencyRequest,
  WordFrequencyResponse,
  POSTagInfo
} from '../types/wordFrequency'
import type {
  NGramRequest,
  NGramResponse
} from '../types/ngram'
import type {
  SynonymRequest,
  SynonymResponse,
  WordSynonymResponse,
  POSOption
} from '../types/synonym'
import type {
  SemanticAnalysisRequest,
  SemanticAnalysisResponse,
  DomainWordsRequest,
  DomainWordsResponse,
  MajorCategory
} from '../types/semanticAnalysis'
import type {
  MetaphorAnalysisRequest,
  MetaphorAnalysisResponse,
  MetaphorWordsRequest,
  MetaphorWordsResponse,
  MetaphorSourceInfo
} from '../types/metaphorAnalysis'
import type {
  POSFilterConfig,
  SingleDocAlgorithm,
  SingleDocKeyword,
  KeynessStatistic,
  KeynessKeyword,
  KeynessConfig,
  AlgorithmInfo,
  StatisticInfo,
  StopwordsConfig,
  ThresholdConfig,
  StatisticThresholds,
  CorpusResource
} from '../types/keyword'

// ==================== Keyword Extraction Types ====================

export interface SingleDocKeywordRequest {
  corpus_id: string
  text_ids: string[] | 'all'
  algorithm: SingleDocAlgorithm
  config: Record<string, any>
  pos_filter?: POSFilterConfig
  lowercase: boolean
  stopwords_config?: StopwordsConfig
  language?: string
}

export interface SingleDocKeywordResponse {
  success: boolean
  results: SingleDocKeyword[]
  total_keywords: number
  algorithm: string
  error?: string
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

export interface KeynessResponse {
  success: boolean
  results: KeynessKeyword[]
  total_keywords: number
  study_corpus_size: number
  ref_corpus_size: number
  statistic: string
  reference_resource_id?: string
  error?: string
}

// Analysis API endpoints
export const analysisApi = {
  // Word frequency analysis (new enhanced API)
  wordFrequency: (request: WordFrequencyRequest) =>
    api.post<WordFrequencyResponse>('/api/analysis/word-frequency', request),
  
  // Get available POS tags
  getPosTags: () =>
    api.get<POSTagInfo[]>('/api/analysis/pos-tags'),

  // Legacy word frequency API (deprecated)
  wordFrequencyLegacy: (selection: CorpusSelection) =>
    api.post<WordFrequencyResult[]>('/api/analysis/word-frequency', selection),

  // Synonym analysis (replaces word family)
  synonymAnalysis: (request: SynonymRequest) =>
    api.post<SynonymResponse>('/api/analysis/synonym', request),
  
  // Get synonyms for a single word
  getWordSynonyms: (word: string, pos: string = 'auto') =>
    api.get<WordSynonymResponse>(`/api/analysis/synonym/word/${encodeURIComponent(word)}?pos=${pos}`),
  
  // Get POS filter options for synonym analysis
  getSynonymPosOptions: () =>
    api.get<POSOption[]>('/api/analysis/synonym/pos-options'),

  // Word family analysis (deprecated - redirects to synonym)
  wordFamily: (selection: CorpusSelection) =>
    api.post<WordFamilyResult[]>('/api/analysis/word-family', selection),

  // Keyword extraction (legacy)
  keywords: (selection: CorpusSelection, referenceCorpusId?: string) =>
    api.post<KeywordResult[]>('/api/analysis/keyword', { 
      selection, 
      referenceCorpusId 
    }),

  // N-gram analysis (enhanced API)
  ngramAnalysis: (request: NGramRequest) =>
    api.post<NGramResponse>('/api/analysis/ngram', request),

  // N-gram analysis (legacy)
  ngram: (selection: CorpusSelection, n: number, minFrequency: number = 2) =>
    api.post<NGramResult[]>('/api/analysis/ngram', { 
      selection, 
      n, 
      minFrequency 
    }),

  // Collocation analysis - standard mode
  collocationStandard: (
    selection: CorpusSelection, 
    nodeWord: string,
    windowSize: number = 5,
    measure: 'mi' | 'tscore' | 'logdice' | 'frequency' = 'mi',
    minFrequency: number = 3
  ) =>
    api.post<CollocationResult[]>('/api/analysis/collocation', {
      selection,
      nodeWord,
      windowSize,
      measure,
      minFrequency,
      mode: 'standard' as CollocationMode
    }),

  // Collocation analysis - grammar mode
  collocationGrammar: (
    selection: CorpusSelection,
    nodeWord: string,
    measure: 'mi' | 'tscore' | 'logdice' | 'frequency' = 'mi',
    minFrequency: number = 3
  ) =>
    api.post<CollocationResult[]>('/api/analysis/collocation', {
      selection,
      nodeWord,
      measure,
      minFrequency,
      mode: 'grammar' as CollocationMode
    }),

  // Word sketch (Sketch Engine style)
  wordSketch: (selection: CorpusSelection, word: string) =>
    api.post<WordSketchResult>('/api/analysis/word-sketch', { selection, word }),

  // KWIC concordance
  kwic: (
    selection: CorpusSelection, 
    keyword: string, 
    contextSize: number = 50
  ) =>
    api.post<KWICResult[]>('/api/analysis/kwic', { 
      selection, 
      keyword, 
      contextSize 
    }),

  // Topic modeling
  topicModeling: (
    selection: CorpusSelection,
    modelType: TopicModelType,
    numTopics?: number
  ) =>
    api.post<TopicModelResult>('/api/analysis/topic-modeling', {
      selection,
      modelType,
      numTopics
    }),

  // ==================== Semantic Domain Analysis ====================

  // Semantic domain analysis
  semanticDomainAnalysis: (request: SemanticAnalysisRequest) =>
    api.post<SemanticAnalysisResponse>('/api/analysis/semantic-domains', request),

  // Get words tagged with a specific domain
  getDomainWords: (request: DomainWordsRequest) =>
    api.post<DomainWordsResponse>('/api/analysis/semantic-domains/words', request),

  // Get USAS major categories
  getMajorCategories: () =>
    api.get<MajorCategory[]>('/api/analysis/semantic-domains/categories'),

  // ==================== Metaphor Analysis ====================

  // Metaphor analysis from MIPVU annotations
  metaphorAnalysis: (request: MetaphorAnalysisRequest) =>
    api.post<MetaphorAnalysisResponse>('/api/analysis/metaphor-analysis', request),

  // Get metaphor or literal words list
  getMetaphorWords: (request: MetaphorWordsRequest) =>
    api.post<MetaphorWordsResponse>('/api/analysis/metaphor-analysis/words', request),

  // Get metaphor detection sources
  getMetaphorSources: () =>
    api.get<MetaphorSourceInfo[]>('/api/analysis/metaphor-analysis/sources'),

  // ==================== Word Cloud Generation ====================

  // Generate word cloud using legacy Python wordcloud engine
  generateWordCloud: (request: {
    word_freq: Record<string, number>
    max_words: number
    mask_image?: string | null
    colormap?: string
    style: string  // 默认, 使用蒙版, 基于图片颜色
    contour_width?: number
    contour_color?: string
  }) =>
    api.post<{
      success: boolean
      image_data?: string
      error?: string
    }>('/api/analysis/wordcloud/generate', request)
}

// ==================== Keyword Extraction API ====================

export const keywordApi = {
  // Single document keyword extraction
  singleDoc: (request: SingleDocKeywordRequest) =>
    api.post<SingleDocKeywordResponse>('/api/analysis/keyword/single-doc', request),

  // Keyness comparison analysis
  keyness: (request: KeynessRequest) =>
    api.post<KeynessResponse>('/api/analysis/keyword/keyness', request),

  // Keyness comparison with corpus resource (CSV)
  keynessWithResource: (request: KeynessResourceRequest) =>
    api.post<KeynessResponse>('/api/analysis/keyword/keyness-resource', request),

  // Get available algorithms
  getAlgorithms: () =>
    api.get<AlgorithmInfo[]>('/api/analysis/keyword/algorithms'),

  // Get available statistics
  getStatistics: () =>
    api.get<StatisticInfo[]>('/api/analysis/keyword/statistics'),

  // Get default statistical thresholds
  getDefaultThresholds: () =>
    api.get<{ success: boolean; data: StatisticThresholds }>('/api/analysis/keyword/thresholds')
}

// ==================== Corpus Resource API ====================

export interface CorpusResourceListResponse {
  success: boolean
  data: CorpusResource[]
  total: number
}

export interface CorpusResourceDetailResponse {
  success: boolean
  data: CorpusResource | null
}

export interface TagsListResponse {
  success: boolean
  tags_en: string[]
  tags_zh: string[]
}

export interface CorpusResourceSearchRequest {
  query?: string
  tags?: string[]
  lang?: 'en' | 'zh'
}

export const corpusResourceApi = {
  // List all corpus resources
  list: (lang: 'en' | 'zh' = 'en') =>
    api.get<CorpusResourceListResponse>(`/api/corpus-resource/list?lang=${lang}`),

  // Get all available tags
  getTags: () =>
    api.get<TagsListResponse>('/api/corpus-resource/tags'),

  // Get single corpus resource details
  get: (resourceId: string, lang: 'en' | 'zh' = 'en') =>
    api.get<CorpusResourceDetailResponse>(`/api/corpus-resource/${resourceId}?lang=${lang}`),

  // Search corpus resources
  search: (request: CorpusResourceSearchRequest) =>
    api.post<CorpusResourceListResponse>('/api/corpus-resource/search', request),

  // Get frequency data sample
  getFrequencyData: (resourceId: string, sampleSize: number = 100) =>
    api.get<{
      success: boolean
      resource_id: string
      total_words: number
      total_frequency: number
      sample: Array<{ word: string; lemma: string; pos: string; freq: number }>
    }>(`/api/corpus-resource/${resourceId}/frequency?sample_size=${sampleSize}`)
}


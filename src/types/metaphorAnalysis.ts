/**
 * MIPVU Metaphor Analysis Types
 * 
 * Type definitions for metaphor analysis module.
 */

// ==================== Analysis Request/Response Types ====================

export interface MetaphorAnalysisRequest {
  corpus_id: string;
  text_ids: string[] | 'all';
  pos_filter?: POSFilterConfig;
  search_config?: SearchConfig;
  min_freq?: number;
  max_freq?: number;
  lowercase?: boolean;
  result_mode?: 'word' | 'source';
}

export interface POSFilterConfig {
  selectedPOS: string[];
  keepMode: boolean;
}

export interface SearchConfig {
  searchType: 'all' | 'starts' | 'ends' | 'contains' | 'regex' | 'wordlist';
  searchValue: string;
  excludeWords: string[];
  searchTarget: 'word' | 'lemma';
  removeStopwords: boolean;
}

export interface MetaphorResult {
  word: string;
  lemma: string;
  pos: string;
  is_metaphor: boolean;
  frequency: number;
  percentage: number;
  source: MetaphorSource;
}

export interface MetaphorSourceResult {
  source: MetaphorSource;
  name: string;
  count: number;
  percentage: number;
}

export interface MetaphorStatistics {
  total_tokens: number;
  metaphor_tokens: number;
  literal_tokens: number;
  metaphor_rate: number;
  source_distribution: Record<MetaphorSource, number>;
}

export interface MetaphorAnalysisResponse {
  success: boolean;
  results: MetaphorResult[] | MetaphorSourceResult[];
  statistics: MetaphorStatistics;
  error?: string;
}

// ==================== Word List Types ====================

export interface MetaphorWordsRequest {
  corpus_id: string;
  text_ids: string[] | 'all';
  is_metaphor: boolean;
  source?: MetaphorSource;
  lowercase?: boolean;
}

export interface MetaphorWord {
  word: string;
  lemma: string;
  pos: string;
  frequency: number;
  contexts: string[];
}

export interface MetaphorWordsResponse {
  success: boolean;
  words: MetaphorWord[];
  total: number;
  error?: string;
}

// ==================== Source Types ====================

export type MetaphorSource = 
  | 'filter'      // Word filter
  | 'rule'        // Rule-based filter
  | 'hitz'        // HiTZ model prediction
  | 'finetuned'   // Fine-tuned model prediction
  | 'unknown';    // Unknown source

export interface MetaphorSourceInfo {
  id: MetaphorSource;
  name_en: string;
  name_zh: string;
}

// ==================== Visualization Types ====================

export type MetaphorChartType = 'bar' | 'pie' | 'wordcloud';
export type MetaphorWordCloudEngine = 'd3' | 'legacy';

export interface MetaphorWordCloudConfig {
  style: string;
  maxWords: number;
  useAllWords?: boolean;
  colormap?: string;
  maskImage?: string | null;
}

export interface MetaphorVisualizationConfig {
  chartType: MetaphorChartType;
  maxItems: number;
  maxItemsByType?: Partial<Record<MetaphorChartType, number>>;
  showPercentage: boolean;
  colorScheme: string;
  showMetaphorsOnly: boolean;
  // Word cloud specific
  wordCloudEngine: MetaphorWordCloudEngine;
  wordCloudConfig: MetaphorWordCloudConfig;
  legacyWordCloudConfig: MetaphorWordCloudConfig;
}

export const DEFAULT_METAPHOR_WORDCLOUD_CONFIG: MetaphorWordCloudConfig = {
  style: 'default',
  maxWords: 100,
  useAllWords: false,
  colormap: 'viridis',
  maskImage: null
};

export const DEFAULT_METAPHOR_VIZ_CONFIG: MetaphorVisualizationConfig = {
  chartType: 'bar',
  maxItems: 20,
  maxItemsByType: { bar: 20, pie: 10, wordcloud: 100 },
  showPercentage: true,
  colorScheme: 'green',
  showMetaphorsOnly: true,
  wordCloudEngine: 'd3',
  wordCloudConfig: DEFAULT_METAPHOR_WORDCLOUD_CONFIG,
  legacyWordCloudConfig: DEFAULT_METAPHOR_WORDCLOUD_CONFIG
};

export interface MetaphorWordCloudItem {
  word: string;
  value: number;
  is_metaphor: boolean;
}

export interface MetaphorChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string[];
  }[];
}

// ==================== UI State Types ====================

export interface MetaphorAnalysisState {
  loading: boolean;
  error: string | null;
  results: MetaphorResult[] | MetaphorSourceResult[];
  statistics: MetaphorStatistics | null;
  selectedCorpusId: string | null;
  selectedTextIds: string[] | 'all';
  filters: {
    posFilter: POSFilterConfig | null;
    searchConfig: SearchConfig | null;
    minFreq: number;
    maxFreq: number | null;
    lowercase: boolean;
  };
  resultMode: 'word' | 'source';
  visualizationType: 'table' | 'wordcloud' | 'chart';
}

// ==================== MIPVU Annotation Types ====================

export interface MIPVUToken {
  word: string;
  lemma: string;
  pos: string;
  tag: string;
  dep: string;
  is_metaphor: boolean;
  metaphor_confidence: number;
  metaphor_source: string;
}

export interface MIPVUSentence {
  text: string;
  tokens: MIPVUToken[];
}

export interface MIPVUAnnotation {
  success: boolean;
  sentences: MIPVUSentence[];
  statistics: MetaphorStatistics;
  error?: string;
}

// ==================== Re-annotation Types ====================

export interface MIPVUReannotateResponse {
  success: boolean;
  task_id?: string;
  message?: string;
  error?: string;
}

export interface MIPVUReannotateProgress {
  stage: string;
  progress: number;
  message: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: {
    metaphor_tokens?: number;
    total_tokens?: number;
    metaphor_rate?: number;
    segments?: number;
  };
}

// ==================== Export Types ====================

export interface MetaphorExportOptions {
  format: 'csv' | 'json' | 'xlsx';
  includeStatistics: boolean;
  includeContexts: boolean;
}

// ==================== Constants ====================

export const METAPHOR_SOURCE_COLORS: Record<MetaphorSource, string> = {
  filter: '#9E9E9E',      // Gray
  rule: '#2196F3',        // Blue
  hitz: '#4CAF50',        // Green
  finetuned: '#FF9800',   // Orange
  unknown: '#607D8B',     // Blue Gray
};

export const METAPHOR_SOURCE_LABELS: Record<MetaphorSource, { en: string; zh: string }> = {
  filter: { en: 'Word Filter', zh: '词表过滤' },
  rule: { en: 'Rule Filter', zh: '规则过滤' },
  hitz: { en: 'HiTZ', zh: 'HiTZ' },
  finetuned: { en: 'IDRRP', zh: 'IDRRP' },
  unknown: { en: 'Unknown', zh: '未知' },
};

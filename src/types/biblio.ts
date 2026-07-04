/**
 * Bibliographic Visualization Types
 */

// ==================== Enums ====================

export type SourceType = 'WOS' | 'CNKI'

export type DocType = 
  | 'Journal Article'
  | 'Dissertation/Thesis'
  | 'Conference Paper'
  | 'Book'
  | 'Book Chapter'
  | 'Review'
  | 'Other'

export type NetworkType = 
  | 'co-author'
  | 'co-institution'
  | 'co-country'
  | 'keyword-cooccur'
  | 'co-citation'

export type VisualizationType =
  | NetworkType
  | 'cluster'
  | 'timeline'
  | 'timezone'
  | 'burst'
  | 'wordcloud'
  | 'landscape'
  | 'dual-map'
  | 'citation-chord'
  | 'heatmap'

// ==================== Library Models ====================

export interface BiblioLibrary {
  id: string
  name: string
  source_type: SourceType
  description?: string
  language?: string
  entry_count: number
  corpus_id?: string
  created_at?: string
  updated_at?: string
}

export interface BiblioLibraryCreate {
  name: string
  source_type: SourceType
  description?: string
  language?: string
}

export interface BiblioLibraryUpdate {
  name?: string
  description?: string
  language?: string
}

// ==================== Entry Models ====================

export interface BiblioEntry {
  id: string
  library_id: string
  title: string
  authors: string[]
  institutions: string[]
  countries: string[]
  journal?: string
  year?: number
  volume?: string
  issue?: string
  pages?: string
  doi?: string
  keywords: string[]
  abstract?: string
  doc_type?: string
  language?: string
  citation_count: number
  source_url?: string
  unique_id?: string
  raw_data?: Record<string, any>
  created_at?: string
  /** 0-5 stars, default 0 */
  relevance?: number
  /** User-defined tags */
  tags?: string[]
  /** User-defined notes (plain text) */
  notes?: string
  /** Set when listing with include_status (abstract text id in shadow corpus) */
  text_id?: string
  task_id?: string
  task_status?: string
  task_progress?: number
  task_message?: string
  /** Path to uploaded PDF (relative); thumbnail at pdf_thumbnail_path */
  pdf_path?: string
  pdf_thumbnail_path?: string
  /** AI-generated sections: key -> { value, hidden } */
  ai_sections?: Record<string, { value: string; hidden: boolean }>
}

/** Keys for the 11 AI-generated entry sections (same order as table/dialog) */
export const BIBLIO_AI_SECTION_KEYS = [
  'research_objective',
  'research_question',
  'research_design',
  'research_conclusion',
  'theoretical_mechanism',
  'theoretical_contribution',
  'limitations',
  'application_value',
  'academic_dialogue',
  'future_direction',
  'literature_summary'
] as const
export type BiblioAiSectionKey = typeof BIBLIO_AI_SECTION_KEYS[number]

// ==================== Filter Models ====================

export interface BiblioFilter {
  year_start?: number
  year_end?: number
  author?: string
  institution?: string
  keyword?: string
  journal?: string
  doc_type?: string
  country?: string
}

export interface FilterOptions {
  years: number[]
  authors: string[]
  institutions: string[]
  keywords: string[]
  journals: string[]
  doc_types: string[]
  countries: string[]
}

// ==================== Statistics ====================

export interface BiblioStatistics {
  total: number
  year_start?: number
  year_end?: number
  year_distribution: Record<number, number>
  doc_types: Record<string, number>
}

// ==================== Network Visualization ====================

export interface NetworkNode {
  id: string
  label: string
  weight: number
  frequency: number
  centrality: number
  degree?: number
  eigen_centrality?: number
  sigma?: number
  is_burst?: boolean
  term_type?: string
  cluster?: number
  year?: number
  attributes?: Record<string, any>
}

export interface NetworkEdge {
  source: string
  target: string
  weight: number
}

export interface NetworkVisualizationData {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  statistics?: {
    node_count: number
    edge_count: number
    density: number
    total_items?: number
  }
}

// ==================== Cluster Visualization ====================

export interface ClusterInfo {
  id: number
  label: string
  size: number
  silhouette: number
  top_terms: string[]
  /** Mean first-appearance year of the cluster's terms (CiteSpace engine). */
  mean_year?: number | null
}

export interface ClusterVisualizationData {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  clusters: ClusterInfo[]
  modularity: number
  silhouette: number
  /** Node entity the network was built on (keyword/author/institution/country/term). */
  node_type?: string
  /** Cluster-label extraction algorithm used (llr/tfidf/mi). */
  label_algorithm?: string
}

/** CiteSpace-aligned node selection / network / labelling parameters. */
export type BiblioNodeType = 'keyword' | 'author' | 'institution' | 'country' | 'term' | 'reference'

export interface CiteSpaceParams {
  node_type?: BiblioNodeType
  /** Multi-select node types (hybrid network: diamonds = terms, circles = references).
      Takes precedence over node_type when non-empty. */
  node_types?: BiblioNodeType[]
  year_from?: number
  year_to?: number
  years_per_slice?: number
  selection_mode?: 'g_index' | 'top_n' | 'top_n_percent' | 'thresholds'
  g_index_k?: number
  clustering_algorithm?: 'louvain' | 'spectral'
  top_n?: number
  top_n_percent?: number
  threshold_c?: number
  threshold_cc?: number
  threshold_ccv?: number
  link_strength?: 'cosine' | 'dice' | 'jaccard' | 'cooccurrence'
  pruning?: 'none' | 'pathfinder' | 'mst'
  label_algorithm?: 'llr' | 'tfidf' | 'mi'
  max_nodes?: number
  /** Which fields feed term extraction (keyword/term node types). */
  term_sources?: Array<'title' | 'abstract' | 'author_keywords' | 'keywords_plus' | 'noun_phrases'>
  /** Across Slices mode: select top-N globally instead of per-slice then merge. */
  across_slices?: boolean
}

// ==================== Timeline Visualization ====================

export interface TimelineNode {
  id: string
  label: string
  year: number
  cluster: number
  weight: number
  is_burst: boolean
  frequency?: number
  centrality?: number
  degree?: number
  eigen_centrality?: number
  sigma?: number
  /** Which node type produced this node (hybrid networks): reference -> circle, others -> diamond */
  term_type?: string
}

/** Metric used to rank/filter node labels in one label group */
export type NodeLabelMetric = 'citation' | 'frequency' | 'degree' | 'centrality' | 'eigen' | 'sigma' | 'cluster' | 'burstness' | 'hide'

/** One of the two independent label groups (term layer = diamonds, reference layer = circles) */
export interface NodeLabelGroup {
  metric: NodeLabelMetric
  threshold: number
  fontSize: number
  nodeSize: number
  showFrequency: boolean
}

export const DEFAULT_TERM_LABEL_GROUP: NodeLabelGroup = {
  metric: 'degree', threshold: 0, fontSize: 12, nodeSize: 1, showFrequency: false
}
export const DEFAULT_REF_LABEL_GROUP: NodeLabelGroup = {
  metric: 'frequency', threshold: 0, fontSize: 9, nodeSize: 1, showFrequency: false
}

export interface TimelineCluster {
  id: number
  label: string
  size: number
  year_start: number
  year_end: number
  silhouette?: number
}

export interface TimelineVisualizationData {
  nodes: TimelineNode[]
  edges: NetworkEdge[]
  clusters: TimelineCluster[]
  time_range: {
    start: number
    end: number
  }
  node_type?: string
  modularity?: number
  silhouette?: number
}

// ==================== Timezone Visualization ====================

export interface TimezoneSlice {
  year: number
  entries: {
    id: string
    title: string
    authors: string[]
    journal?: string
    keywords: string[]
    citation_count: number
  }[]
  count: number
}

export interface TimezoneVisualizationData {
  slices: TimezoneSlice[]
  edges: NetworkEdge[]
  time_range: {
    start: number
    end: number
  }
}

// ==================== Burst Detection ====================

export interface BurstItem {
  term: string
  frequency: number
  burst_start: number
  burst_end: number
  burst_strength: number
  burst_weight: number
}

export interface BurstDetectionData {
  bursts: BurstItem[]
  time_range: {
    start: number
    end: number
  }
}

// ==================== Landscape Visualization ====================

export interface LandscapePoint {
  x: number
  y: number
  z: number
  id: string
  label: string
  cluster: number
}

export interface LandscapeVisualizationData {
  points: LandscapePoint[]
  clusters: ClusterInfo[]
}

// ==================== Dual-Map Overlay ====================

export interface DualMapNode {
  id: string
  label: string
  x: number
  y: number
  weight: number
  side: 'citing' | 'cited'
}

export interface DualMapLink {
  source: string
  target: string
  weight: number
  color?: string
}

export interface DualMapVisualizationData {
  citing_nodes: DualMapNode[]
  cited_nodes: DualMapNode[]
  links: DualMapLink[]
}

// ==================== Heatmap Visualization ====================

export interface HeatmapPoint {
  x: number
  y: number
  weight: number
  id: string
  label: string
  cluster: number
  year?: number
}

export interface HeatmapVisualizationData {
  points: HeatmapPoint[]
  clusters: ClusterInfo[]
  time_range: { start: number; end: number }
  density_grid?: { x: number[]; y: number[]; z: number[][] }
}

export interface HeatmapVisualizationRequest {
  library_id: string
  filters?: BiblioFilter
  bandwidth?: number
  grid_size?: number
  /** Same node type as the cluster view (heatmap shares the CiteSpace engine) */
  cluster_by?: string
  citespace?: CiteSpaceParams
}

// ==================== Word Cloud Visualization ====================

export interface WordCloudWord {
  word: string
  frequency: number
  percentage?: number
  rank?: number
}

export interface WordCloudVisualizationData {
  words: WordCloudWord[]
}

// ==================== API Response Models ====================

export interface BiblioLibraryListResponse {
  libraries: BiblioLibrary[]
  total: number
}

export interface BiblioEntryListResponse {
  entries: BiblioEntry[]
  total: number
  page: number
  page_size: number
  total_pages: number
  /** Total entries (matching current filters) still in SpaCy/USAS/MIPVU processing */
  processing_count?: number
}

export interface UploadResult {
  success: boolean
  entries_added: number
  entries_skipped: number
  errors: string[]
  /** For each entry with abstract: entry_id, text_id, task_id (for progress polling) */
  entry_tasks?: { entry_id: string; text_id: string; task_id: string }[]
}

// ==================== Request Models ====================

export interface NetworkVisualizationRequest {
  library_id: string
  filters?: BiblioFilter
  min_weight?: number
  max_nodes?: number
}

export interface ClusterVisualizationRequest {
  library_id: string
  filters?: BiblioFilter
  cluster_by?: 'keyword' | 'author' | 'institution' | 'country' | 'term' | 'reference'
  n_clusters?: number
  citespace?: CiteSpaceParams
}

export interface TimeVisualizationRequest {
  library_id: string
  filters?: BiblioFilter
  time_slice?: number
  top_n?: number
  citespace?: CiteSpaceParams
}

export interface BurstDetectionRequest {
  library_id: string
  filters?: BiblioFilter
  burst_type?: 'keyword' | 'author'
  min_frequency?: number
  gamma?: number
  alpha?: number
}

export interface WordCloudVisualizationRequest {
  library_id: string
  filters?: BiblioFilter
  source?: 'title' | 'abstract'
  max_words?: number
}

export interface BaseVisualizationRequest {
  library_id: string
  filters?: BiblioFilter
}


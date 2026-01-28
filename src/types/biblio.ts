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
  | 'landscape'
  | 'dual-map'

// ==================== Library Models ====================

export interface BiblioLibrary {
  id: string
  name: string
  source_type: SourceType
  description?: string
  entry_count: number
  created_at?: string
  updated_at?: string
}

export interface BiblioLibraryCreate {
  name: string
  source_type: SourceType
  description?: string
}

export interface BiblioLibraryUpdate {
  name?: string
  description?: string
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
}

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
}

export interface ClusterVisualizationData {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  clusters: ClusterInfo[]
  modularity: number
  silhouette: number
}

// ==================== Timeline Visualization ====================

export interface TimelineNode {
  id: string
  label: string
  year: number
  cluster: number
  weight: number
  is_burst: boolean
}

export interface TimelineCluster {
  id: number
  label: string
  size: number
  year_start: number
  year_end: number
}

export interface TimelineVisualizationData {
  nodes: TimelineNode[]
  edges: NetworkEdge[]
  clusters: TimelineCluster[]
  time_range: {
    start: number
    end: number
  }
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
}

export interface UploadResult {
  success: boolean
  entries_added: number
  entries_skipped: number
  errors: string[]
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
  cluster_by?: 'keyword' | 'author' | 'institution'
  n_clusters?: number
}

export interface TimeVisualizationRequest {
  library_id: string
  filters?: BiblioFilter
  time_slice?: number
  top_n?: number
}

export interface BurstDetectionRequest {
  library_id: string
  filters?: BiblioFilter
  burst_type?: 'keyword' | 'author'
  min_frequency?: number
  gamma?: number
}

export interface BaseVisualizationRequest {
  library_id: string
  filters?: BiblioFilter
}


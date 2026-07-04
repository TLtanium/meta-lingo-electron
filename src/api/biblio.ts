/**
 * Bibliographic Visualization API Client
 */

import { api, API_BASE_URL } from './client'
import type {
  BiblioLibrary,
  BiblioLibraryCreate,
  BiblioLibraryUpdate,
  BiblioLibraryListResponse,
  BiblioEntry,
  BiblioEntryListResponse,
  BiblioFilter,
  BiblioStatistics,
  FilterOptions,
  UploadResult,
  NetworkVisualizationData,
  ClusterVisualizationData,
  TimelineVisualizationData,
  TimezoneVisualizationData,
  BurstDetectionData,
  LandscapeVisualizationData,
  DualMapVisualizationData,
  WordCloudVisualizationData,
  NetworkVisualizationRequest,
  ClusterVisualizationRequest,
  TimeVisualizationRequest,
  BurstDetectionRequest,
  WordCloudVisualizationRequest,
  BaseVisualizationRequest,
  HeatmapVisualizationData,
  HeatmapVisualizationRequest
} from '../types/biblio'
import type { ApiResponse } from '../types'

const BASE_URL = '/api/biblio'

// ==================== Library CRUD ====================

export async function listLibraries(): Promise<ApiResponse<BiblioLibraryListResponse>> {
  return api.get<BiblioLibraryListResponse>(`${BASE_URL}/libraries`)
}

export async function createLibrary(data: BiblioLibraryCreate): Promise<ApiResponse<BiblioLibrary>> {
  return api.post<BiblioLibrary>(`${BASE_URL}/libraries`, data)
}

export async function getLibrary(libraryId: string): Promise<ApiResponse<BiblioLibrary>> {
  return api.get<BiblioLibrary>(`${BASE_URL}/libraries/${libraryId}`)
}

export async function updateLibrary(libraryId: string, data: BiblioLibraryUpdate): Promise<ApiResponse<BiblioLibrary>> {
  return api.put<BiblioLibrary>(`${BASE_URL}/libraries/${libraryId}`, data)
}

export async function deleteLibrary(libraryId: string): Promise<ApiResponse<{ success: boolean }>> {
  return api.delete<{ success: boolean }>(`${BASE_URL}/libraries/${libraryId}`)
}

// ==================== File Upload ====================

export async function uploadRefworksFile(
  libraryId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<ApiResponse<UploadResult>> {
  const formData = new FormData()
  formData.append('file', file)
  
  return api.upload<UploadResult>(
    `${BASE_URL}/libraries/${libraryId}/upload`,
    formData,
    onProgress
  )
}

/** Export selected libraries as a portable .zip migration bundle (download). */
export async function exportLibraryBundle(
  libraryIds: string[]
): Promise<{ success: boolean; blob?: Blob; filename?: string; message?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}${BASE_URL}/export-bundle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ library_ids: libraryIds }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }))
      return { success: false, message: err.detail || 'Export failed' }
    }
    const disposition = response.headers.get('Content-Disposition') || ''
    const filenameMatch = disposition.match(/filename\s*=\s*"?([^";\r\n]+)"?/i)
    const filename = filenameMatch ? filenameMatch[1].trim() : 'metalingo_biblio.zip'
    const blob = await response.blob()
    return { success: true, blob, filename }
  } catch (error) {
    return { success: false, message: String(error) }
  }
}

/** Import a library migration bundle (.zip); recreates each library in the list. */
export async function importLibraryBundle(
  file: File
): Promise<{ success: boolean; imported_libraries?: { name: string; id: string }[]; message?: string }> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE_URL}${BASE_URL}/import-bundle`, {
      method: 'POST',
      body: formData,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { success: false, message: data.detail || 'Import failed' }
    }
    return { success: true, imported_libraries: data.imported_libraries || [] }
  } catch (error) {
    return { success: false, message: String(error) }
  }
}

/** Result of importing a paper from its original PDF (Crossref-enriched entry). */
export interface PaperPdfUploadResult {
  success: boolean
  entry_id: string
  matched_via: 'doi' | 'title' | 'none'
  pdf_path?: string
  thumbnail_path?: string | null
  entry_tasks?: { entry_id: string; text_id: string; task_id: string }[]
}

/**
 * Import a paper from its original PDF. The backend extracts metadata via Crossref, creates
 * a new entry with the PDF + thumbnail attached, and queues abstract annotation if available.
 */
export async function uploadPaperPdf(
  libraryId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<ApiResponse<PaperPdfUploadResult>> {
  const formData = new FormData()
  formData.append('file', file)
  return api.upload<PaperPdfUploadResult>(
    `${BASE_URL}/libraries/${libraryId}/upload-paper-pdf`,
    formData,
    onProgress
  )
}

// ==================== Entry Management ====================

export type BiblioEntrySortColumn = 'title' | 'year' | 'journal' | 'citation_count' | 'relevance'
export type BiblioEntrySortDir = 'asc' | 'desc'

export interface ListEntriesParams {
  libraryId: string
  page?: number
  pageSize?: number
  filters?: BiblioFilter
  titleSearch?: string
  orderBy?: BiblioEntrySortColumn
  orderDir?: BiblioEntrySortDir
  includeStatus?: boolean
}

export async function listEntries(params: ListEntriesParams): Promise<ApiResponse<BiblioEntryListResponse>> {
  const queryParams = new URLSearchParams()
  
  if (params.page) queryParams.append('page', params.page.toString())
  if (params.pageSize) queryParams.append('page_size', params.pageSize.toString())
  if (params.titleSearch) queryParams.append('title_search', params.titleSearch)
  if (params.orderBy) queryParams.append('order_by', params.orderBy)
  if (params.orderDir) queryParams.append('order_dir', params.orderDir)
  if (params.includeStatus !== false) queryParams.append('include_status', 'true')
  
  if (params.filters) {
    if (params.filters.year_start) queryParams.append('year_start', params.filters.year_start.toString())
    if (params.filters.year_end) queryParams.append('year_end', params.filters.year_end.toString())
    if (params.filters.author) queryParams.append('author', params.filters.author)
    if (params.filters.institution) queryParams.append('institution', params.filters.institution)
    if (params.filters.keyword) queryParams.append('keyword', params.filters.keyword)
    if (params.filters.journal) queryParams.append('journal', params.filters.journal)
    if (params.filters.doc_type) queryParams.append('doc_type', params.filters.doc_type)
  }
  
  const queryString = queryParams.toString()
  const url = `${BASE_URL}/libraries/${params.libraryId}/entries${queryString ? `?${queryString}` : ''}`
  
  return api.get<BiblioEntryListResponse>(url)
}

export async function getEntry(entryId: string): Promise<ApiResponse<BiblioEntry>> {
  return api.get<BiblioEntry>(`${BASE_URL}/entries/${entryId}`)
}

export async function deleteEntry(entryId: string): Promise<ApiResponse<{ success: boolean }>> {
  return api.delete<{ success: boolean }>(`${BASE_URL}/entries/${entryId}`)
}

/** Upload a PDF for an entry. Returns pdf_path and thumbnail_path on success. */
export async function uploadEntryPdf(
  entryId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<ApiResponse<{ success: boolean; pdf_path?: string; thumbnail_path?: string }>> {
  const formData = new FormData()
  formData.append('file', file)
  return api.upload<{ success: boolean; pdf_path?: string; thumbnail_path?: string }>(
    `${BASE_URL}/entries/${entryId}/upload-pdf`,
    formData,
    onProgress
  )
}

/**
 * URL for the entry's PDF thumbnail image (use as img src).
 * Pass `version` (e.g. pdf_thumbnail_path) to append a cache-busting query param so the
 * browser fetches a fresh image when the thumbnail changes instead of reusing a cached 404.
 */
export function getEntryThumbnailUrl(entryId: string, version?: string): string {
  const base = `${API_BASE_URL}${BASE_URL}/entries/${entryId}/thumbnail`
  return version ? `${base}?v=${encodeURIComponent(version)}` : base
}

/** URL to download the entry's original uploaded source PDF (server sends it as an attachment). */
export function getEntryPdfUrl(entryId: string): string {
  return `${API_BASE_URL}${BASE_URL}/entries/${entryId}/pdf`
}

export interface BiblioEntryUpdatePayload {
  // Bibliographic fields (WOS / CNKI) — all user-editable
  title?: string
  authors?: string[]
  institutions?: string[]
  countries?: string[]
  journal?: string | null
  year?: number | null
  volume?: string | null
  issue?: string | null
  pages?: string | null
  doi?: string | null
  keywords?: string[]
  abstract?: string | null
  doc_type?: string | null
  language?: string | null
  citation_count?: number | null
  source_url?: string | null
  // User annotations
  relevance?: number
  tags?: string[]
  notes?: string
  ai_sections?: Record<string, { value: string; hidden: boolean }>
}

export async function updateEntry(
  entryId: string,
  payload: BiblioEntryUpdatePayload
): Promise<ApiResponse<BiblioEntry>> {
  return api.patch<BiblioEntry>(`${BASE_URL}/entries/${entryId}`, payload)
}

export interface GenerateEntryAiParams {
  entryIds: string[]
  language: 'zh' | 'en'
  ollama_url?: string
  ollama_model?: string
  openai_base_url?: string
  openai_api_key?: string
  openai_model?: string
  use_openai_first?: boolean
}

export interface AiGenerateResultItem {
  entry_id: string
  success: boolean
  ai_sections?: Record<string, { value: string; hidden: boolean }>
  error?: string
}

export async function generateEntryAiSections(
  params: GenerateEntryAiParams
): Promise<ApiResponse<{ results: AiGenerateResultItem[] }>> {
  return api.postLong<{ results: AiGenerateResultItem[] }>(`${BASE_URL}/entries/ai-generate`, {
    entry_ids: params.entryIds,
    language: params.language,
    ollama_url: params.ollama_url,
    ollama_model: params.ollama_model,
    openai_base_url: params.openai_base_url,
    openai_api_key: params.openai_api_key,
    openai_model: params.openai_model,
    use_openai_first: params.use_openai_first ?? true
  })
}

export async function deleteEntriesBatch(entryIds: string[]): Promise<ApiResponse<{ deleted: number }>> {
  return api.post<{ deleted: number }>(`${BASE_URL}/entries/batch-delete`, { entry_ids: entryIds })
}

export async function getEntriesByIds(entryIds: string[]): Promise<ApiResponse<{ entries: BiblioEntry[] }>> {
  return api.post<{ entries: BiblioEntry[] }>(`${BASE_URL}/entries/by-ids`, { entry_ids: entryIds })
}

export interface LlmLabelsParams {
  clusters: Array<{ id: number; size?: number; top_terms?: string[]; sample_titles?: string[] }>
  language: 'zh' | 'en'
  ollama_url?: string
  ollama_model?: string
  openai_base_url?: string
  openai_api_key?: string
  openai_model?: string
  use_openai_first?: boolean
}

/** Joint AI naming for all clusters in one LLM call (cross-cluster de-duplication). */
export async function generateLlmClusterLabels(
  params: LlmLabelsParams
): Promise<ApiResponse<{ success: boolean; labels: Record<string, string> }>> {
  return api.postLong<{ success: boolean; labels: Record<string, string> }>(
    `${BASE_URL}/visualization/llm-labels`, params)
}

// ==================== Statistics & Filter Options ====================

export async function getStatistics(libraryId: string): Promise<ApiResponse<BiblioStatistics>> {
  return api.get<BiblioStatistics>(`${BASE_URL}/libraries/${libraryId}/statistics`)
}

export async function getFilterOptions(libraryId: string): Promise<ApiResponse<FilterOptions>> {
  return api.get<FilterOptions>(`${BASE_URL}/libraries/${libraryId}/filter-options`)
}

// ==================== Visualization APIs ====================

export async function getCoAuthorNetwork(request: NetworkVisualizationRequest): Promise<ApiResponse<NetworkVisualizationData>> {
  return api.post<NetworkVisualizationData>(`${BASE_URL}/visualization/co-author`, request)
}

export async function getCoInstitutionNetwork(request: NetworkVisualizationRequest): Promise<ApiResponse<NetworkVisualizationData>> {
  return api.post<NetworkVisualizationData>(`${BASE_URL}/visualization/co-institution`, request)
}

export async function getCoCountryNetwork(request: NetworkVisualizationRequest): Promise<ApiResponse<NetworkVisualizationData>> {
  return api.post<NetworkVisualizationData>(`${BASE_URL}/visualization/co-country`, request)
}

export async function getKeywordCooccurrenceNetwork(request: NetworkVisualizationRequest): Promise<ApiResponse<NetworkVisualizationData>> {
  return api.post<NetworkVisualizationData>(`${BASE_URL}/visualization/keyword-cooccur`, request)
}

export async function getCoCitationNetwork(request: NetworkVisualizationRequest): Promise<ApiResponse<NetworkVisualizationData>> {
  return api.post<NetworkVisualizationData>(`${BASE_URL}/visualization/co-citation`, request)
}

export async function getClusterView(request: ClusterVisualizationRequest): Promise<ApiResponse<ClusterVisualizationData>> {
  return api.post<ClusterVisualizationData>(`${BASE_URL}/visualization/cluster`, request)
}

export async function getTimelineView(request: TimeVisualizationRequest): Promise<ApiResponse<TimelineVisualizationData>> {
  return api.post<TimelineVisualizationData>(`${BASE_URL}/visualization/timeline`, request)
}

export async function getTimezoneView(request: TimeVisualizationRequest): Promise<ApiResponse<TimezoneVisualizationData>> {
  return api.post<TimezoneVisualizationData>(`${BASE_URL}/visualization/timezone`, request)
}

export async function getBurstDetection(request: BurstDetectionRequest): Promise<ApiResponse<BurstDetectionData>> {
  return api.post<BurstDetectionData>(`${BASE_URL}/visualization/burst`, request)
}

export async function getLandscapeView(request: BaseVisualizationRequest): Promise<ApiResponse<LandscapeVisualizationData>> {
  return api.post<LandscapeVisualizationData>(`${BASE_URL}/visualization/landscape`, request)
}

export async function getDualMapOverlay(request: BaseVisualizationRequest): Promise<ApiResponse<DualMapVisualizationData>> {
  return api.post<DualMapVisualizationData>(`${BASE_URL}/visualization/dual-map`, request)
}

export async function getHeatmapView(request: HeatmapVisualizationRequest): Promise<ApiResponse<HeatmapVisualizationData>> {
  return api.post<HeatmapVisualizationData>(`${BASE_URL}/visualization/heatmap`, request)
}

export async function getWordCloudVisualization(
  request: WordCloudVisualizationRequest
): Promise<ApiResponse<WordCloudVisualizationData>> {
  return api.post<WordCloudVisualizationData>(`${BASE_URL}/visualization/wordcloud`, {
    library_id: request.library_id,
    filters: request.filters,
    source: request.source ?? 'abstract',
    max_words: request.max_words ?? 100
  })
}

// ==================== Utility Functions ====================

export type VisualizationType = 
  | 'co-author'
  | 'co-institution'
  | 'co-country'
  | 'keyword-cooccur'
  | 'co-citation'
  | 'cluster'
  | 'timeline'
  | 'timezone'
  | 'burst'
  | 'wordcloud'
  | 'landscape'
  | 'dual-map'
  | 'citation-chord'
  | 'heatmap'

export async function getVisualization(
  type: VisualizationType,
  libraryId: string,
  filters?: BiblioFilter,
  options?: Record<string, any>
): Promise<ApiResponse<any>> {
  const request = {
    library_id: libraryId,
    filters,
    ...options
  }
  
  switch (type) {
    case 'co-author':
      return getCoAuthorNetwork(request as NetworkVisualizationRequest)
    case 'co-institution':
      return getCoInstitutionNetwork(request as NetworkVisualizationRequest)
    case 'co-country':
      return getCoCountryNetwork(request as NetworkVisualizationRequest)
    case 'keyword-cooccur':
      return getKeywordCooccurrenceNetwork(request as NetworkVisualizationRequest)
    case 'co-citation':
      return getCoCitationNetwork(request as NetworkVisualizationRequest)
    case 'cluster':
      return getClusterView(request as ClusterVisualizationRequest)
    case 'timeline':
      return getTimelineView(request as TimeVisualizationRequest)
    case 'timezone':
      return getTimezoneView(request as TimeVisualizationRequest)
    case 'burst':
      return getBurstDetection(request as BurstDetectionRequest)
    case 'landscape':
      return getLandscapeView(request as BaseVisualizationRequest)
    case 'dual-map':
    case 'citation-chord':
      return getDualMapOverlay(request as BaseVisualizationRequest)
    case 'wordcloud':
      return getWordCloudVisualization(request as WordCloudVisualizationRequest)
    case 'heatmap':
      return getHeatmapView(request as HeatmapVisualizationRequest)
    default:
      throw new Error(`Unknown visualization type: ${type}`)
  }
}


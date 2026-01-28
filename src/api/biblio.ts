/**
 * Bibliographic Visualization API Client
 */

import { api } from './client'
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
  NetworkVisualizationRequest,
  ClusterVisualizationRequest,
  TimeVisualizationRequest,
  BurstDetectionRequest,
  BaseVisualizationRequest
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

// ==================== Entry Management ====================

export interface ListEntriesParams {
  libraryId: string
  page?: number
  pageSize?: number
  filters?: BiblioFilter
}

export async function listEntries(params: ListEntriesParams): Promise<ApiResponse<BiblioEntryListResponse>> {
  const queryParams = new URLSearchParams()
  
  if (params.page) queryParams.append('page', params.page.toString())
  if (params.pageSize) queryParams.append('page_size', params.pageSize.toString())
  
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
  | 'landscape'
  | 'dual-map'

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
      return getDualMapOverlay(request as BaseVisualizationRequest)
    default:
      throw new Error(`Unknown visualization type: ${type}`)
  }
}


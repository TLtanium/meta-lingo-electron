import { api } from './client'
import type {
  Annotation,
  AnnotationArchive,
  AnnotationArchiveListItem,
  SaveAnnotationRequest,
  YoloTrack,
  TranscriptSegment,
  VideoBox,
  ClipAnnotationData,
  SpacyAnnotationData
} from '../types'

// Annotation API response types
interface AnnotationListApiResponse {
  success: boolean
  data: {
    archives: AnnotationArchiveListItem[]
  }
  message?: string
}

interface AnnotationDetailApiResponse {
  success: boolean
  data: AnnotationArchive
  message?: string
}

interface AnnotationSaveApiResponse {
  success: boolean
  data: {
    id: string
    path: string
  }
  message?: string
}

interface AnnotatedCorporaApiResponse {
  success: boolean
  data: {
    corpora: Array<{
      name: string
      archiveCount: number
    }>
  }
  message?: string
}

// Theme/Rheme analysis types
export interface ThemeRhemeResult {
  sentence_index: number
  sentence_text: string
  theme_start: number
  theme_end: number
  rheme_start: number
  rheme_end: number
  theme_text: string
  rheme_text: string
}

interface ThemeRhemeApiResponse {
  success: boolean
  data: {
    results: ThemeRhemeResult[]
    sentence_count: number
  }
  message?: string
}

// Supported framework for auto-annotation
export interface SupportedAutoAnnotationFramework {
  id: string
  name: string
  auto_annotation_type: 'mipvu' | 'theme-rheme'
  description: string
  target_label?: string
  target_label_id?: string
  target_labels?: {
    theme: string
    rheme: string
  }
}

interface SupportedFrameworksApiResponse {
  success: boolean
  data: {
    frameworks: SupportedAutoAnnotationFramework[]
  }
  message?: string
}

// Annotation API endpoints
export const annotationApi = {
  // List all annotation archives across all corpora
  listAll: (type?: 'text' | 'multimodal') => {
    const params = type ? `?type=${type}` : ''
    return api.get<AnnotationListApiResponse>(`/api/annotation/list-all${params}`)
  },

  // List annotation archives for a corpus
  list: (corpusName: string, type?: 'text' | 'multimodal', textId?: string) => {
    const params = new URLSearchParams()
    if (type) params.append('type', type)
    if (textId) params.append('text_id', textId)
    const queryString = params.toString()
    return api.get<AnnotationListApiResponse>(`/api/annotation/list/${encodeURIComponent(corpusName)}${queryString ? `?${queryString}` : ''}`)
  },

  // Load annotation archive
  load: (corpusName: string, archiveId: string) =>
    api.get<AnnotationDetailApiResponse>(`/api/annotation/load/${encodeURIComponent(corpusName)}/${archiveId}`),

  // Save annotation archive
  save: (data: SaveAnnotationRequest) =>
    api.post<AnnotationSaveApiResponse>('/api/annotation/save', data),

  // Delete annotation archive
  delete: (corpusName: string, archiveId: string) =>
    api.delete<{ success: boolean; message: string }>(
      `/api/annotation/${encodeURIComponent(corpusName)}/${archiveId}`
    ),

  // Rename annotation archive
  rename: (corpusName: string, archiveId: string, newName: string) =>
    api.put<{ success: boolean; message: string }>(
      `/api/annotation/${encodeURIComponent(corpusName)}/${archiveId}/rename`,
      { name: newName }
    ),

  // List all corpora that have annotations
  listCorpora: () =>
    api.get<AnnotatedCorporaApiResponse>('/api/annotation/corpora'),

  // Auto-annotation: Theme/Rheme analysis
  analyzeThemeRheme: (corpusId: string, textId: string) =>
    api.post<ThemeRhemeApiResponse>('/api/annotation/auto-annotate/theme-rheme', {
      corpus_id: corpusId,
      text_id: textId
    }),

  // Get supported frameworks for auto-annotation
  getSupportedFrameworks: () =>
    api.get<SupportedFrameworksApiResponse>('/api/annotation/auto-annotate/supported-frameworks')
}

// Helper function to create SaveAnnotationRequest for text annotations
export function createTextAnnotationRequest(
  corpusName: string,
  textName: string,
  framework: string,
  frameworkCategory: string,
  text: string,
  annotations: Annotation[],
  archiveId?: string,
  coderName?: string,
  spacyAnnotation?: SpacyAnnotationData,
  textId?: string  // 文本ID，用于精确关联
): SaveAnnotationRequest {
  return {
    corpusName,
    textId,
    textName,
    framework,
    frameworkCategory,
    type: 'text',
    text,
    annotations,
    archiveId,
    coderName,
    spacyAnnotation
  }
}

// Helper function to create SaveAnnotationRequest for multimodal annotations
export function createMultimodalAnnotationRequest(
  corpusName: string,
  resourceName: string,
  framework: string,
  frameworkCategory: string,
  text: string,
  annotations: Annotation[],
  mediaType: 'video' | 'audio',
  mediaPath: string,
  options?: {
    yoloAnnotations?: YoloTrack[]
    transcriptSegments?: TranscriptSegment[]
    manualTracks?: VideoBox[]
    clipAnnotations?: ClipAnnotationData
    archiveId?: string
    coderName?: string
    textId?: string  // 文本ID，用于精确关联
  }
): SaveAnnotationRequest {
  return {
    corpusName,
    textId: options?.textId,
    resourceName,
    framework,
    frameworkCategory,
    type: 'multimodal',
    text,
    annotations,
    mediaType,
    mediaPath,
    yoloAnnotations: options?.yoloAnnotations,
    transcriptSegments: options?.transcriptSegments,
    manualTracks: options?.manualTracks,
    clipAnnotations: options?.clipAnnotations,
    archiveId: options?.archiveId,
    coderName: options?.coderName
  }
}

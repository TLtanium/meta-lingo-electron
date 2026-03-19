import { api } from './client'
import type { ApiResponse } from '../types'

export interface ModelInfo {
  id: string
  moduleLabel: string
  displayName: string
  modelScopeRepoId: string
  storageRelativePath: string
  installed: boolean
  installedSource?: 'downloaded' | 'bundled' | 'missing'
  downloading?: boolean
  activeTaskId?: string
  queued?: boolean
  queuePosition?: number | null
  queuedTaskId?: string | null
  protected: boolean
  modelPath: string
  downloadPath?: string
  bundledPath?: string
}

const API_BASE = '/api/model-management'
const MODEL_MANAGEMENT_TIMEOUT = 30000 // API calls should return quickly; long work runs in background tasks

export const modelManagementApi = {
  getDownloadPath: async (): Promise<ApiResponse<{ downloadRoot: string }>> => {
    try {
      const response = await api.get<{ success: boolean; data: { downloadRoot: string } }>(
        `${API_BASE}/download-path`,
        { timeout: MODEL_MANAGEMENT_TIMEOUT }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) return inner as ApiResponse<{ downloadRoot: string }>
        return { success: true, data: inner as any } as ApiResponse<{ downloadRoot: string }>
      }
      return { success: false, data: { downloadRoot: '' }, error: response.error }
    } catch (error: any) {
      return { success: false, error: String(error?.message || error) }
    }
  },

  setDownloadPath: async (root: string): Promise<ApiResponse<{ downloadRoot: string }>> => {
    try {
      const response = await api.put<{ success: boolean; data: { downloadRoot: string } }>(
        `${API_BASE}/download-path`,
        { root },
        { timeout: MODEL_MANAGEMENT_TIMEOUT }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) return inner as ApiResponse<{ downloadRoot: string }>
        return { success: true, data: inner as any } as ApiResponse<{ downloadRoot: string }>
      }
      return response as any
    } catch (error: any) {
      return { success: false, error: String(error?.message || error) }
    }
  },

  clearDownloadPathOverride: async (): Promise<ApiResponse<{ downloadRoot: string }>> => {
    try {
      const response = await api.delete<{ success: boolean; data: { downloadRoot: string } }>(
        `${API_BASE}/download-path`,
        { timeout: MODEL_MANAGEMENT_TIMEOUT }
      )
      // Same nesting as get/set: axios wraps { data: backendBody }; backendBody is { success, data }.
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) return inner as ApiResponse<{ downloadRoot: string }>
        return { success: true, data: inner as any } as ApiResponse<{ downloadRoot: string }>
      }
      return { success: false, data: { downloadRoot: '' }, error: response.error }
    } catch (error: any) {
      return { success: false, error: String(error?.message || error) }
    }
  },

  listModels: async (): Promise<ApiResponse<ModelInfo[]>> => {
    try {
      const response = await api.get<{ success: boolean; data: ModelInfo[] }>(
        `${API_BASE}/models`,
        { timeout: MODEL_MANAGEMENT_TIMEOUT }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) {
          return inner as ApiResponse<ModelInfo[]>
        }
        return { success: true, data: inner as ModelInfo[] }
      }
      return { success: false, data: [], error: response.error }
    } catch (error: any) {
      return { success: false, data: [], error: String(error?.message || error) }
    }
  },

  downloadModel: async (modelId: string): Promise<ApiResponse<{ task_id: string; queued?: boolean; queue_position?: number }>> => {
    try {
      const response = await api.post<{ success: boolean; data: { task_id: string; queued?: boolean; queue_position?: number } }>(
        `${API_BASE}/models/${modelId}/download`,
        {},
        { timeout: MODEL_MANAGEMENT_TIMEOUT }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) return inner as ApiResponse<{ task_id: string; queued?: boolean; queue_position?: number }>
      }
      return response as ApiResponse<{ task_id: string; queued?: boolean; queue_position?: number }>
    } catch (error: any) {
      return { success: false, error: String(error?.message || error) }
    }
  },

  cancelDownload: async (taskId: string): Promise<ApiResponse<{ cancelled: boolean }>> => {
    try {
      const response = await api.post<{ success: boolean; data: { cancelled: boolean } }>(
        `${API_BASE}/downloads/${taskId}/cancel`,
        {},
        { timeout: MODEL_MANAGEMENT_TIMEOUT }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) return inner as ApiResponse<{ cancelled: boolean }>
      }
      return response as ApiResponse<{ cancelled: boolean }>
    } catch (error: any) {
      return { success: false, error: String(error?.message || error) }
    }
  },

  listActiveDownloads: async (): Promise<ApiResponse<Record<string, { task_id: string }>>> => {
    try {
      const response = await api.get<{ success: boolean; data: Record<string, { task_id: string }> }>(
        `${API_BASE}/downloads/active`,
        { timeout: MODEL_MANAGEMENT_TIMEOUT }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) return inner as ApiResponse<Record<string, { task_id: string }>>
      }
      return response as any
    } catch (error: any) {
      return { success: false, data: {}, error: String(error?.message || error) }
    }
  },

  deleteModel: async (modelId: string): Promise<ApiResponse<{ deleted: boolean }>> => {
    try {
      const response = await api.delete<{ success: boolean; data: { deleted: boolean } }>(
        `${API_BASE}/models/${modelId}`,
        { timeout: MODEL_MANAGEMENT_TIMEOUT }
      )
      if (response.success && response.data) {
        const inner = response.data as any
        if (inner.success !== undefined) return inner as ApiResponse<{ deleted: boolean }>
      }
      return response as ApiResponse<{ deleted: boolean }>
    } catch (error: any) {
      return { success: false, error: String(error?.message || error) }
    }
  }
}


import { api } from './client'
import type {
  Framework,
  FrameworkNode,
  FrameworkCategory
} from '../types'

// Framework API response types
interface FrameworkListApiResponse {
  success: boolean
  data: {
    categories: FrameworkCategory[]
  }
  message?: string
}

interface FrameworkDetailApiResponse {
  success: boolean
  data: Framework
  message?: string
}

interface FrameworkCreateRequest {
  name: string
  category: string
  description?: string
  root: FrameworkNode
}

interface FrameworkUpdateRequest {
  name?: string
  category?: string
  description?: string
  root?: FrameworkNode
}

interface FrameworkImportRequest {
  sourcePath: string
  targetCategory?: string
}

interface FrameworkImportApiResponse {
  success: boolean
  data: {
    imported: number
    failed: number
    errors?: string[]
  }
  message?: string
}

interface NodeOperationRequest {
  parent_path?: string
  node_path?: string
  name?: string
  new_name?: string
  type?: 'tier' | 'label'
  definition?: string
}

// Framework API endpoints
export const frameworkApi = {
  // Get all frameworks grouped by category
  list: () =>
    api.get<FrameworkListApiResponse>('/api/framework/list'),

  // Get framework by ID
  get: (id: string) =>
    api.get<FrameworkDetailApiResponse>(`/api/framework/${id}`),

  // Create new framework
  create: (data: FrameworkCreateRequest) =>
    api.post<FrameworkDetailApiResponse>('/api/framework/create', data),

  // Update framework
  update: (id: string, data: FrameworkUpdateRequest) =>
    api.put<FrameworkDetailApiResponse>(`/api/framework/${id}`, data),

  // Delete framework
  delete: (id: string) =>
    api.delete<{ success: boolean; message: string }>(`/api/framework/${id}`),

  // Import framework from folder structure
  import: (data: FrameworkImportRequest) =>
    api.post<FrameworkImportApiResponse>('/api/framework/import', data),

  // Import all frameworks from a category folder
  importBatch: (data: FrameworkImportRequest) =>
    api.post<FrameworkImportApiResponse>('/api/framework/import-batch', data),

  // Add node to framework (tier or label)
  addNode: (frameworkId: string, data: NodeOperationRequest) =>
    api.post<FrameworkDetailApiResponse>(`/api/framework/${frameworkId}/add-node`, data),

  // Rename node in framework
  renameNode: (frameworkId: string, data: NodeOperationRequest) =>
    api.post<FrameworkDetailApiResponse>(`/api/framework/${frameworkId}/rename-node`, data),

  // Delete node from framework
  deleteNode: (frameworkId: string, data: NodeOperationRequest) =>
    api.post<FrameworkDetailApiResponse>(`/api/framework/${frameworkId}/delete-node`, data),

  // Update node definition
  updateDefinition: (frameworkId: string, data: NodeOperationRequest) =>
    api.post<FrameworkDetailApiResponse>(`/api/framework/${frameworkId}/update-definition`, data),

  // Reset frameworks to factory defaults
  reset: () =>
    api.post<{ success: boolean; message: string }>('/api/framework/reset')
}

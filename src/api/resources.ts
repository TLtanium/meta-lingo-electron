import apiClient from './client'
export type ResourceKind = 'nrc' | 'dictionary' | 'reference'
export interface UserResource {
  id: string
  name?: string
  name_en?: string
  name_zh?: string
  count?: number
  word_count?: number
  languages?: Record<string, number>
}
export type ResourceStatus = Record<ResourceKind, UserResource[]>
export const resourceApi = {
  async list(): Promise<ResourceStatus> { return (await apiClient.get('/api/resources')).data },
  async import(kind: ResourceKind, files: File[], metadata = {}, validateOnly = false) {
    const form = new FormData()
    files.forEach(file => form.append('files', file, file.webkitRelativePath || file.name))
    form.append('metadata', JSON.stringify(metadata))
    form.append('validate_only', String(validateOnly))
    return (await apiClient.post(`/api/resources/${kind}/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }, timeout: 1200000,
    })).data.data
  },
  async remove(kind: ResourceKind, id: string) { await apiClient.delete(`/api/resources/${kind}/${id}`) },
}

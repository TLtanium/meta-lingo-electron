/**
 * Co-occurrence Analysis API Client
 */

import client from './client'
import type {
  KWICSearchRequest,
  KWICSearchResponse,
  ExtendedContextRequest,
  ExtendedContextResponse,
  CQLParseRequest,
  CQLParseResponse,
  POSTagInfo
} from '../types/collocation'

/**
 * Perform KWIC search
 */
export async function searchKWIC(request: KWICSearchRequest): Promise<{ success: boolean; data?: KWICSearchResponse; error?: string }> {
  try {
    const response = await client.post<KWICSearchResponse>('/api/collocation/search', request)
    return { success: true, data: response.data }
  } catch (error: any) {
    return { success: false, error: error.message || 'KWIC search failed' }
  }
}

/**
 * Get extended context for a KWIC result
 */
export async function getExtendedContext(request: ExtendedContextRequest): Promise<{ success: boolean; data?: ExtendedContextResponse; error?: string }> {
  try {
    const response = await client.post<ExtendedContextResponse>('/api/collocation/extended-context', request)
    return { success: true, data: response.data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get extended context' }
  }
}

/**
 * Parse and validate CQL query
 */
export async function parseCQL(query: string): Promise<{ success: boolean; data?: CQLParseResponse; error?: string }> {
  try {
    const response = await client.post<CQLParseResponse>('/api/collocation/parse-cql', { query })
    return { success: true, data: response.data }
  } catch (error: any) {
    return { success: false, error: error.message || 'CQL parse failed' }
  }
}

/**
 * Get SpaCy Universal POS tags
 */
export async function getPosTags(): Promise<{ success: boolean; data?: POSTagInfo[]; error?: string }> {
  try {
    const response = await client.get<POSTagInfo[]>('/api/collocation/pos-tags')
    return { success: true, data: response.data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get POS tags' }
  }
}

/**
 * Get Penn Treebank POS tags
 */
export async function getPennTags(): Promise<{ success: boolean; data?: POSTagInfo[]; error?: string }> {
  try {
    const response = await client.get<POSTagInfo[]>('/api/collocation/penn-tags')
    return { success: true, data: response.data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get Penn tags' }
  }
}

/**
 * Get dependency relation tags
 */
export async function getDepTags(): Promise<{ success: boolean; data?: POSTagInfo[]; error?: string }> {
  try {
    const response = await client.get<POSTagInfo[]>('/api/collocation/dep-tags')
    return { success: true, data: response.data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get dependency tags' }
  }
}

// Export all functions as collocationApi object
export const collocationApi = {
  searchKWIC,
  getExtendedContext,
  parseCQL,
  getPosTags,
  getPennTags,
  getDepTags
}

export default collocationApi

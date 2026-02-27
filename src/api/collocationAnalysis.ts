/**
 * Collocation Analysis API Client
 */

import { api } from './client'
import type {
  CollocationAnalysisRequest,
  CollocationAnalysisResponse
} from '../types/collocationAnalysis'

export const collocationAnalysisApi = {
  /**
   * Perform collocation analysis for a node word
   */
  analyze: (request: CollocationAnalysisRequest) =>
    api.post<CollocationAnalysisResponse>('/api/collocation-analysis/analyze', request),
}

export default collocationAnalysisApi

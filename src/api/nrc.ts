/**
 * NRC Emotion Lexicon API
 * Provides polarity and emotion label definitions for CQL builder
 */

import { api } from './client'

export interface NRCLabelItem {
  value: string
  label_zh: string
  label_en: string
}

export interface NRCEmotionsResponse {
  success: boolean
  polarity: NRCLabelItem[]
  emotions: NRCLabelItem[]
  all_labels: NRCLabelItem[]
}

export const nrcApi = {
  getEmotions: () =>
    api.get<NRCEmotionsResponse>('/api/nrc/emotions').then((res) => {
      const payload = res as any
      const data = payload?.data ?? payload
      if (data?.polarity && data?.emotions) return data as NRCEmotionsResponse
      if (data?.success && data?.polarity) return data as NRCEmotionsResponse
      throw new Error('Invalid NRC emotions response')
    })
}

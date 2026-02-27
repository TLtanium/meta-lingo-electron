/**
 * USAS semantic domain API
 */

import { api } from './client'

export interface USASDomainItem {
  code: string
  description: string
}

export interface USASDomainsByCategory {
  [category: string]: USASDomainItem[]
}

export interface USASDomainsResponse {
  major_categories: Record<string, string>
  domains_by_category: USASDomainsByCategory
  total_domains: number
}

/** Flatten domains_by_category into a single list for autocomplete (code + description label) */
export function flattenUsasDomains(data: USASDomainsResponse | null): { value: string; label: string }[] {
  if (!data?.domains_by_category) return []
  const out: { value: string; label: string }[] = []
  const cats = data.domains_by_category
  for (const cat of Object.keys(cats).sort()) {
    for (const d of cats[cat]) {
      out.push({
        value: d.code,
        label: `${d.code} - ${d.description || ''}`
      })
    }
  }
  return out
}

export const usasApi = {
  getDomains: () =>
    api.get<{ success?: boolean; data?: USASDomainsResponse }>('/api/usas/domains').then((res) => {
      if (!res.success) throw new Error(res.error || 'Failed to load USAS domains')
      const payload = res.data as any
      const data = payload?.data ?? payload
      if (data?.domains_by_category) return data as USASDomainsResponse
      throw new Error('Invalid USAS domains response')
    })
}

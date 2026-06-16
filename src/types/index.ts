// Export all types
export * from './corpus'
export * from './analysis'
export * from './api'
export * from './annotation'
export * from './topicModeling'
export * from './synonym'
export * from './keyword'
export * from './crossLink'

// Tab types
export type TabType = 
  | 'home'
  | 'corpus'
  | 'wordfreq'
  | 'synonym'
  | 'keyword'
  | 'ngram'
  | 'collocation'
  | 'semantic'
  | 'wordsketch'
  | 'biblio'
  | 'annotation'
  | 'topic'
  | 'sentiment'
  | 'settings'
  | 'help'

export interface Tab {
  id: string
  title: string
  type: TabType
  icon?: string
  props?: Record<string, unknown>
  closable?: boolean
}

// Settings types
export type Language = 'zh' | 'en'

export interface ApiLine {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface AppSettings {
  language: Language
  wallpaper: string | null
  wallpaperOpacity: number
  ollamaUrl: string
  ollamaConnected: boolean
  ollamaModel: string | null
}


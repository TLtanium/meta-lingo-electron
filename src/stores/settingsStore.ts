import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language, ApiLine } from '../types'

interface SettingsStore {
  // Language settings
  language: Language
  setLanguage: (language: Language) => void

  // Wallpaper settings
  wallpaper: string | null
  wallpaperOpacity: number
  setWallpaper: (wallpaper: string | null) => void
  setWallpaperOpacity: (opacity: number) => void

  // Custom wallpaper (user uploaded)
  customWallpaper: string | null
  setCustomWallpaper: (wallpaper: string | null) => void

  // Ollama settings
  ollamaUrl: string
  ollamaConnected: boolean
  ollamaModel: string | null
  ollamaModels: string[]
  setOllamaUrl: (url: string) => void
  setOllamaConnected: (connected: boolean) => void
  setOllamaModel: (model: string | null) => void
  setOllamaModels: (models: string[]) => void

  // Multi-line API management (v1)
  apiLines: ApiLine[]
  activeApiLineId: string | null
  addApiLine: (line: Omit<ApiLine, 'id'>) => void
  updateApiLine: (id: string, updates: Partial<Omit<ApiLine, 'id'>>) => void
  removeApiLine: (id: string) => void
  setActiveApiLine: (id: string | null) => void
  resetApiConfig: () => void

  // Backward-compat derived fields — always synced from active line
  openaiApiEnabled: boolean
  openaiApiBaseUrl: string
  openaiApiKey: string
  openaiApiModel: string
  // Legacy setters kept for existing consumers (FactoryReset, etc.)
  setOpenaiApiEnabled: (enabled: boolean) => void
  setOpenaiApiBaseUrl: (url: string) => void
  setOpenaiApiKey: (key: string) => void
  setOpenaiApiModel: (model: string) => void

  // Agent Chat mode
  agentMode: boolean
  setAgentMode: (mode: boolean) => void

  // Theme (future use)
  darkMode: boolean
  setDarkMode: (dark: boolean) => void

  // User profile
  userName: string
  userAvatar: string | null  // base64 data URL, null = use default
  setUserName: (name: string) => void
  setUserAvatar: (avatar: string | null) => void
}

function _deriveFromLine(line: ApiLine | undefined) {
  if (!line) return { openaiApiEnabled: false, openaiApiBaseUrl: 'https://api.openai.com/v1', openaiApiKey: '', openaiApiModel: '' }
  return { openaiApiEnabled: true, openaiApiBaseUrl: line.baseUrl, openaiApiKey: line.apiKey, openaiApiModel: line.model }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Language
      language: 'zh',
      setLanguage: (language) => set({ language }),

      // Wallpaper
      wallpaper: null,
      wallpaperOpacity: 0.3,
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setWallpaperOpacity: (opacity) => set({ wallpaperOpacity: opacity }),

      // Custom wallpaper (user uploaded)
      customWallpaper: null,
      setCustomWallpaper: (wallpaper) => set({ customWallpaper: wallpaper }),

      // Ollama
      ollamaUrl: 'http://localhost:11434',
      ollamaConnected: false,
      ollamaModel: null,
      ollamaModels: [],
      setOllamaUrl: (url) => set({ ollamaUrl: url }),
      setOllamaConnected: (connected) => set({ ollamaConnected: connected }),
      setOllamaModel: (model) => set({ ollamaModel: model }),
      setOllamaModels: (models) => set({ ollamaModels: models }),

      // Multi-line API management
      apiLines: [],
      activeApiLineId: null,

      addApiLine: (line) => set((state) => {
        const id = crypto.randomUUID()
        const newLine: ApiLine = { ...line, id }
        const newLines = [...state.apiLines, newLine]
        // If no active line yet, activate this one
        if (!state.activeApiLineId) {
          return { apiLines: newLines, activeApiLineId: id, ..._deriveFromLine(newLine) }
        }
        return { apiLines: newLines }
      }),

      updateApiLine: (id, updates) => set((state) => {
        const newLines = state.apiLines.map(l => l.id === id ? { ...l, ...updates } : l)
        if (state.activeApiLineId === id) {
          const updated = newLines.find(l => l.id === id)
          return { apiLines: newLines, ..._deriveFromLine(updated) }
        }
        return { apiLines: newLines }
      }),

      removeApiLine: (id) => set((state) => {
        const newLines = state.apiLines.filter(l => l.id !== id)
        if (state.activeApiLineId === id) {
          return { apiLines: newLines, activeApiLineId: null, ..._deriveFromLine(undefined) }
        }
        return { apiLines: newLines }
      }),

      setActiveApiLine: (id) => set((state) => {
        if (id === null) return { activeApiLineId: null, ..._deriveFromLine(undefined) }
        const line = state.apiLines.find(l => l.id === id)
        return { activeApiLineId: id, ..._deriveFromLine(line) }
      }),

      resetApiConfig: () => set({ apiLines: [], activeApiLineId: null, ..._deriveFromLine(undefined) }),

      // Backward-compat fields (synced from active line)
      openaiApiEnabled: false,
      openaiApiBaseUrl: 'https://api.openai.com/v1',
      openaiApiKey: '',
      openaiApiModel: '',

      // Legacy setters
      setOpenaiApiEnabled: (enabled) => {
        const state = get()
        if (!enabled) {
          set({ activeApiLineId: null, ..._deriveFromLine(undefined) })
        } else if (state.apiLines.length > 0) {
          const first = state.apiLines[0]
          set({ activeApiLineId: first.id, ..._deriveFromLine(first) })
        } else {
          set({ openaiApiEnabled: true })
        }
      },
      setOpenaiApiBaseUrl: (url) => {
        const state = get()
        if (state.activeApiLineId) {
          const newLines = state.apiLines.map(l =>
            l.id === state.activeApiLineId ? { ...l, baseUrl: url } : l
          )
          set({ apiLines: newLines, openaiApiBaseUrl: url })
        } else {
          set({ openaiApiBaseUrl: url })
        }
      },
      setOpenaiApiKey: (key) => {
        const state = get()
        if (state.activeApiLineId) {
          const newLines = state.apiLines.map(l =>
            l.id === state.activeApiLineId ? { ...l, apiKey: key } : l
          )
          set({ apiLines: newLines, openaiApiKey: key })
        } else {
          set({ openaiApiKey: key })
        }
      },
      setOpenaiApiModel: (model) => {
        const state = get()
        if (state.activeApiLineId) {
          const newLines = state.apiLines.map(l =>
            l.id === state.activeApiLineId ? { ...l, model } : l
          )
          set({ apiLines: newLines, openaiApiModel: model })
        } else {
          set({ openaiApiModel: model })
        }
      },

      // Agent Chat mode
      agentMode: false,
      setAgentMode: (mode) => set({ agentMode: mode }),

      // Theme
      darkMode: false,
      setDarkMode: (dark) => set({ darkMode: dark }),

      // User profile
      userName: '',
      userAvatar: null,
      setUserName: (name) => set({ userName: name }),
      setUserAvatar: (avatar) => set({ userAvatar: avatar }),
    }),
    {
      name: 'meta-lingo-settings',
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Migrate from v0: single openaiApi* fields → apiLines array
          const lines: ApiLine[] = []
          let activeId: string | null = null
          const hasConfig = persistedState.openaiApiBaseUrl || persistedState.openaiApiKey
          if (hasConfig) {
            const id = crypto.randomUUID()
            lines.push({
              id,
              name: 'Default',
              baseUrl: persistedState.openaiApiBaseUrl ?? 'https://api.openai.com/v1',
              apiKey: persistedState.openaiApiKey ?? '',
              model: persistedState.openaiApiModel ?? '',
            })
            if (persistedState.openaiApiEnabled) activeId = id
          }
          return { ...persistedState, apiLines: lines, activeApiLineId: activeId }
        }
        return persistedState as SettingsStore
      }
    }
  )
)

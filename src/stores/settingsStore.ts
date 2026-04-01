import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '../types'

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

  // OpenAI-compatible API (optional, default off)
  openaiApiEnabled: boolean
  openaiApiBaseUrl: string
  openaiApiKey: string
  openaiApiModel: string
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

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
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

      // OpenAI-compatible API (default off)
      openaiApiEnabled: false,
      openaiApiBaseUrl: 'https://api.openai.com/v1',
      openaiApiKey: '',
      openaiApiModel: '',
      setOpenaiApiEnabled: (enabled) => set({ openaiApiEnabled: enabled }),
      setOpenaiApiBaseUrl: (url) => set({ openaiApiBaseUrl: url }),
      setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
      setOpenaiApiModel: (model) => set({ openaiApiModel: model }),
      
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
      name: 'meta-lingo-settings'
    }
  )
)


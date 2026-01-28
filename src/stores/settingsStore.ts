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
  
  // Theme (future use)
  darkMode: boolean
  setDarkMode: (dark: boolean) => void
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
      
      // Theme
      darkMode: false,
      setDarkMode: (dark) => set({ darkMode: dark })
    }),
    {
      name: 'meta-lingo-settings'
    }
  )
)


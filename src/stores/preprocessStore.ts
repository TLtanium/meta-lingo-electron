import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PreprocessConfig } from '../types'

interface PreprocessStore {
  // Current preprocess configuration
  config: PreprocessConfig
  
  // Available stopwords languages
  availableStopwordsLanguages: string[]
  
  // Actions
  setConfig: (config: PreprocessConfig) => void
  updateConfig: (updates: Partial<PreprocessConfig>) => void
  resetConfig: () => void
  
  // Toggle individual options
  toggleEntityExtraction: () => void
  toggleRemovePunctuation: () => void
  toggleTextNormalization: () => void
  toggleToLowerCase: () => void
  toggleRemoveStopwords: () => void
  setStopwordsLanguage: (language: string) => void
}

const defaultConfig: PreprocessConfig = {
  entityExtraction: false,
  removePunctuation: true,
  textNormalization: true,
  toLowerCase: true,
  removeStopwords: true,
  stopwordsLanguage: 'english'
}

// Available stopwords languages based on NLTK
const stopwordsLanguages = [
  'albanian',
  'arabic',
  'armenian',
  'basque',
  'bengali',
  'breton',
  'bulgarian',
  'catalan',
  'chinese',
  'croatian',
  'czech',
  'danish',
  'dutch',
  'english',
  'esperanto',
  'estonian',
  'finnish',
  'french',
  'galician',
  'german',
  'greek',
  'gujarati',
  'hausa',
  'hebrew',
  'hindi',
  'hungarian',
  'indonesian',
  'irish',
  'italian',
  'japanese',
  'kannada',
  'kazakh',
  'korean',
  'latvian',
  'lithuanian',
  'macedonian',
  'malay',
  'malayalam',
  'marathi',
  'nepali',
  'norwegian',
  'persian',
  'polish',
  'portuguese',
  'punjabi',
  'romanian',
  'russian',
  'serbian',
  'slovak',
  'slovenian',
  'somali',
  'spanish',
  'swahili',
  'swedish',
  'tagalog',
  'tamil',
  'telugu',
  'thai',
  'turkish',
  'ukrainian',
  'urdu',
  'vietnamese',
  'yoruba',
  'zulu'
]

export const usePreprocessStore = create<PreprocessStore>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      availableStopwordsLanguages: stopwordsLanguages,

      setConfig: (config) => set({ config }),

      updateConfig: (updates) => set({
        config: { ...get().config, ...updates }
      }),

      resetConfig: () => set({ config: defaultConfig }),

      toggleEntityExtraction: () => set({
        config: { ...get().config, entityExtraction: !get().config.entityExtraction }
      }),

      toggleRemovePunctuation: () => set({
        config: { ...get().config, removePunctuation: !get().config.removePunctuation }
      }),

      toggleTextNormalization: () => set({
        config: { ...get().config, textNormalization: !get().config.textNormalization }
      }),

      toggleToLowerCase: () => set({
        config: { ...get().config, toLowerCase: !get().config.toLowerCase }
      }),

      toggleRemoveStopwords: () => set({
        config: { ...get().config, removeStopwords: !get().config.removeStopwords }
      }),

      setStopwordsLanguage: (language) => set({
        config: { ...get().config, stopwordsLanguage: language }
      })
    }),
    {
      name: 'meta-lingo-preprocess'
    }
  )
)


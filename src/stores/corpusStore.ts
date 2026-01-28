import { create } from 'zustand'
import type { Corpus, CorpusText, CorpusFilters, CorpusSelection, PreprocessConfig, defaultPreprocessConfig } from '../types'

// Task info for background processing
export interface TaskInfo {
  taskId: string
  corpusId: string
  textId: string
  progress: number
  stage: string
  message: string
  status: string
}

interface CorpusStore {
  // State
  corpora: Corpus[]
  currentCorpus: Corpus | null
  selectedTexts: string[]
  filters: CorpusFilters
  isLoading: boolean
  error: string | null
  
  // Background tasks state (persists across tab switches)
  processingTasks: Map<string, TaskInfo>
  
  // Actions
  setCorpora: (corpora: Corpus[]) => void
  addCorpus: (corpus: Corpus) => void
  updateCorpus: (id: string, updates: Partial<Corpus>) => void
  deleteCorpus: (id: string) => void
  setCurrentCorpus: (corpus: Corpus | null) => void
  
  // Text selection
  selectText: (textId: string) => void
  deselectText: (textId: string) => void
  selectAllTexts: () => void
  clearSelection: () => void
  toggleTextSelection: (textId: string) => void
  
  // Filters
  setFilters: (filters: CorpusFilters) => void
  clearFilters: () => void
  
  // Tags
  addTagToCorpus: (corpusId: string, tag: string) => void
  removeTagFromCorpus: (corpusId: string, tag: string) => void
  addTagToText: (textId: string, tag: string) => void
  removeTagFromText: (textId: string, tag: string) => void
  
  // Loading state
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  
  // Get selection for analysis
  getSelection: (preprocessConfig?: PreprocessConfig) => CorpusSelection | null
  
  // Background tasks management
  setTask: (textId: string, task: TaskInfo) => void
  updateTask: (textId: string, updates: Partial<TaskInfo>) => void
  removeTask: (textId: string) => void
  clearCompletedTasks: () => void
  getTasksForCorpus: (corpusId: string) => TaskInfo[]
  hasActiveTasks: (corpusId: string) => boolean
}

export const useCorpusStore = create<CorpusStore>((set, get) => ({
  corpora: [],
  currentCorpus: null,
  selectedTexts: [],
  filters: {},
  isLoading: false,
  error: null,
  processingTasks: new Map(),

  setCorpora: (corpora) => set({ corpora }),

  addCorpus: (corpus) => set({ corpora: [...get().corpora, corpus] }),

  updateCorpus: (id, updates) => set({
    corpora: get().corpora.map(c => c.id === id ? { ...c, ...updates } : c),
    currentCorpus: get().currentCorpus?.id === id 
      ? { ...get().currentCorpus!, ...updates }
      : get().currentCorpus
  }),

  deleteCorpus: (id) => set({
    corpora: get().corpora.filter(c => c.id !== id),
    currentCorpus: get().currentCorpus?.id === id ? null : get().currentCorpus
  }),

  setCurrentCorpus: (corpus) => set({ 
    currentCorpus: corpus,
    selectedTexts: []
  }),

  selectText: (textId) => set({
    selectedTexts: [...get().selectedTexts, textId]
  }),

  deselectText: (textId) => set({
    selectedTexts: get().selectedTexts.filter(id => id !== textId)
  }),

  selectAllTexts: () => {
    const { currentCorpus, filters } = get()
    if (!currentCorpus) return

    let texts = currentCorpus.texts

    // Apply filters
    if (filters.tags?.length) {
      texts = texts.filter(t => 
        filters.tags!.some(tag => t.tags.includes(tag))
      )
    }
    if (filters.mediaType) {
      texts = texts.filter(t => t.mediaType === filters.mediaType)
    }

    set({ selectedTexts: texts.map(t => t.id) })
  },

  clearSelection: () => set({ selectedTexts: [] }),

  toggleTextSelection: (textId) => {
    const { selectedTexts } = get()
    if (selectedTexts.includes(textId)) {
      set({ selectedTexts: selectedTexts.filter(id => id !== textId) })
    } else {
      set({ selectedTexts: [...selectedTexts, textId] })
    }
  },

  setFilters: (filters) => set({ filters }),

  clearFilters: () => set({ filters: {} }),

  addTagToCorpus: (corpusId, tag) => {
    const corpus = get().corpora.find(c => c.id === corpusId)
    if (corpus && !corpus.tags.includes(tag)) {
      get().updateCorpus(corpusId, { tags: [...corpus.tags, tag] })
    }
  },

  removeTagFromCorpus: (corpusId, tag) => {
    const corpus = get().corpora.find(c => c.id === corpusId)
    if (corpus) {
      get().updateCorpus(corpusId, { tags: corpus.tags.filter(t => t !== tag) })
    }
  },

  addTagToText: (textId, tag) => {
    const { corpora, currentCorpus } = get()
    const updatedCorpora = corpora.map(corpus => ({
      ...corpus,
      texts: corpus.texts.map(text =>
        text.id === textId && !text.tags.includes(tag)
          ? { ...text, tags: [...text.tags, tag] }
          : text
      )
    }))
    set({ corpora: updatedCorpora })

    if (currentCorpus) {
      const updatedTexts = currentCorpus.texts.map(text =>
        text.id === textId && !text.tags.includes(tag)
          ? { ...text, tags: [...text.tags, tag] }
          : text
      )
      set({ currentCorpus: { ...currentCorpus, texts: updatedTexts } })
    }
  },

  removeTagFromText: (textId, tag) => {
    const { corpora, currentCorpus } = get()
    const updatedCorpora = corpora.map(corpus => ({
      ...corpus,
      texts: corpus.texts.map(text =>
        text.id === textId
          ? { ...text, tags: text.tags.filter(t => t !== tag) }
          : text
      )
    }))
    set({ corpora: updatedCorpora })

    if (currentCorpus) {
      const updatedTexts = currentCorpus.texts.map(text =>
        text.id === textId
          ? { ...text, tags: text.tags.filter(t => t !== tag) }
          : text
      )
      set({ currentCorpus: { ...currentCorpus, texts: updatedTexts } })
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  getSelection: (preprocessConfig) => {
    const { currentCorpus, selectedTexts, filters } = get()
    if (!currentCorpus) return null

    return {
      corpusId: currentCorpus.id,
      textIds: selectedTexts.length > 0 ? selectedTexts : 'all',
      filters,
      preprocessConfig: preprocessConfig || {
        entityExtraction: false,
        removePunctuation: true,
        textNormalization: true,
        toLowerCase: true,
        removeStopwords: true,
        stopwordsLanguage: 'english'
      }
    }
  },

  // Background tasks management
  setTask: (textId, task) => {
    const tasks = new Map(get().processingTasks)
    tasks.set(textId, task)
    set({ processingTasks: tasks })
  },

  updateTask: (textId, updates) => {
    const tasks = new Map(get().processingTasks)
    const existing = tasks.get(textId)
    if (existing) {
      tasks.set(textId, { ...existing, ...updates })
      set({ processingTasks: tasks })
    }
  },

  removeTask: (textId) => {
    const tasks = new Map(get().processingTasks)
    tasks.delete(textId)
    set({ processingTasks: tasks })
  },

  clearCompletedTasks: () => {
    const tasks = new Map(get().processingTasks)
    for (const [textId, task] of tasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        tasks.delete(textId)
      }
    }
    set({ processingTasks: tasks })
  },

  getTasksForCorpus: (corpusId) => {
    const tasks: TaskInfo[] = []
    for (const task of get().processingTasks.values()) {
      if (task.corpusId === corpusId) {
        tasks.push(task)
      }
    }
    return tasks
  },

  hasActiveTasks: (corpusId) => {
    for (const task of get().processingTasks.values()) {
      if (task.corpusId === corpusId && 
          (task.status === 'pending' || task.status === 'processing')) {
        return true
      }
    }
    return false
  }
}))


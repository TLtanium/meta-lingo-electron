import { create } from 'zustand'
import type { Tab, TabType } from '../types'

interface TabStore {
  tabs: Tab[]
  activeTabId: string
  
  // Actions
  openTab: (tab: Omit<Tab, 'id'>) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<Tab>) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  closeAllTabs: () => void
  closeOtherTabs: (id: string) => void
}

// Generate unique tab ID
const generateTabId = () => `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Get default title for tab type
const getDefaultTitle = (type: TabType): string => {
  const titles: Record<TabType, string> = {
    home: 'home.title',
    corpus: 'corpus.title',
    wordfreq: 'wordFrequency.title',
    synonym: 'synonym.title',
    keyword: 'keyword.title',
    ngram: 'ngram.title',
    collocation: 'collocation.title',
    semantic: 'semantic.title',
    wordsketch: 'wordsketch.title',
    biblio: 'biblio.title',
    annotation: 'annotation.title',
    topic: 'topicModeling.title',
    settings: 'settings.title',
    help: 'help.title'
  }
  return titles[type]
}

// Initial home tab
const homeTab: Tab = {
  id: 'home',
  title: 'home.title',
  type: 'home',
  closable: false
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [homeTab],
  activeTabId: 'home',

  openTab: (tabData) => {
    const { tabs } = get()
    
    // Check if a tab of the same type already exists (for singleton tabs like settings)
    const singletonTypes: TabType[] = ['settings', 'help']
    if (singletonTypes.includes(tabData.type)) {
      const existingTab = tabs.find(t => t.type === tabData.type)
      if (existingTab) {
        set({ activeTabId: existingTab.id })
        return
      }
    }

    const newTab: Tab = {
      id: generateTabId(),
      title: tabData.title || getDefaultTitle(tabData.type),
      type: tabData.type,
      props: tabData.props,
      closable: tabData.closable !== false
    }

    set({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id
    })
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    const tabIndex = tabs.findIndex(t => t.id === id)
    const tab = tabs[tabIndex]

    // Cannot close non-closable tabs
    if (tab && tab.closable === false) return

    const newTabs = tabs.filter(t => t.id !== id)

    // If closing active tab, switch to adjacent tab
    let newActiveId = activeTabId
    if (activeTabId === id && newTabs.length > 0) {
      const newIndex = Math.min(tabIndex, newTabs.length - 1)
      newActiveId = newTabs[newIndex].id
    }

    set({
      tabs: newTabs,
      activeTabId: newActiveId
    })
  },

  setActiveTab: (id) => {
    set({ activeTabId: id })
  },

  updateTab: (id, updates) => {
    set({
      tabs: get().tabs.map(tab =>
        tab.id === id ? { ...tab, ...updates } : tab
      )
    })
  },

  reorderTabs: (fromIndex, toIndex) => {
    const { tabs } = get()
    const newTabs = [...tabs]
    const [removed] = newTabs.splice(fromIndex, 1)
    newTabs.splice(toIndex, 0, removed)
    set({ tabs: newTabs })
  },

  closeAllTabs: () => {
    set({
      tabs: [homeTab],
      activeTabId: 'home'
    })
  },

  closeOtherTabs: (id) => {
    const { tabs } = get()
    const keepTab = tabs.find(t => t.id === id)
    if (keepTab) {
      set({
        tabs: [homeTab, ...(keepTab.id === 'home' ? [] : [keepTab])],
        activeTabId: id
      })
    }
  }
}))


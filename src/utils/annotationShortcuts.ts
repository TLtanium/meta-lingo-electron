/**
 * Annotation Keyboard Shortcuts Utility
 * Manages Ctrl/Cmd + 1-0 shortcut key slots per framework
 */

export interface ShortcutSlot {
  label: string
  path: string
  color: string
}

// slot keys: '1','2','3','4','5','6','7','8','9','0'
export type ShortcutKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0'
export const SHORTCUT_KEYS: ShortcutKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

export type FrameworkShortcuts = Partial<Record<ShortcutKey, ShortcutSlot | null>>

const STORAGE_KEY = 'meta-lingo:annotation-shortcuts'

/** Load all shortcuts from localStorage */
function loadAll(): Record<string, FrameworkShortcuts> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, FrameworkShortcuts>
  } catch {
    return {}
  }
}

/** Save all shortcuts to localStorage */
function saveAll(data: Record<string, FrameworkShortcuts>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore storage errors
  }
}

/** Get shortcuts for a specific framework */
export function getFrameworkShortcuts(frameworkId: string): FrameworkShortcuts {
  return loadAll()[frameworkId] ?? {}
}

/** Set shortcuts for a specific framework */
export function setFrameworkShortcuts(frameworkId: string, shortcuts: FrameworkShortcuts) {
  const all = loadAll()
  all[frameworkId] = shortcuts
  saveAll(all)
}

/** Delete shortcuts for a specific framework (called when framework is deleted) */
export function deleteFrameworkShortcuts(frameworkId: string) {
  const all = loadAll()
  delete all[frameworkId]
  saveAll(all)
}

/** Clear all annotation shortcuts (called on factory reset) */
export function clearAllAnnotationShortcuts() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Get the display string for a shortcut key (e.g., Ctrl+1 / ⌘1) */
export function getShortcutDisplay(key: ShortcutKey, isMac: boolean): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`
}

/** Detect whether we're on macOS */
export function isMacOS(): boolean {
  return navigator.platform.toUpperCase().includes('MAC')
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PET_PREFERENCES, sanitizePreferences, type PetPreferences, type PetTask } from '../../shared/desktopPet.mjs'

interface PetStore {
  preferences: PetPreferences
  tasks: PetTask[]
  updatePreferences: (updates: Partial<PetPreferences>) => void
  upsertTask: (task: Omit<PetTask, 'updatedAt'>) => void
  acknowledge: (taskId?: string) => void
}
export const usePetStore = create<PetStore>()(persist((set) => ({
  preferences: { ...DEFAULT_PET_PREFERENCES },
  tasks: [],
  updatePreferences: updates => set(s => ({ preferences: sanitizePreferences({ ...s.preferences, ...updates }) })),
  upsertTask: task => set(s => {
    const old = s.tasks.find(t => t.id === task.id)
    if (old && old.phase === task.phase && old.progress === task.progress && old.detail === task.detail) return s
    const tasks = [...s.tasks.filter(t => t.id !== task.id), { ...task, updatedAt: Date.now(), acknowledged: old?.phase === task.phase ? old.acknowledged : false }]
    // Active tasks are never discarded to make room for history.
    return { tasks: [...tasks.filter(t => t.phase === 'working' || t.phase === 'waiting'), ...tasks.filter(t => t.phase !== 'working' && t.phase !== 'waiting').slice(-12)] }
  }),
  acknowledge: taskId => set(s => ({ tasks: s.tasks.map(t => !taskId || t.id === taskId ? { ...t, acknowledged: true } : t) })),
}), { name: 'meta-lingo-pet', partialize: s => ({ preferences: s.preferences }), merge: (saved, current) => ({ ...current, preferences: sanitizePreferences({ ...DEFAULT_PET_PREFERENCES, ...(saved as { preferences?: Partial<PetPreferences> })?.preferences }) }) }))

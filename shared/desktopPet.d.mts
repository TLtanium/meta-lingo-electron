export type PetPhase = 'working' | 'waiting' | 'completed' | 'failed' | 'cancelled'
export type PetTarget = { kind: 'agent'; id?: string } | { kind: 'corpus'; id: string } | { kind: 'tab'; id: string }
export interface PetTask {
  id: string
  titleKey: string
  phase: PetPhase
  progress?: number
  detail?: string
  target: PetTarget
  updatedAt: number
  acknowledged?: boolean
}
export interface PetPreferences {
  enabled: boolean
  scale: number
  roaming: boolean
  alwaysOnTop: boolean
}
export interface PetSnapshot {
  reducedMotion?: boolean
  preferences: PetPreferences
  language: 'zh' | 'en'
  dark: boolean
  tasks: PetTask[]
}
export type PetAction =
  | { type: 'hide' }
  | { type: 'preferences'; scale?: number; roaming?: boolean; alwaysOnTop?: boolean }
  | { type: 'open'; destination: 'chat' | 'tasks' | 'home' | 'help'; taskId?: string }
  | { type: 'acknowledge'; taskId?: string }
export type PetMotion = { x: number; y: number; dragging: boolean; walking: -1 | 0 | 1; bodyX?:number; bodyY?:number; viewWidth?:number; viewHeight?:number }
export interface DesktopPetAPI {
  sync: (snapshot: PetSnapshot) => Promise<void>
  getSnapshot: () => Promise<PetSnapshot | null>
  onSnapshot: (callback: (snapshot: PetSnapshot) => void) => () => void
  onAction: (callback: (action: PetAction) => void) => () => void
  onMotion: (callback: (motion: PetMotion) => void) => () => void
  action: (action: PetAction) => Promise<void>
  hit: (interactive: boolean) => void
  interaction: (active: boolean) => void
  drag: (active: boolean) => void
  reset: () => Promise<void>
}
export const DEFAULT_PET_PREFERENCES: PetPreferences
export const PET_VIEWPORT: { width: number; height: number }
export function clampPetPosition(point: { x:number;y:number }, area:{ x:number;y:number;width:number;height:number }, size?:{width:number;height:number}):{x:number;y:number}
export function sanitizePreferences(input:Partial<PetPreferences>):PetPreferences
export function selectPetTask(tasks:PetTask[],now?:number):PetTask|undefined

export function layoutPet(point:{x:number;y:number},area:{x:number;y:number;width:number;height:number},scale?:number):{point:{x:number;y:number};bounds:{x:number;y:number;width:number;height:number};bodyX:number;bodyY:number}

export interface StartupStatus {
  stage: 'initializing' | 'starting_backend' | 'checking_health' | 'ready' | 'error'
  message: string
  progress: number
  backendReady: boolean
  seq?: number
  attemptId?: number
}

interface StartupBridge {
  platform: string
  getStartupStatus: () => Promise<StartupStatus>
  restartApplication?: (language: 'zh' | 'en') => Promise<{ status: 'cancelled' | 'restarting' | 'failed' | 'unavailable' }>
  onStartupStatusChange: (callback: (status: StartupStatus) => void) => () => void
  setStartupAppearance?: (options: { active: boolean; dark: boolean }) => Promise<{ translucent: boolean }>
  setTitleBarOverlay?: (options: { color: string; symbolColor: string; height: number }) => Promise<unknown>
}

export function getStartupBridge(): StartupBridge | undefined {
  return (window as Window & { electronAPI?: StartupBridge }).electronAPI
}

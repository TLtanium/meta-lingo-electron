import { contextBridge, ipcRenderer } from 'electron'

// 启动状态类型
export interface StartupStatus {
  stage: 'initializing' | 'starting_backend' | 'checking_health' | 'ready' | 'error'
  message: string
  progress: number
  backendReady: boolean
}

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App paths
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getResourcePath: (relativePath: string) => ipcRenderer.invoke('get-resource-path', relativePath),
  
  // Help files
  readHelpFiles: () => ipcRenderer.invoke('read-help-files'),
  
  // File dialogs
  openFileDialog: (options: Electron.OpenDialogOptions) => 
    ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options: Electron.SaveDialogOptions) => 
    ipcRenderer.invoke('save-file-dialog', options),
  
  // Platform info
  platform: process.platform,
  
  // Fullscreen state
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isFullscreen: boolean) => {
      callback(isFullscreen)
    }
    ipcRenderer.on('fullscreen-changed', listener)
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('fullscreen-changed', listener)
    }
  },
  
  // 启动状态相关
  getStartupStatus: (): Promise<StartupStatus> => ipcRenderer.invoke('get-startup-status'),
  retryBackend: (): Promise<boolean> => ipcRenderer.invoke('retry-backend'),
  onStartupStatusChange: (callback: (status: StartupStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: StartupStatus) => {
      callback(status)
    }
    ipcRenderer.on('startup-status-changed', listener)
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('startup-status-changed', listener)
    }
  }
})

// Type definitions for the exposed API
export interface ElectronAPI {
  getAppPath: () => Promise<string>
  getUserDataPath: () => Promise<string>
  getResourcePath: (relativePath: string) => Promise<string>
  readHelpFiles: () => Promise<Array<{ filename: string; content: string }>>
  openFileDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
  saveFileDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
  platform: NodeJS.Platform
  isFullscreen: () => Promise<boolean>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  // 启动状态相关
  getStartupStatus: () => Promise<StartupStatus>
  retryBackend: () => Promise<boolean>
  onStartupStatusChange: (callback: (status: StartupStatus) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}


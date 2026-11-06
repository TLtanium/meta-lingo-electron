import type { BrowserWindow, Dialog, IpcMain } from 'electron'

export type RestartResult = { status: 'cancelled' | 'restarting' | 'failed' | 'unavailable' }
interface Options {
  ipc: IpcMain
  dialog: Pick<Dialog, 'showMessageBox'>
  getMain: () => BrowserWindow | null
  canRestart: () => boolean
  shutdown: () => Promise<void>
  relaunch: () => void
  exit: () => void
  onFailure: () => void
  schedule?: (callback: () => void) => void
}

export function registerStartupRestart(options: Options) {
  let pending: Promise<RestartResult> | undefined
  options.ipc.handle('restart-application', (event, language: unknown) => {
    const win = options.getMain()
    if (!win || win.isDestroyed() || event.sender !== win.webContents || (language !== 'zh' && language !== 'en')) return { status: 'unavailable' }
    if (pending) return pending
    if (!options.canRestart()) return { status: 'unavailable' }
    pending = (async (): Promise<RestartResult> => {
      try {
        const zh = language === 'zh'
        const answer = await options.dialog.showMessageBox(win, {
          type: 'warning', title: 'Meta-Lingo',
          message: zh ? '启动未能完成，需要完整重启 Meta-Lingo' : 'Meta-Lingo needs a full restart to finish starting',
          detail: zh ? '确认后将结束本次应用的本地服务、关闭整个应用，然后自动重新打开。已有语料、标注、模型和设置会保留。' : 'This will stop this installation’s local services, close the entire application, and reopen it automatically. Your corpora, annotations, models and settings will be kept.',
          buttons: zh ? ['重启应用', '稍后'] : ['Restart application', 'Not now'],
          defaultId: 0, cancelId: 1, noLink: true,
        })
        if (answer.response !== 0 || !options.canRestart()) return { status: 'cancelled' }
        await options.shutdown()
        options.relaunch()
        // Allow the IPC result to reach the splash before closing every Electron window.
        ;(options.schedule ?? (callback => { setTimeout(callback, 150) }))(options.exit)
        return { status: 'restarting' }
      } catch {
        options.onFailure()
        return { status: 'failed' }
      } finally { pending = undefined }
    })()
    return pending
  })
}

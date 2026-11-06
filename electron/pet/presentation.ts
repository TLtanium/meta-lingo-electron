import type { BrowserWindow } from 'electron'

const configuredSpaces = new WeakSet<BrowserWindow>()

/** Topmost and Space membership are separate native policies on macOS. */
export function applyPetPresentation(win: BrowserWindow, alwaysOnTop: boolean, platform: NodeJS.Platform = process.platform, raise = false): void {
  if (win.isDestroyed()) return
  win.setAlwaysOnTop(alwaysOnTop, platform === 'darwin' ? 'screen-saver' : 'floating')
  // Following Spaces is independent of whether the user wants topmost ordering.
  if (platform === 'darwin' && (!configuredSpaces.has(win) || !win.isVisibleOnAllWorkspaces())) {
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      // The auxiliary NSPanel already supports fullscreen Spaces. Transforming
      // the whole process here can hide the main window and its Dock icon.
      skipTransformProcessType: true,
    })
    configuredSpaces.add(win)
  }
  // Raise without taking keyboard focus away from the user's current app.
  if (raise && alwaysOnTop && win.isVisible()) win.moveTop()
}

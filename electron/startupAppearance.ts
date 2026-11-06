import type { BrowserWindow, BrowserWindowConstructorOptions, IpcMain, NativeTheme } from 'electron'
import { release } from 'node:os'

export function supportsStartupMaterial(platform: NodeJS.Platform, osRelease: string): boolean {
  if (platform === 'darwin') return true
  const [major, , build] = osRelease.split('.').map(Number)
  return platform === 'win32' && major >= 10 && build >= 22621
}

export function startupWindowOptions(platform = process.platform, osRelease = release()): BrowserWindowConstructorOptions {
  if (platform === 'darwin') return { backgroundColor: '#00000000', vibrancy: 'under-window', visualEffectState: 'active' }
  if (supportsStartupMaterial(platform, osRelease)) return { backgroundColor: '#00000000', backgroundMaterial: 'acrylic' }
  return { backgroundColor: '#f5f5f5' }
}

/** Only the main renderer can toggle its own fixed, startup-only material. */
export function registerStartupAppearance(ipc: IpcMain, getMain: () => BrowserWindow | null,
  platform = process.platform, osRelease = release(), theme?: Pick<NativeTheme, 'themeSource'>) {
  let previousTheme: NativeTheme['themeSource'] | undefined
  const restoreTheme = () => {
    if (theme && previousTheme !== undefined) theme.themeSource = previousTheme
    previousTheme = undefined
  }
  ipc.handle('set-startup-appearance', (event, value: unknown) => {
    const win = getMain()
    if (!win || win.isDestroyed() || event.sender !== win.webContents ||
      !value || typeof value !== 'object' ||
      typeof (value as { active?: unknown }).active !== 'boolean' ||
      typeof (value as { dark?: unknown }).dark !== 'boolean') return { translucent: false }
    const { active, dark } = value as { active: boolean; dark: boolean }
    const supported = supportsStartupMaterial(platform, osRelease)
    try {
      // Native materials follow the OS appearance, independently of React's theme.
      if (theme && active && supported) {
        previousTheme ??= theme.themeSource
        theme.themeSource = dark ? 'dark' : 'light'
      } else restoreTheme()
      if (platform === 'darwin') win.setVibrancy(active ? 'under-window' : null)
      if (platform === 'win32' && supported) win.setBackgroundMaterial(active ? 'acrylic' : 'none')
      win.setBackgroundColor(active && supported ? '#00000000' : dark ? '#0d0d12' : '#f5f5f5')
      return { translucent: active && supported }
    } catch {
      restoreTheme()
      // Old systems and accessibility settings still get a complete, readable page.
      if (platform === 'darwin') { try { win.setVibrancy(null) } catch {} }
      if (platform === 'win32' && supported) { try { win.setBackgroundMaterial('none') } catch {} }
      win.setBackgroundColor(dark ? '#0d0d12' : '#f5f5f5')
      return { translucent: false }
    }
  })
  return restoreTheme
}

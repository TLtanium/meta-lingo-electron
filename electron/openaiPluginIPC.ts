import { app, ipcMain, shell } from 'electron'
import path from 'node:path'
import { getOpenAIPluginInfo, openOpenAIPlugin, type OpenAIPluginPaths } from './openaiPlugin'

export function registerOpenAIPluginHandlers(backendUrl: string): void {
  async function developmentRequest(route: 'info' | 'prepare') {
    const response = await fetch(`${backendUrl}/api/mcp/openai-plugin/${route}`, {
      method: route === 'prepare' ? 'POST' : 'GET',
    })
    if (!response.ok) throw new Error(`Development plugin: ${response.status}`)
    return response.json()
  }
  const paths = (): OpenAIPluginPaths => {
    const root = path.join(__dirname, '..')
    const executable = process.platform === 'win32' ? 'meta-lingo-mcp.exe' : 'meta-lingo-mcp'
    return {
      templatePath: app.isPackaged
        ? path.join(process.resourcesPath, 'openai-plugin')
        : path.join(root, 'openai-plugin'),
      binaryPath: app.isPackaged
        ? path.join(process.resourcesPath, 'mcp-server', executable)
        : path.join(root, 'backend-dist', 'meta-lingo-mcp', executable),
      marketplaceRoot: path.join(app.getPath('userData'), 'openai-plugin'),
      backendUrl,
    }
  }
  ipcMain.handle('get-openai-plugin-info', async () => app.isPackaged
    ? getOpenAIPluginInfo(paths())
    : (await developmentRequest('info')).data)
  let opening = false
  ipcMain.handle('open-openai-plugin', async () => {
    // Avoid competing filesystem writes when windows issue simultaneous requests.
    if (opening) return { success: false, errorCode: 'prepareFailed' }
    opening = true
    try {
      if (!app.isPackaged) {
        const prepared = await developmentRequest('prepare')
        if (!prepared.success) return prepared
        const link = new URL(prepared.link)
        if (link.protocol !== 'codex:' || link.host !== 'plugins' || link.pathname !== '/meta-lingo') {
          return { success: false, errorCode: 'prepareFailed' }
        }
        try {
          await shell.openExternal(link.toString())
          return { success: true }
        } catch {
          return { success: false, errorCode: 'openFailed' }
        }
      }
      return await openOpenAIPlugin(paths(), url => shell.openExternal(url))
    } catch {
      return { success: false, errorCode: 'prepareFailed' }
    } finally {
      opening = false
    }
  })
}

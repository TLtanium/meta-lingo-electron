import apiClient from './client'
import type { OpenAIPluginInfo, OpenAIPluginResult } from '../../electron/openaiPlugin'

export async function getOpenAIConnectionInfo(): Promise<OpenAIPluginInfo> {
  if (window.electronAPI?.getOpenAIPluginInfo) return window.electronAPI.getOpenAIPluginInfo()
  const response = await apiClient.get('/api/mcp/openai-plugin/info')
  return response.data.data
}

export async function connectOpenAIPlugin(): Promise<OpenAIPluginResult> {
  if (window.electronAPI?.openOpenAIPlugin) return window.electronAPI.openOpenAIPlugin()
  const response = await apiClient.post('/api/mcp/openai-plugin/prepare')
  const result = response.data
  if (!result.success) return result
  // A backend error must never turn into an arbitrary external navigation.
  const link = new URL(result.link)
  if (link.protocol !== 'codex:' || link.host !== 'plugins' || link.pathname !== '/meta-lingo'
      || !link.searchParams.get('marketplacePath')) {
    return { success: false, errorCode: 'prepareFailed' }
  }
  try {
    window.location.assign(link.toString())
    return { success: true, link: link.toString() }
  } catch {
    // Keep an explicit anchor for browsers requiring a fresh click to open an app.
    return { success: false, errorCode: 'openFailed', link: link.toString() }
  }
}

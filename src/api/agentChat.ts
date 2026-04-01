import { api } from './client'

export interface ToolModuleInfo {
  name: string
  display_en: string
  display_zh: string
  tools: string[]
}

export interface AgentChatRequest {
  provider: 'ollama' | 'openai'
  ollama?: { url: string; model: string }
  openai?: { base_url: string; api_key: string; model: string }
  messages: { role: 'user' | 'assistant'; content: string }[]
  enabled_modules?: string[] | null
  language?: string
}

export interface SSECallbacks {
  onToolCall: (name: string, args: Record<string, unknown>) => void
  onToolResult: (name: string, result: string) => void
  onTextDelta: (content: string) => void
  onDone: () => void
  onError: (errorKey: string, detail?: string) => void
}

/**
 * Stream agent chat via SSE using fetch + ReadableStream.
 * Returns an AbortController for cancellation.
 */
export function chatStream(
  request: AgentChatRequest,
  callbacks: SSECallbacks
): AbortController {
  const controller = new AbortController()

  const run = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        callbacks.onError('lemy_llm_error', `HTTP ${response.status}: ${text}`)
        callbacks.onDone()
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        callbacks.onError('lemy_no_response')
        callbacks.onDone()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const event = JSON.parse(jsonStr)
            switch (event.type) {
              case 'tool_call':
                callbacks.onToolCall(event.name, event.arguments || {})
                break
              case 'tool_result':
                callbacks.onToolResult(event.name, event.result || '')
                break
              case 'text_delta':
                callbacks.onTextDelta(event.content || '')
                break
              case 'error':
                callbacks.onError(event.error_key || event.message || 'lemy_unexpected', event.detail)
                break
              case 'done':
                callbacks.onDone()
                return
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Stream ended without explicit done event
      callbacks.onDone()
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        callbacks.onDone()
        return
      }
      callbacks.onError('lemy_unexpected', err instanceof Error ? err.message : String(err))
      callbacks.onDone()
    }
  }

  run()
  return controller
}

/**
 * Get available tool modules for the module selector.
 */
export async function getToolModules() {
  return api.get<{ success: boolean; data: ToolModuleInfo[] }>('/api/agent/tools')
}

export const agentChatApi = { chatStream, getToolModules }

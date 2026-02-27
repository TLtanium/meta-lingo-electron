import { api } from './client'

// Dictionary types
export interface DictionaryInfo {
  name: string
  count: number
  filename: string
}

export interface LookupResult {
  found: boolean
  word?: string
  content?: string
  fuzzy?: boolean
  matched_key?: string
  error?: string
}

export interface LookupResponse {
  success: boolean
  query: string
  results: Record<string, LookupResult>
}

// Dictionary API endpoints
export const dictionaryApi = {
  // Get available dictionaries
  list: async () => {
    return api.get<{ success: boolean; data: DictionaryInfo[] }>('/api/dictionary/list')
  },
  
  // Lookup word in dictionaries
  lookup: async (word: string, dictionaries: string[]) => {
    const dictParam = dictionaries.join(',')
    return api.get<LookupResponse>(
      `/api/dictionary/lookup?word=${encodeURIComponent(word)}&dictionaries=${encodeURIComponent(dictParam)}`
    )
  },
  
  // Get input suggestions
  suggestions: async (prefix: string, dictionaries: string[], limit: number = 10) => {
    const dictParam = dictionaries.join(',')
    return api.get<{ success: boolean; suggestions: string[] }>(
      `/api/dictionary/suggestions?prefix=${encodeURIComponent(prefix)}&dictionaries=${encodeURIComponent(dictParam)}&limit=${limit}`
    )
  },
  
  // Unload dictionary from cache
  unload: async (dictName: string) => {
    return api.post<{ success: boolean; message: string }>(
      `/api/dictionary/unload/${encodeURIComponent(dictName)}`
    )
  },
  
  // Clear all dictionary cache
  clearCache: async () => {
    return api.post<{ success: boolean; message: string }>('/api/dictionary/clear-cache')
  }
}

// Ollama API endpoints
export const ollamaApi = {
  // Connect to Ollama server and list models
  connect: async (url: string) => {
    return api.post<{ connected: boolean; models: string[] }>(
      '/api/ollama/connect',
      { url }
    )
  },
  
  // Check connection status
  status: async (baseUrl: string) => {
    return api.post<{ success: boolean; connected: boolean; models?: string[] }>(
      '/api/ollama/status',
      { baseUrl }
    )
  },
  
  // List available models
  listModels: async (url: string) => {
    return api.get<string[]>(
      `/api/ollama/models?url=${encodeURIComponent(url)}`
    )
  },
  
  // Generate text
  generate: async (baseUrl: string, model: string, prompt: string) => {
    return api.post<{ success: boolean; data: { response: string } }>(
      '/api/ollama/generate',
      { baseUrl, model, prompt }
    )
  },
  
  // Chat completion
  chat: async (url: string, model: string, message: string) => {
    return api.post<{ response: string }>(
      '/api/ollama/chat',
      { url, model, message }
    )
  }
}

// OpenAI-compatible API (for settings and future topic naming, etc.)
export const openaiApi = {
  check: async (baseUrl: string, apiKey: string) => {
    return api.post<{ connected: boolean; models?: string[]; error?: string }>(
      '/api/openai/check',
      { base_url: baseUrl, api_key: apiKey }
    )
  }
}

// Unified LLM chat (analysis AI assistant)
export interface LLMChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const llmChatApi = {
  chat: async (
    provider: 'ollama' | 'openai',
    config: { ollama?: { url: string; model: string }; openai?: { base_url: string; api_key: string; model: string } },
    context: string,
    messages: LLMChatMessage[]
  ) => {
    return api.post<{ response: string }>(
      '/api/llm/chat',
      {
        provider,
        ollama: config.ollama,
        openai: config.openai,
        context,
        messages
      },
      { timeout: 180000 }
    )
  }
}

// Help API endpoints
export const helpApi = {
  // Get help content
  getContent: async (topic: string) => {
    return api.get<{ success: boolean; data: { title: string; content: string } }>(
      `/api/help/${encodeURIComponent(topic)}`
    )
  },
  
  // Search help
  search: async (query: string) => {
    return api.get<{ success: boolean; data: Array<{ topic: string; title: string; snippet: string }> }>(
      `/api/help/search?q=${encodeURIComponent(query)}`
    )
  }
}

export default { dictionaryApi, ollamaApi, openaiApi, llmChatApi, helpApi }

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  isError?: boolean
  errorDetail?: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  enabledModules: string[] | null // null = all modules
  createdAt: number
  updatedAt: number
}

interface ChatStore {
  conversations: Conversation[]
  activeConversationId: string | null
  sidebarOpen: boolean

  // Actions
  createConversation: () => string
  deleteConversation: (id: string) => void
  setActiveConversation: (id: string | null) => void
  addMessage: (conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  appendToLastAssistant: (conversationId: string, content: string) => void
  completeToolCall: (conversationId: string, toolName: string) => void
  updateConversationTitle: (id: string, title: string) => void
  setEnabledModules: (id: string, modules: string[] | null) => void
  toggleSidebar: () => void
  clearAllConversations: () => void
}

const MAX_CONVERSATIONS = 50
const MAX_MESSAGES_PER_CONVERSATION = 200

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      conversations: [],
      activeConversationId: null,
      sidebarOpen: true,

      createConversation: () => {
        const id = generateId()
        const now = Date.now()
        const conv: Conversation = {
          id,
          title: '',
          messages: [],
          enabledModules: null,
          createdAt: now,
          updatedAt: now,
        }
        set((state) => {
          let conversations = [conv, ...state.conversations]
          if (conversations.length > MAX_CONVERSATIONS) {
            conversations = conversations.slice(0, MAX_CONVERSATIONS)
          }
          return { conversations, activeConversationId: id }
        })
        return id
      },

      deleteConversation: (id) => {
        set((state) => {
          const conversations = state.conversations.filter((c) => c.id !== id)
          const activeConversationId =
            state.activeConversationId === id
              ? conversations[0]?.id ?? null
              : state.activeConversationId
          return { conversations, activeConversationId }
        })
      },

      setActiveConversation: (id) => {
        set({ activeConversationId: id })
      },

      addMessage: (conversationId, message) => {
        const msg: ChatMessage = {
          ...message,
          id: generateId(),
          timestamp: Date.now(),
        }
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c
            let messages = [...c.messages, msg]
            if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
              messages = messages.slice(-MAX_MESSAGES_PER_CONVERSATION)
            }
            // Auto-title from first user message
            const title =
              c.title ||
              (msg.role === 'user'
                ? msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '')
                : c.title)
            return { ...c, messages, title, updatedAt: Date.now() }
          }),
        }))
      },

      completeToolCall: (conversationId, toolName) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const messages = [...c.messages]
            // Find last tool_call message with matching toolName and mark done
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'tool_call' && messages[i].toolName === toolName && !messages[i].content) {
                messages[i] = { ...messages[i], content: 'done' }
                break
              }
            }
            return { ...c, messages }
          }),
        }))
      },

      appendToLastAssistant: (conversationId, content) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const messages = [...c.messages]
            // Find the last assistant message to append to
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'assistant') {
                messages[i] = { ...messages[i], content: messages[i].content + content }
                break
              }
            }
            return { ...c, messages, updatedAt: Date.now() }
          }),
        }))
      },

      updateConversationTitle: (id, title) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        }))
      },

      setEnabledModules: (id, modules) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, enabledModules: modules } : c
          ),
        }))
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }))
      },

      clearAllConversations: () => {
        set({ conversations: [], activeConversationId: null })
      },
    }),
    {
      name: 'meta-lingo-chat',
      // Truncate large tool_result content before persisting to localStorage
      // to prevent expensive serialization on every streaming token
      partialize: (state) => ({
        ...state,
        conversations: state.conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.role === 'tool_result' && m.content.length > 2000
              ? { ...m, content: m.content.slice(0, 2000) + '\n…[truncated for storage]' }
              : m
          ),
        })),
      }),
    }
  )
)

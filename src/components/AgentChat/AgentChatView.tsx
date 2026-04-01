import { useState, useRef, useCallback, lazy, Suspense } from 'react'
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  styled,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import SettingsIcon from '@mui/icons-material/Settings'
import HelpIcon from '@mui/icons-material/Help'
import CloseIcon from '@mui/icons-material/Close'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { chatStream } from '../../api/agentChat'
import type { AgentChatRequest } from '../../api/agentChat'
import ChatSidebar from './ChatSidebar'
import ChatMessages from './ChatMessages'
import ChatInput from './ChatInput'
import appIcon from '../../../assets/icon.png'

const Settings = lazy(() => import('../../pages/Settings'))
const Help = lazy(() => import('../../pages/Help'))

// Match TabManager styling
const StyledTabs = styled(Tabs)(() => ({
  minHeight: 36,
  backgroundColor: 'transparent',
  '& .MuiTabs-indicator': {
    height: 3,
    borderRadius: '3px 3px 0 0',
  },
}))

const StyledTab = styled(Tab)(({ theme }) => ({
  minHeight: 36,
  padding: '6px 12px',
  fontSize: '0.875rem',
  textTransform: 'none',
  '&.Mui-selected': {
    backgroundColor:
      theme.palette.mode === 'dark'
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.04)',
  },
}))

type OverlayTab = 'settings' | 'help'

export default function AgentChatView() {
  const { t } = useTranslation()
  const {
    conversations,
    activeConversationId,
    sidebarOpen,
    createConversation,
    deleteConversation,
    setActiveConversation,
    addMessage,
    appendToLastAssistant,
    completeToolCall,
    setEnabledModules,
    toggleSidebar,
    clearAllConversations,
  } = useChatStore()

  const {
    ollamaUrl,
    ollamaConnected,
    ollamaModel,
    openaiApiEnabled,
    openaiApiBaseUrl,
    openaiApiKey,
    openaiApiModel,
    language,
    darkMode,
    customWallpaper,
    wallpaperOpacity,
  } = useSettingsStore()

  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [overlayTabs, setOverlayTabs] = useState<OverlayTab[]>([])
  const [activeOverlay, setActiveOverlay] = useState<OverlayTab | 'chat'>('chat')

  // Find active conversation
  const activeConv =
    conversations.find((c) => c.id === activeConversationId) ?? null
  const hasMessages = (activeConv?.messages.length ?? 0) > 0

  // Provider availability
  const hasOllama = ollamaConnected && !!ollamaModel
  const hasOpenai = openaiApiEnabled && !!openaiApiKey && !!openaiApiModel
  const hasProvider = hasOllama || hasOpenai
  const disabledReason = hasProvider ? undefined : t('agentChat.noProvider')

  // Open settings/help overlay tabs (called from AppHeader via store)
  const openOverlayTab = useCallback(
    (tab: OverlayTab) => {
      if (!overlayTabs.includes(tab)) {
        setOverlayTabs((prev) => [...prev, tab])
      }
      setActiveOverlay(tab)
    },
    [overlayTabs]
  )

  const closeOverlayTab = useCallback(
    (tab: OverlayTab) => {
      setOverlayTabs((prev) => prev.filter((t) => t !== tab))
      if (activeOverlay === tab) setActiveOverlay('chat')
    },
    [activeOverlay]
  )

  // Expose openOverlayTab globally so AppHeader can use it
  // Store ref on window for cross-component communication
  ;(window as any).__agentOpenOverlay = openOverlayTab

  const handleSend = useCallback(
    (text: string) => {
      // Switch to chat view when sending
      setActiveOverlay('chat')

      let convId = activeConversationId
      if (!convId) {
        convId = createConversation()
      }

      addMessage(convId, { role: 'user', content: text })

      const conv = useChatStore
        .getState()
        .conversations.find((c) => c.id === convId)
      if (!conv) return

      const historyMessages = conv.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const request: AgentChatRequest = {
        provider: hasOpenai ? 'openai' : 'ollama',
        messages: historyMessages,
        enabled_modules: conv.enabledModules,
        language,
      }

      if (hasOpenai) {
        request.openai = {
          base_url: openaiApiBaseUrl,
          api_key: openaiApiKey,
          model: openaiApiModel,
        }
      } else {
        request.ollama = {
          url: ollamaUrl,
          model: ollamaModel!,
        }
      }

      setIsStreaming(true)
      let assistantStarted = false

      // Batch text deltas: accumulate tokens and flush every ~60ms
      // to prevent per-token Zustand+persist writes (huge localStorage overhead)
      let textBuffer = ''
      let flushTimer: ReturnType<typeof setTimeout> | null = null
      const flushText = () => {
        flushTimer = null
        if (!textBuffer) return
        const chunk = textBuffer
        textBuffer = ''
        if (!assistantStarted) {
          addMessage(convId!, { role: 'assistant', content: chunk })
          assistantStarted = true
        } else {
          appendToLastAssistant(convId!, chunk)
        }
      }

      const controller = chatStream(request, {
        onToolCall: (name, args) => {
          // Flush any buffered intermediate text BEFORE showing the tool call,
          // then reset assistantStarted so the next text delta opens a new bubble.
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
          flushText()
          assistantStarted = false
          addMessage(convId!, {
            role: 'tool_call',
            content: '',
            toolName: name,
            toolArgs: args,
          })
        },
        onToolResult: (name, result) => {
          completeToolCall(convId!, name)
          addMessage(convId!, {
            role: 'tool_result',
            content: result,
            toolName: name,
          })
        },
        onTextDelta: (content) => {
          textBuffer += content
          if (!flushTimer) {
            flushTimer = setTimeout(flushText, 60)
          }
        },
        onError: (errorKey, detail) => {
          flushText()
          addMessage(convId!, {
            role: 'assistant',
            content: errorKey,
            isError: true,
            errorDetail: detail,
          })
        },
        onDone: () => {
          if (flushTimer) clearTimeout(flushTimer)
          flushText() // flush remaining text
          setIsStreaming(false)
          abortRef.current = null
        },
      })

      abortRef.current = controller
    },
    [
      activeConversationId,
      hasOpenai,
      openaiApiBaseUrl,
      openaiApiKey,
      openaiApiModel,
      ollamaUrl,
      ollamaModel,
      language,
      createConversation,
      addMessage,
      appendToLastAssistant,
      completeToolCall,
    ]
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  const handleModulesChange = useCallback(
    (modules: string[] | null) => {
      if (activeConversationId) {
        setEnabledModules(activeConversationId, modules)
      }
    },
    [activeConversationId, setEnabledModules]
  )

  // Tab bar style (mirrors TabManager)
  const tabBarBg = darkMode ? 'background.paper' : 'grey.100'

  // Show chat content or overlay tab
  const showChat = activeOverlay === 'chat'

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar — same visual as standard mode */}
      <Box
        sx={{
          bgcolor: tabBarBg,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Sidebar toggle in tab bar */}
        <Tooltip title={t('agentChat.sidebar')}>
          <IconButton
            size="small"
            onClick={toggleSidebar}
            sx={{ mx: 1 }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <StyledTabs
          value={activeOverlay}
          onChange={(_, v) => setActiveOverlay(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ flex: 1 }}
        >
          {/* Agent Chat tab (always present, not closable) */}
          <StyledTab
            value="chat"
            icon={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <SmartToyIcon fontSize="small" />
                <Typography variant="body2">{t('agentChat.title')}</Typography>
              </Box>
            }
            iconPosition="start"
            sx={{ minWidth: 'auto' }}
          />

          {/* Settings tab */}
          {overlayTabs.includes('settings') && (
            <StyledTab
              value="settings"
              icon={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <SettingsIcon fontSize="small" />
                  <Typography variant="body2">{t('settings.title')}</Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeOverlayTab('settings')
                    }}
                    sx={{ ml: 0.5, p: 0.25 }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              }
              iconPosition="start"
              sx={{ minWidth: 'auto' }}
            />
          )}

          {/* Help tab */}
          {overlayTabs.includes('help') && (
            <StyledTab
              value="help"
              icon={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <HelpIcon fontSize="small" />
                  <Typography variant="body2">{t('help.title')}</Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeOverlayTab('help')
                    }}
                    sx={{ ml: 0.5, p: 0.25 }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              }
              iconPosition="start"
              sx={{ minWidth: 'auto' }}
            />
          )}
        </StyledTabs>
      </Box>

      {/* Main area: sidebar + content */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Wallpaper background */}
        {customWallpaper && (
          <Box
            component="img"
            src={customWallpaper}
            alt=""
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: wallpaperOpacity,
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Sidebar — opaque, above wallpaper */}
        {sidebarOpen && (
          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              bgcolor: darkMode ? 'background.paper' : '#fff',
            }}
          >
            <ChatSidebar
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={setActiveConversation}
              onNew={() => {
                createConversation()
                setActiveOverlay('chat')
              }}
              onDelete={deleteConversation}
              onClearAll={clearAllConversations}
            />
          </Box>
        )}

        {/* Content area */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Agent Chat content */}
          {showChat && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                maxWidth: 900,
                width: '100%',
                mx: 'auto',
                minWidth: 0,
                minHeight: 0,
                // Claude-style: center input when no messages
                justifyContent: hasMessages || isStreaming ? 'flex-start' : 'center',
              }}
            >
              {hasMessages || isStreaming ? (
                <>
                  <ChatMessages
                    messages={activeConv?.messages ?? []}
                    isStreaming={isStreaming}
                  />
                  <ChatInput
                    onSend={handleSend}
                    onStop={handleStop}
                    isStreaming={isStreaming}
                    disabled={!hasProvider}
                    disabledReason={disabledReason}
                    enabledModules={activeConv?.enabledModules ?? null}
                    onModulesChange={handleModulesChange}
                  />
                </>
              ) : (
                /* Empty state: large icon + centered text + input */
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    px: 3,
                  }}
                >
                  <Box
                    component="img"
                    src={appIcon}
                    alt="Meta-Lingo"
                    sx={{
                      width: 96,
                      height: 96,
                      borderRadius: 2,
                      opacity: 0.85,
                    }}
                  />
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ fontWeight: 400, textAlign: 'center', mb: 2 }}
                  >
                    {t('agentChat.emptyState')}
                  </Typography>

                  <Box sx={{ width: '100%', maxWidth: 700 }}>
                    <ChatInput
                      onSend={handleSend}
                      onStop={handleStop}
                      isStreaming={false}
                      disabled={!hasProvider}
                      disabledReason={disabledReason}
                      enabledModules={activeConv?.enabledModules ?? null}
                      onModulesChange={handleModulesChange}
                    />
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Settings overlay */}
          {activeOverlay === 'settings' && (
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Suspense
                fallback={
                  <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
                    <CircularProgress />
                  </Box>
                }
              >
                <Settings />
              </Suspense>
            </Box>
          )}

          {/* Help overlay */}
          {activeOverlay === 'help' && (
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Suspense
                fallback={
                  <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
                    <CircularProgress />
                  </Box>
                }
              >
                <Help />
              </Suspense>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

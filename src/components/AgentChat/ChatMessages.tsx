import { useRef, useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  CircularProgress,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { ChatMessage } from '../../stores/chatStore'
import MessageBubble from './MessageBubble'
import ToolCallGroup from './ToolCallGroup'

type RenderUnit =
  | { type: 'msg'; msg: ChatMessage }
  | { type: 'tools'; key: string; msgs: ChatMessage[] }

/** Collapse consecutive tool_call / tool_result messages into one chain unit. */
function buildRenderUnits(messages: ChatMessage[]): RenderUnit[] {
  const units: RenderUnit[] = []
  for (const m of messages) {
    if (m.role === 'tool_call' || m.role === 'tool_result') {
      const last = units[units.length - 1]
      if (last && last.type === 'tools') {
        last.msgs.push(m)
      } else {
        units.push({ type: 'tools', key: m.id, msgs: [m] })
      }
    } else {
      units.push({ type: 'msg', msg: m })
    }
  }
  return units
}

interface ChatMessagesProps {
  messages: ChatMessage[]
  isStreaming: boolean
}

export default function ChatMessages({
  messages,
  isStreaming,
}: ChatMessagesProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rotating Lemy status messages
  const thinkingMessages = t('agentChat.thinkingMessages', { returnObjects: true }) as string[]
  const [thinkingIdx, setThinkingIdx] = useState(0)
  useEffect(() => {
    if (!isStreaming) { setThinkingIdx(0); return }
    const id = setInterval(() => {
      setThinkingIdx((i) => (i + 1) % thinkingMessages.length)
    }, 2500)
    return () => clearInterval(id)
  }, [isStreaming, thinkingMessages.length])

  useEffect(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null
      const el = containerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, isStreaming ? 150 : 0)
  }, [messages, isStreaming])

  // Only render visible messages (skip hidden compact summaries)
  const visibleMessages = messages.filter((m) => !m.hidden && !m.isCompactIndicator)
  const renderUnits = buildRenderUnits(visibleMessages)
  const lastVisible = visibleMessages.at(-1)

  // Hide the bottom "thinking" indicator while a tool is actively running
  // (the tool-call group header already shows the live tool) — show it only
  // when the model is between steps (last message is not the assistant, and not
  // an in-flight tool call).
  const lastIsActiveTool = lastVisible?.role === 'tool_call' && !lastVisible.content
  const showThinking = isStreaming && lastVisible?.role !== 'assistant' && !lastIsActiveTool

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        overflow: 'auto',
        minHeight: 0,
        px: 2,
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {renderUnits.map((unit) =>
        unit.type === 'tools' ? (
          <Box key={unit.key} sx={{ flexShrink: 0 }}>
            <ToolCallGroup messages={unit.msgs} streaming={isStreaming} />
          </Box>
        ) : (
          <Box key={unit.msg.id} sx={{ flexShrink: 0 }}>
            <MessageBubble
              message={unit.msg}
              isStreaming={isStreaming && unit.msg === lastVisible && unit.msg.role === 'assistant'}
            />
          </Box>
        )
      )}

      {showThinking && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 5.5, flexShrink: 0 }}>
          <CircularProgress size={14} thickness={4} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontStyle: 'italic', transition: 'opacity 0.3s', opacity: 0.85 }}
          >
            {thinkingMessages[thinkingIdx] ?? t('agentChat.thinking')}
          </Typography>
        </Stack>
      )}
    </Box>
  )
}

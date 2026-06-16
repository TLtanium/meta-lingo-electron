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
      {visibleMessages.map((msg, idx, arr) => (
        <Box key={msg.id} sx={{ flexShrink: 0 }}>
          <MessageBubble
            message={msg}
            isStreaming={isStreaming && idx === arr.length - 1 && msg.role === 'assistant'}
          />
        </Box>
      ))}

      {isStreaming && visibleMessages.at(-1)?.role !== 'assistant' && (
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

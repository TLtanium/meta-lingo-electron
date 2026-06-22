import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Collapse,
  IconButton,
  CircularProgress,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useTranslation } from 'react-i18next'
import type { ChatMessage } from '../../stores/chatStore'
import ToolCallDisplay from './ToolCallDisplay'

interface ToolItem {
  toolName: string
  args?: Record<string, unknown>
  result?: string
  loading: boolean
}

interface ToolCallGroupProps {
  /** Consecutive tool_call / tool_result messages forming one execution chain */
  messages: ChatMessage[]
  /** Whether the overall turn is still streaming (used to detect a live tool) */
  streaming: boolean
}

/**
 * Claude-Code-style collapsible tool-call chain.
 *
 * All tool calls between a user turn and the assistant's final answer are
 * folded into a single block. Collapsed by default; the user can expand it to
 * inspect the whole call chain. While a tool is actively executing, the header
 * shows the current tool name live even when the block stays collapsed.
 */
export default function ToolCallGroup({ messages, streaming }: ToolCallGroupProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // ── Pair tool_call (args) with the following tool_result (result) ──────────
  const items: ToolItem[] = []
  for (const m of messages) {
    if (m.role === 'tool_call') {
      items.push({
        toolName: m.toolName || '',
        args: m.toolArgs,
        result: undefined,
        loading: true,
      })
    } else if (m.role === 'tool_result') {
      const target = [...items].reverse().find(
        (it) => it.toolName === (m.toolName || '') && it.result === undefined,
      )
      if (target) {
        target.result = m.content
        target.loading = false
      } else {
        items.push({
          toolName: m.toolName || '',
          result: m.content,
          loading: false,
        })
      }
    }
  }

  // A tool is "active" only while the turn is still streaming and unresolved.
  const activeItem = streaming ? items.find((it) => it.loading) : undefined

  // Rotating Lemy messages while a tool runs
  const callingMessages = t('agentChat.toolCallingMessages', { returnObjects: true }) as string[]
  const [msgIdx, setMsgIdx] = useState(0)
  useEffect(() => {
    if (!activeItem) return
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % callingMessages.length)
    }, 2000)
    return () => clearInterval(id)
  }, [activeItem, callingMessages.length])

  if (items.length === 0) return null

  return (
    <Box
      sx={{
        my: 0.5,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover',
        overflow: 'hidden',
      }}
    >
      {/* Header — always visible, summarizes the chain + live status */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          py: 0.75,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {activeItem ? (
          <CircularProgress size={15} thickness={5} sx={{ mr: 1, color: 'warning.main' }} />
        ) : (
          <CheckCircleIcon sx={{ fontSize: 17, mr: 1, color: 'success.main' }} />
        )}

        <Typography
          variant="caption"
          sx={{
            flex: 1,
            fontWeight: 600,
            color: 'text.secondary',
            fontStyle: activeItem ? 'italic' : 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeItem
            ? t('agentChat.toolGroupActive', {
                tool: activeItem.toolName,
                defaultValue: 'Calling {{tool}}…',
              })
            : t('agentChat.toolGroupSummary', {
                count: items.length,
                defaultValue: 'Used {{count}} tool(s)',
              })}
        </Typography>

        {/* Live ticker while running (keeps the block lively even when folded) */}
        {activeItem && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{
              mr: 1,
              maxWidth: 180,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: { xs: 'none', sm: 'block' },
            }}
          >
            {callingMessages[msgIdx]}
          </Typography>
        )}

        <IconButton size="small" sx={{ p: 0.25 }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* Body — full call chain, collapsed by default */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1, pb: 1, pt: 0.5 }}>
          {items.map((it, i) => (
            <ToolCallDisplay
              key={i}
              toolName={it.toolName}
              arguments={it.args}
              result={it.result}
              isLoading={it.loading && streaming}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

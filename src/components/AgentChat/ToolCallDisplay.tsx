import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Collapse,
  IconButton,
  Chip,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import BuildIcon from '@mui/icons-material/Build'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useTranslation } from 'react-i18next'

interface ToolCallDisplayProps {
  toolName: string
  arguments?: Record<string, unknown>
  result?: string
  isLoading?: boolean
}

export default function ToolCallDisplay({
  toolName,
  arguments: args,
  result,
  isLoading,
}: ToolCallDisplayProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // Rotating Lemy messages while tool is loading
  const callingMessages = t('agentChat.toolCallingMessages', { returnObjects: true }) as string[]
  const [msgIdx, setMsgIdx] = useState(() => Math.floor(Math.random() * callingMessages.length))
  useEffect(() => {
    if (!isLoading) return
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % callingMessages.length)
    }, 2000)
    return () => clearInterval(id)
  }, [isLoading, callingMessages.length])

  const hasContent = (args && Object.keys(args).length > 0) || result

  return (
    <Box
      sx={{
        my: 0.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          py: 0.75,
          cursor: hasContent ? 'pointer' : 'default',
        }}
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        {isLoading ? (
          <BuildIcon sx={{ fontSize: 16, mr: 1, color: 'warning.main' }} />
        ) : (
          <CheckCircleIcon sx={{ fontSize: 16, mr: 1, color: 'success.main' }} />
        )}
        <Chip
          label={toolName}
          size="small"
          variant="outlined"
          sx={{ mr: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: 1, fontStyle: isLoading ? 'italic' : 'normal' }}
        >
          {isLoading
            ? callingMessages[msgIdx]
            : t('agentChat.toolResult', { tool: toolName })}
        </Typography>
        {hasContent && (
          <IconButton size="small" sx={{ p: 0.25 }}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 1.5, pb: 1, maxHeight: 300, overflow: 'auto' }}>
          {args && Object.keys(args).length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Arguments:
              </Typography>
              <Box
                component="pre"
                sx={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  bgcolor: 'background.paper',
                  p: 1,
                  borderRadius: 0.5,
                  overflow: 'auto',
                  m: 0,
                  mt: 0.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(args, null, 2)}
              </Box>
            </Box>
          )}
          {result && (
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Result:
              </Typography>
              <Box
                component="pre"
                sx={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  bgcolor: 'background.paper',
                  p: 1,
                  borderRadius: 0.5,
                  overflow: 'auto',
                  m: 0,
                  mt: 0.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {result}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

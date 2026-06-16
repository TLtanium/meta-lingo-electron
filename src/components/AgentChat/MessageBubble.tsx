import { useState } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Alert,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import type { ChatMessage } from '../../stores/chatStore'
import ToolCallDisplay from './ToolCallDisplay'
import lemyAvatar from '../../../assets/Lemy.jpg'
import defaultUserAvatar from '../../../assets/user.png'

interface MessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
}

export default function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const { t } = useTranslation()
  const { userName, userAvatar } = useSettingsStore()
  const [copied, setCopied] = useState(false)

  const userDisplayName = userName || t('settings.userProfile.defaultName')
  const userAvatarSrc = userAvatar ?? defaultUserAvatar

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  // Tool call / result messages
  if (message.role === 'tool_call') {
    return (
      <ToolCallDisplay
        toolName={message.toolName || ''}
        arguments={message.toolArgs}
        isLoading={!message.content}
      />
    )
  }

  if (message.role === 'tool_result') {
    return (
      <ToolCallDisplay
        toolName={message.toolName || ''}
        result={message.content}
      />
    )
  }

  // Error message — Lemy-styled alert
  if (message.isError) {
    const errorKey = message.content
    const errorText = t(`agentChat.errors.${errorKey}`, { defaultValue: errorKey })
    const detailPrefix = t('agentChat.errors.lemy_detail_prefix')
    return (
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', maxWidth: '100%' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0, mt: 0.5 }}>
          <Box
            component="img"
            src={lemyAvatar}
            alt="Lemy"
            sx={{ width: 32, height: 32, borderRadius: '8px', objectFit: 'cover', display: 'block' }}
          />
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', lineHeight: 1 }}>
            Lemy
          </Typography>
        </Box>
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ flex: 1, alignItems: 'flex-start', borderRadius: 2, '& .MuiAlert-icon': { mt: 0.25 } }}
        >
          <Typography variant="body2">{errorText}</Typography>
          {message.errorDetail && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {detailPrefix} {message.errorDetail}
            </Typography>
          )}
        </Alert>
      </Box>
    )
  }

  const isUser = message.role === 'user'

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        maxWidth: '100%',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      {/* Avatar — rounded square (use img directly to avoid MUI Avatar's forced borderRadius:50%) */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0, mt: 0.5 }}>
        <Box
          component="img"
          src={isUser ? userAvatarSrc : lemyAvatar}
          alt={isUser ? userDisplayName : 'Lemy'}
          sx={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            objectFit: 'cover',
            display: 'block',
            bgcolor: 'action.selected',
          }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            e.currentTarget.style.display = 'none'
          }}
        />
        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', lineHeight: 1 }}>
          {isUser ? userDisplayName : 'Lemy'}
        </Typography>
      </Box>

      {/* Message content */}
      <Box
        sx={{
          maxWidth: 'calc(100% - 80px)',
          minWidth: 0,
          px: 2,
          py: 1.5,
          borderRadius: 2,
          bgcolor: isUser ? 'primary.main' : 'action.hover',
          color: isUser ? 'primary.contrastText' : 'text.primary',
        }}
      >
        {isUser ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.content}
          </Typography>
        ) : isStreaming ? (
          // During streaming: plain text to avoid costly per-token Markdown parsing
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.content}
          </Typography>
        ) : (
          <Box>
            <Box
              sx={{
                '& a': { color: 'primary.main' },
                '& pre': {
                  bgcolor: 'background.paper',
                  p: 1.5,
                  borderRadius: 1,
                  overflow: 'auto',
                  my: 1,
                  fontSize: '0.8rem',
                },
                '& code': {
                  bgcolor: 'action.selected',
                  px: 0.5,
                  borderRadius: 0.5,
                  fontSize: '0.85em',
                  fontFamily: 'monospace',
                },
                '& pre code': { bgcolor: 'transparent', p: 0 },
                '& ul, & ol': { pl: 2.5, my: 0.5 },
                '& p': { margin: 0, '& + p': { mt: 1 } },
                '& blockquote': {
                  borderLeft: '3px solid',
                  borderColor: 'divider',
                  pl: 1.5,
                  my: 1,
                  color: 'text.secondary',
                },
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  p: ({ children }) => (
                    <Typography component="span" variant="body2" display="block" sx={{ mb: 0.5 }}>
                      {children}
                    </Typography>
                  ),
                  li: ({ children }) => (
                    <Typography component="li" variant="body2" sx={{ mb: 0.25 }}>
                      {children}
                    </Typography>
                  ),
                  a: ({ href, children }) => (
                    <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover">
                      {children}
                    </Link>
                  ),
                  h1: ({ children }) => (
                    <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1, mb: 0.5 }}>
                      {children}
                    </Typography>
                  ),
                  h2: ({ children }) => (
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 1, mb: 0.5 }}>
                      {children}
                    </Typography>
                  ),
                  h3: ({ children }) => (
                    <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.25 }}>
                      {children}
                    </Typography>
                  ),
                  table: ({ children }) => (
                    <Box sx={{ overflow: 'auto', my: 1 }}>
                      <Table size="small" sx={{ minWidth: 200 }}>
                        {children}
                      </Table>
                    </Box>
                  ),
                  thead: ({ children }) => <TableHead>{children}</TableHead>,
                  tbody: ({ children }) => <TableBody>{children}</TableBody>,
                  tr: ({ children }) => <TableRow>{children}</TableRow>,
                  th: ({ children }) => (
                    <TableCell component="th" sx={{ fontWeight: 600 }}>
                      {children}
                    </TableCell>
                  ),
                  td: ({ children }) => <TableCell>{children}</TableCell>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </Box>

            {/* Copy button — below message content */}
            {message.content && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                <Tooltip title={copied ? t('aiAssistant.copied') : t('aiAssistant.copy')}>
                  <IconButton
                    size="small"
                    onClick={handleCopy}
                    sx={{
                      opacity: copied ? 1 : 0.45,
                      color: copied ? 'success.main' : 'text.secondary',
                      '&:hover': { opacity: 1, color: 'primary.main' },
                      transition: 'opacity 0.2s, color 0.2s',
                    }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}

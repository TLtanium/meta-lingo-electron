import { useState, useEffect } from 'react'
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  IconButton,
  Stack,
  Typography,
  CircularProgress,
  Chip,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { LLMChatMessage } from '../../api'
import { useSettingsStore } from '../../stores/settingsStore'
import lemyAvatar from '../../../assets/Lemy.jpg'
import defaultUserAvatar from '../../../assets/user.png'

interface ChatDialogProps {
  open: boolean
  onClose: () => void
  title: string
  messages: LLMChatMessage[]
  inputValue: string
  onInputChange: (v: string) => void
  onSend: () => void
  loading: boolean
  suggestedPrompts: string[]
  onSuggestedClick: (text: string) => void
}

export default function ChatDialog({
  open,
  onClose,
  title,
  messages,
  inputValue,
  onInputChange,
  onSend,
  loading,
  suggestedPrompts,
  onSuggestedClick
}: ChatDialogProps) {
  const { t } = useTranslation()
  const { userName, userAvatar } = useSettingsStore()
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [thinkingDots, setThinkingDots] = useState('')

  const userDisplayName = userName || t('settings.userProfile.defaultName')
  const userAvatarSrc = userAvatar ?? defaultUserAvatar

  useEffect(() => {
    if (!loading) { setThinkingDots(''); return }
    const timer = setInterval(() => {
      setThinkingDots(d => d.length >= 3 ? '' : d + '.')
    }, 500)
    return () => clearInterval(timer)
  }, [loading])

  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(index)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setCopiedId(null)
    }
  }

  // Avatar+name column — no flex-order tricks, caller controls DOM position
  const AvatarCol = ({ src, name }: { src: string; name: string }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0, mt: 0.5 }}>
      <Box
        component="img"
        src={src}
        alt={name}
        sx={{ width: 28, height: 28, borderRadius: '6px', objectFit: 'cover', display: 'block', bgcolor: 'action.selected' }}
        onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none' }}
      />
      <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', lineHeight: 1 }}>
        {name}
      </Typography>
    </Box>
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { minHeight: 520 } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: 460 }}>
          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              mb: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5
            }}
          >
            {messages.length === 0 && !loading && (
              <Typography variant="body2" color="text.secondary">
                {t('aiAssistant.hint')}
              </Typography>
            )}
            {messages.map((m, i) => {
              const isUser = m.role === 'user'
              const bubble = (
                <Box
                  key="bubble"
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    bgcolor: isUser ? 'primary.main' : 'action.hover',
                    color: isUser ? 'primary.contrastText' : 'text.primary',
                    '& a': { color: isUser ? 'primary.light' : 'primary.main' },
                    '& pre, & code': {
                      bgcolor: isUser ? 'rgba(255,255,255,0.2)' : 'action.selected',
                      borderRadius: 0.5,
                      fontSize: '0.8em'
                    },
                    '& pre': { p: 1, overflow: 'auto', my: 0.5 },
                    '& code': { px: 0.5 },
                    '& ul, & ol': { pl: 2.5, my: 0.5 },
                    '& p': { margin: 0, '& + p': { mt: 1 } },
                    '& table': { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', my: 1 },
                    '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
                    '& th': { fontWeight: 600 }
                  }}
                >
                  {isUser ? (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {m.content}
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, width: '100%' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            p: ({ children }) => <Typography component="span" variant="body2" display="block" sx={{ mb: 0.5 }}>{children}</Typography>,
                            strong: ({ children }) => <strong>{children}</strong>,
                            em: ({ children }) => <em>{children}</em>,
                            ul: ({ children }) => <Box component="ul" sx={{ mb: 0.5 }}>{children}</Box>,
                            ol: ({ children }) => <Box component="ol" sx={{ mb: 0.5 }}>{children}</Box>,
                            li: ({ children }) => <Typography component="li" variant="body2" sx={{ mb: 0.25 }}>{children}</Typography>,
                            code: ({ className, children }) => {
                              const isBlock = className
                              return isBlock ? (
                                <Box component="code" display="block" sx={{ whiteSpace: 'pre-wrap' }}>{children}</Box>
                              ) : (
                                <Box component="code">{children}</Box>
                              )
                            },
                            pre: ({ children }) => <Box component="pre" sx={{ overflow: 'auto', m: 0 }}>{children}</Box>,
                            a: ({ href, children }) => (
                              <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover" color="inherit">
                                {children}
                              </Link>
                            ),
                            h1: ({ children }) => <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 0.5, mb: 0.25 }}>{children}</Typography>,
                            h2: ({ children }) => <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 0.5, mb: 0.25 }}>{children}</Typography>,
                            h3: ({ children }) => <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, mb: 0.25 }}>{children}</Typography>,
                            table: ({ children }) => (
                              <Box sx={{ overflow: 'auto', my: 1 }}>
                                <Table size="small" sx={{ minWidth: 200 }}>{children}</Table>
                              </Box>
                            ),
                            thead: ({ children }) => <TableHead>{children}</TableHead>,
                            tbody: ({ children }) => <TableBody>{children}</TableBody>,
                            tr: ({ children }) => <TableRow>{children}</TableRow>,
                            th: ({ children }) => <TableCell component="th" sx={{ fontWeight: 600 }}>{children}</TableCell>,
                            td: ({ children }) => <TableCell>{children}</TableCell>
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </Box>
                      <Tooltip title={copiedId === i ? t('aiAssistant.copied') : t('aiAssistant.copy')}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopy(m.content, i)}
                          sx={{ color: 'inherit', opacity: 0.7, '&:hover': { opacity: 1 } }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>
              )
              return (
                <Box
                  key={i}
                  sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, maxWidth: '90%', alignSelf: isUser ? 'flex-end' : 'flex-start' }}
                >
                  {/* assistant: avatar left; user: bubble left, avatar right */}
                  {!isUser && <AvatarCol src={lemyAvatar} name="Lemy" />}
                  {bubble}
                  {isUser && <AvatarCol src={userAvatarSrc} name={userDisplayName} />}
                </Box>
              )
            })}
            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, alignSelf: 'flex-start' }}>
                <AvatarCol src={lemyAvatar} name="Lemy" />
                <Box sx={{ px: 1.5, py: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={14} />
                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                        {t('aiAssistant.loadingThinking')}{thinkingDots}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2 }}>
                        {t('aiAssistant.loadingHint')}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              </Box>
            )}
          </Box>

          {/* Suggested prompts */}
          {suggestedPrompts.length > 0 && messages.length === 0 && (
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1.5 }}>
              {suggestedPrompts.map((label, i) => (
                <Chip
                  key={i}
                  label={label}
                  size="small"
                  variant="outlined"
                  onClick={() => onSuggestedClick(label)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Stack>
          )}

          {/* Input row */}
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              multiline
              maxRows={3}
              size="small"
              fullWidth
              placeholder={t('aiAssistant.placeholder')}
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
              disabled={loading}
            />
            <IconButton color="primary" onClick={onSend} disabled={loading || !inputValue.trim()}>
              <SendIcon />
            </IconButton>
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

import { useState, useRef } from 'react'
import {
  Box,
  TextField,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import { useTranslation } from 'react-i18next'
import ModuleSelector from './ModuleSelector'
import ContextRing from './ContextRing'
import type { TaskProgress, ContextUsage } from './ContextRing'

interface ChatInputProps {
  onSend: (text: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled: boolean
  disabledReason?: string
  enabledModules: string[] | null
  onModulesChange: (modules: string[] | null) => void
  // Context ring
  contextUsage?: ContextUsage | null
  taskProgress?: TaskProgress | null
  isCompacting?: boolean
  onContextRingClick?: (anchorEl: HTMLElement) => void
}

export default function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  disabledReason,
  enabledModules,
  onModulesChange,
  contextUsage,
  taskProgress,
  isCompacting,
  onContextRingClick,
}: ChatInputProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [moduleSelectorOpen, setModuleSelectorOpen] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const ringBoxRef = useRef<HTMLDivElement>(null)

  const handleSend = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const hasRing = !!(contextUsage || taskProgress || isCompacting)

  return (
    <Box sx={{ px: 2, pb: 2, pt: 1 }}>
      {disabledReason && (
        <Typography
          variant="caption"
          color="warning.main"
          sx={{ mb: 0.5, display: 'block', textAlign: 'center' }}
        >
          {disabledReason}
        </Typography>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          maxWidth: 700,
          mx: 'auto',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          px: 1.5,
          py: 0.75,
          boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        }}
      >
        {/* Context ring — shown when there is context/task data */}
        {hasRing && (
          <Box
            ref={ringBoxRef}
            sx={{ display: 'flex', alignItems: 'center', mr: 0.25, flexShrink: 0 }}
          >
            <ContextRing
              contextUsage={contextUsage ?? null}
              taskProgress={taskProgress ?? null}
              isCompacting={isCompacting ?? false}
              onClick={() => {
                if (ringBoxRef.current) onContextRingClick?.(ringBoxRef.current)
              }}
            />
          </Box>
        )}

        {/* Module selector + button */}
        <Tooltip title={t('agentChat.moduleSelector')}>
          <IconButton
            ref={addBtnRef}
            size="small"
            onClick={() => setModuleSelectorOpen(true)}
          >
            <AddCircleOutlineIcon />
          </IconButton>
        </Tooltip>

        <ModuleSelector
          anchorEl={addBtnRef.current}
          open={moduleSelectorOpen}
          onClose={() => setModuleSelectorOpen(false)}
          enabledModules={enabledModules}
          onModulesChange={onModulesChange}
        />

        {/* Text input — same vertical line as icons */}
        <TextField
          multiline
          maxRows={4}
          size="small"
          fullWidth
          placeholder={disabled ? '' : t('agentChat.placeholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          variant="standard"
          InputProps={{ disableUnderline: true }}
          sx={{
            '& .MuiInputBase-root': {
              py: 0,
              fontSize: '0.9rem',
            },
          }}
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <Tooltip title={t('agentChat.stop')}>
            <IconButton color="error" size="small" onClick={onStop}>
              <StopIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title={t('agentChat.send')}>
            <span>
              <IconButton
                color="primary"
                size="small"
                onClick={handleSend}
                disabled={disabled || !value.trim()}
              >
                <SendIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}

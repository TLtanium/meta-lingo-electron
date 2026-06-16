import {
  Popover,
  Box,
  Typography,
  LinearProgress,
  Divider,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import SyncIcon from '@mui/icons-material/Sync'
import CompressIcon from '@mui/icons-material/Compress'
import { useTranslation } from 'react-i18next'
import type { TaskProgress, ContextUsage } from './ContextRing'

interface TaskProgressPanelProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  contextUsage: ContextUsage | null
  taskProgress: TaskProgress | null
  isCompacting: boolean
  isStreaming: boolean
  onCompact: () => void
}

export default function TaskProgressPanel({
  anchorEl,
  open,
  onClose,
  contextUsage,
  taskProgress,
  isCompacting,
  isStreaming,
  onCompact,
}: TaskProgressPanelProps) {
  const { t } = useTranslation()

  const ctxPct = contextUsage ? Math.min(contextUsage.pct, 100) : 0
  const ctxColor =
    ctxPct >= 80 ? 'error' : ctxPct >= 55 ? 'warning' : 'success'

  const completedLabels = taskProgress
    ? Array.from({ length: taskProgress.completed }, (_, i) => `Text ${i + 1}`)
    : []

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      slotProps={{
        paper: {
          sx: { width: 320, borderRadius: 2, p: 2, boxShadow: 8 },
        },
      }}
    >
      {/* Context usage */}
      <Typography variant="subtitle2" gutterBottom>
        {t('agentChat.contextUsageTitle')}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <LinearProgress
          variant="determinate"
          value={ctxPct}
          color={ctxColor}
          sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
        />
        <Typography variant="caption" sx={{ minWidth: 36, textAlign: 'right' }}>
          {ctxPct.toFixed(0)}%
        </Typography>
      </Box>

      {contextUsage && (
        <Typography variant="caption" color="text.secondary">
          {t('agentChat.contextChars', {
            chars: Math.round(contextUsage.chars / 1000),
            threshold: Math.round(contextUsage.threshold / 1000),
          })}
        </Typography>
      )}

      {/* Compact button */}
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={isCompacting ? <SyncIcon sx={{ animation: 'spin 1s linear infinite' }} /> : <CompressIcon />}
          onClick={() => {
            onClose()
            onCompact()
          }}
          disabled={isCompacting || isStreaming}
          fullWidth
          sx={{
            textTransform: 'none',
            fontSize: '0.8rem',
            '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
          }}
        >
          {isCompacting
            ? t('agentChat.compacting')
            : t('agentChat.compactNow')}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {t('agentChat.compactHint')}
        </Typography>
      </Box>

      {/* Task progress */}
      {taskProgress && taskProgress.total > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2">
              {t('agentChat.taskProgressTitle')}
            </Typography>
            <Chip
              label={`${taskProgress.completed}/${taskProgress.total}`}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          </Box>

          <LinearProgress
            variant="determinate"
            value={taskProgress.pct}
            sx={{ mb: 1, height: 6, borderRadius: 3 }}
          />

          {/* Task type + current */}
          {taskProgress.current_label && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('agentChat.taskCurrent')}: {taskProgress.current_label}
            </Typography>
          )}

          {/* Completed list (last 5) */}
          <List dense disablePadding sx={{ maxHeight: 160, overflowY: 'auto' }}>
            {/* Completed texts */}
            {completedLabels.map((label, i) => (
              <ListItem key={i} disablePadding sx={{ py: 0.1 }}>
                <ListItemIcon sx={{ minWidth: 24 }}>
                  <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  primaryTypographyProps={{ variant: 'caption', noWrap: true }}
                />
              </ListItem>
            ))}
            {/* In progress */}
            {isStreaming && taskProgress.completed < taskProgress.total && (
              <ListItem disablePadding sx={{ py: 0.1 }}>
                <ListItemIcon sx={{ minWidth: 24 }}>
                  <SyncIcon
                    sx={{
                      fontSize: 14,
                      color: 'primary.main',
                      animation: 'spin 1s linear infinite',
                      '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
                    }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={taskProgress.current_label || t('agentChat.taskInProgress')}
                  primaryTypographyProps={{ variant: 'caption', color: 'primary', noWrap: true }}
                />
              </ListItem>
            )}
            {/* Remaining count */}
            {taskProgress.total - taskProgress.completed > (isStreaming ? 1 : 0) && (
              <ListItem disablePadding sx={{ py: 0.1 }}>
                <ListItemIcon sx={{ minWidth: 24 }}>
                  <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                </ListItemIcon>
                <ListItemText
                  primary={t('agentChat.taskRemaining', {
                    n: taskProgress.total - taskProgress.completed - (isStreaming ? 1 : 0),
                  })}
                  primaryTypographyProps={{ variant: 'caption', color: 'text.disabled', noWrap: true }}
                />
              </ListItem>
            )}
          </List>
        </>
      )}
    </Popover>
  )
}

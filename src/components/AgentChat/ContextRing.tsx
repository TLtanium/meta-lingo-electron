import { useRef } from 'react'
import { Box, Tooltip, Typography, keyframes } from '@mui/material'
import { useTranslation } from 'react-i18next'

export interface TaskProgress {
  task_id: string
  completed: number
  total: number
  current_label: string
  pct: number
}

export interface ContextUsage {
  chars: number
  threshold: number
  pct: number
}

interface ContextRingProps {
  contextUsage: ContextUsage | null
  taskProgress: TaskProgress | null
  isCompacting: boolean
  onClick: () => void
}

const SIZE = 22
const STROKE = 2.5
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R

const pulse = keyframes`
  0%   { opacity: 1 }
  50%  { opacity: 0.4 }
  100% { opacity: 1 }
`

export default function ContextRing({
  contextUsage,
  taskProgress,
  isCompacting,
  onClick,
}: ContextRingProps) {
  const { t } = useTranslation()
  const btnRef = useRef<HTMLDivElement>(null)

  const ctxPct = contextUsage ? Math.min(contextUsage.pct, 100) : 0

  // Ring color: green → yellow → red
  const ringColor =
    ctxPct >= 80 ? '#f44336' : ctxPct >= 55 ? '#ff9800' : '#4caf50'

  const strokeDashoffset = CIRC * (1 - ctxPct / 100)

  const tooltipContent = [
    t('agentChat.contextUsage', { pct: ctxPct.toFixed(0) }),
    taskProgress
      ? t('agentChat.taskProgressShort', {
          completed: taskProgress.completed,
          total: taskProgress.total,
        })
      : null,
    isCompacting ? t('agentChat.compacting') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Tooltip title={tooltipContent} placement="top">
      <Box
        ref={btnRef}
        onClick={onClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          cursor: 'pointer',
          borderRadius: 1,
          px: 0.75,
          py: 0.25,
          transition: 'background 0.15s',
          '&:hover': { bgcolor: 'action.hover' },
          animation: isCompacting ? `${pulse} 1s ease-in-out infinite` : 'none',
        }}
      >
        {/* SVG ring */}
        <svg width={SIZE} height={SIZE} style={{ flexShrink: 0 }}>
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="rgba(128,128,128,0.25)"
            strokeWidth={STROKE}
          />
          {/* Fill arc */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeDasharray={CIRC}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.4s ease' }}
          />
        </svg>

        {/* Task progress badge */}
        {taskProgress && taskProgress.total > 0 && (
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.7rem',
              lineHeight: 1,
              color: 'text.secondary',
              whiteSpace: 'nowrap',
            }}
          >
            {taskProgress.completed}/{taskProgress.total}
          </Typography>
        )}
      </Box>
    </Tooltip>
  )
}

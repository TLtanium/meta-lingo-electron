/**
 * QuantifierBar
 * Rendered at the top of each element editor (Token / Meet / WordSketch / Structure).
 *
 * Layout:
 *   [?] [↺]  <title>                    [✓]
 *   ── repeat panel (only when ↺ is active) ──────────────────────────────
 *   │  [min→max] [min+] [≤ max] [exactly]                                │
 *   │  [−] n [+]  →  [−] m [+]               preview: {n,m}             │
 *   ──────────────────────────────────────────────────────────────────────
 *
 * ? and ↺ are mutually exclusive.
 */

import { Box, Stack, Typography, IconButton, Chip, Tooltip } from '@mui/material'
import LoopIcon from '@mui/icons-material/Loop'
import CheckIcon from '@mui/icons-material/Check'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import type { BuilderElement, RepeatMode, RepeatQuantifier } from './types'

// ─── Public helpers (also used by elementToCQL in ElementCard) ────────────────

export function buildRepeatSuffix(rep: RepeatQuantifier): string {
  switch (rep.mode) {
    case 'minmax':  return `{${rep.min},${rep.max}}`
    case 'min':     return `{${rep.min},}`
    case 'max':     return `{,${rep.max}}`
    case 'exactly': return `{${rep.min}}`
  }
}

export function buildQuantifierSuffix(element: BuilderElement): string {
  if (element.optional) return '?'
  if (element.star)     return '*'
  if (element.repeat)   return buildRepeatSuffix(element.repeat)
  return ''
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const MODES: RepeatMode[] = ['minmax', 'min', 'max', 'exactly']

// Token / structure / meet use occurrence count (次), not distance (个词). Distance element has its own labels in ElementCard.
const MODE_LABELS: Record<RepeatMode, { zh: string; en: string }> = {
  minmax:  { zh: 'min → max 次', en: 'min → max occurrences' },
  min:     { zh: '≥ min 次', en: '≥ min occurrences' },
  max:     { zh: '≤ max 次', en: '≤ max occurrences' },
  exactly: { zh: '恰好 n 次', en: 'exactly n occurrences' },
}

const DEFAULT_REPEAT: RepeatQuantifier = { mode: 'minmax', min: 1, max: 2 }

// Small − n + stepper
function NumStepper({
  value, min = 0, max = 99, onChange,
}: {
  value: number; min?: number; max?: number; onChange: (n: number) => void
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.25}>
      <IconButton
        size="small"
        onClick={() => onChange(Math.max(min, value - 1))}
        sx={{ p: 0.25, color: 'text.secondary' }}
      >
        <RemoveIcon sx={{ fontSize: '0.85rem' }} />
      </IconButton>
      <Typography sx={{
        minWidth: 26, textAlign: 'center',
        fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.85rem',
        border: '1px solid', borderColor: 'divider', borderRadius: 0.5,
        px: 0.5, lineHeight: '22px', bgcolor: 'background.paper',
      }}>
        {value}
      </Typography>
      <IconButton
        size="small"
        onClick={() => onChange(Math.min(max, value + 1))}
        sx={{ p: 0.25, color: 'text.secondary' }}
      >
        <AddIcon sx={{ fontSize: '0.85rem' }} />
      </IconButton>
    </Stack>
  )
}

// Small square toggle button (text or icon variant)
function ToggleBtn({
  active, activeColor, tooltip, onClick, children,
}: {
  active: boolean
  activeColor: 'warning' | 'info'
  tooltip: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip title={tooltip} placement="bottom">
      <Box
        onClick={onClick}
        sx={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22,
          border: '1px solid',
          borderColor: active ? `${activeColor}.main` : 'divider',
          borderRadius: 0.75,
          bgcolor: active ? `${activeColor}.50` : 'transparent',
          color: active ? `${activeColor}.dark` : 'text.secondary',
          cursor: 'pointer',
          transition: 'all 0.15s',
          '&:hover': { bgcolor: active ? `${activeColor}.100` : 'action.hover' },
        }}
      >
        {children}
      </Box>
    </Tooltip>
  )
}

// ─── QuantifierBar ────────────────────────────────────────────────────────────

interface QuantifierBarProps {
  title: string
  element: BuilderElement
  onUpdate: (element: BuilderElement) => void
  onDone?: () => void
  isZh: boolean
  /** Hide the * and ↺ buttons — use for elements where only ? is valid (e.g. structural markers) */
  onlyOptional?: boolean
}

export default function QuantifierBar({
  title, element, onUpdate, onDone, isZh, onlyOptional,
}: QuantifierBarProps) {
  const isOptional = element.optional === true
  const isStar     = element.star === true
  const isRepeat   = Boolean(element.repeat)
  const rep: RepeatQuantifier = element.repeat ?? DEFAULT_REPEAT

  // ? — optional (0 or 1); mutually exclusive with * and ↺
  const toggleOptional = () => {
    if (isOptional) {
      onUpdate({ ...element, optional: false })
    } else {
      onUpdate({ ...element, optional: true, star: undefined, repeat: undefined })
    }
  }

  // * — zero or more; mutually exclusive with ? and ↺
  const toggleStar = () => {
    if (isStar) {
      onUpdate({ ...element, star: false })
    } else {
      onUpdate({ ...element, star: true, optional: false, repeat: undefined })
    }
  }

  const toggleRepeat = () => {
    if (isRepeat) {
      onUpdate({ ...element, repeat: undefined })
    } else {
      // enabling {} clears optional and *
      onUpdate({ ...element, optional: false, star: false, repeat: { ...DEFAULT_REPEAT } })
    }
  }

  const setMode = (mode: RepeatMode) => {
    onUpdate({ ...element, repeat: { ...rep, mode } })
  }

  const setMin = (n: number) => {
    const newMax = rep.mode === 'minmax' ? Math.max(n, rep.max) : rep.max
    onUpdate({ ...element, repeat: { ...rep, min: n, max: newMax } })
  }

  const setMax = (n: number) => {
    const newMin = rep.mode === 'minmax' ? Math.min(n, rep.min) : rep.min
    onUpdate({ ...element, repeat: { ...rep, max: n, min: newMin } })
  }

  return (
    <Box>
      {/* ── Header row ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          {/* ? toggle */}
          <ToggleBtn
            active={isOptional}
            activeColor="warning"
            tooltip={isZh ? '可选（后缀 ?，匹配 0 或 1 次）' : 'Optional — appends ?, matches 0 or 1 time'}
            onClick={toggleOptional}
          >
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.78rem', lineHeight: 1 }}>
              ?
            </Typography>
          </ToggleBtn>

          {/* * toggle — hidden for structural markers */}
          {!onlyOptional && (
            <ToggleBtn
              active={isStar}
              activeColor="warning"
              tooltip={isZh ? 'Kleene 星号（后缀 *，匹配 0 次或更多）' : 'Kleene star — appends *, matches 0 or more'}
              onClick={toggleStar}
            >
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.78rem', lineHeight: 1 }}>
                *
              </Typography>
            </ToggleBtn>
          )}

          {/* ↺ repeat toggle — hidden for structural markers */}
          {!onlyOptional && (
            <ToggleBtn
              active={isRepeat}
              activeColor="info"
              tooltip={isZh ? '重复量词（后缀 {...}）' : 'Repeat quantifier — appends {...}'}
              onClick={toggleRepeat}
            >
              <LoopIcon sx={{ fontSize: '0.78rem' }} />
            </ToggleBtn>
          )}

          <Typography variant="subtitle2" color="primary.main">
            {title}
          </Typography>
        </Stack>

        {/* ✓ done button */}
        {onDone && (
          <IconButton size="small" onClick={onDone} color="primary">
            <CheckIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* ── Repeat config panel ── */}
      {isRepeat && (
        <Box sx={{
          mt: 1, p: 1,
          bgcolor: 'info.50',
          border: '1px solid', borderColor: 'info.200',
          borderRadius: 1,
          display: 'flex', flexDirection: 'column', gap: 0.75,
        }}>
          {/* Mode selector */}
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {MODES.map(m => (
              <Chip
                key={m}
                label={isZh ? MODE_LABELS[m].zh : MODE_LABELS[m].en}
                size="small"
                color={rep.mode === m ? 'info' : 'default'}
                variant={rep.mode === m ? 'filled' : 'outlined'}
                onClick={() => setMode(m)}
                sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }}
              />
            ))}
          </Stack>

          {/* Steppers + live CQL preview */}
          <Stack direction="row" alignItems="center" spacing={1}>
            {rep.mode === 'minmax' && (
              <>
                <NumStepper value={rep.min} min={0} max={rep.max} onChange={setMin} />
                <ArrowForwardIcon sx={{ fontSize: '0.82rem', color: 'text.secondary' }} />
                <NumStepper value={rep.max} min={rep.min} max={99} onChange={setMax} />
              </>
            )}
            {(rep.mode === 'min' || rep.mode === 'exactly') && (
              <NumStepper value={rep.min} min={0} max={99} onChange={setMin} />
            )}
            {rep.mode === 'max' && (
              <NumStepper value={rep.max} min={0} max={99} onChange={setMax} />
            )}

            <Typography
              fontFamily="monospace" fontSize="0.82rem"
              color="info.dark" fontWeight="bold"
              sx={{ ml: 'auto !important' }}
            >
              {buildRepeatSuffix(rep)}
            </Typography>
          </Stack>
        </Box>
      )}
    </Box>
  )
}

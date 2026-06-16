/**
 * Element Card Component
 * Displays a single CQL builder element (token, distance, or operator)
 */

import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Stack,
  Chip
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff'
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import DataObjectIcon from '@mui/icons-material/DataObject'
import { useTranslation } from 'react-i18next'
import type { ElementType, BuilderElement, ConditionGroup, RepeatMode } from './types'
import { ADD_ELEMENT_OPTIONS } from './constants'
import TokenEditor from './TokenEditor'
import StructureEditor, { buildStructureCQL } from './StructureEditor'
import MeetEditor from './MeetEditor'
import WordSketchEditor from './WordSketchEditor'
import { buildQuantifierSuffix } from './QuantifierBar'

// Props for ElementCard (simplified - no insert callbacks)
interface ElementCardProps {
  element: BuilderElement
  isSelected: boolean
  isEditing: boolean
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (element: BuilderElement) => void
  onEditComplete: () => void
  annotationLabels?: string[]
}

// Generate CQL string from element
function elementToCQL(element: BuilderElement): string {
  switch (element.type) {
    case 'normal_token': {
      const base = (() => {
        if (!element.conditionGroups || element.conditionGroups.length === 0) return '[lemma=""]'
        const groupParts = element.conditionGroups.map((group: ConditionGroup) => {
          const conds = group.conditions.map(c => `${c.attribute}${c.operator}"${c.value}"`)
          const join = group.logic === 'or' ? ' | ' : ' & '
          return conds.join(join)
        })
        return `[${groupParts.join(' & ')}]`
      })()
      return base + buildQuantifierSuffix(element)
    }

    case 'unspecified_token':
      return '[]' + buildQuantifierSuffix(element)

    case 'distance': {
      const mode: RepeatMode = element.distanceMode ?? 'minmax'
      const min = element.minCount ?? 1
      const max = element.maxCount ?? 2
      switch (mode) {
        case 'minmax':  return `[]{${min},${max}}`
        case 'min':     return `[]{${min},}`
        case 'max':     return `[]{,${max}}`
        case 'exactly': return `[]{${min}}`
      }
    }

    case 'or':
      return '|'

    case 'within':
      return 'within'

    case 'not_within':
      return '!within'

    case 'containing':
      return 'containing'

    case 'not_containing':
      return '!containing'

    case 'structure':
      // Backend accepts <s>{1,2} / <s>? / <s>* directly — no parens needed
      return buildStructureCQL(element.structureVariant ?? 's_self')
        + buildQuantifierSuffix(element)

    case 'meet': {
      const p1 = element.meetPattern1 || '[]'
      const p2 = element.meetPattern2 || '[]'
      const left = element.meetLeft ?? -3
      const right = element.meetRight ?? 3
      return `(meet ${p1} ${p2} ${left} ${right})` + buildQuantifierSuffix(element)
    }

    case 'word_sketch':
      return `[ws(${element.wsHeadword ?? ''},${element.wsRelation ?? ''},${element.wsCollocation ?? ''})]`
        + buildQuantifierSuffix(element)

    default:
      return ''
  }
}

// Get icon for element type
function getElementIcon(type: ElementType) {
  switch (type) {
    case 'normal_token':       return <TextFieldsIcon fontSize="small" />
    case 'unspecified_token':  return <HelpOutlineIcon fontSize="small" />
    case 'distance':           return <SwapHorizIcon fontSize="small" />
    case 'or':                 return <CallSplitIcon fontSize="small" />
    case 'within':             return <SelectAllIcon fontSize="small" />
    case 'not_within':         return <DeselectIcon fontSize="small" />
    case 'containing':         return <FilterAltIcon fontSize="small" />
    case 'not_containing':     return <FilterAltOffIcon fontSize="small" />
    case 'meet':               return <ScatterPlotIcon fontSize="small" />
    case 'word_sketch':        return <BubbleChartIcon fontSize="small" />
    case 'structure':          return <DataObjectIcon fontSize="small" />
    default:                   return null
  }
}

export default function ElementCard({
  element,
  isSelected,
  isEditing,
  onSelect,
  onEdit,
  onDelete,
  onUpdate,
  onEditComplete,
  annotationLabels
}: ElementCardProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Get element type label
  const getTypeLabel = () => {
    const option = ADD_ELEMENT_OPTIONS.find(o => o.type === element.type)
    return option ? (isZh ? option.label.zh : option.label.en) : ''
  }

  // Render content based on element type
  const renderContent = () => {
    if (isEditing && element.type === 'normal_token') {
      return (
        <TokenEditor
          element={element}
          onUpdate={onUpdate}
          onComplete={onEditComplete}
          annotationLabels={annotationLabels}
        />
      )
    }

    if (element.type === 'distance') {
      const dMode: RepeatMode = element.distanceMode ?? 'minmax'
      const dMin = element.minCount ?? 1
      const dMax = element.maxCount ?? 2
      const DIST_MODES: RepeatMode[] = ['minmax', 'min', 'max', 'exactly']
      const DIST_LABELS: Record<RepeatMode, { zh: string; en: string }> = {
        minmax:  { zh: 'min → max 个词', en: 'min → max tokens' },
        min:     { zh: '≥ min 个词', en: '≥ min tokens' },
        max:     { zh: '≤ max 个词', en: '≤ max tokens' },
        exactly: { zh: '恰好 n 个词', en: 'exactly n tokens' },
      }
      // Tiny stepper for distance fields
      const DStep = ({ val, lo, hi, set }: { val: number; lo: number; hi: number; set: (n: number) => void }) => (
        <Stack direction="row" alignItems="center" spacing={0.25}>
          <IconButton size="small" onClick={() => set(Math.max(lo, val - 1))} sx={{ p: 0.25, color: 'text.secondary' }}>
            <RemoveIcon sx={{ fontSize: '0.82rem' }} />
          </IconButton>
          <Typography sx={{
            minWidth: 24, textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.82rem',
            border: '1px solid', borderColor: 'divider', borderRadius: 0.5,
            px: 0.5, lineHeight: '20px', bgcolor: 'background.paper',
          }}>{val}</Typography>
          <IconButton size="small" onClick={() => set(Math.min(hi, val + 1))} sx={{ p: 0.25, color: 'text.secondary' }}>
            <AddIcon sx={{ fontSize: '0.82rem' }} />
          </IconButton>
        </Stack>
      )
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {/* Mode chips */}
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {DIST_MODES.map(m => (
              <Chip key={m}
                label={isZh ? DIST_LABELS[m].zh : DIST_LABELS[m].en}
                size="small"
                color={dMode === m ? 'secondary' : 'default'}
                variant={dMode === m ? 'filled' : 'outlined'}
                onClick={() => onUpdate({ ...element, distanceMode: m })}
                sx={{ fontSize: '0.65rem', height: 18, cursor: 'pointer' }}
              />
            ))}
          </Stack>
          {/* Steppers + CQL preview */}
          <Stack direction="row" alignItems="center" spacing={0.75}>
            {dMode === 'minmax' && (<>
              <DStep val={dMin} lo={0} hi={dMax} set={v => onUpdate({ ...element, minCount: v, maxCount: Math.max(v, dMax) })} />
              <ArrowForwardIcon sx={{ fontSize: '0.8rem', color: 'text.secondary' }} />
              <DStep val={dMax} lo={dMin} hi={99} set={v => onUpdate({ ...element, maxCount: v, minCount: Math.min(v, dMin) })} />
            </>)}
            {(dMode === 'min' || dMode === 'exactly') && (
              <DStep val={dMin} lo={0} hi={99} set={v => onUpdate({ ...element, minCount: v })} />
            )}
            {dMode === 'max' && (
              <DStep val={dMax} lo={0} hi={99} set={v => onUpdate({ ...element, maxCount: v })} />
            )}
            <Typography fontFamily="monospace" fontSize="0.78rem" color="secondary.dark" fontWeight="bold" sx={{ ml: 'auto !important' }}>
              {elementToCQL(element)}
            </Typography>
          </Stack>
        </Box>
      )
    }

    if (element.type === 'or') {
      return (
        <Typography
          sx={{
            fontFamily: 'monospace',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: 'success.main'
          }}
        >
          |
        </Typography>
      )
    }

    // Operator-like elements: within / !within / containing / !containing
    if (element.type === 'within' || element.type === 'not_within' ||
        element.type === 'containing' || element.type === 'not_containing') {
      const color = (element.type === 'within' || element.type === 'containing')
        ? 'warning.main' : 'error.main'
      return (
        <Typography sx={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 'bold', color }}>
          {elementToCQL(element)}
        </Typography>
      )
    }

    // Structure element
    if (element.type === 'structure') {
      if (isEditing) {
        return <StructureEditor element={element} onUpdate={onUpdate} onComplete={onEditComplete} />
      }
      return (
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
          {elementToCQL(element)}
        </Typography>
      )
    }

    // Meet element
    if (element.type === 'meet') {
      if (isEditing) {
        return <MeetEditor element={element} onUpdate={onUpdate} onComplete={onEditComplete} />
      }
      return (
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
          {elementToCQL(element)}
        </Typography>
      )
    }

    // Word Sketch element
    if (element.type === 'word_sketch') {
      if (isEditing) {
        return <WordSketchEditor element={element} onUpdate={onUpdate} onComplete={onEditComplete} />
      }
      return (
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
          {elementToCQL(element)}
        </Typography>
      )
    }

    // Normal token or unspecified token
    return (
      <Typography
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          whiteSpace: 'nowrap'
        }}
      >
        {elementToCQL(element)}
      </Typography>
    )
  }

  // Simple rendering for OR operator
  if (element.type === 'or') {
    return (
      <Paper
        sx={{
          px: 2,
          py: 1,
          bgcolor: isSelected ? 'success.100' : 'success.50',
          border: '2px solid',
          borderColor: isSelected ? 'success.dark' : 'success.main',
          borderRadius: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexShrink: 0,
          '&:hover': { bgcolor: 'success.100' }
        }}
        onClick={() => onSelect(element.id)}
      >
        {renderContent()}
        {isSelected && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(element.id)
            }}
            sx={{ color: 'error.main', p: 0.5 }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </Paper>
    )
  }

  // Simple rendering for operator-like elements: within / !within / containing / !containing
  if (element.type === 'within' || element.type === 'not_within' ||
      element.type === 'containing' || element.type === 'not_containing') {
    const isNeg = element.type === 'not_within' || element.type === 'not_containing'
    const palette = isNeg ? 'error' : 'warning'
    return (
      <Paper
        sx={{
          px: 2,
          py: 1,
          bgcolor: isSelected ? `${palette}.100` : `${palette}.50`,
          border: '2px solid',
          borderColor: isSelected ? `${palette}.dark` : `${palette}.main`,
          borderRadius: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexShrink: 0,
          '&:hover': { bgcolor: `${palette}.100` }
        }}
        onClick={() => onSelect(element.id)}
      >
        {renderContent()}
        {isSelected && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(element.id)
            }}
            sx={{ color: 'error.main', p: 0.5 }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </Paper>
    )
  }

  return (
    <Paper
      sx={{
        bgcolor: isEditing ? 'transparent' : (isSelected ? 'primary.50' : 'info.50'),
        border: '2px solid',
        borderColor: isEditing ? 'transparent' : (isSelected ? 'primary.main' : 'info.main'),
        borderRadius: 2,
        overflow: 'hidden',
        minWidth: isEditing ? 400 : 'auto',
        cursor: isEditing ? 'default' : 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
        '&:hover': isEditing ? {} : { 
          bgcolor: 'primary.50',
          borderColor: 'primary.main'
        }
      }}
      onClick={() => !isEditing && onSelect(element.id)}
    >
      {/* Header */}
      {!isEditing && (
        <Box sx={{ 
          px: 1.5, 
          py: 0.5, 
          bgcolor: 'rgba(0,0,0,0.03)',
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {getElementIcon(element.type)}
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {getTypeLabel()}
            </Typography>
          </Stack>
          {isSelected && (
            <Box sx={{ display: 'flex', ml: 1 }}>
              {['normal_token', 'structure', 'meet', 'word_sketch'].includes(element.type) && (
                <Tooltip title={isZh ? '编辑' : 'Edit'}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(element.id)
                    }}
                    sx={{ p: 0.5 }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={isZh ? '删除' : 'Delete'}>
                <IconButton 
                  size="small" 
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(element.id)
                  }}
                  sx={{ color: 'error.main', p: 0.5 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      )}

      {/* Content */}
      <Box sx={{ p: isEditing ? 0 : 1.5, minHeight: isEditing ? 'auto' : 40 }}>
        {renderContent()}
      </Box>
    </Paper>
  )
}

export { elementToCQL }

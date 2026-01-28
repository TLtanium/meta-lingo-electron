/**
 * Element Card Component
 * Displays a single CQL builder element (token, distance, or operator)
 */

import React from 'react'
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Stack
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import { useTranslation } from 'react-i18next'
import type { ElementType, BuilderElement, ConditionGroup } from './types'
import { ADD_ELEMENT_OPTIONS } from './constants'
import TokenEditor from './TokenEditor'
import NumberInput from '../../../../components/common/NumberInput'

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
}

// Generate CQL string from element
function elementToCQL(element: BuilderElement): string {
  switch (element.type) {
    case 'normal_token':
      if (!element.conditionGroups || element.conditionGroups.length === 0) {
        return '[lemma=""]'
      }
      const conditions = element.conditionGroups.flatMap((group: ConditionGroup) =>
        group.conditions.map(c => `${c.attribute}${c.operator}"${c.value}"`)
      )
      const logic = element.conditionGroups[0]?.logic === 'or' ? ' | ' : ' & '
      return `[${conditions.join(logic)}]`
    
    case 'unspecified_token':
      return '[]'
    
    case 'distance':
      const min = element.minCount ?? 1
      const max = element.maxCount ?? 2
      if (min === max) {
        return `[]{${min}}`
      }
      return `[]{${min},${max}}`
    
    case 'or':
      return '|'
    
    default:
      return ''
  }
}

// Get icon for element type
function getElementIcon(type: ElementType) {
  switch (type) {
    case 'normal_token':
      return <TextFieldsIcon fontSize="small" />
    case 'unspecified_token':
      return <HelpOutlineIcon fontSize="small" />
    case 'distance':
      return <SwapHorizIcon fontSize="small" />
    case 'or':
      return <CallSplitIcon fontSize="small" />
    default:
      return null
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
  onEditComplete
}: ElementCardProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Get element type label
  const getTypeLabel = () => {
    const option = ADD_ELEMENT_OPTIONS.find(o => o.type === element.type)
    return option ? (isZh ? option.label.zh : option.label.en) : ''
  }

  // Handle distance value changes
  const handleDistanceChange = (field: 'min' | 'max', value: string) => {
    const numValue = parseInt(value) || 0
    if (field === 'min') {
      setLocalMinCount(value)
      onUpdate({
        ...element,
        minCount: numValue,
        maxCount: Math.max(numValue, element.maxCount || numValue)
      })
    } else {
      setLocalMaxCount(value)
      onUpdate({
        ...element,
        maxCount: numValue,
        minCount: Math.min(numValue, element.minCount || numValue)
      })
    }
  }

  // Render content based on element type
  const renderContent = () => {
    if (isEditing && element.type === 'normal_token') {
      return (
        <TokenEditor
          element={element}
          onUpdate={onUpdate}
          onComplete={onEditComplete}
          onCancel={onEditComplete}
        />
      )
    }

    if (element.type === 'distance') {
      return (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 0.5,
          fontFamily: 'monospace',
          fontSize: '0.9rem'
        }}>
          <Typography sx={{ color: 'secondary.main', fontWeight: 'bold' }}>{'[]{'}</Typography>
          <NumberInput
            size="small"
            value={element.minCount ?? 1}
            onChange={(val) => handleDistanceChange('min', String(val))}
            min={0}
            max={99}
            integer
            sx={{ width: 80 }}
          />
          <Typography sx={{ color: 'text.secondary', mx: 0.5 }}>,</Typography>
          <NumberInput
            size="small"
            value={element.maxCount ?? 2}
            onChange={(val) => handleDistanceChange('max', String(val))}
            min={0}
            max={99}
            integer
            sx={{ width: 80 }}
          />
          <Typography sx={{ color: 'secondary.main', fontWeight: 'bold' }}>{'}'}</Typography>
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
              {element.type === 'normal_token' && (
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

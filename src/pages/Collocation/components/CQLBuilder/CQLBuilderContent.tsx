/**
 * CQL Builder Content Component
 * Main content area for building CQL queries visually
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { parseCQLToElements } from './cqlParser'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Popover,
  Paper,
  Alert,
  Chip,
  Divider
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
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
import type { BuilderElement, ElementType } from './types'
import { ADD_ELEMENT_OPTIONS, generateId } from './constants'
import ElementCard, { elementToCQL } from './ElementCard'
import CQLPreview from './CQLPreview'

interface CQLBuilderContentProps {
  initialCQL?: string
  externalElements?: BuilderElement[]
  externalElementsVersion?: number
  onCQLChange: (cql: string, elements: BuilderElement[], isValid: boolean) => void
  onCopy: () => void
  annotationLabels?: string[]
}

// Get icon for element type (with optional size)
function getElementIcon(type: ElementType, size: 'small' | 'medium' = 'small') {
  const sx = size === 'medium' ? { fontSize: 28 } : undefined
  switch (type) {
    case 'normal_token':      return <TextFieldsIcon fontSize={size} sx={sx} />
    case 'unspecified_token': return <HelpOutlineIcon fontSize={size} sx={sx} />
    case 'distance':          return <SwapHorizIcon fontSize={size} sx={sx} />
    case 'or':                return <CallSplitIcon fontSize={size} sx={sx} />
    case 'within':            return <SelectAllIcon fontSize={size} sx={sx} />
    case 'not_within':        return <DeselectIcon fontSize={size} sx={sx} />
    case 'containing':        return <FilterAltIcon fontSize={size} sx={sx} />
    case 'not_containing':    return <FilterAltOffIcon fontSize={size} sx={sx} />
    case 'meet':              return <ScatterPlotIcon fontSize={size} sx={sx} />
    case 'word_sketch':       return <BubbleChartIcon fontSize={size} sx={sx} />
    case 'structure':         return <DataObjectIcon fontSize={size} sx={sx} />
    default:                  return null
  }
}

// Color for each element type (for the menu cards)
function getElementColor(type: ElementType): string {
  switch (type) {
    case 'normal_token':      return 'primary.main'
    case 'unspecified_token': return 'text.secondary'
    case 'distance':          return 'secondary.main'
    case 'or':                return 'success.main'
    case 'within':            return 'warning.dark'
    case 'not_within':        return 'error.main'
    case 'containing':        return 'warning.dark'
    case 'not_containing':    return 'error.main'
    case 'meet':              return 'info.main'
    case 'word_sketch':       return 'primary.dark'
    case 'structure':         return 'secondary.dark'
    default:                  return 'text.primary'
  }
}

// Create default element based on type
function createDefaultElement(type: ElementType): BuilderElement {
  const id = generateId()

  switch (type) {
    case 'normal_token':
      return {
        id,
        type,
        conditionGroups: [{
          conditions: [{
            id: generateId(),
            attribute: 'lemma',
            operator: '=',
            value: ''
          }],
          logic: 'and'
        }],
        isEditing: true
      }
    case 'unspecified_token':
      return { id, type }
    case 'distance':
      return { id, type, minCount: 1, maxCount: 2 }
    case 'or':
    case 'within':
    case 'not_within':
    case 'containing':
    case 'not_containing':
      return { id, type }
    case 'meet':
      return { id, type, meetPattern1: '[]', meetPattern2: '[]', meetLeft: -3, meetRight: 3 }
    case 'word_sketch':
      return { id, type, wsHeadword: '', wsRelation: '', wsCollocation: '' }
    case 'structure':
      return { id, type, structureVariant: 's_self' }
    default:
      return { id, type }
  }
}

// Generate CQL from elements
function generateCQL(elements: BuilderElement[]): string {
  return elements.map(el => elementToCQL(el)).join(' ')
}

// Validate CQL (basic validation)
function validateCQL(cql: string): { valid: boolean; error?: string } {
  if (!cql.trim()) {
    return { valid: false, error: undefined }
  }
  
  // Check bracket balance
  const openBrackets = (cql.match(/\[/g) || []).length
  const closeBrackets = (cql.match(/\]/g) || []).length
  if (openBrackets !== closeBrackets) {
    return { valid: false, error: 'Unbalanced brackets' }
  }
  
  // Check for empty values in normal tokens
  if (cql.includes('=""')) {
    return { valid: false, error: 'Empty value in token' }
  }
  
  return { valid: true }
}

// Polished card for each element option in the add-element popover
interface ElementOptionCardProps {
  option: { type: ElementType; label: { zh: string; en: string }; description: { zh: string; en: string }; preview: string }
  isZh: boolean
  onAdd: (type: ElementType) => void
}
function ElementOptionCard({ option, isZh, onAdd }: ElementOptionCardProps) {
  const color = getElementColor(option.type)
  return (
    <Box
      onClick={() => onAdd(option.type)}
      sx={{
        width: 120,
        p: 1.5,
        borderRadius: 2,
        border: '1.5px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.75,
        transition: 'all 0.15s',
        '&:hover': {
          borderColor: color,
          bgcolor: 'action.hover',
          transform: 'translateY(-1px)',
          boxShadow: 2,
        }
      }}
    >
      <Box sx={{ color, lineHeight: 0 }}>
        {getElementIcon(option.type, 'medium')}
      </Box>
      <Typography variant="caption" fontWeight="bold" textAlign="center" sx={{ lineHeight: 1.2 }}>
        {isZh ? option.label.zh : option.label.en}
      </Typography>
      <Chip
        label={option.preview}
        size="small"
        sx={(theme) => ({
          fontFamily: 'monospace',
          fontSize: '0.6rem',
          height: 18,
          bgcolor: theme.palette.mode === 'dark' ? 'action.selected' : 'grey.100',
          color: 'text.secondary',
          maxWidth: '100%',
          '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', px: 0.75 }
        })}
      />
    </Box>
  )
}

export default function CQLBuilderContent({
  initialCQL,
  externalElements,
  externalElementsVersion = 0,
  onCQLChange,
  onCopy,
  annotationLabels
}: CQLBuilderContentProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Parse initialCQL once on mount (key-based remount ensures fresh state on each dialog open)
  const initialElements = useMemo(() => {
    if (initialCQL && initialCQL.trim()) {
      try { return parseCQLToElements(initialCQL) } catch { /* ignore */ }
    }
    return []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // intentionally empty — evaluated once on mount

  // State
  const [elements, setElements] = useState<BuilderElement[]>(initialElements)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null)
  const [insertIndex, setInsertIndex] = useState<number>(-1)

  // Respond to external element updates (template loading)
  useEffect(() => {
    if (externalElementsVersion > 0 && externalElements && externalElements.length > 0) {
      setElements(externalElements)
      setSelectedElementId(null)
      setEditingElementId(null)
    }
  }, [externalElementsVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Generate CQL and validate
  const cql = generateCQL(elements)
  const validation = validateCQL(cql)

  // Notify parent of changes
  useEffect(() => {
    onCQLChange(cql, elements, validation.valid)
  }, [cql, elements, validation.valid, onCQLChange])

  // Handle add element menu - triggered by clicking a + button
  const handleAddClick = (event: React.MouseEvent<HTMLElement>, index: number) => {
    setAddMenuAnchor(event.currentTarget)
    setInsertIndex(index)
  }

  const handleAddMenuClose = () => {
    setAddMenuAnchor(null)
  }

  const handleAddElement = (type: ElementType) => {
    const newElement = createDefaultElement(type)
    
    if (insertIndex >= 0 && insertIndex <= elements.length) {
      // Insert at specific position
      const newElements = [...elements]
      newElements.splice(insertIndex, 0, newElement)
      setElements(newElements)
    } else {
      // Add to end
      setElements([...elements, newElement])
    }
    
    // Auto-select and edit for editable element types
    setSelectedElementId(newElement.id)
    if (['normal_token', 'structure', 'meet', 'word_sketch'].includes(type)) {
      setEditingElementId(newElement.id)
    }
    
    handleAddMenuClose()
  }

  // Handle element selection
  const handleSelect = useCallback((id: string) => {
    setSelectedElementId(prev => prev === id ? null : id)
  }, [])

  // Handle element edit
  const handleEdit = useCallback((id: string) => {
    setEditingElementId(id)
  }, [])

  // Handle element delete
  const handleDelete = useCallback((id: string) => {
    setElements(prev => prev.filter(el => el.id !== id))
    if (selectedElementId === id) {
      setSelectedElementId(null)
    }
    if (editingElementId === id) {
      setEditingElementId(null)
    }
  }, [selectedElementId, editingElementId])

  // Handle element update
  const handleUpdate = useCallback((updatedElement: BuilderElement) => {
    setElements(prev => 
      prev.map(el => el.id === updatedElement.id ? updatedElement : el)
    )
  }, [])

  // Handle edit complete
  const handleEditComplete = useCallback(() => {
    setEditingElementId(null)
  }, [])

  // Render add button
  const renderAddButton = (index: number) => (
    <IconButton
      size="small"
      onClick={(e) => handleAddClick(e, index)}
      sx={{
        bgcolor: 'grey.200',
        color: 'grey.600',
        width: 28,
        height: 28,
        flexShrink: 0,
        '&:hover': { 
          bgcolor: 'primary.main',
          color: 'white'
        }
      }}
    >
      <AddIcon fontSize="small" />
    </IconButton>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* CQL Preview */}
      <CQLPreview
        cql={cql}
        isValid={validation.valid}
        error={validation.error}
        onCopy={onCopy}
      />

      {/* Build Area */}
      <Paper 
        sx={(theme) => ({ 
          flex: 1, 
          mt: 2, 
          p: 2, 
          bgcolor: theme.palette.mode === 'dark' ? 'background.default' : 'grey.50',
          border: '1px dashed',
          borderColor: theme.palette.mode === 'dark' ? 'divider' : 'grey.300',
          borderRadius: 2,
          overflowX: 'auto',
          overflowY: 'hidden'
        })}
      >
        {elements.length === 0 ? (
          // Empty state
          <Box 
            sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              minHeight: 200
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {isZh ? '点击下方按钮添加元素开始构建查询' : 'Click the button below to add elements and start building'}
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={(e) => handleAddClick(e, 0)}
              sx={{ mt: 2 }}
            >
              {isZh ? '添加元素' : 'Add Element'}
            </Button>
          </Box>
        ) : (
          // Elements display with add buttons between them
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center',
              gap: 1.5,
              minHeight: 100,
              minWidth: 'max-content',
              py: 1
            }}
          >
            {/* First add button */}
            {renderAddButton(0)}
            
            {/* Elements with add buttons after each */}
            {elements.map((element, index) => (
              <Box 
                key={element.id}
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: 1.5
                }}
              >
                <ElementCard
                  element={element}
                  isSelected={selectedElementId === element.id}
                  isEditing={editingElementId === element.id}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                  onEditComplete={handleEditComplete}
                  annotationLabels={annotationLabels}
                />
                {/* Add button after each element */}
                {renderAddButton(index + 1)}
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {/* Hint */}
      <Alert severity="info" sx={{ mt: 2 }} icon={false}>
        <Typography variant="body2">
          {isZh 
            ? '提示: 点击元素卡片选中后可编辑或删除。点击 + 按钮在任意位置插入新元素。' 
            : 'Tip: Click on element cards to select, then edit or delete. Click + buttons to insert new elements at any position.'}
        </Typography>
      </Alert>

      {/* Add Element Popover — polished grid */}
      <Popover
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={handleAddMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        PaperProps={{ sx: { borderRadius: 2, boxShadow: 6, minWidth: 420, maxWidth: 480 } }}
      >
        <Box sx={{ p: 2 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle2" fontWeight="bold">
              {isZh ? '添加元素' : 'Add Element'}
            </Typography>
            <IconButton size="small" onClick={handleAddMenuClose} sx={{ p: 0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Token group */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isZh ? 'Token' : 'Token'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {ADD_ELEMENT_OPTIONS.filter(o => ['normal_token', 'unspecified_token', 'distance'].includes(o.type)).map(option => (
              <ElementOptionCard key={option.type} option={option} isZh={isZh} onAdd={handleAddElement} />
            ))}
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Operators group */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isZh ? '运算符' : 'Operators'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {ADD_ELEMENT_OPTIONS.filter(o => ['or', 'within', 'not_within', 'containing', 'not_containing'].includes(o.type)).map(option => (
              <ElementOptionCard key={option.type} option={option} isZh={isZh} onAdd={handleAddElement} />
            ))}
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Advanced group */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isZh ? '高级' : 'Advanced'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {ADD_ELEMENT_OPTIONS.filter(o => ['meet', 'word_sketch', 'structure'].includes(o.type)).map(option => (
              <ElementOptionCard key={option.type} option={option} isZh={isZh} onAdd={handleAddElement} />
            ))}
          </Box>
        </Box>
      </Popover>
    </Box>
  )
}

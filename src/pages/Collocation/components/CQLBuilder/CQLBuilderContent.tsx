/**
 * CQL Builder Content Component
 * Main content area for building CQL queries visually
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Alert,
  Stack
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import { useTranslation } from 'react-i18next'
import type { BuilderElement, ElementType } from './types'
import { ADD_ELEMENT_OPTIONS, generateId } from './constants'
import ElementCard, { elementToCQL } from './ElementCard'
import CQLPreview from './CQLPreview'

interface CQLBuilderContentProps {
  initialCQL?: string
  onCQLChange: (cql: string, elements: BuilderElement[], isValid: boolean) => void
  onCopy: () => void
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
      return { id, type }
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

export default function CQLBuilderContent({
  initialCQL,
  onCQLChange,
  onCopy
}: CQLBuilderContentProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // State
  const [elements, setElements] = useState<BuilderElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null)
  const [insertIndex, setInsertIndex] = useState<number>(-1)

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
    
    // Auto-select and edit if it's a normal token
    setSelectedElementId(newElement.id)
    if (type === 'normal_token') {
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
  const renderAddButton = (index: number, isFirst: boolean = false) => (
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
        sx={{ 
          flex: 1, 
          mt: 2, 
          p: 2, 
          bgcolor: 'grey.50',
          border: '1px dashed',
          borderColor: 'grey.300',
          borderRadius: 2,
          overflowX: 'auto',
          overflowY: 'hidden'
        }}
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
            {renderAddButton(0, true)}
            
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

      {/* Add Element Menu */}
      <Menu
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={handleAddMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {ADD_ELEMENT_OPTIONS.map(option => (
          <MenuItem key={option.type} onClick={() => handleAddElement(option.type)}>
            <ListItemIcon>
              {getElementIcon(option.type)}
            </ListItemIcon>
            <ListItemText 
              primary={isZh ? option.label.zh : option.label.en}
              secondary={
                <Stack>
                  <Typography variant="caption" color="text.secondary">
                    {isZh ? option.description.zh : option.description.en}
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {option.preview}
                  </Typography>
                </Stack>
              }
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )
}

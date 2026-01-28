/**
 * Saved Templates Component
 * Manages saved CQL query templates
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  Box,
  Typography,
  Divider,
  Tooltip,
  Alert,
  Chip,
  Stack
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SaveIcon from '@mui/icons-material/Save'
import { useTranslation } from 'react-i18next'
import type { SavedTemplatesProps, CQLTemplate, BuilderElement } from './types'
import { TEMPLATES_STORAGE_KEY, CQL_EXAMPLES, generateId } from './constants'

export default function SavedTemplates({
  open,
  onClose,
  onSelect,
  onSave
}: SavedTemplatesProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  
  const [templates, setTemplates] = useState<CQLTemplate[]>([])
  const [newTemplateName, setNewTemplateName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load templates from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY)
      if (stored) {
        setTemplates(JSON.parse(stored))
      }
    } catch (err) {
      console.error('Failed to load templates:', err)
    }
  }, [open])

  // Save templates to localStorage
  const saveTemplates = (newTemplates: CQLTemplate[]) => {
    try {
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(newTemplates))
      setTemplates(newTemplates)
    } catch (err) {
      console.error('Failed to save templates:', err)
      setError(isZh ? '保存失败' : 'Failed to save')
    }
  }

  // Delete template
  const handleDelete = (id: string) => {
    const newTemplates = templates.filter(t => t.id !== id)
    saveTemplates(newTemplates)
  }

  // Select template
  const handleSelect = (template: CQLTemplate) => {
    onSelect(template)
    onClose()
  }

  // Handle save current (called from parent)
  const handleSaveNew = (name: string, cql: string, elements: BuilderElement[]) => {
    if (!name.trim()) {
      setError(isZh ? '请输入模板名称' : 'Please enter template name')
      return
    }

    const newTemplate: CQLTemplate = {
      id: generateId(),
      name: name.trim(),
      cql,
      elements,
      createdAt: new Date().toISOString()
    }

    const newTemplates = [newTemplate, ...templates]
    saveTemplates(newTemplates)
    setNewTemplateName('')
    setError(null)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isZh ? 'CQL 模板' : 'CQL Templates'}
      </DialogTitle>
      
      <DialogContent dividers>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Built-in examples */}
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
          {isZh ? '示例模板' : 'Example Templates'}
        </Typography>
        <List dense>
          {CQL_EXAMPLES.map((example, idx) => (
            <ListItem
              key={idx}
              sx={{
                bgcolor: 'grey.50',
                borderRadius: 1,
                mb: 0.5,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'grey.100' }
              }}
              onClick={() => onSelect({
                id: `example-${idx}`,
                name: isZh ? example.name.zh : example.name.en,
                cql: example.cql,
                elements: [],
                createdAt: ''
              })}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">
                      {isZh ? example.name.zh : example.name.en}
                    </Typography>
                    <Chip 
                      label={example.cql} 
                      size="small" 
                      sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    />
                  </Box>
                }
                secondary={isZh ? example.description.zh : example.description.en}
              />
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        {/* User saved templates */}
        <Typography variant="subtitle2" gutterBottom>
          {isZh ? '我的模板' : 'My Templates'}
          <Chip label={templates.length} size="small" sx={{ ml: 1 }} />
        </Typography>

        {templates.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            {isZh ? '暂无保存的模板' : 'No saved templates'}
          </Typography>
        ) : (
          <List dense>
            {templates.map(template => (
              <ListItem
                key={template.id}
                sx={{
                  bgcolor: 'info.50',
                  borderRadius: 1,
                  mb: 0.5,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'info.100' }
                }}
                onClick={() => handleSelect(template)}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">{template.name}</Typography>
                    </Box>
                  }
                  secondary={
                    <Stack spacing={0.5}>
                      <Typography 
                        variant="caption" 
                        sx={{ fontFamily: 'monospace', display: 'block' }}
                      >
                        {template.cql}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(template.createdAt).toLocaleDateString()}
                      </Typography>
                    </Stack>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title={isZh ? '删除' : 'Delete'}>
                    <IconButton 
                      edge="end" 
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(template.id)
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {isZh ? '关闭' : 'Close'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// Export helper function for saving
export function saveTemplate(
  name: string, 
  cql: string, 
  elements: BuilderElement[]
): CQLTemplate | null {
  if (!name.trim() || !cql.trim()) {
    return null
  }

  try {
    const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY)
    const templates: CQLTemplate[] = stored ? JSON.parse(stored) : []
    
    const newTemplate: CQLTemplate = {
      id: generateId(),
      name: name.trim(),
      cql,
      elements,
      createdAt: new Date().toISOString()
    }

    const newTemplates = [newTemplate, ...templates]
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(newTemplates))
    
    return newTemplate
  } catch (err) {
    console.error('Failed to save template:', err)
    return null
  }
}


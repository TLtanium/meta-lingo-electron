/**
 * CQL Builder Dialog Component
 * Main dialog for visual CQL query building
 */

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Tooltip,
  Box,
  Typography,
  TextField,
  Snackbar,
  Alert,
  Divider
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import HistoryIcon from '@mui/icons-material/History'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SaveIcon from '@mui/icons-material/Save'
import SendIcon from '@mui/icons-material/Send'
import { useTranslation } from 'react-i18next'
import type { CQLBuilderDialogProps, BuilderElement, CQLTemplate } from './types'
import CQLBuilderContent from './CQLBuilderContent'
import SavedTemplates, { saveTemplate } from './SavedTemplates'

export default function CQLBuilderDialog({
  open,
  onClose,
  onApply,
  initialCQL
}: CQLBuilderDialogProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // State
  const [currentCQL, setCurrentCQL] = useState('')
  const [currentElements, setCurrentElements] = useState<BuilderElement[]>([])
  const [isValid, setIsValid] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  })

  // Handle CQL change from builder
  const handleCQLChange = useCallback((cql: string, elements: BuilderElement[], valid: boolean) => {
    setCurrentCQL(cql)
    setCurrentElements(elements)
    setIsValid(valid)
  }, [])

  // Handle copy
  const handleCopy = useCallback(() => {
    if (currentCQL) {
      navigator.clipboard.writeText(currentCQL)
      setSnackbar({
        open: true,
        message: isZh ? '已复制到剪贴板' : 'Copied to clipboard',
        severity: 'success'
      })
    }
  }, [currentCQL, isZh])

  // Handle apply
  const handleApply = () => {
    if (currentCQL && isValid) {
      onApply(currentCQL)
      onClose()
    }
  }

  // Handle template selection
  const handleSelectTemplate = (template: CQLTemplate) => {
    // If template has elements, we'd ideally restore them
    // For now, we just set the CQL directly
    setCurrentCQL(template.cql)
    setShowTemplates(false)
    
    // Note: A full implementation would parse the CQL back to elements
    // For now, users can copy the CQL or apply it directly
    setSnackbar({
      open: true,
      message: isZh ? `已加载模板: ${template.name}` : `Loaded template: ${template.name}`,
      severity: 'success'
    })
  }

  // Handle save template
  const handleSaveTemplate = () => {
    if (!saveTemplateName.trim()) {
      setSnackbar({
        open: true,
        message: isZh ? '请输入模板名称' : 'Please enter template name',
        severity: 'error'
      })
      return
    }

    const saved = saveTemplate(saveTemplateName, currentCQL, currentElements)
    if (saved) {
      setSnackbar({
        open: true,
        message: isZh ? '模板已保存' : 'Template saved',
        severity: 'success'
      })
      setShowSaveDialog(false)
      setSaveTemplateName('')
    } else {
      setSnackbar({
        open: true,
        message: isZh ? '保存失败' : 'Failed to save',
        severity: 'error'
      })
    }
  }

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: { minHeight: '70vh' }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">
            CQL Builder
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title={isZh ? '复制' : 'Copy'}>
              <IconButton size="small" onClick={handleCopy} disabled={!currentCQL}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={isZh ? '保存模板' : 'Save Template'}>
              <IconButton 
                size="small" 
                onClick={() => setShowSaveDialog(true)} 
                disabled={!currentCQL || !isValid}
              >
                <SaveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={isZh ? '模板' : 'Templates'}>
              <IconButton size="small" onClick={() => setShowTemplates(true)}>
                <HistoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={isZh ? '帮助' : 'Help'}>
              <IconButton size="small" onClick={() => setShowHelp(!showHelp)}>
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column' }}>
          {/* Help panel */}
          {showHelp && (
            <Alert severity="info" onClose={() => setShowHelp(false)} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                {isZh ? 'CQL Builder 使用说明' : 'CQL Builder Help'}
              </Typography>
              <Typography variant="body2" component="div">
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>{isZh ? '普通 Token: 定义具体的词、词元或词性条件' : 'Normal Token: Define specific word, lemma, or POS conditions'}</li>
                  <li>{isZh ? '任意 Token: 匹配任意一个词 []' : 'Unspecified Token: Match any single token []'}</li>
                  <li>{isZh ? '距离: 指定Token之间的距离范围 []{min,max}' : 'Distance: Specify gap range between tokens []{min,max}'}</li>
                  <li>{isZh ? 'OR: 连接两个查询选项 |' : 'OR: Connect two query alternatives |'}</li>
                </ul>
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {isZh 
                  ? '属性: word(词形), lemma(词元), pos(词性), tag(细粒度词性), dep(依存关系)' 
                  : 'Attributes: word, lemma, pos (Universal POS), tag (Penn Treebank), dep (dependency)'}
              </Typography>
              <Typography variant="body2">
                {isZh 
                  ? '运算符: =(正则), ==(精确), !=(正则不匹配), !==(精确不匹配)' 
                  : 'Operators: = (regex), == (exact), != (regex not), !== (exact not)'}
              </Typography>
            </Alert>
          )}

          {/* Builder content */}
          <CQLBuilderContent
            initialCQL={initialCQL}
            onCQLChange={handleCQLChange}
            onCopy={handleCopy}
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>
            {isZh ? '取消' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SendIcon />}
            onClick={handleApply}
            disabled={!currentCQL || !isValid}
          >
            {isZh ? '使用此 CQL' : 'Use This CQL'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Saved Templates Dialog */}
      <SavedTemplates
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelect={handleSelectTemplate}
        onSave={(name, cql, elements) => {
          // This is called from within SavedTemplates if needed
        }}
      />

      {/* Save Template Dialog */}
      <Dialog open={showSaveDialog} onClose={() => setShowSaveDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{isZh ? '保存模板' : 'Save Template'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={isZh ? '模板名称' : 'Template Name'}
            value={saveTemplateName}
            onChange={(e) => setSaveTemplateName(e.target.value)}
            sx={{ mt: 1 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            CQL: <code>{currentCQL}</code>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSaveDialog(false)}>
            {isZh ? '取消' : 'Cancel'}
          </Button>
          <Button variant="contained" onClick={handleSaveTemplate}>
            {isZh ? '保存' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}


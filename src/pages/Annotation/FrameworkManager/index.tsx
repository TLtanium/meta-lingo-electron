import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Snackbar,
  CircularProgress
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { frameworkApi } from '../../../api/framework'
import { FrameworkList } from './FrameworkList'
import { FrameworkDetail } from './FrameworkDetail'
import type { Framework, FrameworkCategory } from './types'

const FrameworkManager: React.FC = () => {
  const { t } = useTranslation()
  
  // State
  const [categories, setCategories] = useState<FrameworkCategory[]>([])
  const [currentFramework, setCurrentFramework] = useState<Framework | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Import dialog
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  
  // Load frameworks
  const loadFrameworks = useCallback(async () => {
    setLoading(true)
    try {
      const response = await frameworkApi.list()
      if (response.data?.success && response.data?.data) {
        setCategories(response.data.data.categories || [])
      }
    } catch (err: any) {
      setError(err.message || t('framework.loadError', '加载框架列表失败'))
    } finally {
      setLoading(false)
    }
  }, [t])
  
  // Initial load
  useEffect(() => {
    loadFrameworks()
  }, [loadFrameworks])
  
  // Handle framework selection
  const handleSelectFramework = useCallback(async (framework: Framework) => {
    try {
      const response = await frameworkApi.get(framework.id)
      if (response.data?.success && response.data?.data) {
        setCurrentFramework(response.data.data)
      }
    } catch (err: any) {
      setError(err.message || t('framework.loadDetailError', '加载框架详情失败'))
    }
  }, [t])
  
  // Handle back to list
  const handleBack = useCallback(() => {
    setCurrentFramework(null)
    loadFrameworks() // Refresh list
  }, [loadFrameworks])
  
  // Handle framework update
  const handleFrameworkUpdate = useCallback((framework: Framework) => {
    setCurrentFramework(framework)
  }, [])
  
  // Handle import
  const handleOpenImport = useCallback(() => {
    setImportDialogOpen(true)
  }, [])
  
  const handleImportFile = useCallback(async () => {
    if (!importFile) return
    
    try {
      const content = await importFile.text()
      const data = JSON.parse(content)
      
      const createRequest = {
        name: data.name || importFile.name.replace('.json', ''),
        category: data.category || 'Customs',
        description: data.description,
        root: data.root || {
          id: crypto.randomUUID(),
          name: data.name || 'Root',
          type: 'tier' as const,
          children: data.children || []
        }
      }
      
      const response = await frameworkApi.create(createRequest)
      
      if (response.data?.success && response.data?.data) {
        setImportDialogOpen(false)
        setImportFile(null)
        setSuccessMessage(t('framework.importSuccess', '导入成功'))
        loadFrameworks()
        setCurrentFramework(response.data.data)
      }
    } catch (err: any) {
      setError(err.message || t('framework.importError', '导入失败'))
    }
  }, [importFile, t, loadFrameworks])
  
  // Show loading
  if (loading && categories.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }
  
  return (
    <Box sx={{ height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Main View */}
      {currentFramework ? (
        <FrameworkDetail
          framework={currentFramework}
          onBack={handleBack}
          onUpdate={handleFrameworkUpdate}
        />
      ) : (
        <FrameworkList
          categories={categories}
          loading={loading}
          onSelect={handleSelectFramework}
          onRefresh={loadFrameworks}
          onImport={handleOpenImport}
        />
      )}
      
      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('framework.importFromFile', '从文件导入')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {t('framework.importHint', '选择一个 JSON 格式的框架文件进行导入')}
          </Typography>
          
          <Box
            sx={{
              mt: 2,
              p: 3,
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover'
              }
            }}
            onClick={() => document.getElementById('framework-import-input')?.click()}
          >
            <input
              id="framework-import-input"
              type="file"
              accept=".json"
              hidden
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
            {importFile ? (
              <Typography>{importFile.name}</Typography>
            ) : (
              <Typography color="text.secondary">
                {t('framework.clickToSelect', '点击选择文件')}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>
            {t('common.cancel', '取消')}
          </Button>
          <Button 
            variant="contained" 
            onClick={handleImportFile}
            disabled={!importFile}
          >
            {t('common.import', '导入')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Error Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
      
      {/* Success Snackbar */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default FrameworkManager

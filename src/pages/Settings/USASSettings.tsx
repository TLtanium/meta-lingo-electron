import { useState, useEffect } from 'react'
import {
  Paper,
  Typography,
  Box,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Tooltip,
  Divider,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CategoryIcon from '@mui/icons-material/Category'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import AddIcon from '@mui/icons-material/Add'
import { useTranslation } from 'react-i18next'
import apiClient from '../../api/client'
import USASTagSelector from '../../components/Settings/USASTagSelector'

interface USASStatus {
  english_available: boolean
  chinese_available: boolean
  supported_languages: string[]
}

interface TextTypeConfig {
  name: string
  name_zh: string
  priority_domains: string[]
  description: string
  is_custom?: boolean
}

export default function USASSettings() {
  const { t, i18n } = useTranslation()
  
  const [textTypeConfigs, setTextTypeConfigs] = useState<Record<string, TextTypeConfig>>({})
  const [status, setStatus] = useState<USASStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTypeCode, setEditingTypeCode] = useState<string | null>(null)
  const [editingDomains, setEditingDomains] = useState<string[]>([])
  const [selectorOpen, setSelectorOpen] = useState(false)

  useEffect(() => {
    loadSettings()
    loadStatus()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await apiClient.get('/api/usas/text-types')
      if (response.data.success) {
        setTextTypeConfigs(response.data.data.text_types || {})
      }
    } catch (err) {
      console.error('Error loading USAS settings:', err)
      try {
        const domainsResponse = await apiClient.get('/api/usas/domains')
        if (domainsResponse.data.success) {
          setTextTypeConfigs(domainsResponse.data.data.text_type_priorities || {})
        }
      } catch (e) {
        console.error('Error loading fallback:', e)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadStatus = async () => {
    try {
      const response = await apiClient.get('/api/usas/status')
      if (response.data.success) {
        setStatus(response.data.data)
      }
    } catch (err) {
      console.error('Error loading USAS status:', err)
    }
  }

  const handleEditType = (code: string) => {
    setEditingTypeCode(code)
    setEditingDomains(textTypeConfigs[code]?.priority_domains || [])
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingTypeCode) return
    
    setSaving(true)
    setError(null)
    
    try {
      const response = await apiClient.put('/api/usas/text-types', {
        code: editingTypeCode,
        priority_domains: editingDomains
      })
      
      if (response.data.success) {
        setTextTypeConfigs(prev => ({
          ...prev,
          [editingTypeCode]: {
            ...prev[editingTypeCode],
            priority_domains: editingDomains
          }
        }))
        setSuccess(t('settings.usas.saveSuccess'))
        setEditDialogOpen(false)
      } else {
        setError(response.data.error || 'Failed to save')
      }
    } catch (err) {
      setError('Failed to save settings')
      console.error('Error saving:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCustomType = async (code: string) => {
    if (!textTypeConfigs[code]?.is_custom) return
    
    setSaving(true)
    setError(null)
    
    try {
      const response = await apiClient.delete(`/api/usas/text-types/${code}`)
      
      if (response.data.success) {
        setTextTypeConfigs(prev => {
          const newConfigs = { ...prev }
          delete newConfigs[code]
          return newConfigs
        })
        setSuccess(t('settings.usas.typeDeleted'))
      } else {
        setError(response.data.error || 'Failed to delete')
      }
    } catch (err) {
      setError('Failed to delete type')
      console.error('Error deleting:', err)
    } finally {
      setSaving(false)
    }
  }

  const getTypeName = (code: string, config: TextTypeConfig): string => {
    return i18n.language === 'zh' ? (config.name_zh || config.name) : config.name
  }

  // Separate preset and custom types
  const presetTypes = Object.entries(textTypeConfigs)
    .filter(([, config]) => !config.is_custom)
    .sort(([a], [b]) => {
      if (a === 'GEN') return -1
      if (b === 'GEN') return 1
      return a.localeCompare(b)
    })
  
  const customTypes = Object.entries(textTypeConfigs)
    .filter(([, config]) => config.is_custom)
    .sort(([a], [b]) => a.localeCompare(b))

  const renderTypeItem = (code: string, config: TextTypeConfig, isCustom: boolean) => (
    <Box
      key={code}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        py: 1.5,
        px: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' }
      }}
    >
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" fontWeight={500}>
          {getTypeName(code, config)}
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
          {config.priority_domains.length > 0 ? (
            config.priority_domains.map(domain => (
              <Chip key={domain} label={domain} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
            ))
          ) : (
            <Typography variant="caption" color="text.secondary">
              {t('settings.usas.noDomains')}
            </Typography>
          )}
        </Stack>
      </Box>
      <Stack direction="row" spacing={0.5}>
        <Tooltip title={t('common.edit')}>
          <IconButton size="small" onClick={() => handleEditType(code)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {isCustom && (
          <Tooltip title={t('common.delete')}>
            <IconButton size="small" color="error" onClick={() => handleDeleteCustomType(code)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  )

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <CategoryIcon color="primary" />
        <Typography variant="h6">
          {t('settings.usas.title')}
        </Typography>
      </Stack>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('settings.usas.description')}
      </Typography>

      {/* Status */}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {t('common.loading')}
          </Typography>
        </Box>
      ) : status ? (
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom>
            {t('settings.usas.status')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Chip
              label={`${t('corpus.languages.english')}: ${status.english_available ? t('common.available') : t('common.unavailable')}`}
              size="small"
              color={status.english_available ? 'success' : 'error'}
              variant="outlined"
            />
            <Chip
              label={`${t('corpus.languages.chinese')}: ${status.chinese_available ? t('common.available') : t('common.unavailable')}`}
              size="small"
              color={status.chinese_available ? 'success' : 'error'}
              variant="outlined"
            />
          </Stack>
        </Box>
      ) : null}

      <Divider sx={{ my: 2 }} />

      {/* Preset Text Types */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">
            {t('settings.usas.presetTypes')} ({presetTypes.length})
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
            {presetTypes.map(([code, config]) => renderTypeItem(code, config, false))}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Custom Text Types */}
      <Accordion defaultExpanded={customTypes.length > 0}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">
            {t('settings.usas.customTypes')} ({customTypes.length})
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
            {customTypes.length > 0 ? (
              customTypes.map(([code, config]) => renderTypeItem(code, config, true))
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                {t('settings.usas.noCustomTypes')}
              </Typography>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('settings.usas.editPriorityDomains')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {editingTypeCode && textTypeConfigs[editingTypeCode] && 
              getTypeName(editingTypeCode, textTypeConfigs[editingTypeCode])}
          </Typography>
          
          <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, minHeight: 60 }}>
            {editingDomains.length > 0 ? (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {editingDomains.map(domain => (
                  <Chip
                    key={domain}
                    label={domain}
                    size="small"
                    onDelete={() => setEditingDomains(prev => prev.filter(d => d !== domain))}
                  />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                {t('settings.usas.noDomains')}
              </Typography>
            )}
          </Box>
          
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setSelectorOpen(true)}
            sx={{ mt: 2 }}
          >
            {t('settings.usas.selectDomains')}
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSaveEdit} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={20} /> : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Domain Selector */}
      <USASTagSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        selectedDomains={editingDomains}
        onSave={(domains) => {
          setEditingDomains(domains)
          setSelectorOpen(false)
        }}
      />
    </Paper>
  )
}

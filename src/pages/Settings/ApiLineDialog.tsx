import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  InputAdornment,
  IconButton,
  Alert,
  CircularProgress,
  Autocomplete,
} from '@mui/material'
import ApiIcon from '@mui/icons-material/Api'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { openaiApi } from '../../api'
import type { ApiLine } from '../../types'

interface Props {
  open: boolean
  line: ApiLine | null
  onSave: (data: Omit<ApiLine, 'id'>) => void
  onClose: () => void
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export default function ApiLineDialog({ open, line, onSave, onClose }: Props) {
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setName(line?.name ?? '')
      setBaseUrl(line?.baseUrl ?? DEFAULT_BASE_URL)
      setApiKey(line?.apiKey ?? '')
      setModel(line?.model ?? '')
      setShowKey(false)
      setTestResult(null)
      setAvailableModels([])
    }
  }, [open, line])

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value)
    setAvailableModels([])
    setTestResult(null)
  }

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    setAvailableModels([])
    setTestResult(null)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setAvailableModels([])
    try {
      const resp = await openaiApi.check(baseUrl, apiKey)
      if (resp.success && resp.data?.connected) {
        const models = resp.data.models ?? []
        setAvailableModels(models)
        setTestResult({
          success: true,
          message: t('settings.apiLines.testSuccess', { count: models.length }),
        })
      } else {
        const errMsg = (resp.data as any)?.error || resp.error || ''
        const errStr = (errMsg ?? '').toLowerCase()
        let message: string
        if (errStr.includes('timeout') || errStr.includes('timed out') || errStr.includes('econnaborted')) {
          message = t('settings.apiLines.testTimeout')
        } else if (errStr.includes('network error') || errStr.includes('failed to fetch') || errStr.includes('err_network')) {
          message = t('settings.apiLines.testNetworkError')
        } else {
          message = errMsg || t('settings.apiLines.testFailed')
        }
        setTestResult({ success: false, message })
      }
    } catch (e: any) {
      const errMsg = e?.message || String(e)
      const errStr = errMsg.toLowerCase()
      let message: string
      if (errStr.includes('timeout') || errStr.includes('timed out')) {
        message = t('settings.apiLines.testTimeout')
      } else if (errStr.includes('network error') || errStr.includes('failed to fetch')) {
        message = t('settings.apiLines.testNetworkError')
      } else {
        message = errMsg || t('settings.apiLines.testFailed')
      }
      setTestResult({ success: false, message })
    }
    setTesting(false)
  }

  const handleSave = () => {
    onSave({ name: name.trim() || t('settings.apiLines.unnamed'), baseUrl, apiKey, model })
  }

  const isEdit = !!line

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ApiIcon color="primary" fontSize="small" />
        {isEdit ? t('settings.apiLines.editLine') : t('settings.apiLines.addLine')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t('settings.apiLines.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            fullWidth
            placeholder={t('settings.apiLines.namePlaceholder')}
          />
          <TextField
            label={t('settings.openaiApi.baseUrl')}
            value={baseUrl}
            onChange={(e) => handleBaseUrlChange(e.target.value)}
            size="small"
            fullWidth
            placeholder="https://api.openai.com/v1"
            helperText={t('settings.openaiApi.baseUrlHelp')}
          />
          <TextField
            label={t('settings.openaiApi.apiKey')}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            size="small"
            fullWidth
            placeholder="sk-..."
            helperText={t('settings.openaiApi.apiKeyHelp')}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                    onClick={() => setShowKey(!showKey)}
                    edge="end"
                  >
                    {showKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Autocomplete
            freeSolo
            fullWidth
            disablePortal
            options={availableModels}
            inputValue={model}
            onInputChange={(_, newValue) => setModel(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('settings.openaiApi.model')}
                size="small"
                placeholder="gpt-4o-mini"
                helperText={
                  availableModels.length > 0
                    ? t('settings.openaiApi.modelSelectHint', { count: availableModels.length })
                    : t('settings.openaiApi.modelHelp')
                }
              />
            )}
          />
          <Stack direction="row" alignItems="center" spacing={2}>
            <Button
              variant="outlined"
              size="small"
              onClick={handleTest}
              disabled={testing || !baseUrl}
            >
              {testing ? <CircularProgress size={20} color="inherit" /> : t('settings.openaiApi.testConnection')}
            </Button>
          </Stack>
          {testResult && (
            <Alert severity={testResult.success ? 'success' : 'error'} onClose={() => setTestResult(null)}>
              {testResult.message}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('settings.apiLines.cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={!baseUrl}>
          {t('settings.apiLines.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

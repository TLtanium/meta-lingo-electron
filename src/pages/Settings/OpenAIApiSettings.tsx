import {
  Paper,
  Typography,
  TextField,
  Stack,
  FormControlLabel,
  Switch,
  Alert,
  InputAdornment,
  IconButton,
  Button,
  CircularProgress,
  Autocomplete,
} from '@mui/material'
import ApiIcon from '@mui/icons-material/Api'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import Visibility from '@mui/icons-material/Visibility'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import { openaiApi } from '../../api'

export default function OpenAIApiSettings() {
  const { t } = useTranslation()
  const {
    openaiApiEnabled,
    openaiApiBaseUrl,
    openaiApiKey,
    openaiApiModel,
    setOpenaiApiEnabled,
    setOpenaiApiBaseUrl,
    setOpenaiApiKey,
    setOpenaiApiModel
  } = useSettingsStore()

  const [showApiKey, setShowApiKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  const handleBaseUrlChange = (value: string) => {
    setOpenaiApiBaseUrl(value)
    setAvailableModels([])
    setTestResult(null)
  }

  const handleApiKeyChange = (value: string) => {
    setOpenaiApiKey(value)
    setAvailableModels([])
    setTestResult(null)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    setAvailableModels([])
    try {
      const response = await openaiApi.check(openaiApiBaseUrl, openaiApiKey)
      if (response.success && response.data?.connected) {
        const models = response.data.models ?? []
        setAvailableModels(models)
        setTestResult({
          success: true,
          message: t('settings.openaiApi.testSuccess', { count: models.length })
        })
      } else {
        const errMsg = (response.data as { error?: string })?.error || response.error || ''
        const errStr = (errMsg && typeof errMsg === 'string' ? errMsg : '').toLowerCase()
        let message: string
        if (errStr && (errStr.includes('timeout') || errStr.includes('timed out') || errStr.includes('econnaborted'))) {
          message = t('settings.openaiApi.testTimeout')
        } else if (errStr && (errStr.includes('network error') || errStr.includes('err_network') || errStr.includes('failed to fetch'))) {
          message = t('settings.openaiApi.testNetworkError')
        } else {
          message = (errMsg && typeof errMsg === 'string' ? errMsg : '') || t('settings.openaiApi.testFailed')
        }
        setTestResult({ success: false, message })
      }
    } catch (e: any) {
      const errMsg = e?.message || String(e)
      const errStr = (errMsg && typeof errMsg === 'string' ? errMsg : '').toLowerCase()
      const code = e?.code || ''
      let message: string
      if ((errStr && (errStr.includes('timeout') || errStr.includes('timed out'))) || code === 'ECONNABORTED') {
        message = t('settings.openaiApi.testTimeout')
      } else if (errStr && (errStr.includes('network error') || errStr.includes('failed to fetch')) || code === 'ERR_NETWORK') {
        message = t('settings.openaiApi.testNetworkError')
      } else {
        message = (errMsg && typeof errMsg === 'string' ? errMsg : '') || t('settings.openaiApi.testFailed')
      }
      setTestResult({ success: false, message })
    }
    setTesting(false)
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <ApiIcon color="primary" />
        <Typography variant="h6">{t('settings.openaiApi.title')}</Typography>
      </Stack>

      <Stack spacing={2}>
        <FormControlLabel
          control={
            <Switch
              checked={openaiApiEnabled}
              onChange={(e) => setOpenaiApiEnabled(e.target.checked)}
              color="primary"
            />
          }
          label={t('settings.openaiApi.useOpenAI')}
        />

        {openaiApiEnabled && (
          <>
            <TextField
              label={t('settings.openaiApi.baseUrl')}
              value={openaiApiBaseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              size="small"
              fullWidth
              placeholder="https://api.openai.com/v1"
              helperText={t('settings.openaiApi.baseUrlHelp')}
            />
            <TextField
              label={t('settings.openaiApi.apiKey')}
              type={showApiKey ? 'text' : 'password'}
              value={openaiApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              size="small"
              fullWidth
              placeholder="sk-..."
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showApiKey ? 'Hide key' : 'Show key'}
                      onClick={() => setShowApiKey(!showApiKey)}
                      edge="end"
                    >
                      {showApiKey ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
              helperText={t('settings.openaiApi.apiKeyHelp')}
            />
            <Autocomplete
              freeSolo
              fullWidth
              disablePortal
              options={availableModels}
              inputValue={openaiApiModel}
              onInputChange={(_, newValue) => setOpenaiApiModel(newValue)}
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
            <Stack direction="row" spacing={2} alignItems="center">
              <Button
                variant="outlined"
                size="small"
                onClick={handleTestConnection}
                disabled={testing || !openaiApiBaseUrl}
              >
                {testing ? <CircularProgress size={20} color="inherit" /> : t('settings.openaiApi.testConnection')}
              </Button>
            </Stack>
            {testResult && (
              <Alert severity={testResult.success ? 'success' : 'error'} onClose={() => setTestResult(null)}>
                {testResult.message}
              </Alert>
            )}
            <Alert severity="info" sx={{ mt: 0 }}>
              {t('settings.openaiApi.helpText')}
            </Alert>
          </>
        )}
      </Stack>
    </Paper>
  )
}

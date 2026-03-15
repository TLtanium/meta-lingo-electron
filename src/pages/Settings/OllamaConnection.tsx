import { useState, useEffect } from 'react'
import {
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip
} from '@mui/material'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import { ollamaApi } from '../../api'

export default function OllamaConnection() {
  const { t } = useTranslation()
  const {
    ollamaUrl,
    ollamaConnected,
    ollamaModel,
    ollamaModels,
    setOllamaUrl,
    setOllamaConnected,
    setOllamaModel,
    setOllamaModels
  } = useSettingsStore()

  const [isConnecting, setIsConnecting] = useState(false)
  const [isRefreshingModels, setIsRefreshingModels] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When already connected, sync model list from Ollama on mount so dropdown reflects current state (e.g. after user removed a model)
  const refreshModels = async () => {
    if (!ollamaUrl) return
    setIsRefreshingModels(true)
    setError(null)
    try {
      const res = await ollamaApi.listModels(ollamaUrl)
      const list = Array.isArray(res?.data) ? res.data : []
      setOllamaModels(list)
      if (ollamaModel && !list.includes(ollamaModel)) {
        setOllamaModel(list.length > 0 ? list[0] : null)
      }
    } catch {
      // Keep existing list on failure
    } finally {
      setIsRefreshingModels(false)
    }
  }

  useEffect(() => {
    if (ollamaConnected && ollamaUrl) {
      refreshModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync on connect state/url change
  }, [ollamaConnected, ollamaUrl])

  const handleConnect = async () => {
    setIsConnecting(true)
    setError(null)

    try {
      const response = await ollamaApi.connect(ollamaUrl)
      console.log('Ollama connect response:', response)
      
      if (response.success && response.data) {
        // Check if actually connected (backend returns connected: true/false)
        if (response.data.connected) {
          setOllamaConnected(true)
          setOllamaModels(response.data.models || [])
          if (response.data.models && response.data.models.length > 0 && !ollamaModel) {
            setOllamaModel(response.data.models[0])
          }
        } else {
          // Use error from backend if available
          const errorMsg = (response.data as any).error || 
            t('settings.ollamaConnectionFailed') || 
            'Failed to connect to Ollama. Make sure Ollama is running.'
          setError(errorMsg)
          setOllamaConnected(false)
        }
      } else {
        setError(response.error || t('settings.connectionFailed'))
        setOllamaConnected(false)
      }
    } catch (err) {
      console.error('Ollama connection error:', err)
      setError(t('settings.connectionFailedMessage'))
      setOllamaConnected(false)
    }

    setIsConnecting(false)
  }

  const handleDisconnect = () => {
    setOllamaConnected(false)
    setOllamaModels([])
    setOllamaModel(null)
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <SmartToyIcon color="primary" />
        <Typography variant="h6">{t('settings.ollama')}</Typography>
        {ollamaConnected ? (
          <Chip
            icon={<CheckCircleIcon />}
            label={t('settings.connected')}
            color="success"
            size="small"
          />
        ) : (
          <Chip
            icon={<ErrorIcon />}
            label={t('settings.disconnected')}
            color="default"
            size="small"
          />
        )}
      </Stack>

      <Stack spacing={2}>
        {/* Connection URL */}
        <Stack direction="row" spacing={2}>
          <TextField
            label={t('settings.ollamaUrl')}
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            size="small"
            fullWidth
            placeholder="http://localhost:11434"
            disabled={ollamaConnected}
          />
          {ollamaConnected ? (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDisconnect}
              sx={{ minWidth: 100 }}
            >
              {t('settings.disconnect')}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleConnect}
              disabled={isConnecting || !ollamaUrl}
              sx={{ minWidth: 100 }}
            >
              {isConnecting ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                t('settings.connect')
              )}
            </Button>
          )}
        </Stack>

        {/* Error message */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Model selection */}
        {ollamaConnected && (
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
              <InputLabel>{t('settings.selectModel')}</InputLabel>
              <Select
                value={ollamaModel || ''}
                onChange={(e) => setOllamaModel(e.target.value)}
                label={t('settings.selectModel')}
              >
                {ollamaModels.length > 0 ? (
                  ollamaModels.map(model => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem disabled>{t('settings.noModels')}</MenuItem>
                )}
              </Select>
            </FormControl>
            <Tooltip title={t('settings.refreshModels', 'Refresh model list')}>
              <IconButton
                onClick={refreshModels}
                disabled={isRefreshingModels}
                size="small"
                color="primary"
                aria-label={t('settings.refreshModels', 'Refresh model list')}
              >
                {isRefreshingModels ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <RefreshIcon />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
        )}

        {/* Help text */}
        <Typography variant="caption" color="text.secondary">
          {t('settings.ollamaHelpText')}{' '}
          <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a>
        </Typography>
      </Stack>
    </Paper>
  )
}


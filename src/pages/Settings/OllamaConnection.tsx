import { useState } from 'react'
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
  CircularProgress
} from '@mui/material'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
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
  const [error, setError] = useState<string | null>(null)

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
          <FormControl size="small" fullWidth>
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


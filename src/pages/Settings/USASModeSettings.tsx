import { useState, useEffect } from 'react'
import {
  Paper,
  Typography,
  Box,
  Stack,
  Alert,
  CircularProgress,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Chip
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import { useTranslation } from 'react-i18next'
import apiClient from '../../api/client'

type TaggingMode = 'rule_based' | 'neural' | 'hybrid'

interface ModeInfo {
  available: boolean
  description: string
}

interface ModeStatus {
  current_mode: TaggingMode
  modes: {
    rule_based: ModeInfo
    neural: ModeInfo
    hybrid: ModeInfo
  }
}

export default function USASModeSettings() {
  const { t } = useTranslation()
  
  const [modeStatus, setModeStatus] = useState<ModeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadModeStatus()
  }, [])

  const loadModeStatus = async () => {
    try {
      const response = await apiClient.get('/api/usas/mode')
      if (response.data.success) {
        setModeStatus(response.data.data)
      }
    } catch (err) {
      console.error('Error loading USAS mode status:', err)
      setError(t('settings.usasMode.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleModeChange = async (newMode: TaggingMode) => {
    if (!modeStatus) return
    
    // Check if mode is available
    if (!modeStatus.modes[newMode].available) {
      setError(t('settings.usasMode.modeUnavailable'))
      return
    }
    
    setSaving(true)
    setError(null)
    setSuccess(null)
    
    try {
      const response = await apiClient.put('/api/usas/mode', { mode: newMode })
      
      if (response.data.success) {
        setModeStatus(prev => prev ? { ...prev, current_mode: newMode } : null)
        setSuccess(t('settings.usasMode.saveSuccess'))
      } else {
        setError(response.data.error || t('settings.usasMode.saveError'))
      }
    } catch (err) {
      console.error('Error setting USAS mode:', err)
      setError(t('settings.usasMode.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const getModeLabel = (mode: TaggingMode): string => {
    const labels: Record<TaggingMode, string> = {
      rule_based: t('settings.usasMode.ruleBased'),
      neural: t('settings.usasMode.neural'),
      hybrid: t('settings.usasMode.hybrid')
    }
    return labels[mode]
  }

  const getModeDescription = (mode: TaggingMode): string => {
    const descriptions: Record<TaggingMode, string> = {
      rule_based: t('settings.usasMode.ruleBasedDesc'),
      neural: t('settings.usasMode.neuralDesc'),
      hybrid: t('settings.usasMode.hybridDesc')
    }
    return descriptions[mode]
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <SettingsIcon color="primary" />
        <Typography variant="h6">
          {t('settings.usasMode.title')}
        </Typography>
      </Stack>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('settings.usasMode.description')}
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {t('common.loading')}
          </Typography>
        </Box>
      ) : modeStatus ? (
        <FormControl component="fieldset" fullWidth>
          <RadioGroup
            value={modeStatus.current_mode}
            onChange={(e) => handleModeChange(e.target.value as TaggingMode)}
          >
            {(['rule_based', 'neural', 'hybrid'] as TaggingMode[]).map((mode) => {
              const modeInfo = modeStatus.modes[mode]
              const isSelected = modeStatus.current_mode === mode
              
              return (
                <Box
                  key={mode}
                  sx={{
                    p: 2,
                    mb: 1,
                    border: '1px solid',
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    opacity: modeInfo.available ? 1 : 0.6,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <FormControlLabel
                    value={mode}
                    disabled={!modeInfo.available || saving}
                    control={<Radio />}
                    label={
                      <Box sx={{ ml: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="subtitle1" fontWeight={500}>
                            {getModeLabel(mode)}
                          </Typography>
                          <Chip
                            size="small"
                            icon={modeInfo.available ? <CheckCircleIcon /> : <CancelIcon />}
                            label={modeInfo.available ? t('common.available') : t('common.unavailable')}
                            color={modeInfo.available ? 'success' : 'error'}
                            variant="outlined"
                            sx={{ height: 22 }}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {getModeDescription(mode)}
                        </Typography>
                      </Box>
                    }
                    sx={{ 
                      m: 0, 
                      width: '100%',
                      alignItems: 'flex-start'
                    }}
                  />
                </Box>
              )
            })}
          </RadioGroup>
        </FormControl>
      ) : null}

      {/* Saving indicator */}
      {saving && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {t('common.saving')}
          </Typography>
        </Box>
      )}

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
    </Paper>
  )
}

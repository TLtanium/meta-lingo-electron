import {
  Box,
  Typography,
  Grid
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import LanguageSettings from './LanguageSettings'
import WallpaperSettings from './WallpaperSettings'
import OllamaConnection from './OllamaConnection'
import USASModeSettings from './USASModeSettings'
import USASSettings from './USASSettings'
import LicenseViewer from './LicenseViewer'
import FactoryReset from './FactoryReset'

export default function Settings() {
  const { t } = useTranslation()

  return (
    <Box sx={{ p: 3, overflow: 'auto', height: '100%' }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        {t('settings.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('settings.description')}
      </Typography>

      <Grid container spacing={3}>
        {/* Language Settings */}
        <Grid item xs={12} md={6}>
          <LanguageSettings />
        </Grid>

        {/* Wallpaper Settings */}
        <Grid item xs={12} md={6}>
          <WallpaperSettings />
        </Grid>

        {/* Ollama Connection */}
        <Grid item xs={12}>
          <OllamaConnection />
        </Grid>

        {/* USAS Tagging Mode Settings */}
        <Grid item xs={12}>
          <USASModeSettings />
        </Grid>

        {/* USAS Semantic Tagging Settings (Text Type Priority) */}
        <Grid item xs={12}>
          <USASSettings />
        </Grid>

        {/* License Viewer */}
        <Grid item xs={12}>
          <LicenseViewer />
        </Grid>

        {/* Factory Reset */}
        <Grid item xs={12}>
          <FactoryReset />
        </Grid>
      </Grid>
    </Box>
  )
}


import {
  Box,
  Typography,
  Grid
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import LanguageSettings from './LanguageSettings'
import WallpaperSettings from './WallpaperSettings'
import OllamaConnection from './OllamaConnection'
import ApiLineManager from './ApiLineManager'
// import USASModeSettings from './USASModeSettings' // Hidden: defaults enforced in backend (DEFAULT_USAS_SETTINGS: neural + disambiguation off → top_n=5)
// import USASSettings from './USASSettings' // Disabled: kept for potential future reuse
import MCPServerSettings from './MCPServerSettings'
import LicenseViewer from './LicenseViewer'
import FactoryReset from './FactoryReset'
import ModelManagement from './ModelManagement'
import UserProfileSettings from './UserProfileSettings'

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
        {/* User Profile — full-width horizontal strip */}
        <Grid item xs={12}>
          <UserProfileSettings />
        </Grid>

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

        {/* API Line Manager */}
        <Grid item xs={12}>
          <ApiLineManager />
        </Grid>

        {/* USAS Tagging Mode Settings — hidden; backend DEFAULT_USAS_SETTINGS = neural + top_n=5 (disambiguation off) */}
        {/* <Grid item xs={12}>
          <USASModeSettings />
        </Grid> */}

        {/* USAS Semantic Tagging Settings (Text Type Priority) — disabled */}
        {/* <Grid item xs={12}>
          <USASSettings />
        </Grid> */}

        {/* MCP Server (AI Integration) */}
        <Grid item xs={12}>
          <MCPServerSettings />
        </Grid>

        {/* Model Management */}
        <Grid item xs={12}>
          <ModelManagement />
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


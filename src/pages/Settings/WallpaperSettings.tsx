import { useRef } from 'react'
import {
  Paper,
  Typography,
  Stack,
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Button,
  IconButton,
  Tooltip,
  Slider
} from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import WallpaperIcon from '@mui/icons-material/Wallpaper'
import UploadIcon from '@mui/icons-material/Upload'
import DeleteIcon from '@mui/icons-material/Delete'
import OpacityIcon from '@mui/icons-material/Opacity'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'

export default function WallpaperSettings() {
  const { t } = useTranslation()
  const { 
    darkMode, 
    setDarkMode, 
    customWallpaper,
    setCustomWallpaper,
    wallpaperOpacity,
    setWallpaperOpacity
  } = useSettingsStore()
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleThemeChange = (_: React.MouseEvent<HTMLElement>, newMode: 'light' | 'dark' | null) => {
    if (newMode !== null) {
      setDarkMode(newMode === 'dark')
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        return
      }
      
      // Read file as base64
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        setCustomWallpaper(base64)
      }
      reader.readAsDataURL(file)
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveWallpaper = () => {
    setCustomWallpaper(null)
  }

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      {/* Theme Toggle */}
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <LightModeIcon color="primary" />
        <Typography variant="h6">{t('settings.theme')}</Typography>
      </Stack>
      
      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <ToggleButtonGroup
          value={darkMode ? 'dark' : 'light'}
          exclusive
          onChange={handleThemeChange}
          size="medium"
          fullWidth
        >
          <ToggleButton value="light">
            <Stack direction="row" spacing={1} alignItems="center">
              <LightModeIcon fontSize="small" />
              <Typography>{t('settings.lightMode')}</Typography>
            </Stack>
          </ToggleButton>
          <ToggleButton value="dark">
            <Stack direction="row" spacing={1} alignItems="center">
              <DarkModeIcon fontSize="small" />
              <Typography>{t('settings.darkMode')}</Typography>
            </Stack>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Divider sx={{ my: 2 }} />

      {/* Custom Wallpaper Upload */}
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <WallpaperIcon color="primary" />
        <Typography variant="h6">{t('settings.customWallpaper')}</Typography>
      </Stack>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('settings.customWallpaperDesc')}
      </Typography>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {customWallpaper ? (
        <Box>
          {/* Wallpaper preview */}
          <Box
            sx={{
              width: '100%',
              height: 120,
              borderRadius: 1,
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
              mb: 2,
              position: 'relative'
            }}
          >
            <Box
              component="img"
              src={customWallpaper}
              alt="wallpaper preview"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: wallpaperOpacity
              }}
            />
          </Box>
          
          {/* Opacity slider */}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <OpacityIcon color="action" fontSize="small" />
            <Typography variant="body2" sx={{ minWidth: 60 }}>
              {t('settings.opacity')}
            </Typography>
            <Slider
              value={wallpaperOpacity}
              onChange={(_, value) => setWallpaperOpacity(value as number)}
              min={0.05}
              max={0.5}
              step={0.05}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
              sx={{ flex: 1 }}
            />
            <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
              {Math.round(wallpaperOpacity * 100)}%
            </Typography>
          </Stack>
          
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={handleUploadClick}
              size="small"
            >
              {t('settings.changeWallpaper')}
            </Button>
            <Tooltip title={t('settings.removeWallpaper')}>
              <IconButton
                onClick={handleRemoveWallpaper}
                color="error"
                size="small"
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      ) : (
        <Box>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={handleUploadClick}
          >
            {t('settings.uploadWallpaper')}
          </Button>
        </Box>
      )}
    </Paper>
  )
}


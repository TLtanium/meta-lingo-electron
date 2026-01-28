import { useState, useEffect } from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Tooltip,
} from '@mui/material'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SettingsIcon from '@mui/icons-material/Settings'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import TranslateIcon from '@mui/icons-material/Translate'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { DictionaryDialog } from '../Dictionary'

export default function AppHeader() {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const { darkMode, setDarkMode, wallpaper } = useSettingsStore()
  const [dictDialogOpen, setDictDialogOpen] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  useEffect(() => {
    // Check if running in Electron and on Mac
    if (window.electronAPI?.platform) {
      setIsMac(window.electronAPI.platform === 'darwin')
    }
    
    // Get initial fullscreen state from Electron
    if (window.electronAPI?.isFullscreen) {
      window.electronAPI.isFullscreen().then((fs) => {
        setIsFullscreen(fs)
      })
    }
    
    // Listen for Electron fullscreen changes (handles macOS native fullscreen)
    let cleanup: (() => void) | undefined
    if (window.electronAPI?.onFullscreenChange) {
      cleanup = window.electronAPI.onFullscreenChange((fs) => {
        setIsFullscreen(fs)
      })
    }
    
    return () => {
      cleanup?.()
    }
  }, [])

  const handleOpenDictionary = () => {
    setDictDialogOpen(true)
  }

  const handleOpenSettings = () => {
    openTab({ type: 'settings', title: t('settings.title') })
  }

  const handleOpenHelp = () => {
    openTab({ type: 'help', title: t('help.title') })
  }

  const handleToggleTheme = () => {
    setDarkMode(!darkMode)
  }

  const handleDictDialogClose = () => {
    setDictDialogOpen(false)
  }

  // 顶栏样式 - 有壁纸时使用毛玻璃效果
  const headerStyle = wallpaper ? {
    background: darkMode 
      ? 'rgba(22, 22, 40, 0.75)' 
      : 'rgba(25, 118, 210, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)'
  } : {
    bgcolor: darkMode ? '#1a1a28' : 'primary.main'
  }

  return (
    <>
      <AppBar 
        position="static" 
        elevation={0}
        sx={{ 
          ...headerStyle,
          // Mac: Make the entire header draggable for window movement
          WebkitAppRegion: isMac ? 'drag' : 'none',
        }}
      >
        <Toolbar sx={{ minHeight: 48 }}>
          {/* Mac: Add spacing for traffic lights (only when not fullscreen) */}
          {isMac && <Box sx={{ width: isFullscreen ? 16 : 70, flexShrink: 0, transition: 'width 0.2s ease' }} />}
          
          {/* Logo and App Name */}
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
            <MenuBookIcon sx={{ mr: 1 }} />
            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{ 
                display: { xs: 'none', sm: 'block' },
                fontWeight: 600
              }}
            >
              {t('app.name')}
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {/* Right side icons - Make non-draggable so buttons work */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5,
            WebkitAppRegion: 'no-drag',
          }}>
            {/* Dictionary Button */}
            <Tooltip title={t('dictionary.title')}>
              <IconButton 
                color="inherit" 
                size="small"
                onClick={handleOpenDictionary}
              >
                <TranslateIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title={darkMode ? t('settings.lightMode') : t('settings.darkMode')}>
              <IconButton 
                color="inherit" 
                size="small"
                onClick={handleToggleTheme}
              >
                {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            
            <Tooltip title={t('help.title')}>
              <IconButton 
                color="inherit" 
                size="small"
                onClick={handleOpenHelp}
              >
                <HelpOutlineIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('settings.title')}>
              <IconButton 
                color="inherit" 
                size="small"
                onClick={handleOpenSettings}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Dictionary Dialog */}
      <DictionaryDialog
        open={dictDialogOpen}
        onClose={handleDictDialogClose}
      />
    </>
  )
}

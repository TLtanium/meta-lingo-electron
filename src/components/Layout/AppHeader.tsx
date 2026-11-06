import { useState, useEffect } from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Tooltip,
} from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SettingsIcon from '@mui/icons-material/Settings'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import TranslateIcon from '@mui/icons-material/Translate'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import GridViewIcon from '@mui/icons-material/GridView'
import PetsIcon from '@mui/icons-material/Pets'
import { usePetStore } from '../../stores/petStore'
import { petStrings } from '../../pet/strings'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { DictionaryDialog } from '../Dictionary'
import appIcon from '../../../assets/icon.png'

export default function AppHeader() {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const { darkMode, setDarkMode, wallpaper, agentMode, setAgentMode } = useSettingsStore()
  const petEnabled = usePetStore(s => s.preferences.enabled)
  const petLanguage = useSettingsStore(s => s.language)
  const updatePet = usePetStore(s => s.updatePreferences)
  const [dictDialogOpen, setDictDialogOpen] = useState(false)
  const [isMac, setIsMac] = useState(() => window.electronAPI?.platform === 'darwin')
  const [isWin, setIsWin] = useState(() => window.electronAPI?.platform === 'win32')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [winControlWidth, setWinControlWidth] = useState(144)

  useEffect(() => {
    if (!isWin) return
    const overlay = (navigator as Navigator & { windowControlsOverlay?: EventTarget & { visible: boolean; getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay
    const update = () => {
      const rect = overlay?.visible ? overlay.getTitlebarAreaRect() : undefined
      // The reported rectangle is the usable title area, not the system buttons.
      setWinControlWidth(rect && rect.width > 0 ? Math.max(0, Math.ceil(innerWidth - rect.x - rect.width)) : 144)
    }
    update()
    overlay?.addEventListener('geometrychange', update)
    window.addEventListener('resize', update)
    return () => { overlay?.removeEventListener('geometrychange', update); window.removeEventListener('resize', update) }
  }, [isWin])
  
  useEffect(() => {
    // Check if running in Electron and on Mac
    if (window.electronAPI?.platform) {
      const platform = window.electronAPI.platform
      setIsMac(platform === 'darwin')
      setIsWin(platform === 'win32')
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

  // Windows: keep Window Controls Overlay background color in sync with header.
  // This avoids the native three buttons area looking like it's "floating" over a different background.
  useEffect(() => {
    if (!isWin) return
    if (!window.electronAPI?.setTitleBarOverlay) return

    const overlayColor = wallpaper
      ? darkMode
        ? 'rgba(22, 22, 40, 0.75)'
        : 'rgba(25, 118, 210, 0.85)'
      : darkMode
        ? '#1a1a28'
        : '#1976d2' // MUI default primary.main

    window.electronAPI.setTitleBarOverlay({
      color: overlayColor,
      symbolColor: '#fff',
      height: 48,
    }).catch(() => {})
  }, [isWin, darkMode, wallpaper])

  const handleOpenDictionary = () => {
    setDictDialogOpen(true)
  }

  const handleOpenSettings = () => {
    if (agentMode && (window as any).__agentOpenOverlay) {
      (window as any).__agentOpenOverlay('settings')
    } else {
      openTab({ type: 'settings', title: t('settings.title') })
    }
  }

  const handleOpenHelp = () => {
    if (agentMode && (window as any).__agentOpenOverlay) {
      (window as any).__agentOpenOverlay('help')
    } else {
      openTab({ type: 'help', title: t('help.title') })
    }
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
          // macOS / Windows: Make the entire header draggable for window movement
          WebkitAppRegion: isMac || isWin ? 'drag' : 'none',
        }}
      >
        <Toolbar sx={{ minHeight: 48, ...(isWin && !isFullscreen ? { pr: { xs: `${winControlWidth + 8}px`, sm: `${winControlWidth + 8}px` } } : {}) }}>
          {/* macOS: traffic lights spacing. Windows: overlay controls are top-right, so no left spacer. */}
          {isMac && (
            <Box sx={{ width: isFullscreen ? 16 : 70, flexShrink: 0, transition: 'width 0.2s ease' }} />
          )}
          
          {/* Logo and App Name */}
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2, minWidth: 0 }}>
            <Box
              component="img"
              src={appIcon}
              alt="Meta-Lingo"
              sx={{ width: 36, height: 36, mr: 1.25, borderRadius: 0.5, flexShrink: 0 }}
            />
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

          {!isWin && <Box sx={{ flexGrow: 1 }} />}

          {/* Windows actions stay left; macOS/browser actions stay right. */}
          <Box
            sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5,
            flexShrink: 0,
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

            <Tooltip title={petStrings[petLanguage === 'en' ? 'en' : 'zh'][petEnabled ? 'hide' : 'show']}>
              <IconButton color="inherit" size="small" aria-label={petStrings[petLanguage === 'en' ? 'en' : 'zh'][petEnabled ? 'hide' : 'show']} aria-pressed={petEnabled} onClick={() => updatePet({ enabled: !petEnabled })}>
                <PetsIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title={agentMode ? t('agentChat.switchToStandard') : t('agentChat.switchToAgent')}>
              <IconButton color="inherit" size="small" aria-label={agentMode ? t('agentChat.switchToStandard') : t('agentChat.switchToAgent')} onClick={() => setAgentMode(!agentMode)}>
                {agentMode ? <GridViewIcon /> : <SmartToyIcon />}
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
          {isWin && <Box sx={{ flexGrow: 1 }} />}
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

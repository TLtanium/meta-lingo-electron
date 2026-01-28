import { useState, useCallback } from 'react'
import { Box } from '@mui/material'
import AppHeader from './components/Layout/AppHeader'
import TabManager from './components/Layout/TabManager'
import StartupScreen from './components/StartupScreen'

function App() {
  const [isReady, setIsReady] = useState(false)

  const handleReady = useCallback(() => {
    setIsReady(true)
  }, [])

  // 显示启动画面直到后端就绪
  if (!isReady) {
    return <StartupScreen onReady={handleReady} />
  }

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default'
      }}
    >
      {/* App header with dictionary search */}
      <AppHeader />

      {/* Tab manager - browser-like tabs, includes GDUFS watermark */}
      <TabManager />
    </Box>
  )
}

export default App


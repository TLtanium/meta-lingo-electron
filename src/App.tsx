import { useState, useCallback, useEffect } from 'react'
import { Box } from '@mui/material'
import AppHeader from './components/Layout/AppHeader'
import TabManager from './components/Layout/TabManager'
import StartupScreen from './components/StartupScreen'
import { AgentChatView } from './components/AgentChat'
import ErrorBoundary from './components/Common/ErrorBoundary'
import { useSettingsStore } from './stores/settingsStore'
import PetHost from './pet/PetHost'

function App() {
  const [isReady, setIsReady] = useState(false)
  const [startupVisible, setStartupVisible] = useState(true)
  const agentMode = useSettingsStore((s) => s.agentMode)

  const handleReady = useCallback(() => {
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (!isReady) return
    const timer = setTimeout(() => setStartupVisible(false), 300)
    return () => clearTimeout(timer)
  }, [isReady])

  return <>
    {isReady && (
    <Box
      className="app-workspace-enter"
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default'
      }}
    >
      <AppHeader />
      <PetHost />

      {/* TabManager stays mounted (display:none) to preserve state.
          Per-tab boundaries live inside TabManager itself (a crash in one tab's page
          only replaces that tab); this outer boundary is a backstop for the tab bar
          chrome around them, so it never takes down the header too. */}
      <Box sx={{ display: agentMode ? 'none' : 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
        <ErrorBoundary>
          <TabManager />
        </ErrorBoundary>
      </Box>

      {/* Agent Chat view */}
      {agentMode && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <ErrorBoundary>
            <AgentChatView />
          </ErrorBoundary>
        </Box>
      )}
    </Box>
    )}
    {startupVisible && <StartupScreen onReady={handleReady} leaving={isReady} />}
  </>
}

export default App


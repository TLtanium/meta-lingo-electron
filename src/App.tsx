import { useState, useCallback } from 'react'
import { Box } from '@mui/material'
import AppHeader from './components/Layout/AppHeader'
import TabManager from './components/Layout/TabManager'
import StartupScreen from './components/StartupScreen'
import { AgentChatView } from './components/AgentChat'
import ErrorBoundary from './components/Common/ErrorBoundary'
import { useSettingsStore } from './stores/settingsStore'

function App() {
  const [isReady, setIsReady] = useState(false)
  const agentMode = useSettingsStore((s) => s.agentMode)

  const handleReady = useCallback(() => {
    setIsReady(true)
  }, [])

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
      <AppHeader />

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
  )
}

export default App


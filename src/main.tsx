import React from 'react'
import ReactDOM from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { ThemeProvider, CssBaseline, Box, Typography, Button } from '@mui/material'
import App from './App'
import { theme, darkTheme } from './styles/theme'
import { useSettingsStore } from './stores/settingsStore'
import ErrorBoundary from './components/Common/ErrorBoundary'
import './i18n'

// Global error state for non-React errors
let globalErrorMessage: string | null = null
let globalErrorStack: string | null = null

// Global error handlers for uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', message, source, lineno, colno, error)
  globalErrorMessage = String(message)
  globalErrorStack = error?.stack || `at ${source}:${lineno}:${colno}`
  // Force re-render by updating DOM directly if React hasn't mounted yet
  const errorDiv = document.getElementById('global-error-display')
  if (errorDiv) {
    errorDiv.innerHTML = `
      <div style="padding: 20px; font-family: monospace; background: #fee; border: 1px solid #f00; margin: 20px; border-radius: 8px;">
        <h3 style="color: #c00; margin: 0 0 10px;">Global Error</h3>
        <p style="margin: 0 0 10px;"><strong>${globalErrorMessage}</strong></p>
        <pre style="background: #fff; padding: 10px; overflow: auto; max-height: 200px; font-size: 11px;">${globalErrorStack}</pre>
        <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">Reload</button>
      </div>
    `
    errorDiv.style.display = 'block'
  }
  return false
}

window.onunhandledrejection = (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
  const error = event.reason
  globalErrorMessage = error?.message || String(error)
  globalErrorStack = error?.stack || 'No stack trace available'
  const errorDiv = document.getElementById('global-error-display')
  if (errorDiv) {
    errorDiv.innerHTML = `
      <div style="padding: 20px; font-family: monospace; background: #fee; border: 1px solid #f00; margin: 20px; border-radius: 8px;">
        <h3 style="color: #c00; margin: 0 0 10px;">Unhandled Promise Rejection</h3>
        <p style="margin: 0 0 10px;"><strong>${globalErrorMessage}</strong></p>
        <pre style="background: #fff; padding: 10px; overflow: auto; max-height: 200px; font-size: 11px;">${globalErrorStack}</pre>
        <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">Reload</button>
      </div>
    `
    errorDiv.style.display = 'block'
  }
}

// Create global error display container
const errorContainer = document.createElement('div')
errorContainer.id = 'global-error-display'
errorContainer.style.display = 'none'
errorContainer.style.position = 'fixed'
errorContainer.style.top = '0'
errorContainer.style.left = '0'
errorContainer.style.right = '0'
errorContainer.style.zIndex = '99999'
errorContainer.style.background = 'white'
document.body.appendChild(errorContainer)

// Last-resort fallback for the top-level ErrorBoundary — anything that escapes
// a more specific boundary (e.g. TabManager's per-tab ones; see
// components/Common/ErrorBoundary.tsx) ends up here, so the whole app is
// replaced. Kept as a safety net; per-tab crashes should no longer reach it.
//
// IMPORTANT: this must be mounted as a real component (JSX `<AppErrorFallback/>`),
// never called as a plain function — ErrorBoundary's `fallback` prop runs inside a
// CLASS component's render(), which has no hook dispatcher; calling a function that
// uses useTranslation() directly there throws "Invalid hook call". JSX composition
// gives React its own fiber for this component, where hooks work normally.
function AppErrorFallback({
  error,
  errorInfo,
  onReload
}: {
  error: Error
  errorInfo: React.ErrorInfo | null
  onReload: () => void
}) {
  const { t } = useTranslation()
  return (
    <Box sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" color="error" gutterBottom>
        {t('errorBoundary.appTitle')}
      </Typography>
      <Typography variant="body1" sx={{ mb: 2 }}>
        {t('errorBoundary.appMessage')}
      </Typography>
      <Box sx={{
        p: 2,
        mb: 2,
        bgcolor: 'grey.100',
        borderRadius: 1,
        fontFamily: 'monospace',
        fontSize: 12,
        overflow: 'auto',
        maxHeight: 200
      }}>
        <strong>Error:</strong> {error.message}
        {error.stack && (
          <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error.stack}
          </pre>
        )}
      </Box>
      {errorInfo?.componentStack && (
        <Box sx={{
          p: 2,
          mb: 2,
          bgcolor: 'grey.100',
          borderRadius: 1,
          fontFamily: 'monospace',
          fontSize: 11,
          overflow: 'auto',
          maxHeight: 150
        }}>
          <strong>Component Stack:</strong>
          <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
            {errorInfo.componentStack}
          </pre>
        </Box>
      )}
      <Button variant="contained" onClick={onReload}>
        {t('errorBoundary.reload')}
      </Button>
    </Box>
  )
}

function Root() {
  const { darkMode } = useSettingsStore()

  return (
    <ThemeProvider theme={darkMode ? darkTheme : theme}>
      <CssBaseline />
      <ErrorBoundary
        fallback={(error, _reset, errorInfo) => (
          <AppErrorFallback error={error} errorInfo={errorInfo} onReload={() => window.location.reload()} />
        )}
      >
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)


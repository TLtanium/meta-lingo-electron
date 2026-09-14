/**
 * ErrorBoundary — reusable React error boundary.
 *
 * Why this exists (v4.9.40): a runtime error anywhere in the component tree
 * (e.g. an API response resolving with `data: undefined` during the ~1-2s
 * window while the Electron backend process restarts on relaunch, then a
 * child component calling `.some()`/`.map()`/… on that undefined value with
 * no guard) used to be caught only by the single top-level boundary in
 * `main.tsx` — which replaces the ENTIRE app with an error screen. One
 * broken panel in one tab took down every other open tab too.
 *
 * This component is used at TWO levels now:
 * - `main.tsx`: unchanged behaviour, last-resort catch-all for anything that
 *   escapes a more specific boundary (e.g. errors in the tab bar itself).
 * - `TabManager.tsx`: one boundary PER TAB, keyed by `tab.id`. A crash in one
 *   tab's page only replaces that tab's content with a small inline fallback
 *   (with Retry / Close Tab actions) — every other tab, the tab bar, and the
 *   header keep working.
 *
 * This does not replace fixing the underlying null-safety bugs (still worth
 * doing case by case) — it's the backstop so that *whatever* future bug of
 * this shape slips through, in *any* module, it can only ever take down the
 * one panel it happened in, never the whole app.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Typography, Button, Stack } from '@mui/material'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import RefreshIcon from '@mui/icons-material/Refresh'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Custom fallback renderer. Receives the caught error, a reset() to clear it and re-render children, and React's componentStack info. */
  fallback?: (error: Error, reset: () => void, errorInfo: ErrorInfo | null) => ReactNode
  /** Called (in addition to internal reset) when the user clicks Retry. */
  onReset?: () => void
  /** Called when a child throws — for logging/telemetry. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null })
    this.props.onReset?.()
  }

  render() {
    const { error } = this.state
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset, this.state.errorInfo)
      }
      return <DefaultFallback error={error} errorInfo={this.state.errorInfo} onReset={this.reset} />
    }
    return this.props.children
  }
}

/**
 * Compact default fallback (used when no custom `fallback` render-prop is given).
 * Kept dependency-light (no i18n) so it never itself fails to render.
 */
function DefaultFallback({
  error,
  errorInfo,
  onReset
}: {
  error: Error
  errorInfo: ErrorInfo | null
  onReset: () => void
}) {
  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <ErrorOutlineIcon color="error" />
        <Typography variant="h6" color="error">
          Something went wrong
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This panel failed to render. You can retry below.
      </Typography>
      <Box
        sx={{
          p: 2,
          mb: 2,
          bgcolor: 'action.hover',
          borderRadius: 1,
          fontFamily: 'monospace',
          fontSize: 12,
          overflow: 'auto',
          maxHeight: 200
        }}
      >
        <strong>{error.message}</strong>
        {errorInfo?.componentStack && (
          <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {errorInfo.componentStack}
          </pre>
        )}
      </Box>
      <Button variant="contained" startIcon={<RefreshIcon />} onClick={onReset}>
        Retry
      </Button>
    </Box>
  )
}

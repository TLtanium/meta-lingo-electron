import { useState, useEffect } from 'react'
import {
  Paper,
  Typography,
  Box,
  Stack,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  Chip,
  IconButton,
  Tooltip,
  Snackbar,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import DeviceHubIcon from '@mui/icons-material/DeviceHub'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DownloadIcon from '@mui/icons-material/Download'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useTranslation } from 'react-i18next'
import apiClient from '../../api/client'

interface MCPConfigInfo {
  enabled: boolean
  is_packaged: boolean
  backend_url: string
  stdio_snippet: Record<string, unknown>
  http_url: string
  tool_count: number
  has_extension: boolean
}

export default function MCPServerSettings() {
  const { t } = useTranslation()

  const [configInfo, setConfigInfo] = useState<MCPConfigInfo | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  // 是否在 Electron 里跑（原生窗口下载会被拦截，改走 shell.openPath；纯浏览器开发调试时仍走下载兜底）
  const hasElectronBridge = typeof window !== 'undefined' && !!window.electronAPI?.openMcpExtension
  const [installState, setInstallState] = useState<'idle' | 'opening' | 'done' | 'error'>('idle')
  const [installError, setInstallError] = useState<string | null>(null)
  // Electron 侧的文件存在性检查优先于后端 has_extension（同一份判断，Electron 环境下更贴近实际点击行为）
  const [extensionExistsElectron, setExtensionExistsElectron] = useState<boolean | null>(null)

  useEffect(() => {
    loadConfigInfo()
    if (window.electronAPI?.getMcpExtensionInfo) {
      window.electronAPI.getMcpExtensionInfo()
        .then((info: { path: string; exists: boolean }) => setExtensionExistsElectron(info.exists))
        .catch(() => setExtensionExistsElectron(null))
    }
  }, [])

  useEffect(() => {
    // After factory reset, this component needs to re-fetch MCP settings.
    const handler = () => {
      loadConfigInfo()
    }
    window.addEventListener('meta-lingo:settings-reset-completed', handler)
    return () => window.removeEventListener('meta-lingo:settings-reset-completed', handler)
  }, [])

  const loadConfigInfo = async () => {
    try {
      const response = await apiClient.get('/api/mcp/config-info')
      if (response.data.success) {
        setConfigInfo(response.data.data)
        setEnabled(response.data.data.enabled)
      }
    } catch (err) {
      console.error('Error loading MCP config:', err)
      setError(t('settings.mcp.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (newEnabled: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const response = await apiClient.put('/api/mcp/settings', { enabled: newEnabled })
      if (response.data.success) {
        setEnabled(newEnabled)
        if (configInfo) {
          setConfigInfo({ ...configInfo, enabled: newEnabled })
        }
      }
    } catch (err) {
      console.error('Error updating MCP settings:', err)
      setError(t('settings.mcp.saveError'))
    } finally {
      setSaving(false)
    }
  }

  // 主路径：在 Electron 里让系统默认程序（关联了 .mcpb 的 Claude Desktop）直接打开扩展文件，
  // 弹出安装确认框——原生窗口点 <a download> 会被拦截/静默失败，同 LEOX 遇到的问题。
  const handleInstallExtension = async () => {
    if (!window.electronAPI?.openMcpExtension) {
      // 非 Electron 环境（纯浏览器开发调试）：退回下载
      return handleDownloadFallback()
    }
    setInstallState('opening')
    setInstallError(null)
    try {
      const result = await window.electronAPI.openMcpExtension()
      if (result.success) {
        setInstallState('done')
      } else {
        setInstallState('error')
        setInstallError(result.error || t('settings.mcp.installFailed'))
      }
    } catch (err) {
      setInstallState('error')
      setInstallError(err instanceof Error ? err.message : t('settings.mcp.installFailed'))
    }
  }

  // 兜底：非 Electron 环境下走浏览器标准下载
  const handleDownloadFallback = async () => {
    try {
      const url = `${configInfo?.backend_url || 'http://127.0.0.1:8000'}/api/mcp/download-extension`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = 'meta-lingo-mcp.mcpb'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('Failed to download extension:', err)
      setError(t('settings.mcp.loadError'))
    }
  }

  const handleCopyConfig = async () => {
    if (!configInfo) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(configInfo.stdio_snippet, null, 2))
      setSnackbarOpen(true)
    } catch {
      setError(t('settings.mcp.copyFailed'))
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <DeviceHubIcon color="primary" />
        <Typography variant="h6">
          {t('settings.mcp.title')}
        </Typography>
        {configInfo && (
          <Chip
            size="small"
            label={t('settings.mcp.toolCount', { count: configInfo.tool_count })}
            color="primary"
            variant="outlined"
            sx={{ height: 22 }}
          />
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('settings.mcp.description')}
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {t('common.loading')}
          </Typography>
        </Box>
      ) : (
        <>
          {/* Enable/Disable Toggle */}
          <Box
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: enabled ? 'primary.main' : 'divider',
              borderRadius: 1,
              bgcolor: enabled ? 'action.selected' : 'transparent',
              transition: 'all 0.2s ease',
              mb: 2,
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(e) => handleToggle(e.target.checked)}
                  disabled={saving}
                />
              }
              label={
                <Box sx={{ ml: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle1" fontWeight={500}>
                      {t('settings.mcp.enabled')}
                    </Typography>
                    <Chip
                      size="small"
                      icon={enabled ? <CheckCircleIcon /> : undefined}
                      label={enabled ? t('settings.mcp.statusReady') : t('settings.mcp.statusDisabled')}
                      color={enabled ? 'success' : 'default'}
                      variant="outlined"
                      sx={{ height: 22 }}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {t('settings.mcp.enabledDesc')}
                  </Typography>
                </Box>
              }
              sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
            />
          </Box>

          {/* Actions - only when enabled */}
          {enabled && configInfo && (() => {
            // Electron 环境下以 shell 实际检测到的文件存在性为准；非 Electron（浏览器调试）用后端字段
            const extensionExists = hasElectronBridge ? (extensionExistsElectron ?? configInfo.has_extension) : configInfo.has_extension
            return (
            <Stack spacing={1.5}>
              {/* Install / Download Extension */}
              <Box>
                <Button
                  variant="contained"
                  onClick={handleInstallExtension}
                  disabled={!extensionExists || installState === 'opening'}
                  fullWidth
                  sx={{ textTransform: 'none', py: 1.2 }}
                  startIcon={<DownloadIcon />}
                >
                  {installState === 'opening'
                    ? t('settings.mcp.installOpening')
                    : installState === 'done'
                      ? t('settings.mcp.installDone')
                      : t(hasElectronBridge ? 'settings.mcp.installExtension' : 'settings.mcp.downloadExtension')}
                </Button>
                {extensionExists ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 0.5 }}>
                    {t(hasElectronBridge ? 'settings.mcp.installExtensionHint' : 'settings.mcp.downloadExtensionHint')}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 0.5 }}>
                    {t('settings.mcp.extensionNotBuilt')}
                  </Typography>
                )}
                {installState === 'error' && installError && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5, px: 0.5 }}>
                    {installError}
                  </Typography>
                )}
              </Box>

              {/* Manual Config - Collapsible */}
              <Accordion
                disableGutters
                elevation={0}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '8px !important',
                  '&:before': { display: 'none' },
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>
                  <Typography variant="subtitle2" fontWeight={500}>
                    {t('settings.mcp.manualConfig')}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {t('settings.mcp.manualConfigHint')}
                  </Typography>
                  <Box sx={{ position: 'relative' }}>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: 'grey.50',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {JSON.stringify(configInfo.stdio_snippet, null, 2)}
                    </Box>
                    <Tooltip title={t('settings.mcp.copyConfig')}>
                      <IconButton
                        size="small"
                        onClick={handleCopyConfig}
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          bgcolor: 'background.paper',
                          '&:hover': { bgcolor: 'grey.200' },
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Stack>
            )
          })()}
        </>
      )}

      {/* Saving indicator */}
      {saving && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {t('common.saving')}
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSnackbarOpen(false)}>
          {t('settings.mcp.copiedConfig')}
        </Alert>
      </Snackbar>
    </Paper>
  )
}

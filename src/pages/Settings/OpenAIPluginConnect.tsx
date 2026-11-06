import { useEffect, useState } from 'react'
import { Alert, Box, Button, Typography } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import { useTranslation } from 'react-i18next'
import type { OpenAIPluginInfo, OpenAIPluginResult } from '../../../electron/openaiPlugin'
import { connectOpenAIPlugin, getOpenAIConnectionInfo } from '../../api/openaiPlugin'

export default function OpenAIPluginConnect() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<OpenAIPluginInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<OpenAIPluginResult | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => {
    let active = true
    getOpenAIConnectionInfo().then(value => { if (active) setInfo(value) })
      .catch(() => { if (active) setLoadFailed(true) })
    return () => { active = false }
  }, [])

  const open = async () => {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      setResult(await connectOpenAIPlugin())
    } catch {
      setResult({ success: false, errorCode: 'openFailed' })
    } finally {
      setBusy(false)
    }
  }
  const unavailable = loadFailed ? 'loadFailed' : info?.reason
  return (
    <Box>
      <Button fullWidth variant="contained" startIcon={<DownloadIcon />} onClick={open}
        disabled={!info?.ready || busy} sx={{ textTransform: 'none', py: 1.2 }}>
        {t(`settings.mcp.openai.${busy ? 'opening' : 'install'}`)}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 0.5 }}>
        {t('settings.mcp.openai.hint')}
      </Typography>
      {unavailable && <Alert severity="info" sx={{ mt: 1 }}>{t(`settings.mcp.openai.${unavailable}`)}</Alert>}
      {result && <Alert severity={result.success ? 'info' : 'error'} sx={{ mt: 1 }}>
        {t(`settings.mcp.openai.${result.success ? 'opened' : result.errorCode || 'openFailed'}`)}
      </Alert>}
      {result?.link && <Button component="a" href={result.link} sx={{ mt: 0.5 }}>
        {t('settings.mcp.openai.reopen')}
      </Button>}
    </Box>
  )
}

import { useState } from 'react'
import {
  Paper,
  Typography,
  Button,
  Box,
  Alert,
  Snackbar,
  IconButton,
  Tooltip
} from '@mui/material'
import { Article as ArticleIcon, ContentCopy as ContentCopyIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import LicenseDialog from '../../components/Settings/LicenseDialog'

const CITATION_TEXT = `Leo, T. (2026).
Meta-Lingo: A Corpus-Based Platform for Linguistic and Discourse Analysis.
Software.`

export default function LicenseViewer() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [licenseText, setLicenseText] = useState('')
  const [error, setError] = useState('')
  const [snackbarOpen, setSnackbarOpen] = useState(false)

  const handleOpen = async () => {
    setError('')
    try {
      // 根据当前语言选择对应的许可证文件
      const fileName = i18n.language === 'zh' ? 'LICENSE_CN.txt' : 'LICENSE_EN.txt'
      // 使用相对路径 ./ 而不是绝对路径 /，以兼容 Electron 打包后的 file:// 协议
      const response = await fetch(`./${fileName}`)
      
      if (!response.ok) {
        throw new Error(`Failed to load license: ${response.statusText}`)
      }
      
      const text = await response.text()
      setLicenseText(text)
      setOpen(true)
    } catch (err) {
      console.error('Failed to load license:', err)
      setError(err instanceof Error ? err.message : 'Failed to load license')
    }
  }

  const handleClose = () => {
    setOpen(false)
  }

  const handleCopyCitation = async () => {
    try {
      await navigator.clipboard.writeText(CITATION_TEXT)
      setSnackbarOpen(true)
    } catch {
      setError(t('settings.copyCitationFailed', 'Failed to copy to clipboard'))
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ArticleIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>
            {t('settings.license')}
          </Typography>
        </Box>
        <Tooltip title={t('settings.copyCitation')}>
          <IconButton color="primary" onClick={handleCopyCitation} size="small" aria-label={t('settings.copyCitation')}>
            <ContentCopyIcon />
          </IconButton>
        </Tooltip>
      </Box>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('settings.licenseDescription')}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Button
        variant="outlined"
        color="primary"
        startIcon={<ArticleIcon />}
        onClick={handleOpen}
      >
        {t('settings.viewLicense')}
      </Button>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSnackbarOpen(false)}>
          {t('settings.citationCopied')}
        </Alert>
      </Snackbar>

      <LicenseDialog
        open={open}
        onClose={handleClose}
        licenseText={licenseText}
      />
    </Paper>
  )
}

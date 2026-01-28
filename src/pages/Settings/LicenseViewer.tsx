import { useState } from 'react'
import {
  Paper,
  Typography,
  Button,
  Box,
  Alert
} from '@mui/material'
import { Article as ArticleIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import LicenseDialog from '../../components/Settings/LicenseDialog'

export default function LicenseViewer() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [licenseText, setLicenseText] = useState('')
  const [error, setError] = useState('')

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

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <ArticleIcon color="primary" />
        <Typography variant="h6" fontWeight={600}>
          {t('settings.license')}
        </Typography>
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

      <LicenseDialog
        open={open}
        onClose={handleClose}
        licenseText={licenseText}
      />
    </Paper>
  )
}

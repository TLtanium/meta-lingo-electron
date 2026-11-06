import { useState } from 'react'
import {
  Paper,
  Typography,
  Button,
  Box,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
  Link,
  Stack,
  CircularProgress
} from '@mui/material'
import { Article as ArticleIcon, ContentCopy as ContentCopyIcon, Description as DescriptionIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import LicenseDialog from '../../components/Settings/LicenseDialog'

const DOI_URL = 'https://doi.org/10.5281/zenodo.20091931'

const CITATION_VERSION = 'v4.9.74'
const CITATION_TEXT = `Tommy Leo. (2026). TLtanium/meta-lingo-electron: Meta-Lingo ${CITATION_VERSION} (${CITATION_VERSION}). Zenodo. ${DOI_URL}`

export default function LicenseViewer() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [licenseText, setLicenseText] = useState('')
  const [error, setError] = useState('')
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [documentKind, setDocumentKind] = useState<'license' | 'thirdParty'>('license')
  const [loading, setLoading] = useState<'license' | 'thirdParty' | null>(null)

  const handleOpen = async (kind: 'license' | 'thirdParty') => {
    setError('')
    setLoading(kind)
    try {
      // Relative assets work in both Vite and packaged file:// windows.
      const fileName = kind === 'license' ? 'AGPL-3.0.txt' : 'THIRD-PARTY-NOTICES.txt'
      const response = await fetch(`./licenses/${fileName}`, { cache: 'no-store' })

      if (!response.ok) {
        throw new Error(`Failed to load license: ${response.statusText}`)
      }

      const text = await response.text()
      if (!text.includes(kind === 'license' ? 'GNU AFFERO GENERAL PUBLIC LICENSE' : 'Third-party notices collected')) {
        throw new Error('License asset is missing or invalid')
      }
      setLicenseText(text)
      setDocumentKind(kind)
      setOpen(true)
    } catch (err) {
      console.error('Failed to load license:', err)
      setError(t('settings.licenseLoadFailed'))
    } finally {
      setLoading(null)
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

      <Link href="https://github.com/TLtanium/meta-lingo-electron" target="_blank" rel="noopener noreferrer" sx={{ display: 'block', mb: 2 }}>
        {t('resources.source')}
      </Link>
      {/* Citation block */}
      <Box
        sx={{
          bgcolor: 'action.hover',
          borderRadius: 1,
          px: 2,
          py: 1.5,
          mb: 2,
          borderLeft: 4,
          borderColor: 'primary.main',
        }}
      >
        <Typography variant="body2" sx={{ fontFamily: 'monospace', lineHeight: 1.8 }}>
          Tommy Leo. (2026). <em>TLtanium/meta-lingo-electron: Meta-Lingo {CITATION_VERSION} ({CITATION_VERSION}).</em> Zenodo.{' '}
          <Link
            href={DOI_URL}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{ wordBreak: 'break-all' }}
          >
            {DOI_URL}
          </Link>
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button variant="outlined" color="primary" disabled={loading !== null}
          startIcon={loading === 'license' ? <CircularProgress size={18} /> : <ArticleIcon />}
          onClick={() => void handleOpen('license')}>
          {t('settings.viewLicense')}
        </Button>
        <Button variant="outlined" color="primary" disabled={loading !== null}
          startIcon={loading === 'thirdParty' ? <CircularProgress size={18} /> : <DescriptionIcon />}
          onClick={() => void handleOpen('thirdParty')}>
          {t('settings.openSourceLicenses')}
        </Button>
      </Stack>

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
        title={documentKind === 'thirdParty' ? t('settings.openSourceLicenses') : undefined}
        showTranslationLink={documentKind === 'license'}
      />
    </Paper>
  )
}

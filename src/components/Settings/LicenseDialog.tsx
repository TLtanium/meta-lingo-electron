import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  Link
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'

interface LicenseDialogProps {
  open: boolean
  onClose: () => void
  licenseText: string
  title?: string
  showTranslationLink?: boolean
}

export default function LicenseDialog({ open, onClose, licenseText, title, showTranslationLink = false }: LicenseDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '80vh'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title || t('settings.licenseTitle')}
        <IconButton
          edge="end"
          color="inherit"
          onClick={onClose}
          aria-label={t('settings.closeLicense')}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            overflowWrap: 'anywhere',
            color: 'text.primary'
          }}
        >
          {licenseText}
        </Box>
      </DialogContent>
      <DialogActions>
        {showTranslationLink && <Link href="https://www.openatom.org/journalism/detail/3N0zX9I7fX4u"
          target="_blank" rel="noopener noreferrer" variant="body2" sx={{ mr: 'auto', ml: 1 }}>
          {t('settings.licenseChineseReference')}
        </Link>}
        <Button onClick={onClose} variant="contained">
          {t('settings.closeLicense')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

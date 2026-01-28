import { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import StorageIcon from '@mui/icons-material/Storage'
import FolderDeleteIcon from '@mui/icons-material/FolderDelete'
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { frameworkApi } from '../../api/framework'

export default function FactoryReset() {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // Reset options
  const [resetDatabase, setResetDatabase] = useState(true)
  const [resetCorpora, setResetCorpora] = useState(true)
  const [resetAnnotations, setResetAnnotations] = useState(true)
  const [resetFrameworks, setResetFrameworks] = useState(true)

  const handleOpenDialog = () => {
    setDialogOpen(true)
    setConfirmText('')
    setResult(null)
  }

  const handleCloseDialog = () => {
    if (!isResetting) {
      setDialogOpen(false)
      setConfirmText('')
    }
  }

  const handleReset = async () => {
    if (confirmText !== 'RESET') return
    
    setIsResetting(true)
    setResult(null)

    const results: string[] = []
    let hasError = false

    try {
      // Reset frameworks first (if selected)
      if (resetFrameworks) {
        try {
          const fwResponse = await frameworkApi.reset()
          if (fwResponse.data?.success) {
            results.push(fwResponse.data.message || t('settings.frameworksReset'))
          } else {
            hasError = true
            results.push(t('settings.frameworkResetFailed'))
          }
        } catch (e) {
          hasError = true
          results.push(`${t('settings.frameworkResetFailed')}: ${e}`)
        }
      }

      // Reset other data (including topic modeling, Word2Vec, USAS)
      // Always reset all data types to match packaging script behavior
        const response = await api.post<{ success: boolean; message: string }>(
          '/api/corpus/factory-reset',
          {
            resetDatabase,
            resetCorpora,
          resetAnnotations,
          resetTopicModeling: true,  // Always reset topic modeling data
          resetWord2Vec: true,      // Always reset Word2Vec models
          resetUSAS: true           // Always reset USAS settings
          }
        )

        if (response.success && response.data) {
          const data = response.data as any
          if (data.success !== undefined) {
            results.push(data.message || t('settings.dataResetCompleted'))
          } else {
            results.push(t('settings.dataResetCompleted'))
          }
        } else {
          hasError = true
          results.push(response.error || t('settings.dataResetFailed'))
      }

      setResult({ 
        success: !hasError, 
        message: results.join('; ') || t('settings.factoryResetCompleted')
      })
    } catch (error) {
      setResult({ success: false, message: `${t('settings.resetFailed')}: ${error}` })
    }

    setIsResetting(false)
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SettingsBackupRestoreIcon color="error" />
        <Typography variant="h6" fontWeight={600}>
          {t('settings.factoryReset')}
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('settings.factoryResetDescription')}
      </Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        {t('settings.factoryResetWarning')}
      </Alert>

      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteForeverIcon />}
        onClick={handleOpenDialog}
      >
        {t('settings.factoryReset')}
      </Button>

      {/* Confirmation Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <WarningAmberIcon />
          {t('settings.confirmFactoryReset')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('settings.factoryResetConfirmText')}
          </DialogContentText>

          <List dense>
            <ListItem>
              <ListItemIcon>
                <Checkbox
                  checked={resetDatabase}
                  onChange={(e) => setResetDatabase(e.target.checked)}
                  disabled={isResetting}
                />
              </ListItemIcon>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <StorageIcon color="action" />
              </ListItemIcon>
              <ListItemText 
                primary={t('settings.databaseRecords')} 
                secondary={t('settings.databaseRecordsDesc')}
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Checkbox
                  checked={resetCorpora}
                  onChange={(e) => setResetCorpora(e.target.checked)}
                  disabled={isResetting}
                />
              </ListItemIcon>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <FolderDeleteIcon color="action" />
              </ListItemIcon>
              <ListItemText 
                primary={t('settings.corpusFiles')} 
                secondary={t('settings.corpusFilesDesc')}
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Checkbox
                  checked={resetAnnotations}
                  onChange={(e) => setResetAnnotations(e.target.checked)}
                  disabled={isResetting}
                />
              </ListItemIcon>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <DeleteForeverIcon color="action" />
              </ListItemIcon>
              <ListItemText 
                primary={t('settings.annotationArchives')} 
                secondary={t('settings.annotationArchivesDesc')}
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Checkbox
                  checked={resetFrameworks}
                  onChange={(e) => setResetFrameworks(e.target.checked)}
                  disabled={isResetting}
                />
              </ListItemIcon>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <AccountTreeIcon color="action" />
              </ListItemIcon>
              <ListItemText 
                primary={t('settings.annotationFrameworks')} 
                secondary={t('settings.annotationFrameworksDesc')}
              />
            </ListItem>
          </List>

          <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
            {t('settings.typeResetToConfirm')}
          </Alert>

          <Box
            component="input"
            sx={{
              width: '100%',
              p: 1.5,
              fontSize: '1rem',
              border: '2px solid',
              borderColor: confirmText === 'RESET' ? 'success.main' : 'grey.300',
              borderRadius: 1,
              outline: 'none',
              '&:focus': {
                borderColor: 'primary.main'
              }
            }}
            placeholder={t('settings.typeResetPlaceholder')}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            disabled={isResetting}
          />

          {result && (
            <Alert severity={result.success ? 'success' : 'error'} sx={{ mt: 2 }}>
              {result.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={isResetting}>
            {t('settings.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleReset}
            disabled={confirmText !== 'RESET' || isResetting || (!resetDatabase && !resetCorpora && !resetAnnotations && !resetFrameworks)}
            startIcon={isResetting ? <CircularProgress size={20} color="inherit" /> : <DeleteForeverIcon />}
          >
            {isResetting ? t('settings.resetting') : t('settings.confirmReset')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}



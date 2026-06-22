/**
 * Shared "Import bundle" button for corpora / bibliographic libraries. Picks a .zip migration
 * bundle, uploads it via the supplied `onImport` function, shows a result snackbar, and calls
 * `onImported` so the caller can refresh its list.
 *
 * Used by both Corpus Management and Bibliographic Visualization for a consistent UX.
 */

import { useRef, useState } from 'react'
import { Button, Snackbar, Alert, CircularProgress } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useTranslation } from 'react-i18next'

export interface BundleImportResult {
  success: boolean
  message?: string
  imported_corpora?: { name: string; id: string }[]
  imported_libraries?: { name: string; id: string }[]
}

interface ImportBundleButtonProps {
  onImport: (file: File) => Promise<BundleImportResult>
  onImported: () => void
}

export default function ImportBundleButton({ onImport, onImported }: ImportBundleButtonProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [snack, setSnack] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({
    open: false,
    severity: 'success',
    message: '',
  })

  const handlePick = () => inputRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return

    setImporting(true)
    const result = await onImport(file)
    setImporting(false)

    if (!result.success) {
      const code = result.message || ''
      let msg = t('migration.importFailed')
      if (code === 'INVALID_BUNDLE') msg = t('migration.invalidBundle')
      else if (code.startsWith('BUNDLE_KIND_MISMATCH')) msg = t('migration.kindMismatch')
      else if (code) msg = code
      setSnack({ open: true, severity: 'error', message: msg })
      return
    }

    const names = [
      ...(result.imported_corpora || []).map(c => c.name),
      ...(result.imported_libraries || []).map(l => l.name),
    ]
    setSnack({
      open: true,
      severity: 'success',
      message: t('migration.importSuccess', { count: names.length, names: names.join(', ') }),
    })
    onImported()
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".zip" hidden onChange={handleFile} />
      <Button
        variant="outlined"
        startIcon={importing ? <CircularProgress size={16} /> : <UploadFileIcon />}
        onClick={handlePick}
        disabled={importing}
      >
        {importing ? t('migration.importing') : t('migration.import')}
      </Button>
      <Snackbar
        open={snack.open}
        autoHideDuration={6000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack(s => ({ ...s, open: false }))} variant="filled">
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}

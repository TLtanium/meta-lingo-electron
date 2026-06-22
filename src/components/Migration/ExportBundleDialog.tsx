/**
 * Shared dialog for exporting a batch of corpora / bibliographic libraries as a .zip
 * migration bundle. Lists selectable items with a select-all control, then downloads the
 * bundle produced by the supplied `onExport` function.
 *
 * Used by both Corpus Management and Bibliographic Visualization for a consistent UX.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Alert,
  Box,
  CircularProgress,
} from '@mui/material'
import ArchiveIcon from '@mui/icons-material/Archive'
import { useTranslation } from 'react-i18next'

export interface ExportableItem {
  id: string
  name: string
  subtitle?: string
}

export type BundleExportFn = (
  ids: string[]
) => Promise<{ success: boolean; blob?: Blob; filename?: string; message?: string }>

interface ExportBundleDialogProps {
  open: boolean
  onClose: () => void
  title: string
  items: ExportableItem[]
  onExport: BundleExportFn
}

export default function ExportBundleDialog({
  open,
  onClose,
  title,
  items,
  onExport,
}: ExportBundleDialogProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelected(new Set(items.map(i => i.id)))
      setError(null)
    }
  }, [open, items])

  const allSelected = items.length > 0 && selected.size === items.length
  const someSelected = selected.size > 0 && !allSelected

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map(i => i.id)))
  }

  const handleExport = async () => {
    if (selected.size === 0) {
      setError(t('migration.noneSelected'))
      return
    }
    setExporting(true)
    setError(null)
    const result = await onExport(Array.from(selected))
    setExporting(false)
    if (!result.success || !result.blob) {
      setError(result.message || t('migration.exportFailed'))
      return
    }
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename || 'metalingo_bundle.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onClose()
  }

  return (
    <Dialog open={open} onClose={exporting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('migration.exportHint')}
        </Typography>
        {items.length === 0 ? (
          <Alert severity="info">{t('migration.nothingToExport')}</Alert>
        ) : (
          <>
            <ListItemButton onClick={toggleAll} dense sx={{ borderRadius: 1 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Checkbox edge="start" checked={allSelected} indeterminate={someSelected} tabIndex={-1} disableRipple />
              </ListItemIcon>
              <ListItemText primary={t('migration.selectAll')} />
            </ListItemButton>
            <List dense sx={{ maxHeight: 320, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, mt: 1 }}>
              {items.map(item => (
                <ListItem key={item.id} disablePadding>
                  <ListItemButton onClick={() => toggle(item.id)} dense>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <Checkbox edge="start" checked={selected.has(item.id)} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText primary={item.name} secondary={item.subtitle} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          startIcon={exporting ? <CircularProgress size={16} /> : <ArchiveIcon />}
          onClick={handleExport}
          disabled={exporting || items.length === 0}
        >
          {exporting
            ? t('migration.exporting')
            : `${t('migration.exportSelected')}${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

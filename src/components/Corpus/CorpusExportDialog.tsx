/**
 * CorpusExportDialog
 *
 * Dialog for selecting export format and annotation types, then downloading
 * the annotated corpus files.
 *
 * Formats:
 *   txt  – word_TAG plain text; one file per annotation type, bundled in zip
 *   json – single JSON file with full annotation metadata
 *   xml  – single XML file converted from the JSON structure
 */

import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stack,
  Chip,
  Tooltip,
  CircularProgress,
  Alert,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import CheckIcon from '@mui/icons-material/Check'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import DataObjectIcon from '@mui/icons-material/DataObject'
import CodeIcon from '@mui/icons-material/Code'
import ArticleIcon from '@mui/icons-material/Article'
import { useTranslation } from 'react-i18next'
import { corpusApi } from '../../api'

// ------------------------------------------------------------------ //
// Annotation type definitions (only used for txt format)
// ------------------------------------------------------------------ //

interface AnnotationType {
  id: string
  group: 'pos' | 'semantics' | 'metaphor'
}

const ANNOTATION_TYPES: AnnotationType[] = [
  { id: 'universal_pos', group: 'pos' },
  { id: 'penn_pos',      group: 'pos' },
  { id: 'lemma',         group: 'pos' },
  { id: 'dep',           group: 'pos' },
  { id: 'usas',          group: 'semantics' },
  { id: 'mipvu',         group: 'metaphor' },
]

type ExportFormat = 'txt' | 'json' | 'xml'

// ------------------------------------------------------------------ //
// Props
// ------------------------------------------------------------------ //

export interface ExportableTextItem {
  id: string
  filename: string
}

interface CorpusExportDialogProps {
  open: boolean
  onClose: () => void
  corpusId: string
  selectedTexts: ExportableTextItem[]
}

// ------------------------------------------------------------------ //
// Component
// ------------------------------------------------------------------ //

export default function CorpusExportDialog({
  open,
  onClose,
  corpusId,
  selectedTexts,
}: CorpusExportDialogProps) {
  const { t } = useTranslation()

  const [format, setFormat] = useState<ExportFormat>('txt')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    new Set(['universal_pos', 'penn_pos', 'usas'])
  )
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- helpers ------------------------------------------------------ //

  const toggleType = (id: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const groupsInOrder: Array<{ key: AnnotationType['group']; labelKey: string }> = [
    { key: 'pos',       labelKey: 'corpus.exportAnnotated.groupPos' },
    { key: 'semantics', labelKey: 'corpus.exportAnnotated.groupSemantics' },
    { key: 'metaphor',  labelKey: 'corpus.exportAnnotated.groupMetaphor' },
  ]

  const canExport =
    format !== 'txt' || selectedTypes.size > 0

  // ---- export ------------------------------------------------------- //

  const handleExport = async () => {
    if (format === 'txt' && selectedTypes.size === 0) {
      setError(t('corpus.exportAnnotated.noTypesSelected'))
      return
    }

    setError(null)
    setExporting(true)

    try {
      const result = await corpusApi.exportAnnotated(
        corpusId,
        selectedTexts.map(item => item.id),
        Array.from(selectedTypes),
        format
      )

      if (!result.success || !result.blob) {
        setError(result.message || t('corpus.exportAnnotated.failed'))
        return
      }

      // Trigger browser / Electron download
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename || `metalingo_export.${format === 'txt' ? 'zip' : format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setExporting(false)
    }
  }

  // ---- render ------------------------------------------------------- //

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('corpus.exportAnnotated.title')}
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {t('corpus.exportAnnotated.description')}
        </Typography>

        {/* ---- Format selector ---- */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {t('corpus.exportAnnotated.format')}
        </Typography>

        <ToggleButtonGroup
          value={format}
          exclusive
          onChange={(_, val) => { if (val) setFormat(val as ExportFormat) }}
          size="small"
          sx={{ mb: 2.5 }}
        >
          <Tooltip title={t('corpus.exportAnnotated.formatTxtDesc')} arrow>
            <ToggleButton value="txt">
              <ArticleIcon fontSize="small" sx={{ mr: 0.5 }} />
              {t('corpus.exportAnnotated.formatTxt')}
            </ToggleButton>
          </Tooltip>
          <Tooltip title={t('corpus.exportAnnotated.formatJsonDesc')} arrow>
            <ToggleButton value="json">
              <DataObjectIcon fontSize="small" sx={{ mr: 0.5 }} />
              {t('corpus.exportAnnotated.formatJson')}
            </ToggleButton>
          </Tooltip>
          <Tooltip title={t('corpus.exportAnnotated.formatXmlDesc')} arrow>
            <ToggleButton value="xml">
              <CodeIcon fontSize="small" sx={{ mr: 0.5 }} />
              {t('corpus.exportAnnotated.formatXml')}
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        {/* ---- Annotation type selector (txt only) ---- */}
        {format === 'txt' && (
          <>
            <Divider sx={{ mb: 2 }} />

            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">
                {t('corpus.exportAnnotated.annotationTypes')}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CheckIcon />}
                  onClick={() => setSelectedTypes(new Set(ANNOTATION_TYPES.map(a => a.id)))}
                >
                  {t('corpus.exportAnnotated.selectAll')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ClearAllIcon />}
                  onClick={() => setSelectedTypes(new Set())}
                >
                  {t('corpus.exportAnnotated.clearAll')}
                </Button>
              </Stack>
            </Stack>

            {groupsInOrder.map(({ key, labelKey }, gIdx) => {
              const groupTypes = ANNOTATION_TYPES.filter(a => a.group === key)
              return (
                <Box key={key} sx={{ mb: 2 }}>
                  {gIdx > 0 && <Box sx={{ mb: 1.5 }} />}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    {t(labelKey)}
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    {groupTypes.map(ann => {
                      const selected = selectedTypes.has(ann.id)
                      return (
                        <Tooltip
                          key={ann.id}
                          title={t(`corpus.exportAnnotated.types.${ann.id}_desc`)}
                          arrow
                        >
                          <Chip
                            label={t(`corpus.exportAnnotated.types.${ann.id}`)}
                            size="small"
                            onClick={() => toggleType(ann.id)}
                            color={selected ? 'primary' : 'default'}
                            variant={selected ? 'filled' : 'outlined'}
                            sx={{ fontSize: '0.8rem', height: 28 }}
                          />
                        </Tooltip>
                      )
                    })}
                  </Stack>
                </Box>
              )
            })}
          </>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
          onClick={handleExport}
          disabled={exporting || !canExport}
        >
          {exporting
            ? t('corpus.exportAnnotated.exporting')
            : t('corpus.exportAnnotated.export')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

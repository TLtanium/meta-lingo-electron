/**
 * Upload Panel for Bibliographic Visualization
 * Corpus-management-style unified flow: pick "create new library" vs "add to
 * existing library" (checkbox + selector, exactly like CorpusManagement's
 * UploadPanel "Target Corpus" section), then drop files and upload in one step
 * — creating the library first if needed. Previously this had two disconnected
 * sections (always-visible "Create Library" form + separate "Upload" form that
 * only worked once a library was already selected), so opening this panel to
 * add more entries to an existing library showed a redundant, blank-looking
 * "Create Library" form above the actual upload area.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Box,
  Typography,
  TextField,
  FormControl,
  FormControlLabel,
  Checkbox,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Paper,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import DescriptionIcon from '@mui/icons-material/Description'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import type { BiblioLibrary, SourceType, UploadResult } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import { LANGUAGE_OPTIONS } from './constants'

interface RefworksFile {
  file: File
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  message?: string
  entryTasks?: { entry_id: string; text_id: string; task_id: string }[]
}

interface UploadPanelProps {
  selectedLibrary: BiblioLibrary | null
  onLibraryCreated: (library: BiblioLibrary) => void
  onUploadComplete: () => void
}

export default function UploadPanel({
  selectedLibrary,
  onLibraryCreated,
  onUploadComplete
}: UploadPanelProps) {
  const { t } = useTranslation()

  // Target library: create new vs pick an existing one (mirrors
  // CorpusManagement/UploadPanel.tsx's "Target Corpus" createNew/targetCorpusId pattern)
  const [createNew, setCreateNew] = useState(true)
  const [libraries, setLibraries] = useState<BiblioLibrary[]>([])
  const [targetLibraryId, setTargetLibraryId] = useState('')

  // New-library metadata (only used when createNew)
  const [libraryName, setLibraryName] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('WOS')
  const [language, setLanguage] = useState<string>('english')
  const [description, setDescription] = useState('')

  // Upload state: multiple files (corpus-style)
  const [uploadMode, setUploadMode] = useState<'refworks' | 'pdf'>('refworks')
  const [files, setFiles] = useState<RefworksFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [hasAttemptedUpload, setHasAttemptedUpload] = useState(false)

  const loadLibraries = useCallback(async () => {
    const response = await biblioApi.listLibraries()
    if (response.success && response.data) {
      setLibraries(response.data.libraries)
    }
  }, [])

  useEffect(() => {
    loadLibraries()
  }, [loadLibraries])

  // Opened from an existing library's "Add More" action: default to adding to it
  // rather than showing an unrelated (and unfillable-looking) create-library form.
  useEffect(() => {
    if (selectedLibrary) {
      setTargetLibraryId(selectedLibrary.id)
      setCreateNew(false)
    }
  }, [selectedLibrary])

  const handleModeChange = (_: unknown, mode: 'refworks' | 'pdf' | null) => {
    if (!mode || mode === uploadMode) return
    setUploadMode(mode)
    setFiles([])
    setUploadError(null)
    setUploadSuccess(null)
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: RefworksFile[] = acceptedFiles.map(file => ({
      file,
      status: 'pending',
      progress: 0
    }))
    setFiles(prev => [...prev, ...newFiles])
    setUploadError(null)
    setUploadSuccess(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: uploadMode === 'pdf'
      ? { 'application/pdf': ['.pdf'] }
      : { 'text/plain': ['.txt'] },
    multiple: true,
    disabled: uploading
  })

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const canUpload = () => {
    if (files.length === 0) return false
    if (uploading) return false
    if (!files.some(f => f.status === 'pending')) return false
    return createNew ? libraryName.trim().length > 0 : targetLibraryId.length > 0
  }

  const handleUpload = async () => {
    setHasAttemptedUpload(true)
    if (!canUpload()) return

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    let libraryId = targetLibraryId

    if (createNew) {
      const createResponse = await biblioApi.createLibrary({
        name: libraryName.trim(),
        source_type: sourceType,
        description: description.trim() || undefined,
        language
      })
      if (!createResponse.success || !createResponse.data) {
        setUploadError(createResponse.error || t('biblio.createFailed'))
        setUploading(false)
        return
      }
      libraryId = createResponse.data.id
      onLibraryCreated(createResponse.data)
      await loadLibraries()
    }

    if (!libraryId) {
      setUploadError(t('biblio.selectLibraryFirst'))
      setUploading(false)
      return
    }

    let totalAdded = 0

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'error' || files[i].status === 'completed') continue

      setFiles(prev =>
        prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading' as const, progress: 10 } : f
        )
      )

      const onProgress = (p: number) => {
        setFiles(prev =>
          prev.map((f, idx) => (idx === i ? { ...f, progress: p } : f))
        )
      }

      let response: { success: boolean; data?: unknown; error?: string }
      let entryTasks: { entry_id: string; text_id: string; task_id: string }[] = []
      let added = 0

      if (uploadMode === 'pdf') {
        const pdfRes = await biblioApi.uploadPaperPdf(libraryId, files[i].file, onProgress)
        response = pdfRes
        if (pdfRes.success && pdfRes.data) {
          added = 1
          entryTasks = pdfRes.data.entry_tasks ?? []
        }
      } else {
        const rwRes = await biblioApi.uploadRefworksFile(libraryId, files[i].file, onProgress)
        response = rwRes
        if (rwRes.success && rwRes.data) {
          added = rwRes.data.entries_added ?? 0
          entryTasks = (rwRes.data as UploadResult & { entry_tasks?: { entry_id: string; text_id: string; task_id: string }[] })?.entry_tasks ?? []
        }
      }

      if (response.success && response.data) {
        totalAdded += added
        setFiles(prev =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  status: entryTasks.length > 0 ? 'processing' : 'completed',
                  progress: 100,
                  message: added > 0 ? t('biblio.uploadSuccess', { count: added }) : undefined,
                  entryTasks: entryTasks.length > 0 ? entryTasks : undefined
                }
              : f
          )
        )
      } else {
        const errorMessage = response.error === 'REFWORKS_MAX_ENTRIES_100'
          ? t('biblio.maxEntriesPerUploadExceeded')
          : (response.error || t('biblio.uploadFailed'))
        setFiles(prev =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  status: 'error',
                  message: errorMessage
                }
              : f
          )
        )
        setUploadError(errorMessage)
      }
    }

    setUploading(false)

    if (totalAdded > 0) {
      setUploadSuccess(t('biblio.uploadSuccess', { count: totalAdded }))
      // Switch to detail only after all uploads finish (same as corpus management)
      onUploadComplete()
    }
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Target Library Section (corpus-management style) */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('biblio.targetLibrary')}
        </Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={createNew}
              onChange={e => setCreateNew(e.target.checked)}
              disabled={uploading}
            />
          }
          label={t('biblio.createNewLibrary')}
        />

        {!createNew && (
          <FormControl
            fullWidth
            size="small"
            sx={{ mt: 2 }}
            error={hasAttemptedUpload && !targetLibraryId}
          >
            <InputLabel>{t('biblio.selectLibrary')}</InputLabel>
            <Select
              value={targetLibraryId}
              onChange={e => setTargetLibraryId(e.target.value)}
              label={t('biblio.selectLibrary')}
              disabled={uploading}
            >
              {libraries.length === 0 ? (
                <MenuItem disabled value="">
                  {t('biblio.noLibraries')}
                </MenuItem>
              ) : (
                libraries.map(lib => (
                  <MenuItem key={lib.id} value={lib.id}>
                    {lib.name} ({lib.entry_count} {t('biblio.entries')})
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        )}
      </Paper>

      {/* Create Library metadata — only shown while creating a new one */}
      {createNew && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('biblio.createLibrary')}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label={t('biblio.libraryName')}
              value={libraryName}
              onChange={e => setLibraryName(e.target.value)}
              fullWidth
              required
              disabled={uploading}
              error={hasAttemptedUpload && !libraryName.trim()}
            />

            <FormControl fullWidth required>
              <InputLabel>{t('biblio.sourceType')}</InputLabel>
              <Select
                value={sourceType}
                label={t('biblio.sourceType')}
                onChange={e => setSourceType(e.target.value as SourceType)}
                disabled={uploading}
              >
                <MenuItem value="WOS">Web of Science (WOS)</MenuItem>
                <MenuItem value="CNKI">{t('biblio.cnki')}</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>{t('biblio.language')}</InputLabel>
              <Select
                value={language}
                label={t('biblio.language')}
                onChange={e => setLanguage(e.target.value)}
                disabled={uploading}
              >
                {LANGUAGE_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label={t('biblio.description')}
              value={description}
              onChange={e => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              disabled={uploading}
            />
          </Box>
        </Paper>
      )}

      {/* Upload Section (corpus-style: multi-file dropzone + list) */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('biblio.uploadFile')}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {!createNew && targetLibraryId && (
            <Alert severity="info">
              {t('biblio.uploadingTo')}: <strong>{libraries.find(l => l.id === targetLibraryId)?.name}</strong>. {t('biblio.uploadProcessingHint')}
            </Alert>
          )}

          <ToggleButtonGroup
            value={uploadMode}
            exclusive
            size="small"
            onChange={handleModeChange}
            disabled={uploading}
            aria-label={t('biblio.dataSource')}
          >
            <ToggleButton value="refworks">
              <DescriptionIcon fontSize="small" sx={{ mr: 0.5 }} />
              {t('biblio.sourceRefworks')}
            </ToggleButton>
            <ToggleButton value="pdf">
              <PictureAsPdfIcon fontSize="small" sx={{ mr: 0.5 }} />
              {t('biblio.sourcePaperPdf')}
            </ToggleButton>
          </ToggleButtonGroup>

          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
              bgcolor: isDragActive ? 'action.hover' : 'background.paper',
              transition: 'all 0.2s'
            }}
          >
            <input {...getInputProps()} />
            <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body1" color="text.secondary">
              {isDragActive ? t('biblio.dropHere') : t('biblio.dragOrClick')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {uploadMode === 'pdf'
                ? `${t('biblio.supportedFormat')}: PDF (.pdf)`
                : `${t('biblio.supportedFormat')}: Refworks (.txt)`}
            </Typography>
          </Box>

          {files.length > 0 && (
            <>
              <Typography variant="subtitle2">{t('biblio.selectedFiles')}</Typography>
              <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                {files.map((item, index) => (
                  <ListItem
                    key={index}
                    secondaryAction={
                      (item.status === 'pending' || item.status === 'error') && (
                        <IconButton edge="end" size="small" onClick={() => removeFile(index)} aria-label={t('common.delete')}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )
                    }
                  >
                    <ListItemIcon>
                      <DescriptionIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.file.name}
                      secondary={
                        <>
                          {(item.file.size / 1024).toFixed(1)} KB
                          {item.message && ` • ${item.message}`}
                          {(item.status === 'uploading' || item.status === 'processing') && (
                            <Box sx={{ mt: 0.5 }}>
                              <LinearProgress variant="determinate" value={item.progress} sx={{ height: 4, borderRadius: 1 }} />
                            </Box>
                          )}
                        </>
                      }
                    />
                    {item.status === 'completed' && <CheckCircleIcon color="success" fontSize="small" />}
                    {item.status === 'error' && <ErrorIcon color="error" fontSize="small" />}
                  </ListItem>
                ))}
              </List>
            </>
          )}

          {uploadError && <Alert severity="error">{uploadError}</Alert>}
          {uploadSuccess && <Alert severity="success">{uploadSuccess}</Alert>}

          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={handleUpload}
              disabled={files.length === 0 || uploading || !files.some(f => f.status === 'pending')}
            >
              {uploading ? t('biblio.uploading') : t('biblio.upload')}
            </Button>
            {hasAttemptedUpload && files.length > 0 && createNew && !libraryName.trim() && (
              <Typography variant="caption" color="error">{t('biblio.nameRequired')}</Typography>
            )}
            {hasAttemptedUpload && files.length > 0 && !createNew && !targetLibraryId && (
              <Typography variant="caption" color="error">{t('biblio.selectLibraryFirst')}</Typography>
            )}
          </Stack>
        </Box>
      </Paper>
    </Box>
  )
}

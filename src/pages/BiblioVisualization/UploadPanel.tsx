/**
 * Upload Panel for Bibliographic Visualization
 * Create library (with language), upload RefWorks files (corpus-style: multi-file, progress)
 */

import { useState, useCallback } from 'react'
import {
  Box,
  Typography,
  TextField,
  FormControl,
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
  ListItemSecondaryAction,
  IconButton,
  Divider
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import DescriptionIcon from '@mui/icons-material/Description'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import type { BiblioLibrary, SourceType, UploadResult } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'

const LANGUAGE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'english', labelKey: 'biblio.languageEnglish' },
  { value: 'chinese', labelKey: 'biblio.languageChinese' }
]

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

  // Create library state
  const [libraryName, setLibraryName] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('WOS')
  const [language, setLanguage] = useState<string>('english')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Upload state: multiple files (corpus-style)
  const [files, setFiles] = useState<RefworksFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  const handleCreateLibrary = async () => {
    if (!libraryName.trim()) {
      setCreateError(t('biblio.nameRequired'))
      return
    }

    setCreating(true)
    setCreateError(null)

    const response = await biblioApi.createLibrary({
      name: libraryName.trim(),
      source_type: sourceType,
      description: description.trim() || undefined,
      language
    })

    setCreating(false)

    if (response.success && response.data) {
      onLibraryCreated(response.data)
      setLibraryName('')
      setDescription('')
    } else {
      setCreateError(response.error || t('biblio.createFailed'))
    }
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
    accept: { 'text/plain': ['.txt'] },
    multiple: true,
    disabled: !selectedLibrary || uploading
  })

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (!selectedLibrary || files.length === 0) return

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    let totalAdded = 0

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'error' || files[i].status === 'completed') continue

      setFiles(prev =>
        prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading' as const, progress: 10 } : f
        )
      )

      const response = await biblioApi.uploadRefworksFile(
        selectedLibrary.id,
        files[i].file,
        p => {
          setFiles(prev =>
            prev.map((f, idx) => (idx === i ? { ...f, progress: p } : f))
          )
        }
      )

      const entryTasks = (response.data as UploadResult & { entry_tasks?: { entry_id: string; text_id: string; task_id: string }[] })?.entry_tasks ?? []

      if (response.success && response.data) {
        const added = response.data.entries_added ?? 0
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

  const allDone = files.length > 0 && files.every(f => f.status === 'completed' || f.status === 'processing' || f.status === 'error')
  const hasProcessing = files.some(f => f.status === 'uploading' || f.status === 'processing')

  return (
    <Box sx={{ p: 3 }}>
      {/* Create Library Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
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
            disabled={creating}
          />

          <FormControl fullWidth required>
            <InputLabel>{t('biblio.sourceType')}</InputLabel>
            <Select
              value={sourceType}
              label={t('biblio.sourceType')}
              onChange={e => setSourceType(e.target.value as SourceType)}
              disabled={creating}
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
              disabled={creating}
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
            disabled={creating}
          />

          {createError && <Alert severity="error">{createError}</Alert>}

          <Button
            variant="contained"
            onClick={handleCreateLibrary}
            disabled={creating || !libraryName.trim()}
          >
            {creating ? t('common.creating') : t('biblio.create')}
          </Button>
        </Box>
      </Paper>

      {/* Upload Section (corpus-style: multi-file dropzone + list) */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('biblio.uploadFile')}
        </Typography>

        {!selectedLibrary ? (
          <Alert severity="info">{t('biblio.selectLibraryFirst')}</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info">
              {t('biblio.uploadingTo')}: <strong>{selectedLibrary.name}</strong> ({selectedLibrary.source_type})
            </Alert>

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
                {t('biblio.supportedFormat')}: Refworks (.txt). {t('biblio.maxEntriesHint')}
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

            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={handleUpload}
              disabled={files.length === 0 || uploading || !files.some(f => f.status === 'pending')}
            >
              {uploading ? t('biblio.uploading') : t('biblio.upload')}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  )
}

/**
 * Upload Panel for Bibliographic Visualization
 * 
 * Allows users to create libraries and upload Refworks files
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
  Divider
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import DescriptionIcon from '@mui/icons-material/Description'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import type { BiblioLibrary, SourceType, UploadResult } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'

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
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  
  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  
  // Handle library creation
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
      description: description.trim() || undefined
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
  
  // Handle file drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0])
      setUploadResult(null)
      setUploadError(null)
    }
  }, [])
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
    },
    maxFiles: 1
  })
  
  // Handle file upload
  const handleUpload = async () => {
    if (!selectedLibrary || !selectedFile) return
    
    setUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    setUploadResult(null)
    
    const response = await biblioApi.uploadRefworksFile(
      selectedLibrary.id,
      selectedFile,
      (progress) => setUploadProgress(progress)
    )
    
    setUploading(false)
    
    if (response.success && response.data) {
      setUploadResult(response.data)
      if (response.data.entries_added > 0) {
        onUploadComplete()
      }
    } else {
      setUploadError(response.error || t('biblio.uploadFailed'))
    }
  }
  
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
            onChange={(e) => setLibraryName(e.target.value)}
            fullWidth
            required
            disabled={creating}
          />
          
          <FormControl fullWidth required>
            <InputLabel>{t('biblio.sourceType')}</InputLabel>
            <Select
              value={sourceType}
              label={t('biblio.sourceType')}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              disabled={creating}
            >
              <MenuItem value="WOS">Web of Science (WOS)</MenuItem>
              <MenuItem value="CNKI">{t('biblio.cnki')}</MenuItem>
            </Select>
          </FormControl>
          
          <TextField
            label={t('biblio.description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            disabled={creating}
          />
          
          {createError && (
            <Alert severity="error">{createError}</Alert>
          )}
          
          <Button
            variant="contained"
            onClick={handleCreateLibrary}
            disabled={creating || !libraryName.trim()}
          >
            {creating ? t('common.creating') : t('biblio.create')}
          </Button>
        </Box>
      </Paper>
      
      {/* Upload Section */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('biblio.uploadFile')}
        </Typography>
        
        {!selectedLibrary ? (
          <Alert severity="info">
            {t('biblio.selectLibraryFirst')}
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info">
              {t('biblio.uploadingTo')}: <strong>{selectedLibrary.name}</strong> ({selectedLibrary.source_type})
            </Alert>
            
            {/* Dropzone */}
            <Box
              {...getRootProps()}
              sx={{
                border: '2px dashed',
                borderColor: isDragActive ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: isDragActive ? 'action.hover' : 'background.paper',
                transition: 'all 0.2s'
              }}
            >
              <input {...getInputProps()} />
              <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" color="text.secondary">
                {isDragActive 
                  ? t('biblio.dropHere')
                  : t('biblio.dragOrClick')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('biblio.supportedFormat')}: Refworks (.txt)
              </Typography>
            </Box>
            
            {/* Selected file */}
            {selectedFile && (
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <DescriptionIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary={selectedFile.name}
                    secondary={`${(selectedFile.size / 1024).toFixed(1)} KB`}
                  />
                </ListItem>
              </List>
            )}
            
            {/* Upload progress */}
            {uploading && (
              <Box sx={{ width: '100%' }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {t('biblio.uploading')}... {uploadProgress}%
                </Typography>
              </Box>
            )}
            
            {/* Upload error */}
            {uploadError && (
              <Alert severity="error">{uploadError}</Alert>
            )}
            
            {/* Upload result */}
            {uploadResult && (
              <Alert 
                severity={uploadResult.entries_added > 0 ? 'success' : 'warning'}
                icon={uploadResult.entries_added > 0 ? <CheckCircleIcon /> : <ErrorIcon />}
              >
                <Typography variant="body2">
                  {t('biblio.entriesAdded')}: {uploadResult.entries_added}
                </Typography>
                {uploadResult.entries_skipped > 0 && (
                  <Typography variant="body2">
                    {t('biblio.entriesSkipped')}: {uploadResult.entries_skipped}
                  </Typography>
                )}
                {uploadResult.errors.length > 0 && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      {t('biblio.parseErrors')}:
                    </Typography>
                    {uploadResult.errors.slice(0, 5).map((error, i) => (
                      <Typography key={i} variant="caption" display="block" color="text.secondary">
                        - {error}
                      </Typography>
                    ))}
                  </>
                )}
              </Alert>
            )}
            
            {/* Upload button */}
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? t('biblio.uploading') : t('biblio.upload')}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  )
}


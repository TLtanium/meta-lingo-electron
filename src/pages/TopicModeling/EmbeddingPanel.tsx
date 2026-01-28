/**
 * Embedding Panel for Topic Modeling
 * Execute SBERT embedding and manage embedding files
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import InfoIcon from '@mui/icons-material/Info'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EditIcon from '@mui/icons-material/Edit'
import { useTranslation } from 'react-i18next'
import type { PreprocessConfig, EmbeddingInfo, EmbeddingResult, ModelInfo, ChunkingConfig } from '../../types/topicModeling'
import { topicModelingApi } from '../../api'

interface EmbeddingPanelProps {
  corpusId: string
  textIds: string[]
  preprocessConfig: PreprocessConfig
  chunkingConfig?: ChunkingConfig
  selectedEmbedding: string | null
  onEmbeddingSelect: (embeddingId: string | null) => void
  onEmbeddingComplete?: (result: EmbeddingResult) => void
  corpusLanguage?: string
}

export default function EmbeddingPanel({
  corpusId,
  textIds,
  preprocessConfig,
  chunkingConfig,
  selectedEmbedding,
  onEmbeddingSelect,
  onEmbeddingComplete,
  corpusLanguage = 'english'
}: EmbeddingPanelProps) {
  const { t } = useTranslation()
  const [embeddings, setEmbeddings] = useState<EmbeddingInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [embeddingToDelete, setEmbeddingToDelete] = useState<string | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [embeddingToRename, setEmbeddingToRename] = useState<string | null>(null)
  const [newEmbeddingName, setNewEmbeddingName] = useState('')

  // Load embeddings and model info
  const loadData = async () => {
    setLoading(true)
    try {
      // Only load embeddings if corpus is selected, filter by corpusId
      const [embeddingsRes, modelInfoRes] = await Promise.all([
        corpusId ? topicModelingApi.listEmbeddings(corpusId) : Promise.resolve({ success: true, data: { embeddings: [] } }),
        topicModelingApi.getModelInfo()
      ])

      if (embeddingsRes.success && embeddingsRes.data) {
        setEmbeddings(embeddingsRes.data.embeddings)
      } else {
        setEmbeddings([])
      }

      if (modelInfoRes.success && modelInfoRes.data) {
        setModelInfo(modelInfoRes.data)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  // Reload embeddings when corpus changes
  useEffect(() => {
    // Reset selection when corpus changes
    if (selectedEmbedding) {
      onEmbeddingSelect(null)
    }
    // Clear embeddings list first, then reload
    setEmbeddings([])
    loadData()
  }, [corpusId])

  // Create new embedding
  const handleCreateEmbedding = async () => {
    if (!corpusId || textIds.length === 0) {
      setError(t('topicModeling.embedding.selectTextsFirst') || 'Please select texts first')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const response = await topicModelingApi.createEmbedding(
        corpusId,
        textIds,
        preprocessConfig,
        { 
          batchSize: 32, 
          device: 'cpu', 
          language: corpusLanguage,
          chunking: chunkingConfig
        }
      )

      if (response.success && response.data) {
        onEmbeddingComplete?.(response.data)
        onEmbeddingSelect(response.data.embedding_id)
        loadData() // Refresh list
      } else {
        setError(response.error || 'Embedding creation failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setCreating(false)
    }
  }

  // Delete embedding
  const handleDeleteEmbedding = async () => {
    if (!embeddingToDelete) return

    try {
      const response = await topicModelingApi.deleteEmbedding(embeddingToDelete)
      if (response.success) {
        if (selectedEmbedding === embeddingToDelete) {
          onEmbeddingSelect(null)
        }
        loadData()
      } else {
        setError(response.error || 'Delete failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setDeleteDialogOpen(false)
      setEmbeddingToDelete(null)
    }
  }

  // Rename embedding
  const handleRenameEmbedding = async () => {
    if (!embeddingToRename || !newEmbeddingName.trim()) return

    try {
      const response = await topicModelingApi.renameEmbedding(embeddingToRename, newEmbeddingName.trim())
      if (response.success) {
        if (selectedEmbedding === embeddingToRename) {
          onEmbeddingSelect(newEmbeddingName.trim())
        }
        loadData()
      } else {
        setError(response.error || 'Rename failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setRenameDialogOpen(false)
      setEmbeddingToRename(null)
      setNewEmbeddingName('')
    }
  }

  const openRenameDialog = (embId: string) => {
    setEmbeddingToRename(embId)
    setNewEmbeddingName(embId)
    setRenameDialogOpen(true)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="subtitle1" fontWeight={600}>
          {t('topicModeling.embedding.title')}
        </Typography>
        <IconButton size="small" onClick={loadData} disabled={loading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* Model Info */}
      {modelInfo && (
        <Alert 
          severity={modelInfo.exists ? 'info' : 'warning'} 
          icon={<InfoIcon />}
          sx={{ mb: 2 }}
        >
          <Typography variant="body2">
            {t('topicModeling.embedding.model')}: <strong>{modelInfo.model_name}</strong>
          </Typography>
          {!modelInfo.exists && (
            <Typography variant="caption" color="error">
              {t('topicModeling.embedding.modelNotFound')}
            </Typography>
          )}
        </Alert>
      )}

      {/* Create Embedding Button */}
      <Button
        variant="contained"
        startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
        onClick={handleCreateEmbedding}
        disabled={creating || !corpusId || textIds.length === 0 || !modelInfo?.exists}
        fullWidth
        sx={{ mb: 2 }}
      >
        {creating 
          ? t('topicModeling.embedding.creating')
          : t('topicModeling.embedding.execute')
        }
        {textIds.length > 0 && ` (${textIds.length} ${t('common.items')})`}
      </Button>

      {/* Error */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Existing Embeddings */}
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {t('topicModeling.embedding.existingFiles')}
        {corpusId && embeddings.length > 0 && (
          <Chip 
            label={embeddings.length} 
            size="small" 
            sx={{ ml: 1 }}
          />
        )}
      </Typography>

      {!corpusId ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          {t('topicModeling.embedding.selectCorpusFirst')}
        </Typography>
      ) : loading ? (
        <Box display="flex" justifyContent="center" p={2}>
          <CircularProgress size={24} />
        </Box>
      ) : embeddings.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          {t('topicModeling.embedding.noEmbeddings')}
        </Typography>
      ) : (
        <List dense sx={{ maxHeight: 250, overflow: 'auto' }}>
          {embeddings.map((emb) => (
            <ListItem
              key={emb.id}
              button
              selected={selectedEmbedding === emb.id}
              onClick={() => onEmbeddingSelect(emb.id)}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                border: selectedEmbedding === emb.id ? 2 : 1,
                borderColor: selectedEmbedding === emb.id ? 'primary.main' : 'divider'
              }}
            >
              {selectedEmbedding === emb.id && (
                <CheckCircleIcon color="primary" sx={{ mr: 1, fontSize: 18 }} />
              )}
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                      {emb.id}
                    </Typography>
                    <Chip 
                      label={`${emb.size_mb} MB`} 
                      size="small" 
                      variant="outlined"
                    />
                  </Stack>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    {emb.shape ? `${emb.shape[0]} docs, ${emb.shape[1]} dim` : ''} | {formatDate(emb.created_at)}
                  </Typography>
                }
              />
              <ListItemSecondaryAction>
                <Tooltip title={t('common.rename')}>
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      openRenameDialog(emb.id)
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('common.delete')}>
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEmbeddingToDelete(emb.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('common.confirmDelete')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('topicModeling.embedding.deleteConfirm')} <strong>{embeddingToDelete}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleDeleteEmbedding} color="error" variant="contained">
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>{t('topicModeling.embedding.rename')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('topicModeling.embedding.newName')}
            fullWidth
            value={newEmbeddingName}
            onChange={(e) => setNewEmbeddingName(e.target.value)}
            helperText={t('topicModeling.embedding.nameHelp')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleRenameEmbedding} 
            color="primary" 
            variant="contained"
            disabled={!newEmbeddingName.trim() || newEmbeddingName === embeddingToRename}
          >
            {t('common.rename')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

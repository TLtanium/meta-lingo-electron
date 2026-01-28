/**
 * Preprocess Panel for Topic Modeling
 * Simplified configuration for text chunking only
 * Other preprocessing (stopwords, etc.) moved to vectorizer config
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  FormControlLabel,
  Checkbox,
  Button,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton
} from '@mui/material'
import { NumberInput } from '../../components/common'
import PreviewIcon from '@mui/icons-material/Preview'
import CloseIcon from '@mui/icons-material/Close'
import { useTranslation } from 'react-i18next'
import type { PreprocessConfig, PreprocessPreviewResult, ChunkingConfig } from '../../types/topicModeling'
import { topicModelingApi } from '../../api'

interface ChunkPreview {
  chunk_index?: number
  text_id?: string
  original?: string
  processed?: string
  original_token_count?: number
  original_word_count?: number
  processed_word_count?: number
  has_spacy?: boolean
}

interface PreprocessPanelProps {
  corpusId: string
  textIds: string[]
  config: PreprocessConfig
  onConfigChange: (config: PreprocessConfig) => void
  chunkingConfig: ChunkingConfig
  onChunkingConfigChange: (config: ChunkingConfig) => void
  onPreviewResult?: (result: PreprocessPreviewResult) => void
  corpusLanguage?: string
}

export default function PreprocessPanel({
  corpusId,
  textIds,
  config,
  onConfigChange,
  chunkingConfig,
  onChunkingConfigChange,
  onPreviewResult,
  corpusLanguage = 'english'
}: PreprocessPanelProps) {
  const { t } = useTranslation()
  const [previewing, setPreviewing] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreprocessPreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedChunk, setSelectedChunk] = useState<ChunkPreview | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleChunkClick = (chunk: ChunkPreview) => {
    setSelectedChunk(chunk)
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
  }

  const handleChunkingChange = (key: keyof ChunkingConfig, value: unknown) => {
    onChunkingConfigChange({ ...chunkingConfig, [key]: value })
  }

  const handlePreview = async () => {
    if (!corpusId || textIds.length === 0) {
      setError(t('topicModeling.preprocess.selectTextsFirst') || 'Please select texts first')
      return
    }

    setPreviewing(true)
    setError(null)

    try {
      const response = await topicModelingApi.previewPreprocess(
        corpusId, 
        textIds, 
        config, 
        10,  // Show up to 10 chunks in preview
        corpusLanguage,
        chunkingConfig
      )
      if (response.success && response.data) {
        setPreviewResult(response.data)
        onPreviewResult?.(response.data)
      } else {
        // Check for error types
        const errorStr = response.error || ''
        if (errorStr.includes('SENTENCE_EXCEEDS_LIMIT:')) {
          const parts = errorStr.split(':')
          const actualTokens = parts[1] || 'unknown'
          const limit = parts[2] || '512'
          setError(t('topicModeling.preprocess.sentenceExceedsLimit', { 
            actualTokens, 
            limit,
            defaultValue: `A sentence exceeds ${limit} token limit (actual: ${actualTokens} tokens). Please manually split long sentences in your source text.`
          }))
        } else if (errorStr.includes('CHUNK_EXCEEDS_LIMIT:')) {
          const parts = errorStr.split(':')
          const actualTokens = parts[1] || 'unknown'
          const limit = parts[2] || '512'
          setError(t('topicModeling.preprocess.chunkExceedsLimit', { 
            actualTokens, 
            limit,
            defaultValue: `Chunk exceeds ${limit} token limit (actual: ${actualTokens}). Please reduce the max tokens setting.`
          }))
        } else {
          setError(errorStr || 'Preview failed')
        }
      }
    } catch (err) {
      const errorStr = String(err)
      // Check for error types in exception
      if (errorStr.includes('SENTENCE_EXCEEDS_LIMIT:')) {
        const parts = errorStr.split(':')
        const actualTokens = parts[1] || 'unknown'
        const limit = parts[2] || '512'
        setError(t('topicModeling.preprocess.sentenceExceedsLimit', { 
          actualTokens, 
          limit,
          defaultValue: `A sentence exceeds ${limit} token limit (actual: ${actualTokens} tokens). Please manually split long sentences in your source text.`
        }))
      } else if (errorStr.includes('CHUNK_EXCEEDS_LIMIT:')) {
        const parts = errorStr.split(':')
        const actualTokens = parts[1] || 'unknown'
        const limit = parts[2] || '512'
        setError(t('topicModeling.preprocess.chunkExceedsLimit', { 
          actualTokens, 
          limit,
          defaultValue: `Chunk exceeds ${limit} token limit (actual: ${actualTokens}). Please reduce the max tokens setting.`
        }))
      } else {
        setError(errorStr)
      }
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {t('topicModeling.preprocess.title')}
      </Typography>

      <Stack spacing={2}>
        {/* Long Text Chunking Options */}
        <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={chunkingConfig.enabled}
                onChange={(e) => handleChunkingChange('enabled', e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="body2" fontWeight={500}>
                {t('topicModeling.preprocess.enableChunking')}
              </Typography>
            }
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4, mb: 1 }}>
            {chunkingConfig.enabled 
              ? t('topicModeling.preprocess.chunkingHelp')
              : t('topicModeling.preprocess.chunkingDisabledHelp')
            }
          </Typography>
          
          {chunkingConfig.enabled && (
            <Stack spacing={1} sx={{ mt: 1, ml: 4 }}>
              <Stack direction="row" spacing={2}>
                <NumberInput
                  label={t('topicModeling.preprocess.minTokens')}
                  size="small"
                  value={chunkingConfig.min_tokens}
                  onChange={(val) => handleChunkingChange('min_tokens', val)}
                  min={20}
                  max={200}
                  integer
                  defaultValue={100}
                  sx={{ width: 140 }}
                />
                <NumberInput
                  label={t('topicModeling.preprocess.maxTokens')}
                  size="small"
                  value={chunkingConfig.max_tokens}
                  onChange={(val) => handleChunkingChange('max_tokens', val)}
                  min={128}
                  max={512}
                  integer
                  defaultValue={256}
                  sx={{ width: 140 }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t('topicModeling.preprocess.chunkingLogicHelp')}
              </Typography>
            </Stack>
          )}
        </Box>

        {/* Preview Button */}
        <Button
          variant="outlined"
          startIcon={previewing ? <CircularProgress size={16} /> : <PreviewIcon />}
          onClick={handlePreview}
          disabled={previewing || !corpusId || textIds.length === 0}
          fullWidth
        >
          {t('topicModeling.preprocess.preview')}
        </Button>

        {/* Error */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Preview Result */}
        {previewResult && (
          <Box>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <Typography variant="body2" color="text.secondary">
                {t('topicModeling.preprocess.previewResult')} ({previewResult.preview_count}/{previewResult.total_chunks} chunks)
              </Typography>
              <Chip 
                label={`${previewResult.total_texts} ${t('common.items')}`}
                size="small"
                variant="outlined"
              />
              {previewResult.chunking_enabled && (
                <Chip 
                  label={`max ${previewResult.max_tokens} tokens`}
                  size="small"
                  color="info"
                  variant="outlined"
                />
              )}
            </Stack>
            
            <Stack spacing={1} sx={{ maxHeight: 300, overflow: 'auto' }}>
              {previewResult.previews.map((preview, index) => (
                <Paper 
                  key={index} 
                  variant="outlined" 
                  sx={{ 
                    p: 1,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'action.hover',
                      borderColor: 'primary.main'
                    }
                  }}
                  onClick={() => handleChunkClick(preview)}
                >
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                    <Chip 
                      label={`#${preview.chunk_index !== undefined ? preview.chunk_index + 1 : index + 1}`}
                      size="small"
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {preview.original_token_count || preview.original_word_count} tokens
                    </Typography>
                    <Typography variant="caption" color="primary.main" sx={{ ml: 'auto' }}>
                      {t('common.clickToView')}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" component="div" sx={{ 
                    bgcolor: 'action.hover', 
                    p: 0.5, 
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    maxHeight: 60,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {preview.processed || preview.original || '(empty)'}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>

      {/* Chunk Detail Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleDialogClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6">
              {t('topicModeling.preprocess.chunkDetail')}
            </Typography>
            {selectedChunk && (
              <>
                <Chip 
                  label={`#${(selectedChunk.chunk_index ?? 0) + 1}`}
                  size="small"
                  color="primary"
                />
                <Chip 
                  label={`${selectedChunk.original_token_count || selectedChunk.original_word_count || 0} tokens`}
                  size="small"
                  variant="outlined"
                />
              </>
            )}
          </Stack>
          <IconButton onClick={handleDialogClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedChunk && (
            <Box sx={{ 
              bgcolor: 'action.hover', 
              p: 2, 
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '60vh',
              overflow: 'auto'
            }}>
              {selectedChunk.processed || selectedChunk.original || '(empty)'}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

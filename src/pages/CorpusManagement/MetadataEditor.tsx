import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Chip,
  Box,
  IconButton,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useTranslation } from 'react-i18next'
import { useCorpusStore } from '../../stores/corpusStore'
import type { Corpus, CorpusMetadata } from '../../types'

interface MetadataEditorProps {
  open: boolean
  onClose: () => void
  corpus: Corpus
}

export default function MetadataEditor({ open, onClose, corpus }: MetadataEditorProps) {
  const { t } = useTranslation()
  const { updateCorpus } = useCorpusStore()
  
  const [metadata, setMetadata] = useState<Partial<CorpusMetadata>>({})
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    if (open) {
      setMetadata({
        name: corpus.name,
        language: corpus.language,
        author: corpus.author,
        source: corpus.source,
        textType: corpus.textType,
        tags: [...corpus.tags]
      })
    }
  }, [open, corpus])

  const handleSave = () => {
    updateCorpus(corpus.id, {
      ...metadata,
      updatedAt: new Date().toISOString()
    })
    onClose()
  }

  const handleAddTag = () => {
    if (newTag.trim() && !metadata.tags?.includes(newTag.trim())) {
      setMetadata(prev => ({
        ...prev,
        tags: [...(prev.tags || []), newTag.trim()]
      }))
      setNewTag('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setMetadata(prev => ({
      ...prev,
      tags: prev.tags?.filter(t => t !== tag) || []
    }))
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('corpus.metadata')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label={t('corpus.name')}
            value={metadata.name || ''}
            onChange={(e) => setMetadata(prev => ({ ...prev, name: e.target.value }))}
            fullWidth
            required
          />
          <TextField
            label={t('corpus.language')}
            value={metadata.language || ''}
            onChange={(e) => setMetadata(prev => ({ ...prev, language: e.target.value }))}
            fullWidth
          />
          <TextField
            label={t('corpus.author')}
            value={metadata.author || ''}
            onChange={(e) => setMetadata(prev => ({ ...prev, author: e.target.value }))}
            fullWidth
          />
          <TextField
            label={t('corpus.source')}
            value={metadata.source || ''}
            onChange={(e) => setMetadata(prev => ({ ...prev, source: e.target.value }))}
            fullWidth
          />
          <TextField
            label={t('corpus.textType')}
            value={metadata.textType || ''}
            onChange={(e) => setMetadata(prev => ({ ...prev, textType: e.target.value }))}
            fullWidth
          />

          {/* Tags */}
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('corpus.tags')}
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {metadata.tags?.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  onDelete={() => handleRemoveTag(tag)}
                />
              ))}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder={t('corpus.addTag')}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                fullWidth
              />
              <IconButton onClick={handleAddTag}>
                <AddIcon />
              </IconButton>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} variant="contained">
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}


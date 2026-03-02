/**
 * Entry Detail Dialog for Bibliographic Visualization
 *
 * Shows detailed information about a bibliographic entry; supports editing relevance (stars), tags, and notes.
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  Link,
  IconButton,
  TextField,
  InputAdornment,
  Autocomplete
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import LaunchIcon from '@mui/icons-material/Launch'
import AddIcon from '@mui/icons-material/Add'
import { useTranslation } from 'react-i18next'
import type { BiblioEntry } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import StarRating from './components/StarRating'

interface EntryDetailDialogProps {
  entry: BiblioEntry | null
  open: boolean
  onClose: () => void
  /** Existing tags in the library (for suggestions when adding a tag) */
  existingTags?: string[]
  onEntryUpdated?: (updated: BiblioEntry) => void
}

export default function EntryDetailDialog({ entry, open, onClose, existingTags = [], onEntryUpdated }: EntryDetailDialogProps) {
  const { t } = useTranslation()
  const [localEntry, setLocalEntry] = useState<BiblioEntry | null>(entry)
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && entry) setLocalEntry(entry)
  }, [open, entry])

  const updateField = async (payload: { relevance?: number; tags?: string[]; notes?: string }) => {
    if (!localEntry) return
    setSaving(true)
    const response = await biblioApi.updateEntry(localEntry.id, payload)
    setSaving(false)
    if (response.success && response.data) {
      setLocalEntry(response.data)
      onEntryUpdated?.(response.data)
    }
  }

  const handleRelevanceChange = (value: number) => updateField({ relevance: value })
  const handleAddTag = () => {
    const tag = newTag.trim()
    if (!tag || !localEntry) return
    const tags = [...(localEntry.tags || []), tag]
    if (tags.length === (localEntry.tags || []).length) return
    setNewTag('')
    updateField({ tags })
  }
  const handleRemoveTag = (tag: string) => {
    if (!localEntry) return
    const tags = (localEntry.tags || []).filter(t => t !== tag)
    updateField({ tags })
  }
  const handleNotesBlur = () => {
    if (!localEntry) return
    const notes = (localEntry.notes ?? '').trim()
    const initial = (entry?.notes ?? '').trim()
    if (notes !== initial) updateField({ notes })
  }
  const handleNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!localEntry) return
    setLocalEntry({ ...localEntry, notes: e.target.value })
  }

  const displayEntry = localEntry ?? entry
  if (!displayEntry) return null

  const DetailRow = ({ label, value }: { label: string; value?: string | number | null }) => {
    if (!value) return null
    return (
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="body2">{value}</Typography>
      </Box>
    )
  }
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, pr: 2 }}>
          <Typography variant="h6" component="div">
            {displayEntry.title}
          </Typography>
          {displayEntry.doc_type && (
            <Chip
              label={displayEntry.doc_type}
              size="small"
              variant="outlined"
              sx={{ mt: 1 }}
            />
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Relevance (stars) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {t('biblio.relevance')}
          </Typography>
          <StarRating
            value={displayEntry.relevance ?? 0}
            onChange={handleRelevanceChange}
            readOnly={false}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Authors */}
        {displayEntry.authors.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.authors')}
            </Typography>
            <Typography variant="body2">
              {displayEntry.authors.join('; ')}
            </Typography>
          </Box>
        )}

        {/* Institutions */}
        {displayEntry.institutions.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.institutions')}
            </Typography>
            <Typography variant="body2">
              {displayEntry.institutions.join('; ')}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Publication info */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
          <DetailRow label={t('biblio.journal')} value={displayEntry.journal} />
          <DetailRow label={t('biblio.year')} value={displayEntry.year} />
          <DetailRow label={t('biblio.volume')} value={displayEntry.volume} />
          <DetailRow label={t('biblio.issue')} value={displayEntry.issue} />
          <DetailRow label={t('biblio.pages')} value={displayEntry.pages} />
          <DetailRow label={t('biblio.language')} value={displayEntry.language} />
          <DetailRow label={t('biblio.citations')} value={displayEntry.citation_count} />
        </Box>

        {/* DOI */}
        {displayEntry.doi && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              DOI
            </Typography>
            <Link
              href={`https://doi.org/${displayEntry.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              {displayEntry.doi}
              <LaunchIcon fontSize="small" />
            </Link>
          </Box>
        )}

        {/* Source URL */}
        {displayEntry.source_url && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.sourceUrl')}
            </Typography>
            <Link
              href={displayEntry.source_url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                wordBreak: 'break-all'
              }}
            >
              {displayEntry.source_url.length > 60
                ? displayEntry.source_url.substring(0, 60) + '...'
                : displayEntry.source_url}
              <LaunchIcon fontSize="small" />
            </Link>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Tags (editable) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {t('biblio.tags')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
            {(displayEntry.tags || []).map(tag => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={saving ? undefined : () => handleRemoveTag(tag)}
              />
            ))}
            <Autocomplete
              freeSolo
              size="small"
              options={existingTags.filter(t => !(displayEntry.tags || []).includes(t))}
              inputValue={newTag}
              onInputChange={(_, v) => setNewTag(v ?? '')}
              onChange={(_, v) => {
                const tag = (typeof v === 'string' ? v : v ?? '').trim()
                if (tag) {
                  setNewTag('')
                  if (!(displayEntry.tags || []).includes(tag)) {
                    updateField({ tags: [...(displayEntry.tags || []), tag] })
                  }
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={t('biblio.addTag')}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {params.InputProps.endAdornment}
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={handleAddTag} disabled={saving || !newTag.trim()}>
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      </>
                    )
                  }}
                />
              )}
              sx={{ minWidth: 180, maxWidth: 240 }}
            />
          </Box>
        </Box>

        {/* Notes (editable) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {t('biblio.notes')}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            value={displayEntry.notes ?? ''}
            onChange={handleNotesChange}
            onBlur={handleNotesBlur}
            placeholder={t('biblio.notesPlaceholder')}
            disabled={saving}
            size="small"
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Keywords */}
        {displayEntry.keywords.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('biblio.keywords')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {displayEntry.keywords.map((kw, i) => (
                <Chip key={i} label={kw} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>
        )}

        {/* Abstract */}
        {displayEntry.abstract && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('biblio.abstract')}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'justify' }}>
              {displayEntry.abstract}
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}


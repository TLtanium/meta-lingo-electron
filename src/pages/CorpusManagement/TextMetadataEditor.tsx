/**
 * Text Metadata Editor Dialog
 * Edit metadata for individual corpus texts (date, author, source, textType)
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress,
  Alert
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import dayjs, { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { getUsasTextTypeDisplayLabel } from '../../utils/usasTextTypeLabel'
import { corpusApi } from '../../api'
import apiClient from '../../api/client'
import type { CorpusText, TextMetadata } from '../../types'

interface TextTypeConfig {
  name: string
  name_zh?: string
  priority_domains?: string[]
}

const CUSTOM_TEXT_TYPE = '__CUSTOM__'

// Predefined source options (English values for storage)
const SOURCE_OPTIONS = [
  'Web Crawl',
  'Manual Input',
  'File Upload',
  'Database Export',
  'API Collection',
  'Archive',
  'Library',
  'Research Dataset',
  'Social Media Platform',
  'News Agency',
  'Other'
]

// Mapping from English value to translation key
const SOURCE_TRANSLATION_KEYS: Record<string, string> = {
  'Web Crawl': 'corpus.sources.webCrawl',
  'Manual Input': 'corpus.sources.manualInput',
  'File Upload': 'corpus.sources.fileUpload',
  'Database Export': 'corpus.sources.databaseExport',
  'API Collection': 'corpus.sources.apiCollection',
  'Archive': 'corpus.sources.archive',
  'Library': 'corpus.sources.library',
  'Research Dataset': 'corpus.sources.researchDataset',
  'Social Media Platform': 'corpus.sources.socialMediaPlatform',
  'News Agency': 'corpus.sources.newsAgency',
  'Other': 'corpus.sources.other'
}

interface TextMetadataEditorProps {
  open: boolean
  onClose: () => void
  corpusId: string
  text: CorpusText
  onSaved?: (text: CorpusText) => void
}

export default function TextMetadataEditor({
  open,
  onClose,
  corpusId,
  text,
  onSaved
}: TextMetadataEditorProps) {
  const { t, i18n } = useTranslation()

  // Form state
  const [date, setDate] = useState<Dayjs | null>(null)
  const [author, setAuthor] = useState('')
  const [source, setSource] = useState('')
  const [sourceType, setSourceType] = useState('Other')
  const [textType, setTextType] = useState('GEN')
  const [customTextType, setCustomTextType] = useState('')
  const [isCustomTextType, setIsCustomTextType] = useState(false)
  const [description, setDescription] = useState('')
  const [textTypeConfigs, setTextTypeConfigs] = useState<Record<string, TextTypeConfig>>({})

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load text type configs from USAS API once
  useEffect(() => {
    apiClient.get('/api/usas/text-types').then(response => {
      if (response.data?.success && response.data.data?.text_types) {
        setTextTypeConfigs(response.data.data.text_types)
      }
    }).catch(() => {})
  }, [])

  // Initialize form when dialog opens or text changes
  useEffect(() => {
    if (open && text) {
      const meta = text.metadata || {}
      setDate(meta.date ? dayjs(meta.date) : null)
      setAuthor(meta.author || '')
      setDescription(meta.description || '')

      // Handle source - check if it's a preset or custom
      const savedSource = meta.source || ''
      if (SOURCE_OPTIONS.includes(savedSource)) {
        setSourceType(savedSource)
        setSource(savedSource)
      } else {
        setSourceType('Other')
        setSource(savedSource)
      }

      // Handle text type — stored as USAS code (e.g. 'GEN') or legacy string
      const savedTextType = meta.customFields?.textType || ''
      // Will be validated against configs once loaded; store as-is
      setIsCustomTextType(false)
      setCustomTextType('')
      setTextType(savedTextType || 'GEN')

      setError(null)
    }
  }, [open, text])

  const handleSourceTypeChange = (value: string) => {
    setSourceType(value)
    if (value !== 'Other') {
      setSource(value)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    
    try {
      // Build metadata object with form values
      // Backend will merge with existing metadata
      const updatedMetadata: TextMetadata = {}
      
      // Convert Dayjs to string format YYYY-MM-DD
      const dateString = date ? date.format('YYYY-MM-DD') : ''
      
      console.log('[TextMetadataEditor] Form state values:')
      console.log('  date (Dayjs):', date)
      console.log('  dateString:', dateString)
      console.log('  author:', author)
      
      // Only include fields that have values
      if (dateString) updatedMetadata.date = dateString
      if (author) updatedMetadata.author = author
      if (source) updatedMetadata.source = source
      if (description) updatedMetadata.description = description
      const effectiveTextType = isCustomTextType ? customTextType : textType
      if (effectiveTextType) {
        updatedMetadata.customFields = { textType: effectiveTextType }
      }
      
      console.log('[TextMetadataEditor] Sending metadata:', updatedMetadata)
      
      const response = await corpusApi.updateText(corpusId, text.id, {
        metadata: updatedMetadata
      })
      
      console.log('[TextMetadataEditor] API response:', response)
      console.log('[TextMetadataEditor] response.data:', response.data)
      console.log('[TextMetadataEditor] response.data?.metadata:', response.data?.metadata)
      
      if (response.success) {
        // Use server response data if available, otherwise merge locally
        let finalText: CorpusText
        if (response.data) {
          console.log('[TextMetadataEditor] Using server response data')
          finalText = response.data
        } else {
          console.log('[TextMetadataEditor] Using local merge (no response.data)')
          // Fallback to local merge if server doesn't return data
          const mergedMetadata: TextMetadata = {
            ...(text.metadata || {}),
            ...updatedMetadata
          }
          finalText = {
            ...text,
            metadata: mergedMetadata
          }
        }
        console.log('[TextMetadataEditor] finalText.metadata:', finalText.metadata)
        onSaved?.(finalText)
        onClose()
      } else {
        setError(response.message || t('common.saveFailed'))
      }
    } catch (err) {
      console.error('[TextMetadataEditor] Save error:', err)
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('corpus.editMetadata')} - {text?.filename}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          
          {/* Date */}
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label={t('corpus.date')}
              value={date}
              onChange={(newValue) => setDate(newValue)}
              format="YYYY-MM-DD"
              slotProps={{
                textField: {
                  fullWidth: true,
                  size: 'small',
                  helperText: t('corpus.dateHelp')
                }
              }}
            />
          </LocalizationProvider>
          
          {/* Author */}
          <TextField
            label={t('corpus.author')}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            fullWidth
            size="small"
          />
          
          {/* Source Type Selection */}
          <FormControl fullWidth size="small">
            <InputLabel>{t('corpus.source')}</InputLabel>
            <Select
              value={sourceType}
              onChange={(e) => handleSourceTypeChange(e.target.value)}
              label={t('corpus.source')}
            >
              {SOURCE_OPTIONS.map(src => {
                const translationKey = SOURCE_TRANSLATION_KEYS[src] || src
                return (
                  <MenuItem key={src} value={src}>
                    {t(translationKey, src)}
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>
          
          {/* Custom Source Input */}
          {sourceType === 'Other' && (
            <TextField
              label={t('corpus.customSource')}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              fullWidth
              size="small"
              placeholder={t('corpus.customSourcePlaceholder', 'Enter custom source...')}
            />
          )}
          
          {/* Text Type */}
          <FormControl fullWidth size="small">
            <InputLabel>{t('corpus.textType')}</InputLabel>
            <Select
              value={isCustomTextType ? CUSTOM_TEXT_TYPE : textType}
              onChange={(e) => {
                const value = e.target.value
                if (value === CUSTOM_TEXT_TYPE) {
                  setIsCustomTextType(true)
                } else {
                  setIsCustomTextType(false)
                  setTextType(value)
                }
              }}
              label={t('corpus.textType')}
              renderValue={(value) => {
                if (value === CUSTOM_TEXT_TYPE) return t('corpus.textTypes.custom')
                return getUsasTextTypeDisplayLabel(
                  value as string,
                  textTypeConfigs[value as string],
                  t,
                  i18n
                )
              }}
            >
              {Object.entries(textTypeConfigs)
                .sort(([a], [b]) => {
                  if (a === 'GEN') return -1
                  if (b === 'GEN') return 1
                  return a.localeCompare(b)
                })
                .map(([code, config]) => (
                  <MenuItem key={code} value={code}>
                    {getUsasTextTypeDisplayLabel(code, config, t, i18n)}
                  </MenuItem>
                ))}
              <Divider />
              <MenuItem value={CUSTOM_TEXT_TYPE}>
                {t('corpus.textTypes.custom')}
              </MenuItem>
            </Select>
          </FormControl>
          {isCustomTextType && (
            <TextField
              label={t('corpus.customTextType')}
              value={customTextType}
              onChange={(e) => setCustomTextType(e.target.value)}
              fullWidth
              size="small"
              placeholder={t('corpus.customTextTypePlaceholder')}
            />
          )}
          
          {/* Description */}
          <TextField
            label={t('corpus.descriptionField')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          disabled={saving}
          startIcon={saving && <CircularProgress size={16} />}
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

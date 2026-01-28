import { useState } from 'react'
import {
  Box,
  TextField,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Checkbox,
  ListItemText,
  Stack,
  IconButton,
  Tooltip,
  SelectChangeEvent
} from '@mui/material'
import FilterListIcon from '@mui/icons-material/FilterList'
import ClearIcon from '@mui/icons-material/Clear'
import { useTranslation } from 'react-i18next'
import type { CorpusFilters, MediaType } from '../../types'

interface TextFilterProps {
  filters: CorpusFilters
  onChange: (filters: CorpusFilters) => void
  availableTags: string[]
  availableLanguages?: string[]
  availableTextTypes?: string[]
}

export default function TextFilter({
  filters,
  onChange,
  availableTags,
  availableLanguages = [],
  availableTextTypes = []
}: TextFilterProps) {
  const { t } = useTranslation()
  
  // Helper function to translate language code
  const translateLanguage = (langCode: string): string => {
    if (!langCode) return ''
    const translationKey = `corpus.languages.${langCode}`
    return t(translationKey, langCode)
  }

  const handleTagChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value
    onChange({
      ...filters,
      tags: typeof value === 'string' ? value.split(',') : value
    })
  }

  const handleMediaTypeChange = (event: SelectChangeEvent<string>) => {
    onChange({
      ...filters,
      mediaType: (event.target.value as MediaType) || undefined
    })
  }

  const handleLanguageChange = (event: SelectChangeEvent<string>) => {
    onChange({
      ...filters,
      language: event.target.value || undefined
    })
  }

  const handleTextTypeChange = (event: SelectChangeEvent<string>) => {
    onChange({
      ...filters,
      textType: event.target.value || undefined
    })
  }

  const handleClear = () => {
    onChange({})
  }

  const hasFilters = !!(
    filters.tags?.length ||
    filters.mediaType ||
    filters.language ||
    filters.textType
  )

  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
      {/* Tag filter */}
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>{t('corpus.tags')}</InputLabel>
        <Select
          multiple
          value={filters.tags || []}
          onChange={handleTagChange}
          input={<OutlinedInput label={t('corpus.tags')} />}
          renderValue={(selected) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.slice(0, 2).map((tag) => (
                <Chip key={tag} label={tag} size="small" />
              ))}
              {selected.length > 2 && (
                <Chip label={`+${selected.length - 2}`} size="small" />
              )}
            </Box>
          )}
        >
          {availableTags.map((tag) => (
            <MenuItem key={tag} value={tag}>
              <Checkbox checked={(filters.tags || []).includes(tag)} size="small" />
              <ListItemText primary={tag} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Media type filter */}
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>Media</InputLabel>
        <Select
          value={filters.mediaType || ''}
          onChange={handleMediaTypeChange}
          label="Media"
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="text">Text</MenuItem>
          <MenuItem value="audio">Audio</MenuItem>
          <MenuItem value="video">Video</MenuItem>
        </Select>
      </FormControl>

      {/* Language filter */}
      {availableLanguages.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>{t('corpus.language')}</InputLabel>
          <Select
            value={filters.language || ''}
            onChange={handleLanguageChange}
            label={t('corpus.language')}
          >
            <MenuItem value="">{t('common.all', 'All')}</MenuItem>
            {availableLanguages.map(lang => (
              <MenuItem key={lang} value={lang}>
                {translateLanguage(lang)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Text type filter */}
      {availableTextTypes.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>{t('corpus.textType')}</InputLabel>
          <Select
            value={filters.textType || ''}
            onChange={handleTextTypeChange}
            label={t('corpus.textType')}
          >
            <MenuItem value="">All</MenuItem>
            {availableTextTypes.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Clear filters */}
      {hasFilters && (
        <Tooltip title={t('common.clear')}>
          <IconButton size="small" onClick={handleClear}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  )
}


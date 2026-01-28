import { useState, useEffect } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
  Checkbox,
  ListItemText,
  Button,
  Typography,
  Paper,
  Divider,
  FormControlLabel,
  Stack,
  SelectChangeEvent
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useCorpusStore } from '../../stores/corpusStore'
import type { Corpus, CorpusText, CorpusFilters, CorpusSelection, PreprocessConfig } from '../../types'
import PreprocessOptions from './PreprocessOptions'

interface CorpusSelectorProps {
  onSelect: (selection: CorpusSelection) => void
  showPreprocessOptions?: boolean
  showTextSelection?: boolean
}

export default function CorpusSelector({ 
  onSelect, 
  showPreprocessOptions = true,
  showTextSelection = true 
}: CorpusSelectorProps) {
  const { t } = useTranslation()
  const { 
    corpora, 
    currentCorpus, 
    selectedTexts, 
    filters,
    setCurrentCorpus,
    selectAllTexts,
    clearSelection,
    toggleTextSelection,
    setFilters
  } = useCorpusStore()

  const [preprocessConfig, setPreprocessConfig] = useState<PreprocessConfig>({
    entityExtraction: false,
    removePunctuation: true,
    textNormalization: true,
    toLowerCase: true,
    removeStopwords: true,
    stopwordsLanguage: 'english'
  })

  // Get all available tags
  const allTags = Array.from(
    new Set(corpora.flatMap(c => [...c.tags, ...c.texts.flatMap(t => t.tags)]))
  )

  // Filter texts based on current filters
  const filteredTexts = currentCorpus?.texts.filter(text => {
    if (filters.tags?.length) {
      if (!filters.tags.some(tag => text.tags.includes(tag))) return false
    }
    if (filters.mediaType && text.mediaType !== filters.mediaType) return false
    return true
  }) || []

  const handleCorpusChange = (event: SelectChangeEvent<string>) => {
    const corpus = corpora.find(c => c.id === event.target.value)
    setCurrentCorpus(corpus || null)
  }

  const handleTagFilterChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value
    setFilters({
      ...filters,
      tags: typeof value === 'string' ? value.split(',') : value
    })
  }

  const handleMediaTypeChange = (event: SelectChangeEvent<string>) => {
    setFilters({
      ...filters,
      mediaType: event.target.value as any || undefined
    })
  }

  const handleApply = () => {
    if (!currentCorpus) return
    
    onSelect({
      corpusId: currentCorpus.id,
      textIds: selectedTexts.length > 0 ? selectedTexts : 'all',
      filters,
      preprocessConfig
    })
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {t('corpus.selectCorpus')}
      </Typography>

      <Stack spacing={2}>
        {/* Corpus selection */}
        <FormControl fullWidth size="small">
          <InputLabel>{t('corpus.selectCorpus')}</InputLabel>
          <Select
            value={currentCorpus?.id || ''}
            onChange={handleCorpusChange}
            label={t('corpus.selectCorpus')}
          >
            {corpora.map(corpus => (
              <MenuItem key={corpus.id} value={corpus.id}>
                {corpus.name} ({corpus.textCount} {t('corpus.textCount')})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {currentCorpus && (
          <>
            <Divider />

            {/* Filters */}
            <Typography variant="subtitle2" color="text.secondary">
              {t('common.filter')}
            </Typography>

            <Stack direction="row" spacing={2}>
              {/* Tag filter */}
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>{t('corpus.filterByTags')}</InputLabel>
                <Select
                  multiple
                  value={filters.tags || []}
                  onChange={handleTagFilterChange}
                  input={<OutlinedInput label={t('corpus.filterByTags')} />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((tag) => (
                        <Chip key={tag} label={tag} size="small" />
                      ))}
                    </Box>
                  )}
                >
                  {allTags.map((tag) => (
                    <MenuItem key={tag} value={tag}>
                      <Checkbox checked={(filters.tags || []).includes(tag)} />
                      <ListItemText primary={tag} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Media type filter */}
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Media Type</InputLabel>
                <Select
                  value={filters.mediaType || ''}
                  onChange={handleMediaTypeChange}
                  label="Media Type"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="audio">Audio</MenuItem>
                  <MenuItem value="video">Video</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* Text selection */}
            {showTextSelection && (
              <>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('corpus.selectTexts')} ({selectedTexts.length} / {filteredTexts.length})
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={selectAllTexts}>
                      {t('corpus.selectAll')}
                    </Button>
                    <Button size="small" onClick={clearSelection}>
                      {t('corpus.clearSelection')}
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                  {filteredTexts.map(text => (
                    <FormControlLabel
                      key={text.id}
                      control={
                        <Checkbox
                          checked={selectedTexts.includes(text.id)}
                          onChange={() => toggleTextSelection(text.id)}
                          size="small"
                        />
                      }
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">{text.filename}</Typography>
                          <Chip label={text.mediaType} size="small" variant="outlined" />
                          {text.tags.map(tag => (
                            <Chip key={tag} label={tag} size="small" color="primary" variant="outlined" />
                          ))}
                        </Box>
                      }
                      sx={{ display: 'flex', width: '100%', m: 0 }}
                    />
                  ))}
                </Box>
              </>
            )}

            {/* Preprocess options */}
            {showPreprocessOptions && (
              <>
                <Divider />
                <PreprocessOptions 
                  config={preprocessConfig}
                  onChange={setPreprocessConfig}
                />
              </>
            )}

            {/* Apply button */}
            <Button 
              variant="contained" 
              onClick={handleApply}
              disabled={!currentCorpus}
            >
              {t('common.analyze')}
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  )
}


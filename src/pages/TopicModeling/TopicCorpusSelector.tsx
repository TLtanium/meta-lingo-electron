/**
 * Topic Modeling Corpus Selector
 * Allows selecting entire corpus, specific documents, or filtering by tags
 */

import { useState, useEffect, useMemo } from 'react'
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
  SelectChangeEvent,
  RadioGroup,
  Radio,
  Alert,
  CircularProgress,
  TextField,
  InputAdornment
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { useTranslation } from 'react-i18next'
import { corpusApi } from '../../api'
import type { Corpus, CorpusText } from '../../types'

type SelectionMode = 'all' | 'selected' | 'tags'

interface TopicCorpusSelectorProps {
  onSelectionChange: (corpusId: string, textIds: string[], language: string, allTexts: CorpusText[]) => void
}

export default function TopicCorpusSelector({ onSelectionChange }: TopicCorpusSelectorProps) {
  const { t } = useTranslation()
  
  // Helper function to translate language
  const translateLanguage = (language: string | undefined): string => {
    if (!language || language === 'N/A') return 'N/A'
    const translationKey = `corpus.languages.${language}`
    return t(translationKey, language)
  }
  
  // Corpus data
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [selectedCorpus, setSelectedCorpus] = useState<Corpus | null>(null)
  const [texts, setTexts] = useState<CorpusText[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTexts, setLoadingTexts] = useState(false)
  
  // Selection state
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('all')
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Load corpora on mount
  useEffect(() => {
    loadCorpora()
  }, [])

  const loadCorpora = async () => {
    setLoading(true)
    try {
      const response = await corpusApi.listCorpora()
      if (response.success && response.data) {
        setCorpora(response.data)
      }
    } catch (err) {
      console.error('Failed to load corpora:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load texts when corpus changes
  useEffect(() => {
    if (selectedCorpus) {
      loadTexts(selectedCorpus.id)
    } else {
      setTexts([])
      setSelectedTextIds([])
      setSelectedTags([])
    }
  }, [selectedCorpus])

  const loadTexts = async (corpusId: string) => {
    setLoadingTexts(true)
    try {
      const response = await corpusApi.getTexts(corpusId)
      if (response.success && response.data) {
        setTexts(response.data)
      }
    } catch (err) {
      console.error('Failed to load texts:', err)
    } finally {
      setLoadingTexts(false)
    }
  }

  // Get all available tags from texts
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    texts.forEach(text => text.tags.forEach(tag => tagSet.add(tag)))
    return Array.from(tagSet).sort()
  }, [texts])

  // Filter texts based on search and tags
  const filteredTexts = useMemo(() => {
    let result = texts
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(t => 
        t.filename.toLowerCase().includes(query) ||
        t.metadata?.author?.toLowerCase().includes(query) ||
        t.metadata?.source?.toLowerCase().includes(query)
      )
    }
    
    if (selectionMode === 'tags' && selectedTags.length > 0) {
      result = result.filter(t => 
        selectedTags.some(tag => t.tags.includes(tag))
      )
    }
    
    return result
  }, [texts, searchQuery, selectionMode, selectedTags])

  // Get selected text IDs based on mode
  const getSelectedTextIds = (): string[] => {
    switch (selectionMode) {
      case 'all':
        return texts.map(t => t.id)
      case 'selected':
        return selectedTextIds
      case 'tags':
        return filteredTexts.map(t => t.id)
      default:
        return []
    }
  }

  // Handle corpus change
  const handleCorpusChange = (event: SelectChangeEvent<string>) => {
    const corpus = corpora.find(c => c.id === event.target.value)
    setSelectedCorpus(corpus || null)
    setSelectionMode('all')
    setSelectedTextIds([])
    setSelectedTags([])
  }

  // Handle text selection toggle
  const handleTextToggle = (textId: string) => {
    setSelectedTextIds(prev => 
      prev.includes(textId) 
        ? prev.filter(id => id !== textId)
        : [...prev, textId]
    )
  }

  // Handle select all / deselect all
  const handleSelectAll = () => {
    setSelectedTextIds(filteredTexts.map(t => t.id))
  }

  const handleDeselectAll = () => {
    setSelectedTextIds([])
  }

  // Notify parent of selection change
  useEffect(() => {
    if (selectedCorpus) {
      const textIds = getSelectedTextIds()
      const language = selectedCorpus.language || 'english'
      // Pass all texts for dynamic topic analysis date counting
      onSelectionChange(selectedCorpus.id, textIds, language, texts)
    } else {
      onSelectionChange('', [], 'english', [])
    }
  }, [selectedCorpus, selectionMode, selectedTextIds, selectedTags, texts])

  const selectedCount = getSelectedTextIds().length

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {t('topicModeling.corpus.title')}
      </Typography>

      <Stack spacing={2}>
        {/* Corpus selection */}
        <FormControl fullWidth size="small">
          <InputLabel>{t('corpus.selectCorpus')}</InputLabel>
          <Select
            value={selectedCorpus?.id || ''}
            onChange={handleCorpusChange}
            label={t('corpus.selectCorpus')}
            disabled={loading}
          >
            {corpora.map(corpus => (
              <MenuItem key={corpus.id} value={corpus.id}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography>{corpus.name}</Typography>
                  <Chip label={`${corpus.textCount} ${t('corpus.textsCount')}`} size="small" />
                  {corpus.language && (
                    <Chip label={corpus.language} size="small" variant="outlined" />
                  )}
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedCorpus && (
          <>
            {/* Corpus info */}
            <Alert severity="info" icon={false}>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <Typography variant="body2">
                  <strong>{t('corpus.language')}:</strong> {translateLanguage(selectedCorpus.language)}
                </Typography>
                {selectedCorpus.author && (
                  <Typography variant="body2">
                    <strong>{t('corpus.author')}:</strong> {selectedCorpus.author}
                  </Typography>
                )}
                {selectedCorpus.textType && (
                  <Typography variant="body2">
                    <strong>{t('corpus.textType')}:</strong> {selectedCorpus.textType}
                  </Typography>
                )}
              </Stack>
            </Alert>

            <Divider />

            {/* Selection mode */}
            <Typography variant="subtitle2" color="text.secondary">
              {t('topicModeling.corpus.selectionMode')}
            </Typography>
            
            <RadioGroup
              value={selectionMode}
              onChange={(e) => setSelectionMode(e.target.value as SelectionMode)}
            >
              <FormControlLabel 
                value="all" 
                control={<Radio size="small" />} 
                label={
                  <Typography variant="body2">
                    {t('topicModeling.corpus.selectAll')} ({texts.length} {t('corpus.textsCount')})
                  </Typography>
                }
              />
              <FormControlLabel 
                value="tags" 
                control={<Radio size="small" />} 
                label={
                  <Typography variant="body2">
                    {t('topicModeling.corpus.selectByTags')}
                  </Typography>
                }
              />
              <FormControlLabel 
                value="selected" 
                control={<Radio size="small" />} 
                label={
                  <Typography variant="body2">
                    {t('topicModeling.corpus.selectManually')}
                  </Typography>
                }
              />
            </RadioGroup>

            {/* Tag selection (when mode is 'tags') */}
            {selectionMode === 'tags' && (
              <FormControl size="small" fullWidth>
                <InputLabel>{t('corpus.filterByTags')}</InputLabel>
                <Select
                  multiple
                  value={selectedTags}
                  onChange={(e) => setSelectedTags(e.target.value as string[])}
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
                      <Checkbox checked={selectedTags.includes(tag)} size="small" />
                      <ListItemText primary={tag} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Manual selection (when mode is 'selected') */}
            {selectionMode === 'selected' && (
              <>
                <TextField
                  size="small"
                  placeholder={t('common.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }}
                  fullWidth
                />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {selectedTextIds.length} / {filteredTexts.length} {t('common.selected')}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={handleSelectAll}>
                      {t('common.selectAll')}
                    </Button>
                    <Button size="small" onClick={handleDeselectAll}>
                      {t('common.deselectAll')}
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ 
                  maxHeight: 200, 
                  overflow: 'auto', 
                  border: 1, 
                  borderColor: 'divider', 
                  borderRadius: 1 
                }}>
                  {loadingTexts ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : filteredTexts.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                      {t('common.noData')}
                    </Typography>
                  ) : (
                    filteredTexts.map(text => (
                      <FormControlLabel
                        key={text.id}
                        control={
                          <Checkbox
                            checked={selectedTextIds.includes(text.id)}
                            onChange={() => handleTextToggle(text.id)}
                            size="small"
                          />
                        }
                        label={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                              {text.filename}
                            </Typography>
                            <Chip label={text.mediaType} size="small" variant="outlined" />
                            <Typography variant="caption" color="text.secondary">
                              {text.wordCount} words
                            </Typography>
                          </Stack>
                        }
                        sx={{ 
                          display: 'flex', 
                          width: '100%', 
                          m: 0, 
                          px: 1,
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                      />
                    ))
                  )}
                </Box>
              </>
            )}

            {/* Selection summary */}
            <Alert 
              severity={selectedCount > 0 ? 'success' : 'warning'} 
              icon={false}
            >
              <Typography variant="body2">
                {t('topicModeling.corpus.selectedCount')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}
              </Typography>
            </Alert>
          </>
        )}
      </Stack>
    </Paper>
  )
}

/**
 * Synonym Analysis Page
 * Analyze word synonyms using NLTK WordNet with SpaCy annotation data
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  LinearProgress,
  Tabs,
  Tab,
  Divider,
  Stack,
  Chip,
  Button,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  Radio,
  FormControlLabel,
  TextField,
  InputAdornment,
  Checkbox,
  CircularProgress,
  SelectChangeEvent,
  OutlinedInput,
  ListItemText
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TableChartIcon from '@mui/icons-material/TableChart'
import { useTranslation } from 'react-i18next'
import { corpusApi, analysisApi } from '../../api'
import type { Corpus, CorpusText } from '../../types'
import type { 
  SynonymResult,
  SynonymRequest,
  SynonymVizConfig,
  POSOption
} from '../../types/synonym'
import { DEFAULT_SYNONYM_REQUEST, DEFAULT_VIZ_CONFIG, POS_FILTER_OPTIONS } from '../../types/synonym'
import POSFilterPanel from './POSFilterPanel'
import SearchConfigPanel from './SearchConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'

type SelectionMode = 'all' | 'selected' | 'tags'

export default function SynonymAnalysis() {
  const { t } = useTranslation()

  // Corpus state
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [selectedCorpus, setSelectedCorpus] = useState<Corpus | null>(null)
  const [texts, setTexts] = useState<CorpusText[]>([])
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('all')
  const [textSearch, setTextSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingTexts, setLoadingTexts] = useState(false)

  // Filter state
  const [posFilter, setPosFilter] = useState<string>('auto')
  const [searchQuery, setSearchQuery] = useState('')
  const [minFreq, setMinFreq] = useState(1)
  const [maxResults, setMaxResults] = useState(100)
  const [lowercase, setLowercase] = useState(true)

  // Results state
  const [results, setResults] = useState<SynonymResult[]>([])
  const [totalWords, setTotalWords] = useState(0)
  const [uniqueWords, setUniqueWords] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selection state
  const [selectedWords, setSelectedWords] = useState<string[]>([])

  // Visualization state
  const [vizConfig, setVizConfig] = useState<SynonymVizConfig>(DEFAULT_VIZ_CONFIG)
  
  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

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

  // Get all available tags from texts
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    texts.forEach(text => text.tags.forEach(tag => tagSet.add(tag)))
    return Array.from(tagSet).sort()
  }, [texts])

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

  // Filter texts based on search and tags
  const filteredTexts = useMemo(() => {
    let result = texts
    
    if (textSearch) {
      const query = textSearch.toLowerCase()
      result = result.filter(t => 
        t.filename.toLowerCase().includes(query) ||
        t.originalFilename?.toLowerCase().includes(query)
      )
    }
    
    if (selectionMode === 'tags' && selectedTags.length > 0) {
      result = result.filter(t => 
        selectedTags.some(tag => t.tags.includes(tag))
      )
    }
    
    return result
  }, [texts, textSearch, selectionMode, selectedTags])

  // Get selected text IDs based on mode
  const getSelectedTextIds = (): string[] | 'all' => {
    switch (selectionMode) {
      case 'all':
        return 'all'
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
    setResults([])
    setError(null)
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

  // Run analysis
  const handleAnalyze = async () => {
    if (!selectedCorpus) return

    setIsLoading(true)
    setError(null)

    try {
      const request: SynonymRequest = {
        corpus_id: selectedCorpus.id,
        text_ids: getSelectedTextIds(),
        pos_filter: posFilter,
        search_query: searchQuery,
        min_freq: minFreq,
        max_results: maxResults,
        lowercase
      }

      const response = await analysisApi.synonymAnalysis(request)
      
      if (response.success && response.data) {
        if (response.data.success) {
          setResults(response.data.results)
          setTotalWords(response.data.total_words)
          setUniqueWords(response.data.unique_words)
          setSelectedWords([])
        } else {
          setError(response.data.error || 'Analysis failed')
        }
      } else {
        setError(response.error || 'Analysis failed')
      }
    } catch (err: any) {
      setError(err.message || 'Analysis failed')
    } finally {
      setIsLoading(false)
    }
  }

  // Check if analysis can run
  const canAnalyze = selectedCorpus && (
    selectionMode === 'all' || 
    (selectionMode === 'tags' && selectedTags.length > 0 && filteredTexts.length > 0) ||
    (selectionMode === 'selected' && selectedTextIds.length > 0)
  )

  const selectedCount = (() => {
    const ids = getSelectedTextIds()
    return ids === 'all' ? texts.length : ids.length
  })()

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      {/* Left panel - Configuration */}
      <Box sx={{ 
        width: 400, 
        borderRight: 1, 
        borderColor: 'divider', 
        overflow: 'auto', 
        p: 2,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Typography variant="h6" gutterBottom>
          {t('synonym.title')}
        </Typography>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="secondary" variant="outlined" />
          {selectedCorpus?.language && (
            <Chip 
              label={`${t('corpus.language')}: ${selectedCorpus.language}`}
              size="small" 
              variant="outlined"
            />
          )}
        </Stack>

        {/* 1. Corpus Selection */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('synonym.corpus.title')}
          </Typography>

          <Stack spacing={2}>
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
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedCorpus && (
              <>
                <Divider />

                {/* Selection mode */}
                <RadioGroup
                  value={selectionMode}
                  onChange={(e) => setSelectionMode(e.target.value as SelectionMode)}
                >
                  <FormControlLabel 
                    value="all" 
                    control={<Radio size="small" />} 
                    label={
                      <Typography variant="body2">
                        {t('synonym.corpus.selectAll')} ({texts.length} {t('corpus.textsCount')})
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
                        {t('synonym.corpus.selectManually')}
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

                {/* Manual selection */}
                {selectionMode === 'selected' && (
                  <>
                    <TextField
                      size="small"
                      placeholder={t('common.search')}
                      value={textSearch}
                      onChange={(e) => setTextSearch(e.target.value)}
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
                          {t('common.clearAll')}
                        </Button>
                      </Stack>
                    </Box>

                    <Box sx={{ 
                      maxHeight: 150, 
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
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {text.filename}
                              </Typography>
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
                  sx={{ py: 0.5 }}
                >
                  <Typography variant="body2">
                    {t('synonym.corpus.selectedCount')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}
                  </Typography>
                </Alert>
              </>
            )}
          </Stack>
        </Paper>

        {/* 2. POS Filter Panel */}
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            value={posFilter}
            onChange={setPosFilter}
            disabled={!selectedCorpus}
          />
        </Box>

        {/* 3. Search Config Panel */}
        <Box sx={{ mb: 2 }}>
          <SearchConfigPanel
            searchQuery={searchQuery}
            minFreq={minFreq}
            maxResults={maxResults}
            lowercase={lowercase}
            onSearchQueryChange={setSearchQuery}
            onMinFreqChange={setMinFreq}
            onMaxResultsChange={setMaxResults}
            onLowercaseChange={setLowercase}
            disabled={!selectedCorpus}
          />
        </Box>

        {/* 4. Analyze Button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={handleAnalyze}
          disabled={!canAnalyze || isLoading}
          fullWidth
        >
          {isLoading ? t('common.loading') : t('synonym.analyze')}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>

      {/* Right panel - Results & Visualization */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isLoading && <LinearProgress />}

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)}>
            <Tab label={t('synonym.results.title')} />
            <Tab label={t('synonym.visualization.title')} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 ? (
            results.length > 0 ? (
              <ResultsTable
                results={results}
                totalWords={totalWords}
                uniqueWords={uniqueWords}
                selectedWords={selectedWords}
                onSelectionChange={setSelectedWords}
                isLoading={isLoading}
                corpusId={selectedCorpus?.id}
                textIds={getSelectedTextIds()}
                selectionMode={selectionMode}
                selectedTags={selectedTags}
              />
            ) : (
              <Box sx={{ 
                height: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 2,
                p: 4
              }}>
                <TableChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('synonym.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('synonym.description')}
                </Typography>
              </Box>
            )
          ) : (
            <VisualizationPanel
              data={results}
              config={vizConfig}
              onConfigChange={setVizConfig}
              onWordClick={(word) => {
                // Find all entries matching this word (may have multiple POS)
                const matchingKeys = results
                  .filter(r => r.word === word)
                  .map(r => `${r.word}-${r.pos_tags[0] || ''}`)
                // Add all matching keys that aren't already selected
                const newKeys = matchingKeys.filter(k => !selectedWords.includes(k))
                if (newKeys.length > 0) {
                  setSelectedWords([...selectedWords, ...newKeys])
                }
                setRightTab(0)
              }}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}

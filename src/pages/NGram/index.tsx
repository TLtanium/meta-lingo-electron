/**
 * N-gram Analysis Page
 * Full N-gram analysis with POS filtering, search, multiple N values, and visualizations
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
  Switch,
  FormGroup,
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
import type { POSTagInfo } from '../../types/wordFrequency'
import type { 
  POSFilterConfig,
  SearchConfig,
  NGramConfig,
  NGramResult,
  NGramRequest,
  NGramVisualizationConfig,
  TableSortConfig,
  TablePaginationConfig
} from '../../types/ngram'
import {
  DEFAULT_POS_FILTER,
  DEFAULT_SEARCH_CONFIG,
  DEFAULT_NGRAM_CONFIG,
  DEFAULT_VIZ_CONFIG,
  DEFAULT_TABLE_SORT,
  DEFAULT_TABLE_PAGINATION,
  N_VALUE_OPTIONS
} from '../../types/ngram'
import POSFilterPanel from './POSFilterPanel'
import SearchConfigPanel from './SearchConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'

type SelectionMode = 'all' | 'selected' | 'tags'

export default function NGram() {
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

  // POS tags
  const [posTags, setPosTags] = useState<POSTagInfo[]>([])

  // Filter state
  const [posFilter, setPosFilter] = useState<POSFilterConfig>(DEFAULT_POS_FILTER)
  const [searchConfig, setSearchConfig] = useState<SearchConfig>(DEFAULT_SEARCH_CONFIG)
  const [ngramConfig, setNgramConfig] = useState<NGramConfig>(DEFAULT_NGRAM_CONFIG)
  const [minFreq, setMinFreq] = useState(2)
  const [maxFreq, setMaxFreq] = useState<number | null>(null)
  const [lowercase, setLowercase] = useState(true)

  // Results state
  const [results, setResults] = useState<NGramResult[]>([])
  const [totalNgrams, setTotalNgrams] = useState(0)
  const [uniqueNgrams, setUniqueNgrams] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Table state
  const [sortConfig, setSortConfig] = useState<TableSortConfig>(DEFAULT_TABLE_SORT)
  const [paginationConfig, setPaginationConfig] = useState<TablePaginationConfig>(DEFAULT_TABLE_PAGINATION)
  const [selectedNgrams, setSelectedNgrams] = useState<string[]>([])

  // Visualization state
  const [vizConfig, setVizConfig] = useState<NGramVisualizationConfig>(DEFAULT_VIZ_CONFIG)
  
  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

  // Load corpora and POS tags on mount
  useEffect(() => {
    loadCorpora()
    loadPosTags()
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

  const loadPosTags = async () => {
    try {
      const response = await analysisApi.getPosTags()
      if (response.success && response.data) {
        setPosTags(response.data)
      }
    } catch (err) {
      console.error('Failed to load POS tags:', err)
      // Use default POS tags
      setPosTags([
        { tag: 'ADJ', description_en: 'Adjective', description_zh: '形容词' },
        { tag: 'ADP', description_en: 'Adposition', description_zh: '介词' },
        { tag: 'ADV', description_en: 'Adverb', description_zh: '副词' },
        { tag: 'AUX', description_en: 'Auxiliary verb', description_zh: '助动词' },
        { tag: 'CCONJ', description_en: 'Coordinating conjunction', description_zh: '并列连词' },
        { tag: 'DET', description_en: 'Determiner', description_zh: '限定词' },
        { tag: 'INTJ', description_en: 'Interjection', description_zh: '感叹词' },
        { tag: 'NOUN', description_en: 'Noun', description_zh: '名词' },
        { tag: 'NUM', description_en: 'Numeral', description_zh: '数词' },
        { tag: 'PART', description_en: 'Particle', description_zh: '助词' },
        { tag: 'PRON', description_en: 'Pronoun', description_zh: '代词' },
        { tag: 'PROPN', description_en: 'Proper noun', description_zh: '专有名词' },
        { tag: 'PUNCT', description_en: 'Punctuation', description_zh: '标点' },
        { tag: 'SCONJ', description_en: 'Subordinating conjunction', description_zh: '从属连词' },
        { tag: 'SYM', description_en: 'Symbol', description_zh: '符号' },
        { tag: 'VERB', description_en: 'Verb', description_zh: '动词' },
        { tag: 'X', description_en: 'Other', description_zh: '其他' }
      ])
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

  // Handle N value toggle
  const handleNValueToggle = (n: number) => {
    setNgramConfig(prev => {
      const newNValues = prev.nValues.includes(n)
        ? prev.nValues.filter(v => v !== n)
        : [...prev.nValues, n].sort((a, b) => a - b)
      
      // Ensure at least one N value is selected
      if (newNValues.length === 0) {
        return prev
      }
      
      return { ...prev, nValues: newNValues }
    })
  }

  // Run analysis
  const handleAnalyze = async () => {
    if (!selectedCorpus) return

    setIsLoading(true)
    setError(null)

    try {
      const request: NGramRequest = {
        corpus_id: selectedCorpus.id,
        text_ids: getSelectedTextIds(),
        n_values: ngramConfig.nValues,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        search_config: searchConfig.searchType !== 'all' || searchConfig.excludeWords.length > 0 
          ? searchConfig 
          : undefined,
        min_freq: minFreq,
        max_freq: maxFreq ?? undefined,
        min_word_length: ngramConfig.minWordLength,
        lowercase,
        nest_ngram: ngramConfig.nestNgram
      }

      const response = await analysisApi.ngramAnalysis(request)
      
      if (response.success && response.data) {
        if (response.data.success) {
          setResults(response.data.results)
          setTotalNgrams(response.data.total_ngrams)
          setUniqueNgrams(response.data.unique_ngrams)
          setSelectedNgrams([])
          // Reset pagination
          setPaginationConfig({ ...paginationConfig, page: 0 })
        } else {
          setError(response.data.error || t('common.error'))
        }
      } else {
        setError(response.error || t('common.error'))
      }
    } catch (err: any) {
      setError(err.message || t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  // Check if analysis can run
  const canAnalyze = selectedCorpus && (
    selectionMode === 'all' || 
    (selectionMode === 'tags' && selectedTags.length > 0 && filteredTexts.length > 0) ||
    (selectionMode === 'selected' && selectedTextIds.length > 0)
  ) && ngramConfig.nValues.length > 0

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
          {t('ngram.title')}
        </Typography>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
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
            {t('ngram.corpus.title')}
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
                        {t('ngram.corpus.selectAll')} ({texts.length} {t('corpus.textsCount')})
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
                        {t('ngram.corpus.selectManually')}
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
                    {t('ngram.corpus.selectedCount')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}
                  </Typography>
                </Alert>
              </>
            )}
          </Stack>
        </Paper>

        {/* 2. N-gram Parameters */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('ngram.nValueSelect')}
          </Typography>
          
          <FormGroup row>
            {N_VALUE_OPTIONS.map(option => (
              <FormControlLabel
                key={option.value}
                control={
                  <Checkbox
                    checked={ngramConfig.nValues.includes(option.value)}
                    onChange={() => handleNValueToggle(option.value)}
                    size="small"
                    disabled={!selectedCorpus}
                  />
                }
                label={
                  <Typography variant="body2">{option.label}</Typography>
                }
              />
            ))}
          </FormGroup>

          <Divider sx={{ my: 1.5 }} />

          <FormControlLabel
            control={
              <Switch
                checked={ngramConfig.nestNgram}
                onChange={(e) => setNgramConfig(prev => ({ ...prev, nestNgram: e.target.checked }))}
                size="small"
                disabled={!selectedCorpus || ngramConfig.nValues.length < 2}
              />
            }
            label={
              <Stack>
                <Typography variant="body2">{t('ngram.nestNgram')}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('ngram.nestNgramDesc')}
                </Typography>
              </Stack>
            }
          />
        </Paper>

        {/* 3. POS Filter Panel */}
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            config={posFilter}
            onChange={setPosFilter}
            posTags={posTags}
            disabled={!selectedCorpus}
          />
        </Box>

        {/* 4. Search Config Panel */}
        <Box sx={{ mb: 2 }}>
          <SearchConfigPanel
            config={searchConfig}
            onChange={setSearchConfig}
            minFreq={minFreq}
            maxFreq={maxFreq}
            minWordLength={ngramConfig.minWordLength}
            lowercase={lowercase}
            onMinFreqChange={setMinFreq}
            onMaxFreqChange={setMaxFreq}
            onMinWordLengthChange={(val) => setNgramConfig(prev => ({ ...prev, minWordLength: val }))}
            onLowercaseChange={setLowercase}
            disabled={!selectedCorpus}
          />
        </Box>

        {/* 5. Analyze Button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={handleAnalyze}
          disabled={!canAnalyze || isLoading}
          fullWidth
        >
          {isLoading ? t('common.loading') : t('ngram.analyze')}
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
            <Tab label={t('ngram.results.title')} />
            <Tab label={t('ngram.visualization.title')} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 ? (
            results.length > 0 ? (
              <ResultsTable
                results={results}
                totalNgrams={totalNgrams}
                uniqueNgrams={uniqueNgrams}
                sortConfig={sortConfig}
                paginationConfig={paginationConfig}
                selectedNgrams={selectedNgrams}
                onSortChange={setSortConfig}
                onPaginationChange={setPaginationConfig}
                onSelectionChange={setSelectedNgrams}
                isLoading={isLoading}
                nestMode={ngramConfig.nestNgram}
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
                  {t('ngram.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('ngram.description')}
                </Typography>
              </Box>
            )
          ) : (
            <VisualizationPanel
              data={results}
              config={vizConfig}
              onConfigChange={setVizConfig}
              onNgramClick={(ngram) => {
                // Add ngram to selection
                if (!selectedNgrams.includes(ngram)) {
                  setSelectedNgrams([...selectedNgrams, ngram])
                }
                // Switch to results tab
                setRightTab(0)
              }}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}

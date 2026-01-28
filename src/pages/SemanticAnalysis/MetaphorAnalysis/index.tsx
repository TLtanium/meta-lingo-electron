/**
 * Metaphor Analysis Page
 * MIPVU-based metaphor analysis with POS filtering, search, and visualizations
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
  OutlinedInput,
  ListItemText
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import { useTranslation } from 'react-i18next'
import { corpusApi, analysisApi } from '../../../api'
import type { Corpus, CorpusText } from '../../../types'
import type {
  MetaphorResult,
  MetaphorStatistics,
  MetaphorAnalysisRequest,
  POSFilterConfig,
  SearchConfig,
  MetaphorVisualizationConfig
} from '../../../types/metaphorAnalysis'
import { DEFAULT_METAPHOR_VIZ_CONFIG } from '../../../types/metaphorAnalysis'
import POSFilterPanel from '../../WordFrequency/POSFilterPanel'
import SearchConfigPanel from '../../WordFrequency/SearchConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'
import type { POSTagInfo } from '../../../types/wordFrequency'

type SelectionMode = 'all' | 'selected' | 'tags'

const DEFAULT_POS_FILTER: POSFilterConfig = {
  selectedPOS: [],
  keepMode: true
}

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  searchType: 'all',
  searchValue: '',
  excludeWords: [],
  searchTarget: 'word',
  removeStopwords: false
}

export default function MetaphorAnalysis() {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

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
  const [minFreq, setMinFreq] = useState(1)
  const [maxFreq, setMaxFreq] = useState<number | null>(null)
  const [lowercase, setLowercase] = useState(true)

  // Results state
  const [results, setResults] = useState<MetaphorResult[]>([])
  const [statistics, setStatistics] = useState<MetaphorStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Table state
  const [selectedWords, setSelectedWords] = useState<string[]>([])

  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

  // Visualization config
  const [vizConfig, setVizConfig] = useState<MetaphorVisualizationConfig>(DEFAULT_METAPHOR_VIZ_CONFIG)

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
        // Only show English corpora (MIPVU only supports English)
        const englishCorpora = response.data.filter(
          c => c.language?.toLowerCase() === 'english' || c.language?.toLowerCase() === 'en'
        )
        setCorpora(englishCorpora)
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

  // Filter texts based on search
  const filteredTexts = useMemo(() => {
    let result = texts

    if (textSearch) {
      const query = textSearch.toLowerCase()
      result = result.filter(t =>
        t.filename.toLowerCase().includes(query) ||
        t.originalFilename?.toLowerCase().includes(query)
      )
    }

    return result
  }, [texts, textSearch])

  const handleCorpusChange = (event: any) => {
    const corpusId = event.target.value
    const corpus = corpora.find(c => c.id === corpusId) || null
    setSelectedCorpus(corpus)
    setResults([])
    setStatistics(null)
    setError(null)
  }

  const handleTextToggle = (textId: string) => {
    setSelectedTextIds(prev =>
      prev.includes(textId)
        ? prev.filter(id => id !== textId)
        : [...prev, textId]
    )
  }

  const handleSelectAll = () => {
    setSelectedTextIds(filteredTexts.map(t => t.id))
  }

  const handleDeselectAll = () => {
    setSelectedTextIds([])
  }

  const getSelectedTextIds = (): string[] | 'all' => {
    if (selectionMode === 'all') {
      return 'all'
    }
    if (selectionMode === 'tags') {
      if (selectedTags.length === 0) return 'all'
      return texts
        .filter(t => t.tags.some(tag => selectedTags.includes(tag)))
        .map(t => t.id)
    }
    return selectedTextIds.length > 0 ? selectedTextIds : 'all'
  }

  const handleAnalyze = async () => {
    if (!selectedCorpus) return

    setIsLoading(true)
    setError(null)

    try {
      const request: MetaphorAnalysisRequest = {
        corpus_id: selectedCorpus.id,
        text_ids: getSelectedTextIds(),
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        search_config: searchConfig.searchValue || searchConfig.excludeWords.length > 0 ? searchConfig : undefined,
        min_freq: minFreq,
        max_freq: maxFreq || undefined,
        lowercase,
        result_mode: 'word'
      }

      const response = await analysisApi.metaphorAnalysis(request)

      if (response.success && response.data) {
        // Check if backend returned success
        if (response.data.success) {
          setResults(response.data.results)
          setStatistics(response.data.statistics)
        } else {
          setError(response.data.error || t('common.error'))
        }
      } else {
        setError(response.error || t('common.error'))
      }
    } catch (err: any) {
      console.error('Metaphor analysis error:', err)
      setError(err.message || t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  const canAnalyze = selectedCorpus && !isLoading

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
          {isZh ? '隐喻分析' : 'Metaphor Analysis'}
        </Typography>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="MIPVU" size="small" color="primary" variant="outlined" />
          <Chip label={isZh ? '仅英语' : 'English Only'} size="small" color="warning" variant="outlined" />
        </Stack>

        {/* 1. Corpus Selection */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('wordFrequency.corpus.title')}
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
                        {t('wordFrequency.corpus.selectAll')} ({texts.length} {t('corpus.textsCount')})
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
                        {t('wordFrequency.corpus.selectManually')}
                      </Typography>
                    }
                  />
                </RadioGroup>

                {/* Tag selection */}
                {selectionMode === 'tags' && allTags.length > 0 && (
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
                    {t('wordFrequency.corpus.selectedCount')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}
                  </Typography>
                </Alert>
              </>
            )}
          </Stack>
        </Paper>

        {/* 2. POS Filter Panel */}
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            config={posFilter}
            onChange={setPosFilter}
            posTags={posTags}
            disabled={!selectedCorpus}
          />
        </Box>

        {/* 3. Search Config Panel */}
        <Box sx={{ mb: 2 }}>
          <SearchConfigPanel
            config={searchConfig}
            onChange={setSearchConfig}
            minFreq={minFreq}
            maxFreq={maxFreq}
            lowercase={lowercase}
            onMinFreqChange={setMinFreq}
            onMaxFreqChange={setMaxFreq}
            onLowercaseChange={setLowercase}
            disabled={!selectedCorpus}
            corpusLanguage="english"
            hideSearchTarget
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
          {isLoading ? t('common.loading') : (isZh ? '开始分析' : 'Start Analysis')}
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
            <Tab label={isZh ? '分析结果' : 'Analysis Results'} />
            <Tab label={isZh ? '可视化' : 'Visualization'} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 ? (
            results.length > 0 ? (
              <ResultsTable
                results={results}
                statistics={statistics}
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
                <AutoGraphIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {isZh ? '隐喻分析' : 'Metaphor Analysis'}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {isZh
                    ? '选择语料库并点击开始分析按钮'
                    : 'Select a corpus and click Start Analysis'}
                </Typography>
              </Box>
            )
          ) : (
            <VisualizationPanel
              data={results}
              statistics={statistics}
              config={vizConfig}
              onConfigChange={setVizConfig}
              onWordClick={(word) => {
                if (!selectedWords.includes(word)) {
                  setSelectedWords([...selectedWords, word])
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

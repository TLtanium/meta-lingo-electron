/**
 * Single Document Keyword Extraction Tab
 * TF-IDF, TextRank, YAKE!, RAKE algorithms
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
  ListItemText,
  Switch
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TableChartIcon from '@mui/icons-material/TableChart'
import { useTranslation } from 'react-i18next'
import { corpusApi } from '../../../api'
import { keywordApi } from '../../../api/analysis'
import type { Corpus, CorpusText } from '../../../types'
import type { 
  POSFilterConfig,
  POSTagInfo,
  SingleDocAlgorithm,
  SingleDocKeyword,
  SingleDocConfig,
  StopwordsConfig
} from '../../../types/keyword'
import {
  DEFAULT_SINGLEDOC_CONFIG,
  DEFAULT_POS_FILTER,
  DEFAULT_STOPWORDS_CONFIG
} from '../../../types/keyword'

import POSFilterPanel from '../POSFilterPanel'
import AlgorithmConfigPanel from './AlgorithmConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'

type SelectionMode = 'all' | 'selected' | 'tags'

export default function SingleDocTab() {
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
  const [lowercase, setLowercase] = useState(true)
  
  // Stopwords config
  const [stopwordsConfig, setStopwordsConfig] = useState<StopwordsConfig>(DEFAULT_STOPWORDS_CONFIG)
  const [excludeWordsText, setExcludeWordsText] = useState('')

  // Algorithm config
  const [algorithm, setAlgorithm] = useState<SingleDocAlgorithm>('tfidf')
  const [config, setConfig] = useState<SingleDocConfig>(DEFAULT_SINGLEDOC_CONFIG)

  // Results state
  const [results, setResults] = useState<SingleDocKeyword[]>([])
  const [totalKeywords, setTotalKeywords] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Handle exclude words text change (parse on blur)
  const handleExcludeWordsBlur = () => {
    const words = excludeWordsText
      .split(/[\n,;]/)
      .map(w => w.trim())
      .filter(w => w.length > 0)
    setStopwordsConfig(prev => ({ ...prev, excludeWords: words }))
  }

  // Handle stopwords toggle
  const handleStopwordsToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setStopwordsConfig(prev => ({ ...prev, removeStopwords: event.target.checked }))
  }

  // Run analysis
  const handleAnalyze = async () => {
    if (!selectedCorpus) return

    setIsLoading(true)
    setError(null)

    try {
      // Get algorithm-specific config
      const algorithmConfig = config[algorithm]
      
      // Build stopwords config (only pass if enabled or has exclude words)
      const hasStopwordsConfig = stopwordsConfig.removeStopwords || stopwordsConfig.excludeWords.length > 0
      
      const response = await keywordApi.singleDoc({
        corpus_id: selectedCorpus.id,
        text_ids: getSelectedTextIds(),
        algorithm,
        config: algorithmConfig,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        lowercase,
        stopwords_config: hasStopwordsConfig ? stopwordsConfig : undefined,
        language: selectedCorpus.language || 'english'
      })
      
      if (response.success && response.data) {
        if (response.data.success) {
          setResults(response.data.results)
          setTotalKeywords(response.data.total_keywords)
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
    <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
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
          {t('keyword.singleDoc.title', 'Single Document Keywords')}
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
            {t('keyword.corpus.title', 'Corpus Selection')}
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
                        {t('keyword.corpus.selectAll', 'All texts')} ({texts.length} {t('corpus.textsCount')})
                      </Typography>
                    }
                  />
                  <FormControlLabel 
                    value="tags" 
                    control={<Radio size="small" />} 
                    label={
                      <Typography variant="body2">
                        {t('keyword.corpus.selectByTags', 'By tags')}
                      </Typography>
                    }
                  />
                  <FormControlLabel 
                    value="selected" 
                    control={<Radio size="small" />} 
                    label={
                      <Typography variant="body2">
                        {t('keyword.corpus.selectManually', 'Manual selection')}
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
                    {t('keyword.corpus.selectedCount', 'Selected')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}
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

        {/* 3. Stopwords & Exclude Words (matching Word Frequency design) */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('keyword.stopwords.excludeWords')}
          </Typography>
          
          {/* Remove Stopwords Toggle */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={stopwordsConfig.removeStopwords}
                  onChange={handleStopwordsToggle}
                  size="small"
                  disabled={!selectedCorpus}
                />
              }
              label={
                <Typography variant="body2">
                  {t('keyword.stopwords.removeStopwords')}
                </Typography>
              }
              sx={{ mr: 0 }}
            />
            {stopwordsConfig.removeStopwords && selectedCorpus && (
              <Chip 
                label={selectedCorpus.language || 'english'} 
                size="small" 
                variant="outlined"
                color="info"
              />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, ml: 4 }}>
            {t('keyword.stopwords.removeStopwordsHelp')}
          </Typography>

          {/* Exclude Words */}
          <TextField
            label={t('keyword.stopwords.excludeWords')}
            multiline
            rows={3}
            fullWidth
            size="small"
            value={excludeWordsText}
            onChange={(e) => setExcludeWordsText(e.target.value)}
            onBlur={handleExcludeWordsBlur}
            placeholder={t('keyword.stopwords.excludeWordsPlaceholder')}
            helperText={t('keyword.stopwords.excludeWordsHelp')}
            disabled={!selectedCorpus}
          />
        </Paper>

        {/* 4. Algorithm Config Panel */}
        <Box sx={{ mb: 2 }}>
          <AlgorithmConfigPanel
            algorithm={algorithm}
            config={config}
            onAlgorithmChange={setAlgorithm}
            onConfigChange={setConfig}
            lowercase={lowercase}
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
          {isLoading ? t('common.loading') : t('keyword.analyze', 'Extract Keywords')}
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
            <Tab label={t('keyword.results.title', 'Results')} />
            <Tab label={t('keyword.visualization.title', 'Visualization')} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 ? (
            results.length > 0 ? (
              <ResultsTable
                results={results}
                totalKeywords={totalKeywords}
                algorithm={algorithm}
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
                  {t('keyword.singleDoc.title', 'Single Document Keywords')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('keyword.singleDoc.description', 'Extract keywords using TF-IDF, TextRank, YAKE!, or RAKE algorithms')}
                </Typography>
              </Box>
            )
          ) : (
            <VisualizationPanel
              data={results}
              onKeywordClick={(keyword) => {
                setRightTab(0)
              }}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}


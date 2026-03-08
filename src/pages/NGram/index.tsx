/**
 * N-gram Analysis Page
 * Full N-gram analysis with POS filtering, search, multiple N values, and visualizations
 */

import { useState, useEffect, useMemo, useRef } from 'react'
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
import { useTabStore } from '../../stores/tabStore'
import { analysisApi } from '../../api'
import type { CrossLinkParams } from '../../types'
import type { POSTagInfo } from '../../types/wordFrequency'
import type {
  POSFilterConfig,
  SearchConfig,
  SearchType,
  NGramConfig,
  NGramResult,
  NGramRequest,
  NGramVisualizationConfig,
  NGramChartType,
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
import { buildNgramAIContext } from './buildAIContext'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../stores/settingsStore'

type SelectionMode = 'all' | 'selected' | 'tags'

interface NGramProps {
  crossLinkParams?: CrossLinkParams
}

export default function NGram({ crossLinkParams }: NGramProps = {}) {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

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
  
  // Lifted table filter and viz tab for AI context
  const [tableFilter, setTableFilter] = useState('')
  const [vizTab, setVizTab] = useState<NGramChartType>(DEFAULT_VIZ_CONFIG.chartType)
  
  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

  const pendingAutoAnalyzeRef = useRef(false)
  const handleAnalyzeRef = useRef<() => void>(() => {})

  // Load POS tags on mount
  useEffect(() => {
    loadPosTags()
  }, [])

  // Process crossLinkParams
  useEffect(() => {
    if (crossLinkParams && crossLinkParams.searchWord) {
      const resolvedSearchType = (crossLinkParams.ngramSearchType as SearchType | undefined) || 'contains'
      setSearchConfig({
        searchType: resolvedSearchType,
        searchValue: crossLinkParams.searchWord || '',
        excludeWords: []
      })
      const resolvedNValues = crossLinkParams.ngramValues?.length ? crossLinkParams.ngramValues : [2, 3, 4]
      setNgramConfig(prev => ({ ...prev, nValues: resolvedNValues }))
      setMinFreq(1)
    }
    if (crossLinkParams?.corpusId) {
      setCorpusSelection({
        corpusId: crossLinkParams.corpusId,
        textIds: Array.isArray(crossLinkParams.textIds) ? crossLinkParams.textIds : 'all',
        language: 'english',
        dataSource: crossLinkParams.libraryId ? 'library' : 'corpus',
        selectionMode: (crossLinkParams.selectionMode as 'all' | 'tags' | 'selected') ?? 'all',
        selectedTags: crossLinkParams.selectedTags ?? [],
        ...(crossLinkParams.libraryId && { libraryId: crossLinkParams.libraryId }),
        ...(crossLinkParams.selectedEntryIds?.length && { selectedEntryIds: crossLinkParams.selectedEntryIds })
      })
    }
    if (crossLinkParams?.autoSearch) pendingAutoAnalyzeRef.current = true
  }, [crossLinkParams])

  // Auto-run analysis when opened via cross-link and selection is ready
  useEffect(() => {
    if (pendingAutoAnalyzeRef.current && corpusSelection) {
      pendingAutoAnalyzeRef.current = false
      setTimeout(() => handleAnalyzeRef.current(), 200)
    }
  }, [corpusSelection])

  // External selection for selector sync when opened via cross-link (including library)
  const externalSelection = useMemo((): CorpusOrLibrarySelection | null => {
    if (!crossLinkParams?.corpusId) return null
    return {
      corpusId: crossLinkParams.corpusId,
      textIds: Array.isArray(crossLinkParams.textIds) ? crossLinkParams.textIds : 'all',
      language: 'english',
      dataSource: crossLinkParams.libraryId ? 'library' : 'corpus',
      selectionMode: (crossLinkParams.selectionMode as 'all' | 'tags' | 'selected') ?? 'all',
      selectedTags: crossLinkParams.selectedTags ?? [],
      ...(crossLinkParams.libraryId && { libraryId: crossLinkParams.libraryId }),
      ...(crossLinkParams.selectedEntryIds?.length && { selectedEntryIds: crossLinkParams.selectedEntryIds })
    }
  }, [crossLinkParams])

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
    if (!corpusSelection) return

    setIsLoading(true)
    setError(null)

    try {
      const request: NGramRequest = {
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
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
  handleAnalyzeRef.current = handleAnalyze

  // Check if analysis can run
  const canAnalyze = corpusSelection !== null && ngramConfig.nValues.length > 0

  const selectedCount = corpusSelection
    ? (corpusSelection.textIds === 'all' ? 0 : corpusSelection.textIds.length)
    : 0

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
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t('ngram.title')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('ngram.title')}
            getContext={() =>
              buildNgramAIContext({
                t,
                corpusSelection,
                posFilter,
                searchConfig,
                ngramConfig,
                minFreq,
                maxFreq,
                lowercase,
                results,
                totalNgrams,
                uniqueNgrams,
                rightTab,
                tableFilter,
                sortConfig,
                paginationConfig,
                vizTab,
                vizConfig
              })
            }
          />
        </Stack>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          {corpusSelection?.language && (
            <Chip 
              label={`${t('corpus.language')}: ${corpusSelection.language}`}
              size="small" 
              variant="outlined"
            />
          )}
        </Stack>

        {/* 1. Corpus / Library Selection */}
        <CorpusOrLibrarySelector
          sectionTitle={t('ngram.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

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
                    disabled={!corpusSelection}
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
                disabled={!corpusSelection || ngramConfig.nValues.length < 2}
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
            disabled={!corpusSelection}
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
            disabled={!corpusSelection}
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
                tableFilter={tableFilter}
                onTableFilterChange={setTableFilter}
                corpusId={corpusSelection?.corpusId}
                textIds={corpusSelection?.textIds}
                selectionMode={corpusSelection?.selectionMode === 'keywords' ? 'tags' : (corpusSelection?.selectionMode ?? 'all')}
                selectedTags={corpusSelection?.selectedKeywords ?? corpusSelection?.selectedTags ?? []}
                libraryId={corpusSelection?.dataSource === 'library' ? corpusSelection.libraryId : undefined}
                selectedEntryIds={corpusSelection?.dataSource === 'library' && corpusSelection?.selectionMode === 'selected' ? corpusSelection?.selectedEntryIds : undefined}
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
              onConfigChange={(next) => {
                setVizConfig(next)
                setVizTab(next.chartType)
              }}
              activeTab={vizTab}
              onActiveTabChange={setVizTab}
              onNgramClick={corpusSelection ? (ngram) => {
                openTab({
                  type: 'collocation',
                  title: `${t('collocation.title')} - ${ngram}`,
                  props: {
                    crossLinkParams: {
                      searchWord: ngram,
                      corpusId: corpusSelection.corpusId,
                      textIds: corpusSelection.textIds,
                      selectionMode: corpusSelection.selectionMode === 'keywords' ? 'tags' : corpusSelection.selectionMode,
                      selectedTags: corpusSelection.selectedKeywords ?? corpusSelection.selectedTags ?? [],
                      ...(corpusSelection.libraryId && { libraryId: corpusSelection.libraryId }),
                      autoSearch: true,
                      ignoreCase: true
                    }
                  }
                })
              } : undefined}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}

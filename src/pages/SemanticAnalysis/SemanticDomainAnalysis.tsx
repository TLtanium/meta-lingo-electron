/**
 * Semantic Domain Analysis Page
 * Full semantic domain analysis using USAS annotations with POS filtering, search, and visualizations
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Box,
  Typography,
  LinearProgress,
  Tabs,
  Tab,
  Stack,
  Chip,
  Button,
  Paper,
  Alert,
  RadioGroup,
  Radio,
  FormControlLabel,
  CircularProgress
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CategoryIcon from '@mui/icons-material/Category'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { analysisApi } from '../../api'
import type { CrossLinkParams } from '../../types'
import type { POSTagInfo } from '../../types/wordFrequency'
import type {
  POSFilterConfig,
  SearchConfig,
  SemanticAnalysisFilters,
  SemanticDomainResult,
  SemanticWordResult,
  SemanticAnalysisResponse,
  SortConfig,
  VisualizationConfig,
  defaultSemanticAnalysisFilters,
  defaultVisualizationConfig
} from '../../types/semanticAnalysis'
import POSFilterPanel from '../WordFrequency/POSFilterPanel'
import SearchConfigPanel from './SearchConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../stores/settingsStore'

interface SemanticDomainAnalysisProps {
  crossLinkParams?: CrossLinkParams
}

export default function SemanticDomainAnalysis({ crossLinkParams }: SemanticDomainAnalysisProps) {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

  // POS tags
  const [posTags, setPosTags] = useState<POSTagInfo[]>([])

  // Filter state
  const [posFilter, setPosFilter] = useState<POSFilterConfig>({
    selectedPOS: [],
    keepMode: false  // 默认过滤模式
  })
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    searchType: 'all',
    searchValue: '',
    excludeWords: []
  })
  const [minFreq, setMinFreq] = useState(1)
  const [maxFreq, setMaxFreq] = useState<number | null>(null)
  const [lowercase, setLowercase] = useState(true)
  const [resultMode, setResultMode] = useState<'domain' | 'word'>('domain')

  // Results state
  const [results, setResults] = useState<SemanticAnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sort & pagination state
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'frequency',
    order: 'desc'
  })
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  // Visualization state
  const [vizConfig, setVizConfig] = useState<VisualizationConfig>({
    chartType: 'bar',
    showTopN: 20,
    showLabels: true,
    showPercentage: true
  })

  // Metaphor highlight state
  const [showMetaphorHighlight, setShowMetaphorHighlight] = useState(false)

  // Table selection state
  const [selectedItems, setSelectedItems] = useState<string[]>([])

  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

  const pendingAutoAnalyzeRef = useRef(false)
  const handleAnalyzeRef = useRef<() => void>(() => {})

  // Load POS tags on mount
  useEffect(() => {
    loadPosTags()
  }, [])

  // Apply cross-link params (search config only; user selects corpus in selector)
  useEffect(() => {
    if (!crossLinkParams?.semanticSearchValue) return
    if (crossLinkParams.semanticResultMode === 'domain') setResultMode('domain')
    setSearchConfig(prev => ({
      ...prev,
      searchType: (crossLinkParams.semanticSearchType as SearchConfig['searchType']) || 'contains',
      searchValue: crossLinkParams.semanticSearchValue ?? ''
    }))
    pendingAutoAnalyzeRef.current = true
  }, [crossLinkParams])

  // Sync corpus/library selection from cross-link so selector shows same source (corpus or library)
  useEffect(() => {
    if (!crossLinkParams?.corpusId) return
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

  // Run analysis
  const handleAnalyze = async () => {
    if (!corpusSelection) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await analysisApi.semanticDomainAnalysis({
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        search_config: searchConfig,
        min_freq: minFreq,
        max_freq: maxFreq ?? undefined,
        lowercase,
        result_mode: resultMode
      })

      if (response.success && response.data) {
        if (response.data.success) {
          setResults(response.data)
          // Reset pagination and selection
          setPage(0)
          setSelectedItems([])
        } else {
          setError(response.data.error || t('semantic.error.analysisFailed'))
        }
      } else {
        setError(response.error || t('semantic.error.analysisFailed'))
      }
    } catch (err: any) {
      setError(err.message || t('semantic.error.analysisFailed'))
    } finally {
      setIsLoading(false)
    }
  }
  handleAnalyzeRef.current = handleAnalyze

  // Check if analysis can run
  const canAnalyze = corpusSelection !== null

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
            {t('semantic.title')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('semantic.title')}
            getContext={() => {
              const hint = t('aiAssistant.semanticDomainContextHint')
              const corpusInfo = corpusSelection ? `Corpus: ${corpusSelection.dataSource === 'corpus' ? 'corpus' : 'library'}, ${corpusSelection.textIds === 'all' ? 'all' : corpusSelection.textIds.length} texts` : 'Corpus: (none)'
              const params = `searchType=${searchConfig.searchType}, searchContent=${searchConfig.searchContent}, minFreq=${minFreq}, maxFreq=${maxFreq ?? 'null'}`
              if (!results || !results.results || results.results.length === 0) return `${hint}\n\n${corpusInfo}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
              const slice = results.results.slice(0, 25)
              const lines = slice.map((r: SemanticWordResult, i: number) => `${i + 1}\t${r.word}\t${r.frequency}\t${r.domain_name ?? r.domain ?? ''}`).join('\n')
              const header = '序号\t词\t频次\t语义域'
              const vizSlice = results.results.slice(0, 20)
              const vizLines = vizSlice.map((r: SemanticWordResult, i: number) => `${i + 1}\t${r.word}\t${r.frequency}\t${r.domain_name ?? r.domain ?? ''}`).join('\n')
              const view = rightTab === 0 ? `Results (rows 1-${slice.length}):\n${header}\n${lines}` : `Visualization (semantic domains). Top 20:\n${header}\n${vizLines}`
              return `${hint}\n\n${corpusInfo}\n${params}\n${view}`
            }}
          />
        </Stack>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="USAS" size="small" color="primary" variant="outlined" />
          <Chip label="PyMUSAS" size="small" color="secondary" variant="outlined" />
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
          sectionTitle={t('wordFrequency.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

        {/* Result Mode Selection */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('semantic.resultMode.title')}
          </Typography>
          <RadioGroup
            row
            value={resultMode}
            onChange={(e) => setResultMode(e.target.value as 'domain' | 'word')}
          >
            <FormControlLabel
              value="domain"
              control={<Radio size="small" />}
              label={
                <Typography variant="body2">
                  {t('semantic.resultMode.byDomain')}
                </Typography>
              }
            />
            <FormControlLabel
              value="word"
              control={<Radio size="small" />}
              label={
                <Typography variant="body2">
                  {t('semantic.resultMode.byWord')}
                </Typography>
              }
            />
          </RadioGroup>
        </Paper>

        {/* 2. POS Filter Panel */}
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            config={posFilter}
            onChange={setPosFilter}
            posTags={posTags}
            disabled={!corpusSelection}
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
            disabled={!corpusSelection}
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
          {isLoading ? t('common.loading') : t('semantic.analyze')}
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
            <Tab label={t('semantic.results.title')} />
            <Tab label={t('semantic.visualization.title')} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 ? (
            results && results.results.length > 0 ? (
              <ResultsTable
                results={results}
                sortConfig={sortConfig}
                onSortChange={setSortConfig}
                page={page}
                rowsPerPage={rowsPerPage}
                onPageChange={setPage}
                onRowsPerPageChange={setRowsPerPage}
                corpusId={corpusSelection?.corpusId || ''}
                textIds={corpusSelection?.textIds}
                lowercase={lowercase}
                selectionMode={corpusSelection?.selectionMode === 'keywords' ? 'tags' : (corpusSelection?.selectionMode ?? 'all')}
                selectedTags={corpusSelection?.selectedKeywords ?? corpusSelection?.selectedTags ?? []}
                libraryId={corpusSelection?.libraryId}
                selectedEntryIds={corpusSelection?.dataSource === 'library' && corpusSelection?.selectionMode === 'selected' ? corpusSelection?.selectedEntryIds : undefined}
                showMetaphorHighlight={showMetaphorHighlight}
                onShowMetaphorHighlightChange={setShowMetaphorHighlight}
                selectedItems={selectedItems}
                onSelectionChange={setSelectedItems}
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
                <CategoryIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('semantic.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('semantic.description')}
                </Typography>
              </Box>
            )
          ) : (
            <VisualizationPanel
              results={results}
              config={vizConfig}
              onConfigChange={setVizConfig}
              onDomainClick={corpusSelection ? (domain) => {
                openTab({
                  type: 'collocation',
                  title: `${t('collocation.title')} - ${domain}`,
                  props: {
                    crossLinkParams: {
                      searchWord: domain,
                      corpusId: corpusSelection.corpusId,
                      textIds: corpusSelection.textIds,
                      selectionMode: corpusSelection.selectionMode === 'keywords' ? 'tags' : corpusSelection.selectionMode,
                      selectedTags: corpusSelection.selectedKeywords ?? corpusSelection.selectedTags ?? [],
                      ...(corpusSelection.libraryId && { libraryId: corpusSelection.libraryId }),
                      autoSearch: true,
                      semanticDomain: domain,
                      semanticDomainMatch: 'contains'
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

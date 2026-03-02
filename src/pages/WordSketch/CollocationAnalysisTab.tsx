/**
 * Collocation Analysis Tab
 * Main tab component for window-based collocation analysis.
 * Inherits layout from WordFrequency: left config panel + right results/viz panel.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  TextField,
  Switch,
  Slider
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TableChartIcon from '@mui/icons-material/TableChart'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { analysisApi, collocationAnalysisApi } from '../../api'
import { NumberInput } from '../../components/common'
import type { CrossLinkParams } from '../../types'
import type { POSFilterConfig, POSTagInfo } from '../../types/wordFrequency'
import { DEFAULT_POS_FILTER } from '../../types/wordFrequency'
import type {
  StatMeasureConfig,
  CollocationAnalysisResult,
  CollocationAnalysisRequest,
  CollocationTableSortConfig,
  CollocationTablePaginationConfig,
  CollocationVizConfig,
  CollocationMatchMode
} from '../../types/collocationAnalysis'
import {
  ALL_STAT_METHODS,
  DEFAULT_STAT_CONFIGS,
  DEFAULT_SPAN,
  MIN_SPAN,
  MAX_SPAN,
  DEFAULT_COLLOCATION_TABLE_SORT,
  DEFAULT_COLLOCATION_TABLE_PAGINATION,
  DEFAULT_COLLOCATION_VIZ_CONFIG
} from '../../types/collocationAnalysis'
import POSFilterPanel from '../WordFrequency/POSFilterPanel'
import CollocationResultsTable from './components/CollocationResultsTable'
import CollocationStatisticsDialog from './components/CollocationStatisticsDialog'
import CollocationVisualizationPanel from './components/CollocationVisualizationPanel'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../stores/settingsStore'

interface CollocationAnalysisTabProps {
  crossLinkParams?: CrossLinkParams
}

export default function CollocationAnalysisTab({ crossLinkParams }: CollocationAnalysisTabProps) {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

  // POS tags
  const [posTags, setPosTags] = useState<POSTagInfo[]>([])
  const [posFilter, setPosFilter] = useState<POSFilterConfig>(DEFAULT_POS_FILTER)

  // Search config
  const [matchMode, setMatchMode] = useState<CollocationMatchMode>('lemma')
  const [nodeWord, setNodeWord] = useState('')
  const [span, setSpan] = useState(DEFAULT_SPAN)
  const [minFreq, setMinFreq] = useState(1)
  const [maxFreq, setMaxFreq] = useState<number | null>(null)
  const [lowercase, setLowercase] = useState(true)
  const [removeStopwords, setRemoveStopwords] = useState(false)
  const [excludeWordsText, setExcludeWordsText] = useState('')

  // Statistical config
  const [statConfigs, setStatConfigs] = useState<StatMeasureConfig[]>(DEFAULT_STAT_CONFIGS)
  const [statsDialogOpen, setStatsDialogOpen] = useState(false)

  // Results state
  const [results, setResults] = useState<CollocationAnalysisResult[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [uniqueCollocates, setUniqueCollocates] = useState(0)
  const [nodeFrequency, setNodeFrequency] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Table state
  const [sortConfig, setSortConfig] = useState<CollocationTableSortConfig>(DEFAULT_COLLOCATION_TABLE_SORT)
  const [paginationConfig, setPaginationConfig] = useState<CollocationTablePaginationConfig>(DEFAULT_COLLOCATION_TABLE_PAGINATION)
  const [selectedWords, setSelectedWords] = useState<string[]>([])

  // Visualization
  const [vizConfig, setVizConfig] = useState<CollocationVizConfig>(DEFAULT_COLLOCATION_VIZ_CONFIG)

  // Network graph expand: level-1 collocate -> its collocates (one level only)
  const [expandedData, setExpandedData] = useState<Record<string, CollocationAnalysisResult[]>>({})
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null)

  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

  // Track if cross-link has been processed
  const crossLinkProcessedRef = useRef(false)
  const pendingAutoSearchRef = useRef(false)
  const handleAnalyzeRef = useRef<() => void>(() => {})

  // Handle cross-link params: only set node word and auto-search flag. Corpus/library selection is synced via externalSelection and selector's onSelectionChange (same pattern as Word Frequency).
  useEffect(() => {
    if (!crossLinkParams || crossLinkProcessedRef.current) return
    crossLinkProcessedRef.current = true
    if (crossLinkParams.searchWord) setNodeWord(crossLinkParams.searchWord)
    if (crossLinkParams.autoSearch) pendingAutoSearchRef.current = true
  }, [crossLinkParams])

  // External selection for selector sync when opened via cross-link (including library). Same as Word Frequency: require corpusId or libraryId so selector can sync and emit corpusSelection.
  const externalSelection = useMemo((): CorpusOrLibrarySelection | null => {
    if (!crossLinkParams) return null
    const hasCorpus = Boolean(crossLinkParams.corpusId)
    const hasLibrary = Boolean(crossLinkParams.libraryId)
    if (!hasCorpus && !hasLibrary) return null
    return {
      corpusId: crossLinkParams.corpusId ?? '',
      textIds: Array.isArray(crossLinkParams.textIds) ? crossLinkParams.textIds : 'all',
      language: 'english',
      dataSource: hasLibrary ? 'library' : 'corpus',
      selectionMode: (crossLinkParams.selectionMode as 'all' | 'tags' | 'selected') ?? 'all',
      selectedTags: crossLinkParams.selectedTags ?? [],
      ...(hasLibrary && { libraryId: crossLinkParams.libraryId }),
      ...(crossLinkParams.selectedEntryIds?.length && { selectedEntryIds: crossLinkParams.selectedEntryIds })
    }
  }, [crossLinkParams])

  // Auto-search when selection is ready and auto-search is pending
  useEffect(() => {
    if (pendingAutoSearchRef.current && corpusSelection && nodeWord.trim()) {
      pendingAutoSearchRef.current = false
      setTimeout(() => handleAnalyzeRef.current(), 200)
    }
  }, [corpusSelection, nodeWord])

  // Load POS tags on mount
  useEffect(() => {
    loadPosTags()
  }, [])
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

  // Fetch collocates for a node (for network graph expand)
  const fetchCollocates = useCallback(async (collocateWord: string) => {
    if (!corpusSelection || !collocateWord.trim()) return
    setLoadingExpand(collocateWord)
    try {
      const request: CollocationAnalysisRequest = {
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        node_word: collocateWord.trim(),
        span,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        min_freq: minFreq,
        max_freq: maxFreq ?? undefined,
        lowercase,
        remove_stopwords: removeStopwords,
        exclude_words: getExcludeWords(),
        statistics_methods: ALL_STAT_METHODS,
        match_mode: matchMode
      }
      const response = await collocationAnalysisApi.analyze(request)
      if (response.success && response.data?.success && response.data.results) {
        setExpandedData(prev => ({ ...prev, [collocateWord]: response.data!.results }))
      }
    } catch (_) {
      // keep expandedData unchanged on error
    } finally {
      setLoadingExpand(null)
    }
  }, [corpusSelection, span, posFilter, minFreq, maxFreq, lowercase, removeStopwords, excludeWordsText, matchMode])

  // Exclude words
  const getExcludeWords = (): string[] => {
    return excludeWordsText
      .split('\n')
      .map(w => w.trim())
      .filter(w => w.length > 0)
  }

  // Get enabled stat methods (for display only, all methods always computed)
  const enabledMethods = useMemo(() =>
    statConfigs.filter(c => c.enabled).sort((a, b) => a.order - b.order).map(c => c.id),
    [statConfigs]
  )

  // Run analysis - always compute ALL statistical methods
  const handleAnalyze = async () => {
    if (!corpusSelection || !nodeWord.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const request: CollocationAnalysisRequest = {
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        node_word: nodeWord.trim(),
        span,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        min_freq: minFreq,
        max_freq: maxFreq ?? undefined,
        lowercase,
        remove_stopwords: removeStopwords,
        exclude_words: getExcludeWords(),
        statistics_methods: ALL_STAT_METHODS,  // Always compute all methods
        match_mode: matchMode
      }

      const response = await collocationAnalysisApi.analyze(request)

      if (response.success && response.data) {
        if (response.data.success) {
          setResults(response.data.results)
          setTotalTokens(response.data.total_tokens)
          setUniqueCollocates(response.data.unique_collocates)
          setNodeFrequency(response.data.node_frequency)
          setSelectedWords([])
          setPaginationConfig({ ...paginationConfig, page: 0 })
          setExpandedData({})

          if (response.data.error) {
            setError(response.data.error)
          }
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

  // Keep ref always pointing to latest handleAnalyze to avoid stale closure in auto-search
  handleAnalyzeRef.current = handleAnalyze

  const canAnalyze = !!corpusSelection && !!nodeWord.trim()

  const spanMarks = [
    { value: 1, label: '1' },
    { value: 5, label: '5' },
    { value: 10, label: '10' },
    { value: 15, label: '15' }
  ]

  return (
    <Box sx={{ display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0, flex: 1 }}>
      {/* Left panel - Configuration */}
      <Box sx={{
        width: 400, borderRight: 1, borderColor: 'divider', overflow: 'auto', p: 2,
        display: 'flex', flexDirection: 'column'
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t('wordsketch.collocationAnalysisTab')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('wordsketch.collocationAnalysisTab')}
            getContext={() => {
              const hint = t('aiAssistant.collocationAnalysisContextHint')
              const corpusInfo = corpusSelection ? `Corpus: ${corpusSelection.dataSource === 'corpus' ? 'corpus' : 'library'}, ${corpusSelection.textIds === 'all' ? 'all' : corpusSelection.textIds.length} texts` : 'Corpus: (none)'
              const params = `nodeWord=${nodeWord}, span=${span}, minFreq=${minFreq}, matchMode=${matchMode}`
              if (results.length === 0) return `${hint}\n\n${corpusInfo}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
              const slice = results.slice(0, 25)
              const scoreVal = (r: CollocationAnalysisResult) => r.logdice ?? r.mi ?? r.ll ?? r.deltap1 ?? r.deltap2 ?? (r as any).stat_value ?? ''
              const header = '序号\t搭配词\t共现频次\t关联度'
              const lines = slice.map((r, i) => `${i + 1}\t${(r as CollocationAnalysisResult).collocate}\t${(r as CollocationAnalysisResult).collocation_freq}\t${scoreVal(r as CollocationAnalysisResult)}`).join('\n')
              const vizSlice = results.slice(0, 20)
              const vizLines = vizSlice.map((r, i) => `${i + 1}\t${(r as CollocationAnalysisResult).collocate}\t${(r as CollocationAnalysisResult).collocation_freq}\t${scoreVal(r as CollocationAnalysisResult)}`).join('\n')
              const view = rightTab === 0 ? `Results (rows 1-${slice.length}):\n${header}\n${lines}` : `Visualization (network/bar). Top 20:\n${header}\n${vizLines}`
              return `${hint}\n\n${corpusInfo}\n${params}\n${view}`
            }}
          />
        </Stack>

        <Stack direction="row" spacing={1} mb={1} flexWrap="wrap" alignItems="center">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          {corpusSelection?.language && (
            <Chip label={`${t('corpus.language')}: ${corpusSelection.language}`} size="small" variant="outlined" />
          )}
        </Stack>

        {/* 1. Corpus / Library Selection */}
        <CorpusOrLibrarySelector
          sectionTitle={t('collocationAnalysis.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

        {/* 2. POS Filter */}
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            config={posFilter}
            onChange={setPosFilter}
            posTags={posTags}
            disabled={!corpusSelection}
          />
        </Box>

        {/* 3. Search Configuration */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            {t('collocationAnalysis.search.title')}
          </Typography>
          <Stack spacing={2}>
            {/* Match mode */}
            <FormControl fullWidth size="small">
              <InputLabel>{t('collocationAnalysis.search.matchMode')}</InputLabel>
              <Select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as CollocationMatchMode)}
                label={t('collocationAnalysis.search.matchMode')}
                disabled={!corpusSelection}
              >
                <MenuItem value="lemma">{t('collocationAnalysis.search.matchModeLemma')}</MenuItem>
                <MenuItem value="word">{t('collocationAnalysis.search.matchModeWord')}</MenuItem>
              </Select>
            </FormControl>

            {/* Node word */}
            <TextField
              size="small"
              label={t('collocationAnalysis.search.nodeWord')}
              placeholder={t('collocationAnalysis.search.nodeWordPlaceholder')}
              value={nodeWord}
              onChange={(e) => setNodeWord(e.target.value)}
              fullWidth
              disabled={!corpusSelection}
            />

            {/* Span slider */}
            <Box>
              <Typography variant="body2" gutterBottom>
                {t('collocationAnalysis.search.span')}: {span}
              </Typography>
              <Slider
                value={span}
                onChange={(_, value) => setSpan(value as number)}
                min={MIN_SPAN}
                max={MAX_SPAN}
                marks={spanMarks}
                disabled={!corpusSelection}
                size="small"
              />
              <Typography variant="caption" color="text.secondary">
                {t('collocationAnalysis.search.spanHelp')}
              </Typography>
            </Box>

            {/* Frequency range */}
            <Typography variant="caption" color="text.secondary" sx={{ mb: -1, display: 'block' }}>
              {t('collocationAnalysis.search.frequencyRange')}
            </Typography>
            <Stack direction="row" spacing={2}>
              <NumberInput
                label={t('collocationAnalysis.search.minFreq')}
                size="small"
                value={minFreq}
                onChange={setMinFreq}
                min={1} max={1000} step={1} integer defaultValue={1}
                sx={{ flex: 1 }}
                disabled={!corpusSelection}
              />
              <NumberInput
                label={t('collocationAnalysis.search.maxFreq')}
                size="small"
                value={maxFreq ?? 0}
                onChange={(v) => setMaxFreq(v === 0 ? null : v)}
                min={0} max={100000} step={1} integer defaultValue={0}
                helperText={maxFreq === null ? t('wordFrequency.search.noLimit') : ''}
                sx={{ flex: 1 }}
                disabled={!corpusSelection}
              />
            </Stack>

            {/* Lowercase */}
            <FormControlLabel
              control={<Switch checked={lowercase} onChange={(e) => setLowercase(e.target.checked)} size="small" disabled={!corpusSelection} />}
              label={<Typography variant="body2">{t('collocationAnalysis.search.lowercase')}</Typography>}
            />

            {/* Remove stopwords with language label */}
            <Stack direction="row" alignItems="center" spacing={1}>
              <FormControlLabel
                control={<Switch checked={removeStopwords} onChange={(e) => setRemoveStopwords(e.target.checked)} size="small" disabled={!corpusSelection} />}
                label={<Typography variant="body2">{t('collocationAnalysis.search.removeStopwords')}</Typography>}
                sx={{ mr: 0 }}
              />
              {removeStopwords && corpusSelection?.language && (
                <Chip
                  label={corpusSelection.language}
                  size="small"
                  variant="outlined"
                  color="info"
                />
              )}
            </Stack>

            {/* Exclude words - multi-line, one word per line */}
            <TextField
              label={t('collocationAnalysis.search.excludeWords')}
              multiline
              rows={3}
              fullWidth
              size="small"
              value={excludeWordsText}
              onChange={(e) => setExcludeWordsText(e.target.value)}
              placeholder={t('collocationAnalysis.search.excludeWordsPlaceholderMultiline')}
              helperText={t('collocationAnalysis.search.excludeWordsHelp')}
              disabled={!corpusSelection}
            />
          </Stack>
        </Paper>

        {/* 4. Analyze Button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={handleAnalyze}
          disabled={!canAnalyze || isLoading}
          fullWidth
        >
          {isLoading ? t('collocationAnalysis.analyzing') : t('collocationAnalysis.analyze')}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        )}
      </Box>

      {/* Right panel - Results & Visualization */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {isLoading && <LinearProgress />}

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)}>
            <Tab label={t('collocationAnalysis.results.title')} />
            <Tab label={t('collocationAnalysis.visualization.title')} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {rightTab === 0 ? (
            results.length > 0 ? (
              <CollocationResultsTable
                results={results}
                totalTokens={totalTokens}
                uniqueCollocates={uniqueCollocates}
                nodeFrequency={nodeFrequency}
                nodeWord={nodeWord}
                span={span}
                matchMode={matchMode}
                statConfigs={statConfigs}
                sortConfig={sortConfig}
                paginationConfig={paginationConfig}
                selectedWords={selectedWords}
                onSortChange={setSortConfig}
                onPaginationChange={setPaginationConfig}
                onSelectionChange={setSelectedWords}
                onOpenStatisticsDialog={() => setStatsDialogOpen(true)}
                isLoading={isLoading}
                corpusId={corpusSelection?.corpusId}
                textIds={corpusSelection?.textIds}
                selectionMode={corpusSelection?.selectionMode === 'keywords' ? 'tags' : (corpusSelection?.selectionMode ?? 'all')}
                selectedTags={corpusSelection?.selectedKeywords ?? corpusSelection?.selectedTags ?? []}
                libraryId={corpusSelection?.dataSource === 'library' ? corpusSelection.libraryId : undefined}
                selectedEntryIds={corpusSelection?.dataSource === 'library' && corpusSelection?.selectionMode === 'selected' ? corpusSelection?.selectedEntryIds : undefined}
              />
            ) : (
              <Box sx={{
                flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 2, p: 4
              }}>
                <TableChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('collocationAnalysis.results.runFirst')}
                </Typography>
              </Box>
            )
          ) : (
            <CollocationVisualizationPanel
              data={results}
              nodeWord={nodeWord}
              config={vizConfig}
              onConfigChange={setVizConfig}
              enabledMetrics={enabledMethods}
              expandedData={expandedData}
              loadingExpand={loadingExpand}
              fetchCollocates={fetchCollocates}
              onWordClick={corpusSelection ? (word) => {
                openTab({
                  type: 'collocation',
                  title: `${t('collocation.title')} - ${word}`,
                  props: {
                    crossLinkParams: {
                      searchWord: word,
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

      {/* Statistics Dialog */}
      <CollocationStatisticsDialog
        open={statsDialogOpen}
        onClose={() => setStatsDialogOpen(false)}
        configs={statConfigs}
        onConfigsChange={setStatConfigs}
      />
    </Box>
  )
}

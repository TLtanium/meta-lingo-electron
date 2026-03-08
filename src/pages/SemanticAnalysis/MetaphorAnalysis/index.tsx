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
  Stack,
  Chip,
  Button,
  Paper,
  Alert
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../../stores/tabStore'
import { analysisApi } from '../../../api'
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
import AnalysisAIAssistant from '../../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../../stores/settingsStore'
import type { CrossLinkParams } from '../../../types/crossLink'
import { buildMetaphorAIContext } from './buildMetaphorAIContext'

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

interface MetaphorAnalysisProps {
  crossLinkParams?: CrossLinkParams
}

export default function MetaphorAnalysis({ crossLinkParams }: MetaphorAnalysisProps = {}) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const { openTab } = useTabStore()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector); MIPVU is English-only (library language filtered in selector when needed)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

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

  // Table state (lifted for AI context)
  const [selectedWords, setSelectedWords] = useState<string[]>([])
  const [sortField, setSortField] = useState<'word' | 'frequency' | 'percentage' | 'pos' | 'is_metaphor' | 'source'>('frequency')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [tablePage, setTablePage] = useState(0)
  const [tableRowsPerPage, setTableRowsPerPage] = useState(50)
  const [tableFilter, setTableFilter] = useState('')

  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

  // Visualization config
  const [vizConfig, setVizConfig] = useState<MetaphorVisualizationConfig>(DEFAULT_METAPHOR_VIZ_CONFIG)

  // Sync corpus/library selection from cross-link so selector shows same source
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

  const handleAnalyze = async () => {
    if (!corpusSelection) return

    setIsLoading(true)
    setError(null)

    try {
      const request: MetaphorAnalysisRequest = {
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
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

  const canAnalyze = corpusSelection !== null && !isLoading &&
    (corpusSelection.language === 'english' || corpusSelection.language === 'en')

  const isNonEnglishSelection = corpusSelection !== null &&
    corpusSelection.language !== 'english' && corpusSelection.language !== 'en'

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
            {isZh ? '隐喻分析' : 'Metaphor Analysis'}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={isZh ? '隐喻分析' : 'Metaphor Analysis'}
            getContext={() => buildMetaphorAIContext({
              t,
              corpusSelection,
              posFilter,
              searchConfig,
              minFreq,
              maxFreq,
              lowercase,
              results,
              statistics,
              sortField,
              sortDirection,
              tableFilter,
              page: tablePage,
              rowsPerPage: tableRowsPerPage,
              rightTab,
              vizConfig
            })}
          />
        </Stack>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="MIPVU" size="small" color="primary" variant="outlined" />
          <Chip label={isZh ? '仅英语' : 'English Only'} size="small" color="warning" variant="outlined" />
        </Stack>

        {/* 1. Corpus / Library Selection */}
        <CorpusOrLibrarySelector
          sectionTitle={t('wordFrequency.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

        {isNonEnglishSelection && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {isZh ? 'MIPVU 仅支持英文语料/文献库，请选择英文语料库或英文文献库。' : 'MIPVU only supports English corpora/libraries. Please select an English corpus or library.'}
          </Alert>
        )}

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
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={(field, direction) => {
                  setSortField(field)
                  setSortDirection(direction)
                }}
                page={tablePage}
                rowsPerPage={tableRowsPerPage}
                onPageChange={setTablePage}
                onRowsPerPageChange={(v) => {
                  setTableRowsPerPage(v)
                  setTablePage(0)
                }}
                tableFilter={tableFilter}
                onTableFilterChange={(v) => {
                  setTableFilter(v)
                  setTablePage(0)
                }}
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
    </Box>
  )
}

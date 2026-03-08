/**
 * Sentiment Analysis Page (NRC-based)
 * Layout and params aligned with Word Frequency; analysis modes: polarity / dimension
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
  Alert
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TableChartIcon from '@mui/icons-material/TableChart'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { analysisApi } from '../../api'
import type { POSFilterConfig, SearchConfig, POSTagInfo } from '../../types/wordFrequency'
import type {
  SentimentResultRow,
  SentimentAnalysisMode,
  SentimentEmotionFilterPolarity,
  SentimentEmotionFilterDimension
} from '../../types/sentiment'
import {
  DEFAULT_EMOTION_FILTER_POLARITY,
  DEFAULT_EMOTION_FILTER_DIMENSION
} from '../../types/sentiment'
import { DEFAULT_POS_FILTER, DEFAULT_SEARCH_CONFIG } from '../../types/wordFrequency'
import POSFilterPanel from '../WordFrequency/POSFilterPanel'
import SearchConfigPanel from '../WordFrequency/SearchConfigPanel'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type { CrossLinkParams } from '../../types/crossLink'
import SentimentResultsTable from './SentimentResultsTable'
import SentimentVisualizationPanel from './SentimentVisualizationPanel'
import SentimentFilterDialog from './SentimentFilterDialog'
import { buildSentimentAIContext } from './buildAIContext'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import { useSettingsStore } from '../../stores/settingsStore'

interface SentimentAnalysisProps {
  crossLinkParams?: CrossLinkParams
}

export default function SentimentAnalysis({ crossLinkParams }: SentimentAnalysisProps = {}) {
  const { t } = useTranslation()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)
  const [posTags, setPosTags] = useState<POSTagInfo[]>([])
  const [posFilter, setPosFilter] = useState<POSFilterConfig>(DEFAULT_POS_FILTER)
  const [searchConfig, setSearchConfig] = useState<SearchConfig>(DEFAULT_SEARCH_CONFIG)
  const [minFreq, setMinFreq] = useState(1)
  const [maxFreq, setMaxFreq] = useState<number | null>(null)
  const [lowercase, setLowercase] = useState(true)
  const [analysisMode, setAnalysisMode] = useState<SentimentAnalysisMode>('polarity')
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [results, setResults] = useState<SentimentResultRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState(0)
  const [selectedWords, setSelectedWords] = useState<string[]>([])
  const [tablePage, setTablePage] = useState(0)
  const [tableRowsPerPage, setTableRowsPerPage] = useState(25)
  const [tableFilter, setTableFilter] = useState('')
  const [tableSortColumn, setTableSortColumn] = useState<string>('total')
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('desc')
  const [vizTab, setVizTab] = useState<'chart' | 'wordcloud'>('chart')
  const [emotionFilterPolarity, setEmotionFilterPolarity] = useState<SentimentEmotionFilterPolarity>(
    DEFAULT_EMOTION_FILTER_POLARITY
  )
  const [emotionFilterDimension, setEmotionFilterDimension] = useState<SentimentEmotionFilterDimension>(
    DEFAULT_EMOTION_FILTER_DIMENSION
  )
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)

  const POLARITY_KEYS = ['positive', 'negative', 'neutral'] as const
  const DIMENSION_KEYS = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'trust', 'others'] as const

  /** After emotion filter: exclude rows where all selected emotion values are 0 */
  const filteredResults = useMemo(() => {
    const keys =
      analysisMode === 'polarity'
        ? (POLARITY_KEYS as readonly string[]).filter((k) => emotionFilterPolarity[k as keyof SentimentEmotionFilterPolarity])
        : (DIMENSION_KEYS as readonly string[]).filter((k) => emotionFilterDimension[k as keyof SentimentEmotionFilterDimension])
    const keysToUse = keys.length > 0 ? keys : (analysisMode === 'polarity' ? [...POLARITY_KEYS] : [...DIMENSION_KEYS])
    return results.filter((row) => {
      const sum = keysToUse.reduce((s, k) => s + (Number(row[k]) || 0), 0)
      return sum > 0
    })
  }, [results, analysisMode, emotionFilterPolarity, emotionFilterDimension])

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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await analysisApi.getPosTags()
        if (res.success && res.data) setPosTags(res.data)
      } catch {
        setPosTags([])
      }
    }
    load()
  }, [])

  const handleAnalyze = async () => {
    if (!corpusSelection) return
    setIsLoading(true)
    setError(null)
    try {
      const request = {
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        search_config: searchConfig,
        min_freq: minFreq,
        max_freq: maxFreq ?? undefined,
        lowercase,
        analysis_mode: analysisMode
      }
      const response = await analysisApi.sentiment(request)
      if (!response.success || !response.data) {
        setError(response.error || 'Analysis failed')
        setSummary({})
        setResults([])
        return
      }
      const data = response.data as { success?: boolean; summary?: Record<string, number>; results?: SentimentResultRow[]; error?: string }
      if (data.success && data.summary !== undefined) {
        setSummary(data.summary)
        setResults(Array.isArray(data.results) ? data.results : [])
        setSelectedWords([])
        setTablePage(0)
        setTableFilter('')
        setEmotionFilterPolarity(DEFAULT_EMOTION_FILTER_POLARITY)
        setEmotionFilterDimension(DEFAULT_EMOTION_FILTER_DIMENSION)
      } else {
        setError(data?.error || 'Analysis failed')
        setSummary({})
        setResults([])
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Analysis failed')
      setSummary({})
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  const canAnalyze = corpusSelection !== null && (
    corpusSelection.textIds === 'all' ||
    (Array.isArray(corpusSelection.textIds) && corpusSelection.textIds.length > 0)
  )

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      <Box sx={{ width: 400, borderRight: 1, borderColor: 'divider', overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">{t('sentiment.title')}</Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('sentiment.title')}
            getContext={() =>
              buildSentimentAIContext({
                t,
                corpusSelection,
                posFilter,
                searchConfig,
                minFreq,
                maxFreq,
                lowercase,
                analysisMode,
                emotionFilterPolarity,
                emotionFilterDimension,
                results: filteredResults,
                summary,
                totalTokens: filteredResults.reduce((s, r) => s + r.total, 0),
                uniqueWords: filteredResults.length,
                rightTab,
                tableFilter,
                sortColumn: tableSortColumn,
                sortDirection: tableSortDirection,
                paginationConfig: { page: tablePage, rowsPerPage: tableRowsPerPage },
                vizTab
              })
            }
          />
        </Stack>
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="NRC" size="small" color="primary" variant="outlined" />
          {corpusSelection?.language && (
            <Chip label={`${t('corpus.language')}: ${corpusSelection.language}`} size="small" variant="outlined" />
          )}
        </Stack>
        <CorpusOrLibrarySelector
          sectionTitle={t('sentiment.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            config={posFilter}
            onChange={setPosFilter}
            posTags={posTags}
            disabled={!corpusSelection}
          />
        </Box>
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
            corpusLanguage={corpusSelection?.language || 'english'}
            analysisMode={analysisMode}
            onAnalysisModeChange={setAnalysisMode}
          />
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={handleAnalyze}
          disabled={!canAnalyze || isLoading}
          fullWidth
        >
          {isLoading ? t('common.loading') : t('sentiment.analyze')}
        </Button>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isLoading && <LinearProgress />}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)}>
            <Tab label={t('sentiment.results.title')} />
            <Tab label={t('sentiment.visualization.title')} />
          </Tabs>
        </Box>
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 ? (
            results.length > 0 ? (
              <SentimentResultsTable
                results={filteredResults}
                summary={summary}
                analysisMode={analysisMode}
                corpusSelection={corpusSelection}
                totalTokens={filteredResults.reduce((s, r) => s + r.total, 0)}
                uniqueWords={filteredResults.length}
                selectedWords={selectedWords}
                onSelectionChange={setSelectedWords}
                paginationConfig={{ page: tablePage, rowsPerPage: tableRowsPerPage }}
                onPaginationChange={(c) => {
                  setTablePage(c.page)
                  setTableRowsPerPage(c.rowsPerPage)
                }}
                tableFilter={tableFilter}
                onTableFilterChange={setTableFilter}
                sortColumn={tableSortColumn}
                sortDirection={tableSortDirection}
                onSortChange={(col, dir) => {
                  setTableSortColumn(col)
                  setTableSortDirection(dir)
                }}
                isLoading={isLoading}
                emotionFilterPolarity={emotionFilterPolarity}
                emotionFilterDimension={emotionFilterDimension}
                onOpenFilterDialog={() => setFilterDialogOpen(true)}
                searchTarget={searchConfig.searchTarget}
              />
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 2,
                  p: 4
                }}
              >
                <TableChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('sentiment.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('wordFrequency.table.noData')}
                </Typography>
              </Box>
            )
          ) : (
            <SentimentVisualizationPanel
              results={filteredResults}
              summary={summary}
              analysisMode={analysisMode}
              corpusSelection={corpusSelection}
              emotionFilterPolarity={emotionFilterPolarity}
              emotionFilterDimension={emotionFilterDimension}
              searchTarget={searchConfig.searchTarget}
              activeTab={vizTab}
              onActiveTabChange={setVizTab}
            />
          )}
        </Box>
      </Box>
      <SentimentFilterDialog
        open={filterDialogOpen}
        onClose={() => setFilterDialogOpen(false)}
        analysisMode={analysisMode}
        filterPolarity={emotionFilterPolarity}
        filterDimension={emotionFilterDimension}
        onConfirm={(p, d) => { setEmotionFilterPolarity(p); setEmotionFilterDimension(d) }}
      />
    </Box>
  )
}

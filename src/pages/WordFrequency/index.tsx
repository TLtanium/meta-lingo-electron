/**
 * Word Frequency Analysis Page
 * Full word frequency analysis with POS filtering, search, and visualizations
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
  Alert,
  CircularProgress
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TableChartIcon from '@mui/icons-material/TableChart'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { analysisApi } from '../../api'
import type { 
  POSFilterConfig,
  SearchConfig,
  WordFrequencyResult,
  WordFrequencyRequest,
  VisualizationConfig,
  TableSortConfig,
  TablePaginationConfig,
  POSTagInfo
} from '../../types/wordFrequency'
import {
  DEFAULT_POS_FILTER,
  DEFAULT_SEARCH_CONFIG,
  DEFAULT_VIZ_CONFIG,
  DEFAULT_TABLE_SORT,
  DEFAULT_TABLE_PAGINATION
} from '../../types/wordFrequency'
import POSFilterPanel from './POSFilterPanel'
import SearchConfigPanel from './SearchConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../stores/settingsStore'
import type { CrossLinkParams } from '../../types/crossLink'

interface WordFrequencyProps {
  crossLinkParams?: CrossLinkParams
}

export default function WordFrequency({ crossLinkParams }: WordFrequencyProps = {}) {
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
  const [minFreq, setMinFreq] = useState(1)
  const [maxFreq, setMaxFreq] = useState<number | null>(null)
  const [lowercase, setLowercase] = useState(true)

  // Results state
  const [results, setResults] = useState<WordFrequencyResult[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [uniqueWords, setUniqueWords] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Table state
  const [sortConfig, setSortConfig] = useState<TableSortConfig>(DEFAULT_TABLE_SORT)
  const [paginationConfig, setPaginationConfig] = useState<TablePaginationConfig>(DEFAULT_TABLE_PAGINATION)
  const [selectedWords, setSelectedWords] = useState<string[]>([])

  // Visualization state
  const [vizConfig, setVizConfig] = useState<VisualizationConfig>(DEFAULT_VIZ_CONFIG)
  
  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

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
      // Always pass search_config to include searchTarget (word/lemma)
      const request: WordFrequencyRequest = {
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        search_config: searchConfig,
        min_freq: minFreq,
        max_freq: maxFreq ?? undefined,
        lowercase
      }

      const response = await analysisApi.wordFrequency(request)

      if (response.success && response.data) {
        if (response.data.success) {
          // Normalize results for table and charts (ensure array and shape)
          const rawResults = response.data.results
          const resultsList = Array.isArray(rawResults) ? rawResults : []
          const normalizedResults: WordFrequencyResult[] = resultsList.map((r: any, idx: number) => ({
            word: r?.word ?? r?.token ?? String(r?.word ?? r?.token ?? ''),
            frequency: typeof r?.frequency === 'number' ? r.frequency : Number(r?.count ?? r?.frequency ?? 0),
            percentage: typeof r?.percentage === 'number' ? r.percentage : (r?.percentage ?? 0),
            rank: typeof r?.rank === 'number' ? r.rank : (idx + 1)
          }))
          setResults(normalizedResults)
          setTotalTokens(response.data.total_tokens ?? 0)
          setUniqueWords(response.data.unique_words ?? 0)
          setSelectedWords([])
          // Reset pagination
          setPaginationConfig({ ...paginationConfig, page: 0 })
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

  // Check if analysis can run (require at least one text when textIds is an array)
  const canAnalyze = corpusSelection !== null && (
    corpusSelection.textIds === 'all' ||
    (Array.isArray(corpusSelection.textIds) && corpusSelection.textIds.length > 0)
  )

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
            {t('wordFrequency.title')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('wordFrequency.title')}
            getContext={() => {
              const hint = t('aiAssistant.wordFrequencyContextHint')
              const corpusInfo = corpusSelection
                ? `${t('wordFrequency.corpus.title')}: ${corpusSelection.dataSource === 'corpus' ? 'corpus' : 'library'}, ${corpusSelection.textIds === 'all' ? 'all' : corpusSelection.textIds.length} ${t('corpus.textsCount')}`
                : t('wordFrequency.corpus.title') + ': (none)'
              const params = `minFreq=${minFreq}, maxFreq=${maxFreq ?? 'null'}, lowercase=${lowercase}`
              const stats = `totalTokens=${totalTokens}, uniqueWords=${uniqueWords}`
              if (results.length === 0) {
                return `${hint}\n\n${corpusInfo}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
              }
              if (rightTab === 0) {
                const page = Math.max(0, Number(paginationConfig.page) || 0)
                const pageSize = Math.max(1, Number(paginationConfig.rowsPerPage) || 25)
                const start = page * pageSize
                const slice = results.slice(start, start + pageSize)
                const header = `序号\t${t('wordFrequency.table.word')}\t${t('wordFrequency.table.frequency')}\t${t('wordFrequency.table.percentage')}\t${t('wordFrequency.table.rank')}`
                const tableLines = slice.map((r, i) => `${start + i + 1}\t${r.word}\t${r.frequency}\t${r.percentage?.toFixed(4) ?? ''}\t${r.rank ?? ''}`).join('\n')
                return `${hint}\n\n${corpusInfo}\n${params}\n${stats}\n${t('wordFrequency.results.title')} (rows ${start + 1}-${start + slice.length}, total ${results.length}):\n${header}\n${tableLines}`
              }
              const chartLabel = vizConfig.chartType === 'bar' ? 'bar' : vizConfig.chartType === 'pie' ? 'pie' : 'wordcloud'
              const top = results.slice(0, 50).map(r => `${r.word}\t${r.frequency}`).join('\n')
              return `${hint}\n\n${corpusInfo}\n${params}\n${stats}\n${t('wordFrequency.visualization.title')}: ${chartLabel}. Top 50:\n${t('wordFrequency.table.word')}\t${t('wordFrequency.table.frequency')}\n${top}`
            }}
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
          sectionTitle={t('wordFrequency.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

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
            corpusLanguage={corpusSelection?.language || 'english'}
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
          {isLoading ? t('common.loading') : t('wordFrequency.analyze')}
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
            <Tab label={t('wordFrequency.results.title')} />
            <Tab label={t('wordFrequency.visualization.title')} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 ? (
            results.length > 0 ? (
              <ResultsTable
                results={results}
                totalTokens={totalTokens}
                uniqueWords={uniqueWords}
                sortConfig={sortConfig}
                paginationConfig={paginationConfig}
                selectedWords={selectedWords}
                onSortChange={setSortConfig}
                onPaginationChange={setPaginationConfig}
                onSelectionChange={setSelectedWords}
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
                  {t('wordFrequency.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('wordFrequency.description')}
                </Typography>
              </Box>
            )
          ) : (
            <VisualizationPanel
              data={results}
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
                      ...(corpusSelection.libraryId && corpusSelection.selectionMode === 'selected' && corpusSelection.selectedEntryIds?.length && { selectedEntryIds: corpusSelection.selectedEntryIds }),
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

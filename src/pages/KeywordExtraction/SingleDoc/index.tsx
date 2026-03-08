/**
 * Single Document Keyword Extraction Tab
 * TF-IDF, TextRank, YAKE!, RAKE algorithms
 */

import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
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
import { useTabStore } from '../../../stores/tabStore'
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
import { buildSingleDocKeywordAIContext } from './buildAIContext'
import AnalysisAIAssistant from '../../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../../stores/settingsStore'
import type { CrossLinkParams } from '../../../types/crossLink'

// Lazy-load visualization (pulls in D3/d3-cloud); only load when user switches to Visualization tab
const VisualizationPanel = lazy(() => import('./VisualizationPanel'))

interface SingleDocTabProps {
  crossLinkParams?: CrossLinkParams
}

export default function SingleDocTab({ crossLinkParams }: SingleDocTabProps = {}) {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

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

  // Lifted table state (for AI context)
  const [tableFilter, setTableFilter] = useState('')
  const [tableOrderBy, setTableOrderBy] = useState<'rank' | 'keyword' | 'score' | 'frequency'>('rank')
  const [tableOrder, setTableOrder] = useState<'asc' | 'desc'>('asc')
  const [tablePage, setTablePage] = useState(0)
  const [tableRowsPerPage, setTableRowsPerPage] = useState(25)
  const [vizTab, setVizTab] = useState<'bar' | 'pie' | 'wordcloud'>('bar')

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
    if (!corpusSelection) return

    setIsLoading(true)
    setError(null)

    try {
      // Get algorithm-specific config
      const algorithmConfig = config[algorithm]
      
      // Build stopwords config (only pass if enabled or has exclude words)
      const hasStopwordsConfig = stopwordsConfig.removeStopwords || stopwordsConfig.excludeWords.length > 0
      
      const response = await keywordApi.singleDoc({
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        algorithm,
        config: algorithmConfig,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        lowercase,
        stopwords_config: hasStopwordsConfig ? stopwordsConfig : undefined,
        language: corpusSelection.language || 'english'
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
  const canAnalyze = corpusSelection !== null
  const selectedCount = corpusSelection
    ? (corpusSelection.textIds === 'all' ? 0 : corpusSelection.textIds.length)
    : 0

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
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t('keyword.singleDoc.title', 'Single Document Keywords')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('keyword.singleDoc.title', 'Single Document Keywords')}
            getContext={() =>
              buildSingleDocKeywordAIContext({
                t,
                corpusSelection,
                posFilter,
                stopwordsConfig,
                algorithm,
                config,
                lowercase,
                results,
                totalKeywords,
                rightTab,
                tableFilter,
                sortColumn: tableOrderBy,
                sortDirection: tableOrder,
                paginationConfig: { page: tablePage, rowsPerPage: tableRowsPerPage },
                vizTab
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
          sectionTitle={t('keyword.corpus.title', 'Corpus Selection')}
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
                  disabled={!corpusSelection}
                />
              }
              label={
                <Typography variant="body2">
                  {t('keyword.stopwords.removeStopwords')}
                </Typography>
              }
              sx={{ mr: 0 }}
            />
            {stopwordsConfig.removeStopwords && corpusSelection && (
              <Chip 
                label={corpusSelection.language || 'english'} 
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
            disabled={!corpusSelection}
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
                searchQuery={tableFilter}
                orderBy={tableOrderBy}
                order={tableOrder}
                page={tablePage}
                rowsPerPage={tableRowsPerPage}
                onSearchQueryChange={setTableFilter}
                onSortChange={(by, dir) => {
                  setTableOrderBy(by)
                  setTableOrder(dir)
                }}
                onPageChange={setTablePage}
                onRowsPerPageChange={(v) => {
                  setTableRowsPerPage(v)
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
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><CircularProgress /></Box>}>
              <VisualizationPanel
                data={results}
                activeTab={vizTab}
                onActiveTabChange={setVizTab}
                onKeywordClick={corpusSelection ? (keyword) => {
                  openTab({
                    type: 'collocation',
                    title: `${t('collocation.title')} - ${keyword}`,
                    props: {
                      crossLinkParams: {
                        searchWord: keyword,
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
            </Suspense>
          )}
        </Box>
      </Box>
    </Box>
  )
}


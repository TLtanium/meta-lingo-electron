/**
 * Synonym Analysis Page
 * Analyze word synonyms using NLTK WordNet with SpaCy annotation data
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
import { analysisApi } from '../../api'
import type { 
  SynonymResult,
  SynonymRequest,
  SynonymVizConfig,
  POSOption
} from '../../types/synonym'
import { DEFAULT_SYNONYM_REQUEST, DEFAULT_VIZ_CONFIG, POS_FILTER_OPTIONS } from '../../types/synonym'
import POSFilterPanel from './POSFilterPanel'
import SearchConfigPanel from './SearchConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'
import { buildSynonymAIContext } from './buildAIContext'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../stores/settingsStore'
import type { CrossLinkParams } from '../../types/crossLink'

interface SynonymAnalysisProps {
  crossLinkParams?: CrossLinkParams
}

export default function SynonymAnalysis({ crossLinkParams }: SynonymAnalysisProps = {}) {
  const { t } = useTranslation()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

  // Filter state
  const [posFilter, setPosFilter] = useState<string>('auto')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTarget, setSearchTarget] = useState<'word' | 'lemma'>('lemma')
  const [minFreq, setMinFreq] = useState(1)
  const [maxResults, setMaxResults] = useState(100)
  const [lowercase, setLowercase] = useState(true)

  // Results state
  const [results, setResults] = useState<SynonymResult[]>([])
  const [totalWords, setTotalWords] = useState(0)
  const [uniqueWords, setUniqueWords] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selection state
  const [selectedWords, setSelectedWords] = useState<string[]>([])

  // Visualization state
  const [vizConfig, setVizConfig] = useState<SynonymVizConfig>(DEFAULT_VIZ_CONFIG)
  
  // Lifted table state (for AI context: filter, sort, pagination)
  const [tableFilter, setTableFilter] = useState('')
  const [tableSortField, setTableSortField] = useState<'word' | 'frequency' | 'synonym_count'>('frequency')
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('desc')
  const [tablePage, setTablePage] = useState(0)
  const [tableRowsPerPage, setTableRowsPerPage] = useState(25)
  // Lifted viz tab (network | tree) for AI context
  const [vizTab, setVizTab] = useState<'network' | 'tree'>('network')
  
  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

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
      ...(crossLinkParams.libraryId && { libraryId: crossLinkParams.libraryId })
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

  // Run analysis
  const handleAnalyze = async () => {
    if (!corpusSelection) return

    setIsLoading(true)
    setError(null)

    try {
      const request: SynonymRequest = {
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        pos_filter: posFilter,
        search_query: searchQuery,
        min_freq: minFreq,
        max_results: maxResults,
        lowercase,
        search_target: searchTarget
      }

      const response = await analysisApi.synonymAnalysis(request)
      
      if (response.success && response.data) {
        if (response.data.success) {
          setResults(response.data.results)
          setTablePage(0)
          setTotalWords(response.data.total_words)
          setUniqueWords(response.data.unique_words)
          setSelectedWords([])
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
            {t('synonym.title')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('synonym.title')}
            getContext={() =>
              buildSynonymAIContext({
                t,
                corpusSelection,
                posFilter,
                searchQuery,
                minFreq,
                maxResults,
                lowercase,
                results,
                totalWords,
                uniqueWords,
                rightTab,
                tableFilter,
                sortField: tableSortField,
                sortDirection: tableSortDirection,
                paginationConfig: { page: tablePage, rowsPerPage: tableRowsPerPage },
                vizTab,
                vizConfig
              })
            }
          />
        </Stack>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="secondary" variant="outlined" />
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
          sectionTitle={t('synonym.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

        {/* 2. POS Filter Panel */}
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            value={posFilter}
            onChange={setPosFilter}
            disabled={!corpusSelection}
          />
        </Box>

        {/* 3. Search Config Panel */}
        <Box sx={{ mb: 2 }}>
          <SearchConfigPanel
            searchQuery={searchQuery}
            searchTarget={searchTarget}
            minFreq={minFreq}
            maxResults={maxResults}
            lowercase={lowercase}
            onSearchQueryChange={setSearchQuery}
            onSearchTargetChange={setSearchTarget}
            onMinFreqChange={setMinFreq}
            onMaxResultsChange={setMaxResults}
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
          {isLoading ? t('common.loading') : t('synonym.analyze')}
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
            <Tab label={t('synonym.results.title')} />
            <Tab label={t('synonym.visualization.title')} />
          </Tabs>
        </Box>

        {/* Tab Content — render both panels and hide inactive to preserve state */}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Results tab panel */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              display: rightTab === 0 ? 'flex' : 'none',
              flexDirection: 'column'
            }}
          >
            {results.length > 0 ? (
              <ResultsTable
                results={results}
                totalWords={totalWords}
                uniqueWords={uniqueWords}
                selectedWords={selectedWords}
                onSelectionChange={setSelectedWords}
                isLoading={isLoading}
                searchFilter={tableFilter}
                sortField={tableSortField}
                sortDirection={tableSortDirection}
                page={tablePage}
                rowsPerPage={tableRowsPerPage}
                onSearchFilterChange={setTableFilter}
                onSortChange={(field, direction) => {
                  setTableSortField(field)
                  setTableSortDirection(direction)
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
                  {t('synonym.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('synonym.description')}
                </Typography>
              </Box>
            )}
          </Box>
          {/* Visualization tab panel */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              display: rightTab === 1 ? 'flex' : 'none',
              flexDirection: 'column'
            }}
          >
            <VisualizationPanel
              data={results}
              config={vizConfig}
              onConfigChange={(next) => {
                setVizConfig(next)
                setVizTab(next.type)
              }}
              activeTab={vizTab}
              onActiveTabChange={setVizTab}
              onWordClick={(word) => {
                const matchingKeys = results
                  .filter(r => r.word === word)
                  .map(r => `${r.word}-${r.pos_tags[0] || ''}`)
                const newKeys = matchingKeys.filter(k => !selectedWords.includes(k))
                if (newKeys.length > 0) {
                  setSelectedWords([...selectedWords, ...newKeys])
                }
                setRightTab(0)
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

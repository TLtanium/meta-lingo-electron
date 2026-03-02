/**
 * Co-occurrence Analysis Page
 * Single-page KWIC search with multiple search modes, POS filtering, and D3.js visualization
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Button,
  Divider,
  Stack,
  Chip,
  Alert,
  LinearProgress,
  CircularProgress,
  TabsActions
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import { useTranslation } from 'react-i18next'
import { collocationApi } from '../../api'
import type { CrossLinkParams } from '../../types'
import type {
  POSFilterConfig,
  SearchMode,
  SortMode,
  KWICResult,
  POSTagInfo
} from '../../types/collocation'
import {
  DEFAULT_POS_FILTER,
  DEFAULT_CONTEXT_SIZE,
  SEARCH_MODE_LABELS
} from '../../types/collocation'

import CollocationPOSFilter from './components/CollocationPOSFilter'
import CollocationSearchPanel from './components/CollocationSearchPanel'
import CollocationResultsTable from './components/CollocationResultsTable'
import CollocationVisualization from './components/CollocationVisualization'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../stores/settingsStore'

type SelectionMode = 'all' | 'selected' | 'tags'

interface CollocationProps {
  crossLinkParams?: CrossLinkParams
}

export default function Collocation({ crossLinkParams }: CollocationProps) {
  const { t } = useTranslation()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

  // POS tags
  const [posTags, setPosTags] = useState<POSTagInfo[]>([])

  // Search state
  const [searchMode, setSearchMode] = useState<SearchMode>('simple')
  const [searchValue, setSearchValue] = useState('')
  const [contextSize, setContextSize] = useState(DEFAULT_CONTEXT_SIZE)
  const [lowercase, setLowercase] = useState(false)

  // POS filter state
  const [posFilter, setPosFilter] = useState<POSFilterConfig>(DEFAULT_POS_FILTER)


  // Sort state - load from localStorage
  const loadSortSettings = (): { sortBy: SortMode; sortLevels: string[]; sortDescending: boolean } => {
    try {
      const saved = localStorage.getItem('collocation_sort_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          sortBy: parsed.sortBy || 'left_context',
          sortLevels: parsed.sortLevels || ['1L', '2L', '3L'],
          sortDescending: parsed.sortDescending || false
        }
      }
    } catch (err) {
      console.error('Failed to load sort settings:', err)
    }
    return {
      sortBy: 'left_context',
      sortLevels: ['1L', '2L', '3L'],
      sortDescending: false
    }
  }

  const savedSortSettings = loadSortSettings()
  const [sortBy, setSortBy] = useState<SortMode>(savedSortSettings.sortBy)
  const [sortLevels, setSortLevels] = useState<string[]>(savedSortSettings.sortLevels)
  const [sortDescending, setSortDescending] = useState<boolean>(savedSortSettings.sortDescending)

  // Save sort settings to localStorage
  const saveSortSettings = (sortBy: SortMode, sortLevels: string[], sortDescending: boolean) => {
    try {
      localStorage.setItem('collocation_sort_settings', JSON.stringify({
        sortBy,
        sortLevels,
        sortDescending
      }))
    } catch (err) {
      console.error('Failed to save sort settings:', err)
    }
  }

  // Wrapper functions to save on change
  const handleSortByChange = (newSortBy: SortMode) => {
    setSortBy(newSortBy)
    saveSortSettings(newSortBy, sortLevels, sortDescending)
  }

  const handleSortLevelsChange = (newSortLevels: string[]) => {
    setSortLevels(newSortLevels)
    saveSortSettings(sortBy, newSortLevels, sortDescending)
  }

  const handleSortDescendingChange = (newSortDescending: boolean) => {
    setSortDescending(newSortDescending)
    saveSortSettings(sortBy, sortLevels, newSortDescending)
  }

  // Handle sort change with immediate re-sort
  const handleSortChangeAndResort = (newSortBy: SortMode, newSortLevels: string[], newSortDescending: boolean) => {
    setSortBy(newSortBy)
    setSortLevels(newSortLevels)
    setSortDescending(newSortDescending)
    saveSortSettings(newSortBy, newSortLevels, newSortDescending)
    // Use the new values directly in search
    if (corpusSelection && searchValue.trim()) {
      setIsSearching(true)
      setError(null)
      // When CQL swap is needed, request larger context so after re-centering both sides have enough tokens
      const needsSwap = !!(kwicKeywordLemma && searchMode === 'cql')
      const requestContextSize = needsSwap ? contextSize * 3 : contextSize
      collocationApi.searchKWIC({
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        search_mode: searchMode,
        search_value: searchValue,
        context_size: requestContextSize,
        lowercase,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        sort_by: newSortBy,
        sort_levels: newSortLevels,
        sort_descending: newSortDescending
      }).then(response => {
        if (response.success && response.data) {
          if (response.data.success) {
            let filteredResults = response.data.results

            // Post-process CQL results: swap keyword to mainWord using token.lemma
            // Since we requested larger context (contextSize*3), always trim to contextSize after swap
            // Filter out results where swap fails (mainWord not in context window)
            if (needsSwap) {
              const targetLemma = kwicKeywordLemma.toLowerCase()
              const cs = contextSize // trim to user-requested context size after swap
              filteredResults = filteredResults.map((result: KWICResult) => {
                // Check if keyword is already the target (no swap needed)
                // Still need to trim context since we requested larger window
                const matchedLemma = result.matched_tokens?.[0]?.lemma?.toLowerCase()
                if (matchedLemma === targetLemma) {
                  return {
                    ...result,
                    left_context: (result.left_context || []).slice(-cs),
                    right_context: (result.right_context || []).slice(0, cs)
                  }
                }

                const left = result.left_context || []
                const right = result.right_context || []

                // Search right context first (closer positions first)
                const ri = right.findIndex((t: any) => (t.lemma || '').toLowerCase() === targetLemma)
                if (ri !== -1) {
                  const newKeyword = typeof right[ri] === 'string' ? right[ri] : (right[ri] as any).text
                  const newLeft = [...left, ...(result.matched_tokens || [{ text: result.keyword }]), ...right.slice(0, ri)]
                  const newRight = right.slice(ri + 1)
                  return {
                    ...result,
                    keyword: newKeyword,
                    left_context: newLeft.slice(-cs),
                    right_context: newRight.slice(0, cs),
                    pos: (right[ri] as any).pos || result.pos
                  }
                }
                // Search left context (from end, closest to keyword)
                for (let i = left.length - 1; i >= 0; i--) {
                  if (((left[i] as any).lemma || '').toLowerCase() === targetLemma) {
                    const newKeyword = typeof left[i] === 'string' ? left[i] : (left[i] as any).text
                    const newLeft = left.slice(0, i)
                    const newRight = [...left.slice(i + 1), ...(result.matched_tokens || [{ text: result.keyword }]), ...right]
                    return {
                      ...result,
                      keyword: newKeyword,
                      left_context: newLeft.slice(-cs),
                      right_context: newRight.slice(0, cs),
                      pos: (left[i] as any).pos || result.pos
                    }
                  }
                }
                // Mark as swap-failed (mainWord not found in context)
                return { ...result, _swapFailed: true }
              })
              // Filter out results where swap failed - these have wrong center word
              filteredResults = filteredResults.filter((r: any) => !r._swapFailed)
            }

            // Filter results by context filter words using both token.lemma and token.text
            if (contextFilterWords.length > 0) {
              filteredResults = filteredResults.filter((result: KWICResult) => {
                const allContext = [...(result.left_context || []), ...(result.right_context || [])]
                return contextFilterWords.some(word => {
                  const wl = word.toLowerCase()
                  return allContext.some((t: any) => {
                    const tokenText = (typeof t === 'string' ? t : t.text || '').toLowerCase()
                    const tokenLemma = (typeof t === 'string' ? t : t.lemma || t.text || '').toLowerCase()
                    return tokenLemma === wl || tokenText === wl
                  })
                })
              })
            }

            const hasPostFilter = (kwicKeywordLemma && searchMode === 'cql') || contextFilterWords.length > 0
            setResults(filteredResults)
            setTotalCount(hasPostFilter ? filteredResults.length : response.data.total_count)
          } else {
            setError(response.data.error || 'Search failed')
          }
        } else {
          setError(response.error || 'Search failed')
        }
      }).catch((err: any) => {
        setError(err.message || 'Search failed')
      }).finally(() => {
        setIsSearching(false)
      })
    }
  }

  // Results state
  const [results, setResults] = useState<KWICResult[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Metaphor highlight state
  const [showMetaphorHighlight, setShowMetaphorHighlight] = useState(false)

  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)
  const tabsActionRef = useRef<TabsActions>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  // Track if cross-link has been processed
  const crossLinkProcessedRef = useRef(false)
  const pendingAutoSearchRef = useRef(false)
  const handleSearchRef = useRef<() => void>(() => {})

  // Highlight words from cross-link (e.g., main word from Word Sketch)
  const [highlightWords, setHighlightWords] = useState<string[]>([])
  // Context filter words - only show results where context contains these words
  const [contextFilterWords, setContextFilterWords] = useState<string[]>([])
  // KWIC keyword lemma - the lemma that should be the KWIC center word (for swap after CQL)
  const [kwicKeywordLemma, setKwicKeywordLemma] = useState<string | undefined>(undefined)
  // KWIC highlight lemma - the lemma that should be highlighted in context
  const [kwicHighlightLemma, setKwicHighlightLemma] = useState<string | undefined>(undefined)

  // Clear cross-link related state when user manually changes search
  const clearCrossLinkState = () => {
    setHighlightWords([])
    setContextFilterWords([])
    setKwicKeywordLemma(undefined)
    setKwicHighlightLemma(undefined)
  }
  
  // Handle search value change - clear cross-link state when user manually changes search
  const handleSearchValueChange = (value: string) => {
    // Only clear cross-link state if this is a user-initiated change (not from cross-link)
    if (crossLinkProcessedRef.current) {
      clearCrossLinkState()
    }
    setSearchValue(value)
  }

  // Load POS tags on mount
  useEffect(() => {
    loadPosTags()
  }, [])

  // Force tabs indicator recalculation after mount (fixes positioning issue on cross-link navigation)
  // Use ResizeObserver for reliable detection of layout changes during lazy loading
  useEffect(() => {
    // Initial delayed updates
    const timers = [50, 150, 300, 500].map(delay => 
      setTimeout(() => {
        tabsActionRef.current?.updateIndicator()
      }, delay)
    )
    
    // ResizeObserver for layout changes
    const container = tabsContainerRef.current
    if (container) {
      const resizeObserver = new ResizeObserver(() => {
        tabsActionRef.current?.updateIndicator()
      })
      resizeObserver.observe(container)
      return () => {
        timers.forEach(clearTimeout)
        resizeObserver.disconnect()
      }
    }
    
    return () => timers.forEach(clearTimeout)
  }, [])

  // Handle cross-link params - set search word and options (user selects corpus in selector)
  useEffect(() => {
    if (!crossLinkParams) return
    // Sync corpus/library selection from cross-link so selector shows same source (corpus or library). Same pattern as Word Frequency.
    const sel: CorpusOrLibrarySelection = {
      corpusId: crossLinkParams.corpusId ?? '',
      textIds: Array.isArray(crossLinkParams.textIds) ? crossLinkParams.textIds : 'all',
      language: 'english',
      dataSource: crossLinkParams.libraryId ? 'library' : 'corpus',
      selectionMode: (crossLinkParams.selectionMode as 'all' | 'tags' | 'selected') ?? 'all',
      selectedTags: crossLinkParams.selectedTags ?? [],
      ...(crossLinkParams.libraryId && { libraryId: crossLinkParams.libraryId }),
      ...(crossLinkParams.selectedEntryIds?.length && { selectedEntryIds: crossLinkParams.selectedEntryIds })
    }
    setCorpusSelection(sel)
    if (crossLinkParams.semanticDomain) {
      const match = crossLinkParams.semanticDomainMatch || 'contains'
      const domain = crossLinkParams.semanticDomain
      const cql = match === 'exact' ? `[usas=="${domain}"]` : `[usas="${domain}"]`
      setSearchMode('cql')
      setSearchValue(cql)
    } else if (crossLinkParams.cqlQuery && crossLinkParams.forceSearchMode === 'cql') {
      setSearchMode('cql')
      setSearchValue(crossLinkParams.cqlQuery)
    } else if (crossLinkParams.searchWord) {
      setSearchValue(crossLinkParams.searchWord)
    }
    if (crossLinkParams.highlightWords && crossLinkParams.highlightWords.length > 0) {
      setHighlightWords(crossLinkParams.highlightWords)
    }
    if (crossLinkParams.contextFilterWords && crossLinkParams.contextFilterWords.length > 0 && !crossLinkParams.cqlQuery) {
      setContextFilterWords(crossLinkParams.contextFilterWords)
      if (!crossLinkParams.highlightWords || crossLinkParams.highlightWords.length === 0) {
        setHighlightWords(crossLinkParams.contextFilterWords)
      }
    }
    if (crossLinkParams.kwicKeywordLemma) setKwicKeywordLemma(crossLinkParams.kwicKeywordLemma)
    if (crossLinkParams.kwicHighlightLemma) setKwicHighlightLemma(crossLinkParams.kwicHighlightLemma)
    if (crossLinkParams.contextSize != null && crossLinkParams.contextSize >= 1 && crossLinkParams.contextSize <= 15) {
      setContextSize(crossLinkParams.contextSize)
    }
    if (crossLinkParams.sourceModule === 'metaphor') setShowMetaphorHighlight(true)
    if (crossLinkParams.targetSubTab !== undefined) setRightTab(crossLinkParams.targetSubTab)
    if (crossLinkParams.ignoreCase === true) setLowercase(true)
    if (crossLinkParams.autoSearch) pendingAutoSearchRef.current = true
  }, [crossLinkParams])

  // Auto-search when opened via cross-link and selection + search value are ready
  useEffect(() => {
    if (pendingAutoSearchRef.current && corpusSelection && searchValue.trim()) {
      pendingAutoSearchRef.current = false
      setTimeout(() => handleSearchRef.current(), 200)
    }
  }, [corpusSelection, searchValue])

  // Build external selection for selector so it can sync UI when opened via cross-link.
  // When in library mode, allow building when only libraryId is present so selector can sync and emit real corpus_id.
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

  const loadPosTags = async () => {
    try {
      const response = await collocationApi.getPosTags()
      if (response.success && response.data) {
        setPosTags(response.data)
      }
    } catch (err) {
      console.error('Failed to load POS tags:', err)
    }
  }

  // Run search
  const handleSearch = async () => {
    if (!corpusSelection || !searchValue.trim()) return

    setIsSearching(true)
    setError(null)

    try {
      // When CQL swap is needed, request larger context so after re-centering both sides have enough tokens
      const needsSwap = !!(kwicKeywordLemma && searchMode === 'cql')
      const requestContextSize = needsSwap ? contextSize * 3 : contextSize
      const response = await collocationApi.searchKWIC({
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        search_mode: searchMode,
        search_value: searchValue,
        context_size: requestContextSize,
        lowercase,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        sort_by: sortBy,
        sort_levels: sortLevels,
        sort_descending: sortDescending
      })

      if (response.success && response.data) {
        if (response.data.success) {
          let filteredResults = response.data.results

          // Post-process CQL results: swap keyword to mainWord using token.lemma
          // Since we requested larger context (contextSize*3), always trim to contextSize after swap
          // Filter out results where swap fails (mainWord not in context window)
          if (needsSwap) {
            const targetLemma = kwicKeywordLemma.toLowerCase()
            const cs = contextSize // trim to user-requested context size after swap
            filteredResults = filteredResults.map((result: KWICResult) => {
              // Check if keyword is already the target (no swap needed)
              // Still need to trim context since we requested larger window
              const matchedLemma = result.matched_tokens?.[0]?.lemma?.toLowerCase()
              if (matchedLemma === targetLemma) {
                return {
                  ...result,
                  left_context: (result.left_context || []).slice(-cs),
                  right_context: (result.right_context || []).slice(0, cs)
                }
              }

              const left = result.left_context || []
              const right = result.right_context || []

              // Search right context first (closer positions first)
              const ri = right.findIndex((t: any) => (t.lemma || '').toLowerCase() === targetLemma)
              if (ri !== -1) {
                const newKeyword = typeof right[ri] === 'string' ? right[ri] : (right[ri] as any).text
                const newLeft = [...left, ...(result.matched_tokens || [{ text: result.keyword }]), ...right.slice(0, ri)]
                const newRight = right.slice(ri + 1)
                return {
                  ...result,
                  keyword: newKeyword,
                  left_context: newLeft.slice(-cs),
                  right_context: newRight.slice(0, cs),
                  pos: (right[ri] as any).pos || result.pos
                }
              }
              // Search left context (from end, closest to keyword)
              for (let i = left.length - 1; i >= 0; i--) {
                if (((left[i] as any).lemma || '').toLowerCase() === targetLemma) {
                  const newKeyword = typeof left[i] === 'string' ? left[i] : (left[i] as any).text
                  const newLeft = left.slice(0, i)
                  const newRight = [...left.slice(i + 1), ...(result.matched_tokens || [{ text: result.keyword }]), ...right]
                  return {
                    ...result,
                    keyword: newKeyword,
                    left_context: newLeft.slice(-cs),
                    right_context: newRight.slice(0, cs),
                    pos: (left[i] as any).pos || result.pos
                  }
                }
              }
              // Mark as swap-failed (mainWord not found in context)
              return { ...result, _swapFailed: true }
            })
            // Filter out results where swap failed - these have wrong center word
            filteredResults = filteredResults.filter((r: any) => !r._swapFailed)
          }

          // Filter results by context filter words using both token.lemma and token.text
          if (contextFilterWords.length > 0) {
            filteredResults = filteredResults.filter((result: KWICResult) => {
              const allContext = [...(result.left_context || []), ...(result.right_context || [])]
              return contextFilterWords.some(word => {
                const wl = word.toLowerCase()
                return allContext.some((t: any) => {
                  const tokenText = (typeof t === 'string' ? t : t.text || '').toLowerCase()
                  const tokenLemma = (typeof t === 'string' ? t : t.lemma || t.text || '').toLowerCase()
                  return tokenLemma === wl || tokenText === wl
                })
              })
            })
          }

          const hasPostFilter = (kwicKeywordLemma && searchMode === 'cql') || contextFilterWords.length > 0
          setResults(filteredResults)
          setTotalCount(hasPostFilter ? filteredResults.length : response.data.total_count)
        } else {
          setError(response.data.error || 'Search failed')
        }
      } else {
        setError(response.error || 'Search failed')
      }
    } catch (err: any) {
      setError(err.message || 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }
  handleSearchRef.current = handleSearch

  // Check if search can run
  const canSearch = corpusSelection !== null && searchValue.trim() && (
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
            {t('collocation.title')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('collocation.title')}
            getContext={() => {
              const hint = t('aiAssistant.collocationContextHint')
              const corpusInfo = corpusSelection ? `Corpus: ${corpusSelection.dataSource === 'corpus' ? 'corpus' : 'library'}, ${corpusSelection.textIds === 'all' ? 'all' : corpusSelection.textIds.length} texts` : 'Corpus: (none)'
              const params = `searchMode=${searchMode}, searchValue=${searchValue}, contextSize=${contextSize}, lowercase=${lowercase}`
              if (results.length === 0) return `${hint}\n\n${corpusInfo}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
              const slice = results.slice(0, 25)
              const leftStr = (r: KWICResult) => (r.left_context || []).map((t: { text?: string }) => t?.text ?? '').join(' ').trim()
              const rightStr = (r: KWICResult) => (r.right_context || []).map((t: { text?: string }) => t?.text ?? '').join(' ').trim()
              const lines = slice.map((r: KWICResult, i: number) => `${i + 1}. ${leftStr(r)} [${r.keyword ?? ''}] ${rightStr(r)}`).join('\n')
              const vizSample = results.slice(0, 15).map((r: KWICResult, i: number) => `${i + 1}. ${leftStr(r)} [${r.keyword ?? ''}] ${rightStr(r)}`).join('\n')
              const view = rightTab === 0 ? `KWIC results (rows 1-${slice.length}):\n${lines}` : `Visualization (KWIC). Sample 15:\n${vizSample}`
              return `${hint}\n\n${corpusInfo}\n${params}\n${view}`
            }}
          />
        </Stack>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          <Chip label="KWIC" size="small" variant="outlined" />
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
          sectionTitle={t('collocation.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

        {/* 2. POS Filter Panel (above search config) */}
        <CollocationPOSFilter
          config={posFilter}
          onChange={setPosFilter}
          posTags={posTags}
          disabled={!corpusSelection}
        />

        {/* 3. Search Panel */}
        <CollocationSearchPanel
          searchMode={searchMode}
          searchValue={searchValue}
          contextSize={contextSize}
          lowercase={lowercase}
          onSearchModeChange={setSearchMode}
          onSearchValueChange={handleSearchValueChange}
          onContextSizeChange={setContextSize}
          onLowercaseChange={setLowercase}
          disabled={!corpusSelection}
        />

        {/* 4. Search Button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={handleSearch}
          disabled={!canSearch || isSearching}
          fullWidth
          sx={{ mt: 2 }}
        >
          {isSearching ? t('common.loading') : t('collocation.search.run')}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>

      {/* Right panel - Results & Visualization */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isSearching && <LinearProgress />}

        {/* Tabs */}
        <Box ref={tabsContainerRef} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)} action={tabsActionRef}>
            <Tab label={t('collocation.results.title')} />
            <Tab label={t('collocation.visualization.title')} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 ? (
            results.length > 0 ? (
              <CollocationResultsTable
                results={results}
                totalCount={totalCount}
                corpusId={corpusSelection?.corpusId || ''}
                isLoading={isSearching}
                sortBy={sortBy}
                sortLevels={sortLevels}
                sortDescending={sortDescending}
                onSortByChange={handleSortByChange}
                onSortLevelsChange={handleSortLevelsChange}
                onSortDescendingChange={handleSortDescendingChange}
                onResort={handleSearch}
                onSortChangeAndResort={handleSortChangeAndResort}
                highlightWords={highlightWords}
                showMetaphorHighlight={showMetaphorHighlight}
                onShowMetaphorHighlightChange={setShowMetaphorHighlight}
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
                <FormatQuoteIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('collocation.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('collocation.description')}
                </Typography>
              </Box>
            )
          ) : (
            <CollocationVisualization
              results={results}
              corpusId={corpusSelection?.corpusId || ''}
            />
          )}
        </Box>
      </Box>

    </Box>
  )
}

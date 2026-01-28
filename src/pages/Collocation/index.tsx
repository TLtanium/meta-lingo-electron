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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  RadioGroup,
  Radio,
  FormControlLabel,
  TextField,
  InputAdornment,
  Checkbox,
  CircularProgress,
  OutlinedInput,
  ListItemText,
  TabsActions
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import { useTranslation } from 'react-i18next'
import { corpusApi, collocationApi } from '../../api'
import type { Corpus, CorpusText, CrossLinkParams } from '../../types'
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

type SelectionMode = 'all' | 'selected' | 'tags'

interface CollocationProps {
  crossLinkParams?: CrossLinkParams
}

export default function Collocation({ crossLinkParams }: CollocationProps) {
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
    if (selectedCorpus && searchValue.trim()) {
      setIsSearching(true)
      setError(null)
      collocationApi.searchKWIC({
        corpus_id: selectedCorpus.id,
        text_ids: getSelectedTextIds(),
        search_mode: searchMode,
        search_value: searchValue,
        context_size: contextSize,
        lowercase,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        sort_by: newSortBy,
        sort_levels: newSortLevels,
        sort_descending: newSortDescending
      }).then(response => {
        if (response.success && response.data) {
          if (response.data.success) {
            let filteredResults = response.data.results
            
            // Filter results by context filter words (from Word Sketch cross-link)
            if (contextFilterWords.length > 0) {
              filteredResults = filteredResults.filter((result: KWICResult) => {
                const leftContext = (result.left_context || []).join(' ').toLowerCase()
                const rightContext = (result.right_context || []).join(' ').toLowerCase()
                const fullContext = `${leftContext} ${rightContext}`
                
                // Check if any filter word appears in the context
                return contextFilterWords.some(word => {
                  const wordLower = word.toLowerCase()
                  const regex = new RegExp(`\\b${wordLower}\\b`, 'i')
                  return regex.test(fullContext)
                })
              })
            }
            
            // Process CQL results - swap keyword with main word from context (same as handleSearch)
            if (kwicKeywordLemma && searchMode === 'cql') {
              // Helper function to match word forms (handles inflections like business/businesses)
              const matchesLemma = (word: string, lemma: string): boolean => {
                const wordLower = word.toLowerCase()
                const lemmaLower = lemma.toLowerCase()
                // Exact match
                if (wordLower === lemmaLower) return true
                // Word starts with lemma (handles plurals, verb forms: business/businesses, work/working)
                if (wordLower.startsWith(lemmaLower)) return true
                // Lemma starts with word (handles cases like "their" matching "they")
                if (lemmaLower.startsWith(wordLower) && wordLower.length >= 3) return true
                return false
              }
              
              filteredResults = filteredResults.map((result: KWICResult) => {
                const leftContext = result.left_context || []
                const rightContext = result.right_context || []
                const currentKeyword = result.keyword
                
                const leftIndex = leftContext.findIndex((word: string) => 
                  matchesLemma(word, kwicKeywordLemma)
                )
                const rightIndex = rightContext.findIndex((word: string) => 
                  matchesLemma(word, kwicKeywordLemma)
                )
                
                if (leftIndex !== -1) {
                  const newKeyword = leftContext[leftIndex]
                  return {
                    ...result,
                    keyword: newKeyword,
                    left_context: [...leftContext.slice(0, leftIndex), ...leftContext.slice(leftIndex + 1), currentKeyword],
                    right_context: rightContext,
                    pos: result.pos
                  }
                } else if (rightIndex !== -1) {
                  const newKeyword = rightContext[rightIndex]
                  return {
                    ...result,
                    keyword: newKeyword,
                    left_context: leftContext,
                    right_context: [currentKeyword, ...rightContext.slice(0, rightIndex), ...rightContext.slice(rightIndex + 1)],
                    pos: result.pos
                  }
                }
                return result
              })
            }
            
            setResults(filteredResults)
            setTotalCount(contextFilterWords.length > 0 ? filteredResults.length : response.data.total_count)
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

  // Highlight words from cross-link (e.g., main word from Word Sketch)
  const [highlightWords, setHighlightWords] = useState<string[]>([])
  // Context filter words - only show results where context contains these words
  const [contextFilterWords, setContextFilterWords] = useState<string[]>([])
  // KWIC keyword lemma - for CQL multi-token matches, which token should be the keyword
  const [kwicKeywordLemma, setKwicKeywordLemma] = useState<string | undefined>(undefined)
  
  // Clear cross-link related state when user manually changes search
  const clearCrossLinkState = () => {
    setHighlightWords([])
    setContextFilterWords([])
    setKwicKeywordLemma(undefined)
  }
  
  // Handle search value change - clear cross-link state when user manually changes search
  const handleSearchValueChange = (value: string) => {
    // Only clear cross-link state if this is a user-initiated change (not from cross-link)
    if (crossLinkProcessedRef.current) {
      clearCrossLinkState()
    }
    setSearchValue(value)
  }

  // Load corpora and POS tags on mount
  useEffect(() => {
    loadCorpora()
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

  // Handle cross-link params - set up corpus and search word
  useEffect(() => {
    if (crossLinkParams && !crossLinkProcessedRef.current && corpora.length > 0) {
      const corpus = corpora.find(c => c.id === crossLinkParams.corpusId)
      if (corpus) {
        crossLinkProcessedRef.current = true
        setSelectedCorpus(corpus)
        setSelectionMode(crossLinkParams.selectionMode)
        
        if (crossLinkParams.selectionMode === 'tags' && crossLinkParams.selectedTags) {
          setSelectedTags(crossLinkParams.selectedTags)
        } else if (crossLinkParams.selectionMode === 'selected' && Array.isArray(crossLinkParams.textIds)) {
          setSelectedTextIds(crossLinkParams.textIds)
        }
        
        // Handle CQL query from Word Sketch cross-link
        if (crossLinkParams.cqlQuery && crossLinkParams.forceSearchMode === 'cql') {
          // Use CQL mode with the generated query
          setSearchMode('cql')
          setSearchValue(crossLinkParams.cqlQuery)
        } else {
          // Use simple search with the search word
          setSearchValue(crossLinkParams.searchWord)
        }
        
        // Set highlight words from cross-link (e.g., collocate from Word Sketch)
        if (crossLinkParams.highlightWords && crossLinkParams.highlightWords.length > 0) {
          setHighlightWords(crossLinkParams.highlightWords)
        }
        
        // Set context filter words - only show results where context contains these words
        // Note: When using CQL with dependency constraints, we don't need context filtering
        // as the CQL already ensures the grammatical relationship
        if (crossLinkParams.contextFilterWords && crossLinkParams.contextFilterWords.length > 0 && !crossLinkParams.cqlQuery) {
          setContextFilterWords(crossLinkParams.contextFilterWords)
          // Also use them as highlight words if not already set
          if (!crossLinkParams.highlightWords || crossLinkParams.highlightWords.length === 0) {
            setHighlightWords(crossLinkParams.contextFilterWords)
          }
        }
        
        // Set KWIC keyword lemma for CQL multi-token matches
        if (crossLinkParams.kwicKeywordLemma) {
          setKwicKeywordLemma(crossLinkParams.kwicKeywordLemma)
        }
        
        // Enable metaphor highlight by default when cross-linking from Metaphor Analysis
        if (crossLinkParams.sourceModule === 'metaphor') {
          setShowMetaphorHighlight(true)
        }
        
        if (crossLinkParams.autoSearch) {
          pendingAutoSearchRef.current = true
        }
      }
    }
  }, [crossLinkParams, corpora])

  // Auto-search when texts are loaded and auto-search is pending
  useEffect(() => {
    if (pendingAutoSearchRef.current && texts.length > 0 && selectedCorpus && searchValue.trim()) {
      pendingAutoSearchRef.current = false
      // Small delay to ensure state is settled
      setTimeout(() => {
        handleSearch()
      }, 100)
    }
  }, [texts, selectedCorpus, searchValue])

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
      const response = await collocationApi.getPosTags()
      if (response.success && response.data) {
        setPosTags(response.data)
      }
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

  // Run search
  const handleSearch = async () => {
    if (!selectedCorpus || !searchValue.trim()) return

    setIsSearching(true)
    setError(null)

    try {
      const response = await collocationApi.searchKWIC({
        corpus_id: selectedCorpus.id,
        text_ids: getSelectedTextIds(),
        search_mode: searchMode,
        search_value: searchValue,
        context_size: contextSize,
        lowercase,
        pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
        sort_by: sortBy,
        sort_levels: sortLevels,
        sort_descending: sortDescending
      })

      if (response.success && response.data) {
        if (response.data.success) {
          let filteredResults = response.data.results
          
          // Filter results by context filter words (from Word Sketch cross-link)
          if (contextFilterWords.length > 0) {
            filteredResults = filteredResults.filter((result: KWICResult) => {
              const leftContext = (result.left_context || []).join(' ').toLowerCase()
              const rightContext = (result.right_context || []).join(' ').toLowerCase()
              const fullContext = `${leftContext} ${rightContext}`
              
              // Check if any filter word appears in the context
              return contextFilterWords.some(word => {
                const wordLower = word.toLowerCase()
                // Match whole word using word boundary check
                const regex = new RegExp(`\\b${wordLower}\\b`, 'i')
                return regex.test(fullContext)
              })
            })
          }
          
          // Process CQL results for Word Sketch cross-link:
          // The CQL matches the collocate word with dependency constraint (e.g., [lemma="model" & dep="compound" & headlemma="business"])
          // But we want the main word (business) as KWIC keyword, and collocate (model) highlighted in context
          // So we need to find kwicKeywordLemma in context and swap it with the matched token
          if (kwicKeywordLemma && searchMode === 'cql') {
            // Helper function to match word forms (handles inflections like business/businesses)
            const matchesLemma = (word: string, lemma: string): boolean => {
              const wordLower = word.toLowerCase()
              const lemmaLower = lemma.toLowerCase()
              // Exact match
              if (wordLower === lemmaLower) return true
              // Word starts with lemma (handles plurals, verb forms: business/businesses, work/working)
              if (wordLower.startsWith(lemmaLower)) return true
              // Lemma starts with word (handles cases like "their" matching "they")
              if (lemmaLower.startsWith(wordLower) && wordLower.length >= 3) return true
              return false
            }
            
            filteredResults = filteredResults.map((result: KWICResult) => {
              const leftContext = result.left_context || []
              const rightContext = result.right_context || []
              const currentKeyword = result.keyword
              
              // Find kwicKeywordLemma in left or right context
              // Use flexible matching to handle word form variations
              const leftIndex = leftContext.findIndex((word: string) => 
                matchesLemma(word, kwicKeywordLemma)
              )
              const rightIndex = rightContext.findIndex((word: string) => 
                matchesLemma(word, kwicKeywordLemma)
              )
              
              if (leftIndex !== -1) {
                // Found in left context - swap with current keyword
                const newKeyword = leftContext[leftIndex]
                const newLeftContext = [
                  ...leftContext.slice(0, leftIndex),
                  ...leftContext.slice(leftIndex + 1),
                  currentKeyword  // Move collocate to end of left context (right before new keyword)
                ]
                return {
                  ...result,
                  keyword: newKeyword,
                  left_context: newLeftContext,
                  right_context: rightContext,
                  pos: result.pos  // Keep original POS
                }
              } else if (rightIndex !== -1) {
                // Found in right context - swap with current keyword
                const newKeyword = rightContext[rightIndex]
                const newRightContext = [
                  currentKeyword,  // Move collocate to start of right context (right after new keyword)
                  ...rightContext.slice(0, rightIndex),
                  ...rightContext.slice(rightIndex + 1)
                ]
                return {
                  ...result,
                  keyword: newKeyword,
                  left_context: leftContext,
                  right_context: newRightContext,
                  pos: result.pos
                }
              }
              
              // kwicKeywordLemma not found in context - keep as is
              return result
            })
          }
          
          setResults(filteredResults)
          setTotalCount(contextFilterWords.length > 0 ? filteredResults.length : response.data.total_count)
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

  // Check if search can run
  const canSearch = selectedCorpus && searchValue.trim() && (
    selectionMode === 'all' || 
    (selectionMode === 'tags' && selectedTags.length > 0 && filteredTexts.length > 0) ||
    (selectionMode === 'selected' && selectedTextIds.length > 0)
  )

  const selectedCount = (() => {
    const ids = getSelectedTextIds()
    return ids === 'all' ? texts.length : ids.length
  })()

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
        <Typography variant="h6" sx={{ mb: 1 }}>
          {t('collocation.title')}
        </Typography>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          <Chip label="KWIC" size="small" variant="outlined" />
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
            {t('collocation.corpus.title')}
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
                        {t('collocation.corpus.selectAll')} ({texts.length} {t('corpus.textsCount')})
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    value="tags"
                    control={<Radio size="small" />}
                    label={
                      <Typography variant="body2">
                        {t('topicModeling.corpus.selectByTags')}
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    value="selected"
                    control={<Radio size="small" />}
                    label={
                      <Typography variant="body2">
                        {t('collocation.corpus.selectManually')}
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
                      maxHeight: 120,
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
                    {t('collocation.corpus.selectedCount')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}
                  </Typography>
                </Alert>
              </>
            )}
          </Stack>
        </Paper>

        {/* 2. POS Filter Panel (above search config) */}
        <CollocationPOSFilter
          config={posFilter}
          onChange={setPosFilter}
          posTags={posTags}
          disabled={!selectedCorpus}
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
          disabled={!selectedCorpus}
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
                corpusId={selectedCorpus?.id || ''}
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
              corpusId={selectedCorpus?.id || ''}
            />
          )}
        </Box>
      </Box>

    </Box>
  )
}

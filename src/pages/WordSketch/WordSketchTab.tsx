/**
 * Word Sketch Tab
 * Main Word Sketch analysis component with three-column layout
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Box,
  Typography,
  LinearProgress,
  Paper,
  Stack,
  Chip,
  Button,
  Alert,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  RadioGroup,
  Radio,
  FormControlLabel,
  Checkbox,
  InputAdornment,
  CircularProgress,
  OutlinedInput,
  ListItemText,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  SelectChangeEvent
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { corpusApi, sketchApi } from '../../api'
import type { Corpus, CorpusText, CrossLinkParams } from '../../types'
import type { 
  WordSketchResult, 
  RelationData, 
  Collocation,
  POSOption 
} from '../../api/sketch'
import NumberInput from '../../components/Common/NumberInput'
import { WordActionMenu } from '../../components/Common'
import SketchVisualization from './components/SketchVisualization'

type SelectionMode = 'all' | 'selected' | 'tags'

// Search types
const SEARCH_TYPES = [
  { value: 'all', label_en: 'All', label_zh: '全部' },
  { value: 'starts', label_en: 'Starts with', label_zh: '以...开头' },
  { value: 'ends', label_en: 'Ends with', label_zh: '以...结尾' },
  { value: 'contains', label_en: 'Contains', label_zh: '包含' },
  { value: 'regex', label_en: 'Regex', label_zh: '正则表达式' },
  { value: 'wordlist', label_en: 'Word List', label_zh: '词表' }
]

interface WordSketchTabProps {
  crossLinkParams?: CrossLinkParams
}

export default function WordSketchTab({ crossLinkParams }: WordSketchTabProps) {
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

  // Search state
  const [searchWord, setSearchWord] = useState('')
  const [posFilter, setPosFilter] = useState('auto')
  const [posOptions, setPosOptions] = useState<POSOption[]>([])
  const [minFrequency, setMinFrequency] = useState(2)
  const [resultsPerRelation, setResultsPerRelation] = useState(12)
  const [minScore, setMinScore] = useState(0)

  // Results state
  const [result, setResult] = useState<WordSketchResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Right panel state
  const [rightTab, setRightTab] = useState(0)
  const [expandedRelations, setExpandedRelations] = useState<Set<string>>(new Set())
  const [selectedVisualizationRelation, setSelectedVisualizationRelation] = useState('all')
  
  // Track displayed results count per relation (for "Show More" functionality)
  const [displayedCounts, setDisplayedCounts] = useState<Record<string, number>>({})

  // Track if cross-link has been processed
  const crossLinkProcessedRef = useRef(false)
  const pendingAutoSearchRef = useRef(false)

  // Load corpora and POS options on mount
  useEffect(() => {
    loadCorpora()
    loadPosOptions()
  }, [])

  // Handle cross-link params - set up corpus and search word
  useEffect(() => {
    if (crossLinkParams && !crossLinkProcessedRef.current && corpora.length > 0) {
      const corpus = corpora.find(c => c.id === crossLinkParams.corpusId)
      if (corpus) {
        crossLinkProcessedRef.current = true
        setSelectedCorpus(corpus)
        setSearchWord(crossLinkParams.searchWord)
        setSelectionMode(crossLinkParams.selectionMode)
        
        if (crossLinkParams.selectionMode === 'tags' && crossLinkParams.selectedTags) {
          setSelectedTags(crossLinkParams.selectedTags)
        } else if (crossLinkParams.selectionMode === 'selected' && Array.isArray(crossLinkParams.textIds)) {
          setSelectedTextIds(crossLinkParams.textIds)
        }
        
        if (crossLinkParams.autoSearch) {
          pendingAutoSearchRef.current = true
        }
      }
    }
  }, [crossLinkParams, corpora])

  // Auto-search when texts are loaded and auto-search is pending
  useEffect(() => {
    if (pendingAutoSearchRef.current && texts.length > 0 && selectedCorpus && searchWord.trim()) {
      pendingAutoSearchRef.current = false
      // Small delay to ensure state is settled
      setTimeout(() => {
        handleAnalyze()
      }, 100)
    }
  }, [texts, selectedCorpus, searchWord])

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

  const loadPosOptions = async () => {
    try {
      const response = await sketchApi.getPosOptions()
      if (response.success && response.data) {
        setPosOptions(response.data)
      }
    } catch (err) {
      console.error('Failed to load POS options:', err)
      // Default options
      setPosOptions([
        { value: 'auto', label_en: 'Auto', label_zh: '自动' },
        { value: 'adjective', label_en: 'Adjective', label_zh: '形容词' },
        { value: 'adverb', label_en: 'Adverb', label_zh: '副词' },
        { value: 'noun', label_en: 'Noun', label_zh: '名词' },
        { value: 'verb', label_en: 'Verb', label_zh: '动词' },
        { value: 'pronoun', label_en: 'Pronoun', label_zh: '代词' }
      ])
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
    setResult(null)
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

  // Toggle relation expansion
  const toggleRelation = (relationName: string) => {
    setExpandedRelations(prev => {
      const next = new Set(prev)
      if (next.has(relationName)) {
        next.delete(relationName)
      } else {
        next.add(relationName)
      }
      return next
    })
  }

  // Expand/collapse all relations
  const expandAllRelations = () => {
    if (result?.relations) {
      setExpandedRelations(new Set(Object.keys(result.relations)))
    }
  }

  const collapseAllRelations = () => {
    setExpandedRelations(new Set())
  }

  // Get displayed count for a relation (default to resultsPerRelation)
  const getDisplayedCount = (relationName: string) => {
    return displayedCounts[relationName] || resultsPerRelation
  }

  // Handle show more for a specific relation
  const handleShowMore = (relationName: string) => {
    setDisplayedCounts(prev => ({
      ...prev,
      [relationName]: (prev[relationName] || resultsPerRelation) + resultsPerRelation
    }))
  }

  // Handle show less for a specific relation
  const handleShowLess = (relationName: string) => {
    setDisplayedCounts(prev => ({
      ...prev,
      [relationName]: resultsPerRelation
    }))
  }

  // Run analysis
  const handleAnalyze = async () => {
    if (!selectedCorpus || !searchWord.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await sketchApi.generateWordSketch({
        corpus_id: selectedCorpus.id,
        text_ids: getSelectedTextIds(),
        word: searchWord.trim(),
        pos: posFilter,
        min_frequency: minFrequency,
        min_score: minScore,
        max_results: 200  // Request more data, display controlled by resultsPerRelation
      })

      if (response.success && response.data) {
        setResult(response.data)
        // Reset displayed counts
        setDisplayedCounts({})
        // Auto-expand all relations
        if (response.data.relations) {
          const keys = Object.keys(response.data.relations)
          setExpandedRelations(new Set(keys))
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
  const canAnalyze = selectedCorpus && searchWord.trim() && (
    selectionMode === 'all' || 
    (selectionMode === 'tags' && selectedTags.length > 0 && filteredTexts.length > 0) ||
    (selectionMode === 'selected' && selectedTextIds.length > 0)
  )

  const selectedCount = (() => {
    const ids = getSelectedTextIds()
    return ids === 'all' ? texts.length : ids.length
  })()

  // Get display name for relation (with safe fallback)
  const getRelationDisplay = (rel: RelationData) => {
    if (!rel) return ''
    const display = i18n.language === 'zh' ? rel.display_zh : rel.display_en
    return display || rel.name || ''
  }

  return (
    <Box sx={{ display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
      {/* Left panel - Configuration */}
      <Box sx={{ 
        width: 400,
        flexShrink: 0,
        borderRight: 1, 
        borderColor: 'divider', 
        overflow: 'auto', 
        p: 2,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Typography variant="h6" gutterBottom>
          {t('wordsketch.wordSketch')}
        </Typography>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          <Chip label="logDice" size="small" color="secondary" variant="outlined" />
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
            {t('wordsketch.corpus')}
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
                        {t('wordFrequency.corpus.selectAll')} ({texts.length} {t('corpus.textsCount')})
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
                        {t('wordFrequency.corpus.selectManually')}
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
                    {t('wordFrequency.corpus.selectedCount')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}
                  </Typography>
                </Alert>
              </>
            )}
          </Stack>
        </Paper>

        {/* 2. Search Configuration */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('wordsketch.searchConfig')}
          </Typography>

          <Stack spacing={2}>
            {/* Search word input */}
            <TextField
              label={t('wordsketch.searchWord')}
              value={searchWord}
              onChange={(e) => setSearchWord(e.target.value)}
              fullWidth
              size="small"
              placeholder={t('wordsketch.searchWordPlaceholder')}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAnalyze) {
                  handleAnalyze()
                }
              }}
            />

            {/* POS filter */}
            <FormControl fullWidth size="small">
              <InputLabel>{t('wordsketch.posFilter')}</InputLabel>
              <Select
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value)}
                label={t('wordsketch.posFilter')}
              >
                {posOptions.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {i18n.language === 'zh' ? opt.label_zh : opt.label_en}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Results per relation */}
            <NumberInput
              label={t('wordsketch.resultsPerRelation')}
              value={resultsPerRelation}
              onChange={setResultsPerRelation}
              min={5}
              max={100}
              integer
              size="small"
              fullWidth
            />

            {/* Min frequency */}
            <NumberInput
              label={t('wordsketch.minFrequency')}
              value={minFrequency}
              onChange={setMinFrequency}
              min={1}
              max={100}
              integer
              size="small"
              fullWidth
            />

            {/* Min score */}
            <NumberInput
              label={t('wordsketch.minScore')}
              value={minScore}
              onChange={setMinScore}
              min={0}
              max={14}
              step={0.5}
              size="small"
              fullWidth
            />
          </Stack>
        </Paper>

        {/* 3. Analyze Button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={handleAnalyze}
          disabled={!canAnalyze || isLoading}
          fullWidth
        >
          {isLoading ? t('common.loading') : t('wordsketch.analyze')}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>

      {/* Right panel - Results */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {isLoading && <LinearProgress />}

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)}>
            <Tab label={t('wordsketch.analysisResults')} />
            <Tab label={t('wordsketch.visualization')} />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          {rightTab === 0 ? (
            result && result.relations && Object.keys(result.relations).length > 0 ? (
              <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
                {/* Summary */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                    <Typography variant="h6">
                      {t('wordsketch.sketchFor')}: <strong>{result.word}</strong>
                    </Typography>
                    <Chip 
                      label={`${result.total_instances} ${t('wordsketch.instances')}`} 
                      color="primary" 
                      size="small" 
                    />
                    <Chip 
                      label={`${result.relation_count} ${t('wordsketch.relations')}`} 
                      color="secondary" 
                      size="small" 
                    />
                    <Box sx={{ flex: 1 }} />
                    <Button size="small" onClick={expandAllRelations}>
                      {t('wordsketch.expandAll')}
                    </Button>
                    <Button size="small" onClick={collapseAllRelations}>
                      {t('wordsketch.collapseAll')}
                    </Button>
                  </Stack>
                </Paper>

                {/* Relations Grid */}
                <Grid container spacing={2}>
                  {Object.entries(result.relations).map(([relName, relData]) => {
                    // Safe access to collocations array
                    const collocations = relData?.collocations || []
                    const totalCount = relData?.total_count || collocations.length
                    const displayName = getRelationDisplay(relData) || relName
                    const isExpanded = expandedRelations.has(relName)
                    
                    return (
                      <Grid item xs={12} md={6} lg={4} key={relName}>
                        <Card 
                          sx={{ 
                            display: 'flex',
                            flexDirection: 'column',
                            height: isExpanded ? 400 : 'auto',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1.5,
                            overflow: 'hidden',
                            '&:hover': { boxShadow: 2 }
                          }}
                        >
                          <CardHeader
                            title={
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                {displayName.replace(result.word, `"${result.word}"`)}
                              </Typography>
                            }
                            subheader={
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                <Chip 
                                  label={`${Math.min(getDisplayedCount(relName), collocations.length)} / ${totalCount}`}
                                  size="small"
                                  sx={{ 
                                    bgcolor: 'rgba(255,255,255,0.2)',
                                    color: 'inherit',
                                    fontWeight: 500
                                  }}
                                />
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                                  {t('wordsketch.collocations')}
                                </Typography>
                              </Stack>
                            }
                            action={
                              <IconButton 
                                size="small"
                                onClick={() => toggleRelation(relName)}
                                sx={{ color: 'inherit' }}
                              >
                                {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                              </IconButton>
                            }
                            sx={{ 
                              bgcolor: 'primary.main',
                              color: 'primary.contrastText',
                              py: 1,
                              '& .MuiCardHeader-content': { overflow: 'hidden' }
                            }}
                          />
                          {isExpanded && (
                            <>
                              <Box sx={{ flex: 1, overflow: 'auto' }}>
                                <TableContainer>
                                  <Table size="small" stickyHeader>
                                    <TableHead>
                                      <TableRow>
                                        <TableCell sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100' }}>{t('wordsketch.collocate')}</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100' }}>{t('wordsketch.freq')}</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100' }}>{t('wordsketch.score')}</TableCell>
                                        {selectedCorpus && (
                                          <TableCell align="center" sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100', width: 40 }}></TableCell>
                                        )}
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {collocations.slice(0, getDisplayedCount(relName)).map((coll, idx) => (
                                        <TableRow 
                                          key={`${coll?.lemma || idx}-${idx}`}
                                          sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                                        >
                                          <TableCell>
                                            <Tooltip title={`${coll?.pos || ''} - ${coll?.lemma || ''}`}>
                                              <Typography variant="body2">
                                                {coll?.word || coll?.lemma || ''}
                                              </Typography>
                                            </Tooltip>
                                          </TableCell>
                                          <TableCell align="right">
                                            <Typography variant="body2">
                                              {coll?.frequency || 0}
                                            </Typography>
                                          </TableCell>
                                          <TableCell align="right">
                                            <Typography 
                                              variant="body2" 
                                              sx={{ 
                                                color: (coll?.score || 0) > 10 ? 'success.main' : 
                                                       (coll?.score || 0) > 5 ? 'primary.main' : 'text.secondary'
                                              }}
                                            >
                                              {(coll?.score || 0).toFixed(2)}
                                            </Typography>
                                          </TableCell>
                                          {selectedCorpus && (
                                            <TableCell align="center" sx={{ p: 0.5 }}>
                                              <WordActionMenu
                                                word={coll?.word || coll?.lemma || ''}
                                                corpusId={selectedCorpus.id}
                                                textIds={getSelectedTextIds()}
                                                selectionMode={selectionMode}
                                                selectedTags={selectedTags}
                                                showCollocation={true}
                                                showWordSketch={false}
                                                highlightWords={coll?.word || coll?.lemma ? [coll.word || coll.lemma || ''] : undefined}
                                                contextFilterWords={coll?.word || coll?.lemma ? [coll.word || coll.lemma || ''] : undefined}
                                                mainWord={result?.word || result?.lemma || ''}
                                                relationName={relName}
                                                matchMode="lemma"
                                              />
                                            </TableCell>
                                          )}
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Box>
                              {/* Show More / Show Less buttons - always at bottom */}
                              <Box sx={{ 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center',
                                gap: 1, 
                                py: 1,
                                height: 40,
                                flexShrink: 0,
                                borderTop: 1, 
                                borderColor: 'divider',
                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'
                              }}>
                                {collocations.length > getDisplayedCount(relName) ? (
                                  <Button 
                                    size="small" 
                                    onClick={() => handleShowMore(relName)}
                                    variant="text"
                                    endIcon={<ExpandMoreIcon />}
                                  >
                                    {t('wordsketch.showMore')} (+{Math.min(resultsPerRelation, collocations.length - getDisplayedCount(relName))})
                                  </Button>
                                ) : getDisplayedCount(relName) > resultsPerRelation ? (
                                  <Button 
                                    size="small" 
                                    onClick={() => handleShowLess(relName)}
                                    variant="text"
                                    endIcon={<ExpandLessIcon />}
                                  >
                                    {t('wordsketch.showLess')}
                                  </Button>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    {t('wordsketch.allShown') || `${collocations.length} ${t('wordsketch.collocations')}`}
                                  </Typography>
                                )}
                              </Box>
                            </>
                          )}
                        </Card>
                      </Grid>
                    )
                  })}
                </Grid>
              </Box>
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
                <BubbleChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('wordsketch.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('wordsketch.description')}
                </Typography>
              </Box>
            )
          ) : (
            // Visualization tab
            <SketchVisualization 
              result={result}
              selectedRelation={selectedVisualizationRelation}
              onRelationChange={setSelectedVisualizationRelation}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}


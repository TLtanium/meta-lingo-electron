/**
 * Word Sketch Tab
 * Main Word Sketch analysis component with three-column layout
 */

import { useState, useEffect, useRef, useMemo } from 'react'
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
  InputAdornment,
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
  useTheme
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { sketchApi } from '../../api'
import type { CrossLinkParams } from '../../types'
import type { 
  WordSketchResult, 
  RelationData, 
  Collocation,
  POSOption 
} from '../../api/sketch'
import NumberInput from '../../components/Common/NumberInput'
import { WordActionMenu } from '../../components/Common'
import SketchVisualization from './components/SketchVisualization'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../stores/settingsStore'

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
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

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
  const handleAnalyzeRef = useRef<() => void>(() => {})

  // Handle cross-link params - set up selection and search word
  useEffect(() => {
    if (crossLinkParams && !crossLinkProcessedRef.current) {
      crossLinkProcessedRef.current = true
      setCorpusSelection({
        corpusId: crossLinkParams.corpusId,
        textIds: Array.isArray(crossLinkParams.textIds) ? crossLinkParams.textIds : 'all',
        dataSource: crossLinkParams.libraryId ? 'library' : 'corpus',
        selectionMode: (crossLinkParams.selectionMode as 'all' | 'tags' | 'selected') ?? 'all',
        selectedTags: crossLinkParams.selectedTags ?? [],
        ...(crossLinkParams.libraryId && { libraryId: crossLinkParams.libraryId }),
        ...(crossLinkParams.selectedEntryIds?.length && { selectedEntryIds: crossLinkParams.selectedEntryIds }),
        language: 'english'
      })
      if (crossLinkParams.searchWord) setSearchWord(crossLinkParams.searchWord)
      if (crossLinkParams.autoSearch) pendingAutoSearchRef.current = true
    }
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

  // Auto-search when selection is ready and auto-search is pending
  useEffect(() => {
    if (pendingAutoSearchRef.current && corpusSelection && searchWord.trim()) {
      pendingAutoSearchRef.current = false
      setTimeout(() => handleAnalyzeRef.current(), 200)
    }
  }, [corpusSelection, searchWord])

  // Load POS options on mount
  useEffect(() => {
    loadPosOptions()
  }, [])

  const loadPosOptions = async () => {
    try {
      const response = await sketchApi.getPosOptions()
      if (response.success && response.data) {
        setPosOptions(response.data)
      }
    } catch (err) {
      console.error('Failed to load POS options:', err)
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
    if (!corpusSelection || !searchWord.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await sketchApi.generateWordSketch({
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
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

  // Keep ref always pointing to latest handleAnalyze to avoid stale closure in auto-search
  handleAnalyzeRef.current = handleAnalyze

  // Check if analysis can run
  const canAnalyze = !!corpusSelection && !!searchWord.trim()

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
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t('wordsketch.wordSketch')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('wordsketch.wordSketch')}
            getContext={() => {
              const hint = t('aiAssistant.wordSketchContextHint')
              const corpusInfo = corpusSelection ? `Corpus: ${corpusSelection.dataSource === 'corpus' ? 'corpus' : 'library'}, ${corpusSelection.textIds === 'all' ? 'all' : corpusSelection.textIds.length} texts` : 'Corpus: (none)'
              const params = `searchWord=${searchWord}, minFrequency=${minFrequency}, resultsPerRelation=${resultsPerRelation}`
              if (!result) return `${hint}\n\n${corpusInfo}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
              const relSummary = (result.relations || []).slice(0, 15).map((r: any) => `${r.relation_name}: ${(r.collocates || []).slice(0, 5).map((c: any) => c.word || c).join(', ')}`).join('\n')
              const view = rightTab === 0 ? `Word Sketch for "${result.word}":\n${relSummary}` : `Visualization for "${result.word}". Relations:\n${relSummary}`
              return `${hint}\n\n${corpusInfo}\n${params}\n${view}`
            }}
          />
        </Stack>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          <Chip label="logDice" size="small" color="secondary" variant="outlined" />
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
          sectionTitle={t('wordsketch.corpus')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

        {/* 2. Search Configuration */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
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
                                {displayName}
                              </Typography>
                            }
                            subheader={
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                <Chip 
                                  label={`${Math.min(getDisplayedCount(relName), collocations.length)} / ${totalCount}`}
                                  size="small"
                                  sx={{ 
                                    bgcolor: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
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
                                        {corpusSelection && (
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
                                          {corpusSelection && (
                                            <TableCell align="center" sx={{ p: 0.5 }}>
                                              <WordActionMenu
                                                word={coll?.word || coll?.lemma || ''}
                                                corpusId={corpusSelection.corpusId}
                                                textIds={corpusSelection.textIds}
                                                selectionMode={corpusSelection.selectionMode === 'keywords' ? 'tags' : (corpusSelection.selectionMode ?? 'all')}
                                                selectedTags={corpusSelection.selectedKeywords ?? corpusSelection.selectedTags ?? []}
                                                libraryId={corpusSelection?.dataSource === 'library' ? corpusSelection.libraryId : undefined}
                                                selectedEntryIds={corpusSelection?.dataSource === 'library' && corpusSelection?.selectionMode === 'selected' ? corpusSelection?.selectedEntryIds : undefined}
                                                showCollocation={true}
                                                showCollocationAnalysis={false}
                                                showWordSketch={false}
                                                highlightWords={coll?.word || coll?.lemma ? [coll.word || coll.lemma || ''] : undefined}
                                                contextFilterWords={coll?.word || coll?.lemma ? [coll.word || coll.lemma || ''] : undefined}
                                                mainWord={result?.word || result?.lemma || ''}
                                                mainWordLemma={result?.lemma || result?.word || ''}
                                                collocateLemma={coll?.lemma || coll?.word || ''}
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


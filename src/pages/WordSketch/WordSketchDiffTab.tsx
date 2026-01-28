/**
 * Word Sketch Difference Tab
 * Compare two words' collocations and grammatical patterns
 */

import React, { useState, useEffect, useMemo } from 'react'
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
  SelectChangeEvent,
  Tabs,
  Tab
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { corpusApi, sketchApi } from '../../api'
import type { Corpus, CorpusText } from '../../types'
import type { 
  SketchDifferenceResult, 
  RelationData, 
  Collocation,
  POSOption 
} from '../../api/sketch'
import NumberInput from '../../components/Common/NumberInput'
import { WordActionMenu } from '../../components/Common'
import DiffVisualization from './components/DiffVisualization'

type SelectionMode = 'all' | 'selected' | 'tags'

// Interface for merged collocations (must be outside component)
interface MergedCollocation {
  word: string
  lemma: string
  pos: string
  freq1: number
  freq2: number
  score1: number
  score2: number
  scoreDiff: number
}

export default function WordSketchDiffTab() {
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
  const [word1, setWord1] = useState('')
  const [word2, setWord2] = useState('')
  const [posFilter, setPosFilter] = useState('auto')
  const [posOptions, setPosOptions] = useState<POSOption[]>([])
  const [minFrequency, setMinFrequency] = useState(2)
  const [compareMode, setCompareMode] = useState<'lemmas' | 'word_form'>('lemmas')

  // Results state
  const [result, setResult] = useState<SketchDifferenceResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Expanded relations
  const [expandedRelations, setExpandedRelations] = useState<Set<string>>(new Set())
  
  // Right panel tab (0 = results, 1 = visualization)
  const [rightTab, setRightTab] = useState(0)
  
  // Visualization state
  const [selectedVisualizationRelation, setSelectedVisualizationRelation] = useState('all')

  // Load corpora and POS options on mount
  useEffect(() => {
    loadCorpora()
    loadPosOptions()
  }, [])

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

  // Run analysis
  const handleAnalyze = async () => {
    if (!selectedCorpus || !word1.trim() || !word2.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await sketchApi.generateDifference({
        corpus_id: selectedCorpus.id,
        text_ids: getSelectedTextIds(),
        word1: word1.trim(),
        word2: word2.trim(),
        pos: posFilter,
        min_frequency: minFrequency,
        compare_mode: compareMode
      })

      console.log('Sketch Difference Response:', response)

      if (response.success && response.data) {
        // Validate the response data structure
        const data = response.data
        if (!data.relations) {
          data.relations = {}
        }
        if (!data.summary) {
          data.summary = { word1_total_relations: 0, word2_total_relations: 0, common_relations: 0 }
        }
        
        setResult(data)
        // Auto-expand all relations
        if (data.relations && Object.keys(data.relations).length > 0) {
          setExpandedRelations(new Set(Object.keys(data.relations)))
        }
      } else {
        setError(response.error || 'Analysis failed')
      }
    } catch (err: any) {
      console.error('Sketch Difference Error:', err)
      setError(err.message || 'Analysis failed')
    } finally {
      setIsLoading(false)
    }
  }

  // Check if analysis can run
  const canAnalyze = selectedCorpus && word1.trim() && word2.trim() && (
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

  // Merge and prepare collocations for a relation
  const getMergedCollocations = React.useCallback((relData: RelationData): MergedCollocation[] => {
    if (!relData) return []
    
    const merged: MergedCollocation[] = []
    const seen = new Set<string>()

    // Add shared collocations
    const shared = relData.shared || []
    for (let i = 0; i < shared.length; i++) {
      const coll = shared[i]
      if (!coll) continue
      const key = (coll.lemma || coll.word || '').trim()
      if (!key || seen.has(key)) continue
      
      seen.add(key)
      merged.push({
        word: coll.word || coll.lemma || '',
        lemma: coll.lemma || '',
        pos: coll.pos || '',
        freq1: coll.freq1 || coll.frequency || 0,
        freq2: coll.freq2 || 0,
        score1: coll.score1 || coll.score || 0,
        score2: coll.score2 || 0,
        scoreDiff: (coll.score1 || coll.score || 0) - (coll.score2 || 0)
      })
    }

    // Add word1 only collocations
    const word1Only = relData.word1_only || []
    for (let i = 0; i < word1Only.length; i++) {
      const coll = word1Only[i]
      if (!coll) continue
      const key = (coll.lemma || coll.word || '').trim()
      if (!key || seen.has(key)) continue
      
      seen.add(key)
      merged.push({
        word: coll.word || coll.lemma || '',
        lemma: coll.lemma || '',
        pos: coll.pos || '',
        freq1: coll.frequency || 0,
        freq2: 0,
        score1: coll.score || 0,
        score2: 0,
        scoreDiff: coll.score || 0
      })
    }

    // Add word2 only collocations
    const word2Only = relData.word2_only || []
    for (let i = 0; i < word2Only.length; i++) {
      const coll = word2Only[i]
      if (!coll) continue
      const key = (coll.lemma || coll.word || '').trim()
      if (!key || seen.has(key)) continue
      
      seen.add(key)
      merged.push({
        word: coll.word || coll.lemma || '',
        lemma: coll.lemma || '',
        pos: coll.pos || '',
        freq1: 0,
        freq2: coll.frequency || 0,
        score1: 0,
        score2: coll.score || 0,
        scoreDiff: -(coll.score || 0)
      })
    }

    // Sort by score difference from high to low (blue to red: word1 favored -> word2 favored)
    merged.sort((a, b) => b.scoreDiff - a.scoreDiff)
    return merged
  }, [])

  // Get light background color for row (subtle tint)
  const getRowBgColor = (scoreDiff: number): string => {
    if (scoreDiff >= 6) {
      return 'rgba(21, 101, 192, 0.08)'
    } else if (scoreDiff >= 4) {
      return 'rgba(66, 165, 245, 0.06)'
    } else if (scoreDiff >= 2) {
      return 'rgba(66, 165, 245, 0.04)'
    } else if (scoreDiff > -2) {
      return 'transparent'
    } else if (scoreDiff > -4) {
      return 'rgba(239, 83, 80, 0.04)'
    } else if (scoreDiff > -6) {
      return 'rgba(239, 83, 80, 0.06)'
    } else {
      return 'rgba(211, 47, 47, 0.08)'
    }
  }

  // Get left bar color (deep color for indicator)
  const getBarColor = (scoreDiff: number): string => {
    if (scoreDiff >= 6) {
      return '#0d47a1' // deep blue
    } else if (scoreDiff >= 4) {
      return '#1565c0' // blue
    } else if (scoreDiff >= 2) {
      return '#42a5f5' // light blue
    } else if (scoreDiff > -2) {
      return '#bdbdbd' // gray
    } else if (scoreDiff > -4) {
      return '#ef9a9a' // light red
    } else if (scoreDiff > -6) {
      return '#e53935' // red
    } else {
      return '#b71c1c' // deep red
    }
  }

  // Get text color based on score difference
  const getTextColor = (scoreDiff: number): string => {
    if (scoreDiff >= 2) return '#1565c0' // blue for word1
    if (scoreDiff <= -2) return '#c62828' // red for word2
    return 'inherit'
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
          {t('wordsketch.sketchDifference')}
        </Typography>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          <Chip label="logDice" size="small" color="secondary" variant="outlined" />
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

                {/* Tag selection */}
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

        {/* 2. Compare Configuration */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('wordsketch.compareConfig')}
          </Typography>

          <Stack spacing={2}>
            {/* Word 1 input */}
            <TextField
              label={t('wordsketch.word1')}
              value={word1}
              onChange={(e) => setWord1(e.target.value)}
              fullWidth
              size="small"
              placeholder={t('wordsketch.word1Placeholder')}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box sx={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main' 
                    }} />
                  </InputAdornment>
                )
              }}
            />

            {/* Word 2 input */}
            <TextField
              label={t('wordsketch.word2')}
              value={word2}
              onChange={(e) => setWord2(e.target.value)}
              fullWidth
              size="small"
              placeholder={t('wordsketch.word2Placeholder')}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box sx={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      bgcolor: 'error.main' 
                    }} />
                  </InputAdornment>
                )
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

            {/* Compare mode */}
            <FormControl fullWidth size="small">
              <InputLabel>{t('wordsketch.compareMode')}</InputLabel>
              <Select
                value={compareMode}
                onChange={(e) => setCompareMode(e.target.value as 'lemmas' | 'word_form')}
                label={t('wordsketch.compareMode')}
              >
                <MenuItem value="lemmas">{t('wordsketch.lemmas')}</MenuItem>
                <MenuItem value="word_form">{t('wordsketch.wordForm')}</MenuItem>
              </Select>
            </FormControl>
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
          {isLoading ? t('common.loading') : t('wordsketch.compare')}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>

      {/* Right panel - Results & Visualization */}
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
                {/* Summary header */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" mb={2}>
                    <Typography variant="h6">
                      {t('wordsketch.comparing')}: 
                      <Box component="span" sx={{ color: '#1565c0', mx: 1, fontWeight: 600 }}>
                        {result.word1}
                      </Box>
                      vs
                      <Box component="span" sx={{ color: '#c62828', mx: 1, fontWeight: 600 }}>
                        {result.word2}
                      </Box>
                    </Typography>
                    <Chip 
                      label={`${result.summary?.common_relations || 0} ${t('wordsketch.commonRelations')}`} 
                      color="primary" 
                      size="small" 
                    />
                  </Stack>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1.5,
                    p: 1.5,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                    borderRadius: 1.5,
                    border: 1,
                    borderColor: 'divider'
                  }}>
                    <Typography variant="caption" sx={{ color: (theme) => theme.palette.mode === 'dark' ? '#64b5f6' : '#0d47a1', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {t('wordsketch.favorsWord1')}
                    </Typography>
                    <Box sx={{ 
                      flex: 1, 
                      height: 12, 
                      borderRadius: 1,
                      background: 'linear-gradient(to right, rgba(13, 71, 161, 0.7), rgba(21, 101, 192, 0.5), rgba(66, 165, 245, 0.3), rgba(158, 158, 158, 0.1), rgba(239, 83, 80, 0.3), rgba(211, 47, 47, 0.5), rgba(183, 28, 28, 0.7))',
                      border: (theme) => theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)'
                    }} />
                    <Typography variant="caption" sx={{ color: (theme) => theme.palette.mode === 'dark' ? '#ef9a9a' : '#b71c1c', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {t('wordsketch.favorsWord2')}
                    </Typography>
                  </Box>
                </Paper>

                {/* Relations Grid */}
                <Grid container spacing={2}>
                  {Object.entries(result.relations).map(([relName, relData]) => {
                    // Skip if relData is invalid
                    if (!relData) return null
                    
                    const hasContent = (relData.shared && relData.shared.length > 0) ||
                                      (relData.word1_only && relData.word1_only.length > 0) ||
                                      (relData.word2_only && relData.word2_only.length > 0)
                    
                    if (!hasContent) return null

                    const mergedCollocations = getMergedCollocations(relData)
                    const displayName = getRelationDisplay(relData) || relName

                    const isExpanded = expandedRelations.has(relName)
                    
                    return (
                      <Grid item xs={12} md={6} lg={4} key={relName}>
                        <Card sx={{ 
                          display: 'flex', 
                          flexDirection: 'column',
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1.5,
                          overflow: 'hidden',
                          '&:hover': { 
                            boxShadow: 2
                          }
                        }}>
                          <CardHeader
                            title={
                              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                                {displayName}
                              </Typography>
                            }
                            subheader={
                              <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                                <Chip 
                                  label={`${relData.word1_only_count || 0}`} 
                                  size="small" 
                                  sx={{ 
                                    bgcolor: 'rgba(255,255,255,0.25)', 
                                    color: '#fff',
                                    fontWeight: 600,
                                    height: 20,
                                    fontSize: '0.7rem'
                                  }}
                                />
                                <Chip 
                                  label={`${relData.shared_count || 0}`} 
                                  size="small" 
                                  sx={{ 
                                    bgcolor: 'rgba(255,255,255,0.18)',
                                    color: '#fff',
                                    fontWeight: 600,
                                    height: 20, 
                                    fontSize: '0.7rem'
                                  }}
                                />
                                <Chip 
                                  label={`${relData.word2_only_count || 0}`} 
                                  size="small" 
                                  sx={{ 
                                    bgcolor: 'rgba(255,255,255,0.25)', 
                                    color: '#fff',
                                    fontWeight: 600,
                                    height: 20,
                                    fontSize: '0.7rem'
                                  }}
                                />
                              </Stack>
                            }
                            action={
                              <IconButton 
                                size="small" 
                                onClick={() => toggleRelation(relName)}
                                sx={{ color: '#fff' }}
                              >
                                {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                              </IconButton>
                            }
                            sx={{ 
                              bgcolor: '#5c6bc0',
                              py: 1,
                              '& .MuiCardHeader-content': { overflow: 'hidden' }
                            }}
                          />
                          {isExpanded && (
                            <CardContent sx={{ p: 0, height: 320, overflow: 'hidden' }}>
                              <TableContainer sx={{ height: '100%', overflow: 'auto' }}>
                                <Table size="small" stickyHeader>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell sx={{ fontWeight: 600, py: 0.5 }}>
                                        {t('wordsketch.collocate')}
                                      </TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, color: '#1565c0' }}>
                                        {t('wordsketch.freq1')}
                                      </TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, color: '#c62828' }}>
                                        {t('wordsketch.freq2')}
                                      </TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, color: '#1565c0' }}>
                                        {t('wordsketch.score1')}
                                      </TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, color: '#c62828' }}>
                                        {t('wordsketch.score2')}
                                      </TableCell>
                                      {selectedCorpus && (
                                        <TableCell align="center" sx={{ fontWeight: 600, py: 0.5, width: 40 }}></TableCell>
                                      )}
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {mergedCollocations.map((coll, idx) => (
                                      <TableRow 
                                        key={`${coll.lemma}-${idx}`}
                                        sx={{ 
                                          bgcolor: getRowBgColor(coll.scoreDiff),
                                          '&:hover': { bgcolor: 'action.hover' }
                                        }}
                                      >
                                        <TableCell sx={{ py: 0.5, pl: 0 }}>
                                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            {/* Left color bar indicator */}
                                            <Box sx={{ 
                                              width: 4, 
                                              height: 24, 
                                              bgcolor: getBarColor(coll.scoreDiff),
                                              borderRadius: '0 2px 2px 0',
                                              mr: 1,
                                              flexShrink: 0
                                            }} />
                                            <Tooltip title={`${coll.pos} - ${coll.lemma}`}>
                                              <Typography 
                                                variant="body2" 
                                                sx={{ fontWeight: 500, color: getTextColor(coll.scoreDiff) }}
                                              >
                                                {coll.word}
                                              </Typography>
                                            </Tooltip>
                                          </Box>
                                        </TableCell>
                                        <TableCell align="right" sx={{ py: 0.5 }}>
                                          <Typography variant="body2" sx={{ color: coll.freq1 > 0 ? '#1565c0' : 'text.disabled' }}>
                                            {coll.freq1 > 0 ? coll.freq1.toLocaleString() : '-'}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right" sx={{ py: 0.5 }}>
                                          <Typography variant="body2" sx={{ color: coll.freq2 > 0 ? '#c62828' : 'text.disabled' }}>
                                            {coll.freq2 > 0 ? coll.freq2.toLocaleString() : '-'}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right" sx={{ py: 0.5 }}>
                                          <Typography variant="body2" sx={{ color: coll.score1 > 0 ? '#1565c0' : 'text.disabled' }}>
                                            {coll.score1 > 0 ? coll.score1.toFixed(1) : '-'}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right" sx={{ py: 0.5 }}>
                                          <Typography variant="body2" sx={{ color: coll.score2 > 0 ? '#c62828' : 'text.disabled' }}>
                                            {coll.score2 > 0 ? coll.score2.toFixed(1) : '-'}
                                          </Typography>
                                        </TableCell>
                                        {selectedCorpus && (
                                          <TableCell align="center" sx={{ p: 0.5 }}>
                                            <WordActionMenu
                                              word={coll.word || coll.lemma}
                                              corpusId={selectedCorpus.id}
                                              textIds={getSelectedTextIds()}
                                              selectionMode={selectionMode}
                                              selectedTags={selectedTags}
                                              showCollocation={true}
                                              showWordSketch={false}
                                              highlightWords={[coll.word || coll.lemma]}
                                              contextFilterWords={[coll.word || coll.lemma]}
                                              mainWord={coll.freq1 > 0 ? result.word1 : result.word2}
                                              relationName={relName}
                                              matchMode="lemma"
                                            />
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                    {mergedCollocations.length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={selectedCorpus ? 6 : 5} align="center">
                                          <Typography variant="body2" color="text.secondary">
                                            {t('common.noData')}
                                          </Typography>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </TableContainer>
                            </CardContent>
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
                <CompareArrowsIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('wordsketch.sketchDifference')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('wordsketch.diffDescription')}
                </Typography>
              </Box>
            )
          ) : (
            // Visualization tab
            result ? (
              <DiffVisualization
                result={result}
                selectedRelation={selectedVisualizationRelation}
                onRelationChange={setSelectedVisualizationRelation}
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
                <CompareArrowsIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('wordsketch.visualization')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('wordsketch.viz.runDiffFirst')}
                </Typography>
              </Box>
            )
          )}
        </Box>
      </Box>
    </Box>
  )
}


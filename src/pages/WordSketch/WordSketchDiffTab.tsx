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
  InputAdornment,
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
  Tabs,
  Tab
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { sketchApi } from '../../api'
import type { 
  SketchDifferenceResult, 
  RelationData, 
  Collocation,
  POSOption 
} from '../../api/sketch'
import NumberInput from '../../components/Common/NumberInput'
import { WordActionMenu } from '../../components/Common'
import DiffVisualization from './components/DiffVisualization'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import { useSettingsStore } from '../../stores/settingsStore'
import type { CrossLinkParams } from '../../types/crossLink'

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

interface WordSketchDiffTabProps {
  crossLinkParams?: CrossLinkParams
}

export default function WordSketchDiffTab({ crossLinkParams }: WordSketchDiffTabProps = {}) {
  const { t } = useTranslation()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Data source: corpus or library (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

  // Search state
  const [diffInputMode, setDiffInputMode] = useState<'word_form' | 'lemma'>('word_form')
  const [lemmaInput, setLemmaInput] = useState('')
  const [lemmaForms, setLemmaForms] = useState<string[]>([])
  const [loadingLemmaForms, setLoadingLemmaForms] = useState(false)
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

  // Fetch lemma forms when in lemma mode and corpus + lemma input are set
  useEffect(() => {
    if (diffInputMode !== 'lemma' || !corpusSelection || !lemmaInput.trim()) {
      setLemmaForms([])
      if (diffInputMode === 'lemma') {
        setWord1('')
        setWord2('')
      }
      return
    }
    const textIds = corpusSelection.textIds
    if (textIds !== 'all' && (!Array.isArray(textIds) || textIds.length === 0)) {
      setLemmaForms([])
      return
    }
    let cancelled = false
    setLoadingLemmaForms(true)
    sketchApi.getLemmaForms(corpusSelection.corpusId, textIds, lemmaInput.trim())
      .then((forms) => {
        if (!cancelled) {
          const list = forms ?? []
          setLemmaForms(list)
          setWord1(prev => (list.length && list.includes(prev)) ? prev : '')
          setWord2(prev => (list.length && list.includes(prev)) ? prev : '')
        }
      })
      .catch(() => { if (!cancelled) setLemmaForms([]) })
      .finally(() => { if (!cancelled) setLoadingLemmaForms(false) })
    return () => { cancelled = true }
  }, [diffInputMode, corpusSelection, lemmaInput])

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
    if (!corpusSelection || !word1.trim() || !word2.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await sketchApi.generateDifference({
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
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
  const canAnalyze = !!corpusSelection && (
    diffInputMode === 'word_form'
      ? (word1.trim() && word2.trim())
      : (lemmaInput.trim() && lemmaForms.length > 0 && word1 && word2 && word1 !== word2)
  )

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
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t('wordsketch.sketchDifference')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('wordsketch.sketchDifference')}
            getContext={() => {
              const hint = t('aiAssistant.wordSketchDiffContextHint')
              const corpusInfo = corpusSelection ? `Corpus: ${corpusSelection.dataSource === 'corpus' ? 'corpus' : 'library'}, ${corpusSelection.textIds === 'all' ? 'all' : corpusSelection.textIds.length} texts` : 'Corpus: (none)'
              const params = `word1=${word1}, word2=${word2}, minFrequency=${minFrequency}`
              if (!result) return `${hint}\n\n${corpusInfo}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
              const common = result.summary?.common_relations ?? 0
              const relLines = (result.relations || []).slice(0, 12).map((r: any) => `- ${r.relation_name}: ${(r.word1_collocates || []).slice(0, 3).map((c: any) => c.word || c).join(', ')} | ${(r.word2_collocates || []).slice(0, 3).map((c: any) => c.word || c).join(', ')}`).join('\n')
              const view = `Sketch diff: "${result.word1}" vs "${result.word2}", ${common} common relations\n${relLines}`
              return `${hint}\n\n${corpusInfo}\n${params}\n${view}`
            }}
          />
        </Stack>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          <Chip label="logDice" size="small" color="secondary" variant="outlined" />
        </Stack>

        {/* 1. Corpus / Library Selection */}
        <CorpusOrLibrarySelector
          sectionTitle={t('wordsketch.corpus')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

        {/* 2. Compare Configuration */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            {t('wordsketch.compareConfig')}
          </Typography>

          <Stack spacing={2}>
            {/* Input mode: 词形 vs 词元 */}
            <FormControl fullWidth size="small" variant="outlined">
              <InputLabel>{t('wordsketch.diffInputMode')}</InputLabel>
              <Select
                value={diffInputMode}
                onChange={(e) => {
                  const mode = e.target.value as 'word_form' | 'lemma'
                  setDiffInputMode(mode)
                  if (mode === 'lemma') {
                    setWord1('')
                    setWord2('')
                    setLemmaForms([])
                  }
                }}
                label={t('wordsketch.diffInputMode')}
                MenuProps={{ disableScrollLock: true, PaperProps: { sx: { zIndex: 9999 } } }}
              >
                <MenuItem value="word_form">{t('wordsketch.diffInputModeWordForm')}</MenuItem>
                <MenuItem value="lemma">{t('wordsketch.diffInputModeLemma')}</MenuItem>
              </Select>
            </FormControl>

            {diffInputMode === 'word_form' ? (
              <>
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
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
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
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main' }} />
                      </InputAdornment>
                    )
                  }}
                />
              </>
            ) : (
              <Stack spacing={2} sx={{ position: 'relative', zIndex: 0 }}>
                {/* Lemma mode: one lemma input, two dropdowns; isolate so focus/overlap work */}
                <TextField
                  label={t('wordsketch.lemmaInputLabel')}
                  value={lemmaInput}
                  onChange={(e) => setLemmaInput(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder={t('wordsketch.lemmaPlaceholder')}
                  disabled={!corpusSelection}
                  helperText={lemmaInput.trim() && !loadingLemmaForms && lemmaForms.length === 0 ? t('wordsketch.noFormsForLemma') : undefined}
                  inputProps={{ 'aria-label': t('wordsketch.lemmaInputLabel') }}
                />
                <FormControl fullWidth size="small" disabled={lemmaForms.length === 0} variant="outlined">
                  <InputLabel id="wordsketch-diff-word1-label" shrink>{t('wordsketch.word1')}</InputLabel>
                  <Select
                    labelId="wordsketch-diff-word1-label"
                    value={word1}
                    onChange={(e) => setWord1(e.target.value)}
                    label={t('wordsketch.word1')}
                    displayEmpty
                    renderValue={(v) => v || t('wordsketch.selectWord1')}
                    MenuProps={{ disableScrollLock: true, PaperProps: { sx: { zIndex: 9999 } } }}
                  >
                    {lemmaForms.filter(f => f !== word2).map((form) => (
                      <MenuItem key={form} value={form}>{form}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small" disabled={lemmaForms.length === 0} variant="outlined">
                  <InputLabel id="wordsketch-diff-word2-label" shrink>{t('wordsketch.word2')}</InputLabel>
                  <Select
                    labelId="wordsketch-diff-word2-label"
                    value={word2}
                    onChange={(e) => setWord2(e.target.value)}
                    label={t('wordsketch.word2')}
                    displayEmpty
                    renderValue={(v) => v || t('wordsketch.selectWord2')}
                    MenuProps={{ disableScrollLock: true, PaperProps: { sx: { zIndex: 9999 } } }}
                  >
                    {lemmaForms.filter(f => f !== word1).map((form) => (
                      <MenuItem key={form} value={form}>{form}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            )}

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

            {/* Compare mode: how collocates are matched when comparing (not how the two target words are chosen) */}
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
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {t('wordsketch.compareModeHelp')}
              </Typography>
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
                                      {corpusSelection && (
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
                                        {corpusSelection && (
                                          <TableCell align="center" sx={{ p: 0.5 }}>
                                            <WordActionMenu
                                              word={coll.word || coll.lemma}
                                              corpusId={corpusSelection.corpusId}
                                              textIds={corpusSelection.textIds}
                                              selectionMode={corpusSelection.selectionMode === 'keywords' ? 'tags' : (corpusSelection.selectionMode ?? 'all')}
                                              selectedTags={corpusSelection.selectedKeywords ?? corpusSelection.selectedTags ?? []}
                                              libraryId={corpusSelection?.dataSource === 'library' ? corpusSelection.libraryId : undefined}
                                              selectedEntryIds={corpusSelection?.dataSource === 'library' && corpusSelection?.selectionMode === 'selected' ? corpusSelection?.selectedEntryIds : undefined}
                                              showCollocation={true}
                                              showCollocationAnalysis={false}
                                              showWordSketch={false}
                                              highlightWords={[coll.word || coll.lemma]}
                                              contextFilterWords={[coll.word || coll.lemma]}
                                              mainWord={coll.freq1 > 0 ? result.word1 : result.word2}
                                              mainWordLemma={coll.freq1 > 0 ? result.word1 : result.word2}
                                              collocateLemma={coll.lemma || coll.word}
                                              relationName={relName}
                                              matchMode="lemma"
                                            />
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                    {mergedCollocations.length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={corpusSelection ? 6 : 5} align="center">
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


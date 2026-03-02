/**
 * Keyness Comparison Tab
 * Compare study corpus against reference corpus using various statistical methods
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box,
  Typography,
  LinearProgress,
  Tabs,
  Tab,
  Stack,
  Chip,
  Button,
  Paper,
  Alert,
  FormControlLabel,
  TextField,
  Switch,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TableChartIcon from '@mui/icons-material/TableChart'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import StorageIcon from '@mui/icons-material/Storage'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../../stores/tabStore'
import { keywordApi, corpusResourceApi } from '../../../api/analysis'
import type { 
  POSFilterConfig,
  POSTagInfo,
  KeynessStatistic,
  KeynessKeyword,
  KeynessConfig,
  StopwordsConfig,
  ThresholdConfig,
  CorpusResource,
  ComparisonMode
} from '../../../types/keyword'
import {
  DEFAULT_KEYNESS_CONFIG,
  DEFAULT_POS_FILTER,
  DEFAULT_STOPWORDS_CONFIG,
  DEFAULT_STATISTIC_THRESHOLDS
} from '../../../types/keyword'
import { CorpusResourceCard, CorpusResourceDialog } from '../../../components/CorpusResource'
import { NumberInput } from '../../../components/common'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'

import POSFilterPanel from '../POSFilterPanel'
import StatisticsConfigPanel from './StatisticsConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'
import AnalysisAIAssistant from '../../../components/AnalysisAIAssistant'
import { useSettingsStore } from '../../../stores/settingsStore'
import type { CrossLinkParams } from '../../../types/crossLink'

interface KeynessTabProps {
  crossLinkParams?: CrossLinkParams
}

export default function KeynessTab({ crossLinkParams }: KeynessTabProps = {}) {
  const { t, i18n } = useTranslation()
  const { openTab } = useTabStore()
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  // Study corpus/library (unified selector)
  const [studySelection, setStudySelection] = useState<CorpusOrLibrarySelection | null>(null)
  // Reference corpus/library (unified selector; only when not using corpus resource)
  const [refSelection, setRefSelection] = useState<CorpusOrLibrarySelection | null>(null)

  // POS tags
  const [posTags, setPosTags] = useState<POSTagInfo[]>([])

  // Filter state
  const [posFilter, setPosFilter] = useState<POSFilterConfig>(DEFAULT_POS_FILTER)
  const [lowercase, setLowercase] = useState(true)

  // Statistics config
  const [statistic, setStatistic] = useState<KeynessStatistic>('log_likelihood')
  const [keynessConfig, setKeynessConfig] = useState<KeynessConfig>(DEFAULT_KEYNESS_CONFIG)
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('word')
  
  // Stopwords config
  const [stopwordsConfig, setStopwordsConfig] = useState<StopwordsConfig>(DEFAULT_STOPWORDS_CONFIG)
  const [excludeWordsText, setExcludeWordsText] = useState('')
  
  // Threshold config
  const [thresholdConfig, setThresholdConfig] = useState<ThresholdConfig>({})
  const [useThreshold, setUseThreshold] = useState(false)
  
  // Corpus resource (alternative reference corpus)
  const [useCorpusResource, setUseCorpusResource] = useState(false)
  const [selectedResource, setSelectedResource] = useState<CorpusResource | null>(null)
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false)

  // Results state
  const [results, setResults] = useState<KeynessKeyword[]>([])
  const [totalKeywords, setTotalKeywords] = useState(0)
  const [studySize, setStudySize] = useState(0)
  const [refSize, setRefSize] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

  // Sync study corpus/library selection from cross-link so selector shows same source
  useEffect(() => {
    if (!crossLinkParams?.corpusId) return
    setStudySelection({
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

  // External selection for study selector when opened via cross-link (including library)
  const studyExternalSelection = useMemo((): CorpusOrLibrarySelection | null => {
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

  // Load POS tags and default resource on mount
  useEffect(() => {
    loadPosTags()
    loadDefaultResource()
  }, [])
  
  // Update threshold when statistic changes
  useEffect(() => {
    if (useThreshold) {
      const defaultThreshold = DEFAULT_STATISTIC_THRESHOLDS[statistic]
      if (defaultThreshold) {
        setThresholdConfig({
          minScore: defaultThreshold.min_score || undefined,
          maxPValue: defaultThreshold.p_value || undefined
        })
      }
    }
  }, [statistic, useThreshold])

  const loadPosTags = async () => {
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

  const loadDefaultResource = async () => {
    try {
      const lang = (i18n.language === 'zh' ? 'zh' : 'en') as 'en' | 'zh'

      // Try preferred default: OANC total, if available
      try {
        const response = await corpusResourceApi.get('oanc_total', lang)
        if (response.success && response.data && response.data.success && response.data.data) {
          setSelectedResource(response.data.data)
          return
        }
      } catch {
        // Ignore and fall back to list
      }

      // Fallback: pick the first available corpus resource from the list
      const listRes = await corpusResourceApi.list(lang)
      if (listRes.success && listRes.data && listRes.data.success && listRes.data.data?.length) {
        setSelectedResource(listRes.data.data[0])
      }
    } catch (err) {
      console.error('Failed to load default resource:', err)
    }
  }
  
  // Handle exclude words
  const handleExcludeWordsBlur = useCallback(() => {
    const words = excludeWordsText
      .split(/[\n,;]/)
      .map(w => w.trim())
      .filter(w => w.length > 0)
    setStopwordsConfig(prev => ({ ...prev, excludeWords: words }))
  }, [excludeWordsText])

  // Handle stopwords toggle
  const handleStopwordsToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setStopwordsConfig(prev => ({ ...prev, removeStopwords: event.target.checked }))
  }, [])
  
  // Handle threshold toggle
  const handleThresholdToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked
    setUseThreshold(enabled)
    if (enabled) {
      const defaultThreshold = DEFAULT_STATISTIC_THRESHOLDS[statistic]
      if (defaultThreshold) {
        setThresholdConfig({
          minScore: defaultThreshold.min_score || undefined,
          maxPValue: defaultThreshold.p_value || undefined
        })
      }
    } else {
      setThresholdConfig({})
    }
  }, [statistic])
  
  // Handle resource selection
  const handleResourceSelect = useCallback((resource: CorpusResource) => {
    setSelectedResource(resource)
    setResourceDialogOpen(false)
  }, [])

  // Run analysis
  const handleAnalyze = async () => {
    if (!studySelection) return
    if (!useCorpusResource && !refSelection) return
    if (useCorpusResource && !selectedResource) return

    setIsLoading(true)
    setError(null)

    try {
      const hasStopwordsConfig = stopwordsConfig.removeStopwords || (stopwordsConfig.excludeWords?.length ?? 0) > 0
      const hasThresholdConfig = useThreshold && (thresholdConfig.minScore !== undefined || thresholdConfig.maxPValue !== undefined)
      const language = studySelection.language || 'english'

      let response

      if (useCorpusResource && selectedResource) {
        response = await keywordApi.keynessWithResource({
          study_corpus_id: studySelection.corpusId,
          study_text_ids: studySelection.textIds,
          resource_id: selectedResource.id,
          statistic,
          config: keynessConfig,
          pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
          lowercase,
          stopwords_config: hasStopwordsConfig ? stopwordsConfig : undefined,
          language,
          threshold_config: hasThresholdConfig ? thresholdConfig : undefined,
          comparison_mode: comparisonMode
        })
      } else if (refSelection) {
        response = await keywordApi.keyness({
          study_corpus_id: studySelection.corpusId,
          study_text_ids: studySelection.textIds,
          reference_corpus_id: refSelection.corpusId,
          reference_text_ids: refSelection.textIds,
          statistic,
          config: keynessConfig,
          pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
          lowercase,
          stopwords_config: hasStopwordsConfig ? stopwordsConfig : undefined,
          language,
          threshold_config: hasThresholdConfig ? thresholdConfig : undefined,
          comparison_mode: comparisonMode
        })
      } else {
        setError('No reference corpus selected')
        setIsLoading(false)
        return
      }

      if (response.success && response.data) {
        if (response.data.success) {
          setResults(response.data.results)
          setTotalKeywords(response.data.total_keywords)
          setStudySize(response.data.study_corpus_size)
          setRefSize(response.data.ref_corpus_size)
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

  const canAnalyze = studySelection !== null && (
    useCorpusResource ? selectedResource !== null : refSelection !== null
  )

  return (
    <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
      {/* Left panel - Configuration */}
      <Box sx={{ 
        width: 420, 
        borderRight: 1, 
        borderColor: 'divider', 
        overflow: 'auto', 
        p: 2,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t('keyword.keyness.title', 'Keyness Comparison')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('keyword.keyness.title', 'Keyness Comparison')}
            getContext={() => {
              const hint = t('aiAssistant.keynessContextHint')
              const study = studySelection ? `${studySelection.dataSource === 'corpus' ? 'corpus' : 'library'}, ${studySelection.textIds === 'all' ? 'all' : studySelection.textIds.length} texts` : '(none)'
              const ref = useCorpusResource 
                ? (selectedResource ? `resource: ${selectedResource.name}` : '(none)')
                : (refSelection ? `${refSelection.dataSource === 'corpus' ? 'corpus' : 'library'}, ${refSelection.textIds === 'all' ? 'all' : refSelection.textIds.length} texts` : '(none)')
              const params = `statistic=${keynessConfig.statistic}, minThreshold=${keynessConfig.min_threshold}`
              if (results.length === 0) return `${hint}\n\nStudy: ${study}\nReference: ${ref}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
              const slice = results.slice(0, 25)
              const labelCol = comparisonMode === 'domain' ? t('keyword.results.semanticDomain', 'Semantic Domain') : t('keyword.keyword', 'Word')
              const header = `序号\t${labelCol}\t${t('keyword.results.score', 'Score')}`
              const label = (r: KeynessKeyword) => (comparisonMode === 'domain' && r.domain_name) ? r.domain_name : r.keyword
              const lines = slice.map((r, i) => `${i + 1}\t${label(r)}\t${r.score ?? ''}`).join('\n')
              const vizTop = results.slice(0, 25).map((r, i) => `${i + 1}\t${label(r)}\t${r.score ?? ''}`).join('\n')
              const view = rightTab === 0 ? `Results (rows 1-${slice.length}):\n${header}\n${lines}` : `Visualization. Top 25:\n${header}\n${vizTop}`
              return `${hint}\n\nStudy: ${study}\nReference: ${ref}\n${params}\n${view}`
            }}
          />
        </Stack>

        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="SpaCy" size="small" color="primary" variant="outlined" />
          <Chip 
            icon={<CompareArrowsIcon />}
            label={t('keyword.keyness.comparison', 'Corpus Comparison')}
            size="small" 
            variant="outlined"
          />
        </Stack>

        {/* 1. Study Corpus / Library Selection */}
        <CorpusOrLibrarySelector
          sectionTitle={t('keyword.keyness.studyCorpus', 'Study Corpus (Target)')}
          onSelectionChange={setStudySelection}
          externalSelection={studyExternalSelection}
        />

        {/* 2. Reference Corpus/Resource Selection */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="subtitle2">
              {t('keyword.keyness.refCorpus', 'Reference Corpus')}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={useCorpusResource}
                  onChange={(e) => setUseCorpusResource(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <StorageIcon fontSize="small" />
                  <Typography variant="body2">
                    {t('keyword.keyness.useResource', 'Corpus Resource')}
                  </Typography>
                </Stack>
              }
              labelPlacement="start"
              sx={{ m: 0 }}
            />
          </Stack>
          
          {useCorpusResource ? (
            // Corpus Resource Selection
            <Stack spacing={2}>
              {selectedResource && (
                <CorpusResourceCard
                  resource={selectedResource}
                  onClick={() => setResourceDialogOpen(true)}
                  compact
                />
              )}
              <Button
                variant="outlined"
                onClick={() => setResourceDialogOpen(true)}
                fullWidth
              >
                {selectedResource 
                  ? t('keyword.keyness.changeResource', 'Change Resource')
                  : t('keyword.keyness.selectResource', 'Select Corpus Resource')
                }
              </Button>
            </Stack>
          ) : (
            <CorpusOrLibrarySelector
              sectionTitle={t('keyword.keyness.refCorpus', 'Reference Corpus')}
              onSelectionChange={setRefSelection}
            />
          )}
        </Paper>

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
                  disabled={!studySelection}
                />
              }
              label={
                <Typography variant="body2">
                  {t('keyword.stopwords.removeStopwords')}
                </Typography>
              }
              sx={{ mr: 0 }}
            />
            {stopwordsConfig.removeStopwords && studySelection && (
              <Chip 
                label={studySelection.language || 'english'} 
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
            disabled={!studySelection}
          />
        </Paper>

        {/* 4. Comparison Mode (word / lemma / semantic domain) */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('keyword.keyness.comparisonMode', 'Comparison Mode')}
          </Typography>
          <FormControl fullWidth size="small" disabled={!studySelection}>
            <InputLabel>{t('keyword.keyness.comparisonMode', 'Comparison Mode')}</InputLabel>
            <Select
              value={comparisonMode}
              label={t('keyword.keyness.comparisonMode', 'Comparison Mode')}
              onChange={(e) => setComparisonMode(e.target.value as ComparisonMode)}
            >
              <MenuItem value="word">
                {t('keyword.keyness.mode.wordForm', 'Word Form')}
              </MenuItem>
              <MenuItem value="lemma">
                {t('keyword.keyness.mode.lemma', 'Lemma')}
              </MenuItem>
              <MenuItem value="domain">
                {t('keyword.keyness.mode.semanticDomain', 'Semantic Domain (USAS)')}
              </MenuItem>
            </Select>
          </FormControl>
        </Paper>

        {/* 5. POS Filter Panel */}
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            config={posFilter}
            onChange={setPosFilter}
            posTags={posTags}
            disabled={!studySelection}
          />
        </Box>

        {/* 6. Statistics Config Panel */}
        <Box sx={{ mb: 2 }}>
          <StatisticsConfigPanel
            statistic={statistic}
            config={keynessConfig}
            onStatisticChange={setStatistic}
            onConfigChange={setKeynessConfig}
            lowercase={lowercase}
            onLowercaseChange={setLowercase}
            disabled={!studySelection}
          />
        </Box>
        
        {/* 7. Statistical Threshold */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">
              {t('keyword.threshold.title', 'Statistical Threshold')}
            </Typography>
            <Tooltip title={t('keyword.threshold.tooltip', 'Filter results by academic statistical standards')}>
              <FormControlLabel
                control={
                  <Switch
                    checked={useThreshold}
                    onChange={handleThresholdToggle}
                    size="small"
                    disabled={!studySelection}
                  />
                }
                label={
                  <Typography variant="body2">
                    {t('keyword.threshold.enable', 'Enable')}
                  </Typography>
                }
                labelPlacement="start"
                sx={{ m: 0 }}
              />
            </Tooltip>
          </Stack>
          
          {useThreshold && (
            <Stack spacing={2}>
              <NumberInput
                size="small"
                fullWidth
                label={t('keyword.threshold.minScore', 'Minimum Score')}
                value={thresholdConfig.minScore ?? 0}
                onChange={(val) => setThresholdConfig(prev => ({
                  ...prev,
                  minScore: val === 0 ? undefined : val
                }))}
                min={0}
                max={1000}
                step={0.5}
                defaultValue={0}
                disabled={!studySelection}
                helperText={
                  statistic === 'log_likelihood' || statistic === 'chi_squared'
                    ? t('keyword.threshold.llHelp', 'LL/Chi2 > 6.63 (p < 0.01), > 3.84 (p < 0.05)')
                    : statistic === 'log_ratio'
                    ? t('keyword.threshold.lrHelp', '|Log Ratio| > 1 indicates meaningful difference')
                    : ''
                }
              />
              {(statistic === 'log_likelihood' || statistic === 'chi_squared' || statistic === 'fishers_exact') && (
                <NumberInput
                  size="small"
                  fullWidth
                  label={t('keyword.threshold.maxPValue', 'Maximum p-value')}
                  value={thresholdConfig.maxPValue ?? 0.05}
                  onChange={(val) => setThresholdConfig(prev => ({
                    ...prev,
                    maxPValue: val
                  }))}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={0.05}
                  disabled={!studySelection}
                  helperText={t('keyword.threshold.pValueHelp', 'Standard: 0.05, Strict: 0.01')}
                />
              )}
            </Stack>
          )}
        </Paper>

        {/* 8. Analyze Button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={handleAnalyze}
          disabled={!canAnalyze || isLoading}
          fullWidth
        >
          {isLoading ? t('common.loading') : t('keyword.analyze', 'Analyze Keyness')}
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
                studySize={studySize}
                refSize={refSize}
                statistic={statistic}
                comparisonMode={comparisonMode}
                isLoading={isLoading}
                corpusId={studySelection?.corpusId}
                textIds={studySelection?.textIds}
                selectionMode={studySelection?.selectionMode === 'keywords' ? 'tags' : (studySelection?.selectionMode ?? 'all')}
                selectedTags={studySelection?.selectedKeywords ?? studySelection?.selectedTags ?? []}
                libraryId={studySelection?.dataSource === 'library' ? studySelection.libraryId : undefined}
                selectedEntryIds={studySelection?.dataSource === 'library' && studySelection?.selectionMode === 'selected' ? studySelection?.selectedEntryIds : undefined}
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
                  {t('keyword.keyness.title', 'Keyness Comparison')}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t('keyword.keyness.description', 'Compare word frequencies between study and reference corpora')}
                </Typography>
              </Box>
            )
          ) : (
            <VisualizationPanel
              data={results}
              comparisonMode={comparisonMode}
              onKeywordClick={studySelection ? (keyword) => {
                openTab({
                  type: 'collocation',
                  title: `${t('collocation.title')} - ${keyword}`,
                  props: {
                    crossLinkParams: {
                      searchWord: keyword,
                      corpusId: studySelection.corpusId,
                      textIds: studySelection.textIds,
                      selectionMode: studySelection.selectionMode === 'keywords' ? 'tags' : studySelection.selectionMode,
                      selectedTags: studySelection.selectedKeywords ?? studySelection.selectedTags ?? [],
                      ...(studySelection.libraryId && { libraryId: studySelection.libraryId }),
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
      
      {/* Corpus Resource Selection Dialog */}
      <CorpusResourceDialog
        open={resourceDialogOpen}
        onClose={() => setResourceDialogOpen(false)}
        onSelect={handleResourceSelect}
        selectedResourceId={selectedResource?.id}
        title={t('keyword.keyness.selectResource', 'Select Reference Corpus Resource')}
      />
    </Box>
  )
}


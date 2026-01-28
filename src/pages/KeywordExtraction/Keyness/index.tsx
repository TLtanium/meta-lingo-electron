/**
 * Keyness Comparison Tab
 * Compare study corpus against reference corpus using various statistical methods
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
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
  Switch,
  Tooltip
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TableChartIcon from '@mui/icons-material/TableChart'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import StorageIcon from '@mui/icons-material/Storage'
import { useTranslation } from 'react-i18next'
import { corpusApi } from '../../../api'
import { keywordApi, corpusResourceApi } from '../../../api/analysis'
import type { Corpus, CorpusText } from '../../../types'
import type { 
  POSFilterConfig,
  POSTagInfo,
  KeynessStatistic,
  KeynessKeyword,
  KeynessConfig,
  StopwordsConfig,
  ThresholdConfig,
  CorpusResource
} from '../../../types/keyword'
import {
  DEFAULT_KEYNESS_CONFIG,
  DEFAULT_POS_FILTER,
  DEFAULT_STOPWORDS_CONFIG,
  DEFAULT_STATISTIC_THRESHOLDS
} from '../../../types/keyword'
import { CorpusResourceCard, CorpusResourceDialog } from '../../../components/CorpusResource'

import POSFilterPanel from '../POSFilterPanel'
import StatisticsConfigPanel from './StatisticsConfigPanel'
import ResultsTable from './ResultsTable'
import VisualizationPanel from './VisualizationPanel'

type SelectionMode = 'all' | 'selected' | 'tags'

interface CorpusSelection {
  corpus: Corpus | null
  mode: SelectionMode
  textIds: string[]
  tags: string[]
  texts: CorpusText[]
  allTags: string[]
}

export default function KeynessTab() {
  const { t } = useTranslation()

  // Corpora list
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [loading, setLoading] = useState(false)

  // Study corpus selection
  const [studySelection, setStudySelection] = useState<CorpusSelection>({
    corpus: null,
    mode: 'all',
    textIds: [],
    tags: [],
    texts: [],
    allTags: []
  })

  // Reference corpus selection
  const [refSelection, setRefSelection] = useState<CorpusSelection>({
    corpus: null,
    mode: 'all',
    textIds: [],
    tags: [],
    texts: [],
    allTags: []
  })

  // Text search states
  const [studyTextSearch, setStudyTextSearch] = useState('')
  const [refTextSearch, setRefTextSearch] = useState('')
  const [loadingStudyTexts, setLoadingStudyTexts] = useState(false)
  const [loadingRefTexts, setLoadingRefTexts] = useState(false)

  // POS tags
  const [posTags, setPosTags] = useState<POSTagInfo[]>([])

  // Filter state
  const [posFilter, setPosFilter] = useState<POSFilterConfig>(DEFAULT_POS_FILTER)
  const [lowercase, setLowercase] = useState(true)

  // Statistics config
  const [statistic, setStatistic] = useState<KeynessStatistic>('log_likelihood')
  const [keynessConfig, setKeynessConfig] = useState<KeynessConfig>(DEFAULT_KEYNESS_CONFIG)
  
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

  // Load corpora and POS tags on mount
  useEffect(() => {
    loadCorpora()
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

  const loadDefaultResource = async () => {
    try {
      const response = await corpusResourceApi.get('oanc_total')
      // response.data is CorpusResourceDetailResponse { success, data }
      if (response.success && response.data && response.data.success && response.data.data) {
        setSelectedResource(response.data.data)
      }
    } catch (err) {
      console.error('Failed to load default resource:', err)
    }
  }
  
  // Handle exclude words text change (parse on blur)
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

  // Load texts for a corpus
  const loadTexts = async (corpusId: string, isStudy: boolean) => {
    if (isStudy) setLoadingStudyTexts(true)
    else setLoadingRefTexts(true)
    
    try {
      const response = await corpusApi.getTexts(corpusId)
      if (response.success && response.data) {
        const texts = response.data
        const tagSet = new Set<string>()
        texts.forEach(text => text.tags.forEach(tag => tagSet.add(tag)))
        const allTags = Array.from(tagSet).sort()
        
        if (isStudy) {
          setStudySelection(prev => ({ ...prev, texts, allTags }))
        } else {
          setRefSelection(prev => ({ ...prev, texts, allTags }))
        }
      }
    } catch (err) {
      console.error('Failed to load texts:', err)
    } finally {
      if (isStudy) setLoadingStudyTexts(false)
      else setLoadingRefTexts(false)
    }
  }

  // Handle corpus change
  const handleCorpusChange = (event: SelectChangeEvent<string>, isStudy: boolean) => {
    const corpus = corpora.find(c => c.id === event.target.value) || null
    const selection = isStudy ? studySelection : refSelection
    const setSelection = isStudy ? setStudySelection : setRefSelection
    
    setSelection({
      corpus,
      mode: 'all',
      textIds: [],
      tags: [],
      texts: [],
      allTags: []
    })
    
    if (corpus) {
      loadTexts(corpus.id, isStudy)
    }
    
    setResults([])
    setError(null)
  }

  // Get selected text IDs based on mode
  const getSelectedTextIds = (selection: CorpusSelection, filteredTexts: CorpusText[]): string[] | 'all' => {
    switch (selection.mode) {
      case 'all':
        return 'all'
      case 'selected':
        return selection.textIds
      case 'tags':
        return filteredTexts.map(t => t.id)
      default:
        return []
    }
  }

  // Filter texts based on search and tags
  const getFilteredTexts = (selection: CorpusSelection, search: string) => {
    let result = selection.texts
    
    if (search) {
      const query = search.toLowerCase()
      result = result.filter(t => 
        t.filename.toLowerCase().includes(query) ||
        t.originalFilename?.toLowerCase().includes(query)
      )
    }
    
    if (selection.mode === 'tags' && selection.tags.length > 0) {
      result = result.filter(t => 
        selection.tags.some(tag => t.tags.includes(tag))
      )
    }
    
    return result
  }

  const filteredStudyTexts = useMemo(() => 
    getFilteredTexts(studySelection, studyTextSearch), 
    [studySelection, studyTextSearch]
  )
  
  const filteredRefTexts = useMemo(() => 
    getFilteredTexts(refSelection, refTextSearch), 
    [refSelection, refTextSearch]
  )

  // Run analysis
  const handleAnalyze = async () => {
    if (!studySelection.corpus) return
    
    // Require either reference corpus or corpus resource
    if (!useCorpusResource && !refSelection.corpus) return
    if (useCorpusResource && !selectedResource) return

    setIsLoading(true)
    setError(null)

    try {
      // Build stopwords config (only pass if enabled or has exclude words)
      const hasStopwordsConfig = stopwordsConfig.removeStopwords || stopwordsConfig.excludeWords.length > 0
      
      // Build threshold config (only pass if enabled)
      const hasThresholdConfig = useThreshold && (thresholdConfig.minScore !== undefined || thresholdConfig.maxPValue !== undefined)
      
      let response
      
      if (useCorpusResource && selectedResource) {
        // Use corpus resource as reference
        response = await keywordApi.keynessWithResource({
          study_corpus_id: studySelection.corpus.id,
          study_text_ids: getSelectedTextIds(studySelection, filteredStudyTexts),
          resource_id: selectedResource.id,
          statistic,
          config: keynessConfig,
          pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
          lowercase,
          stopwords_config: hasStopwordsConfig ? stopwordsConfig : undefined,
          language: studySelection.corpus.language || 'english',
          threshold_config: hasThresholdConfig ? thresholdConfig : undefined
        })
      } else if (refSelection.corpus) {
        // Use traditional corpus as reference
        response = await keywordApi.keyness({
          study_corpus_id: studySelection.corpus.id,
          study_text_ids: getSelectedTextIds(studySelection, filteredStudyTexts),
          reference_corpus_id: refSelection.corpus.id,
          reference_text_ids: getSelectedTextIds(refSelection, filteredRefTexts),
          statistic,
          config: keynessConfig,
          pos_filter: posFilter.selectedPOS.length > 0 ? posFilter : undefined,
          lowercase,
          stopwords_config: hasStopwordsConfig ? stopwordsConfig : undefined,
          language: studySelection.corpus.language || 'english',
          threshold_config: hasThresholdConfig ? thresholdConfig : undefined
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

  // Check if analysis can run
  const studyReady = studySelection.corpus && (
    studySelection.mode === 'all' || 
    (studySelection.mode === 'tags' && studySelection.tags.length > 0) ||
    (studySelection.mode === 'selected' && studySelection.textIds.length > 0)
  )
  
  const refReady = useCorpusResource 
    ? selectedResource !== null
    : refSelection.corpus && (
        refSelection.mode === 'all' || 
        (refSelection.mode === 'tags' && refSelection.tags.length > 0) ||
        (refSelection.mode === 'selected' && refSelection.textIds.length > 0)
      )
  
  const canAnalyze = studyReady && refReady

  // Render corpus selector
  const renderCorpusSelector = (
    selection: CorpusSelection,
    setSelection: React.Dispatch<React.SetStateAction<CorpusSelection>>,
    filteredTexts: CorpusText[],
    textSearch: string,
    setTextSearch: React.Dispatch<React.SetStateAction<string>>,
    loadingTexts: boolean,
    isStudy: boolean,
    title: string
  ) => {
    const selectedCount = (() => {
      const ids = getSelectedTextIds(selection, filteredTexts)
      return ids === 'all' ? selection.texts.length : ids.length
    })()

    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {title}
        </Typography>

        <Stack spacing={2}>
          <FormControl fullWidth size="small">
            <InputLabel>{t('corpus.selectCorpus')}</InputLabel>
            <Select
              value={selection.corpus?.id || ''}
              onChange={(e) => handleCorpusChange(e, isStudy)}
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

          {selection.corpus && (
            <>
              <Divider />

              <RadioGroup
                value={selection.mode}
                onChange={(e) => setSelection(prev => ({ 
                  ...prev, 
                  mode: e.target.value as SelectionMode,
                  textIds: [],
                  tags: []
                }))}
              >
                <FormControlLabel 
                  value="all" 
                  control={<Radio size="small" />} 
                  label={
                    <Typography variant="body2">
                      {t('keyword.corpus.selectAll', 'All texts')} ({selection.texts.length})
                    </Typography>
                  }
                />
                <FormControlLabel 
                  value="tags" 
                  control={<Radio size="small" />} 
                  label={
                    <Typography variant="body2">
                      {t('keyword.corpus.selectByTags', 'By tags')}
                    </Typography>
                  }
                />
                <FormControlLabel 
                  value="selected" 
                  control={<Radio size="small" />} 
                  label={
                    <Typography variant="body2">
                      {t('keyword.corpus.selectManually', 'Manual selection')}
                    </Typography>
                  }
                />
              </RadioGroup>

              {selection.mode === 'tags' && (
                <FormControl size="small" fullWidth>
                  <InputLabel>{t('corpus.filterByTags')}</InputLabel>
                  <Select
                    multiple
                    value={selection.tags}
                    onChange={(e) => setSelection(prev => ({ 
                      ...prev, 
                      tags: e.target.value as string[] 
                    }))}
                    input={<OutlinedInput label={t('corpus.filterByTags')} />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((tag) => (
                          <Chip key={tag} label={tag} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {selection.allTags.map((tag) => (
                      <MenuItem key={tag} value={tag}>
                        <Checkbox checked={selection.tags.includes(tag)} size="small" />
                        <ListItemText primary={tag} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {selection.mode === 'selected' && (
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
                      {selection.textIds.length} / {filteredTexts.length}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button 
                        size="small" 
                        onClick={() => setSelection(prev => ({ 
                          ...prev, 
                          textIds: filteredTexts.map(t => t.id) 
                        }))}
                      >
                        {t('common.selectAll')}
                      </Button>
                      <Button 
                        size="small" 
                        onClick={() => setSelection(prev => ({ ...prev, textIds: [] }))}
                      >
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
                        <CircularProgress size={20} />
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
                              checked={selection.textIds.includes(text.id)}
                              onChange={() => setSelection(prev => ({
                                ...prev,
                                textIds: prev.textIds.includes(text.id)
                                  ? prev.textIds.filter(id => id !== text.id)
                                  : [...prev.textIds, text.id]
                              }))}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
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

              <Alert 
                severity={selectedCount > 0 ? 'success' : 'warning'} 
                icon={false}
                sx={{ py: 0.5 }}
              >
                <Typography variant="body2">
                  {t('keyword.corpus.selectedCount', 'Selected')}: <strong>{selectedCount}</strong> {t('corpus.textsCount')}
                </Typography>
              </Alert>
            </>
          )}
        </Stack>
      </Paper>
    )
  }

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
        <Typography variant="h6" gutterBottom>
          {t('keyword.keyness.title', 'Keyness Comparison')}
        </Typography>

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

        {/* 1. Study Corpus Selection */}
        {renderCorpusSelector(
          studySelection,
          setStudySelection,
          filteredStudyTexts,
          studyTextSearch,
          setStudyTextSearch,
          loadingStudyTexts,
          true,
          t('keyword.keyness.studyCorpus', 'Study Corpus (Target)')
        )}

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
            // Traditional corpus selection
            renderCorpusSelector(
              refSelection,
              setRefSelection,
              filteredRefTexts,
              refTextSearch,
              setRefTextSearch,
              loadingRefTexts,
              false,
              ''
            )
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
                  disabled={!studySelection.corpus}
                />
              }
              label={
                <Typography variant="body2">
                  {t('keyword.stopwords.removeStopwords')}
                </Typography>
              }
              sx={{ mr: 0 }}
            />
            {stopwordsConfig.removeStopwords && studySelection.corpus && (
              <Chip 
                label={studySelection.corpus.language || 'english'} 
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
            disabled={!studySelection.corpus}
          />
        </Paper>

        {/* 5. POS Filter Panel */}
        <Box sx={{ mb: 2 }}>
          <POSFilterPanel
            config={posFilter}
            onChange={setPosFilter}
            posTags={posTags}
            disabled={!studySelection.corpus}
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
            disabled={!studySelection.corpus}
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
                    disabled={!studySelection.corpus}
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
              <TextField
                size="small"
                fullWidth
                label={t('keyword.threshold.minScore', 'Minimum Score')}
                type="number"
                value={thresholdConfig.minScore ?? ''}
                onChange={(e) => setThresholdConfig(prev => ({
                  ...prev,
                  minScore: e.target.value ? parseFloat(e.target.value) : undefined
                }))}
                disabled={!studySelection.corpus}
                helperText={
                  statistic === 'log_likelihood' || statistic === 'chi_squared'
                    ? t('keyword.threshold.llHelp', 'LL/Chi2 > 6.63 (p < 0.01), > 3.84 (p < 0.05)')
                    : statistic === 'log_ratio'
                    ? t('keyword.threshold.lrHelp', '|Log Ratio| > 1 indicates meaningful difference')
                    : ''
                }
              />
              {(statistic === 'log_likelihood' || statistic === 'chi_squared' || statistic === 'fishers_exact') && (
                <TextField
                  size="small"
                  fullWidth
                  label={t('keyword.threshold.maxPValue', 'Maximum p-value')}
                  type="number"
                  inputProps={{ step: 0.01, min: 0, max: 1 }}
                  value={thresholdConfig.maxPValue ?? ''}
                  onChange={(e) => setThresholdConfig(prev => ({
                    ...prev,
                    maxPValue: e.target.value ? parseFloat(e.target.value) : undefined
                  }))}
                  disabled={!studySelection.corpus}
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
                isLoading={isLoading}
                corpusId={studySelection.corpus?.id}
                textIds={getSelectedTextIds(studySelection, filteredStudyTexts)}
                selectionMode={studySelection.mode}
                selectedTags={studySelection.tags}
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
              onKeywordClick={(keyword) => {
                setRightTab(0)
              }}
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


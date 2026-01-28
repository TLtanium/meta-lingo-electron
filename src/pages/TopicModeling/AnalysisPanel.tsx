/**
 * Analysis Panel for Topic Modeling
 * Configure BERTopic analysis parameters including representation models
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Chip,
  Tooltip
} from '@mui/material'
import { NumberInput } from '../../components/common'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useTranslation } from 'react-i18next'
import type {
  DimReductionConfig,
  ClusteringConfig,
  VectorizerConfig,
  RepresentationModelConfig,
  OutlierConfig,
  TopicAnalysisResult,
  DynamicTopicConfig
} from '../../types/topicModeling'
import { topicModelingApi } from '../../api'

// Representation model types (c-TF-IDF is default, no separate option needed)
// Note: Ollama removed from here - use the "Generate Names" button in results panel instead
type RepresentationType = 
  | null 
  | 'KeyBERTInspired' 
  | 'MaximalMarginalRelevance' 
  | 'PartOfSpeech'

interface AnalysisPanelProps {
  embeddingId: string | null
  onAnalysisComplete?: (result: TopicAnalysisResult) => void
  dynamicTopicConfig?: DynamicTopicConfig
  corpusId?: string
  textIds?: string[]
  corpusLanguage?: string
  resultId?: string | null  // For outlier estimation after analysis
  outlierCount?: number  // Current outlier count from analysis result
}

export default function AnalysisPanel({
  embeddingId,
  onAnalysisComplete,
  dynamicTopicConfig,
  corpusId,
  textIds,
  corpusLanguage = 'english',
  resultId = null,
  outlierCount = 0
}: AnalysisPanelProps) {
  const { t } = useTranslation()
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Outlier estimation states
  const [estimating, setEstimating] = useState(false)
  const [estimationResult, setEstimationResult] = useState<{
    current_outliers: number
    estimated_outliers: number
    reduced_count: number
    total_documents: number
    current_percentage: number
    estimated_percentage: number
  } | null>(null)
  const [estimationError, setEstimationError] = useState<string | null>(null)

  // Configuration states
  const [dimReduction, setDimReduction] = useState<DimReductionConfig>({
    method: 'UMAP',
    params: {
      n_neighbors: 15,
      n_components: 5,
      min_dist: 0.1,
      metric: 'cosine',
      random_state: 42,
      low_memory: true
    }
  })

  const [clustering, setClustering] = useState<ClusteringConfig>({
    method: 'HDBSCAN',
    params: {
      min_cluster_size: 5,
      min_samples: null,
      metric: 'euclidean',
      cluster_selection_method: 'eom',
      allow_single_cluster: false,
      alpha: 1.0
    }
  })

  const [vectorizer, setVectorizer] = useState<VectorizerConfig>({
    type: 'CountVectorizer',
    params: {
      min_df: 1,
      max_df: 1.0,
      ngram_range: [1, 1],
      stop_words: null  // Will be set based on removeStopwords and corpusLanguage
    }
  })
  
  // Remove stopwords checkbox - language determined by corpus metadata
  const [removeStopwords, setRemoveStopwords] = useState(true)

  const [representationModel, setRepresentationModel] = useState<RepresentationModelConfig>({
    type: null,
    params: {}
  })

  const [outlierConfig, setOutlierConfig] = useState<OutlierConfig>({
    enabled: false,
    strategy: 'distributions',
    threshold: 0.0
  })

  // Representation model type change handler
  const handleRepresentationTypeChange = (type: RepresentationType) => {
    const defaultParams: Record<string, Record<string, unknown>> = {
      KeyBERTInspired: {
        top_n_words: 10,
        nr_repr_docs: 5,
        nr_samples: 500,
        nr_candidate_words: 100
      },
      MaximalMarginalRelevance: {
        diversity: 0.3,
        top_n_words: 10
      },
      PartOfSpeech: {
        model: 'en_core_web_lg',  // Only lg models are installed
        top_n_words: 10,
        pos_patterns: [['NOUN'], ['ADJ', 'NOUN']]
      }
    }
    
    setRepresentationModel({
      type: type as RepresentationModelConfig['type'],
      params: type ? defaultParams[type] || {} : {}
    })
  }

  // Handle outlier estimation
  const handleEstimateOutliers = async () => {
    if (!resultId) {
      setEstimationError(t('topicModeling.analysis.runAnalysisFirst') || 'Please run analysis first to estimate outliers')
      return
    }

    setEstimating(true)
    setEstimationError(null)
    setEstimationResult(null)

    try {
      const response = await topicModelingApi.estimateOutliers(
        resultId,
        outlierConfig.strategy,
        outlierConfig.threshold
      )

      if (response.success && response.data) {
        setEstimationResult(response.data)
      } else {
        setEstimationError(response.error || 'Estimation failed')
      }
    } catch (err) {
      setEstimationError(String(err))
    } finally {
      setEstimating(false)
    }
  }

  const handleAnalyze = async () => {
    if (!embeddingId) {
      setError(t('topicModeling.analysis.selectEmbeddingFirst') || 'Please select an embedding first')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      // Ensure HDBSCAN alpha parameter is valid
      const clusteringData = {
        ...clustering,
        params: {
          ...clustering.params,
          ...(clustering.method === 'HDBSCAN' && {
            alpha: clustering.params.alpha && clustering.params.alpha > 0 ? clustering.params.alpha : 1.0
          })
        }
      }
      
      // Determine stop_words based on removeStopwords checkbox and corpus language
      const stopWordsValue = removeStopwords ? corpusLanguage : null
      const vectorizerWithStopwords = {
        ...vectorizer,
        params: {
          ...vectorizer.params,
          stop_words: stopWordsValue
        }
      }
      
      // Build request with optional dynamic topic config
      const requestData: Record<string, unknown> = {
        embedding_id: embeddingId,
        dim_reduction: dimReduction,
        clustering: clusteringData,
        vectorizer: vectorizerWithStopwords,
        representation_model: representationModel,
        reduce_outliers: outlierConfig,
        calculate_probabilities: outlierConfig.strategy === 'probabilities',
        language: corpusLanguage  // For language-aware vectorizer tokenization
      }

      // Add dynamic topic config if enabled
      if (dynamicTopicConfig?.enabled && corpusId && textIds?.length) {
        requestData.dynamic_topic = {
          enabled: true,
          date_format: dynamicTopicConfig.date_format,
          nr_bins: dynamicTopicConfig.nr_bins,
          evolution_tuning: dynamicTopicConfig.evolution_tuning,
          global_tuning: dynamicTopicConfig.global_tuning,
          corpus_id: corpusId,
          text_ids: textIds
        }
      }

      const response = await topicModelingApi.analyzeTopics(requestData)

      if (response.success && response.data) {
        onAnalysisComplete?.(response.data)
      } else {
        setError(response.error || 'Analysis failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setAnalyzing(false)
    }
  }

  // Render representation model parameters
  const renderRepresentationParams = () => {
    if (!representationModel.type) return null
    
    const params = representationModel.params
    const updateParam = (key: string, value: unknown) => {
      setRepresentationModel({
        ...representationModel,
        params: { ...params, [key]: value }
      })
    }

    switch (representationModel.type) {
      case 'KeyBERTInspired':
        return (
          <Stack spacing={2}>
            <NumberInput
              label="top_n_words"
              size="small"
              value={params.top_n_words as number}
              onChange={(val) => updateParam('top_n_words', val)}
              min={1}
              max={50}
              integer
              defaultValue={10}
              fullWidth
            />
            <NumberInput
              label="nr_repr_docs"
              size="small"
              value={params.nr_repr_docs as number}
              onChange={(val) => updateParam('nr_repr_docs', val)}
              min={1}
              max={50}
              integer
              defaultValue={5}
              fullWidth
            />
            <NumberInput
              label="nr_samples"
              size="small"
              value={params.nr_samples as number}
              onChange={(val) => updateParam('nr_samples', val)}
              min={100}
              max={5000}
              integer
              defaultValue={500}
              fullWidth
            />
            <NumberInput
              label="nr_candidate_words"
              size="small"
              value={params.nr_candidate_words as number}
              onChange={(val) => updateParam('nr_candidate_words', val)}
              min={10}
              max={500}
              integer
              defaultValue={100}
              fullWidth
            />
          </Stack>
        )
      
      case 'MaximalMarginalRelevance':
        return (
          <Stack spacing={2}>
            <NumberInput
              label="diversity"
              size="small"
              value={params.diversity as number}
              onChange={(val) => updateParam('diversity', val)}
              min={0}
              max={1}
              step={0.1}
              defaultValue={0.3}
              fullWidth
            />
            <NumberInput
              label="top_n_words"
              size="small"
              value={params.top_n_words as number}
              onChange={(val) => updateParam('top_n_words', val)}
              min={1}
              max={50}
              integer
              defaultValue={10}
              fullWidth
            />
          </Stack>
        )
      
      case 'PartOfSpeech':
        return (
          <Stack spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>{t('topicModeling.representation.spacyModel')}</InputLabel>
              <Select
                value={params.model as string}
                label={t('topicModeling.representation.spacyModel')}
                onChange={(e) => updateParam('model', e.target.value)}
              >
                <MenuItem value="en_core_web_lg">en_core_web_lg (English)</MenuItem>
                <MenuItem value="zh_core_web_lg">zh_core_web_lg (Chinese)</MenuItem>
              </Select>
            </FormControl>
            <NumberInput
              label="top_n_words"
              size="small"
              value={params.top_n_words as number}
              onChange={(val) => updateParam('top_n_words', val)}
              min={1}
              max={50}
              integer
              defaultValue={10}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              {t('topicModeling.representation.posPatternInfo')}
            </Typography>
          </Stack>
        )
      
      default:
        return null
    }
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {t('topicModeling.analysis.title')}
      </Typography>

      <Stack spacing={1}>
        {/* Dimensionality Reduction */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">{t('topicModeling.analysis.dimensionReduction')}</Typography>
              <Chip label={dimReduction.method} size="small" color="primary" variant="outlined" />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('topicModeling.analysis.method')}</InputLabel>
                <Select
                  value={dimReduction.method}
                  label={t('topicModeling.analysis.method')}
                  onChange={(e) => setDimReduction({
                    ...dimReduction,
                    method: e.target.value as 'UMAP' | 'PCA'
                  })}
                >
                  <MenuItem value="UMAP">UMAP</MenuItem>
                  <MenuItem value="PCA">PCA</MenuItem>
                </Select>
              </FormControl>

              {dimReduction.method === 'UMAP' && (
                <>
                  <NumberInput
                    label="n_neighbors"
                    size="small"
                    value={dimReduction.params.n_neighbors}
                    onChange={(val) => setDimReduction({
                      ...dimReduction,
                      params: { ...dimReduction.params, n_neighbors: val }
                    })}
                    min={2}
                    max={100}
                    integer
                    defaultValue={15}
                    fullWidth
                  />
                  <NumberInput
                    label="n_components"
                    size="small"
                    value={dimReduction.params.n_components}
                    onChange={(val) => setDimReduction({
                      ...dimReduction,
                      params: { ...dimReduction.params, n_components: val }
                    })}
                    min={2}
                    max={100}
                    integer
                    defaultValue={5}
                    fullWidth
                  />
                  <NumberInput
                    label="min_dist"
                    size="small"
                    value={dimReduction.params.min_dist}
                    onChange={(val) => setDimReduction({
                      ...dimReduction,
                      params: { ...dimReduction.params, min_dist: val }
                    })}
                    min={0}
                    max={1}
                    step={0.01}
                    defaultValue={0.1}
                    fullWidth
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel>metric</InputLabel>
                    <Select
                      value={dimReduction.params.metric}
                      label="metric"
                      onChange={(e) => setDimReduction({
                        ...dimReduction,
                        params: { ...dimReduction.params, metric: e.target.value }
                      })}
                    >
                      <MenuItem value="cosine">cosine</MenuItem>
                      <MenuItem value="euclidean">euclidean</MenuItem>
                      <MenuItem value="manhattan">manhattan</MenuItem>
                    </Select>
                  </FormControl>
                </>
              )}

              {dimReduction.method === 'PCA' && (
                <>
                  <NumberInput
                    label="n_components"
                    size="small"
                    value={dimReduction.params.n_components || 50}
                    onChange={(val) => setDimReduction({
                      ...dimReduction,
                      params: { ...dimReduction.params, n_components: val }
                    })}
                    min={2}
                    max={100}
                    integer
                    defaultValue={50}
                    fullWidth
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel>svd_solver</InputLabel>
                    <Select
                      value={dimReduction.params.svd_solver || 'auto'}
                      label="svd_solver"
                      onChange={(e) => setDimReduction({
                        ...dimReduction,
                        params: { ...dimReduction.params, svd_solver: e.target.value }
                      })}
                    >
                      <MenuItem value="auto">auto</MenuItem>
                      <MenuItem value="full">full</MenuItem>
                      <MenuItem value="arpack">arpack</MenuItem>
                      <MenuItem value="randomized">randomized</MenuItem>
                    </Select>
                  </FormControl>
                </>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Clustering */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">{t('topicModeling.analysis.clustering')}</Typography>
              <Chip label={clustering.method} size="small" color="secondary" variant="outlined" />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('topicModeling.analysis.method')}</InputLabel>
                <Select
                  value={clustering.method}
                  label={t('topicModeling.analysis.method')}
                  onChange={(e) => {
                    const newMethod = e.target.value as 'HDBSCAN' | 'BIRCH' | 'K-Means'
                    const newParams = newMethod === 'HDBSCAN' 
                      ? { min_cluster_size: 5, min_samples: null, metric: 'euclidean', cluster_selection_method: 'eom', allow_single_cluster: false, alpha: 1.0 }
                      : newMethod === 'BIRCH'
                      ? { threshold: 0.5, branching_factor: 50, n_clusters: 3 }
                      : { n_clusters: 8, init: 'k-means++', max_iter: 300, random_state: 42 }
                    setClustering({ method: newMethod, params: newParams })
                  }}
                >
                  <MenuItem value="HDBSCAN">HDBSCAN</MenuItem>
                  <MenuItem value="BIRCH">BIRCH</MenuItem>
                  <MenuItem value="K-Means">K-Means</MenuItem>
                </Select>
              </FormControl>

              {clustering.method === 'HDBSCAN' && (
                <>
                  <NumberInput
                    label="min_cluster_size"
                    size="small"
                    value={clustering.params.min_cluster_size}
                    onChange={(val) => setClustering({
                      ...clustering,
                      params: { ...clustering.params, min_cluster_size: val }
                    })}
                    min={2}
                    max={100}
                    integer
                    defaultValue={5}
                    fullWidth
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel>metric</InputLabel>
                    <Select
                      value={clustering.params.metric}
                      label="metric"
                      onChange={(e) => setClustering({
                        ...clustering,
                        params: { ...clustering.params, metric: e.target.value }
                      })}
                    >
                      <MenuItem value="euclidean">euclidean</MenuItem>
                      <MenuItem value="manhattan">manhattan</MenuItem>
                      <MenuItem value="cosine">cosine</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel>cluster_selection_method</InputLabel>
                    <Select
                      value={clustering.params.cluster_selection_method}
                      label="cluster_selection_method"
                      onChange={(e) => setClustering({
                        ...clustering,
                        params: { ...clustering.params, cluster_selection_method: e.target.value }
                      })}
                    >
                      <MenuItem value="eom">eom</MenuItem>
                      <MenuItem value="leaf">leaf</MenuItem>
                    </Select>
                  </FormControl>
                </>
              )}

              {clustering.method === 'BIRCH' && (
                <>
                  <NumberInput
                    label="threshold"
                    size="small"
                    value={clustering.params.threshold}
                    onChange={(val) => setClustering({
                      ...clustering,
                      params: { ...clustering.params, threshold: val }
                    })}
                    min={0.1}
                    max={10}
                    step={0.1}
                    defaultValue={0.5}
                    fullWidth
                  />
                  <NumberInput
                    label="n_clusters"
                    size="small"
                    value={clustering.params.n_clusters}
                    onChange={(val) => setClustering({
                      ...clustering,
                      params: { ...clustering.params, n_clusters: val }
                    })}
                    min={2}
                    max={100}
                    integer
                    defaultValue={3}
                    fullWidth
                  />
                </>
              )}

              {clustering.method === 'K-Means' && (
                <>
                  <NumberInput
                    label="n_clusters"
                    size="small"
                    value={clustering.params.n_clusters}
                    onChange={(val) => setClustering({
                      ...clustering,
                      params: { ...clustering.params, n_clusters: val }
                    })}
                    min={2}
                    max={100}
                    integer
                    defaultValue={8}
                    fullWidth
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel>init</InputLabel>
                    <Select
                      value={clustering.params.init}
                      label="init"
                      onChange={(e) => setClustering({
                        ...clustering,
                        params: { ...clustering.params, init: e.target.value }
                      })}
                    >
                      <MenuItem value="k-means++">k-means++</MenuItem>
                      <MenuItem value="random">random</MenuItem>
                    </Select>
                  </FormControl>
                </>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Vectorizer */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">{t('topicModeling.analysis.vectorizer')}</Typography>
              <Chip label={vectorizer.type} size="small" variant="outlined" />
              {removeStopwords && (
                <Chip 
                  label={`${t('topicModeling.vectorizer.stopwords')}: ${corpusLanguage}`} 
                  size="small" 
                  variant="outlined" 
                  color="info"
                />
              )}
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('topicModeling.analysis.type')}</InputLabel>
                <Select
                  value={vectorizer.type}
                  label={t('topicModeling.analysis.type')}
                  onChange={(e) => setVectorizer({
                    ...vectorizer,
                    type: e.target.value as 'CountVectorizer' | 'TfidfVectorizer'
                  })}
                >
                  <MenuItem value="CountVectorizer">CountVectorizer</MenuItem>
                  <MenuItem value="TfidfVectorizer">TfidfVectorizer</MenuItem>
                </Select>
              </FormControl>
              
              {/* Stopwords checkbox - language auto-detected from corpus */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={removeStopwords}
                    onChange={(e) => setRemoveStopwords(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">
                      {t('topicModeling.vectorizer.removeStopwords')}
                    </Typography>
                    <Chip 
                      label={corpusLanguage} 
                      size="small" 
                      variant="outlined"
                      color="default"
                    />
                  </Stack>
                }
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
                {t('topicModeling.vectorizer.stopwordsAutoHelp')}
              </Typography>
              
              <NumberInput
                label="min_df"
                size="small"
                value={vectorizer.params.min_df}
                onChange={(val) => setVectorizer({
                  ...vectorizer,
                  params: { ...vectorizer.params, min_df: val }
                })}
                min={1}
                max={100}
                integer
                defaultValue={1}
                fullWidth
              />
              <NumberInput
                label="max_df"
                size="small"
                value={vectorizer.params.max_df}
                onChange={(val) => setVectorizer({
                  ...vectorizer,
                  params: { ...vectorizer.params, max_df: val }
                })}
                min={0.1}
                max={1.0}
                step={0.1}
                defaultValue={1.0}
                fullWidth
              />
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Representation Model */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">{t('topicModeling.analysis.representationModel')}</Typography>
              <Chip 
                label={representationModel.type || 'c-TF-IDF'} 
                size="small" 
                color={representationModel.type ? 'info' : 'default'}
                variant="outlined" 
              />
              <Tooltip title={t('topicModeling.representation.info')}>
                <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              </Tooltip>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel shrink>{t('topicModeling.representation.type')}</InputLabel>
                <Select
                  value={representationModel.type || ''}
                  label={t('topicModeling.representation.type')}
                  displayEmpty
                  onChange={(e) => handleRepresentationTypeChange(e.target.value as RepresentationType)}
                  renderValue={(selected) => {
                    if (!selected) {
                      return `c-TF-IDF (${t('topicModeling.representation.default')})`
                    }
                    return selected === 'MaximalMarginalRelevance' ? 'MaximalMarginalRelevance (MMR)' : selected
                  }}
                >
                  <MenuItem value="">c-TF-IDF ({t('topicModeling.representation.default')})</MenuItem>
                  <MenuItem value="KeyBERTInspired">KeyBERTInspired</MenuItem>
                  <MenuItem value="MaximalMarginalRelevance">MaximalMarginalRelevance (MMR)</MenuItem>
                  <MenuItem value="PartOfSpeech">PartOfSpeech</MenuItem>
                </Select>
              </FormControl>
              {renderRepresentationParams()}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Outlier Reduction */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">{t('topicModeling.analysis.outlierReduction')}</Typography>
              {outlierConfig.enabled && <Chip label="ON" size="small" color="warning" />}
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={outlierConfig.enabled}
                    onChange={(e) => setOutlierConfig({
                      ...outlierConfig,
                      enabled: e.target.checked
                    })}
                    size="small"
                  />
                }
                label={t('topicModeling.analysis.enableOutlierReduction')}
              />
              
              {/* Strategy and threshold always visible for estimation */}
              <FormControl size="small" fullWidth>
                <InputLabel>strategy</InputLabel>
                <Select
                  value={outlierConfig.strategy}
                  label="strategy"
                  onChange={(e) => setOutlierConfig({
                    ...outlierConfig,
                    strategy: e.target.value as OutlierConfig['strategy']
                  })}
                >
                  <MenuItem value="distributions">distributions</MenuItem>
                  <MenuItem value="probabilities">probabilities</MenuItem>
                  <MenuItem value="c-tf-idf">c-tf-idf</MenuItem>
                  <MenuItem value="embeddings">embeddings</MenuItem>
                </Select>
              </FormControl>
              <NumberInput
                label="threshold"
                size="small"
                value={outlierConfig.threshold}
                onChange={(val) => setOutlierConfig({
                  ...outlierConfig,
                  threshold: val
                })}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0}
                fullWidth
              />
              
              {/* Estimate Outliers Button - requires enabled outlier reduction, completed analysis with outliers */}
              <Tooltip title={
                !outlierConfig.enabled
                  ? (t('topicModeling.analysis.enableOutlierFirst') || 'Enable outlier reduction first')
                  : !resultId 
                    ? (t('topicModeling.analysis.runAnalysisFirst') || 'Run analysis first')
                    : outlierCount <= 0
                      ? (t('topicModeling.analysis.noOutliersToEstimate') || 'No outliers to estimate')
                      : ''
              }>
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    color="warning"
                    onClick={handleEstimateOutliers}
                    disabled={!outlierConfig.enabled || !resultId || outlierCount <= 0 || estimating}
                    fullWidth
                    startIcon={estimating ? <CircularProgress size={16} color="inherit" /> : null}
                  >
                    {estimating 
                      ? t('common.loading') 
                      : t('topicModeling.analysis.estimateOutliers') || 'Estimate Outliers'
                    }
                  </Button>
                </span>
              </Tooltip>
              
              {/* Estimation Result */}
              {estimationResult && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  <Typography variant="body2">
                    {t('topicModeling.analysis.estimationResult') || 'Estimation Result'}:
                  </Typography>
                  <Typography variant="body2">
                    {t('topicModeling.analysis.currentOutliers') || 'Current'}: <strong>{estimationResult.current_outliers}</strong> ({estimationResult.current_percentage}%)
                  </Typography>
                  <Typography variant="body2">
                    {t('topicModeling.analysis.estimatedOutliers') || 'After reduction'}: <strong>{estimationResult.estimated_outliers}</strong> ({estimationResult.estimated_percentage}%)
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    {t('topicModeling.analysis.reducedCount') || 'Reduced'}: <strong>{estimationResult.reduced_count}</strong>
                  </Typography>
                </Alert>
              )}
              
              {/* Estimation Error */}
              {estimationError && (
                <Alert severity="error" sx={{ py: 0.5 }}>
                  {estimationError}
                </Alert>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Error */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Analyze Button */}
        <Button
          variant="contained"
          color="primary"
          startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
          onClick={handleAnalyze}
          disabled={analyzing || !embeddingId}
          fullWidth
          size="large"
          sx={{ mt: 1 }}
        >
          {analyzing 
            ? t('topicModeling.analysis.analyzing')
            : t('topicModeling.analysis.execute')
          }
        </Button>
      </Stack>
    </Paper>
  )
}

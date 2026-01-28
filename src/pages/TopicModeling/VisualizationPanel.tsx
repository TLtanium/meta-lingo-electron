/**
 * Visualization Panel for Topic Modeling
 * Uses D3.js for interactive visualizations with configurable parameters
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Stack,
  Paper,
  TextField,
  Checkbox,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider
} from '@mui/material'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import { topicModelingApi, VisualizationParams } from '../../api/topicModeling'
import type { VisualizationType, VisualizationData } from '../../types/topicModeling'

// Plotly.js visualization components
import {
  TopicHierarchyPlot,
  IntertopicDistancePlot,
  TopicWordBarsPlot,
  TopicSimilarityHeatmapPlot,
  DocumentDistributionPlot,
  TermRankPlot,
  TopicEvolutionPlot
} from './components/visualizations/plotly'

interface VisualizationPanelProps {
  resultId: string | null
  hasDynamicTopics?: boolean
}

interface VizConfig {
  type: VisualizationType
  labelKey: string
  requiresDynamic?: boolean
}

// Available visualization types (Plotly.js standard implementation)
const VIZ_TYPES: VizConfig[] = [
  { type: 'barchart', labelKey: 'topicModeling.visualization.barchart' },
  { type: 'topics', labelKey: 'topicModeling.visualization.intertopicDistance' },
  { type: 'hierarchy', labelKey: 'topicModeling.visualization.hierarchy' },
  { type: 'heatmap', labelKey: 'topicModeling.visualization.heatmap' },
  { type: 'documents', labelKey: 'topicModeling.visualization.documentDistribution' },
  { type: 'term_rank', labelKey: 'topicModeling.visualization.termRank' },
  { type: 'topics_over_time', labelKey: 'topicModeling.visualization.topicsOverTime', requiresDynamic: true }
]

// Default visualization parameters
const DEFAULT_PARAMS: Record<VisualizationType, VisualizationParams> = {
  topics: { top_n_topics: undefined, custom_labels: false, title: 'Intertopic Distance Map' },
  hierarchy: { orientation: 'horizontal', custom_labels: false, show_hierarchical_labels: true, title: 'Topic Hierarchy' },
  barchart: { top_n_topics: 8, n_words: 5, custom_labels: false, title: 'Topic Word Scores' },
  heatmap: { n_clusters: undefined, custom_labels: false, title: 'Topic Similarity Matrix' },
  documents: { hide_document_hover: false, sample_size: 2000, custom_labels: false, title: 'Document Topic Distribution' },
  term_rank: { log_scale: false, custom_labels: false, title: 'Term Score Decline per Topic' },
  topics_over_time: { top_n_topics: undefined, normalize_frequency: false, custom_labels: false, title: 'Topics over Time' }
}

export default function VisualizationPanel({ resultId, hasDynamicTopics = false }: VisualizationPanelProps) {
  const { t } = useTranslation()
  const [selectedTab, setSelectedTab] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vizData, setVizData] = useState<Partial<Record<VisualizationType, VisualizationData>>>({})
  const [params, setParams] = useState<Record<VisualizationType, VisualizationParams>>(DEFAULT_PARAMS)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Filter visualization types based on whether dynamic topics are available
  const availableVizTypes = VIZ_TYPES.filter(vt => !vt.requiresDynamic || hasDynamicTopics)
  const currentVizType = availableVizTypes[selectedTab]?.type

  // Load visualization data
  const loadVisualization = useCallback(async (vizType: VisualizationType, forceReload = false) => {
    if (!resultId) return
    if (!forceReload && vizData[vizType]) return

    setLoading(true)
    setError(null)

    try {
      const vizParams = params[vizType] || {}
      const response = await topicModelingApi.getVisualization(resultId, vizType, vizParams)
      
      if (response.success && response.data) {
        setVizData(prev => ({ ...prev, [vizType]: response.data! }))
        if (response.data.error) {
          setError(response.data.error)
        }
      } else {
        setError(response.error || t('topicModeling.visualization.loadError'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [resultId, params, t, vizData])

  // Load on tab change
  useEffect(() => {
    if (currentVizType && resultId) {
      loadVisualization(currentVizType)
    }
  }, [currentVizType, resultId])

  // Clear data when result changes
  useEffect(() => {
    if (resultId) {
      setVizData({})
      setError(null)
      setSelectedTab(0)
    }
  }, [resultId])

  // Handle parameter change - automatically reload visualization
  const handleParamChange = (vizType: VisualizationType, key: string, value: any) => {
    const newParams = {
      ...params,
      [vizType]: {
        ...params[vizType],
        [key]: value
      }
    }
    setParams(newParams)
    
    // Automatically reload visualization when params change
    if (currentVizType === vizType && resultId) {
      // Clear current visualization data
      setVizData(prev => {
        const next = { ...prev }
        delete next[currentVizType]
        return next
      })
      // Reload with new params
      setLoading(true)
      setError(null)
      topicModelingApi.getVisualization(resultId, currentVizType, newParams[currentVizType] || {})
        .then(response => {
          if (response.success && response.data) {
            setVizData(prev => ({ ...prev, [currentVizType]: response.data! }))
            if (response.data.error) {
              setError(response.data.error)
            }
          } else {
            setError(response.error || t('topicModeling.visualization.loadError'))
          }
        })
        .catch(err => {
          setError(String(err))
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }

  // Export SVG - For Plotly charts, use Plotly's downloadImage
  const handleExportSVG = useCallback(() => {
    const container = chartContainerRef.current
    if (!container) return

    // For Plotly charts, try to use Plotly's downloadImage
    const plotlyDiv = container.querySelector('.js-plotly-plot')
    if (plotlyDiv && (window as any).Plotly) {
      try {
        (window as any).Plotly.downloadImage(plotlyDiv as HTMLElement, {
          format: 'svg',
          filename: `topic-modeling-${currentVizType}-chart`,
          height: 600,
          width: 800,
          scale: 3
        })
        return
      } catch (error) {
        console.error('Plotly SVG export failed:', error)
      }
    }

    // Fallback: try to find SVG element
    const svg = container.querySelector('svg')
    if (svg) {
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svg)
      const blob = new Blob([svgString], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = `topic-modeling-${currentVizType}-chart.svg`
      link.click()
      
      URL.revokeObjectURL(url)
    }
  }, [currentVizType])

  // Export PNG - For Plotly charts, use Plotly's downloadImage
  const handleExportPNG = useCallback(async () => {
    const container = chartContainerRef.current
    if (!container) return

    // For Plotly charts, use Plotly's downloadImage
    const plotlyDiv = container.querySelector('.js-plotly-plot')
    if (plotlyDiv && (window as any).Plotly) {
      try {
        (window as any).Plotly.downloadImage(plotlyDiv as HTMLElement, {
          format: 'png',
          filename: `topic-modeling-${currentVizType}-chart`,
          height: 600,
          width: 800,
          scale: 3
        })
        return
      } catch (error) {
        console.error('Plotly PNG export failed:', error)
      }
    }

    // Fallback: use html2canvas for non-Plotly charts (e.g., table)
    try {
      const html2canvas = (await import('html2canvas')).default
      const chartElement = container.querySelector('[class*="MuiPaper-root"], [class*="MuiBox-root"]') || container
      
      const canvas = await html2canvas(chartElement as HTMLElement, {
        backgroundColor: '#fafafa',
        scale: 3,
        useCORS: true
      })
      
      canvas.toBlob((blob) => {
        if (!blob) return
        
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `topic-modeling-${currentVizType}-chart.png`
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [currentVizType])

  // Render parameter controls for current visualization type
  const renderParamControls = () => {
    if (!currentVizType) return null
    const currentParams = params[currentVizType] || {}

    switch (currentVizType) {
      case 'topics':
        return (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.custom_labels || false}
                  onChange={(e) => handleParamChange(currentVizType, 'custom_labels', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.useCustomLabels')}
                </Typography>
              }
            />
          </>
        )

      case 'hierarchy':
        return (
          <>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>{t('topicModeling.visualization.orientation')}</InputLabel>
              <Select
                value={currentParams.orientation || 'horizontal'}
                onChange={(e) => handleParamChange(currentVizType, 'orientation', e.target.value)}
                label={t('topicModeling.visualization.orientation')}
              >
                <MenuItem value="vertical">{t('topicModeling.visualization.vertical')}</MenuItem>
                <MenuItem value="horizontal">{t('topicModeling.visualization.horizontal')}</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.show_hierarchical_labels !== false}
                  onChange={(e) => handleParamChange(currentVizType, 'show_hierarchical_labels', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.showHierarchicalLabels')}
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.custom_labels || false}
                  onChange={(e) => handleParamChange(currentVizType, 'custom_labels', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.useCustomLabels')}
                </Typography>
              }
            />
          </>
        )

      case 'barchart':
        return (
          <>
            <NumberInput
              label={t('topicModeling.visualization.topNTopics')}
              value={currentParams.top_n_topics || 8}
              onChange={(value) => handleParamChange(currentVizType, 'top_n_topics', value)}
              size="small"
              min={1}
              max={50}
              integer
              sx={{ width: 130 }}
            />
            <NumberInput
              label={t('topicModeling.visualization.nWords')}
              value={currentParams.n_words || 5}
              onChange={(value) => handleParamChange(currentVizType, 'n_words', value)}
              size="small"
              min={1}
              max={20}
              integer
              sx={{ width: 130 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.custom_labels || false}
                  onChange={(e) => handleParamChange(currentVizType, 'custom_labels', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.useCustomLabels')}
                </Typography>
              }
            />
          </>
        )

      case 'documents':
        return (
          <>
            <NumberInput
              label={t('topicModeling.visualization.sampleSize')}
              value={currentParams.sample_size || 2000}
              onChange={(value) => handleParamChange(currentVizType, 'sample_size', value)}
              size="small"
              min={100}
              max={5000}
              step={100}
              integer
              sx={{ width: 130 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.hide_document_hover || false}
                  onChange={(e) => handleParamChange(currentVizType, 'hide_document_hover', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.hideDocHover')}
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.custom_labels || false}
                  onChange={(e) => handleParamChange(currentVizType, 'custom_labels', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.useCustomLabels')}
                </Typography>
              }
            />
          </>
        )

      case 'heatmap':
        return (
          <>
            <NumberInput
              label={t('topicModeling.visualization.nClusters')}
              value={currentParams.n_clusters || null}
              onChange={(value) => handleParamChange(currentVizType, 'n_clusters', value || undefined)}
              size="small"
              placeholder={t('topicModeling.visualization.auto')}
              min={1}
              max={20}
              integer
              sx={{ width: 130 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.custom_labels || false}
                  onChange={(e) => handleParamChange(currentVizType, 'custom_labels', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.useCustomLabels')}
                </Typography>
              }
            />
          </>
        )

      case 'term_rank':
        return (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.log_scale || false}
                  onChange={(e) => handleParamChange(currentVizType, 'log_scale', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.logScale')}
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.custom_labels || false}
                  onChange={(e) => handleParamChange(currentVizType, 'custom_labels', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.useCustomLabels')}
                </Typography>
              }
            />
          </>
        )

      case 'topics_over_time':
        return (
          <>
            <NumberInput
              label={t('topicModeling.visualization.topNTopics')}
              value={currentParams.top_n_topics || null}
              onChange={(value) => handleParamChange(currentVizType, 'top_n_topics', value || undefined)}
              size="small"
              placeholder={t('topicModeling.visualization.allTopics')}
              min={1}
              max={50}
              integer
              sx={{ width: 130 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.normalize_frequency || false}
                  onChange={(e) => handleParamChange(currentVizType, 'normalize_frequency', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.normalizeFrequency')}
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentParams.custom_labels || false}
                  onChange={(e) => handleParamChange(currentVizType, 'custom_labels', e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('topicModeling.visualization.useCustomLabels')}
                </Typography>
              }
            />
          </>
        )

      default:
        return (
          <FormControlLabel
            control={
              <Checkbox
                checked={currentParams.custom_labels || false}
                onChange={(e) => handleParamChange(currentVizType, 'custom_labels', e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                {t('topicModeling.visualization.useCustomLabels')}
              </Typography>
            }
          />
        )
    }
  }

  // Render visualization content based on type
  const renderVisualization = () => {
    const currentParams = params[currentVizType] || {}
    
    if (!resultId) {
      return (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: 400,
          flexDirection: 'column',
          gap: 2,
          p: 4
        }}>
          <InsertChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            {t('topicModeling.visualization.noResult')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('topicModeling.visualization.runAnalysisFirst')}
          </Typography>
        </Box>
      )
    }

    if (loading) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
          <CircularProgress />
        </Box>
      )
    }

    if (error) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )
    }

    const data = vizData[currentVizType]
    
    if (!data) {
      return (
        <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
          <Typography>{t('common.noData')}</Typography>
        </Box>
      )
    }

    // Render appropriate Plotly.js component based on visualization type
    switch (currentVizType) {
      case 'topics':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <IntertopicDistancePlot 
              data={data.plotly_data}
              height={600}
            />
          </Box>
        )
      
      case 'hierarchy':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <TopicHierarchyPlot 
              data={data.plotly_data}
              height={600}
            />
          </Box>
        )
      
      case 'barchart':
        return (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <TopicWordBarsPlot 
              data={data.plotly_data}
              height={600}
            />
          </Box>
        )
      
      case 'heatmap':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <TopicSimilarityHeatmapPlot 
              data={data.plotly_data}
              height={600}
            />
          </Box>
        )
      
      case 'documents':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <DocumentDistributionPlot 
              data={data.plotly_data}
              height={600}
              totalDocs={data.total_docs}
              sampleSize={data.sample_size}
            />
          </Box>
        )
      
      case 'term_rank':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <TermRankPlot 
              data={data.plotly_data}
              height={600}
            />
          </Box>
        )
      
      case 'topics_over_time':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <TopicEvolutionPlot 
              data={data.plotly_data}
              height={600}
            />
          </Box>
        )
      
      default:
        return (
          <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
            <Typography>{t('topicModeling.visualization.unsupportedType')}</Typography>
          </Box>
        )
    }
  }

  const hasData = resultId && vizData[currentVizType] && !error

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Chart Type Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={selectedTab}
          onChange={(_, v) => setSelectedTab(v)}
          variant="fullWidth"
        >
          {availableVizTypes.map((vt) => (
            <Tab key={vt.type} label={t(vt.labelKey)} />
          ))}
        </Tabs>
      </Box>

      {/* Parameter Panel - Gray Settings Bar */}
      <Paper 
        elevation={0} 
        sx={{ 
          px: 2, 
          py: 1.5, 
          borderBottom: 1, 
          borderColor: 'divider',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
          {renderParamControls()}
        </Stack>

        {/* Export buttons */}
        {hasData && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip title={t('wordFrequency.viz.export') + ' SVG'}>
              <IconButton size="small" onClick={handleExportSVG}>
                <SaveAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('wordFrequency.viz.export') + ' PNG'}>
              <IconButton size="small" onClick={handleExportPNG}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Paper>

      {/* Visualization Content */}
      <Box ref={chartContainerRef} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {renderVisualization()}
      </Box>
    </Box>
  )
}

// Data transformation functions to convert backend data to D3 component format

function transformBarChartData(data: any): any[] {
  if (!data || !Array.isArray(data)) return []
  
  // Backend returns array of topic data with words
  return data.map((topic: any) => ({
    topic_id: topic.topic_id ?? topic.id,
    topic_name: topic.topic_name ?? topic.name ?? `Topic ${topic.topic_id ?? topic.id}`,
    words: (topic.words || []).map((w: any) => ({
      word: typeof w === 'string' ? w : w.word,
      weight: typeof w === 'object' ? (w.weight ?? w.score ?? 0) : 0
    })),
    color: topic.color
  }))
}

function transformDocumentsData(data: any): any[] {
  if (!data) return []
  
  // Data should be an array of document scatter points
  const docsArray = Array.isArray(data) ? data : []
  
  return docsArray.map((doc: any) => ({
    x: doc.x,
    y: doc.y,
    topic: doc.topic ?? doc.topic_id ?? -1,
    topic_name: doc.topic_name ?? `Topic ${doc.topic ?? doc.topic_id ?? -1}`,
    doc_preview: doc.doc_preview ?? doc.text ?? '',
    color: doc.color
  }))
}

function transformTermRankData(data: any): any[] {
  if (!data) return []
  
  // Backend returns flat array: [{topic_id, topic_name, word, rank, weight, color}, ...]
  // Check if data is already in flat format
  const dataArray = Array.isArray(data) ? data : []
  
  if (dataArray.length === 0) return []
  
  // Check if it's already flat format (has 'word' and 'rank' at top level)
  if (dataArray[0]?.word !== undefined && dataArray[0]?.rank !== undefined) {
    // Already in correct format, just normalize
    return dataArray.map((item: any) => ({
      topic_id: item.topic_id ?? item.id ?? 0,
      topic_name: item.topic_name ?? item.name ?? `Topic ${item.topic_id ?? item.id ?? 0}`,
      word: item.word ?? '',
      rank: item.rank ?? 1,
      weight: item.weight ?? item.score ?? 0,
      color: item.color
    }))
  }
  
  // Old format: grouped by topic with words array
  const result: any[] = []
  
  dataArray.forEach((topic: any) => {
    const topicId = topic.topic_id ?? topic.id
    const topicName = topic.topic_name ?? topic.name ?? `Topic ${topicId}`
    const color = topic.color
    
    if (topic.words && Array.isArray(topic.words)) {
      topic.words.forEach((word: any, index: number) => {
        result.push({
          topic_id: topicId,
          topic_name: topicName,
          word: typeof word === 'string' ? word : word.word,
          rank: index + 1,
          weight: typeof word === 'object' ? (word.weight ?? word.score ?? 0) : 0,
          color
        })
      })
    }
  })
  
  return result
}

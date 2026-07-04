/**
 * Visualization Panel for Bibliographic Visualization
 * 
 * Design follows WordFrequency visualization panel pattern
 * Provides tab-based chart switching and unified settings
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Stack,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Divider,
  Switch,
  FormControlLabel,
  Checkbox,
  ListItemText,
  OutlinedInput
} from '@mui/material'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import CloudIcon from '@mui/icons-material/Cloud'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import TimelineIcon from '@mui/icons-material/Timeline'
import GradientIcon from '@mui/icons-material/Gradient'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import type {
  BiblioLibrary,
  BiblioFilter,
  NetworkVisualizationData,
  ClusterVisualizationData,
  TimelineVisualizationData,
  TimezoneVisualizationData,
  BurstDetectionData,
  HeatmapVisualizationData,
  WordCloudVisualizationData,
  CiteSpaceParams
} from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import FilterPanel from './FilterPanel'
import CiteSpaceParamsPanel from './viz/CiteSpaceParamsPanel'
import { SliderParam, SliderGrid, DrawerSubLabel } from './viz/ParamComponents'
import DataTableDock, { type DataTableRow } from './viz/DataTableDock'
import type { LabelMetric } from './components/d3/shared/labelMetrics'
import NetworkGraph from './components/d3/NetworkGraph'
import TimezoneView from './components/d3/TimezoneView'
import BurstChart from './components/d3/BurstChart'
import WordCloud from './components/d3/WordCloud'
import ClusterView from './components/d3/ClusterView'
import TimelineView from './components/d3/TimelineView'
import HeatmapView from './components/d3/HeatmapView'

type VisualizationType =
  | 'co-author'
  | 'co-institution'
  | 'co-country'
  | 'keyword-cooccur'
  | 'timezone'
  | 'burst'
  | 'wordcloud'
  | 'cluster'
  | 'timeline'
  | 'heatmap'

type ChartCategory = 'network' | 'timezone' | 'burst' | 'wordcloud' | 'cluster' | 'timeline' | 'heatmap'

interface VisualizationPanelProps {
  library: BiblioLibrary
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'teal', label: 'Teal' },
  { value: 'colorful', label: 'Colorful' }
]

// Helper to get a representative color from the scheme
function getColorFromScheme(scheme: string): string {
  const colors: Record<string, string> = {
    blue: '#2196f3',
    green: '#4caf50',
    purple: '#9c27b0',
    orange: '#ff9800',
    red: '#f44336',
    teal: '#009688',
    colorful: 'linear-gradient(90deg, #d32f2f, #f57c00, #388e3c, #1976d2, #7b1fa2)'
  }
  return colors[scheme] || colors.blue
}

export default function VisualizationPanel({ library }: VisualizationPanelProps) {
  const { t, i18n } = useTranslation()
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const settings = useSettingsStore()
  const [aiNaming, setAiNaming] = useState(false)
  
  // Chart type states
  const [chartCategory, setChartCategory] = useState<ChartCategory>('network')
  const [networkType, setNetworkType] = useState<'co-author' | 'co-institution' | 'co-country' | 'keyword-cooccur'>('keyword-cooccur')
  
  // Filter state
  const [filters, setFilters] = useState<BiblioFilter>({})
  
  // Visualization settings
  const [colorScheme, setColorScheme] = useState('blue')
  const [minWeight, setMinWeight] = useState(1)
  const [maxNodes, setMaxNodes] = useState(100)
  const [burstType, setBurstType] = useState<'keyword' | 'author'>('keyword')
  const [burstAlpha, setBurstAlpha] = useState(1.0)
  const [burstGamma, setBurstGamma] = useState(1.0)
  const [burstMinFreq, setBurstMinFreq] = useState(2)
  const [burstTopN, setBurstTopN] = useState(30)
  const [burstSortBy, setBurstSortBy] = useState<'strength' | 'begin'>('strength')
  const [timeSlice, _setTimeSlice] = useState(1)
  const [topN, setTopN] = useState(10)
  const [wordCloudSource, setWordCloudSource] = useState<'title' | 'abstract'>('abstract')
  const [wordCloudMaxItems, setWordCloudMaxItems] = useState(100)
  const [wordCloudColormap, setWordCloudColormap] = useState<'viridis' | 'inferno' | 'plasma' | 'autumn' | 'winter' | 'rainbow' | 'ocean' | 'forest' | 'sunset'>('viridis')
  // Node types for the term co-occurrence network — MULTI-select (hybrid networks:
  // e.g. keyword + reference gives diamonds and citation circles on one canvas)
  const [nodeTypes, setNodeTypes] = useState<Array<'keyword' | 'author' | 'institution' | 'country' | 'reference'>>(['keyword'])
  // Primary type drives legacy single-type consumers (titles, wordcloud gating, …)
  const clusterBy = nodeTypes[0] ?? 'keyword'
  const [heatmapBandwidth, setHeatmapBandwidth] = useState(0.15)
  const [heatmapColorScheme, setHeatmapColorScheme] = useState('turbo')
  const [heatmapLabelThreshold, setHeatmapLabelThreshold] = useState(0)
  const [clusterShowHulls, setClusterShowHulls] = useState(true)
  const [clusterHullThreshold, setClusterHullThreshold] = useState(2)
  // Dual label groups (CiteSpace panel): term/diamond layer (default By Degree) +
  // reference/circle layer (default By Citation). These are the two independent
  // CiteSpace label dropdowns and now drive both cluster and timeline views.
  const [termLabelMetric, setTermLabelMetric] = useState<LabelMetric>('degree')
  const [refLabelMetric, setRefLabelMetric] = useState<LabelMetric>('citation')
  const [showFrequency, setShowFrequency] = useState(false)
  // CiteSpace "Node Size" / "Font Size" sliders (apply to network / cluster / timeline / heatmap).
  const [nodeSizeScale, setNodeSizeScale] = useState(1)
  const [labelFontScale, setLabelFontScale] = useState(1)
  const [xAxisScale, setXAxisScale] = useState(2)
  const [weightPrecision, setWeightPrecision] = useState(4)
  // Timeline node shape (circle/diamond).
  // Timeline: By Citation layer controls
  const [tlCitationThreshold, setTlCitationThreshold] = useState(0)
  const [tlCitationFontScale, setTlCitationFontScale] = useState(1)
  const [tlCitationNodeScale, setTlCitationNodeScale] = useState(1)
  // Timeline: By Degree layer controls (keyword mode only)
  const [tlDegreeNodeScale, setTlDegreeNodeScale] = useState(1)
  // Timeline row height + link filter (CiteSpace "Timeline View Controls").
  const [rowSpan, setRowSpan] = useState(64)
  const [linkFilter, setLinkFilter] = useState(0)
  // Cluster & link label controls (CiteSpace "Cluster Labels" + "Link Labels").
  const [clusterLabelFontSize, setClusterLabelFontSize] = useState(12)
  const [clusterLabelMaxLength, setClusterLabelMaxLength] = useState(30)
  const [showLinkLabels, setShowLinkLabels] = useState(false)
  const [showLinkStrengths, setShowLinkStrengths] = useState(false)

  // CiteSpace engine params (cluster + timeline), display-only label threshold,
  // data-table node visibility, and dock open state.
  const [citespace, setCitespace] = useState<CiteSpaceParams>({
    selection_mode: 'g_index', g_index_k: 25, clustering_algorithm: 'louvain',
    top_n: 50, top_n_percent: 10, years_per_slice: 1,
    threshold_c: 1, threshold_cc: 1, threshold_ccv: 0,
    link_strength: 'cosine', pruning: 'pathfinder', label_algorithm: 'llr', max_nodes: 200,
  })
  // Term sources (CiteSpace: Title / Abstract / Author Keywords (DE) / Keywords Plus (ID)).
  // Default all selected; all keyword-network computation is based on the checked set.
  const [termSources, setTermSources] = useState<Array<'title' | 'abstract' | 'author_keywords' | 'keywords_plus' | 'noun_phrases'>>(
    ['title']
  )
  const [labelThreshold, setLabelThreshold] = useState(0)
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set())
  const [dataTableOpen, setDataTableOpen] = useState(false)
  const updateCitespace = useCallback((patch: Partial<CiteSpaceParams>) => {
    setCitespace(prev => ({ ...prev, ...patch }))
  }, [])

  // Loading and error states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Data states
  const [networkData, setNetworkData] = useState<NetworkVisualizationData | null>(null)
  const [timezoneData, setTimezoneData] = useState<TimezoneVisualizationData | null>(null)
  const [burstData, setBurstData] = useState<BurstDetectionData | null>(null)
  const [wordCloudData, setWordCloudData] = useState<WordCloudVisualizationData | null>(null)
  const [clusterData, setClusterData] = useState<ClusterVisualizationData | null>(null)
  const [timelineData, setTimelineData] = useState<TimelineVisualizationData | null>(null)
  const [heatmapData, setHeatmapData] = useState<HeatmapVisualizationData | null>(null)
  
  // Get current visualization type
  const currentVizType = useMemo((): VisualizationType => {
    if (chartCategory === 'network') return networkType
    return chartCategory
  }, [chartCategory, networkType])
  
  // Load visualization data
  const loadVisualization = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      let response
      
      switch (currentVizType) {
        case 'co-author':
          response = await biblioApi.getCoAuthorNetwork({
            library_id: library.id,
            filters,
            min_weight: minWeight,
            max_nodes: maxNodes
          })
          if (response.success && response.data) {
            setNetworkData(response.data)
          }
          break
          
        case 'co-institution':
          response = await biblioApi.getCoInstitutionNetwork({
            library_id: library.id,
            filters,
            min_weight: minWeight,
            max_nodes: maxNodes
          })
          if (response.success && response.data) {
            setNetworkData(response.data)
          }
          break
          
        case 'co-country':
          response = await biblioApi.getCoCountryNetwork({
            library_id: library.id,
            filters,
            min_weight: minWeight,
            max_nodes: maxNodes
          })
          if (response.success && response.data) {
            setNetworkData(response.data)
          }
          break
          
        case 'keyword-cooccur':
          response = await biblioApi.getKeywordCooccurrenceNetwork({
            library_id: library.id,
            filters,
            min_weight: minWeight,
            max_nodes: maxNodes
          })
          if (response.success && response.data) {
            setNetworkData(response.data)
          }
          break
          
        case 'timezone':
          response = await biblioApi.getTimezoneView({
            library_id: library.id,
            filters,
            time_slice: timeSlice,
            top_n: topN
          })
          if (response.success && response.data) {
            setTimezoneData(response.data)
          }
          break
          
        case 'burst':
          response = await biblioApi.getBurstDetection({
            library_id: library.id,
            filters,
            burst_type: burstType,
            alpha: burstAlpha,
            gamma: burstGamma,
            min_frequency: burstMinFreq,
          })
          if (response.success && response.data) {
            setBurstData(response.data)
          }
          break

        case 'wordcloud':
          response = await biblioApi.getWordCloudVisualization({
            library_id: library.id,
            filters,
            source: wordCloudSource,
            max_words: wordCloudMaxItems
          })
          if (response.success && response.data) {
            setWordCloudData(response.data)
          }
          break

        case 'cluster':
          response = await biblioApi.getClusterView({
            library_id: library.id,
            filters,
            cluster_by: clusterBy,
            citespace: { ...citespace, node_types: nodeTypes, term_sources: nodeTypes.includes('keyword') ? termSources : undefined }
          })
          if (response.success && response.data) {
            setClusterData(response.data)
          }
          break

        case 'timeline':
          // time slicing is controlled by citespace.years_per_slice; the legacy
          // time_slice/top_n fields are ignored by the timeline endpoint
          response = await biblioApi.getTimelineView({
            library_id: library.id,
            filters,
            citespace: { ...citespace, node_types: nodeTypes, term_sources: nodeTypes.includes('keyword') ? termSources : undefined }
          })
          if (response.success && response.data) {
            setTimelineData(response.data)
          }
          break

        case 'heatmap':
          // Same node type / term sources / engine params as the cluster view,
          // so the density landscape is consistent with cluster & timeline.
          response = await biblioApi.getHeatmapView({
            library_id: library.id,
            filters,
            bandwidth: heatmapBandwidth,
            cluster_by: clusterBy,
            citespace: { ...citespace, node_types: nodeTypes, term_sources: nodeTypes.includes('keyword') ? termSources : undefined }
          })
          if (response.success && response.data) {
            setHeatmapData(response.data)
          }
          break
      }
      
      if (response && !response.success) {
        setError(response.error || t('biblio.loadFailed'))
      }
    } catch (err: any) {
      console.error('Visualization error:', err)
      // Provide more helpful error messages
      if (err?.message?.includes('Network Error')) {
        setError(t('common.networkError') || '网络错误，请确保后端服务已启动')
      } else {
        setError(err?.message || t('biblio.loadFailed'))
      }
    }
    
    setLoading(false)
  }, [library.id, currentVizType, filters, minWeight, maxNodes, burstType, burstAlpha, burstGamma, burstMinFreq, timeSlice, topN, wordCloudSource, wordCloudMaxItems, nodeTypes, heatmapBandwidth, citespace, termSources, t])

  // Use JSON.stringify to ensure deep comparison of filters object
  const filtersKey = JSON.stringify(filters)
  const citespaceKey = JSON.stringify(citespace)
  const nodeTypesKey = JSON.stringify(nodeTypes)
  const termSourcesKey = JSON.stringify(termSources)

  // Trigger reload when any dependency changes
  useEffect(() => {
    loadVisualization()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.id, currentVizType, filtersKey, minWeight, maxNodes, burstType, burstAlpha, burstGamma, burstMinFreq, timeSlice, topN, wordCloudSource, wordCloudMaxItems, nodeTypesKey, heatmapBandwidth, citespaceKey, termSourcesKey])

  // Reset data-table node visibility whenever the active chart / node type changes.
  useEffect(() => {
    setHiddenNodeIds(new Set())
  }, [currentVizType, nodeTypesKey, library.id])
  
  // AI cluster naming: one joint LLM call for all clusters of the active view;
  // API preferred when enabled, local Ollama otherwise (app-wide provider rule).
  const handleAiNameClusters = async () => {
    const viewData = chartCategory === 'cluster' ? clusterData : timelineData
    const clusters = viewData?.clusters ?? []
    if (!clusters.length) return
    setAiNaming(true)
    try {
      const res = await biblioApi.generateLlmClusterLabels({
        clusters: clusters.map((c: any) => ({
          id: c.id, size: c.size, top_terms: c.top_terms ?? String(c.label || '').split(',').map((x: string) => x.trim()),
        })),
        language: i18n.language === 'zh' ? 'zh' : 'en',
        ollama_url: settings.ollamaUrl || undefined,
        ollama_model: settings.ollamaModel || undefined,
        openai_base_url: settings.openaiApiEnabled ? settings.openaiApiBaseUrl : undefined,
        openai_api_key: settings.openaiApiEnabled ? settings.openaiApiKey : undefined,
        openai_model: settings.openaiApiEnabled ? settings.openaiApiModel : undefined,
        use_openai_first: settings.openaiApiEnabled,
      })
      const labels = res.data?.labels
      if (res.success && labels) {
        const rename = (cs: any[]) => cs.map(c => ({ ...c, label: labels[String(c.id)] ?? c.label }))
        if (chartCategory === 'cluster' && clusterData) {
          setClusterData({ ...clusterData, clusters: rename(clusterData.clusters ?? []) })
        } else if (chartCategory === 'timeline' && timelineData) {
          setTimelineData({ ...timelineData, clusters: rename(timelineData.clusters ?? []) })
        }
      } else {
        setError(res.error || t('biblio.aiNameFailed'))
      }
    } catch (err: any) {
      setError(err?.message || t('biblio.aiNameFailed'))
    }
    setAiNaming(false)
  }

  // Handle tab change (hybrid engine supports reference in cluster view too now)
  const handleTabChange = (_: React.SyntheticEvent, newValue: ChartCategory) => {
    setChartCategory(newValue)
  }
  
  // Export SVG
  const handleExportSVG = useCallback(() => {
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    // Get the content group's bounding box to capture all content
    const gElement = svg.querySelector('g')
    if (!gElement) return
    
    // Get the bounding box of all content
    const bbox = gElement.getBBox()
    const padding = 60
    const width = bbox.width + padding * 2
    const height = bbox.height + padding * 2
    
    // Clone SVG to preserve the content
    const svgClone = svg.cloneNode(true) as SVGSVGElement
    
    // Set viewBox to capture all content
    svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`)
    svgClone.setAttribute('width', String(width))
    svgClone.setAttribute('height', String(height))
    
    // Remove zoom transform from the cloned SVG
    const clonedG = svgClone.querySelector('g')
    if (clonedG) {
      clonedG.removeAttribute('transform')
    }
    
    // Add white background as first element
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bgRect.setAttribute('x', String(bbox.x - padding))
    bgRect.setAttribute('y', String(bbox.y - padding))
    bgRect.setAttribute('width', String(width))
    bgRect.setAttribute('height', String(height))
    bgRect.setAttribute('fill', '#ffffff')
    svgClone.insertBefore(bgRect, svgClone.firstChild)
    
    // Serialize the cloned SVG
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgClone)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `biblio-${currentVizType}-chart.svg`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [currentVizType])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    try {
      // Get the content group's bounding box to capture all content
      const gElement = svg.querySelector('g')
      if (!gElement) return
      
      // Get the bounding box of all content
      const bbox = gElement.getBBox()
      const padding = 60
      const width = bbox.width + padding * 2
      const height = bbox.height + padding * 2
      
      // Clone SVG to preserve the content
      const svgClone = svg.cloneNode(true) as SVGSVGElement
      
      // Set viewBox to capture all content
      svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`)
      svgClone.setAttribute('width', String(width))
      svgClone.setAttribute('height', String(height))
      
      // Remove zoom transform from the cloned SVG
      const clonedG = svgClone.querySelector('g')
      if (clonedG) {
        clonedG.removeAttribute('transform')
      }
      
      // Add white background as first element
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bgRect.setAttribute('x', String(bbox.x - padding))
      bgRect.setAttribute('y', String(bbox.y - padding))
      bgRect.setAttribute('width', String(width))
      bgRect.setAttribute('height', String(height))
      bgRect.setAttribute('fill', '#ffffff')
      svgClone.insertBefore(bgRect, svgClone.firstChild)
      
      // Convert to data URL
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgClone)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)
      
      // Create image and canvas with high resolution
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = 2 // Retina resolution (3× was too slow for complex charts)
        canvas.width = width * scale
        canvas.height = height * scale
        
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(svgUrl)
          return
        }
        
        ctx.scale(scale, scale)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        
        URL.revokeObjectURL(svgUrl)
      
      canvas.toBlob((blob) => {
        if (!blob) return
        
          const pngUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
          link.href = pngUrl
        link.download = `biblio-${currentVizType}-chart.png`
        link.click()
        
          URL.revokeObjectURL(pngUrl)
        }, 'image/png', 1.0)
      }
      
      img.onerror = () => {
        console.error('Failed to load SVG for PNG export')
        URL.revokeObjectURL(svgUrl)
      }
      
      img.src = svgUrl
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [currentVizType])
  
  // Render visualization
  const renderVisualization = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      )
    }
    
    if (error) {
      return (
        <Box 
          sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            gap: 2,
            p: 4
          }}
        >
          <Alert severity="error" sx={{ maxWidth: 500 }}>{error}</Alert>
        </Box>
      )
    }
    
    // Check if we have data
    const hasData = (() => {
      switch (chartCategory) {
        case 'network': return networkData && networkData.nodes.length > 0
        case 'timezone': return timezoneData && timezoneData.slices.length > 0
        case 'burst': return burstData && burstData.bursts.length > 0
        case 'wordcloud': return (wordCloudData?.words?.length ?? 0) > 0
        case 'cluster': return clusterData && clusterData.nodes.length > 0
        case 'timeline': return timelineData && timelineData.nodes.length > 0
        case 'heatmap': return heatmapData && heatmapData.points.length > 0
        default: return false
      }
    })()
    
    if (!hasData) {
      return (
        <Box
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            color: 'text.secondary',
            flexDirection: 'column',
            gap: 2,
            p: 4
          }}
        >
          <InsertChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            {t('biblio.noData')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('biblio.uploadFirst')}
          </Typography>
        </Box>
      )
    }
    
    switch (chartCategory) {
      case 'network':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <NetworkGraph
              data={networkData}
              title={t(`biblio.vizType.${networkType}`)}
              colorScheme={colorScheme}
              hiddenNodeIds={hiddenNodeIds}
              nodeScale={nodeSizeScale}
              fontScaleMul={labelFontScale}
            />
          </Box>
        )
        
      case 'timezone':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <TimezoneView 
              data={timezoneData}
              colorScheme={colorScheme}
            />
          </Box>
        )
        
      case 'burst':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <BurstChart 
              data={burstData}
              colorScheme={colorScheme}
              topN={burstTopN}
              sortBy={burstSortBy}
            />
          </Box>
        )

      case 'wordcloud':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <WordCloud
              data={wordCloudData!.words}
              maxItems={wordCloudMaxItems}
              colormap={wordCloudColormap}
            />
          </Box>
        )

      case 'cluster':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <ClusterView data={clusterData} colorScheme={colorScheme} showHulls={clusterShowHulls} hullThreshold={clusterHullThreshold} termLabelMetric={termLabelMetric} refLabelMetric={refLabelMetric} labelThreshold={labelThreshold} showFrequency={showFrequency} nodeScale={nodeSizeScale} fontScaleMul={labelFontScale} hiddenNodeIds={hiddenNodeIds} showLinkLabels={showLinkLabels} showLinkStrengths={showLinkStrengths} clusterLabelFontSize={clusterLabelFontSize} clusterLabelMaxLength={clusterLabelMaxLength} />
          </Box>
        )

      case 'timeline':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <TimelineView data={timelineData} colorScheme={colorScheme} xAxisScale={xAxisScale} weightPrecision={weightPrecision}
              citationThreshold={tlCitationThreshold} citationFontScale={tlCitationFontScale} nodeScale={tlCitationNodeScale}
              citationNodeScale={tlCitationNodeScale} refLabelMetric={refLabelMetric}
              showDiamondLabels={nodeTypes.includes('keyword')} labelThreshold={labelThreshold} fontScaleMul={labelFontScale} diamondNodeScale={tlDegreeNodeScale}
              termLabelMetric={termLabelMetric}
              hiddenNodeIds={hiddenNodeIds} rowSpan={rowSpan} linkFilter={linkFilter} clusterLabelFontSize={clusterLabelFontSize} clusterLabelMaxLength={clusterLabelMaxLength}
              showFrequency={showFrequency} />
          </Box>
        )

      case 'heatmap':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <HeatmapView data={heatmapData} colorScheme={heatmapColorScheme} nodeScale={nodeSizeScale} labelThreshold={heatmapLabelThreshold} />
          </Box>
        )

      default:
        return null
    }
  }
  
  // ---- Data-table dock (node-based charts only) ----
  const isNodeChart = chartCategory === 'network' || chartCategory === 'cluster' || chartCategory === 'timeline'
  const showCiteSpaceParams = chartCategory === 'cluster' || chartCategory === 'timeline'

  const tableVariableLabel = useMemo(() => {
    const key = chartCategory === 'network'
      ? (networkType === 'co-author' ? 'author'
        : networkType === 'co-institution' ? 'institution'
        : networkType === 'co-country' ? 'country' : 'keyword')
      : clusterBy
    return t(`biblio.${key}`)
  }, [chartCategory, networkType, clusterBy, t])

  const dataTableRows: DataTableRow[] = useMemo(() => {
    if (chartCategory === 'network' && networkData) {
      return networkData.nodes.map(n => ({
        id: n.id, label: n.label, frequency: n.frequency,
        centrality: n.centrality, year: n.year ?? null, cluster: n.cluster,
      }))
    }
    if (chartCategory === 'cluster' && clusterData) {
      return clusterData.nodes.map(n => ({
        id: n.id, label: n.label, frequency: n.frequency,
        centrality: n.centrality, year: n.year ?? null, cluster: n.cluster,
      }))
    }
    if (chartCategory === 'timeline' && timelineData) {
      return timelineData.nodes.map(n => ({
        id: n.id, label: n.label, frequency: n.frequency ?? 0,
        centrality: n.centrality ?? 0, year: n.year ?? null, cluster: n.cluster,
      }))
    }
    return []
  }, [chartCategory, networkData, clusterData, timelineData])

  const toggleNode = useCallback((id: string) => {
    setHiddenNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const setAllNodes = useCallback((visible: boolean) => {
    setHiddenNodeIds(visible ? new Set() : new Set(dataTableRows.map(r => r.id)))
  }, [dataTableRows])

  // Chart-specific tuning params — rendered inside the "参数设置" drawer (not the gray bar).
  const renderDrawerParams = () => {
    return (
      <Stack spacing={3}>
        {chartCategory === 'network' && (
          <Box>
            <DrawerSubLabel>{t('biblio.cs.section')}</DrawerSubLabel>
            <SliderGrid>
              <SliderParam label={t('biblio.minWeight')} value={minWeight}
                min={1} max={10} step={1} onChange={setMinWeight} />
              <SliderParam label={t('biblio.maxNodes')} value={maxNodes}
                min={10} max={300} step={10} onChange={setMaxNodes} />
              <SliderParam label={t('biblio.cs.nodeSize')} value={nodeSizeScale}
                min={0.3} max={3} step={0.1} format={v => v.toFixed(1)} onChange={setNodeSizeScale} />
              <SliderParam label={t('biblio.cs.fontSize')} value={labelFontScale}
                min={0.5} max={3} step={0.1} format={v => v.toFixed(1)} onChange={setLabelFontScale} />
            </SliderGrid>
          </Box>
        )}

        {chartCategory === 'wordcloud' && (
          <SliderParam label={t('wordFrequency.viz.maxWords')} value={wordCloudMaxItems}
            min={5} max={500} step={10} onChange={setWordCloudMaxItems} />
        )}

        {chartCategory === 'heatmap' && (
          <Box>
            <DrawerSubLabel>{t('biblio.vizType.heatmap')}</DrawerSubLabel>
            <SliderGrid>
              <SliderParam label={t('biblio.heatmapBandwidth')} value={heatmapBandwidth}
                min={0.05} max={2.0} step={0.05} format={v => v.toFixed(2)} onChange={setHeatmapBandwidth} />
              <SliderParam label={t('biblio.cs.nodeSize')} value={nodeSizeScale}
                min={0.3} max={3} step={0.1} format={v => v.toFixed(1)} onChange={setNodeSizeScale} />
              <SliderParam label={t('biblio.heatmapLabelThreshold')} value={heatmapLabelThreshold}
                min={0} max={20} step={1} onChange={setHeatmapLabelThreshold} />
            </SliderGrid>
          </Box>
        )}

        {chartCategory === 'burst' && (
          <Box>
            <DrawerSubLabel>{t('biblio.vizType.burst')}</DrawerSubLabel>
            <Stack spacing={2}>
              <SliderGrid>
                <SliderParam label={t('biblio.cs.burstAlpha')} value={burstAlpha}
                  min={0.1} max={3.0} step={0.1} format={v => v.toFixed(1)} onChange={setBurstAlpha} />
                <SliderParam label={t('biblio.cs.burstGamma')} value={burstGamma}
                  min={0.2} max={5.0} step={0.1} format={v => v.toFixed(1)} onChange={setBurstGamma} />
                <SliderParam label={t('biblio.cs.burstMinFreq')} value={burstMinFreq}
                  min={1} max={50} step={1} onChange={setBurstMinFreq} />
                <SliderParam label={t('biblio.cs.burstTopN')} value={burstTopN}
                  min={5} max={100} step={5} onChange={setBurstTopN} />
              </SliderGrid>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('biblio.cs.burstSortBy')}</InputLabel>
                <Select value={burstSortBy} label={t('biblio.cs.burstSortBy')}
                  onChange={(e) => setBurstSortBy(e.target.value as 'strength' | 'begin')}>
                  <MenuItem value="strength">{t('biblio.cs.sortByStrength')}</MenuItem>
                  <MenuItem value="begin">{t('biblio.cs.sortByBegin')}</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Box>
        )}

        {chartCategory === 'timezone' && (
          <SliderParam label={t('biblio.topNItems')} value={topN}
            min={5} max={50} step={5} onChange={setTopN} />
        )}

        {/* CiteSpace-derived network/cluster params (cluster + timeline) */}
        {showCiteSpaceParams && (
          <CiteSpaceParamsPanel
            params={citespace}
            onChange={updateCitespace}
            labelThreshold={labelThreshold}
            onLabelThresholdChange={setLabelThreshold}
            showFrequency={showFrequency}
            onShowFrequencyChange={setShowFrequency}
            clusterLabelFontSize={clusterLabelFontSize}
            onClusterLabelFontSizeChange={setClusterLabelFontSize}
            clusterLabelMaxLength={clusterLabelMaxLength}
            onClusterLabelMaxLengthChange={setClusterLabelMaxLength}
            showLinkLabels={showLinkLabels}
            onShowLinkLabelsChange={setShowLinkLabels}
            showLinkStrengths={showLinkStrengths}
            onShowLinkStrengthsChange={setShowLinkStrengths}
            termLabelMetric={termLabelMetric}
            onTermLabelMetricChange={setTermLabelMetric}
            refLabelMetric={refLabelMetric}
            onRefLabelMetricChange={setRefLabelMetric}
          />
        )}

        {/* Cluster: node/font size sliders + hull toggle */}
        {chartCategory === 'cluster' && (
          <Stack spacing={3}>
            <SliderGrid>
              <SliderParam label={t('biblio.cs.nodeSize')} value={nodeSizeScale}
                min={0.3} max={3} step={0.1} format={v => v.toFixed(1)} onChange={setNodeSizeScale} />
              <SliderParam label={t('biblio.cs.fontSize')} value={labelFontScale}
                min={0.5} max={3} step={0.1} format={v => v.toFixed(1)} onChange={setLabelFontScale} />
            </SliderGrid>
            <Stack spacing={1}>
              <FormControlLabel
                control={<Switch size="small" checked={clusterShowHulls} onChange={(e) => setClusterShowHulls(e.target.checked)} />}
                label={t('biblio.showHulls')}
                sx={{ ml: 0.25, '& .MuiFormControlLabel-label': { fontSize: '0.8125rem' } }}
              />
              {clusterShowHulls && (
                <SliderParam label={t('biblio.hullThreshold')} value={clusterHullThreshold}
                  min={1} max={10} step={1} onChange={setClusterHullThreshold} />
              )}
            </Stack>
          </Stack>
        )}

        {/* Timeline: layout params + citation/degree layers */}
        {chartCategory === 'timeline' && (
          <Stack spacing={3}>
            {/* 4 layout params as 2×2 slider grid */}
            <SliderGrid>
              <SliderParam label={t('biblio.cs.rowSpan')} value={rowSpan}
                min={32} max={150} step={8} format={v => String(v)} onChange={setRowSpan} />
              <SliderParam label={t('biblio.cs.linkFilter')} value={linkFilter}
                min={0} max={1} step={0.05} format={v => v.toFixed(2)} onChange={setLinkFilter} />
              <SliderParam label={t('biblio.xAxisScale')} value={xAxisScale}
                min={0.5} max={5} step={0.5} format={v => v.toFixed(1)} onChange={setXAxisScale} />
              <SliderParam label={t('biblio.weightPrecision')} value={weightPrecision}
                min={0} max={6} step={1} format={v => String(v)} onChange={setWeightPrecision} />
            </SliderGrid>

            {/* By Citation: 3-col slider grid */}
            <Box>
              <DrawerSubLabel>{t('biblio.cs.byCitation')}</DrawerSubLabel>
              <SliderGrid columns={3}>
                <SliderParam label={t('biblio.cs.labelThreshold')} value={tlCitationThreshold}
                  min={0} max={10} step={0.5} onChange={setTlCitationThreshold} />
                <SliderParam label={t('biblio.cs.fontSize')} value={tlCitationFontScale}
                  min={0.5} max={2.5} step={0.1} format={v => v.toFixed(1)} onChange={setTlCitationFontScale} />
                <SliderParam label={t('biblio.cs.nodeSize')} value={tlCitationNodeScale}
                  min={0.3} max={3} step={0.1} format={v => v.toFixed(1)} onChange={setTlCitationNodeScale} />
              </SliderGrid>
            </Box>

            {/* By Degree: keyword mode only */}
            {clusterBy === 'keyword' && (
              <Box>
                <DrawerSubLabel>{t('biblio.cs.byDegree')}</DrawerSubLabel>
                <SliderGrid columns={3}>
                  <SliderParam label={t('biblio.cs.labelThreshold')} value={labelThreshold}
                    min={0} max={20} step={1} onChange={setLabelThreshold} />
                  <SliderParam label={t('biblio.cs.fontSize')} value={labelFontScale}
                    min={0.5} max={2.5} step={0.1} format={v => v.toFixed(1)} onChange={setLabelFontScale} />
                  <SliderParam label={t('biblio.cs.nodeSize')} value={tlDegreeNodeScale}
                    min={0.5} max={3} step={0.1} format={v => v.toFixed(1)} onChange={setTlDegreeNodeScale} />
                </SliderGrid>
              </Box>
            )}
          </Stack>
        )}
      </Stack>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Chart Type Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={chartCategory}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="network" icon={<BubbleChartIcon />} label={t('biblio.vizType.network')} iconPosition="start" />
          <Tab value="cluster" icon={<AccountTreeIcon />} label={t('biblio.vizType.cluster')} iconPosition="start" />
          <Tab value="timeline" icon={<TimelineIcon />} label={t('biblio.vizType.timeline')} iconPosition="start" />
          <Tab value="timezone" icon={<ViewTimelineIcon />} label={t('biblio.vizType.timezone')} iconPosition="start" />
          <Tab value="burst" icon={<TrendingUpIcon />} label={t('biblio.vizType.burst')} iconPosition="start" />
          <Tab value="heatmap" icon={<GradientIcon />} label={t('biblio.vizType.heatmap')} iconPosition="start" />
          <Tab value="wordcloud" icon={<CloudIcon />} label={t('biblio.vizType.wordcloud')} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Chart Settings */}
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
          {/* === Gray bar holds ONLY content-defining meta-params + color + downloads. ===
              All numeric / tuning params live in the "参数设置" drawer (renderDrawerParams). */}

          {/* Network Type Selector (meta) */}
          {chartCategory === 'network' && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>{t('biblio.networkType')}</InputLabel>
              <Select
                value={networkType}
                label={t('biblio.networkType')}
                onChange={(e) => setNetworkType(e.target.value as typeof networkType)}
              >
                <MenuItem value="keyword-cooccur">{t('biblio.vizType.keyword-cooccur')}</MenuItem>
                <MenuItem value="co-author">{t('biblio.vizType.co-author')}</MenuItem>
                <MenuItem value="co-institution">{t('biblio.vizType.co-institution')}</MenuItem>
                <MenuItem value="co-country">{t('biblio.vizType.co-country')}</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Burst Type Selector (meta — defines what is analyzed). All numeric
              params + sort live in the "参数设置" drawer, consistent with timeline. */}
          {chartCategory === 'burst' && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{t('biblio.burstType')}</InputLabel>
              <Select
                value={burstType}
                label={t('biblio.burstType')}
                onChange={(e) => setBurstType(e.target.value as 'keyword' | 'author')}
              >
                <MenuItem value="keyword">{t('biblio.keyword')}</MenuItem>
                <MenuItem value="author">{t('biblio.author')}</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Word Cloud data source (meta) */}
          {chartCategory === 'wordcloud' && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{t('biblio.wordCloudSource')}</InputLabel>
              <Select
                value={wordCloudSource}
                label={t('biblio.wordCloudSource')}
                onChange={(e) => setWordCloudSource(e.target.value as 'title' | 'abstract')}
              >
                <MenuItem value="title">{t('biblio.wordCloudSourceTitle')}</MenuItem>
                <MenuItem value="abstract">{t('biblio.wordCloudSourceAbstract')}</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* AI joint cluster naming (Ollama / API per app-wide provider rule) */}
          {(chartCategory === 'cluster' || chartCategory === 'timeline') && (
            <Tooltip title={(settings.ollamaConnected || settings.openaiApiEnabled)
              ? t('biblio.aiNameClusters') : t('biblio.aiNameNeedsProvider')}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleAiNameClusters}
                  disabled={aiNaming || !(settings.ollamaConnected || settings.openaiApiEnabled)
                    || !((chartCategory === 'cluster' ? clusterData : timelineData)?.clusters?.length)}
                >
                  {aiNaming ? <CircularProgress size={18} /> : <AutoAwesomeIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          )}

          {/* Node types meta-param: MULTI-select, shared by cluster + timeline.
              Multiple types build one hybrid network (terms = diamonds,
              references = circles) with an independent per-type node budget. */}
          {(chartCategory === 'cluster' || chartCategory === 'timeline') && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>{t('biblio.nodeType')}</InputLabel>
              <Select
                multiple
                value={nodeTypes}
                input={<OutlinedInput label={t('biblio.nodeType')} />}
                onChange={(e) => {
                  const v = e.target.value as typeof nodeTypes
                  if (v.length) setNodeTypes(v)  // keep at least one type
                }}
                renderValue={(sel) => (sel as string[])
                  .map(s => t(`biblio.clusterBy${s.charAt(0).toUpperCase() + s.slice(1)}`)).join(', ')}
              >
                {(['keyword', 'reference', 'author', 'institution', 'country'] as const).map(s => (
                  <MenuItem key={s} value={s}>
                    <Checkbox size="small" checked={nodeTypes.indexOf(s) > -1} />
                    <ListItemText primary={t(`biblio.clusterBy${s.charAt(0).toUpperCase() + s.slice(1)}`)} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Term Source (meta — defines what feeds keyword-term extraction).
              Shown for keyword node type on cluster/timeline. */}
          {(chartCategory === 'cluster' || chartCategory === 'timeline') && nodeTypes.includes('keyword') && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>{t('biblio.termSource')}</InputLabel>
              <Select
                multiple
                value={termSources}
                input={<OutlinedInput label={t('biblio.termSource')} />}
                onChange={(e) => {
                  const v = e.target.value as typeof termSources
                  if (v.length) setTermSources(v)  // keep at least one source
                }}
                renderValue={(sel) => (sel as string[]).map(s => t(`biblio.termSrc.${s}`)).join(', ')}
              >
                {(['title', 'abstract', 'author_keywords', 'keywords_plus', 'noun_phrases'] as const).map(s => (
                  <MenuItem key={s} value={s}>
                    <Checkbox size="small" checked={termSources.indexOf(s) > -1} />
                    <ListItemText primary={t(`biblio.termSrc.${s}`)} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Heatmap color scale (color) */}
          {chartCategory === 'heatmap' && (
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>{t('biblio.heatmapColorScale')}</InputLabel>
              <Select
                value={heatmapColorScheme}
                label={t('biblio.heatmapColorScale')}
                onChange={(e) => setHeatmapColorScheme(e.target.value)}
              >
                <MenuItem value="turbo">Turbo</MenuItem>
                <MenuItem value="blue">Blue</MenuItem>
                <MenuItem value="green">Green</MenuItem>
                <MenuItem value="purple">Purple</MenuItem>
                <MenuItem value="orange">Orange</MenuItem>
                <MenuItem value="red">Red</MenuItem>
                <MenuItem value="teal">Teal</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Color Scheme: hidden for heatmap (has own selector) */}
          {chartCategory !== 'heatmap' && <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('wordFrequency.viz.colorScheme')}</InputLabel>
            <Select
              value={chartCategory === 'wordcloud' ? wordCloudColormap : colorScheme}
              label={t('wordFrequency.viz.colorScheme')}
              onChange={(e) => {
                if (chartCategory === 'wordcloud') {
                  setWordCloudColormap(e.target.value as typeof wordCloudColormap)
                } else {
                  setColorScheme(e.target.value)
                }
              }}
            >
              {chartCategory === 'wordcloud' ? (
                ['viridis', 'inferno', 'plasma', 'autumn', 'winter', 'rainbow', 'ocean', 'forest', 'sunset'].map(scheme => (
                  <MenuItem key={scheme} value={scheme}>
                    <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{scheme}</Typography>
                  </MenuItem>
                ))
              ) : (
                COLOR_SCHEMES.map(scheme => (
                  <MenuItem key={scheme.value} value={scheme.value}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box 
                        sx={{ 
                          width: 16, 
                          height: 16, 
                          borderRadius: 0.5,
                          background: getColorFromScheme(scheme.value)
                        }} 
                      />
                      <span>{scheme.label}</span>
                    </Stack>
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>}
        </Stack>

        {(
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
      
      {/* Stage: params panel (inline Collapse) + chart card. overflow:auto lets the column
          scroll when params are expanded so neither section is clipped. */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto', px: 1, pt: 1, gap: 1 }}>
        <Box sx={{ flexShrink: 0 }}>
          <FilterPanel
            libraryId={library.id}
            filters={filters}
            onFiltersChange={setFilters}
            title={t('biblio.paramsSettings')}
          >
            {renderDrawerParams()}
          </FilterPanel>
        </Box>

        {/* Chart card — bordered, rounded, fills remaining space; minHeight prevents collapse */}
        <Box
          ref={chartContainerRef}
          sx={{
            flex: 1,
            minHeight: 260,
            width: '100%',
            overflow: 'auto',
            p: 1,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          {renderVisualization()}
        </Box>
      </Box>

      {/* Bottom data-table dock — node-based charts only; aligned inset, flush bottom */}
      {isNodeChart && (
        <Box sx={{ px: 1, pb: 1, pt: 1, flexShrink: 0 }}>
          <DataTableDock
            rows={dataTableRows}
            variableLabel={tableVariableLabel}
            hiddenNodeIds={hiddenNodeIds}
            onToggleNode={toggleNode}
            onSetAll={setAllNodes}
            open={dataTableOpen}
            onToggleOpen={() => setDataTableOpen(o => !o)}
          />
        </Box>
      )}
    </Box>
  )
}

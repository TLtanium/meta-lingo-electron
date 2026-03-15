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
  FormControlLabel
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
import MapIcon from '@mui/icons-material/Map'
import TerrainIcon from '@mui/icons-material/Terrain'
import GradientIcon from '@mui/icons-material/Gradient'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type {
  BiblioLibrary,
  BiblioFilter,
  NetworkVisualizationData,
  ClusterVisualizationData,
  TimelineVisualizationData,
  TimezoneVisualizationData,
  BurstDetectionData,
  LandscapeVisualizationData,
  DualMapVisualizationData,
  HeatmapVisualizationData,
  WordCloudVisualizationData
} from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import FilterPanel from './FilterPanel'
import NetworkGraph from './components/d3/NetworkGraph'
import TimezoneView from './components/d3/TimezoneView'
import BurstChart from './components/d3/BurstChart'
import WordCloud from './components/d3/WordCloud'
import ClusterView from './components/d3/ClusterView'
import TimelineView from './components/d3/TimelineView'
import BipartiteChordDiagram from './components/d3/BipartiteChordDiagram'
import HeatmapView from './components/d3/HeatmapView'
import RidgelinePlot from './components/d3/RidgelinePlot'

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
  | 'citation-chord'
  | 'landscape'
  | 'heatmap'

type ChartCategory = 'network' | 'timezone' | 'burst' | 'wordcloud' | 'cluster' | 'timeline' | 'citation-chord' | 'landscape' | 'heatmap'

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
  const { t } = useTranslation()
  const chartContainerRef = useRef<HTMLDivElement>(null)
  
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
  const [timeSlice, _setTimeSlice] = useState(1)
  const [topN, setTopN] = useState(10)
  const [wordCloudSource, setWordCloudSource] = useState<'title' | 'abstract'>('abstract')
  const [wordCloudMaxItems, setWordCloudMaxItems] = useState(100)
  const [wordCloudColormap, setWordCloudColormap] = useState<'viridis' | 'inferno' | 'plasma' | 'autumn' | 'winter' | 'rainbow' | 'ocean' | 'forest' | 'sunset'>('viridis')
  const [clusterBy, setClusterBy] = useState<'keyword' | 'author' | 'institution' | 'country'>('keyword')
  const [heatmapBandwidth, setHeatmapBandwidth] = useState(0.15)
  const [heatmapColorScheme, setHeatmapColorScheme] = useState('turbo')
  const [clusterShowHulls, setClusterShowHulls] = useState(true)
  const [clusterHullThreshold, setClusterHullThreshold] = useState(2)
  const [chordArcAngle, setChordArcAngle] = useState(90)
  const [xAxisScale, setXAxisScale] = useState(1)
  const [weightPrecision, setWeightPrecision] = useState(4)

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
  const [landscapeData, setLandscapeData] = useState<LandscapeVisualizationData | null>(null)
  const [dualMapData, setDualMapData] = useState<DualMapVisualizationData | null>(null)
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
            burst_type: burstType
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
            cluster_by: clusterBy
          })
          if (response.success && response.data) {
            setClusterData(response.data)
          }
          break

        case 'timeline':
          response = await biblioApi.getTimelineView({
            library_id: library.id,
            filters,
            time_slice: timeSlice,
            top_n: topN
          })
          if (response.success && response.data) {
            setTimelineData(response.data)
          }
          break

        case 'landscape':
          response = await biblioApi.getLandscapeView({
            library_id: library.id,
            filters
          })
          if (response.success && response.data) {
            setLandscapeData(response.data)
          }
          break

        case 'citation-chord':
          response = await biblioApi.getDualMapOverlay({
            library_id: library.id,
            filters
          })
          if (response.success && response.data) {
            setDualMapData(response.data)
          }
          break

        case 'heatmap':
          response = await biblioApi.getHeatmapView({
            library_id: library.id,
            filters,
            bandwidth: heatmapBandwidth
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
  }, [library.id, currentVizType, filters, minWeight, maxNodes, burstType, timeSlice, topN, wordCloudSource, wordCloudMaxItems, clusterBy, heatmapBandwidth, t])
  
  // Use JSON.stringify to ensure deep comparison of filters object
  const filtersKey = JSON.stringify(filters)
  
  // Trigger reload when any dependency changes
  useEffect(() => {
    loadVisualization()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.id, currentVizType, filtersKey, minWeight, maxNodes, burstType, timeSlice, topN, wordCloudSource, wordCloudMaxItems, clusterBy, heatmapBandwidth])
  
  // Handle tab change
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
        const scale = 3 // High resolution
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
        case 'landscape': return landscapeData && landscapeData.points.length > 0
        case 'citation-chord': return dualMapData && (dualMapData.citing_nodes.length > 0 || dualMapData.cited_nodes.length > 0)
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
            <ClusterView data={clusterData} colorScheme={colorScheme} showHulls={clusterShowHulls} hullThreshold={clusterHullThreshold} />
          </Box>
        )

      case 'timeline':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <TimelineView data={timelineData} colorScheme={colorScheme} xAxisScale={xAxisScale} weightPrecision={weightPrecision} />
          </Box>
        )

      case 'landscape':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <RidgelinePlot data={landscapeData} colorScheme={colorScheme} xAxisScale={xAxisScale} />
          </Box>
        )

      case 'citation-chord':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <BipartiteChordDiagram data={dualMapData} colorScheme={colorScheme} arcAngle={chordArcAngle} />
          </Box>
        )

      case 'heatmap':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <HeatmapView data={heatmapData} colorScheme={heatmapColorScheme} />
          </Box>
        )

      default:
        return null
    }
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
          <Tab value="citation-chord" icon={<MapIcon />} label={t('biblio.vizType.citation-chord')} iconPosition="start" />
          <Tab value="landscape" icon={<TerrainIcon />} label={t('biblio.vizType.ridgeline')} iconPosition="start" />
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
          {/* Network Type Selector */}
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
          
          {/* Burst Type Selector */}
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

          {/* Word Cloud: data source, max words (same range as Word Frequency: 5–500, default 100), colormap */}
          {chartCategory === 'wordcloud' && (
            <>
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
              <NumberInput
                label={t('wordFrequency.viz.maxWords')}
                size="small"
                value={wordCloudMaxItems}
                onChange={setWordCloudMaxItems}
                min={5}
                max={500}
                step={10}
                integer
                defaultValue={100}
                sx={{ width: 180 }}
              />
            </>
          )}
          
          {/* Network Settings */}
          {chartCategory === 'network' && (
            <>
              <NumberInput
                label={t('biblio.minWeight')}
                size="small"
                value={minWeight}
                onChange={setMinWeight}
                min={1}
                max={10}
                step={1}
                integer
                defaultValue={1}
                sx={{ width: 130 }}
              />
              
              <NumberInput
                label={t('biblio.maxNodes')}
                size="small"
                value={maxNodes}
                onChange={setMaxNodes}
                min={10}
                max={300}
                step={10}
                integer
                defaultValue={100}
                sx={{ width: 130 }}
              />
            </>
          )}
          
          {/* Cluster Settings */}
          {chartCategory === 'cluster' && (
            <>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t('biblio.clusterBy')}</InputLabel>
                <Select
                  value={clusterBy}
                  label={t('biblio.clusterBy')}
                  onChange={(e) => setClusterBy(e.target.value as typeof clusterBy)}
                >
                  <MenuItem value="keyword">{t('biblio.clusterByKeyword')}</MenuItem>
                  <MenuItem value="author">{t('biblio.clusterByAuthor')}</MenuItem>
                  <MenuItem value="institution">{t('biblio.clusterByInstitution')}</MenuItem>
                  <MenuItem value="country">{t('biblio.clusterByCountry')}</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={clusterShowHulls}
                    onChange={(e) => setClusterShowHulls(e.target.checked)}
                  />
                }
                label={t('biblio.showHulls')}
                sx={{ ml: 1 }}
              />
              {clusterShowHulls && (
                <NumberInput
                  label={t('biblio.hullThreshold')}
                  size="small"
                  value={clusterHullThreshold}
                  onChange={setClusterHullThreshold}
                  min={1}
                  max={10}
                  step={1}
                  integer
                  defaultValue={2}
                  sx={{ width: 130 }}
                />
              )}
            </>
          )}

          {/* Heatmap Settings */}
          {chartCategory === 'heatmap' && (
            <>
              <NumberInput
                label={t('biblio.heatmapBandwidth')}
                size="small"
                value={heatmapBandwidth}
                onChange={setHeatmapBandwidth}
                min={0.05}
                max={2.0}
                step={0.05}
                defaultValue={0.15}
                sx={{ width: 150 }}
              />
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
            </>
          )}

          {/* Citation Chord Settings */}
          {chartCategory === 'citation-chord' && (
            <NumberInput
              label={t('biblio.arcAngle')}
              size="small"
              value={chordArcAngle}
              onChange={setChordArcAngle}
              min={30}
              max={90}
              step={5}
              integer
              defaultValue={90}
              sx={{ width: 140 }}
            />
          )}

          {/* X-axis Scale: for timeline and ridgeline */}
          {(chartCategory === 'timeline' || chartCategory === 'landscape') && (
            <NumberInput
              label={t('biblio.xAxisScale')}
              size="small"
              value={xAxisScale}
              onChange={setXAxisScale}
              min={0.5}
              max={5}
              step={0.5}
              defaultValue={1}
              sx={{ width: 130 }}
            />
          )}

          {/* Weight Precision: for timeline */}
          {chartCategory === 'timeline' && (
            <NumberInput
              label={t('biblio.weightPrecision')}
              size="small"
              value={weightPrecision}
              onChange={setWeightPrecision}
              min={0}
              max={6}
              step={1}
              integer
              defaultValue={4}
              sx={{ width: 130 }}
            />
          )}

          {/* Timezone Settings */}
          {chartCategory === 'timezone' && (
            <NumberInput
              label={t('biblio.topNItems')}
              size="small"
              value={topN}
              onChange={setTopN}
              min={5}
              max={50}
              step={5}
              integer
              defaultValue={10}
              sx={{ width: 130 }}
            />
          )}
          
          {/* Color Scheme: hidden for heatmap (has own selector) and burst (uses own fixed config) */}
          {chartCategory !== 'heatmap' && chartCategory !== 'burst' && <FormControl size="small" sx={{ minWidth: 150 }}>
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
      
      {/* Chart Container with Filter Panel overlay */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Filter Panel - positioned absolutely so it doesn't affect chart size */}
        <Box sx={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          <Box sx={{ pointerEvents: 'auto' }}>
            <FilterPanel
              libraryId={library.id}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </Box>
        </Box>

        {/* Chart Area - full size, independent of filter panel */}
        <Box 
          ref={chartContainerRef} 
          sx={{ 
            height: '100%', 
            width: '100%',
            overflow: 'auto', 
            p: 1,
            pt: 9  // Add top padding to avoid overlap with filter panel header (approximately 70px)
          }}
        >
          {renderVisualization()}
        </Box>
      </Box>
    </Box>
  )
}

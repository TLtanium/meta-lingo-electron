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
  Slider,
  Stack,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type { 
  BiblioLibrary, 
  BiblioFilter,
  NetworkVisualizationData,
  TimezoneVisualizationData,
  BurstDetectionData
} from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import FilterPanel from './FilterPanel'
import NetworkGraph from './components/d3/NetworkGraph'
import TimezoneView from './components/d3/TimezoneView'
import BurstChart from './components/d3/BurstChart'

type VisualizationType = 
  | 'co-author'
  | 'co-institution'
  | 'co-country'
  | 'keyword-cooccur'
  | 'timezone'
  | 'burst'

type ChartCategory = 'network' | 'timezone' | 'burst'

interface VisualizationPanelProps {
  library: BiblioLibrary
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'teal', label: 'Teal' }
]

// Helper to get a representative color from the scheme
function getColorFromScheme(scheme: string): string {
  const colors: Record<string, string> = {
    blue: '#2196f3',
    green: '#4caf50',
    purple: '#9c27b0',
    orange: '#ff9800',
    red: '#f44336',
    teal: '#009688'
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
  const [timeSlice, setTimeSlice] = useState(1)
  const [topN, setTopN] = useState(10)
  
  // Loading and error states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Data states
  const [networkData, setNetworkData] = useState<NetworkVisualizationData | null>(null)
  const [timezoneData, setTimezoneData] = useState<TimezoneVisualizationData | null>(null)
  const [burstData, setBurstData] = useState<BurstDetectionData | null>(null)
  
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
  }, [library.id, currentVizType, filters, minWeight, maxNodes, burstType, timeSlice, topN, t])
  
  // Use JSON.stringify to ensure deep comparison of filters object
  const filtersKey = JSON.stringify(filters)
  
  // Trigger reload when any dependency changes
  useEffect(() => {
    loadVisualization()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.id, currentVizType, filtersKey, minWeight, maxNodes, burstType, timeSlice, topN])
  
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
    const hasData = chartCategory === 'network' 
      ? networkData && networkData.nodes.length > 0
      : chartCategory === 'timezone'
        ? timezoneData && timezoneData.slices.length > 0
        : burstData && burstData.bursts.length > 0
    
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
          variant="fullWidth"
        >
          <Tab 
            value="network" 
            icon={<BubbleChartIcon />} 
            label={t('biblio.vizType.network')} 
            iconPosition="start"
          />
          <Tab 
            value="timezone" 
            icon={<ViewTimelineIcon />} 
            label={t('biblio.vizType.timezone')} 
            iconPosition="start"
          />
          <Tab 
            value="burst" 
            icon={<TrendingUpIcon />} 
            label={t('biblio.vizType.burst')} 
            iconPosition="start"
          />
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
          
          {/* Timezone Settings */}
          {chartCategory === 'timezone' && (
            <NumberInput
              label={t('biblio.topN')}
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
          
          {/* Color Scheme */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('wordFrequency.viz.colorScheme')}</InputLabel>
            <Select
              value={colorScheme}
              label={t('wordFrequency.viz.colorScheme')}
              onChange={(e) => setColorScheme(e.target.value)}
            >
              {COLOR_SCHEMES.map(scheme => (
                <MenuItem key={scheme.value} value={scheme.value}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box 
                      sx={{ 
                        width: 16, 
                        height: 16, 
                        borderRadius: 0.5,
                        bgcolor: getColorFromScheme(scheme.value)
                      }} 
                    />
                    <span>{scheme.label}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {/* Export buttons */}
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

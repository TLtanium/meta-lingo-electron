/**
 * Visualization Panel for N-gram Analysis
 * Container for D3.js visualizations with chart type tabs and settings
 * Design follows WordFrequency visualization panel pattern
 */

import { useState, useMemo, useRef, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  Stack,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material'
import BarChartIcon from '@mui/icons-material/BarChart'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import CloudIcon from '@mui/icons-material/Cloud'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type { NGramResult, NGramVisualizationConfig, NGramChartType } from '../../types/ngram'
import BarChart from './components/BarChart'
import NetworkGraph from './components/NetworkGraph'
import SankeyChart from './components/SankeyChart'
import WordCloud from './components/WordCloud'

interface VisualizationPanelProps {
  data: NGramResult[]
  config: NGramVisualizationConfig
  onConfigChange: (config: NGramVisualizationConfig) => void
  onNgramClick?: (ngram: string) => void
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'teal', label: 'Teal' }
]

export default function VisualizationPanel({
  data,
  config,
  onConfigChange,
  onNgramClick
}: VisualizationPanelProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<NGramChartType>(config.chartType)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Get maxItems for current chart type
  const getCurrentMaxItems = (): number => {
    const defaults: Record<NGramChartType, number> = {
      bar: 20,
      network: 50,
      sankey: 50,
      wordcloud: 100
    }
    return config.maxItemsByType?.[activeTab] ?? defaults[activeTab]
  }

  // Prepare chart data (limited to maxItems)
  const currentMaxItems = getCurrentMaxItems()
  const chartData = useMemo(() => {
    return data.slice(0, currentMaxItems)
  }, [data, currentMaxItems])

  // Export SVG
  const handleExportSVG = useCallback(() => {
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    // For network graph, get full content bounds
    if (activeTab === 'network') {
      const gElement = svg.querySelector('g')
      if (gElement) {
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
        link.download = `ngram-${activeTab}-chart.svg`
        link.click()
        
        URL.revokeObjectURL(url)
        return
      }
    }

    // For other chart types, use standard export
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `ngram-${activeTab}-chart.svg`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [activeTab])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    try {
      // For network graph, get full content bounds
      if (activeTab === 'network') {
        const gElement = svg.querySelector('g')
        if (gElement) {
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
              link.download = `ngram-${activeTab}-chart.png`
              link.click()
              
              URL.revokeObjectURL(pngUrl)
            }, 'image/png', 1.0)
          }
          
          img.onerror = () => {
            console.error('Failed to load SVG for PNG export')
            URL.revokeObjectURL(svgUrl)
          }
          
          img.src = svgUrl
          return
        }
      }

      // For bar chart, check if SVG is taller than container (has scrollable content)
      if (activeTab === 'bar') {
        const svgHeight = parseFloat(svg.getAttribute('height') || '0')
        const containerHeight = container.clientHeight
        
        // If SVG is taller than container, use SVG to PNG conversion
        if (svgHeight > containerHeight) {
          const svgClone = svg.cloneNode(true) as SVGSVGElement
          const svgWidth = parseFloat(svg.getAttribute('width') || '800')
          const actualHeight = svgHeight
          
          // Ensure SVG has proper dimensions
          svgClone.setAttribute('width', String(svgWidth))
          svgClone.setAttribute('height', String(actualHeight))
          
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
            canvas.width = svgWidth * scale
            canvas.height = actualHeight * scale
            
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              URL.revokeObjectURL(svgUrl)
              return
            }
            
            ctx.scale(scale, scale)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, svgWidth, actualHeight)
            ctx.drawImage(img, 0, 0, svgWidth, actualHeight)
            
            URL.revokeObjectURL(svgUrl)
            
            canvas.toBlob((blob) => {
              if (!blob) return
              
              const pngUrl = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = pngUrl
              link.download = `ngram-${activeTab}-chart.png`
              link.click()
              
              URL.revokeObjectURL(pngUrl)
            }, 'image/png', 1.0)
          }
          
          img.onerror = () => {
            console.error('Failed to load SVG for PNG export')
            URL.revokeObjectURL(svgUrl)
          }
          
          img.src = svgUrl
          return
        }
      }

      // For other chart types, use html2canvas
      const html2canvas = (await import('html2canvas')).default
      
      // Get the chart container (Paper or Box)
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
        link.download = `ngram-${activeTab}-chart.png`
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [activeTab])

  // Handle tab change - maintain separate maxItems for each chart type
  const handleTabChange = (_: React.SyntheticEvent, newValue: NGramChartType) => {
    // Save current maxItems for the old chart type
    const currentMaxItems = getCurrentMaxItems()
    const defaults: Record<NGramChartType, number> = {
      bar: 20,
      network: 50,
      sankey: 50,
      wordcloud: 100
    }
    
    // Get the maxItems for the new chart type (use saved value or default)
    const newChartMaxItems = config.maxItemsByType?.[newValue] ?? defaults[newValue]
    
    const newMaxItemsByType = {
      ...(config.maxItemsByType || {}),
      [activeTab]: currentMaxItems,
      [newValue]: newChartMaxItems
    }
    
    setActiveTab(newValue)
    onConfigChange({ 
      ...config, 
      chartType: newValue,
      maxItems: newChartMaxItems,
      maxItemsByType: newMaxItemsByType
    })
  }

  // Handle max items change
  const handleMaxItemsChange = (value: number) => {
    const newMaxItemsByType = {
      ...(config.maxItemsByType || {}),
      [activeTab]: value
    }
    onConfigChange({ 
      ...config, 
      maxItems: value,  // Keep for backward compatibility
      maxItemsByType: newMaxItemsByType
    })
  }

  // Handle show percentage toggle
  const handleShowPercentageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, showPercentage: event.target.checked })
  }

  // Render the appropriate chart
  const renderChart = () => {
    if (data.length === 0) {
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
            {t('common.noData')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('ngram.description')}
          </Typography>
        </Box>
      )
    }

    switch (activeTab) {
      case 'bar':
        return (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <BarChart
              data={chartData}
              colorScheme={config.colorScheme}
              showPercentage={config.showPercentage}
              onBarClick={onNgramClick}
            />
          </Box>
        )
      case 'network':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <NetworkGraph
              data={chartData}
              colorScheme={config.colorScheme}
              onNodeClick={onNgramClick}
            />
          </Box>
        )
      case 'sankey':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <SankeyChart
              data={chartData}
              colorScheme={config.colorScheme}
              onNodeClick={onNgramClick}
            />
          </Box>
        )
      case 'wordcloud':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <WordCloud
              data={chartData}
              colorScheme={config.colorScheme}
              onWordClick={onNgramClick}
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
          value={activeTab} 
          onChange={handleTabChange}
          variant="fullWidth"
        >
          <Tab 
            value="bar" 
            icon={<BarChartIcon />} 
            label={t('ngram.visualization.barChart')} 
            iconPosition="start"
          />
          <Tab 
            value="network" 
            icon={<BubbleChartIcon />} 
            label={t('ngram.visualization.networkGraph')} 
            iconPosition="start"
          />
          <Tab 
            value="sankey" 
            icon={<AccountTreeIcon />} 
            label={t('ngram.visualization.sankeyChart')} 
            iconPosition="start"
          />
          <Tab 
            value="wordcloud" 
            icon={<CloudIcon />} 
            label={t('ngram.visualization.wordCloud')} 
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
          {/* Max Items */}
          <NumberInput
            label={activeTab === 'wordcloud' ? t('wordFrequency.viz.maxWords') : t('ngram.visualization.maxItems')}
            size="small"
            value={getCurrentMaxItems()}
            onChange={handleMaxItemsChange}
            min={5}
            max={
              activeTab === 'network' ? 300 :
              activeTab === 'bar' ? 50 :
              activeTab === 'sankey' ? 100 :
              500  // wordcloud max
            }
            step={activeTab === 'wordcloud' ? 10 : 5}
            integer
            defaultValue={
              activeTab === 'bar' ? 20 :
              activeTab === 'network' ? 50 :
              activeTab === 'sankey' ? 50 :
              100  // wordcloud default
            }
            sx={{ width: activeTab === 'wordcloud' ? 180 : 130 }}
          />

          {/* Color Scheme */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('wordFrequency.viz.colorScheme')}</InputLabel>
            <Select
              value={config.colorScheme}
              label={t('wordFrequency.viz.colorScheme')}
              onChange={(e) => onConfigChange({ ...config, colorScheme: e.target.value })}
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

          {/* Show Percentage (for bar chart) */}
          {activeTab === 'bar' && (
            <FormControlLabel
              control={
                <Switch
                  checked={config.showPercentage}
                  onChange={handleShowPercentageChange}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('wordFrequency.viz.showPercentage')}
                </Typography>
              }
            />
          )}
        </Stack>

        {/* Export buttons */}
        {data.length > 0 && (
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

      {/* Chart Container */}
      <Box ref={chartContainerRef} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {renderChart()}
      </Box>
    </Box>
  )
}

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

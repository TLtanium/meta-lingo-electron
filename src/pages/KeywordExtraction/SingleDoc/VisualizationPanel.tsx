/**
 * Visualization Panel for Single Document Keyword Extraction
 */

import { useState, useRef, useCallback } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Paper,
  FormControlLabel,
  Switch,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material'
import BarChartIcon from '@mui/icons-material/BarChart'
import PieChartIcon from '@mui/icons-material/PieChart'
import CloudIcon from '@mui/icons-material/Cloud'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type { SingleDocKeyword, KeywordChartType } from '../../../types/keyword'

import BarChart from '../components/BarChart'
import PieChart from '../components/PieChart'
import WordCloud from '../components/WordCloud'

interface VisualizationPanelProps {
  data: SingleDocKeyword[]
  onKeywordClick?: (keyword: string) => void
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' }
]

const WORDCLOUD_COLORMAPS = [
  'viridis', 'inferno', 'plasma', 'autumn', 'winter', 'rainbow', 'ocean', 'forest', 'sunset'
]

export default function VisualizationPanel({
  data,
  onKeywordClick
}: VisualizationPanelProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<KeywordChartType>('bar')
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Chart configs
  const [maxItems, setMaxItems] = useState(20)
  const [colorScheme, setColorScheme] = useState('blue')
  const [showPercentage, setShowPercentage] = useState(false)
  const [maxWords, setMaxWords] = useState(100)
  const [wordCloudColormap, setWordCloudColormap] = useState('viridis')

  // Handle tab change
  const handleTabChange = (_: React.SyntheticEvent, newValue: KeywordChartType) => {
    setActiveTab(newValue)
  }

  // Export SVG
  const handleExportSVG = useCallback(() => {
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `keywords-${activeTab}-chart.svg`
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
              link.download = `keywords-${activeTab}-chart.png`
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

      // For other charts, use html2canvas
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
        link.download = `keywords-${activeTab}-chart.png`
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [activeTab])

  // Convert data format for charts
  const chartData = data.map(d => ({
    word: d.keyword,
    frequency: d.frequency,
    score: d.score,
    percentage: d.score * 100  // Normalize score to percentage-like value
  }))

  // Render chart based on active tab
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
            {t('keyword.visualization.noData', 'No Data')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('keyword.visualization.runAnalysisFirst', 'Run keyword extraction first')}
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
              maxItems={maxItems}
              showPercentage={showPercentage}
              colorScheme={colorScheme}
              height={Math.max(400, maxItems * 30)}
              onBarClick={onKeywordClick}
              valueKey="score"
            />
          </Box>
        )
      case 'pie':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <PieChart
              data={chartData}
              maxItems={maxItems}
              showLegend
              donut
              colorScheme={colorScheme}
              showPercentage={showPercentage}
              onSliceClick={onKeywordClick}
              valueKey="score"
            />
          </Box>
        )
      case 'wordcloud':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <WordCloud
              data={chartData}
              maxWords={maxWords}
              colormap={wordCloudColormap}
              onWordClick={onKeywordClick}
              valueKey="score"
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
            label={t('keyword.visualization.barChart', 'Bar Chart')} 
            iconPosition="start"
          />
          <Tab 
            value="pie" 
            icon={<PieChartIcon />} 
            label={t('keyword.visualization.pieChart', 'Pie Chart')} 
            iconPosition="start"
          />
          <Tab 
            value="wordcloud" 
            icon={<CloudIcon />} 
            label={t('keyword.visualization.wordCloud', 'Word Cloud')} 
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
          {/* Max Items (for bar and pie) */}
          {activeTab !== 'wordcloud' && (
            <NumberInput
              label={t('keyword.visualization.maxItems', 'Max Items')}
              size="small"
              value={maxItems}
              onChange={setMaxItems}
              min={5}
              max={activeTab === 'pie' ? 20 : 50}
              step={5}
              integer
              defaultValue={20}
              sx={{ width: 130 }}
            />
          )}

          {/* Max Words (for word cloud) */}
          {activeTab === 'wordcloud' && (
            <NumberInput
              label={t('keyword.visualization.maxWords', 'Max Words')}
              size="small"
              value={maxWords}
              onChange={setMaxWords}
              min={10}
              max={500}
              step={10}
              integer
              defaultValue={100}
              sx={{ width: 180 }}
            />
          )}

          {/* Color Scheme */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('keyword.visualization.colorScheme', 'Color Scheme')}</InputLabel>
            <Select
              value={activeTab === 'wordcloud' ? wordCloudColormap : colorScheme}
              label={t('keyword.visualization.colorScheme', 'Color Scheme')}
              onChange={(e) => {
                if (activeTab === 'wordcloud') {
                  setWordCloudColormap(e.target.value)
                } else {
                  setColorScheme(e.target.value)
                }
              }}
            >
              {activeTab === 'wordcloud' ? (
                WORDCLOUD_COLORMAPS.map(scheme => (
                  <MenuItem key={scheme} value={scheme}>
                    <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                      {scheme}
                    </Typography>
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
                          bgcolor: scheme.value === 'blue' ? '#2196f3' :
                                  scheme.value === 'green' ? '#4caf50' :
                                  scheme.value === 'purple' ? '#9c27b0' :
                                  scheme.value === 'orange' ? '#ff9800' : '#f44336'
                        }} 
                      />
                      <span>{scheme.label}</span>
                    </Stack>
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          {/* Show Percentage (for bar and pie charts) */}
          {(activeTab === 'bar' || activeTab === 'pie') && (
            <FormControlLabel
              control={
                <Switch
                  checked={showPercentage}
                  onChange={(e) => setShowPercentage(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {t('keyword.visualization.showPercentage', 'Show %')}
                </Typography>
              }
            />
          )}
        </Stack>

        {/* Export buttons */}
        {data.length > 0 && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip title={t('keyword.visualization.exportSVG', 'Export SVG')}>
              <IconButton size="small" onClick={handleExportSVG}>
                <SaveAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('keyword.visualization.exportPNG', 'Export PNG')}>
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


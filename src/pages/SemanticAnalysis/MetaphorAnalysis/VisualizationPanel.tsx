/**
 * Metaphor Analysis Visualization Panel
 * Replicates the word frequency visualization design with word cloud, bar chart, and pie chart
 */

import { useState, useRef, useCallback, useMemo } from 'react'
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
  Divider,
  Button
} from '@mui/material'
import BarChartIcon from '@mui/icons-material/BarChart'
import PieChartIcon from '@mui/icons-material/PieChart'
import CloudIcon from '@mui/icons-material/Cloud'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type {
  MetaphorResult,
  MetaphorStatistics
} from '../../../types/metaphorAnalysis'
import type { 
  WordFrequencyResult, 
  WordCloudConfig, 
  WordCloudColormap
} from '../../../types/wordFrequency'
import { DEFAULT_WORDCLOUD_CONFIG, DEFAULT_LEGACY_WORDCLOUD_CONFIG } from '../../../types/wordFrequency'

// Import shared visualization components from WordFrequency
import WordCloud from '../../WordFrequency/components/WordCloud'
import LegacyWordCloud from '../../WordFrequency/components/LegacyWordCloud'
import LegacyWordCloudConfig from '../../WordFrequency/components/LegacyWordCloudConfig'
import MetaphorBarChart from './MetaphorBarChart'
import MetaphorPieChart from './MetaphorPieChart'

// Types
type ChartType = 'bar' | 'pie' | 'wordcloud'
type WordCloudEngine = 'd3' | 'legacy'

export interface MetaphorVisualizationConfig {
  chartType: ChartType
  maxItems: number
  maxItemsByType?: Partial<Record<ChartType, number>>
  showPercentage: boolean
  colorScheme: string
  showMetaphorsOnly: boolean
  // Word cloud specific
  wordCloudEngine: WordCloudEngine
  wordCloudConfig: WordCloudConfig
  legacyWordCloudConfig: WordCloudConfig
}

export const DEFAULT_METAPHOR_VIZ_CONFIG: MetaphorVisualizationConfig = {
  chartType: 'bar',
  maxItems: 20,
  maxItemsByType: { bar: 20, pie: 10, wordcloud: 100 },
  showPercentage: true,
  colorScheme: 'green',
  showMetaphorsOnly: true,
  wordCloudEngine: 'd3',
  wordCloudConfig: DEFAULT_WORDCLOUD_CONFIG,
  legacyWordCloudConfig: DEFAULT_LEGACY_WORDCLOUD_CONFIG
}

interface VisualizationPanelProps {
  data: MetaphorResult[]
  statistics: MetaphorStatistics | null
  config: MetaphorVisualizationConfig
  onConfigChange: (config: MetaphorVisualizationConfig) => void
  onWordClick?: (word: string) => void
}

const COLOR_SCHEMES = [
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' }
]

export default function VisualizationPanel({
  data,
  statistics,
  config,
  onConfigChange,
  onWordClick
}: VisualizationPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [activeTab, setActiveTab] = useState<ChartType>(config.chartType)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Get maxItems for current chart type
  const getCurrentMaxItems = (): number => {
    const defaults: Record<ChartType, number> = {
      bar: 20,
      pie: 10,
      wordcloud: 100
    }
    return config.maxItemsByType?.[activeTab] ?? config.maxItems ?? defaults[activeTab]
  }

  // Handle tab change
  const handleTabChange = (_: React.SyntheticEvent, newValue: ChartType) => {
    const currentMaxItems = getCurrentMaxItems()
    const defaults: Record<ChartType, number> = {
      bar: 20,
      pie: 10,
      wordcloud: 100
    }
    
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
      maxItems: value,
      maxItemsByType: newMaxItemsByType
    })
  }

  // Handle word cloud config change
  const handleWordCloudConfigChange = (wcConfig: WordCloudConfig) => {
    const currentEngine = config.wordCloudEngine || 'd3'
    if (currentEngine === 'd3') {
      onConfigChange({ ...config, wordCloudConfig: wcConfig })
    } else {
      onConfigChange({ ...config, legacyWordCloudConfig: wcConfig })
    }
  }

  // Handle engine change
  const handleEngineChange = (engine: WordCloudEngine) => {
    const currentEngine = config.wordCloudEngine || 'd3'
    if (currentEngine === 'd3') {
      const d3Config = config.wordCloudConfig || DEFAULT_WORDCLOUD_CONFIG
      onConfigChange({
        ...config,
        wordCloudEngine: engine,
        wordCloudConfig: d3Config,
        legacyWordCloudConfig: config.legacyWordCloudConfig || {
          ...DEFAULT_LEGACY_WORDCLOUD_CONFIG,
          maxWords: d3Config.maxWords || 100
        }
      })
    } else {
      const legacyConfig = config.legacyWordCloudConfig || DEFAULT_LEGACY_WORDCLOUD_CONFIG
      onConfigChange({
        ...config,
        wordCloudEngine: engine,
        legacyWordCloudConfig: legacyConfig,
        wordCloudConfig: config.wordCloudConfig || {
          ...DEFAULT_WORDCLOUD_CONFIG,
          maxWords: legacyConfig.maxWords || 100
        }
      })
    }
  }

  // Get current engine
  const getCurrentEngine = (): WordCloudEngine => {
    return config.wordCloudEngine || 'd3'
  }

  // Get current word cloud config
  const getCurrentWordCloudConfig = (): WordCloudConfig => {
    const engine = getCurrentEngine()
    if (engine === 'd3') {
      return config.wordCloudConfig || DEFAULT_WORDCLOUD_CONFIG
    } else {
      return config.legacyWordCloudConfig || DEFAULT_LEGACY_WORDCLOUD_CONFIG
    }
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
    link.download = `metaphor-analysis-${activeTab}-chart.svg`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [activeTab])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    const container = chartContainerRef.current
    if (!container) return

    const currentEngine = getCurrentEngine()

    // For legacy word cloud, download the image directly
    if (activeTab === 'wordcloud' && currentEngine === 'legacy') {
      const img = container.querySelector('img')
      if (img && img.src) {
        const link = document.createElement('a')
        link.href = img.src
        link.download = `metaphor-analysis-wordcloud-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return
      }
    }

    // For SVG charts, use SVG to PNG conversion
    const svg = container.querySelector('svg')
    if (!svg) return

    try {
      const svgClone = svg.cloneNode(true) as SVGSVGElement
      const svgWidth = parseFloat(svg.getAttribute('width') || '800')
      const svgHeight = parseFloat(svg.getAttribute('height') || '600')
      
      svgClone.setAttribute('width', String(svgWidth))
      svgClone.setAttribute('height', String(svgHeight))
      
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgClone)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)
      
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = 3
        canvas.width = svgWidth * scale
        canvas.height = svgHeight * scale
        
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(svgUrl)
          return
        }
        
        ctx.scale(scale, scale)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, svgWidth, svgHeight)
        ctx.drawImage(img, 0, 0, svgWidth, svgHeight)
        
        URL.revokeObjectURL(svgUrl)
        
        canvas.toBlob((blob) => {
          if (!blob) return
          
          const pngUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = pngUrl
          link.download = `metaphor-analysis-${activeTab}-chart.png`
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
  }, [activeTab, config.wordCloudEngine])

  // Prepare word cloud data
  const wordCloudData = useMemo((): WordFrequencyResult[] => {
    if (!data.length) return []

    const filtered = config.showMetaphorsOnly
      ? data.filter(w => w.is_metaphor)
      : data

    const maxWords = getCurrentWordCloudConfig().maxWords || 100
    return filtered.slice(0, maxWords).map((w, idx) => ({
      word: w.word,
      frequency: w.frequency,
      percentage: w.percentage,
      rank: idx + 1
    }))
  }, [data, config.showMetaphorsOnly, config.wordCloudConfig?.maxWords, config.legacyWordCloudConfig?.maxWords])

  // Get color based on scheme
  const getSchemeColor = (scheme: string, isMetaphor: boolean): string => {
    if (!isMetaphor) return '#9E9E9E'
    switch (scheme) {
      case 'blue': return '#2196f3'
      case 'purple': return '#9c27b0'
      case 'orange': return '#ff9800'
      case 'red': return '#f44336'
      case 'green':
      default: return '#4caf50'
    }
  }

  // Prepare bar chart data
  const barChartData = useMemo(() => {
    const filtered = config.showMetaphorsOnly 
      ? data.filter(w => w.is_metaphor) 
      : data
    const maxItems = config.maxItemsByType?.[activeTab] ?? config.maxItems ?? 20
    const words = filtered.slice(0, maxItems)
    return {
      labels: words.map(w => w.word),
      values: words.map(w => w.frequency),
      colors: words.map(w => getSchemeColor(config.colorScheme, w.is_metaphor))
    }
  }, [data, config.showMetaphorsOnly, config.maxItems, config.maxItemsByType, config.colorScheme, activeTab])

  // Prepare pie chart data
  const pieChartData = useMemo(() => {
    if (statistics) {
      return {
        labels: [
          isZh ? '隐喻词' : 'Metaphors',
          isZh ? '非隐喻词' : 'Literals'
        ],
        values: [statistics.metaphor_tokens, statistics.literal_tokens],
        colors: [getSchemeColor(config.colorScheme, true), '#9E9E9E']
      }
    }
    return { labels: [], values: [], colors: [] }
  }, [statistics, isZh, config.colorScheme])

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
            {isZh ? '暂无数据' : 'No Data'}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {isZh ? '运行分析后查看可视化' : 'Run analysis to view visualizations'}
          </Typography>
        </Box>
      )
    }

    const currentMaxItems = getCurrentMaxItems()
    
    switch (activeTab) {
      case 'bar':
        return (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <MetaphorBarChart
              labels={barChartData.labels}
              values={barChartData.values}
              colors={barChartData.colors}
              onBarClick={onWordClick}
              showPercentage={config.showPercentage}
            />
          </Box>
        )
      case 'pie':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <MetaphorPieChart
              labels={pieChartData.labels}
              values={pieChartData.values}
              colors={pieChartData.colors}
              showPercentage={config.showPercentage}
            />
          </Box>
        )
      case 'wordcloud':
        const engine = getCurrentEngine()
        const wcConfig = getCurrentWordCloudConfig()
        
        if (engine === 'legacy') {
          return (
            <Box sx={{ height: '100%', display: 'flex' }}>
              <LegacyWordCloud
                data={wordCloudData}
                config={{
                  maxWords: wcConfig.maxWords || 100,
                  useAllWords: wcConfig.useAllWords || false,
                  style: wcConfig.style || 'default',
                  colormap: wcConfig.colormap,
                  maskImage: wcConfig.maskImage
                }}
                onWordClick={onWordClick}
              />
            </Box>
          )
        } else {
          return (
            <Box sx={{ height: '100%', display: 'flex' }}>
              <WordCloud
                data={wordCloudData}
                config={wcConfig}
                onWordClick={onWordClick}
              />
            </Box>
          )
        }
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
            label={isZh ? '柱状图' : 'Bar Chart'} 
            iconPosition="start"
          />
          <Tab 
            value="pie" 
            icon={<PieChartIcon />} 
            label={isZh ? '饼图' : 'Pie Chart'} 
            iconPosition="start"
          />
          <Tab 
            value="wordcloud" 
            icon={<CloudIcon />} 
            label={isZh ? '词云图' : 'Word Cloud'} 
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Settings Bar */}
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
              label={isZh ? '显示数量' : 'Max Items'}
              size="small"
              value={getCurrentMaxItems()}
              onChange={handleMaxItemsChange}
              min={5}
              max={activeTab === 'pie' ? 20 : 50}
              step={5}
              integer
              defaultValue={activeTab === 'pie' ? 10 : 20}
              sx={{ width: 130 }}
            />
          )}

          {/* Word Cloud Engine Selection */}
          {activeTab === 'wordcloud' && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>{isZh ? '引擎' : 'Engine'}</InputLabel>
              <Select
                value={getCurrentEngine()}
                label={isZh ? '引擎' : 'Engine'}
                onChange={(e) => handleEngineChange(e.target.value as WordCloudEngine)}
              >
                <MenuItem value="d3">{isZh ? 'D3.js (默认)' : 'D3.js (Default)'}</MenuItem>
                <MenuItem value="legacy">{isZh ? '旧版引擎' : 'Legacy Engine'}</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Max Words (for word cloud) */}
          {activeTab === 'wordcloud' && (
            <>
              {getCurrentEngine() === 'legacy' && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={getCurrentWordCloudConfig().useAllWords || false}
                      onChange={(e) => {
                        const currentConfig = getCurrentWordCloudConfig()
                        handleWordCloudConfigChange({
                          ...currentConfig,
                          useAllWords: e.target.checked
                        })
                      }}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {isZh ? '使用全部词' : 'Use All Words'}
                    </Typography>
                  }
                />
              )}
              {!(getCurrentEngine() === 'legacy' && (getCurrentWordCloudConfig().useAllWords || false)) && (
                <NumberInput
                  label={isZh ? '最大词数' : 'Max Words'}
                  size="small"
                  value={getCurrentWordCloudConfig().maxWords ?? 100}
                  onChange={(value) => handleWordCloudConfigChange({
                    ...getCurrentWordCloudConfig(),
                    maxWords: value
                  })}
                  min={5}
                  max={500}
                  step={10}
                  integer
                  defaultValue={100}
                  sx={{ width: 180 }}
                />
              )}
            </>
          )}

          {/* Legacy Word Cloud Style */}
          {activeTab === 'wordcloud' && getCurrentEngine() === 'legacy' && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>{isZh ? '样式' : 'Style'}</InputLabel>
              <Select
                value={getCurrentWordCloudConfig().style || 'default'}
                label={isZh ? '样式' : 'Style'}
                onChange={(e) => {
                  const newStyle = e.target.value as string
                  const currentConfig = getCurrentWordCloudConfig()
                  handleWordCloudConfigChange({
                    ...currentConfig,
                    style: newStyle,
                    ...(newStyle === 'default' && { maskImage: null })
                  })
                }}
              >
                <MenuItem value="default">{isZh ? '默认' : 'Default'}</MenuItem>
                <MenuItem value="mask">{isZh ? '使用蒙版' : 'Use Mask'}</MenuItem>
                <MenuItem value="imageColor">{isZh ? '基于图片颜色' : 'Image Color'}</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Color Scheme */}
          {(activeTab !== 'wordcloud' || getCurrentEngine() === 'd3' || 
            (getCurrentEngine() === 'legacy' && 
             (getCurrentWordCloudConfig().style === 'default' || 
              getCurrentWordCloudConfig().style === 'mask'))) && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{isZh ? '配色方案' : 'Color Scheme'}</InputLabel>
              <Select
                value={activeTab === 'wordcloud' 
                  ? (getCurrentWordCloudConfig().colormap || 'viridis')
                  : config.colorScheme
                }
                label={isZh ? '配色方案' : 'Color Scheme'}
                onChange={(e) => {
                  if (activeTab === 'wordcloud') {
                    handleWordCloudConfigChange({
                      ...getCurrentWordCloudConfig(),
                      colormap: e.target.value as WordCloudColormap
                    })
                  } else {
                    onConfigChange({ 
                      ...config, 
                      colorScheme: e.target.value 
                    })
                  }
                }}
              >
                {activeTab === 'wordcloud' ? (
                  ['viridis', 'inferno', 'plasma', 'autumn', 'winter', 'rainbow', 'ocean', 'forest', 'sunset'].map(scheme => (
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
          )}

          {/* Show Metaphors Only (for bar and wordcloud) */}
          {activeTab !== 'pie' && (
            <FormControlLabel
              control={
                <Switch
                  checked={config.showMetaphorsOnly}
                  onChange={(e) => onConfigChange({ ...config, showMetaphorsOnly: e.target.checked })}
                  size="small"
                  color="success"
                />
              }
              label={
                <Typography variant="body2">
                  {isZh ? '仅显示隐喻' : 'Metaphors Only'}
                </Typography>
              }
            />
          )}

          {/* Show Percentage (for bar and pie) */}
          {(activeTab === 'bar' || activeTab === 'pie') && (
            <FormControlLabel
              control={
                <Switch
                  checked={config.showPercentage}
                  onChange={(e) => onConfigChange({ ...config, showPercentage: e.target.checked })}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {isZh ? '显示百分比' : 'Show %'}
                </Typography>
              }
            />
          )}
        </Stack>

        {/* Export buttons */}
        {data.length > 0 && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip 
              title={
                activeTab === 'wordcloud' && getCurrentEngine() === 'legacy'
                  ? (isZh ? 'SVG导出不支持旧版引擎' : 'SVG export not supported for legacy engine')
                  : (isZh ? '导出SVG' : 'Export SVG')
              }
            >
              <span>
                <IconButton 
                  size="small" 
                  onClick={handleExportSVG}
                  disabled={activeTab === 'wordcloud' && getCurrentEngine() === 'legacy'}
                >
                  <SaveAltIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={isZh ? '导出PNG' : 'Export PNG'}>
              <IconButton size="small" onClick={handleExportPNG}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Paper>

      {/* Legacy Word Cloud Mask Upload */}
      {activeTab === 'wordcloud' && getCurrentEngine() === 'legacy' && 
       (getCurrentWordCloudConfig().style === 'mask' || 
        getCurrentWordCloudConfig().style === 'imageColor') && (
        <Paper 
          elevation={0} 
          sx={{ 
            px: 2, 
            py: 1, 
            borderBottom: 1, 
            borderColor: 'divider',
            bgcolor: 'background.default'
          }}
        >
          <LegacyWordCloudConfig
            config={getCurrentWordCloudConfig()}
            onChange={handleWordCloudConfigChange}
          />
        </Paper>
      )}

      {/* Chart Container */}
      <Box ref={chartContainerRef} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {renderChart()}
      </Box>
    </Box>
  )
}

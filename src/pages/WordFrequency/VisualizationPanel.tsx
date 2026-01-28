/**
 * Visualization Panel Component
 * Container for word frequency visualizations with chart type switching
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
  Divider,
  RadioGroup,
  Radio,
  Collapse
} from '@mui/material'
import BarChartIcon from '@mui/icons-material/BarChart'
import PieChartIcon from '@mui/icons-material/PieChart'
import CloudIcon from '@mui/icons-material/Cloud'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type { 
  WordFrequencyResult,
  VisualizationConfig,
  ChartType,
  WordCloudConfig,
  WordCloudEngine
} from '../../types/wordFrequency'
import { DEFAULT_WORDCLOUD_CONFIG, DEFAULT_LEGACY_WORDCLOUD_CONFIG } from '../../types/wordFrequency'
import BarChart from './components/BarChart'
import PieChart from './components/PieChart'
import WordCloud from './components/WordCloud'
import LegacyWordCloud from './components/LegacyWordCloud'
import LegacyWordCloudConfig from './components/LegacyWordCloudConfig'

interface VisualizationPanelProps {
  data: WordFrequencyResult[]
  config: VisualizationConfig
  onConfigChange: (config: VisualizationConfig) => void
  onWordClick?: (word: string) => void
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' }
]

export default function VisualizationPanel({
  data,
  config,
  onConfigChange,
  onWordClick
}: VisualizationPanelProps) {
  const { t, i18n } = useTranslation()
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

  // Handle tab change - maintain separate maxItems for each chart type
  const handleTabChange = (_: React.SyntheticEvent, newValue: ChartType) => {
    // Save current maxItems for the old chart type
    const currentMaxItems = getCurrentMaxItems()
    const defaults: Record<ChartType, number> = {
      bar: 20,
      pie: 10,
      wordcloud: 100
    }
    
    // Get the maxItems for the new chart type (use saved value or default)
    const newChartMaxItems = config.maxItemsByType?.[newValue] ?? defaults[newValue]
    
    const newMaxItemsByType = {
      ...(config.maxItemsByType || {}),
      [activeTab]: currentMaxItems,
      // Ensure new chart type has its own value
      [newValue]: newChartMaxItems
    }
    
    setActiveTab(newValue)
    onConfigChange({ 
      ...config, 
      chartType: newValue,
      maxItems: newChartMaxItems,  // Update main maxItems for backward compatibility
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

  // Handle color scheme change
  const handleColorSchemeChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    onConfigChange({ ...config, colorScheme: event.target.value as string })
  }

  // Handle show percentage toggle
  const handleShowPercentageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, showPercentage: event.target.checked })
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
    // Save current engine's config
    const currentEngine = config.wordCloudEngine || 'd3'
    if (currentEngine === 'd3') {
      // Save D3 config
      const d3Config = config.wordCloudConfig || DEFAULT_WORDCLOUD_CONFIG
      onConfigChange({
        ...config,
        wordCloudEngine: engine,
        wordCloudConfig: d3Config,
        // Restore or initialize legacy config
        legacyWordCloudConfig: config.legacyWordCloudConfig || {
          ...DEFAULT_LEGACY_WORDCLOUD_CONFIG,
          maxWords: d3Config.maxWords || 100
        }
      })
    } else {
      // Save legacy config
      const legacyConfig = config.legacyWordCloudConfig || DEFAULT_LEGACY_WORDCLOUD_CONFIG
      onConfigChange({
        ...config,
        wordCloudEngine: engine,
        legacyWordCloudConfig: legacyConfig,
        // Restore or initialize D3 config
        wordCloudConfig: config.wordCloudConfig || {
          ...DEFAULT_WORDCLOUD_CONFIG,
          maxWords: legacyConfig.maxWords || 100
        }
      })
    }
  }

  // Get current word cloud engine
  const getCurrentEngine = (): WordCloudEngine => {
    return config.wordCloudEngine || 'd3'
  }

  // Get current word cloud config based on engine
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
    link.download = `word-frequency-${activeTab}-chart.svg`
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
        // Create a link to download the image
        const link = document.createElement('a')
        link.href = img.src
        link.download = `word-frequency-wordcloud-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return
      }
    }

    // For bar chart and other SVG charts, use SVG to PNG conversion for full content
    const svg = container.querySelector('svg')
    if (!svg) return

    try {
      // For bar chart, check if SVG is taller than container (has scrollable content)
      const svgHeight = parseFloat(svg.getAttribute('height') || '0')
      const containerHeight = container.clientHeight
      
      // If SVG is taller than container or for bar chart, use SVG to PNG conversion
      if (activeTab === 'bar' || svgHeight > containerHeight) {
        const svgClone = svg.cloneNode(true) as SVGSVGElement
        const svgWidth = parseFloat(svg.getAttribute('width') || '800')
        const actualHeight = svgHeight || containerHeight
        
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
            link.download = `word-frequency-${activeTab}-chart.png`
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

      // For other charts (pie, wordcloud), use html2canvas
      const html2canvas = (await import('html2canvas')).default
      
      // Get the chart container
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
        link.download = `word-frequency-${activeTab}-chart.png`
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [activeTab, config.wordCloudEngine])

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
            {t('wordFrequency.viz.noData')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('wordFrequency.viz.runAnalysisFirst')}
          </Typography>
        </Box>
      )
    }

    const currentMaxItems = getCurrentMaxItems()
    
    switch (activeTab) {
      case 'bar':
        return (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <BarChart
              data={data}
              maxItems={currentMaxItems}
              showPercentage={config.showPercentage}
              colorScheme={config.colorScheme}
              height={Math.max(400, currentMaxItems * 30)}
              onBarClick={onWordClick}
            />
          </Box>
        )
      case 'pie':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <PieChart
              data={data}
              maxItems={currentMaxItems}
              showLegend
              donut
              colorScheme={config.colorScheme}
              showPercentage={config.showPercentage}
              onSliceClick={onWordClick}
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
                data={data}
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
                data={data}
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
            label={t('wordFrequency.viz.barChart')} 
            iconPosition="start"
          />
          <Tab 
            value="pie" 
            icon={<PieChartIcon />} 
            label={t('wordFrequency.viz.pieChart')} 
            iconPosition="start"
          />
          <Tab 
            value="wordcloud" 
            icon={<CloudIcon />} 
            label={t('wordFrequency.viz.wordCloud')} 
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Chart Settings (for all chart types) */}
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
              label={t('wordFrequency.viz.maxItems')}
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
              <InputLabel>{t('wordFrequency.viz.wordCloudConfig.engine')}</InputLabel>
              <Select
                value={getCurrentEngine()}
                label={t('wordFrequency.viz.wordCloudConfig.engine')}
                onChange={(e) => handleEngineChange(e.target.value as WordCloudEngine)}
              >
                <MenuItem value="d3">
                  {t('wordFrequency.viz.wordCloudConfig.engine.d3')}
                </MenuItem>
                <MenuItem value="legacy">
                  {t('wordFrequency.viz.wordCloudConfig.engine.legacy')}
                </MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Max Words (for word cloud) */}
          {activeTab === 'wordcloud' && (
            <>
              {/* Use All Words Switch (for legacy engine only) */}
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
                      {t('wordFrequency.viz.wordCloudConfig.useAllWords')}
                    </Typography>
                  }
                />
              )}
              {/* Max Words Input - hidden when useAllWords is enabled for legacy engine */}
              {!(getCurrentEngine() === 'legacy' && (getCurrentWordCloudConfig().useAllWords || false)) && (
                <NumberInput
                  label={t('wordFrequency.viz.maxWords')}
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

          {/* Legacy Word Cloud Style Selection */}
          {activeTab === 'wordcloud' && getCurrentEngine() === 'legacy' && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>{t('wordFrequency.viz.wordCloudConfig.style')}</InputLabel>
              <Select
                value={getCurrentWordCloudConfig().style || 'default'}
                label={t('wordFrequency.viz.wordCloudConfig.style')}
                onChange={(e) => {
                  const newStyle = e.target.value as WordCloudStyle
                  const currentConfig = getCurrentWordCloudConfig()
                  handleWordCloudConfigChange({
                    ...currentConfig,
                    style: newStyle,
                    // Reset mask if switching away from mask-requiring styles
                    ...(newStyle === 'default' && { maskImage: null, maskImageFile: null })
                  })
                }}
              >
                <MenuItem value="default">{t('wordFrequency.viz.wordCloudConfig.style.default')}</MenuItem>
                <MenuItem value="mask">{t('wordFrequency.viz.wordCloudConfig.style.mask')}</MenuItem>
                <MenuItem value="imageColor">{t('wordFrequency.viz.wordCloudConfig.style.imageColor')}</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Color Scheme (for bar/pie or word cloud) */}
          {activeTab !== 'wordcloud' || (activeTab === 'wordcloud' && (getCurrentEngine() === 'd3' || (getCurrentEngine() === 'legacy' && (getCurrentWordCloudConfig().style === 'default' || getCurrentWordCloudConfig().style === 'mask')))) ? (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{t('wordFrequency.viz.colorScheme')}</InputLabel>
              <Select
                value={activeTab === 'wordcloud' 
                  ? (getCurrentWordCloudConfig().colormap || 'viridis')
                  : config.colorScheme
                }
                label={t('wordFrequency.viz.colorScheme')}
                onChange={(e) => {
                  if (activeTab === 'wordcloud') {
                    handleWordCloudConfigChange({
                      ...getCurrentWordCloudConfig(),
                      colormap: e.target.value as any
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
                  // Word cloud color schemes
                  ['viridis', 'inferno', 'plasma', 'autumn', 'winter', 'rainbow', 'ocean', 'forest', 'sunset'].map(scheme => (
                    <MenuItem key={scheme} value={scheme}>
                      <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                        {scheme}
                      </Typography>
                    </MenuItem>
                  ))
                ) : (
                  // Bar/Pie color schemes
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
          ) : null}


          {/* Show Percentage (for bar and pie charts) */}
          {(activeTab === 'bar' || activeTab === 'pie') && (
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
            {/* SVG export - disabled for legacy word cloud engine */}
            <Tooltip 
              title={
                activeTab === 'wordcloud' && getCurrentEngine() === 'legacy'
                  ? t('wordFrequency.viz.wordCloudConfig.svgNotSupported')
                  : t('wordFrequency.viz.export') + ' SVG'
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
            <Tooltip title={t('wordFrequency.viz.export') + ' PNG'}>
              <IconButton size="small" onClick={handleExportPNG}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Paper>

      {/* Legacy Word Cloud Mask Upload (inline in settings bar) */}
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


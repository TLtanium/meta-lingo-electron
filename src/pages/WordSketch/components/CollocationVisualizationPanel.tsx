/**
 * Collocation Visualization Panel
 * Container for collocation analysis visualizations with 4 chart types:
 * Bar Chart, Pie Chart, Collocation Network Graph, Word Cloud (dual engine)
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
import HubIcon from '@mui/icons-material/Hub'
import CloudIcon from '@mui/icons-material/Cloud'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type {
  CollocationAnalysisResult,
  CollocationChartType,
  CollocationVizConfig,
  StatisticalMeasure
} from '../../../types/collocationAnalysis'
import type {
  WordFrequencyResult,
  WordCloudConfig,
  WordCloudEngine,
  WordCloudStyle
} from '../../../types/wordFrequency'
import { DEFAULT_WORDCLOUD_CONFIG, DEFAULT_LEGACY_WORDCLOUD_CONFIG } from '../../../types/wordFrequency'
import BarChart from '../../WordFrequency/components/BarChart'
import PieChart from '../../WordFrequency/components/PieChart'
import WordCloud from '../../WordFrequency/components/WordCloud'
import LegacyWordCloud from '../../WordFrequency/components/LegacyWordCloud'
import LegacyWordCloudConfig from '../../WordFrequency/components/LegacyWordCloudConfig'
import CollocationNetworkGraph from './CollocationNetworkGraph'

interface CollocationVisualizationPanelProps {
  data: CollocationAnalysisResult[]
  nodeWord: string
  config: CollocationVizConfig
  onConfigChange: (config: CollocationVizConfig) => void
  enabledMetrics: StatisticalMeasure[]
  expandedData?: Record<string, CollocationAnalysisResult[]>
  loadingExpand?: string | null
  fetchCollocates?: (nodeWord: string) => Promise<void>
  onWordClick?: (word: string) => void
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' }
]

export default function CollocationVisualizationPanel({
  data,
  nodeWord,
  config,
  onConfigChange,
  enabledMetrics,
  expandedData = {},
  loadingExpand = null,
  fetchCollocates,
  onWordClick
}: CollocationVisualizationPanelProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<CollocationChartType>(config.chartType)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Transform collocation data to WordFrequencyResult format for reusing charts
  const chartData: WordFrequencyResult[] = data.map((r, i) => ({
    word: r.collocate,
    frequency: r.collocation_freq,
    percentage: 0, // Will be calculated
    rank: i + 1
  }))

  // Calculate percentages
  const totalFreq = chartData.reduce((sum, d) => sum + d.frequency, 0)
  chartData.forEach(d => {
    d.percentage = totalFreq > 0 ? (d.frequency / totalFreq * 100) : 0
  })

  const getCurrentMaxItems = (): number => {
    const defaults: Record<CollocationChartType, number> = {
      bar: 20, pie: 10, network: 20, wordcloud: 100
    }
    return config.maxItemsByType?.[activeTab] ?? config.maxItems ?? defaults[activeTab]
  }

  const handleTabChange = (_: React.SyntheticEvent, newValue: CollocationChartType) => {
    const currentMaxItems = getCurrentMaxItems()
    const defaults: Record<CollocationChartType, number> = {
      bar: 20, pie: 10, network: 20, wordcloud: 100
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

  const handleMaxItemsChange = (value: number) => {
    const newMaxItemsByType = {
      ...(config.maxItemsByType || {}),
      [activeTab]: value
    }
    onConfigChange({ ...config, maxItems: value, maxItemsByType: newMaxItemsByType })
  }

  const getCurrentEngine = (): WordCloudEngine => config.wordCloudEngine || 'd3'

  const getCurrentWordCloudConfig = (): WordCloudConfig => {
    const engine = getCurrentEngine()
    return engine === 'd3'
      ? (config.wordCloudConfig || DEFAULT_WORDCLOUD_CONFIG)
      : (config.legacyWordCloudConfig || DEFAULT_LEGACY_WORDCLOUD_CONFIG)
  }

  const handleEngineChange = (engine: WordCloudEngine) => {
    const currentEngine = getCurrentEngine()
    if (currentEngine === 'd3') {
      onConfigChange({
        ...config,
        wordCloudEngine: engine,
        legacyWordCloudConfig: config.legacyWordCloudConfig || {
          ...DEFAULT_LEGACY_WORDCLOUD_CONFIG,
          maxWords: (config.wordCloudConfig || DEFAULT_WORDCLOUD_CONFIG).maxWords || 100
        }
      })
    } else {
      onConfigChange({
        ...config,
        wordCloudEngine: engine,
        wordCloudConfig: config.wordCloudConfig || {
          ...DEFAULT_WORDCLOUD_CONFIG,
          maxWords: (config.legacyWordCloudConfig || DEFAULT_LEGACY_WORDCLOUD_CONFIG).maxWords || 100
        }
      })
    }
  }

  const handleWordCloudConfigChange = (wcConfig: WordCloudConfig) => {
    if (getCurrentEngine() === 'd3') {
      onConfigChange({ ...config, wordCloudConfig: wcConfig })
    } else {
      onConfigChange({ ...config, legacyWordCloudConfig: wcConfig })
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
    link.download = `collocation-${activeTab}-${nodeWord}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }, [activeTab, nodeWord])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    const container = chartContainerRef.current
    if (!container) return

    if (activeTab === 'wordcloud' && getCurrentEngine() === 'legacy') {
      const img = container.querySelector('img')
      if (img && img.src) {
        const link = document.createElement('a')
        link.href = img.src
        link.download = `collocation-wordcloud-${nodeWord}-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return
      }
    }

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
        if (!ctx) { URL.revokeObjectURL(svgUrl); return }
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
          link.download = `collocation-${activeTab}-${nodeWord}.png`
          link.click()
          URL.revokeObjectURL(pngUrl)
        }, 'image/png', 1.0)
      }
      img.src = svgUrl
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [activeTab, nodeWord, config.wordCloudEngine])

  const renderChart = () => {
    // Network graph handles its own empty state with settings bar preserved
    if (data.length === 0 && activeTab !== 'network') {
      return (
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: 'text.secondary', flexDirection: 'column', gap: 2, p: 4
        }}>
          <InsertChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            {t('collocationAnalysis.visualization.noData')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('collocationAnalysis.visualization.runFirst')}
          </Typography>
        </Box>
      )
    }

    const currentMaxItems = getCurrentMaxItems()

    switch (activeTab) {
      case 'bar':
        // Sort bar chart by collocation frequency (descending)
        const sortedBarData = [...chartData].sort((a, b) => b.frequency - a.frequency)
        return (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <BarChart
              data={sortedBarData}
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
              data={chartData}
              maxItems={currentMaxItems}
              showLegend
              donut
              colorScheme={config.colorScheme}
              showPercentage={config.showPercentage}
              onSliceClick={onWordClick}
            />
          </Box>
        )
      case 'network':
        return (
          <CollocationNetworkGraph
            data={data}
            nodeWord={nodeWord}
            maxItems={currentMaxItems}
            onMaxItemsChange={handleMaxItemsChange}
            scoreMetric={config.networkScoreMetric}
            onScoreMetricChange={(metric) => onConfigChange({ ...config, networkScoreMetric: metric })}
            enabledMetrics={enabledMetrics}
            colorScheme={config.colorScheme}
            onColorSchemeChange={(scheme) => onConfigChange({ ...config, colorScheme: scheme })}
            expandedData={expandedData}
            loadingExpand={loadingExpand}
            onExpandCollocate={fetchCollocates}
          />
        )
      case 'wordcloud':
        const engine = getCurrentEngine()
        const wcConfig = getCurrentWordCloudConfig()
        if (engine === 'legacy') {
          return (
            <Box sx={{ height: '100%', display: 'flex' }}>
              <LegacyWordCloud
                data={chartData}
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
              <WordCloud data={chartData} config={wcConfig} onWordClick={onWordClick} />
            </Box>
          )
        }
      default:
        return null
    }
  }

  return (
    <Box sx={{ width: '100%', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Chart Type Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
          <Tab value="bar" icon={<BarChartIcon />} label={t('collocationAnalysis.visualization.barChart')} iconPosition="start" />
          <Tab value="pie" icon={<PieChartIcon />} label={t('collocationAnalysis.visualization.pieChart')} iconPosition="start" />
          <Tab value="network" icon={<HubIcon />} label={t('collocationAnalysis.visualization.networkGraph')} iconPosition="start" />
          <Tab value="wordcloud" icon={<CloudIcon />} label={t('collocationAnalysis.visualization.wordCloud')} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Settings bar (not shown for network - it has its own) */}
      {activeTab !== 'network' && (
        <Paper
          elevation={0}
          sx={{
            px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}
        >
          <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
            {/* Max Items (bar/pie) */}
            {(activeTab === 'bar' || activeTab === 'pie') && (
              <NumberInput
                label={t('collocationAnalysis.visualization.maxItems')}
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

            {/* Word Cloud Engine */}
            {activeTab === 'wordcloud' && (
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>{t('wordFrequency.viz.wordCloudConfig.engine')}</InputLabel>
                <Select
                  value={getCurrentEngine()}
                  label={t('wordFrequency.viz.wordCloudConfig.engine')}
                  onChange={(e) => handleEngineChange(e.target.value as WordCloudEngine)}
                >
                  <MenuItem value="d3">{t('wordFrequency.viz.wordCloudConfig.engine.d3')}</MenuItem>
                  <MenuItem value="legacy">{t('wordFrequency.viz.wordCloudConfig.engine.legacy')}</MenuItem>
                </Select>
              </FormControl>
            )}

            {/* Word Cloud Max Words */}
            {activeTab === 'wordcloud' && (
              <>
                {getCurrentEngine() === 'legacy' && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={getCurrentWordCloudConfig().useAllWords || false}
                        onChange={(e) => handleWordCloudConfigChange({ ...getCurrentWordCloudConfig(), useAllWords: e.target.checked })}
                        size="small"
                      />
                    }
                    label={<Typography variant="body2">{t('wordFrequency.viz.wordCloudConfig.useAllWords')}</Typography>}
                  />
                )}
                {!(getCurrentEngine() === 'legacy' && getCurrentWordCloudConfig().useAllWords) && (
                  <NumberInput
                    label={t('collocationAnalysis.visualization.maxWords')}
                    size="small"
                    value={getCurrentWordCloudConfig().maxWords ?? 100}
                    onChange={(value) => handleWordCloudConfigChange({ ...getCurrentWordCloudConfig(), maxWords: value })}
                    min={5} max={500} step={10} integer defaultValue={100}
                    sx={{ width: 180 }}
                  />
                )}
              </>
            )}

            {/* Legacy Style */}
            {activeTab === 'wordcloud' && getCurrentEngine() === 'legacy' && (
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>{t('wordFrequency.viz.wordCloudConfig.style')}</InputLabel>
                <Select
                  value={getCurrentWordCloudConfig().style || 'default'}
                  label={t('wordFrequency.viz.wordCloudConfig.style')}
                  onChange={(e) => {
                    const newStyle = e.target.value as WordCloudStyle
                    handleWordCloudConfigChange({
                      ...getCurrentWordCloudConfig(),
                      style: newStyle,
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

            {/* Color Scheme */}
            {activeTab !== 'wordcloud' || (activeTab === 'wordcloud' && (getCurrentEngine() === 'd3' || (getCurrentEngine() === 'legacy' && (getCurrentWordCloudConfig().style === 'default' || getCurrentWordCloudConfig().style === 'mask')))) ? (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t('collocationAnalysis.visualization.colorScheme')}</InputLabel>
                <Select
                  value={activeTab === 'wordcloud'
                    ? (getCurrentWordCloudConfig().colormap || 'viridis')
                    : config.colorScheme
                  }
                  label={t('collocationAnalysis.visualization.colorScheme')}
                  onChange={(e) => {
                    if (activeTab === 'wordcloud') {
                      handleWordCloudConfigChange({ ...getCurrentWordCloudConfig(), colormap: e.target.value as any })
                    } else {
                      onConfigChange({ ...config, colorScheme: e.target.value })
                    }
                  }}
                >
                  {activeTab === 'wordcloud' ? (
                    ['viridis', 'inferno', 'plasma', 'autumn', 'winter', 'rainbow', 'ocean', 'forest', 'sunset'].map(scheme => (
                      <MenuItem key={scheme} value={scheme}>
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{scheme}</Typography>
                      </MenuItem>
                    ))
                  ) : (
                    COLOR_SCHEMES.map(scheme => (
                      <MenuItem key={scheme.value} value={scheme.value}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{
                            width: 16, height: 16, borderRadius: 0.5,
                            bgcolor: scheme.value === 'blue' ? '#2196f3' :
                              scheme.value === 'green' ? '#4caf50' :
                              scheme.value === 'purple' ? '#9c27b0' :
                              scheme.value === 'orange' ? '#ff9800' : '#f44336'
                          }} />
                          <span>{scheme.label}</span>
                        </Stack>
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            ) : null}

            {/* Show Percentage */}
            {(activeTab === 'bar' || activeTab === 'pie') && (
              <FormControlLabel
                control={
                  <Switch
                    checked={config.showPercentage}
                    onChange={(e) => onConfigChange({ ...config, showPercentage: e.target.checked })}
                    size="small"
                  />
                }
                label={<Typography variant="body2">{t('collocationAnalysis.visualization.showPercentage')}</Typography>}
              />
            )}
          </Stack>

          {/* Export buttons */}
          {data.length > 0 && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
              <Tooltip title={t('collocationAnalysis.visualization.export') + ' SVG'}>
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
              <Tooltip title={t('collocationAnalysis.visualization.export') + ' PNG'}>
                <IconButton size="small" onClick={handleExportPNG}>
                  <ImageIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Paper>
      )}

      {/* Legacy Mask Upload */}
      {activeTab === 'wordcloud' && getCurrentEngine() === 'legacy' &&
       (getCurrentWordCloudConfig().style === 'mask' || getCurrentWordCloudConfig().style === 'imageColor') && (
        <Paper elevation={0} sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
          <LegacyWordCloudConfig config={getCurrentWordCloudConfig()} onChange={handleWordCloudConfigChange} />
        </Paper>
      )}

      {/* Chart Container */}
      <Box ref={chartContainerRef} sx={{ flex: 1, overflow: 'auto', p: activeTab === 'network' ? 0 : 1 }}>
        {renderChart()}
      </Box>
    </Box>
  )
}

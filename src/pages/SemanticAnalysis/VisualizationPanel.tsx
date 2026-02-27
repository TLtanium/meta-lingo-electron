/**
 * Visualization Panel Component for Semantic Domain Analysis
 * Container for semantic domain visualizations with chart type switching
 * Design pattern follows WordFrequency/VisualizationPanel.tsx
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
  Divider
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
  SemanticAnalysisResponse,
  VisualizationConfig,
  ChartType,
  SemanticWordCloudEngine,
  SemanticWordCloudConfig
} from '../../types/semanticAnalysis'
import type { WordFrequencyResult } from '../../types/wordFrequency'
import { DEFAULT_WORDCLOUD_CONFIG, DEFAULT_LEGACY_WORDCLOUD_CONFIG } from '../../types/wordFrequency'
import BarChart from './components/BarChart'
import PieChart from './components/PieChart'
import WordCloud from '../WordFrequency/components/WordCloud'
import LegacyWordCloud from '../WordFrequency/components/LegacyWordCloud'
import LegacyWordCloudConfig from '../WordFrequency/components/LegacyWordCloudConfig'

interface VisualizationPanelProps {
  results: SemanticAnalysisResponse | null
  config: VisualizationConfig
  onConfigChange: (config: VisualizationConfig) => void
  onDomainClick?: (domain: string) => void
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' }
]

export default function VisualizationPanel({
  results,
  config,
  onConfigChange,
  onDomainClick
}: VisualizationPanelProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ChartType>(config.chartType)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Track maxItems for each chart type separately (like WordFrequency)
  const [maxItemsByType, setMaxItemsByType] = useState<Record<ChartType, number>>({
    bar: 20,
    pie: 10,
    treemap: 20,
    wordcloud: 100
  })

  // Get maxItems for current chart type
  const getCurrentMaxItems = (): number => {
    return maxItemsByType[activeTab] || config.showTopN
  }

  const getCurrentEngine = (): SemanticWordCloudEngine => {
    return config.wordCloudEngine || 'd3'
  }

  const getCurrentWordCloudConfig = (): SemanticWordCloudConfig => {
    const engine = getCurrentEngine()
    if (engine === 'd3') {
      return config.wordCloudConfig || DEFAULT_WORDCLOUD_CONFIG
    }
    return config.legacyWordCloudConfig || DEFAULT_LEGACY_WORDCLOUD_CONFIG
  }

  const handleWordCloudConfigChange = (wcConfig: SemanticWordCloudConfig) => {
    const engine = config.wordCloudEngine || 'd3'
    if (engine === 'd3') {
      onConfigChange({ ...config, wordCloudConfig: wcConfig })
    } else {
      onConfigChange({ ...config, legacyWordCloudConfig: wcConfig })
    }
  }

  const handleEngineChange = (engine: SemanticWordCloudEngine) => {
    const current = config.wordCloudEngine || 'd3'
    if (current === 'd3') {
      onConfigChange({
        ...config,
        wordCloudEngine: engine,
        legacyWordCloudConfig: config.legacyWordCloudConfig || {
          ...DEFAULT_LEGACY_WORDCLOUD_CONFIG,
          maxWords: (config.wordCloudConfig || DEFAULT_WORDCLOUD_CONFIG).maxWords ?? 100
        }
      })
    } else {
      onConfigChange({
        ...config,
        wordCloudEngine: engine,
        wordCloudConfig: config.wordCloudConfig || {
          ...DEFAULT_WORDCLOUD_CONFIG,
          maxWords: (config.legacyWordCloudConfig || DEFAULT_LEGACY_WORDCLOUD_CONFIG).maxWords ?? 100
        }
      })
    }
  }

  // Handle tab change - maintain separate maxItems for each chart type
  const handleTabChange = (_: React.SyntheticEvent, newValue: ChartType) => {
    setMaxItemsByType(prev => ({
      ...prev,
      [activeTab]: getCurrentMaxItems()
    }))
    setActiveTab(newValue)
    onConfigChange({
      ...config,
      chartType: newValue,
      showTopN: maxItemsByType[newValue] ?? (newValue === 'pie' ? 10 : newValue === 'wordcloud' ? 100 : 20)
    })
  }

  // Handle max items change
  const handleMaxItemsChange = (value: number) => {
    setMaxItemsByType(prev => ({
      ...prev,
      [activeTab]: value
    }))
    onConfigChange({ ...config, showTopN: value })
  }

  // Handle color scheme change
  const handleColorSchemeChange = (event: any) => {
    onConfigChange({ ...config, colorScheme: event.target.value })
  }

  // Handle show percentage toggle
  const handleShowPercentageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, showPercentage: event.target.checked })
  }

  // Word cloud data: by domain_name frequency; include real percentage and domain code for cross-link
  const wordCloudData = useMemo((): (WordFrequencyResult & { domain?: string })[] => {
    if (!results || results.results.length === 0) return []
    const isDomain = results.result_mode === 'domain'
    if (isDomain) {
      const rows = results.results as Array<{ domain: string; domain_name: string; frequency: number; percentage: number }>
      return rows.map((r, i) => ({
        word: r.domain_name || r.domain,
        frequency: r.frequency,
        percentage: r.percentage,
        rank: i + 1,
        domain: r.domain
      }))
    }
    const byName: Record<string, { frequency: number }> = {}
    ;(results.results as Array<{ domain_name: string; domain: string; frequency: number }>).forEach(r => {
      const name = r.domain_name || r.domain
      if (!byName[name]) byName[name] = { frequency: 0 }
      byName[name].frequency += r.frequency
    })
    const total = Object.values(byName).reduce((sum, v) => sum + v.frequency, 0)
    return Object.entries(byName)
      .sort((a, b) => b[1].frequency - a[1].frequency)
      .map(([word, { frequency }], i) => ({
        word,
        frequency,
        percentage: total > 0 ? (frequency / total) * 100 : 0,
        rank: i + 1
      }))
  }, [results])

  // Export SVG (disabled for legacy word cloud)
  const handleExportSVG = useCallback(() => {
    const container = chartContainerRef.current
    if (!container) return
    if (activeTab === 'wordcloud' && getCurrentEngine() === 'legacy') return
    const svg = container.querySelector('svg')
    if (!svg) return

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `semantic-domain-${activeTab}-chart.svg`
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
              link.download = `semantic-domain-${activeTab}-chart.png`
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
        link.download = `semantic-domain-${activeTab}-chart.png`
        link.click()

        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [activeTab])

  // Render chart based on active tab
  const renderChart = () => {
    if (!results || results.results.length === 0) {
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
            {t('semantic.viz.noData')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('semantic.viz.runAnalysisFirst')}
          </Typography>
        </Box>
      )
    }

    const isDomainMode = results.result_mode === 'domain'
    const currentMaxItems = getCurrentMaxItems()
    const colorScheme = config.colorScheme || 'blue'

    switch (activeTab) {
      case 'bar':
        return (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <BarChart
              data={results.results}
              maxItems={currentMaxItems}
              showPercentage={config.showPercentage}
              colorScheme={colorScheme}
              height={Math.max(400, currentMaxItems * 30)}
              isDomainMode={isDomainMode}
              onBarClick={onDomainClick}
            />
          </Box>
        )
      case 'pie':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <PieChart
              data={results.results}
              maxItems={currentMaxItems}
              showLegend
              donut
              colorScheme={colorScheme}
              showPercentage={config.showPercentage}
              isDomainMode={isDomainMode}
              onSliceClick={onDomainClick}
            />
          </Box>
        )
      case 'wordcloud': {
        const engine = getCurrentEngine()
        const wcConfig = getCurrentWordCloudConfig()
        const maxWords = wcConfig.maxWords ?? 100
        const dataSlice = wordCloudData.slice(0, (wcConfig as any).useAllWords ? wordCloudData.length : maxWords)
        const handleWordCloudClick = (word: string) => {
          const item = dataSlice.find(d => d.word === word) as (WordFrequencyResult & { domain?: string }) | undefined
          if (item?.domain && onDomainClick) onDomainClick(item.domain)
        }
        if (engine === 'legacy') {
          return (
            <Box sx={{ height: '100%', display: 'flex' }}>
              <LegacyWordCloud
                data={dataSlice}
                config={{
                  maxWords: maxWords,
                  useAllWords: (wcConfig as any).useAllWords || false,
                  style: wcConfig.style || 'default',
                  colormap: wcConfig.colormap,
                  maskImage: wcConfig.maskImage
                }}
                onWordClick={onDomainClick ? handleWordCloudClick : undefined}
              />
            </Box>
          )
        }
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <WordCloud
              data={dataSlice}
              config={wcConfig as any}
              onWordClick={onDomainClick ? handleWordCloudClick : undefined}
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
            label={t('semantic.viz.barChart')}
            iconPosition="start"
          />
          <Tab
            value="pie"
            icon={<PieChartIcon />}
            label={t('semantic.viz.pieChart')}
            iconPosition="start"
          />
          <Tab
            value="wordcloud"
            icon={<CloudIcon />}
            label={t('semantic.viz.wordCloud')}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Chart Settings - Same style as WordFrequency */}
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
          {/* Max Items (bar / pie only) */}
          {activeTab !== 'wordcloud' && (
            <NumberInput
              label={t('semantic.viz.maxItems')}
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

          {/* Word cloud engine */}
          {activeTab === 'wordcloud' && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>{t('semantic.viz.wordCloudEngine')}</InputLabel>
              <Select
                value={getCurrentEngine()}
                label={t('semantic.viz.wordCloudEngine')}
                onChange={(e) => handleEngineChange(e.target.value as SemanticWordCloudEngine)}
              >
                <MenuItem value="d3">{t('semantic.viz.wordCloudEngineD3')}</MenuItem>
                <MenuItem value="legacy">{t('semantic.viz.wordCloudEngineLegacy')}</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Word cloud max words */}
          {activeTab === 'wordcloud' && (
            <>
              {getCurrentEngine() === 'legacy' && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={getCurrentWordCloudConfig().useAllWords || false}
                      onChange={(e) =>
                        handleWordCloudConfigChange({
                          ...getCurrentWordCloudConfig(),
                          useAllWords: e.target.checked
                        })
                      }
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">{t('semantic.viz.useAllWords')}</Typography>}
                />
              )}
              {!(getCurrentEngine() === 'legacy' && (getCurrentWordCloudConfig().useAllWords || false)) && (
                <NumberInput
                  label={t('semantic.viz.maxWords')}
                  size="small"
                  value={getCurrentWordCloudConfig().maxWords ?? 100}
                  onChange={(v) =>
                    handleWordCloudConfigChange({
                      ...getCurrentWordCloudConfig(),
                      maxWords: v
                    })
                  }
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

          {/* Legacy word cloud style */}
          {activeTab === 'wordcloud' && getCurrentEngine() === 'legacy' && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>{t('semantic.viz.wordCloudStyle')}</InputLabel>
              <Select
                value={getCurrentWordCloudConfig().style || 'default'}
                label={t('semantic.viz.wordCloudStyle')}
                onChange={(e) => {
                  const style = e.target.value as SemanticWordCloudConfig['style']
                  handleWordCloudConfigChange({
                    ...getCurrentWordCloudConfig(),
                    style,
                    ...(style === 'default' && { maskImage: null, maskImageFile: null })
                  })
                }}
              >
                <MenuItem value="default">{t('semantic.viz.wordCloudStyleDefault')}</MenuItem>
                <MenuItem value="mask">{t('semantic.viz.wordCloudStyleMask')}</MenuItem>
                <MenuItem value="imageColor">{t('semantic.viz.wordCloudStyleImageColor')}</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Color scheme (bar/pie or word cloud) */}
          {((activeTab !== 'wordcloud') ||
            (activeTab === 'wordcloud' &&
              (getCurrentEngine() === 'd3' ||
                (getCurrentEngine() === 'legacy' &&
                  ((getCurrentWordCloudConfig().style === 'default') ||
                    getCurrentWordCloudConfig().style === 'mask'))))) && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{t('semantic.viz.colorScheme')}</InputLabel>
              <Select
                value={
                  activeTab === 'wordcloud'
                    ? (getCurrentWordCloudConfig().colormap || 'viridis')
                    : (config.colorScheme || 'blue')
                }
                label={t('semantic.viz.colorScheme')}
                onChange={(e) => {
                  if (activeTab === 'wordcloud') {
                    handleWordCloudConfigChange({
                      ...getCurrentWordCloudConfig(),
                      colormap: e.target.value as SemanticWordCloudConfig['colormap']
                    })
                  } else {
                    onConfigChange({ ...config, colorScheme: e.target.value })
                  }
                }}
              >
                {activeTab === 'wordcloud'
                  ? ['viridis', 'inferno', 'plasma', 'autumn', 'winter', 'rainbow', 'ocean', 'forest', 'sunset'].map(
                      (s) => (
                        <MenuItem key={s} value={s}>
                          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                            {s}
                          </Typography>
                        </MenuItem>
                      )
                    )
                  : COLOR_SCHEMES.map((scheme) => (
                      <MenuItem key={scheme.value} value={scheme.value}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              borderRadius: 0.5,
                              bgcolor:
                                scheme.value === 'blue'
                                  ? '#2196f3'
                                  : scheme.value === 'green'
                                    ? '#4caf50'
                                    : scheme.value === 'purple'
                                      ? '#9c27b0'
                                      : scheme.value === 'orange'
                                        ? '#ff9800'
                                        : '#f44336'
                            }}
                          />
                          <span>{scheme.label}</span>
                        </Stack>
                      </MenuItem>
                    ))}
              </Select>
            </FormControl>
          )}

          {/* Show Percentage (bar / pie only) */}
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
                <Typography variant="body2">{t('semantic.viz.showPercentage')}</Typography>
              }
            />
          )}
        </Stack>

        {/* Export buttons */}
        {results && results.results.length > 0 && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip
              title={
                activeTab === 'wordcloud' && getCurrentEngine() === 'legacy'
                  ? t('semantic.viz.svgNotSupported')
                  : t('semantic.viz.export') + ' SVG'
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
            <Tooltip title={t('semantic.viz.export') + ' PNG'}>
              <IconButton size="small" onClick={handleExportPNG}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Paper>

      {/* Legacy word cloud mask config */}
      {activeTab === 'wordcloud' &&
        getCurrentEngine() === 'legacy' &&
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
              config={getCurrentWordCloudConfig() as any}
              onChange={(c) => handleWordCloudConfigChange(c as SemanticWordCloudConfig)}
            />
          </Paper>
        )}

      {/* Chart Container - Same style as WordFrequency */}
      <Box ref={chartContainerRef} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {renderChart()}
      </Box>
    </Box>
  )
}

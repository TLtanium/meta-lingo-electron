/**
 * Visualization Panel Component for Semantic Domain Analysis
 * Container for semantic domain visualizations with chart type switching
 * Design pattern follows WordFrequency/VisualizationPanel.tsx
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
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type {
  SemanticAnalysisResponse,
  VisualizationConfig,
  ChartType
} from '../../types/semanticAnalysis'
import BarChart from './components/BarChart'
import PieChart from './components/PieChart'

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
    treemap: 20
  })

  // Get maxItems for current chart type
  const getCurrentMaxItems = (): number => {
    return maxItemsByType[activeTab] || config.showTopN
  }

  // Handle tab change - maintain separate maxItems for each chart type
  const handleTabChange = (_: React.SyntheticEvent, newValue: ChartType) => {
    // Save current maxItems for the old chart type
    setMaxItemsByType(prev => ({
      ...prev,
      [activeTab]: getCurrentMaxItems()
    }))

    setActiveTab(newValue)
    onConfigChange({
      ...config,
      chartType: newValue,
      showTopN: maxItemsByType[newValue] || (newValue === 'pie' ? 10 : 20)
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
          {/* Max Items */}
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

          {/* Color Scheme */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('semantic.viz.colorScheme')}</InputLabel>
            <Select
              value={config.colorScheme || 'blue'}
              label={t('semantic.viz.colorScheme')}
              onChange={handleColorSchemeChange}
            >
              {COLOR_SCHEMES.map(scheme => (
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
              ))}
            </Select>
          </FormControl>

          {/* Show Percentage */}
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
                {t('semantic.viz.showPercentage')}
              </Typography>
            }
          />
        </Stack>

        {/* Export buttons */}
        {results && results.results.length > 0 && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip title={t('semantic.viz.export') + ' SVG'}>
              <IconButton size="small" onClick={handleExportSVG}>
                <SaveAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('semantic.viz.export') + ' PNG'}>
              <IconButton size="small" onClick={handleExportPNG}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Paper>

      {/* Chart Container - Same style as WordFrequency */}
      <Box ref={chartContainerRef} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {renderChart()}
      </Box>
    </Box>
  )
}

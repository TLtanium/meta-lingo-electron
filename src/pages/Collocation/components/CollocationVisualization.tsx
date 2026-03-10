/**
 * Concordance visualization panel
 * Container for KWIC result visualizations with chart type switching
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Stack,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material'
import TimelineIcon from '@mui/icons-material/Timeline'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type { KWICResult, VizType } from '../../../types/collocation'
import DensityPlot from './d3/DensityPlot'
import RidgePlot from './d3/RidgePlot'

interface CollocationVisualizationProps {
  results: KWICResult[]
  corpusId: string
  activeTab?: VizType
  onActiveTabChange?: (tab: VizType) => void
}

// Visualization type labels
const VIZ_TYPE_LABELS: Record<VizType, { en: string; zh: string; icon: React.ReactElement }> = {
  densityPlot: { 
    en: 'Density Plot', 
    zh: '密度分布图',
    icon: <ShowChartIcon />
  },
  ridgePlot: { 
    en: 'Ridge Plot', 
    zh: '分组山脊图',
    icon: <TimelineIcon />
  }
}

export default function CollocationVisualization({
  results,
  activeTab: controlledActiveTab,
  onActiveTabChange
}: CollocationVisualizationProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  const [internalActiveViz, setInternalActiveViz] = useState<VizType>('densityPlot')
  const activeViz = controlledActiveTab ?? internalActiveViz
  const setActiveViz = onActiveTabChange ?? setInternalActiveViz
  const [colorScheme, setColorScheme] = useState('blue')
  const [maxDocs, setMaxDocs] = useState(10)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(400)

  // Measure chart container height for RidgePlot
  useEffect(() => {
    if (!chartContainerRef.current) return
    const el = chartContainerRef.current
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const h = Math.round(e.contentRect.height)
        if (h > 0) setContainerHeight(h)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    link.download = `collocation-${activeViz}-chart.svg`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [activeViz])

  // Export PNG — renders the full SVG to canvas (captures entire chart even if scrolled)
  const handleExportPNG = useCallback(async () => {
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    try {
      // Use SVG-to-canvas approach for full-fidelity export (no clipping by scroll)
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svg)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)

      const img = new Image()
      const svgWidth = svg.getAttribute('width') ? parseInt(svg.getAttribute('width')!) : svg.clientWidth
      const svgHeight = svg.getAttribute('height') ? parseInt(svg.getAttribute('height')!) : svg.clientHeight
      const scale = 3

      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = svgWidth * scale
        canvas.height = svgHeight * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // White background
        ctx.fillStyle = '#fafafa'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0, svgWidth, svgHeight)

        canvas.toBlob((blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `collocation-${activeViz}-chart.png`
          link.click()
          URL.revokeObjectURL(url)
        }, 'image/png')

        URL.revokeObjectURL(svgUrl)
      }
      img.src = svgUrl
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [activeViz])

  // Handle visualization type change
  const handleVizChange = (_: React.SyntheticEvent, newValue: VizType) => {
    setActiveViz(newValue)
  }

  // Color schemes
  const COLOR_SCHEMES = [
    { value: 'blue', label: isZh ? '蓝色' : 'Blue', color: '#2196f3' },
    { value: 'green', label: isZh ? '绿色' : 'Green', color: '#4caf50' },
    { value: 'purple', label: isZh ? '紫色' : 'Purple', color: '#9c27b0' },
    { value: 'orange', label: isZh ? '橙色' : 'Orange', color: '#ff9800' },
    { value: 'red', label: isZh ? '红色' : 'Red', color: '#f44336' }
  ]

  // Render visualization based on active type
  const renderVisualization = () => {
    if (results.length === 0) {
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
            {t('collocation.visualization.noData')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('collocation.visualization.runSearchFirst')}
          </Typography>
        </Box>
      )
    }

    switch (activeViz) {
      case 'densityPlot':
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <DensityPlot
              results={results}
              colorScheme={colorScheme}
            />
          </Box>
        )
      case 'ridgePlot':
        return (
          <RidgePlot
            results={results}
            colorScheme={colorScheme}
            maxDocs={maxDocs}
            containerHeight={containerHeight}
          />
        )
      default:
        return null
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Visualization Type Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={activeViz} 
          onChange={handleVizChange}
          variant="fullWidth"
        >
          <Tab 
            value="densityPlot" 
            icon={VIZ_TYPE_LABELS.densityPlot.icon} 
            label={isZh ? VIZ_TYPE_LABELS.densityPlot.zh : VIZ_TYPE_LABELS.densityPlot.en}
            iconPosition="start"
          />
          <Tab 
            value="ridgePlot" 
            icon={VIZ_TYPE_LABELS.ridgePlot.icon} 
            label={isZh ? VIZ_TYPE_LABELS.ridgePlot.zh : VIZ_TYPE_LABELS.ridgePlot.en}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Visualization Settings */}
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
          {/* Color Scheme */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{isZh ? '配色方案' : 'Color Scheme'}</InputLabel>
            <Select
              value={colorScheme}
              label={isZh ? '配色方案' : 'Color Scheme'}
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
                        bgcolor: scheme.color
                      }} 
                    />
                    <span>{scheme.label}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Max documents for ridge plot */}
          {activeViz === 'ridgePlot' && (
            <NumberInput
              label={isZh ? '显示文档数' : 'Max Docs'}
              size="small"
              value={maxDocs}
              onChange={setMaxDocs}
              min={5}
              max={50}
              step={1}
              integer
              defaultValue={10}
              sx={{ width: 130 }}
            />
          )}

          {/* Result count */}
          <Typography variant="body2" color="text.secondary">
            {isZh ? '结果数量' : 'Results'}: <strong>{results.length}</strong>
          </Typography>
        </Stack>

        {/* Export buttons */}
        {results.length > 0 && (
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

      {/* Visualization Container — scrollable for ridge plot when chart exceeds viewport */}
      <Box
        ref={chartContainerRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          // DensityPlot needs flex to fill container; RidgePlot uses explicit height
          ...(activeViz === 'densityPlot' ? {
            display: 'flex',
            flexDirection: 'column'
          } : {}),
          p: 1
        }}
      >
        {renderVisualization()}
      </Box>
    </Box>
  )
}

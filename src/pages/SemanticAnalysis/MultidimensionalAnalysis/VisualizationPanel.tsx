/**
 * MDA visualization panel — layout aligned with MetaphorAnalysis/VisualizationPanel:
 * full-width chart-type tabs on top, settings bar with export icons ("｜" divider),
 * chart area below. Charts: dimension error bars (Biber genres), text-type
 * profile (Biber 1989 centroids) and feature z-scores.
 */

import { useCallback, useRef, useState } from 'react'
import {
  Box,
  Stack,
  Tabs,
  Tab,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  FormControlLabel,
  Switch,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel
} from '@mui/material'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import SsidChartIcon from '@mui/icons-material/SsidChart'
import StackedLineChartIcon from '@mui/icons-material/StackedLineChart'
import AlignHorizontalLeftIcon from '@mui/icons-material/AlignHorizontalLeft'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import { useTranslation } from 'react-i18next'
import type { MDAResponse, MDAVisualizationConfig } from '../../../types/mdaAnalysis'
import { DIMENSION_LABELS, DIMENSION_COLORS } from './biberReference'
import DimensionChart from './charts/DimensionChart'
import TextTypeChart from './charts/TextTypeChart'
import ZScoreChart from './charts/ZScoreChart'

interface VisualizationPanelProps {
  result: MDAResponse | null
  config: MDAVisualizationConfig
  onConfigChange: (config: MDAVisualizationConfig) => void
}

export default function VisualizationPanel({ result, config, onConfigChange }: VisualizationPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [onlySalient, setOnlySalient] = useState(false)

  const hasData = !!result?.success && !!result.corpus

  const getSvg = useCallback((): SVGSVGElement | null => {
    return chartContainerRef.current?.querySelector('svg.mda-chart-svg') ?? null
  }, [])

  const exportName = `mda-${config.chartType}${config.chartType === 'dimension' ? `-d${config.dimension}` : ''}`

  const handleExportSVG = useCallback(() => {
    const svg = getSvg()
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${exportName}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }, [getSvg, exportName])

  const handleExportPNG = useCallback(() => {
    const svg = getSvg()
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const img = new Image()
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = rect.width * scale
      canvas.height = rect.height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, rect.width, rect.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = pngUrl
        link.download = `${exportName}.png`
        link.click()
        URL.revokeObjectURL(pngUrl)
      })
    }
    img.src = url
  }, [getSvg, exportName])

  const renderChart = () => {
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
            {isZh ? '暂无数据' : 'No Data'}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {isZh ? '运行分析后查看可视化' : 'Run analysis to view visualizations'}
          </Typography>
        </Box>
      )
    }

    switch (config.chartType) {
      case 'dimension':
        return (
          <DimensionChart result={result!} dimension={config.dimension} showTexts={config.showTexts} />
        )
      case 'texttype':
        return <TextTypeChart result={result!} />
      case 'zscore':
        return (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <ZScoreChart result={result!} onlySalient={onlySalient} />
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
          value={config.chartType}
          onChange={(_, v) => v && onConfigChange({ ...config, chartType: v })}
          variant="fullWidth"
        >
          <Tab
            value="dimension"
            icon={<SsidChartIcon />}
            label={t('mda.viz.dimensionChart')}
            iconPosition="start"
          />
          <Tab
            value="texttype"
            icon={<StackedLineChartIcon />}
            label={t('mda.viz.textTypeChart')}
            iconPosition="start"
          />
          <Tab
            value="zscore"
            icon={<AlignHorizontalLeftIcon />}
            label={t('mda.viz.zscoreChart')}
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
          {/* Dimension selector (dimension chart) */}
          {config.chartType === 'dimension' && (
            <>
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel>{t('mda.viz.dimension')}</InputLabel>
                <Select
                  value={config.dimension}
                  label={t('mda.viz.dimension')}
                  onChange={(e) => onConfigChange({ ...config, dimension: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map(d => (
                    <MenuItem key={d} value={d}>
                      <Box component="span" sx={{ color: DIMENSION_COLORS[d], fontWeight: 700, mr: 1 }}>
                        D{d}
                      </Box>
                      {isZh ? DIMENSION_LABELS[d].zh : DIMENSION_LABELS[d].en}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={config.showTexts}
                    onChange={(e) => onConfigChange({ ...config, showTexts: e.target.checked })}
                  />
                }
                label={
                  <Typography variant="body2">
                    {t('mda.viz.showTexts')}
                  </Typography>
                }
              />
            </>
          )}

          {/* Salient-only toggle (z-score chart) */}
          {config.chartType === 'zscore' && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={onlySalient}
                  onChange={(e) => setOnlySalient(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  {t('mda.viz.onlySalient')}
                </Typography>
              }
            />
          )}

          {/* Hint for text type chart */}
          {config.chartType === 'texttype' && (
            <Typography variant="body2" color="text.secondary">
              {t('mda.viz.textTypeHint')}
            </Typography>
          )}
        </Stack>

        {/* Export buttons */}
        {hasData && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip title={isZh ? '导出SVG' : 'Export SVG'}>
              <IconButton size="small" onClick={handleExportSVG}>
                <SaveAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={isZh ? '导出PNG' : 'Export PNG'}>
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

/**
 * Variance Dialog
 * Shows explained variance curve for LSA topic number optimization
 * D3.js implementation matching LDA's PerplexityDialog style
 */

import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import { NumberInput } from '../../../components/common'
import type { LSAOptimizeResult, LSAPreprocessConfig, LSAConfig } from '../../../types/topicModeling'
import { topicModelingApi } from '../../../api'

interface VarianceDialogProps {
  open: boolean
  onClose: () => void
  corpusId: string
  textIds: string[]
  language: string
  preprocessConfig: LSAPreprocessConfig
  lsaConfig: LSAConfig
  onOptimizeComplete: (result: LSAOptimizeResult) => void
}

const COLOR_SCHEMES = {
  default: ['#1976d2', '#4caf50', '#ff9800'],
  pastel: ['#7986cb', '#a5d6a7', '#ffcc80'],
  paired: ['#a6cee3', '#b2df8a', '#fdbf6f'],
  set3: ['#8dd3c7', '#80b1d3', '#fdb462']
}

export default function VarianceDialog({
  open,
  onClose,
  corpusId,
  textIds,
  language,
  preprocessConfig,
  lsaConfig,
  onOptimizeComplete
}: VarianceDialogProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [colorScheme, setColorScheme] = useState<keyof typeof COLOR_SCHEMES>('default')
  
  // Optimization settings
  const [topicMin, setTopicMin] = useState(2)
  const [topicMax, setTopicMax] = useState(20)
  const [topicStep, setTopicStep] = useState(1)
  
  // State
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeResult, setOptimizeResult] = useState<LSAOptimizeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Run optimization
  const handleOptimize = async () => {
    if (!corpusId || textIds.length === 0) {
      setError(t('topicModeling.lsa.selectTextsFirst', 'Please select texts first'))
      return
    }
    
    setOptimizing(true)
    setOptimizeResult(null)
    setError(null)
    
    try {
      const response = await topicModelingApi.optimizeLSATopics(
        corpusId,
        textIds,
        language,
        preprocessConfig,
        lsaConfig,
        topicMin,
        topicMax,
        topicStep
      )
      
      if (response.success && response.data) {
        if (response.data.success) {
          setOptimizeResult(response.data)
          onOptimizeComplete(response.data)
        } else {
          setError('Optimization failed')
        }
      } else {
        setError(response.error || 'Optimization failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setOptimizing(false)
    }
  }
  
  // Reset when dialog closes
  const handleClose = () => {
    setOptimizeResult(null)
    setError(null)
    onClose()
  }
  
  // Draw chart
  useEffect(() => {
    if (!open || !containerRef.current || !svgRef.current || !optimizeResult?.results?.length) return
    
    const container = containerRef.current
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const { width, height } = container.getBoundingClientRect()
    if (width === 0 || height === 0) return
    
    const margin = { top: 70, right: 60, bottom: 60, left: 70 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom
    
    if (innerWidth <= 0 || innerHeight <= 0) return
    
    const colors = COLOR_SCHEMES[colorScheme]
    
    // Create tooltip
    const tooltip = d3.select(tooltipRef.current)
      .style('position', 'fixed')
      .style('visibility', 'hidden')
      .style('background', 'rgba(0,0,0,0.85)')
      .style('color', 'white')
      .style('padding', '10px 14px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.2)')
    
    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lsa.optimizeTitle', 'Topic Number Optimization'))
    
    // Subtitle
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lsa.varianceCurve', 'Explained Variance Ratio'))
    
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
    
    // X scale
    const xScale = d3.scaleLinear()
      .domain(d3.extent(optimizeResult.results, d => d.num_topics) as [number, number])
      .range([0, innerWidth])
    
    // Y scale for variance (0 to max cumulative variance, capped at 1.0)
    const maxVariance = Math.min(1.0, d3.max(optimizeResult.results, d => d.cumulative_variance) || 1.0)
    const yScale = d3.scaleLinear()
      .domain([0, maxVariance * 1.1])
      .range([innerHeight, 0])
    
    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(yScale.ticks(6))
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '3,3')
    
    // Draw cumulative variance line
    const varianceLine = d3.line<typeof optimizeResult.results[0]>()
      .x(d => xScale(d.num_topics))
      .y(d => yScale(d.cumulative_variance))
      .curve(d3.curveMonotoneX)
    
    g.append('path')
      .datum(optimizeResult.results)
      .attr('fill', 'none')
      .attr('stroke', colors[0])
      .attr('stroke-width', 2.5)
      .attr('d', varianceLine)
    
    // Variance points
    g.selectAll('.variance-point')
      .data(optimizeResult.results)
      .join('circle')
      .attr('class', 'variance-point')
      .attr('cx', d => xScale(d.num_topics))
      .attr('cy', d => yScale(d.cumulative_variance))
      .attr('r', 6)
      .attr('fill', colors[0])
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this).attr('r', 9)
        tooltip
          .style('visibility', 'visible')
          .html(`<strong>${t('topicModeling.lsa.params.numTopics')}: ${d.num_topics}</strong><br/>${t('topicModeling.lsa.results.variance')}: ${(d.cumulative_variance * 100).toFixed(2)}%`)
      })
      .on('mousemove', function(event) {
        tooltip
          .style('top', (event.pageY + 10) + 'px')
          .style('left', (event.pageX + 10) + 'px')
      })
      .on('mouseout', function() {
        d3.select(this).attr('r', 6)
        tooltip.style('visibility', 'hidden')
      })
    
    // Draw 90% threshold line
    const threshold = 0.9
    if (maxVariance >= threshold) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(threshold))
        .attr('y2', yScale(threshold))
        .attr('stroke', colors[1])
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5,5')
      
      g.append('text')
        .attr('x', innerWidth - 5)
        .attr('y', yScale(threshold) - 5)
        .attr('text-anchor', 'end')
        .attr('font-size', '10px')
        .attr('fill', colors[1])
        .text('90%')
    }
    
    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(optimizeResult.results.length).tickFormat(d => String(d)))
      .selectAll('text')
      .attr('font-size', '11px')
    
    // Y axis
    const yAxis = g.append('g')
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `${(Number(d) * 100).toFixed(0)}%`))
    
    yAxis.selectAll('text').attr('font-size', '11px')
    
    yAxis.append('text')
      .attr('fill', colors[0])
      .attr('transform', 'rotate(-90)')
      .attr('y', -55)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(t('topicModeling.lsa.results.explainedVariance', 'Explained Variance'))
    
    // X axis label
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lsa.params.numTopics', 'Number of Topics'))
    
    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + 20}, ${margin.top - 5})`)
    
    const legendItems = [
      { label: t('topicModeling.lsa.results.cumulativeVariance', 'Cumulative Variance'), color: colors[0] },
      { label: '90% ' + t('topicModeling.lsa.results.threshold', 'Threshold'), color: colors[1] }
    ]
    
    legendItems.forEach((item, i) => {
      const row = legend.append('g')
        .attr('transform', `translate(${i * 200}, 0)`)
      
      row.append('line')
        .attr('x1', 0)
        .attr('x2', 24)
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', item.color)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', i === 1 ? '5,5' : 'none')
      
      if (i === 0) {
        row.append('circle')
          .attr('cx', 12)
          .attr('cy', 0)
          .attr('r', 5)
          .attr('fill', item.color)
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5)
      }
      
      row.append('text')
        .attr('x', 30)
        .attr('y', 4)
        .attr('font-size', '11px')
        .attr('fill', '#444')
        .text(item.label)
    })
    
  }, [open, optimizeResult, colorScheme, t])
  
  // Export SVG
  const handleExportSVG = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = 'lsa-variance-curve.svg'
    link.click()
    
    URL.revokeObjectURL(url)
  }, [])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(container, {
        backgroundColor: '#fafafa',
        scale: 3,
        useCORS: true
      })
      
      canvas.toBlob((blob) => {
        if (!blob) return
        
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'lsa-variance-curve.png'
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [])
  
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '85vh', maxHeight: 700 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">
            {t('topicModeling.lsa.optimizeTitle', 'Topic Number Optimization')}
          </Typography>
          {optimizeResult?.best_topic_count && (
            <Chip
              label={`${t('topicModeling.lsa.bestTopics', 'Recommended')}: ${optimizeResult.best_topic_count} topics`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      {/* Settings bar - only show when no result or when result exists */}
      {(!optimizeResult || optimizeResult.results.length === 0) && (
        <Box sx={{ px: 3, py: 1.5, bgcolor: 'action.hover', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            {t('topicModeling.lsa.optimizeDesc', 'Test different topic numbers to find the optimal value based on explained variance.')}
          </Typography>
        </Box>
      )}
      
      {/* Chart settings bar - only show when result exists */}
      {optimizeResult && optimizeResult.results.length > 0 && (
        <Box sx={{ px: 3, py: 1.5, bgcolor: 'action.hover', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>{t('topicModeling.lsa.viz.colors', 'Colors')}</InputLabel>
              <Select
                value={colorScheme}
                label={t('topicModeling.lsa.viz.colors', 'Colors')}
                onChange={(e) => setColorScheme(e.target.value as keyof typeof COLOR_SCHEMES)}
              >
                <MenuItem value="default">Default</MenuItem>
                <MenuItem value="pastel">Pastel</MenuItem>
                <MenuItem value="paired">Paired</MenuItem>
                <MenuItem value="set3">Set3</MenuItem>
              </Select>
            </FormControl>
            
            <Stack direction="row" spacing={0.5}>
              <Tooltip title={t('wordFrequency.viz.export', 'Export') + ' SVG'}>
                <IconButton size="small" onClick={handleExportSVG}>
                  <SaveAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('wordFrequency.viz.export', 'Export') + ' PNG'}>
                <IconButton size="small" onClick={handleExportPNG}>
                  <ImageIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        </Box>
      )}
      
      <DialogContent dividers sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {optimizing ? (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            gap: 2,
            p: 4
          }}>
            <CircularProgress size={60} />
            <Typography variant="h6" color="text.secondary">
              {t('topicModeling.lsa.optimizing', 'Optimizing...')}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {t('topicModeling.lsa.optimizeProgress', 'Testing different topic numbers. This may take a while.')}
            </Typography>
          </Box>
        ) : optimizeResult && optimizeResult.results.length > 0 ? (
          <Box
            ref={containerRef}
            sx={{
              width: '100%',
              height: '100%',
              bgcolor: '#fafafa',
              position: 'relative',
              minHeight: 500
            }}
          >
            <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
            <div ref={tooltipRef} />
          </Box>
        ) : (
          <Box sx={{ p: 3 }}>
            {error && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: 'error.light', borderRadius: 1 }}>
                <Typography variant="body2" color="error.dark">
                  {error}
                </Typography>
              </Box>
            )}
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('topicModeling.lsa.optimizeDesc', 'Test different topic numbers to find the optimal value based on explained variance.')}
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={2}>
                <NumberInput
                  label={t('topicModeling.lsa.topicMin', 'Min Topics')}
                  value={topicMin}
                  onChange={setTopicMin}
                  min={2}
                  max={50}
                  integer
                  size="small"
                  sx={{ flex: 1 }}
                />
                <NumberInput
                  label={t('topicModeling.lsa.topicMax', 'Max Topics')}
                  value={topicMax}
                  onChange={setTopicMax}
                  min={3}
                  max={100}
                  integer
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Stack>
              <NumberInput
                label={t('topicModeling.lsa.topicStep', 'Step')}
                value={topicStep}
                onChange={setTopicStep}
                min={1}
                max={10}
                integer
                size="small"
                sx={{ width: '50%' }}
              />
            </Stack>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        {optimizeResult && optimizeResult.results.length > 0 ? (
          <Button onClick={handleClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={optimizing}>{t('common.cancel')}</Button>
            <Button 
              onClick={handleOptimize} 
              variant="contained" 
              startIcon={optimizing ? <CircularProgress size={20} color="inherit" /> : <AutoGraphIcon />}
              disabled={optimizing}
            >
              {t('topicModeling.lsa.runOptimize', 'Run Optimization')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}

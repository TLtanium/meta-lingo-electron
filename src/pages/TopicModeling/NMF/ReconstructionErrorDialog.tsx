/**
 * Reconstruction Error Dialog for NMF Topic Optimization
 * D3.js line chart showing reconstruction error curve with optimal point annotation
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Stack,
  Button,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Chip,
  CircularProgress,
  Alert
} from '@mui/material'
import { NumberInput } from '../../../components/common'
import CloseIcon from '@mui/icons-material/Close'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import StarIcon from '@mui/icons-material/Star'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import type { NMFOptimizeResult } from '../../../types/topicModeling'

interface ReconstructionErrorDialogProps {
  open: boolean
  onClose: () => void
  optimizing: boolean
  optimizeResult: NMFOptimizeResult | null
  topicMin: number
  topicMax: number
  topicStep: number
  onTopicMinChange: (val: number) => void
  onTopicMaxChange: (val: number) => void
  onTopicStepChange: (val: number) => void
  onRunOptimize: () => void
  error: string | null
}

const COLOR_SCHEMES = {
  default: ['#1976d2', '#f44336'],
  pastel: ['#7986cb', '#ef9a9a'],
  paired: ['#a6cee3', '#fb9a99'],
  set3: ['#8dd3c7', '#fb8072']
}

export default function ReconstructionErrorDialog({
  open,
  onClose,
  optimizing,
  optimizeResult,
  topicMin,
  topicMax,
  topicStep,
  onTopicMinChange,
  onTopicMaxChange,
  onTopicStepChange,
  onRunOptimize,
  error
}: ReconstructionErrorDialogProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [colorScheme, setColorScheme] = useState<keyof typeof COLOR_SCHEMES>('default')
  
  // Draw chart
  useEffect(() => {
    if (!open || !containerRef.current || !svgRef.current || !optimizeResult?.results?.length) return
    
    const container = containerRef.current
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const { width, height } = container.getBoundingClientRect()
    const margin = { top: 70, right: 50, bottom: 60, left: 80 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom
    
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
      .text(t('topicModeling.nmf.optimizeTitle', 'Topic Number Optimization'))
    
    // Subtitle
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.nmf.reconstructionErrorCurve', 'Reconstruction Error Curve'))
    
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
    
    const data = optimizeResult.results
    
    // X scale
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.num_topics) as [number, number])
      .range([0, innerWidth])
    
    // Y scale for reconstruction error
    const errorExtent = d3.extent(data, d => d.reconstruction_error) as [number, number]
    const yPadding = (errorExtent[1] - errorExtent[0]) * 0.1
    const yScale = d3.scaleLinear()
      .domain([errorExtent[0] - yPadding, errorExtent[1] + yPadding])
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
    
    // Draw line
    const line = d3.line<typeof data[0]>()
      .x(d => xScale(d.num_topics))
      .y(d => yScale(d.reconstruction_error))
      .curve(d3.curveMonotoneX)
    
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', colors[0])
      .attr('stroke-width', 2.5)
      .attr('d', line)
    
    // Data points
    g.selectAll('.data-point')
      .data(data)
      .join('circle')
      .attr('class', 'data-point')
      .attr('cx', d => xScale(d.num_topics))
      .attr('cy', d => yScale(d.reconstruction_error))
      .attr('r', d => d.num_topics === optimizeResult.best_topic_count ? 10 : 6)
      .attr('fill', d => d.num_topics === optimizeResult.best_topic_count ? colors[1] : colors[0])
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this).attr('r', d.num_topics === optimizeResult.best_topic_count ? 13 : 9)
        tooltip
          .style('visibility', 'visible')
          .html(`
            <strong>${t('topicModeling.nmf.numTopics', 'Topics')}: ${d.num_topics}</strong><br/>
            ${t('topicModeling.nmf.reconstructionError', 'Reconstruction Error')}: ${d.reconstruction_error.toFixed(4)}
            ${d.num_topics === optimizeResult.best_topic_count ? `<br/><span style="color: #f44336; font-weight: bold;">${t('topicModeling.nmf.optimal', 'Optimal')}</span>` : ''}
          `)
      })
      .on('mousemove', function(event) {
        tooltip
          .style('top', (event.clientY - 10) + 'px')
          .style('left', (event.clientX + 15) + 'px')
      })
      .on('mouseout', function(_, d) {
        d3.select(this).attr('r', d.num_topics === optimizeResult.best_topic_count ? 10 : 6)
        tooltip.style('visibility', 'hidden')
      })
    
    // Optimal point annotation with star
    if (optimizeResult.best_topic_count) {
      const optimalData = data.find(d => d.num_topics === optimizeResult.best_topic_count)
      if (optimalData) {
        const optX = xScale(optimalData.num_topics)
        const optY = yScale(optimalData.reconstruction_error)
        
        // Star marker for optimal point
        const starSize = 12
        g.append('text')
          .attr('x', optX)
          .attr('y', optY - 20)
          .attr('text-anchor', 'middle')
          .attr('font-size', '20px')
          .attr('fill', colors[1])
          .text('\u2605')  // Unicode star
        
        // Annotation line
        g.append('line')
          .attr('x1', optX)
          .attr('y1', optY - 15)
          .attr('x2', optX)
          .attr('y2', optY + 15)
          .attr('stroke', colors[1])
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,2')
        
        // Annotation text
        g.append('text')
          .attr('x', optX)
          .attr('y', optY - 35)
          .attr('text-anchor', 'middle')
          .attr('font-size', '11px')
          .attr('font-weight', 'bold')
          .attr('fill', colors[1])
          .text(`${t('topicModeling.nmf.optimal', 'Optimal')}: ${optimalData.num_topics} ${t('topicModeling.nmf.topics', 'topics')}`)
      }
    }
    
    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(data.length).tickFormat(d => String(d)))
      .selectAll('text')
      .attr('font-size', '11px')
    
    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => d3.format('.2f')(d as number)))
      .selectAll('text')
      .attr('font-size', '11px')
    
    // X axis label
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.nmf.numTopicsLabel', 'Number of Topics'))
    
    // Y axis label
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(height / 2))
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.nmf.reconstructionError', 'Reconstruction Error'))
    
    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + 20}, ${margin.top - 5})`)
    
    // Error line legend
    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 24)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', colors[0])
      .attr('stroke-width', 2.5)
    
    legend.append('circle')
      .attr('cx', 12)
      .attr('cy', 0)
      .attr('r', 5)
      .attr('fill', colors[0])
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)
    
    legend.append('text')
      .attr('x', 30)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('fill', '#444')
      .text(`${t('topicModeling.nmf.reconstructionError', 'Reconstruction Error')} (${t('topicModeling.nmf.lowerBetter', 'lower is better')})`)
    
    // Optimal point legend
    legend.append('text')
      .attr('x', 260)
      .attr('y', 4)
      .attr('font-size', '14px')
      .attr('fill', colors[1])
      .text('\u2605')
    
    legend.append('text')
      .attr('x', 278)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('fill', '#444')
      .text(t('topicModeling.nmf.optimalPoint', 'Optimal Point'))
    
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
    link.download = 'nmf-reconstruction-error-curve.svg'
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
        link.download = 'nmf-reconstruction-error-curve.png'
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (err) {
      console.error('Failed to export PNG:', err)
    }
  }, [])
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '85vh', maxHeight: 700 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">
            {t('topicModeling.nmf.optimizeTitle', 'Topic Number Optimization')}
          </Typography>
          {optimizeResult?.best_topic_count && (
            <Chip
              icon={<StarIcon sx={{ fontSize: 16 }} />}
              label={`${t('topicModeling.nmf.optimal', 'Optimal')}: ${optimizeResult.best_topic_count} ${t('topicModeling.nmf.topics', 'topics')}`}
              size="small"
              color="error"
              variant="outlined"
            />
          )}
        </Stack>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      {/* Settings bar - only show when no result */}
      {(!optimizeResult || optimizeResult.results.length === 0) && (
        <Box sx={{ px: 3, py: 1.5, bgcolor: 'action.hover', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {t('topicModeling.nmf.optimizeDesc', 'Test different topic numbers to find the optimal value based on reconstruction error (lower is better).')}
            </Typography>
          </Stack>
        </Box>
      )}
      
      {/* Chart settings bar - only show when result exists */}
      {optimizeResult && optimizeResult.results.length > 0 && (
        <Box sx={{ px: 3, py: 1.5, bgcolor: 'action.hover', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>{t('topicModeling.nmf.viz.colors', 'Colors')}</InputLabel>
              <Select
                value={colorScheme}
                label={t('topicModeling.nmf.viz.colors', 'Colors')}
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
              {t('topicModeling.nmf.optimizing', 'Optimizing...')}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {t('topicModeling.nmf.optimizeProgress', 'Testing different topic numbers. This may take a while.')}
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
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('topicModeling.nmf.optimizeDesc', 'Test different topic numbers to find the optimal value based on reconstruction error (lower is better).')}
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={2}>
                <NumberInput
                  label={t('topicModeling.nmf.topicMin', 'Min Topics')}
                  value={topicMin}
                  onChange={onTopicMinChange}
                  min={2}
                  max={50}
                  integer
                  size="small"
                  sx={{ flex: 1 }}
                />
                <NumberInput
                  label={t('topicModeling.nmf.topicMax', 'Max Topics')}
                  value={topicMax}
                  onChange={onTopicMaxChange}
                  min={3}
                  max={100}
                  integer
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Stack>
              <NumberInput
                label={t('topicModeling.nmf.topicStep', 'Step')}
                value={topicStep}
                onChange={onTopicStepChange}
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
          <Button onClick={onClose}>{t('common.close', 'Close')}</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={optimizing}>{t('common.cancel', 'Cancel')}</Button>
            <Button 
              onClick={onRunOptimize} 
              variant="contained" 
              startIcon={optimizing ? <CircularProgress size={20} color="inherit" /> : <AutoGraphIcon />}
              disabled={optimizing}
            >
              {t('topicModeling.nmf.runOptimize', 'Run Optimization')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}

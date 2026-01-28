/**
 * Perplexity Curve Dialog
 * Shows topic optimization results with perplexity and coherence curves
 * BERTopic style
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
  Divider,
  Chip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import type { LDAOptimizeResult } from '../../../types/topicModeling'
import { useResizeObserver, useTooltip } from '../components/visualizations/d3/useD3'

interface PerplexityDialogProps {
  open: boolean
  onClose: () => void
  data: LDAOptimizeResult | null
}

const COLOR_SCHEMES = {
  default: ['#1976d2', '#dc004e', '#4caf50'],
  pastel: ['#7986cb', '#f48fb1', '#a5d6a7'],
  paired: ['#a6cee3', '#fb9a99', '#b2df8a'],
  set3: ['#8dd3c7', '#fb8072', '#80b1d3']
}

export default function PerplexityDialog({ open, onClose, data }: PerplexityDialogProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [colorScheme, setColorScheme] = useState<keyof typeof COLOR_SCHEMES>('default')
  const dimensions = useResizeObserver(containerRef)
  const tooltip = useTooltip()
  
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
    link.download = 'lda-perplexity-curve.svg'
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
        link.download = 'lda-perplexity-curve.png'
        link.click()
        
        URL.revokeObjectURL(url)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [])
  
  // Render chart function
  const renderChart = useCallback(() => {
    if (!svgRef.current || !dimensions || !data?.results?.length) return
    
    const { width, height } = dimensions
    if (width === 0 || height === 0) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const margin = { top: 70, right: 80, bottom: 60, left: 70 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom
    
    if (innerWidth <= 0 || innerHeight <= 0) return
    
    const colors = COLOR_SCHEMES[colorScheme]
    
    // Title - BERTopic style (consistent with other visualizations)
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lda.viz.perplexity', 'Topic Number Optimization'))
    
    // Subtitle
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.perplexityCoherence', 'Perplexity & Coherence Scores'))
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
    
    // X scale
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data.results, d => d.num_topics) as [number, number])
      .range([0, innerWidth])
    
    // Filter valid data
    const perplexityData = data.results.filter(d => d.perplexity !== null)
    const coherenceData = data.results.filter(d => d.coherence !== null)
    
    // Y scales for perplexity (left axis)
    const perplexityExtent = d3.extent(perplexityData, d => d.perplexity) as [number, number]
    const yPerplexity = d3.scaleLinear()
      .domain([perplexityExtent[0] * 0.9, perplexityExtent[1] * 1.1])
      .range([innerHeight, 0])
    
    // Y scale for coherence (right axis)
    const coherenceExtent = d3.extent(coherenceData, d => d.coherence) as [number, number]
    const yCoherence = d3.scaleLinear()
      .domain([coherenceExtent[0] * 0.9, coherenceExtent[1] * 1.1])
      .range([innerHeight, 0])
    
    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(yPerplexity.ticks(6))
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yPerplexity(d))
      .attr('y2', d => yPerplexity(d))
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '3,3')
    
    // Draw perplexity line
    if (perplexityData.length > 0) {
      const perplexityLine = d3.line<typeof data.results[0]>()
        .x(d => xScale(d.num_topics))
        .y(d => yPerplexity(d.perplexity!))
        .curve(d3.curveMonotoneX)
      
      g.append('path')
        .datum(perplexityData)
        .attr('fill', 'none')
        .attr('stroke', colors[0])
        .attr('stroke-width', 2.5)
        .attr('d', perplexityLine)
      
      // Perplexity points
      g.selectAll('.perplexity-point')
        .data(perplexityData)
        .join('circle')
        .attr('class', 'perplexity-point')
        .attr('cx', d => xScale(d.num_topics))
        .attr('cy', d => yPerplexity(d.perplexity!))
        .attr('r', 6)
        .attr('fill', colors[0])
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('cursor', 'pointer')
        .on('mouseenter', function(event, d) {
          d3.select(this).attr('r', 9)
          tooltip.show(`
            <div style="margin-bottom:4px;">
              <span style="display:inline-block;width:10px;height:10px;background:${colors[0]};border-radius:2px;margin-right:8px;"></span>
              <span style="font-weight:bold;color:${colors[0]}">${t('topicModeling.lda.results.perplexity')}</span>
            </div>
            <div style="color:#555;">
              <span style="font-weight:500;">${t('topicModeling.lda.params.numTopics')}:</span> 
              <span style="font-weight:bold;color:#333">${d.num_topics}</span>
            </div>
            <div style="color:#555;">
              <span style="font-weight:500;">${t('topicModeling.visualization.score', 'Score')}:</span> 
              <span style="font-weight:bold;color:#333">${d.perplexity?.toFixed(2)}</span>
            </div>
          `, event as unknown as MouseEvent)
        })
        .on('mousemove', function(event) {
          tooltip.move(event as unknown as MouseEvent)
        })
        .on('mouseleave', function() {
          d3.select(this).attr('r', 6)
          tooltip.hide()
        })
    }
    
    // Draw coherence line
    if (coherenceData.length > 0) {
      const coherenceLine = d3.line<typeof data.results[0]>()
        .x(d => xScale(d.num_topics))
        .y(d => yCoherence(d.coherence!))
        .curve(d3.curveMonotoneX)
      
      g.append('path')
        .datum(coherenceData)
        .attr('fill', 'none')
        .attr('stroke', colors[1])
        .attr('stroke-width', 2.5)
        .attr('d', coherenceLine)
      
      // Coherence points
      g.selectAll('.coherence-point')
        .data(coherenceData)
        .join('circle')
        .attr('class', 'coherence-point')
        .attr('cx', d => xScale(d.num_topics))
        .attr('cy', d => yCoherence(d.coherence!))
        .attr('r', 6)
        .attr('fill', colors[1])
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('cursor', 'pointer')
        .on('mouseenter', function(event, d) {
          d3.select(this).attr('r', 9)
          tooltip.show(`
            <div style="margin-bottom:4px;">
              <span style="display:inline-block;width:10px;height:10px;background:${colors[1]};border-radius:2px;margin-right:8px;"></span>
              <span style="font-weight:bold;color:${colors[1]}">${t('topicModeling.lda.results.coherence')}</span>
            </div>
            <div style="color:#555;">
              <span style="font-weight:500;">${t('topicModeling.lda.params.numTopics')}:</span> 
              <span style="font-weight:bold;color:#333">${d.num_topics}</span>
            </div>
            <div style="color:#555;">
              <span style="font-weight:500;">${t('topicModeling.visualization.score', 'Score')}:</span> 
              <span style="font-weight:bold;color:#333">${d.coherence?.toFixed(4)}</span>
            </div>
          `, event as unknown as MouseEvent)
        })
        .on('mousemove', function(event) {
          tooltip.move(event as unknown as MouseEvent)
        })
        .on('mouseleave', function() {
          d3.select(this).attr('r', 6)
          tooltip.hide()
        })
    }
    
    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(data.results.length).tickFormat(d => String(d)))
      .selectAll('text')
      .attr('font-size', '11px')
    
    // Left Y axis (Perplexity)
    const leftAxis = g.append('g')
      .call(d3.axisLeft(yPerplexity).ticks(6))
    
    leftAxis.selectAll('text').attr('font-size', '11px')
    leftAxis.selectAll('path, line').attr('stroke', colors[0])
    
    leftAxis.append('text')
      .attr('fill', colors[0])
      .attr('transform', 'rotate(-90)')
      .attr('y', -55)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(t('topicModeling.lda.results.perplexity'))
    
    // Right Y axis (Coherence)
    const rightAxis = g.append('g')
      .attr('transform', `translate(${innerWidth}, 0)`)
      .call(d3.axisRight(yCoherence).ticks(6))
    
    rightAxis.selectAll('text').attr('font-size', '11px')
    rightAxis.selectAll('path, line').attr('stroke', colors[1])
    
    rightAxis.append('text')
      .attr('fill', colors[1])
      .attr('transform', 'rotate(-90)')
      .attr('y', 55)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(t('topicModeling.lda.results.coherence'))
    
    // X axis label
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.params.numTopics', 'Number of Topics'))
    
    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + 20}, ${margin.top - 5})`)
    
    const legendItems = [
      { label: `${t('topicModeling.lda.results.perplexity')} (${t('topicModeling.lda.lowerBetter', 'lower is better')})`, color: colors[0] },
      { label: `${t('topicModeling.lda.results.coherence')} (${t('topicModeling.lda.higherBetter', 'higher is better')})`, color: colors[1] }
    ]
    
    legendItems.forEach((item, i) => {
      const row = legend.append('g')
        .attr('transform', `translate(${i * 240}, 0)`)
      
      row.append('line')
        .attr('x1', 0)
        .attr('x2', 24)
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', item.color)
        .attr('stroke-width', 2.5)
      
      row.append('circle')
        .attr('cx', 12)
        .attr('cy', 0)
        .attr('r', 5)
        .attr('fill', item.color)
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
      
      row.append('text')
        .attr('x', 30)
        .attr('y', 4)
        .attr('font-size', '11px')
        .attr('fill', '#444')
        .text(item.label)
    })
    
  }, [dimensions, data, colorScheme, tooltip, t])
  
  // Trigger render when dimensions change
  useEffect(() => {
    if (open && dimensions) {
      renderChart()
    }
  }, [open, dimensions, renderChart])
  
  if (!data?.results?.length) return null
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh', maxHeight: 600 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">
            {t('topicModeling.lda.viz.perplexity')}
          </Typography>
          {data.best_by_coherence && (
            <Chip
              label={`${t('topicModeling.lda.bestCoherence', 'Best Coherence')}: ${data.best_by_coherence.num_topics} topics`}
              size="small"
              color="secondary"
              variant="outlined"
            />
          )}
          {data.best_by_perplexity && (
            <Chip
              label={`${t('topicModeling.lda.bestPerplexity', 'Best Perplexity')}: ${data.best_by_perplexity.num_topics} topics`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      {/* Settings bar */}
      <Box sx={{ px: 3, py: 1, bgcolor: 'action.hover', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{t('topicModeling.lda.viz.colors')}</InputLabel>
            <Select
              value={colorScheme}
              label={t('topicModeling.lda.viz.colors')}
              onChange={(e) => setColorScheme(e.target.value as keyof typeof COLOR_SCHEMES)}
            >
              <MenuItem value="default">Default</MenuItem>
              <MenuItem value="pastel">Pastel</MenuItem>
              <MenuItem value="paired">Paired</MenuItem>
              <MenuItem value="set3">Set3</MenuItem>
            </Select>
          </FormControl>
          
          <Stack direction="row" spacing={0.5}>
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
        </Stack>
      </Box>
      
      <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex' }}>
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            width: '100%',
            height: '100%',
            bgcolor: '#fafafa',
            overflow: 'hidden',
            display: 'flex',
            '& svg': {
              display: 'block',
              width: '100%',
              height: '100%'
            }
          }}
        >
          {dimensions && dimensions.width > 0 && dimensions.height > 0 && (
            <svg 
              ref={svgRef} 
              width={dimensions.width} 
              height={dimensions.height}
              style={{ background: '#fafafa' }}
            />
          )}
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * LDA Similarity Heatmap
 * D3.js implementation showing topic similarity matrix
 * Plotly-style blue gradient color scheme
 */

import { useRef, useEffect, useState } from 'react'
import { Box, Typography, CircularProgress, Alert } from '@mui/material'
import * as d3 from 'd3'
import { useTranslation } from 'react-i18next'
import type { LDAHeatmapData } from '../../../../types/topicModeling'

interface LDASimilarityHeatmapProps {
  data: LDAHeatmapData | null
  loading?: boolean
  error?: string | null
}

// Plotly-style blue color scale for similarity
const BLUE_COLORS = [
  '#f7fbff', '#e3f2fd', '#bbdefb', '#90caf9', 
  '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', 
  '#1976d2', '#1565c0'
]

// Helper to truncate text
const truncateText = (text: string, maxLen: number) => {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 2) + '...'
}

export default function LDASimilarityHeatmap({
  data,
  loading = false,
  error = null
}: LDASimilarityHeatmapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, content: string } | null>(null)

  // Observe container size changes
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width, height })
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [])

  // Render chart
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return
    if (!data || !data.data || data.data.length === 0) return

    const { width, height } = dimensions
    const margin = { top: 70, right: 80, bottom: 100, left: 100 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { labels, data: heatmapData, min_value = 0, max_value = 1 } = data
    const n = labels.length

    // Calculate cell size
    const cellWidth = innerWidth / n
    const cellHeight = innerHeight / n

    // Title - consistent with other LDA charts (18px)
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lda.viz.similarityMatrix', 'Similarity Matrix'))

    // Subtitle
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.similarityMatrixSubtitle', 'Topic Similarity Matrix Based on Keywords'))

    // Main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Blue gradient color scale
    const colorScale = d3.scaleLinear<string>()
      .domain(BLUE_COLORS.map((_, i) => min_value + (i / (BLUE_COLORS.length - 1)) * (max_value - min_value)))
      .range(BLUE_COLORS)
      .clamp(true)

    const getColor = (value: number) => colorScale(value)

    // Draw cells
    const cells = g.selectAll('.cell')
      .data(heatmapData)
      .join('rect')
      .attr('class', 'cell')
      .attr('x', d => d[1] * cellWidth)
      .attr('y', d => d[0] * cellHeight)
      .attr('width', cellWidth - 1)
      .attr('height', cellHeight - 1)
      .attr('fill', '#f7fbff')
      .attr('rx', 1)
      .style('cursor', 'pointer')

    // Animate cells
    cells.transition()
      .duration(400)
      .delay((_, i) => i * 1)
      .attr('fill', d => getColor(d[2]))

    // Highlight diagonal cells (self-similarity = 1.0)
    cells.filter(d => d[0] === d[1])
      .attr('stroke', '#1565c0')
      .attr('stroke-width', 1)

    // Add value labels inside cells (only if cells are large enough)
    const minCellSizeForText = 25
    if (cellWidth >= minCellSizeForText && cellHeight >= minCellSizeForText) {
      g.selectAll('.cell-value')
        .data(heatmapData)
        .join('text')
        .attr('class', 'cell-value')
        .attr('x', d => d[1] * cellWidth + cellWidth / 2)
        .attr('y', d => d[0] * cellHeight + cellHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', Math.min(10, cellWidth / 4, cellHeight / 3))
        .attr('font-weight', '500')
        .attr('fill', d => d[2] > 0.5 ? '#fff' : '#333')
        .attr('pointer-events', 'none')
        .attr('opacity', 0)
        .text(d => d[2].toFixed(2))
        .transition()
        .duration(400)
        .delay((_, i) => 400 + i * 1)
        .attr('opacity', 1)
    }

    // Cell hover interactions
    cells
      .on('mouseenter', function(event, d) {
        d3.select(this)
          .attr('stroke', '#333')
          .attr('stroke-width', 2)

        const rowLabel = labels[d[0]] || t('topicModeling.lda.viz.topicLabel', 'Topic {{topicId}}', { topicId: d[0] })
        const colLabel = labels[d[1]] || t('topicModeling.lda.viz.topicLabel', 'Topic {{topicId}}', { topicId: d[1] })
        const value = d[2]

        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          setTooltipData({
            x: event.clientX - rect.left + 10,
            y: event.clientY - rect.top - 10,
            content: `${rowLabel} ${t('topicModeling.lda.viz.vs', 'vs')} ${colLabel}: ${value.toFixed(4)}`
          })
        }
      })
      .on('mousemove', (event) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          setTooltipData(prev => prev ? {
            ...prev,
            x: event.clientX - rect.left + 10,
            y: event.clientY - rect.top - 10
          } : null)
        }
      })
      .on('mouseleave', function(_, d) {
        d3.select(this)
          .attr('stroke', d[0] === d[1] ? '#1565c0' : 'none')
          .attr('stroke-width', d[0] === d[1] ? 1 : 0)
        setTooltipData(null)
      })

    // Row labels (left)
    g.selectAll('.row-label')
      .data(labels)
      .join('text')
      .attr('class', 'row-label')
      .attr('x', -8)
      .attr('y', (_, i) => i * cellHeight + cellHeight / 2)
      .attr('text-anchor', 'end')
      .attr('dy', '0.35em')
      .attr('font-size', Math.min(11, cellHeight - 2))
      .attr('fill', '#444')
      .text(d => truncateText(d, 15))
      .attr('opacity', 0)
      .transition()
      .duration(400)
      .delay((_, i) => 400 + i * 15)
      .attr('opacity', 1)

    // Column labels (bottom) - rotated 45 degrees
    g.selectAll('.col-label')
      .data(labels)
      .join('text')
      .attr('class', 'col-label')
      .attr('x', (_, i) => i * cellWidth + cellWidth / 2)
      .attr('y', innerHeight + 8)
      .attr('text-anchor', 'start')
      .attr('transform', (_, i) => `rotate(45, ${i * cellWidth + cellWidth / 2}, ${innerHeight + 8})`)
      .attr('font-size', Math.min(11, cellWidth - 2))
      .attr('fill', '#444')
      .text(d => truncateText(d, 15))
      .attr('opacity', 0)
      .transition()
      .duration(400)
      .delay((_, i) => 400 + i * 15)
      .attr('opacity', 1)

    // Color legend - vertical bar on the right
    const legendWidth = 16
    const legendHeight = innerHeight * 0.6
    const legendX = width - margin.right + 25
    const legendY = margin.top + (innerHeight - legendHeight) / 2

    // Gradient for legend
    const gradientId = `heatmap-gradient-${Math.random().toString(36).substr(2, 9)}`
    const defs = svg.append('defs')
    const gradient = defs.append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%')
      .attr('x2', '0%')
      .attr('y1', '100%')
      .attr('y2', '0%')

    BLUE_COLORS.forEach((color, i) => {
      gradient.append('stop')
        .attr('offset', `${(i / (BLUE_COLORS.length - 1)) * 100}%`)
        .attr('stop-color', color)
    })

    svg.append('rect')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('fill', `url(#${gradientId})`)
      .attr('stroke', '#ddd')
      .attr('stroke-width', 1)
      .attr('rx', 2)

    // Legend labels
    svg.append('text')
      .attr('x', legendX + legendWidth + 5)
      .attr('y', legendY + legendHeight)
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .attr('dy', '0.35em')
      .text(min_value.toFixed(1))

    svg.append('text')
      .attr('x', legendX + legendWidth + 5)
      .attr('y', legendY)
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .attr('dy', '0.35em')
      .text(max_value.toFixed(1))

  }, [data, dimensions, t])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  if (!data || !data.data || data.data.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography color="text.secondary">
          {t('common.noData', 'No data available')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      <Box sx={{ flex: 1 }}>
        <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
      </Box>

      {/* Tooltip */}
      {tooltipData && (
        <Box
          sx={{
            position: 'absolute',
            left: tooltipData.x,
            top: tooltipData.y,
            bgcolor: 'rgba(0,0,0,0.85)',
            color: 'white',
            px: 1.5,
            py: 0.75,
            borderRadius: 1,
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 100,
            whiteSpace: 'nowrap'
          }}
        >
          {tooltipData.content}
        </Box>
      )}
    </Box>
  )
}


/**
 * Similarity Heatmap
 * D3.js implementation of BERTopic's visualize_heatmap()
 * Shows topic similarity matrix
 * Plotly-style blue gradient color scheme
 */

import { useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import D3Container from './D3Container'
import { useTooltip, truncateText } from './useD3'

interface HeatmapData {
  type?: string
  data: [number, number, number][] // [row, col, value]
  labels: string[]
  min_value?: number
  max_value?: number
}

interface SimilarityHeatmapProps {
  data: HeatmapData
  height?: number
}

// Plotly-style blue color scale for similarity
const BLUE_COLORS = [
  '#f7fbff', '#e3f2fd', '#bbdefb', '#90caf9', 
  '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', 
  '#1976d2', '#1565c0'
]

export default function SimilarityHeatmap({ data, height = 600 }: SimilarityHeatmapProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltip = useTooltip()

  const renderChart = useCallback((dimensions: { width: number; height: number }) => {
    if (!svgRef.current || !data || !data.data || data.data.length === 0) return

    const { width, height: h } = dimensions
    const margin = { top: 80, right: 100, bottom: 120, left: 120 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = h - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { labels, data: heatmapData, min_value = 0, max_value = 1 } = data
    const n = labels.length

    // Calculate cell size
    const cellWidth = innerWidth / n
    const cellHeight = innerHeight / n

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.visualization.heatmap'))

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.visualization.topicSimilarityMatrix', 'Topic Similarity Matrix'))

    // Main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Blue gradient color scale (Plotly style for similarity)
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
        // Use white text for dark backgrounds (high similarity), dark text for light backgrounds
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

        const rowLabel = labels[d[0]] || `Topic ${d[0]}`
        const colLabel = labels[d[1]] || `Topic ${d[1]}`
        const value = d[2]

        const similarityLabel = t('topicModeling.visualization.similarity') || 'Similarity'
        tooltip.show(`
          <div style="margin-bottom:8px;">
            <span style="font-weight:bold;color:#333">${truncateText(rowLabel, 22)}</span>
            <span style="color:#888;margin:0 6px;">vs</span>
            <span style="font-weight:bold;color:#333">${truncateText(colLabel, 22)}</span>
          </div>
          <div style="color:#555;">
            <span style="font-weight:500;">${similarityLabel}:</span> 
            <span style="font-weight:bold;color:${getColor(value)}">${value.toFixed(4)}</span>
          </div>
        `, event)
      })
      .on('mousemove', (event) => {
        tooltip.move(event)
      })
      .on('mouseleave', function(_, d) {
        d3.select(this)
          .attr('stroke', d[0] === d[1] ? '#1565c0' : 'none')
          .attr('stroke-width', d[0] === d[1] ? 1 : 0)
        tooltip.hide()
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
      .text(d => truncateText(d, 18))
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
      .text(d => truncateText(d, 18))
      .attr('opacity', 0)
      .transition()
      .duration(400)
      .delay((_, i) => 400 + i * 15)
      .attr('opacity', 1)

    // Color legend - vertical bar on the right
    const legendWidth = 18
    const legendHeight = innerHeight * 0.6
    const legendX = width - margin.right + 30
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

    svg.append('text')
      .attr('x', legendX + legendWidth / 2)
      .attr('y', legendY - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(t('topicModeling.visualization.similarity') || 'Similarity')

  }, [data, t, tooltip])

  if (!data || !data.data || data.data.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
        <Typography>{t('common.noData')}</Typography>
      </Box>
    )
  }

  return (
    <D3Container
      height={height}
      showToolbar={true}
      title="topic-heatmap"
    >
      {(dimensions) => {
        setTimeout(() => renderChart(dimensions), 0)
        return (
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            style={{ background: '#fafafa' }}
          />
        )
      }}
    </D3Container>
  )
}


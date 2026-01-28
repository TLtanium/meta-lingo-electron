/**
 * LDA Topic Timeline (Topics Over Time)
 * D3.js implementation showing topic frequency evolution over time
 * Plotly-style line chart with area fill
 */

import { useRef, useEffect, useState } from 'react'
import { Box, Typography, CircularProgress, Alert } from '@mui/material'
import * as d3 from 'd3'
import { useTranslation } from 'react-i18next'
import type { LDATopicEvolutionData, LDATopicEvolutionSeries, LDATopic } from '../../../../types/topicModeling'

interface LDATopicTimelineProps {
  data: LDATopicEvolutionData | null
  topics?: LDATopic[]
  useCustomLabels?: boolean
  loading?: boolean
  error?: string | null
  normalizeFrequency?: boolean
}

// Color palette for topics
const TOPIC_COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#9c27b0', '#d32f2f',
  '#00796b', '#7b1fa2', '#c2185b', '#0288d1', '#689f38',
  '#fbc02d', '#e64a19', '#512da8', '#0097a7', '#5d4037',
  '#455a64', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a'
]

const getTopicColor = (index: number): string => {
  return TOPIC_COLORS[index % TOPIC_COLORS.length]
}

const truncateText = (text: string, maxLen: number): string => {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 2) + '...'
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toFixed(2)
}

export default function LDATopicTimeline({
  data,
  topics = [],
  useCustomLabels = false,
  loading = false,
  error = null,
  normalizeFrequency = true
}: LDATopicTimelineProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, content: string } | null>(null)
  
  // Helper to get topic name with custom label support
  const getTopicName = (series: LDATopicEvolutionSeries): string => {
    // Check for custom label first
    if (useCustomLabels && topics.length > 0) {
      const topic = topics.find(t => t.topic_id === series.topic_id)
      if (topic?.custom_label) {
        return topic.custom_label
      }
    }
    // Fall back to translated default label
    return t('topicModeling.lda.viz.topicLabel', 'Topic {{topicId}}', { topicId: series.topic_id })
  }

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
    if (!data || !data.series || data.series.length === 0) return

    const { width, height } = dimensions
    const margin = { top: 70, right: 140, bottom: 70, left: 65 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { series, timestamps } = data

    // Title - consistent with other LDA charts (18px)
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lda.viz.topicEvolution', 'Topic Evolution'))

    // Subtitle
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.topicEvolutionSubtitle', 'Topic Proportion Changes Over Time'))

    // Main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Calculate scales
    const xScale = d3.scalePoint<string>()
      .domain(timestamps)
      .range([0, innerWidth])
      .padding(0.5)

    const allValues = series.flatMap(s => s.values)
    const maxValue = d3.max(allValues) || 1

    const yScale = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([innerHeight, 0])

    // Grid lines
    const xAxis = d3.axisBottom(xScale)
      .tickSize(-innerHeight)

    const yAxis = d3.axisLeft(yScale)
      .ticks(6)
      .tickSize(-innerWidth)
      .tickFormat(d => normalizeFrequency ? `${((d as number) * 100).toFixed(0)}%` : formatNumber(d as number))

    g.append('g')
      .attr('class', 'grid x-grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call(g => g.selectAll('.tick line').attr('stroke', '#eee').attr('stroke-width', 1))
      .call(g => g.selectAll('.tick text')
        .attr('fill', '#666')
        .attr('font-size', '10px')
        .attr('transform', 'rotate(-45)')
        .attr('text-anchor', 'end')
        .attr('dx', '-0.5em')
        .attr('dy', '0.5em'))
      .call(g => g.select('.domain').attr('stroke', '#ddd'))

    g.append('g')
      .attr('class', 'grid y-grid')
      .call(yAxis)
      .call(g => g.selectAll('.tick line').attr('stroke', '#eee').attr('stroke-width', 1))
      .call(g => g.selectAll('.tick text').attr('fill', '#666').attr('font-size', '10px'))
      .call(g => g.select('.domain').attr('stroke', '#ddd'))

    // Axis labels
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 55)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(t('topicModeling.ldaDynamic.time', 'Time Period'))

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(normalizeFrequency 
        ? t('topicModeling.ldaDynamic.topicProportion', 'Topic Proportion')
        : t('topicModeling.ldaDynamic.frequency', 'Frequency'))

    // Line generator
    const line = d3.line<number>()
      .x((_, i) => xScale(timestamps[i]) || 0)
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX)

    // Area generator
    const area = d3.area<number>()
      .x((_, i) => xScale(timestamps[i]) || 0)
      .y0(innerHeight)
      .y1(d => yScale(d))
      .curve(d3.curveMonotoneX)

    // Draw each series
    series.forEach((s, i) => {
      const color = getTopicColor(i)

      // Area fill
      g.append('path')
        .datum(s.values)
        .attr('class', `area-${s.topic_id}`)
        .attr('fill', color)
        .attr('fill-opacity', 0.1)
        .attr('d', area)

      // Line path
      const path = g.append('path')
        .datum(s.values)
        .attr('class', `line-${s.topic_id}`)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2.5)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('d', line)

      // Animate line drawing
      const totalLength = path.node()?.getTotalLength() || 0
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(1200)
        .delay(i * 80)
        .ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0)

      // Data points
      const points = g.selectAll(`.point-${s.topic_id}`)
        .data(s.values)
        .join('circle')
        .attr('class', `point-${s.topic_id}`)
        .attr('cx', (_, j) => xScale(timestamps[j]) || 0)
        .attr('cy', d => yScale(d))
        .attr('r', 0)
        .attr('fill', color)
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')

      // Animate points
      points.transition()
        .duration(300)
        .delay((_, j) => 1200 + i * 80 + j * 40)
        .attr('r', 4)

      // Point hover
      points
        .on('mouseenter', function(event, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 7)

          const pointIndex = s.values.indexOf(d as number)
          const timestamp = timestamps[pointIndex]

          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) {
            const valueStr = normalizeFrequency 
              ? `${((d as number) * 100).toFixed(1)}%` 
              : formatNumber(d as number)
            
            setTooltipData({
              x: event.clientX - rect.left + 10,
              y: event.clientY - rect.top - 10,
              content: `${getTopicName(s)} (${timestamp}): ${valueStr}`
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
        .on('mouseleave', function() {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 4)
          setTooltipData(null)
        })
    })

    // Legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - margin.right + 15}, ${margin.top})`)

    const legendItems = legend.selectAll('.legend-item')
      .data(series.slice(0, 12)) // Max 12 items
      .join('g')
      .attr('class', 'legend-item')
      .attr('transform', (_, i) => `translate(0, ${i * 20})`)
      .style('cursor', 'pointer')

    legendItems.append('line')
      .attr('x1', 0)
      .attr('x2', 18)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', (_, i) => getTopicColor(i))
      .attr('stroke-width', 2.5)

    legendItems.append('circle')
      .attr('cx', 9)
      .attr('cy', 0)
      .attr('r', 3)
      .attr('fill', (_, i) => getTopicColor(i))
      .attr('stroke', 'white')
      .attr('stroke-width', 1)

    legendItems.append('text')
      .attr('x', 24)
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('fill', '#555')
      .text(d => truncateText(getTopicName(d), 12))

    // Legend hover
    legendItems
      .on('mouseenter', function(_, d) {
        series.forEach((s, i) => {
          const opacity = s.topic_id === d.topic_id ? 1 : 0.15
          g.select(`.line-${s.topic_id}`)
            .transition()
            .duration(150)
            .attr('opacity', opacity)
            .attr('stroke-width', s.topic_id === d.topic_id ? 4 : 2.5)
          
          g.select(`.area-${s.topic_id}`)
            .transition()
            .duration(150)
            .attr('fill-opacity', s.topic_id === d.topic_id ? 0.2 : 0.02)
          
          g.selectAll(`.point-${s.topic_id}`)
            .transition()
            .duration(150)
            .attr('opacity', opacity)
        })
      })
      .on('mouseleave', function() {
        series.forEach(s => {
          g.select(`.line-${s.topic_id}`)
            .transition()
            .duration(150)
            .attr('opacity', 1)
            .attr('stroke-width', 2.5)
          
          g.select(`.area-${s.topic_id}`)
            .transition()
            .duration(150)
            .attr('fill-opacity', 0.1)
          
          g.selectAll(`.point-${s.topic_id}`)
            .transition()
            .duration(150)
            .attr('opacity', 1)
        })
      })

  }, [data, dimensions, normalizeFrequency, t])

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

  if (!data || !data.series || data.series.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography color="text.secondary">
          {t('topicModeling.ldaDynamic.noTimelineData', 'No timeline data available')}
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


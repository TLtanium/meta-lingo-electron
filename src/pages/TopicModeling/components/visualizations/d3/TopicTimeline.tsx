/**
 * Topic Timeline (Topics Over Time)
 * D3.js implementation of BERTopic's visualize_topics_over_time()
 * Shows topic frequency evolution over time
 * Plotly-style line chart with area fill
 */

import { useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import D3Container from './D3Container'
import { useTooltip, getTopicColor, truncateText, formatNumber } from './useD3'

interface TopicTimeSeriesData {
  topic_id: number
  topic_name: string
  words?: string
  values: number[]
  color?: string
}

interface TopicsOverTimeData {
  type?: string
  series: TopicTimeSeriesData[]
  timestamps: string[]
}

interface TopicTimelineProps {
  data: TopicsOverTimeData
  height?: number
  normalizeFrequency?: boolean
}

export default function TopicTimeline({ 
  data, 
  height = 600,
  normalizeFrequency = false
}: TopicTimelineProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltip = useTooltip()

  const renderChart = useCallback((dimensions: { width: number; height: number }) => {
    if (!svgRef.current || !data || !data.series || data.series.length === 0) return

    const { width, height: h } = dimensions
    const margin = { top: 60, right: 160, bottom: 75, left: 75 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = h - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { series, timestamps } = data

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.visualization.topicsOverTime'))

    const subtitleText = normalizeFrequency 
      ? (t('topicModeling.visualization.normalizedFrequency') || 'Normalized Topic Frequency Over Time')
      : (t('topicModeling.visualization.frequencyOverTime') || 'Topic Frequency Over Time')
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(subtitleText)

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

    // Grid lines - Plotly style
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
    const timeLabel = t('topicModeling.visualization.time') || 'Time'
    const freqLabel = normalizeFrequency 
      ? (t('topicModeling.visualization.normalizedFrequency') || 'Normalized Frequency')
      : (t('topicModeling.visualization.frequency') || 'Frequency')
    
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 60)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(timeLabel)

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -60)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(freqLabel)

    // Line generator
    const line = d3.line<number>()
      .x((_, i) => xScale(timestamps[i]) || 0)
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX)

    // Area generator (optional fill under line)
    const area = d3.area<number>()
      .x((_, i) => xScale(timestamps[i]) || 0)
      .y0(innerHeight)
      .y1(d => yScale(d))
      .curve(d3.curveMonotoneX)

    // Draw each series
    series.forEach((s, i) => {
      const color = s.color || getTopicColor(i)

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
        .duration(1500)
        .delay(i * 100)
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
        .delay((_, j) => 1500 + i * 100 + j * 50)
        .attr('r', 5)

      // Point hover
      points
        .on('mouseenter', function(event, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 8)

          const pointIndex = s.values.indexOf(d as number)
          const timestamp = timestamps[pointIndex]

          tooltip.show(`
            <div style="margin-bottom:8px;">
              <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;margin-right:8px;"></span>
              <span style="font-weight:bold;color:${color}">${s.topic_name}</span>
            </div>
            <div style="color:#555;margin-bottom:4px;">
              <span style="font-weight:500;">Time:</span> 
              <span style="font-weight:bold;color:#333">${timestamp}</span>
            </div>
            <div style="color:#555;margin-bottom:4px;">
              <span style="font-weight:500;">${t('topicModeling.visualization.frequency')}:</span> 
              <span style="font-weight:bold;color:#333">${normalizeFrequency ? `${((d as number) * 100).toFixed(1)}%` : formatNumber(d as number)}</span>
            </div>
            ${s.words ? `
            <div style="color:#666;font-size:11px;max-width:250px;line-height:1.4;">
              <span style="font-weight:500;">${t('topicModeling.results.topWords')}:</span><br/>
              ${s.words}
            </div>
            ` : ''}
          `, event)
        })
        .on('mousemove', (event) => {
          tooltip.move(event)
        })
        .on('mouseleave', function() {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 5)
          tooltip.hide()
        })
    })

    // Legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - margin.right + 15}, ${margin.top})`)

    const legendItems = legend.selectAll('.legend-item')
      .data(series.slice(0, 10)) // Max 10 items
      .join('g')
      .attr('class', 'legend-item')
      .attr('transform', (_, i) => `translate(0, ${i * 22})`)
      .style('cursor', 'pointer')

    legendItems.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', (d, i) => d.color || getTopicColor(i))
      .attr('stroke-width', 3)

    legendItems.append('circle')
      .attr('cx', 10)
      .attr('cy', 0)
      .attr('r', 4)
      .attr('fill', (d, i) => d.color || getTopicColor(i))
      .attr('stroke', 'white')
      .attr('stroke-width', 1)

    legendItems.append('text')
      .attr('x', 28)
      .attr('dy', '0.35em')
      .attr('font-size', '11px')
      .attr('fill', '#555')
      .text(d => truncateText(d.topic_name, 15))

    // Legend hover
    legendItems
      .on('mouseenter', function(_, d) {
        // Highlight this series
        series.forEach(s => {
          const opacity = s.topic_id === d.topic_id ? 1 : 0.1
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

  }, [data, t, tooltip, normalizeFrequency])

  if (!data || !data.series || data.series.length === 0) {
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
      title="topics-over-time"
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


/**
 * Topic Bubble Chart (Intertopic Distance Map)
 * D3.js implementation that replicates BERTopic's Plotly visualize_topics()
 * Features:
 * - Uniform gray bubbles (Plotly style)
 * - Cross reference lines at origin
 * - Bottom slider for topic selection
 * - D1/D2 axis labels
 */

import { useRef, useCallback, useState, useEffect } from 'react'
import * as d3 from 'd3'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import D3Container from './D3Container'
import { useTooltip, formatNumber } from './useD3'

interface TopicData {
  topic_id: number
  topic_name: string
  x: number
  y: number
  size: number
  count: number
  words: string
  color?: string
}

interface TopicLink {
  source: number
  target: number
  similarity: number
}

interface TopicBubbleChartProps {
  data: TopicData[]
  links?: TopicLink[]
  height?: number
  showLinks?: boolean
  linkThreshold?: number
}

// Plotly-style gray colors
const BUBBLE_FILL = 'rgb(176, 190, 197)'
const BUBBLE_STROKE = 'rgb(47, 79, 79)'
const SELECTED_FILL = '#5470c6'
const SELECTED_STROKE = '#3355a0'

export default function TopicBubbleChart({ 
  data, 
  links = [],
  height = 650,
  showLinks = false,
  linkThreshold = 0.3
}: TopicBubbleChartProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltip = useTooltip()
  const [selectedTopicIndex, setSelectedTopicIndex] = useState(0)

  const renderChart = useCallback((dimensions: { width: number; height: number }) => {
    if (!svgRef.current || !data || data.length === 0) return

    const { width, height: h } = dimensions
    // Layout: main chart area + slider area at bottom
    const sliderHeight = 82
    const margin = { top: 80, right: 50, bottom: 50 + sliderHeight, left: 50 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = h - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Title - consistent with other visualizations
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.visualization.topicDistribution'))

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.visualization.intertopicDistanceMapSubtitle', 'Intertopic Distance Map'))

    // Calculate scales based on UMAP coordinates
    const xExtent = d3.extent(data, d => d.x) as [number, number]
    const yExtent = d3.extent(data, d => d.y) as [number, number]
    
    // Add padding and center around data (not necessarily origin)
    const xRange = xExtent[1] - xExtent[0]
    const yRange = yExtent[1] - yExtent[0]
    const xPadding = xRange * 0.15
    const yPadding = yRange * 0.15

    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([0, innerWidth])

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([innerHeight, 0])

    // Size scale based on document count
    const counts = data.map(d => d.count)
    const maxCount = Math.max(...counts)
    const minCount = Math.min(...counts)
    
    const sizeScale = d3.scaleSqrt()
      .domain([minCount, maxCount])
      .range([9, 28])  // Match Plotly range

    // Main chart group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .attr('clip-path', 'url(#chartClip)')

    // Define clip path
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'chartClip')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)

    // Cross reference lines (Plotly style) - vertical line at center of data
    const xCenter = (xExtent[0] + xExtent[1]) / 2
    const yCenter = (yExtent[0] + yExtent[1]) / 2

    // Shapes layer (reference lines)
    const shapesLayer = svg.append('g').attr('class', 'layer-above')
    
    // Vertical reference line
    shapesLayer.append('path')
      .attr('d', `M${margin.left + xScale(xCenter)},${margin.top + innerHeight}L${margin.left + xScale(xCenter)},${margin.top}`)
      .attr('fill', 'none')
      .attr('stroke', 'rgb(207, 216, 220)')
      .attr('stroke-width', 2)
      .attr('opacity', 0.3)

    // Horizontal reference line
    shapesLayer.append('path')
      .attr('d', `M${margin.left},${margin.top + yScale(yCenter)}L${margin.left + innerWidth},${margin.top + yScale(yCenter)}`)
      .attr('fill', 'none')
      .attr('stroke', 'rgb(158, 158, 158)')
      .attr('stroke-width', 2)
      .attr('opacity', 0.3)

    // D1 axis annotation (left side)
    svg.append('text')
      .attr('class', 'annotation-text')
      .attr('x', margin.left - 9)
      .attr('y', margin.top + innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif")
      .attr('font-size', '12px')
      .attr('fill', 'rgb(36, 36, 36)')
      .text(t('topicModeling.visualization.d1', 'D1'))

    // D2 axis annotation (top)
    svg.append('text')
      .attr('class', 'annotation-text')
      .attr('x', margin.left + innerWidth / 2 + 10)
      .attr('y', margin.top - 9)
      .attr('text-anchor', 'middle')
      .attr('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif")
      .attr('font-size', '12px')
      .attr('fill', 'rgb(36, 36, 36)')
      .text(t('topicModeling.visualization.d2', 'D2'))

    // Create bubble group
    const bubblesGroup = g.append('g').attr('class', 'bubbles')
    
    // Sort data by count (descending) for consistent ordering
    const sortedData = [...data].sort((a, b) => b.count - a.count)

    // Draw bubbles - Plotly style (uniform gray)
    bubblesGroup.selectAll('.bubble')
      .data(sortedData)
      .join('circle')
      .attr('class', 'bubble plotly-customdata')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', d => sizeScale(d.count))
      .attr('fill', (_, i) => i === selectedTopicIndex ? SELECTED_FILL : BUBBLE_FILL)
      .attr('fill-opacity', 0.7)
      .attr('stroke', (_, i) => i === selectedTopicIndex ? SELECTED_STROKE : BUBBLE_STROKE)
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event, d) {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('fill-opacity', 0.9)
          .attr('stroke-width', 3)
        
        tooltip.show(`
          <div style="margin-bottom:8px;">
            <span style="font-weight:bold;font-size:14px;">${d.topic_name}</span>
          </div>
          <div style="color:#555;margin-bottom:6px;">
            <span style="font-weight:500;">${t('topicModeling.results.documentCount')}:</span> 
            <span style="font-weight:bold;color:#333">${formatNumber(d.count)}</span>
          </div>
          <div style="color:#666;font-size:12px;max-width:280px;line-height:1.5;">
            <span style="font-weight:500;">${t('topicModeling.results.topWords')}:</span><br/>
            ${d.words}
          </div>
        `, event)
      })
      .on('mousemove', (event) => {
        tooltip.move(event)
      })
      .on('mouseleave', function(_, d) {
        const index = sortedData.indexOf(d)
        d3.select(this)
          .transition()
          .duration(100)
          .attr('fill-opacity', 0.7)
          .attr('stroke-width', 2)
          .attr('fill', index === selectedTopicIndex ? SELECTED_FILL : BUBBLE_FILL)
          .attr('stroke', index === selectedTopicIndex ? SELECTED_STROKE : BUBBLE_STROKE)
        tooltip.hide()
      })
      .on('click', (_, d) => {
        const index = sortedData.indexOf(d)
        setSelectedTopicIndex(index)
        updateSliderPosition(index)
        updateBubbleHighlight(index)
      })

    // Slider component at bottom - Plotly style
    const sliderGroup = svg.append('g')
      .attr('class', 'slider-group')
      .attr('transform', `translate(${margin.left},${h - sliderHeight - 10})`)

    // Slider label (current topic)
    sliderGroup.append('text')
      .attr('class', 'slider-label')
      .attr('x', 0)
      .attr('y', 15.6)
      .attr('text-anchor', 'left')
      .attr('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif")
      .attr('font-size', '12px')
      .attr('fill', 'rgb(36, 36, 36)')
      .text(t('topicModeling.visualization.topicLabel', 'Topic {{topicId}}', { topicId: sortedData[selectedTopicIndex]?.topic_id ?? 0 }))

    // Slider rail
    const sliderWidth = innerWidth - 16
    const sliderRailY = 31.5
    
    sliderGroup.append('rect')
      .attr('class', 'slider-rail-rect')
      .attr('x', 8)
      .attr('y', sliderRailY)
      .attr('width', sliderWidth)
      .attr('height', 5)
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('fill', 'rgb(248, 250, 252)')
      .attr('stroke', 'rgb(190, 200, 217)')
      .attr('stroke-width', 1)

    // Slider ticks and labels
    const ticksPerLabel = 3
    const numTicks = sortedData.length
    const tickSpacing = sliderWidth / (numTicks - 1 || 1)

    // Topic labels (every nth topic)
    const labelsGroup = sliderGroup.append('g').attr('class', 'slider-labels')
    const labelInterval = Math.max(1, Math.floor(numTicks / 14))  // Show ~14 labels max
    
    sortedData.forEach((topic, i) => {
      if (i % labelInterval === 0 || i === numTicks - 1) {
        labelsGroup.append('text')
          .attr('class', 'slider-label-group')
          .attr('x', 10 + i * tickSpacing)
          .attr('y', 71.6)
          .attr('text-anchor', 'middle')
          .attr('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif")
          .attr('font-size', '12px')
          .attr('fill', 'rgb(36, 36, 36)')
          .text(t('topicModeling.visualization.topicLabel', 'Topic {{topicId}}', { topicId: topic.topic_id }))
      }
    })

    // Tick marks
    sortedData.forEach((_, i) => {
      const isMajor = i % labelInterval === 0 || i === numTicks - 1
      sliderGroup.append('rect')
        .attr('class', 'slider-tick-rect')
        .attr('x', 9.5 + i * tickSpacing)
        .attr('y', 49)
        .attr('width', 1)
        .attr('height', isMajor ? 7 : 4)
        .attr('fill', 'rgb(51, 51, 51)')
    })

    // Touch area (invisible, for interaction)
    sliderGroup.append('rect')
      .attr('class', 'slider-rail-touch-rect')
      .attr('x', 0)
      .attr('y', 24)
      .attr('width', sliderWidth + 16)
      .attr('height', 46)
      .attr('opacity', 0)
      .style('cursor', 'pointer')
      .on('click', function(event) {
        const [mx] = d3.pointer(event)
        const index = Math.round((mx - 10) / tickSpacing)
        const clampedIndex = Math.max(0, Math.min(numTicks - 1, index))
        setSelectedTopicIndex(clampedIndex)
        updateSliderPosition(clampedIndex)
        updateBubbleHighlight(clampedIndex)
      })

    // Slider grip (draggable)
    const grip = sliderGroup.append('rect')
      .attr('class', 'slider-grip-rect')
      .attr('x', selectedTopicIndex * tickSpacing)
      .attr('y', 24)
      .attr('width', 20)
      .attr('height', 20)
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('fill', 'rgb(248, 250, 252)')
      .attr('stroke', 'rgb(190, 200, 217)')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')

    // Drag behavior for grip
    const drag = d3.drag<SVGRectElement, unknown>()
      .on('drag', function(event) {
        const x = Math.max(0, Math.min(sliderWidth, event.x))
        const index = Math.round(x / tickSpacing)
        const clampedIndex = Math.max(0, Math.min(numTicks - 1, index))
        
        d3.select(this).attr('x', clampedIndex * tickSpacing)
        
        if (clampedIndex !== selectedTopicIndex) {
          setSelectedTopicIndex(clampedIndex)
          updateBubbleHighlight(clampedIndex)
          updateSliderLabel(clampedIndex)
        }
      })

    grip.call(drag)

    // Helper functions
    function updateSliderPosition(index: number) {
      grip.attr('x', index * tickSpacing)
    }

    function updateSliderLabel(index: number) {
      sliderGroup.select('.slider-label')
        .text(t('topicModeling.visualization.topicLabel', 'Topic {{topicId}}', { topicId: sortedData[index]?.topic_id ?? 0 }))
    }

    function updateBubbleHighlight(index: number) {
      bubblesGroup.selectAll('.bubble')
        .attr('fill', (_, i) => i === index ? SELECTED_FILL : BUBBLE_FILL)
        .attr('stroke', (_, i) => i === index ? SELECTED_STROKE : BUBBLE_STROKE)
      
      updateSliderLabel(index)
    }

  }, [data, links, t, tooltip, showLinks, linkThreshold, selectedTopicIndex])

  // Re-render when selected topic changes
  useEffect(() => {
    // The render will be triggered by D3Container
  }, [selectedTopicIndex])

  if (!data || data.length === 0) {
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
      title="topic-distribution"
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

/**
 * Term Decay Chart (Word Rank)
 * D3.js implementation of BERTopic's visualize_term_rank()
 * Shows how term weights decay across ranks for each topic
 * Plotly-style line chart with markers
 */

import { useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import D3Container from './D3Container'
import { useTooltip, getTopicColor, truncateText } from './useD3'

interface TermRankData {
  topic_id: number
  topic_name: string
  word: string
  rank: number
  weight: number
  color?: string
}

interface TermDecayChartProps {
  data: TermRankData[]
  height?: number
  logScale?: boolean
}

export default function TermDecayChart({ 
  data, 
  height = 600,
  logScale = false 
}: TermDecayChartProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltip = useTooltip()

  const renderChart = useCallback((dimensions: { width: number; height: number }) => {
    if (!svgRef.current || !data || data.length === 0) return

    const { width, height: h } = dimensions
    // Increase right margin to accommodate all topics in legend
    const margin = { top: 60, right: 180, bottom: 55, left: 70 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = h - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.visualization.termRank'))

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.visualization.termScoreDecline', 'Term Score Decline per Topic'))

    // Main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Group data by topic
    const topics = d3.group(data, d => d.topic_id)
    const topicList = Array.from(topics.keys()).sort((a, b) => a - b)

    // Calculate scales
    const maxRank = d3.max(data, d => d.rank) || 10
    const maxWeight = d3.max(data, d => d.weight) || 100
    const minWeight = d3.min(data, d => d.weight) || 0

    const xScale = d3.scaleLinear()
      .domain([1, maxRank])
      .range([0, innerWidth])

    const yScale = logScale
      ? d3.scaleLog()
          .domain([Math.max(0.01, minWeight * 0.8), maxWeight * 1.1])
          .range([innerHeight, 0])
          .clamp(true)
      : d3.scaleLinear()
          .domain([0, maxWeight * 1.1])
          .range([innerHeight, 0])

    // Grid lines - Plotly style
    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(maxRank, 10))
      .tickSize(-innerHeight)

    const yAxis = d3.axisLeft(yScale)
      .ticks(6)
      .tickSize(-innerWidth)
      .tickFormat(d => `${(d as number).toFixed(1)}`)

    g.append('g')
      .attr('class', 'grid x-grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call(g => g.selectAll('.tick line').attr('stroke', '#eee').attr('stroke-width', 1))
      .call(g => g.selectAll('.tick text').attr('fill', '#666').attr('font-size', '10px'))
      .call(g => g.select('.domain').attr('stroke', '#ddd'))

    g.append('g')
      .attr('class', 'grid y-grid')
      .call(yAxis)
      .call(g => g.selectAll('.tick line').attr('stroke', '#eee').attr('stroke-width', 1))
      .call(g => g.selectAll('.tick text').attr('fill', '#666').attr('font-size', '10px'))
      .call(g => g.select('.domain').attr('stroke', '#ddd'))

    // Axis labels
    const rankLabel = t('topicModeling.visualization.rank') || 'Rank'
    const scoreLabel = logScale ? 'c-TF-IDF Score (log)' : 'c-TF-IDF Score'
    
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 42)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(rankLabel)

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -55)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(scoreLabel)

    // Line generator
    const line = d3.line<TermRankData>()
      .x(d => xScale(d.rank))
      .y(d => yScale(Math.max(logScale ? 0.01 : 0, d.weight)))
      .curve(d3.curveMonotoneX)

    // Draw lines for each topic
    topicList.forEach((topicId, i) => {
      const topicData = topics.get(topicId) || []
      const sortedData = [...topicData].sort((a, b) => a.rank - b.rank)
      const color = sortedData[0]?.color || getTopicColor(i)
      const topicName = sortedData[0]?.topic_name || `Topic ${topicId}`

      // Line path
      const path = g.append('path')
        .datum(sortedData)
        .attr('class', 'line')
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2.5)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('d', line)
        .attr('opacity', 0.8)

      // Animate line drawing
      const totalLength = path.node()?.getTotalLength() || 0
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(1000)
        .delay(i * 100)
        .ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0)

      // Data points
      const points = g.selectAll(`.point-${topicId}`)
        .data(sortedData)
        .join('circle')
        .attr('class', `point-${topicId}`)
        .attr('cx', d => xScale(d.rank))
        .attr('cy', d => yScale(Math.max(logScale ? 0.01 : 0, d.weight)))
        .attr('r', 0)
        .attr('fill', color)
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')

      // Animate points - smaller size for cleaner look
      points.transition()
        .duration(300)
        .delay((_, j) => 1000 + i * 100 + j * 30)
        .attr('r', 3)

      // Point hover
      points
        .on('mouseenter', function(event, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 5)

          tooltip.show(`
            <div style="margin-bottom:8px;">
              <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;margin-right:8px;"></span>
              <span style="font-weight:bold;color:${color}">${topicName}</span>
            </div>
            <div style="color:#555;margin-bottom:4px;">
              <span style="font-weight:500;">${t('topicModeling.visualization.word', 'Word')}:</span> 
              <span style="font-weight:bold;color:#333">${d.word}</span>
            </div>
            <div style="color:#555;margin-bottom:4px;">
              <span style="font-weight:500;">${t('topicModeling.visualization.rank', 'Rank')}:</span> 
              <span style="font-weight:bold;color:#333">${d.rank}</span>
            </div>
            <div style="color:#555;">
              <span style="font-weight:500;">${t('topicModeling.visualization.score', 'Score')}:</span> 
              <span style="font-weight:bold;color:#333">${d.weight.toFixed(2)}%</span>
            </div>
          `, event)
        })
        .on('mousemove', (event) => {
          tooltip.move(event)
        })
        .on('mouseleave', function() {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 3)
          tooltip.hide()
        })
    })

    // Legend - show all topics, use scroll if needed
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - margin.right + 15}, ${margin.top})`)

    const legendItems = legend.selectAll('.legend-item')
      .data(topicList) // Show all topics
      .join('g')
      .attr('class', 'legend-item')
      .attr('transform', (_, i) => `translate(0, ${i * 22})`)
      .style('cursor', 'pointer')

    legendItems.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', (d, i) => {
        const topicData = topics.get(d)
        return topicData?.[0]?.color || getTopicColor(i)
      })
      .attr('stroke-width', 3)

    legendItems.append('text')
      .attr('x', 28)
      .attr('dy', '0.35em')
      .attr('font-size', '11px')
      .attr('fill', '#555')
      .text(d => {
        const topicData = topics.get(d)
        return truncateText(topicData?.[0]?.topic_name || `Topic ${d}`, 15)
      })

    // Legend hover to highlight lines and points
    legendItems
      .on('mouseenter', function(_, topicId) {
        // Dim other lines
        g.selectAll('.line')
          .transition()
          .duration(150)
          .attr('opacity', 0.1)

        // Highlight this line
        g.selectAll('path')
          .filter((d: any) => d && d[0]?.topic_id === topicId)
          .transition()
          .duration(150)
          .attr('opacity', 1)
          .attr('stroke-width', 4)
        
        // Dim points of other topics, highlight points of this topic
        topicList.forEach((tid) => {
          g.selectAll(`.point-${tid}`)
            .transition()
            .duration(150)
            .attr('opacity', tid === topicId ? 1 : 0.1)
            .attr('r', tid === topicId ? 4 : 2)
        })
      })
      .on('mouseleave', function() {
        g.selectAll('.line')
          .transition()
          .duration(150)
          .attr('opacity', 0.8)
          .attr('stroke-width', 2.5)
        
        // Restore all points
        topicList.forEach((tid) => {
          g.selectAll(`.point-${tid}`)
            .transition()
            .duration(150)
            .attr('opacity', 1)
            .attr('r', 3)
        })
      })

  }, [data, t, tooltip, logScale])

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
      title="term-decay"
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


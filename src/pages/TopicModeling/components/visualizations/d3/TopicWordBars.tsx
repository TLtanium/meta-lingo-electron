/**
 * Topic Word Bars (Bar Chart)
 * D3.js implementation of BERTopic's visualize_barchart()
 * Shows top words for each topic with horizontal bars
 * Plotly-style layout with solid color bars
 */

import { useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import D3Container from './D3Container'
import { useTooltip, getTopicColor, truncateText } from './useD3'

interface WordData {
  word: string
  weight: number
}

interface TopicBarData {
  topic_id: number
  topic_name: string
  words: WordData[]
  color?: string
}

interface TopicWordBarsProps {
  data: TopicBarData[]
  height?: number
  nWords?: number
  scoreType?: 'ctfidf' | 'weight' // c-TF-IDF for BERTopic, weight for LDA/LSA/NMF
}

export default function TopicWordBars({ data, height = 600, nWords = 5, scoreType = 'ctfidf' }: TopicWordBarsProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltip = useTooltip()

  const renderChart = useCallback((dimensions: { width: number; height: number }) => {
    if (!svgRef.current || !data || data.length === 0) return

    const { width, height: h } = dimensions
    
    // Calculate grid layout - Plotly style
    const numTopics = data.length
    const cols = Math.min(numTopics, numTopics <= 2 ? numTopics : numTopics <= 4 ? 2 : numTopics <= 6 ? 3 : 4)
    const rows = Math.ceil(numTopics / cols)
    
    const margin = { top: 60, right: 15, bottom: 15, left: 15 }
    const cellPadding = 12
    const cellWidth = (width - margin.left - margin.right - (cols - 1) * cellPadding) / cols
    const cellHeight = Math.min(220, (h - margin.top - margin.bottom - (rows - 1) * cellPadding) / rows)
    
    const barPadding = { top: 28, right: 8, bottom: 8, left: 70 }

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
      .text(t('topicModeling.visualization.barchart'))

    const subtitleText = scoreType === 'weight' 
      ? t('topicModeling.visualization.topicWordWeights', 'Topic Word Weights (%)')
      : t('topicModeling.visualization.topicWordScores', 'Topic Word Scores (c-TF-IDF)')
    
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

    // Draw each topic's bar chart
    data.forEach((topic, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = col * (cellWidth + cellPadding)
      const y = row * (cellHeight + cellPadding)
      const color = topic.color || getTopicColor(i)

      // Topic cell group
      const cell = g.append('g')
        .attr('transform', `translate(${x},${y})`)

      // Cell background - transparent, Plotly style
      cell.append('rect')
        .attr('width', cellWidth)
        .attr('height', cellHeight)
        .attr('rx', 4)
        .attr('fill', 'transparent')
        .attr('stroke', '#eee')
        .attr('stroke-width', 1)

      // Topic title - at top
      cell.append('text')
        .attr('x', 8)
        .attr('y', 18)
        .attr('text-anchor', 'start')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', color)
        .text(truncateText(topic.topic_name, 28))

      // Bar chart area
      const barWidth = cellWidth - barPadding.left - barPadding.right
      const barHeight = cellHeight - barPadding.top - barPadding.bottom

      const words = topic.words.slice(0, nWords)
      
      // Find max weight for scaling
      const maxWeight = d3.max(words, d => d.weight) || 100

      // Scales
      const yScale = d3.scaleBand()
        .domain(words.map(w => w.word))
        .range([0, barHeight])
        .padding(0.25)

      const xScale = d3.scaleLinear()
        .domain([0, maxWeight * 1.15])
        .range([0, barWidth])

      // Bars group
      const barsGroup = cell.append('g')
        .attr('transform', `translate(${barPadding.left},${barPadding.top})`)

      // Word labels
      barsGroup.selectAll('.word-label')
        .data(words)
        .join('text')
        .attr('class', 'word-label')
        .attr('x', -5)
        .attr('y', d => (yScale(d.word) || 0) + yScale.bandwidth() / 2)
        .attr('text-anchor', 'end')
        .attr('dy', '0.35em')
        .attr('font-size', '10px')
        .attr('fill', '#444')
        .text(d => truncateText(d.word, 10))

      // Bars - solid color, Plotly style
      const bars = barsGroup.selectAll('.bar')
        .data(words)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', 0)
        .attr('y', d => yScale(d.word) || 0)
        .attr('width', 0)
        .attr('height', yScale.bandwidth())
        .attr('rx', 2)
        .attr('fill', color)
        .attr('fill-opacity', 0.85)
        .style('cursor', 'pointer')

      // Animate bars
      bars.transition()
        .duration(500)
        .delay((_, j) => i * 80 + j * 40)
        .ease(d3.easeBackOut.overshoot(1))
        .attr('width', d => xScale(d.weight))

      // Weight values - show at end of bar
      barsGroup.selectAll('.value')
        .data(words)
        .join('text')
        .attr('class', 'value')
        .attr('x', d => xScale(d.weight) + 4)
        .attr('y', d => (yScale(d.word) || 0) + yScale.bandwidth() / 2)
        .attr('dy', '0.35em')
        .attr('font-size', '9px')
        .attr('fill', '#666')
        .attr('opacity', 0)
        .text(d => scoreType === 'weight' ? `${d.weight.toFixed(1)}%` : d.weight.toFixed(1))
        .transition()
        .duration(300)
        .delay((_, j) => 500 + i * 80 + j * 40)
        .attr('opacity', 1)

      // Bar hover
      bars
        .on('mouseenter', function(event, d) {
          d3.select(this)
            .transition()
            .duration(100)
            .attr('fill-opacity', 1)

          const wordLabel = t('topicModeling.visualization.word') || 'Word'
          const scoreLabel = scoreType === 'weight' 
            ? (t('topicModeling.weight') || 'Weight')
            : (t('topicModeling.visualization.score') || 'c-TF-IDF Score')
          const scoreValue = scoreType === 'weight' 
            ? `${d.weight.toFixed(2)}%`
            : d.weight.toFixed(3)
          tooltip.show(`
            <div style="margin-bottom:6px;">
              <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;margin-right:8px;"></span>
              <span style="font-weight:bold;color:${color}">${topic.topic_name}</span>
            </div>
            <div style="color:#555;">
              <span style="font-weight:500;">${wordLabel}:</span> 
              <span style="font-weight:bold;color:#333">${d.word}</span>
            </div>
            <div style="color:#555;">
              <span style="font-weight:500;">${scoreLabel}:</span> 
              <span style="font-weight:bold;color:#333">${scoreValue}</span>
            </div>
          `, event)
        })
        .on('mousemove', (event) => {
          tooltip.move(event)
        })
        .on('mouseleave', function() {
          d3.select(this)
            .transition()
            .duration(100)
            .attr('fill-opacity', 0.85)
          tooltip.hide()
        })
    })

  }, [data, t, tooltip, nWords, scoreType])

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
      title="topic-barchart"
    >
      {(dimensions) => {
        setTimeout(() => renderChart(dimensions), 0)
        return (
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
          />
        )
      }}
    </D3Container>
  )
}


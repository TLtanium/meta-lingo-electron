/**
 * D3.js Word Cloud Bar Chart for Bibliographic Visualization
 * Horizontal bar chart from title/abstract word frequency (same design as Word Frequency BarChart)
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { Box } from '@mui/material'
import type { WordCloudWord } from '../../../../types/biblio'

interface WordCloudBarChartProps {
  data: WordCloudWord[]
  maxItems?: number
  showPercentage?: boolean
  colorScheme?: string
  height?: number
}

const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#e3f2fd', '#90caf9', '#42a5f5', '#1e88e5', '#1565c0'],
  green: ['#e8f5e9', '#a5d6a7', '#66bb6a', '#43a047', '#2e7d32'],
  purple: ['#f3e5f5', '#ce93d8', '#ab47bc', '#8e24aa', '#6a1b9a'],
  orange: ['#fff3e0', '#ffcc80', '#ffa726', '#fb8c00', '#ef6c00'],
  red: ['#ffebee', '#ef9a9a', '#ef5350', '#e53935', '#c62828'],
  teal: ['#e0f2f1', '#80cbc4', '#26a69a', '#00897b', '#00695c']
}

export default function WordCloudBarChart({
  data,
  maxItems = 20,
  showPercentage = true,
  colorScheme = 'blue',
  height = 400
}: WordCloudBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

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

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (data.length === 0) return

    const displayData = data.slice(0, maxItems)
    const margin = { top: 20, right: 30, bottom: 30, left: 150 }
    const width = dimensions.width - margin.left - margin.right
    const chartHeight = dimensions.height - margin.top - margin.bottom

    const value = (d: WordCloudWord) =>
      showPercentage ? (d.percentage ?? 0) : d.frequency
    const maxValue = d3.max(displayData, d => value(d)) || 0

    const xScale = d3
      .scaleLinear()
      .domain([0, maxValue])
      .range([0, width])

    const yScale = d3
      .scaleBand()
      .domain(displayData.map(d => d.word))
      .range([0, chartHeight])
      .padding(0.2)

    const colors = COLOR_PALETTES[colorScheme] ?? COLOR_PALETTES.blue
    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, displayData.length - 1])
      .range([colors[4], colors[1]])

    const g = svg
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(
        d3.axisBottom(xScale).ticks(5).tickFormat(d =>
          showPercentage ? `${d}%` : d3.format(',')(d as number)
        )
      )
      .selectAll('text')
      .style('font-size', '11px')

    g.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('font-size', '11px')
      .attr('dx', '-0.5em')
      .each(function () {
        const text = d3.select(this)
        const content = text.text()
        if (content.length > 20) {
          text.text(content.substring(0, 17) + '...')
        }
      })

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(
        d3.axisBottom(xScale).ticks(5).tickSize(-chartHeight).tickFormat(() => '')
      )
      .style('stroke-dasharray', '3,3')
      .style('stroke-opacity', 0.2)

    g.selectAll('.bar')
      .data(displayData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('y', d => yScale(d.word) ?? 0)
      .attr('x', 0)
      .attr('height', yScale.bandwidth())
      .attr('width', 0)
      .attr('fill', (_, i) => colorScale(i))
      .attr('rx', 3)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 0.8)
        const tooltip = g
          .append('g')
          .attr('class', 'tooltip')
          .attr(
            'transform',
            `translate(${xScale(value(d)) + 5}, ${(yScale(d.word) ?? 0) + yScale.bandwidth() / 2})`
          )
        tooltip
          .append('rect')
          .attr('fill', 'rgba(0,0,0,0.8)')
          .attr('rx', 4)
          .attr('x', 0)
          .attr('y', -14)
          .attr('width', 120)
          .attr('height', 40)
        tooltip
          .append('text')
          .attr('fill', 'white')
          .attr('font-size', '12px')
          .attr('x', 8)
          .attr('y', 4)
          .text(
            showPercentage
              ? `${(d.percentage ?? 0).toFixed(2)}%`
              : d.frequency.toLocaleString()
          )
        tooltip
          .append('text')
          .attr('fill', 'white')
          .attr('font-size', '10px')
          .attr('x', 8)
          .attr('y', 20)
          .text(`n = ${d.frequency}`)
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 1)
        g.selectAll('.tooltip').remove()
      })
      .transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .attr('width', d => xScale(value(d)))

    g.selectAll('.value-label')
      .data(displayData)
      .enter()
      .append('text')
      .attr('class', 'value-label')
      .attr('y', d => (yScale(d.word) ?? 0) + yScale.bandwidth() / 2 + 4)
      .attr('x', d => {
        const barWidth = xScale(value(d))
        return barWidth > 60 ? barWidth - 8 : barWidth + 5
      })
      .attr('text-anchor', d => {
        const barWidth = xScale(value(d))
        return barWidth > 60 ? 'end' : 'start'
      })
      .attr('fill', d => {
        const barWidth = xScale(value(d))
        return barWidth > 60 ? 'white' : '#333'
      })
      .attr('font-size', '10px')
      .attr('opacity', 0)
      .text(d =>
        showPercentage
          ? `${(d.percentage ?? 0).toFixed(1)}%`
          : d.frequency.toLocaleString()
      )
      .transition()
      .duration(500)
      .delay((_, i) => i * 30 + 300)
      .attr('opacity', 1)
  }, [data, maxItems, dimensions, colorScheme, showPercentage])

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', display: 'flex' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', minHeight: height }} />
    </Box>
  )
}

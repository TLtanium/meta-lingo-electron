/**
 * D3.js Bar Chart Component for N-gram Analysis
 * Horizontal bar chart showing N-gram frequencies
 */

import { useRef, useEffect, useState } from 'react'
import { Box } from '@mui/material'
import * as d3 from 'd3'
import type { NGramResult } from '../../../types/ngram'

interface BarChartProps {
  data: NGramResult[]
  colorScheme: string
  showPercentage: boolean
  onBarClick?: (ngram: string) => void
}

// Color palettes for different schemes
const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#e3f2fd', '#90caf9', '#42a5f5', '#1e88e5', '#1565c0'],
  green: ['#e8f5e9', '#a5d6a7', '#66bb6a', '#43a047', '#2e7d32'],
  purple: ['#f3e5f5', '#ce93d8', '#ab47bc', '#8e24aa', '#6a1b9a'],
  orange: ['#fff3e0', '#ffcc80', '#ffa726', '#fb8c00', '#ef6c00'],
  red: ['#ffebee', '#ef9a9a', '#ef5350', '#e53935', '#c62828'],
  teal: ['#e0f2f1', '#80cbc4', '#26a69a', '#00897b', '#00695c']
}

export default function BarChart({
  data,
  colorScheme,
  showPercentage,
  onBarClick
}: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

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

  // Render chart when data or dimensions change
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (data.length === 0) return

    // Margins and dimensions
    const margin = { top: 20, right: 30, bottom: 30, left: 150 }
    const width = dimensions.width - margin.left - margin.right
    const height = dimensions.height - margin.top - margin.bottom

    // Create main group
    const g = svg
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const maxValue = d3.max(data, d => showPercentage ? d.percentage : d.frequency) || 0
    
    const xScale = d3.scaleLinear()
      .domain([0, maxValue])
      .range([0, width])

    const yScale = d3.scaleBand()
      .domain(data.map(d => d.ngram))
      .range([0, height])
      .padding(0.2)

    // Color scale
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const colorScale = d3.scaleLinear<string>()
      .domain([0, data.length - 1])
      .range([colors[4], colors[1]])

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => 
        showPercentage ? `${d}%` : d3.format(',')(d as number)
      ))
      .selectAll('text')
      .style('font-size', '11px')

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('font-size', '11px')
      .attr('dx', '-0.5em')
      .each(function() {
        const text = d3.select(this)
        const content = text.text()
        if (content.length > 20) {
          text.text(content.substring(0, 17) + '...')
        }
      })

    // Add gridlines
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(5)
          .tickSize(-height)
          .tickFormat(() => '')
      )
      .style('stroke-dasharray', '3,3')
      .style('stroke-opacity', 0.2)

    // Add bars
    g.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('y', d => yScale(d.ngram) || 0)
      .attr('x', 0)
      .attr('height', yScale.bandwidth())
      .attr('width', 0)
      .attr('fill', (_, i) => colorScale(i))
      .attr('rx', 3)
      .attr('cursor', onBarClick ? 'pointer' : 'default')
      .on('click', (_, d) => {
        if (onBarClick) onBarClick(d.ngram)
      })
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 0.8)
        
        // Show tooltip
        const tooltip = g.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${xScale(showPercentage ? d.percentage : d.frequency) + 5}, ${(yScale(d.ngram) || 0) + yScale.bandwidth() / 2})`)
        
        tooltip.append('rect')
          .attr('fill', 'rgba(0,0,0,0.8)')
          .attr('rx', 4)
          .attr('x', 0)
          .attr('y', -14)
          .attr('width', 100)
          .attr('height', 28)

        tooltip.append('text')
          .attr('fill', 'white')
          .attr('font-size', '12px')
          .attr('x', 8)
          .attr('y', 4)
          .text(showPercentage 
            ? `${d.percentage.toFixed(2)}%` 
            : d.frequency.toLocaleString()
          )
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 1)
        g.selectAll('.tooltip').remove()
      })
      .transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .attr('width', d => xScale(showPercentage ? d.percentage : d.frequency))

    // Add value labels inside bars
    g.selectAll('.value-label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'value-label')
      .attr('y', d => (yScale(d.ngram) || 0) + yScale.bandwidth() / 2 + 4)
      .attr('x', d => {
        const barWidth = xScale(showPercentage ? d.percentage : d.frequency)
        return barWidth > 60 ? barWidth - 8 : barWidth + 5
      })
      .attr('text-anchor', d => {
        const barWidth = xScale(showPercentage ? d.percentage : d.frequency)
        return barWidth > 60 ? 'end' : 'start'
      })
      .attr('fill', d => {
        const barWidth = xScale(showPercentage ? d.percentage : d.frequency)
        return barWidth > 60 ? 'white' : '#333'
      })
      .attr('font-size', '10px')
      .attr('opacity', 0)
      .text(d => showPercentage 
        ? `${d.percentage.toFixed(1)}%` 
        : d.frequency.toLocaleString()
      )
      .transition()
      .duration(500)
      .delay((_, i) => i * 30 + 300)
      .attr('opacity', 1)

  }, [data, dimensions, colorScheme, showPercentage, onBarClick])

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        display: 'flex'
      }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </Box>
  )
}

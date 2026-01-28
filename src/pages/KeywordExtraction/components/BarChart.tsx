/**
 * D3.js Bar Chart Component for Keyword Extraction
 * Horizontal bar chart for keyword scores/frequencies
 * Follows WordFrequency BarChart design
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { Box } from '@mui/material'

interface DataItem {
  word: string
  frequency: number
  score: number
  percentage?: number
}

interface BarChartProps {
  data: DataItem[]
  maxItems?: number
  showPercentage?: boolean
  colorScheme?: string
  height?: number
  onBarClick?: (word: string) => void
  valueKey?: 'frequency' | 'score'
}

// Color palettes for different schemes - same as WordFrequency
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
  maxItems = 20,
  showPercentage = false,
  colorScheme = 'blue',
  height = 400,
  onBarClick,
  valueKey = 'score'
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

    // Get display data
    const displayData = data.slice(0, maxItems)
    
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

    // Get value accessor
    const getValue = (d: DataItem) => {
      if (showPercentage && d.percentage !== undefined) {
        return d.percentage
      }
      return valueKey === 'score' ? d.score : d.frequency
    }

    // Scales
    const maxValue = d3.max(displayData, getValue) || 0
    
    const xScale = d3.scaleLinear()
      .domain([0, maxValue])
      .range([0, width])

    const yScale = d3.scaleBand()
      .domain(displayData.map(d => d.word))
      .range([0, height])
      .padding(0.2)

    // Color scale - same as WordFrequency
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const colorScale = d3.scaleLinear<string>()
      .domain([0, displayData.length - 1])
      .range([colors[4], colors[1]])

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => {
        if (showPercentage) {
          return `${d}%`
        }
        return valueKey === 'score' ? d3.format('.4f')(d as number) : d3.format(',')(d as number)
      }))
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
      .data(displayData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('y', d => yScale(d.word) || 0)
      .attr('x', 0)
      .attr('height', yScale.bandwidth())
      .attr('width', 0)
      .attr('fill', (_, i) => colorScale(i))
      .attr('rx', 3)
      .attr('cursor', onBarClick ? 'pointer' : 'default')
      .on('click', (_, d) => {
        if (onBarClick) onBarClick(d.word)
      })
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 0.8)

        // Show tooltip
        const tooltip = g.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${xScale(getValue(d)) + 5}, ${(yScale(d.word) || 0) + yScale.bandwidth() / 2})`)
        
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
          .text(() => {
            if (showPercentage && d.percentage !== undefined) {
              return `${d.percentage.toFixed(2)}%`
            }
            return valueKey === 'score' ? d.score.toFixed(4) : d.frequency.toLocaleString()
          })
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 1)
        g.selectAll('.tooltip').remove()
      })
      .transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .attr('width', d => xScale(getValue(d)))

    // Add value labels inside bars with smart positioning
    g.selectAll('.value-label')
      .data(displayData)
      .enter()
      .append('text')
      .attr('class', 'value-label')
      .attr('y', d => (yScale(d.word) || 0) + yScale.bandwidth() / 2 + 4)
      .attr('x', d => {
        const barWidth = xScale(getValue(d))
        return barWidth > 60 ? barWidth - 8 : barWidth + 5
      })
      .attr('text-anchor', d => {
        const barWidth = xScale(getValue(d))
        return barWidth > 60 ? 'end' : 'start'
      })
      .attr('fill', d => {
        const barWidth = xScale(getValue(d))
        return barWidth > 60 ? 'white' : '#333'
      })
      .attr('font-size', '10px')
      .attr('opacity', 0)
      .text(d => {
        if (showPercentage && d.percentage !== undefined) {
          return `${d.percentage.toFixed(1)}%`
        }
        return valueKey === 'score' ? d.score.toFixed(4) : d.frequency.toLocaleString()
      })
      .transition()
      .duration(500)
      .delay((_, i) => i * 30 + 300)
      .attr('opacity', 1)

  }, [data, maxItems, dimensions, colorScheme, showPercentage, onBarClick, valueKey])

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


/**
 * D3.js Bar Chart Component for Metaphor Analysis
 * Horizontal bar chart for metaphor word frequency or source distribution
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'

interface MetaphorBarChartProps {
  labels: string[]
  values: number[]
  colors: string[]
  onBarClick?: (label: string) => void
  showPercentage?: boolean
}

export default function MetaphorBarChart({
  labels,
  values,
  colors,
  onBarClick,
  showPercentage = false
}: MetaphorBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
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
    if (labels.length === 0 || values.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Prepare data
    const data = labels.map((label, i) => ({
      label,
      value: values[i] || 0,
      color: colors[i] || '#4CAF50'
    }))

    // Margins and dimensions
    const margin = { top: 20, right: 30, bottom: 30, left: 150 }
    const width = dimensions.width - margin.left - margin.right
    const chartHeight = dimensions.height - margin.top - margin.bottom

    // Create main group
    const g = svg
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const maxValue = d3.max(data, d => d.value) || 0

    const xScale = d3.scaleLinear()
      .domain([0, maxValue])
      .range([0, width])

    const yScale = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, chartHeight])
      .padding(0.2)

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => d3.format(',')(d as number)))
      .selectAll('text')
      .style('font-size', '11px')

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).tickFormat(d => {
        return d.length > 20 ? d.substring(0, 17) + '...' : d
      }))
      .selectAll('text')
      .style('font-size', '11px')
      .attr('dx', '-0.5em')

    // Add gridlines
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(5)
          .tickSize(-chartHeight)
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
      .attr('y', d => yScale(d.label) || 0)
      .attr('x', 0)
      .attr('height', yScale.bandwidth())
      .attr('width', 0)
      .attr('fill', d => d.color)
      .attr('rx', 3)
      .attr('cursor', onBarClick ? 'pointer' : 'default')
      .on('click', (_, d) => {
        if (onBarClick) {
          onBarClick(d.label)
        }
      })
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 0.8)

        // Show tooltip
        const tooltip = g.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${xScale(d.value) + 5}, ${(yScale(d.label) || 0) + yScale.bandwidth() / 2})`)

        const tooltipText = `${d.label}: ${d.value.toLocaleString()}`
        const textWidth = tooltipText.length * 7 + 16

        tooltip.append('rect')
          .attr('fill', 'rgba(0,0,0,0.8)')
          .attr('rx', 4)
          .attr('x', 0)
          .attr('y', -14)
          .attr('width', textWidth)
          .attr('height', 28)

        tooltip.append('text')
          .attr('fill', 'white')
          .attr('font-size', '12px')
          .attr('x', 8)
          .attr('y', 4)
          .text(tooltipText)
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 1)
        g.selectAll('.tooltip').remove()
      })
      .transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .attr('width', d => xScale(d.value))

    // Calculate total for percentage
    const total = data.reduce((sum, d) => sum + d.value, 0)

    // Add value labels inside bars
    g.selectAll('.value-label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'value-label')
      .attr('y', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2 + 4)
      .attr('x', d => {
        const barWidth = xScale(d.value)
        return barWidth > 50 ? barWidth - 8 : barWidth + 5
      })
      .attr('text-anchor', d => {
        const barWidth = xScale(d.value)
        return barWidth > 50 ? 'end' : 'start'
      })
      .attr('fill', d => {
        const barWidth = xScale(d.value)
        return barWidth > 50 ? 'white' : theme.palette.text.primary
      })
      .attr('font-size', '10px')
      .attr('opacity', 0)
      .text(d => {
        if (showPercentage && total > 0) {
          return `${((d.value / total) * 100).toFixed(1)}%`
        }
        return d.value.toLocaleString()
      })
      .transition()
      .duration(500)
      .delay((_, i) => i * 30 + 300)
      .attr('opacity', 1)

  }, [labels, values, colors, dimensions, onBarClick, showPercentage, theme])

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

/**
 * D3.js Pie Chart Component for Metaphor Analysis
 * Pie/donut chart for metaphor distribution
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'

interface MetaphorPieChartProps {
  labels: string[]
  values: number[]
  colors: string[]
  donut?: boolean
  showLegend?: boolean
  showPercentage?: boolean
}

export default function MetaphorPieChart({
  labels,
  values,
  colors,
  donut = true,
  showLegend = true,
  showPercentage = true
}: MetaphorPieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
  const { t } = useTranslation()
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        })
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    if (containerSize.width === 0 || containerSize.height === 0) return
    if (labels.length === 0 || values.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Prepare data
    const pieData = labels.map((label, i) => ({
      label,
      value: values[i] || 0,
      color: colors[i] || '#4CAF50'
    })).filter(d => d.value > 0)

    if (pieData.length === 0) return

    const total = pieData.reduce((sum, d) => sum + d.value, 0)

    // Dimensions
    const margin = 20
    const legendWidth = showLegend ? 180 : 0
    const chartHeight = containerSize.height
    const chartWidth = containerSize.width - legendWidth
    const size = Math.min(chartWidth - margin * 4, chartHeight - margin * 4)
    const radius = size / 2
    const innerRadius = donut ? radius * 0.5 : 0

    // Set SVG dimensions
    svg
      .attr('width', containerSize.width)
      .attr('height', containerSize.height)

    // Chart group - center the pie chart
    const chartGroup = svg.append('g')
      .attr('transform', `translate(${(chartWidth + margin) / 2},${chartHeight / 2})`)

    // Pie generator
    const pie = d3.pie<typeof pieData[0]>()
      .value(d => d.value)
      .sort(null)
      .padAngle(0.02)

    // Arc generator
    const arc = d3.arc<d3.PieArcDatum<typeof pieData[0]>>()
      .innerRadius(innerRadius)
      .outerRadius(radius)

    // Arc for labels
    const labelArc = d3.arc<d3.PieArcDatum<typeof pieData[0]>>()
      .innerRadius(radius * 0.7)
      .outerRadius(radius * 0.7)

    // Arc for hover
    const hoverArc = d3.arc<d3.PieArcDatum<typeof pieData[0]>>()
      .innerRadius(innerRadius)
      .outerRadius(radius * 1.05)

    // Draw slices
    const slices = chartGroup.selectAll('.slice')
      .data(pie(pieData))
      .enter()
      .append('path')
      .attr('class', 'slice')
      .attr('fill', d => d.data.color)
      .attr('stroke', theme.palette.background.paper)
      .attr('stroke-width', 2)
      .attr('d', arc)

    // Animate slices
    slices
      .transition()
      .duration(800)
      .attrTween('d', function(d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d)
        return function(tVal) {
          return arc(interpolate(tVal)) || ''
        }
      })

    // Add hover effects
    slices
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', hoverArc)
          .attr('opacity', 0.9)

        // Show tooltip
        const percentage = ((d.data.value / total) * 100).toFixed(1)
        const tooltip = d3.select(containerRef.current)
          .append('div')
          .attr('class', 'tooltip')
          .style('position', 'absolute')
          .style('background', theme.palette.background.paper)
          .style('border', `1px solid ${theme.palette.divider}`)
          .style('border-radius', '4px')
          .style('padding', '8px 12px')
          .style('box-shadow', theme.shadows[2])
          .style('pointer-events', 'none')
          .style('font-size', '12px')
          .style('z-index', 1000)
          .html(`
            <strong>${d.data.label}</strong><br/>
            ${d.data.value.toLocaleString()} (${percentage}%)
          `)

        const [mouseX, mouseY] = d3.pointer(event, containerRef.current)
        tooltip
          .style('left', `${mouseX + 10}px`)
          .style('top', `${mouseY - 10}px`)
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc)
          .attr('opacity', 1)

        d3.select(containerRef.current).selectAll('.tooltip').remove()
      })

    // Add labels on large slices (only if showPercentage is true)
    if (showPercentage) {
      chartGroup.selectAll('.label')
        .data(pie(pieData))
        .enter()
        .filter(d => (d.data.value / total) > 0.05)
        .append('text')
        .attr('class', 'label')
        .attr('transform', d => `translate(${labelArc.centroid(d)})`)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', '11px')
        .attr('font-weight', 500)
        .attr('opacity', 0)
        .text(d => `${((d.data.value / total) * 100).toFixed(1)}%`)
        .transition()
        .delay(800)
        .duration(300)
        .attr('opacity', 1)
    }

    // Draw legend
    if (showLegend) {
      const legendGroup = svg.append('g')
        .attr('transform', `translate(${chartWidth + margin}, ${margin + 20})`)

      const legendItems = legendGroup.selectAll('.legend-item')
        .data(pieData)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (_, i) => `translate(0, ${i * 22})`)
        .style('cursor', 'pointer')
        .on('mouseover', function(_, d) {
          slices.filter(s => s.data.label === d.label)
            .transition()
            .duration(200)
            .attr('d', hoverArc)
        })
        .on('mouseout', function() {
          slices.transition()
            .duration(200)
            .attr('d', arc)
        })

      // Legend color boxes
      legendItems.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('rx', 2)
        .attr('fill', d => d.color)

      // Legend text
      legendItems.append('text')
        .attr('x', 18)
        .attr('y', 6)
        .attr('dy', '0.35em')
        .attr('font-size', '11px')
        .attr('fill', theme.palette.text.primary)
        .text(d => {
          const label = d.label.length > 15 ? d.label.substring(0, 12) + '...' : d.label
          if (showPercentage) {
            const percentage = ((d.value / total) * 100).toFixed(1)
            return `${label} (${percentage}%)`
          }
          return `${label} (${d.value.toLocaleString()})`
        })
    }

    // Center text for donut
    if (donut) {
      chartGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .attr('font-size', '24px')
        .attr('font-weight', 600)
        .attr('fill', theme.palette.text.primary)
        .text(total.toLocaleString())

      chartGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .attr('font-size', '12px')
        .attr('fill', theme.palette.text.secondary)
        .text(t('common.total'))
    }

    // Cleanup
    return () => {
      d3.select(containerRef.current).selectAll('.tooltip').remove()
    }
  }, [labels, values, colors, donut, showLegend, showPercentage, containerSize, theme, t])

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        '& svg': {
          display: 'block',
          width: '100%',
          height: '100%'
        }
      }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </Box>
  )
}

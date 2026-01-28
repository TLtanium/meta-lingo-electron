/**
 * D3.js Pie Chart Component
 * Pie/donut chart for word frequency distribution
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { WordFrequencyResult } from '../../../types/wordFrequency'

interface PieChartProps {
  data: WordFrequencyResult[]
  maxItems?: number
  showLegend?: boolean
  donut?: boolean
  colorScheme?: string
  showPercentage?: boolean
  onSliceClick?: (word: string) => void
}

export default function PieChart({
  data,
  maxItems = 10,
  showLegend = true,
  donut = true,
  colorScheme = 'blue',
  showPercentage = true,
  onSliceClick
}: PieChartProps) {
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
    if (!svgRef.current || !containerRef.current || data.length === 0) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Get display data and calculate "others"
    const topData = data.slice(0, maxItems)
    const othersTotal = data.slice(maxItems).reduce((sum, d) => sum + d.frequency, 0)
    
    let pieData: { word: string; frequency: number; percentage: number }[] = topData.map(d => ({
      word: d.word,
      frequency: d.frequency,
      percentage: d.percentage
    }))

    if (othersTotal > 0) {
      const totalPercentage = data.slice(maxItems).reduce((sum, d) => sum + d.percentage, 0)
      pieData.push({
        word: t('wordFrequency.viz.others'),
        frequency: othersTotal,
        percentage: totalPercentage
      })
    }

    // Dimensions - responsive to container, fill the space
    const margin = 20
    const legendWidth = showLegend ? 160 : 0
    const chartHeight = containerSize.height
    const chartWidth = containerSize.width - legendWidth
    const size = Math.min(chartWidth - margin * 4, chartHeight - margin * 4)
    const radius = size / 2
    const innerRadius = donut ? radius * 0.5 : 0
    const totalWidth = containerSize.width

    // Set SVG dimensions
    svg
      .attr('width', containerSize.width)
      .attr('height', containerSize.height)

    // Chart group - center the pie chart
    const chartGroup = svg.append('g')
      .attr('transform', `translate(${(chartWidth + margin) / 2},${chartHeight / 2})`)

    // Color scale - uniform distribution across slices
    // Sort by percentage to ensure proper color mapping (highest = darkest)
    const sortedPieData = [...pieData].sort((a, b) => b.percentage - a.percentage)
    
    const getColorInterpolator = () => {
      const interpolators: Record<string, (t: number) => string> = {
        blue: d3.interpolateBlues,
        green: d3.interpolateGreens,
        purple: d3.interpolatePurples,
        orange: d3.interpolateOranges,
        red: d3.interpolateReds
      }
      return interpolators[colorScheme] || interpolators.blue
    }

    const colorInterpolator = getColorInterpolator()
    
    // Map each word to a color based on its rank in percentage
    const wordToColor = new Map<string, string>()
    sortedPieData.forEach((d, i) => {
      // Map index to color: 0 (highest) = darkest (0.9), n-1 (lowest) = lightest (0.3)
      const t = 0.9 - (i / (sortedPieData.length - 1)) * 0.6
      wordToColor.set(d.word, colorInterpolator(t))
    })

    // Pie generator
    const pie = d3.pie<typeof pieData[0]>()
      .value(d => d.frequency)
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
      .attr('fill', d => wordToColor.get(d.data.word) || '#999')
      .attr('stroke', theme.palette.background.paper)
      .attr('stroke-width', 2)
      .attr('cursor', onSliceClick ? 'pointer' : 'default')
      .attr('d', arc)

    // Animate slices
    slices
      .transition()
      .duration(800)
      .attrTween('d', function(d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d)
        return function(t) {
          return arc(interpolate(t)) || ''
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
            <strong>${d.data.word}</strong><br/>
            ${t('wordFrequency.table.frequency')}: ${d.data.frequency.toLocaleString()}<br/>
            ${t('wordFrequency.table.percentage')}: ${d.data.percentage.toFixed(2)}%
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
      .on('click', (_, d) => {
        if (onSliceClick && d.data.word !== t('wordFrequency.viz.others')) {
          onSliceClick(d.data.word)
        }
      })

    // Add labels on large slices (percentage or word based on showPercentage)
    chartGroup.selectAll('.label')
      .data(pie(pieData))
      .enter()
      .filter(d => d.data.percentage > 5) // Only show labels for slices > 5%
      .append('text')
      .attr('class', 'label')
      .attr('transform', d => `translate(${labelArc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-size', showPercentage ? '11px' : '10px')
      .attr('font-weight', 500)
      .attr('opacity', 0)
      .text(d => showPercentage ? `${d.data.percentage.toFixed(1)}%` : d.data.word)
      .transition()
      .delay(800)
      .duration(300)
      .attr('opacity', 1)

    // Draw legend
    if (showLegend) {
      const legendGroup = svg.append('g')
        .attr('transform', `translate(${chartWidth + margin}, ${margin})`)

      const legendItems = legendGroup.selectAll('.legend-item')
        .data(pieData)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (_, i) => `translate(0, ${i * 22})`)
        .style('cursor', 'pointer')
        .on('mouseover', function(_, d) {
          // Highlight corresponding slice
          slices.filter(s => s.data.word === d.word)
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
        .attr('fill', d => wordToColor.get(d.word) || '#999')

      // Legend text
      legendItems.append('text')
        .attr('x', 18)
        .attr('y', 6)
        .attr('dy', '0.35em')
        .attr('font-size', '11px')
        .attr('fill', theme.palette.text.primary)
        .text(d => {
          const label = d.word.length > 12 ? d.word.substring(0, 12) + '...' : d.word
          return `${label} (${d.percentage.toFixed(1)}%)`
        })
    }

    // Center text for donut
    if (donut) {
      const total = pieData.reduce((sum, d) => sum + d.frequency, 0)
      
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
        .text(t('wordFrequency.viz.total'))
    }

    // Cleanup
    return () => {
      d3.select(containerRef.current).selectAll('.tooltip').remove()
    }
  }, [data, maxItems, showLegend, donut, colorScheme, showPercentage, containerSize, theme, onSliceClick, t])

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


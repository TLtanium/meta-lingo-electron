/**
 * Sentiment polarity pie chart (positive / negative / neutral)
 * Visual style aligned with WordFrequency PieChart (donut, legend, tooltip),
 * while preserving fixed color mapping for polarity categories.
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'

type PolarityKey = 'positive' | 'negative' | 'neutral' | string
type PolarityColorScheme = 'blue' | 'green' | 'purple' | 'orange' | 'red'

interface DataItem {
  key: PolarityKey
  label: string
  value: number
}

interface SentimentPieChartProps {
  data: DataItem[]
  colorScheme?: PolarityColorScheme
  showPercentage?: boolean
}

// 多套极性配色方案（正/负/中），与维度雷达图的主题相呼应
const POLARITY_COLOR_SCHEMES: Record<
  PolarityColorScheme,
  { positive: string; negative: string; neutral: string }
> = {
  blue: {
    positive: '#2196f3',
    negative: '#ef5350',
    neutral: '#90a4ae'
  },
  green: {
    positive: '#4caf50',
    negative: '#ff7043',
    neutral: '#bdbdbd'
  },
  purple: {
    positive: '#ab47bc',
    negative: '#ff5252',
    neutral: '#b0bec5'
  },
  orange: {
    positive: '#ffa726',
    negative: '#fb8c00',
    neutral: '#bcaaa4'
  },
  red: {
    positive: '#e53935',
    negative: '#8e24aa',
    neutral: '#9e9e9e'
  }
}

export default function SentimentPieChart({
  data,
  colorScheme = 'blue',
  showPercentage = true
}: SentimentPieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!containerRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })
    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    if (containerSize.width === 0 || containerSize.height === 0) return
    if (!data || data.length === 0 || data.every((d) => d.value === 0)) return

    const svg = d3.select(svgRef.current)
    svg.attr('width', containerSize.width).attr('height', containerSize.height)
    svg.selectAll('*').remove()

    const total = data.reduce((sum, d) => sum + d.value, 0)
    if (total === 0) return

    const margin = 20
    const legendWidth = 160
    const chartHeight = containerSize.height
    const chartWidth = containerSize.width - legendWidth
    const size = Math.min(chartWidth - margin * 4, chartHeight - margin * 4)
    const radius = size / 2
    const innerRadius = radius * 0.5

    const chartGroup = svg
      .append('g')
      .attr('transform', `translate(${(chartWidth + margin) / 2},${chartHeight / 2})`)

    const normalizedData = data.map((d) => {
      const percentage = (d.value / total) * 100
      return { ...d, percentage }
    })

    const pie = d3
      .pie<typeof normalizedData[0]>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.02)

    const arc = d3
      .arc<d3.PieArcDatum<typeof normalizedData[0]>>()
      .innerRadius(innerRadius)
      .outerRadius(radius)

    const labelArc = d3
      .arc<d3.PieArcDatum<typeof normalizedData[0]>>()
      .innerRadius(radius * 0.7)
      .outerRadius(radius * 0.7)

    const hoverArc = d3
      .arc<d3.PieArcDatum<typeof normalizedData[0]> >()
      .innerRadius(innerRadius)
      .outerRadius(radius * 1.05)

    const slices = chartGroup
      .selectAll('.slice')
      .data(pie(normalizedData))
      .enter()
      .append('path')
      .attr('class', 'slice')
      .attr('fill', (d) => {
        const key = String(d.data.key || d.data.label).toLowerCase()
        const scheme = POLARITY_COLOR_SCHEMES[colorScheme] ?? POLARITY_COLOR_SCHEMES.blue
        if (key.includes('positive')) return scheme.positive
        if (key.includes('negative')) return scheme.negative
        if (key.includes('neutral')) return scheme.neutral
        return scheme.neutral
      })
      .attr('stroke', theme.palette.background.paper)
      .attr('stroke-width', 2)
      .attr('d', arc as any)

    slices
      .transition()
      .duration(800)
      .attrTween('d', function (d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d)
        return function (t) {
          return arc(interpolate(t)) || ''
        }
      })

    slices
      .on('mouseover', function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', hoverArc as any)
          .attr('opacity', 0.9)

        const tooltip = d3
          .select(containerRef.current)
          .append('div')
          .attr('class', 'tooltip')
          .style('position', 'absolute')
          .style('background', theme.palette.background.paper)
          .style('border', `1px solid ${theme.palette.divider}`)
          .style('border-radius', '4px')
          .style('padding', '8px 12px')
          .style('box-shadow', theme.shadows[2] as any)
          .style('pointer-events', 'none')
          .style('font-size', '12px')
          .style('z-index', '1000')
          .html(
            `<strong>${d.data.label}</strong><br/>${d.data.value.toLocaleString()} (${d.data.percentage.toFixed(
              1
            )}%)`
          )

        const [mouseX, mouseY] = d3.pointer(event, containerRef.current)
        tooltip.style('left', `${mouseX + 10}px`).style('top', `${mouseY - 10}px`)
      })
      .on('mouseout', function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc as any)
          .attr('opacity', 1)

        d3.select(containerRef.current).selectAll('.tooltip').remove()
      })

    chartGroup
      .selectAll('.label')
      .data(pie(normalizedData))
      .enter()
      .filter((d) => d.data.percentage > 8)
      .append('text')
      .attr('class', 'label')
      .attr('transform', (d) => `translate(${labelArc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', theme.palette.common.white)
      .attr('font-size', '11px')
      .attr('font-weight', 500)
      .attr('opacity', 0)
      .text((d) => (showPercentage ? `${d.data.percentage.toFixed(1)}%` : d.data.label))
      .transition()
      .delay(800)
      .duration(300)
      .attr('opacity', 1)

    const legendGroup = svg
      .append('g')
      .attr('transform', `translate(${chartWidth + margin}, ${margin})`)

    const legendItems = legendGroup
      .selectAll('.legend-item')
      .data(normalizedData)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (_, i) => `translate(0, ${i * 24})`)

    legendItems
      .append('rect')
      .attr('width', 14)
      .attr('height', 14)
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', (d) => {
        const key = String(d.key || d.label).toLowerCase()
        const scheme = POLARITY_COLOR_SCHEMES[colorScheme] ?? POLARITY_COLOR_SCHEMES.blue
        if (key.includes('positive')) return scheme.positive
        if (key.includes('negative')) return scheme.negative
        if (key.includes('neutral')) return scheme.neutral
        return scheme.neutral
      })

    legendItems
      .append('text')
      .attr('x', 20)
      .attr('y', 11)
      .attr('fill', theme.palette.text.primary)
      .attr('font-size', '12px')
      .text((d) => (showPercentage ? `${d.label} (${d.percentage.toFixed(1)}%)` : d.label))
  }, [data, containerSize, theme, colorScheme, showPercentage])

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 320,
        position: 'relative'
      }}
    >
      <svg ref={svgRef} />
    </Box>
  )
}

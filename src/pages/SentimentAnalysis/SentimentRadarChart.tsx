/**
 * Radar chart for sentiment dimensions (8 emotions + others).
 * Supports colorScheme and improved layout: concentric grid, gradient fill, clear labels.
 */

import { useRef, useEffect, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'

interface DataItem {
  label: string
  value: number
}

export type RadarColorScheme = 'blue' | 'green' | 'purple' | 'orange' | 'red'

const SCHEME_COLORS: Record<RadarColorScheme, { main: string; light: string }> = {
  blue: { main: '#2196f3', light: 'rgba(33, 150, 243, 0.25)' },
  green: { main: '#4caf50', light: 'rgba(76, 175, 80, 0.25)' },
  purple: { main: '#9c27b0', light: 'rgba(156, 39, 176, 0.25)' },
  orange: { main: '#ff9800', light: 'rgba(255, 152, 0, 0.25)' },
  red: { main: '#f44336', light: 'rgba(244, 67, 54, 0.25)' }
}

interface SentimentRadarChartProps {
  data: DataItem[]
  colorScheme?: RadarColorScheme
}

export default function SentimentRadarChart({ data, colorScheme = 'blue' }: SentimentRadarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
  const [size, setSize] = useState({ w: 0, h: 0 })

  const colors = useMemo(() => SCHEME_COLORS[colorScheme] ?? SCHEME_COLORS.blue, [colorScheme])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ w: width, h: height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || size.w === 0 || size.h === 0) return
    const svg = d3.select(svgRef.current)
    svg.attr('width', size.w).attr('height', size.h)
    svg.selectAll('*').remove()
    const n = data.length
    if (n === 0) return

    const margin = 56
    const chartSize = Math.min(size.w, size.h) - margin * 2
    const cx = size.w / 2
    const cy = size.h / 2
    const maxVal = Math.max(1, ...data.map((d) => d.value))
    const angleStep = (2 * Math.PI) / n
    const radiusScale = (v: number) => (v / maxVal) * (chartSize / 2)
    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`)

    const gridLevels = 5
    const gridColor = theme.palette.text.secondary
    const gridOpacity = theme.palette.mode === 'dark' ? 0.7 : 0.6
    const axisOpacity = theme.palette.mode === 'dark' ? 0.85 : 0.75
    const labelRadius = chartSize / 2 + 32

    // Concentric grid circles — thicker and more visible
    for (let level = 1; level <= gridLevels; level++) {
      const r = (chartSize / 2) * (level / gridLevels)
      g.append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', gridColor)
        .attr('stroke-width', 1)
        .attr('stroke-opacity', gridOpacity)
    }

    // Axis lines (radial) — drawn after circles so they sit on top, thicker for clarity
    data.forEach((d, i) => {
      const a = -Math.PI / 2 + i * angleStep
      const endX = (chartSize / 2) * Math.cos(a)
      const endY = (chartSize / 2) * Math.sin(a)
      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', endX)
        .attr('y2', endY)
        .attr('stroke', gridColor)
        .attr('stroke-width', 1.2)
        .attr('stroke-opacity', axisOpacity)

      const lx = labelRadius * Math.cos(a)
      const ly = labelRadius * Math.sin(a)
      g.append('text')
        .attr('x', lx)
        .attr('y', ly)
        .attr('text-anchor', lx >= 0 ? 'start' : 'end')
        .attr('dominant-baseline', 'central')
        .attr('fill', theme.palette.text.primary)
        .style('font-size', '12px')
        .style('font-weight', 500)
        .text(`${d.label}: ${d.value}`)
    })

    // Data polygon
    const points = data.map((d, i) => {
      const a = -Math.PI / 2 + i * angleStep
      const r = radiusScale(d.value)
      return [r * Math.cos(a), r * Math.sin(a)] as [number, number]
    })
    const line = d3.line().curve(d3.curveLinearClosed)
    const pathD = line(points)
    const fillOpacity = theme.palette.mode === 'dark' ? 0.35 : 0.25
    if (pathD) {
      g.append('path')
        .attr('d', pathD)
        .attr('fill', colors.main)
        .attr('fill-opacity', fillOpacity)
        .attr('stroke', colors.main)
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')
    }

    // Data points (dots) — stroke uses background so they read on light and dark
    const dotStroke = theme.palette.mode === 'dark' ? theme.palette.background.default : theme.palette.background.paper
    data.forEach((d, i) => {
      const a = -Math.PI / 2 + i * angleStep
      const r = radiusScale(d.value)
      const x = r * Math.cos(a)
      const y = r * Math.sin(a)
      g.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 5)
        .attr('fill', colors.main)
        .attr('stroke', dotStroke)
        .attr('stroke-width', 1.5)
    })
  }, [data, size, theme.palette.mode, theme.palette.text.primary, theme.palette.text.secondary, theme.palette.background.paper, theme.palette.background.default, colors])

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', minHeight: 320 }}>
      <svg ref={svgRef} width={size.w} height={size.h} />
    </Box>
  )
}

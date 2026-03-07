/**
 * Pie chart for sentiment polarity (positive / negative / neutral)
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'

interface DataItem {
  label: string
  value: number
}

interface SentimentPieChartProps {
  data: DataItem[]
}

const COLORS = ['#4caf50', '#f44336', '#9e9e9e'] // positive, negative, neutral

export default function SentimentPieChart({ data }: SentimentPieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
  const [size, setSize] = useState({ w: 0, h: 0 })

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
    if (!svgRef.current || size.w === 0 || size.h === 0 || data.every((d) => d.value === 0)) return
    const svg = d3.select(svgRef.current)
    svg.attr('width', size.w).attr('height', size.h)
    svg.selectAll('*').remove()
    const total = data.reduce((s, d) => s + d.value, 0)
    if (total === 0) return
    const margin = 40
    const r = Math.min(size.w, size.h) / 2 - margin
    const g = svg.append('g').attr('transform', `translate(${size.w / 2},${size.h / 2})`)
    const pie = d3.pie<DataItem>().value((d) => d.value)(data)
    const arc = d3.arc<d3.PieArcDatum<DataItem>>().innerRadius(r * 0.5).outerRadius(r)
    const color = d3.scaleOrdinal<string>().domain(data.map((d) => d.label)).range(COLORS)
    g.selectAll('path')
      .data(pie)
      .join('path')
      .attr('d', arc)
      .attr('fill', (d) => color(d.data.label))
      .attr('stroke', theme.palette.background.paper)
      .attr('stroke-width', 2)
    g.selectAll('text')
      .data(pie)
      .join('text')
      .attr('transform', (d) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('fill', theme.palette.text.primary)
      .style('font-size', '12px')
      .text((d) => (d.data.value > 0 ? `${d.data.label} ${((d.data.value / total) * 100).toFixed(0)}%` : ''))
  }, [data, size, theme])

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', minHeight: 300 }}>
      <svg ref={svgRef} width={size.w} height={size.h} />
    </Box>
  )
}

/**
 * Density Plot
 * D3.js density distribution of keyword positions
 */

import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import * as d3 from 'd3'
import { useTranslation } from 'react-i18next'
import type { KWICResult } from '../../../../types/collocation'

interface DensityPlotProps {
  results: KWICResult[]
  width?: number
  height?: number
  colorScheme?: string
}

// Color scheme mapping
const COLOR_MAP: Record<string, string> = {
  blue: '#2196f3',
  green: '#4caf50',
  purple: '#9c27b0',
  orange: '#ff9800',
  red: '#f44336'
}

export default function DensityPlot({
  results,
  height: propHeight,
  colorScheme = 'blue'
}: DensityPlotProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const theme = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Calculate position percentages (normalize positions within each text)
  const normalizedPositions = useMemo(() => {
    const textGroups = new Map<string, number[]>()
    results.forEach(r => {
      if (!textGroups.has(r.text_id)) {
        textGroups.set(r.text_id, [])
      }
      textGroups.get(r.text_id)!.push(r.position)
    })

    const percentages: number[] = []
    textGroups.forEach(positions => {
      const maxPos = Math.max(...positions, 1)
      positions.forEach(pos => {
        percentages.push((pos / maxPos) * 100)
      })
    })
    return percentages
  }, [results])


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
    if (!containerRef.current || results.length === 0) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    // Clear previous content
    d3.select(containerRef.current).selectAll('svg').remove()
    d3.select(containerRef.current).selectAll('.tooltip').remove()

    const width = containerSize.width
    const height = containerSize.height
    const margin = { top: 50, right: 40, bottom: 60, left: 70 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, 100])
      .range([0, innerWidth])

    // Compute histogram
    const histogram = d3.histogram()
      .domain([0, 100] as [number, number])
      .thresholds(20)

    const bins = histogram(normalizedPositions)
    const maxBinCount = d3.max(bins, d => d.length) || 1

    const yScale = d3.scaleLinear()
      .domain([0, maxBinCount * 1.1])
      .range([innerHeight, 0])

    // Kernel density estimation
    const kde = (kernel: (v: number) => number, thresholds: number[], data: number[]) => {
      return thresholds.map(t => [t, d3.mean(data, d => kernel(t - d)) || 0] as [number, number])
    }

    const epanechnikov = (bandwidth: number) => (x: number) => {
      const v = x / bandwidth
      return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / bandwidth : 0
    }

    const bandwidth = 5
    const thresholds = xScale.ticks(50)
    const density = kde(epanechnikov(bandwidth), thresholds, normalizedPositions)

    // Scale density to fit
    const maxDensity = d3.max(density, d => d[1]) || 1
    const densityScale = d3.scaleLinear()
      .domain([0, maxDensity])
      .range([innerHeight, 0])

    const primaryColor = COLOR_MAP[colorScheme] || COLOR_MAP.blue

    // Draw bars with animation
    const bars = g.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x', d => xScale(d.x0 || 0) + 1)
      .attr('y', innerHeight)
      .attr('width', d => Math.max(0, xScale(d.x1 || 0) - xScale(d.x0 || 0) - 2))
      .attr('height', 0)
      .attr('fill', primaryColor)
      .attr('opacity', 0.5)
      .attr('rx', 2)
      .attr('cursor', 'pointer')

    // Animate bars
    bars.transition()
      .duration(600)
      .delay((_, i) => i * 20)
      .attr('y', d => yScale(d.length))
      .attr('height', d => innerHeight - yScale(d.length))

    // Add hover effects
    bars
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('opacity', 0.8)
          .attr('stroke', primaryColor)
          .attr('stroke-width', 2)
        
        // Show tooltip
        const tooltip = d3.select(containerRef.current)
          .append('div')
          .attr('class', 'tooltip')
          .style('position', 'absolute')
          .style('background', theme.palette.background.paper)
          .style('border', `1px solid ${theme.palette.divider}`)
          .style('border-radius', '8px')
          .style('padding', '10px 14px')
          .style('box-shadow', theme.shadows[4])
          .style('pointer-events', 'none')
          .style('font-size', '12px')
          .style('z-index', 1000)
          .html(`
            <strong>${isZh ? '区间' : 'Range'}: ${(d.x0 || 0).toFixed(0)}% - ${(d.x1 || 0).toFixed(0)}%</strong><br/>
            ${isZh ? '命中数' : 'Hits'}: ${d.length}<br/>
            ${isZh ? '占比' : 'Percentage'}: ${((d.length / results.length) * 100).toFixed(1)}%
          `)

        const [mouseX, mouseY] = d3.pointer(event, containerRef.current)
        tooltip
          .style('left', `${mouseX + 15}px`)
          .style('top', `${mouseY - 10}px`)
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('opacity', 0.5)
          .attr('stroke', 'none')
        
        d3.select(containerRef.current).selectAll('.tooltip').remove()
      })

    // Draw density line with animation
    const line = d3.line<[number, number]>()
      .curve(d3.curveBasis)
      .x(d => xScale(d[0]))
      .y(d => densityScale(d[1]))

    const path = g.append('path')
      .datum(density)
      .attr('fill', 'none')
      .attr('stroke', primaryColor)
      .attr('stroke-width', 3)
      .attr('d', line)

    // Animate line
    const pathLength = path.node()?.getTotalLength() || 0
    path
      .attr('stroke-dasharray', pathLength)
      .attr('stroke-dashoffset', pathLength)
      .transition()
      .duration(1000)
      .delay(400)
      .attr('stroke-dashoffset', 0)

    // Draw area under density curve
    const area = d3.area<[number, number]>()
      .curve(d3.curveBasis)
      .x(d => xScale(d[0]))
      .y0(innerHeight)
      .y1(d => densityScale(d[1]))

    g.append('path')
      .datum(density)
      .attr('fill', primaryColor)
      .attr('opacity', 0)
      .attr('d', area)
      .transition()
      .delay(800)
      .duration(500)
      .attr('opacity', 0.15)

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat(d => `${d}%`))
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('fill', theme.palette.text.secondary)

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(6))
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('fill', theme.palette.text.secondary)

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat(() => '')
      )

    // X axis label
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', theme.palette.text.secondary)
      .text(isZh ? '文本位置 (%)' : 'Text Position (%)')

    // Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', theme.palette.text.secondary)
      .text(isZh ? '频率' : 'Frequency')

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', 600)
      .attr('fill', theme.palette.text.primary)
      .text(isZh ? '关键词位置密度分布' : 'Keyword Position Density Distribution')

    // Stats annotation
    const mean = d3.mean(normalizedPositions) || 0

    g.append('line')
      .attr('x1', xScale(mean))
      .attr('x2', xScale(mean))
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#f44336')
      .attr('stroke-dasharray', '5,5')
      .attr('stroke-width', 2)
      .attr('opacity', 0)
      .transition()
      .delay(1200)
      .duration(300)
      .attr('opacity', 1)

    g.append('text')
      .attr('x', xScale(mean) + 8)
      .attr('y', 20)
      .attr('fill', '#f44336')
      .attr('font-size', '11px')
      .attr('font-weight', 500)
      .attr('opacity', 0)
      .text(`${isZh ? '均值' : 'Mean'}: ${mean.toFixed(1)}%`)
      .transition()
      .delay(1200)
      .duration(300)
      .attr('opacity', 1)

    // Cleanup
    return () => {
      d3.select(containerRef.current).selectAll('.tooltip').remove()
    }
  }, [results, normalizedPositions, containerSize, colorScheme, isZh, theme])

  if (results.length === 0) {
    return (
      <Box 
        sx={{ 
          flex: 1,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Typography color="text.secondary">
          {isZh ? '无数据' : 'No data'}
        </Typography>
      </Box>
    )
  }

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        display: 'flex',
        overflow: 'hidden',
        '& svg': {
          display: 'block',
          width: '100%',
          height: '100%'
        }
      }}
    />
  )
}

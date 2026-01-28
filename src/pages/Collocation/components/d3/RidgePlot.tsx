/**
 * Ridge Plot (Joy Plot)
 * D3.js grouped density distribution showing keyword positions per document
 * Y-axis: documents, X-axis: document position, Ridge height: frequency density
 */

import { useEffect, useRef, useMemo } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import * as d3 from 'd3'
import { useTranslation } from 'react-i18next'
import type { KWICResult } from '../../../../types/collocation'

interface RidgePlotProps {
  results: KWICResult[]
  width?: number
  height?: number
  colorScheme?: string
  maxDocs?: number
}

// Color scheme mapping
const COLOR_MAP: Record<string, string> = {
  blue: '#2196f3',
  green: '#4caf50',
  purple: '#9c27b0',
  orange: '#ff9800',
  red: '#f44336'
}

export default function RidgePlot({
  results,
  height: propHeight,
  colorScheme = 'blue',
  maxDocs = 10
}: RidgePlotProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const theme = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)

  // Group results by document and calculate normalized positions
  const documentData = useMemo(() => {
    const textGroups = new Map<string, { filename: string; positions: number[]; maxPos: number }>()
    
    results.forEach(r => {
      if (!textGroups.has(r.text_id)) {
        textGroups.set(r.text_id, { 
          filename: r.filename, 
          positions: [], 
          maxPos: 0 
        })
      }
      const group = textGroups.get(r.text_id)!
      group.positions.push(r.position)
      group.maxPos = Math.max(group.maxPos, r.position)
    })

    // Convert to array and calculate normalized positions
    return Array.from(textGroups.entries()).map(([id, data]) => ({
      text_id: id,
      filename: data.filename,
      // Normalize positions to 0-100%
      normalizedPositions: data.positions.map(p => (p / Math.max(data.maxPos, 1)) * 100),
      count: data.positions.length
    })).sort((a, b) => b.count - a.count) // Sort by frequency (most hits first)
      .slice(0, maxDocs) // Limit to maxDocs
  }, [results, maxDocs])


  // Calculate dynamic height
  const rowHeight = 45
  const minHeight = 350
  const calculatedHeight = Math.max(minHeight, documentData.length * rowHeight + 120)
  const height = propHeight || calculatedHeight

  useEffect(() => {
    if (!containerRef.current || results.length === 0 || documentData.length === 0) return

    // Clear previous content
    d3.select(containerRef.current).selectAll('svg').remove()
    d3.select(containerRef.current).selectAll('.tooltip').remove()

    const containerWidth = containerRef.current.clientWidth || 600
    
    const margin = { top: 50, right: 50, bottom: 60, left: 160 }
    const innerWidth = containerWidth - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', containerWidth)
      .attr('height', height)

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, 100])
      .range([0, innerWidth])

    const yScale = d3.scaleBand()
      .domain(documentData.map(d => d.text_id))
      .range([0, innerHeight])
      .padding(0.15)

    // Color scale - create interpolator based on colorScheme
    const primaryColor = COLOR_MAP[colorScheme] || COLOR_MAP.blue
    const baseColor = d3.color(primaryColor) || d3.color('#2196f3')
    
    const colorInterpolator = (t: number) => {
      const lighter = baseColor!.brighter(1.5)
      const darker = baseColor!.darker(0.3)
      return d3.interpolateRgb(lighter.toString(), darker.toString())(t)
    }
    
    const maxCount = d3.max(documentData, d => d.count) || 1
    const colorScale = d3.scaleSequential(colorInterpolator)
      .domain([0, maxCount])

    // KDE function
    const kde = (kernel: (v: number) => number, thresholds: number[], data: number[]) => {
      return thresholds.map(t => [t, d3.mean(data, d => kernel(t - d)) || 0] as [number, number])
    }

    const epanechnikov = (bandwidth: number) => (x: number) => {
      const v = x / bandwidth
      return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / bandwidth : 0
    }

    // Calculate bandwidth based on data
    const bandwidth = 5
    const thresholds = d3.range(0, 101, 2) // 0, 2, 4, ... 100

    // Calculate max density for scaling
    let maxDensity = 0
    documentData.forEach(doc => {
      const density = kde(epanechnikov(bandwidth), thresholds, doc.normalizedPositions)
      const docMax = d3.max(density, d => d[1]) || 0
      maxDensity = Math.max(maxDensity, docMax)
    })

    // Ridge height scale
    const ridgeHeight = yScale.bandwidth() * 2.2

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisBottom(xScale)
        .tickSize(innerHeight)
        .tickFormat(() => '')
      )

    // Draw ridges for each document with animation
    documentData.forEach((doc, docIndex) => {
      const yPos = yScale(doc.text_id) || 0
      
      // Calculate density
      const density = kde(epanechnikov(bandwidth), thresholds, doc.normalizedPositions)
      
      // Create area generator
      const areaGenerator = d3.area<[number, number]>()
        .curve(d3.curveBasis)
        .x(d => xScale(d[0]))
        .y0(yPos + yScale.bandwidth())
        .y1(d => yPos + yScale.bandwidth() - (d[1] / maxDensity) * ridgeHeight)

      const ridgeColor = colorScale(doc.count)
      const strokeColor = d3.color(ridgeColor)?.darker(0.5)?.toString() || primaryColor

      // Draw filled area with animation
      const path = g.append('path')
        .datum(density)
        .attr('fill', ridgeColor)
        .attr('fill-opacity', 0)
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0)
        .attr('d', areaGenerator)
        .attr('cursor', 'pointer')

      // Animate
      path.transition()
        .duration(500)
        .delay(docIndex * 50)
        .attr('fill-opacity', 0.7)
        .attr('stroke-opacity', 1)

      // Add hover effects
      path
        .on('mouseover', function(event) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('fill-opacity', 0.9)
            .attr('stroke-width', 2.5)
          
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
            .style('max-width', '250px')
            .html(`
              <strong>${doc.filename}</strong><br/>
              ${isZh ? '命中数' : 'Hits'}: ${doc.count}<br/>
              ${isZh ? '占总数' : 'Of total'}: ${((doc.count / results.length) * 100).toFixed(1)}%
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
            .attr('fill-opacity', 0.7)
            .attr('stroke-width', 1.5)
          
          d3.select(containerRef.current).selectAll('.tooltip').remove()
        })

      // Add count badge with animation
      g.append('text')
        .attr('x', innerWidth + 10)
        .attr('y', yPos + yScale.bandwidth() / 2)
        .attr('dy', '0.35em')
        .attr('font-size', '11px')
        .attr('font-weight', 500)
        .attr('fill', theme.palette.text.secondary)
        .attr('opacity', 0)
        .text(`(${doc.count})`)
        .transition()
        .delay(docIndex * 50 + 300)
        .duration(300)
        .attr('opacity', 1)
    })

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat(d => `${d}%`))
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('fill', theme.palette.text.secondary)

    // Y axis with document names
    g.append('g')
      .call(d3.axisLeft(yScale)
        .tickFormat(id => {
          const doc = documentData.find(d => d.text_id === id)
          const name = doc?.filename || ''
          return name.length > 20 ? name.slice(0, 17) + '...' : name
        })
      )
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('fill', theme.palette.text.primary)

    // X axis label
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', theme.palette.text.secondary)
      .text(isZh ? '文档位置 (%)' : 'Document Position (%)')

    // Title
    svg.append('text')
      .attr('x', containerWidth / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', 600)
      .attr('fill', theme.palette.text.primary)
      .text(isZh ? '分组山脊图 - 各文档关键词分布' : 'Ridge Plot - Keyword Distribution by Document')

    // Cleanup
    return () => {
      d3.select(containerRef.current).selectAll('.tooltip').remove()
    }
  }, [results, documentData, propHeight, colorScheme, isZh, theme, height, maxDocs])

  if (results.length === 0 || documentData.length === 0) {
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
        overflow: 'auto',
        display: 'flex',
        '& svg': {
          display: 'block',
          width: '100%',
          height: '100%'
        }
      }}
    />
  )
}

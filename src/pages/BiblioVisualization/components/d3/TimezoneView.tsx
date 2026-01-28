/**
 * D3.js Timezone View for Bibliographic Visualization
 * 
 * Shows entries arranged vertically by year with publication count
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { TimezoneVisualizationData } from '../../../../types/biblio'

// Color palettes for different schemes
const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#e3f2fd', '#90caf9', '#42a5f5', '#1e88e5', '#1565c0', '#0d47a1'],
  green: ['#e8f5e9', '#a5d6a7', '#66bb6a', '#43a047', '#2e7d32', '#1b5e20'],
  purple: ['#f3e5f5', '#ce93d8', '#ab47bc', '#8e24aa', '#6a1b9a', '#4a148c'],
  orange: ['#fff3e0', '#ffcc80', '#ffa726', '#fb8c00', '#ef6c00', '#e65100'],
  red: ['#ffebee', '#ef9a9a', '#ef5350', '#e53935', '#c62828', '#b71c1c'],
  teal: ['#e0f2f1', '#80cbc4', '#26a69a', '#00897b', '#00695c', '#004d40']
}

interface TimezoneViewProps {
  data: TimezoneVisualizationData | null
  loading?: boolean
  colorScheme?: string
  width?: number
  height?: number
}

export default function TimezoneView({ 
  data, 
  loading = false,
  colorScheme = 'blue',
  width = 800, 
  height = 600 
}: TimezoneViewProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width, height })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  
  // Smart tooltip positioning to avoid overflow
  const showTooltip = useCallback((event: MouseEvent, content: string) => {
    const container = containerRef.current
    if (!container) return
    
    const containerRect = container.getBoundingClientRect()
    let x = event.clientX - containerRect.left + 12
    let y = event.clientY - containerRect.top + 12
    
    // Estimate tooltip size
    const tooltipWidth = 250
    const tooltipHeight = 120
    
    // Adjust position to avoid overflow
    if (x + tooltipWidth > containerRect.width) {
      x = event.clientX - containerRect.left - tooltipWidth - 12
    }
    if (y + tooltipHeight > containerRect.height) {
      y = event.clientY - containerRect.top - tooltipHeight - 12
    }
    
    x = Math.max(8, x)
    y = Math.max(8, y)
    
    setTooltip({ x, y, content })
  }, [])
  
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({
          width: rect.width || width,
          height: rect.height || height
        })
      }
    }
    
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [width, height])
  
  useEffect(() => {
    if (!svgRef.current || !data || data.slices.length === 0) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const { width: w, height: h } = dimensions
    const margin = { top: 30, right: 30, bottom: 50, left: 60 }
    const innerWidth = w - margin.left - margin.right
    const innerHeight = h - margin.top - margin.bottom
    
    // Get colors
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
    
    // Scales
    const years = data.slices.map(s => s.year)
    const xScale = d3.scaleBand()
      .domain(years.map(String))
      .range([0, innerWidth])
      .padding(0.1)
    
    const maxCount = d3.max(data.slices, s => s.count) || 1
    const yScale = d3.scaleLinear()
      .domain([0, maxCount])
      .range([innerHeight, 0])
    
    // Color scale
    const colorScale = d3.scaleLinear<string>()
      .domain([0, maxCount])
      .range([colors[0], colors[4]])
    
    // Draw x-axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickValues(
        years.filter((_, i) => i % Math.ceil(years.length / 10) === 0).map(String)
      ))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .style('font-size', '11px')
    
    // Add x-axis label
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', '#666')
      .text(t('biblio.year'))
    
    // Draw y-axis
    g.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('font-size', '11px')
    
    // Y-axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', '#666')
      .text(t('biblio.publicationCount'))
    
    // Add gridlines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .style('stroke-dasharray', '3,3')
      .style('stroke-opacity', 0.2)
    
    // Draw bars with animation
    g.selectAll('.bar')
      .data(data.slices)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(String(d.year)) || 0)
      .attr('y', innerHeight)
      .attr('width', xScale.bandwidth())
      .attr('height', 0)
      .attr('fill', d => colorScale(d.count))
      .attr('rx', 2)
      .attr('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        const topTitles = d.entries.slice(0, 3).map(e => `- ${e.title?.substring(0, 35) || 'Untitled'}...`).join('\n')
        const content = `${t('biblio.year')}: ${d.year}\n${t('biblio.count')}: ${d.count}\n\n${t('biblio.topPapers')}:\n${topTitles}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mousemove', (event, d) => {
        const topTitles = d.entries.slice(0, 3).map(e => `- ${e.title?.substring(0, 35) || 'Untitled'}...`).join('\n')
        const content = `${t('biblio.year')}: ${d.year}\n${t('biblio.count')}: ${d.count}\n\n${t('biblio.topPapers')}:\n${topTitles}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mouseleave', () => setTooltip(null))
      .transition()
      .duration(500)
      .delay((_, i) => i * 20)
      .attr('y', d => yScale(d.count))
      .attr('height', d => innerHeight - yScale(d.count))
    
    // Draw trend line
    const lineGenerator = d3.line<{ year: number; count: number }>()
      .x(d => (xScale(String(d.year)) || 0) + xScale.bandwidth() / 2)
      .y(d => yScale(d.count))
      .curve(d3.curveMonotoneX)
    
    const linePath = g.append('path')
      .datum(data.slices.map(s => ({ year: s.year, count: s.count })))
      .attr('fill', 'none')
      .attr('stroke', colors[5])
      .attr('stroke-width', 2)
      .attr('d', lineGenerator)
    
    // Animate line
    const totalLength = linePath.node()?.getTotalLength() || 0
    linePath
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(800)
      .delay(data.slices.length * 20)
      .attr('stroke-dashoffset', 0)
    
    // Draw points on line
    g.selectAll('.line-point')
      .data(data.slices)
      .join('circle')
      .attr('class', 'line-point')
      .attr('cx', d => (xScale(String(d.year)) || 0) + xScale.bandwidth() / 2)
      .attr('cy', d => yScale(d.count))
      .attr('r', 0)
      .attr('fill', colors[5])
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)
      .transition()
      .duration(300)
      .delay((_, i) => data.slices.length * 20 + 800 + i * 30)
      .attr('r', 4)
    
  }, [data, dimensions, colorScheme, t, showTooltip])
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }
  
  if (!data || data.slices.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <Typography color="text.secondary">{t('biblio.noData')}</Typography>
      </Box>
    )
  }
  
  return (
    <Box 
      ref={containerRef} 
      sx={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative'
      }}
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: 'block' }}
      />
      
      {tooltip && (
        <Box
          sx={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            bgcolor: 'rgba(0,0,0,0.88)',
            color: 'white',
            px: 1.5,
            py: 1,
            borderRadius: 1,
            fontSize: 11,
            whiteSpace: 'pre-line',
            pointerEvents: 'none',
            zIndex: 100,
            maxWidth: 250,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {tooltip.content}
        </Box>
      )}
      
    </Box>
  )
}

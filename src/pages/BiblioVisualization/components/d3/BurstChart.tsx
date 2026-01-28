/**
 * D3.js Burst Detection Chart for Bibliographic Visualization
 * 
 * CiteSpace-style Gantt chart showing burst periods for keywords/authors
 * with gray background for non-burst periods and colored bars for burst periods
 * Multiple burst periods for the same term are merged into a single row
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { BurstDetectionData } from '../../../../types/biblio'

// Color configurations for different schemes
const COLOR_CONFIGS: Record<string, { burst: string; background: string; highlight: string }> = {
  red: { burst: '#e53935', background: '#e0e0e0', highlight: '#c62828' },
  blue: { burst: '#1e88e5', background: '#e0e0e0', highlight: '#1565c0' },
  green: { burst: '#43a047', background: '#e0e0e0', highlight: '#2e7d32' },
  purple: { burst: '#8e24aa', background: '#e0e0e0', highlight: '#6a1b9a' },
  orange: { burst: '#fb8c00', background: '#e0e0e0', highlight: '#ef6c00' },
  teal: { burst: '#00897b', background: '#e0e0e0', highlight: '#00695c' }
}

interface BurstPeriod {
  start: number
  end: number
  strength: number
  frequency: number
}

interface MergedBurst {
  term: string
  periods: BurstPeriod[]
  maxStrength: number
  totalFrequency: number
}

interface BurstChartProps {
  data: BurstDetectionData | null
  loading?: boolean
  colorScheme?: string
  width?: number
  height?: number
}

export default function BurstChart({ 
  data, 
  loading = false,
  colorScheme = 'red',
  width = 800, 
  height = 600 
}: BurstChartProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width, height })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  
  // Theme-aware colors
  const themeColors = {
    headerBg: isDark ? '#2d2d2d' : '#f5f5f5',
    textPrimary: isDark ? '#e0e0e0' : '#333',
    textSecondary: isDark ? '#aaa' : '#666',
    textMuted: isDark ? '#888' : '#888',
    borderStrong: isDark ? '#555' : '#ccc',
    borderMedium: isDark ? '#444' : '#ddd',
    borderLight: isDark ? '#333' : '#eee',
    rowEven: isDark ? '#1e1e1e' : '#fff',
    rowOdd: isDark ? '#252525' : '#fafafa',
    gridLine: isDark ? '#333' : '#f0f0f0',
    background: isDark ? '#555' : '#e0e0e0'
  }
  
  // Smart tooltip positioning to avoid overflow
  const showTooltip = useCallback((event: MouseEvent, content: string) => {
    const container = containerRef.current
    if (!container) return
    
    const containerRect = container.getBoundingClientRect()
    let x = event.clientX - containerRect.left + 12
    let y = event.clientY - containerRect.top + 12
    
    // Estimate tooltip size (rough estimate)
    const tooltipWidth = 220
    const tooltipHeight = 100
    
    // Adjust x position if would overflow right
    if (x + tooltipWidth > containerRect.width) {
      x = event.clientX - containerRect.left - tooltipWidth - 12
    }
    
    // Adjust y position if would overflow bottom
    if (y + tooltipHeight > containerRect.height) {
      y = event.clientY - containerRect.top - tooltipHeight - 12
    }
    
    // Ensure not negative
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
    if (!svgRef.current || !data || data.bursts.length === 0) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const { width: w } = dimensions
    
    // Layout configuration - CiteSpace-style table layout
    const labelWidth = 160
    const strengthWidth = 70
    const yearRangeWidth = 90
    const margin = { top: 0, right: 15, bottom: 20, left: 15 }
    const headerHeight = 40
    const rowHeight = 22
    const chartLeft = margin.left + labelWidth + yearRangeWidth
    const chartWidth = w - chartLeft - margin.right - strengthWidth
    
    // Get colors
    const colors = COLOR_CONFIGS[colorScheme] || COLOR_CONFIGS.red
    
    // Merge bursts by term
    const termBursts = new Map<string, MergedBurst>()
    
    data.bursts.forEach(burst => {
      if (!termBursts.has(burst.term)) {
        termBursts.set(burst.term, {
          term: burst.term,
          periods: [],
          maxStrength: 0,
          totalFrequency: 0
        })
      }
      
      const merged = termBursts.get(burst.term)!
      merged.periods.push({
        start: burst.burst_start,
        end: burst.burst_end,
        strength: burst.burst_strength,
        frequency: burst.frequency
      })
      merged.maxStrength = Math.max(merged.maxStrength, burst.burst_strength)
      merged.totalFrequency += burst.frequency
    })
    
    // Sort by max strength and take top 30 terms
    const mergedBursts = Array.from(termBursts.values())
      .sort((a, b) => b.maxStrength - a.maxStrength)
      .slice(0, 30)
    
    // Sort periods within each term by start year
    mergedBursts.forEach(burst => {
      burst.periods.sort((a, b) => a.start - b.start)
    })
    
    // Time scale
    const { start, end } = data.time_range
    const xScale = d3.scaleLinear()
      .domain([start, end])
      .range([0, chartWidth])
    
    // Create main group
    const g = svg.append('g')
    
    // Draw header background
    g.append('rect')
      .attr('x', margin.left)
      .attr('y', 0)
      .attr('width', w - margin.left - margin.right)
      .attr('height', headerHeight)
      .attr('fill', themeColors.headerBg)
    
    // Header text
    g.append('text')
      .attr('x', margin.left + labelWidth / 2)
      .attr('y', headerHeight / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('font-weight', 'bold')
      .attr('fill', themeColors.textPrimary)
      .text(t('biblio.keyword'))
    
    g.append('text')
      .attr('x', margin.left + labelWidth + yearRangeWidth / 2)
      .attr('y', headerHeight / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('font-weight', 'bold')
      .attr('fill', themeColors.textPrimary)
      .text(t('biblio.burstPeriod'))
    
    // Year axis in header
    const years = d3.range(start, end + 1)
    const yearStep = Math.ceil(years.length / 8)
    
    years.filter((_, i) => i % yearStep === 0).forEach(year => {
      g.append('text')
        .attr('x', chartLeft + xScale(year))
        .attr('y', headerHeight / 2 + 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', 9)
        .attr('fill', themeColors.textSecondary)
        .text(year)
    })
    
    g.append('text')
      .attr('x', w - margin.right - strengthWidth / 2)
      .attr('y', headerHeight / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('font-weight', 'bold')
      .attr('fill', themeColors.textPrimary)
      .text(t('biblio.strength'))
    
    // Header separator line
    g.append('line')
      .attr('x1', margin.left)
      .attr('y1', headerHeight)
      .attr('x2', w - margin.right)
      .attr('y2', headerHeight)
      .attr('stroke', themeColors.borderStrong)
      .attr('stroke-width', 1)
    
    // Header vertical lines
    g.append('line')
      .attr('x1', margin.left + labelWidth)
      .attr('y1', 0)
      .attr('x2', margin.left + labelWidth)
      .attr('y2', headerHeight)
      .attr('stroke', themeColors.borderMedium)
    
    g.append('line')
      .attr('x1', margin.left + labelWidth + yearRangeWidth)
      .attr('y1', 0)
      .attr('x2', margin.left + labelWidth + yearRangeWidth)
      .attr('y2', headerHeight)
      .attr('stroke', themeColors.borderMedium)
    
    g.append('line')
      .attr('x1', w - margin.right - strengthWidth)
      .attr('y1', 0)
      .attr('x2', w - margin.right - strengthWidth)
      .attr('y2', headerHeight)
      .attr('stroke', themeColors.borderMedium)
    
    // Draw data rows
    mergedBursts.forEach((burst, i) => {
      const rowY = headerHeight + i * rowHeight
      
      // Alternating row background
      g.append('rect')
        .attr('x', margin.left)
        .attr('y', rowY)
        .attr('width', w - margin.left - margin.right)
        .attr('height', rowHeight)
        .attr('fill', i % 2 === 0 ? themeColors.rowEven : themeColors.rowOdd)
      
      // Term label
      const termText = burst.term.length > 20 ? burst.term.substring(0, 17) + '...' : burst.term
      g.append('text')
        .attr('x', margin.left + 8)
        .attr('y', rowY + rowHeight / 2 + 4)
        .attr('font-size', 10)
        .attr('fill', themeColors.textPrimary)
        .attr('cursor', 'pointer')
        .text(termText)
        .on('mouseenter', (event) => {
          if (burst.term.length > 20) {
            showTooltip(event as unknown as MouseEvent, burst.term)
          }
        })
        .on('mousemove', (event) => {
          if (burst.term.length > 20) {
            showTooltip(event as unknown as MouseEvent, burst.term)
          }
        })
        .on('mouseleave', () => setTooltip(null))
      
      // Year range label
      const periodsText = burst.periods.length === 1
        ? `${burst.periods[0].start}-${burst.periods[0].end}`
        : `${burst.periods.length} ${t('biblio.periods')}`
      g.append('text')
        .attr('x', margin.left + labelWidth + yearRangeWidth / 2)
        .attr('y', rowY + rowHeight / 2 + 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', 9)
        .attr('fill', themeColors.textSecondary)
        .text(periodsText)
      
      // Timeline bar container (background)
      g.append('rect')
        .attr('x', chartLeft)
        .attr('y', rowY + 4)
        .attr('width', chartWidth)
        .attr('height', rowHeight - 8)
        .attr('fill', themeColors.background)
        .attr('rx', 2)
      
      // Draw all burst periods for this term
      burst.periods.forEach((period, periodIdx) => {
        const burstStart = Math.max(xScale(period.start), 0)
        const burstEnd = Math.min(xScale(period.end), chartWidth)
        const burstWidth = Math.max(burstEnd - burstStart, 4)
        
        g.append('rect')
          .attr('x', chartLeft + burstStart)
          .attr('y', rowY + 4)
          .attr('width', 0)
          .attr('height', rowHeight - 8)
          .attr('fill', colors.burst)
          .attr('rx', 2)
          .attr('cursor', 'pointer')
          .on('mouseenter', (event) => {
            const content = `${burst.term}\n${t('biblio.burstPeriod')} ${periodIdx + 1}: ${period.start}-${period.end}\n${t('biblio.duration')}: ${period.end - period.start + 1}${t('biblio.yearSuffix')}\n${t('biblio.strength')}: ${period.strength.toFixed(3)}\n${t('biblio.frequency')}: ${period.frequency}`
            showTooltip(event as unknown as MouseEvent, content)
          })
          .on('mousemove', (event) => {
            const content = `${burst.term}\n${t('biblio.burstPeriod')} ${periodIdx + 1}: ${period.start}-${period.end}\n${t('biblio.duration')}: ${period.end - period.start + 1}${t('biblio.yearSuffix')}\n${t('biblio.strength')}: ${period.strength.toFixed(3)}\n${t('biblio.frequency')}: ${period.frequency}`
            showTooltip(event as unknown as MouseEvent, content)
          })
          .on('mouseleave', () => setTooltip(null))
          .transition()
          .duration(400)
          .delay(i * 25 + periodIdx * 10)
          .attr('width', burstWidth)
      })
      
      // Strength value
      g.append('text')
        .attr('x', w - margin.right - strengthWidth / 2)
        .attr('y', rowY + rowHeight / 2 + 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', 'bold')
        .attr('fill', colors.highlight)
        .text(burst.maxStrength.toFixed(2))
      
      // Vertical separator lines
      g.append('line')
        .attr('x1', margin.left + labelWidth)
        .attr('y1', rowY)
        .attr('x2', margin.left + labelWidth)
        .attr('y2', rowY + rowHeight)
        .attr('stroke', themeColors.borderLight)
      
      g.append('line')
        .attr('x1', margin.left + labelWidth + yearRangeWidth)
        .attr('y1', rowY)
        .attr('x2', margin.left + labelWidth + yearRangeWidth)
        .attr('y2', rowY + rowHeight)
        .attr('stroke', themeColors.borderLight)
      
      g.append('line')
        .attr('x1', w - margin.right - strengthWidth)
        .attr('y1', rowY)
        .attr('x2', w - margin.right - strengthWidth)
        .attr('y2', rowY + rowHeight)
        .attr('stroke', themeColors.borderLight)
    })
    
    // Draw year grid lines
    years.filter((_, i) => i % yearStep === 0).forEach(year => {
      g.append('line')
        .attr('x1', chartLeft + xScale(year))
        .attr('y1', headerHeight)
        .attr('x2', chartLeft + xScale(year))
        .attr('y2', headerHeight + mergedBursts.length * rowHeight)
        .attr('stroke', themeColors.gridLine)
        .attr('stroke-dasharray', '2,2')
    })
    
    // Draw outer border
    g.append('rect')
      .attr('x', margin.left)
      .attr('y', 0)
      .attr('width', w - margin.left - margin.right)
      .attr('height', headerHeight + mergedBursts.length * rowHeight)
      .attr('fill', 'none')
      .attr('stroke', themeColors.borderStrong)
      .attr('stroke-width', 1)
    
    // Draw legend at bottom
    const legendY = headerHeight + mergedBursts.length * rowHeight + 8
    
    g.append('rect')
      .attr('x', margin.left + 10)
      .attr('y', legendY)
      .attr('width', 14)
      .attr('height', 10)
      .attr('fill', themeColors.background)
      .attr('rx', 2)
      .attr('stroke', themeColors.borderStrong)
    
    g.append('text')
      .attr('x', margin.left + 30)
      .attr('y', legendY + 8)
      .attr('font-size', 9)
      .attr('fill', themeColors.textSecondary)
      .text(t('biblio.nonBurstPeriod'))
    
    g.append('rect')
      .attr('x', margin.left + 110)
      .attr('y', legendY)
      .attr('width', 14)
      .attr('height', 10)
      .attr('fill', colors.burst)
      .attr('rx', 2)
    
    g.append('text')
      .attr('x', margin.left + 130)
      .attr('y', legendY + 8)
      .attr('font-size', 9)
      .attr('fill', themeColors.textSecondary)
      .text(t('biblio.burstPeriodLegend'))
    
    g.append('text')
      .attr('x', w - margin.right - 10)
      .attr('y', legendY + 8)
      .attr('text-anchor', 'end')
      .attr('font-size', 9)
      .attr('fill', themeColors.textMuted)
      .text(`${t('biblio.totalBursts')}: ${data.bursts.length}`)
    
  }, [data, dimensions, colorScheme, t, showTooltip, themeColors])
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }
  
  if (!data || data.bursts.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', flexDirection: 'column', gap: 1 }}>
        <Typography color="text.secondary">{t('biblio.noBursts')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('biblio.noBurstsHint')}
        </Typography>
      </Box>
    )
  }
  
  // Calculate actual height needed
  const rowHeight = 22
  const headerHeight = 40
  const legendHeight = 25
  const actualHeight = Math.max(dimensions.height, headerHeight + Math.min(data.bursts.length, 30) * rowHeight + legendHeight)
  
  return (
    <Box 
      ref={containerRef} 
      sx={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        overflow: 'auto'
      }}
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={actualHeight}
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
            maxWidth: 220,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {tooltip.content}
        </Box>
      )}
    </Box>
  )
}

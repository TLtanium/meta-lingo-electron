/**
 * Ridgeline Plot (Joy Plot) for Bibliographic Visualization
 *
 * CiteSpace Landscape-style mountain-range visualization:
 *  - Spectrum color gradient (red -> orange -> yellow -> green -> cyan -> blue -> purple)
 *  - Each cluster as a separate ridge row with generous vertical spacing
 *  - Scrollable: extends downward as needed (like TimelineView)
 *  - Cardinal spline interpolation for smooth mountain curves
 *  - X-axis at top with year ticks
 *  - Right-side cluster labels matching ridge color
 *  - Color scheme support (spectrum default, or palette-based)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { LandscapeVisualizationData } from '../../../../types/biblio'

// Default spectrum: red -> orange -> yellow -> green -> cyan -> blue -> purple
const SPECTRUM_COLORS = [
  '#ff1744', '#ff3d00', '#ff6d00', '#ff9100', '#ffab00',
  '#ffd600', '#aeea00', '#64dd17', '#00c853', '#00e676',
  '#1de9b6', '#00e5ff', '#00b0ff', '#2979ff', '#536dfe',
  '#651fff', '#d500f9', '#aa00ff', '#7c4dff', '#6200ea'
]

// Palette-based color schemes (same order as other components)
const COLOR_PALETTES: Record<string, string[]> = {
  blue: [
    '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4',
    '#039be5', '#0288d1', '#0277bd', '#01579b', '#0d47a1',
    '#1a237e', '#42a5f5', '#5c6bc0', '#1e88e5', '#1565c0',
    '#0d47a1', '#1976d2', '#2196f3', '#64b5f6', '#90caf9'
  ],
  green: [
    '#dcedc8', '#c5e1a5', '#aed581', '#9ccc65', '#8bc34a',
    '#7cb342', '#689f38', '#558b2f', '#33691e', '#2e7d32',
    '#1b5e20', '#4caf50', '#66bb6a', '#43a047', '#388e3c',
    '#2e7d32', '#388e3c', '#43a047', '#66bb6a', '#81c784'
  ],
  purple: [
    '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0',
    '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c', '#7c4dff',
    '#651fff', '#d500f9', '#aa00ff', '#b388ff', '#9575cd',
    '#7e57c2', '#673ab7', '#5e35b1', '#512da8', '#4527a0'
  ],
  orange: [
    '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726',
    '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100',
    '#ff6d00', '#bf360c', '#d84315', '#ff8f00', '#f9a825',
    '#ff6f00', '#e65100', '#dd2c00', '#ff3d00', '#ff9100'
  ],
  red: [
    '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336',
    '#e53935', '#d32f2f', '#c62828', '#b71c1c', '#ff1744',
    '#d50000', '#ff5252', '#ff8a80', '#e91e63', '#c2185b',
    '#ad1457', '#880e4f', '#f44336', '#e53935', '#d32f2f'
  ],
  teal: [
    '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688',
    '#00897b', '#00796b', '#00695c', '#004d40', '#1de9b6',
    '#00bfa5', '#64ffda', '#a7ffeb', '#00e5ff', '#00838f',
    '#006064', '#00695c', '#00796b', '#00897b', '#009688'
  ],
  colorful: [
    '#1976d2', '#388e3c', '#7b1fa2', '#f57c00', '#d32f2f',
    '#00796b', '#5d4037', '#c2185b', '#0097a7', '#3949ab',
    '#558b2f', '#ad1457', '#00838f', '#6d4c41', '#455a65',
    '#e91e63', '#ff5722', '#4caf50', '#2196f3', '#9c27b0'
  ]
}

interface RidgelinePlotProps {
  data: LandscapeVisualizationData | null
  loading?: boolean
  colorScheme?: string
  /** X-axis width multiplier (1-5). Higher = wider, needs horizontal scroll */
  xAxisScale?: number
}

// Fixed height per ridge row (px) — generous spacing like CiteSpace
const RIDGE_HEIGHT = 120

export default function RidgelinePlot({
  data,
  loading = false,
  colorScheme = 'colorful',
  xAxisScale = 1,
}: RidgelinePlotProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  const showTooltip = useCallback((event: MouseEvent, content: string) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    let x = event.clientX - rect.left + container.scrollLeft + 12
    let y = event.clientY - rect.top + container.scrollTop + 12
    if (x - container.scrollLeft + 260 > rect.width) x = x - 260 - 24
    if (y - container.scrollTop + 80 > rect.height) y = y - 80 - 24
    setTooltip({ x: Math.max(8, x), y: Math.max(8, y), content })
  }, [])

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect()
        setDimensions({ width: r.width || 800, height: r.height || 600 })
      }
    }
    update()
    const obs = new ResizeObserver(update)
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || !data || data.points.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width: containerW } = dimensions
    const margin = { top: 45, right: 160, bottom: 20, left: 30 }

    // ---- Determine clusters ----
    const clusters = data.clusters.length > 0
      ? [...data.clusters].sort((a, b) => a.id - b.id)
      : [{ id: 0, label: 'All', size: data.points.length, silhouette: 0, top_terms: [] }]

    const nClusters = clusters.length

    // ---- Group points by cluster -> aggregate z by year ----
    const pointsByCluster = new Map<number, Map<number, number>>()
    const allYearsSet = new Set<number>()

    data.points.forEach(p => {
      const year = Math.round(p.x)
      allYearsSet.add(year)
      if (!pointsByCluster.has(p.cluster)) {
        pointsByCluster.set(p.cluster, new Map())
      }
      const ym = pointsByCluster.get(p.cluster)!
      ym.set(year, (ym.get(year) || 0) + p.z)
    })

    const sortedYears = Array.from(allYearsSet).sort((a, b) => a - b)
    if (sortedYears.length === 0) return
    const yearMin = sortedYears[0]
    const yearMax = sortedYears[sortedYears.length - 1]

    // ---- Dynamic year spacing based on total publication density ----
    const allYearsList: number[] = []
    for (let y = yearMin; y <= yearMax; y++) allYearsList.push(y)

    const totalCountPerYear = new Map<number, number>()
    allYearsList.forEach(y => {
      let total = 0
      pointsByCluster.forEach(ym => { total += ym.get(y) || 0 })
      totalCountPerYear.set(y, total)
    })
    const maxCountInYear = Math.max(1, ...allYearsList.map(y => totalCountPerYear.get(y) || 0))

    const minSlotFrac = 0.15
    const rawWidths = allYearsList.map(y => {
      const count = totalCountPerYear.get(y) || 0
      return Math.max(minSlotFrac, Math.sqrt((count + 0.5) / (maxCountInYear + 0.5)))
    })
    const totalRawW = rawWidths.reduce((s, v) => s + v, 0)

    const baseInnerW = containerW - margin.left - margin.right
    const innerW = Math.max(baseInnerW, baseInnerW * xAxisScale)
    if (innerW <= 0) return

    const scaleFactor = innerW / totalRawW
    const yearCenterX = new Map<number, number>()
    let cumX = 0
    allYearsList.forEach((y, i) => {
      const slotW = rawWidths[i] * scaleFactor
      yearCenterX.set(y, cumX + slotW / 2)
      cumX += slotW
    })

    // Custom xScale using the dynamic mapping
    const xScale = (year: number): number => yearCenterX.get(year) || 0

    // ---- Compute total SVG dimensions ----
    const svgW = margin.left + innerW + margin.right
    const totalH = margin.top + nClusters * RIDGE_HEIGHT + margin.bottom
    svg.attr('width', svgW).attr('height', totalH)

    // occluder fill must match the panel background so lower ridges are hidden behind upper ones
    const bgColor = isDark ? theme.palette.background.default : theme.palette.background.paper

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    type FreqPoint = { year: number; value: number }
    const clusterCurves = new Map<number, FreqPoint[]>()
    let globalMax = 0

    clusters.forEach(cluster => {
      const ym = pointsByCluster.get(cluster.id) || new Map()
      const curve: FreqPoint[] = []
      for (let yr = yearMin; yr <= yearMax; yr++) {
        const val = ym.get(yr) || 0
        curve.push({ year: yr, value: val })
        if (val > globalMax) globalMax = val
      }
      clusterCurves.set(cluster.id, curve)
    })

    if (globalMax === 0) globalMax = 1

    // Peak amplitude: dramatic — up to 80% of a ridge row height
    const peakAmplitude = RIDGE_HEIGHT * 0.8

    const heightScale = d3.scaleLinear()
      .domain([0, globalMax])
      .range([0, peakAmplitude])

    // ---- Color function ----
    // "colorful" uses the rainbow spectrum gradient (CiteSpace Landscape style)
    const useSpectrum = colorScheme === 'colorful' || !COLOR_PALETTES[colorScheme]
    const palette = useSpectrum ? SPECTRUM_COLORS : COLOR_PALETTES[colorScheme]

    const ridgeColor = (index: number) => {
      const t = nClusters > 1 ? index / (nClusters - 1) : 0.5
      const ci = Math.min(palette.length - 1, Math.floor(t * (palette.length - 1)))
      const cf = t * (palette.length - 1) - ci
      const c1 = d3.color(palette[ci])!
      const c2 = d3.color(palette[Math.min(ci + 1, palette.length - 1)])!
      return d3.interpolateRgb(c1.toString(), c2.toString())(cf)
    }

    // ---- X-axis at TOP (CiteSpace style) — custom rendering for dynamic spacing ----
    const yearRange = yearMax - yearMin
    const tickInterval = yearRange <= 5 ? 1 : yearRange <= 15 ? 2 : yearRange <= 30 ? 5 : 10
    const yearTicks = allYearsList.filter(y => y % tickInterval === 0 || y === yearMin || y === yearMax)

    const axisColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'
    const textColor = isDark ? '#bbb' : '#555'

    const xAxisG = g.append('g').attr('transform', `translate(0, -8)`)
    // Axis line
    xAxisG.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', 0).attr('y2', 0)
      .attr('stroke', axisColor)

    yearTicks.forEach(y => {
      const cx = xScale(y)
      xAxisG.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', 0).attr('y2', -6)
        .attr('stroke', axisColor)
      xAxisG.append('text')
        .attr('x', cx).attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('fill', textColor)
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .text(String(y))
    })

    // Faint vertical grid
    const innerH = nClusters * RIDGE_HEIGHT
    g.append('g').attr('class', 'grid')
      .selectAll('line')
      .data(yearTicks)
      .join('line')
      .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')

    // ---- Build ridge data ----
    // Each ridge baseline is at (index + 1) * RIDGE_HEIGHT — peaks go upward
    const ridgeData = clusters.map((cluster, i) => ({
      cluster,
      index: i,
      curve: clusterCurves.get(cluster.id) || [],
      baselineY: (i + 1) * RIDGE_HEIGHT,
      color: ridgeColor(i),
    }))

    // Draw back-to-front (bottom first so top overlaps)
    const ridgeGroup = g.append('g').attr('class', 'ridges')
    const reversed = [...ridgeData].reverse()

    // Cardinal spline area generator
    const areaGen = d3.area<FreqPoint>()
      .curve(d3.curveCardinal.tension(0.3))

    // SVG defs for gradients
    const defs = svg.append('defs')

    reversed.forEach(rd => {
      const baseline = rd.baselineY
      const darkerColor = d3.color(rd.color)?.darker(0.8)?.toString() || rd.color

      areaGen
        .x(d => xScale(d.year))
        .y0(() => baseline)
        .y1(d => baseline - heightScale(d.value))

      // Gradient: transparent at base -> opaque at peak
      const gradientId = `ridge-grad-${rd.cluster.id}`
      const grad = defs.append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%').attr('y1', '100%')
        .attr('x2', '0%').attr('y2', '0%')
      grad.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', rd.color)
        .attr('stop-opacity', 0.1)
      grad.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', rd.color)
        .attr('stop-opacity', 0.9)

      // Occluder: hides lower ridges behind this mountain
      ridgeGroup.append('path')
        .datum(rd.curve)
        .attr('d', areaGen)
        .attr('fill', bgColor)
        .attr('stroke', 'none')

      // Colored mountain fill
      ridgeGroup.append('path')
        .datum(rd.curve)
        .attr('class', `ridge ridge-${rd.cluster.id}`)
        .attr('d', areaGen)
        .attr('fill', `url(#${gradientId})`)
        .attr('stroke', darkerColor)
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mouseenter', (event) => {
          ridgeGroup.selectAll('.ridge').attr('opacity', 0.2)
          ridgeGroup.selectAll(`.ridge-${rd.cluster.id}`).attr('opacity', 1.0)
          const terms = rd.cluster.top_terms?.length > 0
            ? rd.cluster.top_terms.slice(0, 8).join(', ')
            : '-'
          showTooltip(event as unknown as MouseEvent,
            `#${rd.cluster.id}: ${rd.cluster.label}\nSize: ${rd.cluster.size}\nKeywords: ${terms}`)
        })
        .on('mousemove', (event) => {
          const terms = rd.cluster.top_terms?.length > 0
            ? rd.cluster.top_terms.slice(0, 8).join(', ')
            : '-'
          showTooltip(event as unknown as MouseEvent,
            `#${rd.cluster.id}: ${rd.cluster.label}\nSize: ${rd.cluster.size}\nKeywords: ${terms}`)
        })
        .on('mouseleave', () => {
          ridgeGroup.selectAll('.ridge').attr('opacity', 1.0)
          setTooltip(null)
        })
    })

    // ---- Right-side labels (matching ridge color) ----
    const labelG = g.append('g').attr('class', 'labels')
    ridgeData.forEach(rd => {
      // Label positioned near the middle of each ridge band
      const labelY = rd.baselineY - RIDGE_HEIGHT * 0.4

      labelG.append('text')
        .attr('x', innerW + 14)
        .attr('y', labelY)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .attr('fill', rd.color)
        .text(`#${rd.cluster.id}: ${rd.cluster.label}`.slice(0, 26))
    })

  }, [data, dimensions, showTooltip, isDark, theme, colorScheme, xAxisScale])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!data || data.points.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <Typography color="text.secondary">{t('biblio.noData')}</Typography>
      </Box>
    )
  }

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'auto' }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: 'block', minHeight: '100%' }} />
      {tooltip && (
        <Box
          sx={{
            position: 'absolute', left: tooltip.x, top: tooltip.y,
            bgcolor: 'rgba(0,0,0,0.88)', color: '#eee',
            border: '1px solid rgba(255,255,255,0.15)',
            px: 1.5, py: 1, borderRadius: 1, fontSize: 11,
            whiteSpace: 'pre-line', pointerEvents: 'none', zIndex: 100,
            maxWidth: 260, boxShadow: '0 2px 12px rgba(0,0,0,0.6)'
          }}
        >
          {tooltip.content}
        </Box>
      )}
    </Box>
  )
}

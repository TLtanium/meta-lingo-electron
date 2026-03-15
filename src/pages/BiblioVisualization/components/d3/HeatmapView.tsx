/**
 * Heatmap Density View for Bibliographic Visualization
 *
 * Scientific-grade density visualization with:
 * - Turbo discrete color scale via d3.scaleQuantize
 * - Fine contour lines overlaid on the heatmap
 * - Crosshair markers at highest density peaks
 * - Subtle background grid
 * - Clear scatter overlay with cluster colors
 * - Time-slice playback
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress, useTheme, Slider, IconButton, Stack } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import { useTranslation } from 'react-i18next'
import type { HeatmapVisualizationData, HeatmapPoint } from '../../../../types/biblio'

// Turbo colormap (scientific, perceptually uniform, discrete steps)
const TURBO_COLORS = [
  '#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bd0d5',
  '#24f49c', '#73fe5a', '#b5f427', '#e8d023', '#fcae12',
  '#f58111', '#e05206', '#b52c05', '#7a1303', '#3c0000'
]

const COLOR_PALETTES: Record<string, string[]> = {
  turbo: TURBO_COLORS,
  blue: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
  green: ['#f7fcf5', '#c7e9c0', '#74c476', '#238b45', '#00441b'],
  purple: ['#fcfbfd', '#dadaeb', '#9e9ac8', '#6a51a3', '#3f007d'],
  orange: ['#fff5eb', '#fdd0a2', '#fd8d3c', '#d94801', '#7f2704'],
  red: ['#fff5f0', '#fcbba1', '#fb6a4a', '#cb181d', '#67000d'],
  teal: ['#f0fffe', '#99e8e4', '#2ca8a2', '#006d6b', '#003433']
}

const CLUSTER_COLORS = [
  '#1976d2', '#388e3c', '#7b1fa2', '#f57c00', '#d32f2f',
  '#00796b', '#5d4037', '#455a64', '#c2185b', '#0097a7'
]

interface HeatmapViewProps {
  data: HeatmapVisualizationData | null
  loading?: boolean
  colorScheme?: string
}

export default function HeatmapView({
  data,
  loading = false,
  colorScheme = 'turbo'
}: HeatmapViewProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  const [yearFilter, setYearFilter] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const showTooltip = useCallback((event: MouseEvent, content: string) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    let x = event.clientX - rect.left + 12
    let y = event.clientY - rect.top + 12
    if (x + 200 > rect.width) x = event.clientX - rect.left - 200
    if (y + 80 > rect.height) y = event.clientY - rect.top - 80
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

  const filteredPoints = useMemo(() => {
    if (!data) return []
    if (yearFilter === null) return data.points
    return data.points.filter(p => p.year !== undefined && p.year <= yearFilter)
  }, [data, yearFilter])

  const yearRange = useMemo(() => {
    if (!data) return { start: 2000, end: 2024 }
    return data.time_range
  }, [data])

  // Playback control
  useEffect(() => {
    if (playing && yearRange.start < yearRange.end) {
      let current = yearFilter ?? yearRange.start
      playRef.current = setInterval(() => {
        current += 1
        if (current > yearRange.end) {
          current = yearRange.start
        }
        setYearFilter(current)
      }, 800)
    } else {
      if (playRef.current) clearInterval(playRef.current)
    }
    return () => { if (playRef.current) clearInterval(playRef.current) }
  }, [playing, yearRange, yearFilter])

  // Draw heatmap
  useEffect(() => {
    if (!svgRef.current || !data || filteredPoints.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width: w, height: h } = dimensions
    const margin = { top: 20, right: 60, bottom: 20, left: 20 }
    const innerW = w - margin.left - margin.right
    const innerH = h - margin.top - margin.bottom - 60

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Use all points for stable coordinate system
    const allPoints = data.points
    const xs = allPoints.map(p => p.x)
    const ys = allPoints.map(p => p.y)
    const pad = 2
    const xExtent = [d3.min(xs)! - pad, d3.max(xs)! + pad] as [number, number]
    const yExtent = [d3.min(ys)! - pad, d3.max(ys)! + pad] as [number, number]

    const xScale = d3.scaleLinear().domain(xExtent).range([0, innerW])
    const yScale = d3.scaleLinear().domain(yExtent).range([innerH, 0])

    // ---- Background grid ----
    const gridG = g.append('g').attr('class', 'grid')
    const xTicks = d3.range(xExtent[0], xExtent[1], (xExtent[1] - xExtent[0]) / 20)
    const yTicks = d3.range(yExtent[0], yExtent[1], (yExtent[1] - yExtent[0]) / 20)

    gridG.selectAll('line.x-grid')
      .data(xTicks)
      .join('line')
      .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)')
      .attr('stroke-width', 0.5)

    gridG.selectAll('line.y-grid')
      .data(yTicks)
      .join('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)')
      .attr('stroke-width', 0.5)

    // ---- Compute contours with lower bandwidth for sharper peaks ----
    const bandwidth = Math.max(8, Math.min(20, innerW / 40))
    const nThresholds = 20

    const contourData = d3.contourDensity<HeatmapPoint>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .weight(d => d.weight)
      .size([innerW, innerH])
      .bandwidth(bandwidth)
      .thresholds(nThresholds)(filteredPoints)

    const maxDensity = d3.max(contourData, d => d.value) || 1

    // ---- Discrete quantize color scale ----
    const palette = COLOR_PALETTES[colorScheme] || TURBO_COLORS
    const colorScale = d3.scaleQuantize<string>()
      .domain([0, maxDensity])
      .range(palette)

    // ---- Draw contour fills ----
    g.append('g').attr('class', 'contour-fills')
      .selectAll('path')
      .data(contourData)
      .join('path')
      .attr('d', d3.geoPath())
      .attr('fill', d => colorScale(d.value))
      .attr('stroke', 'none')
      .attr('opacity', 0.75)

    // ---- Draw contour lines (fine, discrete) ----
    g.append('g').attr('class', 'contour-lines')
      .selectAll('path')
      .data(contourData)
      .join('path')
      .attr('d', d3.geoPath())
      .attr('fill', 'none')
      .attr('stroke', isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)')
      .attr('stroke-width', 0.6)

    // ---- Crosshair markers at density peaks ----
    if (contourData.length > 0) {
      // Find the top density peaks by computing centroids of highest contours
      const highContours = contourData.filter(c => c.value > maxDensity * 0.7)
      const crosshairG = g.append('g').attr('class', 'crosshairs')

      highContours.forEach(contour => {
        contour.coordinates.forEach(polygon => {
          polygon.forEach(ring => {
            // Compute centroid of the ring
            let cx = 0, cy = 0
            const n = ring.length
            if (n === 0) return
            ring.forEach(pt => { cx += pt[0]; cy += pt[1] })
            cx /= n
            cy /= n

            const crossSize = 6
            const crossColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'

            // Horizontal line
            crosshairG.append('line')
              .attr('x1', cx - crossSize).attr('x2', cx + crossSize)
              .attr('y1', cy).attr('y2', cy)
              .attr('stroke', crossColor).attr('stroke-width', 1.2)

            // Vertical line
            crosshairG.append('line')
              .attr('x1', cx).attr('x2', cx)
              .attr('y1', cy - crossSize).attr('y2', cy + crossSize)
              .attr('stroke', crossColor).attr('stroke-width', 1.2)
          })
        })
      })
    }

    // ---- Scatter overlay (nodes) ----
    const clusterColorScale = d3.scaleOrdinal<number, string>()
      .domain([...new Set(filteredPoints.map(p => p.cluster))])
      .range(CLUSTER_COLORS)

    g.append('g').attr('class', 'points')
      .selectAll('circle')
      .data(filteredPoints)
      .join('circle')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', d => Math.max(2.5, Math.min(8, d.weight * 0.5)))
      .attr('fill', d => clusterColorScale(d.cluster))
      .attr('stroke', isDark ? '#111' : '#fff')
      .attr('stroke-width', 1)
      .attr('opacity', 0.9)
      .on('mouseenter', (event, d) => {
        showTooltip(event as unknown as MouseEvent,
          `${d.label}\nCluster: ${d.cluster}${d.year ? `\n${t('biblio.yearColumn')}: ${d.year}` : ''}\nWeight: ${d.weight.toFixed(2)}`)
      })
      .on('mousemove', (event, d) => {
        showTooltip(event as unknown as MouseEvent,
          `${d.label}\nCluster: ${d.cluster}${d.year ? `\n${t('biblio.yearColumn')}: ${d.year}` : ''}\nWeight: ${d.weight.toFixed(2)}`)
      })
      .on('mouseleave', () => setTooltip(null))

    // ---- Color bar legend ----
    const legendW = 16
    const legendH = innerH * 0.6
    const legendX = innerW + 15
    const legendY = (innerH - legendH) / 2

    const legendScale = d3.scaleLinear().domain([0, maxDensity]).range([legendH, 0])
    const nSteps = palette.length
    const stepH = legendH / nSteps

    const legendG = g.append('g').attr('transform', `translate(${legendX},${legendY})`)

    for (let i = 0; i < nSteps; i++) {
      legendG.append('rect')
        .attr('x', 0).attr('y', stepH * i)
        .attr('width', legendW).attr('height', stepH + 0.5)
        .attr('fill', palette[nSteps - 1 - i])
    }

    legendG.append('rect')
      .attr('x', 0).attr('y', 0)
      .attr('width', legendW).attr('height', legendH)
      .attr('fill', 'none')
      .attr('stroke', isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)')

    // Legend ticks
    const legendAxis = d3.axisRight(legendScale).ticks(5).tickSize(3)
    legendG.append('g')
      .attr('transform', `translate(${legendW},0)`)
      .call(legendAxis)
      .selectAll('text')
      .attr('font-size', 9)
      .attr('fill', isDark ? '#aaa' : '#555')
    legendG.selectAll('.domain').attr('stroke', isDark ? '#555' : '#ccc')
    legendG.selectAll('.tick line').attr('stroke', isDark ? '#555' : '#ccc')

    legendG.append('text')
      .attr('x', legendW / 2).attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', isDark ? '#aaa' : '#666')
      .text(t('biblio.heatmapDensity'))

    // ---- Year watermark ----
    if (yearFilter !== null) {
      g.append('text')
        .attr('x', innerW - 10).attr('y', 30)
        .attr('text-anchor', 'end')
        .attr('font-size', 36)
        .attr('font-weight', 'bold')
        .attr('fill', isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)')
        .text(yearFilter)
    }

  }, [data, filteredPoints, dimensions, isDark, t, showTooltip, yearFilter, colorScheme])

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

  const hasYears = yearRange.start > 0 && yearRange.end > yearRange.start

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <svg ref={svgRef} width={dimensions.width} height={dimensions.height - (hasYears ? 60 : 0)} style={{ display: 'block' }} />
      </Box>

      {hasYears && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 0.5 }}>
          <IconButton size="small" onClick={() => setPlaying(p => !p)}>
            {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 40 }}>
            {yearFilter ?? t('biblio.all')}
          </Typography>
          <Slider
            size="small"
            min={yearRange.start}
            max={yearRange.end}
            value={yearFilter ?? yearRange.end}
            onChange={(_, v) => { setPlaying(false); setYearFilter(v as number) }}
            valueLabelDisplay="auto"
            sx={{ flex: 1 }}
          />
          <Typography
            variant="caption"
            sx={{ cursor: 'pointer', color: 'primary.main', minWidth: 30 }}
            onClick={() => { setPlaying(false); setYearFilter(null) }}
          >
            {t('biblio.all')}
          </Typography>
        </Stack>
      )}

      {tooltip && (
        <Box
          sx={{
            position: 'absolute', left: tooltip.x, top: tooltip.y,
            bgcolor: 'rgba(0,0,0,0.88)', color: 'white',
            px: 1.5, py: 1, borderRadius: 1, fontSize: 11,
            whiteSpace: 'pre-line', pointerEvents: 'none', zIndex: 100,
            maxWidth: 220, boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {tooltip.content}
        </Box>
      )}
    </Box>
  )
}

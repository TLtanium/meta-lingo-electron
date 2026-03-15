/**
 * Timeline Swim-Lane View for Bibliographic Visualization
 *
 * CiteSpace-style horizontal timeline:
 *  - Y-axis = cluster index (swim lanes)
 *  - X-axis = years (left to right), dynamically spaced by publication density
 *  - Each row has a highlighted timeline connecting first-to-last circle
 *  - Circles arranged horizontally within each year slot with partial overlap (big underneath)
 *  - Color: each year column gets a shade from the selected palette
 *  - "colorful" mode: each row uses a different hue family
 *  - Citation arcs connect related nodes across rows
 *  - Node size = influence (weight), burst nodes highlighted
 *  - User-adjustable x-axis width multiplier for horizontal scrolling
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { TimelineVisualizationData, TimelineNode } from '../../../../types/biblio'

/* ---------- color palettes for year-based shading ---------- */

const YEAR_PALETTES: Record<string, string[]> = {
  blue: [
    '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5',
    '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1',
    '#0a3d91', '#083281', '#062871', '#041e61', '#021451',
  ],
  green: [
    '#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a',
    '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20',
    '#155214', '#104610', '#0b3a0c', '#062e08', '#022204',
  ],
  purple: [
    '#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc',
    '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c',
    '#3e1080', '#320c74', '#260868', '#1a045c', '#0e0050',
  ],
  orange: [
    '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726',
    '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100',
    '#d84315', '#bf360c', '#a62c00', '#8d2200', '#741800',
  ],
  red: [
    '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350',
    '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c',
    '#a01616', '#891010', '#720a0a', '#5b0404', '#440000',
  ],
  teal: [
    '#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a',
    '#009688', '#00897b', '#00796b', '#00695c', '#004d40',
    '#004236', '#00372c', '#002c22', '#002118', '#00160e',
  ],
  colorful: [
    '#1976d2', '#388e3c', '#7b1fa2', '#f57c00', '#d32f2f',
    '#00796b', '#5d4037', '#c2185b', '#0097a7', '#3949ab',
    '#558b2f', '#ad1457', '#00838f', '#6d4c41', '#455a65',
  ],
}

// Per-row hue families for "colorful" mode
const ROW_HUE_FAMILIES = [
  ['#e3f2fd', '#90caf9', '#42a5f5', '#1976d2', '#0d47a1', '#0a3d91', '#083281', '#062871', '#041e61', '#021451'],
  ['#e8f5e9', '#a5d6a7', '#66bb6a', '#388e3c', '#1b5e20', '#155214', '#104610', '#0b3a0c', '#062e08', '#022204'],
  ['#f3e5f5', '#ce93d8', '#ab47bc', '#7b1fa2', '#4a148c', '#3e1080', '#320c74', '#260868', '#1a045c', '#0e0050'],
  ['#fff3e0', '#ffcc80', '#ffa726', '#f57c00', '#e65100', '#d84315', '#bf360c', '#a62c00', '#8d2200', '#741800'],
  ['#ffebee', '#ef9a9a', '#ef5350', '#d32f2f', '#b71c1c', '#a01616', '#891010', '#720a0a', '#5b0404', '#440000'],
  ['#e0f2f1', '#80cbc4', '#26a69a', '#00796b', '#004d40', '#004236', '#00372c', '#002c22', '#002118', '#00160e'],
  ['#efebe9', '#bcaaa4', '#8d6e63', '#5d4037', '#3e2723', '#362018', '#2e1a10', '#261408', '#1e0e00', '#160800'],
  ['#fce4ec', '#f48fb1', '#ec407a', '#c2185b', '#880e4f', '#740a44', '#600639', '#4c022e', '#380023', '#240018'],
  ['#e0f7fa', '#80deea', '#26c6da', '#0097a7', '#006064', '#005258', '#00444c', '#003640', '#002834', '#001a28'],
  ['#e8eaf6', '#9fa8da', '#5c6bc0', '#3949ab', '#1a237e', '#161e6e', '#12195e', '#0e144e', '#0a0f3e', '#060a2e'],
]

interface TimelineViewProps {
  data: TimelineVisualizationData | null
  loading?: boolean
  colorScheme?: string
  /** X-axis width multiplier (1-5). Higher = wider, needs horizontal scroll */
  xAxisScale?: number
  /** Weight decimal precision for size differentiation (0-6) */
  weightPrecision?: number
}

export default function TimelineView({
  data,
  loading = false,
  colorScheme = 'blue',
  xAxisScale = 1,
  weightPrecision = 4,
}: TimelineViewProps) {
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
    if (!svgRef.current || !data || data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width: containerW } = dimensions
    const margin = { top: 30, right: 180, bottom: 45, left: 180 }

    const clusters = data.clusters.length > 0
      ? data.clusters
      : [{ id: 0, label: 'All', size: data.nodes.length, year_start: data.time_range.start, year_end: data.time_range.end }]

    const clusterIds = clusters.map(c => c.id)
    const nClusters = clusterIds.length

    // Fixed lane height (scrollable vertically)
    const laneHeight = 80
    const laneGap = 24
    const totalLaneH = nClusters * laneHeight + Math.max(0, nClusters - 1) * laneGap

    const yearStart = data.time_range.start
    const yearEnd = data.time_range.end

    // ---- Dynamic year spacing based on publication density ----
    const yearCounts = new Map<number, number>()
    data.nodes.forEach(n => yearCounts.set(n.year, (yearCounts.get(n.year) || 0) + 1))

    const allYears: number[] = []
    for (let y = yearStart; y <= yearEnd; y++) allYears.push(y)

    const maxCountInYear = Math.max(1, ...allYears.map(y => yearCounts.get(y) || 0))

    // Each year gets a width proportional to sqrt(count+1), with a minimum for empty years
    const minSlotFrac = 0.15 // empty years get 15% of max slot width
    const rawWidths = allYears.map(y => {
      const count = yearCounts.get(y) || 0
      return Math.max(minSlotFrac, Math.sqrt((count + 0.5) / (maxCountInYear + 0.5)))
    })
    const totalRawW = rawWidths.reduce((s, v) => s + v, 0)

    // Scale to desired total width
    const baseInnerW = containerW - margin.left - margin.right
    const innerW = Math.max(baseInnerW, baseInnerW * xAxisScale)
    const scaleFactor = innerW / totalRawW

    // Compute cumulative x positions (center of each year slot)
    const yearSlotWidths = rawWidths.map(w => w * scaleFactor)
    const yearCenterX = new Map<number, number>()
    const yearSlotWMap = new Map<number, number>()
    let cumX = 0
    allYears.forEach((y, i) => {
      const slotW = yearSlotWidths[i]
      yearCenterX.set(y, cumX + slotW / 2)
      yearSlotWMap.set(y, slotW)
      cumX += slotW
    })

    // Total SVG width
    const svgW = margin.left + innerW + margin.right
    const totalH = margin.top + totalLaneH + margin.bottom + 30
    svg.attr('width', svgW).attr('height', totalH)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Band positions per cluster
    const bandPositions = new Map<number, { y: number; h: number }>()
    clusterIds.forEach((cid, i) => {
      bandPositions.set(cid, {
        y: i * (laneHeight + laneGap),
        h: laneHeight
      })
    })

    // Weight: apply precision rounding for size differentiation control
    const precisionFactor = Math.pow(10, weightPrecision)
    const roundedWeight = (w: number) => Math.round(w * precisionFactor) / precisionFactor
    const maxWeight = d3.max(data.nodes, d => roundedWeight(d.weight)) || 1
    const sizeScale = d3.scalePow().exponent(0.7)
      .domain([0, maxWeight])
      .range([2.5, 28])

    // ---- Color function based on colorScheme ----
    const isColorful = colorScheme === 'colorful'
    const palette = YEAR_PALETTES[colorScheme] || YEAR_PALETTES.blue
    const nYears = yearEnd - yearStart

    const getNodeColor = (node: TimelineNode, _clusterIndex: number): string => {
      const yearFrac = nYears > 0 ? (node.year - yearStart) / nYears : 0.5
      if (isColorful) {
        const rowPalette = ROW_HUE_FAMILIES[_clusterIndex % ROW_HUE_FAMILIES.length]
        const ci = Math.min(rowPalette.length - 1, Math.floor(yearFrac * (rowPalette.length - 1)))
        return rowPalette[ci]
      }
      const ci = Math.min(palette.length - 1, Math.floor(yearFrac * (palette.length - 1)))
      return palette[ci]
    }

    const getRowColor = (clusterIndex: number): string => {
      if (isColorful) {
        const rowPalette = ROW_HUE_FAMILIES[clusterIndex % ROW_HUE_FAMILIES.length]
        return rowPalette[Math.floor(rowPalette.length * 0.4)]
      }
      return palette[Math.floor(palette.length * 0.4)]
    }

    // ---- Swim lane backgrounds ----
    clusters.forEach((cluster, i) => {
      const band = bandPositions.get(cluster.id)!

      g.append('rect')
        .attr('x', -8).attr('y', band.y)
        .attr('width', innerW + 16).attr('height', band.h)
        .attr('fill', i % 2 === 0
          ? (isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.012)')
          : 'transparent')
        .attr('rx', 4)

      const rowColor = getRowColor(i)
      g.append('rect')
        .attr('x', -10).attr('y', band.y + 4)
        .attr('width', 5).attr('height', band.h - 8)
        .attr('fill', rowColor)
        .attr('rx', 2.5)
        .attr('opacity', 0.8)

      g.append('text')
        .attr('x', -18)
        .attr('y', band.y + band.h / 2 - 8)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', rowColor)
        .text(`#${cluster.id}`)

      g.append('text')
        .attr('x', -18)
        .attr('y', band.y + band.h / 2 + 8)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 10)
        .attr('fill', isDark ? '#999' : '#666')
        .text(cluster.label.slice(0, 18))
    })

    // ---- Year grid lines & x-axis (using dynamic positions) ----
    const yearRange = yearEnd - yearStart
    const tickInterval = yearRange <= 10 ? 1 : yearRange <= 30 ? 2 : 5

    const tickYears = allYears.filter(y => y % tickInterval === 0 || y === yearStart || y === yearEnd)

    g.append('g').attr('class', 'grid')
      .selectAll('line')
      .data(tickYears)
      .join('line')
      .attr('x1', d => yearCenterX.get(d) || 0)
      .attr('x2', d => yearCenterX.get(d) || 0)
      .attr('y1', 0).attr('y2', totalLaneH)
      .attr('stroke', isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)')

    // Custom x-axis with dynamic positions
    const xAxisG = g.append('g')
      .attr('transform', `translate(0,${totalLaneH + 8})`)

    // Axis line
    xAxisG.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', 0).attr('y2', 0)
      .attr('stroke', isDark ? '#555' : '#ccc')

    tickYears.forEach(y => {
      const cx = yearCenterX.get(y) || 0
      xAxisG.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', 0).attr('y2', 6)
        .attr('stroke', isDark ? '#555' : '#ccc')
      xAxisG.append('text')
        .attr('x', cx).attr('y', 18)
        .attr('text-anchor', 'middle')
        .attr('fill', isDark ? '#ccc' : '#333')
        .attr('font-size', 10)
        .text(String(y))
    })

    // ---- Group nodes by cluster ----
    const nodesByCluster = new Map<number, TimelineNode[]>()
    data.nodes.forEach(n => {
      const arr = nodesByCluster.get(n.cluster) || []
      arr.push(n)
      nodesByCluster.set(n.cluster, arr)
    })

    // ---- Position nodes: horizontal layout within year slots ----
    interface NodePos { cx: number; cy: number; r: number; node: TimelineNode; color: string }
    const nodePositions = new Map<string, NodePos>()

    nodesByCluster.forEach((nodes, clusterId) => {
      const band = bandPositions.get(clusterId)
      if (!band) return
      const clusterIndex = clusterIds.indexOf(clusterId)
      const centerY = band.y + band.h / 2

      const byYear = new Map<number, TimelineNode[]>()
      nodes.forEach(n => {
        const arr = byYear.get(n.year) || []
        arr.push(n)
        byYear.set(n.year, arr)
      })

      byYear.forEach((yearNodes, year) => {
        yearNodes.sort((a, b) => roundedWeight(b.weight) - roundedWeight(a.weight))

        const yCenterX = yearCenterX.get(year) || 0
        const slotW = yearSlotWMap.get(year) || 40
        const maxNodeR = sizeScale(roundedWeight(yearNodes[0].weight))
        const overlapFactor = 0.6

        yearNodes.forEach((n, i) => {
          const rw = roundedWeight(n.weight)
          const r = sizeScale(rw)
          let cx: number
          if (yearNodes.length === 1) {
            cx = yCenterX
          } else {
            const spreadW = Math.min(slotW * 0.8, yearNodes.length * maxNodeR * overlapFactor * 2)
            const startX = yCenterX - spreadW / 2
            const step = yearNodes.length > 1 ? spreadW / (yearNodes.length - 1) : 0
            cx = startX + i * step
          }
          const color = getNodeColor(n, clusterIndex)
          nodePositions.set(n.id, { cx, cy: centerY, r, node: n, color })
        })
      })
    })

    // ---- Per-row timeline (highlighted from first to last circle) ----
    const timelineG = g.append('g').attr('class', 'timelines')

    nodesByCluster.forEach((nodes, clusterId) => {
      const band = bandPositions.get(clusterId)
      if (!band) return
      const centerY = band.y + band.h / 2

      let minYear = Infinity, maxYear = -Infinity
      nodes.forEach(n => {
        if (n.year < minYear) minYear = n.year
        if (n.year > maxYear) maxYear = n.year
      })
      if (minYear > maxYear) return

      const clusterIndex = clusterIds.indexOf(clusterId)
      const rowColor = getRowColor(clusterIndex)

      // Full-width faint line
      timelineG.append('line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', centerY).attr('y2', centerY)
        .attr('stroke', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
        .attr('stroke-width', 1.5)

      // Highlighted segment
      const x1 = yearCenterX.get(minYear) || 0
      const x2 = yearCenterX.get(maxYear) || 0
      timelineG.append('line')
        .attr('x1', x1).attr('x2', x2)
        .attr('y1', centerY).attr('y2', centerY)
        .attr('stroke', rowColor)
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.5)
    })

    // ---- Citation arcs ----
    const edgeG = g.append('g').attr('class', 'edges')
    const maxEdges = Math.min(data.edges.length, 500)
    const sortedEdges = [...data.edges].sort((a, b) => b.weight - a.weight).slice(0, maxEdges)

    edgeG.selectAll('path')
      .data(sortedEdges)
      .join('path')
      .attr('d', d => {
        const s = nodePositions.get(d.source)
        const tgt = nodePositions.get(d.target)
        if (!s || !tgt) return ''
        const dx = tgt.cx - s.cx
        const dy = tgt.cy - s.cy
        const arcH = Math.abs(dy) * 0.3 + Math.abs(dx) * 0.15 + 25
        const midX = (s.cx + tgt.cx) / 2
        const midY = Math.min(s.cy, tgt.cy) - arcH
        return `M${s.cx},${s.cy} Q${midX},${midY} ${tgt.cx},${tgt.cy}`
      })
      .attr('fill', 'none')
      .attr('stroke', d => {
        const s = nodePositions.get(d.source)
        return s ? d3.color(s.color)?.copy({ opacity: 0.25 })?.toString()
            || (isDark ? 'rgba(200,150,50,0.2)' : 'rgba(180,120,40,0.18)')
          : (isDark ? 'rgba(200,150,50,0.2)' : 'rgba(180,120,40,0.18)')
      })
      .attr('stroke-width', d => Math.max(0.8, Math.min(3, d.weight * 0.5)))

    // ---- Draw nodes (big first = underneath) ----
    const allNodes = Array.from(nodePositions.values())
    allNodes.sort((a, b) => b.r - a.r)

    const nodeGroup = g.append('g').attr('class', 'nodes')

    const nodeEls = nodeGroup.selectAll('g')
      .data(allNodes)
      .join('g')
      .attr('transform', d => `translate(${d.cx},${d.cy})`)

    nodeEls.append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => d.color)
      .attr('stroke', d => {
        if (d.node.is_burst) return '#ff5722'
        return d3.color(d.color)?.darker(0.5)?.toString() || (isDark ? '#555' : '#ccc')
      })
      .attr('stroke-width', d => d.node.is_burst ? 2.5 : 1)
      .attr('opacity', 0.9)
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        const rw = roundedWeight(d.node.weight)
        const content = `${d.node.label}\n${t('biblio.yearColumn')}: ${d.node.year}\nCluster #${d.node.cluster}\n${t('biblio.weight')}: ${rw}${d.node.is_burst ? `\n${t('biblio.burstNode')}` : ''}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mousemove', (event, d) => {
        const rw = roundedWeight(d.node.weight)
        const content = `${d.node.label}\n${t('biblio.yearColumn')}: ${d.node.year}\nCluster #${d.node.cluster}\n${t('biblio.weight')}: ${rw}${d.node.is_burst ? `\n${t('biblio.burstNode')}` : ''}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mouseleave', () => setTooltip(null))

    // Burst pulse animation
    nodeEls.filter(d => d.node.is_burst)
      .append('circle')
      .attr('r', d => d.r + 3)
      .attr('fill', 'none')
      .attr('stroke', '#ff5722')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0)
      .each(function () {
        const el = d3.select(this)
        const pulse = () => {
          el.attr('opacity', 0.8)
            .attr('r', function (d: any) { return d.r + 3 })
            .transition().duration(1200)
            .attr('opacity', 0)
            .attr('r', function (d: any) { return d.r + 18 })
            .on('end', pulse)
        }
        pulse()
      })

    // ---- Right-side cluster labels ----
    const rightLabelG = g.append('g').attr('class', 'right-labels')
    clusters.forEach((cluster, i) => {
      const band = bandPositions.get(cluster.id)!
      const rowColor = getRowColor(i)

      rightLabelG.append('text')
        .attr('x', innerW + 14)
        .attr('y', band.y + band.h / 2)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .attr('fill', rowColor)
        .text(`#${cluster.id} ${cluster.label}`.slice(0, 28))
    })

    // ---- Smart labels for top nodes ----
    const labelCandidates = [...allNodes].sort((a, b) => b.node.weight - a.node.weight)
    const weightThreshold = maxWeight * 0.15
    const topCandidates = labelCandidates.filter(d => roundedWeight(d.node.weight) >= weightThreshold)
    const maxLabels = Math.min(topCandidates.length, 35)

    const placedBoxes: { x: number; y: number; w: number; h: number }[] = []
    const labelG = g.append('g').attr('class', 'labels')

    for (let i = 0; i < maxLabels; i++) {
      const d = topCandidates[i]
      const labelText = d.node.label.length > 18 ? d.node.label.slice(0, 18) + '..' : d.node.label
      const approxW = labelText.length * 5.5
      const approxH = 12

      const positions = [
        { x: d.cx + d.r + 4, y: d.cy + 3 },
        { x: d.cx - d.r - approxW - 4, y: d.cy + 3 },
        { x: d.cx - approxW / 2, y: d.cy - d.r - 5 },
        { x: d.cx - approxW / 2, y: d.cy + d.r + approxH + 3 }
      ]

      for (const pos of positions) {
        const box = { x: pos.x, y: pos.y - approxH, w: approxW, h: approxH }
        const overlaps = placedBoxes.some(pb =>
          box.x < pb.x + pb.w && box.x + box.w > pb.x &&
          box.y < pb.y + pb.h && box.y + box.h > pb.y
        )
        if (!overlaps) {
          placedBoxes.push(box)
          labelG.append('text')
            .attr('x', pos.x)
            .attr('y', pos.y)
            .attr('font-size', 9)
            .attr('fill', isDark ? '#bbb' : '#444')
            .attr('font-weight', d.node.is_burst ? 'bold' : 'normal')
            .text(labelText)
          break
        }
      }
    }

  }, [data, dimensions, isDark, t, showTooltip, colorScheme, xAxisScale, weightPrecision])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!data || data.nodes.length === 0) {
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
            bgcolor: 'rgba(0,0,0,0.88)', color: 'white',
            px: 1.5, py: 1, borderRadius: 1, fontSize: 11,
            whiteSpace: 'pre-line', pointerEvents: 'none', zIndex: 100,
            maxWidth: 260, boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {tooltip.content}
        </Box>
      )}
    </Box>
  )
}

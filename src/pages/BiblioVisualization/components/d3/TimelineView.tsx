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
import { addTagBackgrounds } from './shared/labelTags'
import {
  metricValue, clusterRepresentatives, isReferenceNode, type LabelMetric,
} from './shared/labelMetrics'

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
  /** X-axis width multiplier (1-5). Higher = wider initial spread (canvas pan/zoom). */
  xAxisScale?: number
  /** Weight decimal precision for size differentiation (0-6) */
  weightPrecision?: number
  // ── By Citation controls (circle ring layer) ──────────────────────────────
  /** Min weight for a circle node to show its inline text label (By Citation Threshold). */
  citationThreshold?: number
  /** Circle ring radius multiplier (CiteSpace "By Citation / Node Size"). */
  nodeScale?: number
  /** Font-size multiplier for circle inline labels (By Citation Font Size). */
  citationFontScale?: number
  // ── By Degree controls (diamond keyword-label layer, keyword mode only) ───
  /** Show diamond ◇ indicators on floating keyword labels (true when clusterBy='keyword'). */
  showDiamondLabels?: boolean
  /** Min frequency for a diamond label to appear (By Degree Threshold). */
  labelThreshold?: number
  /** Diamond indicator half-size multiplier (By Degree Node Size). */
  diamondNodeScale?: number
  /** Font-size multiplier for diamond floating labels (By Degree Font Size). */
  fontScaleMul?: number
  // ─────────────────────────────────────────────────────────────────────────
  /** Node ids toggled off via the data table — hidden from the canvas. */
  hiddenNodeIds?: Set<string>
  /** Swim-lane height in px (CiteSpace "Row Span", default 64). */
  rowSpan?: number
  /** Minimum edge weight to display (CiteSpace "Link Filter", default 0 = show all). */
  linkFilter?: number
  /** Font size of the right-side cluster labels (default 10). */
  clusterLabelFontSize?: number
  /** Max character length of the right-side cluster labels (default 28). */
  clusterLabelMaxLength?: number
  /** When true, append "(N)" frequency count to floating labels. */
  showFrequency?: boolean
  /** Circle (reference-layer) node radius multiplier — independent of diamonds. */
  citationNodeScale?: number
  /** Ranking metric for the TERM (diamond) label layer. 'hide' disables the layer's labels. */
  termLabelMetric?: LabelMetric
  /** Ranking metric for the REFERENCE (circle) label layer. */
  refLabelMetric?: LabelMetric
}

/** Rotated-square path for term-layer (diamond) nodes. */
function diamondPath(r: number): string {
  return `M0,${-r} L${r},0 L0,${r} L${-r},0 Z`
}

export default function TimelineView({
  data,
  loading = false,
  colorScheme = 'blue',
  xAxisScale = 1,
  weightPrecision = 4,
  citationThreshold = 0,
  nodeScale = 1,
  citationFontScale = 1,
  showDiamondLabels = false,
  labelThreshold = 0,
  diamondNodeScale = 1,
  fontScaleMul = 1,
  hiddenNodeIds,
  rowSpan = 64,
  linkFilter = 0,
  clusterLabelFontSize = 10,
  clusterLabelMaxLength = 28,
  showFrequency = false,
  citationNodeScale = 1,
  termLabelMetric = 'degree',
  refLabelMetric = 'citation',
}: TimelineViewProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  const [focusedCluster, setFocusedCluster] = useState<number | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  // Refs mirror the selection state so the (re)draw effect's visibility routine
  // always reads current values without being in its dependency list — clicking
  // a node must not rebuild the chart (dragged positions have to survive).
  const focusRef = useRef<number | null>(null)
  const selRef = useRef<string | null>(null)
  focusRef.current = focusedCluster
  selRef.current = selectedNodeId
  const applyVisRef = useRef<() => void>(() => {})

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

    // Respect data-table visibility: hidden nodes are dropped from the layout.
    const vizNodes = (hiddenNodeIds && hiddenNodeIds.size)
      ? data.nodes.filter(n => !hiddenNodeIds.has(n.id))
      : data.nodes
    const vizNodeIds = new Set(vizNodes.map(n => n.id))

    // Per-node label ranking (shared CiteSpace metrics). "By Cluster" needs the
    // representative-per-cluster set; timeline nodes carry their own degree value.
    const clusterReps = clusterRepresentatives(vizNodes)
    const metricOf = (n: TimelineNode, metric: LabelMetric, freqFallback: number): number =>
      metricValue(n, metric, freqFallback, { clusterReps })

    const { width: containerW } = dimensions
    const margin = { top: 30, right: 180, bottom: 45, left: 180 }

    const clusters = data.clusters.length > 0
      ? data.clusters
      : [{ id: 0, label: 'All', size: data.nodes.length, year_start: data.time_range.start, year_end: data.time_range.end }]

    const clusterIds = clusters.map(c => c.id)
    const nClusters = clusterIds.length

    // Lane height (CiteSpace "Row Span" — user-adjustable).
    const laneHeight = rowSpan
    const laneGap = 8
    const totalLaneH = nClusters * laneHeight + Math.max(0, nClusters - 1) * laneGap

    const yearStart = data.time_range.start
    const yearEnd = data.time_range.end

    // ---- Dynamic year spacing based on publication density ----
    const yearCounts = new Map<number, number>()
    vizNodes.forEach(n => yearCounts.set(n.year, (yearCounts.get(n.year) || 0) + 1))

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

    // World size (the laid-out timeline). The SVG itself fills the container; the world
    // is navigated by canvas pan/zoom (like the network & cluster views) — no scrollbars.
    const svgW = margin.left + innerW + margin.right
    const totalH = margin.top + totalLaneH + margin.bottom + 30
    const viewW = containerW
    const viewH = dimensions.height || totalH
    svg.attr('width', viewW).attr('height', viewH)

    // Zoom/pan layer wraps the whole timeline; d3.zoom transforms it.
    const zoomLayer = svg.append('g').attr('class', 'zoom-layer')
    const g = zoomLayer.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => zoomLayer.attr('transform', event.transform))
    svg.call(zoom)
    // Click empty canvas → clear cluster focus and node selection.
    svg.on('click', () => { setFocusedCluster(null); setSelectedNodeId(null) })
    // Initial transform: fit the world width into the viewport (vertically top-aligned).
    const fitScale = Math.min(1, viewW / svgW)
    svg.call(zoom.transform, d3.zoomIdentity
      .translate((viewW - svgW * fitScale) / 2, 8)
      .scale(fitScale))

    // Band positions per cluster
    const bandPositions = new Map<number, { y: number; h: number }>()
    clusterIds.forEach((cid, i) => {
      bandPositions.set(cid, {
        y: i * (laneHeight + laneGap),
        h: laneHeight
      })
    })

    // Use raw frequency for circle sizing so values match the data table directly.
    // Fall back to weight (log-transformed) only when frequency is missing.
    const nodeFreq = (n: TimelineNode) => n.frequency ?? n.weight
    const maxFreq = d3.max(vizNodes, d => nodeFreq(d)) || 1
    // Keep roundedWeight for tooltip display precision but not for sizing.
    const precisionFactor = Math.pow(10, weightPrecision)
    const roundedWeight = (w: number) => Math.round(w * precisionFactor) / precisionFactor
    const sizeScale = d3.scalePow().exponent(0.6)
      .domain([0, maxFreq])
      .range([4, 32])

    // ---- Color function based on colorScheme ----
    const isColorful = colorScheme === 'colorful'
    const palette = YEAR_PALETTES[colorScheme] || YEAR_PALETTES.blue

    // Color depth proportional to frequency: high frequency = darker/more vivid palette entry.
    // This makes weight visually readable without relying on left-to-right year position.
    const getNodeColor = (node: TimelineNode, _clusterIndex: number): string => {
      const freqFrac = maxFreq > 0 ? nodeFreq(node) / maxFreq : 0.5
      // Use the lower 40% of the palette as floor so low-freq nodes stay readable
      const minPalIdx = 2
      if (isColorful) {
        const rowPalette = ROW_HUE_FAMILIES[_clusterIndex % ROW_HUE_FAMILIES.length]
        const ci = Math.min(rowPalette.length - 1,
          minPalIdx + Math.floor(freqFrac * (rowPalette.length - 1 - minPalIdx)))
        return rowPalette[ci]
      }
      const ci = Math.min(palette.length - 1,
        minPalIdx + Math.floor(freqFrac * (palette.length - 1 - minPalIdx)))
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
        .attr('y', band.y + band.h / 2 - 5)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', 'bold')
        .attr('fill', rowColor)
        .text(`#${cluster.id}`)

      g.append('text')
        .attr('x', -18)
        .attr('y', band.y + band.h / 2 + 6)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 9)
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
    vizNodes.forEach(n => {
      const arr = nodesByCluster.get(n.cluster) || []
      arr.push(n)
      nodesByCluster.set(n.cluster, arr)
    })

    interface NodePos { cx: number; cy: number; cy0: number; r: number; node: TimelineNode; color: string }
    const nodePositions = new Map<string, NodePos>()

    const nodeRadius = new Map<string, number>()
    const nodeColor = new Map<string, string>()
    vizNodes.forEach(n => {
      const clusterIndex = clusterIds.indexOf(n.cluster)
      nodeRadius.set(n.id, Math.max(2, sizeScale(nodeFreq(n)) * nodeScale))
      nodeColor.set(n.id, getNodeColor(n, clusterIndex))
    })

    // CiteSpace-style: nodes of the same year in the same lane stack vertically.
    // Largest node stays at the lane center; others alternate above/below with ~80% overlap.
    nodesByCluster.forEach((nodes, clusterId) => {
      const band = bandPositions.get(clusterId)
      if (!band) return
      const clusterIndex = clusterIds.indexOf(clusterId)
      const centerY = band.y + band.h / 2

      const byYear = new Map<number, TimelineNode[]>()
      nodes.forEach(n => {
        const a = byYear.get(n.year) || []
        a.push(n)
        byYear.set(n.year, a)
      })
      byYear.forEach((grp, year) => {
        const anchorX = yearCenterX.get(year) || 0
        const slotW = yearSlotWMap.get(year) || 80
        grp.sort((a, b) => nodeFreq(b) - nodeFreq(a))  // sort by frequency, large first
        const maxGroupFreq = nodeFreq(grp[0]) || 1
        grp.forEach((n) => {
          const r = nodeRadius.get(n.id)!
          // Spread nodes across 40% of the year slot width so freq differences are visible.
          const freqOffset = (1 - nodeFreq(n) / maxGroupFreq) * slotW * 0.4
          const color = nodeColor.get(n.id) || getNodeColor(n, clusterIndex)
          nodePositions.set(n.id, { cx: anchorX + freqOffset, cy: centerY, cy0: centerY, r, node: n, color })
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

    // ---- Citation arcs (link filter: hide edges below minimum weight) ----
    const edgeG = g.append('g').attr('class', 'edges')
    // Edges to/from nodes hidden via the data table are hidden with them.
    const visibleEdges = data.edges.filter(e => vizNodeIds.has(e.source) && vizNodeIds.has(e.target))
    const filteredEdgePool = linkFilter > 0
      ? visibleEdges.filter(e => e.weight >= linkFilter)
      : visibleEdges
    const maxEdges = Math.min(filteredEdgePool.length, 500)
    const sortedEdges = [...filteredEdgePool].sort((a, b) => b.weight - a.weight).slice(0, maxEdges)

    const arcPath = (d: { source: string; target: string }) => {
      const s = nodePositions.get(d.source)
      const tgt = nodePositions.get(d.target)
      if (!s || !tgt) return ''
      const dx = tgt.cx - s.cx
      const dy = tgt.cy - s.cy
      const arcH = Math.abs(dy) * 0.3 + Math.abs(dx) * 0.15 + 25
      const midX = (s.cx + tgt.cx) / 2
      const midY = Math.min(s.cy, tgt.cy) - arcH
      return `M${s.cx},${s.cy} Q${midX},${midY} ${tgt.cx},${tgt.cy}`
    }
    const edgePaths = edgeG.selectAll('path')
      .data(sortedEdges)
      .join('path')
      .attr('d', arcPath)
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

    const gNode = g.node() as SVGGElement
    const nodeEls = nodeGroup.selectAll<SVGGElement, NodePos>('g')
      .data(allNodes)
      .join('g')
      .attr('data-cluster', d => d.node.cluster)
      .attr('data-node-id', d => d.node.id)
      .attr('transform', d => `translate(${d.cx},${d.cy})`)
      // Vertical drag: X stays locked to the year, Y is free within (and a little beyond)
      // the cluster lane. Connected arcs follow live.
      .call(d3.drag<SVGGElement, NodePos>()
        .clickDistance(4)
        .on('start', function () { d3.select(this).raise() })
        .on('drag', function (event, d) {
          const py = d3.pointer(event.sourceEvent, gNode)[1]
          const band = bandPositions.get(d.node.cluster)
          d.cy = band
            ? Math.max(band.y - 6, Math.min(band.y + band.h + 6, py))
            : py
          d3.select(this).attr('transform', `translate(${d.cx},${d.cy})`)
          edgePaths.attr('d', arcPath)
          // The node's floating label (text + tag rect) follows the drag.
          // Node ids may contain arbitrary characters, so match via filter
          // rather than an attribute selector.
          const dy = d.cy - d.cy0
          labelG.selectAll<SVGElement, unknown>('[data-node-id]')
            .filter(function () { return (this as Element).getAttribute('data-node-id') === d.node.id })
            .attr('transform', `translate(0,${dy})`)
        })
      )

    // Common event handlers extracted to avoid repetition across shape types.
    const attachNodeEvents = (sel: d3.Selection<any, NodePos, any, unknown>) => {
      sel
        .on('click', (event: MouseEvent, d: NodePos) => {
          event.stopPropagation()
          setFocusedCluster((prev: number | null) => prev === d.node.cluster ? null : d.node.cluster)
          setSelectedNodeId(prev => prev === d.node.id ? null : d.node.id)
        })
        .attr('stroke', (d: NodePos) => {
          if (d.node.is_burst) return '#ff5722'
          return d3.color(d.color)?.darker(0.5)?.toString() || (isDark ? '#555' : '#ccc')
        })
        .attr('stroke-width', (d: NodePos) => d.node.is_burst ? 2.5 : 1)
        .attr('opacity', 0.9)
        .style('cursor', 'pointer')
        .on('mouseenter', (event: MouseEvent, d: NodePos) => {
          const freq = d.node.frequency ?? roundedWeight(d.node.weight)
          const content = `${d.node.label}\n${t('biblio.yearColumn')}: ${d.node.year}\nCluster #${d.node.cluster}\n${t('biblio.frequency')}: ${freq}${d.node.is_burst ? `\n${t('biblio.burstNode')}` : ''}`
          showTooltip(event as unknown as MouseEvent, content)
        })
        .on('mousemove', (event: MouseEvent, d: NodePos) => {
          const freq = d.node.frequency ?? roundedWeight(d.node.weight)
          const content = `${d.node.label}\n${t('biblio.yearColumn')}: ${d.node.year}\nCluster #${d.node.cluster}\n${t('biblio.frequency')}: ${freq}${d.node.is_burst ? `\n${t('biblio.burstNode')}` : ''}`
          showTooltip(event as unknown as MouseEvent, content)
        })
        .on('mouseleave', () => setTooltip(null))
    }

    // Dual node shapes: reference-layer nodes are circles (year rings), every
    // other node type (keyword / term / author / …) renders as a diamond —
    // both layers coexist in hybrid networks and are sized independently.
    attachNodeEvents(
      nodeEls.filter((d: NodePos) => isReferenceNode(d.node))
        .append('circle')
        .attr('r', (d: NodePos) => d.r * citationNodeScale)
        .attr('fill', (d: NodePos) => d.color) as d3.Selection<any, NodePos, any, unknown>
    )
    attachNodeEvents(
      nodeEls.filter((d: NodePos) => !isReferenceNode(d.node))
        .append('path')
        .attr('d', (d: NodePos) => diamondPath(d.r * 1.25 * diamondNodeScale))
        .attr('fill', (d: NodePos) => d.color) as d3.Selection<any, NodePos, any, unknown>
    )
    // Burst pulse animation
    nodeEls.filter((d: NodePos) => d.node.is_burst)
      .append('circle')
      .attr('r', (d: NodePos) => d.r + 2)
      .attr('fill', 'none')
      .attr('stroke', '#ff5722')
      .attr('stroke-width', 1.2)
      .attr('opacity', 0)
      .each(function (this: SVGCircleElement, d: NodePos) {
        const el = d3.select(this)
        const pulse = () => {
          el.attr('opacity', 0.8)
            .attr('r', d.r + 2)
            .transition().duration(1200)
            .attr('opacity', 0)
            .attr('r', d.r + 9)
            .on('end', pulse)
        }
        pulse()
      })

    // Reference-layer inline labels (By Citation group): ranked/filtered by the
    // configured metric, shown as small text under the circle.
    if (citationThreshold > 0 && refLabelMetric !== 'hide') {
      const citationTextColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)'
      nodeEls
        .filter((d: NodePos) => isReferenceNode(d.node)
          && metricOf(d.node, refLabelMetric, nodeFreq(d.node)) >= citationThreshold)
        .append('text')
        .attr('y', (d: NodePos) => d.r + Math.max(8, 8 * citationFontScale))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'hanging')
        .attr('font-size', Math.max(7, 9 * citationFontScale))
        .attr('fill', citationTextColor)
        .attr('pointer-events', 'none')
        .text((d: NodePos) => {
          const lbl = d.node.label
          const base = lbl.length > 14 ? lbl.slice(0, 14) + '…' : lbl
          return showFrequency ? `${base} (${d.node.frequency ?? Math.round(nodeFreq(d.node))})` : base
        })
    }

    // ---- Right-side cluster labels ----
    const rightLabelG = g.append('g').attr('class', 'right-labels')
    clusters.forEach((cluster, i) => {
      const band = bandPositions.get(cluster.id)!
      const rowColor = getRowColor(i)
      const cy = band.y + band.h / 2
      const clusterFreq = (nodesByCluster.get(cluster.id) || [])
        .reduce((s, n) => s + (n.frequency ?? 0), 0)
      const clusterCount = (nodesByCluster.get(cluster.id) || []).length

      rightLabelG.append('text')
        .attr('class', 'right-cluster-label')
        .attr('data-cluster', cluster.id)
        .attr('x', innerW + 10)
        .attr('y', cy)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', clusterLabelFontSize)
        .attr('font-weight', 'bold')
        .attr('fill', rowColor)
        .text(`#${cluster.id} ${cluster.label}`.slice(0, clusterLabelMaxLength))

      // Frequency sub-label, revealed only when this cluster is focused (click a node).
      rightLabelG.append('text')
        .attr('class', 'right-cluster-freq')
        .attr('data-cluster', cluster.id)
        .attr('x', innerW + 10)
        .attr('y', cy + 12)
        .attr('font-size', 9)
        .attr('fill', rowColor)
        .attr('opacity', 0)
        .text(`${t('biblio.frequency')}: ${clusterFreq} · ${clusterCount}`)
    })

    // ---- Word-cloud style labels (TERM/diamond layer, By Degree group) ----
    // Ranked and thresholded by the configured metric; 'hide' disables the layer.
    const termNodes = allNodes.filter(d => !isReferenceNode(d.node))
    const labelCandidates = termLabelMetric === 'hide' ? [] : [...termNodes].sort((a, b) =>
      metricOf(b.node, termLabelMetric, nodeFreq(b.node)) - metricOf(a.node, termLabelMetric, nodeFreq(a.node)))
    // Keep the 5%-of-max frequency floor as a noise guard on top of the metric threshold
    const freqThreshold = maxFreq * 0.05
    const topCandidates = labelCandidates.filter(d =>
      nodeFreq(d.node) >= freqThreshold
      && metricOf(d.node, termLabelMetric, nodeFreq(d.node)) >= labelThreshold)
    const maxLabels = Math.min(topCandidates.length, 80)

    const placedBoxes: { x: number; y: number; w: number; h: number }[] = []
    const labelG = g.append('g').attr('class', 'labels')

    for (let i = 0; i < maxLabels; i++) {
      const d = topCandidates[i]
      const freq = d.node.frequency ?? Math.round(nodeFreq(d.node))
      const baseText = d.node.label.length > 20 ? d.node.label.slice(0, 20) + '..' : d.node.label
      const labelText = showFrequency ? `${baseText} (${freq})` : baseText
      // Font size directly proportional to frequency — creates word-cloud visual variation
      const normalizedFreq = maxFreq > 0 ? nodeFreq(d.node) / maxFreq : 0
      // Power curve (0.55) amplifies contrast: top labels are much larger than mid-range
      const fontSize = Math.max(9, Math.min(38, 9 + Math.pow(normalizedFreq, 0.55) * 29)) * fontScaleMul * (showDiamondLabels ? diamondNodeScale : 1)
      const approxW = labelText.length * fontSize * 0.58
      const approxH = fontSize * 1.1

      // 8 candidate positions: cardinal + diagonal, at two distance rings
      const positions = [
        { x: d.cx + d.r + 5,            y: d.cy + fontSize * 0.4 },
        { x: d.cx - approxW - d.r - 5,  y: d.cy + fontSize * 0.4 },
        { x: d.cx - approxW / 2,        y: d.cy - d.r - 5 },
        { x: d.cx - approxW / 2,        y: d.cy + d.r + approxH + 3 },
        { x: d.cx + d.r + 12,           y: d.cy - d.r },
        { x: d.cx + d.r + 12,           y: d.cy + d.r + fontSize },
        { x: d.cx - approxW - d.r - 12, y: d.cy - d.r },
        { x: d.cx - approxW - d.r - 12, y: d.cy + d.r + fontSize },
      ]

      for (const pos of positions) {
        const box = { x: pos.x - 2, y: pos.y - approxH, w: approxW + 4, h: approxH + 2 }
        const overlaps = placedBoxes.some(pb =>
          box.x < pb.x + pb.w && box.x + box.w > pb.x &&
          box.y < pb.y + pb.h && box.y + box.h > pb.y
        )
        if (!overlaps) {
          placedBoxes.push(box)
          // Label color always uses the cluster's representative hue (mid-palette),
          // independent of each node's frequency shade, so all labels are legible.
          const clusterIdx = clusterIds.indexOf(d.node.cluster)
          const lc = d3.color(getRowColor(clusterIdx))
          const labelFill = lc
            ? (isDark ? lc.brighter(0.8).toString() : lc.darker(0.9).toString())
            : (isDark ? '#f0f0f0' : '#1a1a1a')
          labelG.append('text')
            .attr('class', 'node-label')
            .attr('data-cluster', d.node.cluster)
            .attr('data-node-id', d.node.id)
            .attr('x', pos.x)
            .attr('y', pos.y)
            .attr('font-size', fontSize)
            .attr('fill', labelFill)
            .attr('font-weight', d.node.is_burst ? 'bold' : normalizedFreq > 0.5 ? '600' : '400')
            .text(labelText)
          break
        }
      }
    }
    // CiteSpace-style tag chips behind the timeline labels (neutral border; the labels
    // here aren't data-bound, so colour comes from the theme rather than the node).
    addTagBackgrounds(labelG, () => (isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.2)'), isDark)

    // ---- Selection / cluster-focus visibility (applied without re-rendering) ----
    // Selecting a circle must NOT rebuild the chart: dragged positions have to
    // survive select/deselect, and deselect must restore the exact pre-selection
    // label visibility (threshold-hidden labels stay hidden).
    const makeSelectedLabel = (np: NodePos) => {
      // Same word-cloud styling formula as the persistent labels, so the
      // "revealed" label of a threshold-hidden node is indistinguishable from
      // a regular one (single unified label design).
      const freq = np.node.frequency ?? Math.round(nodeFreq(np.node))
      const baseText = np.node.label.length > 20 ? np.node.label.slice(0, 20) + '..' : np.node.label
      const labelText = showFrequency ? `${baseText} (${freq})` : baseText
      const normalizedFreq = maxFreq > 0 ? nodeFreq(np.node) / maxFreq : 0
      const fontSize = Math.max(9, Math.min(38, 9 + Math.pow(normalizedFreq, 0.55) * 29)) * fontScaleMul * (showDiamondLabels ? diamondNodeScale : 1)
      const clusterIdx = clusterIds.indexOf(np.node.cluster)
      const lc = d3.color(getRowColor(clusterIdx))
      const labelFill = lc
        ? (isDark ? lc.brighter(0.8).toString() : lc.darker(0.9).toString())
        : (isDark ? '#f0f0f0' : '#1a1a1a')
      const textEl = labelG.append('text')
        .attr('class', 'node-label temp-label')
        .attr('data-cluster', np.node.cluster)
        .attr('data-node-id', np.node.id)
        .attr('x', np.cx + np.r + 5)
        .attr('y', np.cy0 + fontSize * 0.4)
        .attr('font-size', fontSize)
        .attr('fill', labelFill)
        .attr('font-weight', np.node.is_burst ? 'bold' : normalizedFreq > 0.5 ? '600' : '400')
        .attr('transform', `translate(0,${np.cy - np.cy0})`)
        .text(labelText)
      // Tag chip behind the temp label (same style as addTagBackgrounds)
      try {
        const bb = (textEl.node() as SVGTextElement).getBBox()
        if (bb.width) {
          labelG.insert('rect', 'text.temp-label')
            .attr('class', 'node-tag temp-label')
            .attr('data-cluster', np.node.cluster)
            .attr('data-node-id', np.node.id)
            .attr('x', bb.x - 5).attr('y', bb.y - 2.5)
            .attr('width', bb.width + 10).attr('height', bb.height + 5)
            .attr('rx', 4).attr('ry', 4)
            .attr('fill', isDark ? 'rgba(28,28,30,0.82)' : 'rgba(255,255,255,0.88)')
            .attr('stroke', isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.2)')
            .attr('stroke-width', 0.8)
            .attr('transform', `translate(0,${np.cy - np.cy0})`)
        }
      } catch { /* getBBox can fail on detached nodes */ }
    }

    const applyVisibility = () => {
      const focused = focusRef.current
      const selected = selRef.current

      // Temp labels from a previous selection are removed (restores pre-selection state)
      labelG.selectAll('.temp-label')
        .filter(function () { return (this as Element).getAttribute('data-node-id') !== selected })
        .remove()

      // Selected node without a persistent label (below threshold) gets a temp one
      if (selected) {
        const np = nodePositions.get(selected)
        const hasLabel = labelG.selectAll('text.node-label')
          .filter(function () { return (this as Element).getAttribute('data-node-id') === selected })
          .size() > 0
        if (np && !hasLabel) makeSelectedLabel(np)
      }

      // Node circles: cluster focus dims other lanes (original behaviour)
      nodeGroup.selectAll<SVGGElement, NodePos>('g')
        .attr('opacity', (d: any) => focused === null ? 1 : (d?.node?.cluster === focused ? 1 : 0.12))

      // Selection ring (overlay circle, removed on deselect)
      nodeGroup.selectAll('.selection-ring').remove()
      if (selected) {
        nodeEls
          .filter((d: NodePos) => d.node.id === selected)
          .append('circle')
          .attr('class', 'selection-ring')
          .attr('r', (d: NodePos) => d.r + 2.5)
          .attr('fill', 'none')
          .attr('stroke', '#1976d2')
          .attr('stroke-width', 2.5)
          .attr('pointer-events', 'none')
      }

      // Labels: with a selection only the selected node's label (text + chip) is
      // visible; otherwise fall back to the cluster-focus dimming rules.
      labelG.selectAll<SVGElement, unknown>('[data-node-id]')
        .attr('opacity', function () {
          const el = this as Element
          const id = el.getAttribute('data-node-id')
          if (selected) return id === selected ? 1 : 0
          if (focused === null) return 1
          return +(el.getAttribute('data-cluster') || '-1') === focused ? 1 : 0.1
        })

      // Right-side cluster labels + frequency sub-labels + edges (original focus rules)
      g.selectAll('.right-cluster-label').attr('opacity', function (this: any) {
        if (focused === null) return 1
        return (+((this as Element).getAttribute('data-cluster') || '-1') === focused) ? 1 : 0.2
      })
      g.selectAll('.right-cluster-freq').attr('opacity', function (this: any) {
        if (focused === null) return 0
        return (+((this as Element).getAttribute('data-cluster') || '-1') === focused) ? 1 : 0
      })
      g.selectAll('.edges path').attr('opacity', focused === null ? 1 : 0.06)
    }
    applyVisRef.current = applyVisibility
    applyVisibility()

  }, [data, dimensions, isDark, t, showTooltip, colorScheme, xAxisScale, weightPrecision, labelThreshold, nodeScale, fontScaleMul, hiddenNodeIds, showDiamondLabels, citationThreshold, citationFontScale, diamondNodeScale, rowSpan, linkFilter, clusterLabelFontSize, clusterLabelMaxLength, showFrequency, citationNodeScale, termLabelMetric, refLabelMetric])

  // Reset focus and selection when the dataset changes.
  useEffect(() => { setFocusedCluster(null); setSelectedNodeId(null) }, [data])

  // Cluster focus + node selection: applied via the redraw effect's visibility
  // routine (no chart rebuild — see applyVisibility inside the main effect).
  useEffect(() => {
    applyVisRef.current()
  }, [focusedCluster, selectedNodeId])

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
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: 'block', cursor: 'grab' }} />
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

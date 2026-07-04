/**
 * Cluster Network View for Bibliographic Visualization
 *
 * CiteSpace-style force-directed network with:
 *  - Smooth convex hull background regions per cluster (cloud-like)
 *  - Glow effects for high-centrality nodes
 *  - Curved Bezier links
 *  - Click/hover cluster hull → highlight animation
 *  - Modularity Q and Silhouette S metrics display
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type {
  ClusterVisualizationData,
  NetworkNode
} from '../../../../types/biblio'
import { addTagBackgrounds } from './shared/labelTags'
import {
  metricValue, clusterRepresentatives, isReferenceNode, type LabelMetric,
} from './shared/labelMetrics'

const COLOR_PALETTES: Record<string, string[]> = {
  blue: [
    '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4',
    '#039be5', '#0288d1', '#0277bd', '#01579b', '#1565c0',
    '#1a237e', '#0d47a1', '#42a5f5', '#5c6bc0', '#1e88e5'
  ],
  green: [
    '#dcedc8', '#c5e1a5', '#aed581', '#9ccc65', '#8bc34a',
    '#7cb342', '#689f38', '#558b2f', '#33691e', '#2e7d32',
    '#1b5e20', '#4caf50', '#66bb6a', '#43a047', '#388e3c'
  ],
  purple: [
    '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0',
    '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c', '#7c4dff',
    '#651fff', '#d500f9', '#aa00ff', '#b388ff', '#9575cd'
  ],
  orange: [
    '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726',
    '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100',
    '#ff6d00', '#bf360c', '#d84315', '#ff8f00', '#f9a825'
  ],
  red: [
    '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336',
    '#e53935', '#d32f2f', '#c62828', '#b71c1c', '#ff1744',
    '#d50000', '#ff5252', '#ff8a80', '#e91e63', '#c2185b'
  ],
  teal: [
    '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688',
    '#00897b', '#00796b', '#00695c', '#004d40', '#1de9b6',
    '#00bfa5', '#64ffda', '#a7ffeb', '#00e5ff', '#00838f'
  ],
  colorful: [
    '#1976d2', '#388e3c', '#7b1fa2', '#f57c00', '#d32f2f',
    '#00796b', '#5d4037', '#c2185b', '#0097a7', '#3949ab',
    '#558b2f', '#ad1457', '#00838f', '#6d4c41', '#455a65'
  ]
}

interface ClusterViewProps {
  data: ClusterVisualizationData | null
  loading?: boolean
  colorScheme?: string
  showHulls?: boolean
  hullThreshold?: number
  /** CiteSpace label metrics: a node gets a tag label only if its layer's metric clears
      the threshold below. Term (diamond) nodes use `termLabelMetric`, reference (circle)
      nodes use `refLabelMetric`. The node itself always renders. */
  termLabelMetric?: LabelMetric
  refLabelMetric?: LabelMetric
  /** Only nodes whose chosen metric ≥ this value get a tag label (nodes still render). */
  labelThreshold?: number
  /** Append the frequency count to each tag label (CiteSpace "Show Frequency"). */
  showFrequency?: boolean
  /** Node-size multiplier (CiteSpace "Node Size" slider). */
  nodeScale?: number
  /** Label font-size multiplier (CiteSpace "Font Size" slider). */
  fontScaleMul?: number
  /** Node ids toggled off via the data table — hidden from the canvas. */
  hiddenNodeIds?: Set<string>
  /** Cluster layout mode: force-directed (default), ring without center, ring with center hub. */
  layoutMode?: 'force' | 'ring' | 'ring-center'
  /** Show text labels on edges (CiteSpace "Show Link Labels"). */
  showLinkLabels?: boolean
  /** Show numeric strength on edges (CiteSpace "Show Link Strengths"). */
  showLinkStrengths?: boolean
  /** Font size of per-cluster centroid labels (default 12). */
  clusterLabelFontSize?: number
  /** Max character length of centroid cluster labels (default 30). */
  clusterLabelMaxLength?: number
}

interface SimNode extends NetworkNode, d3.SimulationNodeDatum {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> { weight: number }

/**
 * Compute a padded convex hull path for a set of points.
 * Uses d3.polygonHull then expands and smooths with curveBasisClosed.
 */
function computeHullPath(
  points: [number, number][],
  padding: number
): string | null {
  if (points.length < 3) {
    if (points.length === 1) {
      // Single point: draw a circle
      const [x, y] = points[0]
      return `M${x - padding},${y} A${padding},${padding} 0 1,0 ${x + padding},${y} A${padding},${padding} 0 1,0 ${x - padding},${y}`
    }
    if (points.length === 2) {
      // Two points: draw a capsule/ellipse
      const [x1, y1] = points[0]
      const [x2, y2] = points[1]
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) / 2 + padding
      return `M${midX - dist},${midY} A${dist},${padding * 1.5} 0 1,0 ${midX + dist},${midY} A${dist},${padding * 1.5} 0 1,0 ${midX - dist},${midY}`
    }
    return null
  }

  const hull = d3.polygonHull(points)
  if (!hull) return null

  // Expand hull outward by padding
  const centroid = d3.polygonCentroid(hull)
  const expanded: [number, number][] = hull.map(pt => {
    const dx = pt[0] - centroid[0]
    const dy = pt[1] - centroid[1]
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    return [
      pt[0] + (dx / len) * padding,
      pt[1] + (dy / len) * padding
    ]
  })

  // Smooth with curveBasisClosed for cloud-like appearance
  const lineGen = d3.line<[number, number]>()
    .x(d => d[0])
    .y(d => d[1])
    .curve(d3.curveBasisClosed)

  return lineGen(expanded) || null
}

export default function ClusterView({
  data,
  loading = false,
  colorScheme = 'blue',
  showHulls = true,
  hullThreshold = 2,
  termLabelMetric = 'degree',
  refLabelMetric = 'citation',
  labelThreshold = 0,
  showFrequency = false,
  nodeScale = 1,
  fontScaleMul = 1,
  hiddenNodeIds,
  layoutMode = 'force',
  showLinkLabels = false,
  showLinkStrengths = false,
  clusterLabelFontSize = 12,
  clusterLabelMaxLength = 30,
}: ClusterViewProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  const [focusedCluster, setFocusedCluster] = useState<number | null>(null)

  const showTooltip = useCallback((event: MouseEvent, content: string) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    let x = event.clientX - rect.left + 12
    let y = event.clientY - rect.top + 12
    if (x + 220 > rect.width) x = event.clientX - rect.left - 220
    if (y + 80 > rect.height) y = event.clientY - rect.top - 80
    setTooltip({ x: Math.max(8, x), y: Math.max(8, y), content })
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const apply = () => {
      if (!containerRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      const nw = r.width || 800, nh = r.height || 600
      // Ignore sub-threshold jitter so the force layout isn't rebuilt needlessly.
      setDimensions(prev => (Math.abs(nw - prev.width) < 4 && Math.abs(nh - prev.height) < 4)
        ? prev : { width: nw, height: nh })
    }
    apply()
    // Debounce: rebuild once after a resize/drag settles, not on every intermediate size.
    const obs = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(apply, 160)
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => { obs.disconnect(); if (timer) clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (!svgRef.current || !data || data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const { width: w, height: h } = dimensions

    // SVG defs: glow filter
    const defs = svg.append('defs')
    const filter = defs.append('filter').attr('id', 'glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'coloredBlur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    // Click background to clear focus
    svg.on('click', () => setFocusedCluster(null))

    // Respect data-table visibility: hidden nodes (and their edges) are dropped.
    const visibleNodes = hiddenNodeIds && hiddenNodeIds.size
      ? data.nodes.filter(n => !hiddenNodeIds.has(n.id))
      : data.nodes
    const visibleIds = new Set(visibleNodes.map(n => n.id))
    const nodes: SimNode[] = visibleNodes.map(n => ({ ...n }))
    const links: SimLink[] = data.edges
      .filter(e => visibleIds.has(e.source as string) && visibleIds.has(e.target as string))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight }))

    const uniqueClusters = [...new Set(nodes.map(n => n.cluster ?? 0))]
    const palette = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const colorScale = d3.scaleOrdinal<number, string>()
      .domain(uniqueClusters)
      .range(palette)

    const cx = w / 2, cy = h / 2
    // Cluster center positions for forces (original force-directed look).
    const clusterCenters: Record<number, { x: number; y: number }> = {}
    uniqueClusters.forEach((cid, i) => {
      const angle = (2 * Math.PI * i) / uniqueClusters.length
      const r = Math.min(w, h) * 0.25
      clusterCenters[cid] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    })

    // ---- Ring layout: pin node positions before simulation starts ----
    // Store cluster centroids for hub drawing.
    const ringCentroids = new Map<number, { x: number; y: number }>()
    if (layoutMode === 'ring' || layoutMode === 'ring-center') {
      const ringR = Math.min(w, h) * 0.33
      uniqueClusters.forEach((cid, i) => {
        const angle = (i / uniqueClusters.length) * 2 * Math.PI - Math.PI / 2
        const ccx = cx + ringR * Math.cos(angle)
        const ccy = cy + ringR * Math.sin(angle)
        ringCentroids.set(cid, { x: ccx, y: ccy })
        const clusterNodes = nodes.filter(n => (n.cluster ?? 0) === cid)
        const subR = Math.max(30, Math.sqrt(clusterNodes.length) * 14)
        clusterNodes.forEach((node, ni) => {
          const subAngle = (ni / Math.max(1, clusterNodes.length)) * 2 * Math.PI
          node.x = ccx + subR * Math.cos(subAngle)
          node.y = ccy + subR * Math.sin(subAngle)
          node.fx = node.x
          node.fy = node.y
        })
      })
    }

    // Wider size range = stronger frequency contrast (CiteSpace-like); the Node Size
    // slider (nodeScale) multiplies it. rOf() is THE node radius used everywhere.
    const sizeScale = d3.scaleSqrt()
      .domain([0, d3.max(nodes, d => d.frequency) || 1])
      .range([3, 34])
    const rOf = (d: SimNode) => Math.max(2.5, sizeScale(d.frequency) * nodeScale)

    // Edge weights are cosine similarities in (0, 1]; scale from the actual min→max so
    // strokes stay thin (the old [1, max] domain assumed integer co-occurrence counts and
    // extrapolated 0.x weights to ~13px — the "thick gray fan" bug).
    const wExtent = d3.extent(links, d => d.weight) as [number, number]
    const edgeScale = d3.scaleLinear()
      .domain([wExtent[0] ?? 0, wExtent[1] ?? 1])
      .range([0.4, 2])
      .clamp(true)

    // ---- Node-label metric (CiteSpace "Node Labels": By Frequency/Centrality/Degree) ----
    const degree = new Map<string, number>()
    links.forEach(l => {
      const s = (typeof l.source === 'object' ? (l.source as SimNode).id : l.source) as string
      const tg = (typeof l.target === 'object' ? (l.target as SimNode).id : l.target) as string
      degree.set(s, (degree.get(s) || 0) + 1)
      degree.set(tg, (degree.get(tg) || 0) + 1)
    })
    // Two independent CiteSpace label dropdowns: reference (circle) nodes rank by
    // `refLabelMetric`, all other (diamond) nodes by `termLabelMetric`.
    const clusterReps = clusterRepresentatives(nodes)
    const metricVal = (d: SimNode): number => {
      const metric = isReferenceNode(d) ? refLabelMetric : termLabelMetric
      return metricValue(d, metric, d.frequency,
        { degree: degree.get(d.id) || 0, clusterReps })
    }
    // A node is labelled only if its metric clears the threshold. To avoid clutter when
    // the threshold is 0, also auto-cap to the top ~40 nodes by the chosen metric.
    const metricsDesc = nodes.map(metricVal).sort((a, b) => b - a)
    const autoCutoff = metricsDesc.length > 40 ? metricsDesc[40] : 0
    const effectiveLabelMin = Math.max(labelThreshold, autoCutoff)
    const isLabeled = (d: SimNode) => metricVal(d) >= effectiveLabelMin

    // Default cooling (original) so the layout keeps its spread-out look; the perf win
    // comes from throttling hull redraws, not from cooling.
    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(100).strength(d => Math.min(0.4, d.weight / 20)))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('clusterX', d3.forceX<SimNode>(d => clusterCenters[d.cluster ?? 0]?.x ?? cx).strength(0.15))
      .force('clusterY', d3.forceY<SimNode>(d => clusterCenters[d.cluster ?? 0]?.y ?? cy).strength(0.15))
      // Partial overlap (CiteSpace look): collide at ~0.7r so circles can touch/overlap
      // slightly rather than being forced fully apart.
      .force('collision', d3.forceCollide<SimNode>().radius(d => rOf(d) * 0.7 + 2))

    // Label font scales with the chosen metric — high-frequency terms read larger.
    // Label font size is proportional to the node's circle size (CiteSpace), scaled by
    // the Font Size slider.
    const maxNodeFreq = d3.max(nodes, d => d.frequency) || 1
    // Power curve (0.6) gives top-frequency nodes dramatically larger labels
    const fontOf = (d: SimNode) => {
      const norm = Math.max(0, d.frequency) / maxNodeFreq
      return Math.max(8, Math.min(36, 8 + Math.pow(norm, 0.6) * 28)) * fontScaleMul
    }

    // ---- Ring-center hub: spokes + central circle (drawn first = lowest z-order) ----
    if (layoutMode === 'ring-center') {
      const hubG = g.append('g').attr('class', 'ring-hub')
      ringCentroids.forEach(({ x: ccx, y: ccy }, cid) => {
        hubG.append('line')
          .attr('x1', cx).attr('y1', cy)
          .attr('x2', ccx).attr('y2', ccy)
          .attr('stroke', colorScale(cid))
          .attr('stroke-opacity', 0.22)
          .attr('stroke-width', 1.2)
          .attr('stroke-dasharray', '4,3')
      })
      hubG.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 18)
        .attr('fill', isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)')
        .attr('stroke', isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,2')
    }

    // ---- Hull background layer (rendered at bottom) ----
    const hullG = g.append('g').attr('class', 'hulls')

    // Curved links
    const linkG = g.append('g').attr('class', 'links')
    const linkPath = linkG.selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', isDark ? 'rgba(150,150,150,0.22)' : 'rgba(120,120,120,0.18)')
      .attr('stroke-width', d => edgeScale(d.weight))

    // Link labels layer (CiteSpace "Show Link Labels / Show Link Strengths")
    const linkLabelG = g.append('g').attr('class', 'link-labels')
    const showAnyLinkLabel = showLinkLabels || showLinkStrengths
    const linkLabelText = showAnyLinkLabel
      ? linkLabelG.selectAll<SVGTextElement, SimLink>('text')
          .data(links)
          .join('text')
          .attr('font-size', 8)
          .attr('fill', isDark ? 'rgba(220,220,220,0.65)' : 'rgba(0,0,0,0.45)')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('pointer-events', 'none')
          .text(d => showLinkStrengths ? d.weight.toFixed(2) : String(Math.round(d.weight * 100)))
      : null

    // Nodes
    const nodeG = g.append('g').attr('class', 'nodes')
    const node = nodeG.selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          event.subject.fx = event.subject.x
          event.subject.fy = event.subject.y
        })
        .on('drag', (event) => {
          event.subject.fx = event.x
          event.subject.fy = event.y
        })
        .on('end', (event) => {
          if (!event.active) simulation.alphaTarget(0)
          // Ring mode: keep node pinned where dropped; force mode: release to float.
          if (layoutMode === 'force') {
            event.subject.fx = null
            event.subject.fy = null
          } else {
            event.subject.fx = event.subject.x
            event.subject.fy = event.subject.y
          }
        })
      )

    // Node shapes: reference-layer nodes stay circles, term-layer nodes render
    // as diamonds (hybrid multi-node-type networks show both, like the timeline)
    const isRefNode = (d: any) => {
      const tt = String(d.term_type || '').toLowerCase()
      return tt === 'reference' || tt === 'co-citation'
    }
    node.append('path')
      .attr('class', 'node-shape')
      .attr('d', d => {
        const r = rOf(d)
        return isRefNode(d)
          ? `M${-r},0 A${r},${r} 0 1,0 ${r},0 A${r},${r} 0 1,0 ${-r},0 Z`  // circle path
          : `M0,${-r * 1.25} L${r * 1.25},0 L0,${r * 1.25} L${-r * 1.25},0 Z`  // diamond
      })
      .attr('fill', d => colorScale(d.cluster ?? 0))
      .attr('stroke', d => {
        const c = d3.color(colorScale(d.cluster ?? 0))
        return c ? c.brighter(0.5).toString() : '#fff'
      })
      .attr('stroke-width', d => d.centrality > 0.2 ? 3 : 1.5)
      .attr('opacity', 0.9)
      .attr('filter', d => d.centrality > 0.2 ? 'url(#glow)' : null)
      .on('click', (event, d) => {
        event.stopPropagation()
        // If this node's label was filtered out by the threshold, reveal its name tag
        // on click (CiteSpace behaviour) — the point was always there.
        const gSel = d3.select((event.currentTarget as SVGElement).parentNode as SVGGElement)
        const txt = gSel.select<SVGTextElement>('text.node-label')
        if (!txt.empty() && !txt.text()) {
          txt.text(d.label.length > 15 ? d.label.substring(0, 15) + '...' : d.label)
            .attr('font-size', fontOf(d))
            .attr('dx', rOf(d) + 5).attr('dy', 3.5).attr('font-weight', '600')
            .attr('fill', () => {
              const c = d3.color(colorScale(d.cluster ?? 0))
              return c ? (isDark ? c.brighter(1.3) : c.darker(1.5)).toString() : (isDark ? '#f0f0f0' : '#1a1a1a')
            })
          addTagBackgrounds(gSel, () => colorScale(d.cluster ?? 0), isDark)
        }
        setFocusedCluster(prev => prev === d.cluster ? null : (d.cluster ?? null))
      })
      .on('mouseenter', (event, d) => {
        const content = `${d.label}\n${t('biblio.frequency')}: ${d.frequency}\n${t('biblio.centrality')}: ${d.centrality.toFixed(3)}\nCluster: ${d.cluster}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mousemove', (event, d) => {
        const content = `${d.label}\n${t('biblio.frequency')}: ${d.frequency}\n${t('biblio.centrality')}: ${d.centrality.toFixed(3)}\nCluster: ${d.cluster}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mouseleave', () => setTooltip(null))

    // Node labels — CiteSpace-style "tag" chips; suppressed below the label-frequency
    // threshold (the node itself still renders).
    node.append('text')
      .attr('class', 'node-label')
      .text(d => {
        if (!isLabeled(d)) return ''
        const base = d.label.length > 15 ? d.label.substring(0, 15) + '...' : d.label
        return showFrequency ? `${base} (${d.frequency})` : base
      })
      .attr('font-size', fontOf)
      .attr('dx', d => rOf(d) + 5)
      .attr('dy', 3.5)
      // Label colour follows its cluster (CiteSpace), adjusted for legibility per theme.
      .attr('fill', d => {
        const c = d3.color(colorScale(d.cluster ?? 0))
        if (!c) return isDark ? '#f0f0f0' : '#1a1a1a'
        return (isDark ? c.brighter(1.3) : c.darker(1.5)).toString()
      })
      .attr('font-weight', '600')
    addTagBackgrounds(node, (d) => colorScale((d as SimNode).cluster ?? 0), isDark)

    // Cluster labels at centroids
    const clusterLabelG = g.append('g').attr('class', 'cluster-labels')

    // Update hull paths on each tick
    const updateHulls = () => {
      hullG.selectAll('path').remove()
      if (!showHulls) return

      uniqueClusters.forEach(cid => {
        const clusterNodes = nodes.filter(n => (n.cluster ?? 0) === cid)
        if (clusterNodes.length < hullThreshold) return

        const pts: [number, number][] = clusterNodes.map(n => [n.x!, n.y!])
        const hullPath = computeHullPath(pts, 30) // 30px padding
        if (!hullPath) return

        hullG.append('path')
          .attr('d', hullPath)
          .attr('fill', colorScale(cid))
          .attr('fill-opacity', 0.08)
          .attr('stroke', colorScale(cid))
          .attr('stroke-opacity', 0.2)
          .attr('stroke-width', 1.5)
          .attr('class', `hull-${cid}`)
          .style('cursor', 'pointer')
          .on('click', (event) => {
            event.stopPropagation()
            setFocusedCluster(prev => prev === cid ? null : cid)
          })
          .on('mouseenter', function () {
            d3.select(this)
              .transition().duration(200)
              .attr('fill-opacity', 0.18)
              .attr('stroke-opacity', 0.5)
              .attr('stroke-width', 2.5)
          })
          .on('mouseleave', function () {
            d3.select(this)
              .transition().duration(300)
              .attr('fill-opacity', 0.08)
              .attr('stroke-opacity', 0.2)
              .attr('stroke-width', 1.5)
          })
      })
    }

    // Hull redraw is expensive (rebuilds DOM + recomputes convex hulls), so throttle
    // it to every few ticks instead of every tick — the main cluster-view perf win.
    let tickCount = 0
    simulation.on('tick', () => {
      linkPath.attr('d', d => {
        const s = d.source as SimNode
        const tgt = d.target as SimNode
        const dx = tgt.x! - s.x!
        const dy = tgt.y! - s.y!
        // Gentle arc (large radius = flatter) so links read as thin threads, not bands.
        const dr = Math.sqrt(dx * dx + dy * dy) * 3
        return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${tgt.x},${tgt.y}`
      })

      // Move link labels to edge midpoints
      if (linkLabelText) {
        linkLabelText.attr('transform', d => {
          const s = d.source as SimNode, tgt = d.target as SimNode
          return `translate(${(s.x! + tgt.x!) / 2},${(s.y! + tgt.y!) / 2})`
        })
      }

      node.attr('transform', d => `translate(${d.x},${d.y})`)

      if ((tickCount++ % 6) === 0) updateHulls()
    })

    // After simulation settles, place cluster labels
    const placeClusterLabels = () => {
      clusterLabelG.selectAll('*').remove()
      updateHulls()

      uniqueClusters.forEach(cid => {
        const clusterNodes = nodes.filter(n => (n.cluster ?? 0) === cid)
        if (clusterNodes.length === 0) return
        // For ring layouts use precomputed ring centroid; for force use mean of node positions.
        const ring = ringCentroids.get(cid)
        const labelX = ring ? ring.x : (d3.mean(clusterNodes, n => n.x!) || 0)
        const labelY = ring ? ring.y : (d3.mean(clusterNodes, n => n.y!) || 0)
        const info = data.clusters.find(c => c.id === cid)
        const freqSum = d3.sum(clusterNodes, n => n.frequency) || 0
        const grp = clusterLabelG.append('g')
          .attr('class', `cluster-label cluster-label-${cid}`)
          .attr('data-cluster', cid)
        grp.append('text')
          .attr('x', labelX)
          .attr('y', labelY - 25)
          .attr('text-anchor', 'middle')
          .attr('font-size', clusterLabelFontSize)
          .attr('font-weight', 'bold')
          .attr('fill', colorScale(cid))
          .attr('opacity', 0.85)
          .text(`#${cid}: ${info?.label || ''}`.slice(0, clusterLabelMaxLength))
        grp.append('text')
          .attr('class', 'cluster-freq')
          .attr('x', labelX)
          .attr('y', labelY - 11)
          .attr('text-anchor', 'middle')
          .attr('font-size', 10)
          .attr('fill', colorScale(cid))
          .attr('opacity', 0)
          .text(`${t('biblio.frequency')}: ${freqSum} · ${clusterNodes.length} ${t('biblio.nodes')}`)
      })
    }
    simulation.on('end', placeClusterLabels)

    // Ring layouts: positions are already fixed; run one tick cycle then trigger end.
    if (layoutMode !== 'force') {
      simulation.alpha(0.05).alphaDecay(0.5)
      // Allow one animation frame to let the SVG render nodes, then finalize labels.
      setTimeout(() => { simulation.stop(); placeClusterLabels() }, 80)
    }

    // Initial zoom
    svg.call(zoom.transform, d3.zoomIdentity.translate(w * 0.05, h * 0.05).scale(0.9))

    return () => { simulation.stop() }
  }, [data, dimensions, colorScheme, isDark, t, showTooltip, showHulls, hullThreshold, termLabelMetric, refLabelMetric, labelThreshold, showFrequency, nodeScale, fontScaleMul, hiddenNodeIds, layoutMode, showLinkLabels, showLinkStrengths, clusterLabelFontSize, clusterLabelMaxLength])

  // Apply focus opacity
  useEffect(() => {
    if (!svgRef.current || !data) return
    const svg = d3.select(svgRef.current)
    if (focusedCluster === null) {
      svg.selectAll('.nodes g').attr('opacity', 1)
      svg.selectAll('.links path').attr('opacity', 1)
      svg.selectAll('.hulls path').attr('fill-opacity', 0.08).attr('stroke-opacity', 0.2)
      // Restore all global cluster labels, hide their frequency sub-labels.
      svg.selectAll('.cluster-label').attr('opacity', 1)
      svg.selectAll('.cluster-freq').attr('opacity', 0)
    } else {
      // Show only the focused cluster's label (with its frequency), dim the rest.
      svg.selectAll<SVGGElement, unknown>('.cluster-label').each(function () {
        const el = d3.select(this)
        const cid = +(el.attr('data-cluster') || -1)
        const isFocused = cid === focusedCluster
        el.attr('opacity', isFocused ? 1 : 0.12)
        el.select('.cluster-freq').attr('opacity', isFocused ? 0.85 : 0)
      })
      svg.selectAll('.nodes g').attr('opacity', (d: any) =>
        (d.cluster ?? 0) === focusedCluster ? 1 : 0.12
      )
      svg.selectAll('.links path').attr('opacity', (d: any) => {
        const s = d.source as SimNode
        const tgt = d.target as SimNode
        return ((s.cluster ?? 0) === focusedCluster && (tgt.cluster ?? 0) === focusedCluster) ? 1 : 0.05
      })
      // Highlight focused hull, dim others
      svg.selectAll('.hulls path').each(function () {
        const el = d3.select(this)
        const cls = el.attr('class') || ''
        const isFocused = cls === `hull-${focusedCluster}`
        el.transition().duration(300)
          .attr('fill-opacity', isFocused ? 0.2 : 0.03)
          .attr('stroke-opacity', isFocused ? 0.6 : 0.05)
          .attr('stroke-width', isFocused ? 3 : 1)
      })
    }
  }, [focusedCluster, data])

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
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: 'block' }} />

      {/* Modularity & Silhouette metrics */}
      <Box
        sx={{
          position: 'absolute', top: 8, right: 8, zIndex: 1,
          bgcolor: isDark ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)',
          p: 1.2, borderRadius: 1, fontSize: 11, color: 'text.secondary'
        }}
      >
        <div>{t('biblio.modularity')}: {data.modularity.toFixed(4)}</div>
        <div>{t('biblio.silhouette')}: {data.silhouette.toFixed(4)}</div>
        <div>{t('biblio.nodes')}: {data.nodes.length}</div>
        <div>{t('biblio.clusters')}: {data.clusters.length}</div>
      </Box>

      {/* Tooltip */}
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

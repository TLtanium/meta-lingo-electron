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
  hullThreshold = 2
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

    const nodes: SimNode[] = data.nodes.map(n => ({ ...n }))
    const links: SimLink[] = data.edges.map(e => ({ source: e.source, target: e.target, weight: e.weight }))

    const uniqueClusters = [...new Set(nodes.map(n => n.cluster ?? 0))]
    const palette = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const colorScale = d3.scaleOrdinal<number, string>()
      .domain(uniqueClusters)
      .range(palette)

    // Cluster center positions for forces
    const clusterCenters: Record<number, { x: number; y: number }> = {}
    uniqueClusters.forEach((cid, i) => {
      const angle = (2 * Math.PI * i) / uniqueClusters.length
      const r = Math.min(w, h) * 0.25
      clusterCenters[cid] = { x: w / 2 + r * Math.cos(angle), y: h / 2 + r * Math.sin(angle) }
    })

    const sizeScale = d3.scaleSqrt()
      .domain([0, d3.max(nodes, d => d.frequency) || 1])
      .range([4, 22])

    const edgeScale = d3.scaleLinear()
      .domain([1, d3.max(links, d => d.weight) || 1])
      .range([0.5, 4])

    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(100).strength(d => Math.min(0.4, d.weight / 20)))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('clusterX', d3.forceX<SimNode>(d => clusterCenters[d.cluster ?? 0]?.x ?? w / 2).strength(0.15))
      .force('clusterY', d3.forceY<SimNode>(d => clusterCenters[d.cluster ?? 0]?.y ?? h / 2).strength(0.15))
      .force('collision', d3.forceCollide<SimNode>().radius(d => sizeScale(d.frequency) + 6))

    // ---- Hull background layer (rendered at bottom) ----
    const hullG = g.append('g').attr('class', 'hulls')

    // Curved links
    const linkG = g.append('g').attr('class', 'links')
    const linkPath = linkG.selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', isDark ? 'rgba(150,150,150,0.3)' : 'rgba(100,100,100,0.25)')
      .attr('stroke-width', d => edgeScale(d.weight))

    // Nodes
    const nodeG = g.append('g').attr('class', 'nodes')
    const node = nodeG.selectAll('g')
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
          event.subject.fx = null
          event.subject.fy = null
        })
      )

    // Node circles with glow for high-centrality
    node.append('circle')
      .attr('r', d => Math.max(4, sizeScale(d.frequency)))
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

    // Node labels
    node.append('text')
      .text(d => d.label.length > 15 ? d.label.substring(0, 15) + '...' : d.label)
      .attr('font-size', 10)
      .attr('dx', d => Math.max(4, sizeScale(d.frequency)) + 3)
      .attr('dy', 3)
      .attr('fill', isDark ? '#ddd' : '#222')
      .attr('font-weight', '500')

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

    simulation.on('tick', () => {
      linkPath.attr('d', d => {
        const s = d.source as SimNode
        const tgt = d.target as SimNode
        const dx = tgt.x! - s.x!
        const dy = tgt.y! - s.y!
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.5
        return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${tgt.x},${tgt.y}`
      })

      node.attr('transform', d => `translate(${d.x},${d.y})`)

      // Update hulls every few ticks for performance
      updateHulls()
    })

    // After simulation settles, place cluster labels
    simulation.on('end', () => {
      clusterLabelG.selectAll('*').remove()
      updateHulls()

      uniqueClusters.forEach(cid => {
        const clusterNodes = nodes.filter(n => (n.cluster ?? 0) === cid)
        if (clusterNodes.length === 0) return
        const cx = d3.mean(clusterNodes, n => n.x!) || 0
        const cy = d3.mean(clusterNodes, n => n.y!) || 0
        const info = data.clusters.find(c => c.id === cid)
        clusterLabelG.append('text')
          .attr('x', cx)
          .attr('y', cy - 25)
          .attr('text-anchor', 'middle')
          .attr('font-size', 12)
          .attr('font-weight', 'bold')
          .attr('fill', colorScale(cid))
          .attr('opacity', 0.8)
          .text(`#${cid}: ${info?.label || ''}`.slice(0, 30))
      })
    })

    // Initial zoom
    svg.call(zoom.transform, d3.zoomIdentity.translate(w * 0.05, h * 0.05).scale(0.9))

    return () => { simulation.stop() }
  }, [data, dimensions, colorScheme, isDark, t, showTooltip, showHulls, hullThreshold])

  // Apply focus opacity
  useEffect(() => {
    if (!svgRef.current || !data) return
    const svg = d3.select(svgRef.current)
    if (focusedCluster === null) {
      svg.selectAll('.nodes g').attr('opacity', 1)
      svg.selectAll('.links path').attr('opacity', 1)
      svg.selectAll('.hulls path').attr('fill-opacity', 0.08).attr('stroke-opacity', 0.2)
    } else {
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

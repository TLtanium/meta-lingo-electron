/**
 * Bipartite Chord Diagram for Bibliographic Visualization
 *
 * Two vertical half-arcs (left = Citing Areas, right = Cited Areas) connected
 * by gradient ribbons whose width encodes link weight. Flow animation shows
 * citation direction from cited (right) to citing (left).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { DualMapVisualizationData } from '../../../../types/biblio'

/* ---------- colour palettes ---------- */

const COLOR_PALETTES: Record<string, { citing: string[]; cited: string[] }> = {
  blue: {
    citing: [
      '#64b5f6', '#42a5f5', '#5cc8f0', '#4fc3f7', '#81d4fa',
      '#29b6f6', '#4dd0e1', '#80deea', '#7ec8e3', '#90caf9',
      '#5eb8ff', '#4db8d8', '#6ec6e6', '#78c4ec', '#88ccf4',
      '#52b8e0', '#72caee', '#60bce4', '#82d0f0', '#68c0e8',
    ],
    cited: [
      '#1565c0', '#0d47a1', '#1a237e', '#283593', '#1b3a5c',
      '#0e3a6e', '#194d80', '#1e4976', '#0b3d7a', '#163b6a',
      '#1c4d8c', '#0a2e5c', '#1f3f7e', '#123770', '#0c3268',
      '#1a4888', '#0e3060', '#163c74', '#10346c', '#1e5294',
    ],
  },
  green: {
    citing: [
      '#81c784', '#66bb6a', '#a5d6a7', '#8bc34a', '#aed581',
      '#7cb342', '#9ccc65', '#c5e1a5', '#b2df8a', '#69f0ae',
      '#76d275', '#89c44e', '#98d162', '#83c874', '#a0d988',
      '#6ecf6a', '#94ce58', '#80c96e', '#a8dd90', '#72d370',
    ],
    cited: [
      '#1b5e20', '#2e7d32', '#1a3c1e', '#254d29', '#0d3b12',
      '#1e5128', '#0a4014', '#1c4e24', '#124218', '#163d1c',
      '#20562c', '#0e3810', '#1a4a22', '#143e16', '#183c1e',
      '#224f30', '#103a14', '#1c4826', '#164220', '#204e2a',
    ],
  },
  purple: {
    citing: [
      '#ce93d8', '#ba68c8', '#e1bee7', '#ab47bc', '#ea80fc',
      '#d081e0', '#c476d4', '#e898f0', '#b86fc6', '#dc8ce8',
      '#c884d6', '#d48ee2', '#be78ca', '#e294ee', '#cc80da',
      '#d68ae4', '#c07cce', '#e090ea', '#ca82d8', '#d886e0',
    ],
    cited: [
      '#4a148c', '#311b92', '#38006b', '#2c1470', '#1a0056',
      '#2e1278', '#22105e', '#3a1682', '#240e64', '#301480',
      '#261068', '#3c1886', '#1e0c5a', '#341676', '#28126c',
      '#3e1a88', '#200e60', '#361872', '#2a1470', '#40207e',
    ],
  },
  orange: {
    citing: [
      '#ffb74d', '#ffa726', '#ffcc80', '#ffd54f', '#ffe082',
      '#ffca28', '#ffb830', '#ffc44e', '#ffd060', '#ffbe3a',
      '#ffc046', '#ffd258', '#ffb63c', '#ffce52', '#ffc24a',
      '#ffd45c', '#ffba40', '#ffc84e', '#ffd662', '#ffbc3e',
    ],
    cited: [
      '#bf360c', '#8d3c12', '#a0440a', '#7c3010', '#93380e',
      '#6e2a08', '#84340c', '#a24812', '#723010', '#8a3a0e',
      '#602406', '#7e320a', '#96420e', '#682808', '#88380c',
      '#5c2204', '#763008', '#944010', '#6a2a06', '#8c3c10',
    ],
  },
  red: {
    citing: [
      '#ef9a9a', '#e57373', '#f48fb1', '#f06292', '#ff8a80',
      '#e88080', '#f28888', '#ec7878', '#f69090', '#ea8484',
      '#f08686', '#ee7c7c', '#f49494', '#e67676', '#f88e8e',
      '#e47272', '#f28282', '#f09898', '#e87a7a', '#f68c8c',
    ],
    cited: [
      '#b71c1c', '#880e4f', '#7f0000', '#8e1620', '#6d0012',
      '#7a0a18', '#921a24', '#680010', '#840e1c', '#720816',
      '#881220', '#5e000c', '#7c0c1a', '#961e28', '#6a0612',
      '#8a1422', '#600008', '#7e0e1e', '#741018', '#8c1624',
    ],
  },
  teal: {
    citing: [
      '#80cbc4', '#4db6ac', '#80deea', '#4dd0e1', '#a7ffeb',
      '#64d8cb', '#72dcd0', '#58d4c4', '#84dfd8', '#6adace',
      '#5ed6c8', '#78ded4', '#50d2c0', '#88e2dc', '#66dcd0',
      '#7ce0d6', '#54d4c2', '#86e0da', '#62d8cc', '#70dcd2',
    ],
    cited: [
      '#004d40', '#00695c', '#003830', '#00524a', '#002e26',
      '#004038', '#00362e', '#004a42', '#003c34', '#005650',
      '#002a22', '#004840', '#003228', '#005048', '#003e36',
      '#005452', '#002c24', '#004c44', '#003a32', '#005856',
    ],
  },
  colorful: {
    citing: [
      '#42a5f5', '#66bb6a', '#ce93d8', '#ffb74d', '#ef9a9a',
      '#80cbc4', '#a1887f', '#f48fb1', '#4dd0e1', '#7986cb',
      '#aed581', '#f06292', '#4db6ac', '#bcaaa4', '#90a4ae',
      '#81d4fa', '#a5d6a7', '#e1bee7', '#ffcc80', '#ef5350',
    ],
    cited: [
      '#1565c0', '#2e7d32', '#6a1b9a', '#e65100', '#c62828',
      '#00695c', '#4e342e', '#ad1457', '#00838f', '#283593',
      '#33691e', '#880e4f', '#004d40', '#3e2723', '#37474f',
      '#0d47a1', '#1b5e20', '#4a148c', '#bf360c', '#b71c1c',
    ],
  },
}

/* ---------- types ---------- */

interface BipartiteChordDiagramProps {
  data: DualMapVisualizationData | null
  loading?: boolean
  colorScheme?: string
  /** Half-angle of each arc in degrees. 90 = semicircle (default/max), 30 = minimum */
  arcAngle?: number
}

interface ArcSegment {
  id: string
  label: string
  weight: number
  totalLinkWeight: number
  startAngle: number
  endAngle: number
  color: string
  side: 'citing' | 'cited'
}

interface RibbonDatum {
  sourceId: string
  targetId: string
  weight: number
  sourceStart: number
  sourceEnd: number
  targetStart: number
  targetEnd: number
  sourceColor: string
  targetColor: string
  gradientId: string
}

/* ---------- component ---------- */

export default function BipartiteChordDiagram({
  data,
  loading = false,
  colorScheme = 'blue',
  arcAngle = 90,
}: BipartiteChordDiagramProps) {
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
    let x = event.clientX - rect.left + 12
    let y = event.clientY - rect.top + 12
    if (x + 220 > rect.width) x = event.clientX - rect.left - 220
    if (y + 80 > rect.height) y = event.clientY - rect.top - 80
    setTooltip({ x: Math.max(8, x), y: Math.max(8, y), content })
  }, [])

  /* ---- resize observer ---- */
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

  /* ================ main D3 render ================ */
  useEffect(() => {
    if (!svgRef.current || !data) return

    const hasCiting = data.citing_nodes.length > 0
    const hasCited = data.cited_nodes.length > 0
    if (!hasCiting && !hasCited) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width: w, height: h } = dimensions
    const margin = { top: 50, right: 20, bottom: 20, left: 20 }
    const innerW = w - margin.left - margin.right
    const innerH = h - margin.top - margin.bottom

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(margin.left, margin.top))

    /* ---- prepare nodes (top 20 by weight per side) ---- */
    const citing = [...data.citing_nodes]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20)
    const cited = [...data.cited_nodes]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20)

    const citingIds = new Set(citing.map(n => n.id))
    const citedIds = new Set(cited.map(n => n.id))

    // Filter links to only include visible nodes
    const links = data.links.filter(l => citingIds.has(l.source) && citedIds.has(l.target))

    /* ---- compute total link weight for each node ---- */
    const nodeLinkWeight = new Map<string, number>()
    links.forEach(l => {
      nodeLinkWeight.set(l.source, (nodeLinkWeight.get(l.source) || 0) + l.weight)
      nodeLinkWeight.set(l.target, (nodeLinkWeight.get(l.target) || 0) + l.weight)
    })

    // Ensure every visible node has at least a base weight even without links
    citing.forEach(n => {
      if (!nodeLinkWeight.has(n.id)) nodeLinkWeight.set(n.id, n.weight)
    })
    cited.forEach(n => {
      if (!nodeLinkWeight.has(n.id)) nodeLinkWeight.set(n.id, n.weight)
    })

    /* ---- arc geometry ---- */
    // arcAngle (degrees, 30-90): half-angle of each arc
    // 90 = semicircle (pi), 45 = quarter circle (pi/2)
    const clampedAngle = Math.max(30, Math.min(90, arcAngle))
    const halfAngleRad = clampedAngle * Math.PI / 180
    const totalAngleRange = halfAngleRad * 2

    // Visual height stays constant: R * sin(halfAngle) = targetHalfH
    const targetHalfH = innerH * 0.4
    const arcRadius = targetHalfH / Math.sin(halfAngleRad)
    const arcThickness = Math.max(16, Math.min(arcRadius * 0.08, 28))

    // Horizontal positions adjust: at smaller angles, arcs bulge less, so move centers outward
    const bulgeDist = arcRadius * (1 - Math.cos(halfAngleRad))
    const leftCx = Math.max(bulgeDist + arcThickness + 10, innerW * 0.25)
    const rightCx = Math.min(innerW - bulgeDist - arcThickness - 10, innerW * 0.75)
    const cy = innerH / 2

    const padAngle = 0.02

    const buildSegments = (
      nodes: typeof citing,
      side: 'citing' | 'cited',
      colors: string[]
    ): ArcSegment[] => {
      const totalWeight = nodes.reduce((sum, n) => sum + (nodeLinkWeight.get(n.id) || 1), 0)
      const usableAngle = totalAngleRange - padAngle * nodes.length
      let currentAngle = -halfAngleRad // start from top

      return nodes.map((n, i) => {
        const nodeWeight = nodeLinkWeight.get(n.id) || 1
        const span = (nodeWeight / totalWeight) * usableAngle
        const seg: ArcSegment = {
          id: n.id,
          label: n.label,
          weight: n.weight,
          totalLinkWeight: nodeWeight,
          startAngle: currentAngle,
          endAngle: currentAngle + span,
          color: colors[i % colors.length],
          side
        }
        currentAngle += span + padAngle
        return seg
      })
    }

    const palette = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const citingColors = palette.citing
    const citedColors = palette.cited

    const citingSegments = buildSegments(citing, 'citing', citingColors)
    const citedSegments = buildSegments(cited, 'cited', citedColors)

    const segmentMap = new Map<string, ArcSegment>()
    citingSegments.forEach(s => segmentMap.set(s.id, s))
    citedSegments.forEach(s => segmentMap.set(s.id, s))

    /* ---- helper: convert parametric angle to SVG coordinates ---- */
    const leftArcPoint = (theta: number, rOffset = 0) => ({
      x: leftCx - (arcRadius + rOffset) * Math.cos(theta),
      y: cy + (arcRadius + rOffset) * Math.sin(theta)
    })

    const rightArcPoint = (theta: number, rOffset = 0) => ({
      x: rightCx + (arcRadius + rOffset) * Math.cos(theta),
      y: cy + (arcRadius + rOffset) * Math.sin(theta)
    })

    const arcPointFn = (side: 'citing' | 'cited', theta: number, rOffset = 0) =>
      side === 'citing' ? leftArcPoint(theta, rOffset) : rightArcPoint(theta, rOffset)

    /* ---- draw arc segment paths ---- */
    const drawArcPath = (seg: ArcSegment): string => {
      // We draw each segment as a thick arc (annular sector)
      const steps = 32
      const outerPoints: string[] = []
      const innerPoints: string[] = []

      for (let i = 0; i <= steps; i++) {
        const theta = seg.startAngle + (seg.endAngle - seg.startAngle) * (i / steps)
        const outer = arcPointFn(seg.side, theta, arcThickness / 2)
        const inner = arcPointFn(seg.side, theta, -arcThickness / 2)
        outerPoints.push(`${outer.x},${outer.y}`)
        innerPoints.push(`${inner.x},${inner.y}`)
      }

      // Build path: outer arc forward, then inner arc backward
      const pathParts = [`M${outerPoints[0]}`]
      for (let i = 1; i < outerPoints.length; i++) {
        pathParts.push(`L${outerPoints[i]}`)
      }
      // Close to inner arc (reversed)
      for (let i = innerPoints.length - 1; i >= 0; i--) {
        pathParts.push(`L${innerPoints[i]}`)
      }
      pathParts.push('Z')
      return pathParts.join(' ')
    }

    /* ---- build ribbons ---- */
    // For each segment, track how much angular span has been consumed by ribbons
    const segmentOffset = new Map<string, number>()
    citingSegments.forEach(s => segmentOffset.set(s.id, s.startAngle))
    citedSegments.forEach(s => segmentOffset.set(s.id, s.startAngle))

    // Sort links by weight descending for consistent rendering
    const sortedLinks = [...links].sort((a, b) => b.weight - a.weight)

    const ribbons: RibbonDatum[] = []

    sortedLinks.forEach((link, idx) => {
      const srcSeg = segmentMap.get(link.source)
      const tgtSeg = segmentMap.get(link.target)
      if (!srcSeg || !tgtSeg) return

      const srcSpan = (srcSeg.endAngle - srcSeg.startAngle)
      const tgtSpan = (tgtSeg.endAngle - tgtSeg.startAngle)

      const srcPortion = srcSeg.totalLinkWeight > 0
        ? (link.weight / srcSeg.totalLinkWeight) * srcSpan
        : 0
      const tgtPortion = tgtSeg.totalLinkWeight > 0
        ? (link.weight / tgtSeg.totalLinkWeight) * tgtSpan
        : 0

      const srcStart = segmentOffset.get(link.source) || srcSeg.startAngle
      const tgtStart = segmentOffset.get(link.target) || tgtSeg.startAngle

      segmentOffset.set(link.source, srcStart + srcPortion)
      segmentOffset.set(link.target, tgtStart + tgtPortion)

      ribbons.push({
        sourceId: link.source,
        targetId: link.target,
        weight: link.weight,
        sourceStart: srcStart,
        sourceEnd: srcStart + srcPortion,
        targetStart: tgtStart,
        targetEnd: tgtStart + tgtPortion,
        sourceColor: srcSeg.color,
        targetColor: tgtSeg.color,
        gradientId: `ribbon-grad-${idx}`
      })
    })

    /* ---- build ribbon path ---- */
    const buildRibbonPath = (r: RibbonDatum): string => {
      // Source side (citing = left arc)
      const srcA1 = arcPointFn('citing', r.sourceStart)
      const srcA2 = arcPointFn('citing', r.sourceEnd)
      // Target side (cited = right arc)
      const tgtA1 = arcPointFn('cited', r.targetStart)
      const tgtA2 = arcPointFn('cited', r.targetEnd)

      // Control point X for Bezier: midpoint between arcs
      const cpx = (leftCx + rightCx) / 2

      // Path: from srcA1, bezier to tgtA1, line along tgt arc to tgtA2, bezier back to srcA2, close
      return [
        `M${srcA1.x},${srcA1.y}`,
        `C${cpx},${srcA1.y} ${cpx},${tgtA1.y} ${tgtA1.x},${tgtA1.y}`,
        // Approximate the target arc edge as a line (segments are small)
        `L${tgtA2.x},${tgtA2.y}`,
        `C${cpx},${tgtA2.y} ${cpx},${srcA2.y} ${srcA2.x},${srcA2.y}`,
        'Z'
      ].join(' ')
    }

    /* ---- defs: gradients ---- */
    const defs = g.append('defs')

    ribbons.forEach(r => {
      const grad = defs.append('linearGradient')
        .attr('id', r.gradientId)
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '100%').attr('y2', '0%')

      grad.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', r.sourceColor)

      grad.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', r.targetColor)
    })

    /* ---- selection state ---- */
    let selectedNodeId: string | null = null
    let hoveredNodeId: string | null = null

    const updateSelection = () => {
      const activeId = hoveredNodeId ?? selectedNodeId

      // Arc segments
      g.selectAll('.arc-segment')
        .attr('opacity', function () {
          if (!activeId) return 0.85
          const nodeId = d3.select(this).attr('data-node-id')
          if (nodeId === activeId) return 1
          const isConnected = links.some(l =>
            (l.source === activeId && l.target === nodeId) ||
            (l.target === activeId && l.source === nodeId)
          )
          return isConnected ? 0.85 : 0.2
        })

      // Ribbons
      g.selectAll('.ribbon')
        .attr('fill-opacity', function () {
          if (!activeId) return 0.3
          const src = d3.select(this).attr('data-source')
          const tgt = d3.select(this).attr('data-target')
          if (src === activeId || tgt === activeId) return 0.6
          return 0.05
        })

      // Labels
      g.selectAll('.arc-label')
        .attr('opacity', function () {
          if (!activeId) return 1
          const nodeId = d3.select(this).attr('data-node-id')
          if (nodeId === activeId) return 1
          const isConnected = links.some(l =>
            (l.source === activeId && l.target === nodeId) ||
            (l.target === activeId && l.source === nodeId)
          )
          return isConnected ? 1 : 0.2
        })
    }

    /* ---- draw ribbons ---- */
    const ribbonG = g.append('g').attr('class', 'ribbons')

    ribbonG.selectAll('path')
      .data(ribbons)
      .join('path')
      .attr('class', 'ribbon')
      .attr('data-source', d => d.sourceId)
      .attr('data-target', d => d.targetId)
      .attr('d', d => buildRibbonPath(d))
      .attr('fill', d => `url(#${d.gradientId})`)
      .attr('fill-opacity', 0.3)
      .attr('stroke', 'none')

    /* ---- flow animation on ribbons ---- */
    // Add a thin animated stroke on each ribbon to simulate flowing dots
    ribbonG.selectAll('path.ribbon-flow')
      .data(ribbons)
      .join('path')
      .attr('class', 'ribbon-flow')
      .attr('d', d => {
        // Single center-line path for flow effect (not the full ribbon)
        const srcMid = arcPointFn('citing', (d.sourceStart + d.sourceEnd) / 2)
        const tgtMid = arcPointFn('cited', (d.targetStart + d.targetEnd) / 2)
        const cpx = (leftCx + rightCx) / 2
        return `M${tgtMid.x},${tgtMid.y} C${cpx},${tgtMid.y} ${cpx},${srcMid.y} ${srcMid.x},${srcMid.y}`
      })
      .attr('fill', 'none')
      .attr('stroke', isDark ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)')
      .attr('stroke-width', 1.5)
      .attr('stroke-linecap', 'round')
      .attr('pointer-events', 'none')
      .each(function () {
        const el = d3.select(this)
        const pathEl = this as SVGPathElement
        const totalLen = pathEl.getTotalLength?.() || 200
        const dotLen = Math.max(6, totalLen * 0.04)
        const gapLen = totalLen - dotLen

        el.attr('stroke-dasharray', `${dotLen} ${gapLen}`)
          .attr('stroke-dashoffset', totalLen)

        const animate = () => {
          el.transition()
            .duration(2500 + Math.random() * 1500)
            .ease(d3.easeLinear)
            .attr('stroke-dashoffset', 0)
            .transition()
            .duration(0)
            .attr('stroke-dashoffset', totalLen)
            .on('end', animate)
        }
        animate()
      })

    /* ---- draw arc segments ---- */
    const arcG = g.append('g').attr('class', 'arcs')

    const allSegments = [...citingSegments, ...citedSegments]

    arcG.selectAll('path')
      .data(allSegments)
      .join('path')
      .attr('class', 'arc-segment')
      .attr('data-node-id', d => d.id)
      .attr('d', d => drawArcPath(d))
      .attr('fill', d => d.color)
      .attr('opacity', 0.85)
      .attr('stroke', isDark ? '#222' : '#fff')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        selectedNodeId = selectedNodeId === d.id ? null : d.id
        updateSelection()

        if (selectedNodeId) {
          // Build tooltip content with citation statistics
          const connectedLinks = links.filter(l => l.source === d.id || l.target === d.id)
          const totalCitations = connectedLinks.reduce((sum, l) => sum + l.weight, 0)
          const partners = connectedLinks.map(l => {
            const partnerId = l.source === d.id ? l.target : l.source
            const partnerSeg = segmentMap.get(partnerId)
            return `  ${partnerSeg?.label || partnerId}: ${l.weight}`
          }).join('\n')
          const sideLabel = d.side === 'citing' ? t('biblio.citingJournals') : t('biblio.citedJournals')
          const content = `${d.label}\n${sideLabel}\nTotal weight: ${d.weight}\nLink weight: ${totalCitations}\nConnections: ${connectedLinks.length}\n${partners}`
          showTooltip(event as unknown as MouseEvent, content)
        } else {
          setTooltip(null)
        }
      })
      .on('mouseenter', (event, d) => {
        if (selectedNodeId) return
        hoveredNodeId = d.id
        updateSelection()
        const connectedLinks = links.filter(l => l.source === d.id || l.target === d.id)
        const totalCitations = connectedLinks.reduce((sum, l) => sum + l.weight, 0)
        const sideLabel = d.side === 'citing' ? t('biblio.citingJournals') : t('biblio.citedJournals')
        const content = `${d.label}\n${sideLabel}\nWeight: ${d.weight}\nLink weight: ${totalCitations}\nConnections: ${connectedLinks.length}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mouseleave', () => {
        if (selectedNodeId) return
        hoveredNodeId = null
        updateSelection()
        setTooltip(null)
      })

    /* ---- labels ---- */
    const labelG = g.append('g').attr('class', 'labels')

    // Scale label thresholds relative to arc angle (0.06 for semicircle = pi)
    const labelMinSpan = 0.06 * (totalAngleRange / Math.PI)
    const labelLargeSpan = 0.15 * (totalAngleRange / Math.PI)

    // Label collision detection — track placed label positions
    const placedLabelBoxes: { x: number; y: number; w: number; h: number }[] = []
    const labelFontSize = (span: number) => span > labelLargeSpan ? 10 : 8

    const placeLabel = (seg: ArcSegment, pt: { x: number; y: number }, anchor: 'start' | 'end') => {
      const span = seg.endAngle - seg.startAngle
      if (span < labelMinSpan) return

      const fontSize = labelFontSize(span)
      const truncLabel = seg.label.length > 22 ? seg.label.slice(0, 22) + '..' : seg.label
      const approxW = truncLabel.length * (fontSize * 0.6)
      const approxH = fontSize + 2
      const boxX = anchor === 'end' ? pt.x - approxW : pt.x
      const box = { x: boxX, y: pt.y - approxH / 2, w: approxW, h: approxH }

      // Check overlap with placed labels
      const overlaps = placedLabelBoxes.some(pb =>
        box.x < pb.x + pb.w && box.x + box.w > pb.x &&
        box.y < pb.y + pb.h && box.y + box.h > pb.y
      )
      if (overlaps) return

      placedLabelBoxes.push(box)
      labelG.append('text')
        .attr('class', 'arc-label')
        .attr('data-node-id', seg.id)
        .attr('x', pt.x)
        .attr('y', pt.y)
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', fontSize)
        .attr('fill', isDark ? '#ccc' : '#333')
        .text(truncLabel)
    }

    // Citing labels (left side)
    citingSegments.forEach(seg => {
      const midAngle = (seg.startAngle + seg.endAngle) / 2
      const pt = leftArcPoint(midAngle, arcThickness / 2 + 6)
      placeLabel(seg, pt, 'end')
    })

    // Cited labels (right side)
    citedSegments.forEach(seg => {
      const midAngle = (seg.startAngle + seg.endAngle) / 2
      const pt = rightArcPoint(midAngle, arcThickness / 2 + 6)
      placeLabel(seg, pt, 'start')
    })

    /* ---- headers ---- */
    g.append('text')
      .attr('x', leftCx)
      .attr('y', cy - arcRadius - arcThickness / 2 - 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', 14)
      .attr('font-weight', 'bold')
      .attr('fill', isDark ? '#aaa' : '#444')
      .text(t('biblio.citingJournals'))

    g.append('text')
      .attr('x', rightCx)
      .attr('y', cy - arcRadius - arcThickness / 2 - 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', 14)
      .attr('font-weight', 'bold')
      .attr('fill', isDark ? '#aaa' : '#444')
      .text(t('biblio.citedJournals'))

    /* ---- click background to deselect ---- */
    svg.on('click', () => {
      selectedNodeId = null
      updateSelection()
      setTooltip(null)
    })

  }, [data, dimensions, isDark, t, showTooltip, colorScheme, arcAngle])

  /* ================ render guards ================ */

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!data || (data.citing_nodes.length === 0 && data.cited_nodes.length === 0)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <Typography color="text.secondary">{t('biblio.noData')}</Typography>
      </Box>
    )
  }

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: 'block' }} />
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

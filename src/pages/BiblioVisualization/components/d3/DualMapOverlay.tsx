/**
 * Dual-Map Overlay for Bibliographic Visualization
 *
 * CiteSpace-style bipartite layout showing citing (left) and cited (right)
 * journals with curved flow links between them.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { DualMapVisualizationData, DualMapNode } from '../../../../types/biblio'

const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#42a5f5', '#1976d2', '#1565c0', '#0d47a1', '#0277bd', '#01579b'],
  green: ['#66bb6a', '#388e3c', '#2e7d32', '#1b5e20', '#2e7d32', '#0d4f1c'],
  purple: ['#ab47bc', '#7b1fa2', '#6a1b9a', '#4a148c', '#6a1b9a', '#38006b'],
  orange: ['#ffa726', '#f57c00', '#ef6c00', '#e65100', '#ef6c00', '#bf360c'],
  red: ['#ef5350', '#d32f2f', '#c62828', '#b71c1c', '#c62828', '#8e0000'],
  teal: ['#26a69a', '#00796b', '#00695c', '#004d40', '#00695c', '#00251a']
}

interface DualMapOverlayProps {
  data: DualMapVisualizationData | null
  loading?: boolean
  colorScheme?: string
}

export default function DualMapOverlay({
  data,
  loading = false,
  colorScheme = 'blue'
}: DualMapOverlayProps) {
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
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!svgRef.current || !data) return

    const hasCiting = data.citing_nodes.length > 0
    const hasCited = data.cited_nodes.length > 0
    if (!hasCiting && !hasCited) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width: w, height: h } = dimensions
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const margin = { top: 40, right: 30, bottom: 20, left: 30 }
    const innerW = w - margin.left - margin.right
    const innerH = h - margin.top - margin.bottom
    const midX = innerW / 2
    const colWidth = innerW * 0.15 // width of node rectangles
    const leftX = innerW * 0.15   // left column center
    const rightX = innerW * 0.85  // right column center

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Add zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(margin.left, margin.top))

    // Sort nodes by weight
    const citing = [...data.citing_nodes].sort((a, b) => b.weight - a.weight).slice(0, 25)
    const cited = [...data.cited_nodes].sort((a, b) => b.weight - a.weight).slice(0, 25)

    const maxWeight = Math.max(
      d3.max(citing, d => d.weight) || 1,
      d3.max(cited, d => d.weight) || 1
    )

    const heightScale = d3.scaleLinear()
      .domain([0, maxWeight])
      .range([8, 40])

    // Position nodes vertically
    const positionNodes = (nodes: DualMapNode[], xCenter: number) => {
      let yOffset = 0
      return nodes.map(n => {
        const nodeH = heightScale(n.weight)
        const pos = { ...n, nx: xCenter - colWidth / 2, ny: yOffset, nw: colWidth, nh: nodeH }
        yOffset += nodeH + 3
        return pos
      })
    }

    const citingPos = positionNodes(citing, leftX)
    const citedPos = positionNodes(cited, rightX)

    // Build node position map for link rendering
    const nodePositions = new Map<string, { cx: number; cy: number }>()
    citingPos.forEach(n => nodePositions.set(n.id, { cx: n.nx + n.nw, cy: n.ny + n.nh / 2 }))
    citedPos.forEach(n => nodePositions.set(n.id, { cx: n.nx, cy: n.ny + n.nh / 2 }))

    // Headers
    g.append('text')
      .attr('x', leftX)
      .attr('y', -15)
      .attr('text-anchor', 'middle')
      .attr('font-size', 13)
      .attr('font-weight', 'bold')
      .attr('fill', colors[1])
      .text(t('biblio.citingJournals'))

    g.append('text')
      .attr('x', rightX)
      .attr('y', -15)
      .attr('text-anchor', 'middle')
      .attr('font-size', 13)
      .attr('font-weight', 'bold')
      .attr('fill', colors[3])
      .text(t('biblio.citedJournals'))

    // Center divider
    g.append('line')
      .attr('x1', midX).attr('x2', midX)
      .attr('y1', -5).attr('y2', innerH)
      .attr('stroke', isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')
      .attr('stroke-dasharray', '4,4')

    // Draw links (curved Bezier)
    const linkWeightScale = d3.scaleLinear()
      .domain([1, d3.max(data.links, d => d.weight) || 1])
      .range([1, 6])

    // Animated flow links
    g.append('g').attr('class', 'links')
      .selectAll('path')
      .data(data.links)
      .join('path')
      .attr('d', d => {
        const s = nodePositions.get(d.source)
        const t = nodePositions.get(d.target)
        if (!s || !t) return ''
        const cpx1 = s.cx + (t.cx - s.cx) * 0.35
        const cpx2 = s.cx + (t.cx - s.cx) * 0.65
        return `M${s.cx},${s.cy} C${cpx1},${s.cy} ${cpx2},${t.cy} ${t.cx},${t.cy}`
      })
      .attr('fill', 'none')
      .attr('stroke', colors[0])
      .attr('stroke-opacity', 0.25)
      .attr('stroke-width', d => linkWeightScale(d.weight))
      .attr('stroke-dasharray', '8 4')
      .each(function () {
        const el = d3.select(this)
        const totalLen = (this as SVGPathElement).getTotalLength?.() || 100
        el.attr('stroke-dasharray', `${totalLen * 0.3} ${totalLen * 0.7}`)
          .attr('stroke-dashoffset', totalLen)
        const animate = () => {
          el.transition().duration(3000).ease(d3.easeLinear)
            .attr('stroke-dashoffset', 0)
            .transition().duration(0)
            .attr('stroke-dashoffset', totalLen)
            .on('end', animate)
        }
        animate()
      })

    // Draw citing nodes (left)
    const citingG = g.append('g').attr('class', 'citing')
    citingG.selectAll('rect')
      .data(citingPos)
      .join('rect')
      .attr('x', d => d.nx)
      .attr('y', d => d.ny)
      .attr('width', d => d.nw)
      .attr('height', d => d.nh)
      .attr('fill', colors[1])
      .attr('opacity', 0.8)
      .attr('rx', 3)
      .on('mouseenter', (event, d) => {
        showTooltip(event as unknown as MouseEvent, `${d.label}\n${t('biblio.citingJournals')}\nWeight: ${d.weight}`)
        // Highlight connected links
        g.selectAll('.links path').attr('stroke-opacity', (l: any) =>
          l.source === d.id ? 0.7 : 0.08
        )
      })
      .on('mouseleave', () => {
        setTooltip(null)
        g.selectAll('.links path').attr('stroke-opacity', 0.25)
      })

    citingG.selectAll('text')
      .data(citingPos)
      .join('text')
      .attr('x', d => d.nx - 4)
      .attr('y', d => d.ny + d.nh / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 9)
      .attr('fill', isDark ? '#ccc' : '#333')
      .text(d => d.label.length > 20 ? d.label.slice(0, 20) + '..' : d.label)

    // Draw cited nodes (right)
    const citedG = g.append('g').attr('class', 'cited')
    citedG.selectAll('rect')
      .data(citedPos)
      .join('rect')
      .attr('x', d => d.nx)
      .attr('y', d => d.ny)
      .attr('width', d => d.nw)
      .attr('height', d => d.nh)
      .attr('fill', colors[3])
      .attr('opacity', 0.8)
      .attr('rx', 3)
      .on('mouseenter', (event, d) => {
        showTooltip(event as unknown as MouseEvent, `${d.label}\n${t('biblio.citedJournals')}\nWeight: ${d.weight}`)
        g.selectAll('.links path').attr('stroke-opacity', (l: any) =>
          l.target === d.id ? 0.7 : 0.08
        )
      })
      .on('mouseleave', () => {
        setTooltip(null)
        g.selectAll('.links path').attr('stroke-opacity', 0.25)
      })

    citedG.selectAll('text')
      .data(citedPos)
      .join('text')
      .attr('x', d => d.nx + d.nw + 4)
      .attr('y', d => d.ny + d.nh / 2)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 9)
      .attr('fill', isDark ? '#ccc' : '#333')
      .text(d => d.label.length > 20 ? d.label.slice(0, 20) + '..' : d.label)

  }, [data, dimensions, colorScheme, isDark, t, showTooltip])

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
            maxWidth: 200, boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {tooltip.content}
        </Box>
      )}
    </Box>
  )
}

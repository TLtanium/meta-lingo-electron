/**
 * D3.js Network Graph for Bibliographic Visualization
 * 
 * Force-directed graph for co-authorship, co-institution, keyword co-occurrence, etc.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { NetworkVisualizationData, NetworkNode, NetworkEdge } from '../../../../types/biblio'
import { addTagBackgrounds } from './shared/labelTags'

// Color palettes for different schemes - using deeper, more visible colors
const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#1976d2', '#1565c0', '#0d47a1', '#0277bd', '#01579b', '#004c8c'],
  green: ['#388e3c', '#2e7d32', '#1b5e20', '#2e7d32', '#1b5e20', '#0d4f1c'],
  purple: ['#7b1fa2', '#6a1b9a', '#4a148c', '#6a1b9a', '#4a148c', '#38006b'],
  orange: ['#f57c00', '#ef6c00', '#e65100', '#ef6c00', '#e65100', '#bf360c'],
  red: ['#d32f2f', '#c62828', '#b71c1c', '#c62828', '#b71c1c', '#8e0000'],
  teal: ['#00796b', '#00695c', '#004d40', '#00695c', '#004d40', '#00251a'],
  colorful: ['#1976d2', '#388e3c', '#7b1fa2', '#f57c00', '#d32f2f', '#00796b']
}

interface NetworkGraphProps {
  data: NetworkVisualizationData | null
  loading?: boolean
  title?: string
  colorScheme?: string
  width?: number
  height?: number
  /** Node ids toggled off via the data table — hidden from the canvas. */
  hiddenNodeIds?: Set<string>
  /** Node-size multiplier (CiteSpace "Node Size"). */
  nodeScale?: number
  /** Label font-size multiplier (CiteSpace "Font Size"). */
  fontScaleMul?: number
}

interface SimulationNode extends NetworkNode, d3.SimulationNodeDatum {}
interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
  weight: number
}

export default function NetworkGraph({
  data,
  loading = false,
  title,
  colorScheme = 'blue',
  width = 800,
  height = 600,
  hiddenNodeIds,
  nodeScale = 1,
  fontScaleMul = 1
}: NetworkGraphProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Start at 0×0 so we never build the graph at the wrong (default) size and then
  // rebuild — that double build is what made the first open janky.
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  const [focusedCluster, setFocusedCluster] = useState<number | null>(null)

  // While a node is being dragged, tooltips are suppressed: the pointer stays on
  // the node so mousemove would fire a React setState per frame, fighting the
  // running force simulation for the main thread (visible jank after selecting).
  const draggingRef = useRef(false)
  const tooltipRafRef = useRef(0)

  // Smart tooltip positioning to avoid overflow — rAF-throttled so rapid
  // mousemove collapses to at most one state update per frame.
  const showTooltip = useCallback((event: MouseEvent, content: string) => {
    if (draggingRef.current) return
    const { clientX, clientY } = event
    window.cancelAnimationFrame(tooltipRafRef.current)
    tooltipRafRef.current = window.requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      let x = clientX - containerRect.left + 12
      let y = clientY - containerRect.top + 12

      const tooltipWidth = 200
      const tooltipHeight = 80

      if (x + tooltipWidth > containerRect.width) {
        x = clientX - containerRect.left - tooltipWidth - 12
      }
      if (y + tooltipHeight > containerRect.height) {
        y = clientY - containerRect.top - tooltipHeight - 12
      }

      x = Math.max(8, x)
      y = Math.max(8, y)

      setTooltip({ x, y, content })
    })
  }, [])
  
  // Measure the container (ResizeObserver, debounced) so the graph is built exactly once
  // at the real size. Sub-threshold jitter is ignored to avoid needless rebuilds.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const apply = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const nw = rect.width || width
      const nh = rect.height || height
      setDimensions(prev => (Math.abs(nw - prev.width) < 4 && Math.abs(nh - prev.height) < 4)
        ? prev : { width: nw, height: nh })
    }
    apply()
    const obs = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(apply, 160)
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => { obs.disconnect(); if (timer) clearTimeout(timer) }
  }, [width, height])
  
  // Render graph
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (!data || data.nodes.length === 0) return

    // Defer heavy D3 DOM work by one animation frame so the cleared container is painted
    // first — eliminates the "freeze then pop" jank on first-open of the viz tab.
    let sim: d3.Simulation<SimulationNode, undefined> | null = null
    const rafId = window.requestAnimationFrame(() => {
    if (!svgRef.current) return
    const { width: w, height: h } = dimensions
    
    // Create container group with zoom
    const g = svg.append('g')
    
    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    
    svg.call(zoom)

    // Click background to clear focus
    svg.on('click', () => setFocusedCluster(null))

    // Prepare data (respect data-table visibility: drop hidden nodes + their edges)
    const visibleNodes = hiddenNodeIds && hiddenNodeIds.size
      ? data.nodes.filter(n => !hiddenNodeIds.has(n.id))
      : data.nodes
    const visibleIds = new Set(visibleNodes.map(n => n.id))
    const nodes: SimulationNode[] = visibleNodes.map(n => ({ ...n }))
    const links: SimulationLink[] = data.edges
      .filter(e => visibleIds.has(e.source as string) && visibleIds.has(e.target as string))
      .map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight
      }))
    
    // Get colors from scheme
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    
    // Color scale based on cluster - use deeper colors from palette
    const uniqueClusters = [...new Set(nodes.map(n => n.cluster ?? 0))]
    // Use colors starting from index 1 (skip the lightest) for better visibility
    const nodeColors = colors.length > 1 ? colors.slice(1) : colors
    const colorScale = d3.scaleOrdinal<number, string>()
      .domain(uniqueClusters)
      .range(nodeColors.length > 0 ? nodeColors : colors)
    
    // Node size scale (wider range = stronger contrast); nodeScale is the Node Size slider.
    const sizeScale = d3.scaleSqrt()
      .domain([1, d3.max(nodes, d => d.frequency) || 1])
      .range([4, 36])
    const rOf = (d: SimulationNode) => Math.max(3, sizeScale(d.frequency) * nodeScale)
    const maxNodeFreq = d3.max(nodes, d => d.frequency) || 1
    // Power curve gives top-frequency nodes dramatically larger labels than mid-range
    const fontOf = (d: SimulationNode) => {
      const norm = Math.max(0, d.frequency) / maxNodeFreq
      return Math.max(9, Math.min(36, 9 + Math.pow(norm, 0.6) * 27)) * fontScaleMul
    }
    const labelColor = (d: SimulationNode) => {
      const c = d3.color(colorScale(d.cluster ?? 0))
      return c ? (isDarkMode ? c.brighter(1.3) : c.darker(1.2)).toString() : (isDarkMode ? '#f0f0f0' : '#1a1a1a')
    }

    // Edge width scale
    const edgeScale = d3.scaleLinear()
      .domain([1, d3.max(links, d => d.weight) || 1])
      .range([1, 5])
    
    // Create simulation with more spread out layout.
    // alphaDecay/velocityDecay raised so the layout settles fast and stops (perf).
    const simulation = d3.forceSimulation<SimulationNode>(nodes)
      .alphaDecay(0.038)
      .velocityDecay(0.42)
      .force('link', d3.forceLink<SimulationNode, SimulationLink>(links)
        .id(d => d.id)
        .distance(280)
        .strength(d => Math.min(0.18, d.weight / 55))
      )
      .force('charge', d3.forceManyBody().strength(-1400).theta(0.9).distanceMax(Math.max(w, h)))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide<SimulationNode>().radius(d => rOf(d) * 0.85 + 6))
    sim = simulation

    // Label level-of-detail: only the most frequent nodes get a text label, so a
    // dense network doesn't pay for hundreds of <text> nodes.
    const sortedFreq = nodes.map(n => n.frequency).sort((a, b) => b - a)
    const labelCutoff = sortedFreq.length > 40 ? sortedFreq[40] : 0
    
    // Draw edges - use darker colors with higher opacity
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', colors[3] || colors[2])
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', d => edgeScale(d.weight))
    
    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(d3.drag<SVGGElement, SimulationNode>()
        .on('start', (event) => {
          draggingRef.current = true
          setTooltip(null)
          if (!event.active) simulation.alphaTarget(0.12).restart()
          event.subject.fx = event.subject.x
          event.subject.fy = event.subject.y
        })
        .on('drag', (event) => {
          event.subject.fx = event.x
          event.subject.fy = event.y
        })
        .on('end', (event) => {
          draggingRef.current = false
          if (!event.active) simulation.alphaTarget(0)
          event.subject.fx = null
          event.subject.fy = null
        })
      )
    
    // Node circles - use darker colors for better visibility
    node.append('circle')
      .attr('r', rOf)
      .attr('fill', d => colorScale(d.cluster ?? 0))
      .attr('stroke', d => d.centrality > 0.3 ? colors[5] || colors[4] : (isDarkMode ? '#666' : '#333'))
      .attr('stroke-width', d => d.centrality > 0.3 ? 3 : 2)
      .attr('opacity', 0.9)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        // Reveal the label tag for a node whose label was filtered out (CiteSpace).
        const gSel = d3.select((event.currentTarget as SVGElement).parentNode as SVGGElement)
        if (gSel.select('text.node-label').empty()) {
          gSel.append('text')
            .attr('class', 'node-label')
            .text(d.label.length > 15 ? d.label.substring(0, 15) + '...' : d.label)
            .attr('font-size', fontOf(d)).attr('dx', rOf(d) + 5).attr('dy', 3.5)
            .attr('fill', labelColor(d)).attr('font-weight', '600')
          addTagBackgrounds(gSel, () => colorScale(d.cluster ?? 0), isDarkMode)
        }
        setFocusedCluster(prev => prev === (d.cluster ?? 0) ? null : (d.cluster ?? 0))
      })
      .on('mouseenter', (event, d) => {
        const content = `${d.label}\n${t('biblio.frequency')}: ${d.frequency}\n${t('biblio.centrality')}: ${d.centrality.toFixed(3)}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mousemove', (event, d) => {
        const content = `${d.label}\n${t('biblio.frequency')}: ${d.frequency}\n${t('biblio.centrality')}: ${d.centrality.toFixed(3)}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mouseleave', () => setTooltip(null))
    
    // Node labels — CiteSpace-style "tag" chips (readable rounded background behind text),
    // LOD: only frequent nodes get a label.
    node.filter(d => d.frequency >= labelCutoff).append('text')
      .attr('class', 'node-label')
      .text(d => d.label.length > 15 ? d.label.substring(0, 15) + '...' : d.label)
      .attr('font-size', fontOf)
      .attr('dx', d => rOf(d) + 5)
      .attr('dy', 3.5)
      .attr('fill', labelColor)  // colour by cluster (CiteSpace)
      .attr('font-weight', '600')
    addTagBackgrounds(node, (d) => colorScale((d as SimulationNode).cluster ?? 0), isDarkMode)

    // Update positions on tick
    const ticked = () => {
      link
        .attr('x1', d => (d.source as SimulationNode).x!)
        .attr('y1', d => (d.source as SimulationNode).y!)
        .attr('x2', d => (d.target as SimulationNode).x!)
        .attr('y2', d => (d.target as SimulationNode).y!)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    }
    // Throttle DOM updates for dense networks: update every other tick above 80 nodes
    let tickN = 0
    simulation.on('tick', () => {
      tickN++
      if (nodes.length > 80 && tickN % 2 !== 0) return
      ticked()
    })

    // Let D3 animate from initial positions (nodes burst from center → settled layout)
    // Initial zoom to fit
    const initialScale = 0.9
    svg.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(w * (1 - initialScale) / 2, h * (1 - initialScale) / 2)
        .scale(initialScale)
    )
    
    // end of RAF callback
    })
    return () => {
      window.cancelAnimationFrame(rafId)
      sim?.stop()
    }
  }, [data, dimensions, colorScheme, t, showTooltip, isDarkMode, hiddenNodeIds, nodeScale, fontScaleMul])

  // Apply focus opacity when cluster is clicked
  useEffect(() => {
    if (!svgRef.current || !data) return
    const svg = d3.select(svgRef.current)
    if (focusedCluster === null) {
      svg.selectAll('.nodes g').attr('opacity', 1)
      svg.selectAll('.links line').attr('opacity', 0.7)
    } else {
      svg.selectAll('.nodes g').attr('opacity', (d: any) =>
        (d.cluster ?? 0) === focusedCluster ? 1 : 0.1
      )
      svg.selectAll('.links line').attr('opacity', (d: any) => {
        const s = d.source as SimulationNode
        const tgt = d.target as SimulationNode
        return (s.cluster ?? 0) === focusedCluster && (tgt.cluster ?? 0) === focusedCluster ? 0.9 : 0.05
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
    <Box 
      ref={containerRef} 
      sx={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative'
      }}
    >
      {title && (
        <Typography 
          variant="subtitle2" 
          sx={{ 
            position: 'absolute', 
            top: 8, 
            left: 8, 
            zIndex: 1,
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)',
            color: 'text.primary',
            px: 1,
            borderRadius: 1
          }}
        >
          {title}
        </Typography>
      )}
      
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: 'block' }}
      />
      
      {/* Tooltip */}
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
            maxWidth: 200,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {tooltip.content}
        </Box>
      )}
      
      {/* Statistics */}
      {data.statistics && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)',
            p: 1,
            borderRadius: 1,
            fontSize: 11,
            color: 'text.secondary'
          }}
        >
          <div>{t('biblio.nodes')}: {data.statistics.node_count}</div>
          <div>{t('biblio.edges')}: {data.statistics.edge_count}</div>
          <div>{t('biblio.density')}: {data.statistics.density.toFixed(4)}</div>
        </Box>
      )}
    </Box>
  )
}

/**
 * D3.js Network Graph for Bibliographic Visualization
 * 
 * Force-directed graph for co-authorship, co-institution, keyword co-occurrence, etc.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography, CircularProgress } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { NetworkVisualizationData, NetworkNode, NetworkEdge } from '../../../../types/biblio'

// Color palettes for different schemes - using deeper, more visible colors
const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#1976d2', '#1565c0', '#0d47a1', '#0277bd', '#01579b', '#004c8c'],
  green: ['#388e3c', '#2e7d32', '#1b5e20', '#2e7d32', '#1b5e20', '#0d4f1c'],
  purple: ['#7b1fa2', '#6a1b9a', '#4a148c', '#6a1b9a', '#4a148c', '#38006b'],
  orange: ['#f57c00', '#ef6c00', '#e65100', '#ef6c00', '#e65100', '#bf360c'],
  red: ['#d32f2f', '#c62828', '#b71c1c', '#c62828', '#b71c1c', '#8e0000'],
  teal: ['#00796b', '#00695c', '#004d40', '#00695c', '#004d40', '#00251a']
}

interface NetworkGraphProps {
  data: NetworkVisualizationData | null
  loading?: boolean
  title?: string
  colorScheme?: string
  width?: number
  height?: number
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
  height = 600 
}: NetworkGraphProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width, height })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  
  // Smart tooltip positioning to avoid overflow
  const showTooltip = useCallback((event: MouseEvent, content: string) => {
    const container = containerRef.current
    if (!container) return
    
    const containerRect = container.getBoundingClientRect()
    let x = event.clientX - containerRect.left + 12
    let y = event.clientY - containerRect.top + 12
    
    const tooltipWidth = 200
    const tooltipHeight = 80
    
    if (x + tooltipWidth > containerRect.width) {
      x = event.clientX - containerRect.left - tooltipWidth - 12
    }
    if (y + tooltipHeight > containerRect.height) {
      y = event.clientY - containerRect.top - tooltipHeight - 12
    }
    
    x = Math.max(8, x)
    y = Math.max(8, y)
    
    setTooltip({ x, y, content })
  }, [])
  
  // Update dimensions on resize
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
  
  // Render graph
  useEffect(() => {
    if (!svgRef.current || !data || data.nodes.length === 0) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
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
    
    // Prepare data
    const nodes: SimulationNode[] = data.nodes.map(n => ({ ...n }))
    const links: SimulationLink[] = data.edges.map(e => ({
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
    
    // Node size scale
    const sizeScale = d3.scaleSqrt()
      .domain([1, d3.max(nodes, d => d.frequency) || 1])
      .range([5, 30])
    
    // Edge width scale
    const edgeScale = d3.scaleLinear()
      .domain([1, d3.max(links, d => d.weight) || 1])
      .range([1, 5])
    
    // Create simulation
    const simulation = d3.forceSimulation<SimulationNode>(nodes)
      .force('link', d3.forceLink<SimulationNode, SimulationLink>(links)
        .id(d => d.id)
        .distance(80)
        .strength(d => Math.min(1, d.weight / 10))
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(d => sizeScale(d.frequency) + 5))
    
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
    
    // Node circles - use darker colors for better visibility
    node.append('circle')
      .attr('r', d => sizeScale(d.frequency))
      .attr('fill', d => colorScale(d.cluster ?? 0))
      .attr('stroke', d => d.centrality > 0.3 ? colors[5] || colors[4] : '#333')
      .attr('stroke-width', d => d.centrality > 0.3 ? 3 : 2)
      .attr('opacity', 0.9)
      .on('mouseenter', (event, d) => {
        const content = `${d.label}\n${t('biblio.frequency')}: ${d.frequency}\n${t('biblio.centrality')}: ${d.centrality.toFixed(3)}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mousemove', (event, d) => {
        const content = `${d.label}\n${t('biblio.frequency')}: ${d.frequency}\n${t('biblio.centrality')}: ${d.centrality.toFixed(3)}`
        showTooltip(event as unknown as MouseEvent, content)
      })
      .on('mouseleave', () => setTooltip(null))
    
    // Node labels - use darker color for better readability
    node.append('text')
      .text(d => d.label.length > 15 ? d.label.substring(0, 15) + '...' : d.label)
      .attr('font-size', 11)
      .attr('dx', d => sizeScale(d.frequency) + 3)
      .attr('dy', 3)
      .attr('fill', '#1a1a1a')
      .attr('font-weight', '500')
    
    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimulationNode).x!)
        .attr('y1', d => (d.source as SimulationNode).y!)
        .attr('x2', d => (d.target as SimulationNode).x!)
        .attr('y2', d => (d.target as SimulationNode).y!)
      
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })
    
    // Initial zoom to fit
    const initialScale = 0.9
    svg.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(w * (1 - initialScale) / 2, h * (1 - initialScale) / 2)
        .scale(initialScale)
    )
    
    return () => {
      simulation.stop()
    }
  }, [data, dimensions, colorScheme, t, showTooltip])
  
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

/**
 * Synonym Network Graph Component
 * D3.js force-directed graph showing word-synonym relationships
 */

import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { SynonymResult } from '../../../types/synonym'

interface SynonymNetworkProps {
  data: SynonymResult[]
  maxNodes: number
  colorScheme: string
  showDefinitions: boolean
  onWordClick: (word: string) => void
  onSvgRef: (ref: SVGSVGElement | null) => void
}

interface NetworkNode {
  id: string
  type: 'word' | 'synonym'
  frequency?: number
  definition?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface NetworkLink {
  source: string | NetworkNode
  target: string | NetworkNode
  value: number
}

// Color schemes
const COLOR_SCHEMES: Record<string, string[]> = {
  default: ['#1976d2', '#42a5f5', '#90caf9'],
  category10: d3.schemeCategory10 as string[],
  pastel: ['#aec6cf', '#ffb347', '#b39eb5', '#ff6961', '#77dd77'],
  warm: ['#ff6b6b', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'],
  cool: ['#0984e3', '#00cec9', '#6c5ce7', '#a29bfe', '#74b9ff']
}

export default function SynonymNetwork({
  data,
  maxNodes,
  colorScheme,
  showDefinitions,
  onWordClick,
  onSvgRef
}: SynonymNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Build graph data
  const buildGraphData = useCallback(() => {
    const nodes: NetworkNode[] = []
    const links: NetworkLink[] = []
    const nodeSet = new Set<string>()
    
    // Limit data
    const limitedData = data.slice(0, Math.min(maxNodes, data.length))
    
    // Add word nodes
    limitedData.forEach(result => {
      if (!nodeSet.has(result.word)) {
        nodes.push({
          id: result.word,
          type: 'word',
          frequency: result.frequency,
          definition: result.synsets[0]?.definition
        })
        nodeSet.add(result.word)
      }
      
      // Add synonym nodes and links (limit per word)
      const synonymsToAdd = result.all_synonyms.slice(0, 5)
      synonymsToAdd.forEach(syn => {
        if (!nodeSet.has(syn)) {
          nodes.push({
            id: syn,
            type: 'synonym'
          })
          nodeSet.add(syn)
        }
        
        links.push({
          source: result.word,
          target: syn,
          value: 1
        })
      })
    })
    
    return { nodes, links }
  }, [data, maxNodes])

  // Render graph
  useEffect(() => {
    if (!containerRef.current || !svgRef.current || data.length === 0) return

    const container = containerRef.current
    const svg = d3.select(svgRef.current)
    
    // Clear previous content
    svg.selectAll('*').remove()

    // Get dimensions
    const width = container.clientWidth
    const height = container.clientHeight

    // Set SVG dimensions
    svg.attr('width', width).attr('height', height)

    // Build data
    const { nodes, links } = buildGraphData()

    if (nodes.length === 0) return

    // Get color scale
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.default
    const colorScale = d3.scaleOrdinal(colors)

    // Create simulation
    const simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(links)
        .id((d: any) => d.id)
        .distance(80)
        .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30))

    // Create container group for zoom
    const g = svg.append('g')

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    // Draw links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1)

    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, NetworkNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )

    // Add circles to nodes
    node.append('circle')
      .attr('r', (d: NetworkNode) => d.type === 'word' ? 12 : 8)
      .attr('fill', (d: NetworkNode) => d.type === 'word' ? colorScale('word') : colorScale('synonym'))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Add labels to nodes
    node.append('text')
      .text((d: NetworkNode) => d.id)
      .attr('x', 15)
      .attr('y', 4)
      .attr('font-size', (d: NetworkNode) => d.type === 'word' ? '12px' : '10px')
      .attr('font-weight', (d: NetworkNode) => d.type === 'word' ? 'bold' : 'normal')
      .attr('fill', '#333')

    // Add tooltip
    const tooltip = d3.select(container)
      .append('div')
      .attr('class', 'synonym-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background', 'white')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('padding', '8px 12px')
      .style('font-size', '12px')
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
      .style('max-width', '250px')
      .style('z-index', '1000')

    // Node events
    node.on('mouseover', (event, d: NetworkNode) => {
      let content = `<strong>${d.id}</strong>`
      if (d.type === 'word' && d.frequency) {
        content += `<br/>Frequency: ${d.frequency}`
      }
      if (showDefinitions && d.definition) {
        content += `<br/><em>${d.definition}</em>`
      }
      
      tooltip
        .html(content)
        .style('visibility', 'visible')
        .style('left', `${event.pageX - container.getBoundingClientRect().left + 10}px`)
        .style('top', `${event.pageY - container.getBoundingClientRect().top - 10}px`)
    })
    .on('mouseout', () => {
      tooltip.style('visibility', 'hidden')
    })
    .on('click', (event, d: NetworkNode) => {
      if (d.type === 'word') {
        onWordClick(d.id)
      }
    })

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    // Pass SVG ref for export
    onSvgRef(svgRef.current)

    // Cleanup
    return () => {
      simulation.stop()
      tooltip.remove()
    }
  }, [data, maxNodes, colorScheme, showDefinitions, buildGraphData, onWordClick, onSvgRef])

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

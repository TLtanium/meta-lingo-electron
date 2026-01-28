/**
 * D3.js Network Graph Component for N-gram Analysis
 * Force-directed network graph showing word connections within N-grams
 */

import { useRef, useEffect, useState } from 'react'
import { Box } from '@mui/material'
import * as d3 from 'd3'
import type { NGramResult } from '../../../types/ngram'

interface NetworkGraphProps {
  data: NGramResult[]
  colorScheme: string
  onNodeClick?: (ngram: string) => void
}

interface Node {
  id: string
  frequency: number
  group: number
}

interface Link {
  source: string
  target: string
  weight: number
  ngram: string
}

// Color palettes
const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#90caf9', '#42a5f5', '#1e88e5', '#1565c0', '#0d47a1'],
  green: ['#a5d6a7', '#66bb6a', '#43a047', '#2e7d32', '#1b5e20'],
  purple: ['#ce93d8', '#ab47bc', '#8e24aa', '#6a1b9a', '#4a148c'],
  orange: ['#ffcc80', '#ffa726', '#fb8c00', '#ef6c00', '#e65100'],
  red: ['#ef9a9a', '#ef5350', '#e53935', '#c62828', '#b71c1c'],
  teal: ['#80cbc4', '#26a69a', '#00897b', '#00695c', '#004d40']
}

export default function NetworkGraph({
  data,
  colorScheme,
  onNodeClick
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Observe container size changes
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width, height })
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [])

  // Build network data from N-grams
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (data.length === 0) return

    // Build nodes and links from N-grams
    const nodeMap = new Map<string, Node>()
    const links: Link[] = []

    data.forEach((ngram, idx) => {
      const words = ngram.words
      
      // Add nodes for each word
      words.forEach(word => {
        if (!nodeMap.has(word)) {
          nodeMap.set(word, {
            id: word,
            frequency: ngram.frequency,
            group: idx % 5
          })
        } else {
          const node = nodeMap.get(word)!
          node.frequency += ngram.frequency
        }
      })

      // Add links between consecutive words
      for (let i = 0; i < words.length - 1; i++) {
        links.push({
          source: words[i],
          target: words[i + 1],
          weight: ngram.frequency,
          ngram: ngram.ngram
        })
      }
    })

    const nodes = Array.from(nodeMap.values())

    // Setup dimensions
    const width = dimensions.width
    const height = dimensions.height

    // Create main group
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    // Color scales
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const colorScale = d3.scaleOrdinal<number, string>()
      .domain([0, 1, 2, 3, 4])
      .range(colors)

    // Size scale for nodes
    const maxFreq = d3.max(nodes, d => d.frequency) || 1
    const nodeSize = d3.scaleSqrt()
      .domain([0, maxFreq])
      .range([8, 30])

    // Link width scale
    const maxWeight = d3.max(links, d => d.weight) || 1
    const linkWidth = d3.scaleLinear()
      .domain([0, maxWeight])
      .range([1, 6])

    // Create force simulation
    const simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(links)
        .id((d: any) => d.id)
        .distance(80)
        .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => nodeSize(d.frequency) + 5))

    // Add links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => linkWidth(d.weight))

    // Add nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('cursor', onNodeClick ? 'pointer' : 'default')
      .call(d3.drag<SVGGElement, Node>()
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

    // Node circles
    node.append('circle')
      .attr('r', d => nodeSize(d.frequency))
      .attr('fill', d => colorScale(d.group))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .on('mouseover', function() {
        d3.select(this).attr('stroke-width', 3)
      })
      .on('mouseout', function() {
        d3.select(this).attr('stroke-width', 2)
      })
      .on('click', (_, d) => {
        if (onNodeClick) {
          // Find an N-gram containing this word
          const containingNgram = data.find(ng => ng.words.includes(d.id))
          if (containingNgram) {
            onNodeClick(containingNgram.ngram)
          }
        }
      })

    // Node labels
    node.append('text')
      .text(d => d.id)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', d => Math.max(10, Math.min(14, nodeSize(d.frequency) * 0.8)))
      .attr('fill', '#333')
      .attr('pointer-events', 'none')

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    // Cleanup
    return () => {
      simulation.stop()
    }

  }, [data, dimensions, colorScheme, onNodeClick])

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        display: 'flex'
      }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </Box>
  )
}

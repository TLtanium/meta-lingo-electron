/**
 * D3.js Sankey Chart Component for N-gram Analysis
 * Shows word flow patterns in N-grams
 */

import { useRef, useEffect, useState } from 'react'
import { Box } from '@mui/material'
import * as d3 from 'd3'
import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey'
import type { NGramResult } from '../../../types/ngram'

interface SankeyChartProps {
  data: NGramResult[]
  colorScheme: string
  onNodeClick?: (ngram: string) => void
}

interface SankeyNode {
  name: string
  position: number
  frequency?: number
}

interface SankeyLink {
  source: number
  target: number
  value: number
  ngram: string
}

// Color palettes
const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5'],
  green: ['#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047'],
  purple: ['#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa'],
  orange: ['#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00'],
  red: ['#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935'],
  teal: ['#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b']
}

export default function SankeyChart({
  data,
  colorScheme,
  onNodeClick
}: SankeyChartProps) {
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

  // Build and render Sankey diagram
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (data.length === 0) return

    // Find max N value
    const maxN = Math.max(...data.map(d => d.n))

    // Build nodes and links
    const nodeMap = new Map<string, SankeyNode>()
    const links: SankeyLink[] = []

    data.forEach(ngram => {
      const words = ngram.words

      // Create nodes for each position in the N-gram
      words.forEach((word, pos) => {
        const nodeKey = `${pos}-${word}`
        if (!nodeMap.has(nodeKey)) {
          nodeMap.set(nodeKey, {
            name: word,
            position: pos,
            frequency: ngram.frequency
          })
        } else {
          const node = nodeMap.get(nodeKey)!
          node.frequency = (node.frequency || 0) + ngram.frequency
        }
      })

      // Create links between consecutive positions
      for (let i = 0; i < words.length - 1; i++) {
        const sourceKey = `${i}-${words[i]}`
        const targetKey = `${i + 1}-${words[i + 1]}`
        
        links.push({
          source: -1, // Will be set after node index mapping
          target: -1,
          value: ngram.frequency,
          ngram: ngram.ngram
        })
        
        // Store keys for later mapping
        ;(links[links.length - 1] as any).sourceKey = sourceKey
        ;(links[links.length - 1] as any).targetKey = targetKey
      }
    })

    // Convert map to array and create index mapping
    const nodes = Array.from(nodeMap.entries()).map(([key, node]) => ({
      ...node,
      key
    }))

    const nodeIndex = new Map<string, number>()
    nodes.forEach((node, idx) => {
      nodeIndex.set(node.key, idx)
    })

    // Update link source/target with actual indices
    links.forEach(link => {
      link.source = nodeIndex.get((link as any).sourceKey)!
      link.target = nodeIndex.get((link as any).targetKey)!
    })

    // Filter out invalid links
    const validLinks = links.filter(l => 
      l.source !== undefined && 
      l.target !== undefined && 
      l.source >= 0 && 
      l.target >= 0
    )

    if (validLinks.length === 0) return

    // Setup dimensions
    const margin = { top: 20, right: 20, bottom: 20, left: 20 }
    const width = dimensions.width - margin.left - margin.right
    const height = dimensions.height - margin.top - margin.bottom

    // Create main group
    const g = svg
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Color scale based on position
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const colorScale = d3.scaleOrdinal<number, string>()
      .domain(d3.range(maxN))
      .range(colors)

    // Create sankey generator
    const sankeyGenerator = d3Sankey<SankeyNode, SankeyLink>()
      .nodeWidth(15)
      .nodePadding(10)
      .nodeAlign(sankeyLeft)
      .extent([[0, 0], [width, height]])

    // Generate sankey layout
    const sankeyData = sankeyGenerator({
      nodes: nodes.map(n => ({ ...n })),
      links: validLinks.map(l => ({ ...l }))
    })

    // Add links
    const link = g.append('g')
      .attr('fill', 'none')
      .selectAll('path')
      .data(sankeyData.links)
      .enter()
      .append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (d: any) => colorScale(d.source.position))
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', (d: any) => Math.max(1, d.width))
      .on('mouseover', function(event, d: any) {
        d3.select(this).attr('stroke-opacity', 0.8)
        
        // Show tooltip
        const [x, y] = d3.pointer(event, g.node())
        const tooltip = g.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${x + 10},${y})`)
        
        tooltip.append('rect')
          .attr('fill', 'rgba(0,0,0,0.8)')
          .attr('rx', 4)
          .attr('x', 0)
          .attr('y', -14)
          .attr('width', 120)
          .attr('height', 28)

        tooltip.append('text')
          .attr('fill', 'white')
          .attr('font-size', '11px')
          .attr('x', 8)
          .attr('y', 4)
          .text(`${d.ngram}: ${d.value}`)
      })
      .on('mouseout', function() {
        d3.select(this).attr('stroke-opacity', 0.5)
        g.selectAll('.tooltip').remove()
      })

    // Add nodes
    const node = g.append('g')
      .selectAll('g')
      .data(sankeyData.nodes)
      .enter()
      .append('g')
      .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`)

    node.append('rect')
      .attr('height', (d: any) => d.y1 - d.y0)
      .attr('width', 15)
      .attr('fill', (d: any) => colorScale(d.position))
      .attr('stroke', '#333')
      .attr('cursor', onNodeClick ? 'pointer' : 'default')
      .on('click', (_, d: any) => {
        if (onNodeClick) {
          // Find an N-gram containing this word at this position
          const containingNgram = data.find(ng => 
            ng.words[d.position] === d.name
          )
          if (containingNgram) {
            onNodeClick(containingNgram.ngram)
          }
        }
      })
      .on('mouseover', function() {
        d3.select(this).attr('stroke-width', 2)
      })
      .on('mouseout', function() {
        d3.select(this).attr('stroke-width', 1)
      })

    // Add node labels
    node.append('text')
      .attr('x', (d: any) => d.x0 < width / 2 ? 20 : -5)
      .attr('y', (d: any) => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d: any) => d.x0 < width / 2 ? 'start' : 'end')
      .attr('font-size', '11px')
      .attr('fill', '#333')
      .text((d: any) => d.name)

    // Add position labels at top
    const positions = new Set(nodes.map(n => n.position))
    const positionLabels = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']
    
    positions.forEach(pos => {
      const nodesAtPos = sankeyData.nodes.filter((n: any) => n.position === pos)
      if (nodesAtPos.length > 0) {
        const avgX = d3.mean(nodesAtPos, (n: any) => (n.x0 + n.x1) / 2) || 0
        
        g.append('text')
          .attr('x', avgX)
          .attr('y', -5)
          .attr('text-anchor', 'middle')
          .attr('font-size', '10px')
          .attr('fill', '#666')
          .text(positionLabels[pos] || `Position ${pos + 1}`)
      }
    })

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

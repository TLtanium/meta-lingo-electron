/**
 * Synonym Tree Component
 * D3.js tree visualization showing hierarchical word-synonym relationships
 */

import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { SynonymResult } from '../../../types/synonym'

interface SynonymTreeProps {
  data: SynonymResult[]
  maxNodes: number
  colorScheme: string
  showDefinitions: boolean
  onWordClick: (word: string) => void
  onSvgRef: (ref: SVGSVGElement | null) => void
}

interface TreeNode {
  name: string
  type: 'root' | 'word' | 'synset' | 'synonym'
  definition?: string
  frequency?: number
  children?: TreeNode[]
}

// Color schemes
const COLOR_SCHEMES: Record<string, string[]> = {
  default: ['#1976d2', '#42a5f5', '#90caf9', '#bbdefb'],
  category10: d3.schemeCategory10 as string[],
  pastel: ['#aec6cf', '#ffb347', '#b39eb5', '#ff6961'],
  warm: ['#ff6b6b', '#feca57', '#ff9ff3', '#54a0ff'],
  cool: ['#0984e3', '#00cec9', '#6c5ce7', '#a29bfe']
}

export default function SynonymTree({
  data,
  maxNodes,
  colorScheme,
  showDefinitions,
  onWordClick,
  onSvgRef
}: SynonymTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Build tree data structure
  const buildTreeData = useCallback((): TreeNode => {
    const limitedData = data.slice(0, Math.min(maxNodes, data.length))
    
    const root: TreeNode = {
      name: 'Synonyms',
      type: 'root',
      children: limitedData.map(result => ({
        name: result.word,
        type: 'word' as const,
        frequency: result.frequency,
        children: result.synsets.slice(0, 3).map(synset => ({
          name: synset.name.split('.')[0],
          type: 'synset' as const,
          definition: synset.definition,
          children: synset.synonyms.slice(0, 5).map(syn => ({
            name: syn,
            type: 'synonym' as const
          }))
        }))
      }))
    }
    
    return root
  }, [data, maxNodes])

  // Count total nodes for dynamic sizing
  const countNodes = useCallback((node: TreeNode): number => {
    let count = 1
    if (node.children) {
      for (const child of node.children) {
        count += countNodes(child)
      }
    }
    return count
  }, [])

  // Render tree
  useEffect(() => {
    if (!containerRef.current || !svgRef.current || data.length === 0) return

    const container = containerRef.current
    const svg = d3.select(svgRef.current)
    
    // Clear previous content
    svg.selectAll('*').remove()

    // Build tree data
    const treeData = buildTreeData()
    
    // Count total nodes for dynamic height
    const totalNodes = countNodes(treeData)
    
    // Dynamic height based on node count - minimum 30px per leaf node
    const minHeight = container.clientHeight
    const calculatedHeight = Math.max(minHeight, totalNodes * 25)
    
    // Get dimensions
    const width = container.clientWidth
    const height = calculatedHeight
    const margin = { top: 40, right: 200, bottom: 40, left: 150 }

    // Set SVG dimensions
    svg.attr('width', width).attr('height', height)

    // Create hierarchy
    const root = d3.hierarchy(treeData)
    
    // Create tree layout with much larger separation between siblings
    const treeLayout = d3.tree<TreeNode>()
      .size([height - margin.top - margin.bottom, width - margin.left - margin.right])
      .separation((a, b) => {
        // Much larger separation: siblings get 3x spacing, other nodes get 2x
        if (a.parent === b.parent) {
          return 3
        }
        return 2
      })
    
    // Apply layout
    const treeRoot = treeLayout(root)

    // Get color scale
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.default

    // Create container group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    // Initialize zoom with identity transform to preserve initial g transform
    svg.call(zoom.transform, d3.zoomIdentity.translate(margin.left, margin.top))
    svg.call(zoom)

    // Draw links with curved paths
    g.selectAll('.link')
      .data(treeRoot.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 1.5)
      .attr('d', d3.linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
        .x(d => d.y)
        .y(d => d.x)
      )

    // Draw nodes
    const node = g.selectAll('.node')
      .data(treeRoot.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .style('cursor', d => d.data.type === 'word' ? 'pointer' : 'default')
      .on('click', (event, d) => {
        if (d.data.type === 'word') {
          onWordClick(d.data.name)
        }
      })

    // Add circles to nodes
    node.append('circle')
      .attr('r', d => {
        switch (d.data.type) {
          case 'root': return 10
          case 'word': return 7
          case 'synset': return 5
          case 'synonym': return 4
          default: return 4
        }
      })
      .attr('fill', d => {
        switch (d.data.type) {
          case 'root': return colors[0]
          case 'word': return colors[1] || colors[0]
          case 'synset': return colors[2] || colors[1]
          case 'synonym': return colors[3] || colors[2]
          default: return colors[0]
        }
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Add labels
    node.append('text')
      .attr('dy', 4)
      .attr('x', d => d.children ? -12 : 12)
      .attr('text-anchor', d => d.children ? 'end' : 'start')
      .attr('font-size', d => {
        switch (d.data.type) {
          case 'root': return '13px'
          case 'word': return '12px'
          case 'synset': return '11px'
          case 'synonym': return '10px'
          default: return '10px'
        }
      })
      .attr('font-weight', d => d.data.type === 'word' || d.data.type === 'root' ? 'bold' : 'normal')
      .attr('fill', '#333')
      .text(d => {
        if (d.data.type === 'word' && d.data.frequency) {
          return `${d.data.name} (${d.data.frequency})`
        }
        return d.data.name
      })

    // Pass SVG ref for export
    onSvgRef(svgRef.current)

    // Add tooltip for definitions
    if (showDefinitions) {
      const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'tree-tooltip')
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
        .style('pointer-events', 'none')

      node.on('mouseover', (event, d) => {
        if (d.data.definition) {
          tooltip
            .html(`<strong>${d.data.name}</strong><br/><em>${d.data.definition}</em>`)
            .style('visibility', 'visible')
            .style('left', `${event.pageX - container.getBoundingClientRect().left + 10}px`)
            .style('top', `${event.pageY - container.getBoundingClientRect().top - 10}px`)
        }
      })
      .on('mouseout', () => {
        tooltip.style('visibility', 'hidden')
      })

      // Cleanup tooltip on unmount
      return () => {
        tooltip.remove()
      }
    }

  }, [data, maxNodes, colorScheme, showDefinitions, buildTreeData, countNodes, onWordClick, onSvgRef])

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        overflow: 'auto'
      }}
    >
      <svg ref={svgRef} style={{ minWidth: '100%', minHeight: '100%' }} />
    </div>
  )
}

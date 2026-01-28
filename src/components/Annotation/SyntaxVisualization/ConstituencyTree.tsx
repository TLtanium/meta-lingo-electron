/**
 * ConstituencyTree Component
 * Visualizes constituency parse tree using D3.js
 * With proper spacing and scroll support
 */

import { useEffect, useRef, useMemo } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import * as d3 from 'd3'
import type { TreeNode } from './types'

interface ConstituencyTreeProps {
  treeData: TreeNode | null
  treeString?: string
  height?: number
}

interface D3TreeNode {
  name: string
  text: string
  isLeaf?: boolean
  children?: D3TreeNode[]
}

// Convert tree node to D3 hierarchical format
function convertToD3Format(node: TreeNode): D3TreeNode {
  return {
    name: node.label,
    text: node.text,
    isLeaf: node.isLeaf,
    children: node.children.length > 0 
      ? node.children.map(child => convertToD3Format(child))
      : undefined
  }
}

// Count leaf nodes for width calculation
function countLeaves(node: D3TreeNode): number {
  if (!node.children || node.children.length === 0) {
    return 1
  }
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0)
}

// Get tree depth for height calculation
function getTreeDepth(node: D3TreeNode): number {
  if (!node.children || node.children.length === 0) {
    return 1
  }
  return 1 + Math.max(...node.children.map(child => getTreeDepth(child)))
}

export default function ConstituencyTree({ 
  treeData, 
  treeString,
  height = 400 
}: ConstituencyTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  
  // Convert tree data to D3 format
  const d3Data = useMemo(() => {
    if (!treeData) return null
    return convertToD3Format(treeData)
  }, [treeData])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !d3Data) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Calculate dimensions based on tree structure
    const leafCount = countLeaves(d3Data)
    const treeDepth = getTreeDepth(d3Data)
    
    // Spacing configuration - generous spacing for readability
    const nodeSpacingX = 100  // Horizontal space per leaf node
    const nodeSpacingY = 80   // Vertical space per level
    const margin = { top: 50, right: 50, bottom: 50, left: 50 }
    
    // Calculate total dimensions
    const innerWidth = Math.max(leafCount * nodeSpacingX, 400)
    const innerHeight = Math.max(treeDepth * nodeSpacingY, 300)
    const totalWidth = innerWidth + margin.left + margin.right
    const totalHeight = innerHeight + margin.top + margin.bottom

    // Create hierarchy
    const root = d3.hierarchy(d3Data)
    
    // Create tree layout with generous separation
    const treeLayout = d3.tree<D3TreeNode>()
      .size([innerWidth, innerHeight])
      .separation((a, b) => {
        // More separation between nodes from different parents
        return a.parent === b.parent ? 1.5 : 2.5
      })

    const treeRoot = treeLayout(root)

    // Set SVG dimensions
    svg
      .attr('width', totalWidth)
      .attr('height', totalHeight)
      .style('min-width', `${totalWidth}px`)
      .style('min-height', `${totalHeight}px`)

    // Create main group with transform
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Colors based on theme
    const linkColor = theme.palette.mode === 'dark' ? '#666' : '#999'
    const nodeColor = theme.palette.primary.main
    const leafColor = theme.palette.success.main

    // Draw links with smooth curves
    g.selectAll('.link')
      .data(treeRoot.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', linkColor)
      .attr('stroke-width', 1.5)
      .attr('d', d3.linkVertical<d3.HierarchyPointLink<D3TreeNode>, d3.HierarchyPointNode<D3TreeNode>>()
        .x(d => d.x)
        .y(d => d.y) as any)

    // Create node groups
    const nodes = g.selectAll('.node')
      .data(treeRoot.descendants())
      .enter()
      .append('g')
      .attr('class', d => `node ${d.data.isLeaf ? 'node-leaf' : 'node-internal'}`)
      .attr('transform', d => `translate(${d.x},${d.y})`)

    // Add circles for internal nodes (phrase labels)
    nodes.filter(d => !d.data.isLeaf)
      .append('circle')
      .attr('r', 20)
      .attr('fill', nodeColor)
      .attr('stroke', theme.palette.primary.dark)
      .attr('stroke-width', 2)

    // Add rectangles for leaf nodes (words)
    nodes.filter(d => d.data.isLeaf)
      .append('rect')
      .attr('x', d => {
        const textLen = d.data.name.length
        const width = Math.max(textLen * 8 + 16, 50)
        return -width / 2
      })
      .attr('y', -14)
      .attr('width', d => {
        const textLen = d.data.name.length
        return Math.max(textLen * 8 + 16, 50)
      })
      .attr('height', 28)
      .attr('rx', 4)
      .attr('fill', leafColor)
      .attr('stroke', theme.palette.success.dark)
      .attr('stroke-width', 1.5)

    // Add labels for internal nodes (phrase labels like NP, VP, S, etc.)
    nodes.filter(d => !d.data.isLeaf)
      .append('text')
      .attr('dy', 5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'Arial, sans-serif')
      .text(d => d.data.name)

    // Add labels for leaf nodes (words)
    nodes.filter(d => d.data.isLeaf)
      .append('text')
      .attr('dy', 5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '12px')
      .attr('font-family', 'Arial, sans-serif')
      .text(d => d.data.name)

    // Add tooltips
    nodes.append('title')
      .text(d => d.data.isLeaf ? d.data.name : `${d.data.name}: ${d.data.text}`)

  }, [d3Data, theme])

  if (!treeData && !treeString) {
    return (
      <Box 
        sx={{ 
          height, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          bgcolor: 'action.hover',
          borderRadius: 1
        }}
      >
        <Typography color="text.secondary">
          No constituency tree data available
        </Typography>
      </Box>
    )
  }

  // If only tree string is available (fallback display)
  if (!treeData && treeString) {
    return (
      <Box 
        sx={{ 
          height, 
          overflow: 'auto',
          bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          p: 2,
          fontFamily: 'monospace',
          fontSize: '12px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        {treeString}
      </Box>
    )
  }

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        minHeight: height,
        overflow: 'auto',
        bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : '#ffffff',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider'
      }}
    >
      <svg ref={svgRef} style={{ display: 'block' }} />
    </Box>
  )
}

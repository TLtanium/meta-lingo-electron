/**
 * Topic Dendrogram
 * D3.js implementation that directly uses the scipy hierarchical clustering
 * tree structure returned from the backend
 * 
 * Backend uses: cosine distance + average linkage (scipy)
 */

import { useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import D3Container from './D3Container'
import { useTooltip, truncateText, getTopicColor } from './useD3'

interface HierarchyData {
  name: string
  value?: number
  topic_id?: number
  words?: string
  distance?: number
  itemStyle?: { color: string }
  children?: HierarchyData[]
  merged_words?: string  // Topic representation for internal (cluster) nodes
  is_leaf?: boolean
}

interface TopicDendrogramProps {
  data: HierarchyData
  height?: number
  orientation?: 'left' | 'top' | 'bottom'
}

export default function TopicDendrogram({ 
  data, 
  height = 600, 
  orientation = 'left' 
}: TopicDendrogramProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltip = useTooltip()

  const renderChart = useCallback((dimensions: { width: number; height: number }) => {
    if (!svgRef.current || !data) return

    const { width, height: h } = dimensions
    
    // Layout based on orientation
    const isHorizontal = orientation === 'left'
    const margin = isHorizontal 
      ? { top: 60, right: 200, bottom: 50, left: 80 }
      : { top: 80, right: 50, bottom: 150, left: 50 }
    
    const innerWidth = width - margin.left - margin.right
    const innerHeight = h - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Count leaves and find max distance
    let leafCount = 0
    let maxDistance = 0
    
    function analyzeTree(node: HierarchyData) {
      if (!node.children || node.children.length === 0) {
        leafCount++
      } else {
        if (node.distance !== undefined && node.distance > maxDistance) {
          maxDistance = node.distance
        }
        node.children.forEach(analyzeTree)
      }
    }
    analyzeTree(data)

    if (leafCount < 2) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', h / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text(t('topicModeling.visualization.needMoreTopics') || 'Need at least 2 topics')
      return
    }

    // If maxDistance is 0, use a default
    if (maxDistance === 0) maxDistance = 1

    // Title - consistent with other visualizations
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.visualization.hierarchy') || 'Hierarchical Topic Clustering')

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.visualization.hierarchyDendrogram', 'Topic Hierarchy Dendrogram'))

    // Main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const primarySize = isHorizontal ? innerHeight : innerWidth
    const secondarySize = isHorizontal ? innerWidth : innerHeight
    
    // Cell size for leaves
    const cellSize = primarySize / leafCount
    
    // Distance scale (0 at leaves, maxDistance at root)
    const distanceScale = d3.scaleLinear()
      .domain([0, maxDistance])
      .range([0, secondarySize * 0.85])

    // Assign positions to leaves (in order of tree traversal)
    let leafIndex = 0
    const leafPositions: Map<HierarchyData, number> = new Map()
    
    function assignLeafPositions(node: HierarchyData) {
      if (!node.children || node.children.length === 0) {
        leafPositions.set(node, leafIndex * cellSize + cellSize / 2)
        leafIndex++
      } else {
        node.children.forEach(assignLeafPositions)
      }
    }
    assignLeafPositions(data)

    // Get node position (average of children for internal nodes)
    function getNodePosition(node: HierarchyData): number {
      if (leafPositions.has(node)) {
        return leafPositions.get(node)!
      }
      if (node.children && node.children.length > 0) {
        const positions = node.children.map(getNodePosition)
        return d3.mean(positions) ?? 0
      }
      return 0
    }

    // Draw the dendrogram recursively with elbow connectors
    // Also collect internal node positions for drawing black circles
    const internalNodes: Array<{
      x: number
      y: number
      node: HierarchyData
      colorIndex: number
    }> = []

    function drawNode(node: HierarchyData, colorIndex: number = 0) {
      const nodePos = getNodePosition(node)
      const nodeDistance = node.distance ?? 0
      const nodeHeight = distanceScale(nodeDistance)

      if (node.children && node.children.length > 0) {
        // Internal node - draw connections to children
        node.children.forEach((child, i) => {
          const childPos = getNodePosition(child)
          const childDistance = child.distance ?? 0
          const childHeight = distanceScale(childDistance)

          // Draw elbow connector
          let path: string
          if (isHorizontal) {
            // Left orientation: tree grows to the right
            // Horizontal line from child to node height, then vertical to node position
            path = `M${childHeight},${childPos} H${nodeHeight} V${nodePos}`
          } else {
            // Top/Bottom orientation: tree grows down
            path = `M${childPos},${childHeight} V${nodeHeight} H${nodePos}`
          }

          g.append('path')
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', '#555')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0)
            .transition()
            .duration(500)
            .delay(colorIndex * 30)
            .attr('opacity', 1)

          // Recursively draw children
          drawNode(child, colorIndex + i)
        })

        // Store internal node position for drawing black circle later
        // (BERTopic style: hoverable black circles at merge points)
        if (node.merged_words) {
          const cx = isHorizontal ? nodeHeight : nodePos
          const cy = isHorizontal ? nodePos : nodeHeight
          internalNodes.push({ x: cx, y: cy, node, colorIndex })
        }
      } else {
        // Leaf node - draw circle and label
        const color = node.itemStyle?.color ?? getTopicColor(colorIndex)
        
        const cx = isHorizontal ? 0 : nodePos
        const cy = isHorizontal ? nodePos : 0
        
        g.append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 0)
          .attr('fill', color)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2)
          .style('cursor', 'pointer')
          .on('mouseenter', function(event) {
            d3.select(this)
              .transition()
              .duration(200)
              .attr('r', 10)
            
            tooltip.show(`
              <div style="font-weight:bold;color:#333;margin-bottom:6px;">
                ${node.name}
              </div>
              <div style="color:#666;margin-bottom:4px;">
                ${t('topicModeling.results.documentCount')}: ${node.value ?? 0}
              </div>
              <div style="color:#888;font-size:0.9em;">
                ${node.words ?? ''}
              </div>
            `, event)
          })
          .on('mousemove', (event) => tooltip.move(event))
          .on('mouseleave', function() {
            d3.select(this)
              .transition()
              .duration(200)
              .attr('r', 6)
            tooltip.hide()
          })
          .transition()
          .duration(400)
          .delay(colorIndex * 50)
          .attr('r', 6)

        // Label
        const labelX = isHorizontal ? -12 : nodePos
        const labelY = isHorizontal ? nodePos : -12
        const textAnchor = isHorizontal ? 'end' : 'middle'
        const rotation = isHorizontal ? 0 : -45
        
        g.append('text')
          .attr('x', labelX)
          .attr('y', labelY)
          .attr('text-anchor', textAnchor)
          .attr('transform', isHorizontal ? '' : `rotate(${rotation}, ${labelX}, ${labelY})`)
          .attr('dy', isHorizontal ? '0.35em' : '-0.5em')
          .attr('font-size', '11px')
          .attr('fill', '#444')
          .attr('opacity', 0)
          .text(truncateText(node.name, 20))
          .transition()
          .duration(400)
          .delay(colorIndex * 50 + 200)
          .attr('opacity', 1)
      }
    }

    drawNode(data)

    // Draw black circles for internal nodes (BERTopic style)
    // Hovering shows the merged topic representation at that hierarchy level
    const mergedWordsLabel = t('topicModeling.visualization.mergedTopicWords') || 'Topic representation at this level'
    
    internalNodes.forEach(({ x, y, node, colorIndex }) => {
      g.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 0)
        .attr('fill', '#333')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mouseenter', function(event) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 8)
          
          tooltip.show(`
            <div style="font-weight:bold;color:#333;margin-bottom:6px;">
              ${mergedWordsLabel}
            </div>
            <div style="color:#666;margin-bottom:4px;">
              ${t('topicModeling.results.documentCount')}: ${node.value ?? 0}
            </div>
            <div style="color:#888;font-size:0.9em;max-width:250px;word-break:break-word;">
              ${node.merged_words ?? ''}
            </div>
          `, event)
        })
        .on('mousemove', (event) => tooltip.move(event))
        .on('mouseleave', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 5)
          tooltip.hide()
        })
        .transition()
        .duration(400)
        .delay(colorIndex * 50 + 300)
        .attr('r', 5)
    })

    // Distance axis
    const axisScale = d3.scaleLinear()
      .domain([0, maxDistance])
      .range([0, secondarySize * 0.85])
    
    const axis = isHorizontal 
      ? d3.axisTop(axisScale).ticks(5).tickFormat(d => (d as number).toFixed(2))
      : d3.axisLeft(axisScale).ticks(5).tickFormat(d => (d as number).toFixed(2))
    
    const axisG = g.append('g')
      .attr('class', 'distance-axis')
      .call(axis as any)
    
    axisG.selectAll('text')
      .attr('font-size', '10px')
      .attr('fill', '#666')
    
    axisG.selectAll('line, path')
      .attr('stroke', '#ccc')

    // Axis label
    const axisLabelX = isHorizontal ? secondarySize * 0.4 : -40
    const axisLabelY = isHorizontal ? -35 : primarySize / 2
    
    g.append('text')
      .attr('x', axisLabelX)
      .attr('y', axisLabelY)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#666')
      .attr('transform', isHorizontal ? '' : `rotate(-90, ${axisLabelX}, ${axisLabelY})`)
      .text(t('topicModeling.visualization.distance') || 'Distance (cosine)')

  }, [data, t, tooltip, orientation])

  if (!data) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
        <Typography>{t('common.noData')}</Typography>
      </Box>
    )
  }

  return (
    <D3Container
      height={height}
      showToolbar={true}
      title="topic-dendrogram"
    >
      {(dimensions) => {
        setTimeout(() => renderChart(dimensions), 0)
        return (
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            style={{ background: '#fafafa' }}
          />
        )
      }}
    </D3Container>
  )
}

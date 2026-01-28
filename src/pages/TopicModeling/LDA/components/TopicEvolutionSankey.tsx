/**
 * D3.js Sankey Chart for LDA Topic Evolution
 * Shows topic flow patterns between time periods
 * Only displays topics with actual connections
 */

import { useRef, useEffect, useState } from 'react'
import { Box, Typography, CircularProgress, Alert } from '@mui/material'
import * as d3 from 'd3'
import type { LDASankeyData, LDATopic } from '../../../../types/topicModeling'
import { useTranslation } from 'react-i18next'

interface TopicEvolutionSankeyProps {
  data: LDASankeyData | null
  topics?: LDATopic[]
  useCustomLabels?: boolean
  loading?: boolean
  error?: string | null
  onNodeClick?: (topicId: number, timestamp: string) => void
}

// Color palette for topics
const TOPIC_COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#9c27b0', '#d32f2f',
  '#00796b', '#7b1fa2', '#c2185b', '#0288d1', '#689f38',
  '#fbc02d', '#e64a19', '#512da8', '#0097a7', '#5d4037',
  '#455a64', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a'
]

const getTopicColor = (topicId: number): string => {
  return TOPIC_COLORS[topicId % TOPIC_COLORS.length]
}

export default function TopicEvolutionSankey({
  data,
  topics = [],
  useCustomLabels = false,
  loading = false,
  error = null,
  onNodeClick
}: TopicEvolutionSankeyProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, content: string } | null>(null)
  
  // Helper to get topic label with custom label support
  const getTopicLabel = (topicId: number): string => {
    if (useCustomLabels && topics.length > 0) {
      const topic = topics.find(t => t.topic_id === topicId)
      if (topic?.custom_label) {
        return topic.custom_label
      }
    }
    return t('topicModeling.lda.viz.topicLabel', 'Topic {{topicId}}', { topicId })
  }

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

  // Build and render Sankey-style diagram
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return
    if (!data || data.links.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Setup dimensions - same as other LDA charts
    const margin = { top: 70, right: 120, bottom: 50, left: 50 }
    const width = dimensions.width - margin.left - margin.right
    const height = dimensions.height - margin.top - margin.bottom

    const { timestamps, num_topics, links } = data
    const numTimestamps = timestamps.length

    if (numTimestamps < 2 || num_topics === 0) {
      svg.append('text')
        .attr('x', dimensions.width / 2)
        .attr('y', dimensions.height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text(t('topicModeling.ldaDynamic.insufficientData', 'Insufficient data for visualization'))
      return
    }

    // Title - consistent with other LDA charts
    svg.append('text')
      .attr('x', dimensions.width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.lda.viz.topicFlow', 'Topic Flow'))

    // Subtitle
    svg.append('text')
      .attr('x', dimensions.width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.lda.viz.topicFlowSubtitle', 'Topic Evolution Between Time Periods'))

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Filter significant links and find which nodes are actually used
    const significantLinks = links.filter(l => l.value > 0.01) // Only >1% weight
    
    // Find all unique topic-timestamp combinations that have connections
    const activeNodes = new Set<string>()
    significantLinks.forEach(link => {
      activeNodes.add(`${link.from_topic}@${link.from_timestamp}`)
      activeNodes.add(`${link.to_topic}@${link.to_timestamp}`)
    })

    // Group active nodes by timestamp
    const nodesByTimestamp = new Map<string, Set<number>>()
    timestamps.forEach(ts => nodesByTimestamp.set(ts, new Set()))
    
    activeNodes.forEach(key => {
      const [topicStr, ts] = key.split('@')
      const topicId = parseInt(topicStr)
      if (nodesByTimestamp.has(ts)) {
        nodesByTimestamp.get(ts)!.add(topicId)
      }
    })

    // Calculate layout
    const columnWidth = width / (numTimestamps - 1)
    const nodeWidth = Math.min(20, columnWidth * 0.25)

    // Calculate node positions based on active nodes only
    const nodePositions = new Map<string, { x: number, y: number, width: number, height: number }>()

    timestamps.forEach((ts, colIdx) => {
      const activeTopics = Array.from(nodesByTimestamp.get(ts) || []).sort((a, b) => a - b)
      const numNodes = activeTopics.length
      
      if (numNodes === 0) return

      const maxNodeHeight = 35
      const minNodeHeight = 15
      const totalAvailableHeight = height - 20
      const nodePadding = Math.max(4, Math.min(10, (totalAvailableHeight - numNodes * minNodeHeight) / (numNodes + 1)))
      const nodeHeight = Math.min(maxNodeHeight, Math.max(minNodeHeight, (totalAvailableHeight - (numNodes + 1) * nodePadding) / numNodes))
      
      const totalNodesHeight = numNodes * nodeHeight + (numNodes - 1) * nodePadding
      const startY = (height - totalNodesHeight) / 2
      
      const x = colIdx * columnWidth - nodeWidth / 2
      
      activeTopics.forEach((topicId, idx) => {
        const y = startY + idx * (nodeHeight + nodePadding)
        const nodeKey = `${topicId}@${ts}`
        nodePositions.set(nodeKey, { x, y, width: nodeWidth, height: nodeHeight })
      })
    })

    // Draw links (curved paths between nodes)
    const linkGroup = g.append('g').attr('class', 'links')

    significantLinks.forEach(link => {
      const sourceKey = `${link.from_topic}@${link.from_timestamp}`
      const targetKey = `${link.to_topic}@${link.to_timestamp}`
      const source = nodePositions.get(sourceKey)
      const target = nodePositions.get(targetKey)

      if (!source || !target) return

      const sourceX = source.x + source.width
      const sourceY = source.y + source.height / 2
      const targetX = target.x
      const targetY = target.y + target.height / 2

      // Link width based on value (min 1.5px, max 10px)
      const linkWidth = Math.max(1.5, Math.min(10, link.value * 25))

      // Create curved path
      const path = d3.path()
      const midX = (sourceX + targetX) / 2
      path.moveTo(sourceX, sourceY)
      path.bezierCurveTo(midX, sourceY, midX, targetY, targetX, targetY)

      const isSameTopic = link.from_topic === link.to_topic

      linkGroup.append('path')
        .datum(link) // Store link data
        .attr('d', path.toString())
        .attr('fill', 'none')
        .attr('stroke', getTopicColor(link.from_topic))
        .attr('stroke-opacity', isSameTopic ? 0.6 : 0.4)
        .attr('stroke-width', linkWidth)
        .style('cursor', 'pointer')
        .on('mouseenter', function(event) {
          d3.select(this)
            .attr('stroke-opacity', 0.9)
            .attr('stroke-width', linkWidth + 2)

          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) {
            const fromLabel = getTopicLabel(link.from_topic)
            const toLabel = getTopicLabel(link.to_topic)
            setTooltipData({
              x: event.clientX - rect.left + 10,
              y: event.clientY - rect.top - 10,
              content: `${fromLabel} → ${toLabel}\n${(link.value * 100).toFixed(1)}%`
            })
          }
        })
        .on('mousemove', (event) => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) {
            setTooltipData(prev => prev ? {
              ...prev,
              x: event.clientX - rect.left + 10,
              y: event.clientY - rect.top - 10
            } : null)
          }
        })
        .on('mouseleave', function() {
          d3.select(this)
            .attr('stroke-opacity', isSameTopic ? 0.6 : 0.4)
            .attr('stroke-width', linkWidth)
          setTooltipData(null)
        })
    })

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes')

    nodePositions.forEach((pos, key) => {
      const [topicStr, ts] = key.split('@')
      const topicId = parseInt(topicStr)

      const nodeG = nodeGroup.append('g')
        .attr('transform', `translate(${pos.x},${pos.y})`)
        .attr('data-key', key)
        .style('cursor', onNodeClick ? 'pointer' : 'default')

      // Node rectangle
      nodeG.append('rect')
        .attr('width', pos.width)
        .attr('height', pos.height)
        .attr('fill', getTopicColor(topicId))
        .attr('stroke', '#333')
        .attr('stroke-width', 0.5)
        .attr('rx', 3)
        .on('click', () => {
          if (onNodeClick) {
            onNodeClick(topicId, ts)
          }
        })
        .on('mouseenter', function(event) {
          d3.select(this)
            .attr('stroke-width', 2)
            .attr('stroke', '#000')

          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) {
            setTooltipData({
              x: event.clientX - rect.left + 10,
              y: event.clientY - rect.top - 10,
              content: `${getTopicLabel(topicId)}\n${ts}`
            })
          }
        })
        .on('mousemove', (event) => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) {
            setTooltipData(prev => prev ? {
              ...prev,
              x: event.clientX - rect.left + 10,
              y: event.clientY - rect.top - 10
            } : null)
          }
        })
        .on('mouseleave', function() {
          d3.select(this)
            .attr('stroke-width', 0.5)
            .attr('stroke', '#333')
          setTooltipData(null)
        })

      // Node label
      if (pos.height >= 14) {
        // Use short label for node (truncate custom label if too long)
        const label = getTopicLabel(topicId)
        const shortLabel = label.length > 6 ? label.slice(0, 5) + '..' : label
        
        nodeG.append('text')
          .attr('x', pos.width / 2)
          .attr('y', pos.height / 2)
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('font-size', Math.min(10, pos.height - 4))
          .attr('font-weight', 'bold')
          .attr('fill', '#fff')
          .attr('pointer-events', 'none')
          .text(shortLabel)
      }
    })

    // Add timestamp labels at bottom with interaction
    const timestampLabels = g.append('g').attr('class', 'timestamp-labels')
    
    timestamps.forEach((ts, idx) => {
      const x = idx * columnWidth
      const labelGroup = timestampLabels.append('g')
        .attr('transform', `translate(${x}, ${height + 25})`)
        .style('cursor', 'pointer')
      
      const labelText = labelGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', '#666')
        .attr('font-weight', '500')
        .text(ts)
      
      // Hover interaction
      labelGroup
        .on('mouseenter', function() {
          d3.select(this).select('text')
            .attr('fill', '#1976d2')
            .attr('font-weight', 'bold')
            .attr('font-size', '12px')
          
          // Highlight nodes in this column
          nodeGroup.selectAll('g').each(function(d: any) {
            const nodeKey = d3.select(this).attr('data-key')
            if (nodeKey && nodeKey.endsWith(`@${ts}`)) {
              d3.select(this).select('rect')
                .attr('stroke', '#1976d2')
                .attr('stroke-width', 2)
            }
          })
          
          // Highlight links connected to this timestamp
          linkGroup.selectAll('path').each(function(d: any) {
            const linkData = d3.select(this).datum() as any
            if (linkData && (linkData.from_timestamp === ts || linkData.to_timestamp === ts)) {
              const currentWidth = parseFloat(d3.select(this).attr('stroke-width')) || 2
              d3.select(this)
                .attr('stroke-opacity', 0.8)
                .attr('stroke-width', currentWidth + 2)
            }
          })
        })
        .on('mouseleave', function() {
          d3.select(this).select('text')
            .attr('fill', '#666')
            .attr('font-weight', '500')
            .attr('font-size', '11px')
          
          // Reset node highlights
          nodeGroup.selectAll('g rect')
            .attr('stroke', '#333')
            .attr('stroke-width', 0.5)
          
          // Reset link highlights
          linkGroup.selectAll('path').each(function() {
            const linkData = d3.select(this).datum() as any
            if (linkData) {
              const isSameTopic = linkData.from_topic === linkData.to_topic
              const linkWidth = Math.max(1.5, Math.min(10, (linkData.value || 0) * 25))
              d3.select(this)
                .attr('stroke-opacity', isSameTopic ? 0.6 : 0.4)
                .attr('stroke-width', linkWidth)
            }
          })
        })
        .on('click', function() {
          // Could add click handler to filter or highlight
          console.log('Clicked timestamp:', ts)
        })
      
      // Store timestamp for node matching
      labelGroup.attr('data-timestamp', ts)
    })

    // X axis label
    svg.append('text')
      .attr('x', dimensions.width / 2)
      .attr('y', dimensions.height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(t('topicModeling.ldaDynamic.timePeriod', 'Time Period'))

    // Legend - on the right side with interaction
    const uniqueTopics = Array.from(new Set(
      significantLinks.flatMap(l => [l.from_topic, l.to_topic])
    )).sort((a, b) => a - b).slice(0, 12)

    const legend = svg.append('g')
      .attr('transform', `translate(${dimensions.width - margin.right + 20}, ${margin.top + 20})`)

    uniqueTopics.forEach((topicId, i) => {
      const row = legend.append('g')
        .attr('transform', `translate(0,${i * 20})`)
        .attr('data-topic-id', topicId)
        .style('cursor', 'pointer')

      row.append('rect')
        .attr('width', 14)
        .attr('height', 14)
        .attr('fill', getTopicColor(topicId))
        .attr('rx', 2)
        .attr('stroke', 'none')
        .attr('stroke-width', 0)

      // Use custom label in legend (truncate if too long)
      const legendLabel = getTopicLabel(topicId)
      const truncatedLabel = legendLabel.length > 15 ? legendLabel.slice(0, 14) + '...' : legendLabel
      
      row.append('text')
        .attr('x', 20)
        .attr('y', 11)
        .attr('font-size', '11px')
        .attr('fill', '#444')
        .attr('font-weight', 'normal')
        .text(truncatedLabel)

      // Legend item hover interaction
      row
        .on('mouseenter', function() {
          // Highlight this legend item
          d3.select(this).select('rect')
            .attr('stroke', '#1976d2')
            .attr('stroke-width', 2)
          d3.select(this).select('text')
            .attr('fill', '#1976d2')
            .attr('font-weight', 'bold')

          // Highlight related nodes
          nodeGroup.selectAll('g').each(function() {
            const nodeKey = d3.select(this).attr('data-key')
            if (nodeKey) {
              const nodeTopicId = parseInt(nodeKey.split('@')[0])
              if (nodeTopicId === topicId) {
                d3.select(this).select('rect')
                  .attr('stroke', '#1976d2')
                  .attr('stroke-width', 2)
              } else {
                d3.select(this).select('rect')
                  .attr('opacity', 0.3)
              }
            }
          })

          // Highlight related links
          linkGroup.selectAll('path').each(function() {
            const linkData = d3.select(this).datum() as any
            if (linkData) {
              if (linkData.from_topic === topicId || linkData.to_topic === topicId) {
                d3.select(this)
                  .attr('stroke-opacity', 0.8)
                  .attr('stroke-width', parseFloat(d3.select(this).attr('stroke-width')) + 2)
              } else {
                d3.select(this)
                  .attr('stroke-opacity', 0.1)
              }
            }
          })

          // Dim other legend items
          legend.selectAll('g').each(function() {
            const otherTopicId = parseInt(d3.select(this).attr('data-topic-id') || '-1')
            if (otherTopicId !== topicId && otherTopicId !== -1) {
              d3.select(this).select('rect').attr('opacity', 0.3)
              d3.select(this).select('text').attr('opacity', 0.3)
            }
          })
        })
        .on('mouseleave', function() {
          // Reset this legend item
          d3.select(this).select('rect')
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
          d3.select(this).select('text')
            .attr('fill', '#444')
            .attr('font-weight', 'normal')

          // Reset all nodes
          nodeGroup.selectAll('g rect')
            .attr('stroke', '#333')
            .attr('stroke-width', 0.5)
            .attr('opacity', 1)

          // Reset all links
          linkGroup.selectAll('path').each(function() {
            const linkData = d3.select(this).datum() as any
            if (linkData) {
              const isSameTopic = linkData.from_topic === linkData.to_topic
              const linkWidth = Math.max(1.5, Math.min(10, (linkData.value || 0) * 25))
              d3.select(this)
                .attr('stroke-opacity', isSameTopic ? 0.6 : 0.4)
                .attr('stroke-width', linkWidth)
            }
          })

          // Reset all legend items
          legend.selectAll('g').each(function() {
            d3.select(this).select('rect').attr('opacity', 1)
            d3.select(this).select('text').attr('opacity', 1)
          })
        })
        .on('click', function() {
          // Click to trigger node click callback if provided
          if (onNodeClick) {
            onNodeClick(topicId, '')
          }
        })
    })

  }, [data, dimensions, onNodeClick, t])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  if (!data || data.links.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography color="text.secondary">
          {t('topicModeling.ldaDynamic.noSankeyData', 'No topic flow data available')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        display: 'flex',
        position: 'relative'
      }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />

      {/* Tooltip */}
      {tooltipData && (
        <Box
          sx={{
            position: 'absolute',
            left: tooltipData.x,
            top: tooltipData.y,
            bgcolor: 'rgba(0,0,0,0.85)',
            color: 'white',
            px: 1.5,
            py: 0.75,
            borderRadius: 1,
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 100,
            whiteSpace: 'pre-line',
            maxWidth: 200
          }}
        >
          {tooltipData.content}
        </Box>
      )}
    </Box>
  )
}

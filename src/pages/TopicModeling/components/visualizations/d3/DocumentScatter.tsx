/**
 * Document Scatter Plot
 * D3.js implementation of BERTopic's visualize_documents()
 * Shows documents as points colored by topic assignment
 * Plotly-style visualization with interactive legend
 */

import { useRef, useCallback, useState, useEffect } from 'react'
import * as d3 from 'd3'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import D3Container from './D3Container'
import { useTooltip, getTopicColor, truncateText } from './useD3'

interface DocumentData {
  x: number
  y: number
  topic: number
  topic_name: string
  doc_preview: string
  color?: string
}

interface DocumentScatterProps {
  data: DocumentData[]
  height?: number
  totalDocs?: number
  sampleSize?: number
  showTopicCenters?: boolean
}

export default function DocumentScatter({ 
  data, 
  height = 600,
  totalDocs,
  sampleSize,
  showTopicCenters = false
}: DocumentScatterProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltip = useTooltip()
  const [, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity)
  // Use ref only to track hiddenTopics - no React state to avoid re-renders
  const hiddenTopicsRef = useRef<Set<number>>(new Set())
  // Track all topics for toggling
  const allTopicsRef = useRef<number[]>([])
  
  // Reset hidden topics when data changes
  useEffect(() => {
    hiddenTopicsRef.current = new Set()
  }, [data])

  const renderChart = useCallback((dimensions: { width: number; height: number }) => {
    if (!svgRef.current || !data || data.length === 0) return

    const { width, height: h } = dimensions
    const margin = { top: 60, right: 180, bottom: 50, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = h - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Main group with margins
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .attr('fill', '#2c3e50')
      .text(t('topicModeling.visualization.documentDistribution'))

    // Subtitle with sample info
    const subtitle = sampleSize && totalDocs 
      ? t('topicModeling.visualization.documentsAndTopicsSample', 'Documents and Topics ({{sample}} / {{total}})', { sample: sampleSize.toLocaleString(), total: totalDocs.toLocaleString() })
      : t('topicModeling.visualization.documentsAndTopics', 'Documents and Topics')
    
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text(subtitle)

    // Calculate scales
    const xExtent = d3.extent(data, d => d.x) as [number, number]
    const yExtent = d3.extent(data, d => d.y) as [number, number]
    const xPadding = (xExtent[1] - xExtent[0]) * 0.08
    const yPadding = (yExtent[1] - yExtent[0]) * 0.08

    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([0, innerWidth])

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([innerHeight, 0])

    // Get unique topics for coloring
    const topics = [...new Set(data.map(d => d.topic))].sort((a, b) => a - b)
    const topicColorMap = new Map<number, string>()
    let colorIndex = 0
    topics.forEach(topic => {
      if (topic === -1) {
        topicColorMap.set(topic, '#9ca3af') // Gray for outliers - visible but not prominent
      } else {
        topicColorMap.set(topic, getTopicColor(colorIndex++))
      }
    })

    // Grid lines - Plotly style
    const xAxis = d3.axisBottom(xScale).ticks(5).tickSize(-innerHeight)
    const yAxis = d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth)

    g.append('g')
      .attr('class', 'grid x-grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call(g => g.selectAll('.tick line').attr('stroke', '#eee').attr('stroke-width', 1))
      .call(g => g.selectAll('.tick text').attr('fill', '#999').attr('font-size', '10px'))
      .call(g => g.select('.domain').attr('stroke', '#ddd'))

    g.append('g')
      .attr('class', 'grid y-grid')
      .call(yAxis)
      .call(g => g.selectAll('.tick line').attr('stroke', '#eee').attr('stroke-width', 1))
      .call(g => g.selectAll('.tick text').attr('fill', '#999').attr('font-size', '10px'))
      .call(g => g.select('.domain').attr('stroke', '#ddd'))

    // Axis labels
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 38)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(t('topicModeling.visualization.umap1', 'UMAP 1'))

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '500')
      .attr('fill', '#555')
      .text(t('topicModeling.visualization.umap2', 'UMAP 2'))

    // Clip path for zoom
    const clipId = `chart-clip-${Math.random().toString(36).substr(2, 9)}`
    svg.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)

    // Points container
    const pointsGroup = g.append('g')
      .attr('class', 'points')
      .attr('clip-path', `url(#${clipId})`)

    // Topic centers group (if enabled)
    const centersGroup = g.append('g').attr('class', 'centers')

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 10])
      .on('zoom', (event) => {
        setTransform(event.transform)
        pointsGroup.attr('transform', event.transform.toString())
        centersGroup.attr('transform', event.transform.toString())
      })

    svg.call(zoom)

    // Draw points - Plotly style
    // Use topicColorMap consistently for both points and legend to ensure color matching
    const currentHidden = hiddenTopicsRef.current
    const points = pointsGroup.selectAll('.point')
      .data(data)
      .join('circle')
      .attr('class', d => `point topic-${d.topic}`)
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 0)
      .attr('fill', d => topicColorMap.get(d.topic) || '#999')
      .attr('fill-opacity', d => d.topic === -1 ? 0.5 : 0.7)
      .attr('stroke', 'white')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .style('display', d => currentHidden.has(d.topic) ? 'none' : 'block')

    // Animate points - outliers have same size as other topics
    points.transition()
      .duration(500)
      .delay(() => Math.random() * 200)
      .attr('r', 4)

    // Calculate topic centers if enabled
    if (showTopicCenters) {
      const topicCenters = new Map<number, { x: number; y: number; name: string }>()
      topics.filter(t => t !== -1).forEach(topic => {
        const topicPoints = data.filter(d => d.topic === topic)
        if (topicPoints.length > 0) {
          const centerX = d3.mean(topicPoints, d => d.x) || 0
          const centerY = d3.mean(topicPoints, d => d.y) || 0
          topicCenters.set(topic, { 
            x: centerX, 
            y: centerY, 
            name: topicPoints[0].topic_name 
          })
        }
      })

      // Draw topic center labels
      centersGroup.selectAll('.center-label')
        .data(Array.from(topicCenters.entries()))
        .join('text')
        .attr('class', 'center-label')
        .attr('x', ([, c]) => xScale(c.x))
        .attr('y', ([, c]) => yScale(c.y))
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.5em')
        .attr('font-size', '11px')
        .attr('font-weight', 'bold')
        .attr('fill', ([topic]) => topicColorMap.get(topic) || '#333')
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('paint-order', 'stroke')
        .text(([, c]) => truncateText(c.name, 15))
        .style('display', ([topic]) => currentHidden.has(topic) ? 'none' : 'block')
    }

    // Hover interactions
    points
      .on('mouseenter', function(event, d) {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('r', 8)
          .attr('fill-opacity', 1)
          .attr('stroke-width', 2)
        
        const color = topicColorMap.get(d.topic) || '#999'
        const outliersLabel = t('topicModeling.visualization.outliers') || 'Outliers'
        tooltip.show(`
          <div style="margin-bottom:8px;">
            <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;margin-right:8px;"></span>
            <span style="font-weight:bold;color:${d.topic === -1 ? '#666' : color}">
              ${d.topic === -1 ? outliersLabel : d.topic_name}
            </span>
          </div>
          <div style="color:#666;font-size:12px;max-width:300px;line-height:1.5;word-break:break-word;">
            ${d.doc_preview}
          </div>
        `, event)
      })
      .on('mousemove', (event) => {
        tooltip.move(event)
      })
      .on('mouseleave', function(_, d) {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('r', 4)
          .attr('fill-opacity', d.topic === -1 ? 0.5 : 0.7)
          .attr('stroke-width', 0.5)
        tooltip.hide()
      })

    // Legend - Plotly style with click-to-toggle
    // Group documents by topic to get counts
    const topicCounts = new Map<number, number>()
    data.forEach(d => {
      topicCounts.set(d.topic, (topicCounts.get(d.topic) || 0) + 1)
    })
    
    // Sort non-outlier topics by document count (descending), outliers last
    const sortedTopics = topics.filter(t => t !== -1)
      .sort((a, b) => (topicCounts.get(b) || 0) - (topicCounts.get(a) || 0))
      .slice(0, 15) // Show max 15 topics in legend
    if (topics.includes(-1)) sortedTopics.push(-1)
    const legendTopics = sortedTopics

    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - 170}, 60)`)

    // Store ALL topics (not just legend topics) for toggle operations
    // This ensures clicking legend items affects all data points, not just visible ones
    allTopicsRef.current = topics

    // Helper function to update visibility - direct DOM manipulation, no React state
    const updateVisibility = (newHidden: Set<number>) => {
      hiddenTopicsRef.current = newHidden
      
      // Update ALL points visibility - re-bind data to ensure correct selection
      pointsGroup.selectAll('.point')
        .data(data)
        .style('display', d => newHidden.has(d.topic) ? 'none' : 'block')
      
      // Update ALL legend items styles to reflect current state
      legend.selectAll('.legend-item').each(function(d: any) {
        const isHidden = newHidden.has(d)
        d3.select(this).select('circle')
          .attr('fill-opacity', isHidden ? 0.3 : 1)
        d3.select(this).select('text')
          .attr('fill', isHidden ? '#bbb' : '#555')
      })
      
      // Update center labels if shown
      if (showTopicCenters) {
        centersGroup.selectAll('.center-label')
          .style('display', function(d: any) {
            const topic = Array.isArray(d) ? d[0] : d
            return newHidden.has(topic as number) ? 'none' : 'block'
          })
      }
    }

    const legendItems = legend.selectAll('.legend-item')
      .data(legendTopics)
      .join('g')
      .attr('class', 'legend-item')
      .attr('transform', (_, i) => `translate(0, ${i * 22})`)
      .style('cursor', 'pointer')
      .on('click', function(event, topic) {
        event.preventDefault()
        event.stopPropagation()
        
        const currentHidden = hiddenTopicsRef.current
        const newHidden = new Set(currentHidden)
        const allTopics = allTopicsRef.current
        
        // Toggle: if hidden, show it; if visible, hide it
        if (newHidden.has(topic)) {
          newHidden.delete(topic)
        } else {
          // Before hiding, check if this would hide all topics
          const currentlyVisible = allTopics.filter(t => !currentHidden.has(t))
          if (currentlyVisible.length === 1 && currentlyVisible[0] === topic) {
            // Don't hide the last visible topic - prevent empty chart
            return
          }
          newHidden.add(topic)
        }
        
        updateVisibility(newHidden)
      })
      .on('dblclick', function(event, topic) {
        event.preventDefault()
        event.stopPropagation()
        
        const allTopics = allTopicsRef.current
        const currentHidden = hiddenTopicsRef.current
        
        // Check if only this topic is visible
        const visibleTopics = allTopics.filter(t => !currentHidden.has(t))
        const onlyThisVisible = visibleTopics.length === 1 && visibleTopics[0] === topic
        
        if (onlyThisVisible) {
          // If only this topic is visible, show all topics
          updateVisibility(new Set())
        } else {
          // Otherwise, solo this topic (hide all others)
          const newHidden = new Set(allTopics.filter(t => t !== topic))
          updateVisibility(newHidden)
        }
      })
      .on('mouseenter', function(_, topic) {
        const currentHidden = hiddenTopicsRef.current
        if (!currentHidden.has(topic)) {
          // Highlight points of this topic - use direct selection
          pointsGroup.selectAll('.point')
            .data(data)
            .attr('fill-opacity', d => {
              if (currentHidden.has(d.topic)) return 0
              return d.topic === topic ? 1 : 0.1
            })
        }
      })
      .on('mouseleave', function() {
        const currentHidden = hiddenTopicsRef.current
        pointsGroup.selectAll('.point')
          .data(data)
          .attr('fill-opacity', d => {
            if (currentHidden.has(d.topic)) return 0
            return d.topic === -1 ? 0.5 : 0.7
          })
      })

    // Initialize legend items with current hidden state
    const currentHiddenState = hiddenTopicsRef.current
    
    legendItems.append('circle')
      .attr('r', 5)
      .attr('fill', d => topicColorMap.get(d) || '#999')
      .attr('fill-opacity', d => currentHiddenState.has(d) ? 0.3 : 1)

    legendItems.append('text')
      .attr('x', 12)
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('fill', d => currentHiddenState.has(d) ? '#bbb' : '#555')
      .text(d => {
        const count = topicCounts.get(d) || 0
        const outliersLabel = t('topicModeling.visualization.outliers') || 'Outliers'
        if (d === -1) return `${outliersLabel} (${count})`
        const topicData = data.find(item => item.topic === d)
        const name = topicData ? topicData.topic_name : `Topic ${d}`
        // Truncate name to 16 chars and add count
        const shortName = name.length > 16 ? name.substring(0, 16) + '...' : name
        return `${shortName} (${count})`
      })

    // Legend title - add more spacing from items
    legend.append('text')
      .attr('x', 0)
      .attr('y', -16)
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .attr('fill', '#555')
      .text(t('topicModeling.visualization.topics') || 'Topics')

  }, [data, t, tooltip, totalDocs, sampleSize, showTopicCenters])  // Removed hiddenTopics from deps, using ref instead

  const handleZoomIn = useCallback(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(300).call(
      (d3.zoom() as any).scaleBy, 1.3
    )
  }, [])

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(300).call(
      (d3.zoom() as any).scaleBy, 0.7
    )
  }, [])

  const handleReset = useCallback(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(500).call(
      (d3.zoom() as any).transform, d3.zoomIdentity
    )
  }, [])

  if (!data || data.length === 0) {
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
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onReset={handleReset}
      title="document-distribution"
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


/**
 * Word Sketch D3 Visualization
 * Network/bubble chart visualization of word relations
 */

import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { 
  Box, 
  Typography, 
  Stack, 
  Chip, 
  FormControl, 
  Select, 
  MenuItem, 
  InputLabel,
  Paper,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import * as d3 from 'd3'
import { useTranslation } from 'react-i18next'
import type { WordSketchResult } from '../../../api/sketch'
import NumberInput from '../../../components/common/NumberInput'

interface Props {
  result: WordSketchResult | null
  selectedRelation: string
  onRelationChange: (relation: string) => void
}

interface Node {
  id: string
  label: string
  type: 'center' | 'relation' | 'collocate'
  frequency?: number
  score?: number
  relation?: string
}

interface Link {
  source: string
  target: string
  value: number
}

export default function SketchVisualization({ result, selectedRelation, onRelationChange }: Props) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [maxWords, setMaxWords] = useState(10)

  // Export SVG
  const handleExportSVG = useCallback(() => {
    if (!svgRef.current) return

    const svgElement = svgRef.current
    
    // Get the content group's bounding box to capture all content
    const gElement = svgElement.querySelector('g')
    if (!gElement) return
    
    // Get the bounding box of all content
    const bbox = gElement.getBBox()
    const padding = 60
    const width = bbox.width + padding * 2
    const height = bbox.height + padding * 2
    
    // Clone SVG to preserve the content
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement
    
    // Set viewBox to capture all content
    svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`)
    svgClone.setAttribute('width', String(width))
    svgClone.setAttribute('height', String(height))
    
    // Remove zoom transform from the cloned SVG
    const clonedG = svgClone.querySelector('g')
    if (clonedG) {
      clonedG.removeAttribute('transform')
    }
    
    // Add white background as first element
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bgRect.setAttribute('x', String(bbox.x - padding))
    bgRect.setAttribute('y', String(bbox.y - padding))
    bgRect.setAttribute('width', String(width))
    bgRect.setAttribute('height', String(height))
    bgRect.setAttribute('fill', '#ffffff')
    svgClone.insertBefore(bgRect, svgClone.firstChild)
    
    // Serialize the cloned SVG
    const svgData = new XMLSerializer().serializeToString(svgClone)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `word-sketch-${result?.word || 'graph'}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }, [result?.word])

  // Export PNG
  const handleExportPNG = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return

    const svgElement = svgRef.current
    
    // Get the content group's bounding box to capture all content
    const gElement = svgElement.querySelector('g')
    if (!gElement) return
    
    // Get the bounding box of all content
    const bbox = gElement.getBBox()
    const padding = 60
    const width = bbox.width + padding * 2
    const height = bbox.height + padding * 2
    
    // Clone SVG to preserve the content
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement
    
    // Set viewBox to capture all content
    svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`)
    svgClone.setAttribute('width', String(width))
    svgClone.setAttribute('height', String(height))
    
    // Remove zoom transform from the cloned SVG
    const clonedG = svgClone.querySelector('g')
    if (clonedG) {
      clonedG.removeAttribute('transform')
    }
    
    // Add white background as first element
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bgRect.setAttribute('x', String(bbox.x - padding))
    bgRect.setAttribute('y', String(bbox.y - padding))
    bgRect.setAttribute('width', String(width))
    bgRect.setAttribute('height', String(height))
    bgRect.setAttribute('fill', '#ffffff')
    svgClone.insertBefore(bgRect, svgClone.firstChild)
    
    // Convert to data URL
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgClone)
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)
    
    // Create image and canvas with high resolution
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 3 // High resolution
      canvas.width = width * scale
      canvas.height = height * scale
      
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(svgUrl)
        return
      }
      
      ctx.scale(scale, scale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      
      URL.revokeObjectURL(svgUrl)
      
      canvas.toBlob((blob) => {
        if (!blob) return
        
        const pngUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = pngUrl
      link.download = `word-sketch-${result?.word || 'graph'}.png`
      link.click()
        
        URL.revokeObjectURL(pngUrl)
      }, 'image/png', 1.0)
    }
    
    img.onerror = () => {
      console.error('Failed to load SVG for PNG export')
      URL.revokeObjectURL(svgUrl)
    }
    
    img.src = svgUrl
  }, [result?.word])

  // Get available relations
  const relations = useMemo(() => {
    if (!result?.relations) return []
    return Object.keys(result.relations)
  }, [result])

  // Build graph data
  const graphData = useMemo(() => {
    if (!result?.relations) return { nodes: [], links: [] }

    const nodes: Node[] = []
    const links: Link[] = []
    const nodeIds = new Set<string>()

    // Add center word
    const centerId = `center-${result.word}`
    nodes.push({
      id: centerId,
      label: result.word,
      type: 'center'
    })
    nodeIds.add(centerId)

    // Filter by selected relation or show all
    const relationsToShow = selectedRelation === 'all' 
      ? Object.entries(result.relations)
      : Object.entries(result.relations).filter(([name]) => name === selectedRelation)

    relationsToShow.forEach(([relName, relData]) => {
      // Skip if relData is invalid
      if (!relData) return
      
      // Add relation node
      const relId = `rel-${relName}`
      if (!nodeIds.has(relId)) {
        // Safely get display name with fallback
        const displayName = (relData.display_en || relName)
          .replace('[verb]', result.word)
          .replace('[noun]', result.word)
          .replace('[adjective]', result.word)
          .replace('[adverb]', result.word)
        
        nodes.push({
          id: relId,
          label: displayName,
          type: 'relation'
        })
        nodeIds.add(relId)

        // Link center to relation
        const collocations = relData.collocations || []
        links.push({
          source: centerId,
          target: relId,
          value: collocations.length
        })
      }

      // Add collocate nodes (limit to maxWords per relation)
      const collocations = relData.collocations || []
      collocations.slice(0, maxWords).forEach((coll) => {
        const collId = `coll-${coll.lemma}-${relName}`
        if (!nodeIds.has(collId)) {
          nodes.push({
            id: collId,
            label: coll.lemma,
            type: 'collocate',
            frequency: coll.frequency,
            score: coll.score,
            relation: relName
          })
          nodeIds.add(collId)
        }

        // Link relation to collocate
        links.push({
          source: relId,
          target: collId,
          value: coll.frequency
        })
      })
    })

    return { nodes, links }
  }, [result, selectedRelation, maxWords])

  // D3 force simulation
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return

    const container = containerRef.current
    const width = container.clientWidth || 800
    const height = container.clientHeight || 600

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])

    // Add zoom behavior
    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    // Color scales
    const colorScale = d3.scaleOrdinal<string>()
      .domain(['center', 'relation', 'collocate'])
      .range(['#1976d2', '#ff9800', '#4caf50'])

    // Size scale for collocates
    const sizeScale = d3.scaleSqrt()
      .domain([1, d3.max(graphData.nodes, d => d.frequency || 1) || 1])
      .range([6, 20])

    // Create simulation
    const simulation = d3.forceSimulation(graphData.nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(graphData.links)
        .id((d: any) => d.id)
        .distance(100)
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30))

    // Draw links
    const link = g.append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.4)
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('stroke-width', (d: any) => Math.sqrt(d.value))

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .join('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        }) as any)

    // Add circles
    node.append('circle')
      .attr('r', (d: Node) => {
        if (d.type === 'center') return 25
        if (d.type === 'relation') return 15
        return sizeScale(d.frequency || 1)
      })
      .attr('fill', (d: Node) => colorScale(d.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Add labels
    node.append('text')
      .text((d: Node) => d.label)
      .attr('font-size', (d: Node) => {
        if (d.type === 'center') return '14px'
        if (d.type === 'relation') return '11px'
        return '10px'
      })
      .attr('font-weight', (d: Node) => d.type === 'center' ? 'bold' : 'normal')
      .attr('fill', '#333')
      .attr('text-anchor', 'middle')
      .attr('dy', (d: Node) => {
        if (d.type === 'center') return 35
        if (d.type === 'relation') return 25
        return sizeScale(d.frequency || 1) + 12
      })

    // Add tooltips
    node.append('title')
      .text((d: Node) => {
        if (d.type === 'collocate') {
          return `${d.label}\nFrequency: ${d.frequency}\nScore: ${d.score?.toFixed(2)}`
        }
        return d.label
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

    // Cleanup
    return () => {
      simulation.stop()
    }
  }, [graphData])

  // Render empty state
  const renderEmptyState = () => (
    <Box sx={{ 
      height: '100%', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 2,
      p: 4,
      bgcolor: 'transparent',
      m: 1,
      borderRadius: 2
    }}>
      <BubbleChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
      <Typography variant="h6" color="text.secondary">
        {t('wordsketch.visualization')}
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        {t('wordsketch.viz.runAnalysisFirst')}
      </Typography>
    </Box>
  )

  // Show empty state if no result or no graph data
  if (!result || !result.relations || Object.keys(result.relations).length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {renderEmptyState()}
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Parameter Bar - matches WordFrequency VisualizationPanel style */}
      <Paper 
        elevation={0} 
        sx={{ 
          px: 2, 
          py: 1.5, 
          borderBottom: 1, 
          borderColor: 'divider',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}
      >
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
          {/* Relation Filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('wordsketch.selectRelation')}</InputLabel>
            <Select
              value={selectedRelation}
              onChange={(e) => onRelationChange(e.target.value)}
              label={t('wordsketch.selectRelation')}
            >
              <MenuItem value="all">{t('common.all')}</MenuItem>
              {relations.map(rel => (
                <MenuItem key={rel} value={rel}>{rel}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Max Words per Relation */}
          <NumberInput
            label={t('wordsketch.maxWords')}
            size="small"
            value={maxWords}
            onChange={setMaxWords}
            min={5}
            max={30}
            step={5}
            integer
            sx={{ width: 140 }}
          />

          {/* Legend */}
          <Stack direction="row" spacing={1}>
            <Chip 
              size="small" 
              label={t('wordsketch.centerWord')}
              sx={{ bgcolor: '#1976d2', color: 'white', height: 24 }}
            />
            <Chip 
              size="small" 
              label={t('wordsketch.relation')}
              sx={{ bgcolor: '#ff9800', color: 'white', height: 24 }}
            />
            <Chip 
              size="small" 
              label={t('wordsketch.collocate')}
              sx={{ bgcolor: '#4caf50', color: 'white', height: 24 }}
            />
          </Stack>
        </Stack>

        {/* Export buttons */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          <Tooltip title={t('wordsketch.exportSvg')}>
            <IconButton size="small" onClick={handleExportSVG}>
              <SaveAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('wordsketch.exportPng')}>
            <IconButton size="small" onClick={handleExportPNG}>
              <ImageIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* SVG container with rounded background */}
      <Box 
        ref={containerRef}
        sx={{ 
          flex: 1, 
          overflow: 'hidden',
          bgcolor: 'transparent',
          m: 1,
          borderRadius: 2,
          minHeight: 0
        }}
      >
        <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    </Box>
  )
}


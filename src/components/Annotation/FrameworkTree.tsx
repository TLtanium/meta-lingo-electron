/**
 * FrameworkTree Component
 * D3.js based interactive tree visualization for annotation frameworks
 * 
 * Features:
 * - Tier nodes: Rounded rectangles with gray background (not clickable)
 * - Label nodes: Ellipses with unique colors based on path hash (clickable)
 * - Selected effect: Golden border with glow
 * - Orthogonal connecting lines
 * - Pan and zoom support
 */

import { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react'
import * as d3 from 'd3'
import { Box, Typography, IconButton, Tooltip, useTheme, CircularProgress } from '@mui/material'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import { useTranslation } from 'react-i18next'
import type { FrameworkNode, SelectedLabel } from '../../types'

interface FrameworkTreeProps {
  root: FrameworkNode
  selectedLabel: SelectedLabel | null
  onLabelSelect: (label: SelectedLabel | null) => void
}

// Node dimensions
const TIER_WIDTH = 100
const TIER_HEIGHT = 32
const LABEL_RX = 50  // Ellipse x radius
const LABEL_RY = 18  // Ellipse y radius
const NODE_SPACING_X = 180
const NODE_SPACING_Y = 50

// Colors
const TIER_BG = '#607D8B'
const TIER_TEXT = '#FFFFFF'
const SELECTED_STROKE = '#FFD700'
const SELECTED_GLOW = 'rgba(255, 215, 0, 0.5)'
const LINK_COLOR = '#90A4AE'

/**
 * Generate color for a path (matches backend logic)
 */
function generateColorForPath(path: string): string {
  // Simple hash function
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  
  // Use absolute value and convert to RGB
  hash = Math.abs(hash)
  const r = 120 + (hash % 100)
  const g = 120 + ((hash >> 8) % 100)
  const b = 120 + ((hash >> 16) % 100)
  
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Recursively add path to all nodes in the tree
 */
function addPathsToTree(node: FrameworkNode, parentPath: string = ''): FrameworkNode & { path: string } {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name
  
  return {
    ...node,
    path: currentPath,
    children: node.children?.map(child => addPathsToTree(child, currentPath))
  }
}

/**
 * Build hierarchical data structure for D3
 */
function buildHierarchy(node: FrameworkNode): d3.HierarchyNode<FrameworkNode & { path: string }> {
  // First, add paths to all nodes recursively
  const nodeWithPaths = addPathsToTree(node)
  
  // Then create the D3 hierarchy using the standard children accessor
  const hierarchy = d3.hierarchy(nodeWithPaths, d => d.children)
  
  return hierarchy
}

export default function FrameworkTree({
  root,
  selectedLabel,
  onLabelSelect
}: FrameworkTreeProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const [currentZoom, setCurrentZoom] = useState(1)
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 })
  const [exporting, setExporting] = useState(false)

  // Observe container size changes
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setDimensions({ width, height })
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Handle node click
  const handleNodeClick = useCallback((event: MouseEvent, d: d3.HierarchyPointNode<FrameworkNode & { path: string }>) => {
    event.stopPropagation()
    
    // Only label nodes are clickable
    if (d.data.type === 'tier') return
    
    const color = d.data.color || generateColorForPath(d.data.path)
    
    // Toggle selection
    if (selectedLabel?.path === d.data.path) {
      onLabelSelect(null)
    } else {
      onLabelSelect({
        node: d.data,
        path: d.data.path,
        color
      })
    }
  }, [selectedLabel, onLabelSelect])

  // Render the tree
  useEffect(() => {
    if (!svgRef.current || !root || dimensions.width <= 0 || dimensions.height <= 0) return

    const { width, height } = dimensions
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Create defs for filters
    const defs = svg.append('defs')
    
    // Glow filter for selected nodes
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%')
    
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur')
    
    const feMerge = filter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Create main group for zoom/pan
    const g = svg.append('g')
      .attr('class', 'tree-container')
    gRef.current = g.node()

    // Build hierarchy
    const hierarchy = buildHierarchy(root)
    
    // Create tree layout
    const treeLayout = d3.tree<FrameworkNode & { path: string }>()
      .nodeSize([NODE_SPACING_Y, NODE_SPACING_X])
      .separation((a, b) => a.parent === b.parent ? 1 : 1.5)

    const treeData = treeLayout(hierarchy)
    const nodes = treeData.descendants()
    const links = treeData.links()

    // Store node positions for focus functionality
    // Note: positions are stored AFTER calculating offsets, so they represent
    // the actual position in the g-element's coordinate system
    const positions = new Map<string, { x: number; y: number }>()
    nodes.forEach(d => {
      if (d.data.type === 'label') {
        // d.y is horizontal position, d.x is vertical position in D3 tree layout
        positions.set(d.data.path, { x: d.y, y: d.x })
      }
    })
    nodePositionsRef.current = positions

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    nodes.forEach(d => {
      if (d.x < minX) minX = d.x
      if (d.x > maxX) maxX = d.x
      if (d.y < minY) minY = d.y
      if (d.y > maxY) maxY = d.y
    })

    // Center the tree
    const treeWidth = maxY - minY + NODE_SPACING_X
    const treeHeight = maxX - minX + NODE_SPACING_Y * 2
    const offsetX = (width - treeWidth) / 2 - minY + NODE_SPACING_X / 2
    const offsetY = (height - treeHeight) / 2 - minX + NODE_SPACING_Y

    g.attr('transform', `translate(${offsetX}, ${offsetY})`)

    // Draw links (orthogonal style)
    const linkGenerator = d3.linkHorizontal<d3.HierarchyLink<FrameworkNode & { path: string }>, d3.HierarchyPointNode<FrameworkNode & { path: string }>>()
      .x(d => d.y)
      .y(d => d.x)

    g.selectAll('.link')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', LINK_COLOR)
      .attr('stroke-width', 2)
      .attr('d', d => {
        // Custom orthogonal path
        const sourceX = d.source.y
        const sourceY = d.source.x
        const targetX = d.target.y
        const targetY = d.target.x
        const midX = (sourceX + targetX) / 2
        
        return `M${sourceX},${sourceY} H${midX} V${targetY} H${targetX}`
      })

    // Draw nodes
    const nodeGroups = g.selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', d => `node node-${d.data.type}`)
      .attr('transform', d => `translate(${d.y}, ${d.x})`)
      .style('cursor', d => d.data.type === 'label' ? 'pointer' : 'default')
      .on('click', function(event, d) {
        handleNodeClick(event as MouseEvent, d)
      })

    // Draw tier nodes (rounded rectangles)
    nodeGroups.filter(d => d.data.type === 'tier')
      .append('rect')
      .attr('x', -TIER_WIDTH / 2)
      .attr('y', -TIER_HEIGHT / 2)
      .attr('width', TIER_WIDTH)
      .attr('height', TIER_HEIGHT)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('fill', TIER_BG)
      .attr('stroke', '#455A64')
      .attr('stroke-width', 2)

    // Draw label nodes (ellipses)
    nodeGroups.filter(d => d.data.type === 'label')
      .each(function(d) {
        const group = d3.select(this)
        const isSelected = selectedLabel?.path === d.data.path
        const color = d.data.color || generateColorForPath(d.data.path)
        
        // Selection glow effect
        if (isSelected) {
          group.append('ellipse')
            .attr('rx', LABEL_RX + 4)
            .attr('ry', LABEL_RY + 4)
            .attr('fill', 'none')
            .attr('stroke', SELECTED_STROKE)
            .attr('stroke-width', 3)
            .attr('filter', 'url(#glow)')
        }
        
        // Main ellipse
        group.append('ellipse')
          .attr('rx', LABEL_RX)
          .attr('ry', LABEL_RY)
          .attr('fill', color)
          .attr('stroke', isSelected ? SELECTED_STROKE : '#666')
          .attr('stroke-width', isSelected ? 3 : 1.5)
          .attr('class', 'label-ellipse')
      })

    // Add text labels - use theme-aware colors for label nodes
    const labelTextColor = isDarkMode ? '#e0e0e0' : '#333'
    nodeGroups.append('text')
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', d => d.data.type === 'tier' ? TIER_TEXT : labelTextColor)
      .attr('font-size', d => d.data.type === 'tier' ? '11px' : '12px')
      .attr('font-weight', d => d.data.type === 'tier' ? '600' : '500')
      .attr('pointer-events', 'none')
      .text(d => {
        const name = d.data.name
        // Truncate long names
        const maxLen = d.data.type === 'tier' ? 12 : 10
        return name.length > maxLen ? name.substring(0, maxLen - 1) + '...' : name
      })
      .append('title')
      .text(d => d.data.name)

    // Add hover effects for label nodes
    nodeGroups.filter(d => d.data.type === 'label')
      .on('mouseenter', function(event, d) {
        if (selectedLabel?.path !== d.data.path) {
          d3.select(this).select('.label-ellipse')
            .attr('stroke-width', 2.5)
            .attr('stroke', '#333')
        }
      })
      .on('mouseleave', function(event, d) {
        if (selectedLabel?.path !== d.data.path) {
          d3.select(this).select('.label-ellipse')
            .attr('stroke-width', 1.5)
            .attr('stroke', '#666')
        }
      })

    // Setup zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        setCurrentZoom(event.transform.k)
      })

    svg.call(zoom)
    zoomRef.current = zoom

    // Set initial transform
    const initialTransform = d3.zoomIdentity
      .translate(offsetX, offsetY)
      .scale(1)
    svg.call(zoom.transform, initialTransform)

  }, [root, selectedLabel, dimensions, handleNodeClick])

  // Zoom controls
  const handleZoomIn = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 1.3)
    }
  }

  const handleZoomOut = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 0.7)
    }
  }

  const handleReset = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(500)
        .call(zoomRef.current.transform, d3.zoomIdentity.translate(dimensions.width / 2, dimensions.height / 2).scale(1))
    }
  }

  const handleFocusSelected = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || !selectedLabel || !gRef.current) return
    
    const svg = d3.select(svgRef.current)
    const g = d3.select(gRef.current)
    const zoom = zoomRef.current
    const { width, height } = dimensions
    
    // Find the selected node directly from DOM
    let nodeX = 0, nodeY = 0
    let found = false
    
    g.selectAll('.node-label').each(function(d: any) {
      if (d && d.data && d.data.path === selectedLabel.path) {
        // Get position from the d3 node data (d.y is horizontal, d.x is vertical in tree layout)
        nodeX = d.y
        nodeY = d.x
        found = true
      }
    })
    
    if (!found) {
      // Fallback to cached position
      const position = nodePositionsRef.current.get(selectedLabel.path)
      if (!position) return
      nodeX = position.x
      nodeY = position.y
    }
    
    // Target scale for focusing (1.5x zoom)
    const targetScale = 1.5
    
    // Calculate the transform to center the node
    const centerX = width / 2
    const centerY = height / 2
    const tx = centerX - nodeX * targetScale
    const ty = centerY - nodeY * targetScale
    
    // Create and apply the target transform
    const targetTransform = d3.zoomIdentity
      .translate(tx, ty)
      .scale(targetScale)
    
    svg.transition()
      .duration(400)
      .call(zoom.transform, targetTransform)
  }, [selectedLabel, dimensions])

  // Auto-focus when a label is selected
  useEffect(() => {
    if (selectedLabel && nodePositionsRef.current.size > 0) {
      // Delay to ensure the tree is fully rendered and transform is applied
      // Use requestAnimationFrame for better timing with browser paint
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          handleFocusSelected()
        })
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [selectedLabel, handleFocusSelected])

  // Export to high-resolution PNG from SVG (full tree)
  const handleExportPng = useCallback(async () => {
    if (!svgRef.current || !gRef.current || !root) return
    
    setExporting(true)
    
    try {
      const svg = svgRef.current
      const g = gRef.current
      
      // Get the bounding box of the entire tree content
      const bbox = g.getBBox()
      const padding = 40 // Padding around the tree
      
      // Calculate dimensions for the full tree
      const fullWidth = bbox.width + padding * 2
      const fullHeight = bbox.height + padding * 2
      
      // Create a new SVG element with the full tree dimensions
      const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      exportSvg.setAttribute('width', String(fullWidth))
      exportSvg.setAttribute('height', String(fullHeight))
      exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      exportSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
      
      // Set background
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bgRect.setAttribute('width', '100%')
      bgRect.setAttribute('height', '100%')
      bgRect.setAttribute('fill', isDarkMode ? '#121212' : '#FAFAFA')
      exportSvg.appendChild(bgRect)
      
      // Clone the defs (for filters like glow)
      const defs = svg.querySelector('defs')
      if (defs) {
        exportSvg.appendChild(defs.cloneNode(true))
      }
      
      // Clone and transform the tree group to fit in the export SVG
      const gClone = g.cloneNode(true) as SVGGElement
      // Reset transform to position tree at padding offset
      gClone.setAttribute('transform', `translate(${padding - bbox.x}, ${padding - bbox.y})`)
      exportSvg.appendChild(gClone)
      
      // Serialize SVG
      const serializer = new XMLSerializer()
      let svgString = serializer.serializeToString(exportSvg)
      
      // Add XML declaration
      svgString = '<?xml version="1.0" encoding="UTF-8"?>' + svgString
      
      // Create blob and URL
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      
      // Create image and canvas for high-quality PNG export
      const img = new Image()
      const scale = 3 // 3x resolution for high DPI / Retina display
      
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = fullWidth * scale
        canvas.height = fullHeight * scale
        
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          setExporting(false)
          return
        }
        
        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        
        // Set background
        ctx.fillStyle = isDarkMode ? '#121212' : '#FAFAFA'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Draw image at scale
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        
        // Export as PNG with maximum quality
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            URL.revokeObjectURL(url)
            setExporting(false)
            return
          }
          
          const pngUrl = URL.createObjectURL(pngBlob)
          const link = document.createElement('a')
          link.download = `framework_${root.name}_${Date.now()}.png`
          link.href = pngUrl
          link.click()
          
          URL.revokeObjectURL(pngUrl)
          URL.revokeObjectURL(url)
          setExporting(false)
        }, 'image/png', 1.0)
      }
      
      img.onerror = () => {
        console.error('Failed to load SVG for PNG export')
        URL.revokeObjectURL(url)
        setExporting(false)
        alert('PNG导出失败: 无法加载SVG图像')
      }
      
      img.src = url
    } catch (error) {
      console.error('PNG export error:', error)
      alert('PNG导出失败: ' + (error as Error).message)
      setExporting(false)
    }
  }, [root, isDarkMode])

  if (!root) {
    return (
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          height: '100%',
          minHeight: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
          borderRadius: 1
        }}
      >
        <Typography color="text.secondary">
          No framework loaded
        </Typography>
      </Box>
    )
  }

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 200 }}>
      {/* Zoom controls */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderRadius: 1,
          p: 0.5
        }}
      >
        <Tooltip title="Zoom In" placement="left">
          <IconButton size="small" onClick={handleZoomIn}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom Out" placement="left">
          <IconButton size="small" onClick={handleZoomOut}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset View" placement="left">
          <IconButton size="small" onClick={handleReset}>
            <CenterFocusStrongIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={selectedLabel ? "Locate Selected" : "No Selection"} placement="left">
          <span>
            <IconButton 
              size="small" 
              onClick={handleFocusSelected}
              disabled={!selectedLabel}
              sx={{
                color: selectedLabel ? 'primary.main' : 'action.disabled'
              }}
            >
              <MyLocationIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('annotation.exportFrameworkPng', 'Export PNG')} placement="left">
          <span>
            <IconButton 
              size="small" 
              onClick={handleExportPng}
              disabled={exporting}
              sx={{
                color: 'primary.main'
              }}
            >
              {exporting ? <CircularProgress size={18} /> : <PhotoCameraIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Zoom level indicator */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          zIndex: 10,
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderRadius: 1,
          px: 1,
          py: 0.5
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {Math.round(currentZoom * 100)}%
        </Typography>
      </Box>

      {/* SVG container */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{
          backgroundColor: isDarkMode ? '#121212' : '#FAFAFA',
          borderRadius: 4,
          border: isDarkMode ? '1px solid #424242' : '1px solid #E0E0E0',
          display: 'block'
        }}
      />
    </Box>
  )
}

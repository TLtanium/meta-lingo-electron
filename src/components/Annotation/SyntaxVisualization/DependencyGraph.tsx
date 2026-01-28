/**
 * DependencyGraph Component
 * Displays SpaCy dependency parsing visualization with scroll support
 */

import { useEffect, useRef } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import type { DependencyToken, DependencyArc } from './types'

interface DependencyGraphProps {
  svgHtml: string
  tokens?: DependencyToken[]
  arcs?: DependencyArc[]
  height?: number
}

export default function DependencyGraph({ 
  svgHtml,
  tokens,
  arcs,
  height = 400
}: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const theme = useTheme()

  // Update SVG styles based on theme
  useEffect(() => {
    if (!containerRef.current || !svgHtml) return

    const container = containerRef.current
    const svgElement = container.querySelector('svg')
    
    if (svgElement) {
      // Get original dimensions
      const viewBox = svgElement.getAttribute('viewBox')
      const originalWidth = svgElement.getAttribute('width')
      
      // Set minimum width for scrolling
      if (originalWidth) {
        const width = parseInt(originalWidth, 10)
        if (width > 0) {
          svgElement.style.minWidth = `${Math.max(width, 800)}px`
        }
      }
      
      svgElement.style.width = 'auto'
      svgElement.style.height = 'auto'
      svgElement.style.minHeight = `${height - 40}px`
      svgElement.style.display = 'block'
      
      // Update colors based on theme
      const isDark = theme.palette.mode === 'dark'
      
      // Update text colors
      const textElements = svgElement.querySelectorAll('text')
      textElements.forEach(text => {
        text.setAttribute('fill', isDark ? '#e0e0e0' : '#333333')
      })
      
      // Update arrow/path colors for dependency arcs
      const pathElements = svgElement.querySelectorAll('path')
      pathElements.forEach(path => {
        const stroke = path.getAttribute('stroke')
        if (stroke && stroke !== 'none') {
          path.setAttribute('stroke', isDark ? '#90caf9' : '#1976d2')
        }
        const fill = path.getAttribute('fill')
        if (fill && fill !== 'none' && fill !== 'transparent') {
          path.setAttribute('fill', isDark ? '#90caf9' : '#1976d2')
        }
      })
      
      // Update line colors
      const lineElements = svgElement.querySelectorAll('line')
      lineElements.forEach(line => {
        line.setAttribute('stroke', isDark ? '#666666' : '#cccccc')
      })

      // Update rect elements (for labels background)
      const rectElements = svgElement.querySelectorAll('rect')
      rectElements.forEach(rect => {
        const fill = rect.getAttribute('fill')
        if (fill === '#ffffff' || fill === 'white') {
          rect.setAttribute('fill', isDark ? '#424242' : '#ffffff')
        }
      })
    }
  }, [svgHtml, theme.palette.mode, height])

  if (!svgHtml) {
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
          No dependency graph data available
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
        minHeight: height,
        overflow: 'auto',
        bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : '#ffffff',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        '& svg': {
          display: 'block',
          margin: '0 auto'
        },
        '& text': {
          fontFamily: 'Arial, sans-serif'
        }
      }}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  )
}

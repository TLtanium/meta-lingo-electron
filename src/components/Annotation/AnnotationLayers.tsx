/**
 * AnnotationLayers Component
 * Displays annotation labels as stacked blocks below the text
 * 
 * Features:
 * - Visual blocks aligned with annotated text positions
 * - Color-coded labels matching the annotation colors
 * - Stacked layers for overlapping annotations
 * - Click to select/highlight annotation
 */

import { useMemo, useRef, useEffect, useState } from 'react'
import { Box, Typography, Tooltip } from '@mui/material'
import type { Annotation } from '../../types'

interface AnnotationLayersProps {
  text: string
  annotations: Annotation[]
  charWidth?: number  // Approximate character width in pixels
  onAnnotationClick?: (annotation: Annotation) => void
  highlightedId?: string | null
}

/**
 * Calculate non-overlapping layers for annotations
 */
function calculateLayers(annotations: Annotation[]): Annotation[][] {
  if (annotations.length === 0) return []
  
  // Sort by start position
  const sorted = [...annotations].sort((a, b) => a.startPosition - b.startPosition)
  
  const layers: Annotation[][] = []
  
  for (const ann of sorted) {
    // Find a layer where this annotation doesn't overlap
    let placed = false
    
    for (const layer of layers) {
      const lastInLayer = layer[layer.length - 1]
      if (lastInLayer.endPosition <= ann.startPosition) {
        layer.push(ann)
        placed = true
        break
      }
    }
    
    if (!placed) {
      layers.push([ann])
    }
  }
  
  return layers
}

export default function AnnotationLayers({
  text,
  annotations,
  charWidth = 8.5,
  onAnnotationClick,
  highlightedId
}: AnnotationLayersProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredCharWidth, setMeasuredCharWidth] = useState(charWidth)

  // Measure actual character width
  useEffect(() => {
    if (containerRef.current) {
      const testSpan = document.createElement('span')
      testSpan.style.cssText = 'font-family: monospace; font-size: 14px; visibility: hidden; position: absolute;'
      testSpan.textContent = 'x'.repeat(100)
      document.body.appendChild(testSpan)
      const width = testSpan.offsetWidth / 100
      document.body.removeChild(testSpan)
      setMeasuredCharWidth(width || charWidth)
    }
  }, [charWidth])

  // Calculate layers
  const layers = useMemo(() => calculateLayers(annotations), [annotations])

  // Calculate total width based on text length
  const totalWidth = text.length * measuredCharWidth

  if (annotations.length === 0) {
    return null
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: totalWidth,
        minWidth: '100%',
        mt: 1,
        overflowX: 'auto'
      }}
    >
      {layers.map((layer, layerIdx) => (
        <Box
          key={`layer-${layerIdx}`}
          sx={{
            position: 'relative',
            height: 22,
            mb: 0.5
          }}
        >
          {layer.map((ann) => {
            const left = ann.startPosition * measuredCharWidth
            const width = (ann.endPosition - ann.startPosition) * measuredCharWidth
            const isHighlighted = highlightedId === ann.id

            return (
              <Tooltip
                key={ann.id}
                title={
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{ann.label}</Typography>
                    <Typography variant="caption">{ann.text}</Typography>
                    {ann.labelPath && (
                      <Typography variant="caption" display="block" color="grey.400">
                        {ann.labelPath}
                      </Typography>
                    )}
                  </Box>
                }
                placement="top"
                arrow
              >
                <Box
                  onClick={() => onAnnotationClick?.(ann)}
                  sx={{
                    position: 'absolute',
                    left: `${left}px`,
                    width: `${width}px`,
                    height: 20,
                    backgroundColor: ann.color,
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: onAnnotationClick ? 'pointer' : 'default',
                    overflow: 'hidden',
                    boxShadow: isHighlighted 
                      ? `0 0 0 2px #FFD700, 0 2px 8px rgba(0,0,0,0.3)` 
                      : '0 1px 2px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s ease',
                    transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
                    zIndex: isHighlighted ? 10 : 1,
                    '&:hover': {
                      filter: 'brightness(0.9)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 500,
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      px: '2px',
                      textShadow: '0 1px 1px rgba(0,0,0,0.3)'
                    }}
                  >
                    {ann.label}
                  </Typography>
                </Box>
              </Tooltip>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

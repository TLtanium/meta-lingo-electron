/**
 * D3 Container Component
 * Base wrapper for D3 visualizations with responsive sizing and toolbar
 */

import { useRef, ReactNode } from 'react'
import { Box } from '@mui/material'
import { useResizeObserver } from './useD3'

interface D3ContainerProps {
  children: (dimensions: { width: number; height: number }) => ReactNode
  height?: number | string
  minHeight?: number
  showToolbar?: boolean
  onZoomIn?: () => void
  onZoomOut?: () => void
  onReset?: () => void
  onExport?: () => void
  title?: string
  loading?: boolean
}

export default function D3Container({
  children,
  height = 600,
  minHeight = 400,
  showToolbar = true,
  onZoomIn,
  onZoomOut,
  onReset,
  onExport,
  title,
  loading = false
}: D3ContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dimensions = useResizeObserver(containerRef)

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        '& svg': {
          display: 'block',
          width: '100%',
          height: '100%'
        }
      }}
    >
      {dimensions && dimensions.width > 0 && dimensions.height > 0 && !loading && (
        children(dimensions)
      )}
      {loading && (
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            color: 'text.secondary'
          }}
        >
          Loading...
        </Box>
      )}
    </Box>
  )
}


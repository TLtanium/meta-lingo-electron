/**
 * D3.js React Hooks
 * Provides reusable hooks for D3 visualizations
 */

import { useRef, useEffect, useCallback, useState } from 'react'
import * as d3 from 'd3'

/**
 * Core hook for D3 visualizations
 * Handles SVG creation, resize, and cleanup
 */
export function useD3<T extends SVGSVGElement>(
  renderFn: (svg: d3.Selection<T, unknown, null, undefined>) => void,
  dependencies: React.DependencyList = []
) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (ref.current) {
      const svg = d3.select(ref.current)
      renderFn(svg as d3.Selection<T, unknown, null, undefined>)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return ref
}

/**
 * Hook for responsive D3 visualizations
 * Automatically resizes on container change
 */
export function useResizeObserver(ref: React.RefObject<HTMLElement>) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) return
      const { width, height } = entries[0].contentRect
      setDimensions({ width, height })
    })

    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [ref])

  return dimensions
}

/**
 * Hook for D3 zoom behavior
 */
export function useZoom<T extends Element>(
  svgRef: React.RefObject<T>,
  options: {
    scaleExtent?: [number, number]
    onZoom?: (transform: d3.ZoomTransform) => void
  } = {}
) {
  const { scaleExtent = [0.5, 5], onZoom } = options
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    const zoom = d3.zoom<T, unknown>()
      .scaleExtent(scaleExtent)
      .on('zoom', (event: d3.D3ZoomEvent<T, unknown>) => {
        transformRef.current = event.transform
        onZoom?.(event.transform)
      })

    svg.call(zoom as any)

    return () => {
      svg.on('.zoom', null)
    }
  }, [svgRef, scaleExtent, onZoom])

  const resetZoom = useCallback(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition()
      .duration(500)
      .call((d3.zoom() as any).transform, d3.zoomIdentity)
  }, [svgRef])

  return { transform: transformRef.current, resetZoom }
}

/**
 * Hook for D3 tooltip
 */
export function useTooltip() {
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const show = useCallback((
    content: string,
    event: MouseEvent,
    options: { offsetX?: number; offsetY?: number } = {}
  ) => {
    const { offsetX = 10, offsetY = 10 } = options
    
    if (!tooltipRef.current) {
      tooltipRef.current = document.createElement('div')
      tooltipRef.current.className = 'd3-tooltip'
      tooltipRef.current.style.cssText = `
        position: fixed;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        font-size: 13px;
        line-height: 1.5;
        pointer-events: none;
        z-index: 10000;
        max-width: 320px;
        opacity: 0;
        transition: opacity 0.15s ease;
      `
      document.body.appendChild(tooltipRef.current)
    }

    tooltipRef.current.innerHTML = content
    tooltipRef.current.style.left = `${event.clientX + offsetX}px`
    tooltipRef.current.style.top = `${event.clientY + offsetY}px`
    tooltipRef.current.style.opacity = '1'
  }, [])

  const hide = useCallback(() => {
    if (tooltipRef.current) {
      tooltipRef.current.style.opacity = '0'
    }
  }, [])

  const move = useCallback((event: MouseEvent, options: { offsetX?: number; offsetY?: number } = {}) => {
    const { offsetX = 10, offsetY = 10 } = options
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${event.clientX + offsetX}px`
      tooltipRef.current.style.top = `${event.clientY + offsetY}px`
    }
  }, [])

  useEffect(() => {
    return () => {
      if (tooltipRef.current) {
        document.body.removeChild(tooltipRef.current)
        tooltipRef.current = null
      }
    }
  }, [])

  return { show, hide, move }
}

/**
 * Color palette for topic visualizations
 */
export const TOPIC_COLORS = [
  '#636efa', '#EF553B', '#00cc96', '#ab63fa', '#FFA15A',
  '#19d3f3', '#FF6692', '#B6E880', '#FF97FF', '#FECB52',
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#5C7BD9'
]

export function getTopicColor(index: number): string {
  return TOPIC_COLORS[index % TOPIC_COLORS.length]
}

/**
 * Format number with locale
 */
export function formatNumber(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(value)
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}


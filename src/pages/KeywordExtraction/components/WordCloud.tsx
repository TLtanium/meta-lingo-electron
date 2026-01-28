/**
 * D3.js Word Cloud Component for Keyword Extraction
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import cloud from 'd3-cloud'
import { Box, useTheme } from '@mui/material'

interface DataItem {
  word: string
  frequency: number
  score: number
}

interface WordCloudProps {
  data: DataItem[]
  maxWords?: number
  colormap?: string
  onWordClick?: (word: string) => void
  valueKey?: 'frequency' | 'score'
}

export default function WordCloud({
  data,
  maxWords = 100,
  colormap = 'viridis',
  onWordClick,
  valueKey = 'score'
}: WordCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        })
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Get value accessor
    const getValue = (d: DataItem) => valueKey === 'score' ? d.score : d.frequency

    // Prepare data
    const sortedData = [...data].sort((a, b) => getValue(b) - getValue(a)).slice(0, maxWords)
    const maxValue = Math.max(...sortedData.map(getValue))
    const minValue = Math.min(...sortedData.map(getValue))
    const valueRange = maxValue - minValue || 1

    // Size scale for words
    const sizeScale = d3.scaleLinear()
      .domain([minValue, maxValue])
      .range([12, 60])

    // Color scale based on colormap
    const getColorScale = () => {
      const scales: Record<string, (t: number) => string> = {
        viridis: d3.interpolateViridis,
        inferno: d3.interpolateInferno,
        plasma: d3.interpolatePlasma,
        autumn: (t: number) => d3.interpolateYlOrRd(0.2 + t * 0.8),
        winter: (t: number) => d3.interpolateYlGnBu(0.2 + t * 0.8),
        rainbow: d3.interpolateRainbow,
        ocean: (t: number) => d3.interpolateGnBu(0.2 + t * 0.8),
        forest: (t: number) => d3.interpolateGreens(0.3 + t * 0.7),
        sunset: (t: number) => d3.interpolateOrRd(0.2 + t * 0.8)
      }
      return scales[colormap] || scales.viridis
    }

    const colorScale = getColorScale()

    // Prepare words for cloud layout
    const words = sortedData.map(d => ({
      text: d.word,
      size: sizeScale(getValue(d)),
      value: getValue(d),
      frequency: d.frequency,
      score: d.score
    }))

    // Create cloud layout
    const layout = cloud()
      .size([containerSize.width - 20, containerSize.height - 20])
      .words(words)
      .padding(3)
      .rotate(() => (Math.random() > 0.7 ? 90 : 0))
      .font('Arial')
      .fontSize(d => (d as any).size)
      .on('end', draw)

    layout.start()

    function draw(words: any[]) {
      const g = svg
        .attr('width', containerSize.width)
        .attr('height', containerSize.height)
        .append('g')
        .attr('transform', `translate(${containerSize.width / 2},${containerSize.height / 2})`)

      const text = g.selectAll('text')
        .data(words)
        .enter()
        .append('text')
        .style('font-size', d => `${d.size}px`)
        .style('font-family', 'Arial, sans-serif')
        .style('font-weight', d => d.size > 30 ? '600' : '400')
        .style('fill', d => colorScale((d.value - minValue) / valueRange))
        .style('cursor', onWordClick ? 'pointer' : 'default')
        .attr('text-anchor', 'middle')
        .attr('transform', d => `translate(${d.x},${d.y})rotate(${d.rotate})`)
        .text(d => d.text)
        .attr('opacity', 0)

      // Animate entrance
      text.transition()
        .duration(600)
        .delay((_, i) => i * 10)
        .attr('opacity', 1)

      // Hover effects
      text
        .on('mouseover', function(event, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .style('font-size', `${d.size * 1.2}px`)

          // Show tooltip
          const tooltip = d3.select(containerRef.current)
            .append('div')
            .attr('class', 'tooltip')
            .style('position', 'absolute')
            .style('background', theme.palette.background.paper)
            .style('border', `1px solid ${theme.palette.divider}`)
            .style('border-radius', '4px')
            .style('padding', '8px 12px')
            .style('box-shadow', theme.shadows[2])
            .style('pointer-events', 'none')
            .style('font-size', '12px')
            .style('z-index', 1000)
            .html(`
              <strong>${d.text}</strong><br/>
              Score: ${d.score.toFixed(4)}<br/>
              Frequency: ${d.frequency.toLocaleString()}
            `)

          const [mouseX, mouseY] = d3.pointer(event, containerRef.current)
          tooltip
            .style('left', `${mouseX + 10}px`)
            .style('top', `${mouseY - 10}px`)
        })
        .on('mouseout', function(_, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .style('font-size', `${d.size}px`)

          d3.select(containerRef.current).selectAll('.tooltip').remove()
        })
        .on('click', (_, d) => {
          if (onWordClick) {
            onWordClick(d.text)
          }
        })
    }

    // Cleanup
    return () => {
      d3.select(containerRef.current).selectAll('.tooltip').remove()
    }
  }, [data, maxWords, colormap, containerSize, theme, onWordClick, valueKey])

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        flex: 1,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
      }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </Box>
  )
}


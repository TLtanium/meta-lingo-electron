/**
 * D3.js Word Cloud Component for N-gram Analysis
 * Displays N-grams as a word cloud based on frequency
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { Box } from '@mui/material'
import * as d3 from 'd3'
import cloud from 'd3-cloud'
import type { NGramResult } from '../../../types/ngram'

interface WordCloudProps {
  data: NGramResult[]
  colorScheme: string
  onWordClick?: (ngram: string) => void
}

interface CloudWord {
  text: string
  size: number
  frequency: number
  originalNgram: string
  x?: number
  y?: number
  rotate?: number
}

// Color palettes
const COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#0d47a1', '#1565c0', '#1976d2', '#1e88e5', '#2196f3', '#42a5f5'],
  green: ['#1b5e20', '#2e7d32', '#388e3c', '#43a047', '#4caf50', '#66bb6a'],
  purple: ['#4a148c', '#6a1b9a', '#7b1fa2', '#8e24aa', '#9c27b0', '#ab47bc'],
  orange: ['#e65100', '#ef6c00', '#f57c00', '#fb8c00', '#ff9800', '#ffa726'],
  red: ['#b71c1c', '#c62828', '#d32f2f', '#e53935', '#f44336', '#ef5350'],
  teal: ['#004d40', '#00695c', '#00796b', '#00897b', '#009688', '#26a69a']
}

export default function WordCloud({
  data,
  colorScheme,
  onWordClick
}: WordCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

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

  // Draw callback for cloud layout
  const draw = useCallback((words: CloudWord[], width: number, height: number) => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.blue
    const colorScale = d3.scaleOrdinal<number, string>()
      .domain(d3.range(colors.length))
      .range(colors)

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`)

    // Add words
    g.selectAll('text')
      .data(words)
      .enter()
      .append('text')
      .style('font-size', d => `${d.size}px`)
      .style('font-family', 'Arial, sans-serif')
      .style('font-weight', 'bold')
      .style('fill', (_, i) => colorScale(i % colors.length))
      .style('cursor', onWordClick ? 'pointer' : 'default')
      .attr('text-anchor', 'middle')
      .attr('transform', d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
      .text(d => d.text)
      .attr('opacity', 0)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .style('opacity', 0.7)
          .style('text-decoration', 'underline')
        
        // Show tooltip
        const [x, y] = [event.offsetX, event.offsetY]
        const tooltip = d3.select(svgRef.current)
          .append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${x + 10},${y - 10})`)
        
        tooltip.append('rect')
          .attr('fill', 'rgba(0,0,0,0.8)')
          .attr('rx', 4)
          .attr('x', 0)
          .attr('y', -14)
          .attr('width', 80)
          .attr('height', 28)

        tooltip.append('text')
          .attr('fill', 'white')
          .attr('font-size', '11px')
          .attr('x', 8)
          .attr('y', 4)
          .text(`${d.frequency}`)
      })
      .on('mouseout', function() {
        d3.select(this)
          .style('opacity', 1)
          .style('text-decoration', 'none')
        d3.select(svgRef.current).selectAll('.tooltip').remove()
      })
      .on('click', (_, d) => {
        if (onWordClick) {
          onWordClick(d.originalNgram)
        }
      })
      .transition()
      .duration(600)
      .delay((_, i) => i * 20)
      .attr('opacity', 1)

  }, [colorScheme, onWordClick])

  // Build word cloud
  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return
    if (data.length === 0) {
      // Clear the SVG if no data
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll('*').remove()
      }
      return
    }

    const width = dimensions.width
    const height = dimensions.height

    // Prepare words for cloud
    const maxFreq = d3.max(data, d => d.frequency) || 1
    const minFreq = d3.min(data, d => d.frequency) || 1
    
    // Scale font size between 14 and 60 based on frequency
    const fontScale = d3.scaleLinear()
      .domain([minFreq, maxFreq])
      .range([14, Math.min(60, height / 4)])

    const words: CloudWord[] = data.map(d => ({
      text: d.ngram,
      size: fontScale(d.frequency),
      frequency: d.frequency,
      originalNgram: d.ngram
    }))

    // Create cloud layout
    const layout = cloud<CloudWord>()
      .size([width, height])
      .words(words)
      .padding(5)
      .rotate(() => {
        // Random rotation: 0, 90, or -90 degrees (mostly horizontal)
        const rotations = [0, 0, 0, 0, 90, -90]
        return rotations[Math.floor(Math.random() * rotations.length)]
      })
      .font('Arial')
      .fontSize(d => d.size)
      .spiral('archimedean')
      .on('end', (outputWords) => draw(outputWords as CloudWord[], width, height))

    layout.start()

  }, [data, dimensions, draw])

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        display: 'flex'
      }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </Box>
  )
}

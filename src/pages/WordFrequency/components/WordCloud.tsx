/**
 * D3.js Word Cloud Component
 * Word cloud visualization using d3-cloud
 */

import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import cloud from 'd3-cloud'
import {
  Box,
  Alert,
  Typography
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { 
  WordFrequencyResult, 
  WordCloudConfig,
  WordCloudColormap 
} from '../../../types/wordFrequency'

interface WordCloudProps {
  data: WordFrequencyResult[]
  config: WordCloudConfig
  onWordClick?: (word: string) => void
}

// Color palettes for different colormaps
const COLORMAP_PALETTES: Record<WordCloudColormap, string[]> = {
  viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26838f', '#1f9e89', '#6cce5a', '#b5de2b', '#fde725'],
  inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#fcffa4'],
  autumn: ['#ff0000', '#ff1a00', '#ff3300', '#ff4d00', '#ff6600', '#ff8000', '#ff9900', '#ffb300', '#ffcc00'],
  plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26'],
  winter: ['#0000ff', '#0020ff', '#0040ff', '#0060ff', '#0080ff', '#00a0ff', '#00c0ff', '#00e0ff', '#00ffff'],
  rainbow: ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff'],
  ocean: ['#007AFF', '#0066CC', '#0052A3', '#003D7A', '#002952', '#00142A', '#001F3F', '#002A52', '#003566'],
  forest: ['#228B22', '#2E8B2E', '#3CB371', '#4ACD4A', '#5DD55D', '#70DD70', '#83E583', '#96ED96', '#A9F5A9'],
  sunset: ['#FF6B6B', '#FF8E72', '#FFB179', '#FFD480', '#FFF787', '#E5FF8E', '#CBFF95', '#B1FF9C', '#97FFA3']
}

export default function WordCloud({
  data,
  config,
  onWordClick
}: WordCloudProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(0) // Force re-render key
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

  // Render word cloud
  useEffect(() => {
    if (!containerRef.current || !svgRef.current || data.length === 0) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    setError(null)

    try {
      const svg = d3.select(svgRef.current)
      
      // Clear previous content
      svg.selectAll('*').remove()

      const width = containerSize.width
      const chartHeight = containerSize.height

      // Prepare word data
      const maxWords = config.maxWords || 100
      const wordData = data.slice(0, maxWords).map(item => ({
        text: item.word,
        size: item.frequency,
        frequency: item.frequency,
        percentage: item.percentage,
        rank: item.rank
      }))

      // Calculate font size scale - dynamic based on container size
      const maxFreq = d3.max(wordData, d => d.size) || 1
      const minFreq = d3.min(wordData, d => d.size) || 1
      const maxFontSize = Math.min(80, Math.max(40, chartHeight / 8))
      const minFontSize = Math.max(8, maxFontSize / 8)
      const fontScale = d3.scaleSqrt()
        .domain([minFreq, maxFreq])
        .range([minFontSize, maxFontSize])

      // Color scale
      const palette = COLORMAP_PALETTES[config.colormap] || COLORMAP_PALETTES.viridis
      const colorScale = d3.scaleOrdinal<string>()
        .domain(wordData.map(d => d.text))
        .range(palette)

      // Create cloud layout
      const layout = cloud<typeof wordData[0]>()
        .size([width, chartHeight])
        .words(wordData)
        .padding(3)
        .rotate(() => 0) // No rotation for better fill
        .spiral('archimedean')
        .font('sans-serif')
        .fontSize(d => fontScale(d.size))
        .on('end', draw)

      // Draw function
      function draw(words: cloud.Word[]) {
        svg
          .attr('width', width)
          .attr('height', chartHeight)
          .attr('viewBox', `0 0 ${width} ${chartHeight}`)

        const g = svg.append('g')
          .attr('transform', `translate(${width / 2},${chartHeight / 2})`)

        // Add words
        const texts = g.selectAll('text')
          .data(words)
          .enter()
          .append('text')
          .style('font-size', d => `${d.size}px`)
          .style('font-family', 'sans-serif')
          .style('font-weight', 'bold')
          .style('fill', d => colorScale(d.text || ''))
          .style('cursor', onWordClick ? 'pointer' : 'default')
          .attr('text-anchor', 'middle')
          .attr('transform', d => `translate(${d.x},${d.y})rotate(${d.rotate})`)
          .text(d => d.text || '')
          .attr('opacity', 0)

        // Animate in
        texts.transition()
          .duration(600)
          .delay((_, i) => i * 5)
          .attr('opacity', 1)

        // Add interactions
        texts
          .on('mouseover', function(event, d) {
            d3.select(this)
              .transition()
              .duration(200)
              .style('font-size', `${(d.size || 12) * 1.2}px`)

            // Show tooltip
            const tooltip = d3.select(containerRef.current)
              .append('div')
              .attr('class', 'wc-tooltip')
              .style('position', 'absolute')
              .style('background', 'white')
              .style('border', '1px solid #ddd')
              .style('border-radius', '4px')
              .style('padding', '8px 12px')
              .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
              .style('pointer-events', 'none')
              .style('font-size', '12px')
              .style('z-index', 1000)
              .html(`
                <strong>${d.text}</strong><br/>
                ${t('wordFrequency.table.frequency')}: ${(d as any).frequency?.toLocaleString() || 'N/A'}<br/>
                ${t('wordFrequency.table.percentage')}: ${(d as any).percentage?.toFixed(4) || 'N/A'}%<br/>
                ${t('wordFrequency.table.rank')}: ${(d as any).rank || 'N/A'}
              `)
              .style('left', `${event.pageX + 10}px`)
              .style('top', `${event.pageY - 10}px`)
          })
          .on('mousemove', function(event) {
            d3.select(containerRef.current).select('.wc-tooltip')
              .style('left', `${event.pageX + 10}px`)
              .style('top', `${event.pageY - 10}px`)
          })
          .on('mouseout', function(_, d) {
            d3.select(this)
              .transition()
              .duration(200)
              .style('font-size', `${d.size}px`)

            d3.select(containerRef.current).selectAll('.wc-tooltip').remove()
          })
          .on('click', (_, d) => {
            if (onWordClick && d.text) {
              onWordClick(d.text)
            }
          })
      }

      // Start layout
      layout.start()

    } catch (err: any) {
      console.error('WordCloud render error:', err)
      setError(err.message || 'Failed to render word cloud')
    }

    // Cleanup
    return () => {
      d3.select(containerRef.current).selectAll('.wc-tooltip').remove()
    }
  }, [data, config.maxWords, config.colormap, containerSize, onWordClick, t])


  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Empty Data Display */}
      {data.length === 0 && !error && (
        <Box 
          sx={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'text.secondary'
          }}
        >
          <Typography>{t('wordFrequency.viz.noData')}</Typography>
        </Box>
      )}

      {/* Chart Container - fills the entire space */}
      {data.length > 0 && !error && (
        <Box 
          sx={{ 
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            '& svg': {
              display: 'block',
              width: '100%',
              height: '100%'
            }
          }}
        >
          <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
        </Box>
      )}
    </Box>
  )
}

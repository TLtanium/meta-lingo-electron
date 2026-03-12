/**
 * Ridge Plot (Joy Plot)
 * D3.js grouped density distribution showing keyword positions per document
 * Y-axis: documents, X-axis: document position, Ridge height: frequency density
 *
 * Height strategy:
 *   - When few docs: fill the container (containerHeight)
 *   - When many docs: grow beyond container (docCount * MIN_ROW_HEIGHT + margins)
 *   Parent container scrolls when chart exceeds viewport.
 *   SVG/PNG export captures full chart regardless of scroll position.
 */

import { useEffect, useRef, useMemo, useState } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import * as d3 from 'd3'
import { useTranslation } from 'react-i18next'
import type { KWICResult } from '../../../../types/collocation'


interface RidgePlotProps {
  results: KWICResult[]
  colorScheme?: string
  maxDocs?: number
  /** Available container height from parent — chart fills this when few docs */
  containerHeight?: number
}

const COLOR_MAP: Record<string, string> = {
  blue: '#2196f3', green: '#4caf50', purple: '#9c27b0',
  orange: '#ff9800', red: '#f44336'
}

const MIN_ROW_HEIGHT = 28
const MARGIN = { top: 50, right: 50, bottom: 60, left: 160 }

export default function RidgePlot({
  results,
  colorScheme = 'blue',
  maxDocs = 10,
  containerHeight = 400
}: RidgePlotProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const theme = useTheme()
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(0)

  // Group results by document
  const documentData = useMemo(() => {
    const textGroups = new Map<string, { filename: string; positions: number[]; maxPos: number }>()
    results.forEach(r => {
      if (!textGroups.has(r.text_id)) {
        textGroups.set(r.text_id, { filename: r.filename, positions: [], maxPos: 0 })
      }
      const g = textGroups.get(r.text_id)!
      g.positions.push(r.position)
      g.maxPos = Math.max(g.maxPos, r.position)
    })
    return Array.from(textGroups.entries()).map(([id, data]) => ({
      text_id: id,
      filename: data.filename,
      normalizedPositions: data.positions.map(p => (p / Math.max(data.maxPos, 1)) * 100),
      count: data.positions.length
    })).sort((a, b) => b.count - a.count).slice(0, maxDocs)
  }, [results, maxDocs])

  /**
   * Chart height: fill container when few docs, grow when many docs.
   * requiredHeight = docCount * MIN_ROW_HEIGHT + margins
   * chartHeight = max(containerHeight, requiredHeight)
   */
  const chartHeight = useMemo(() => {
    if (documentData.length === 0) return containerHeight || 300
    const requiredHeight = documentData.length * MIN_ROW_HEIGHT + MARGIN.top + MARGIN.bottom
    return Math.max(containerHeight || 300, requiredHeight)
  }, [documentData.length, containerHeight])

  // Observe width only
  useEffect(() => {
    if (!chartRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width)
        setChartWidth(prev => prev === w ? prev : w)
      }
    })
    ro.observe(chartRef.current)
    return () => ro.disconnect()
  }, [])

  // Draw D3 chart
  useEffect(() => {
    if (!chartRef.current || documentData.length === 0 || chartWidth === 0) return

    d3.select(chartRef.current).selectAll('svg').remove()
    d3.select(chartRef.current).selectAll('.tooltip').remove()

    const width = chartWidth
    const height = chartHeight
    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = height - MARGIN.top - MARGIN.bottom
    if (innerWidth <= 0 || innerHeight <= 0) return

    const svg = d3.select(chartRef.current).append('svg')
      .attr('width', width).attr('height', height)
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const xScale = d3.scaleLinear().domain([0, 100]).range([0, innerWidth])
    const yScale = d3.scaleBand()
      .domain(documentData.map(d => d.text_id))
      .range([0, innerHeight]).padding(0.15)

    const primaryColor = COLOR_MAP[colorScheme] || COLOR_MAP.blue
    const baseColor = d3.color(primaryColor) || d3.color('#2196f3')
    const colorInterpolator = (t: number) => {
      return d3.interpolateRgb(
        baseColor!.brighter(1.5).toString(),
        baseColor!.darker(0.3).toString()
      )(t)
    }
    const maxCount = d3.max(documentData, d => d.count) || 1
    const colorScale = d3.scaleSequential(colorInterpolator).domain([0, maxCount])

    // KDE
    const kde = (kernel: (v: number) => number, thresholds: number[], data: number[]) =>
      thresholds.map(t => [t, d3.mean(data, d => kernel(t - d)) || 0] as [number, number])
    const epanechnikov = (bw: number) => (x: number) => {
      const v = x / bw; return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / bw : 0
    }
    const thresholds = d3.range(0, 101, 2)

    let maxDensity = 0
    documentData.forEach(doc => {
      const density = kde(epanechnikov(5), thresholds, doc.normalizedPositions)
      maxDensity = Math.max(maxDensity, d3.max(density, d => d[1]) || 0)
    })

    const docCount = documentData.length
    const overlapFactor = docCount <= 5 ? 2.5 : docCount <= 10 ? 2.2 : docCount <= 20 ? 1.8 : 1.5
    const ridgeHeight = yScale.bandwidth() * overlapFactor
    const labelFontSize = Math.max(7, Math.min(10, yScale.bandwidth() * 0.35))
    const badgeFontSize = Math.max(7, Math.min(11, yScale.bandwidth() * 0.3))

    // Grid
    g.append('g').attr('class', 'grid').attr('opacity', 0.1)
      .call(d3.axisBottom(xScale).tickSize(innerHeight).tickFormat(() => ''))

    // Ridges
    documentData.forEach((doc, i) => {
      const yPos = yScale(doc.text_id) || 0
      const density = kde(epanechnikov(5), thresholds, doc.normalizedPositions)
      const area = d3.area<[number, number]>().curve(d3.curveBasis)
        .x(d => xScale(d[0]))
        .y0(yPos + yScale.bandwidth())
        .y1(d => yPos + yScale.bandwidth() - (d[1] / maxDensity) * ridgeHeight)

      const ridgeColor = colorScale(doc.count)
      const strokeColor = d3.color(ridgeColor)?.darker(0.5)?.toString() || primaryColor

      const path = g.append('path').datum(density)
        .attr('fill', ridgeColor).attr('fill-opacity', 0)
        .attr('stroke', strokeColor).attr('stroke-width', 1.5).attr('stroke-opacity', 0)
        .attr('d', area).attr('cursor', 'pointer')
      path.transition().duration(500).delay(i * 50)
        .attr('fill-opacity', 0.7).attr('stroke-opacity', 1)

      path
        .on('mouseover', function(event) {
          d3.select(this).transition().duration(150)
            .attr('fill-opacity', 0.9).attr('stroke-width', 2.5)
          d3.select(chartRef.current).append('div').attr('class', 'tooltip')
            .style('position', 'absolute')
            .style('background', theme.palette.background.paper)
            .style('border', `1px solid ${theme.palette.divider}`)
            .style('border-radius', '8px').style('padding', '10px 14px')
            .style('box-shadow', theme.shadows[4]).style('pointer-events', 'none')
            .style('font-size', '12px').style('z-index', '1000').style('max-width', '250px')
            .html(`<strong>${doc.filename}</strong><br/>
              ${isZh ? '命中数' : 'Hits'}: ${doc.count}<br/>
              ${isZh ? '占总数' : 'Of total'}: ${((doc.count / results.length) * 100).toFixed(1)}%`)
          const [mx, my] = d3.pointer(event, chartRef.current)
          d3.select(chartRef.current).select('.tooltip')
            .style('left', `${mx + 15}px`).style('top', `${my - 10}px`)
        })
        .on('mouseout', function() {
          d3.select(this).transition().duration(150)
            .attr('fill-opacity', 0.7).attr('stroke-width', 1.5)
          d3.select(chartRef.current).selectAll('.tooltip').remove()
        })

      g.append('text')
        .attr('x', innerWidth + 10).attr('y', yPos + yScale.bandwidth() / 2)
        .attr('dy', '0.35em').attr('font-size', `${badgeFontSize}px`)
        .attr('font-weight', 500).attr('fill', theme.palette.text.secondary)
        .attr('opacity', 0).text(`(${doc.count})`)
        .transition().delay(i * 50 + 300).duration(300).attr('opacity', 1)
    })

    // Axes
    g.append('g').attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat(d => `${d}%`))
      .selectAll('text').attr('font-size', '11px').attr('fill', theme.palette.text.secondary)

    g.append('g')
      .call(d3.axisLeft(yScale).tickFormat(id => {
        const doc = documentData.find(d => d.text_id === id)
        const name = doc?.filename || ''
        const maxChars = labelFontSize >= 9 ? 20 : 15
        return name.length > maxChars ? name.slice(0, maxChars - 3) + '...' : name
      }))
      .selectAll('text').attr('font-size', `${labelFontSize}px`).attr('fill', theme.palette.text.primary)

    g.append('text').attr('x', innerWidth / 2).attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle').attr('font-size', '12px')
      .attr('fill', theme.palette.text.secondary)
      .text(isZh ? '文档位置 (%)' : 'Document Position (%)')

    svg.append('text').attr('x', width / 2).attr('y', 25)
      .attr('text-anchor', 'middle').attr('font-size', '14px').attr('font-weight', 600)
      .attr('fill', theme.palette.text.primary)
      .text(isZh ? '各文档关键词分布' : 'Ridge Plot - Keyword Distribution by Document')

    return () => { d3.select(chartRef.current).selectAll('.tooltip').remove() }
  }, [documentData, chartWidth, chartHeight, colorScheme, isZh, theme, results])

  if (results.length === 0 || documentData.length === 0) {
    return (
      <Box sx={{ width: '100%', height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">{isZh ? '无数据' : 'No data'}</Typography>
      </Box>
    )
  }

  return (
    <Box
      ref={chartRef}
      sx={{
        width: '100%',
        height: chartHeight,
        position: 'relative',
        '& svg': { display: 'block' }
      }}
    />
  )
}

/**
 * Concordance Plot (Dispersion Plot)
 * D3.js visualization showing keyword occurrence positions as tick marks across documents.
 * Each document row shows blue vertical ticks at the corresponding relative position.
 * Alternating row backgrounds, thin dividers, no baselines — matches classic corpus concordance style.
 * Clicking a tick fires onTickClick(result) so the parent can jump to the matching table row.
 *
 * Height strategy:
 *   - MIN_ROW_HEIGHT × docCount drives SVG height so the chart always grows vertically.
 *   - Parent container scrolls when chart exceeds viewport.
 *   - SVG/PNG export captures full chart.
 */

import { useEffect, useRef, useMemo, useState } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import * as d3 from 'd3'
import { useTranslation } from 'react-i18next'
import type { KWICResult } from '../../../../types/collocation'

interface ConcordancePlotProps {
  results: KWICResult[]
  colorScheme?: string
  maxDocs?: number
  /** Available container height from parent — chart fills this when few docs */
  containerHeight?: number
  /** Called when a tick is clicked; passes the corresponding KWICResult */
  onTickClick?: (result: KWICResult) => void
}

const COLOR_MAP: Record<string, string> = {
  blue: '#2979ff', green: '#43a047', purple: '#8e24aa',
  orange: '#fb8c00', red: '#e53935'
}

const MIN_ROW_HEIGHT = 30          // minimum px per document row
const ROW_PADDING_PX = 4           // vertical padding inside each row
const MARGIN = { top: 50, right: 60, bottom: 50, left: 175 }

export default function ConcordancePlot({
  results,
  colorScheme = 'blue',
  maxDocs = 10,
  containerHeight = 400,
  onTickClick
}: ConcordancePlotProps) {
  const { i18n, t } = useTranslation()
  const isZh = i18n.language === 'zh'
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(0)
  // Stable ref so D3 handlers always see the latest callback without redraw
  const onTickClickRef = useRef(onTickClick)
  useEffect(() => { onTickClickRef.current = onTickClick }, [onTickClick])

  /**
   * Group results by document, tracking original array index per position.
   * Sorted by hit count desc, sliced to maxDocs.
   */
  const documentData = useMemo(() => {
    const textGroups = new Map<string, {
      filename: string
      hits: Array<{ pos: number; originalIdx: number }>
      maxPos: number
    }>()

    results.forEach((r, idx) => {
      if (!textGroups.has(r.text_id)) {
        textGroups.set(r.text_id, { filename: r.filename, hits: [], maxPos: 0 })
      }
      const g = textGroups.get(r.text_id)!
      g.hits.push({ pos: r.position, originalIdx: idx })
      g.maxPos = Math.max(g.maxPos, r.position)
    })

    return Array.from(textGroups.entries())
      .map(([id, data]) => ({
        text_id: id,
        filename: data.filename,
        hits: data.hits.map(h => ({
          normalizedPos: (h.pos / Math.max(data.maxPos, 1)) * 100,
          originalIdx: h.originalIdx
        })),
        count: data.hits.length
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, maxDocs)
  }, [results, maxDocs])

  /** Chart height: fill container when few docs, grow when many docs. */
  const chartHeight = useMemo(() => {
    if (documentData.length === 0) return containerHeight || 300
    const required = documentData.length * MIN_ROW_HEIGHT + MARGIN.top + MARGIN.bottom
    return Math.max(containerHeight || 300, required)
  }, [documentData.length, containerHeight])

  // Observe container width
  useEffect(() => {
    if (!chartRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width)
        setChartWidth(prev => (prev === w ? prev : w))
      }
    })
    ro.observe(chartRef.current)
    return () => ro.disconnect()
  }, [])

  // Draw D3 chart
  useEffect(() => {
    if (!chartRef.current || documentData.length === 0 || chartWidth === 0) return

    d3.select(chartRef.current).selectAll('svg').remove()
    d3.select(chartRef.current).selectAll('.cp-tooltip').remove()

    const width = chartWidth
    const height = chartHeight
    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = height - MARGIN.top - MARGIN.bottom
    if (innerWidth <= 0 || innerHeight <= 0) return

    const svg = d3.select(chartRef.current).append('svg')
      .attr('width', width)
      .attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Scales
    const xScale = d3.scaleLinear().domain([0, 100]).range([0, innerWidth])
    const rowH = innerHeight / documentData.length   // actual row height

    const primaryColor = COLOR_MAP[colorScheme] || COLOR_MAP.blue
    const clickColor = d3.color(primaryColor)?.darker(1).toString() || primaryColor
    const labelFontSize = Math.max(7, Math.min(11, rowH * 0.38))
    const badgeFontSize = Math.max(7, Math.min(10, rowH * 0.32))

    // ── Row backgrounds ──────────────────────────────────────────
    const evenBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
    const oddBg  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)'

    documentData.forEach((_doc, i) => {
      const y = i * rowH
      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', innerWidth).attr('height', rowH)
        .attr('fill', i % 2 === 0 ? evenBg : oddBg)
    })

    // Outer border
    g.append('rect')
      .attr('x', 0).attr('y', 0)
      .attr('width', innerWidth).attr('height', innerHeight)
      .attr('fill', 'none')
      .attr('stroke', theme.palette.divider)
      .attr('stroke-width', 1)

    // Row dividers
    documentData.forEach((_, i) => {
      if (i === 0) return
      g.append('line')
        .attr('x1', 0).attr('x2', innerWidth)
        .attr('y1', i * rowH).attr('y2', i * rowH)
        .attr('stroke', theme.palette.divider)
        .attr('stroke-width', 0.5)
    })

    // ── Tooltip ─────────────────────────────────────────────────
    const tooltip = d3.select(chartRef.current).append('div')
      .attr('class', 'cp-tooltip')
      .style('position', 'absolute')
      .style('background', theme.palette.background.paper)
      .style('border', `1px solid ${theme.palette.divider}`)
      .style('border-radius', '8px')
      .style('padding', '8px 12px')
      .style('box-shadow', theme.shadows[4])
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('z-index', '1000')
      .style('opacity', '0')
      .style('transition', 'opacity 0.12s')

    // ── Tick marks per document ──────────────────────────────────
    const tickTop = ROW_PADDING_PX
    const tickBot = rowH - ROW_PADDING_PX
    const hasClickHandler = !!onTickClickRef.current

    documentData.forEach((doc, i) => {
      const yOffset = i * rowH
      const tickGroup = g.append('g')

      doc.hits.forEach((hit, j) => {
        const { normalizedPos, originalIdx } = hit
        tickGroup.append('line')
          .attr('x1', xScale(normalizedPos)).attr('x2', xScale(normalizedPos))
          .attr('y1', yOffset + tickTop).attr('y2', yOffset + tickBot)
          .attr('stroke', primaryColor)
          .attr('stroke-width', 1.5)
          .attr('opacity', 0)
          .attr('cursor', hasClickHandler ? 'pointer' : 'default')
          .on('mouseover', function(event) {
            d3.select(this).attr('stroke-width', 3).attr('opacity', 1)
            const [mx, my] = d3.pointer(event, chartRef.current)
            tooltip
              .style('opacity', '1')
              .style('left', `${mx + 15}px`)
              .style('top', `${my - 10}px`)
              .html(
                `<strong>${doc.filename}</strong><br/>` +
                `${isZh ? '位置' : 'Position'}: ${normalizedPos.toFixed(1)}%<br/>` +
                `${isZh ? '命中数' : 'Hits'}: ${doc.count}` +
                (hasClickHandler ? `<br/><span style="color:${primaryColor};font-size:11px">${t('collocation.visualization.clickToJumpToResult')}</span>` : '')
              )
          })
          .on('mouseout', function() {
            d3.select(this).attr('stroke-width', 1.5).attr('opacity', 0.8)
            tooltip.style('opacity', '0')
          })
          .on('click', function() {
            if (!onTickClickRef.current) return
            // Brief visual feedback: darken tick on click
            d3.select(this)
              .attr('stroke', clickColor)
              .transition().duration(400)
              .attr('stroke', primaryColor)
            tooltip.style('opacity', '0')
            onTickClickRef.current(results[originalIdx])
          })
          .transition()
          .duration(250)
          .delay(i * 20 + j * 1.5)
          .attr('opacity', 0.8)
      })

      // Hit-count badge on right
      g.append('text')
        .attr('x', innerWidth + 6)
        .attr('y', yOffset + rowH / 2)
        .attr('dy', '0.35em')
        .attr('font-size', `${badgeFontSize}px`)
        .attr('font-weight', 500)
        .attr('fill', theme.palette.text.secondary)
        .attr('opacity', 0)
        .text(`(${doc.count})`)
        .transition().delay(i * 20 + 250).duration(200)
        .attr('opacity', 1)
    })

    // ── Y-axis labels (document names) ──────────────────────────
    documentData.forEach((doc, i) => {
      const maxChars = labelFontSize >= 9 ? 22 : 16
      const name = doc.filename.length > maxChars
        ? doc.filename.slice(0, maxChars - 3) + '...'
        : doc.filename
      g.append('text')
        .attr('x', -8)
        .attr('y', i * rowH + rowH / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .attr('font-size', `${labelFontSize}px`)
        .attr('fill', theme.palette.text.primary)
        .text(name)
    })

    // ── X-axis ───────────────────────────────────────────────────
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `${d}%`))
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('fill', theme.palette.text.secondary)

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 40)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', theme.palette.text.secondary)
      .text(isZh ? '文档位置 (%)' : 'Document Position (%)')

    // ── Title ────────────────────────────────────────────────────
    svg.append('text')
      .attr('x', width / 2).attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px').attr('font-weight', 600)
      .attr('fill', theme.palette.text.primary)
      .text(isZh ? '关键词位置分布' : 'Concordance Plot — Keyword Position Distribution')

    return () => {
      d3.select(chartRef.current).selectAll('.cp-tooltip').remove()
    }
  }, [documentData, chartWidth, chartHeight, colorScheme, isZh, theme, isDark, results, t])

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

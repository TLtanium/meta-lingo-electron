/**
 * D3 diverging bar chart of corpus-level feature z-scores against Biber's
 * norms. Features beyond ±2 SD are highlighted (over/underused variables).
 */

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { MDAResponse } from '../../../../types/mdaAnalysis'
import { DIMENSION_COLORS } from '../biberReference'

interface ZScoreChartProps {
  result: MDAResponse
  onlySalient: boolean
}

const ROW_H = 18

export default function ZScoreChart({ result, onlySalient }: ZScoreChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || width === 0) return
    const features = result.features
    if (!features) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    let data = features
      .map(f => ({
        code: f.code,
        name: isZh ? f.name_zh : f.name_en,
        z: f.zscore,
        dim: f.loading?.dimension ?? null
      }))
      .sort((a, b) => b.z - a.z)
    if (onlySalient) data = data.filter(d => Math.abs(d.z) > 2)

    const textColor = theme.palette.text.primary
    const gridColor = theme.palette.divider
    const margin = { top: 72, right: 64, bottom: 24, left: 210 }
    const chartW = width - margin.left - margin.right
    const chartH = data.length * ROW_H
    const totalH = chartH + margin.top + margin.bottom
    if (chartW <= 0) return

    // Axis domain from non-degenerate values only: features with a near-zero
    // Biber SD (e.g. [SPIN], sd=0.00001 in MAT) produce astronomically large
    // z-scores that would flatten every other bar. Such bars are clipped to
    // the axis edge and keep their true value as an in-bar label.
    const sane = data.filter(d => Math.abs(d.z) <= 12)
    const maxAbs = Math.max(2.5, d3.max(sane, d => Math.abs(d.z)) ?? 2.5)
    const xScale = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([0, chartW]).nice()
    const [domMin, domMax] = xScale.domain()
    const clampZ = (z: number) => Math.max(domMin, Math.min(domMax, z))
    const isClipped = (z: number) => z < domMin || z > domMax
    const yScale = d3.scaleBand<string>().domain(data.map(d => d.code)).range([0, chartH]).padding(0.25)

    const g = svg
      .attr('width', width)
      .attr('height', totalH)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Top axis
    const axisTop = g.append('g').call(d3.axisTop(xScale).ticks(8))
    axisTop.selectAll('text').attr('fill', textColor).style('font-size', '10px')
    axisTop.selectAll('line,path').attr('stroke', gridColor)

    // ±2 SD reference band and zero line
    g.append('rect')
      .attr('x', xScale(-2)).attr('width', xScale(2) - xScale(-2))
      .attr('y', 0).attr('height', chartH)
      .attr('fill', gridColor).attr('fill-opacity', 0.15)
    for (const v of [-2, 2]) {
      g.append('line')
        .attr('x1', xScale(v)).attr('x2', xScale(v))
        .attr('y1', 0).attr('y2', chartH)
        .attr('stroke', gridColor).attr('stroke-dasharray', '4,3')
    }
    g.append('line')
      .attr('x1', xScale(0)).attr('x2', xScale(0))
      .attr('y1', 0).attr('y2', chartH)
      .attr('stroke', textColor).attr('stroke-width', 1)

    // Bars (extreme values clipped to the axis edge)
    g.selectAll('.zbar')
      .data(data)
      .join('rect')
      .attr('class', 'zbar')
      .attr('x', d => Math.min(xScale(0), xScale(clampZ(d.z))))
      .attr('width', d => Math.abs(xScale(clampZ(d.z)) - xScale(0)))
      .attr('y', d => yScale(d.code)!)
      .attr('height', yScale.bandwidth())
      .attr('rx', 2)
      .attr('fill', d => {
        if (d.z > 2) return theme.palette.error.main
        if (d.z < -2) return theme.palette.info.main
        return d.dim ? DIMENSION_COLORS[d.dim] : theme.palette.text.disabled
      })
      .attr('fill-opacity', d => (Math.abs(d.z) > 2 ? 0.95 : 0.55))
      .append('title')
      .text(d => `${d.code} — ${d.name}\nz = ${d.z.toFixed(2)}${d.dim ? `  (D${d.dim})` : ''}${isClipped(d.z) ? (isZh ? '\n（条形已截断至坐标轴边缘）' : '\n(bar clipped to axis edge)') : ''}`)

    // Labels (code + name)
    g.selectAll('.zlabel')
      .data(data)
      .join('text')
      .attr('class', 'zlabel')
      .attr('x', -8)
      .attr('y', d => yScale(d.code)! + yScale.bandwidth() / 2 + 3)
      .attr('text-anchor', 'end')
      .attr('fill', textColor)
      .style('font-size', '10px')
      .style('font-weight', d => (Math.abs(d.z) > 2 ? '700' : '400'))
      .text(d => `${d.code} ${d.name.length > 18 ? d.name.slice(0, 17) + '…' : d.name}`)

    // Values: clipped bars show the true value inside the bar end
    g.selectAll('.zvalue')
      .data(data)
      .join('text')
      .attr('class', 'zvalue')
      .attr('x', d => {
        if (isClipped(d.z)) return d.z >= 0 ? xScale(domMax) - 4 : xScale(domMin) + 4
        return d.z >= 0 ? xScale(d.z) + 4 : xScale(d.z) - 4
      })
      .attr('text-anchor', d => {
        if (isClipped(d.z)) return d.z >= 0 ? 'end' : 'start'
        return d.z >= 0 ? 'start' : 'end'
      })
      .attr('y', d => yScale(d.code)! + yScale.bandwidth() / 2 + 3)
      .attr('fill', d => (isClipped(d.z) ? theme.palette.common.white : textColor))
      .style('font-size', '9px')
      .style('font-weight', d => (isClipped(d.z) ? '700' : '400'))
      .text(d => {
        if (!isClipped(d.z)) return d.z.toFixed(2)
        return d.z >= 0 ? `${d.z.toFixed(0)} →` : `← ${d.z.toFixed(0)}`
      })

    // Centered title + subtitle (same style as DimensionChart / TextTypeChart)
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('fill', textColor)
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text(t('mda.viz.zscoreChart'))
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .attr('fill', theme.palette.text.secondary)
      .style('font-size', '12px')
      .text(t('mda.viz.zscoreTitle'))
  }, [result, onlySalient, width, theme, isZh, t])

  return (
    <Box ref={containerRef} sx={{ width: '100%' }}>
      <svg ref={svgRef} className="mda-chart-svg" style={{ display: 'block' }} />
    </Box>
  )
}

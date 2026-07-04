/**
 * D3 text-type profile chart (replaces MAT Text_types.png with a
 * parallel-coordinates layout): five axes (D1-D5), one polyline per
 * Biber (1989) text type centroid, plus the analyzed corpus as a bold line.
 * The closest text type is highlighted.
 */

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { MDAResponse } from '../../../../types/mdaAnalysis'
import { TEXT_TYPES, TEXT_TYPE_LABELS_ZH, DIMENSION_LABELS } from '../biberReference'

interface TextTypeChartProps {
  result: MDAResponse
}

const TYPE_COLORS = [
  '#4caf50', '#2196f3', '#9c27b0', '#e91e63',
  '#ff9800', '#795548', '#607d8b', '#00bcd4'
]

export default function TextTypeChart({ result }: TextTypeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSize({ width: e.contentRect.width, height: e.contentRect.height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || size.width === 0 || size.height === 0) return
    const corpus = result.corpus
    if (!corpus) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const textColor = theme.palette.text.primary
    const gridColor = theme.palette.divider
    const corpusColor = theme.palette.warning.main
    const closest = corpus.closest_text_type
    const typeLabel = (name: string) => (isZh ? TEXT_TYPE_LABELS_ZH[name] || name : name)

    const corpusVec = [1, 2, 3, 4, 5].map(d => corpus.dimensions[String(d)] ?? 0)
    const typeNames = Object.keys(TEXT_TYPES)

    const legendW = 230
    const margin = { top: 56, right: legendW + 16, bottom: 40, left: 40 }
    const width = size.width - margin.left - margin.right
    const height = size.height - margin.top - margin.bottom
    if (width <= 0 || height <= 0) return

    // Per-dimension independent scales (D1 spans ±45, others much less)
    const yScales: d3.ScaleLinear<number, number>[] = [0, 1, 2, 3, 4].map(i => {
      const vals = [...typeNames.map(n => TEXT_TYPES[n][i]), corpusVec[i]]
      const [lo, hi] = d3.extent(vals) as [number, number]
      const pad = Math.max((hi - lo) * 0.12, 1)
      return d3.scaleLinear().domain([lo - pad, hi + pad]).range([height, 0]).nice()
    })

    const xScale = d3.scalePoint<number>().domain([0, 1, 2, 3, 4]).range([0, width]).padding(0.3)

    const g = svg
      .attr('width', size.width)
      .attr('height', size.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Title
    svg.append('text')
      .attr('x', (size.width - legendW) / 2)
      .attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('fill', textColor)
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text(t('mda.viz.textTypeTitle'))
    svg.append('text')
      .attr('x', (size.width - legendW) / 2)
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .attr('fill', corpusColor)
      .style('font-size', '12px')
      .text(`${t('mda.summary.closestType')}: ${typeLabel(closest)}`)

    // Axes
    for (let i = 0; i < 5; i++) {
      const x = xScale(i)!
      const axis = g.append('g')
        .attr('transform', `translate(${x},0)`)
        .call(d3.axisLeft(yScales[i]).ticks(6).tickSize(3))
      axis.selectAll('text').attr('fill', textColor).style('font-size', '9px')
      axis.selectAll('line,path').attr('stroke', gridColor)
      g.append('line')
        .attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', height)
        .attr('stroke', gridColor)
      g.append('text')
        .attr('x', x)
        .attr('y', height + 26)
        .attr('text-anchor', 'middle')
        .attr('fill', textColor)
        .style('font-size', '11px')
        .style('font-weight', '600')
        .text(`D${i + 1}`)
        .append('title')
        .text(isZh ? DIMENSION_LABELS[i + 1].zh : DIMENSION_LABELS[i + 1].en)
    }

    const lineGen = (vec: number[]) =>
      d3.line<number>()
        .x(i => xScale(i)!)
        .y(i => yScales[i](vec[i]))
        .curve(d3.curveMonotoneX)([0, 1, 2, 3, 4])

    // Text type centroid lines
    typeNames.forEach((name, idx) => {
      const isClosest = name === closest
      const isHover = hovered === name
      const emphasized = isClosest || isHover
      g.append('path')
        .attr('d', lineGen(TEXT_TYPES[name])!)
        .attr('fill', 'none')
        .attr('stroke', TYPE_COLORS[idx % TYPE_COLORS.length])
        .attr('stroke-width', emphasized ? 3 : 1.5)
        .attr('stroke-opacity', hovered && !isHover && !isClosest ? 0.18 : (emphasized ? 0.95 : 0.5))
        .style('cursor', 'pointer')
        .on('mouseenter', () => setHovered(name))
        .on('mouseleave', () => setHovered(null))
        .append('title')
        .text(`${typeLabel(name)} (${TEXT_TYPES[name].join(', ')})`)
      // centroid dots
      for (let i = 0; i < 5; i++) {
        g.append('circle')
          .attr('cx', xScale(i)!).attr('cy', yScales[i](TEXT_TYPES[name][i]))
          .attr('r', emphasized ? 3.5 : 2.5)
          .attr('fill', TYPE_COLORS[idx % TYPE_COLORS.length])
          .attr('fill-opacity', hovered && !isHover && !isClosest ? 0.18 : 0.9)
      }
    })

    // Corpus line (bold)
    g.append('path')
      .attr('d', lineGen(corpusVec)!)
      .attr('fill', 'none')
      .attr('stroke', corpusColor)
      .attr('stroke-width', 4)
      .attr('stroke-linecap', 'round')
    for (let i = 0; i < 5; i++) {
      g.append('circle')
        .attr('cx', xScale(i)!).attr('cy', yScales[i](corpusVec[i]))
        .attr('r', 5.5)
        .attr('fill', corpusColor)
        .attr('stroke', theme.palette.background.paper)
        .attr('stroke-width', 1.5)
        .append('title')
        .text(`D${i + 1}: ${corpusVec[i].toFixed(2)}`)
    }

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${size.width - legendW},${margin.top})`)
    const entries = [
      { name: t('mda.viz.yourCorpus'), color: corpusColor, bold: true },
      ...typeNames.map((n, idx) => ({ name: n, color: TYPE_COLORS[idx % TYPE_COLORS.length], bold: n === closest }))
    ]
    entries.forEach((e, i) => {
      const y = i * 22
      const row = legend.append('g')
        .attr('transform', `translate(0,${y})`)
        .style('cursor', i === 0 ? 'default' : 'pointer')
        .on('mouseenter', () => i > 0 && setHovered(typeNames[i - 1]))
        .on('mouseleave', () => setHovered(null))
      row.append('line')
        .attr('x1', 0).attr('x2', 22).attr('y1', 0).attr('y2', 0)
        .attr('stroke', e.color)
        .attr('stroke-width', e.bold ? 3.5 : 2)
      row.append('text')
        .attr('x', 28).attr('y', 4)
        .attr('fill', textColor)
        .style('font-size', '11px')
        .style('font-weight', e.bold ? '700' : '400')
        .text(i === 0 ? e.name : typeLabel(e.name))
    })
  }, [result, size, theme, isZh, t, hovered])

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%' }}>
      <svg ref={svgRef} className="mda-chart-svg" style={{ display: 'block' }} />
    </Box>
  )
}

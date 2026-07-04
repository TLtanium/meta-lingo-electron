/**
 * D3 dimension error-bar chart (replicates MAT Dimension#.png):
 * 8 Biber genres shown as mean ± range whiskers, plus the analyzed
 * corpus/text as a highlighted point (with its own min-max range and
 * optional per-text dots).
 */

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Box, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { MDAResponse } from '../../../../types/mdaAnalysis'
import {
  GENRES,
  GENRE_LABELS_ZH,
  GENRE_DIMENSION_STATS,
  DIMENSION_LABELS,
  DIMENSION_COLORS
} from '../biberReference'

interface DimensionChartProps {
  result: MDAResponse
  dimension: number
  showTexts: boolean
}

export default function DimensionChart({ result, dimension, showTexts }: DimensionChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [size, setSize] = useState({ width: 0, height: 0 })

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

    const color = DIMENSION_COLORS[dimension]
    const textColor = theme.palette.text.primary
    const gridColor = theme.palette.divider
    const stats = GENRE_DIMENSION_STATS[dimension]
    const corpusScore = corpus.dimensions[String(dimension)] ?? 0
    const corpusRange = corpus.dimension_ranges[String(dimension)] ?? [corpusScore, corpusScore]
    const textScores = (result.texts ?? []).map(x => ({
      label: x.filename,
      value: x.dimensions[String(dimension)] ?? 0
    }))

    // Closest genre by |mean difference| (MAT logic)
    let closestGenre = GENRES[0] as string
    let best = Infinity
    stats.forEach((s, i) => {
      const d = Math.abs(corpusScore - s.mean)
      if (d < best) { best = d; closestGenre = GENRES[i] }
    })
    const genreLabel = (g: string) => (isZh ? GENRE_LABELS_ZH[g] || g : g)

    const margin = { top: 48, right: 24, bottom: 64, left: 56 }
    const width = size.width - margin.left - margin.right
    const height = size.height - margin.top - margin.bottom
    if (width <= 0 || height <= 0) return

    const categories = [...GENRES.map(g => genreLabel(g)), t('mda.viz.yourCorpus')]

    const allValues = [
      ...stats.flatMap(s => [s.low, s.high]),
      corpusScore, corpusRange[0], corpusRange[1],
      ...(showTexts ? textScores.map(x => x.value) : [])
    ]
    const [minV, maxV] = d3.extent(allValues) as [number, number]
    const pad = Math.max((maxV - minV) * 0.1, 1)

    const g = svg
      .attr('width', size.width)
      .attr('height', size.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3.scalePoint<string>()
      .domain(categories)
      .range([0, width])
      .padding(0.6)

    const yScale = d3.scaleLinear()
      .domain([minV - pad, maxV + pad])
      .range([height, 0])
      .nice()

    // Title with closest genre
    const dimLabel = isZh ? DIMENSION_LABELS[dimension].zh : DIMENSION_LABELS[dimension].en
    svg.append('text')
      .attr('x', size.width / 2)
      .attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('fill', textColor)
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text(`D${dimension} — ${dimLabel}`)
    svg.append('text')
      .attr('x', size.width / 2)
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .attr('fill', color)
      .style('font-size', '12px')
      .text(`${t('mda.viz.closestGenre')}: ${genreLabel(closestGenre)}`)

    // Y grid + axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(8))
      .call(sel => sel.selectAll('text').attr('fill', textColor))
      .call(sel => sel.selectAll('line,path').attr('stroke', gridColor))
    g.append('g')
      .selectAll('line')
      .data(yScale.ticks(8))
      .join('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', gridColor)
      .attr('stroke-opacity', 0.35)

    // Zero line
    if (yScale.domain()[0] < 0 && yScale.domain()[1] > 0) {
      g.append('line')
        .attr('x1', 0).attr('x2', width)
        .attr('y1', yScale(0)).attr('y2', yScale(0))
        .attr('stroke', textColor)
        .attr('stroke-width', 1)
    }

    // X axis labels (rotated)
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .call(sel => sel.selectAll('line,path').attr('stroke', gridColor))
      .selectAll('text')
      .attr('fill', textColor)
      .style('font-size', '11px')
      .attr('transform', 'rotate(-18)')
      .style('text-anchor', 'end')

    const capW = 8

    // Genre error bars
    stats.forEach((s, i) => {
      const x = xScale(genreLabel(GENRES[i]))!
      g.append('line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', yScale(s.low)).attr('y2', yScale(s.high))
        .attr('stroke', color).attr('stroke-width', 2.5)
      for (const v of [s.low, s.high]) {
        g.append('line')
          .attr('x1', x - capW).attr('x2', x + capW)
          .attr('y1', yScale(v)).attr('y2', yScale(v))
          .attr('stroke', color).attr('stroke-width', 2.5)
      }
      g.append('circle')
        .attr('cx', x).attr('cy', yScale(s.mean)).attr('r', 5)
        .attr('fill', color)
        .append('title')
        .text(`${genreLabel(GENRES[i])}\nmean ${s.mean}  [${s.low}, ${s.high}]`)
    })

    // Corpus point (+ its min-max range when multiple texts)
    const cx = xScale(t('mda.viz.yourCorpus'))!
    if ((result.texts?.length ?? 0) > 1) {
      g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', yScale(corpusRange[0])).attr('y2', yScale(corpusRange[1]))
        .attr('stroke', theme.palette.warning.main)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '4,3')
      for (const v of corpusRange) {
        g.append('line')
          .attr('x1', cx - capW).attr('x2', cx + capW)
          .attr('y1', yScale(v)).attr('y2', yScale(v))
          .attr('stroke', theme.palette.warning.main).attr('stroke-width', 2.5)
      }
    }
    if (showTexts && textScores.length > 1) {
      g.selectAll('.mda-text-dot')
        .data(textScores)
        .join('circle')
        .attr('class', 'mda-text-dot')
        .attr('cx', () => cx + (Math.random() - 0.5) * 18)
        .attr('cy', d => yScale(d.value))
        .attr('r', 2.5)
        .attr('fill', theme.palette.warning.main)
        .attr('fill-opacity', 0.45)
        .append('title')
        .text(d => `${d.label}: ${d.value.toFixed(2)}`)
    }
    g.append('circle')
      .attr('cx', cx).attr('cy', yScale(corpusScore)).attr('r', 7)
      .attr('fill', theme.palette.warning.main)
      .attr('stroke', theme.palette.background.paper)
      .attr('stroke-width', 1.5)
      .append('title')
      .text(`${t('mda.viz.yourCorpus')}: ${corpusScore.toFixed(2)}`)
  }, [result, dimension, showTexts, size, theme, isZh, t])

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%' }}>
      <svg ref={svgRef} className="mda-chart-svg" style={{ display: 'block' }} />
    </Box>
  )
}

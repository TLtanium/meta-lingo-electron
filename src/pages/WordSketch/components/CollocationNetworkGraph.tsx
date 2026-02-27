/**
 * Collocation Network Graph
 * D3.js force-directed graph showing node word at center
 * connected to collocates, sized by association strength.
 */

import { useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Box,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Divider
} from '@mui/material'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import { NumberInput } from '../../../components/common'
import type { CollocationAnalysisResult, StatisticalMeasure } from '../../../types/collocationAnalysis'

interface CollocationNetworkGraphProps {
  data: CollocationAnalysisResult[]
  nodeWord: string
  maxItems: number
  onMaxItemsChange: (value: number) => void
  scoreMetric: StatisticalMeasure
  onScoreMetricChange: (metric: StatisticalMeasure) => void
  enabledMetrics: StatisticalMeasure[]
  colorScheme?: string
  onColorSchemeChange?: (scheme: string) => void
  expandedData?: Record<string, CollocationAnalysisResult[]>
  loadingExpand?: string | null
  onExpandCollocate?: (collocate: string) => void
}

interface GraphNode {
  id: string
  label: string
  isCenter: boolean
  isLevel2: boolean
  score: number
  freq: number
}

interface GraphLink {
  source: string
  target: string
  weight: number
}

export default function CollocationNetworkGraph({
  data,
  nodeWord,
  maxItems,
  onMaxItemsChange,
  scoreMetric,
  onScoreMetricChange,
  enabledMetrics,
  colorScheme = 'blue',
  onColorSchemeChange,
  expandedData = {},
  loadingExpand = null,
  onExpandCollocate
}: CollocationNetworkGraphProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Prepare graph data: center + level-1 collocates + level-2 (from expanded), shared level-2 nodes merged
  const graphData = useMemo(() => {
    const topItems = data
      .filter(r => (r as any)[scoreMetric] !== undefined)
      .sort((a, b) => ((b as any)[scoreMetric] ?? 0) - ((a as any)[scoreMetric] ?? 0))
      .slice(0, maxItems)

    const nodes: GraphNode[] = [
      {
        id: nodeWord,
        label: nodeWord,
        isCenter: true,
        isLevel2: false,
        score: 0,
        freq: 0
      },
      ...topItems.map(r => ({
        id: r.collocate,
        label: r.collocate,
        isCenter: false,
        isLevel2: false,
        score: (r as any)[scoreMetric] ?? 0,
        freq: r.collocation_freq
      }))
    ]

    const links: GraphLink[] = topItems.map(r => ({
      source: nodeWord,
      target: r.collocate,
      weight: r.collocation_freq
    }))

    const level1Ids = new Set(topItems.map(r => r.collocate))

    // Add level-2 nodes and links from expandedData; skip ids that equal center or level-1 (avoid duplicate nodes so D3 links bind correctly)
    const level2NodeMap = new Map<string, { score: number; freq: number }>()
    for (const [parentId, results] of Object.entries(expandedData)) {
      if (!level1Ids.has(parentId)) continue
      const sorted = [...results]
        .filter(r => (r as any)[scoreMetric] !== undefined)
        .sort((a, b) => ((b as any)[scoreMetric] ?? 0) - ((a as any)[scoreMetric] ?? 0))
        .slice(0, maxItems)
      for (const r of sorted) {
        const id = r.collocate
        if (id === nodeWord || level1Ids.has(id)) continue
        const score = (r as any)[scoreMetric] ?? 0
        const freq = r.collocation_freq
        if (!level2NodeMap.has(id)) level2NodeMap.set(id, { score, freq })
        links.push({ source: parentId, target: id, weight: freq })
      }
    }

    for (const [id, { score, freq }] of level2NodeMap) {
      nodes.push({ id, label: id, isCenter: false, isLevel2: true, score, freq })
    }

    return { nodes, links }
  }, [data, nodeWord, maxItems, scoreMetric, expandedData])

  // Render graph
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    if (graphData.nodes.length <= 1) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    // Color palette - richer primary + lighter tint for collocates
    const colorMap: Record<string, { primary: string; light: string; dark: string }> = {
      blue:   { primary: '#1976d2', light: '#e3f2fd', dark: '#0d47a1' },
      green:  { primary: '#2e7d32', light: '#e8f5e9', dark: '#1b5e20' },
      purple: { primary: '#7b1fa2', light: '#f3e5f5', dark: '#4a148c' },
      orange: { primary: '#e65100', light: '#fff3e0', dark: '#bf360c' },
      red:    { primary: '#c62828', light: '#ffebee', dark: '#b71c1c' }
    }
    const palette = colorMap[colorScheme] || colorMap.blue
    const primaryColor = palette.primary

    // Score scale for node sizing — level-2 nodes slightly smaller range (18-32), level-1 (24-40)
    const scores = graphData.nodes.filter(n => !n.isCenter).map(n => n.score)
    const minScore = scores.length ? Math.min(...scores) : 0
    const maxScore = scores.length ? Math.max(...scores) : 1
    const sizeScale = d3.scaleLinear()
      .domain([minScore, maxScore])
      .range([24, 40])
    const sizeScaleLevel2 = d3.scaleLinear()
      .domain([minScore, maxScore])
      .range([18, 28])

    // Font size scale — proportional to node radius
    const fontScale = d3.scaleLinear()
      .domain([minScore, maxScore])
      .range([10, 13])

    // Link distance: stronger score → shorter link (closer to center)
    const distScale = d3.scaleLinear()
      .domain([minScore, maxScore])
      .range([200, 80])

    // Link width scale
    const weights = graphData.links.map(l => l.weight)
    const linkWidthScale = d3.scaleLinear()
      .domain([Math.min(...weights), Math.max(...weights)])
      .range([1, 3.5])

    // Link opacity scale — stronger = more opaque
    const linkOpacityScale = d3.scaleLinear()
      .domain([minScore, maxScore])
      .range([0.2, 0.6])

    // Build a score lookup for link distance & opacity
    const scoreByTarget = new Map<string, number>()
    graphData.nodes.forEach(n => { if (!n.isCenter) scoreByTarget.set(n.id, n.score) })

    // --- SVG defs: drop-shadow filter ---
    const defs = svg.append('defs')
    const filter = defs.append('filter').attr('id', 'drop-shadow').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%')
    filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 3)
    filter.append('feOffset').attr('dx', 0).attr('dy', 1).attr('result', 'offsetblur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'offsetblur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Zoom
    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Force simulation — distance reflects score strength
    const simulation = d3.forceSimulation(graphData.nodes as any)
      .force('link', d3.forceLink(graphData.links as any)
        .id((d: any) => d.id)
        .distance((d: any) => {
          const targetScore = scoreByTarget.get(d.target.id ?? d.target) ?? minScore
          return distScale(targetScore)
        })
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => {
        if (d.isCenter) return 50
        return (d.isLevel2 ? sizeScaleLevel2(d.score) : sizeScale(d.score)) + 6
      }))

    // --- Links (drawn first, behind nodes) ---
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('stroke', primaryColor)
      .attr('stroke-opacity', (d: any) => {
        const s = scoreByTarget.get(d.target.id ?? d.target) ?? minScore
        return linkOpacityScale(s)
      })
      .attr('stroke-width', (d: any) => linkWidthScale(d.weight))
      .attr('stroke-linecap', 'round')

    // --- Nodes ---
    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .join('g')
      .attr('cursor', (d: any) => {
        if (d.isCenter) return 'grab'
        if (d.isLevel2) return 'default'
        return onExpandCollocate ? 'pointer' : 'grab'
      })
      .on('click', (event: any, d: any) => {
        if (d.isCenter || d.isLevel2) return
        if (expandedData[d.id]) return
        onExpandCollocate?.(d.id)
      })
      .call(d3.drag<any, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
          d3.select(event.sourceEvent.target.closest('g')).attr('cursor', 'grabbing')
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x; d.fy = event.y
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null; d.fy = null
          d3.select(event.sourceEvent.target.closest('g')).attr('cursor', 'grab')
        })
      )

    // Center node radius
    const centerR = 36

    // Node circles — center bold; level-1 and level-2 by score (level-2 slightly smaller)
    node.append('circle')
      .attr('r', (d: any) => {
        if (d.isCenter) return centerR
        return d.isLevel2 ? sizeScaleLevel2(d.score) : sizeScale(d.score)
      })
      .attr('fill', (d: any) => {
        if (d.isCenter) return primaryColor
        // gradient from light tint to primary based on normalized score
        const t = (d.score - minScore) / (maxScore - minScore || 1)
        return d3.interpolateRgb(palette.light, primaryColor)(t * 0.55 + 0.08)
      })
      .attr('stroke', (d: any) => d.isCenter ? '#fff' : primaryColor)
      .attr('stroke-width', (d: any) => d.isCenter ? 2.5 : 1.2)
      .attr('stroke-opacity', (d: any) => d.isCenter ? 1 : 0.35)
      .attr('filter', (d: any) => d.isCenter ? 'url(#drop-shadow)' : null)

    // --- Labels centered inside nodes ---
    node.append('text')
      .text((d: any) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', (d: any) => {
        if (d.isCenter) return 15
        return d.isLevel2 ? Math.max(9, fontScale(d.score) - 1) : fontScale(d.score)
      })
      .attr('font-weight', (d: any) => d.isCenter ? 700 : 500)
      .attr('fill', (d: any) => {
        if (d.isCenter) return '#fff'
        // darker text for readability on lighter node fills
        const t = (d.score - minScore) / (maxScore - minScore || 1)
        return t > 0.6 ? '#fff' : palette.dark
      })
      .attr('pointer-events', 'none')
      .each(function (d: any) {
        // Truncate text if it overflows the circle
        const r = d.isCenter ? centerR : (d.isLevel2 ? sizeScaleLevel2(d.score) : sizeScale(d.score))
        const maxWidth = r * 2 - 6  // leave 3px padding on each side
        const textEl = d3.select(this)
        let text = d.label as string
        const node = this as SVGTextElement
        // Measure and truncate
        if (node.getComputedTextLength() > maxWidth && text.length > 3) {
          while (node.getComputedTextLength() > maxWidth && text.length > 3) {
            text = text.slice(0, -1)
            textEl.text(text + '\u2026')
          }
        }
      })

    // Tooltip on hover — show full label + score; for level-1 add expand hint
    node.append('title')
      .text((d: any) => {
        if (d.isCenter) return d.label
        const base = `${d.label}\n${scoreMetric}: ${d.score.toFixed(2)}\nfreq: ${d.freq}`
        if (!d.isLevel2 && onExpandCollocate && !expandedData[d.id]) return base + '\n' + (t('collocationAnalysis.visualization.expandHint') || 'Click to expand')
        return base
      })

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
    }
  }, [graphData, colorScheme, scoreMetric, expandedData, loadingExpand, onExpandCollocate, t])

  // Helper: clone SVG with viewBox fitted to full graph content
  const cloneSvgFitted = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return null
    // Structure: <svg> <defs/> <g transform="zoom">...</g> </svg>
    // The content group is the first <g> (defs is not a <g>)
    const contentG = svg.querySelector(':scope > g')
    if (!contentG) return null

    const bbox = (contentG as SVGGElement).getBBox()
    const padding = 30
    const vx = bbox.x - padding
    const vy = bbox.y - padding
    const vw = bbox.width + padding * 2
    const vh = bbox.height + padding * 2

    const svgClone = svg.cloneNode(true) as SVGSVGElement
    // Remove zoom transform so viewBox maps to raw content coordinates
    const cloneG = svgClone.querySelector(':scope > g')
    if (cloneG) cloneG.removeAttribute('transform')
    svgClone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
    svgClone.setAttribute('width', String(Math.round(vw)))
    svgClone.setAttribute('height', String(Math.round(vh)))
    // Add white background for export
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('x', String(vx))
    bg.setAttribute('y', String(vy))
    bg.setAttribute('width', String(vw))
    bg.setAttribute('height', String(vh))
    bg.setAttribute('fill', '#ffffff')
    svgClone.insertBefore(bg, svgClone.firstChild)

    return { svgClone, width: Math.round(vw), height: Math.round(vh) }
  }, [])

  // Export SVG
  const handleExportSVG = useCallback(() => {
    const result = cloneSvgFitted()
    if (!result) return
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(result.svgClone)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `collocation-network-${nodeWord}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }, [nodeWord, cloneSvgFitted])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    const result = cloneSvgFitted()
    if (!result) return
    const { svgClone, width: svgWidth, height: svgHeight } = result

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgClone)
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 3
      canvas.width = svgWidth * scale
      canvas.height = svgHeight * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(svgUrl); return }
      ctx.scale(scale, scale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, svgWidth, svgHeight)
      ctx.drawImage(img, 0, 0, svgWidth, svgHeight)
      URL.revokeObjectURL(svgUrl)
      canvas.toBlob((blob) => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = pngUrl
        link.download = `collocation-network-${nodeWord}.png`
        link.click()
        URL.revokeObjectURL(pngUrl)
      }, 'image/png', 1.0)
    }
    img.src = svgUrl
  }, [nodeWord, cloneSvgFitted])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Settings bar */}
      <Paper
        elevation={0}
        sx={{
          px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}
      >
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
          <NumberInput
            label={t('collocationAnalysis.visualization.maxItems')}
            size="small"
            value={maxItems}
            onChange={onMaxItemsChange}
            min={5}
            max={50}
            step={5}
            integer
            defaultValue={20}
            sx={{ width: 130 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('collocationAnalysis.visualization.scoreMetric')}</InputLabel>
            <Select
              value={scoreMetric}
              label={t('collocationAnalysis.visualization.scoreMetric')}
              onChange={(e) => onScoreMetricChange(e.target.value as StatisticalMeasure)}
            >
              {enabledMetrics.map(m => (
                <MenuItem key={m} value={m}>
                  {t(`collocationAnalysis.statistics.${m}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{t('collocationAnalysis.visualization.colorScheme')}</InputLabel>
            <Select
              value={colorScheme}
              label={t('collocationAnalysis.visualization.colorScheme')}
              onChange={(e) => onColorSchemeChange?.(e.target.value)}
            >
              {[
                { value: 'blue', label: 'Blue' },
                { value: 'green', label: 'Green' },
                { value: 'purple', label: 'Purple' },
                { value: 'orange', label: 'Orange' },
                { value: 'red', label: 'Red' }
              ].map(scheme => (
                <MenuItem key={scheme.value} value={scheme.value}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{
                      width: 16, height: 16, borderRadius: 0.5,
                      bgcolor: scheme.value === 'blue' ? '#2196f3' :
                        scheme.value === 'green' ? '#4caf50' :
                        scheme.value === 'purple' ? '#9c27b0' :
                        scheme.value === 'orange' ? '#ff9800' : '#f44336'
                    }} />
                    <span>{scheme.label}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {data.length > 0 && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip title={t('collocationAnalysis.visualization.export') + ' SVG'}>
              <IconButton size="small" onClick={handleExportSVG}>
                <SaveAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('collocationAnalysis.visualization.export') + ' PNG'}>
              <IconButton size="small" onClick={handleExportPNG}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Paper>

      {/* Graph container */}
      <Box ref={containerRef} sx={{ flex: 1, overflow: 'hidden' }}>
        {data.length === 0 ? (
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'text.secondary', flexDirection: 'column', gap: 2, p: 4
          }}>
            <InsertChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
            <Typography variant="h6" color="text.secondary">
              {t('collocationAnalysis.visualization.noData')}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {t('collocationAnalysis.visualization.runFirst')}
            </Typography>
          </Box>
        ) : (
          <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
        )}
      </Box>
    </Box>
  )
}

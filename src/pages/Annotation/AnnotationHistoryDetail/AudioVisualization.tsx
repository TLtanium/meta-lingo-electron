/**
 * AudioVisualization - 音频标注可视化组件
 * 
 * 功能：
 * - 波形可视化（时间轴视图）
 * - 柱状图/饼图统计（标签分布）
 * - 支持导出 SVG 和 PNG
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import {
  Box,
  Stack,
  Typography,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  useTheme
} from '@mui/material'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import BarChartIcon from '@mui/icons-material/BarChart'
import DonutLargeIcon from '@mui/icons-material/DonutLarge'
import TimelineIcon from '@mui/icons-material/Timeline'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import type { Annotation, TranscriptSegment, AudioBox, PitchDataArchive, AcousticDataArchive } from '../../../types'
import {
  renderSpectrogram,
  renderFormantTracks,
  renderFrequencyAxis
} from '../../../utils/spectrogramRenderer'

interface AudioVisualizationProps {
  annotations: Annotation[]
  transcriptSegments: TranscriptSegment[]
  duration: number
  audioUrl?: string
  audioBoxes?: AudioBox[]
  pitchData?: PitchDataArchive
  acousticData?: AcousticDataArchive
  audioVisualizationSvg?: string  // 保存时生成的 SVG
}

// 美观的颜色调色板
const COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0',
  '#6f5ef9', '#89ca7e', '#f5a623', '#d0648a', '#22c3aa'
]

// 太阳图配色：音频画框（蓝色系）、文本标注（橙色系）
const AUDIO_COLOR = '#3b82f6'
const TEXT_ANN_COLOR = '#f97316'
const AUDIO_PALETTE = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a']
const TEXT_PALETTE = ['#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412']

type ChartType = 'waveform' | 'bar' | 'sunburst'

export default function AudioVisualization({
  annotations,
  transcriptSegments,
  duration,
  audioBoxes = [],
  pitchData,
  acousticData,
  audioVisualizationSvg
}: AudioVisualizationProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  
  // 主题相关颜色
  const themeColors = {
    background: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#e0e0e0' : '#333',
    subText: isDarkMode ? '#aaa' : '#666',
    border: isDarkMode ? '#444' : '#e0e0e0',
    scrollbarThumb: isDarkMode ? '#666' : 'grey.400',
    tooltipBg: isDarkMode ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
    cardBg: isDarkMode ? '#2a2a2a' : 'white',
  }
  
  const containerRef = useRef<HTMLDivElement>(null)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const chartSvgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null)

  const [chartType, setChartType] = useState<ChartType>('waveform')
  const [zoom, setZoom] = useState(100) // 缩放百分比
  const minZoom = 100 // 最小缩放 100%（原大小）

  // 频谱图是否有数据
  const hasSpectrogram = !!(acousticData?.enabled && acousticData.spectrogram)
  const hasFormants = !!(acousticData?.enabled && acousticData.formants)
  
  // 过滤出文本标注（排除视频和音频画框类型）
  const textAnnotations = annotations.filter(a => a.type !== 'video' && a.type !== 'audio')
  
  // 统计标签数量（基于 audioBoxes）
  const labelStats = useMemo(() => {
    const counts: Record<string, { count: number; color: string; totalDuration: number }> = {}

    audioBoxes.forEach(box => {
      if (!counts[box.label]) {
        counts[box.label] = {
          count: 0,
          color: box.color || COLORS[Object.keys(counts).length % COLORS.length],
          totalDuration: 0
        }
      }
      counts[box.label].count++
      counts[box.label].totalDuration += (box.endTime - box.startTime)
    })

    return Object.entries(counts)
      .map(([label, data]) => ({
        name: label,
        value: data.count,
        color: data.color,
        totalDuration: data.totalDuration
      }))
      .sort((a, b) => b.value - a.value)
  }, [audioBoxes])

  // 统计文本标注标签数量
  const textAnnotationStats = useMemo(() => {
    const counts: Record<string, number> = {}
    textAnnotations.forEach(ann => {
      if (!ann.id.startsWith('spacy-')) {
        counts[ann.label] = (counts[ann.label] || 0) + 1
      }
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [textAnnotations])
  
  // 绘制频谱图（静态，在波形视图下方）
  useEffect(() => {
    if (chartType !== 'waveform' || !hasSpectrogram || !spectrogramCanvasRef.current) return
    if (!acousticData?.spectrogram) return

    const canvas = spectrogramCanvasRef.current
    const spec = acousticData.spectrogram
    const spectrogramHeight = 250

    // 计算宽度 - 与波形SVG同步
    const pixelsPerSecond = 100 * (zoom / 100) // match SVG zoom
    const totalWidth = Math.max(duration * pixelsPerSecond, 600)

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // Set canvas buffer to physical size
    canvas.width = Math.floor(totalWidth * dpr)
    canvas.height = Math.floor(spectrogramHeight * dpr)
    canvas.style.width = `${totalWidth}px`
    canvas.style.height = `${spectrogramHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // DO NOT call ctx.scale(dpr, dpr) - render functions handle physical coordinates internally
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    const renderOpts = { width: totalWidth, height: spectrogramHeight, pixelsPerSecond, duration, dpr }

    // Render spectrogram heatmap (uses putImageData at physical pixel level)
    renderSpectrogram(ctx, spec, renderOpts)

    // Render frequency axis
    const maxFreq = spec.frequencies[spec.frequencies.length - 1] || 5500
    renderFrequencyAxis(ctx, maxFreq, renderOpts)

    // Render formant tracks if available
    if (hasFormants && acousticData.formants) {
      renderFormantTracks(ctx, acousticData.formants, renderOpts, maxFreq)
    }

  }, [chartType, hasSpectrogram, hasFormants, acousticData, duration, zoom])

  // 绘制柱状图：音频画框与文本标注左右分布，与太阳图同尺寸减少留白
  const drawBarChart = useCallback(() => {
    const hasAudio = labelStats.length > 0
    const hasText = textAnnotationStats.length > 0
    if (!chartSvgRef.current || (!hasAudio && !hasText)) return

    const svg = d3.select(chartSvgRef.current)
    svg.selectAll('*').remove()

    const totalHeight = 520
    const sectionGap = 24
    const sectionTitleHeight = 28
    const margin = { top: 12, right: 20, left: 42, bottom: 72 }
    const leftPadding = 44
    const sectionWidth = 338
    const totalWidth = leftPadding + sectionWidth + sectionGap + sectionWidth
    const chartHeight = totalHeight - 24 - sectionTitleHeight
    const innerWidth = sectionWidth - margin.left - margin.right
    const innerHeight = chartHeight - margin.top - margin.bottom

    svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
       .attr('width', '100%')
       .attr('height', '100%')

    const axisColor = isDarkMode ? '#888' : '#555'
    const gridColor = isDarkMode ? '#444' : '#e5e5e5'

    svg.append('text')
      .attr('x', totalWidth / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', themeColors.text)
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(t('annotation.audioLabelStatistics', '标注统计'))

    const drawOneSection = (
      xOffset: number,
      data: { name: string; value: number; color: string; totalDuration?: number }[],
      sectionTitle: string,
      seriesType: 'audio' | 'text'
    ) => {
      const maxVal = Math.max(...data.map(d => d.value), 1)
      const yScale = d3.scaleLinear()
        .domain([0, maxVal * 1.15])
        .range([innerHeight, 0])
      const xScale = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([0, innerWidth])
        .padding(0.3)

      const g = svg.append('g')
        .attr('transform', `translate(${xOffset}, ${24 + sectionTitleHeight + margin.top})`)

      g.append('text')
        .attr('x', margin.left)
        .attr('y', -margin.top - 4)
        .attr('fill', themeColors.subText)
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(sectionTitle)

      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth).tickFormat(() => ''))
        .selectAll('line').attr('stroke', gridColor).attr('stroke-dasharray', '3,3')
      g.selectAll('.grid .domain').remove()

      const xAxis = g.append('g').attr('transform', `translate(0, ${innerHeight})`)
        .call(d3.axisBottom(xScale))
      xAxis.selectAll('text')
        .attr('transform', 'rotate(-45)').attr('text-anchor', 'end').attr('dx', '-0.5em').attr('dy', '0.5em')
        .attr('font-size', 11).attr('fill', axisColor)
        .each(function(d) {
          const lbl = (d as string).length > 12 ? (d as string).slice(0, 12) + '...' : d
          d3.select(this).text(lbl)
        })
      xAxis.selectAll('line, path').attr('stroke', axisColor)

      g.append('g').call(d3.axisLeft(yScale).ticks(5))
        .selectAll('text').attr('font-size', 11).attr('fill', axisColor)
      g.selectAll('.tick line, .domain').attr('stroke', axisColor)

      const totalN = seriesType === 'audio' ? audioBoxes.length : textAnnotations.filter(a => !a.id.startsWith('spacy-')).length
      g.selectAll('.bar')
        .data(data)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', d => xScale(d.name) || 0)
        .attr('y', d => yScale(d.value))
        .attr('width', xScale.bandwidth())
        .attr('height', d => innerHeight - yScale(d.value))
        .attr('fill', d => d.color)
        .attr('rx', 4)
        .attr('ry', 4)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
          d3.select(this).attr('opacity', 0.8).attr('stroke', themeColors.text).attr('stroke-width', 2)
          if (tooltipRef.current) {
            const pct = totalN > 0 ? (d.value / totalN * 100).toFixed(1) : '0.0'
            const durStr = d.totalDuration !== undefined
              ? `<div>${t('annotation.totalDuration', '总时长')}: <strong>${d.totalDuration.toFixed(2)}s</strong></div>`
              : ''
            tooltipRef.current.innerHTML = `
              <div style="font-weight:600;color:${d.color};margin-bottom:4px;border-bottom:2px solid ${d.color};padding-bottom:4px">${d.name}</div>
              <div style="color:${themeColors.subText};font-size:11px;margin-bottom:4px">${sectionTitle}</div>
              <div>${t('annotation.count', '数量')}: <strong>${d.value}</strong></div>
              <div>${t('annotation.percentage', '占比')}: <strong>${pct}%</strong></div>${durStr}
            `
            tooltipRef.current.style.display = 'block'
            tooltipRef.current.style.left = `${event.pageX + 15}px`
            tooltipRef.current.style.top = `${event.pageY + 15}px`
          }
        })
        .on('mouseout', function() {
          d3.select(this).attr('opacity', 1).attr('stroke', 'none')
          if (tooltipRef.current) tooltipRef.current.style.display = 'none'
        })

      g.selectAll('.value-label')
        .data(data)
        .join('text')
        .attr('class', 'value-label')
        .attr('x', d => (xScale(d.name) || 0) + xScale.bandwidth() / 2)
        .attr('y', d => yScale(d.value) - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', themeColors.text)
        .attr('font-size', 11)
        .attr('font-weight', 600)
        .text(d => d.value)
    }

    if (hasAudio) {
      drawOneSection(
        leftPadding,
        labelStats.map(d => ({ name: d.name, value: d.value, color: d.color, totalDuration: d.totalDuration })),
        t('annotation.audioBoxes', '音频画框'),
        'audio'
      )
    }
    if (hasText) {
      drawOneSection(
        hasAudio ? leftPadding + sectionWidth + sectionGap : leftPadding,
        textAnnotationStats.map((d, i) => ({
          name: d.name,
          value: d.value,
          color: TEXT_PALETTE[Math.min(i, TEXT_PALETTE.length - 1)]
        })),
        t('annotation.textAnnotations', '文本标注'),
        'text'
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelStats, textAnnotationStats, audioBoxes.length, textAnnotations, t, isDarkMode])
  
  // 绘制太阳图（同时展示音频画框 + 文本标注层级分布）
  const drawSunburstChart = useCallback(() => {
    if (!chartSvgRef.current) return
    const hasAudioData = labelStats.length > 0
    const hasTextData = textAnnotationStats.length > 0
    if (!hasAudioData && !hasTextData) return

    const svg = d3.select(chartSvgRef.current)
    svg.selectAll('*').remove()

    const width = 700
    const height = 520
    const centerX = width / 2
    const centerY = height / 2 + 15
    const radius = Math.min(width, height) / 2 - 70

    svg.attr('viewBox', `0 0 ${width} ${height}`)
       .attr('width', '100%')
       .attr('height', '100%')

    // 准备层级数据
    interface HierarchyNode {
      name: string
      value?: number
      children?: HierarchyNode[]
      color?: string
      group?: string
      duration?: number
    }

    const hierarchyData: HierarchyNode = {
      name: t('annotation.totalAnnotations', '总标注'),
      children: []
    }

    if (hasAudioData) {
      hierarchyData.children!.push({
        name: t('annotation.audioBoxes', '音频画框'),
        color: AUDIO_COLOR,
        children: labelStats.map((item, i) => ({
          name: item.name,
          value: item.value,
          color: AUDIO_PALETTE[Math.min(i, AUDIO_PALETTE.length - 1)],
          group: t('annotation.audioBoxes', '音频画框'),
          duration: item.totalDuration
        }))
      })
    }

    if (hasTextData) {
      hierarchyData.children!.push({
        name: t('annotation.textAnnotations', '文本标注'),
        color: TEXT_ANN_COLOR,
        children: textAnnotationStats.map((item, i) => ({
          name: item.name,
          value: item.value,
          color: TEXT_PALETTE[Math.min(i, TEXT_PALETTE.length - 1)],
          group: t('annotation.textAnnotations', '文本标注')
        }))
      })
    }

    // 创建层级结构
    const root = d3.hierarchy(hierarchyData)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    const partition = d3.partition<HierarchyNode>()
      .size([2 * Math.PI, radius])

    partition(root)

    type NodeWithTarget = d3.HierarchyRectangularNode<HierarchyNode> & {
      current: { x0: number; x1: number; y0: number; y1: number }
      target?: { x0: number; x1: number; y0: number; y1: number }
    }

    root.descendants().forEach((d: any) => {
      d.current = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 }
    })

    let currentFocus = root as NodeWithTarget

    // 弧形生成器
    const arc = d3.arc<NodeWithTarget>()
      .startAngle(d => d.current.x0)
      .endAngle(d => d.current.x1)
      .padAngle(d => Math.min((d.current.x1 - d.current.x0) / 2, 0.025))
      .padRadius(radius / 3)
      .innerRadius(d => d.current.y0 === 0 ? 0 : d.current.y0 * 0.75 + 28)
      .outerRadius(d => Math.max(d.current.y0 * 0.75 + 28, d.current.y1 * 0.75 + 22))

    const g = svg.append('g')
      .attr('transform', `translate(${centerX}, ${centerY})`)

    // 颜色辅助
    const getNodeColor = (d: d3.HierarchyRectangularNode<HierarchyNode>): string => {
      if (d.data.color) return d.data.color
      return d.depth === 1 ? (d.data.name.includes('音频') ? AUDIO_COLOR : TEXT_ANN_COLOR) : '#888'
    }

    const arcVisible = (d: NodeWithTarget) =>
      d.current.y1 <= radius * 3 && d.current.y0 >= 0 && d.current.x1 > d.current.x0

    const labelVisible = (d: NodeWithTarget) =>
      d.current.y1 <= radius * 3 && d.current.y0 >= 20 && (d.current.x1 - d.current.x0) > 0.15

    const labelTransform = (d: NodeWithTarget) => {
      const angle = (d.current.x0 + d.current.x1) / 2
      const r = (d.current.y0 * 0.75 + 28 + d.current.y1 * 0.75 + 22) / 2
      const x = Math.sin(angle) * r
      const y = -Math.cos(angle) * r
      const rotation = angle * 180 / Math.PI - 90
      const flip = angle > Math.PI
      return `translate(${x},${y}) rotate(${flip ? rotation + 180 : rotation})`
    }

    // 绘制弧形路径
    const path = g.selectAll<SVGPathElement, NodeWithTarget>('path.sb-arc')
      .data(root.descendants().filter(d => d.depth > 0) as NodeWithTarget[])
      .join('path')
      .attr('class', 'sb-arc')
      .attr('d', arc)
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', themeColors.background)
      .attr('stroke-width', 1.5)
      .attr('fill-opacity', d => arcVisible(d) ? (d.depth === 1 ? 0.88 : 0.82) : 0)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        if (!arcVisible(d)) return
        d3.select(this)
          .attr('fill-opacity', 1)
          .attr('stroke', isDarkMode ? '#fff' : '#333')
          .attr('stroke-width', 2.5)

        if (tooltipRef.current) {
          const total = currentFocus.value || 1
          const pct = ((d.value || 0) / total * 100).toFixed(1)
          const groupLabel = d.parent?.data.name || ''
          const color = getNodeColor(d)
          const durStr = (d.data as any).duration != null
            ? `<div>${t('annotation.totalDuration', '总时长')}: <strong>${(d.data as any).duration.toFixed(2)}s</strong></div>` : ''
          tooltipRef.current.innerHTML = `
            <div style="font-weight:700;color:${color};border-bottom:2px solid ${color};padding-bottom:4px;margin-bottom:6px">${d.data.name}</div>
            ${groupLabel && groupLabel !== t('annotation.totalAnnotations', '总标注') ? `<div style="color:${themeColors.subText};font-size:11px;margin-bottom:4px">${groupLabel}</div>` : ''}
            <div>${t('annotation.count', '数量')}: <strong>${d.value}</strong></div>
            <div>${t('annotation.percentage', '占比')}: <strong>${pct}%</strong></div>
            ${durStr}
          `
          tooltipRef.current.style.display = 'block'
          tooltipRef.current.style.left = `${event.pageX + 15}px`
          tooltipRef.current.style.top = `${event.pageY + 15}px`
        }
      })
      .on('mouseout', function(_, d) {
        d3.select(this)
          .attr('stroke', themeColors.background)
          .attr('stroke-width', 1.5)
          .attr('fill-opacity', arcVisible(d) ? (d.depth === 1 ? 0.88 : 0.82) : 0)
        if (tooltipRef.current) tooltipRef.current.style.display = 'none'
      })
      .on('click', (event, d) => clicked(event, d))

    // 绘制标签
    const label = g.selectAll<SVGTextElement, NodeWithTarget>('text.sb-label')
      .data(root.descendants().filter(d => d.depth > 0) as NodeWithTarget[])
      .join('text')
      .attr('class', 'sb-label')
      .attr('transform', labelTransform)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'white')
      .attr('font-size', d => d.depth === 1 ? 12 : 10)
      .attr('font-weight', d => d.depth === 1 ? 700 : 500)
      .attr('fill-opacity', d => labelVisible(d) ? 1 : 0)
      .attr('pointer-events', 'none')
      .text(d => {
        const lbl = d.data.name
        const maxLen = d.depth === 1 ? 10 : 8
        return lbl.length > maxLen ? lbl.slice(0, maxLen) + '…' : lbl
      })

    // 中心圆组（可点击返回上层）
    const totalCount = (hasAudioData ? audioBoxes.length : 0) + (hasTextData ? textAnnotations.filter(a => !a.id.startsWith('spacy-')).length : 0)
    const centerGroup = g.append('g').attr('class', 'center-group')

    const centerCircle = centerGroup.append('circle')
      .attr('cx', 0).attr('cy', 0).attr('r', 50)
      .attr('fill', themeColors.background)
      .attr('stroke', themeColors.border)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', () => {
        const parent = currentFocus.parent as NodeWithTarget | null
        clicked(null, parent || (root as NodeWithTarget))
      })
      .on('mouseover', function() {
        if (currentFocus !== (root as any)) {
          d3.select(this).attr('stroke', '#6366f1').attr('stroke-width', 3)
          if (tooltipRef.current) {
            tooltipRef.current.innerHTML = `<div style="color:#6366f1;font-weight:500">↩ ${t('annotation.clickToGoBack', '点击返回上层')}</div>`
            tooltipRef.current.style.display = 'block'
          }
        }
      })
      .on('mouseout', function() {
        d3.select(this).attr('stroke', themeColors.border).attr('stroke-width', 2)
        if (tooltipRef.current) tooltipRef.current.style.display = 'none'
      })

    const centerValue = centerGroup.append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('y', -10).attr('fill', themeColors.text)
      .attr('font-size', 26).attr('font-weight', 700)
      .attr('pointer-events', 'none')
      .text(totalCount)

    const centerLabel = centerGroup.append('text')
      .attr('text-anchor', 'middle').attr('y', 16)
      .attr('fill', themeColors.subText).attr('font-size', 12)
      .attr('pointer-events', 'none')
      .text(t('common.items', '条'))

    // 标题
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('fill', themeColors.text)
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(t('annotation.annotationDistribution', '标注分布'))

    // 图例（右侧）
    const legendX = centerX + radius + 20
    const legendStartY = centerY - radius + 10
    const items: Array<{ color: string; name: string }> = []
    if (hasAudioData) items.push({ color: AUDIO_COLOR, name: t('annotation.audioBoxes', '音频画框') })
    if (hasTextData) items.push({ color: TEXT_ANN_COLOR, name: t('annotation.textAnnotations', '文本标注') })

    items.forEach((item, i) => {
      const y = legendStartY + i * 26
      svg.append('circle')
        .attr('cx', legendX + 8)
        .attr('cy', y)
        .attr('r', 7)
        .attr('fill', item.color)
      svg.append('text')
        .attr('x', legendX + 22)
        .attr('y', y + 4)
        .attr('fill', themeColors.text)
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(item.name)
    })

    // 点击缩放：展开节点或返回上层
    function clicked(_event: any, p: NodeWithTarget) {
      if (!p) return
      currentFocus = p

      root.each((d: any) => {
        d.target = {
          x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          y0: Math.max(0, d.y0 - p.y0),
          y1: Math.max(0, d.y1 - p.y0)
        }
      })

      const trans = svg.transition().duration(750)

      path.transition(trans as any)
        .tween('data', (d: any) => {
          const i = d3.interpolate(d.current, d.target)
          return (tt: number) => { d.current = i(tt) }
        })
        .attrTween('d', (d: any) => () => arc(d) || '')
        .attr('fill-opacity', (d: any) => arcVisible(d) ? (d.depth === 1 ? 0.88 : 0.82) : 0)

      label.transition(trans as any)
        .tween('data', (d: any) => {
          const i = d3.interpolate(d.current, d.target)
          return (tt: number) => { d.current = i(tt) }
        })
        .attrTween('transform', (d: any) => () => labelTransform(d))
        .attr('fill-opacity', (d: any) => labelVisible(d) ? 1 : 0)

      centerValue.transition(trans as any).text(p.value || 0)
      const cLbl = p.depth === 0
        ? t('common.items', '条')
        : (p.data.name.length > 10 ? p.data.name.slice(0, 10) + '..' : p.data.name)
      centerLabel.transition(trans as any).text(cLbl)
      centerCircle.transition(trans as any)
        .attr('stroke', p === (root as any) ? themeColors.border : '#6366f1')
        .attr('stroke-dasharray', p === (root as any) ? 'none' : '4,2')
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelStats, textAnnotationStats, audioBoxes.length, textAnnotations, t, isDarkMode])
  
  // 根据图表类型绘制
  useEffect(() => {
    if (chartType === 'bar') {
      drawBarChart()
    } else if (chartType === 'sunburst') {
      drawSunburstChart()
    }
  }, [chartType, drawBarChart, drawSunburstChart])
  
  // 处理滚轮缩放（仅波形视图）
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (chartType !== 'waveform') return
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -10 : 10
      setZoom(prev => Math.max(minZoom, Math.min(400, prev + delta)))
    }
  }, [chartType, minZoom])
  
  // 缩放控制
  const handleZoomIn = () => setZoom(prev => Math.min(400, prev + 25))
  const handleZoomOut = () => setZoom(prev => Math.max(minZoom, prev - 25))
  
  // 导出 SVG（波形）
  const handleExportWaveformSVG = useCallback(() => {
    if (!audioVisualizationSvg) return
    
    const blob = new Blob([audioVisualizationSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audio_waveform_${Date.now()}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [audioVisualizationSvg])
  
  // 导出 PNG（波形）
  const handleExportWaveformPNG = useCallback(async () => {
    if (!audioVisualizationSvg) return
    
    try {
      const widthMatch = audioVisualizationSvg.match(/width="(\d+)"/)
      const heightMatch = audioVisualizationSvg.match(/height="(\d+)"/)
      const svgWidth = widthMatch ? parseInt(widthMatch[1], 10) : 1000
      const svgHeight = heightMatch ? parseInt(heightMatch[1], 10) : 400
      
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = svgWidth * scale
      canvas.height = svgHeight * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      ctx.scale(scale, scale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, svgWidth, svgHeight)
      
      const img = new Image()
      const svgBlob = new Blob([audioVisualizationSvg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)
      
      img.onload = () => {
        ctx.drawImage(img, 0, 0, svgWidth, svgHeight)
        URL.revokeObjectURL(url)
        
        const link = document.createElement('a')
        link.href = canvas.toDataURL('image/png')
        link.download = `audio_waveform_${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
      
      img.src = url
    } catch (err) {
      console.error('Failed to export PNG:', err)
    }
  }, [audioVisualizationSvg])
  
  // 导出图表 SVG
  const handleExportChartSVG = useCallback(() => {
    if (!chartSvgRef.current) return
    
    const svgClone = chartSvgRef.current.cloneNode(true) as SVGSVGElement
    const viewBox = chartSvgRef.current.getAttribute('viewBox')
    
    if (viewBox) {
      const viewBoxValues = viewBox.split(' ').map(Number)
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bgRect.setAttribute('x', String(viewBoxValues[0]))
      bgRect.setAttribute('y', String(viewBoxValues[1]))
      bgRect.setAttribute('width', String(viewBoxValues[2]))
      bgRect.setAttribute('height', String(viewBoxValues[3]))
      bgRect.setAttribute('fill', '#ffffff')
      svgClone.insertBefore(bgRect, svgClone.firstChild)
    }
    
    const svgData = new XMLSerializer().serializeToString(svgClone)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `audio_${chartType}_chart.svg`
    link.click()
    URL.revokeObjectURL(url)
  }, [chartType])
  
  // 导出图表 PNG
  const handleExportChartPNG = useCallback(async () => {
    if (!chartSvgRef.current) return
    
    try {
      const svgElement = chartSvgRef.current
      const svgClone = svgElement.cloneNode(true) as SVGSVGElement
      const viewBox = svgElement.getAttribute('viewBox')
      
      let width = 700, height = 450
      if (viewBox) {
        const viewBoxValues = viewBox.split(' ').map(Number)
        width = viewBoxValues[2]
        height = viewBoxValues[3]
        
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        bgRect.setAttribute('x', String(viewBoxValues[0]))
        bgRect.setAttribute('y', String(viewBoxValues[1]))
        bgRect.setAttribute('width', String(viewBoxValues[2]))
        bgRect.setAttribute('height', String(viewBoxValues[3]))
        bgRect.setAttribute('fill', '#ffffff')
        svgClone.insertBefore(bgRect, svgClone.firstChild)
      }
      
      svgClone.setAttribute('width', String(width))
      svgClone.setAttribute('height', String(height))
      
      const svgString = new XMLSerializer().serializeToString(svgClone)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)
      
      const img = new Image()
      img.onload = () => {
        const scale = 3
        const canvas = document.createElement('canvas')
        canvas.width = width * scale
        canvas.height = height * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(svgUrl)
          return
        }
        
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        
        canvas.toBlob((blob) => {
          if (!blob) {
            URL.revokeObjectURL(svgUrl)
            return
          }
          
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `audio_${chartType}_chart.png`
          link.click()
          
          URL.revokeObjectURL(url)
          URL.revokeObjectURL(svgUrl)
        }, 'image/png')
      }
      
      img.src = svgUrl
    } catch (error) {
      console.error('Export PNG failed:', error)
    }
  }, [chartType])
  
  // 检查是否有数据
  const hasData = transcriptSegments.length > 0 || audioBoxes.length > 0 || textAnnotations.length > 0
  const hasSvg = !!audioVisualizationSvg

  if (!hasData && !hasSvg && !hasSpectrogram) {
    return (
      <Alert severity="info">
        {t('annotation.noAudioVisualizationData', '暂无音频标注数据可视化')}
      </Alert>
    )
  }
  
  return (
    <Box ref={containerRef}>
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          display: 'none',
          padding: '12px 16px',
          background: themeColors.tooltipBg,
          border: `1px solid ${themeColors.border}`,
          borderRadius: '10px',
          boxShadow: isDarkMode ? '0 6px 24px rgba(0,0,0,0.4)' : '0 6px 24px rgba(0,0,0,0.15)',
          fontSize: '13px',
          lineHeight: 1.6,
          pointerEvents: 'none',
          zIndex: 10000,
          maxWidth: '300px',
          backdropFilter: 'blur(8px)',
          color: themeColors.text
        }}
      />
      
      {/* 工具栏 */}
      <Stack 
        direction="row" 
        spacing={2}
        alignItems="center" 
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <ToggleButtonGroup
            value={chartType}
            exclusive
            onChange={(_, value) => value && setChartType(value)}
            size="small"
          >
            <ToggleButton value="waveform" disabled={!hasSvg && !hasSpectrogram}>
              <TimelineIcon sx={{ mr: 0.5 }} fontSize="small" />
              {t('annotation.waveform', '波形图')}
            </ToggleButton>
            <ToggleButton value="bar" disabled={audioBoxes.length === 0 && textAnnotations.length === 0}>
              <BarChartIcon sx={{ mr: 0.5 }} fontSize="small" />
              {t('annotation.barChart', '柱状图')}
            </ToggleButton>
            <ToggleButton value="sunburst" disabled={audioBoxes.length === 0 && textAnnotations.length === 0}>
              <DonutLargeIcon sx={{ mr: 0.5 }} fontSize="small" />
              {t('annotation.sunburstChart', '太阳图')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        
        <Stack direction="row" spacing={0.5} alignItems="center">
          {/* 缩放控制（仅波形视图） */}
          {chartType === 'waveform' && (
            <>
              <Tooltip title={t('annotation.zoomOut', '缩小')}>
                <IconButton size="small" onClick={handleZoomOut} disabled={zoom <= minZoom}>
                  <ZoomOutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 45, textAlign: 'center' }}>
                {zoom}%
              </Typography>
              <Tooltip title={t('annotation.zoomIn', '放大')}>
                <IconButton size="small" onClick={handleZoomIn} disabled={zoom >= 400}>
                  <ZoomInIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          
          {/* 导出按钮 */}
          <Tooltip title={t('annotation.exportSvg', '导出 SVG')}>
            <IconButton
              size="small"
              onClick={chartType === 'waveform' ? handleExportWaveformSVG : handleExportChartSVG}
              disabled={chartType === 'waveform' && !hasSvg && !hasSpectrogram}
            >
              <SaveAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('annotation.exportPng', '导出 PNG')}>
            <IconButton
              size="small"
              onClick={chartType === 'waveform' ? handleExportWaveformPNG : handleExportChartPNG}
              disabled={chartType === 'waveform' && !hasSvg && !hasSpectrogram}
            >
              <ImageIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      
      {/* 波形视图 */}
      {chartType === 'waveform' && (
        <>
          {hasSvg ? (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'auto',
                maxHeight: hasSpectrogram ? 850 : 500,
                bgcolor: themeColors.cardBg,
                '&::-webkit-scrollbar': { height: 10, width: 10 },
                '&::-webkit-scrollbar-thumb': { bgcolor: themeColors.scrollbarThumb, borderRadius: 5 }
              }}
              onWheel={handleWheel}
            >
              <Box
                ref={svgContainerRef}
                sx={{
                  // CSS zoom (layout-aware) so the scrollbar reflects the true scaled width.
                  // Unlike transform: scale(), zoom affects the element's layout size,
                  // enabling overflow:auto to correctly scroll the full zoomed content.
                  zoom: zoom / 100,
                  '& svg': { display: 'block' }
                }}
                dangerouslySetInnerHTML={{ __html: audioVisualizationSvg }}
              />
              {/* 频谱图（在波形下方） */}
              {hasSpectrogram && (
                <Box sx={{ borderTop: '2px solid', borderColor: 'divider', mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1, pt: 0.5, display: 'block' }}>
                    {t('annotation.spectrogram', '语谱图')}
                    {hasFormants && ` + ${t('annotation.formants', '共振峰')}`}
                  </Typography>
                  {/* No zoom wrapper: canvas is already sized by pixelsPerSecond = 100*(zoom/100) */}
                  <canvas
                    ref={spectrogramCanvasRef}
                    style={{ display: 'block' }}
                  />
                </Box>
              )}
            </Box>
          ) : hasSpectrogram ? (
            /* 只有频谱图没有波形SVG的情况 */
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'auto',
                maxHeight: 300,
                bgcolor: themeColors.cardBg,
                '&::-webkit-scrollbar': { height: 10, width: 10 },
                '&::-webkit-scrollbar-thumb': { bgcolor: themeColors.scrollbarThumb, borderRadius: 5 }
              }}
              onWheel={handleWheel}
            >
              <Typography variant="caption" color="text.secondary" sx={{ px: 1, pt: 0.5, display: 'block' }}>
                {t('annotation.spectrogram', '语谱图')}
                {hasFormants && ` + ${t('annotation.formants', '共振峰')}`}
              </Typography>
              {/* No zoom wrapper: canvas is already sized by pixelsPerSecond = 100*(zoom/100) */}
              <canvas
                ref={spectrogramCanvasRef}
                style={{ display: 'block' }}
              />
            </Box>
          ) : (
            <Alert severity="warning">
              {t('annotation.noSavedVisualization', '此存档没有保存可视化数据。请重新保存存档以生成可视化。')}
            </Alert>
          )}
        </>
      )}
      
      {/* 柱状图/太阳图视图 */}
      {(chartType === 'bar' || chartType === 'sunburst') && (
        <>
          {(labelStats.length > 0 || textAnnotationStats.length > 0) ? (
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                maxHeight: 640,
                overflow: 'auto',
                mt: 2
              }}
            >
              <Box sx={{ p: 2, pt: 3, width: '100%', display: 'flex', justifyContent: 'center' }}>
                <svg
                  ref={chartSvgRef}
                  style={{
                    width: '100%',
                    maxWidth: 700,
                    height: chartType === 'bar' ? 560 : 520
                  }}
                />
              </Box>
            </Box>
          ) : (
            <Alert severity="info">
              {t('annotation.noAudioBoxData', '暂无音频画框数据，无法生成统计图表')}
            </Alert>
          )}
        </>
      )}
      
      {/* 声学特征标量统计 (Jitter/Shimmer) */}
      {acousticData?.enabled && (acousticData.jitter || acousticData.shimmer) && (
        <Box sx={{ mt: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: themeColors.cardBg }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('annotation.acousticFeatures', '声学特征')}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {acousticData.jitter && (
              <>
                <Chip size="small" label={`Jitter (local): ${((acousticData.jitter as any).local * 100).toFixed(3)}%`} variant="outlined" />
                <Chip size="small" label={`Jitter (RAP): ${((acousticData.jitter as any).rap * 100).toFixed(3)}%`} variant="outlined" />
              </>
            )}
            {acousticData.shimmer && (
              <>
                <Chip size="small" label={`Shimmer (local): ${((acousticData.shimmer as any).local * 100).toFixed(3)}%`} variant="outlined" />
                <Chip size="small" label={`Shimmer (dB): ${(acousticData.shimmer as any).local_db?.toFixed(3) || '-'} dB`} variant="outlined" />
              </>
            )}
          </Stack>
        </Box>
      )}

      {/* 统计摘要 */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('annotation.audioBox', '画框')}: {audioBoxes.length} |
          {' '}{labelStats.length} {t('annotation.labelTypes', '种标签')}
          {duration > 0 && (
            <> | {t('annotation.duration', '时长')}: {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}</>
          )}
        </Typography>
        
        {labelStats.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {labelStats.slice(0, 10).map((stat) => (
              <Box
                key={stat.name}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: `${stat.color}15`,
                  border: `1px solid ${stat.color}30`
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: stat.color,
                    mr: 0.5
                  }}
                />
                <Typography variant="caption" sx={{ color: stat.color, fontWeight: 500 }}>
                  {stat.name}: {stat.value}
                </Typography>
              </Box>
            ))}
            {labelStats.length > 10 && (
              <Typography variant="caption" color="text.secondary">
                +{labelStats.length - 10} more
              </Typography>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  )
}

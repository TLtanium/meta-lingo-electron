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
import PieChartOutlineIcon from '@mui/icons-material/PieChartOutline'
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

type ChartType = 'waveform' | 'bar' | 'pie'

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
  
  // 绘制频谱图（静态，在波形视图下方）
  useEffect(() => {
    if (chartType !== 'waveform' || !hasSpectrogram || !spectrogramCanvasRef.current) return
    if (!acousticData?.spectrogram) return

    const canvas = spectrogramCanvasRef.current
    const spec = acousticData.spectrogram
    const spectrogramHeight = 150

    // 计算宽度 - 与波形SVG同步
    const pixelsPerSecond = 100 * (zoom / 100) // match SVG zoom
    const totalWidth = Math.max(duration * pixelsPerSecond, 600)

    const dpr = window.devicePixelRatio || 1
    canvas.width = totalWidth * dpr
    canvas.height = spectrogramHeight * dpr
    canvas.style.width = `${totalWidth}px`
    canvas.style.height = `${spectrogramHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, totalWidth, spectrogramHeight)

    // Render spectrogram heatmap
    const maxFreq = spec.frequencies[spec.frequencies.length - 1] || 5500
    renderSpectrogram(ctx, spec, {
      width: totalWidth,
      height: spectrogramHeight,
      pixelsPerSecond,
      duration
    })

    // Render frequency axis
    renderFrequencyAxis(ctx, maxFreq, {
      width: totalWidth,
      height: spectrogramHeight,
      pixelsPerSecond,
      duration
    })

    // Render formant tracks if available
    if (hasFormants && acousticData.formants) {
      renderFormantTracks(ctx, acousticData.formants, {
        width: totalWidth,
        height: spectrogramHeight,
        pixelsPerSecond,
        duration
      }, maxFreq)
    }

  }, [chartType, hasSpectrogram, hasFormants, acousticData, duration, zoom])

  // 绘制柱状图
  const drawBarChart = useCallback(() => {
    if (!chartSvgRef.current || labelStats.length === 0) return
    
    const svg = d3.select(chartSvgRef.current)
    svg.selectAll('*').remove()
    
    const width = 700
    const height = 400
    const margin = { top: 40, right: 30, left: 60, bottom: 100 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom
    
    svg.attr('viewBox', `0 0 ${width} ${height}`)
       .attr('width', '100%')
       .attr('height', '100%')
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)
    
    // 比例尺
    const xScale = d3.scaleBand()
      .domain(labelStats.map(d => d.name))
      .range([0, innerWidth])
      .padding(0.3)
    
    const yScale = d3.scaleLinear()
      .domain([0, Math.max(...labelStats.map(d => d.value)) * 1.1])
      .range([innerHeight, 0])
    
    // 网格线
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale)
        .ticks(5)
        .tickSize(-innerWidth)
        .tickFormat(() => ''))
      .selectAll('line')
      .attr('stroke', '#e5e5e5')
      .attr('stroke-dasharray', '3,3')
    g.selectAll('.grid .domain').remove()
    
    // X轴
    const xAxis = g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale))
    
    xAxis.selectAll('text')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em')
      .attr('font-size', 11)
      .attr('fill', '#555')
      .each(function(d) {
        const text = d3.select(this)
        const label = d as string
        if (label.length > 12) {
          text.text(label.slice(0, 12) + '...')
        }
      })
    
    xAxis.selectAll('line, path').attr('stroke', '#ccc')
    
    // Y轴
    const yAxis = g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
    
    yAxis.selectAll('text')
      .attr('font-size', 11)
      .attr('fill', '#555')
    
    yAxis.selectAll('line, path').attr('stroke', '#ccc')
    
    // Y轴标签
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .attr('fill', themeColors.subText)
      .attr('font-size', 12)
      .text(t('annotation.count', '数量'))
    
    // 绘制条形
    g.selectAll('.bar')
      .data(labelStats)
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
        d3.select(this)
          .attr('opacity', 0.8)
          .attr('stroke', themeColors.text)
          .attr('stroke-width', 2)
        
        if (tooltipRef.current) {
          tooltipRef.current.innerHTML = `
            <div style="font-weight:600;color:${d.color};margin-bottom:4px;border-bottom:2px solid ${d.color};padding-bottom:4px">
              ${d.name}
            </div>
            <div>${t('annotation.count', '数量')}: <strong>${d.value}</strong></div>
            <div>${t('annotation.percentage', '占比')}: <strong>${(d.value / audioBoxes.length * 100).toFixed(1)}%</strong></div>
            <div>${t('annotation.totalDuration', '总时长')}: <strong>${d.totalDuration.toFixed(2)}s</strong></div>
          `
          tooltipRef.current.style.display = 'block'
          tooltipRef.current.style.left = `${event.pageX + 15}px`
          tooltipRef.current.style.top = `${event.pageY + 15}px`
        }
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('opacity', 1)
          .attr('stroke', 'none')
        
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'none'
        }
      })
    
    // 数值标签
    g.selectAll('.value-label')
      .data(labelStats)
      .join('text')
      .attr('class', 'value-label')
      .attr('x', d => (xScale(d.name) || 0) + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.value) - 8)
      .attr('text-anchor', 'middle')
      .attr('fill', themeColors.text)
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text(d => d.value)
    
    // 标题
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', themeColors.text)
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(t('annotation.audioLabelStatistics', '音频标注统计'))
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelStats, audioBoxes.length, t, isDarkMode])
  
  // 绘制饼图
  const drawPieChart = useCallback(() => {
    if (!chartSvgRef.current || labelStats.length === 0) return
    
    const svg = d3.select(chartSvgRef.current)
    svg.selectAll('*').remove()
    
    const width = 700
    const height = 450
    const radius = Math.min(width * 0.35, height * 0.4)
    const innerRadius = radius * 0.45
    
    svg.attr('viewBox', `0 0 ${width} ${height}`)
       .attr('width', '100%')
       .attr('height', '100%')
    
    // 标题
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('fill', themeColors.text)
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(t('annotation.audioLabelStatistics', '音频标注统计'))
    
    const g = svg.append('g')
      .attr('transform', `translate(${width * 0.35}, ${height / 2 + 10})`)
    
    // 创建饼图生成器
    const pie = d3.pie<typeof labelStats[0]>()
      .value(d => d.value)
      .sort(null)
      .padAngle(0.02)
    
    const arc = d3.arc<d3.PieArcDatum<typeof labelStats[0]>>()
      .innerRadius(innerRadius)
      .outerRadius(radius)
      .cornerRadius(6)
    
    const arcHover = d3.arc<d3.PieArcDatum<typeof labelStats[0]>>()
      .innerRadius(innerRadius)
      .outerRadius(radius + 10)
      .cornerRadius(6)
    
    const pieData = pie(labelStats)
    
    // 绘制弧形
    g.selectAll('.arc')
      .data(pieData)
      .join('path')
      .attr('class', 'arc')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('stroke', themeColors.background)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcHover)
        
        if (tooltipRef.current) {
          const percentage = ((d.endAngle - d.startAngle) / (2 * Math.PI) * 100).toFixed(1)
          tooltipRef.current.innerHTML = `
            <div style="font-weight:600;color:${d.data.color};margin-bottom:4px;border-bottom:2px solid ${d.data.color};padding-bottom:4px">
              ${d.data.name}
            </div>
            <div>${t('annotation.count', '数量')}: <strong>${d.data.value}</strong></div>
            <div>${t('annotation.percentage', '占比')}: <strong>${percentage}%</strong></div>
            <div>${t('annotation.totalDuration', '总时长')}: <strong>${d.data.totalDuration.toFixed(2)}s</strong></div>
          `
          tooltipRef.current.style.display = 'block'
          tooltipRef.current.style.left = `${event.pageX + 15}px`
          tooltipRef.current.style.top = `${event.pageY + 15}px`
        }
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc)
        
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'none'
        }
      })
    
    // 百分比标签 (只显示较大的分段)
    const labelArc = d3.arc<d3.PieArcDatum<typeof labelStats[0]>>()
      .innerRadius(radius * 0.75)
      .outerRadius(radius * 0.75)
    
    g.selectAll('.label')
      .data(pieData.filter(d => (d.endAngle - d.startAngle) > 0.3))
      .join('text')
      .attr('class', 'label')
      .attr('transform', d => `translate(${labelArc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('text-shadow', '0 1px 2px rgba(0,0,0,0.3)')
      .text(d => `${((d.endAngle - d.startAngle) / (2 * Math.PI) * 100).toFixed(0)}%`)
    
    // 中心统计
    const centerGroup = g.append('g')
    
    centerGroup.append('text')
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', themeColors.text)
      .attr('font-size', 28)
      .attr('font-weight', 700)
      .text(audioBoxes.length)
    
    centerGroup.append('text')
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .attr('fill', themeColors.subText)
      .attr('font-size', 12)
      .text(t('common.items', '条'))
    
    // 图例
    const legendG = svg.append('g')
      .attr('transform', `translate(${width * 0.65}, 60)`)
    
    const legendItems = labelStats.slice(0, 12)
    const legendSpacing = 28
    
    legendItems.forEach((item, i) => {
      const y = i * legendSpacing
      
      // 颜色块
      legendG.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', 16)
        .attr('height', 16)
        .attr('fill', item.color)
        .attr('rx', 3)
      
      // 标签名
      const labelText = item.name.length > 15 ? item.name.slice(0, 15) + '...' : item.name
      legendG.append('text')
        .attr('x', 24)
        .attr('y', y + 12)
        .attr('fill', themeColors.text)
        .attr('font-size', 11)
        .text(labelText)
      
      // 数量
      legendG.append('text')
        .attr('x', 150)
        .attr('y', y + 12)
        .attr('fill', item.color)
        .attr('font-size', 11)
        .attr('font-weight', 600)
        .text(item.value)
    })
    
    if (labelStats.length > 12) {
      legendG.append('text')
        .attr('x', 0)
        .attr('y', 12 * legendSpacing + 10)
        .attr('fill', '#999')
        .attr('font-size', 11)
        .text(`+${labelStats.length - 12} more...`)
    }
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelStats, audioBoxes.length, t, isDarkMode])
  
  // 根据图表类型绘制
  useEffect(() => {
    if (chartType === 'bar') {
      drawBarChart()
    } else if (chartType === 'pie') {
      drawPieChart()
    }
  }, [chartType, drawBarChart, drawPieChart])
  
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
            <ToggleButton value="bar" disabled={audioBoxes.length === 0}>
              <BarChartIcon sx={{ mr: 0.5 }} fontSize="small" />
              {t('annotation.barChart', '柱状图')}
            </ToggleButton>
            <ToggleButton value="pie" disabled={audioBoxes.length === 0}>
              <PieChartOutlineIcon sx={{ mr: 0.5 }} fontSize="small" />
              {t('annotation.pieChart', '饼图')}
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
                maxHeight: hasSpectrogram ? 700 : 500,
                bgcolor: themeColors.cardBg,
                '&::-webkit-scrollbar': { height: 10, width: 10 },
                '&::-webkit-scrollbar-thumb': { bgcolor: themeColors.scrollbarThumb, borderRadius: 5 }
              }}
              onWheel={handleWheel}
            >
              <Box
                ref={svgContainerRef}
                sx={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                  transition: 'transform 0.1s ease-out',
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
                  <Box sx={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'top left',
                    transition: 'transform 0.1s ease-out'
                  }}>
                    <canvas
                      ref={spectrogramCanvasRef}
                      style={{ display: 'block' }}
                    />
                  </Box>
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
              <Box sx={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top left',
                transition: 'transform 0.1s ease-out'
              }}>
                <canvas
                  ref={spectrogramCanvasRef}
                  style={{ display: 'block' }}
                />
              </Box>
            </Box>
          ) : (
            <Alert severity="warning">
              {t('annotation.noSavedVisualization', '此存档没有保存可视化数据。请重新保存存档以生成可视化。')}
            </Alert>
          )}
        </>
      )}
      
      {/* 柱状图/饼图视图 */}
      {(chartType === 'bar' || chartType === 'pie') && (
        <>
          {labelStats.length > 0 ? (
            <Box 
              sx={{ 
                border: 1, 
                borderColor: 'divider', 
                borderRadius: 2,
                maxHeight: 500,
                overflow: 'auto'
              }}
            >
              <Box sx={{ p: 2, width: '100%', display: 'flex', justifyContent: 'center' }}>
                <svg
                  ref={chartSvgRef}
                  style={{ 
                    width: '100%', 
                    maxWidth: 700,
                    height: chartType === 'bar' ? 400 : 450
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

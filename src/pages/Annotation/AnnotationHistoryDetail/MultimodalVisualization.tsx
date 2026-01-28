/**
 * MultimodalVisualization - 多模态标注可视化组件
 * 
 * 功能：
 * - 使用 D3.js 实现交互式可视化
 * - 散点图 (YOLO + 手动标注) + CLIP 折线图背景 + 双Y轴
 * - 太阳图 (YOLO + 手动标注层级分布)
 * - 热图 (YOLO + 手动标注时间分布)
 * - 支持导出 PNG/SVG
 * 
 * 设计说明：
 * - CLIP 性质不同于 YOLO/手动标注（连续置信度 vs 离散检测）
 * - 散点图中 CLIP 作为折线图背景显示每帧各标签置信度
 * - 太阳图和热图只显示 YOLO + 手动标注
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Alert,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material'
import WbSunnyIcon from '@mui/icons-material/WbSunny'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import GridOnIcon from '@mui/icons-material/GridOn'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import html2canvas from 'html2canvas'
import type { Annotation, YoloTrack, VideoBox, ClipAnnotationData } from '../../../types'

interface MultimodalVisualizationProps {
  annotations: Annotation[]
  yoloAnnotations: YoloTrack[]
  manualTracks: VideoBox[]
  clipAnnotations?: ClipAnnotationData | null
}

// 颜色配置
const YOLO_COLOR = '#3b82f6'  // 蓝色
const MANUAL_COLOR = '#ef4444'  // 红色

// CLIP 折线图颜色调色板（浅色）
const CLIP_LINE_COLORS = [
  '#c4b5fd', '#a5b4fc', '#99f6e4', '#fde68a', '#fecaca', 
  '#d9f99d', '#fbcfe8', '#c7d2fe', '#bfdbfe', '#a7f3d0',
  '#fef08a', '#fed7aa', '#fca5a5', '#f0abfc', '#d8b4fe'
]

// YOLO 和手动标注的调色板
const YOLO_PALETTE = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af']
const MANUAL_PALETTE = ['#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b']

type ChartType = 'scatter' | 'sunburst' | 'heatmap'

export default function MultimodalVisualization({ 
  annotations, 
  yoloAnnotations, 
  manualTracks,
  clipAnnotations 
}: MultimodalVisualizationProps) {
  const { t } = useTranslation()
  const [chartType, setChartType] = useState<ChartType>('scatter')
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  
  // CLIP 标签可见性状态
  const [clipLabelVisibility, setClipLabelVisibility] = useState<Record<string, boolean>>({})
  const clipVisibilityRef = useRef<Record<string, boolean>>({})
  
  // 初始化 CLIP 标签可见性
  const clipLabelsForVisibility = useMemo(() => {
    if (!clipAnnotations?.frame_results?.length) return []
    const labels = clipAnnotations.labels || []
    if (labels.length > 0) return labels
    return [...new Set(clipAnnotations.frame_results.map(f => f.top_label))]
  }, [clipAnnotations])
  
  // 从 annotations 中提取视频标注 (type === 'video')
  const videoAnnotationsFromAnnotations = useMemo(() => {
    return annotations.filter(a => a.type === 'video')
  }, [annotations])
  
  // YOLO 标签统计
  const yoloStats = useMemo(() => {
    const counts: Record<string, number> = {}
    yoloAnnotations.forEach(track => {
      counts[track.className] = (counts[track.className] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [yoloAnnotations])
  
  // 手动标注标签统计
  const manualStats = useMemo(() => {
    const counts: Record<string, number> = {}
    
    manualTracks.forEach(track => {
      counts[track.label] = (counts[track.label] || 0) + 1
    })
    
    videoAnnotationsFromAnnotations.forEach(ann => {
      counts[ann.label] = (counts[ann.label] || 0) + 1
    })
    
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [manualTracks, videoAnnotationsFromAnnotations])
  
  // CLIP 数据处理
  const clipData = useMemo(() => {
    if (!clipAnnotations?.frame_results?.length) return null
    
    const fps = clipAnnotations.fps || 30
    const labels = clipAnnotations.labels || []
    
    // 获取所有帧的置信度数据
    const frameData = clipAnnotations.frame_results.map(frame => ({
      time: frame.timestamp_seconds || (frame.frame_number / fps),
      frameNumber: frame.frame_number,
      classifications: frame.classifications || {},
      topLabel: frame.top_label,
      confidence: frame.confidence
    }))
    
    return { frameData, labels, fps }
  }, [clipAnnotations])
  
  const totalYoloCount = yoloAnnotations.length
  const totalManualCount = manualTracks.length + videoAnnotationsFromAnnotations.length
  const totalClipFrames = clipData?.frameData.length || 0
  
  // 散点图数据 (YOLO + 手动标注)
  const scatterData = useMemo(() => {
    const data: Array<{
      id: string
      label: string
      time: number
      endTime: number
      source: 'YOLO' | 'Manual'
      color: string
    }> = []
    
    yoloAnnotations.forEach((track, idx) => {
      data.push({
        id: `yolo-${idx}`,
        label: track.className,
        time: track.startTime,
        endTime: track.endTime,
        source: 'YOLO',
        color: track.color || YOLO_COLOR
      })
    })
    
    manualTracks.forEach((track, idx) => {
      data.push({
        id: `manual-${idx}`,
        label: track.label,
        time: track.startTime,
        endTime: track.endTime,
        source: 'Manual',
        color: track.color || MANUAL_COLOR
      })
    })
    
    videoAnnotationsFromAnnotations.forEach((ann, idx) => {
      const startTime = ann.timestamp || 0
      const duration = ann.frameCount ? ann.frameCount / 30 : 1
      data.push({
        id: `video-ann-${idx}`,
        label: ann.label,
        time: startTime,
        endTime: startTime + duration,
        source: 'Manual',
        color: ann.color || MANUAL_COLOR
      })
    })
    
    return data
  }, [yoloAnnotations, manualTracks, videoAnnotationsFromAnnotations])
  
  // 热图数据 (只包含 YOLO + 手动标注)
  const heatmapData = useMemo(() => {
    if (scatterData.length === 0) return { labels: [] as string[], timeSlots: [] as string[], data: [] as { x: number, y: number, value: number, source: string }[] }
    
    const maxTime = Math.max(...scatterData.map(d => d.endTime), 1)
    const binSize = Math.max(5, Math.ceil(maxTime / 20))
    const numBins = Math.ceil(maxTime / binSize)
    
    const allLabels = [...new Set(scatterData.map(d => `${d.source}: ${d.label}`))]
    const matrix: { value: number, source: string }[][] = allLabels.map(() => 
      new Array(numBins).fill(null).map(() => ({ value: 0, source: '' }))
    )
    
    scatterData.forEach(d => {
      const labelKey = `${d.source}: ${d.label}`
      const labelIdx = allLabels.indexOf(labelKey)
      const startBin = Math.floor(d.time / binSize)
      const endBin = Math.min(Math.floor(d.endTime / binSize), numBins - 1)
      for (let bin = startBin; bin <= endBin; bin++) {
        if (labelIdx >= 0 && bin >= 0 && bin < numBins) {
          matrix[labelIdx][bin].value++
          matrix[labelIdx][bin].source = d.source
        }
      }
    })
    
    const timeSlots = Array.from({ length: numBins }, (_, i) => `${i * binSize}s`)
    const data: { x: number, y: number, value: number, source: string }[] = []
    matrix.forEach((row, labelIdx) => {
      row.forEach((cell, timeIdx) => {
        data.push({ x: timeIdx, y: labelIdx, value: cell.value, source: cell.source || allLabels[labelIdx].split(':')[0] })
      })
    })
    
    return { labels: allLabels, timeSlots, data }
  }, [scatterData])
  
  const hasYoloData = yoloStats.length > 0
  const hasManualData = manualStats.length > 0
  const hasClipData = !!clipData && clipData.frameData.length > 0
  
  // 绘制散点图 + CLIP 折线背景
  const drawScatterChart = useCallback(() => {
    if (!svgRef.current) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const width = 900
    // 计算 CLIP 标签数量以确定底部图例高度
    const clipLabels = hasClipData && clipData 
      ? (clipData.labels.length > 0 ? clipData.labels : [...new Set(clipData.frameData.map(f => f.topLabel))])
      : []
    const legendRows = hasClipData ? Math.ceil(clipLabels.length / 8) : 0  // 每行8个标签
    const clipLegendHeight = hasClipData ? legendRows * 20 : 0
    const yoloLegendHeight = 25  // YOLO/手动标注图例高度
    const totalLegendHeight = yoloLegendHeight + (hasClipData ? 25 + clipLegendHeight : 0)  // 间距25px
    
    // 根据标签数量动态计算高度
    const allLabels = [...new Set(scatterData.map(d => d.label))]
    const labelRowHeight = 30  // 每个标签行高
    const minChartHeight = 200  // 最小图表高度
    const dynamicChartHeight = Math.max(minChartHeight, allLabels.length * labelRowHeight)
    
    const margin = { top: 40, right: 80, left: 60, bottom: 45 + totalLegendHeight }
    const height = margin.top + dynamicChartHeight + margin.bottom
    const innerWidth = width - margin.left - margin.right
    const innerHeight = dynamicChartHeight
    
    svg.attr('viewBox', `0 0 ${width} ${height}`)
       .attr('width', '100%')
       .attr('height', '100%')
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)
    
    // 计算时间范围
    const maxTime = Math.max(
      ...scatterData.map(d => d.endTime),
      clipData ? Math.max(...clipData.frameData.map(f => f.time)) : 0,
      1
    )
    
    // X轴比例尺（时间）
    const xScale = d3.scaleLinear()
      .domain([0, maxTime * 1.05])
      .range([0, innerWidth])
    
    // 左Y轴比例尺（标签）
    const yScaleLeft = d3.scaleBand()
      .domain(allLabels)
      .range([0, innerHeight])
      .padding(0.3)
    
    // 右Y轴比例尺（CLIP 置信度 0-1）
    const yScaleRight = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0])
    
    // 绘制网格线
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisBottom(xScale)
        .ticks(10)
        .tickSize(innerHeight)
        .tickFormat(() => ''))
      .attr('transform', 'translate(0, 0)')
      .selectAll('line')
      .attr('stroke', '#e5e5e5')
      .attr('stroke-dasharray', '3,3')
    g.selectAll('.grid .domain').remove()
    
    // 绘制 CLIP 折线图背景（如果有数据）
    if (hasClipData && clipData && clipLabels.length > 0) {
      // 初始化可见性（全部可见）
      const currentVisibility = clipVisibilityRef.current
      clipLabels.forEach(label => {
        if (currentVisibility[label] === undefined) {
          currentVisibility[label] = true
        }
      })
      
      // 创建折线组
      const linesGroup = g.append('g').attr('class', 'clip-lines')
      
      // 为每个标签创建折线
      clipLabels.forEach((label, idx) => {
        const lineData = clipData.frameData.map(frame => ({
          time: frame.time,
          value: frame.classifications[label] || 0
        })).filter(d => d.value > 0)
        
        if (lineData.length < 2) return
        
        const color = CLIP_LINE_COLORS[idx % CLIP_LINE_COLORS.length]
        const isVisible = currentVisibility[label] !== false
        
        // 绘制折线
        const line = d3.line<{ time: number; value: number }>()
          .x(d => xScale(d.time))
          .y(d => yScaleRight(d.value))
          .curve(d3.curveMonotoneX)
        
        linesGroup.append('path')
          .datum(lineData)
          .attr('class', `clip-line clip-line-${idx}`)
          .attr('data-label', label)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
          .attr('stroke-opacity', isVisible ? 0.5 : 0)
          .attr('d', line)
      })
      
      // CLIP 图例（在 YOLO/手动标注图例下方，横向长条布局）
      const legendY = margin.top + innerHeight + 75  // YOLO图例在+35，这里+75保持更大间距
      const clipLegendG = svg.append('g')
        .attr('transform', `translate(${margin.left}, ${legendY})`)
      
      // 更新所有图例项的辅助函数
      const updateAllLegendItems = () => {
        clipLabels.forEach((l) => {
          const vis = clipVisibilityRef.current[l]
          
          // 更新折线
          svg.selectAll('.clip-line')
            .filter(function() { return d3.select(this).attr('data-label') === l })
            .transition()
            .duration(200)
            .attr('stroke-opacity', vis ? 0.5 : 0)
        })
        
        // 更新所有图例项
        clipLegendG.selectAll('.legend-item').each(function() {
          const itemLabel = d3.select(this).attr('data-label')
          const vis = clipVisibilityRef.current[itemLabel]
          const itemColor = d3.select(this).attr('data-color')
          
          d3.select(this).select('.legend-line')
            .transition()
            .duration(200)
            .attr('stroke-opacity', vis ? 1 : 0.25)
          
          d3.select(this).select('.legend-text')
            .transition()
            .duration(200)
            .attr('fill', vis ? '#444' : '#bbb')
            .attr('font-weight', vis ? 500 : 400)
        })
      }
      
      // 横向排列图例项（每行8个，更紧凑）
      const itemsPerRow = 8
      const itemWidth = innerWidth / itemsPerRow
      
      clipLabels.forEach((label, idx) => {
        const row = Math.floor(idx / itemsPerRow)
        const col = idx % itemsPerRow
        const x = col * itemWidth
        const y = row * 20
        const color = CLIP_LINE_COLORS[idx % CLIP_LINE_COLORS.length]
        const isVisible = currentVisibility[label] !== false
        
        const legendItem = clipLegendG.append('g')
          .attr('class', 'legend-item')
          .attr('data-label', label)
          .attr('data-color', color)
          .attr('transform', `translate(${x}, ${y})`)
          .style('cursor', 'pointer')
        
        // 颜色线条
        legendItem.append('line')
          .attr('class', 'legend-line')
          .attr('x1', 0)
          .attr('x2', 14)
          .attr('y1', 5)
          .attr('y2', 5)
          .attr('stroke', color)
          .attr('stroke-width', 3)
          .attr('stroke-linecap', 'round')
          .attr('stroke-opacity', isVisible ? 1 : 0.25)
        
        // 标签文字
        const maxTextLen = Math.floor((itemWidth - 22) / 5.5)
        legendItem.append('text')
          .attr('class', 'legend-text')
          .attr('x', 18)
          .attr('y', 9)
          .attr('fill', isVisible ? '#444' : '#bbb')
          .attr('font-size', 9)
          .attr('font-weight', isVisible ? 500 : 400)
          .text(label.length > maxTextLen ? label.slice(0, maxTextLen) + '..' : label)
        
        // Tooltip 显示完整标签名
        legendItem.append('title').text(label)
        
        // 点击事件 - 切换可见性
        legendItem.on('click', function(event) {
          event.stopPropagation()
          const newVisibility = !clipVisibilityRef.current[label]
          clipVisibilityRef.current[label] = newVisibility
          
          // 更新折线透明度
          svg.selectAll('.clip-line')
            .filter(function() { return d3.select(this).attr('data-label') === label })
            .transition()
            .duration(200)
            .attr('stroke-opacity', newVisibility ? 0.5 : 0)
          
          // 更新图例样式
          d3.select(this).select('.legend-line')
            .transition()
            .duration(200)
            .attr('stroke-opacity', newVisibility ? 1 : 0.25)
          
          d3.select(this).select('.legend-text')
            .transition()
            .duration(200)
            .attr('fill', newVisibility ? '#444' : '#bbb')
            .attr('font-weight', newVisibility ? 500 : 400)
        })
        
        // 双击事件 - 仅显示该标签
        legendItem.on('dblclick', function(event) {
          event.stopPropagation()
          
          // 检查是否只有当前标签可见
          const visibleCount = Object.values(clipVisibilityRef.current).filter(v => v).length
          const onlyThisVisible = visibleCount === 1 && clipVisibilityRef.current[label]
          
          if (onlyThisVisible) {
            // 如果只有当前标签可见，则显示所有
            clipLabels.forEach(l => {
              clipVisibilityRef.current[l] = true
            })
          } else {
            // 否则只显示当前标签
            clipLabels.forEach(l => {
              clipVisibilityRef.current[l] = (l === label)
            })
          }
          
          updateAllLegendItems()
        })
        
        // 悬停高亮
        legendItem.on('mouseover', function() {
          // 高亮对应折线
          svg.selectAll('.clip-line')
            .transition()
            .duration(100)
            .attr('stroke-opacity', function() {
              const l = d3.select(this).attr('data-label')
              if (l === label) return clipVisibilityRef.current[l] ? 0.85 : 0
              return clipVisibilityRef.current[l as string] ? 0.15 : 0
            })
            .attr('stroke-width', function() {
              return d3.select(this).attr('data-label') === label ? 2.5 : 1.5
            })
          
          // 高亮当前图例
          d3.select(this).select('.legend-line')
            .attr('stroke-width', 4)
          d3.select(this).select('.legend-text')
            .attr('fill', '#000')
        })
        
        legendItem.on('mouseout', function() {
          const isVis = clipVisibilityRef.current[label]
          // 恢复折线样式
          svg.selectAll('.clip-line')
            .transition()
            .duration(100)
            .attr('stroke-opacity', function() {
              const l = d3.select(this).attr('data-label') as string
              return clipVisibilityRef.current[l] ? 0.5 : 0
            })
            .attr('stroke-width', 1.5)
          
          // 恢复图例项
          d3.select(this).select('.legend-line')
            .attr('stroke-width', 3)
          d3.select(this).select('.legend-text')
            .attr('fill', isVis ? '#444' : '#bbb')
        })
      })
    }
    
    // 绘制散点（YOLO + 手动标注）
    scatterData.forEach(d => {
      const y = yScaleLeft(d.label)
      if (y === undefined) return
      
      const barHeight = yScaleLeft.bandwidth()
      const barWidth = Math.max(xScale(d.endTime) - xScale(d.time), 8)
      const color = d.source === 'YOLO' ? YOLO_COLOR : MANUAL_COLOR
      
      // 绘制时间段条
      g.append('rect')
        .attr('x', xScale(d.time))
        .attr('y', y)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('fill', color)
        .attr('rx', 4)
        .attr('opacity', 0.85)
        .style('cursor', 'pointer')
        .on('mouseover', function(event) {
          d3.select(this)
            .attr('opacity', 1)
            .attr('stroke', '#333')
            .attr('stroke-width', 2)
          
          if (tooltipRef.current) {
            const sourceName = d.source === 'YOLO' ? 'YOLO' : t('annotation.manualAnnotation', '手动标注')
            tooltipRef.current.innerHTML = `
              <div style="font-weight:600;color:${color};margin-bottom:4px;border-bottom:2px solid ${color};padding-bottom:4px">
                ${d.label}
              </div>
              <div>${t('annotation.source', '来源')}: <strong>${sourceName}</strong></div>
              <div>${t('annotation.startTime', '开始')}: ${d.time.toFixed(2)}s</div>
              <div>${t('annotation.endTime', '结束')}: ${d.endTime.toFixed(2)}s</div>
              <div>${t('annotation.duration', '持续')}: <strong>${(d.endTime - d.time).toFixed(2)}s</strong></div>
            `
            tooltipRef.current.style.display = 'block'
            tooltipRef.current.style.left = `${event.pageX + 15}px`
            tooltipRef.current.style.top = `${event.pageY + 15}px`
          }
        })
        .on('mouseout', function() {
          d3.select(this)
            .attr('opacity', 0.85)
            .attr('stroke', 'none')
          
          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'none'
          }
        })
    })
    
    // X轴
    g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(10).tickFormat(d => `${d}s`))
      .attr('font-size', 11)
      .selectAll('line, path')
      .attr('stroke', '#999')
    
    // X轴标签
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#555')
      .attr('font-size', 12)
      .text(t('annotation.timeInSeconds', '时间 (秒)'))
    
    // 左Y轴（标签）
    g.append('g')
      .call(d3.axisLeft(yScaleLeft))
      .attr('font-size', 10)
      .selectAll('text')
      .each(function(d) {
        const text = d3.select(this)
        const label = d as string
        if (label.length > 15) {
          text.text(label.slice(0, 15) + '...')
        }
      })
    
    g.selectAll('.domain').attr('stroke', '#999')
    
    // 左Y轴标签
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -55)
      .attr('text-anchor', 'middle')
      .attr('fill', '#555')
      .attr('font-size', 12)
      .text(t('annotation.label', '标签'))
    
    // 右Y轴（CLIP 置信度）
    if (hasClipData) {
      const rightAxis = g.append('g')
        .attr('transform', `translate(${innerWidth}, 0)`)
        .call(d3.axisRight(yScaleRight).ticks(5).tickFormat(d => `${(d as number * 100).toFixed(0)}%`))
        .attr('font-size', 10)
      
      rightAxis.selectAll('line, path').attr('stroke', '#8b5cf6')
      rightAxis.selectAll('text').attr('fill', '#8b5cf6')
      
      // 右Y轴标签
      g.append('text')
        .attr('transform', 'rotate(90)')
        .attr('x', innerHeight / 2)
        .attr('y', -innerWidth - 55)
        .attr('text-anchor', 'middle')
        .attr('fill', '#8b5cf6')
        .attr('font-size', 12)
        .text('CLIP ' + t('annotation.confidence', '置信度'))
    }
    
    // YOLO/手动标注图例（X轴下方）
    const legendItems = [
      ...(hasYoloData ? [{ name: 'YOLO', color: YOLO_COLOR }] : []),
      ...(hasManualData ? [{ name: t('annotation.manualAnnotation', '手动标注'), color: MANUAL_COLOR }] : [])
    ]
    
    const legendG = g.append('g')
      .attr('transform', `translate(0, ${innerHeight + 35})`)
    
    legendItems.forEach((item, i) => {
      const x = i * 110
      
      legendG.append('rect')
        .attr('x', x)
        .attr('y', 0)
        .attr('width', 14)
        .attr('height', 14)
        .attr('fill', item.color)
        .attr('rx', 3)
      
      legendG.append('text')
        .attr('x', x + 20)
        .attr('y', 11)
        .attr('fill', '#333')
        .attr('font-size', 11)
        .attr('font-weight', 500)
        .text(item.name)
    })
    
    // 标题
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333')
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(t('annotation.annotationTimeline', '标注时间线'))
    
  }, [scatterData, clipData, hasClipData, hasYoloData, hasManualData, t])
  
  // 绘制太阳图（只包含 YOLO + 手动标注）- 支持点击展开交互
  const drawSunburstChart = useCallback(() => {
    if (!svgRef.current) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const width = 700
    const height = 600
    const centerX = width / 2
    const centerY = height / 2 + 20
    const radius = Math.min(width, height) / 2 - 80
    
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
    }
    
    const yoloChildren: HierarchyNode[] = yoloStats.map((item, i) => ({
      name: item.name,
      value: item.value,
      color: YOLO_PALETTE[Math.min(i, YOLO_PALETTE.length - 1)],
      group: 'YOLO'
    }))
    
    const manualChildren: HierarchyNode[] = manualStats.map((item, i) => ({
      name: item.name,
      value: item.value,
      color: MANUAL_PALETTE[Math.min(i, MANUAL_PALETTE.length - 1)],
      group: t('annotation.manualAnnotation', '手动标注')
    }))
    
    const hierarchyData: HierarchyNode = {
      name: t('annotation.totalAnnotations', '总标注'),
      children: []
    }
    
    if (hasYoloData && yoloChildren.length > 0) {
      hierarchyData.children!.push({
        name: 'YOLO',
        children: yoloChildren,
        color: YOLO_COLOR
      })
    }
    
    if (hasManualData && manualChildren.length > 0) {
      hierarchyData.children!.push({
        name: t('annotation.manualAnnotation', '手动标注'),
        children: manualChildren,
        color: MANUAL_COLOR
      })
    }
    
    if (!hierarchyData.children || hierarchyData.children.length === 0) {
      const g = svg.append('g')
        .attr('transform', `translate(${centerX}, ${centerY})`)
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', '#999')
        .attr('font-size', 14)
        .text(t('common.noData', '无数据'))
      return
    }
    
    // 创建层级结构
    const root = d3.hierarchy(hierarchyData)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0))
    
    // 创建分区布局（太阳图）
    const partition = d3.partition<HierarchyNode>()
      .size([2 * Math.PI, radius])
    
    partition(root)
    
    // 存储每个节点的原始位置（用于动画）
    type NodeWithTarget = d3.HierarchyRectangularNode<HierarchyNode> & {
      current: { x0: number; x1: number; y0: number; y1: number }
      target?: { x0: number; x1: number; y0: number; y1: number }
    }
    
    root.descendants().forEach((d: any) => {
      d.current = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 }
    })
    
    // 弧形生成器 - 使用 current 属性以支持动画
    const arc = d3.arc<NodeWithTarget>()
      .startAngle(d => d.current.x0)
      .endAngle(d => d.current.x1)
      .padAngle(d => Math.min((d.current.x1 - d.current.x0) / 2, 0.02))
      .padRadius(radius / 2)
      .innerRadius(d => d.current.y0 * 0.8 + 30)
      .outerRadius(d => Math.max(d.current.y0 * 0.8 + 30, d.current.y1 * 0.8 + 25))
    
    const g = svg.append('g')
      .attr('transform', `translate(${centerX}, ${centerY})`)
    
    // 获取节点颜色
    const getNodeColor = (d: d3.HierarchyRectangularNode<HierarchyNode>): string => {
      if (d.data.color) return d.data.color
      if (d.depth === 1) {
        return d.data.name === 'YOLO' ? YOLO_COLOR : MANUAL_COLOR
      }
      const parent = d.parent
      if (parent && parent.data.name === 'YOLO') {
        const idx = parent.children ? parent.children.indexOf(d) : 0
        return YOLO_PALETTE[Math.min(idx, YOLO_PALETTE.length - 1)]
      }
      const idx = parent && parent.children ? parent.children.indexOf(d) : 0
      return MANUAL_PALETTE[Math.min(idx, MANUAL_PALETTE.length - 1)]
    }
    
    // 当前聚焦的节点
    let currentFocus = root as NodeWithTarget
    
    // 判断节点是否可见（在当前视图范围内）
    const arcVisible = (d: NodeWithTarget) => {
      return d.current.y1 <= radius * 3 && d.current.y0 >= 0 && d.current.x1 > d.current.x0
    }
    
    // 判断标签是否可见
    const labelVisible = (d: NodeWithTarget) => {
      return d.current.y1 <= radius * 3 && d.current.y0 >= 30 && (d.current.x1 - d.current.x0) > 0.12
    }
    
    // 计算标签位置变换
    const labelTransform = (d: NodeWithTarget) => {
      const angle = (d.current.x0 + d.current.x1) / 2
      const r = (d.current.y0 * 0.8 + 30 + d.current.y1 * 0.8 + 25) / 2
      const x = Math.sin(angle) * r
      const y = -Math.cos(angle) * r
      const rotation = angle * 180 / Math.PI - 90
      const flip = angle > Math.PI
      return `translate(${x}, ${y}) rotate(${flip ? rotation + 180 : rotation})`
    }
    
    // 绘制弧形路径
    const path = g.selectAll<SVGPathElement, NodeWithTarget>('path.arc')
      .data(root.descendants().filter(d => d.depth > 0) as NodeWithTarget[])
      .join('path')
      .attr('class', 'arc')
      .attr('d', arc)
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('fill-opacity', d => arcVisible(d) ? (d.depth === 1 ? 0.9 : 0.85) : 0)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        if (!arcVisible(d)) return
        d3.select(this)
          .attr('fill-opacity', 1)
          .attr('stroke', '#333')
          .attr('stroke-width', 3)
        
        if (tooltipRef.current) {
          const total = currentFocus.value || 1
          const percent = ((d.value || 0) / total * 100).toFixed(1)
          const groupName = d.parent?.data.name || ''
          const hasChildren = d.children && d.children.length > 0
          
          tooltipRef.current.innerHTML = `
            <div style="font-weight:600;margin-bottom:6px;color:${getNodeColor(d)};border-bottom:2px solid ${getNodeColor(d)};padding-bottom:4px">
              ${d.data.name}
            </div>
            ${groupName && groupName !== t('annotation.totalAnnotations', '总标注') ? `<div style="color:#666;margin-bottom:4px">${groupName}</div>` : ''}
            <div>${t('annotation.count', '数量')}: <strong>${d.value}</strong></div>
            <div>${t('annotation.percentage', '占比')}: <strong>${percent}%</strong></div>
            ${hasChildren ? `<div style="margin-top:6px;color:#6366f1;font-size:11px">&#x1F449; ${t('annotation.clickToExpand', '点击展开')}</div>` : ''}
          `
          tooltipRef.current.style.display = 'block'
          tooltipRef.current.style.left = (event.pageX + 15) + 'px'
          tooltipRef.current.style.top = (event.pageY + 15) + 'px'
        }
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2)
          .attr('fill-opacity', arcVisible(d) ? (d.depth === 1 ? 0.9 : 0.85) : 0)
        
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'none'
        }
      })
      .on('click', clicked)
    
    // 绘制标签
    const label = g.selectAll<SVGTextElement, NodeWithTarget>('text.label')
      .data(root.descendants().filter(d => d.depth > 0) as NodeWithTarget[])
      .join('text')
      .attr('class', 'label')
      .attr('transform', labelTransform)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#333')
      .attr('font-size', 9)
      .attr('font-weight', 500)
      .attr('pointer-events', 'none')
      .attr('fill-opacity', d => labelVisible(d) ? 1 : 0)
      .text(d => {
        const name = d.data.name
        const maxLen = 12
        return name.length > maxLen ? name.slice(0, maxLen) + '..' : name
      })
    
    // 中心圆组
    const centerGroup = g.append('g').attr('class', 'center-group')
    
    // 中心圆 - 可点击返回
    const centerCircle = centerGroup.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 55)
      .attr('fill', '#fff')
      .attr('stroke', '#e5e5e5')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', () => clicked(null, currentFocus.parent as NodeWithTarget || root as NodeWithTarget))
      .on('mouseover', function() {
        if (currentFocus !== root) {
          d3.select(this).attr('stroke', '#6366f1').attr('stroke-width', 3)
          if (tooltipRef.current) {
            tooltipRef.current.innerHTML = `<div style="color:#6366f1;font-weight:500">&#x1F448; ${t('annotation.clickToGoBack', '点击返回上层')}</div>`
            tooltipRef.current.style.display = 'block'
          }
        }
      })
      .on('mouseout', function() {
        d3.select(this).attr('stroke', '#e5e5e5').attr('stroke-width', 2)
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'none'
        }
      })
    
    // 中心文字 - 数量
    const centerValue = centerGroup.append('text')
      .attr('class', 'center-value')
      .attr('text-anchor', 'middle')
      .attr('y', -8)
      .attr('fill', '#333')
      .attr('font-size', 28)
      .attr('font-weight', 700)
      .attr('pointer-events', 'none')
      .text(root.value || 0)
    
    // 中心文字 - 标签
    const centerLabel = centerGroup.append('text')
      .attr('class', 'center-label')
      .attr('text-anchor', 'middle')
      .attr('y', 18)
      .attr('fill', '#888')
      .attr('font-size', 12)
      .attr('pointer-events', 'none')
      .text(t('annotation.totalAnnotations', '总标注'))
    
    // 点击事件处理 - 展开/缩放
    function clicked(event: any, p: NodeWithTarget) {
      if (!p) return
      
      // 更新当前焦点
      currentFocus = p
      
      // 计算新的角度和半径范围
      const targetRoot = p
      
      root.each((d: any) => {
        d.target = {
          x0: Math.max(0, Math.min(1, (d.x0 - targetRoot.x0) / (targetRoot.x1 - targetRoot.x0))) * 2 * Math.PI,
          x1: Math.max(0, Math.min(1, (d.x1 - targetRoot.x0) / (targetRoot.x1 - targetRoot.x0))) * 2 * Math.PI,
          y0: Math.max(0, d.y0 - targetRoot.y0),
          y1: Math.max(0, d.y1 - targetRoot.y0)
        }
      })
      
      const transitionDuration = 750
      const t = svg.transition().duration(transitionDuration)
      
      // 动画更新弧形
      path.transition(t as any)
        .tween('data', (d: any) => {
          const i = d3.interpolate(d.current, d.target)
          return (t: number) => { d.current = i(t) }
        })
        .attrTween('d', (d: any) => () => arc(d) || '')
        .attr('fill-opacity', (d: any) => arcVisible(d) ? (d.children ? 0.9 : 0.85) : 0)
      
      // 动画更新标签
      label.transition(t as any)
        .tween('data', (d: any) => {
          const i = d3.interpolate(d.current, d.target)
          return (t: number) => { d.current = i(t) }
        })
        .attrTween('transform', (d: any) => () => labelTransform(d))
        .attr('fill-opacity', (d: any) => labelVisible(d) ? 1 : 0)
      
      // 更新中心显示
      centerValue.transition(t as any)
        .text(p.value || 0)
      
      centerLabel.transition(t as any)
        .text(p.data.name.length > 10 ? p.data.name.slice(0, 10) + '..' : p.data.name)
      
      // 更新中心圆样式 - 根节点时显示不可返回
      centerCircle.transition(t as any)
        .attr('stroke', p === root ? '#e5e5e5' : '#6366f1')
        .attr('stroke-dasharray', p === root ? 'none' : '4,2')
    }
    
    // 图例
    const legendG = svg.append('g')
      .attr('transform', 'translate(20, 30)')
    
    const groups = [
      ...(hasYoloData ? [{ name: 'YOLO', color: YOLO_COLOR, count: yoloStats.reduce((sum, s) => sum + s.value, 0) }] : []),
      ...(hasManualData ? [{ name: t('annotation.manualAnnotation', '手动标注'), color: MANUAL_COLOR, count: manualStats.reduce((sum, s) => sum + s.value, 0) }] : [])
    ]
    
    groups.forEach((group, i) => {
      const y = i * 28
      
      legendG.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', 18)
        .attr('height', 18)
        .attr('rx', 4)
        .attr('fill', group.color)
        .attr('opacity', 0.9)
      
      legendG.append('text')
        .attr('x', 26)
        .attr('y', y + 13)
        .attr('fill', '#444')
        .attr('font-size', 12)
        .attr('font-weight', 500)
        .text(`${group.name} (${group.count})`)
    })
    
    // 标题
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333')
      .attr('font-size', 15)
      .attr('font-weight', 600)
      .text(t('annotation.sunburstChart', '标注分布太阳图'))
    
  }, [yoloStats, manualStats, hasYoloData, hasManualData, t])
  
  // 绘制热图（只包含 YOLO + 手动标注）
  const drawHeatmapChart = useCallback(() => {
    if (!svgRef.current || heatmapData.data.length === 0) return
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    
    const width = 800
    const height = Math.max(400, heatmapData.labels.length * 35 + 120)
    const margin = { top: 50, right: 100, left: 180, bottom: 100 }
    
    svg.attr('viewBox', `0 0 ${width} ${height}`)
    
    const cellWidth = (width - margin.left - margin.right) / heatmapData.timeSlots.length
    const cellHeight = (height - margin.top - margin.bottom) / heatmapData.labels.length
    
    const maxValue = Math.max(...heatmapData.data.map(d => d.value), 1)
    
    // 根据来源选择颜色
    const getColorScale = (source: string) => {
      if (source.startsWith('YOLO')) return d3.interpolateBlues
      return d3.interpolateReds
    }
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)
    
    // 绘制单元格
    heatmapData.data.forEach(d => {
      const source = heatmapData.labels[d.y].split(':')[0]
      const colorInterpolate = getColorScale(source)
      const cellColor = d.value > 0 ? colorInterpolate(d.value / maxValue * 0.8 + 0.2) : '#f5f5f5'
      
      g.append('rect')
        .attr('x', d.x * cellWidth)
        .attr('y', d.y * cellHeight)
        .attr('width', cellWidth - 1)
        .attr('height', cellHeight - 1)
        .attr('fill', cellColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('rx', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function(event) {
          d3.select(this).attr('stroke', '#333').attr('stroke-width', 2)
          if (tooltipRef.current) {
            tooltipRef.current.innerHTML = `
              <div style="font-weight:600;margin-bottom:4px">${heatmapData.labels[d.y]}</div>
              <div>${heatmapData.timeSlots[d.x]}: <strong>${d.value}</strong> ${t('annotation.count', '次')}</div>
            `
            tooltipRef.current.style.display = 'block'
            tooltipRef.current.style.left = `${event.pageX + 15}px`
            tooltipRef.current.style.top = `${event.pageY + 15}px`
          }
        })
        .on('mouseout', function() {
          d3.select(this).attr('stroke', '#fff').attr('stroke-width', 1)
          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'none'
          }
        })
      
      // 数值标签
      if (d.value > 0 && cellWidth > 20 && cellHeight > 15) {
        g.append('text')
          .attr('x', d.x * cellWidth + cellWidth / 2)
          .attr('y', d.y * cellHeight + cellHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', d.value > maxValue * 0.5 ? '#fff' : '#333')
          .attr('font-size', 10)
          .attr('font-weight', 500)
          .text(d.value)
      }
    })
    
    // X轴标签
    g.selectAll('.x-label')
      .data(heatmapData.timeSlots)
      .join('text')
      .attr('class', 'x-label')
      .attr('x', (_, i) => i * cellWidth + cellWidth / 2)
      .attr('y', height - margin.top - margin.bottom + 15)
      .attr('text-anchor', 'end')
      .attr('transform', (_, i) => `rotate(-45, ${i * cellWidth + cellWidth / 2}, ${height - margin.top - margin.bottom + 15})`)
      .attr('fill', '#555')
      .attr('font-size', 10)
      .text(d => d)
    
    // Y轴标签
    g.selectAll('.y-label')
      .data(heatmapData.labels)
      .join('text')
      .attr('class', 'y-label')
      .attr('x', -10)
      .attr('y', (_, i) => i * cellHeight + cellHeight / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', d => {
        if (d.startsWith('YOLO')) return YOLO_COLOR
        return MANUAL_COLOR
      })
      .attr('font-size', 10)
      .attr('font-weight', 500)
      .text(d => {
        const label = d.split(': ')[1] || d
        return label.length > 20 ? label.slice(0, 20) + '...' : label
      })
    
    // 图例
    const legendG = svg.append('g')
      .attr('transform', `translate(${width - margin.right + 20}, ${margin.top})`)
    
    const legendColors = [
      { name: 'YOLO', interpolate: d3.interpolateBlues },
      { name: t('annotation.manualAnnotation', '手动'), interpolate: d3.interpolateReds }
    ]
    
    legendColors.forEach((item, idx) => {
      const y = idx * 80
      
      legendG.append('text')
        .attr('x', 0)
        .attr('y', y)
        .attr('fill', '#333')
        .attr('font-size', 11)
        .attr('font-weight', 600)
        .text(item.name)
      
      // 渐变条
      const gradientId = `gradient-${idx}`
      const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '0%').attr('y2', '100%')
      
      gradient.append('stop').attr('offset', '0%').attr('stop-color', item.interpolate(1))
      gradient.append('stop').attr('offset', '100%').attr('stop-color', item.interpolate(0.2))
      
      legendG.append('rect')
        .attr('x', 0)
        .attr('y', y + 15)
        .attr('width', 15)
        .attr('height', 50)
        .attr('fill', `url(#${gradientId})`)
        .attr('stroke', '#ddd')
      
      legendG.append('text').attr('x', 20).attr('y', y + 20).attr('fill', '#666').attr('font-size', 9).text(maxValue)
      legendG.append('text').attr('x', 20).attr('y', y + 65).attr('fill', '#666').attr('font-size', 9).text('0')
    })
    
    // 标题
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333')
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(t('annotation.heatmap', '热图'))
    
  }, [heatmapData, t])
  
  // 根据图表类型绘制
  useEffect(() => {
    if (chartType === 'scatter') {
      drawScatterChart()
    } else if (chartType === 'sunburst') {
      drawSunburstChart()
    } else if (chartType === 'heatmap') {
      drawHeatmapChart()
    }
  }, [chartType, drawScatterChart, drawSunburstChart, drawHeatmapChart])
  
  // 导出 SVG
  const handleExportSvg = () => {
    if (!svgRef.current) return

    const svgElement = svgRef.current
    
    // 克隆 SVG 以保留所有内容（包括标题、图例、标签等）
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement
    
    // 获取 SVG 的 viewBox 和尺寸，保持原样
    const viewBox = svgElement.getAttribute('viewBox')
    const width = svgElement.getAttribute('width') || svgElement.clientWidth
    const height = svgElement.getAttribute('height') || svgElement.clientHeight
    
    // 确保克隆的 SVG 有正确的尺寸
    if (viewBox) {
      svgClone.setAttribute('viewBox', viewBox)
    }
    svgClone.setAttribute('width', String(width))
    svgClone.setAttribute('height', String(height))
    
    // 添加白色背景作为第一个元素
    const viewBoxValues = viewBox ? viewBox.split(' ').map(Number) : [0, 0, Number(width), Number(height)]
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bgRect.setAttribute('x', String(viewBoxValues[0]))
    bgRect.setAttribute('y', String(viewBoxValues[1]))
    bgRect.setAttribute('width', String(viewBoxValues[2]))
    bgRect.setAttribute('height', String(viewBoxValues[3]))
    bgRect.setAttribute('fill', '#ffffff')
    svgClone.insertBefore(bgRect, svgClone.firstChild)
    
    // 序列化克隆的 SVG
    const svgData = new XMLSerializer().serializeToString(svgClone)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `multimodal_${chartType}_chart.svg`
    link.click()
    URL.revokeObjectURL(url)
  }
  
  // 导出 PNG
  const handleExportPng = async () => {
    if (!svgRef.current) return

    try {
      const svgElement = svgRef.current
      
      // 克隆 SVG 以保留所有内容（包括标题、图例、标签等）
      const svgClone = svgElement.cloneNode(true) as SVGSVGElement
      
      // 获取 SVG 的 viewBox 和尺寸，保持原样
      const viewBox = svgElement.getAttribute('viewBox')
      const widthAttr = svgElement.getAttribute('width')
      const heightAttr = svgElement.getAttribute('height')
      
      let width: number, height: number
      if (viewBox) {
        const viewBoxValues = viewBox.split(' ').map(Number)
        width = viewBoxValues[2]
        height = viewBoxValues[3]
      } else {
        width = widthAttr ? parseFloat(widthAttr) : svgElement.clientWidth
        height = heightAttr ? parseFloat(heightAttr) : svgElement.clientHeight
      }
      
      // 确保克隆的 SVG 有正确的尺寸
      if (viewBox) {
        svgClone.setAttribute('viewBox', viewBox)
      }
      svgClone.setAttribute('width', String(width))
      svgClone.setAttribute('height', String(height))
      
      // 添加白色背景作为第一个元素
      const viewBoxValues = viewBox ? viewBox.split(' ').map(Number) : [0, 0, width, height]
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bgRect.setAttribute('x', String(viewBoxValues[0]))
      bgRect.setAttribute('y', String(viewBoxValues[1]))
      bgRect.setAttribute('width', String(viewBoxValues[2]))
      bgRect.setAttribute('height', String(viewBoxValues[3]))
      bgRect.setAttribute('fill', '#ffffff')
      svgClone.insertBefore(bgRect, svgClone.firstChild)
      
      // 转换为 data URL
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgClone)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)
      
      // 创建图片和画布，高分辨率
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
        
        // 设置高分辨率渲染
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        
        // 转换为 PNG
        canvas.toBlob((blob) => {
          if (!blob) {
            URL.revokeObjectURL(svgUrl)
            return
          }
          
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `multimodal_${chartType}_chart.png`
          link.click()
          
          URL.revokeObjectURL(url)
          URL.revokeObjectURL(svgUrl)
        }, 'image/png')
      }
      
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl)
        console.error('Failed to load SVG image')
      }
      
      img.src = svgUrl
    } catch (error) {
      console.error('Export PNG failed:', error)
    }
  }
  
  const hasData = totalYoloCount > 0 || totalManualCount > 0 || totalClipFrames > 0
  
  if (!hasData) {
    return (
      <Alert severity="info">
        {t('annotation.noVisualizationData', '无数据可视化')}
      </Alert>
    )
  }
  
  // 计算 scatter 图表高度，考虑 CLIP 图例和标签数量
  const scatterChartHeight = useMemo(() => {
    const yoloLegendHeight = 25
    const labelRowHeight = 30
    const minChartHeight = 200
    
    // 计算标签数量
    const allLabels = [...new Set(scatterData.map(d => d.label))]
    const dynamicChartHeight = Math.max(minChartHeight, allLabels.length * labelRowHeight)
    
    // 计算 CLIP 图例高度
    let clipLegendHeight = 0
    if (hasClipData && clipData) {
      const labels = clipData.labels.length > 0 ? clipData.labels : 
        [...new Set(clipData.frameData.map(f => f.topLabel))]
      const legendRows = Math.ceil(labels.length / 8)
      clipLegendHeight = legendRows * 20
    }
    
    const totalLegendHeight = yoloLegendHeight + (hasClipData ? 25 + clipLegendHeight : 0)
    const margin = { top: 40, bottom: 45 + totalLegendHeight }
    
    return margin.top + dynamicChartHeight + margin.bottom
  }, [hasClipData, clipData, scatterData])
  
  const chartHeight = chartType === 'scatter' ? scatterChartHeight : chartType === 'sunburst' ? 600
    : Math.max(400, heatmapData.labels.length * 35 + 120)
  
  return (
    <Box>
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          display: 'none',
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.98)',
          border: '1px solid #e0e0e0',
          borderRadius: '10px',
          boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
          fontSize: '13px',
          lineHeight: 1.6,
          pointerEvents: 'none',
          zIndex: 10000,
          maxWidth: '320px',
          backdropFilter: 'blur(8px)'
        }}
      />
      
      {/* 工具栏 */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center" justifyContent="space-between">
        <ToggleButtonGroup
          value={chartType}
          exclusive
          onChange={(_, value) => value && setChartType(value)}
          size="small"
        >
          <ToggleButton value="scatter">
            <ShowChartIcon sx={{ mr: 0.5 }} fontSize="small" />
            {t('annotation.scatterChart', '时间线')}
          </ToggleButton>
          <ToggleButton value="sunburst">
            <WbSunnyIcon sx={{ mr: 0.5 }} fontSize="small" />
            {t('annotation.sunburstChart', '太阳图')}
          </ToggleButton>
          <ToggleButton value="heatmap">
            <GridOnIcon sx={{ mr: 0.5 }} fontSize="small" />
            {t('annotation.heatmap', '热图')}
          </ToggleButton>
        </ToggleButtonGroup>
        
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          <Tooltip title={t('annotation.exportSvg', '导出 SVG')}>
            <IconButton size="small" onClick={handleExportSvg}>
              <SaveAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('annotation.exportPng', '导出 PNG')}>
            <IconButton size="small" onClick={handleExportPng}>
              <ImageIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      
      {/* 图表容器 */}
      <Box 
        ref={containerRef} 
        sx={{ 
          border: 1, 
          borderColor: 'divider', 
          borderRadius: 2,
          maxHeight: 500,
          overflow: 'auto'
        }}
      >
        {chartType === 'scatter' && (
          <Typography variant="caption" color="text.secondary" sx={{ p: 2, pb: 0, display: 'block' }}>
            {hasClipData 
              ? t('annotation.scatterChartTipWithClip', '提示: 条形显示 YOLO/手动标注时间段，浅色折线背景显示 CLIP 各标签置信度变化')
              : t('annotation.scatterChartTip', '提示: 条形显示 YOLO/手动标注时间段，悬停查看详情')
            }
          </Typography>
        )}
        {chartType === 'sunburst' && (
          <Typography variant="caption" color="text.secondary" sx={{ p: 2, pb: 0, display: 'block' }}>
            {t('annotation.sunburstChartTip', '提示: 太阳图展示 YOLO/手动标注的层级分布，内圈为分类，外圈为具体标签')}
          </Typography>
        )}
        
        <Box sx={{ p: 2, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <svg
            ref={svgRef}
            style={{ 
              width: '100%', 
              maxWidth: chartType === 'scatter' ? 900 : chartType === 'sunburst' ? 700 : 800,
              height: chartHeight 
            }}
          />
        </Box>
      </Box>
      
      {/* 统计摘要 */}
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="center">
          {hasClipData && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#8b5cf6' }} />
              <Typography variant="body2" color="text.secondary">
                CLIP: <strong>{totalClipFrames}</strong> {t('annotation.frames', '帧')}
              </Typography>
            </Stack>
          )}
          {hasYoloData && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: YOLO_COLOR }} />
              <Typography variant="body2" color="text.secondary">
                YOLO: <strong>{totalYoloCount}</strong>
              </Typography>
            </Stack>
          )}
          {hasManualData && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: MANUAL_COLOR }} />
              <Typography variant="body2" color="text.secondary">
                {t('annotation.manualAnnotation', '手动')}: <strong>{totalManualCount}</strong>
              </Typography>
            </Stack>
          )}
          <Typography variant="body2" color="text.secondary">
            {t('annotation.transcriptAnnotation', '转录标注')}: <strong>{annotations.filter(a => a.type !== 'video').length}</strong>
          </Typography>
        </Stack>
      </Box>
    </Box>
  )
}

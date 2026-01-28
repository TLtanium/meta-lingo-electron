/**
 * AnnotationVisualization - 文本标注可视化组件
 * 
 * 功能：
 * - 使用 D3.js 实现美观的交互式图表
 * - 柱状图/饼图/词云图切换
 * - 标签统计
 * - 支持导出 PNG/SVG
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
import BarChartIcon from '@mui/icons-material/BarChart'
import PieChartOutlineIcon from '@mui/icons-material/PieChartOutline'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import html2canvas from 'html2canvas'
import type { Annotation } from '../../../types'

interface AnnotationVisualizationProps {
  annotations: Annotation[]
}

// 美观的颜色调色板 - 更鲜艳的渐变色
const COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0',
  '#6f5ef9', '#89ca7e', '#f5a623', '#d0648a', '#22c3aa'
]

type ChartType = 'bar' | 'pie'

export default function AnnotationVisualization({ annotations }: AnnotationVisualizationProps) {
  const { t } = useTranslation()
  const [chartType, setChartType] = useState<ChartType>('bar')
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  
  // 统计标签数量
  const labelStats = useMemo(() => {
    const counts: Record<string, { count: number; color: string }> = {}
    
    annotations.forEach(ann => {
      if (!counts[ann.label]) {
        counts[ann.label] = { count: 0, color: ann.color || COLORS[Object.keys(counts).length % COLORS.length] }
      }
      counts[ann.label].count++
    })
    
    return Object.entries(counts)
      .map(([label, data]) => ({
        name: label,
        value: data.count,
        color: data.color
      }))
      .sort((a, b) => b.value - a.value)
  }, [annotations])
  
  // 绘制柱状图
  const drawBarChart = useCallback(() => {
    if (!svgRef.current || labelStats.length === 0) return
    
    const svg = d3.select(svgRef.current)
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
      .attr('fill', '#666')
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
          .attr('stroke', '#333')
          .attr('stroke-width', 2)
        
        if (tooltipRef.current) {
          tooltipRef.current.innerHTML = `
            <div style="font-weight:600;color:${d.color};margin-bottom:4px;border-bottom:2px solid ${d.color};padding-bottom:4px">
              ${d.name}
            </div>
            <div>${t('annotation.count', '数量')}: <strong>${d.value}</strong></div>
            <div>${t('annotation.percentage', '占比')}: <strong>${(d.value / annotations.length * 100).toFixed(1)}%</strong></div>
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
      .attr('fill', '#333')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text(d => d.value)
    
    // 标题
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333')
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(t('annotation.labelStatistics', '标签统计'))
    
  }, [labelStats, annotations.length, t])
  
  // 绘制饼图
  const drawPieChart = useCallback(() => {
    if (!svgRef.current || labelStats.length === 0) return
    
    const svg = d3.select(svgRef.current)
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
      .attr('fill', '#333')
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(t('annotation.labelStatistics', '标签统计'))
    
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
      .attr('stroke', '#fff')
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
      .attr('fill', '#333')
      .attr('font-size', 28)
      .attr('font-weight', 700)
      .text(annotations.length)
    
    centerGroup.append('text')
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
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
        .attr('fill', '#333')
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
    
  }, [labelStats, annotations.length, t])
  
  // 根据图表类型绘制
  useEffect(() => {
    if (chartType === 'bar') {
      drawBarChart()
    } else if (chartType === 'pie') {
      drawPieChart()
    }
  }, [chartType, drawBarChart, drawPieChart])
  
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
    link.download = `annotation_${chartType}_chart.svg`
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
          link.download = `annotation_${chartType}_chart.png`
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
  
  if (annotations.length === 0) {
    return (
      <Alert severity="info">
        {t('annotation.noVisualizationData', '无数据可视化')}
      </Alert>
    )
  }
  
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
          maxWidth: '300px',
          backdropFilter: 'blur(8px)'
        }}
      />
      
      {/* 工具栏 */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="subtitle2" color="text.secondary">
            {t('annotation.labelStatistics', '标签统计')}
          </Typography>
          
          <ToggleButtonGroup
            value={chartType}
            exclusive
            onChange={(_, value) => value && setChartType(value)}
            size="small"
          >
            <ToggleButton value="bar">
              <BarChartIcon sx={{ mr: 0.5 }} fontSize="small" />
              {t('annotation.barChart', '柱状图')}
            </ToggleButton>
            <ToggleButton value="pie">
              <PieChartOutlineIcon sx={{ mr: 0.5 }} fontSize="small" />
              {t('annotation.pieChart', '饼图')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        
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
        <Box sx={{ p: 2, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <svg
            ref={svgRef}
            style={{ 
              width: '100%', 
              maxWidth: 700,
              height: chartType === 'bar' ? 400 : 450
            }}
          />
        </Box>
      </Box>
      
      {/* 统计摘要 */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          {t('common.all', '共')} {annotations.length} {t('common.items', '条')} | 
          {' '}{labelStats.length} {t('annotation.labelTypes', '种标签')}
        </Typography>
        
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
      </Box>
    </Box>
  )
}

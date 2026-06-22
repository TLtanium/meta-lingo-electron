/**
 * AnnotationWordCloud - 标注词云图（D3.js + d3-cloud）
 *
 * 受控组件：由父组件提供 labelInfo / selectedLabels / maxWords，
 * 通过 forwardRef 暴露 exportSvg / exportPng 方法。
 */

import { forwardRef, useImperativeHandle, useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Box, Typography, Alert, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import cloud from 'd3-cloud'
import type { Annotation } from '../../../types'

export interface LabelInfo {
  label: string
  color: string
  count: number
}

export interface AnnotationWordCloudHandle {
  exportSvg: () => void
  exportPng: () => void
}

interface AnnotationWordCloudProps {
  annotations: Annotation[]
  labelInfo: LabelInfo[]
  selectedLabels: Set<string>
  maxWords: number
}

const FALLBACK_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0'
]

interface CloudWord {
  text: string
  size: number
  frequency: number
  color: string
}

const AnnotationWordCloud = forwardRef<AnnotationWordCloudHandle, AnnotationWordCloudProps>(
  function AnnotationWordCloud({ annotations, labelInfo, selectedLabels, maxWords }, ref) {
    const { t } = useTranslation()
    const theme = useTheme()
    const isDarkMode = theme.palette.mode === 'dark'
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const [containerWidth, setContainerWidth] = useState(0)

    const colorByLabel = useMemo(() => new Map(labelInfo.map(l => [l.label, l.color])), [labelInfo])

    const words = useMemo<{ text: string; frequency: number; color: string }[]>(() => {
      const counts = new Map<string, { freq: number; labelCounts: Map<string, number> }>()
      for (const ann of annotations) {
        if (!ann.label || !selectedLabels.has(ann.label)) continue
        const raw = (ann.text || '').trim()
        if (!raw) continue
        const key = raw.toLowerCase()
        const entry = counts.get(key)
        if (entry) {
          entry.freq++
          entry.labelCounts.set(ann.label, (entry.labelCounts.get(ann.label) || 0) + 1)
        } else {
          counts.set(key, { freq: 1, labelCounts: new Map([[ann.label, 1]]) })
        }
      }
      return Array.from(counts.entries()).map(([text, info]) => {
        let domLabel = ''
        let domCount = -1
        info.labelCounts.forEach((c, lbl) => { if (c > domCount) { domCount = c; domLabel = lbl } })
        return {
          text,
          frequency: info.freq,
          color: colorByLabel.get(domLabel) || FALLBACK_COLORS[0]
        }
      }).sort((a, b) => b.frequency - a.frequency).slice(0, maxWords)
    }, [annotations, selectedLabels, colorByLabel, maxWords])

    useEffect(() => {
      if (!containerRef.current) return
      const ro = new ResizeObserver(entries => {
        for (const e of entries) setContainerWidth(e.contentRect.width)
      })
      ro.observe(containerRef.current)
      return () => ro.disconnect()
    }, [])

    useEffect(() => {
      if (!svgRef.current || containerWidth === 0) return
      const svg = d3.select(svgRef.current)
      svg.selectAll('*').remove()
      if (words.length === 0) return

      const width = containerWidth
      const height = 440

      const maxFreq = d3.max(words, d => d.frequency) || 1
      const minFreq = d3.min(words, d => d.frequency) || 1
      const maxFont = Math.min(76, Math.max(38, height / 6.5))
      const minFont = Math.max(13, maxFont / 6)
      const fontScale = d3.scaleSqrt().domain([minFreq, maxFreq]).range([minFont, maxFont])

      const layoutWords: CloudWord[] = words.map(w => ({
        text: w.text,
        size: fontScale(w.frequency),
        frequency: w.frequency,
        color: w.color
      }))

      const draw = (placed: cloud.Word[]) => {
        svg
          .attr('viewBox', `0 0 ${width} ${height}`)
          .attr('width', '100%')
          .attr('height', height)
        const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`)
        g.selectAll('text')
          .data(placed)
          .enter()
          .append('text')
          .style('font-size', d => `${d.size}px`)
          .style('font-family', '"Segoe UI", "PingFang SC", sans-serif')
          .style('font-weight', 'bold')
          .style('fill', d => (d as CloudWord).color)
          .style('cursor', 'default')
          .attr('text-anchor', 'middle')
          .attr('transform', d => `translate(${d.x},${d.y})rotate(${d.rotate})`)
          .attr('opacity', 0)
          .text(d => d.text || '')
          .call(sel => sel.append('title').text(d => `${d.text}: ${(d as CloudWord).frequency}`))
          .transition()
          .duration(450)
          .delay((_, i) => i * 4)
          .attr('opacity', 1)
      }

      const layout = cloud<CloudWord>()
        .size([width, height])
        .words(layoutWords)
        .padding(3)
        .rotate(() => (Math.random() < 0.5 ? 0 : 90))
        .spiral('archimedean')
        .font('"Segoe UI", "PingFang SC", sans-serif')
        .fontSize(d => d.size)
        .on('end', draw)
      layout.start()
      return () => { layout.stop() }
    }, [words, containerWidth, isDarkMode])

    const buildExportSvg = useCallback((): { clone: SVGSVGElement; width: number; height: number } | null => {
      if (!svgRef.current) return null
      const src = svgRef.current
      const clone = src.cloneNode(true) as SVGSVGElement
      const viewBox = src.getAttribute('viewBox') || `0 0 ${src.clientWidth} ${src.clientHeight}`
      const vb = viewBox.split(' ').map(Number)
      const width = vb[2], height = vb[3]
      clone.setAttribute('viewBox', viewBox)
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bg.setAttribute('x', String(vb[0]))
      bg.setAttribute('y', String(vb[1]))
      bg.setAttribute('width', String(width))
      bg.setAttribute('height', String(height))
      bg.setAttribute('fill', '#ffffff')
      clone.insertBefore(bg, clone.firstChild)
      return { clone, width, height }
    }, [])

    const handleExportSvg = useCallback(() => {
      const built = buildExportSvg()
      if (!built) return
      const data = new XMLSerializer().serializeToString(built.clone)
      const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'annotation_wordcloud.svg'
      a.click()
      URL.revokeObjectURL(url)
    }, [buildExportSvg])

    const handleExportPng = useCallback(() => {
      const built = buildExportSvg()
      if (!built) return
      const { clone, width, height } = built
      const data = new XMLSerializer().serializeToString(clone)
      const svgUrl = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      img.onload = () => {
        const scale = 3
        const canvas = document.createElement('canvas')
        canvas.width = width * scale
        canvas.height = height * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(svgUrl); return }
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        canvas.toBlob(blob => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'annotation_wordcloud.png'
            a.click()
            URL.revokeObjectURL(url)
          }
          URL.revokeObjectURL(svgUrl)
        }, 'image/png')
      }
      img.onerror = () => URL.revokeObjectURL(svgUrl)
      img.src = svgUrl
    }, [buildExportSvg])

    useImperativeHandle(ref, () => ({
      exportSvg: handleExportSvg,
      exportPng: handleExportPng
    }), [handleExportSvg, handleExportPng])

    if (labelInfo.length === 0) {
      return (
        <Alert severity="info">
          {t('annotation.noVisualizationData', '无数据可视化')}
        </Alert>
      )
    }

    return (
      <Box
        ref={containerRef}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 3,
          minHeight: 460,
          overflow: 'hidden',
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isDarkMode
            ? 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.04), transparent 70%)'
            : 'radial-gradient(circle at 50% 40%, rgba(84,112,198,0.05), transparent 70%)'
        }}
      >
        {words.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('annotation.wordCloudNoSelection', '请至少勾选一个标签')}
          </Typography>
        ) : (
          <svg ref={svgRef} style={{ width: '100%', height: 440 }} />
        )}
      </Box>
    )
  }
)

export default AnnotationWordCloud

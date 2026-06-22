/**
 * AnnotationNetwork - 标注网络图（D3.js 力导向图）
 *
 * 受控组件：maxWords / selectedLabels / selectedExtraIds / onlyShared 由父组件管理，
 * 通过回调 onAvailableChange / onLabelInfoChange 将可用存档列表和标签列表上报给父组件，
 * 通过 forwardRef 暴露 exportSvg / exportPng / resetZoom。
 */

import { forwardRef, useImperativeHandle, useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Box,
  Stack,
  Typography,
  Alert,
  CircularProgress,
  useTheme
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import * as d3 from 'd3'
import { api } from '../../../api/client'
import type { Annotation } from '../../../types'

export interface ArchiveListItem {
  id: string
  type: 'text' | 'multimodal'
  corpusName: string
  framework: string
  textName?: string
  resourceName?: string
  annotationCount: number
}

export interface AnnotationNetworkHandle {
  exportSvg: () => void
  exportPng: () => void
  resetZoom: () => void
}

interface LoadedArchive {
  id: string
  name: string
  framework: string
  corpus: string
  color: string
  annotations: Annotation[]
}

interface AnnotationNetworkProps {
  corpusName: string
  archiveId: string
  archiveName: string
  framework: string
  annotations: Annotation[]
  // Controlled state from parent:
  maxWords: number
  selectedLabels: Set<string>
  selectedExtraIds: string[]
  onlyShared: boolean
  // Callbacks to populate parent selectors:
  onAvailableChange: (list: ArchiveListItem[]) => void
  onLabelInfoChange: (info: { label: string; color: string; count: number }[]) => void
}

// 区分来源存档的描边环配色
const ARCHIVE_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f'
]
const WORD_COLOR = '#9aa4b2'
const FALLBACK_LABEL_COLOR = '#5470c6'
const WORD_LABEL_NODE_LIMIT = 130

interface GNode extends d3.SimulationNodeDatum {
  id: string
  kind: 'label' | 'word'
  text: string
  color: string
  archiveColor?: string
  archiveName?: string
  weight: number
}
interface GLink extends d3.SimulationLinkDatum<GNode> {
  value: number
}

function onlyTextAnnotations(anns: Annotation[]): Annotation[] {
  return anns.filter(a => a.type !== 'video' && a.type !== 'audio')
}

const AnnotationNetwork = forwardRef<AnnotationNetworkHandle, AnnotationNetworkProps>(function AnnotationNetwork({
  corpusName, archiveId, archiveName, framework, annotations,
  maxWords, selectedLabels, selectedExtraIds, onlyShared,
  onAvailableChange, onLabelInfoChange
}, ref) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const zoomResetRef = useRef<(() => void) | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Internal: archive list for lookup; also reported to parent via callback
  const [available, setAvailable] = useState<ArchiveListItem[]>([])
  const [loadedExtras, setLoadedExtras] = useState<Map<string, LoadedArchive>>(new Map())
  const [loadingExtras, setLoadingExtras] = useState(false)

  // Use refs so effects don't need callbacks in deps
  const onAvailableChangeRef = useRef(onAvailableChange)
  const onLabelInfoChangeRef = useRef(onLabelInfoChange)
  useEffect(() => { onAvailableChangeRef.current = onAvailableChange }, [onAvailableChange])
  useEffect(() => { onLabelInfoChangeRef.current = onLabelInfoChange }, [onLabelInfoChange])

  const currentArchive: LoadedArchive = useMemo(() => ({
    id: archiveId,
    name: archiveName,
    framework,
    corpus: corpusName,
    color: ARCHIVE_PALETTE[0],
    annotations: onlyTextAnnotations(annotations)
  }), [archiveId, archiveName, framework, corpusName, annotations])

  // 拉取可选存档列表并上报给父组件
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const resp = await api.get('/api/annotation/list-all')
        const result = resp.data as { success: boolean; data: { archives: ArchiveListItem[] } }
        if (!cancelled && result.success) {
          const list = (result.data?.archives || []).filter(a => a.id !== archiveId)
          setAvailable(list)
          onAvailableChangeRef.current(list)
        }
      } catch (e) {
        console.error('Failed to list archives for network:', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [archiveId])

  // 加载选中的额外存档
  useEffect(() => {
    let cancelled = false
    const loadSelected = async () => {
      const toLoad = selectedExtraIds.filter(id => !loadedExtras.has(id))
      if (toLoad.length === 0) return
      setLoadingExtras(true)
      const next = new Map(loadedExtras)
      for (const id of toLoad) {
        const meta = available.find(a => a.id === id)
        if (!meta) continue
        try {
          const resp = await api.get(`/api/annotation/load/${meta.corpusName}/${id}`)
          const result = resp.data as { success: boolean; data: any }
          if (result.success && result.data) {
            next.set(id, {
              id,
              name: meta.textName || meta.resourceName || id,
              framework: meta.framework,
              corpus: meta.corpusName,
              color: ARCHIVE_PALETTE[(next.size + 1) % ARCHIVE_PALETTE.length],
              annotations: onlyTextAnnotations(result.data.annotations || [])
            })
          }
        } catch (e) {
          console.error(`Failed to load archive ${id}:`, e)
        }
      }
      if (!cancelled) {
        setLoadedExtras(next)
        setLoadingExtras(false)
      }
    }
    loadSelected()
    return () => { cancelled = true }
  }, [selectedExtraIds, available]) // eslint-disable-line react-hooks/exhaustive-deps

  const includedArchives: LoadedArchive[] = useMemo(() => {
    const extras = selectedExtraIds
      .map(id => loadedExtras.get(id))
      .filter((a): a is LoadedArchive => !!a)
    const all = [currentArchive, ...extras]
    return all.map((a, i) => ({ ...a, color: ARCHIVE_PALETTE[i % ARCHIVE_PALETTE.length] }))
  }, [currentArchive, selectedExtraIds, loadedExtras])

  const crossArchive = includedArchives.length > 1

  const labelInfo = useMemo(() => {
    const map = new Map<string, { color: string; count: number }>()
    for (const arch of includedArchives) {
      for (const ann of arch.annotations) {
        if (!ann.label) continue
        const e = map.get(ann.label)
        if (e) e.count++
        else map.set(ann.label, { color: ann.color || FALLBACK_LABEL_COLOR, count: 1 })
      }
    }
    return Array.from(map.entries())
      .map(([label, info]) => ({ label, ...info }))
      .sort((a, b) => b.count - a.count)
  }, [includedArchives])

  // 上报标签列表给父组件（父组件管理 selectedLabels）
  useEffect(() => {
    onLabelInfoChangeRef.current(labelInfo)
  }, [labelInfo])

  const graph = useMemo<{ nodes: GNode[]; links: GLink[] }>(() => {
    const wordFreq = new Map<string, { total: number; archives: Set<string> }>()
    for (const arch of includedArchives) {
      for (const ann of arch.annotations) {
        if (!ann.label || !selectedLabels.has(ann.label)) continue
        const w = (ann.text || '').trim().toLowerCase()
        if (!w) continue
        const e = wordFreq.get(w)
        if (e) { e.total++; e.archives.add(arch.id) }
        else wordFreq.set(w, { total: 1, archives: new Set([arch.id]) })
      }
    }
    let entries = Array.from(wordFreq.entries())
    if (crossArchive && onlyShared) {
      entries = entries.filter(([, v]) => v.archives.size >= 2)
    }
    entries.sort((a, b) => b[1].total - a[1].total)
    const keptWords = new Set(entries.slice(0, maxWords).map(([w]) => w))

    const labelNodeMap = new Map<string, GNode>()
    const wordNodeMap = new Map<string, GNode>()
    const linkMap = new Map<string, GLink>()

    for (const arch of includedArchives) {
      const labelColor = new Map<string, string>()
      for (const ann of arch.annotations) {
        if (!ann.label || !selectedLabels.has(ann.label)) continue
        const w = (ann.text || '').trim().toLowerCase()
        if (!w || !keptWords.has(w)) continue
        if (!labelColor.has(ann.label)) labelColor.set(ann.label, ann.color || FALLBACK_LABEL_COLOR)

        const labelId = `L|${arch.id}|${ann.label}`
        const wordId = `W|${w}`

        let ln = labelNodeMap.get(labelId)
        if (!ln) {
          ln = {
            id: labelId, kind: 'label', text: ann.label,
            color: ann.color || FALLBACK_LABEL_COLOR,
            archiveColor: arch.color, archiveName: arch.name, weight: 0
          }
          labelNodeMap.set(labelId, ln)
        }
        ln.weight++

        let wn = wordNodeMap.get(wordId)
        if (!wn) {
          wn = { id: wordId, kind: 'word', text: w, color: WORD_COLOR, weight: 0 }
          wordNodeMap.set(wordId, wn)
        }
        wn.weight++

        const lk = `${labelId}__${wordId}`
        const existing = linkMap.get(lk)
        if (existing) existing.value++
        else linkMap.set(lk, { source: labelId, target: wordId, value: 1 })
      }
    }

    return {
      nodes: [...labelNodeMap.values(), ...wordNodeMap.values()],
      links: [...linkMap.values()]
    }
  }, [includedArchives, crossArchive, onlyShared, maxWords, selectedLabels])

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
    const width = containerWidth
    const height = 560
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height)

    if (graph.nodes.length === 0) return

    const nodeCount = graph.nodes.length
    const showWordText = nodeCount <= WORD_LABEL_NODE_LIMIT

    const root = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', (event) => root.attr('transform', event.transform))
    svg.call(zoom)
    zoomResetRef.current = () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity)

    const maxW = d3.max(graph.nodes, n => n.weight) || 1
    const rScale = d3.scaleSqrt().domain([1, maxW]).range([6, 26])
    const radius = (n: GNode) => (n.kind === 'label' ? rScale(n.weight) + 4 : rScale(n.weight))

    const nodes = graph.nodes.map(n => ({ ...n }))
    const links = graph.links.map(l => ({ ...l }))

    const sim = d3.forceSimulation<GNode>(nodes)
      .force('link', d3.forceLink<GNode, GLink>(links).id(d => d.id)
        .distance(d => 200 + Math.min(80, d.value * 8)).strength(0.06))
      .force('charge', d3.forceManyBody().strength(-900))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .force('collide', d3.forceCollide<GNode>().radius(n => radius(n) + 24).iterations(2))
      .velocityDecay(0.65)
      .alphaDecay(0.08)

    sim.stop()
    const preTicks = Math.min(450, 150 + nodeCount * 3)
    for (let i = 0; i < preTicks; i++) sim.tick()

    const link = root.append('g')
      .attr('stroke', isDarkMode ? '#555' : '#cbd2dc')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', d => Math.min(4, 1 + Math.sqrt(d.value)))

    const node = root.append('g')
      .selectAll<SVGGElement, GNode>('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'grab')
      .call(d3.drag<SVGGElement, GNode>()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.08).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0)
          d.fx = null; d.fy = null
        }))

    node.append('circle')
      .attr('r', d => radius(d))
      .attr('fill', d => d.color)
      .attr('stroke', d => d.kind === 'label' ? (d.archiveColor || '#fff') : (isDarkMode ? '#2a2a2a' : '#fff'))
      .attr('stroke-width', d => d.kind === 'label' ? 3 : 1.2)

    const textSel = node.filter(d => d.kind === 'label' || showWordText)
    textSel.append('rect')
      .attr('rx', 2).attr('ry', 2)
      .attr('fill', isDarkMode ? 'rgba(20,20,20,0.72)' : 'rgba(255,255,255,0.78)')
      .attr('x', d => {
        const len = Math.min(d.text.length, 16)
        const fs = d.kind === 'label' ? 12 : 10
        return -(len * fs * 0.3)
      })
      .attr('y', d => -radius(d) - 17)
      .attr('width', d => {
        const len = Math.min(d.text.length, 16)
        const fs = d.kind === 'label' ? 12 : 10
        return len * fs * 0.6
      })
      .attr('height', d => d.kind === 'label' ? 14 : 12)
      .style('pointer-events', 'none')

    textSel.append('text')
      .text(d => d.text.length > 16 ? d.text.slice(0, 16) + '…' : d.text)
      .attr('x', 0)
      .attr('y', d => -radius(d) - 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.kind === 'label' ? 12 : 10)
      .attr('font-weight', d => d.kind === 'label' ? 700 : 400)
      .attr('fill', isDarkMode ? '#e0e0e0' : '#222')
      .style('pointer-events', 'none')

    node.on('mouseover', function (event, d) {
      d3.select(this).select('circle').attr('stroke-width', d.kind === 'label' ? 5 : 2.5)
      if (tooltipRef.current) {
        const kindLabel = d.kind === 'label' ? t('annotation.networkLabelNode', '标签') : t('annotation.networkWordNode', '标注词')
        const src = d.kind === 'label' && d.archiveName ? `<div style="color:${d.archiveColor}">${d.archiveName}</div>` : ''
        tooltipRef.current.innerHTML = `
          <div style="font-weight:600;color:${d.color}">${d.text}</div>
          <div>${kindLabel} · ${d.weight}</div>${src}`
        tooltipRef.current.style.display = 'block'
        tooltipRef.current.style.left = `${event.pageX + 14}px`
        tooltipRef.current.style.top = `${event.pageY + 14}px`
      }
    }).on('mousemove', function (event) {
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${event.pageX + 14}px`
        tooltipRef.current.style.top = `${event.pageY + 14}px`
      }
    }).on('mouseout', function (_, d) {
      d3.select(this).select('circle').attr('stroke-width', d.kind === 'label' ? 3 : 1.2)
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    })

    let lastFrameTime = 0
    const ticked = () => {
      const now = performance.now()
      if (now - lastFrameTime < 30) return
      lastFrameTime = now
      link
        .attr('x1', d => (d.source as GNode).x!)
        .attr('y1', d => (d.source as GNode).y!)
        .attr('x2', d => (d.target as GNode).x!)
        .attr('y2', d => (d.target as GNode).y!)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    }
    link
      .attr('x1', d => (d.source as GNode).x!)
      .attr('y1', d => (d.source as GNode).y!)
      .attr('x2', d => (d.target as GNode).x!)
      .attr('y2', d => (d.target as GNode).y!)
    node.attr('transform', d => `translate(${d.x},${d.y})`)
    sim.on('tick', ticked)
    sim.alpha(0.06).restart()

    return () => { sim.stop() }
  }, [graph, containerWidth, isDarkMode, t])

  const exportSvg = useCallback((asPng: boolean) => {
    if (!svgRef.current) return
    const src = svgRef.current
    const clone = src.cloneNode(true) as SVGSVGElement
    const vb = (src.getAttribute('viewBox') || `0 0 ${src.clientWidth} ${src.clientHeight}`).split(' ').map(Number)
    const w = vb[2], h = vb[3]
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', String(w)); bg.setAttribute('height', String(h)); bg.setAttribute('fill', '#ffffff')
    clone.insertBefore(bg, clone.firstChild)
    const data = new XMLSerializer().serializeToString(clone)
    const svgUrl = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }))
    if (!asPng) {
      const a = document.createElement('a'); a.href = svgUrl; a.download = 'annotation_network.svg'; a.click()
      URL.revokeObjectURL(svgUrl); return
    }
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = w * scale; canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(svgUrl); return }
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0)
      canvas.toBlob(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = 'annotation_network.png'; a.click()
          URL.revokeObjectURL(url)
        }
        URL.revokeObjectURL(svgUrl)
      }, 'image/png')
    }
    img.onerror = () => URL.revokeObjectURL(svgUrl)
    img.src = svgUrl
  }, [])

  useImperativeHandle(ref, () => ({
    exportSvg: () => exportSvg(false),
    exportPng: () => exportSvg(true),
    resetZoom: () => zoomResetRef.current?.()
  }), [exportSvg])

  if (currentArchive.annotations.length === 0) {
    return <Alert severity="info">{t('annotation.networkNoData', '当前存档没有可用于构建网络图的文本标注')}</Alert>
  }

  return (
    <Box>
      {/* tooltip */}
      <div ref={tooltipRef} style={{
        position: 'fixed', display: 'none', padding: '8px 12px',
        background: isDarkMode ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.98)',
        border: `1px solid ${isDarkMode ? '#444' : '#e0e0e0'}`, borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)', fontSize: 12, lineHeight: 1.5,
        pointerEvents: 'none', zIndex: 10000, color: isDarkMode ? '#eee' : '#333'
      }} />

      {/* 图例：包含的存档（描边环色）+ 加载指示器 */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }} alignItems="center">
        {includedArchives.map(arch => (
          <Stack key={arch.id} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', border: `3px solid ${arch.color}`, boxSizing: 'border-box' }} />
            <Typography variant="caption" color="text.secondary">
              {arch.name}{arch.id === archiveId ? ` (${t('annotation.networkCurrent', '当前')})` : ''} · {arch.framework}
            </Typography>
          </Stack>
        ))}
        {loadingExtras && <CircularProgress size={14} sx={{ ml: 0.5 }} />}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {graph.nodes.filter(n => n.kind === 'label').length} {t('annotation.networkLabelNode', '标签')} ·
          {' '}{graph.nodes.filter(n => n.kind === 'word').length} {t('annotation.networkWordNode', '标注词')} ·
          {' '}{graph.links.length} {t('annotation.networkEdges', '连接')}
        </Typography>
      </Stack>

      {/* 画布 */}
      <Box ref={containerRef} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden', bgcolor: isDarkMode ? '#181818' : '#fafbfc' }}>
        {graph.nodes.length === 0 ? (
          <Box sx={{ height: 560, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {crossArchive && onlyShared
                ? t('annotation.networkNoShared', '所选存档之间没有共享的标注词，可关闭「仅显示共享词」')
                : t('annotation.noVisualizationData', '无数据可视化')}
            </Typography>
          </Box>
        ) : (
          <svg ref={svgRef} style={{ width: '100%', height: 560, display: 'block' }} />
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        {t('annotation.networkHint', '提示：滚轮缩放、拖拽节点/画布；标签节点描边色对应来源存档，共享词节点连接不同存档的标注结果。')}
      </Typography>
    </Box>
  )
})

export default AnnotationNetwork

/**
 * TranscriptAnnotator Component
 * 转录文本标注组件 - 标签块方式显示（与纯文本标注一致）
 * 
 * Features:
 * - Each sentence/segment has a color bar on the left
 * - Default: gray (#e0e0e0)
 * - Has annotation: annotation color
 * - Currently selected: green (#4CAF50)
 * - Click segment to select and highlight
 * - Text selection for annotation
 * - Label blocks below text (not highlighting original text)
 * - Larger labels on top layer (closer to text)
 * - Cross-overlap detection with warning
 */

import { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Box, Typography, Paper, Alert, Chip, Stack, IconButton, Tooltip, CircularProgress, useTheme } from '@mui/material'
import ImageIcon from '@mui/icons-material/Image'
import CodeIcon from '@mui/icons-material/Code'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import html2canvas from 'html2canvas'
import type { Annotation, SelectedLabel, TranscriptSegment, YoloTrack, ClipAnnotationData } from '../../types'
import SyntaxVisualization from './SyntaxVisualization'
import type { SentenceInfo } from './SyntaxVisualization'

// Export ref type
export interface TranscriptAnnotatorRef {
  getContainer: () => HTMLDivElement | null
  exportToPng: () => Promise<void>
  exportToSvg: () => Promise<void>
}

// 搜索高亮接口
interface SearchHighlight {
  start: number
  end: number
}

interface TranscriptAnnotatorProps {
  transcriptSegments: TranscriptSegment[]
  annotations: Annotation[]
  selectedLabel: SelectedLabel | null
  highlightedSegmentId: string | null
  onAnnotationAdd: (annotation: Omit<Annotation, 'id'>) => void
  onAnnotationRemove: (id: string) => void
  onSegmentClick: (segmentId: string) => void
  yoloTracks?: YoloTrack[]  // Optional YOLO tracks for video
  language?: string  // Language for syntax analysis
  clipAnnotation?: ClipAnnotationData | null  // Optional CLIP annotation data
  searchHighlights?: SearchHighlight[]  // 搜索高亮
}

// Format time in MM:SS format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Get YOLO labels for a time range
function getYoloLabelsForTimeRange(
  start: number,
  end: number,
  yoloTracks: YoloTrack[]
): Array<{ label: string; color: string }> {
  const labelSet = new Map<string, string>()
  
  yoloTracks.forEach(track => {
    // Check if track overlaps with time range
    if (track.startTime <= end && track.endTime >= start) {
      if (!labelSet.has(track.className)) {
        labelSet.set(track.className, track.color || '#4CAF50')
      }
    }
  })
  
  return Array.from(labelSet.entries()).map(([label, color]) => ({ label, color }))
}

// Get CLIP labels for a time range
function getClipLabelsForTimeRange(
  start: number,
  end: number,
  clipAnnotation: ClipAnnotationData | null | undefined
): Array<{ label: string; confidence: number }> {
  if (!clipAnnotation?.frame_results?.length) return []
  
  const labelConfidences = new Map<string, number[]>()
  
  clipAnnotation.frame_results.forEach(frame => {
    // Check if frame timestamp is within time range
    if (frame.timestamp_seconds >= start && frame.timestamp_seconds <= end) {
      const label = frame.top_label
      if (!labelConfidences.has(label)) {
        labelConfidences.set(label, [])
      }
      labelConfidences.get(label)!.push(frame.confidence)
    }
  })
  
  // Return labels with average confidence
  return Array.from(labelConfidences.entries())
    .map(([label, confidences]) => ({
      label,
      confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length
    }))
    .sort((a, b) => b.confidence - a.confidence)
}

/**
 * Check if a segment has any annotations - returns first annotation color
 */
function getSegmentAnnotationColor(
  segmentId: string,
  segmentAnnotations: Annotation[]
): string | null {
  if (segmentAnnotations.length > 0) {
    return segmentAnnotations[0].color
  }
  return null
}

/**
 * Calculate annotation layers - larger annotations in layer 0 (closest to text)
 */
function calculateAnnotationLayers(annotations: Annotation[]): Map<string, number> {
  // Sort by length (descending) then by start position
  const sorted = [...annotations].sort((a, b) => {
    const aLen = a.endPosition - a.startPosition
    const bLen = b.endPosition - b.startPosition
    if (aLen !== bLen) return bLen - aLen
    return a.startPosition - b.startPosition
  })

  const layers: Array<Array<{ start: number; end: number }>> = []
  const annotationLayers = new Map<string, number>()

  for (const ann of sorted) {
    const annStart = ann.startPosition
    const annEnd = ann.endPosition

    let layerIdx = 0
    while (true) {
      if (!layers[layerIdx]) {
        layers[layerIdx] = []
      }

      let hasConflict = false
      for (const interval of layers[layerIdx]) {
        if (!(annEnd <= interval.start || annStart >= interval.end)) {
          hasConflict = true
          break
        }
      }

      if (!hasConflict) {
        layers[layerIdx].push({ start: annStart, end: annEnd })
        annotationLayers.set(ann.id, layerIdx)
        break
      }
      layerIdx++
    }
  }

  return annotationLayers
}

/**
 * Check for partial (cross) overlap between annotations
 */
function checkPartialOverlap(
  newStart: number,
  newEnd: number,
  existingStart: number,
  existingEnd: number
): boolean {
  // No overlap
  if (newEnd <= existingStart || newStart >= existingEnd) {
    return false
  }
  // Full containment (allowed)
  if ((newStart >= existingStart && newEnd <= existingEnd) ||
      (existingStart >= newStart && existingEnd <= newEnd)) {
    return false
  }
  // Partial/cross overlap (not allowed)
  return true
}

const TranscriptAnnotator = forwardRef<TranscriptAnnotatorRef, TranscriptAnnotatorProps>(({
  transcriptSegments,
  annotations,
  selectedLabel,
  highlightedSegmentId,
  onAnnotationAdd,
  onAnnotationRemove,
  onSegmentClick,
  yoloTracks = [],
  clipAnnotation,
  language = 'english',
  searchHighlights = []
}, ref) => {
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [blockPositions, setBlockPositions] = useState<Map<string, Map<string, { left: number; width: number }>>>(new Map())
  const [exporting, setExporting] = useState<'png' | 'svg' | null>(null)
  
  // Syntax visualization state
  const [showSyntax, setShowSyntax] = useState(false)
  const [syntaxSentenceIndex, setSyntaxSentenceIndex] = useState(0)

  // PNG Export
  const handleExportPng = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    setExporting('png')
    try {
      const originalStyle = {
        maxHeight: container.style.maxHeight,
        overflow: container.style.overflow,
        height: container.style.height,
        width: container.style.width,
        padding: container.style.padding
      }
      
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      container.style.height = 'auto'
      container.style.width = 'fit-content'
      container.style.minWidth = '100%'

      await new Promise(resolve => setTimeout(resolve, 150))

      const padding = 20
      const contentWidth = Math.max(container.scrollWidth, container.offsetWidth)
      const contentHeight = Math.max(container.scrollHeight, container.offsetHeight)

      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: contentWidth + padding * 2,
        height: contentHeight + padding * 2,
        x: -padding,
        y: -padding,
        windowWidth: contentWidth + padding * 2 + 100,
        windowHeight: contentHeight + padding * 2 + 100,
        scrollX: 0,
        scrollY: 0
      })

      container.style.maxHeight = originalStyle.maxHeight
      container.style.overflow = originalStyle.overflow
      container.style.height = originalStyle.height
      container.style.width = originalStyle.width
      container.style.padding = originalStyle.padding

      const link = document.createElement('a')
      link.download = `transcript_annotation_${Date.now()}.png`
      link.href = canvas.toDataURL('image/png', 1.0)
      link.click()
    } catch (error) {
      console.error('PNG export error:', error)
      alert('PNG导出失败: ' + (error as Error).message)
    } finally {
      setExporting(null)
    }
  }, [])

  // SVG Export
  const handleExportSvg = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    setExporting('svg')
    try {
      const originalStyle = {
        maxHeight: container.style.maxHeight,
        overflow: container.style.overflow,
        height: container.style.height,
        width: container.style.width
      }
      
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      container.style.height = 'auto'
      container.style.width = 'fit-content'
      container.style.minWidth = '100%'

      await new Promise(resolve => setTimeout(resolve, 150))

      const padding = 20
      const contentWidth = Math.max(container.scrollWidth, container.offsetWidth)
      const contentHeight = Math.max(container.scrollHeight, container.offsetHeight)
      const fullWidth = contentWidth + padding * 2
      const fullHeight = contentHeight + padding * 2

      const clone = container.cloneNode(true) as HTMLElement
      
      const inlineStyles = (source: Element, target: Element) => {
        const computed = window.getComputedStyle(source)
        for (let i = 0; i < computed.length; i++) {
          const prop = computed[i]
          ;(target as HTMLElement).style.setProperty(prop, computed.getPropertyValue(prop))
        }
        const srcChildren = source.children
        const tgtChildren = target.children
        for (let i = 0; i < srcChildren.length; i++) {
          if (tgtChildren[i]) {
            inlineStyles(srcChildren[i], tgtChildren[i])
          }
        }
      }
      inlineStyles(container, clone)

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', String(fullWidth))
      svg.setAttribute('height', String(fullHeight))
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svg.setAttribute('viewBox', `0 0 ${fullWidth} ${fullHeight}`)

      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bgRect.setAttribute('width', '100%')
      bgRect.setAttribute('height', '100%')
      bgRect.setAttribute('fill', '#ffffff')
      svg.appendChild(bgRect)

      const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject')
      foreignObject.setAttribute('width', String(contentWidth))
      foreignObject.setAttribute('height', String(contentHeight))
      foreignObject.setAttribute('x', String(padding))
      foreignObject.setAttribute('y', String(padding))

      clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
      foreignObject.appendChild(clone)
      svg.appendChild(foreignObject)

      container.style.maxHeight = originalStyle.maxHeight
      container.style.overflow = originalStyle.overflow
      container.style.height = originalStyle.height
      container.style.width = originalStyle.width

      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svg)
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.download = `transcript_annotation_${Date.now()}.svg`
      link.href = url
      link.click()

      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('SVG export error:', error)
      alert('SVG导出失败: ' + (error as Error).message)
    } finally {
      setExporting(null)
    }
  }, [])

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getContainer: () => containerRef.current,
    exportToPng: handleExportPng,
    exportToSvg: handleExportSvg
  }), [handleExportPng, handleExportSvg])

  // Get current segment (either highlighted from timeline or user selected)
  const currentSegmentId = highlightedSegmentId || selectedSegmentId

  // Group annotations by segment
  const annotationsBySegment = useMemo(() => {
    const result = new Map<string, Annotation[]>()
    
    transcriptSegments.forEach(segment => {
      const segId = String(segment.id)
      // Build a cumulative offset for each segment
      let offset = 0
      for (let i = 0; i < transcriptSegments.length; i++) {
        if (String(transcriptSegments[i].id) === segId) break
        offset += transcriptSegments[i].text.length
      }
      
      const segAnnotations = annotations.filter(ann => {
        // Check if annotation falls within this segment's text range
        const segStart = offset
        const segEnd = offset + segment.text.length
        return ann.startPosition >= segStart && ann.endPosition <= segEnd
      })
      result.set(segId, segAnnotations)
    })
    
    return result
  }, [transcriptSegments, annotations])

  // Calculate layers for each segment
  const layersBySegment = useMemo(() => {
    const result = new Map<string, Map<string, number>>()
    
    annotationsBySegment.forEach((segAnns, segId) => {
      result.set(segId, calculateAnnotationLayers(segAnns))
    })
    
    return result
  }, [annotationsBySegment])

  // Get max layers for each segment
  const maxLayersBySegment = useMemo(() => {
    const result = new Map<string, number>()
    
    layersBySegment.forEach((layers, segId) => {
      const maxLayer = layers.size > 0 ? Math.max(...Array.from(layers.values())) : -1
      result.set(segId, maxLayer + 1)
    })
    
    return result
  }, [layersBySegment])

  // Measure label block positions after render
  useEffect(() => {
    if (!containerRef.current || annotations.length === 0) {
      setBlockPositions(new Map())
      return
    }

    const measurePositions = () => {
      const positions = new Map<string, Map<string, { left: number; width: number }>>()
      
      transcriptSegments.forEach((segment) => {
        const segId = String(segment.id)
        const segTextEl = containerRef.current?.querySelector(`[data-segment-id="${segId}"] .segment-text`)
        if (!segTextEl) return
        
        const textNode = segTextEl.firstChild
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return
        
        const segAnnotations = annotationsBySegment.get(segId) || []
        const segPositions = new Map<string, { left: number; width: number }>()
        const range = document.createRange()
        
        // Calculate offset for this segment
        let segOffset = 0
        for (const seg of transcriptSegments) {
          if (String(seg.id) === segId) break
          segOffset += seg.text.length
        }
        
        for (const ann of segAnnotations) {
          try {
            const relStart = ann.startPosition - segOffset
            const relEnd = ann.endPosition - segOffset
            
            range.setStart(textNode, Math.min(Math.max(relStart, 0), segment.text.length))
            range.setEnd(textNode, Math.min(Math.max(relEnd, 0), segment.text.length))
            const rect = range.getBoundingClientRect()
            const containerRect = segTextEl.getBoundingClientRect()
            
            segPositions.set(ann.id, {
              left: rect.left - containerRect.left,
              width: rect.width
            })
          } catch (e) {
            const charWidth = 8
            const relStart = ann.startPosition - segOffset
            segPositions.set(ann.id, {
              left: relStart * charWidth,
              width: (ann.endPosition - ann.startPosition) * charWidth
            })
          }
        }
        
        positions.set(segId, segPositions)
      })
      
      setBlockPositions(positions)
    }

    requestAnimationFrame(measurePositions)
    
    window.addEventListener('resize', measurePositions)
    return () => window.removeEventListener('resize', measurePositions)
  }, [annotations, transcriptSegments, annotationsBySegment])

  // Handle segment click
  const handleSegmentClick = useCallback((segmentId: string | number) => {
    const segIdStr = String(segmentId)
    setSelectedSegmentId(segIdStr)
    onSegmentClick(segIdStr)
  }, [onSegmentClick])

  // Handle text selection for annotation
  const handleTextSelection = useCallback((segmentId: string, segmentOffset: number) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const selectedText = selection.toString().trim()
    if (!selectedText) return

    if (!selectedLabel) {
      setWarningMessage('请先在左侧选择标注标签')
      setTimeout(() => setWarningMessage(null), 3000)
      return
    }

    // Get selection position within the segment
    const range = selection.getRangeAt(0)
    const segTextEl = containerRef.current?.querySelector(`[data-segment-id="${segmentId}"] .segment-text`)
    
    if (!segTextEl || !segTextEl.contains(range.commonAncestorContainer)) {
      return
    }

    const preCaretRange = document.createRange()
    preCaretRange.selectNodeContents(segTextEl)
    preCaretRange.setEnd(range.startContainer, range.startOffset)
    
    const relativeStart = preCaretRange.toString().length
    const start = segmentOffset + relativeStart
    const end = start + selectedText.length

    // Check for cross-overlap with existing annotations
    for (const ann of annotations) {
      if (checkPartialOverlap(start, end, ann.startPosition, ann.endPosition)) {
        setWarningMessage('标注范围与已有标注交叉，请重新选择（允许完全包含或不重叠）')
        setTimeout(() => setWarningMessage(null), 3000)
        selection.removeAllRanges()
        return
      }
    }

    // Create annotation
    const annotation: Omit<Annotation, 'id'> = {
      text: selectedText,
      startPosition: start,
      endPosition: end,
      label: selectedLabel.node.name,
      labelPath: selectedLabel.path,
      color: selectedLabel.color,
      type: 'text'
    }

    onAnnotationAdd(annotation)
    selection.removeAllRanges()
  }, [selectedLabel, onAnnotationAdd, annotations])

  // Handle annotation block click (delete)
  const handleBlockClick = useCallback((ann: Annotation, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`确定删除标注 "${ann.label}: ${ann.text}"？`)) {
      onAnnotationRemove(ann.id)
    }
  }, [onAnnotationRemove])
  
  // 渲染带搜索高亮的文本
  const renderHighlightedText = useCallback((segText: string, segOffset: number) => {
    if (searchHighlights.length === 0) {
      return segText
    }
    
    // 筛选在当前段落范围内的高亮
    const segEnd = segOffset + segText.length
    const relevantHighlights = searchHighlights.filter(
      h => h.start >= segOffset && h.end <= segEnd
    ).map(h => ({
      start: h.start - segOffset,
      end: h.end - segOffset
    })).sort((a, b) => a.start - b.start)
    
    if (relevantHighlights.length === 0) {
      return segText
    }
    
    // 分割文本并添加高亮
    const parts: React.ReactNode[] = []
    let lastEnd = 0
    
    for (let i = 0; i < relevantHighlights.length; i++) {
      const { start, end } = relevantHighlights[i]
      
      // 添加高亮前的普通文本
      if (start > lastEnd) {
        parts.push(segText.substring(lastEnd, start))
      }
      
      // 添加高亮文本
      parts.push(
        <Box
          key={`highlight-${segOffset}-${i}`}
          component="span"
          sx={{
            backgroundColor: '#ffeb3b',
            color: '#000',
            borderRadius: '2px',
            px: '1px'
          }}
        >
          {segText.substring(start, end)}
        </Box>
      )
      
      lastEnd = end
    }
    
    // 添加最后的普通文本
    if (lastEnd < segText.length) {
      parts.push(segText.substring(lastEnd))
    }
    
    return parts
  }, [searchHighlights])

  if (transcriptSegments.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
        <Typography>暂无转录文本</Typography>
      </Paper>
    )
  }

  // Calculate cumulative offsets for segments
  const segmentOffsets = useMemo(() => {
    const offsets = new Map<string, number>()
    let offset = 0
    transcriptSegments.forEach(segment => {
      offsets.set(String(segment.id), offset)
      offset += segment.text.length
    })
    return offsets
  }, [transcriptSegments])

  return (
    <Box>
      {warningMessage && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {warningMessage}
        </Alert>
      )}

      {/* Toolbar with Instructions and Export Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {selectedLabel 
            ? `选中文本以使用 "${selectedLabel.node.name}" 标注。点击标签块可删除。`
            : '请先从框架树选择一个标签'
          }
        </Typography>
        
        {/* Export Buttons */}
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="导出为PNG">
            <span>
              <IconButton 
                size="small" 
                onClick={handleExportPng}
                disabled={exporting !== null}
                sx={{ 
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'primary.light', color: 'white' }
                }}
              >
                {exporting === 'png' ? <CircularProgress size={16} /> : <ImageIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="导出为SVG">
            <span>
              <IconButton 
                size="small" 
                onClick={handleExportSvg}
                disabled={exporting !== null}
                sx={{ 
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'secondary.light', color: 'white' }
                }}
              >
                {exporting === 'svg' ? <CircularProgress size={16} /> : <CodeIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="查看句法结构">
            <span>
              <IconButton 
                size="small" 
                onClick={() => setShowSyntax(!showSyntax)}
                disabled={transcriptSegments.length === 0}
                sx={{ 
                  bgcolor: showSyntax ? 'primary.main' : 'action.hover',
                  color: showSyntax ? 'white' : 'inherit',
                  '&:hover': { bgcolor: showSyntax ? 'primary.dark' : 'primary.light', color: 'white' }
                }}
              >
                <AccountTreeIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      <Paper 
        ref={containerRef}
        sx={{ 
          p: 1.5, 
          bgcolor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafafa',
          borderRadius: 1, 
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : '#e0e0e0'}`,
          maxHeight: 400,
          overflow: 'auto'  // 支持横向和纵向滚动
        }}
      >
        {transcriptSegments.map((segment) => {
          const segId = String(segment.id)
          const isHighlighted = segId === currentSegmentId
          const segAnnotations = annotationsBySegment.get(segId) || []
          const annotationColor = getSegmentAnnotationColor(segId, segAnnotations)
          const layers = layersBySegment.get(segId) || new Map()
          const maxLayers = maxLayersBySegment.get(segId) || 0
          const segPositions = blockPositions.get(segId) || new Map()
          const segOffset = segmentOffsets.get(segId) || 0
          
          // Determine color bar color
          let barColor = '#bdbdbd' // Default gray (same as TextAnnotator)
          if (isHighlighted) {
            barColor = '#4CAF50' // Green when selected
          } else if (annotationColor) {
            barColor = annotationColor // Annotation color
          }

          // Calculate total height
          const totalHeight = 28 + (maxLayers * 26)

          // Get YOLO labels for this segment's time range
          const segmentYoloLabels = getYoloLabelsForTimeRange(segment.start, segment.end, yoloTracks)
          
          // Get CLIP labels for this segment's time range
          const segmentClipLabels = getClipLabelsForTimeRange(segment.start, segment.end, clipAnnotation)

          return (
            <Box
              key={segment.id}
              data-segment-id={segId}
              onClick={() => handleSegmentClick(segment.id)}
              sx={{
                display: 'flex',
                alignItems: 'stretch',
                mb: 0.5,
                minHeight: 28,
                cursor: 'pointer',
                width: 'fit-content',  // 宽度自适应内容
                minWidth: '100%',      // 最小宽度100%
                '&:hover': {
                  bgcolor: 'rgba(76, 175, 80, 0.1)'
                }
              }}
            >
              {/* Color Bar */}
              <Box
                sx={{
                  width: 4,
                  minWidth: 4,
                  minHeight: totalHeight,
                  bgcolor: barColor,
                  borderRadius: 0.5,
                  mr: 1,
                  flexShrink: 0,
                  transition: 'background-color 0.2s'
                }}
              />

              {/* Metadata Column - Timestamp + YOLO labels (not selectable) */}
              <Box
                sx={{
                  width: 120,
                  minWidth: 120,
                  flexShrink: 0,
                  pr: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  pt: 0.5,
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
              >
                {/* Timestamp */}
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    color: 'text.secondary',
                    lineHeight: 1.4
                  }}
                >
                  {formatTime(segment.start)} - {formatTime(segment.end)}
                </Typography>
                
                {/* YOLO Labels */}
                {segmentYoloLabels.length > 0 && (
                  <Stack direction="row" spacing={0.3} flexWrap="wrap" sx={{ mt: 0.3 }}>
                    {segmentYoloLabels.map(({ label, color }) => (
                      <Chip
                        key={label}
                        label={label}
                        size="small"
                        sx={{
                          height: 16,
                          fontSize: '0.6rem',
                          bgcolor: color,
                          color: 'white',
                          '& .MuiChip-label': { px: 0.5, py: 0 }
                        }}
                      />
                    ))}
                  </Stack>
                )}
                
                {/* CLIP Labels */}
                {segmentClipLabels.length > 0 && (
                  <Stack direction="row" spacing={0.3} flexWrap="wrap" sx={{ mt: 0.3 }}>
                    {segmentClipLabels.map(({ label, confidence }) => (
                      <Tooltip 
                        key={label} 
                        title={`CLIP: ${(confidence * 100).toFixed(1)}%`}
                        arrow
                        placement="top"
                      >
                        <Chip
                          label={label}
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: '0.6rem',
                            bgcolor: '#6366f1',  // 紫色
                            color: 'white',
                            '& .MuiChip-label': { px: 0.5, py: 0 }
                          }}
                        />
                      </Tooltip>
                    ))}
                  </Stack>
                )}
              </Box>

              {/* Segment Content */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  flexShrink: 0  // 不收缩，保持内容宽度
                }}
              >
                {/* Segment Text - plain text, no highlighting, no wrap */}
                <Box
                  className="segment-text"
                  onMouseUp={() => handleTextSelection(segId, segOffset)}
                  sx={{
                    whiteSpace: 'nowrap',  // 不换行，通过滚动查看
                    py: 0.5,
                    lineHeight: 1.6,
                    position: 'relative',
                    fontSize: '14px',
                    fontFamily: '"Segoe UI", "Microsoft YaHei", Arial, sans-serif',
                    userSelect: 'text',
                    cursor: selectedLabel ? 'text' : 'default',
                    bgcolor: isHighlighted ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
                    borderRadius: 0.5,
                    transition: 'background-color 0.2s',
                    '&::selection': {
                      backgroundColor: selectedLabel ? selectedLabel.color : '#bbdefb',
                      color: 'white'
                    }
                  }}
                >
                  {renderHighlightedText(segment.text, segOffset)}
                </Box>

                {/* Annotation Layers */}
                {maxLayers > 0 && (
                  <Box
                    className="annotation-layers"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      minHeight: 0
                    }}
                  >
                    {Array.from({ length: maxLayers }).map((_, layerIdx) => {
                      const layerAnnotations = segAnnotations.filter(
                        ann => layers.get(ann.id) === layerIdx
                      )
                      
                      if (layerAnnotations.length === 0) return null

                      return (
                        <Box
                          key={layerIdx}
                          sx={{
                            position: 'relative',
                            height: 24,
                            mt: '2px'
                          }}
                        >
                          {layerAnnotations.map(ann => {
                            const pos = segPositions.get(ann.id)
                            
                            return (
                              <Box
                                key={ann.id}
                                onClick={(e) => handleBlockClick(ann, e)}
                                sx={{
                                  position: 'absolute',
                                  height: 22,
                                  borderRadius: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '11px',
                                  color: 'white',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  px: '2px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                  bgcolor: ann.color || '#2196F3',
                                  opacity: pos ? 1 : 0,
                                  left: pos?.left ?? 0,
                                  width: pos?.width ?? 'auto',
                                  transition: 'transform 0.1s, box-shadow 0.1s, opacity 0.2s',
                                  '&:hover': {
                                    transform: 'translateY(-1px)',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                                    zIndex: 10
                                  }
                                }}
                                title={`${ann.label}: ${ann.text}`}
                              >
                                {ann.label}
                              </Box>
                            )
                          })}
                        </Box>
                      )
                    })}
                  </Box>
                )}
              </Box>
            </Box>
          )
        })}
      </Paper>

      {/* Statistics */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {annotations.length} 条标注 | {transcriptSegments.length} 个段落 | 点击句子选中 | 选择文本添加标注 | 点击标签块删除
      </Typography>

      {/* Syntax Visualization Dialog */}
      {transcriptSegments.length > 0 && (
        <SyntaxVisualization
          open={showSyntax}
          onClose={() => setShowSyntax(false)}
          sentences={transcriptSegments.map((seg, i) => ({
            id: i,
            text: seg.text,
            start: 0,
            end: seg.text.length
          } as SentenceInfo))}
          initialSentenceIndex={syntaxSentenceIndex}
          language={language}
        />
      )}
    </Box>
  )
})

TranscriptAnnotator.displayName = 'TranscriptAnnotator'

export default TranscriptAnnotator

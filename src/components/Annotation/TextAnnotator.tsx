/**
 * TextAnnotator Component
 * 文本划词标注组件 - 分句显示，标签块精确对齐
 *
 * Performance: SentenceRow is React.memo'd with content-aware comparison so
 * that adding an annotation only re-renders the affected sentence and its
 * annotation blocks, not the whole list.
 */

import React, { useCallback, useRef, useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Box, Typography, Paper, Alert, Tooltip, useTheme } from '@mui/material'
import LinkIcon from '@mui/icons-material/Link'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import { useTranslation } from 'react-i18next'
import type { Annotation, AnnotationRelation, SelectedLabel } from '../../types'
import RelationArrows from './RelationArrows'

// SpaCy 句子接口
interface SpacySentence {
  text: string
  start: number
  end: number
}

// 搜索高亮接口
interface SearchHighlight {
  start: number
  end: number
}

interface TextAnnotatorProps {
  text: string
  annotations: Annotation[]
  selectedLabel: SelectedLabel | null
  onAnnotationAdd: (annotation: Omit<Annotation, 'id'>) => void
  onAnnotationRemove: (id: string) => void
  readOnly?: boolean
  sentences?: SpacySentence[]
  // 搜索高亮相关
  searchHighlights?: SearchHighlight[]
  // 选中标注 ID（来自表格行点击，用于定位高亮）
  selectedAnnotationId?: string | null
  /** Called when annotation block is clicked in normal mode — navigates to table row */
  onAnnotationClick?: (id: string) => void
  // ── 标注关联 ──────────────────────────────────────────────────────────────
  relations?: AnnotationRelation[]
  onRelationAdd?: (relation: AnnotationRelation) => void
  onRelationRemove?: (relationId: string) => void
}

// 导出 ref 类型
export interface TextAnnotatorRef {
  getContainer: () => HTMLDivElement | null
  /** 滚动到指定标注并在视图内居中 */
  scrollToAnnotation: (id: string) => void
}

// 常见缩写列表（与后端保持一致）
const COMMON_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'inc', 'ltd',
  'corp', 'co', 'no', 'vol', 'rev', 'gen', 'col', 'lt', 'st', 'ave', 'blvd',
  'dept', 'univ', 'assn', 'bros', 'ph', 'ed', 'est', 'approx', 'govt',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
])

function findProtectedSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g
  let match
  while ((match = emailPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  const urlPattern = /https?:\/\/\S+|www\.\S+/g
  while ((match = urlPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  const decimalPattern = /\d+\.\d+/g
  while ((match = decimalPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  const nameAbbrevPattern = /\b[A-Z]\.\s*(?=[A-Z]|\s|$)/g
  while ((match = nameAbbrevPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  const orderedListPattern = /(?:^|\n)\s*\d+\.\s/g
  while ((match = orderedListPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  return spans
}

function isPositionProtected(pos: number, protectedSpans: Array<[number, number]>): boolean {
  for (const [start, end] of protectedSpans) {
    if (start <= pos && pos < end) return true
  }
  return false
}

function isAbbreviationPeriod(text: string, periodPos: number): boolean {
  if (periodPos <= 0) return false
  let wordStart = periodPos - 1
  while (wordStart > 0 && /[a-zA-Z]/.test(text[wordStart - 1])) wordStart--
  const wordBefore = text.substring(wordStart, periodPos).toLowerCase()
  if (COMMON_ABBREVIATIONS.has(wordBefore)) return true
  if (wordBefore.length === 1 && /[A-Z]/.test(text[wordStart])) return true
  return false
}


function findNativeNewlines(text: string): Set<number> {
  const boundaries = new Set<number>()
  let i = 0
  while (i < text.length) {
    if (text[i] === '\n') {
      let j = i + 1
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++
      if (j >= text.length || text[j] === '\n') { i++; continue }
      boundaries.add(j)
    }
    i++
  }
  return boundaries
}

function findMarkdownBoundaries(text: string): Set<number> {
  const boundaries = new Set<number>()
  const emptyLinePattern = /\n\s*\n/g
  let match
  while ((match = emptyLinePattern.exec(text)) !== null) {
    let endPos = match.index + match[0].length
    while (endPos < text.length && (text[endPos] === ' ' || text[endPos] === '\t')) endPos++
    if (endPos < text.length) boundaries.add(endPos)
  }
  const headingPattern = /(?:^|\n)(#{1,6})\s+/g
  while ((match = headingPattern.exec(text)) !== null) {
    let start = match.index
    if (start > 0 && text[start] === '\n') start += 1
    boundaries.add(start)
  }
  const unorderedListPattern = /(?:^|\n)\s*[-*+]\s+/g
  while ((match = unorderedListPattern.exec(text)) !== null) {
    let start = match.index
    if (start > 0 && text[start] === '\n') start += 1
    while (start < text.length && (text[start] === ' ' || text[start] === '\t')) start++
    boundaries.add(start)
  }
  const orderedListPattern = /(?:^|\n)\s*\d+\.\s/g
  while ((match = orderedListPattern.exec(text)) !== null) {
    let start = match.index
    if (start > 0 && text[start] === '\n') start += 1
    while (start < text.length && (text[start] === ' ' || text[start] === '\t')) start++
    boundaries.add(start)
  }
  const blockquotePattern = /(?:^|\n)\s*>\s*/g
  while ((match = blockquotePattern.exec(text)) !== null) {
    let start = match.index
    if (start > 0 && text[start] === '\n') start += 1
    while (start < text.length && (text[start] === ' ' || text[start] === '\t')) start++
    boundaries.add(start)
  }
  return boundaries
}

function splitSentences(text: string): SpacySentence[] {
  const sentences: SpacySentence[] = []
  const protectedSpans = findProtectedSpans(text)
  const nativeNewlines = findNativeNewlines(text)
  const markdownBoundaries = findMarkdownBoundaries(text)

  const allBoundaries = new Set<number>()
  nativeNewlines.forEach(b => allBoundaries.add(b))
  markdownBoundaries.forEach(b => allBoundaries.add(b))

  const splitPoints: number[] = [0]
  allBoundaries.forEach(b => { if (b > 0 && b < text.length) splitPoints.push(b) })
  splitPoints.push(text.length)
  splitPoints.sort((a, b) => a - b)
  const uniquePoints = [...new Set(splitPoints)]

  for (let i = 0; i < uniquePoints.length - 1; i++) {
    const segStart = uniquePoints[i]
    const segEnd = uniquePoints[i + 1]
    const segment = text.substring(segStart, segEnd)
    if (!segment.trim()) continue

    const sentenceEndings: number[] = []
    const sentencePattern = /[.!?]/g
    let sentMatch
    while ((sentMatch = sentencePattern.exec(segment)) !== null) {
      const posInText = segStart + sentMatch.index
      if (isPositionProtected(posInText, protectedSpans)) continue
      if (isAbbreviationPeriod(text, posInText)) continue
      const afterPos = sentMatch.index + 1
      if (afterPos < segment.length) {
        let nextCharPos = afterPos
        while (nextCharPos < segment.length && /\s/.test(segment[nextCharPos])) nextCharPos++
        if (nextCharPos < segment.length && /[a-z]/.test(segment[nextCharPos])) continue
      }
      sentenceEndings.push(sentMatch.index + 1)
    }

    if (sentenceEndings.length === 0) {
      let actualStart = segStart
      while (actualStart < segEnd && /\s/.test(text[actualStart])) actualStart++
      let actualEnd = segEnd
      while (actualEnd > actualStart && /\s/.test(text[actualEnd - 1])) actualEnd--
      if (actualStart < actualEnd) sentences.push({ text: text.substring(actualStart, actualEnd), start: actualStart, end: actualEnd })
    } else {
      sentenceEndings.unshift(0)
      sentenceEndings.push(segment.length)
      for (let j = 0; j < sentenceEndings.length - 1; j++) {
        const subStartRel = sentenceEndings[j]
        let subEndRel = sentenceEndings[j + 1]
        let actualStartRel = subStartRel
        while (actualStartRel < subEndRel && /\s/.test(segment[actualStartRel])) actualStartRel++
        let actualEndRel = subEndRel
        while (actualEndRel > actualStartRel && /\s/.test(segment[actualEndRel - 1])) actualEndRel--
        if (actualStartRel < actualEndRel) {
          sentences.push({
            text: text.substring(segStart + actualStartRel, segStart + actualEndRel),
            start: segStart + actualStartRel,
            end: segStart + actualEndRel
          })
        }
      }
    }
  }

  if (sentences.length === 0) {
    const trimmedText = text.trim()
    if (trimmedText) {
      const startOffset = text.indexOf(trimmedText)
      sentences.push({ text: trimmedText, start: startOffset, end: startOffset + trimmedText.length })
    } else {
      sentences.push({ text: text, start: 0, end: text.length })
    }
  }

  sentences.sort((a, b) => a.start - b.start)
  return sentences
}

function calculateAnnotationLayers(sentAnnotations: Annotation[], sentStart: number): Map<string, number> {
  const sorted = [...sentAnnotations].sort((a, b) => {
    const aLen = a.endPosition - a.startPosition
    const bLen = b.endPosition - b.startPosition
    if (aLen !== bLen) return bLen - aLen
    return a.startPosition - b.startPosition
  })

  const layers: Array<Array<{ start: number; end: number }>> = []
  const annotationLayers = new Map<string, number>()

  for (const ann of sorted) {
    const annStart = ann.startPosition - sentStart
    const annEnd = ann.endPosition - sentStart
    let layerIdx = 0
    while (true) {
      if (!layers[layerIdx]) layers[layerIdx] = []
      let hasConflict = false
      for (const interval of layers[layerIdx]) {
        if (!(annEnd <= interval.start || annStart >= interval.end)) { hasConflict = true; break }
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

function checkPartialOverlap(newStart: number, newEnd: number, existingStart: number, existingEnd: number): boolean {
  if (newEnd <= existingStart || newStart >= existingEnd) return false
  if ((newStart >= existingStart && newEnd <= existingEnd) || (existingStart >= newStart && existingEnd <= newEnd)) return false
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// SentenceRow — memoized to skip re-render when this sentence is unaffected
// ─────────────────────────────────────────────────────────────────────────────

interface SentenceRowProps {
  sent: SpacySentence
  sentIdx: number
  sentAnnotations: Annotation[]
  sentPositions: Map<string, { left: number; width: number }>
  selectedAnnotationId: string | null
  linkMode: boolean
  linkSourceId: string | null
  readOnly: boolean
  selectedLabel: SelectedLabel | null
  onMouseUp: (sentIdx: number, sentStart: number) => void
  onBlockClick: (ann: Annotation, e: React.MouseEvent) => void
  renderHighlightedText: (sentText: string, sentStart: number) => React.ReactNode
  t: (key: string, defaultValue: string, params?: Record<string, unknown>) => string
}

const SentenceRow = React.memo<SentenceRowProps>(({
  sent, sentIdx, sentAnnotations, sentPositions,
  selectedAnnotationId, linkMode, linkSourceId,
  readOnly, selectedLabel,
  onMouseUp, onBlockClick, renderHighlightedText, t
}) => {
  // Compute layers only when this sentence's annotations change
  const layers = useMemo(
    () => calculateAnnotationLayers(sentAnnotations, sent.start),
    [sentAnnotations, sent.start]
  )
  const maxLayers = useMemo(() => {
    if (layers.size === 0) return 0
    return Math.max(...Array.from(layers.values())) + 1
  }, [layers])

  const userAnnotations = sentAnnotations.filter(a => !a.id.startsWith('spacy-'))
  const barColor = userAnnotations.length > 0 ? (userAnnotations[0]?.color || '#2196F3') : '#bdbdbd'
  const totalHeight = 28 + maxLayers * 26

  return (
    <Box
      data-sentence-idx={sentIdx}
      className="sentence-row"
      sx={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', mb: 0.5, minHeight: 28 }}
    >
      {/* 左侧色条 */}
      <Box
        className="color-bar"
        sx={{
          width: 4, minHeight: totalHeight, borderRadius: '2px',
          mr: 1, flexShrink: 0, bgcolor: barColor, alignSelf: 'stretch'
        }}
      />

      {/* 句子内容 */}
      <Box className="sentence-content" sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        {/* 句子文本 - 不换行 */}
        <Box
          className="sentence-text"
          onMouseUp={() => onMouseUp(sentIdx, sent.start)}
          sx={{
            whiteSpace: 'nowrap',
            py: 0.5,
            lineHeight: 1.6,
            position: 'relative',
            fontSize: '14px',
            fontFamily: '"Segoe UI", "Microsoft YaHei", Arial, sans-serif',
            userSelect: readOnly ? 'none' : 'text',
            cursor: selectedLabel ? 'text' : 'default',
            '&::selection': {
              backgroundColor: selectedLabel ? selectedLabel.color : '#bbdefb',
              color: 'white'
            }
          }}
        >
          {renderHighlightedText(sent.text, sent.start)}
        </Box>

        {/* 标注层 */}
        {maxLayers > 0 && (
          <Box
            className="annotation-layers"
            sx={{ display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0 }}
          >
            {Array.from({ length: maxLayers }).map((_, layerIdx) => {
              const layerAnnotations = sentAnnotations.filter(ann => layers.get(ann.id) === layerIdx)
              if (layerAnnotations.length === 0) return null

              return (
                <Box key={layerIdx} className="annotation-layer" sx={{ position: 'relative', height: 24, mt: '2px' }}>
                  {layerAnnotations.map(ann => {
                    const pos        = sentPositions.get(ann.id)
                    const isSpacy    = ann.id.startsWith('spacy-')
                    const isSelected = !isSpacy && ann.id === selectedAnnotationId
                    const isLinkSrc  = linkMode && ann.id === linkSourceId
                    const isLinkable = linkMode && !isSpacy && !isLinkSrc

                    const boxShadow = isLinkSrc
                      ? `0 0 0 2px white, 0 0 0 4px #FF9800, 0 3px 10px rgba(255,152,0,0.6)`
                      : isSelected
                        ? `0 0 0 2px white, 0 0 0 4px ${ann.color || '#2196F3'}, 0 3px 8px rgba(0,0,0,0.3)`
                        : '0 1px 2px rgba(0,0,0,0.15)'

                    return (
                      <Box
                        key={ann.id}
                        className="annotation-block"
                        data-annotation-id={ann.id}
                        onClick={(e) => onBlockClick(ann, e)}
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
                          boxShadow,
                          bgcolor: ann.color || '#2196F3',
                          opacity: isSpacy ? 0.6 : (pos ? 1 : 0),
                          left: pos?.left ?? 0,
                          width: pos?.width ?? 'auto',
                          zIndex: isLinkSrc ? 20 : (isSelected ? 15 : undefined),
                          outline: isLinkable ? '2px dashed rgba(255,152,0,0.6)' : undefined,
                          outlineOffset: isLinkable ? '2px' : undefined,
                          transform: isLinkSrc
                            ? 'translateY(-3px) scaleY(1.12)'
                            : isSelected ? 'translateY(-2px) scaleY(1.1)' : undefined,
                          transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.2s, outline 0.15s',
                          '&:hover': readOnly || isSpacy ? {} : {
                            transform: isLinkSrc
                              ? 'translateY(-3px) scaleY(1.12)'
                              : isSelected ? 'translateY(-2px) scaleY(1.1)' : 'translateY(-1px)',
                            boxShadow: isLinkSrc
                              ? `0 0 0 2px white, 0 0 0 4px #FF9800, 0 4px 14px rgba(255,152,0,0.7)`
                              : isSelected
                                ? `0 0 0 2px white, 0 0 0 4px ${ann.color || '#2196F3'}, 0 4px 10px rgba(0,0,0,0.35)`
                                : '0 2px 4px rgba(0,0,0,0.2)',
                            zIndex: 10
                          }
                        }}
                        title={isSpacy
                          ? `${ann.label}: ${ann.text} (SpaCy)`
                          : linkMode
                            ? (isLinkSrc
                                ? t('annotation.linkSrcSelected', '已选为起源，点击另一标注建立关联')
                                : t('annotation.linkClickToLink', '点击与「{{label}}」建立关联', { label: ann.label }))
                            : t('annotation.clickToLocate', '点击定位到标注表格 | {{label}}: {{text}}', { label: ann.label, text: ann.text })
                        }
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
}, (prev, next) => {
  // Only re-render when this sentence's data actually changed.
  // sentAnnotations: compare by annotation IDs (content-aware, not reference)
  if (prev.sentAnnotations.length !== next.sentAnnotations.length) return false
  for (let i = 0; i < prev.sentAnnotations.length; i++) {
    if (prev.sentAnnotations[i].id !== next.sentAnnotations[i].id) return false
  }
  // sentPositions: reference equality is enough because we use functional Map updates
  if (prev.sentPositions !== next.sentPositions) return false
  if (prev.selectedAnnotationId !== next.selectedAnnotationId) return false
  if (prev.linkMode !== next.linkMode) return false
  if (prev.linkSourceId !== next.linkSourceId) return false
  if (prev.readOnly !== next.readOnly) return false
  if (prev.selectedLabel !== next.selectedLabel) return false
  // Callbacks (onMouseUp, onBlockClick, renderHighlightedText, t) are stable useCallbacks — skip
  return true
})

SentenceRow.displayName = 'SentenceRow'

// ─────────────────────────────────────────────────────────────────────────────
// TextAnnotator
// ─────────────────────────────────────────────────────────────────────────────

const TextAnnotator = forwardRef<TextAnnotatorRef, TextAnnotatorProps>(({
  text,
  annotations,
  selectedLabel,
  onAnnotationAdd,
  onAnnotationRemove: _onAnnotationRemove,
  readOnly = false,
  sentences: externalSentences,
  searchHighlights = [],
  selectedAnnotationId = null,
  onAnnotationClick,
  relations = [],
  onRelationAdd,
  onRelationRemove,
}, ref) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const containerRef = useRef<HTMLDivElement>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [blockPositions, setBlockPositions] = useState<Map<string, Map<string, { left: number; width: number }>>>(new Map())

  // Stable refs so handlers don't need these as deps and don't recreate on each render
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const relationsRef = useRef(relations)
  relationsRef.current = relations

  // ── Link mode ──────────────────────────────────────────────────────────────
  const [linkMode, setLinkMode]         = useState(false)
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null)

  const canLink = !readOnly && !!onRelationAdd

  const toggleLinkMode = useCallback(() => {
    setLinkMode(prev => {
      if (prev) setLinkSourceId(null)
      return !prev
    })
  }, [])

  // Stable: does not depend on `relations` — uses relationsRef
  const handleBlockClick = useCallback((ann: Annotation, e: React.MouseEvent) => {
    if (readOnly) return
    if (ann.id.startsWith('spacy-')) return
    e.stopPropagation()

    if (linkMode && canLink) {
      if (!linkSourceId) {
        setLinkSourceId(ann.id)
      } else if (linkSourceId === ann.id) {
        setLinkSourceId(null)
      } else {
        const existingRel = relationsRef.current.find(
          r => r.sourceId === linkSourceId && r.targetId === ann.id
        )
        if (existingRel && onRelationRemove) {
          onRelationRemove(existingRel.id)
        } else {
          onRelationAdd!({ id: crypto.randomUUID(), sourceId: linkSourceId, targetId: ann.id })
        }
        setLinkSourceId(null)
      }
      return
    }

    onAnnotationClick?.(ann.id)
  }, [readOnly, linkMode, canLink, linkSourceId, onRelationAdd, onRelationRemove, onAnnotationClick])

  // 暴露 ref 方法
  useImperativeHandle(ref, () => ({
    getContainer: () => containerRef.current,
    scrollToAnnotation: (id: string) => {
      const container = containerRef.current
      if (!container) return
      const annEl = container.querySelector(`[data-annotation-id="${CSS.escape(id)}"]`) as HTMLElement
      if (!annEl) return
      const sentenceRow = annEl.closest('[data-sentence-idx]') as HTMLElement
      const target = sentenceRow || annEl
      const containerRect = container.getBoundingClientRect()
      const elRect = target.getBoundingClientRect()
      const elTop = elRect.top - containerRect.top + container.scrollTop
      const targetScrollTop = elTop - (container.clientHeight - target.offsetHeight) / 2
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
    }
  }))

  // 获取句子（SpaCy 或 fallback）- 动态重新对齐索引
  const sentences = useMemo(() => {
    if (externalSentences && externalSentences.length > 0) {
      const realignedSentences: SpacySentence[] = []
      let searchStart = 0
      for (const sent of externalSentences) {
        const normalizedSentText = sent.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const foundIdx = text.indexOf(normalizedSentText, searchStart)
        if (foundIdx !== -1) {
          realignedSentences.push({ text: normalizedSentText, start: foundIdx, end: foundIdx + normalizedSentText.length })
          searchStart = foundIdx + normalizedSentText.length
        } else {
          const firstWords = normalizedSentText.substring(0, Math.min(30, normalizedSentText.length))
          const fuzzyIdx = text.indexOf(firstWords, searchStart)
          if (fuzzyIdx !== -1) {
            realignedSentences.push({ text: normalizedSentText, start: fuzzyIdx, end: fuzzyIdx + normalizedSentText.length })
            searchStart = fuzzyIdx + normalizedSentText.length
          } else {
            realignedSentences.push({ text: normalizedSentText, start: sent.start, end: sent.start + normalizedSentText.length })
          }
        }
      }
      return realignedSentences
    }
    return splitSentences(text)
  }, [text, externalSentences])

  // 按句子分组标注
  const annotationsBySentence = useMemo(() => {
    const result = new Map<number, Annotation[]>()
    sentences.forEach((sent, sentIdx) => {
      result.set(sentIdx, annotations.filter(ann =>
        ann.startPosition >= sent.start && ann.endPosition <= sent.end
      ))
    })
    return result
  }, [sentences, annotations])

  // ── Targeted DOM measurement — only remeasure sentences whose annotations changed ──

  // Track previous per-sentence annotation arrays to detect which sentences changed
  const prevAnnotationsBySentenceRef = useRef<Map<number, Annotation[]>>(new Map())

  useEffect(() => {
    if (!containerRef.current) {
      if (annotations.length === 0) setBlockPositions(new Map())
      return
    }

    // Find which sentence indices actually changed
    const changedIndices: number[] = []
    sentences.forEach((_, sentIdx) => {
      const curr = annotationsBySentence.get(sentIdx)
      const prev = prevAnnotationsBySentenceRef.current.get(sentIdx)
      // Compare by length + IDs; if different, remeasure
      if (!curr || !prev || curr.length !== prev.length ||
          curr.some((a, i) => a.id !== prev[i].id)) {
        changedIndices.push(sentIdx)
      }
    })
    // Also detect sentences that disappeared (e.g. sentence count changed)
    prevAnnotationsBySentenceRef.current.forEach((_, sentIdx) => {
      if (!annotationsBySentence.has(sentIdx) && !changedIndices.includes(sentIdx)) {
        changedIndices.push(sentIdx)
      }
    })
    prevAnnotationsBySentenceRef.current = annotationsBySentence

    if (changedIndices.length === 0) return

    const measureChanged = () => {
      setBlockPositions(prev => {
        const next = new Map(prev) // shallow copy — reuses Map objects for unchanged sentences

        for (const sentIdx of changedIndices) {
          const sent = sentences[sentIdx]
          if (!sent) { next.delete(sentIdx.toString()); continue }

          const sentTextEl = containerRef.current?.querySelector(
            `[data-sentence-idx="${sentIdx}"] .sentence-text`
          )
          if (!sentTextEl) { next.delete(sentIdx.toString()); continue }

          const textNode = sentTextEl.firstChild
          if (!textNode || textNode.nodeType !== Node.TEXT_NODE) { next.delete(sentIdx.toString()); continue }

          const sentAnnotations = annotationsBySentence.get(sentIdx) || []
          const sentPositions = new Map<string, { left: number; width: number }>()
          const range = document.createRange()

          for (const ann of sentAnnotations) {
            try {
              const relStart = ann.startPosition - sent.start
              const relEnd   = ann.endPosition   - sent.start
              range.setStart(textNode, Math.min(relStart, sent.text.length))
              range.setEnd(textNode,   Math.min(relEnd,   sent.text.length))
              const rect          = range.getBoundingClientRect()
              const containerRect = sentTextEl.getBoundingClientRect()
              sentPositions.set(ann.id, { left: rect.left - containerRect.left, width: rect.width })
            } catch {
              const relStart = ann.startPosition - sent.start
              sentPositions.set(ann.id, { left: relStart * 8, width: (ann.endPosition - ann.startPosition) * 8 })
            }
          }

          next.set(sentIdx.toString(), sentPositions)
        }

        return next
      })
    }

    requestAnimationFrame(measureChanged)
  }, [annotationsBySentence, sentences, annotations.length])

  // Full remeasure on window resize (infrequent — no need for targeted approach here)
  useEffect(() => {
    const measureAll = () => {
      if (!containerRef.current) return
      const positions = new Map<string, Map<string, { left: number; width: number }>>()
      sentences.forEach((sent, sentIdx) => {
        const sentTextEl = containerRef.current?.querySelector(`[data-sentence-idx="${sentIdx}"] .sentence-text`)
        if (!sentTextEl) return
        const textNode = sentTextEl.firstChild
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return
        const sentAnnotations = annotationsBySentence.get(sentIdx) || []
        const sentPositions = new Map<string, { left: number; width: number }>()
        const range = document.createRange()
        for (const ann of sentAnnotations) {
          try {
            const relStart = ann.startPosition - sent.start
            const relEnd   = ann.endPosition   - sent.start
            range.setStart(textNode, Math.min(relStart, sent.text.length))
            range.setEnd(textNode,   Math.min(relEnd,   sent.text.length))
            const rect          = range.getBoundingClientRect()
            const containerRect = sentTextEl.getBoundingClientRect()
            sentPositions.set(ann.id, { left: rect.left - containerRect.left, width: rect.width })
          } catch {
            const relStart = ann.startPosition - sent.start
            sentPositions.set(ann.id, { left: relStart * 8, width: (ann.endPosition - ann.startPosition) * 8 })
          }
        }
        positions.set(sentIdx.toString(), sentPositions)
      })
      setBlockPositions(positions)
    }
    window.addEventListener('resize', measureAll)
    return () => window.removeEventListener('resize', measureAll)
  }, [sentences, annotationsBySentence])

  // Stable: does not depend on `annotations` — uses annotationsRef
  const handleMouseUp = useCallback((sentIdx: number, sentStart: number) => {
    if (readOnly || !selectedLabel) return

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const selectedText = selection.toString().trim()
    if (!selectedText) return

    const range = selection.getRangeAt(0)
    const sentTextEl = containerRef.current?.querySelector(`[data-sentence-idx="${sentIdx}"] .sentence-text`)

    if (!sentTextEl || !sentTextEl.contains(range.commonAncestorContainer)) return

    const preCaretRange = document.createRange()
    preCaretRange.selectNodeContents(sentTextEl)
    preCaretRange.setEnd(range.startContainer, range.startOffset)

    const relativeStart = preCaretRange.toString().length
    const start = sentStart + relativeStart
    const end   = start + selectedText.length

    const actualText = text.slice(start, end)
    if (actualText !== selectedText) {
      const searchStart = Math.max(0, start - 10)
      const idx = text.indexOf(selectedText, searchStart)
      if (idx === -1) {
        setWarning(t('annotation.cannotLocate', '无法定位选中文本'))
        setTimeout(() => setWarning(null), 3000)
        selection.removeAllRanges()
        return
      }
    }

    for (const ann of annotationsRef.current) {
      if (checkPartialOverlap(start, end, ann.startPosition, ann.endPosition)) {
        setWarning(t('annotation.crossOverlap', '标注范围与已有标注交叉，请重新选择'))
        setTimeout(() => setWarning(null), 3000)
        selection.removeAllRanges()
        return
      }
    }

    onAnnotationAdd({
      text: selectedText,
      startPosition: start,
      endPosition: end,
      label: selectedLabel.node.name,
      labelPath: selectedLabel.path,
      color: selectedLabel.color
    })

    selection.removeAllRanges()
    setWarning(null)
  }, [text, selectedLabel, onAnnotationAdd, readOnly, t])

  // 渲染带搜索高亮的文本
  const renderHighlightedText = useCallback((sentText: string, sentStart: number): React.ReactNode => {
    if (searchHighlights.length === 0) return sentText

    const sentEnd = sentStart + sentText.length
    const relevantHighlights = searchHighlights
      .filter(h => h.start >= sentStart && h.end <= sentEnd)
      .map(h => ({ start: h.start - sentStart, end: h.end - sentStart }))
      .sort((a, b) => a.start - b.start)

    if (relevantHighlights.length === 0) return sentText

    const parts: React.ReactNode[] = []
    let lastEnd = 0
    for (let i = 0; i < relevantHighlights.length; i++) {
      const { start, end } = relevantHighlights[i]
      if (start > lastEnd) parts.push(sentText.substring(lastEnd, start))
      parts.push(
        <Box
          key={`highlight-${sentStart}-${i}`}
          component="span"
          sx={{ backgroundColor: '#ffeb3b', color: '#000', borderRadius: '2px', px: '1px' }}
        >
          {sentText.substring(start, end)}
        </Box>
      )
      lastEnd = end
    }
    if (lastEnd < sentText.length) parts.push(sentText.substring(lastEnd))
    return parts
  }, [searchHighlights])

  if (!text) {
    return (
      <Paper sx={{ p: 3, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">
          {t('annotation.noText', '暂无文本')}
        </Typography>
      </Paper>
    )
  }

  return (
    <Box>
      {/* 警告信息 */}
      {warning && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setWarning(null)}>
          {warning}
        </Alert>
      )}

      {/* 操作提示 + 关联模式按钮 */}
      {!readOnly && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" color={linkMode ? 'warning.main' : 'text.secondary'}>
            {linkMode
              ? (linkSourceId
                  ? t('annotation.linkSelectTarget', '已选起源标注，点击目标标注建立关联；再次点击起源取消')
                  : t('annotation.linkSelectSource', '关联模式：点击起源标注'))
              : (selectedLabel
                  ? t('annotation.selectToAnnotate', `选中文本以使用 "${selectedLabel.node.name}" 标注。点击标签块可删除。`)
                  : t('annotation.selectLabelFirst', '请先从框架树选择一个标签'))
            }
          </Typography>
          {canLink && (
            <Tooltip title={linkMode ? t('annotation.linkModeOff', '退出关联模式') : t('annotation.linkModeOn', '标签关联模式')}>
              <Box
                component="span"
                onClick={toggleLinkMode}
                sx={{
                  display: 'inline-flex', alignItems: 'center', cursor: 'pointer',
                  p: '2px 6px', borderRadius: 1, border: '1px solid',
                  borderColor: linkMode ? 'warning.main' : 'divider',
                  bgcolor: linkMode ? 'warning.main' : 'transparent',
                  color: linkMode ? 'warning.contrastText' : 'text.secondary',
                  transition: 'all 0.15s', '&:hover': { opacity: 0.8 },
                  gap: '3px', fontSize: 12,
                }}
              >
                {linkMode ? <LinkOffIcon sx={{ fontSize: 14 }} /> : <LinkIcon sx={{ fontSize: 14 }} />}
                {linkMode ? t('annotation.exitLink', '退出') : t('annotation.linkMode', '关联')}
              </Box>
            </Tooltip>
          )}
        </Box>
      )}

      {/* 文本容器 - 整体滚动 */}
      <Paper
        ref={containerRef}
        className="text-annotation-container"
        sx={{
          p: 1.5,
          position: 'relative',
          bgcolor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafafa',
          border: `1px solid ${isDarkMode
            ? (linkMode ? 'rgba(255,152,0,0.5)' : 'rgba(255,255,255,0.1)')
            : (linkMode ? 'rgba(255,152,0,0.5)' : '#e0e0e0')}`,
          borderRadius: 1,
          maxHeight: 500,
          overflow: 'auto',
          cursor: linkMode ? 'crosshair' : undefined,
        }}
      >
        {sentences.map((sent, sentIdx) => (
          <SentenceRow
            key={sentIdx}
            sent={sent}
            sentIdx={sentIdx}
            sentAnnotations={annotationsBySentence.get(sentIdx) || []}
            sentPositions={blockPositions.get(sentIdx.toString()) || new Map()}
            selectedAnnotationId={selectedAnnotationId}
            linkMode={linkMode}
            linkSourceId={linkSourceId}
            readOnly={readOnly}
            selectedLabel={selectedLabel}
            onMouseUp={handleMouseUp}
            onBlockClick={handleBlockClick}
            renderHighlightedText={renderHighlightedText}
            t={t as SentenceRowProps['t']}
          />
        ))}

        {/* SVG arrow overlay for annotation relations */}
        {relations.length > 0 && (
          <RelationArrows
            relations={relations}
            annotations={annotations}
            containerRef={containerRef as React.RefObject<HTMLDivElement>}
          />
        )}
      </Paper>

      {/* 标注统计 + 关联计数 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
        {annotations.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {annotations.filter(a => !a.id.startsWith('spacy-')).length} {t('annotation.annotationCount', '条标注')}，{sentences.length} {t('annotation.sentenceCount', '个句子')}
          </Typography>
        )}
        {relations.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {relations.length} {t('annotation.relationCount', '条关联')}
          </Typography>
        )}
      </Box>
    </Box>
  )
})

TextAnnotator.displayName = 'TextAnnotator'

export default TextAnnotator

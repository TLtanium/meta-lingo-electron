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
import JoinInnerIcon from '@mui/icons-material/JoinInner'
import { useTranslation } from 'react-i18next'
import type { Annotation, AnnotationRelation, AnnotationGroup, SelectedLabel } from '../../types'
import RelationArrows from './RelationArrows'
import { measureBlockPositions } from './annotationMeasure'

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
  /** 当前定位的匹配序号（用于将该匹配高亮为「当前」橙色并支持上下箭头跳转） */
  currentMatchIndex?: number
  // 选中标注 ID（来自表格行点击，用于定位高亮）
  selectedAnnotationId?: string | null
  /** Called when annotation block is clicked in normal mode — navigates to table row */
  onAnnotationClick?: (id: string) => void
  // ── 标注关联 ──────────────────────────────────────────────────────────────
  relations?: AnnotationRelation[]
  onRelationAdd?: (relation: AnnotationRelation) => void
  onRelationRemove?: (relationId: string) => void
  // ── 非连续词组分组 ──────────────────────────────────────────────────────────
  groups?: AnnotationGroup[]
  onGroupAdd?: (group: AnnotationGroup) => void
  onGroupRemove?: (groupId: string) => void
}

// 导出 ref 类型
export interface TextAnnotatorRef {
  getContainer: () => HTMLDivElement | null
  /** 滚动到指定标注并在视图内居中 */
  scrollToAnnotation: (id: string) => void
  /** 滚动到指定序号的搜索匹配并在视图内居中（上下箭头跳转用） */
  scrollToMatch: (index: number) => void
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


// 属于前一句的闭合括号/引号：紧随句末标点或独占一行时不应被切成新句
const SENTENCE_CLOSE_CHARS = new Set([...')]}>"\'”’）】》」』'])

function findNativeNewlines(text: string): Set<number> {
  const boundaries = new Set<number>()
  let i = 0
  while (i < text.length) {
    if (text[i] === '\n') {
      let j = i + 1
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++
      if (j >= text.length || text[j] === '\n') { i++; continue }
      // 下一行以闭合括号/引号开头（如 "…letters!\n)"）→ 软换行，不作为边界，
      // 避免闭合符被孤立成独立段（与后端 find_native_newlines 对齐）
      if (SENTENCE_CLOSE_CHARS.has(text[j])) { i++; continue }
      boundaries.add(j)
    }
    i++
  }
  return boundaries
}

/**
 * 把"整句只含闭合括号/引号"的孤立句并回前一句。
 * 兜底修复：已落盘的旧 SpaCy 标注（externalSentences）里可能仍带有
 * ")" / '"' 独立成句的错误边界，显示层直接归并，无需重新标注。
 */
function mergeOrphanClosers(sents: SpacySentence[], text: string): SpacySentence[] {
  const out: SpacySentence[] = []
  for (const s of sents) {
    const stripped = s.text.trim()
    const isOrphan = stripped.length > 0 && [...stripped].every(c => SENTENCE_CLOSE_CHARS.has(c))
    if (isOrphan && out.length > 0) {
      const prev = out[out.length - 1]
      prev.end = s.end
      prev.text = text.substring(prev.start, s.end)
    } else {
      out.push({ ...s })
    }
  }
  return out
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
      // 把紧随标点的闭合括号/引号并入当前句（"…letters!)" / '…own?"'）：
      // 紧邻的恒并入；跨空白的仅在"悬空"（其后是空白或段尾）时并入，
      // 下一句的开引号（'Did he? "Yes…'）不受影响 —— 与后端逻辑一致
      let boundaryRel = sentMatch.index + 1
      let closerEnd = boundaryRel
      while (closerEnd < segment.length && SENTENCE_CLOSE_CHARS.has(segment[closerEnd])) closerEnd++
      if (closerEnd > boundaryRel) {
        boundaryRel = closerEnd
      } else {
        let k = boundaryRel
        while (k < segment.length && /\s/.test(segment[k])) k++
        closerEnd = k
        while (closerEnd < segment.length && SENTENCE_CLOSE_CHARS.has(segment[closerEnd])) closerEnd++
        if (closerEnd > k && (closerEnd >= segment.length || /\s/.test(segment[closerEnd]))) {
          boundaryRel = closerEnd
        }
      }
      const afterPos = boundaryRel
      if (afterPos < segment.length) {
        let nextCharPos = afterPos
        while (nextCharPos < segment.length && /\s/.test(segment[nextCharPos])) nextCharPos++
        if (nextCharPos < segment.length && /[a-z]/.test(segment[nextCharPos])) continue
      }
      sentenceEndings.push(boundaryRel)
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

/** Height (px) of a reserved connector lane — one label row, so relation arrows /
 *  group brackets occupy their own slot instead of overlapping adjacent labels. */
const CONNECTOR_LANE_H = 24

/**
 * Measures the pixel left/width of every annotation block in one sentence by
 * mapping its character span onto the live DOM (highlight-aware — see
 * {@link measureBlockPositions}).
 */
function measureSentencePositions(
  sentTextEl: Element,
  sent: SpacySentence,
  sentAnnotations: Annotation[]
): Map<string, { left: number; width: number }> {
  return measureBlockPositions(
    sentTextEl,
    sent.text.length,
    sentAnnotations.map(ann => ({
      id: ann.id,
      relStart: ann.startPosition - sent.start,
      relEnd: ann.endPosition - sent.start,
    }))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SentenceRow — memoized to skip re-render when this sentence is unaffected
// ─────────────────────────────────────────────────────────────────────────────

/** 句内搜索高亮（相对句首偏移，带全局匹配序号与是否为当前匹配） */
interface SentHighlight {
  start: number   // relative to sentence start
  end: number     // relative to sentence start
  index: number   // global match index (data-match-index, for arrow navigation)
  isCurrent: boolean
}

/** 稳定的空高亮数组引用：无高亮的句子始终传同一引用，避免触发 memo 重渲染 */
const EMPTY_HIGHLIGHTS: SentHighlight[] = []

interface SentenceRowProps {
  sent: SpacySentence
  sentIdx: number
  sentAnnotations: Annotation[]
  sentPositions: Map<string, { left: number; width: number }>
  selectedAnnotationId: string | null
  linkMode: boolean
  linkSourceId: string | null
  groupMode: boolean
  groupPendingSet: ReadonlySet<string>
  groupNums: ReadonlyMap<string, number>
  readOnly: boolean
  selectedLabel: SelectedLabel | null
  sentHighlights: SentHighlight[]
  /** Reserve an empty top lane (between text and labels) for a group bracket. */
  hasTopLane: boolean
  /** Reserve an empty bottom lane (below labels) for a relation arrow. */
  hasBottomLane: boolean
  onMouseUp: (sentIdx: number, sentStart: number) => void
  onBlockClick: (ann: Annotation, e: React.MouseEvent) => void
  t: (key: string, defaultValue: string, params?: Record<string, unknown>) => string
}

const SentenceRow = React.memo<SentenceRowProps>(({
  sent, sentIdx, sentAnnotations, sentPositions,
  selectedAnnotationId, linkMode, linkSourceId,
  groupMode, groupPendingSet, groupNums,
  readOnly, selectedLabel, sentHighlights,
  hasTopLane, hasBottomLane,
  onMouseUp, onBlockClick, t
}) => {
  // 渲染句子文本，并把搜索匹配高亮为黄色（当前匹配为橙色），每个匹配带 data-match-index 供跳转定位
  const renderedText = useMemo<React.ReactNode>(() => {
    if (sentHighlights.length === 0) return sent.text
    const sorted = [...sentHighlights].sort((a, b) => a.start - b.start)
    const parts: React.ReactNode[] = []
    let lastEnd = 0
    for (let i = 0; i < sorted.length; i++) {
      const { start, end, index, isCurrent } = sorted[i]
      if (start > lastEnd) parts.push(sent.text.substring(lastEnd, start))
      parts.push(
        <Box
          key={`hl-${sent.start}-${i}`}
          component="span"
          data-match-index={index}
          sx={{
            backgroundColor: isCurrent ? '#ff9800' : '#ffeb3b',
            color: '#000',
            borderRadius: '2px',
            px: '1px',
            boxShadow: isCurrent ? '0 0 0 2px #e65100' : undefined,
            fontWeight: isCurrent ? 700 : undefined,
          }}
        >
          {sent.text.substring(start, end)}
        </Box>
      )
      lastEnd = Math.max(lastEnd, end)
    }
    if (lastEnd < sent.text.length) parts.push(sent.text.substring(lastEnd))
    return parts
  }, [sentHighlights, sent.text, sent.start])

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
    + (hasTopLane ? CONNECTOR_LANE_H : 0)
    + (hasBottomLane ? CONNECTOR_LANE_H : 0)

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
          {renderedText}
        </Box>

        {/* 顶部连线通道：为词组括号（在标签上方）预留一行标签高度的空位，
            避免括号横线压在文本或上一层标签上 */}
        {hasTopLane && (
          <Box data-lane="top" className="connector-lane-top" sx={{ height: CONNECTOR_LANE_H, flexShrink: 0 }} />
        )}

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
                    const pos            = sentPositions.get(ann.id)
                    const isSpacy        = ann.id.startsWith('spacy-')
                    const isSelected     = !isSpacy && ann.id === selectedAnnotationId
                    const isLinkSrc      = linkMode && ann.id === linkSourceId
                    const isLinkable     = linkMode && !isSpacy && !isLinkSrc
                    const isGroupPending = groupMode && !isSpacy && groupPendingSet.has(ann.id)
                    const isGroupTarget  = groupMode && !isSpacy && !isGroupPending
                    const groupNum       = groupNums.get(ann.id)
                    const hasGroup       = !isSpacy && groupNum !== undefined

                    const boxShadow = isLinkSrc
                      ? `0 0 0 2px white, 0 0 0 4px #FF9800, 0 3px 10px rgba(255,152,0,0.6)`
                      : isGroupPending
                        ? `0 0 0 2px white, 0 0 0 4px #9C27B0, 0 3px 10px rgba(156,39,176,0.6)`
                        : isSelected
                          ? `0 0 0 2px white, 0 0 0 4px ${ann.color || '#2196F3'}, 0 3px 8px rgba(0,0,0,0.3)`
                          : '0 1px 2px rgba(0,0,0,0.15)'

                    const outline = isGroupTarget
                      ? '2px dashed rgba(156,39,176,0.5)'
                      : isLinkable
                        ? '2px dashed rgba(255,152,0,0.6)'
                        : undefined

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
                          zIndex: isLinkSrc ? 20 : (isGroupPending ? 18 : (isSelected ? 15 : undefined)),
                          outline,
                          outlineOffset: (isGroupTarget || isLinkable) ? '2px' : undefined,
                          transform: isLinkSrc
                            ? 'translateY(-3px) scaleY(1.12)'
                            : isGroupPending ? 'translateY(-3px) scaleY(1.12)'
                            : isSelected ? 'translateY(-2px) scaleY(1.1)' : undefined,
                          transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.2s, outline 0.15s',
                          '&:hover': readOnly || isSpacy ? {} : {
                            transform: isLinkSrc
                              ? 'translateY(-3px) scaleY(1.12)'
                              : isGroupPending ? 'translateY(-3px) scaleY(1.12)'
                              : isSelected ? 'translateY(-2px) scaleY(1.1)' : 'translateY(-1px)',
                            boxShadow: isLinkSrc
                              ? `0 0 0 2px white, 0 0 0 4px #FF9800, 0 4px 14px rgba(255,152,0,0.7)`
                              : isGroupPending
                                ? `0 0 0 2px white, 0 0 0 4px #9C27B0, 0 4px 14px rgba(156,39,176,0.7)`
                                : isSelected
                                  ? `0 0 0 2px white, 0 0 0 4px ${ann.color || '#2196F3'}, 0 4px 10px rgba(0,0,0,0.35)`
                                  : '0 2px 4px rgba(0,0,0,0.2)',
                            zIndex: 10
                          }
                        }}
                        title={isSpacy
                          ? `${ann.label}: ${ann.text} (SpaCy)`
                          : groupMode
                            ? (hasGroup
                                ? t('annotation.groupClickToDissolve', '点击解散该词组')
                                : isGroupPending
                                  ? t('annotation.groupClickToDeselect', '点击取消选择')
                                  : t('annotation.groupClickToAdd', '点击加入词组'))
                            : linkMode
                              ? (isLinkSrc
                                  ? t('annotation.linkSrcSelected', '已选为起源，点击另一标注建立关联')
                                  : t('annotation.linkClickToLink', '点击与「{{label}}」建立关联', { label: ann.label }))
                              : t('annotation.clickToLocate', '点击定位到标注表格 | {{label}}: {{text}}', { label: ann.label, text: ann.text })
                        }
                      >
                        {ann.label}
                        {/* Group number badge */}
                        {hasGroup && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: 1, right: 1,
                              width: 13, height: 13,
                              borderRadius: '50%',
                              bgcolor: 'white',
                              border: `1.5px solid ${ann.color || '#2196F3'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '7px',
                              color: ann.color || '#2196F3',
                              fontWeight: 700,
                              lineHeight: 1,
                              zIndex: 30,
                              pointerEvents: 'none',
                              userSelect: 'none',
                            }}
                          >
                            {groupNum}
                          </Box>
                        )}
                      </Box>
                    )
                  })}
                </Box>
              )
            })}
          </Box>
        )}

        {/* 底部连线通道：为关联箭头（在标签下方）预留一行标签高度的空位，
            避免箭头横线压在下一句或下一层标签上 */}
        {hasBottomLane && (
          <Box data-lane="bottom" className="connector-lane-bottom" sx={{ height: CONNECTOR_LANE_H, flexShrink: 0 }} />
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
  if (prev.groupMode !== next.groupMode) return false
  if (prev.readOnly !== next.readOnly) return false
  if (prev.selectedLabel !== next.selectedLabel) return false
  if (prev.hasTopLane !== next.hasTopLane) return false
  if (prev.hasBottomLane !== next.hasBottomLane) return false
  // Group-related props: compare per-sentence annotation membership
  for (const ann of prev.sentAnnotations) {
    if ((prev.groupPendingSet.has(ann.id)) !== (next.groupPendingSet.has(ann.id))) return false
    if ((prev.groupNums.get(ann.id) ?? 0) !== (next.groupNums.get(ann.id) ?? 0)) return false
  }
  // Search highlights: content-compare so the sentence re-renders when its yellow/orange
  // highlights or the "current match" changes (the array identity changes every parent
  // render, so we must compare by value here, not by reference).
  if (prev.sentHighlights.length !== next.sentHighlights.length) return false
  for (let i = 0; i < prev.sentHighlights.length; i++) {
    const a = prev.sentHighlights[i], b = next.sentHighlights[i]
    if (a.start !== b.start || a.end !== b.end || a.index !== b.index || a.isCurrent !== b.isCurrent) return false
  }
  // Callbacks (onMouseUp, onBlockClick, t) are stable useCallbacks — skip
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
  currentMatchIndex = -1,
  selectedAnnotationId = null,
  onAnnotationClick,
  relations = [],
  onRelationAdd,
  onRelationRemove,
  groups = [],
  onGroupAdd,
  onGroupRemove,
}, ref) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const containerRef = useRef<HTMLDivElement>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [blockPositions, setBlockPositions] = useState<Map<string, Map<string, { left: number; width: number }>>>(new Map())
  // Bumped on every (re)measure so RelationArrows re-tracks blocks that shifted
  // (e.g. a search highlight added padding/bold width to the sentence text).
  const [measureRevision, setMeasureRevision] = useState(0)

  // Stable refs so handlers don't need these as deps and don't recreate on each render
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const relationsRef = useRef(relations)
  relationsRef.current = relations
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  // ── Link mode ──────────────────────────────────────────────────────────────
  const [linkMode, setLinkMode]         = useState(false)
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null)

  const canLink = !readOnly && !!onRelationAdd

  const toggleLinkMode = useCallback(() => {
    setLinkMode(prev => {
      if (!prev) {
        // Entering link mode: exit group mode
        setGroupMode(false)
        setGroupPendingIds([])
      } else {
        setLinkSourceId(null)
      }
      return !prev
    })
  }, [])

  // ── Group mode ─────────────────────────────────────────────────────────────
  const [groupMode, setGroupMode]         = useState(false)
  const [groupPendingIds, setGroupPendingIds] = useState<string[]>([])

  const canGroup = !readOnly && !!onGroupAdd && !!onGroupRemove

  const toggleGroupMode = useCallback(() => {
    setGroupMode(prev => {
      if (!prev) {
        // Entering group mode: exit link mode
        setLinkMode(false)
        setLinkSourceId(null)
      } else {
        setGroupPendingIds([])
      }
      return !prev
    })
  }, [])

  const handleConfirmGroup = useCallback(() => {
    if (groupPendingIds.length < 2 || !onGroupAdd) return
    onGroupAdd({ id: crypto.randomUUID(), annotationIds: [...groupPendingIds] })
    setGroupPendingIds([])
  }, [groupPendingIds, onGroupAdd])

  // Memoised lookup structures for group rendering
  const groupNums = useMemo<ReadonlyMap<string, number>>(() => {
    const map = new Map<string, number>()
    groups.forEach((g, idx) => {
      g.annotationIds.forEach(id => map.set(id, idx + 1))
    })
    return map
  }, [groups])

  const groupPendingSet = useMemo<ReadonlySet<string>>(
    () => new Set(groupPendingIds),
    [groupPendingIds]
  )

  // Stable: does not depend on `relations`/`groups` — uses refs
  const handleBlockClick = useCallback((ann: Annotation, e: React.MouseEvent) => {
    if (readOnly) return
    if (ann.id.startsWith('spacy-')) return
    e.stopPropagation()

    // ── Group mode ───────────────────────────────────────────────────────────
    if (groupMode && canGroup) {
      // If annotation already belongs to an existing group, dissolve that group
      const existingGroup = groupsRef.current.find(g => g.annotationIds.includes(ann.id))
      if (existingGroup) {
        onGroupRemove!(existingGroup.id)
        return
      }
      // Otherwise toggle in pending selection
      setGroupPendingIds(prev =>
        prev.includes(ann.id) ? prev.filter(id => id !== ann.id) : [...prev, ann.id]
      )
      return
    }

    // ── Link mode ────────────────────────────────────────────────────────────
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
  }, [readOnly, groupMode, canGroup, linkMode, canLink, linkSourceId, onRelationAdd, onRelationRemove, onGroupRemove, onAnnotationClick])

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
    },
    scrollToMatch: (index: number) => {
      const container = containerRef.current
      if (!container) return
      const el = container.querySelector(`[data-match-index="${CSS.escape(String(index))}"]`) as HTMLElement
      if (!el) return
      const containerRect = container.getBoundingClientRect()
      // 垂直方向：以匹配所在句行为单位居中（句行较矮则退回匹配元素本身）
      const sentenceRow = (el.closest('[data-sentence-idx]') as HTMLElement) || el
      const vRect = sentenceRow.getBoundingClientRect()
      const top = vRect.top - containerRect.top + container.scrollTop - (container.clientHeight - sentenceRow.offsetHeight) / 2
      // 水平方向：句子不换行，需把匹配元素水平居中（长句可横向滚动）
      const eRect = el.getBoundingClientRect()
      const left = eRect.left - containerRect.left + container.scrollLeft - (container.clientWidth - el.offsetWidth) / 2
      container.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: 'smooth' })
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
      // 归并旧标注数据中被孤立的闭合括号/引号句（无需重新标注即可正确显示）
      return mergeOrphanClosers(realignedSentences, text)
    }
    return mergeOrphanClosers(splitSentences(text), text)
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

  // 把全局搜索高亮（含「当前匹配」序号）按句切分为每句的相对偏移高亮，
  // SentenceRow 据此渲染黄色/橙色高亮。array 内容随匹配/当前项变化，memo 按值比较。
  // （定义前移到测量副作用之前：高亮变化会改变句子文本 DOM，需触发对应句子重新测量。）
  const highlightsBySentence = useMemo(() => {
    const map = new Map<number, SentHighlight[]>()
    if (searchHighlights.length === 0) return map
    sentences.forEach((sent, sentIdx) => {
      const sentEnd = sent.start + sent.text.length
      const rel: SentHighlight[] = []
      searchHighlights.forEach((h, gi) => {
        if (h.start >= sent.start && h.end <= sentEnd) {
          rel.push({
            start: h.start - sent.start,
            end: h.end - sent.start,
            index: gi,
            isCurrent: gi === currentMatchIndex,
          })
        }
      })
      if (rel.length > 0) map.set(sentIdx, rel)
    })
    return map
  }, [searchHighlights, currentMatchIndex, sentences])

  // 标注 ID → 句子序号，用于决定哪些句子需要预留连线通道
  const annToSent = useMemo(() => {
    const m = new Map<string, number>()
    annotationsBySentence.forEach((anns, sentIdx) => {
      anns.forEach(a => m.set(a.id, sentIdx))
    })
    return m
  }, [annotationsBySentence])

  // 需要预留连线通道的句子集合（关联与词组的横线一律落在底部通道，使所有连线都从
  // 标签下方出发）：
  // - bottomLaneSet：含关联箭头/词组括号横线的句子，取两端/成员中较下方的句子
  //   （较大句子序号），使横线落在最下方标签的正下方，竖线从各标签底部垂下。
  // - topLaneSet：保留以兼容 SentenceRow 接口，现已不再使用（恒为空）。
  const { topLaneSet, bottomLaneSet } = useMemo(() => {
    const top = new Set<number>()
    const bottom = new Set<number>()
    for (const rel of relations) {
      const s = annToSent.get(rel.sourceId)
      const tg = annToSent.get(rel.targetId)
      if (s === undefined || tg === undefined) continue
      bottom.add(Math.max(s, tg))
    }
    for (const grp of groups) {
      const idxs = grp.annotationIds
        .map(id => annToSent.get(id))
        .filter((x): x is number => x !== undefined)
      if (idxs.length >= 2) bottom.add(Math.max(...idxs))
    }
    return { topLaneSet: top, bottomLaneSet: bottom }
  }, [relations, groups, annToSent])

  // ── Targeted DOM measurement — only remeasure sentences whose annotations changed ──

  // Track previous per-sentence search highlights to detect which sentences' text DOM
  // changed (highlight spans add padding / bold width that shifts token positions).
  const prevHighlightsBySentenceRef = useRef<Map<number, SentHighlight[]>>(new Map())

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

    // Detect sentences whose search highlights changed — the highlight <span>s add
    // padding / bold width, shifting every token after them, so those sentences
    // must be re-measured too (and re-measured back to normal once cleared).
    const highlightsChanged = (a: SentHighlight[] | undefined, b: SentHighlight[] | undefined): boolean => {
      const al = a?.length ?? 0, bl = b?.length ?? 0
      if (al !== bl) return true
      for (let i = 0; i < al; i++) {
        const x = a![i], y = b![i]
        if (x.start !== y.start || x.end !== y.end || x.isCurrent !== y.isCurrent) return true
      }
      return false
    }
    sentences.forEach((_, sentIdx) => {
      if (highlightsChanged(highlightsBySentence.get(sentIdx), prevHighlightsBySentenceRef.current.get(sentIdx))
          && !changedIndices.includes(sentIdx)) {
        changedIndices.push(sentIdx)
      }
    })
    prevHighlightsBySentenceRef.current = highlightsBySentence

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

          // Walk all text nodes so measurement stays correct when the sentence text
          // is split by search-highlight spans (not just a single firstChild node).
          next.set(sentIdx.toString(), measureSentencePositions(sentTextEl, sent, annotationsBySentence.get(sentIdx) || []))
        }

        return next
      })
      setMeasureRevision(v => v + 1)
    }

    requestAnimationFrame(measureChanged)
  }, [annotationsBySentence, sentences, annotations.length, highlightsBySentence])

  // Full remeasure on window resize (infrequent — no need for targeted approach here)
  useEffect(() => {
    const measureAll = () => {
      if (!containerRef.current) return
      const positions = new Map<string, Map<string, { left: number; width: number }>>()
      sentences.forEach((sent, sentIdx) => {
        const sentTextEl = containerRef.current?.querySelector(`[data-sentence-idx="${sentIdx}"] .sentence-text`)
        if (!sentTextEl) return
        positions.set(sentIdx.toString(), measureSentencePositions(sentTextEl, sent, annotationsBySentence.get(sentIdx) || []))
      })
      setBlockPositions(positions)
      setMeasureRevision(v => v + 1)
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

      {/* 操作提示 + 模式按钮 */}
      {!readOnly && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" color={groupMode ? 'secondary.main' : linkMode ? 'warning.main' : 'text.secondary'} sx={{ flex: 1, minWidth: 0 }}>
            {groupMode
              ? (groupPendingIds.length >= 2
                  ? t('annotation.groupReadyToConfirm', '已选 {{count}} 个标注，点击「确认词组」完成分组', { count: groupPendingIds.length })
                  : t('annotation.groupSelectMembers', '词组模式：点击标注加入词组（需选 2 个以上）'))
              : linkMode
                ? (linkSourceId
                    ? t('annotation.linkSelectTarget', '已选起源标注，点击目标标注建立关联；再次点击起源取消')
                    : t('annotation.linkSelectSource', '关联模式：点击起源标注'))
                : (selectedLabel
                    ? t('annotation.selectToAnnotate', `选中文本以使用 "${selectedLabel.node.name}" 标注。点击标签块可删除。`)
                    : t('annotation.selectLabelFirst', '请先从框架树选择一个标签'))
            }
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            {/* Confirm Group button — only visible in group mode with ≥2 pending */}
            {groupMode && groupPendingIds.length >= 2 && (
              <Box
                component="span"
                onClick={handleConfirmGroup}
                sx={{
                  display: 'inline-flex', alignItems: 'center', cursor: 'pointer',
                  p: '2px 7px', borderRadius: 1, border: '1px solid',
                  borderColor: 'secondary.main',
                  bgcolor: 'secondary.main',
                  color: 'white',
                  transition: 'all 0.15s', '&:hover': { opacity: 0.85 },
                  gap: '3px', fontSize: 12, fontWeight: 500,
                }}
              >
                {t('annotation.groupConfirm', '确认词组 ({{count}})', { count: groupPendingIds.length })}
              </Box>
            )}
            {/* Group mode toggle */}
            {canGroup && (
              <Tooltip title={groupMode ? t('annotation.groupModeOff', '退出词组模式') : t('annotation.groupModeOn', '非连续词组模式（无方向性，计为整体）')}>
                <Box
                  component="span"
                  onClick={toggleGroupMode}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', cursor: 'pointer',
                    p: '2px 6px', borderRadius: 1, border: '1px solid',
                    borderColor: groupMode ? 'secondary.main' : 'divider',
                    bgcolor: groupMode ? 'secondary.main' : 'transparent',
                    color: groupMode ? 'white' : 'text.secondary',
                    transition: 'all 0.15s', '&:hover': { opacity: 0.8 },
                    gap: '3px', fontSize: 12,
                  }}
                >
                  <JoinInnerIcon sx={{ fontSize: 14 }} />
                  {groupMode ? t('annotation.exitGroupMode', '退出') : t('annotation.groupMode', '词组')}
                </Box>
              </Tooltip>
            )}
            {/* Link mode toggle */}
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
            ? (groupMode ? 'rgba(156,39,176,0.5)' : linkMode ? 'rgba(255,152,0,0.5)' : 'rgba(255,255,255,0.1)')
            : (groupMode ? 'rgba(156,39,176,0.5)' : linkMode ? 'rgba(255,152,0,0.5)' : '#e0e0e0')}`,
          borderRadius: 1,
          maxHeight: 500,
          overflow: 'auto',
          cursor: groupMode ? 'cell' : linkMode ? 'crosshair' : undefined,
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
            groupMode={groupMode}
            groupPendingSet={groupPendingSet}
            groupNums={groupNums}
            readOnly={readOnly}
            selectedLabel={selectedLabel}
            sentHighlights={highlightsBySentence.get(sentIdx) || EMPTY_HIGHLIGHTS}
            hasTopLane={topLaneSet.has(sentIdx)}
            hasBottomLane={bottomLaneSet.has(sentIdx)}
            onMouseUp={handleMouseUp}
            onBlockClick={handleBlockClick}
            t={t as SentenceRowProps['t']}
          />
        ))}

        {/* SVG overlay for relations (arrows) and groups (brackets) */}
        {(relations.length > 0 || groups.length > 0) && (
          <RelationArrows
            relations={relations}
            annotations={annotations}
            containerRef={containerRef as React.RefObject<HTMLDivElement>}
            groups={groups}
            revision={measureRevision}
          />
        )}
      </Paper>

      {/* 标注统计 + 关联/词组计数 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
        {annotations.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {annotations.filter(a => !a.id.startsWith('spacy-')).length} {t('annotation.annotationCount', '条标注')}，{sentences.length} {t('annotation.sentenceCount', '个句子')}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {relations.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {relations.length} {t('annotation.relationCount', '条关联')}
            </Typography>
          )}
          {groups.length > 0 && (
            <Typography variant="caption" color="secondary.main">
              {groups.length} {t('annotation.groupCount', '个词组')}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
})

TextAnnotator.displayName = 'TextAnnotator'

export default TextAnnotator

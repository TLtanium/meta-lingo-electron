/**
 * TextAnnotator Component
 * 文本划词标注组件 - 分句显示，标签块精确对齐
 * 
 * 功能：
 * - 分句显示（每句不换行）
 * - 标签块在划词正下方，边界精确对齐
 * - 大标签在上层（靠近文本），小标签在下层
 * - 禁止交叉标注，只允许完全包含或不重叠
 * - 整体容器滚动（非每句单独滚动）
 */

import { useCallback, useRef, useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Box, Typography, Paper, Alert, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { Annotation, SelectedLabel } from '../../types'

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
}

// 导出 ref 类型
export interface TextAnnotatorRef {
  getContainer: () => HTMLDivElement | null
}

// 常见缩写列表（与后端保持一致）
const COMMON_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'inc', 'ltd',
  'corp', 'co', 'no', 'vol', 'rev', 'gen', 'col', 'lt', 'st', 'ave', 'blvd',
  'dept', 'univ', 'assn', 'bros', 'ph', 'ed', 'est', 'approx', 'govt',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
])

/**
 * 查找所有受保护的字符范围（包含不应作为句子边界的句点）
 * 与后端 find_protected_spans 保持一致
 */
function findProtectedSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  
  // 邮箱模式: user@domain.com
  const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g
  let match
  while ((match = emailPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  
  // URL 模式: http://... https://... www....
  const urlPattern = /https?:\/\/\S+|www\.\S+/g
  while ((match = urlPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  
  // 小数模式: 3.14, 100.5
  const decimalPattern = /\d+\.\d+/g
  while ((match = decimalPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  
  // 人名缩写模式: J. P. Morgan
  const nameAbbrevPattern = /\b[A-Z]\.\s*(?=[A-Z]|\s|$)/g
  while ((match = nameAbbrevPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  
  // 有序列表模式: 1. 2. 3. 在行首
  const orderedListPattern = /(?:^|\n)\s*\d+\.\s/g
  while ((match = orderedListPattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length])
  }
  
  return spans
}

/**
 * 检查位置是否在受保护的范围内
 */
function isPositionProtected(pos: number, protectedSpans: Array<[number, number]>): boolean {
  for (const [start, end] of protectedSpans) {
    if (start <= pos && pos < end) {
      return true
    }
  }
  return false
}

/**
 * 检查句点是否为缩写的一部分
 */
function isAbbreviationPeriod(text: string, periodPos: number): boolean {
  if (periodPos <= 0) return false
  
  // 找到句点前的词
  let wordStart = periodPos - 1
  while (wordStart > 0 && /[a-zA-Z]/.test(text[wordStart - 1])) {
    wordStart--
  }
  
  const wordBefore = text.substring(wordStart, periodPos).toLowerCase()
  
  // 检查是否为常见缩写
  if (COMMON_ABBREVIATIONS.has(wordBefore)) {
    return true
  }
  
  // 单个大写字母后跟句点（如首字母缩写: J. K. Rowling）
  if (wordBefore.length === 1 && /[A-Z]/.test(text[wordStart])) {
    return true
  }
  
  return false
}

/**
 * 检查位置是否在受保护的范围内（邮箱、URL、小数点、人名缩写、有序列表等）
 * 兼容旧版 API
 */
function isProtectedPeriod(text: string, periodPos: number): boolean {
  const protectedSpans = findProtectedSpans(text)
  
  if (isPositionProtected(periodPos, protectedSpans)) {
    return true
  }
  
  if (isAbbreviationPeriod(text, periodPos)) {
    return true
  }
  
  return false
}

/**
 * 查找原生换行位置（排除空行）
 * 与后端 find_native_newlines 保持一致
 * 
 * 原生换行是指单个换行符后跟有实际内容的位置。
 * 空行（连续换行或仅包含空白的行）不计入。
 */
function findNativeNewlines(text: string): Set<number> {
  const boundaries = new Set<number>()
  
  let i = 0
  while (i < text.length) {
    if (text[i] === '\n') {
      // 检查这是否是空行的一部分（连续换行或换行后只有空白然后又换行）
      let j = i + 1
      
      // 跳过空格/制表符（不跳过换行符）
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) {
        j++
      }
      
      // 如果遇到另一个换行符或文本结束，这是一个空行 - 跳过
      if (j >= text.length || text[j] === '\n') {
        i++
        continue
      }
      
      // 这是一个原生换行，后面有实际内容
      // 边界位于实际内容的开始位置（空白之后）
      boundaries.add(j)
    }
    
    i++
  }
  
  return boundaries
}

/**
 * 查找 Markdown 结构边界位置
 * 与后端 find_markdown_boundaries 保持一致
 */
function findMarkdownBoundaries(text: string): Set<number> {
  const boundaries = new Set<number>()
  
  // 空行边界（段落分隔符）
  const emptyLinePattern = /\n\s*\n/g
  let match
  while ((match = emptyLinePattern.exec(text)) !== null) {
    let endPos = match.index + match[0].length
    // 跳过空白找到实际内容开始位置
    while (endPos < text.length && (text[endPos] === ' ' || text[endPos] === '\t')) {
      endPos++
    }
    if (endPos < text.length) {
      boundaries.add(endPos)
    }
  }
  
  // Markdown 标题边界: # ## ### 等
  const headingPattern = /(?:^|\n)(#{1,6})\s+/g
  while ((match = headingPattern.exec(text)) !== null) {
    let start = match.index
    if (start > 0 && text[start] === '\n') {
      start += 1
    }
    boundaries.add(start)
  }
  
  // 无序列表边界: - * +
  const unorderedListPattern = /(?:^|\n)\s*[-*+]\s+/g
  while ((match = unorderedListPattern.exec(text)) !== null) {
    let start = match.index
    if (start > 0 && text[start] === '\n') {
      start += 1
    }
    // 跳过空白到列表标记
    while (start < text.length && (text[start] === ' ' || text[start] === '\t')) {
      start++
    }
    boundaries.add(start)
  }
  
  // 有序列表边界: 1. 2. 3.
  const orderedListPattern = /(?:^|\n)\s*\d+\.\s/g
  while ((match = orderedListPattern.exec(text)) !== null) {
    let start = match.index
    if (start > 0 && text[start] === '\n') {
      start += 1
    }
    // 跳过空白到数字
    while (start < text.length && (text[start] === ' ' || text[start] === '\t')) {
      start++
    }
    boundaries.add(start)
  }
  
  // 引用块边界: >
  const blockquotePattern = /(?:^|\n)\s*>\s*/g
  while ((match = blockquotePattern.exec(text)) !== null) {
    let start = match.index
    if (start > 0 && text[start] === '\n') {
      start += 1
    }
    // 跳过空白到 >
    while (start < text.length && (text[start] === ' ' || text[start] === '\t')) {
      start++
    }
    boundaries.add(start)
  }
  
  return boundaries
}

/**
 * 正则分句（fallback），支持原生换行和 Markdown 结构分段
 * 与后端 post_process_sentences 保持一致
 * 
 * 处理流程：
 * 1. 首先按原生换行分段（优先级最高，排除空行）
 * 2. 然后按 Markdown 结构分段（标题、列表、引用、空行）
 * 3. 在每个段落内部按句子结束标点分句
 * 4. 保护特殊情况：邮箱、URL、小数、人名缩写、常见缩写
 * 
 * 优先级：原生换行 > Markdown边界 > 句子标点
 */
function splitSentences(text: string): SpacySentence[] {
  const sentences: SpacySentence[] = []
  const protectedSpans = findProtectedSpans(text)
  const nativeNewlines = findNativeNewlines(text)
  const markdownBoundaries = findMarkdownBoundaries(text)
  
  // 第一步：收集所有分段点（原生换行 + Markdown 边界，原生换行优先）
  const allBoundaries = new Set<number>()
  nativeNewlines.forEach(boundary => allBoundaries.add(boundary))
  markdownBoundaries.forEach(boundary => allBoundaries.add(boundary))
  
  const splitPoints: number[] = [0]
  allBoundaries.forEach(boundary => {
    if (boundary > 0 && boundary < text.length) {
      splitPoints.push(boundary)
    }
  })
  splitPoints.push(text.length)
  splitPoints.sort((a, b) => a - b)
  
  // 去重
  const uniquePoints = [...new Set(splitPoints)]
  
  // 第二步：按分段点切分，然后在每个段落内按句子标点分割
  for (let i = 0; i < uniquePoints.length - 1; i++) {
    const segStart = uniquePoints[i]
    const segEnd = uniquePoints[i + 1]
    const segment = text.substring(segStart, segEnd)
    
    if (!segment.trim()) continue
    
    // 在段落内找句子结束标点
    const sentenceEndings: number[] = []
    const sentencePattern = /[.!?]/g
    let sentMatch
    
    while ((sentMatch = sentencePattern.exec(segment)) !== null) {
      const posInText = segStart + sentMatch.index
      
      // 检查是否为受保护的位置
      if (isPositionProtected(posInText, protectedSpans)) {
        continue
      }
      if (isAbbreviationPeriod(text, posInText)) {
        continue
      }
      
      // 检查句点后的字符
      const afterPos = sentMatch.index + 1
      if (afterPos < segment.length) {
        // 跳过空白
        let nextCharPos = afterPos
        while (nextCharPos < segment.length && /\s/.test(segment[nextCharPos])) {
          nextCharPos++
        }
        // 如果下一个字符是小写字母，不是句子边界
        if (nextCharPos < segment.length && /[a-z]/.test(segment[nextCharPos])) {
          continue
        }
      }
      
      sentenceEndings.push(sentMatch.index + 1) // 包含标点
    }
    
    // 如果没有找到句子边界，整个段落作为一个句子
    if (sentenceEndings.length === 0) {
      // 调整起始位置（跳过开头空白）
      let actualStart = segStart
      while (actualStart < segEnd && /\s/.test(text[actualStart])) {
        actualStart++
      }
      // 调整结束位置（跳过结尾空白）
      let actualEnd = segEnd
      while (actualEnd > actualStart && /\s/.test(text[actualEnd - 1])) {
        actualEnd--
      }
      
      if (actualStart < actualEnd) {
        sentences.push({
          text: text.substring(actualStart, actualEnd),
          start: actualStart,
          end: actualEnd
        })
      }
    } else {
      // 按句子边界分割
      sentenceEndings.unshift(0)
      sentenceEndings.push(segment.length)
      
      for (let j = 0; j < sentenceEndings.length - 1; j++) {
        const subStartRel = sentenceEndings[j]
        let subEndRel = sentenceEndings[j + 1]
        
        // 跳过开头空白
        let actualStartRel = subStartRel
        while (actualStartRel < subEndRel && /\s/.test(segment[actualStartRel])) {
          actualStartRel++
        }
        
        // 跳过结尾空白
        let actualEndRel = subEndRel
        while (actualEndRel > actualStartRel && /\s/.test(segment[actualEndRel - 1])) {
          actualEndRel--
        }
        
        if (actualStartRel < actualEndRel) {
          const actualStart = segStart + actualStartRel
          const actualEnd = segStart + actualEndRel
          sentences.push({
            text: text.substring(actualStart, actualEnd),
            start: actualStart,
            end: actualEnd
          })
        }
      }
    }
  }
  
  // 如果没有分出任何句子，返回整个文本作为一个句子
  if (sentences.length === 0) {
    const trimmedText = text.trim()
    if (trimmedText) {
      const startOffset = text.indexOf(trimmedText)
      sentences.push({
        text: trimmedText,
        start: startOffset,
        end: startOffset + trimmedText.length
      })
    } else {
      sentences.push({ text: text, start: 0, end: text.length })
    }
  }
  
  // 排序并去重
  sentences.sort((a, b) => a.start - b.start)
  
  return sentences
}

/**
 * 计算标注层级 - 大标签分配到第0层（最靠近文本）
 */
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
 * 检查交叉重叠
 */
function checkPartialOverlap(
  newStart: number,
  newEnd: number,
  existingStart: number,
  existingEnd: number
): boolean {
  if (newEnd <= existingStart || newStart >= existingEnd) {
    return false
  }
  if ((newStart >= existingStart && newEnd <= existingEnd) ||
      (existingStart >= newStart && existingEnd <= newEnd)) {
    return false
  }
  return true
}

const TextAnnotator = forwardRef<TextAnnotatorRef, TextAnnotatorProps>(({
  text,
  annotations,
  selectedLabel,
  onAnnotationAdd,
  onAnnotationRemove,
  readOnly = false,
  sentences: externalSentences,
  searchHighlights = []
}, ref) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const containerRef = useRef<HTMLDivElement>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [blockPositions, setBlockPositions] = useState<Map<string, Map<string, { left: number; width: number }>>>(new Map())

  // 暴露 ref 方法
  useImperativeHandle(ref, () => ({
    getContainer: () => containerRef.current
  }))

  // 获取句子（SpaCy 或 fallback）- 动态重新对齐索引
  const sentences = useMemo(() => {
    if (externalSentences && externalSentences.length > 0) {
      // Re-align sentence indices to match the actual text prop
      // SpaCy data may have been generated with \r\n (2 chars) but text prop uses \n (1 char)
      // We need to find each sentence's actual position in the normalized text
      const realignedSentences: SpacySentence[] = []
      let searchStart = 0
      
      for (const sent of externalSentences) {
        // Normalize sentence text (remove \r)
        const normalizedSentText = sent.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        
        // Find this sentence in the text starting from last position
        const foundIdx = text.indexOf(normalizedSentText, searchStart)
        
        if (foundIdx !== -1) {
          realignedSentences.push({
            text: normalizedSentText,
            start: foundIdx,
            end: foundIdx + normalizedSentText.length
          })
          searchStart = foundIdx + normalizedSentText.length
        } else {
          // Fallback: try fuzzy match by finding the start of the sentence
          const firstWords = normalizedSentText.substring(0, Math.min(30, normalizedSentText.length))
          const fuzzyIdx = text.indexOf(firstWords, searchStart)
          if (fuzzyIdx !== -1) {
            realignedSentences.push({
              text: normalizedSentText,
              start: fuzzyIdx,
              end: fuzzyIdx + normalizedSentText.length
            })
            searchStart = fuzzyIdx + normalizedSentText.length
          } else {
            // Last resort: use original indices but with text normalization
            realignedSentences.push({
              text: normalizedSentText,
              start: sent.start,
              end: sent.start + normalizedSentText.length
            })
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
      const sentAnnotations = annotations.filter(ann => {
        return ann.startPosition >= sent.start && ann.endPosition <= sent.end
      })
      result.set(sentIdx, sentAnnotations)
    })
    
    return result
  }, [sentences, annotations])

  // 计算每句的标注层级
  const layersBySentence = useMemo(() => {
    const result = new Map<number, Map<string, number>>()
    
    sentences.forEach((sent, sentIdx) => {
      const sentAnnotations = annotationsBySentence.get(sentIdx) || []
      result.set(sentIdx, calculateAnnotationLayers(sentAnnotations, sent.start))
    })
    
    return result
  }, [sentences, annotationsBySentence])

  // 获取每句最大层数
  const maxLayersBySentence = useMemo(() => {
    const result = new Map<number, number>()
    
    layersBySentence.forEach((layers, sentIdx) => {
      const maxLayer = Math.max(...Array.from(layers.values()), -1)
      result.set(sentIdx, maxLayer + 1)
    })
    
    return result
  }, [layersBySentence])

  // 渲染后测量标签块位置
  useEffect(() => {
    if (!containerRef.current || annotations.length === 0) {
      setBlockPositions(new Map())
      return
    }

    const measurePositions = () => {
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
            const relEnd = ann.endPosition - sent.start
            
            range.setStart(textNode, Math.min(relStart, sent.text.length))
            range.setEnd(textNode, Math.min(relEnd, sent.text.length))
            const rect = range.getBoundingClientRect()
            const containerRect = sentTextEl.getBoundingClientRect()
            
            sentPositions.set(ann.id, {
              left: rect.left - containerRect.left,
              width: rect.width
            })
          } catch (e) {
            const charWidth = 8
            const relStart = ann.startPosition - sent.start
            sentPositions.set(ann.id, {
              left: relStart * charWidth,
              width: (ann.endPosition - ann.startPosition) * charWidth
            })
          }
        }
        
        positions.set(sentIdx.toString(), sentPositions)
      })
      
      setBlockPositions(positions)
    }

    requestAnimationFrame(measurePositions)
    
    window.addEventListener('resize', measurePositions)
    return () => window.removeEventListener('resize', measurePositions)
  }, [annotations, sentences, annotationsBySentence])

  // 处理文本选择
  const handleMouseUp = useCallback((sentIdx: number, sentStart: number) => {
    if (readOnly || !selectedLabel) return

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const selectedText = selection.toString().trim()
    if (!selectedText) return

    const range = selection.getRangeAt(0)
    const sentTextEl = containerRef.current?.querySelector(`[data-sentence-idx="${sentIdx}"] .sentence-text`)
    
    if (!sentTextEl || !sentTextEl.contains(range.commonAncestorContainer)) {
      return
    }

    const preCaretRange = document.createRange()
    preCaretRange.selectNodeContents(sentTextEl)
    preCaretRange.setEnd(range.startContainer, range.startOffset)
    
    const relativeStart = preCaretRange.toString().length
    const start = sentStart + relativeStart
    const end = start + selectedText.length

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

    for (const ann of annotations) {
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
  }, [text, annotations, selectedLabel, onAnnotationAdd, readOnly, t])

  // 点击标签块删除
  const handleBlockClick = useCallback((ann: Annotation, e: React.MouseEvent) => {
    if (readOnly) return
    if (ann.id.startsWith('spacy-')) return
    
    e.stopPropagation()
    
    if (confirm(t('annotation.confirmDelete', `确定删除标注 "${ann.label}: ${ann.text}"？`))) {
      onAnnotationRemove(ann.id)
    }
  }, [onAnnotationRemove, readOnly, t])
  
  // 渲染带搜索高亮的文本
  const renderHighlightedText = useCallback((sentText: string, sentStart: number) => {
    if (searchHighlights.length === 0) {
      return sentText
    }
    
    // 筛选在当前句子范围内的高亮
    const sentEnd = sentStart + sentText.length
    const relevantHighlights = searchHighlights.filter(
      h => h.start >= sentStart && h.end <= sentEnd
    ).map(h => ({
      start: h.start - sentStart,
      end: h.end - sentStart
    })).sort((a, b) => a.start - b.start)
    
    if (relevantHighlights.length === 0) {
      return sentText
    }
    
    // 分割文本并添加高亮
    const parts: React.ReactNode[] = []
    let lastEnd = 0
    
    for (let i = 0; i < relevantHighlights.length; i++) {
      const { start, end } = relevantHighlights[i]
      
      // 添加高亮前的普通文本
      if (start > lastEnd) {
        parts.push(sentText.substring(lastEnd, start))
      }
      
      // 添加高亮文本
      parts.push(
        <Box
          key={`highlight-${sentStart}-${i}`}
          component="span"
          sx={{
            backgroundColor: '#ffeb3b',
            color: '#000',
            borderRadius: '2px',
            px: '1px'
          }}
        >
          {sentText.substring(start, end)}
        </Box>
      )
      
      lastEnd = end
    }
    
    // 添加最后的普通文本
    if (lastEnd < sentText.length) {
      parts.push(sentText.substring(lastEnd))
    }
    
    return parts
  }, [searchHighlights])

  if (!text) {
    return (
      <Paper
        sx={{
          p: 3,
          minHeight: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
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

      {/* 操作提示 */}
      {!readOnly && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {selectedLabel 
            ? t('annotation.selectToAnnotate', `选中文本以使用 "${selectedLabel.node.name}" 标注。点击标签块可删除。`)
            : t('annotation.selectLabelFirst', '请先从框架树选择一个标签')
          }
        </Typography>
      )}

      {/* 文本容器 - 整体滚动 */}
      <Paper
        ref={containerRef}
        className="text-annotation-container"
        sx={{
          p: 1.5,
          bgcolor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafafa',
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : '#e0e0e0'}`,
          borderRadius: 1,
          maxHeight: 500,
          overflow: 'auto'  // 整体滚动
        }}
      >
        {sentences.map((sent, sentIdx) => {
          const sentAnnotations = annotationsBySentence.get(sentIdx) || []
          const layers = layersBySentence.get(sentIdx) || new Map()
          const maxLayers = maxLayersBySentence.get(sentIdx) || 0
          const sentPositions = blockPositions.get(sentIdx.toString()) || new Map()
          
          // 句子色条颜色
          const userAnnotations = sentAnnotations.filter(a => !a.id.startsWith('spacy-'))
          const hasAnnotation = userAnnotations.length > 0
          const barColor = hasAnnotation ? (userAnnotations[0]?.color || '#2196F3') : '#bdbdbd'

          // 计算总高度
          const totalHeight = 28 + (maxLayers * 26)

          return (
            <Box
              key={sentIdx}
              data-sentence-idx={sentIdx}
              className="sentence-row"
              sx={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
                mb: 0.5,
                minHeight: 28
              }}
            >
              {/* 左侧色条 */}
              <Box
                className="color-bar"
                sx={{
                  width: 4,
                  minHeight: totalHeight,
                  borderRadius: '2px',
                  mr: 1,
                  flexShrink: 0,
                  bgcolor: barColor,
                  alignSelf: 'stretch'
                }}
              />
              
              {/* 句子内容 */}
              <Box
                className="sentence-content"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minWidth: 0
                }}
              >
                {/* 句子文本 - 不换行 */}
                <Box
                  className="sentence-text"
                  onMouseUp={() => handleMouseUp(sentIdx, sent.start)}
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
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      minHeight: 0
                    }}
                  >
                    {Array.from({ length: maxLayers }).map((_, layerIdx) => {
                      const layerAnnotations = sentAnnotations.filter(
                        ann => layers.get(ann.id) === layerIdx
                      )
                      
                      if (layerAnnotations.length === 0) return null

                      return (
                        <Box
                          key={layerIdx}
                          className="annotation-layer"
                          sx={{
                            position: 'relative',
                            height: 24,
                            mt: '2px'
                          }}
                        >
                          {layerAnnotations.map(ann => {
                            const pos = sentPositions.get(ann.id)
                            const isSpacy = ann.id.startsWith('spacy-')
                            
                            return (
                              <Box
                                key={ann.id}
                                className="annotation-block"
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
                                  cursor: readOnly || isSpacy ? 'default' : 'pointer',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  px: '2px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                  bgcolor: ann.color || '#2196F3',
                                  opacity: isSpacy ? 0.6 : (pos ? 1 : 0),
                                  left: pos?.left ?? 0,
                                  width: pos?.width ?? 'auto',
                                  transition: 'transform 0.1s, box-shadow 0.1s, opacity 0.2s',
                                  '&:hover': readOnly || isSpacy ? {} : {
                                    transform: 'translateY(-1px)',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                    zIndex: 10
                                  }
                                }}
                                title={isSpacy 
                                  ? `${ann.label}: ${ann.text} (SpaCy)` 
                                  : `${ann.label}: ${ann.text}`
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
        })}
      </Paper>

      {/* 标注统计 */}
      {annotations.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          {annotations.filter(a => !a.id.startsWith('spacy-')).length} {t('annotation.annotationCount', '条标注')}，{sentences.length} {t('annotation.sentenceCount', '个句子')}
        </Typography>
      )}
    </Box>
  )
})

TextAnnotator.displayName = 'TextAnnotator'

export default TextAnnotator

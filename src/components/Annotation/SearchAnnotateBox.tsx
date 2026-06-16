/**
 * SearchAnnotateBox - 搜索标注框组件
 *
 * 功能：
 * - 提供搜索输入框
 * - 精确词语匹配搜索（全词匹配）
 * - 可选 CQL 模式（扳手图标打开 CQL 构建器）
 * - 显示匹配数量
 * - 回车触发批量标注
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Tooltip
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import BuildIcon from '@mui/icons-material/Build'
import { useTranslation } from 'react-i18next'
import { collocationApi } from '../../api/collocation'
import { CQLBuilderDialog } from '../../pages/Collocation/components/CQLBuilder'
import type { Annotation } from '../../types'

export interface SearchMatch {
  start: number
  end: number
  text: string
}

interface SearchAnnotateBoxProps {
  text: string
  onSearchChange: (searchTerm: string, matches: SearchMatch[]) => void
  onConfirmAnnotate: (matches: SearchMatch[]) => void
  disabled?: boolean
  placeholder?: string
  /** corpus id for CQL backend search */
  corpusId?: string
  /** text id for CQL backend search */
  textId?: string
  /** current annotation labels (for annotation attribute in CQL) */
  currentAnnotations?: Annotation[]
  /** all unique labels used in current framework annotations */
  frameworkLabels?: string[]
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 检测文本是否包含中文字符
 */
function containsChinese(text: string): boolean {
  return /[一-鿿]/.test(text)
}

/**
 * 执行精确词语搜索
 * - 英文：使用词边界 \b
 * - 中文：直接字符串匹配
 */
function findExactMatches(searchTerm: string, text: string): SearchMatch[] {
  if (!searchTerm || !text) return []

  const matches: SearchMatch[] = []
  const isChinese = containsChinese(searchTerm)

  if (isChinese) {
    // 中文：直接字符串搜索
    let startIndex = 0
    while (true) {
      const index = text.indexOf(searchTerm, startIndex)
      if (index === -1) break

      matches.push({
        start: index,
        end: index + searchTerm.length,
        text: searchTerm
      })
      startIndex = index + 1
    }
  } else {
    // 英文：使用词边界正则
    try {
      const escapedTerm = escapeRegex(searchTerm)
      const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi')
      let match

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        })
      }
    } catch (e) {
      console.error('Regex error:', e)
    }
  }

  return matches
}

/**
 * Check if CQL contains only annotation attribute conditions (AND or OR logic).
 * Returns { labels, logic } if the entire query is purely annotation conditions,
 * or null if any condition involves a different attribute (falls back to backend).
 */
function extractAnnotationQuery(cql: string): { labels: string[]; logic: 'and' | 'or' } | null {
  const trimmed = cql.trim()
  const innerMatch = trimmed.match(/^\[(.+)\]$/)
  if (!innerMatch) return null
  const inner = innerMatch[1].trim()

  const annRe = /^annotation=="([^"]+)"$/

  // Try AND split first
  const andParts = inner.split(/\s*&\s*/)
  if (andParts.length > 0 && andParts.every(p => annRe.test(p.trim()))) {
    const labels = andParts.map(p => p.trim().match(annRe)![1])
    return { labels, logic: 'and' }
  }

  // Try OR split
  const orParts = inner.split(/\s*\|\s*/)
  if (orParts.length > 1 && orParts.every(p => annRe.test(p.trim()))) {
    const labels = orParts.map(p => p.trim().match(annRe)![1])
    return { labels, logic: 'or' }
  }

  return null
}

/**
 * Evaluate annotation query client-side.
 * AND logic: returns spans where ALL required labels co-exist on the same position.
 * OR  logic: returns spans that carry any of the required labels.
 */
function matchAnnotationLabels(
  labels: string[],
  logic: 'and' | 'or',
  annotations: Annotation[]
): SearchMatch[] {
  if (logic === 'or') {
    return annotations
      .filter(ann => labels.includes(ann.label))
      .map(ann => ({ start: ann.startPosition, end: ann.endPosition, text: ann.text }))
  }

  // AND: group annotations by span, keep spans that have every required label
  const spanMap = new Map<string, { labelsPresent: Set<string>; ann: Annotation }>()
  for (const ann of annotations) {
    const key = `${ann.startPosition}-${ann.endPosition}`
    if (!spanMap.has(key)) spanMap.set(key, { labelsPresent: new Set(), ann })
    spanMap.get(key)!.labelsPresent.add(ann.label)
  }

  const matches: SearchMatch[] = []
  for (const { labelsPresent, ann } of spanMap.values()) {
    if (labels.every(l => labelsPresent.has(l))) {
      matches.push({ start: ann.startPosition, end: ann.endPosition, text: ann.text })
    }
  }
  return matches
}

export default function SearchAnnotateBox({
  text,
  onSearchChange,
  onConfirmAnnotate,
  disabled = false,
  placeholder,
  corpusId,
  textId,
  currentAnnotations = [],
  frameworkLabels = []
}: SearchAnnotateBoxProps) {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [cqlBuilderOpen, setCqlBuilderOpen] = useState(false)
  const [isCqlMode, setIsCqlMode] = useState(false)
  const [cqlError, setCqlError] = useState<string | null>(null)
  const [cqlLoading, setCqlLoading] = useState(false)

  // 处理搜索词变化 (plain text mode)
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
    setIsCqlMode(false)
    setCqlError(null)
    const newMatches = findExactMatches(value, text)
    setMatches(newMatches)
    onSearchChange(value, newMatches)
  }, [text, onSearchChange])

  // 处理回车确认
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && matches.length > 0) {
      e.preventDefault()
      onConfirmAnnotate(matches)
    }
  }, [matches, onConfirmAnnotate])

  // 清除搜索
  const handleClear = useCallback(() => {
    setSearchTerm('')
    setMatches([])
    setIsCqlMode(false)
    setCqlError(null)
    onSearchChange('', [])
  }, [onSearchChange])

  // Handle CQL applied from builder
  const handleCqlApply = useCallback(async (cql: string) => {
    setSearchTerm(cql)
    setIsCqlMode(true)
    setCqlError(null)

    // Check for annotation-only query (client-side)
    const annQuery = extractAnnotationQuery(cql)
    if (annQuery) {
      const newMatches = matchAnnotationLabels(annQuery.labels, annQuery.logic, currentAnnotations)
      setMatches(newMatches)
      onSearchChange(cql, newMatches)
      return
    }

    // Otherwise use backend CQL search
    if (!corpusId || !textId) {
      setCqlError(t('annotation.cqlNeedsCorpus', '请先选择语料库文本以使用 CQL 搜索'))
      setMatches([])
      onSearchChange(cql, [])
      return
    }

    setCqlLoading(true)
    try {
      const response = await collocationApi.searchKWIC({
        corpus_id: corpusId,
        text_ids: [textId],
        search_mode: 'cql',
        search_value: cql,
        context_size: 0,
        max_results: 9999
      })

      if (response.success && response.data?.results) {
        const newMatches: SearchMatch[] = []
        for (const result of response.data.results) {
          if (result.matched_tokens && result.matched_tokens.length > 0) {
            const first = result.matched_tokens[0]
            const last = result.matched_tokens[result.matched_tokens.length - 1]
            if (first.start !== undefined && last.end !== undefined) {
              newMatches.push({
                start: first.start,
                end: last.end,
                text: result.matched_tokens.map(t => t.text).join(' ')
              })
            }
          }
        }
        setMatches(newMatches)
        onSearchChange(cql, newMatches)
      } else {
        setCqlError(response.data?.error || t('annotation.cqlSearchFailed', 'CQL 搜索失败'))
        setMatches([])
        onSearchChange(cql, [])
      }
    } catch (err) {
      setCqlError(t('annotation.cqlSearchFailed', 'CQL 搜索失败'))
      setMatches([])
      onSearchChange(cql, [])
    } finally {
      setCqlLoading(false)
    }
  }, [corpusId, textId, currentAnnotations, onSearchChange, t])

  // 当文本变化时重新搜索 (plain text mode only)
  useEffect(() => {
    if (searchTerm && !isCqlMode) {
      const newMatches = findExactMatches(searchTerm, text)
      setMatches(newMatches)
      onSearchChange(searchTerm, newMatches)
    }
  }, [text])

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <TextField
        size="small"
        value={searchTerm}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || cqlLoading}
        placeholder={placeholder || t('annotation.searchPlaceholder', '搜索词语...')}
        sx={{ minWidth: 200 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color={isCqlMode ? 'primary' : 'action'} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {searchTerm && (
                <IconButton size="small" onClick={handleClear} edge={false}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              )}
              <Tooltip title={t('annotation.openCqlBuilder', '打开 CQL 构建器')}>
                <IconButton
                  size="small"
                  onClick={() => setCqlBuilderOpen(true)}
                  disabled={disabled}
                  color={isCqlMode ? 'primary' : 'default'}
                  edge="end"
                >
                  <BuildIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          )
        }}
      />

      {/* Status chips */}
      {cqlLoading && (
        <Chip
          label={t('annotation.cqlSearching', 'CQL 搜索中...')}
          size="small"
          color="info"
          variant="outlined"
        />
      )}

      {!cqlLoading && matches.length > 0 && (
        <Tooltip title={t('annotation.pressEnterToAnnotate', '按回车键批量标注')}>
          <Chip
            label={t('annotation.matchCount', '{{count}} 处匹配', { count: matches.length })}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Tooltip>
      )}

      {!cqlLoading && searchTerm && matches.length === 0 && !cqlError && (
        <Chip
          label={t('annotation.noMatches', '未找到匹配')}
          size="small"
          color="default"
          variant="outlined"
        />
      )}

      {cqlError && (
        <Tooltip title={cqlError}>
          <Chip
            label={t('annotation.cqlError', 'CQL 错误')}
            size="small"
            color="error"
            variant="outlined"
          />
        </Tooltip>
      )}

      {/* CQL Builder Dialog */}
      <CQLBuilderDialog
        open={cqlBuilderOpen}
        onClose={() => setCqlBuilderOpen(false)}
        onApply={handleCqlApply}
        initialCQL={searchTerm || undefined}
        annotationLabels={frameworkLabels}
      />
    </Box>
  )
}

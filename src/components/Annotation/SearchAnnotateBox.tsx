/**
 * SearchAnnotateBox - 搜索标注框组件
 *
 * 功能：
 * - 提供搜索输入框
 * - 精确词语匹配搜索（全词匹配）
 * - CQL 自动识别：输入完整 CQL 表达式（[...] 形式）时实时按 CQL 求值（防抖）
 * - 可选 CQL 模式（扳手图标打开 CQL 构建器）
 * - 显示匹配数量
 * - 回车触发批量标注
 */

import { useState, useCallback, useEffect, useRef } from 'react'
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
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { useTranslation } from 'react-i18next'
import { collocationApi } from '../../api/collocation'
import { CQLBuilderDialog } from '../../pages/Collocation/components/CQLBuilder'
import type { Annotation } from '../../types'
import {
  isAnnotationQuery,
  evaluateAnnotationQuery,
  AnnotationQueryError,
  type SearchMatch
} from './annotationQuery'
import {
  evaluateAnnotationTokenQuery,
  referencesTokenAttribute,
  TokenQueryError,
  type QueryToken
} from './annotationTokenQuery'

export type { SearchMatch }

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
  /** SpaCy tokens (for mixing annotation with word/lemma/pos/tag/dep client-side) */
  tokens?: QueryToken[]
  /** 当前定位的匹配序号（从 0 起；-1 表示无）。用于「n/total」指示与上下箭头跳转 */
  matchIndex?: number
  /** 上下箭头/按钮跳转匹配：dir=1 下一个，dir=-1 上一个 */
  onNavigate?: (dir: 1 | -1) => void
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
 * 判断输入是否是一个"看起来完整"的 CQL 表达式，用于输入时自动识别：
 * 以 [ 开头，且以 ]（可带 {n,m} / * / + / ? 量词）或 within/containing 子句结尾。
 * 输入中途的不完整形式（如 `[word=`）不会触发求值，避免报错噪音。
 */
function looksLikeCompleteCql(value: string): boolean {
  const v = value.trim()
  if (!v.startsWith('[')) return false
  if (/\](\s*(\{\d+(,\d*)?\}|[*+?]))?$/.test(v)) return true
  if (/\b(within|containing)\b[\s\S]*\S$/.test(v) && v.includes(']')) return true
  return false
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

export default function SearchAnnotateBox({
  text,
  onSearchChange,
  onConfirmAnnotate,
  disabled = false,
  placeholder,
  corpusId,
  textId,
  currentAnnotations = [],
  frameworkLabels = [],
  tokens = [],
  matchIndex = -1,
  onNavigate
}: SearchAnnotateBoxProps) {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [cqlBuilderOpen, setCqlBuilderOpen] = useState(false)
  const [isCqlMode, setIsCqlMode] = useState(false)
  const [cqlError, setCqlError] = useState<string | null>(null)
  const [cqlLoading, setCqlLoading] = useState(false)

  // 输入时自动识别 CQL：防抖计时器 + 最新 handleCqlApply 的引用
  const cqlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleCqlApplyRef = useRef<(cql: string) => void>(() => {})

  const clearCqlDebounce = useCallback(() => {
    if (cqlDebounceRef.current) {
      clearTimeout(cqlDebounceRef.current)
      cqlDebounceRef.current = null
    }
  }, [])

  useEffect(() => clearCqlDebounce, [clearCqlDebounce])

  // 处理搜索词变化：完整 CQL 表达式自动按 CQL 求值（防抖），否则精确词语搜索
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
    clearCqlDebounce()
    if (looksLikeCompleteCql(value)) {
      cqlDebounceRef.current = setTimeout(() => {
        cqlDebounceRef.current = null
        handleCqlApplyRef.current(value)
      }, 400)
      return
    }
    setIsCqlMode(false)
    setCqlError(null)
    const newMatches = findExactMatches(value, text)
    setMatches(newMatches)
    onSearchChange(value, newMatches)
  }, [text, onSearchChange, clearCqlDebounce])

  // 处理回车确认 + 上下箭头按顺序定位匹配；回车可立即触发待求值的 CQL
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (cqlDebounceRef.current && looksLikeCompleteCql(searchTerm)) {
        e.preventDefault()
        clearCqlDebounce()
        handleCqlApplyRef.current(searchTerm)
        return
      }
      if (matches.length > 0) {
        e.preventDefault()
        onConfirmAnnotate(matches)
      }
    } else if (e.key === 'ArrowDown' && matches.length > 0 && onNavigate) {
      e.preventDefault()
      onNavigate(1)
    } else if (e.key === 'ArrowUp' && matches.length > 0 && onNavigate) {
      e.preventDefault()
      onNavigate(-1)
    }
  }, [matches, searchTerm, onConfirmAnnotate, onNavigate, clearCqlDebounce])

  // 清除搜索
  const handleClear = useCallback(() => {
    clearCqlDebounce()
    setSearchTerm('')
    setMatches([])
    setIsCqlMode(false)
    setCqlError(null)
    onSearchChange('', [])
  }, [onSearchChange, clearCqlDebounce])

  // Handle CQL applied from builder
  const handleCqlApply = useCallback(async (cql: string) => {
    setSearchTerm(cql)
    setIsCqlMode(true)
    setCqlError(null)

    // Annotation-attribute queries must be evaluated client-side: the backend CQL
    // engine has no `annotation` attribute.
    // - Pure annotation queries → span-level evaluator (annotationQuery): AND/OR/NOT,
    //   == / != / = / !==, containing / within / !containing / !within.
    // - Mixed with word/lemma/pos/tag/dep → token-level evaluator (annotationTokenQuery),
    //   using the loaded SpaCy tokens; each token carries the labels covering it.
    if (isAnnotationQuery(cql)) {
      try {
        let newMatches: SearchMatch[]
        if (referencesTokenAttribute(cql)) {
          if (tokens.length === 0) {
            setCqlError(t('annotation.annNeedsTokens', '混用查询需要 SpaCy 标注数据，请先上传或重新标注文本'))
            setMatches([])
            onSearchChange(cql, [])
            return
          }
          newMatches = evaluateAnnotationTokenQuery(cql, tokens, currentAnnotations)
        } else {
          newMatches = evaluateAnnotationQuery(cql, currentAnnotations)
        }
        setMatches(newMatches)
        onSearchChange(cql, newMatches)
      } catch (err) {
        let msg = t('annotation.cqlSearchFailed', 'CQL 搜索失败')
        if (err instanceof AnnotationQueryError) {
          if (err.code === 'mixed') {
            msg = t('annotation.annMixedAttr', '标注标签仅支持与 word/lemma/pos/tag/dep 混用')
          } else if (err.code === 'unsupported') {
            msg = t('annotation.annUnsupported', 'annotation 查询暂不支持该高级语法（序列/距离/meet/结构等）')
          } else {
            msg = t('annotation.annParseError', 'annotation 查询语法错误')
          }
        } else if (err instanceof TokenQueryError) {
          if (err.code === 'unsupported_attr') {
            msg = t('annotation.annMixedAttr', '标注标签仅支持与 word/lemma/pos/tag/dep 混用')
          } else if (err.code === 'unsupported') {
            msg = t('annotation.annUnsupported', 'annotation 查询暂不支持该高级语法（序列/距离/meet/结构等）')
          } else {
            msg = t('annotation.annParseError', 'annotation 查询语法错误')
          }
        }
        setCqlError(msg)
        setMatches([])
        onSearchChange(cql, [])
      }
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
  }, [corpusId, textId, currentAnnotations, tokens, onSearchChange, t])

  // 保持输入自动识别路径始终调用最新的 handleCqlApply
  handleCqlApplyRef.current = handleCqlApply

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={t('annotation.pressEnterToAnnotate', '按回车键批量标注')}>
            <Chip
              label={onNavigate && matchIndex >= 0
                ? `${matchIndex + 1}/${matches.length}`
                : t('annotation.matchCount', '{{count}} 处匹配', { count: matches.length })}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Tooltip>
          {onNavigate && (
            <>
              <Tooltip title={t('annotation.prevMatch', '上一个匹配 (↑)')}>
                <IconButton size="small" onClick={() => onNavigate(-1)}>
                  <KeyboardArrowUpIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('annotation.nextMatch', '下一个匹配 (↓)')}>
                <IconButton size="small" onClick={() => onNavigate(1)}>
                  <KeyboardArrowDownIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
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

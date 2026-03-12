/**
 * Concordance results table (KWIC)
 * KWIC concordance display with colored context markers, row expand for extended context
 * Table columns: # | Source | Left Context | KWIC | Right Context | Actions
 */

import React, { useState, useMemo, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Tooltip,
  Chip,
  Stack,
  Button,
  Collapse,
  LinearProgress,
  Alert,
  Switch,
  FormControlLabel
} from '@mui/material'
import SortIcon from '@mui/icons-material/Sort'
import FilterListIcon from '@mui/icons-material/FilterList'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import { useTranslation } from 'react-i18next'
import { collocationApi } from '../../../api'
import type { KWICResult, SortMode } from '../../../types/collocation'
import CollocationSortDialog from './CollocationSortDialog'
import CollocationFilterDialog, { FilterConfig } from './CollocationFilterDialog'

// Import SortMode type for use in onApply

interface CollocationResultsTableProps {
  results: KWICResult[]
  totalCount: number
  corpusId: string
  isLoading?: boolean
  sortBy: SortMode
  sortLevels: string[]
  sortDescending: boolean
  onSortByChange: (sortBy: SortMode) => void
  onSortLevelsChange: (levels: string[]) => void
  onSortDescendingChange: (descending: boolean) => void
  onResort: () => void
  onSortChangeAndResort?: (sortBy: SortMode, sortLevels: string[], sortDescending: boolean) => void
  page?: number
  rowsPerPage?: number
  onPageChange?: (page: number) => void
  onRowsPerPageChange?: (rowsPerPage: number) => void
  /** Words to highlight in context (e.g., collocate words from Word Sketch) */
  highlightWords?: string[]
  /** Show metaphor highlighting */
  showMetaphorHighlight?: boolean
  /** Callback when metaphor highlighting changes */
  onShowMetaphorHighlightChange?: (show: boolean) => void
  /** When set, table will switch to the page containing this result and scroll the row into view */
  scrollToResult?: KWICResult | null
  /** Called after scroll-to-result has been applied (parent can clear scrollToResult) */
  onScrollToResultHandled?: () => void
}

// Color classes for context words (positions 1, 2, 3)
const CONTEXT_COLORS = ['#d32f2f', '#4caf50', '#9c27b0'] // red, green, purple

// Extended context row component
function ExtendedContextRow({
  result,
  corpusId,
  open,
  isZh,
  highlightWords = []
}: {
  result: KWICResult
  corpusId: string
  open: boolean
  isZh: boolean
  highlightWords?: string[]
}) {
  const [contextChars, setContextChars] = useState(200)
  const [extendedContext, setExtendedContext] = useState<string | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)

  // Build extended context HTML using precise span-based highlighting from backend
  // The backend returns collocate_spans (lemma-matched character positions) so we don't need
  // regex guessing — all highlighting is based on SpaCy metadata.
  // highlight_start/highlight_end marks the CQL-matched keyword position.
  // When swap occurred (result.keyword differs from backend keyword), we also mark the center word.
  const buildExtendedHtml = (
    text: string,
    backendHighlightStart: number,
    backendHighlightEnd: number,
    backendKeyword: string,
    collocateSpans?: Array<{ start: number; end: number; text: string }>
  ): string => {
    const swappedKeyword = result.keyword
    // Determine if a keyword swap occurred (collocate analysis mode).
    // A swap means the backend highlight marks the collocate, not the center keyword.
    // For multi-word keywords (N-grams), the backend keyword extracted from raw text may
    // contain punctuation (e.g., "every person, home") while result.keyword built from
    // token joining has different spacing (e.g., "every person , home"). Normalize by
    // stripping all non-alphanumeric chars and comparing only word content.
    const normalizeForCompare = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim()
    const isSwapped = normalizeForCompare(backendKeyword) !== normalizeForCompare(swappedKeyword)
      // Also check: if one is a substring of the other, it's a partial match, not a true swap
      && !normalizeForCompare(swappedKeyword).includes(normalizeForCompare(backendKeyword))
      && !normalizeForCompare(backendKeyword).includes(normalizeForCompare(swappedKeyword))

    // Collect all spans to apply: { start, end, type: 'keyword' | 'collocate' }
    type Span = { start: number; end: number; type: 'keyword' | 'collocate' }
    const spans: Span[] = []

    if (!isSwapped) {
      // No swap: the backend highlight marks the center keyword
      spans.push({ start: backendHighlightStart, end: backendHighlightEnd, type: 'keyword' })
    } else {
      // Swap: CQL-matched token is the collocate, find center keyword by text match
      // The backend highlight marks the collocate (e.g. "digital"), add it as collocate span
      spans.push({ start: backendHighlightStart, end: backendHighlightEnd, type: 'collocate' })
      // Find the swapped keyword (center word like "technologies") near the collocate
      const escaped = swappedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
      let match: RegExpExecArray | null
      while ((match = regex.exec(text)) !== null) {
        spans.push({ start: match.index, end: match.index + match[0].length, type: 'keyword' })
      }
    }

    // Add backend-provided collocate spans (lemma-matched via SpaCy metadata)
    if (collocateSpans && collocateSpans.length > 0) {
      for (const span of collocateSpans) {
        // Don't add if it overlaps with the keyword span
        const overlapsKeyword = spans.some(
          s => s.type === 'keyword' && span.start < s.end && span.end > s.start
        )
        if (!overlapsKeyword) {
          spans.push({ start: span.start, end: span.end, type: 'collocate' })
        }
      }
    }

    // Sort spans by start position, then render
    spans.sort((a, b) => a.start - b.start)

    // Remove overlapping spans (keep earlier/higher priority)
    const nonOverlapping: Span[] = []
    for (const span of spans) {
      const last = nonOverlapping[nonOverlapping.length - 1]
      if (!last || span.start >= last.end) {
        nonOverlapping.push(span)
      }
    }

    // Build HTML by inserting tags at span boundaries
    let html = ''
    let pos = 0
    for (const span of nonOverlapping) {
      // Escape text between spans
      if (span.start > pos) {
        html += escapeHtml(text.substring(pos, span.start))
      }
      const spanText = escapeHtml(text.substring(span.start, span.end))
      if (span.type === 'keyword') {
        html += `<mark>${spanText}</mark>`
      } else {
        html += `<span class="collocate-highlight">${spanText}</span>`
      }
      pos = span.end
    }
    if (pos < text.length) {
      html += escapeHtml(text.substring(pos))
    }

    return html
  }

  // Simple HTML escaping for plain text segments
  const escapeHtml = (s: string): string => {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // Fetch extended context from backend with highlight_lemmas for precise span detection
  const fetchExtendedContext = async (chars: number) => {
    return await collocationApi.getExtendedContext({
      corpus_id: corpusId,
      text_id: result.text_id,
      position: result.position,
      context_chars: chars,
      highlight_lemmas: highlightWords && highlightWords.length > 0 ? highlightWords : undefined,
      keyword: result.keyword  // Pass full keyword (including multi-word N-grams) for accurate highlighting
    })
  }

  // Load extended context when opened
  const loadExtendedContext = async () => {
    if (extendedContext) return

    setContextLoading(true)
    setContextError(null)

    try {
      const response = await fetchExtendedContext(contextChars)

      if (response.success && response.data?.success) {
        const { text, highlight_start, highlight_end, keyword: backendKeyword, collocate_spans } = response.data
        if (text && highlight_start !== undefined && highlight_end !== undefined) {
          setExtendedContext(buildExtendedHtml(text, highlight_start, highlight_end, backendKeyword || '', collocate_spans || undefined))
        } else {
          setExtendedContext(escapeHtml(text || ''))
        }
      } else {
        setContextError(response.data?.error || response.error || 'Failed to load context')
      }
    } catch (err: any) {
      setContextError(err.message || 'Failed to load context')
    } finally {
      setContextLoading(false)
    }
  }

  // Load on first open
  if (open && !extendedContext && !contextLoading && !contextError) {
    loadExtendedContext()
  }

  const handleExpandMore = async (direction: 'before' | 'after') => {
    const newChars = contextChars + 100
    setContextChars(newChars)
    setExtendedContext(null)
    setContextLoading(true)

    try {
      const response = await fetchExtendedContext(newChars)

      if (response.success && response.data?.success) {
        const { text, highlight_start, highlight_end, keyword: backendKeyword, collocate_spans } = response.data
        if (text && highlight_start !== undefined && highlight_end !== undefined) {
          setExtendedContext(buildExtendedHtml(text, highlight_start, highlight_end, backendKeyword || '', collocate_spans || undefined))
        } else {
          setExtendedContext(escapeHtml(text || ''))
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setContextLoading(false)
    }
  }

  return (
    <TableRow>
      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <Box sx={{ py: 2, px: 1 }}>
            {/* Expand before button */}
            <Box sx={{ textAlign: 'center', mb: 1 }}>
              <Button
                size="small"
                variant="text"
                onClick={() => handleExpandMore('before')}
                startIcon={<KeyboardArrowUpIcon />}
                disabled={contextLoading}
              >
                {isZh ? '显示更多上文' : 'Show more before'}
              </Button>
            </Box>

            {/* Context display */}
            {contextLoading ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <LinearProgress sx={{ maxWidth: 200, mx: 'auto' }} />
              </Box>
            ) : contextError ? (
              <Alert severity="error" sx={{ my: 1 }}>{contextError}</Alert>
            ) : extendedContext ? (
              <Paper
                sx={{
                  p: 2,
                  bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                  borderRadius: 1,
                  lineHeight: 1.8,
                  fontFamily: 'Georgia, serif',
                  '& mark': {
                    bgcolor: '#ffeb3b',
                    color: '#d32f2f',
                    fontWeight: 600,
                    px: 0.5,
                    borderRadius: 0.5
                  },
                  '& .collocate-highlight': {
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.2)' : '#fff3e0',
                    color: '#e65100',
                    fontWeight: 700,
                    px: 0.5,
                    borderRadius: 0.5,
                    border: '1px solid #ffb74d'
                  }
                }}
                dangerouslySetInnerHTML={{ __html: extendedContext }}
              />
            ) : null}

            {/* Expand after button */}
            <Box sx={{ textAlign: 'center', mt: 1 }}>
              <Button
                size="small"
                variant="text"
                onClick={() => handleExpandMore('after')}
                startIcon={<KeyboardArrowDownIcon />}
                disabled={contextLoading}
              >
                {isZh ? '显示更多下文' : 'Show more after'}
              </Button>
            </Box>

            {/* Source info */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
              {isZh ? '来源' : 'Source'}: {result.filename} | 
              {isZh ? '位置' : 'Position'}: {result.position} |
              {isZh ? '上下文范围' : 'Context range'}: +/- {contextChars} {isZh ? '字符' : 'chars'}
            </Typography>
          </Box>
        </Collapse>
      </TableCell>
    </TableRow>
  )
}

export default function CollocationResultsTable({
  results,
  totalCount,
  corpusId,
  isLoading = false,
  sortBy,
  sortLevels,
  sortDescending,
  onSortByChange,
  onSortLevelsChange,
  onSortDescendingChange,
  onResort,
  onSortChangeAndResort,
  page: controlledPage,
  rowsPerPage: controlledRowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  highlightWords = [],
  showMetaphorHighlight = false,
  onShowMetaphorHighlightChange,
  scrollToResult,
  onScrollToResultHandled
}: CollocationResultsTableProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  const [internalPage, setInternalPage] = useState(0)
  const [internalRowsPerPage, setInternalRowsPerPage] = useState(20)
  const page = controlledPage !== undefined ? controlledPage : internalPage
  const rowsPerPage = controlledRowsPerPage !== undefined ? controlledRowsPerPage : internalRowsPerPage
  const setPage = onPageChange ?? setInternalPage
  const setRowsPerPage = onRowsPerPageChange ?? setInternalRowsPerPage

  // Row expansion state
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  // Sort dialog state
  const [sortDialogOpen, setSortDialogOpen] = useState(false)
  // Filter dialog state
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  
  // Filter state
  const [filterConfig, setFilterConfig] = useState<FilterConfig | null>(null)

  // Apply filter to results
  const filteredResults = useMemo(() => {
    let filtered = results

    // Apply quick filters first
    if (filterConfig?.hideSubHits) {
      // Hide sub-hits: if a result is contained within another result's context, hide it
      // This is a simplified implementation - in a full implementation, we'd need to check
      // if one match is a substring of another match
      const seenTextIds = new Set<string>()
      filtered = filtered.filter(result => {
        const key = `${result.text_id}-${result.position}`
        if (seenTextIds.has(key)) {
          return false
        }
        seenTextIds.add(key)
        return true
      })
    }

    if (filterConfig?.onlyFirstHit) {
      // Only first hit in each document
      const firstHitPerDoc = new Map<string, KWICResult>()
      filtered.forEach(result => {
        if (!firstHitPerDoc.has(result.text_id) || 
            result.position < firstHitPerDoc.get(result.text_id)!.position) {
          firstHitPerDoc.set(result.text_id, result)
        }
      })
      filtered = filtered.filter(result => 
        firstHitPerDoc.get(result.text_id) === result
      )
    }

    // Apply query filter
    if (filterConfig && filterConfig.queryValue.trim()) {
      const query = filterConfig.queryValue
      const isContaining = filterConfig.keepMode === 'containing'

      filtered = filtered.filter(result => {
        // Get tokens for matching based on queryType
        const matchedTokens = result.matched_tokens || []
        const leftTokens = (result.left_context || []).map((t: any) => typeof t === 'string' ? t : t.text)
        const rightTokens = (result.right_context || []).map((t: any) => typeof t === 'string' ? t : t.text)

        // Build context tokens based on range (text strings for matching)
        let contextTokens: string[] = []

        if (filterConfig.rangeType === 'token') {
          const leftStart = Math.max(0, leftTokens.length + filterConfig.rangeStart)
          const left = leftTokens.slice(leftStart)
          const right = rightTokens.slice(0, filterConfig.rangeEnd)
          contextTokens = [
            ...left,
            ...(filterConfig.excludeKwic ? [] : [result.keyword]),
            ...right
          ]
        } else if (filterConfig.rangeType === 'sentence') {
          contextTokens = [
            ...leftTokens,
            ...(filterConfig.excludeKwic ? [] : [result.keyword]),
            ...rightTokens
          ]
        } else {
          contextTokens = [
            ...leftTokens,
            ...(filterConfig.excludeKwic ? [] : [result.keyword]),
            ...rightTokens
          ]
        }

        // Match based on queryType
        let matches = false

        if (filterConfig.queryType === 'simple') {
          const contextStr = contextTokens.join(' ').toLowerCase()
          matches = contextStr.includes(query.toLowerCase())
        } else if (filterConfig.queryType === 'word') {
          const queryLower = query.toLowerCase()
          matches = contextTokens.some(token => token.toLowerCase() === queryLower)
        } else if (filterConfig.queryType === 'lemma') {
          // Lemma match - need token info, fallback to word match
          const queryLower = query.toLowerCase()
          if (matchedTokens.length > 0) {
            matches = matchedTokens.some(token => 
              (token.lemma || token.word || '').toLowerCase() === queryLower
            )
          } else {
            // Fallback to word match if no token info
            matches = contextTokens.some(token => token.toLowerCase() === queryLower)
          }
        } else if (filterConfig.queryType === 'phrase') {
          // Phrase match - exact sequence
          const queryWords = query.toLowerCase().split(/\s+/)
          const contextStr = contextTokens.join(' ').toLowerCase()
          matches = contextStr.includes(query.toLowerCase())
        } else if (filterConfig.queryType === 'character') {
          // Character match - contains characters
          const queryLower = query.toLowerCase()
          const contextStr = contextTokens.join(' ').toLowerCase()
          matches = contextStr.includes(queryLower)
        } else if (filterConfig.queryType === 'cql') {
          // CQL query - simplified: treat as simple match
          // Full CQL support would require backend processing
          const contextStr = contextTokens.join(' ').toLowerCase()
          matches = contextStr.includes(query.toLowerCase())
        }

        return isContaining ? matches : !matches
      })
    }

    return filtered
  }, [results, filterConfig])

  // Get current page results
  const currentResults = useMemo(() => {
    const start = page * rowsPerPage
    return filteredResults.slice(start, start + rowsPerPage)
  }, [filteredResults, page, rowsPerPage])

  // Scroll-to-result: when scrollToResult is set, switch to the page containing it and scroll row into view
  useEffect(() => {
    if (!scrollToResult || !onScrollToResultHandled) return
    const idx = filteredResults.findIndex(
      r => r.text_id === scrollToResult.text_id && r.position === scrollToResult.position
    )
    if (idx === -1) {
      onScrollToResultHandled()
      return
    }
    const pageNum = Math.floor(idx / rowsPerPage)
    if (onPageChange && pageNum !== page) {
      onPageChange(pageNum)
    }
    // Expand the target row so extended context is visible after scroll
    const idxInPage = idx - pageNum * rowsPerPage
    setExpandedRowId(`${scrollToResult.text_id}-${scrollToResult.position}-${idxInPage}`)
    const delay = pageNum !== page ? 400 : 200
    const t = setTimeout(() => {
      const rowEl = document.querySelector(
        `[data-kwic-id="${scrollToResult.text_id}-${scrollToResult.position}"]`
      )
      if (rowEl) {
        const container = rowEl.closest('.MuiTableContainer-root') as HTMLElement | null
        if (container) {
          const thead = container.querySelector('thead')
          const headerHeight = thead ? thead.getBoundingClientRect().height : 0
          const rowRect = rowEl.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          const scrollDelta = rowRect.top - containerRect.top - headerHeight
          container.scrollTo({
            top: container.scrollTop + scrollDelta,
            behavior: 'smooth'
          })
        } else {
          rowEl.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }
      }
      onScrollToResultHandled()
    }, delay)
    return () => clearTimeout(t)
  }, [scrollToResult, filteredResults, rowsPerPage, page, onPageChange, onScrollToResultHandled])

  // Handle page change
  const handleChangePage = (_: unknown, newPage: number) => {
    if (onPageChange) onPageChange(newPage)
    else setInternalPage(newPage)
    setExpandedRowId(null)
  }

  // Handle rows per page change
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(event.target.value, 10)
    if (onRowsPerPageChange) {
      onRowsPerPageChange(val)
      onPageChange?.(0)
    } else {
      setInternalRowsPerPage(val)
      setInternalPage(0)
    }
    setExpandedRowId(null)
  }

  // Toggle row expansion
  const handleRowClick = (rowId: string) => {
    setExpandedRowId(expandedRowId === rowId ? null : rowId)
  }

  // Check if a token should be highlighted
  // highlightWords may contain lemma forms or surface forms from cross-link
  const shouldHighlightToken = (token: { text: string; lemma?: string }): boolean => {
    if (!highlightWords || highlightWords.length === 0) return false
    const tokenLemma = (token.lemma || token.text).trim().toLowerCase()
    const tokenText = token.text.trim().toLowerCase()
    return highlightWords.some(hw => {
      const hwLower = hw.trim().toLowerCase()
      // Match against both lemma and surface form
      return tokenLemma === hwLower || tokenText === hwLower
    })
  }

  // Helper to get text from a context token (handles both TokenInfo objects and legacy strings)
  const getTokenText = (token: any): string => {
    if (typeof token === 'string') return token
    return token?.text || ''
  }

  // Render colored left context (right-aligned)
  const renderLeftContext = (context: any[]) => {
    const tokens = [...context]
    return (
      <Box sx={{ textAlign: 'right', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {tokens.map((token, idx) => {
          const text = getTokenText(token)
          const posFromEnd = tokens.length - idx
          const color = posFromEnd <= 3 ? CONTEXT_COLORS[posFromEnd - 1] : undefined
          const isHighlighted = typeof token === 'object' && token !== null
            ? shouldHighlightToken(token)
            : shouldHighlightToken({ text })
          return (
            <React.Fragment key={idx}>
              <span
                style={{
                  color: isHighlighted ? '#e65100' : color,
                  fontWeight: isHighlighted ? 700 : (color ? 500 : 400),
                  backgroundColor: isHighlighted ? '#fff3e0' : undefined,
                  padding: isHighlighted ? '1px 3px' : undefined,
                  borderRadius: isHighlighted ? '3px' : undefined,
                  border: isHighlighted ? '1px solid #ffb74d' : undefined
                }}
              >
                {text.trim()}
              </span>
              {idx < tokens.length - 1 ? ' ' : ''}
            </React.Fragment>
          )
        })}
      </Box>
    )
  }

  // Render colored right context (left-aligned)
  const renderRightContext = (context: any[]) => {
    const tokens = [...context]
    return (
      <Box sx={{ textAlign: 'left', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {tokens.map((token, idx) => {
          const text = getTokenText(token)
          const color = idx < 3 ? CONTEXT_COLORS[idx] : undefined
          const isHighlighted = typeof token === 'object' && token !== null
            ? shouldHighlightToken(token)
            : shouldHighlightToken({ text })
          return (
            <React.Fragment key={idx}>
              {idx > 0 ? ' ' : ''}
              <span
                style={{
                  color: isHighlighted ? '#e65100' : color,
                  fontWeight: isHighlighted ? 700 : (color ? 500 : 400),
                  backgroundColor: isHighlighted ? '#fff3e0' : undefined,
                  padding: isHighlighted ? '1px 3px' : undefined,
                  borderRadius: isHighlighted ? '3px' : undefined,
                  border: isHighlighted ? '1px solid #ffb74d' : undefined
                }}
              >
                {text.trim()}
              </span>
            </React.Fragment>
          )
        })}
      </Box>
    )
  }

  // Export to CSV
  const handleExport = () => {
    const headers = [
      isZh ? '索引' : 'Index',
      isZh ? '来源' : 'Source',
      isZh ? '左侧上下文' : 'Left Context',
      isZh ? '关键词' : 'Keyword',
      isZh ? '右侧上下文' : 'Right Context',
      isZh ? '词性' : 'POS',
      isZh ? '位置' : 'Position'
    ]

    const rows = results.map((result, idx) => [
      idx + 1,
      result.filename,
      result.left_context.map(t => typeof t === 'string' ? t : t.text).join(' '),
      result.keyword,
      result.right_context.map(t => typeof t === 'string' ? t : t.text).join(' '),
      result.pos || '',
      result.position
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kwic_results_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Stack 
        direction="row" 
        justifyContent="space-between" 
        alignItems="center"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2">
              {isZh ? '总计' : 'Total'}: <strong>{totalCount}</strong> {isZh ? '条结果' : 'results'}
              {filterConfig && filterConfig.queryValue && (
                <span style={{ color: '#1976d2' }}>
                  {' '}({isZh ? '筛选后' : 'filtered'}: {filteredResults.length})
                </span>
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isZh ? '显示' : 'Showing'}: {filteredResults.length > 0 ? page * rowsPerPage + 1 : 0}-{Math.min((page + 1) * rowsPerPage, filteredResults.length)}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            {/* Metaphor highlight switch */}
            {onShowMetaphorHighlightChange && (
              <FormControlLabel
                control={
                  <Switch
                    checked={showMetaphorHighlight}
                    onChange={(e) => onShowMetaphorHighlightChange(e.target.checked)}
                    size="small"
                    color="warning"
                  />
                }
                label={
                  <Typography variant="body2">
                    {t('collocation.results.highlightMetaphors')}
                  </Typography>
                }
                sx={{ mr: 1 }}
              />
            )}
            
            {/* Sort button */}
            <Tooltip title={isZh ? '排序' : 'Sort'}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SortIcon />}
                onClick={() => setSortDialogOpen(true)}
              >
                {isZh ? '排序' : 'Sort'}
              </Button>
            </Tooltip>

            {/* Filter button */}
            <Tooltip title={isZh ? '筛选' : 'Filter'}>
              <Button
                size="small"
                variant={filterConfig && filterConfig.queryValue ? 'contained' : 'outlined'}
                color={filterConfig && filterConfig.queryValue ? 'primary' : 'inherit'}
                startIcon={<FilterListIcon />}
                onClick={() => setFilterDialogOpen(true)}
              >
                {isZh ? '筛选' : 'Filter'}
              </Button>
            </Tooltip>

            {/* Clear filter button */}
            {filterConfig && filterConfig.queryValue && (
              <Tooltip title={isZh ? '清除筛选' : 'Clear filter'}>
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  onClick={() => {
                    setFilterConfig(null)
                    setPage(0)
                  }}
                >
                  {isZh ? '清除' : 'Clear'}
                </Button>
              </Tooltip>
            )}

            {/* Export button */}
            <Tooltip title={isZh ? '导出CSV' : 'Export CSV'}>
              <IconButton onClick={handleExport} disabled={filteredResults.length === 0}>
                <FileDownloadIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

      {/* Table */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        {isLoading && <LinearProgress />}
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={{ width: 50, fontWeight: 600 }}>
                #
              </TableCell>
              <TableCell sx={{ width: 120, fontWeight: 600 }}>
                {t('collocation.results.source')}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, pr: 0.5 }}>
                {t('collocation.results.leftContext')}
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, px: 0.5, minWidth: 80 }}>
                {t('collocation.results.keyword')}
              </TableCell>
              <TableCell align="left" sx={{ fontWeight: 600, pl: 0.5 }}>
                {t('collocation.results.rightContext')}
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, width: 80 }}>
                {t('collocation.results.pos')}
              </TableCell>
              <TableCell align="center" sx={{ width: 50, fontWeight: 600 }}>
                {/* Expand icon header */}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {currentResults.map((result, idx) => {
              const rowId = `${result.text_id}-${result.position}-${idx}`
              const isExpanded = expandedRowId === rowId
              
              return (
                <React.Fragment key={rowId}>
                  <TableRow
                    data-kwic-id={`${result.text_id}-${result.position}`}
                    hover
                    onClick={() => handleRowClick(rowId)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                      bgcolor: isExpanded 
                        ? 'action.selected' 
                        : showMetaphorHighlight && result.is_metaphor 
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 193, 7, 0.15)' : '#fff8e1'
                          : 'inherit'
                    }}
                  >
                    <TableCell align="center">
                      <Typography variant="body2" color="text.secondary">
                        {page * rowsPerPage + idx + 1}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={result.filename}>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          noWrap
                          sx={{ maxWidth: 100 }}
                        >
                          {result.filename}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right" sx={{ pr: 0.5 }}>
                      {renderLeftContext(result.left_context)}
                    </TableCell>
                    <TableCell align="center" sx={{ px: 0.5 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: 'primary.main',
                          bgcolor: 'action.selected',
                          px: 0.5,
                          py: 0.25,
                          borderRadius: 0.5,
                          display: 'inline-block'
                        }}
                      >
                        {result.keyword}
                      </Typography>
                    </TableCell>
                    <TableCell align="left" sx={{ pl: 0.5 }}>
                      {renderRightContext(result.right_context)}
                    </TableCell>
                    <TableCell align="center">
                      {result.pos && (
                        <Chip
                          label={result.pos}
                          size="small"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small">
                        {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <ExtendedContextRow
                    result={result}
                    corpusId={corpusId}
                    open={isExpanded}
                    isZh={isZh}
                    highlightWords={highlightWords}
                  />
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={filteredResults.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[10, 20, 50, 100]}
        labelRowsPerPage={t('common.rowsPerPage')}
      />

      {/* Sort Dialog */}
      <CollocationSortDialog
        open={sortDialogOpen}
        onClose={() => setSortDialogOpen(false)}
        initialCriteria={useMemo(() => {
          // Parse sortLevels to criteria
          if (sortLevels && sortLevels.length > 0) {
            return sortLevels.map((level, idx) => {
              // Parse level string: "position:attribute:options"
              const parts = level.split(':')
              const position = parts[0] as '3L' | '2L' | '1L' | 'KWIC' | '1R' | '2R' | '3R'
              const attribute = (parts[1] || 'word') as 'word' | 'lemma' | 'pos'
              const ignoreCase = parts.includes('ignoreCase')
              const retrograde = parts.includes('retrograde')
              
              return {
                id: String(idx + 1),
                position,
                attribute,
                ignoreCase,
                retrograde
              }
            })
          }
          return undefined
        }, [JSON.stringify(sortLevels)])} // Use JSON.stringify to create stable dependency
        initialDescending={sortDescending}
        onApply={(criteria, descending) => {
          // Convert criteria to sort settings
          if (criteria.length > 0) {
            // Build sort levels from all criteria
            const sortLevels = criteria.map(criterion => {
              const { position, attribute, ignoreCase, retrograde } = criterion
              
              // Build sort level string with attribute info
              // Format: "position:attribute" or just "position" if attribute is "word"
              let sortLevel = position
              if (attribute !== 'word') {
                sortLevel = `${position}:${attribute}`
              }
              if (ignoreCase) {
                sortLevel = `${sortLevel}:ignoreCase`
              }
              if (retrograde) {
                sortLevel = `${sortLevel}:retrograde`
              }
              return sortLevel
            })
            
            // Determine sort mode based on first criterion position
            const firstCriterion = criteria[0]
            const position = firstCriterion.position
            
            let newSortBy: SortMode = 'left_context'
            if (position === 'KWIC') {
              newSortBy = 'frequency'
            } else if (position.endsWith('L')) {
              newSortBy = 'left_context'
            } else if (position.endsWith('R')) {
              newSortBy = 'right_context'
            }
            
            // Update all sort settings and trigger re-sort
            // If onSortChangeAndResort is provided, use it to update and resort in one call
            // Otherwise, update state and trigger re-sort separately
            if (onSortChangeAndResort) {
              onSortChangeAndResort(newSortBy, sortLevels, descending)
            } else {
              onSortByChange(newSortBy)
              onSortLevelsChange(sortLevels)
              onSortDescendingChange(descending)
              // Trigger re-sort after state updates
              // Use requestAnimationFrame to ensure state updates are flushed
              requestAnimationFrame(() => {
                onResort()
              })
            }
          }
        }}
      />

      {/* Filter Dialog */}
      <CollocationFilterDialog
        open={filterDialogOpen}
        onClose={() => setFilterDialogOpen(false)}
        onApply={(config: FilterConfig) => {
          setFilterConfig(config)
          setPage(0) // Reset to first page when filter changes
        }}
        initialConfig={filterConfig || undefined}
      />
    </Box>
  )
}

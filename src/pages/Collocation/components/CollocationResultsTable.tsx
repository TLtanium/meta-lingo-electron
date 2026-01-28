/**
 * Co-occurrence Results Table
 * KWIC concordance display with colored context markers, row expand for extended context
 * Table columns: # | Source | Left Context | KWIC | Right Context | Actions
 */

import React, { useState, useMemo } from 'react'
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
  /** Words to highlight in context (e.g., collocate words from Word Sketch) */
  highlightWords?: string[]
  /** Show metaphor highlighting */
  showMetaphorHighlight?: boolean
  /** Callback when metaphor highlighting changes */
  onShowMetaphorHighlightChange?: (show: boolean) => void
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

  // Highlight collocate words in text (case-insensitive with lemma flexibility)
  const highlightCollocates = (text: string): string => {
    if (!highlightWords || highlightWords.length === 0) return text
    
    let result = text
    highlightWords.forEach(word => {
      const trimmedWord = word?.trim()
      if (trimmedWord) {
        // Match word and its inflected forms (e.g., ethic matches ethics, business matches businesses)
        const escapedWord = trimmedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        // Match the lemma followed by optional suffix (handles plurals, verb forms, etc.)
        const regex = new RegExp(`\\b(${escapedWord}\\w*)\\b`, 'gi')
        result = result.replace(regex, '<span class="collocate-highlight">$1</span>')
      }
    })
    return result
  }

  // Load extended context when opened
  const loadExtendedContext = async () => {
    if (extendedContext) return
    
    setContextLoading(true)
    setContextError(null)
    
    try {
      const response = await collocationApi.getExtendedContext({
        corpus_id: corpusId,
        text_id: result.text_id,
        position: result.position,
        context_chars: contextChars
      })

      if (response.success && response.data?.success) {
        const { text, highlight_start, highlight_end } = response.data
        if (text && highlight_start !== undefined && highlight_end !== undefined) {
          const before = highlightCollocates(text.substring(0, highlight_start))
          const keyword = text.substring(highlight_start, highlight_end)
          const after = highlightCollocates(text.substring(highlight_end))
          setExtendedContext(`${before}<mark>${keyword}</mark>${after}`)
        } else {
          setExtendedContext(highlightCollocates(text || ''))
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
      const response = await collocationApi.getExtendedContext({
        corpus_id: corpusId,
        text_id: result.text_id,
        position: result.position,
        context_chars: newChars
      })

      if (response.success && response.data?.success) {
        const { text, highlight_start, highlight_end } = response.data
        if (text && highlight_start !== undefined && highlight_end !== undefined) {
          const before = highlightCollocates(text.substring(0, highlight_start))
          const keyword = text.substring(highlight_start, highlight_end)
          const after = highlightCollocates(text.substring(highlight_end))
          setExtendedContext(`${before}<mark>${keyword}</mark>${after}`)
        } else {
          setExtendedContext(highlightCollocates(text || ''))
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
  highlightWords = [],
  showMetaphorHighlight = false,
  onShowMetaphorHighlightChange
}: CollocationResultsTableProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Pagination state
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)

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
        const leftTokens = result.left_context || []
        const rightTokens = result.right_context || []
        
        // Build context tokens based on range
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
          // For sentence range, use full context (simplified)
          contextTokens = [
            ...leftTokens,
            ...(filterConfig.excludeKwic ? [] : [result.keyword]),
            ...rightTokens
          ]
        } else {
          // Custom range - use full context for now
          contextTokens = [
            ...leftTokens,
            ...(filterConfig.excludeKwic ? [] : [result.keyword]),
            ...rightTokens
          ]
        }

        // Match based on queryType
        let matches = false
        
        if (filterConfig.queryType === 'simple') {
          // Simple text match (case-insensitive)
          const contextStr = contextTokens.join(' ').toLowerCase()
          matches = contextStr.includes(query.toLowerCase())
        } else if (filterConfig.queryType === 'word') {
          // Exact word match
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

  // Handle page change
  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage)
    setExpandedRowId(null)
  }

  // Handle rows per page change
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
    setExpandedRowId(null)
  }

  // Toggle row expansion
  const handleRowClick = (rowId: string) => {
    setExpandedRowId(expandedRowId === rowId ? null : rowId)
  }

  // Check if a word should be highlighted (case-insensitive match with lemma flexibility)
  const shouldHighlight = (word: string): boolean => {
    if (!highlightWords || highlightWords.length === 0) return false
    const wordLower = word.trim().toLowerCase()
    return highlightWords.some(hw => {
      const hwLower = hw.trim().toLowerCase()
      // Exact match
      if (wordLower === hwLower) return true
      // Word starts with highlight word (handles ethic/ethics, business/businesses)
      // But only if the word is at least as long as highlight word (prevents "the" matching "their")
      if (wordLower.startsWith(hwLower) && wordLower.length >= hwLower.length) return true
      // Highlight word starts with word ONLY if it's a valid inflection (word must be most of the highlight word)
      // e.g., "ethic" (5 chars) vs "ethics" (6 chars) - ethic is 83% of ethics, OK
      // e.g., "the" (3 chars) vs "their" (5 chars) - the is 60% of their, NOT OK
      if (hwLower.startsWith(wordLower) && wordLower.length >= hwLower.length * 0.75) return true
      return false
    })
  }

  // Render colored left context (right-aligned)
  const renderLeftContext = (context: string[]) => {
    const words = [...context]
    return (
      <Box sx={{ textAlign: 'right', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {words.map((word, idx) => {
          const posFromEnd = words.length - idx
          const color = posFromEnd <= 3 ? CONTEXT_COLORS[posFromEnd - 1] : undefined
          const isHighlighted = shouldHighlight(word)
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
                {word.trim()}
              </span>
              {idx < words.length - 1 ? ' ' : ''}
            </React.Fragment>
          )
        })}
      </Box>
    )
  }

  // Render colored right context (left-aligned)
  const renderRightContext = (context: string[]) => {
    const words = [...context]
    return (
      <Box sx={{ textAlign: 'left', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {words.map((word, idx) => {
          const color = idx < 3 ? CONTEXT_COLORS[idx] : undefined
          const isHighlighted = shouldHighlight(word)
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
                {word.trim()}
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
      result.left_context.join(' '),
      result.keyword,
      result.right_context.join(' '),
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

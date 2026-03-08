/**
 * Sentiment analysis results table — layout and behaviour aligned with Word Frequency ResultsTable
 * Toolbar: stats (总词数, 不重复词数, 已选) left; search + 全选/复制/导出 right
 */

import { useState, useMemo, useRef } from 'react'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TablePagination,
  Checkbox,
  IconButton,
  Tooltip,
  Typography,
  Stack,
  Chip,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FilterListIcon from '@mui/icons-material/FilterList'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import LinkIcon from '@mui/icons-material/Link'
import { useTranslation } from 'react-i18next'
import { WordActionMenu } from '../../components/common'
import { useTabStore } from '../../stores/tabStore'
import type {
  SentimentResultRow,
  SentimentEmotionFilterPolarity,
  SentimentEmotionFilterDimension
} from '../../types/sentiment'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type { SearchTarget } from '../../types/wordFrequency'

const POLARITY_COLS = ['positive', 'negative', 'neutral']
const DIMENSION_COLS = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'trust', 'others']

type SortColumn = string  // 'word' | 'total' | 'percentage' | emotion keys (positive/negative/neutral or anger/.../others)
type SortDirection = 'asc' | 'desc'

interface SentimentResultsTableProps {
  results: SentimentResultRow[]
  summary: Record<string, number>
  analysisMode: 'polarity' | 'dimension'
  corpusSelection: CorpusOrLibrarySelection | null
  totalTokens: number
  uniqueWords: number
  selectedWords: string[]
  onSelectionChange: (words: string[]) => void
  paginationConfig: { page: number; rowsPerPage: number }
  onPaginationChange: (config: { page: number; rowsPerPage: number }) => void
  /** Optional controlled state for AI context consistency */
  tableFilter?: string
  onTableFilterChange?: (value: string) => void
  sortColumn?: SortColumn
  sortDirection?: SortDirection
  onSortChange?: (column: SortColumn, direction: SortDirection) => void
  isLoading?: boolean
  emotionFilterPolarity: SentimentEmotionFilterPolarity
  emotionFilterDimension: SentimentEmotionFilterDimension
  onOpenFilterDialog: () => void
  searchTarget?: SearchTarget
}

export default function SentimentResultsTable({
  results,
  summary,
  analysisMode,
  corpusSelection,
  totalTokens,
  uniqueWords,
  selectedWords,
  onSelectionChange,
  paginationConfig,
  onPaginationChange,
  tableFilter: controlledTableFilter,
  onTableFilterChange,
  sortColumn: controlledSortColumn,
  sortDirection: controlledSortDirection,
  onSortChange,
  isLoading = false,
  emotionFilterPolarity,
  emotionFilterDimension,
  onOpenFilterDialog,
  searchTarget = 'word'
}: SentimentResultsTableProps) {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const [internalFilter, setInternalFilter] = useState('')
  const [internalSortColumn, setInternalSortColumn] = useState<SortColumn>('total')
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>('desc')

  const tableFilter = controlledTableFilter !== undefined ? controlledTableFilter : internalFilter
  const setTableFilter = onTableFilterChange ?? setInternalFilter
  const sortColumn = controlledSortColumn !== undefined ? controlledSortColumn : internalSortColumn
  const sortDirection = controlledSortDirection !== undefined ? controlledSortDirection : internalSortDirection
  const setSort = (col: SortColumn, dir: SortDirection) => {
    if (onSortChange) {
      onSortChange(col, dir)
    } else {
      setInternalSortColumn(col)
      setInternalSortDirection(dir)
    }
  }

  // Domain mode cross-link menu state (USAS mode only — same pattern as Keyness ResultsTable)
  const [domainMenuAnchor, setDomainMenuAnchor] = useState<null | HTMLElement>(null)
  const [domainMenuCode, setDomainMenuCode] = useState<string | null>(null)
  const pendingDomainLinkRef = useRef<string | null>(null)

  const handleDomainMenuExited = () => {
    if (pendingDomainLinkRef.current && corpusSelection?.corpusId) {
      const domainCode = pendingDomainLinkRef.current
      pendingDomainLinkRef.current = null
      const selMode = corpusSelection.selectionMode === 'keywords' ? 'tags' : corpusSelection.selectionMode ?? 'all'
      const libId = corpusSelection.dataSource === 'library' ? corpusSelection.libraryId : undefined
      const entryIds =
        corpusSelection.dataSource === 'library' && corpusSelection.selectionMode === 'selected'
          ? corpusSelection.selectedEntryIds
          : undefined
      openTab({
        type: 'collocation',
        title: `${t('collocation.title')} - ${domainCode}`,
        props: {
          crossLinkParams: {
            searchWord: domainCode,
            corpusId: corpusSelection.corpusId,
            textIds: corpusSelection.textIds ?? 'all',
            selectionMode: selMode,
            selectedTags: corpusSelection.selectedKeywords ?? corpusSelection.selectedTags ?? [],
            autoSearch: true,
            semanticDomain: domainCode,
            semanticDomainMatch: 'contains',
            ignoreCase: true,
            ...(libId && { libraryId: libId }),
            ...(libId && selMode === 'selected' && entryIds?.length && { selectedEntryIds: entryIds })
          }
        }
      })
    }
  }

  const allCols = analysisMode === 'polarity' ? POLARITY_COLS : DIMENSION_COLS
  const emotionFilter = analysisMode === 'polarity' ? emotionFilterPolarity : emotionFilterDimension
  const cols = allCols.filter((c) => emotionFilter[c as keyof typeof emotionFilter])
  const colsToShow = cols.length > 0 ? cols : allCols

  const isUsasMode = searchTarget === 'usas'

  const filteredResults = useMemo(() => {
    if (!tableFilter.trim()) return results
    const f = tableFilter.toLowerCase()
    return results.filter((r) => {
      if (isUsasMode) {
        // Search by domain code or domain name
        return (
          r.word.toLowerCase().includes(f) ||
          (r.domain_name?.toLowerCase() ?? '').includes(f)
        )
      }
      return r.word.toLowerCase().includes(f)
    })
  }, [results, tableFilter, isUsasMode])

  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults]
    sorted.sort((a, b) => {
      const aVal = a[sortColumn] as number | string | undefined
      const bVal = b[sortColumn] as number | string | undefined
      const isWordCol = sortColumn === 'word'
      if (isWordCol) {
        const aStr = typeof aVal === 'string' ? aVal : String(aVal ?? '')
        const bStr = typeof bVal === 'string' ? bVal : String(bVal ?? '')
        return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
      }
      // total, percentage, or emotion column: treat as number, missing/undefined as 0
      const aNum = typeof aVal === 'number' && !Number.isNaN(aVal) ? aVal : Number(aVal) || 0
      const bNum = typeof bVal === 'number' && !Number.isNaN(bVal) ? bVal : Number(bVal) || 0
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
    })
    return sorted
  }, [filteredResults, sortColumn, sortDirection])

  const paginatedResults = useMemo(() => {
    const start = paginationConfig.page * paginationConfig.rowsPerPage
    return sortedResults.slice(start, start + paginationConfig.rowsPerPage)
  }, [sortedResults, paginationConfig])

  const handleSort = (column: SortColumn) => {
    const isAsc = sortColumn === column && sortDirection === 'asc'
    const nextDir = isAsc ? 'desc' : 'asc'
    setSort(column, nextDir)
  }

  const handleSelectRow = (word: string) => {
    const next = selectedWords.includes(word)
      ? selectedWords.filter((w) => w !== word)
      : [...selectedWords, word]
    onSelectionChange(next)
  }

  const handleSelectAllPage = () => {
    const pageWords = paginatedResults.map((r) => r.word)
    const allSelected = pageWords.every((w) => selectedWords.includes(w))
    if (allSelected) {
      onSelectionChange(selectedWords.filter((w) => !pageWords.includes(w)))
    } else {
      onSelectionChange([...new Set([...selectedWords, ...pageWords])])
    }
  }

  const handleSelectAll = () => {
    if (selectedWords.length === filteredResults.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(filteredResults.map((r) => r.word))
    }
  }

  const handleCopySelected = () => {
    const text = selectedWords.join('\n')
    navigator.clipboard.writeText(text)
  }

  const handleExportCSV = () => {
    const dataToExport = selectedWords.length > 0
      ? filteredResults.filter((r) => selectedWords.includes(r.word))
      : filteredResults
    const wordColHeader = isUsasMode ? 'domain_code' : 'word'
    const headers = isUsasMode
      ? [wordColHeader, 'domain_name', 'total', 'percentage', ...colsToShow]
      : [wordColHeader, 'total', 'percentage', ...colsToShow]
    const rows = dataToExport.map((r) => {
      const base = isUsasMode
        ? [r.word, r.domain_name ?? '', r.total, (r.percentage ?? 0).toFixed(4)]
        : [r.word, r.total, (r.percentage ?? 0).toFixed(4)]
      return [...base, ...colsToShow.map((c) => String(r[c] ?? 0))].join(',')
    })
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sentiment_${analysisMode}${isUsasMode ? '_usas' : ''}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const allPageSelected =
    paginatedResults.length > 0 && paginatedResults.every((r) => selectedWords.includes(r.word))
  const somePageSelected = paginatedResults.some((r) => selectedWords.includes(r.word))
  const totalCols = 4 + colsToShow.length + (corpusSelection?.corpusId ? 1 : 0) // checkbox + word + total + pct + cols + action

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar — stats left, search + actions right (same as Word Frequency) */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Stack direction="row" spacing={1}>
          <Chip
            label={`${t('wordFrequency.stats.totalTokens')}: ${totalTokens.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${t('wordFrequency.stats.uniqueWords')}: ${uniqueWords.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          {selectedWords.length > 0 && (
            <Chip
              label={`${t('wordFrequency.stats.selected')}: ${selectedWords.length}`}
              size="small"
              color="primary"
            />
          )}
        </Stack>

        <Box sx={{ flex: 1 }} />

        <TextField
          size="small"
          placeholder={t('wordFrequency.table.filterPlaceholder')}
          value={tableFilter}
          onChange={(e) => {
            setTableFilter(e.target.value)
            onPaginationChange({ ...paginationConfig, page: 0 })
          }}
          sx={{ width: 200 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
        <Tooltip title={t('sentiment.filter')}>
          <IconButton size="small" onClick={onOpenFilterDialog}>
            <FilterListIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={t('wordFrequency.table.selectAll')}>
          <IconButton size="small" onClick={handleSelectAll}>
            {selectedWords.length === filteredResults.length && filteredResults.length > 0 ? (
              <DeselectIcon />
            ) : (
              <SelectAllIcon />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title={t('wordFrequency.table.copySelected')}>
          <IconButton size="small" onClick={handleCopySelected} disabled={selectedWords.length === 0}>
            <ContentCopyIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('wordFrequency.table.exportCSV')}>
          <IconButton size="small" onClick={handleExportCSV}>
            <FileDownloadIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small" sx={{ minWidth: 400 + colsToShow.length * 64 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ whiteSpace: 'nowrap', minWidth: 48 }}>
                <Checkbox
                  indeterminate={somePageSelected && !allPageSelected}
                  checked={allPageSelected}
                  onChange={handleSelectAllPage}
                  size="small"
                />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', minWidth: isUsasMode ? 180 : 100 }}>
                <TableSortLabel
                  active={sortColumn === 'word'}
                  direction={sortColumn === 'word' ? sortDirection : 'asc'}
                  onClick={() => handleSort('word')}
                >
                  {isUsasMode ? t('sentiment.table.domain') : t('sentiment.table.word')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: 72 }}>
                <TableSortLabel
                  active={sortColumn === 'total'}
                  direction={sortColumn === 'total' ? sortDirection : 'desc'}
                  onClick={() => handleSort('total')}
                >
                  {t('sentiment.table.total')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: 88 }}>
                <TableSortLabel
                  active={sortColumn === 'percentage'}
                  direction={sortColumn === 'percentage' ? sortDirection : 'desc'}
                  onClick={() => handleSort('percentage')}
                >
                  {t('sentiment.table.percentage')}
                </TableSortLabel>
              </TableCell>
              {colsToShow.map((c) => (
                <TableCell key={c} align="right" sx={{ whiteSpace: 'nowrap', minWidth: 64 }}>
                  <TableSortLabel
                    active={sortColumn === c}
                    direction={sortColumn === c ? sortDirection : 'desc'}
                    onClick={() => handleSort(c)}
                  >
                    {t(`sentiment.${analysisMode === 'polarity' ? 'polarity' : 'dimension'}.${c}`)}
                  </TableSortLabel>
                </TableCell>
              ))}
              {corpusSelection?.corpusId && (
                <TableCell align="center" sx={{ width: 50, whiteSpace: 'nowrap' }}>
                  {t('common.actions')}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedResults.map((row) => (
              <TableRow
                key={row.word}
                hover
                selected={selectedWords.includes(row.word)}
                onClick={() => handleSelectRow(row.word)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell padding="checkbox" sx={{ minWidth: 48 }}>
                  <Checkbox
                    checked={selectedWords.includes(row.word)}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleSelectRow(row.word)}
                  />
                </TableCell>
                <TableCell sx={{ minWidth: isUsasMode ? 180 : 100 }}>
                  {isUsasMode && row.domain_name ? (
                    <Tooltip title={row.domain_name} followCursor>
                      <span style={{ display: 'block' }}>
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {row.word}
                        </Typography>
                      </span>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {row.word}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 72 }}>
                  <Typography variant="body2">{row.total.toLocaleString()}</Typography>
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 88 }}>
                  <Typography variant="body2">{(row.percentage ?? 0).toFixed(4)}%</Typography>
                </TableCell>
                {colsToShow.map((c) => (
                  <TableCell key={c} align="right" sx={{ minWidth: 64 }}>
                    <Typography variant="body2">{Number(row[c] ?? 0)}</Typography>
                  </TableCell>
                ))}
                {corpusSelection?.corpusId && (
                  <TableCell align="center" sx={{ width: 50 }} onClick={(e) => e.stopPropagation()}>
                    {isUsasMode ? (
                      // USAS domain mode: only co-occurrence link (same as Keyness domain mode)
                      <Tooltip title={t('crossLink.viewInOtherModules')}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            setDomainMenuAnchor(e.currentTarget)
                            setDomainMenuCode(row.word)
                          }}
                          sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <WordActionMenu
                        word={row.word}
                        corpusId={corpusSelection.corpusId}
                        textIds={corpusSelection.textIds ?? 'all'}
                        selectionMode={
                          corpusSelection.selectionMode === 'keywords' ? 'tags' : corpusSelection.selectionMode ?? 'all'
                        }
                        selectedTags={corpusSelection.selectedKeywords ?? corpusSelection.selectedTags ?? []}
                        libraryId={corpusSelection.dataSource === 'library' ? corpusSelection.libraryId : undefined}
                        selectedEntryIds={
                          corpusSelection.dataSource === 'library' && corpusSelection.selectionMode === 'selected'
                            ? corpusSelection.selectedEntryIds
                            : undefined
                        }
                        showCollocation={true}
                        showWordSketch={true}
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {paginatedResults.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                    {isLoading ? t('common.loading') : t('wordFrequency.table.noData')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={filteredResults.length}
        page={paginationConfig.page}
        onPageChange={(_, page) => onPaginationChange({ ...paginationConfig, page })}
        rowsPerPage={paginationConfig.rowsPerPage}
        onRowsPerPageChange={(e) =>
          onPaginationChange({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })
        }
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage={t('wordFrequency.table.rowsPerPage')}
      />

      {/* Domain cross-link menu — USAS mode only; opens collocation with [usas="code"] CQL */}
      {isUsasMode && corpusSelection?.corpusId && (
        <Menu
          anchorEl={domainMenuAnchor}
          open={Boolean(domainMenuAnchor)}
          onClose={() => {
            setDomainMenuAnchor(null)
            setDomainMenuCode(null)
          }}
          onClick={(e) => e.stopPropagation()}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          TransitionProps={{ onExited: handleDomainMenuExited }}
        >
          <MenuItem
            onClick={() => {
              if (domainMenuCode) {
                pendingDomainLinkRef.current = domainMenuCode
                setDomainMenuAnchor(null)
                setDomainMenuCode(null)
              }
            }}
          >
            <ListItemIcon>
              <LinkIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('crossLink.viewCollocation')} />
          </MenuItem>
        </Menu>
      )}
    </Box>
  )
}

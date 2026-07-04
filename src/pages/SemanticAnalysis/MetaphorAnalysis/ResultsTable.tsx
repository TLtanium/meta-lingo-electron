/**
 * Metaphor Analysis Results Table
 * Displays metaphor analysis results with sorting, pagination, and selection
 */

import { useState, useMemo } from 'react'
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
  Typography,
  Chip,
  Stack,
  Checkbox,
  IconButton,
  Tooltip,
  LinearProgress,
  TextField,
  InputAdornment,
  Switch,
  FormControlLabel
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import SearchIcon from '@mui/icons-material/Search'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import { useTranslation } from 'react-i18next'
import type {
  MetaphorResult,
  MetaphorStatistics
} from '../../../types/metaphorAnalysis'
import type { SelectionMode } from '../../../types/crossLink'
import { WordActionMenu } from '../../../components/common'

interface ResultsTableProps {
  results: MetaphorResult[]
  statistics: MetaphorStatistics | null
  selectedWords: string[]
  onSelectionChange: (words: string[]) => void
  isLoading: boolean
  sortField?: SortField
  sortDirection?: SortDirection
  onSortChange?: (field: SortField, direction: SortDirection) => void
  page?: number
  rowsPerPage?: number
  onPageChange?: (page: number) => void
  onRowsPerPageChange?: (rowsPerPage: number) => void
  tableFilter?: string
  onTableFilterChange?: (value: string) => void
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
  libraryId?: string
  selectedEntryIds?: string[]
  includeImplicit?: boolean
  onIncludeImplicitChange?: (value: boolean) => void
}

type SortField = 'word' | 'frequency' | 'percentage' | 'pos' | 'is_metaphor' | 'source'
type SortDirection = 'asc' | 'desc'

export default function ResultsTable({
  results,
  statistics,
  selectedWords,
  onSelectionChange,
  isLoading,
  sortField: sortFieldProp,
  sortDirection: sortDirectionProp,
  onSortChange: onSortChangeProp,
  page: pageProp,
  rowsPerPage: rowsPerPageProp,
  onPageChange: onPageChangeProp,
  onRowsPerPageChange: onRowsPerPageChangeProp,
  tableFilter: tableFilterProp,
  onTableFilterChange: onTableFilterChangeProp,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags,
  libraryId,
  selectedEntryIds,
  includeImplicit = false,
  onIncludeImplicitChange
}: ResultsTableProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Internal state when not controlled
  const [sortFieldInternal, setSortFieldInternal] = useState<SortField>('frequency')
  const [sortDirectionInternal, setSortDirectionInternal] = useState<SortDirection>('desc')
  const [pageInternal, setPageInternal] = useState(0)
  const [rowsPerPageInternal, setRowsPerPageInternal] = useState(50)
  const [tableFilterInternal, setTableFilterInternal] = useState('')

  const sortField = sortFieldProp ?? sortFieldInternal
  const sortDirection = sortDirectionProp ?? sortDirectionInternal
  const page = pageProp ?? pageInternal
  const rowsPerPage = rowsPerPageProp ?? rowsPerPageInternal
  const tableFilter = tableFilterProp ?? tableFilterInternal

  const setPage = (p: number) => {
    if (onPageChangeProp) onPageChangeProp(p)
    else setPageInternal(p)
  }
  const setRowsPerPage = (r: number) => {
    if (onRowsPerPageChangeProp) {
      onRowsPerPageChangeProp(r)
      if (onPageChangeProp) onPageChangeProp(0)
    } else {
      setRowsPerPageInternal(r)
      setPageInternal(0)
    }
  }
  const setTableFilter = (v: string) => {
    if (onTableFilterChangeProp) {
      onTableFilterChangeProp(v)
      if (onPageChangeProp) onPageChangeProp(0)
    } else {
      setTableFilterInternal(v)
      setPageInternal(0)
    }
  }

  // Filter results by table search
  const filteredResults = useMemo(() => {
    if (!tableFilter.trim()) return results
    const filter = tableFilter.toLowerCase()
    return results.filter(r => r.word.toLowerCase().includes(filter))
  }, [results, tableFilter])

  // Compute display frequency (raw + implicit ref count when toggled)
  const getDisplayFreq = (r: MetaphorResult) =>
    r.frequency + (includeImplicit ? (r.implicit_ref_count ?? 0) : 0)

  // Sort results
  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults]
    sorted.sort((a, b) => {
      let aVal: any
      let bVal: any

      switch (sortField) {
        case 'word':
          aVal = a.word.toLowerCase()
          bVal = b.word.toLowerCase()
          break
        case 'frequency':
          aVal = a.frequency + (includeImplicit ? (a.implicit_ref_count ?? 0) : 0)
          bVal = b.frequency + (includeImplicit ? (b.implicit_ref_count ?? 0) : 0)
          break
        case 'percentage':
          aVal = a.frequency + (includeImplicit ? (a.implicit_ref_count ?? 0) : 0)
          bVal = b.frequency + (includeImplicit ? (b.implicit_ref_count ?? 0) : 0)
          break
        case 'pos':
          aVal = a.pos
          bVal = b.pos
          break
        case 'is_metaphor':
          aVal = a.is_metaphor ? 1 : 0
          bVal = b.is_metaphor ? 1 : 0
          break
        case 'source': {
          // Sort by type priority: MFlag(3) > Direct(2) > Indirect(1) > Literal(0)
          const typePriority = (r: MetaphorResult) =>
            r.is_mflag ? 3 : r.is_direct_metaphor ? 2 : r.is_metaphor ? 1 : 0
          aVal = typePriority(a)
          bVal = typePriority(b)
          break
        }
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredResults, sortField, sortDirection, includeImplicit])

  // Paginated results
  const paginatedResults = useMemo(() => {
    const start = page * rowsPerPage
    return sortedResults.slice(start, start + rowsPerPage)
  }, [sortedResults, page, rowsPerPage])

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      const nextDir = sortDirection === 'asc' ? 'desc' : 'asc'
      if (onSortChangeProp) onSortChangeProp(field, nextDir)
      else {
        setSortDirectionInternal(nextDir)
      }
    } else {
      if (onSortChangeProp) onSortChangeProp(field, 'desc')
      else {
        setSortFieldInternal(field)
        setSortDirectionInternal('desc')
      }
    }
  }

  // Handle select all on current page
  const handleSelectAllPage = () => {
    const pageWords = paginatedResults.map(r => r.word)
    const allSelected = pageWords.every(w => selectedWords.includes(w))
    
    if (allSelected) {
      // Deselect all on page
      onSelectionChange(selectedWords.filter(w => !pageWords.includes(w)))
    } else {
      // Select all on page
      const newSelected = [...new Set([...selectedWords, ...pageWords])]
      onSelectionChange(newSelected)
    }
  }

  // Handle select all filtered results
  const handleSelectAll = () => {
    const allWords = sortedResults.map(r => r.word)
    if (selectedWords.length === allWords.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(allWords)
    }
  }

  const handleSelectWord = (word: string) => {
    if (selectedWords.includes(word)) {
      onSelectionChange(selectedWords.filter(w => w !== word))
    } else {
      onSelectionChange([...selectedWords, word])
    }
  }

  // Copy selected words
  const handleCopySelected = () => {
    const text = selectedWords.join('\n')
    navigator.clipboard.writeText(text)
  }

  // Check if all on page are selected
  const allPageSelected = paginatedResults.length > 0 && 
    paginatedResults.every(r => selectedWords.includes(r.word))
  const somePageSelected = paginatedResults.some(r => selectedWords.includes(r.word))

  const handleExportCSV = () => {
    const header = 'Word,Lemma,POS,Frequency,Percentage,Metaphor,Type'
    const rows = sortedResults.map(r => {
      const metaphor = r.is_metaphor ? 'indirect' : 'literal'
      const type = r.is_mflag
        ? 'mflag'
        : r.is_direct_metaphor
        ? 'direct'
        : r.is_implicit_metaphor
        ? 'implicit'
        : r.is_metaphor
        ? 'indirect'
        : 'none'
      const df = getDisplayFreq(r)
      const dp = statistics ? (df / statistics.total_tokens * 100) : r.percentage
      return `"${r.word}","${r.lemma}","${r.pos}",${df},${dp.toFixed(4)},"${metaphor}","${type}"`
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `metaphor_analysis_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  // Derive the display type from the MIPVU flags.
  // Priority: MFlag > Direct > Implicit > Indirect > Literal
  const getMetaphorType = (r: MetaphorResult): { label: string; color: string } => {
    if (r.is_mflag)              return { label: isZh ? '隐喻标记'  : 'MFlag',    color: '#9C27B0' }
    if (r.is_direct_metaphor)    return { label: isZh ? '直接隐喻'  : 'Direct',   color: '#E91E63' }
    if (r.is_implicit_metaphor)  return { label: isZh ? '隐性隐喻'  : 'Implicit', color: '#FF9800' }
    if (r.is_metaphor)           return { label: isZh ? '间接隐喻'  : 'Indirect', color: '#4CAF50' }
    return                              { label: isZh ? '非隐喻词'  : 'Literal',  color: '#9E9E9E' }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar with Statistics — outer row never wraps; chips wrap inside
          their own flex item so the search box stays on the same line */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', gap: 1 }}
      >
        {/* Stats — grows to fill available width so the control cluster
            (search box … export button) stays anchored to the right edge */}
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ flex: '1 1 auto', minWidth: 0 }}>
          {statistics && (
            <>
              <Chip 
                label={`${isZh ? '总词数' : 'Total'}: ${statistics.total_tokens.toLocaleString()}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`${isZh ? '隐喻' : 'Metaphors'}: ${statistics.metaphor_tokens.toLocaleString()}`}
                size="small"
                variant="outlined"
                color="success"
              />
              {statistics.indirect_metaphor_tokens !== undefined && (
                <Chip
                  label={`${isZh ? '间接' : 'Indirect'}: ${statistics.indirect_metaphor_tokens.toLocaleString()}`}
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: '#4CAF50', color: '#4CAF50' }}
                />
              )}
              {statistics.direct_metaphor_tokens !== undefined && statistics.direct_metaphor_tokens > 0 && (
                <Chip
                  label={`${isZh ? '直接' : 'Direct'}: ${statistics.direct_metaphor_tokens.toLocaleString()}`}
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: '#E91E63', color: '#E91E63' }}
                />
              )}
              {statistics.mflag_tokens !== undefined && statistics.mflag_tokens > 0 && (
                <Chip
                  label={`${isZh ? '隐喻标记' : 'MFlag'}: ${statistics.mflag_tokens.toLocaleString()}`}
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: '#9C27B0', color: '#9C27B0' }}
                />
              )}
              {statistics.implicit_metaphor_tokens !== undefined && statistics.implicit_metaphor_tokens > 0 && (
                <Chip
                  label={`${isZh ? '隐性' : 'Implicit'}: ${statistics.implicit_metaphor_tokens.toLocaleString()}`}
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: '#FF9800', color: '#FF9800' }}
                />
              )}
              <Chip
                label={`${isZh ? '非隐喻' : 'Literals'}: ${statistics.literal_tokens.toLocaleString()}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`${isZh ? '隐喻率' : 'Rate'}: ${(statistics.metaphor_rate * 100).toFixed(2)}%`}
                size="small"
                variant="outlined"
                color="primary"
              />
              {/* POS-grouped statistics: IN / DT / RB / RP / OTHER */}
              {statistics.pos_group_stats && (
                <>
                  {(['IN', 'DT', 'RB', 'RP', 'OTHER'] as const).map((key) => {
                    const group = statistics.pos_group_stats?.[key]
                    if (!group || group.total_tokens === 0) return null
                    const rate = (group.metaphor_rate * 100).toFixed(1)
                    const label =
                      key === 'OTHER'
                        ? (isZh ? `其他: ${rate}%` : `OTHER: ${rate}%`)
                        : `${key}: ${rate}%`
                    return (
                      <Chip
                        key={key}
                        label={label}
                        size="small"
                        variant="outlined"
                      />
                    )
                  })}
                </>
              )}
            </>
          )}
          {/* Implicit metaphor backref toggle — sits inline with stats chips */}
          <Tooltip title={isZh ? '开启后，被隐性隐喻回指的间接隐喻词计数+1，总词数不变' : 'Antecedents of implicit metaphors get +1 count; total tokens unchanged'}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={includeImplicit}
                  onChange={(e) => onIncludeImplicitChange?.(e.target.checked)}
                  sx={{ '& .MuiSwitch-thumb': { bgcolor: includeImplicit ? '#FF9800' : undefined } }}
                />
              }
              label={
                <Typography variant="caption" color={includeImplicit ? 'warning.main' : 'text.secondary'} noWrap>
                  {isZh ? '隐性回指' : 'Impl. backref'}
                </Typography>
              }
              sx={{ mx: 0 }}
            />
          </Tooltip>

          {selectedWords.length > 0 && (
            <Chip
              label={`${isZh ? '已选' : 'Selected'}: ${selectedWords.length}`}
              size="small"
              color="primary"
            />
          )}
        </Stack>

        {/* Right-side controls — right-aligned cluster; the search field is
            wide but can shrink on narrow windows */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          <TextField
            size="small"
            placeholder={isZh ? '搜索词汇...' : 'Search words...'}
            value={tableFilter}
            onChange={(e) => {
              setTableFilter(e.target.value)
              setPage(0)
            }}
            sx={{ width: 240, minWidth: 140, flexShrink: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }}
          />

          {/* Actions */}
          <Tooltip title={isZh ? '全选' : 'Select All'}>
            <IconButton size="small" onClick={handleSelectAll}>
              {selectedWords.length === sortedResults.length ? <DeselectIcon /> : <SelectAllIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={isZh ? '复制选中' : 'Copy Selected'}>
            <IconButton size="small" onClick={handleCopySelected} disabled={selectedWords.length === 0}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={isZh ? '导出 CSV' : 'Export CSV'}>
            <IconButton size="small" onClick={handleExportCSV}>
              <FileDownloadIcon fontSize="small" />
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
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={somePageSelected && !allPageSelected}
                  checked={allPageSelected}
                  onChange={handleSelectAllPage}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'word'}
                  direction={sortField === 'word' ? sortDirection : 'asc'}
                  onClick={() => handleSort('word')}
                >
                  {isZh ? '词汇' : 'Word'}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'pos'}
                  direction={sortField === 'pos' ? sortDirection : 'asc'}
                  onClick={() => handleSort('pos')}
                >
                  POS
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'frequency'}
                  direction={sortField === 'frequency' ? sortDirection : 'asc'}
                  onClick={() => handleSort('frequency')}
                >
                  {isZh ? '频率' : 'Freq'}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'percentage'}
                  direction={sortField === 'percentage' ? sortDirection : 'asc'}
                  onClick={() => handleSort('percentage')}
                >
                  %
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'is_metaphor'}
                  direction={sortField === 'is_metaphor' ? sortDirection : 'asc'}
                  onClick={() => handleSort('is_metaphor')}
                >
                  {isZh ? '隐喻' : 'Metaphor'}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'source'}
                  direction={sortField === 'source' ? sortDirection : 'asc'}
                  onClick={() => handleSort('source')}
                >
                  {isZh ? '类型' : 'Type'}
                </TableSortLabel>
              </TableCell>
              {corpusId && (
                <TableCell align="center" sx={{ width: 50 }}>
                  {t('common.actions')}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedResults.map((r, idx) => (
              <TableRow
                key={idx}
                hover
                selected={selectedWords.includes(r.word)}
                sx={{ cursor: 'pointer' }}
                onClick={() => handleSelectWord(r.word)}
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedWords.includes(r.word)}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleSelectWord(r.word)}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {r.word}
                  </Typography>
                  {r.lemma !== r.word && (
                    <Typography variant="caption" color="text.secondary">
                      ({r.lemma})
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip label={r.pos} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                    <span>{getDisplayFreq(r).toLocaleString()}</span>
                    {includeImplicit && (r.implicit_ref_count ?? 0) > 0 && (
                      <Tooltip title={isZh ? `含 ${r.implicit_ref_count} 次隐性隐喻回指` : `Includes ${r.implicit_ref_count} implicit back-reference(s)`}>
                        <Chip
                          label={`+${r.implicit_ref_count}`}
                          size="small"
                          sx={{ height: 16, fontSize: 10, bgcolor: '#FF9800', color: 'white', cursor: 'default', '& .MuiChip-label': { px: '4px' } }}
                        />
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  {statistics
                    ? (getDisplayFreq(r) / statistics.total_tokens * 100).toFixed(2)
                    : r.percentage.toFixed(2)}%
                </TableCell>
                <TableCell>
                  <Chip
                    label={r.is_metaphor ? (isZh ? '间接' : 'indirect') : (isZh ? '字面' : 'literal')}
                    size="small"
                    color={r.is_metaphor ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  {(() => {
                    const { label, color } = getMetaphorType(r)
                    return (
                      <Chip
                        label={label}
                        size="small"
                        sx={{ bgcolor: color, color: 'white' }}
                      />
                    )
                  })()}
                </TableCell>
                {corpusId && (
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <WordActionMenu
                      word={r.word}
                      wordLemma={r.lemma}
                      corpusId={corpusId}
                      textIds={textIds || 'all'}
                      selectionMode={selectionMode}
                      selectedTags={selectedTags}
                      libraryId={libraryId}
                      selectedEntryIds={selectedEntryIds}
                      showCollocation={true}
                      showWordSketch={true}
                      sourceModule="metaphor"
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={sortedResults.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10))
          setPage(0)
        }}
        rowsPerPageOptions={[25, 50, 100, 250]}
        sx={{ borderTop: 1, borderColor: 'divider' }}
      />
    </Box>
  )
}

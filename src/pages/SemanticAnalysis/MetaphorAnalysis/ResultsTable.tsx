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
  InputAdornment
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import SearchIcon from '@mui/icons-material/Search'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import { useTranslation } from 'react-i18next'
import type {
  MetaphorResult,
  MetaphorStatistics,
  MetaphorSource
} from '../../../types/metaphorAnalysis'
import { METAPHOR_SOURCE_COLORS, METAPHOR_SOURCE_LABELS } from '../../../types/metaphorAnalysis'
import type { SelectionMode } from '../../../types/crossLink'
import { WordActionMenu } from '../../../components/common'

interface ResultsTableProps {
  results: MetaphorResult[]
  statistics: MetaphorStatistics | null
  selectedWords: string[]
  onSelectionChange: (words: string[]) => void
  isLoading: boolean
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
}

type SortField = 'word' | 'frequency' | 'percentage' | 'pos' | 'is_metaphor' | 'source'
type SortDirection = 'asc' | 'desc'

export default function ResultsTable({
  results,
  statistics,
  selectedWords,
  onSelectionChange,
  isLoading,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags
}: ResultsTableProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Sort state
  const [sortField, setSortField] = useState<SortField>('frequency')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Pagination state
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(50)

  // Table filter state
  const [tableFilter, setTableFilter] = useState('')

  // Filter results by table search
  const filteredResults = useMemo(() => {
    if (!tableFilter.trim()) return results
    const filter = tableFilter.toLowerCase()
    return results.filter(r => r.word.toLowerCase().includes(filter))
  }, [results, tableFilter])

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
          aVal = a.frequency
          bVal = b.frequency
          break
        case 'percentage':
          aVal = a.percentage
          bVal = b.percentage
          break
        case 'pos':
          aVal = a.pos
          bVal = b.pos
          break
        case 'is_metaphor':
          aVal = a.is_metaphor ? 1 : 0
          bVal = b.is_metaphor ? 1 : 0
          break
        case 'source':
          aVal = a.source
          bVal = b.source
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredResults, sortField, sortDirection])

  // Paginated results
  const paginatedResults = useMemo(() => {
    const start = page * rowsPerPage
    return sortedResults.slice(start, start + rowsPerPage)
  }, [sortedResults, page, rowsPerPage])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
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
    let csv = 'Word,Lemma,POS,Frequency,Percentage,Is Metaphor,Source\n'
    csv += sortedResults.map(r =>
      `"${r.word}","${r.lemma}","${r.pos}",${r.frequency},${r.percentage.toFixed(4)},${r.is_metaphor},"${r.source}"`
    ).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `metaphor_analysis_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  const getSourceLabel = (source: MetaphorSource) => {
    const labels = METAPHOR_SOURCE_LABELS[source] || METAPHOR_SOURCE_LABELS.unknown
    return isZh ? labels.zh : labels.en
  }

  const getSourceColor = (source: MetaphorSource) => {
    return METAPHOR_SOURCE_COLORS[source] || METAPHOR_SOURCE_COLORS.unknown
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar with Statistics */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {/* Stats */}
        <Stack direction="row" spacing={1} flexWrap="wrap">
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
            </>
          )}
          {selectedWords.length > 0 && (
            <Chip 
              label={`${isZh ? '已选' : 'Selected'}: ${selectedWords.length}`}
              size="small"
              color="primary"
            />
          )}
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* Table filter */}
        <TextField
          size="small"
          placeholder={isZh ? '搜索词汇...' : 'Search words...'}
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          sx={{ width: 200 }}
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
                  {isZh ? '来源' : 'Source'}
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
                <TableCell align="right">{r.frequency.toLocaleString()}</TableCell>
                <TableCell align="right">{r.percentage.toFixed(2)}%</TableCell>
                <TableCell>
                  <Chip
                    label={r.is_metaphor ? (isZh ? '隐喻' : 'Metaphor') : (isZh ? '非隐喻' : 'Literal')}
                    size="small"
                    color={r.is_metaphor ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={getSourceLabel(r.source)}
                    size="small"
                    sx={{ bgcolor: getSourceColor(r.source), color: 'white' }}
                  />
                </TableCell>
                {corpusId && (
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <WordActionMenu
                      word={r.word}
                      corpusId={corpusId}
                      textIds={textIds || 'all'}
                      selectionMode={selectionMode}
                      selectedTags={selectedTags}
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

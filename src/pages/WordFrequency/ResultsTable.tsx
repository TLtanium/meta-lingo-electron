/**
 * Results Table Component
 * Displays word frequency results with sorting, pagination, selection
 */

import { useState, useMemo } from 'react'
import {
  Box,
  Paper,
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
  InputAdornment
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import { useTranslation } from 'react-i18next'
import type { 
  WordFrequencyResult, 
  TableSortConfig, 
  TablePaginationConfig,
  SortDirection 
} from '../../types/wordFrequency'
import type { SelectionMode } from '../../types/crossLink'
import { WordActionMenu } from '../../components/common'

interface ResultsTableProps {
  results: WordFrequencyResult[]
  totalTokens: number
  uniqueWords: number
  sortConfig: TableSortConfig
  paginationConfig: TablePaginationConfig
  selectedWords: string[]
  onSortChange: (config: TableSortConfig) => void
  onPaginationChange: (config: TablePaginationConfig) => void
  onSelectionChange: (selected: string[]) => void
  isLoading?: boolean
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
}

type SortableColumn = keyof WordFrequencyResult

export default function ResultsTable({
  results,
  totalTokens,
  uniqueWords,
  sortConfig,
  paginationConfig,
  selectedWords,
  onSortChange,
  onPaginationChange,
  onSelectionChange,
  isLoading = false,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags
}: ResultsTableProps) {
  const { t } = useTranslation()
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
      const aVal = a[sortConfig.column]
      const bVal = b[sortConfig.column]
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      
      return sortConfig.direction === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })
    return sorted
  }, [filteredResults, sortConfig])

  // Paginate results
  const paginatedResults = useMemo(() => {
    const start = paginationConfig.page * paginationConfig.rowsPerPage
    return sortedResults.slice(start, start + paginationConfig.rowsPerPage)
  }, [sortedResults, paginationConfig])

  // Handle sort click
  const handleSort = (column: SortableColumn) => {
    const isAsc = sortConfig.column === column && sortConfig.direction === 'asc'
    onSortChange({
      column,
      direction: isAsc ? 'desc' : 'asc'
    })
  }

  // Handle row selection
  const handleSelectRow = (word: string) => {
    const newSelected = selectedWords.includes(word)
      ? selectedWords.filter(w => w !== word)
      : [...selectedWords, word]
    onSelectionChange(newSelected)
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

  // Handle select all
  const handleSelectAll = () => {
    if (selectedWords.length === filteredResults.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(filteredResults.map(r => r.word))
    }
  }

  // Export to CSV
  const handleExportCSV = () => {
    const dataToExport = selectedWords.length > 0
      ? filteredResults.filter(r => selectedWords.includes(r.word))
      : filteredResults
    
    const csv = [
      ['Word', 'Frequency', 'Percentage', 'Rank'].join(','),
      ...dataToExport.map(r => 
        [r.word, r.frequency, r.percentage.toFixed(4), r.rank].join(',')
      )
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'word_frequency.csv'
    link.click()
    URL.revokeObjectURL(url)
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

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Stack 
        direction="row" 
        spacing={2} 
        alignItems="center" 
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {/* Stats */}
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

        {/* Table filter */}
        <TextField
          size="small"
          placeholder={t('wordFrequency.table.filterPlaceholder')}
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
        <Tooltip title={t('wordFrequency.table.selectAll')}>
          <IconButton size="small" onClick={handleSelectAll}>
            {selectedWords.length === filteredResults.length ? <DeselectIcon /> : <SelectAllIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t('wordFrequency.table.copySelected')}>
          <IconButton 
            size="small" 
            onClick={handleCopySelected}
            disabled={selectedWords.length === 0}
          >
            <ContentCopyIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('wordFrequency.table.exportCSV')}>
          <IconButton size="small" onClick={handleExportCSV}>
            <FileDownloadIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Table */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
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
                  active={sortConfig.column === 'rank'}
                  direction={sortConfig.column === 'rank' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('rank')}
                >
                  {t('wordFrequency.table.rank')}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.column === 'word'}
                  direction={sortConfig.column === 'word' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('word')}
                >
                  {t('wordFrequency.table.word')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortConfig.column === 'frequency'}
                  direction={sortConfig.column === 'frequency' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('frequency')}
                >
                  {t('wordFrequency.table.frequency')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortConfig.column === 'percentage'}
                  direction={sortConfig.column === 'percentage' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('percentage')}
                >
                  {t('wordFrequency.table.percentage')}
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
            {paginatedResults.map((row) => (
              <TableRow
                key={row.word}
                hover
                selected={selectedWords.includes(row.word)}
                onClick={() => handleSelectRow(row.word)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedWords.includes(row.word)}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleSelectRow(row.word)}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {row.rank}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {row.word}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {row.frequency.toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {row.percentage.toFixed(4)}%
                  </Typography>
                </TableCell>
                {corpusId && (
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <WordActionMenu
                      word={row.word}
                      corpusId={corpusId}
                      textIds={textIds || 'all'}
                      selectionMode={selectionMode}
                      selectedTags={selectedTags}
                      showCollocation={true}
                      showWordSketch={true}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {paginatedResults.length === 0 && (
              <TableRow>
                <TableCell colSpan={corpusId ? 6 : 5} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                    {isLoading 
                      ? t('common.loading') 
                      : t('wordFrequency.table.noData')
                    }
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={filteredResults.length}
        page={paginationConfig.page}
        onPageChange={(_, page) => onPaginationChange({ ...paginationConfig, page })}
        rowsPerPage={paginationConfig.rowsPerPage}
        onRowsPerPageChange={(e) => onPaginationChange({ 
          page: 0, 
          rowsPerPage: parseInt(e.target.value, 10) 
        })}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage={t('wordFrequency.table.rowsPerPage')}
      />
    </Box>
  )
}


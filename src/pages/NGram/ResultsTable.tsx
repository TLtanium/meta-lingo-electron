/**
 * Results Table Component for N-gram Analysis
 * Displays N-gram results with sorting, pagination, and Nest expansion
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
  Checkbox,
  Typography,
  Chip,
  Stack,
  IconButton,
  Collapse,
  LinearProgress,
  TextField,
  InputAdornment,
  Tooltip
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import SearchIcon from '@mui/icons-material/Search'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import { useTranslation } from 'react-i18next'
import type { 
  NGramResult, 
  NestedNGram,
  TableSortConfig, 
  TablePaginationConfig 
} from '../../types/ngram'
import type { SelectionMode } from '../../types/crossLink'
import { WordActionMenu } from '../../components/common'

interface ResultsTableProps {
  results: NGramResult[]
  totalNgrams: number
  uniqueNgrams: number
  sortConfig: TableSortConfig
  paginationConfig: TablePaginationConfig
  selectedNgrams: string[]
  onSortChange: (config: TableSortConfig) => void
  onPaginationChange: (config: TablePaginationConfig) => void
  onSelectionChange: (ngrams: string[]) => void
  isLoading?: boolean
  nestMode?: boolean
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
}

// Row component for expandable nested N-grams
interface NGramRowProps {
  row: NGramResult
  isSelected: boolean
  onSelect: (ngram: string) => void
  nestMode: boolean
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
}

function NGramRow({ row, isSelected, onSelect, nestMode, corpusId, textIds, selectionMode = 'all', selectedTags }: NGramRowProps) {
  const [open, setOpen] = useState(false)
  const hasNested = nestMode && row.nested && row.nested.length > 0

  return (
    <>
      <TableRow 
        hover
        selected={isSelected}
        sx={{ '& > *': { borderBottom: hasNested && open ? 0 : undefined } }}
      >
        {/* Expand button for nested N-grams */}
        {nestMode && (
          <TableCell padding="checkbox" sx={{ width: 48 }}>
            {hasNested && (
              <IconButton
                size="small"
                onClick={() => setOpen(!open)}
              >
                {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
              </IconButton>
            )}
          </TableCell>
        )}
        
        {/* Selection checkbox */}
        <TableCell padding="checkbox">
          <Checkbox
            checked={isSelected}
            onChange={() => onSelect(row.ngram)}
            size="small"
          />
        </TableCell>

        {/* Rank */}
        <TableCell align="right" sx={{ width: 60 }}>
          {row.rank}
        </TableCell>

        {/* N-gram */}
        <TableCell>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2">{row.ngram}</Typography>
            <Chip 
              label={`${row.n}-gram`}
              size="small" 
              variant="outlined"
              color="primary"
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
            {hasNested && (
              <Chip
                label={`+${row.nested!.length}`}
                size="small"
                color="secondary"
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
          </Stack>
        </TableCell>

        {/* Frequency */}
        <TableCell align="right" sx={{ width: 100 }}>
          <Typography variant="body2" fontFamily="monospace">
            {row.frequency.toLocaleString()}
          </Typography>
        </TableCell>

        {/* Percentage */}
        <TableCell align="right" sx={{ width: 100 }}>
          <Typography variant="body2" fontFamily="monospace">
            {row.percentage.toFixed(2)}%
          </Typography>
        </TableCell>

        {/* Actions */}
        {corpusId && (
          <TableCell align="center" onClick={(e) => e.stopPropagation()}>
            <WordActionMenu
              word={row.ngram}
              corpusId={corpusId}
              textIds={textIds || 'all'}
              selectionMode={selectionMode}
              selectedTags={selectedTags}
              showCollocation={true}
              showWordSketch={false}
            />
          </TableCell>
        )}
      </TableRow>

      {/* Nested N-grams expansion */}
      {hasNested && (
        <TableRow>
          <TableCell colSpan={corpusId ? (nestMode ? 7 : 6) : (nestMode ? 6 : 5)} sx={{ py: 0, bgcolor: 'action.hover' }}>
            <Collapse in={open} timeout="auto" unmountOnExit>
              <Box sx={{ py: 1, px: 2 }}>
                <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
                  Sub N-grams:
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>N-gram</TableCell>
                      <TableCell align="right">Frequency</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {row.nested!.map((nested: NestedNGram, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="body2">{nested.ngram}</Typography>
                            <Chip 
                              label={`${nested.n}-gram`}
                              size="small" 
                              variant="outlined"
                              sx={{ height: 18, fontSize: '0.6rem' }}
                            />
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontFamily="monospace">
                            {nested.frequency.toLocaleString()}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default function ResultsTable({
  results,
  totalNgrams,
  uniqueNgrams,
  sortConfig,
  paginationConfig,
  selectedNgrams,
  onSortChange,
  onPaginationChange,
  onSelectionChange,
  isLoading = false,
  nestMode = false,
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
    return results.filter(r => r.ngram.toLowerCase().includes(filter))
  }, [results, tableFilter])

  // Sort results
  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults]
    sorted.sort((a, b) => {
      let comparison = 0
      
      switch (sortConfig.column) {
        case 'ngram':
          comparison = a.ngram.localeCompare(b.ngram)
          break
        case 'frequency':
          comparison = a.frequency - b.frequency
          break
        case 'percentage':
          comparison = a.percentage - b.percentage
          break
        case 'n':
          comparison = a.n - b.n
          break
        default:
          comparison = a.frequency - b.frequency
      }
      
      return sortConfig.direction === 'asc' ? comparison : -comparison
    })
    
    return sorted
  }, [filteredResults, sortConfig])

  // Paginate results
  const paginatedResults = useMemo(() => {
    const start = paginationConfig.page * paginationConfig.rowsPerPage
    return sortedResults.slice(start, start + paginationConfig.rowsPerPage)
  }, [sortedResults, paginationConfig])

  // Handle sort
  const handleSort = (column: TableSortConfig['column']) => {
    onSortChange({
      column,
      direction: sortConfig.column === column && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    })
  }

  // Handle selection
  const handleSelectAll = () => {
    if (selectedNgrams.length === filteredResults.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(filteredResults.map(r => r.ngram))
    }
  }

  const handleSelectOne = (ngram: string) => {
    if (selectedNgrams.includes(ngram)) {
      onSelectionChange(selectedNgrams.filter(n => n !== ngram))
    } else {
      onSelectionChange([...selectedNgrams, ngram])
    }
  }

  // Handle copy selected
  const handleCopySelected = () => {
    const selectedItems = filteredResults.filter(r => selectedNgrams.includes(r.ngram))
    const text = selectedItems.map(r => 
      `${r.ngram}\t${r.frequency}\t${r.percentage.toFixed(4)}%`
    ).join('\n')
    navigator.clipboard.writeText(text)
  }

  // Handle export CSV
  const handleExportCSV = () => {
    const headers = ['N-gram', 'N', 'Frequency', 'Percentage']
    const rows = filteredResults.map(r => [
      r.ngram,
      r.n.toString(),
      r.frequency.toString(),
      `${r.percentage.toFixed(4)}%`
    ])
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'ngram-results.csv'
    link.click()
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Summary stats and actions */}
      <Stack 
        direction="row" 
        spacing={2} 
        alignItems="center" 
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {/* Stats */}
        <Stack direction="row" spacing={1}>
          <Chip 
            label={`${t('ngram.results.totalNgrams')}: ${totalNgrams.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip 
            label={`${t('ngram.results.uniqueNgrams')}: ${uniqueNgrams.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          {selectedNgrams.length > 0 && (
            <Chip 
              label={`${t('common.selected')}: ${selectedNgrams.length}`}
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
            {selectedNgrams.length === filteredResults.length ? <DeselectIcon /> : <SelectAllIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t('wordFrequency.table.copySelected')}>
          <IconButton 
            size="small" 
            onClick={handleCopySelected}
            disabled={selectedNgrams.length === 0}
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

      {/* Loading indicator */}
      {isLoading && <LinearProgress />}

      {/* Table */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {nestMode && <TableCell sx={{ width: 48 }} />}
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedNgrams.length > 0 && selectedNgrams.length < results.length}
                  checked={selectedNgrams.length === results.length && results.length > 0}
                  onChange={handleSelectAll}
                  size="small"
                />
              </TableCell>
              <TableCell align="right" sx={{ width: 60 }}>
                <TableSortLabel
                  active={sortConfig.column === 'ngram'}
                  direction={sortConfig.column === 'ngram' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('ngram')}
                >
                  #
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.column === 'ngram'}
                  direction={sortConfig.column === 'ngram' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('ngram')}
                >
                  {t('ngram.results.ngram')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ width: 100 }}>
                <TableSortLabel
                  active={sortConfig.column === 'frequency'}
                  direction={sortConfig.column === 'frequency' ? sortConfig.direction : 'desc'}
                  onClick={() => handleSort('frequency')}
                >
                  {t('ngram.results.frequency')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ width: 100 }}>
                <TableSortLabel
                  active={sortConfig.column === 'percentage'}
                  direction={sortConfig.column === 'percentage' ? sortConfig.direction : 'desc'}
                  onClick={() => handleSort('percentage')}
                >
                  {t('ngram.results.percentage')}
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
              <NGramRow
                key={`${row.n}-${row.ngram}`}
                row={row}
                isSelected={selectedNgrams.includes(row.ngram)}
                onSelect={handleSelectOne}
                nestMode={nestMode}
                corpusId={corpusId}
                textIds={textIds}
                selectionMode={selectionMode}
                selectedTags={selectedTags}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={results.length}
        page={paginationConfig.page}
        rowsPerPage={paginationConfig.rowsPerPage}
        onPageChange={(_, page) => onPaginationChange({ ...paginationConfig, page })}
        onRowsPerPageChange={(e) => onPaginationChange({ 
          ...paginationConfig, 
          rowsPerPage: parseInt(e.target.value, 10),
          page: 0 
        })}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage={t('common.rowsPerPage')}
      />
    </Box>
  )
}

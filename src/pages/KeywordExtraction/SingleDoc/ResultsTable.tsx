/**
 * Results Table for Single Document Keyword Extraction
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
  TablePagination,
  TableSortLabel,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Stack,
  Chip,
  Typography,
  LinearProgress,
  Checkbox
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import { useTranslation } from 'react-i18next'
import type { SingleDocKeyword, SingleDocAlgorithm } from '../../../types/keyword'
import type { SelectionMode } from '../../../types/crossLink'
import { WordActionMenu } from '../../../components/common'

interface ResultsTableProps {
  results: SingleDocKeyword[]
  totalKeywords: number
  algorithm: SingleDocAlgorithm
  isLoading?: boolean
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
}

type SortColumn = 'rank' | 'keyword' | 'score' | 'frequency'
type SortDirection = 'asc' | 'desc'

export default function ResultsTable({
  results,
  totalKeywords,
  algorithm,
  isLoading = false,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags
}: ResultsTableProps) {
  const { t } = useTranslation()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [orderBy, setOrderBy] = useState<SortColumn>('rank')
  const [order, setOrder] = useState<SortDirection>('asc')
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])

  // Handle sort
  const handleSort = (property: SortColumn) => {
    const isAsc = orderBy === property && order === 'asc'
    setOrder(isAsc ? 'desc' : 'asc')
    setOrderBy(property)
  }

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = results
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = results.filter(r => 
        r.keyword.toLowerCase().includes(query)
      )
    }
    
    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: any = a[orderBy]
      let bVal: any = b[orderBy]
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = (bVal as string).toLowerCase()
      }
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1
      if (aVal > bVal) return order === 'asc' ? 1 : -1
      return 0
    })
    
    return filtered
  }, [results, searchQuery, orderBy, order])

  // Handle export
  const handleExport = () => {
    const headers = ['Rank', 'Keyword', 'Score', 'Frequency', 'Algorithm']
    const csv = [
      headers.join(','),
      ...filteredResults.map(r => [
        r.rank,
        `"${r.keyword}"`,
        r.score.toFixed(6),
        r.frequency,
        r.algorithm
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `keywords-${algorithm}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Get max score for normalization
  const maxScore = useMemo(() => {
    if (results.length === 0) return 1
    return Math.max(...results.map(r => r.score))
  }, [results])

  // Get paginated results
  const paginatedResults = useMemo(() => {
    return filteredResults.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
  }, [filteredResults, page, rowsPerPage])

  // Handle row selection
  const handleSelectRow = (keyword: string) => {
    const newSelected = selectedKeywords.includes(keyword)
      ? selectedKeywords.filter(k => k !== keyword)
      : [...selectedKeywords, keyword]
    setSelectedKeywords(newSelected)
  }

  // Handle select all on current page
  const handleSelectAllPage = () => {
    const pageKeywords = paginatedResults.map(r => r.keyword)
    const allSelected = pageKeywords.every(k => selectedKeywords.includes(k))
    
    if (allSelected) {
      // Deselect all on page
      setSelectedKeywords(selectedKeywords.filter(k => !pageKeywords.includes(k)))
    } else {
      // Select all on page
      const newSelected = [...new Set([...selectedKeywords, ...pageKeywords])]
      setSelectedKeywords(newSelected)
    }
  }

  // Handle select all
  const handleSelectAll = () => {
    if (selectedKeywords.length === filteredResults.length) {
      setSelectedKeywords([])
    } else {
      setSelectedKeywords(filteredResults.map(r => r.keyword))
    }
  }

  // Copy selected keywords
  const handleCopySelected = () => {
    const text = selectedKeywords.join('\n')
    navigator.clipboard.writeText(text)
  }

  // Check if all on page are selected
  const allPageSelected = paginatedResults.length > 0 && 
    paginatedResults.every(r => selectedKeywords.includes(r.keyword))
  const somePageSelected = paginatedResults.some(r => selectedKeywords.includes(r.keyword))

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
            label={`${t('keyword.results.total', 'Total')}: ${filteredResults.length.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip 
            label={algorithm.toUpperCase()}
            size="small"
            variant="outlined"
          />
          {selectedKeywords.length > 0 && (
            <Chip 
              label={`${t('wordFrequency.stats.selected', 'Selected')}: ${selectedKeywords.length}`}
              size="small"
              color="primary"
            />
          )}
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* Table filter */}
        <TextField
          size="small"
          placeholder={t('common.search')}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setPage(0)
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

        {/* Actions */}
        <Tooltip title={t('wordFrequency.table.selectAll', 'Select All')}>
          <IconButton size="small" onClick={handleSelectAll}>
            {selectedKeywords.length === filteredResults.length ? <DeselectIcon /> : <SelectAllIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t('wordFrequency.table.copySelected', 'Copy Selected')}>
          <IconButton 
            size="small" 
            onClick={handleCopySelected}
            disabled={selectedKeywords.length === 0}
          >
            <ContentCopyIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('common.export')}>
          <IconButton size="small" onClick={handleExport}>
            <FileDownloadIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {isLoading && <LinearProgress />}

      {/* Results table */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" align="center">
                <Checkbox
                  indeterminate={somePageSelected && !allPageSelected}
                  checked={allPageSelected}
                  onChange={handleSelectAllPage}
                  size="small"
                />
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={orderBy === 'rank'}
                  direction={orderBy === 'rank' ? order : 'asc'}
                  onClick={() => handleSort('rank')}
                >
                  {t('wordFrequency.table.rank', 'Rank')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={orderBy === 'keyword'}
                  direction={orderBy === 'keyword' ? order : 'asc'}
                  onClick={() => handleSort('keyword')}
                >
                  {t('keyword.results.keyword', 'Keyword')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap', minWidth: 180 }}>
                <TableSortLabel
                  active={orderBy === 'score'}
                  direction={orderBy === 'score' ? order : 'asc'}
                  onClick={() => handleSort('score')}
                >
                  {t('keyword.results.score', 'Score')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap', minWidth: 100 }}>
                <TableSortLabel
                  active={orderBy === 'frequency'}
                  direction={orderBy === 'frequency' ? order : 'asc'}
                  onClick={() => handleSort('frequency')}
                >
                  {t('wordFrequency.table.frequency', 'Frequency')}
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
            {paginatedResults.map((result) => (
                <TableRow 
                  key={`${result.keyword}-${result.rank}`} 
                  hover
                  selected={selectedKeywords.includes(result.keyword)}
                  onClick={() => handleSelectRow(result.keyword)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell padding="checkbox" align="center">
                    <Checkbox
                      checked={selectedKeywords.includes(result.keyword)}
                      size="small"
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleSelectRow(result.keyword)}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="text.secondary">
                      {result.rank}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography fontWeight={500}>{result.keyword}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" alignItems="center" spacing={1} justifyContent="center">
                      <Box sx={{ width: 80 }}>
                        <LinearProgress 
                          variant="determinate" 
                          value={(result.score / maxScore) * 100}
                          sx={{ 
                            height: 6, 
                            borderRadius: 3,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 3
                            }
                          }}
                        />
                      </Box>
                      <Typography variant="body2">
                        {result.score.toFixed(4)}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="center">
                    {result.frequency.toLocaleString()}
                  </TableCell>
                  {corpusId && (
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <WordActionMenu
                        word={result.keyword}
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
                      : t('wordFrequency.table.noData', 'No data')
                    }
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={filteredResults.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10))
          setPage(0)
        }}
      />
    </Box>
  )
}


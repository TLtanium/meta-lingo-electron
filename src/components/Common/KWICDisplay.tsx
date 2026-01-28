import { useState } from 'react'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  Chip,
  styled
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { useTranslation } from 'react-i18next'
import type { KWICResult } from '../../types'

interface KWICDisplayProps {
  results: KWICResult[]
  keyword: string
  onSort?: (field: 'left' | 'right') => void
  sortField?: 'left' | 'right' | null
  sortOrder?: 'asc' | 'desc'
}

const KeywordCell = styled(TableCell)(({ theme }) => ({
  fontWeight: 700,
  color: theme.palette.primary.main,
  backgroundColor: theme.palette.primary.light + '20',
  textAlign: 'center',
  whiteSpace: 'nowrap'
}))

const ContextCell = styled(TableCell)<{ align: 'left' | 'right' }>(({ align }) => ({
  textAlign: align,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 300
}))

export default function KWICDisplay({
  results,
  keyword,
  onSort,
  sortField,
  sortOrder
}: KWICDisplayProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const handleCopy = (result: KWICResult) => {
    const text = `${result.left} ${result.keyword} ${result.right}`
    navigator.clipboard.writeText(text)
  }

  const handleExport = () => {
    const csv = [
      ['Left Context', 'Keyword', 'Right Context', 'Source'].join('\t'),
      ...results.map(r => [r.left, r.keyword, r.right, r.sourceText].join('\t'))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/tab-separated-values' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kwic_${keyword}.tsv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const displayedResults = results.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  )

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6">
            KWIC Concordance
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {results.length} results for "{keyword}"
          </Typography>
        </Box>
        <Tooltip title={t('common.export')}>
          <IconButton onClick={handleExport}>
            <FileDownloadIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Table */}
      <TableContainer sx={{ maxHeight: 500 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 50 }}>#</TableCell>
              <ContextCell 
                align="right"
                onClick={() => onSort?.('left')}
                sx={{ cursor: onSort ? 'pointer' : 'default' }}
              >
                Left Context
                {sortField === 'left' && (
                  <Chip 
                    label={sortOrder === 'asc' ? 'A-Z' : 'Z-A'} 
                    size="small" 
                    sx={{ ml: 1 }}
                  />
                )}
              </ContextCell>
              <KeywordCell>Keyword</KeywordCell>
              <ContextCell 
                align="left"
                onClick={() => onSort?.('right')}
                sx={{ cursor: onSort ? 'pointer' : 'default' }}
              >
                Right Context
                {sortField === 'right' && (
                  <Chip 
                    label={sortOrder === 'asc' ? 'A-Z' : 'Z-A'} 
                    size="small" 
                    sx={{ ml: 1 }}
                  />
                )}
              </ContextCell>
              <TableCell sx={{ width: 150 }}>Source</TableCell>
              <TableCell sx={{ width: 50 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedResults.map((result, index) => (
              <TableRow key={index} hover>
                <TableCell>{page * rowsPerPage + index + 1}</TableCell>
                <ContextCell align="right">
                  <Tooltip title={result.left}>
                    <span>{result.left}</span>
                  </Tooltip>
                </ContextCell>
                <KeywordCell>{result.keyword}</KeywordCell>
                <ContextCell align="left">
                  <Tooltip title={result.right}>
                    <span>{result.right}</span>
                  </Tooltip>
                </ContextCell>
                <TableCell>
                  <Tooltip title={result.sourceText}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        maxWidth: 150, 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {result.sourceText}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Tooltip title="Copy">
                    <IconButton size="small" onClick={() => handleCopy(result)}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={results.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Paper>
  )
}


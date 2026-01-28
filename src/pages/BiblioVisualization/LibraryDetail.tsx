/**
 * Library Detail Component for Bibliographic Visualization
 * 
 * Shows entries list with filtering and visualization options
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
  Chip
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { useTranslation } from 'react-i18next'
import type { BiblioLibrary, BiblioEntry, BiblioFilter, BiblioStatistics } from '../../types/biblio'
import * as biblioApi from '../../api/biblio'
import FilterPanel from './FilterPanel'
import EntryDetailDialog from './EntryDetailDialog'

interface LibraryDetailProps {
  library: BiblioLibrary
  onBack: () => void
  onUpload: () => void
}

export default function LibraryDetail({ library, onBack, onUpload }: LibraryDetailProps) {
  const { t } = useTranslation()
  
  const [entries, setEntries] = useState<BiblioEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<BiblioFilter>({})
  const [statistics, setStatistics] = useState<BiblioStatistics | null>(null)
  
  // Entry detail dialog
  const [selectedEntry, setSelectedEntry] = useState<BiblioEntry | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  
  // Load entries
  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    const response = await biblioApi.listEntries({
      libraryId: library.id,
      page: page + 1,
      pageSize,
      filters
    })
    
    setLoading(false)
    
    if (response.success && response.data) {
      setEntries(response.data.entries)
      setTotal(response.data.total)
    } else {
      setError(response.error || t('biblio.loadFailed'))
    }
  }, [library.id, page, pageSize, filters, t])
  
  // Load statistics
  const loadStatistics = useCallback(async () => {
    const response = await biblioApi.getStatistics(library.id)
    if (response.success && response.data) {
      setStatistics(response.data)
    }
  }, [library.id])
  
  useEffect(() => {
    loadEntries()
  }, [loadEntries])
  
  useEffect(() => {
    loadStatistics()
  }, [loadStatistics])
  
  // Handle page change
  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage)
  }
  
  // Handle page size change
  const handlePageSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPageSize(parseInt(event.target.value, 10))
    setPage(0)
  }
  
  // Handle filter change
  const handleFiltersChange = (newFilters: BiblioFilter) => {
    setFilters(newFilters)
    setPage(0)
  }
  
  // Handle entry click
  const handleEntryClick = (entry: BiblioEntry) => {
    setSelectedEntry(entry)
    setDetailDialogOpen(true)
  }
  
  // Handle entry delete
  const handleDeleteEntry = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!confirm(t('biblio.deleteEntryConfirm'))) return
    
    const response = await biblioApi.deleteEntry(entryId)
    if (response.success) {
      loadEntries()
      loadStatistics()
    }
  }
  
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <IconButton onClick={onBack}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6">{library.name}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip 
                label={library.source_type} 
                size="small" 
                color={library.source_type === 'WOS' ? 'primary' : 'secondary'}
                variant="outlined"
              />
              {statistics && (
                <>
                  <Typography variant="body2" color="text.secondary">
                    {statistics.total} {t('biblio.entries')}
                  </Typography>
                  {statistics.year_start && statistics.year_end && (
                    <Typography variant="body2" color="text.secondary">
                      ({statistics.year_start} - {statistics.year_end})
                    </Typography>
                  )}
                </>
              )}
            </Box>
          </Box>
          <Button
            variant="outlined"
            startIcon={<CloudUploadIcon />}
            onClick={onUpload}
          >
            {t('biblio.addMore')}
          </Button>
        </Box>
      </Box>
      
      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {/* Filter Panel */}
        <FilterPanel
          libraryId={library.id}
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />
        
        {/* Loading */}
        {loading && <LinearProgress sx={{ my: 2 }} />}
        
        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>
        )}
        
        {/* Entries Table */}
        <TableContainer 
          component={Paper}
          sx={{ 
            mt: 3,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden'
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell 
                  sx={{ 
                    fontWeight: 600,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  {t('biblio.title')}
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 600,
                    width: 200,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  {t('biblio.authors')}
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 600,
                    width: 120,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  {t('biblio.year')}
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 600,
                    width: 150,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  {t('biblio.journal')}
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 600,
                    width: 80,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  {t('biblio.citations')}
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 600,
                    width: 120,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  {t('common.actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry, index) => (
                <TableRow 
                  key={entry.id}
                  hover
                  sx={{ 
                    cursor: 'pointer',
                    bgcolor: (theme) => index % 2 === 0 
                      ? 'transparent' 
                      : (theme.palette.mode === 'dark' 
                        ? 'rgba(255, 255, 255, 0.02)' 
                        : 'rgba(0, 0, 0, 0.01)'),
                    '&:hover': {
                      bgcolor: (theme) => theme.palette.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.03)'
                    }
                  }}
                  onClick={() => handleEntryClick(entry)}
                >
                  <TableCell>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.5
                      }}
                    >
                      {entry.title}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography 
                      variant="body2" 
                      color="text.secondary"
                      noWrap
                    >
                      {entry.authors.slice(0, 2).join('; ')}
                      {entry.authors.length > 2 && ` +${entry.authors.length - 2}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {entry.year || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {entry.journal || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {entry.citation_count || 0}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <Tooltip title={t('biblio.viewDetails')}>
                        <IconButton 
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEntryClick(entry)
                          }}
                          sx={{
                            '&:hover': {
                              bgcolor: 'primary.light',
                              color: 'primary.contrastText'
                            }
                          }}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.delete')}>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={(e) => handleDeleteEntry(entry.id, e)}
                          sx={{
                            '&:hover': {
                              bgcolor: 'error.light',
                              color: 'error.contrastText'
                            }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              
              {entries.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary" variant="body1">
                      {t('biblio.noEntries')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPage={pageSize}
            onRowsPerPageChange={handlePageSizeChange}
            rowsPerPageOptions={[10, 25, 50, 100]}
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider'
            }}
          />
        </TableContainer>
      </Box>
      
      {/* Entry Detail Dialog */}
      <EntryDetailDialog
        entry={selectedEntry}
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
      />
    </Box>
  )
}


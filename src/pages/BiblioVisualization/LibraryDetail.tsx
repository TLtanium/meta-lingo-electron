/**
 * Library Detail Component for Bibliographic Visualization
 *
 * Shows entries list with filtering, progress bars, re-annotation (SpaCy/USAS/MIPVU)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  Button,
  ButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
  Chip,
  TextField,
  InputAdornment,
  Checkbox,
  Stack,
  CircularProgress,
  Link
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import CategoryIcon from '@mui/icons-material/Category'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { useTranslation } from 'react-i18next'
import type { BiblioLibrary, BiblioEntry, BiblioFilter, BiblioStatistics } from '../../types/biblio'
import type { BiblioEntrySortColumn, BiblioEntrySortDir } from '../../api/biblio'
import * as biblioApi from '../../api/biblio'
import { corpusApi } from '../../api'
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
  const [titleSearch, setTitleSearch] = useState('')
  const [statistics, setStatistics] = useState<BiblioStatistics | null>(null)
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
  const [reAnnotating, setReAnnotating] = useState<'spacy' | 'usas' | 'mipvu' | null>(null)

  const [selectedEntry, setSelectedEntry] = useState<BiblioEntry | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  /** Total entries (matching filters) still in SpaCy/USAS/MIPVU processing; from list API */
  const [totalProcessingCount, setTotalProcessingCount] = useState(0)
  const [sortBy, setSortBy] = useState<BiblioEntrySortColumn>('year')
  const [sortOrder, setSortOrder] = useState<BiblioEntrySortDir>('desc')
  const [exportingCsv, setExportingCsv] = useState(false)

  const handleSort = (column: BiblioEntrySortColumn) => {
    const isAsc = sortBy === column && sortOrder === 'asc'
    setSortBy(column)
    setSortOrder(isAsc ? 'desc' : 'asc')
    setPage(0)
  }

  // Derive stage label from task_message for progress display (same pipeline as corpus: spacy -> usas -> mipvu)
  const getStageLabel = (message?: string | null): string => {
    if (!message) return 'Processing'
    const m = message.toLowerCase()
    if (m.includes('spacy')) return 'SpaCy'
    if (m.includes('usas')) return 'USAS'
    if (m.includes('mipvu')) return 'MIPVU'
    return 'Processing'
  }

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError(null)

    const response = await biblioApi.listEntries({
      libraryId: library.id,
      page: page + 1,
      pageSize,
      filters,
      titleSearch: titleSearch.trim() || undefined,
      orderBy: sortBy,
      orderDir: sortOrder,
      includeStatus: true
    })

    setLoading(false)

    if (response.success && response.data) {
      setEntries(response.data.entries)
      setTotal(response.data.total)
      setTotalProcessingCount(response.data.processing_count ?? 0)
    } else {
      setError(response.error || t('biblio.loadFailed'))
    }
  }, [library.id, page, pageSize, filters, titleSearch, sortBy, sortOrder, t])

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

  // Poll task status for entries with pending/processing
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    const hasActive = entries.some(
      e => e.task_id && (e.task_status === 'pending' || e.task_status === 'processing')
    )
    if (!hasActive) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }
    pollingRef.current = setInterval(async () => {
      for (const entry of entries) {
        if (!entry.task_id || (entry.task_status !== 'pending' && entry.task_status !== 'processing')) continue
        const res = await corpusApi.getTaskStatus(entry.task_id)
        if (res.success && res.data) {
          setEntries(prev =>
            prev.map(e =>
              e.task_id === entry.task_id
                ? {
                    ...e,
                    task_status: res.data!.status,
                    task_progress: res.data!.progress ?? 0,
                    task_message: res.data!.message
                  }
                : e
            )
          )
        }
      }
    }, 2000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [entries])

  const handlePageChange = (_: unknown, newPage: number) => setPage(newPage)
  const handlePageSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPageSize(parseInt(event.target.value, 10))
    setPage(0)
  }
  const handleFiltersChange = (newFilters: BiblioFilter) => {
    setFilters(newFilters)
    setPage(0)
  }

  const handleEntryClick = (entry: BiblioEntry) => {
    setSelectedEntry(entry)
    setDetailDialogOpen(true)
  }

  const toggleSelectEntry = (entryId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedEntryIds(prev => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  const selectAllWithAbstract = () => {
    const withText = entries.filter(e => e.text_id).map(e => e.id)
    setSelectedEntryIds(prev => (prev.size === withText.length ? new Set() : new Set(withText)))
  }

  const selectAllOnPage = () => {
    const allOnPage = entries.map(e => e.id)
    setSelectedEntryIds(prev => (prev.size === allOnPage.length ? new Set() : new Set(allOnPage)))
  }

  const handleBulkDelete = async () => {
    if (selectedEntryIds.size === 0) return
    if (!confirm(t('biblio.bulkDeleteConfirm', { count: selectedEntryIds.size }))) return
    const response = await biblioApi.deleteEntriesBatch(Array.from(selectedEntryIds))
    if (response.success && response.data) {
      await loadEntries()
      loadStatistics()
      setSelectedEntryIds(new Set())
    } else {
      setError(response.error || t('biblio.loadFailed'))
    }
  }

  const handleExportCsv = async () => {
    setExportingCsv(true)
    const PAGE_SIZE = 500
    let list: BiblioEntry[] = []
    try {
      if (selectedEntryIds.size > 0) {
        const response = await biblioApi.getEntriesByIds(Array.from(selectedEntryIds))
        if (!response.success || !response.data) {
          setExportingCsv(false)
          return
        }
        list = response.data.entries
      } else {
        let page = 1
        for (;;) {
          const response = await biblioApi.listEntries({
            libraryId: library.id,
            page,
            pageSize: PAGE_SIZE,
            filters,
            titleSearch: titleSearch.trim() || undefined,
            orderBy: sortBy,
            orderDir: sortOrder,
            includeStatus: false
          })
          if (!response.success || !response.data) break
          const { entries: chunk, total_pages } = response.data
          list.push(...chunk)
          if (page >= total_pages || chunk.length < PAGE_SIZE) break
          page += 1
        }
      }
      if (list.length === 0) {
        setExportingCsv(false)
        return
      }
    const escapeCsv = (v: string) => {
      if (v == null || v === undefined) return ''
      const s = String(v).replace(/"/g, '""')
      return /[,\n"]/.test(s) ? `"${s}"` : s
    }
    const relevanceToStars = (n: number) => {
      const v = Math.min(5, Math.max(0, n))
      return '★'.repeat(v) + '☆'.repeat(5 - v)
    }
    const headers = [
      t('biblio.relevance'),
      t('biblio.year'),
      t('biblio.authors'),
      t('biblio.entryTitle'),
      t('biblio.doi'),
      t('biblio.journal'),
      t('biblio.abstract'),
      t('biblio.tags'),
      t('biblio.notes')
    ]
    const rows = list.map((e: BiblioEntry) => [
      relevanceToStars(e.relevance ?? 0),
      e.year ?? '',
      (e.authors || []).join('; '),
      e.title ?? '',
      e.doi ? `https://doi.org/${e.doi}` : '',
      e.journal ?? '',
      e.abstract ?? '',
      (e.tags || []).join('; '),
      e.notes ?? ''
    ])
      const csvContent = [
        headers.join(','),
        ...rows.map((row: (string | number)[]) => row.map(c => escapeCsv(String(c))).join(','))
      ].join('\n')
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const safeName = (library.name || 'biblio').replace(/[<>:"/\\|?*]/g, '_')
      link.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingCsv(false)
    }
  }

  const handleReAnnotate = async (type: 'spacy' | 'usas' | 'mipvu') => {
    const corpusId = library.corpus_id
    if (!corpusId) return
    const selected = entries.filter(e => selectedEntryIds.has(e.id) && e.text_id)
    if (selected.length === 0) return
    setReAnnotating(type)
    try {
      for (const entry of selected) {
        if (type === 'spacy') await corpusApi.reAnnotateSpacy(corpusId, entry.text_id!)
        else if (type === 'usas') await corpusApi.reAnnotateUsas(corpusId, entry.text_id!)
        else await corpusApi.reAnnotateMipvu(corpusId, entry.text_id!)
      }
      await loadEntries()
      setSelectedEntryIds(new Set())
    } finally {
      setReAnnotating(null)
    }
  }

  const handleDeleteEntry = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t('biblio.deleteEntryConfirm'))) return
    const response = await biblioApi.deleteEntry(entryId)
    if (response.success) {
      loadEntries()
      loadStatistics()
    }
  }

  const canMipvu = (library.language || '').toLowerCase() === 'english' || (library.language || '').toLowerCase() === 'en'
  const selectedWithText = entries.filter(e => selectedEntryIds.has(e.id) && e.text_id).length

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
          <Box sx={{ flex: 1 }} />
          <ButtonGroup variant="outlined" size="small">
            <Tooltip title={selectedWithText === 0 ? t('corpus.selectTextsFirst', '请先选择文献') : t('corpus.spacyReAnnotate')}>
              <span>
                <Button
                  onClick={() => handleReAnnotate('spacy')}
                  disabled={selectedWithText === 0 || reAnnotating !== null || !library.corpus_id}
                  startIcon={reAnnotating === 'spacy' ? undefined : <SmartToyIcon />}
                >
                  SpaCy
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={selectedWithText === 0 ? t('corpus.selectTextsFirst', '请先选择文献') : t('corpus.usasReAnnotate', 'USAS 重新标注')}>
              <span>
                <Button
                  onClick={() => handleReAnnotate('usas')}
                  disabled={selectedWithText === 0 || reAnnotating !== null || !library.corpus_id}
                  startIcon={reAnnotating === 'usas' ? undefined : <CategoryIcon />}
                >
                  USAS
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={!canMipvu ? t('corpus.mipvuEnglishOnly', 'MIPVU 仅支持英语') : selectedWithText === 0 ? t('corpus.selectTextsFirst', '请先选择文献') : t('corpus.mipvuReAnnotate', 'MIPVU 重新标注')}>
              <span>
                <Button
                  onClick={() => handleReAnnotate('mipvu')}
                  disabled={selectedWithText === 0 || reAnnotating !== null || !library.corpus_id || !canMipvu}
                  startIcon={reAnnotating === 'mipvu' ? undefined : <AutoGraphIcon />}
                >
                  MIPVU
                </Button>
              </span>
            </Tooltip>
          </ButtonGroup>
          <Tooltip title={t('common.refresh')}>
            <IconButton onClick={() => { loadEntries(); loadStatistics() }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {selectedEntryIds.size > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleBulkDelete}
            >
              {t('biblio.bulkDelete')} ({selectedEntryIds.size})
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={exportingCsv ? <CircularProgress size={16} color="inherit" /> : <FileDownloadIcon />}
            onClick={handleExportCsv}
            disabled={exportingCsv}
          >
            {exportingCsv ? t('biblio.exportingCsv') : t('biblio.exportCsv')}
          </Button>
          <Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={onUpload}>
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

        {/* Search by title */}
        <TextField
          size="small"
          placeholder={t('biblio.searchByTitle')}
          value={titleSearch}
          onChange={e => setTitleSearch(e.target.value)}
          onBlur={() => setPage(0)}
          fullWidth
          sx={{ mt: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            )
          }}
        />
        
        {/* Loading */}
        {loading && <LinearProgress sx={{ my: 2 }} />}
        
        {/* Processing summary: total entries (matching filters) still in pipeline, not just current page */}
        {totalProcessingCount > 0 && (
          <Alert severity="info" sx={{ mt: 2 }} icon={<CircularProgress size={20} />}>
            {t('biblio.processingCount', { count: totalProcessingCount })}
          </Alert>
        )}
        
        {/* Error */}
        {error && (
          <Alert 
            severity="error" 
            sx={{ my: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => { setError(null); loadEntries(); loadStatistics() }}>
                {t('common.retry')}
              </Button>
            }
          >
            <Typography variant="body2" component="span">{error}</Typography>
            {(error === 'Network Error' || error.toLowerCase().includes('network')) && (
              <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.9 }}>
                {t('biblio.networkErrorHint')}
              </Typography>
            )}
          </Alert>
        )}
        
        {/* Entries Table — table and header stretch with container width */}
        <TableContainer 
          component={Paper}
          sx={{ 
            mt: 3,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'auto',
            width: '100%'
          }}
        >
          <Table size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 48, fontWeight: 600, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
                <Checkbox
                  indeterminate={selectedEntryIds.size > 0 && selectedEntryIds.size < entries.length}
                  checked={entries.length > 0 && selectedEntryIds.size === entries.length}
                  onChange={selectAllOnPage}
                />
                </TableCell>
                <TableCell sx={{ fontWeight: 600, width: 120, minWidth: 120, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
                  <TableSortLabel
                    active={sortBy === 'relevance'}
                    direction={sortBy === 'relevance' ? sortOrder : 'desc'}
                    onClick={() => handleSort('relevance')}
                  >
                    {t('biblio.relevance')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, width: '22%', minWidth: 160, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
                  <TableSortLabel
                    active={sortBy === 'title'}
                    direction={sortBy === 'title' ? sortOrder : 'asc'}
                    onClick={() => handleSort('title')}
                  >
                    {t('biblio.title')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, width: 90, minWidth: 90, maxWidth: 90, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
                  {t('biblio.doi')}
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 600,
                    width: '15%',
                    minWidth: 120,
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
                    width: '8%',
                    minWidth: 72,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  <TableSortLabel
                    active={sortBy === 'year'}
                    direction={sortBy === 'year' ? sortOrder : 'desc'}
                    onClick={() => handleSort('year')}
                  >
                    {t('biblio.year')}
                  </TableSortLabel>
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 600,
                    width: '14%',
                    minWidth: 100,
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  <TableSortLabel
                    active={sortBy === 'journal'}
                    direction={sortBy === 'journal' ? sortOrder : 'asc'}
                    onClick={() => handleSort('journal')}
                  >
                    {t('biblio.journal')}
                  </TableSortLabel>
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 600,
                    width: '10%',
                    minWidth: 80,
                    whiteSpace: 'nowrap',
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '2px solid',
                    borderColor: 'divider'
                  }}
                >
                  <TableSortLabel
                    active={sortBy === 'citation_count'}
                    direction={sortBy === 'citation_count' ? sortOrder : 'desc'}
                    onClick={() => handleSort('citation_count')}
                  >
                    {t('biblio.citations')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, width: '8%', minWidth: 72, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
                  {t('biblio.tags')}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, width: '8%', minWidth: 72, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
                  {t('biblio.notes')}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, width: 100, minWidth: 80, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
                  {t('common.actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry, index) => {
                const isProcessing = !!(entry.task_id && (entry.task_status === 'pending' || entry.task_status === 'processing'))
                return (
                <TableRow
                  key={entry.id}
                  hover
                  sx={{
                    cursor: 'pointer',
                    bgcolor: isProcessing
                      ? (theme) => theme.palette.action.hover
                      : (theme) =>
                          index % 2 === 0
                            ? 'transparent'
                            : theme.palette.mode === 'dark'
                              ? 'rgba(255, 255, 255, 0.02)'
                              : 'rgba(0, 0, 0, 0.01)',
                    '&:hover': {
                      bgcolor: (theme) =>
                        theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
                    }
                  }}
                  onClick={() => handleEntryClick(entry)}
                >
                  <TableCell padding="checkbox" onClick={e => toggleSelectEntry(entry.id)(e)}>
                    <Checkbox checked={selectedEntryIds.has(entry.id)} />
                  </TableCell>
                  <TableCell sx={{ width: 120, minWidth: 120 }}>
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        (entry.relevance ?? 0) >= star ? (
                          <StarIcon key={star} sx={{ fontSize: 18, color: 'warning.main' }} />
                        ) : (
                          <StarBorderIcon key={star} sx={{ fontSize: 18, color: 'action.disabled' }} />
                        )
                      ))}
                    </Box>
                  </TableCell>
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
                    {isProcessing && (
                      <CircularProgress size={20} sx={{ mt: 0.5, display: 'block' }} />
                    )}
                    {entry.task_id && (entry.task_status === 'pending' || entry.task_status === 'processing') && (
                      <Box sx={{ mt: 0.5 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            label={getStageLabel(entry.task_message)}
                            size="small"
                            color="warning"
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                          <Typography variant="caption" color="warning.main">
                            {entry.task_progress ?? 0}%
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={entry.task_progress ?? 0}
                          sx={{ mt: 0.5, height: 4, borderRadius: 1 }}
                        />
                        {entry.task_message && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            {entry.task_message}
                          </Typography>
                        )}
                      </Box>
                    )}
                    {!isProcessing && entry.task_status === 'completed' && (
                      <Chip size="small" label={t('biblio.completed')} color="success" variant="outlined" sx={{ mt: 0.5 }} />
                    )}
                    {!isProcessing && entry.task_status === 'failed' && (
                      <Chip size="small" label={t('biblio.failed')} color="error" variant="outlined" sx={{ mt: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell sx={{ width: 90, minWidth: 90, maxWidth: 90 }}>
                    {entry.doi ? (
                      <Link
                        href={`https://doi.org/${entry.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="body2"
                        sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {entry.doi}
                      </Link>
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
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
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(entry.tags || []).slice(0, 2).map(tag => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                      ))}
                      {(entry.tags || []).length > 2 && (
                        <Chip label={`+${(entry.tags || []).length - 2}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.notes ? (entry.notes.length > 30 ? entry.notes.slice(0, 30) + '…' : entry.notes) : '-'}
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
              )
              })}
              
              {entries.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 6 }}>
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
        existingTags={Array.from(new Set(entries.flatMap(e => e.tags || [])))}
        onEntryUpdated={updated => {
          setSelectedEntry(updated)
          setEntries(prev => prev.map(e => (e.id === updated.id ? updated : e)))
        }}
      />
    </Box>
  )
}


/**
 * Collocation Results Table Component
 * Displays collocation analysis results with dynamic statistical columns,
 * sorting, pagination, selection, cross-link (three-dot menu), sticky columns,
 * and horizontal scrolling for many stat columns.
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
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import TuneIcon from '@mui/icons-material/Tune'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import LinkIcon from '@mui/icons-material/Link'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import { useTranslation } from 'react-i18next'
import type {
  CollocationAnalysisResult,
  StatMeasureConfig,
  CollocationTableSortConfig,
  CollocationTablePaginationConfig,
  SortableColumn,
  StatisticalMeasure
} from '../../../types/collocationAnalysis'
import { STAT_MEASURE_INFO } from '../../../types/collocationAnalysis'
import { useTabStore } from '../../../stores/tabStore'
import type { TabType, CrossLinkParams } from '../../../types'

interface CollocationResultsTableProps {
  results: CollocationAnalysisResult[]
  totalTokens: number
  uniqueCollocates: number
  nodeFrequency: number
  nodeWord: string
  span: number
  matchMode?: 'lemma' | 'word'
  statConfigs: StatMeasureConfig[]
  sortConfig: CollocationTableSortConfig
  paginationConfig: CollocationTablePaginationConfig
  selectedWords: string[]
  onSortChange: (config: CollocationTableSortConfig) => void
  onPaginationChange: (config: CollocationTablePaginationConfig) => void
  onSelectionChange: (selected: string[]) => void
  onOpenStatisticsDialog: () => void
  isLoading?: boolean
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: 'all' | 'selected' | 'tags'
  selectedTags?: string[]
  libraryId?: string
  selectedEntryIds?: string[]
}

export default function CollocationResultsTable({
  results,
  totalTokens,
  uniqueCollocates,
  nodeFrequency,
  nodeWord,
  span,
  matchMode = 'lemma',
  statConfigs,
  sortConfig,
  paginationConfig,
  selectedWords,
  onSortChange,
  onPaginationChange,
  onSelectionChange,
  onOpenStatisticsDialog,
  isLoading = false,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags,
  libraryId,
  selectedEntryIds
}: CollocationResultsTableProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const { openTab } = useTabStore()
  const [tableFilter, setTableFilter] = useState('')

  // Three-dot menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [menuWord, setMenuWord] = useState<string>('')
  // Store pending action to execute after menu exit transition completes
  const pendingActionRef = useRef<(() => void) | null>(null)

  // Get enabled stat configs sorted by order
  const enabledStats = useMemo(() =>
    statConfigs
      .filter(c => c.enabled)
      .sort((a, b) => a.order - b.order),
    [statConfigs]
  )

  // Get stat label
  const getStatLabel = (id: StatisticalMeasure): string => {
    const info = STAT_MEASURE_INFO.find(m => m.id === id)
    if (!info) return id
    return isZh ? info.name_zh : info.name_en
  }

  // Filter results: text filter + threshold filter (must satisfy ALL enabled thresholds)
  const filteredResults = useMemo(() => {
    let filtered = results

    // Apply statistical threshold filters: result must pass ALL enabled thresholds
    const thresholdConfigs = statConfigs.filter(c => c.enabled && c.threshold !== null)
    if (thresholdConfigs.length > 0) {
      filtered = filtered.filter(r =>
        thresholdConfigs.every(config => {
          const value = (r as any)[config.id]
          return typeof value === 'number' && value >= config.threshold!
        })
      )
    }

    // Apply text filter
    if (tableFilter.trim()) {
      const filter = tableFilter.toLowerCase()
      filtered = filtered.filter(r => r.collocate.toLowerCase().includes(filter))
    }

    return filtered
  }, [results, tableFilter, statConfigs])

  // Sort results
  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults]
    sorted.sort((a, b) => {
      const col = sortConfig.column
      let aVal: number | string
      let bVal: number | string

      if (col === 'collocate') {
        aVal = a.collocate
        bVal = b.collocate
      } else if (col === 'collocation_freq') {
        aVal = a.collocation_freq
        bVal = b.collocation_freq
      } else if (col === 'total_freq') {
        aVal = a.total_freq
        bVal = b.total_freq
      } else {
        aVal = (a as any)[col] ?? 0
        bVal = (b as any)[col] ?? 0
      }

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

  // Paginate
  const paginatedResults = useMemo(() => {
    const start = paginationConfig.page * paginationConfig.rowsPerPage
    return sortedResults.slice(start, start + paginationConfig.rowsPerPage)
  }, [sortedResults, paginationConfig])

  // Handlers
  const handleSort = (column: SortableColumn) => {
    const isAsc = sortConfig.column === column && sortConfig.direction === 'asc'
    onSortChange({ column, direction: isAsc ? 'desc' : 'asc' })
  }

  const handleSelectRow = (word: string) => {
    const newSelected = selectedWords.includes(word)
      ? selectedWords.filter(w => w !== word)
      : [...selectedWords, word]
    onSelectionChange(newSelected)
  }

  const handleSelectAllPage = () => {
    const pageWords = paginatedResults.map(r => r.collocate)
    const allSelected = pageWords.every(w => selectedWords.includes(w))
    if (allSelected) {
      onSelectionChange(selectedWords.filter(w => !pageWords.includes(w)))
    } else {
      onSelectionChange([...new Set([...selectedWords, ...pageWords])])
    }
  }

  const handleSelectAll = () => {
    if (selectedWords.length === filteredResults.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(filteredResults.map(r => r.collocate))
    }
  }

  const handleExportCSV = () => {
    const dataToExport = selectedWords.length > 0
      ? filteredResults.filter(r => selectedWords.includes(r.collocate))
      : filteredResults

    const headers = [
      'Collocate',
      'Collocation Freq',
      'Total Freq',
      ...enabledStats.map(s => s.id)
    ]

    const csv = [
      headers.join(','),
      ...dataToExport.map(r =>
        [
          r.collocate,
          r.collocation_freq,
          r.total_freq,
          ...enabledStats.map(s => ((r as any)[s.id] ?? '').toString())
        ].join(',')
      )
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `collocation_${nodeWord}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleCopySelected = () => {
    navigator.clipboard.writeText(selectedWords.join('\n'))
  }

  // Three-dot menu handlers
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, word: string) => {
    event.stopPropagation()
    setMenuAnchor(event.currentTarget)
    setMenuWord(word)
  }

  const handleMenuClose = () => {
    setMenuAnchor(null)
    setMenuWord('')
  }

  // Handle menu exit transition complete - execute pending action
  const handleMenuExited = () => {
    if (pendingActionRef.current) {
      pendingActionRef.current()
      pendingActionRef.current = null
    }
  }

  // Cross-link to Co-occurrence module
  const handleCrossLink = (collocateWord: string) => {
    if (!corpusId) return

    const crossLinkParams: CrossLinkParams = {
      searchWord: nodeWord,
      corpusId,
      textIds: textIds || 'all',
      selectionMode: selectionMode as any,
      selectedTags,
      autoSearch: true,
      highlightWords: [collocateWord],
      contextFilterWords: [collocateWord],
      sourceModule: 'collocationAnalysis' as any,
      contextSize: span,
      matchMode: matchMode,
      ...(libraryId && { libraryId }),
      ...(libraryId && selectionMode === 'selected' && selectedEntryIds?.length && { selectedEntryIds })
    }

    // Defer tab opening until menu exit transition completes (prevents floating button artifact)
    pendingActionRef.current = () => {
      openTab({
        type: 'collocation' as TabType,
        title: `${t('collocation.title')} - ${nodeWord}`,
        props: { crossLinkParams }
      })
    }
    // Close menu first - action will execute when transition completes
    handleMenuClose()
  }

  // Cross-link to N-gram analysis (same pattern as annotation mode)
  const handleOpenNgram = (linkWord: string) => {
    if (!corpusId) return
    const crossLinkParams: CrossLinkParams = {
      searchWord: linkWord,
      corpusId,
      textIds: textIds || 'all',
      selectionMode: selectionMode as any,
      selectedTags,
      autoSearch: true,
      ngramValues: [2, 3, 4],
      ngramSearchType: 'contains',
      sourceModule: 'collocationAnalysis' as any,
      ...(libraryId && { libraryId }),
      ...(libraryId && selectionMode === 'selected' && selectedEntryIds?.length && { selectedEntryIds })
    }
    pendingActionRef.current = () => {
      openTab({
        type: 'ngram' as TabType,
        title: `${t('ngram.title')} - ${linkWord}`,
        props: { crossLinkParams }
      })
    }
    handleMenuClose()
  }

  const allPageSelected = paginatedResults.length > 0 &&
    paginatedResults.every(r => selectedWords.includes(r.collocate))
  const somePageSelected = paginatedResults.some(r => selectedWords.includes(r.collocate))

  // Sticky column styles
  const stickyCheckboxSx = {
    position: 'sticky',
    left: 0,
    bgcolor: 'background.paper',
    zIndex: 3,
    borderRight: '1px solid',
    borderRightColor: 'divider'
  }

  const stickyCollocateSx = {
    position: 'sticky',
    left: 50,
    bgcolor: 'background.paper',
    zIndex: 3,
    borderRight: '1px solid',
    borderRightColor: 'divider'
  }

  const stickyHeaderCheckboxSx = {
    ...stickyCheckboxSx,
    zIndex: 4,
    bgcolor: 'background.default'
  }

  const stickyHeaderCollocateSx = {
    ...stickyCollocateSx,
    zIndex: 4,
    bgcolor: 'background.default'
  }

  return (
    <Box sx={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      {/* Toolbar */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        {/* Stats info */}
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
          <Chip
            label={`${t('collocationAnalysis.results.totalTokens')}: ${totalTokens.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${t('collocationAnalysis.results.uniqueCollocates')}: ${uniqueCollocates.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${t('collocationAnalysis.results.nodeFrequency')}: ${nodeFrequency.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          {selectedWords.length > 0 && (
            <Chip
              label={`${t('collocationAnalysis.results.selected')}: ${selectedWords.length}`}
              size="small"
              color="primary"
            />
          )}
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* Statistics method button */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<TuneIcon />}
          onClick={onOpenStatisticsDialog}
          sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {t('collocationAnalysis.statistics.title')}
        </Button>

        {/* Table filter */}
        <TextField
          size="small"
          placeholder={t('collocationAnalysis.results.filterPlaceholder')}
          value={tableFilter}
          onChange={(e) => {
            setTableFilter(e.target.value)
            onPaginationChange({ ...paginationConfig, page: 0 })
          }}
          sx={{ width: 180, flexShrink: 0 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />

        {/* Actions */}
        <Tooltip title={t('collocationAnalysis.results.selectAll')}>
          <IconButton size="small" onClick={handleSelectAll}>
            {selectedWords.length === filteredResults.length ? <DeselectIcon /> : <SelectAllIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t('collocationAnalysis.results.copySelected')}>
          <IconButton
            size="small"
            onClick={handleCopySelected}
            disabled={selectedWords.length === 0}
          >
            <ContentCopyIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('collocationAnalysis.results.exportCSV')}>
          <IconButton size="small" onClick={handleExportCSV}>
            <FileDownloadIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Table with horizontal scroll */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small" sx={{ minWidth: 600 + enabledStats.length * 100 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={stickyHeaderCheckboxSx}>
                <Checkbox
                  indeterminate={somePageSelected && !allPageSelected}
                  checked={allPageSelected}
                  onChange={handleSelectAllPage}
                  size="small"
                />
              </TableCell>
              <TableCell sx={{ ...stickyHeaderCollocateSx, whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortConfig.column === 'collocate'}
                  direction={sortConfig.column === 'collocate' ? sortConfig.direction : 'asc'}
                  onClick={() => handleSort('collocate')}
                >
                  {t('collocationAnalysis.table.collocate')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <Tooltip title={t('collocationAnalysis.table.collocationFreqFull')}>
                  <TableSortLabel
                    active={sortConfig.column === 'collocation_freq'}
                    direction={sortConfig.column === 'collocation_freq' ? sortConfig.direction : 'asc'}
                    onClick={() => handleSort('collocation_freq')}
                  >
                    {t('collocationAnalysis.table.collocationFreq')}
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <Tooltip title={t('collocationAnalysis.table.totalFreqFull')}>
                  <TableSortLabel
                    active={sortConfig.column === 'total_freq'}
                    direction={sortConfig.column === 'total_freq' ? sortConfig.direction : 'asc'}
                    onClick={() => handleSort('total_freq')}
                  >
                    {t('collocationAnalysis.table.totalFreq')}
                  </TableSortLabel>
                </Tooltip>
              </TableCell>

              {/* Dynamic statistical columns */}
              {enabledStats.map(stat => (
                <TableCell key={stat.id} align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={getStatLabel(stat.id)}>
                    <TableSortLabel
                      active={sortConfig.column === stat.id}
                      direction={sortConfig.column === stat.id ? sortConfig.direction : 'asc'}
                      onClick={() => handleSort(stat.id)}
                    >
                      {t(`collocationAnalysis.statistics.${stat.id}`)}
                    </TableSortLabel>
                  </Tooltip>
                </TableCell>
              ))}

              {/* Actions column */}
              {corpusId && (
                <TableCell align="center" sx={{ width: 50, whiteSpace: 'nowrap' }}>
                  {t('common.actions')}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedResults.map((row) => (
              <TableRow
                key={row.collocate}
                hover
                selected={selectedWords.includes(row.collocate)}
                onClick={() => handleSelectRow(row.collocate)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell padding="checkbox" sx={stickyCheckboxSx}>
                  <Checkbox
                    checked={selectedWords.includes(row.collocate)}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleSelectRow(row.collocate)}
                  />
                </TableCell>
                <TableCell sx={stickyCollocateSx}>
                  <Typography variant="body2" fontWeight={500}>
                    {row.collocate}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {row.collocation_freq.toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {row.total_freq.toLocaleString()}
                  </Typography>
                </TableCell>

                {/* Dynamic statistical values */}
                {enabledStats.map(stat => (
                  <TableCell key={stat.id} align="right">
                    <Typography variant="body2">
                      {((row as any)[stat.id] as number)?.toFixed(2) ?? '-'}
                    </Typography>
                  </TableCell>
                ))}

                {/* Three-dot action menu */}
                {corpusId && (
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={t('collocationAnalysis.table.viewInCooccurrence')}>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, row.collocate)}
                        sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {paginatedResults.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4 + enabledStats.length + (corpusId ? 1 : 0)}
                  align="center"
                >
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                    {isLoading
                      ? t('common.loading')
                      : t('collocationAnalysis.results.noData')
                    }
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Three-dot context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        TransitionProps={{
          onExited: handleMenuExited
        }}
      >
        <MenuItem onClick={() => handleCrossLink(menuWord)}>
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('collocationAnalysis.table.viewInCooccurrence')} />
        </MenuItem>
        <MenuItem onClick={() => handleOpenNgram(menuWord)}>
          <ListItemIcon>
            <TextFieldsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('crossLink.viewNgram')} />
        </MenuItem>
      </Menu>

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
        labelRowsPerPage={t('collocationAnalysis.results.rowsPerPage')}
        sx={{ flexShrink: 0 }}
      />
    </Box>
  )
}

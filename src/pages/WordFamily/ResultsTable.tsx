/**
 * Results Table Component for Synonym Analysis
 * Displays synonym results with expandable rows showing synsets
 */

import React, { useState, useMemo } from 'react'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Collapse,
  Checkbox
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import { useTranslation } from 'react-i18next'
import type { SynonymResult, Synset } from '../../types/synonym'
import type { SelectionMode } from '../../types/crossLink'
import { WordActionMenu } from '../../components/common'

type SortField = 'word' | 'frequency' | 'synonym_count'
type SortDirection = 'asc' | 'desc'

interface ResultsTableProps {
  results: SynonymResult[]
  totalWords: number
  uniqueWords: number
  selectedWords: string[]
  onSelectionChange: (words: string[]) => void
  isLoading: boolean
  // Optional controlled table state (for AI context sync)
  searchFilter?: string
  sortField?: SortField
  sortDirection?: SortDirection
  page?: number
  rowsPerPage?: number
  onSearchFilterChange?: (value: string) => void
  onSortChange?: (field: SortField, direction: SortDirection) => void
  onPageChange?: (page: number) => void
  onRowsPerPageChange?: (rowsPerPage: number) => void
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
  libraryId?: string
  selectedEntryIds?: string[]
}

export default function ResultsTable({
  results,
  totalWords,
  uniqueWords,
  selectedWords,
  onSelectionChange,
  isLoading,
  searchFilter: controlledSearchFilter,
  sortField: controlledSortField,
  sortDirection: controlledSortDirection,
  page: controlledPage,
  rowsPerPage: controlledRowsPerPage,
  onSearchFilterChange,
  onSortChange,
  onPageChange,
  onRowsPerPageChange,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags,
  libraryId,
  selectedEntryIds
}: ResultsTableProps) {
  const { t } = useTranslation()
  
  // State (used when not controlled)
  const [internalPage, setInternalPage] = useState(0)
  const [internalRowsPerPage, setInternalRowsPerPage] = useState(25)
  const [internalSortField, setInternalSortField] = useState<SortField>('frequency')
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>('desc')
  const [internalSearchFilter, setInternalSearchFilter] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const isControlled = controlledSearchFilter !== undefined
  const searchFilter = isControlled ? controlledSearchFilter : internalSearchFilter
  const setSearchFilter = onSearchFilterChange ?? setInternalSearchFilter
  const sortField = (isControlled ? controlledSortField : internalSortField) ?? 'frequency'
  const sortDirection = (isControlled ? controlledSortDirection : internalSortDirection) ?? 'desc'
  const page = (isControlled ? controlledPage : internalPage) ?? 0
  const rowsPerPage = (isControlled ? controlledRowsPerPage : internalRowsPerPage) ?? 25
  const setPage = onPageChange ?? setInternalPage
  const setRowsPerPage = onRowsPerPageChange ?? setInternalRowsPerPage

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = results
    
    if (searchFilter) {
      const query = searchFilter.toLowerCase()
      filtered = results.filter(r => r.word.toLowerCase().includes(query))
    }
    
    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'word':
          cmp = a.word.localeCompare(b.word)
          break
        case 'frequency':
          cmp = a.frequency - b.frequency
          break
        case 'synonym_count':
          cmp = a.synonym_count - b.synonym_count
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    
    return sorted
  }, [results, searchFilter, sortField, sortDirection])

  // Paginated results
  const paginatedResults = useMemo(() => {
    const start = page * rowsPerPage
    return filteredResults.slice(start, start + rowsPerPage)
  }, [filteredResults, page, rowsPerPage])

  // Handle sort
  const handleSort = (field: SortField) => {
    const nextDirection =
      sortField === field ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'desc'
    if (onSortChange) {
      onSortChange(field, nextDirection)
    } else {
      setInternalSortField(field)
      setInternalSortDirection(nextDirection)
    }
  }

  // Get unique key for a result (word + pos to handle multiple POS)
  const getResultKey = (result: SynonymResult): string => {
    return `${result.word}-${result.pos_tags[0] || ''}`
  }

  // Stable row key including index so rows stay correct when (word, pos) can repeat
  const getRowKey = (result: SynonymResult, indexInFiltered: number) =>
    `${getResultKey(result)}-${indexInFiltered}`

  // Toggle row expansion
  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Handle selection
  const handleSelectWord = (key: string) => {
    if (selectedWords.includes(key)) {
      onSelectionChange(selectedWords.filter(w => w !== key))
    } else {
      onSelectionChange([...selectedWords, key])
    }
  }

  const handleSelectAll = () => {
    if (selectedWords.length === filteredResults.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(filteredResults.map(r => getResultKey(r)))
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Word', 'Frequency', 'POS Tags', 'Synonym Count', 'Synonyms']
    const rows = filteredResults.map(r => [
      r.word,
      r.frequency,
      r.pos_tags.join('; '),
      r.synonym_count,
      r.all_synonyms.join('; ')
    ])
    
    const csv = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'synonym_analysis.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Copy selected words
  const handleCopySelected = () => {
    const text = selectedWords.join('\n')
    navigator.clipboard.writeText(text)
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar - matches WordFrequency design */}
      <Stack 
        direction="row" 
        spacing={2} 
        alignItems="center" 
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {/* Stats */}
        <Stack direction="row" spacing={1}>
          <Chip 
            label={`${t('synonym.results.totalWords')}: ${totalWords.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip 
            label={`${t('synonym.results.uniqueWords')}: ${uniqueWords.toLocaleString()}`}
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
          placeholder={t('synonym.results.searchPlaceholder')}
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value)
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
                  indeterminate={selectedWords.length > 0 && selectedWords.length < filteredResults.length}
                  checked={filteredResults.length > 0 && selectedWords.length === filteredResults.length}
                  onChange={handleSelectAll}
                  size="small"
                />
              </TableCell>
              <TableCell sx={{ width: 40 }} />
              <TableCell>
                <TableSortLabel
                  active={sortField === 'word'}
                  direction={sortField === 'word' ? sortDirection : 'asc'}
                  onClick={() => handleSort('word')}
                >
                  {t('synonym.results.word')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'frequency'}
                  direction={sortField === 'frequency' ? sortDirection : 'asc'}
                  onClick={() => handleSort('frequency')}
                >
                  {t('synonym.results.frequency')}
                </TableSortLabel>
              </TableCell>
              <TableCell>{t('synonym.results.posTags')}</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'synonym_count'}
                  direction={sortField === 'synonym_count' ? sortDirection : 'asc'}
                  onClick={() => handleSort('synonym_count')}
                >
                  {t('synonym.results.synonymCount')}
                </TableSortLabel>
              </TableCell>
              <TableCell>{t('synonym.results.synonyms')}</TableCell>
              {corpusId && (
                <TableCell align="center" sx={{ width: 50 }}>
                  {t('common.actions')}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedResults.map((result, idx) => {
              const start = page * rowsPerPage
              const indexInFiltered = start + idx
              const resultKey = getResultKey(result)
              const rowKey = getRowKey(result, indexInFiltered)
              return (
                <React.Fragment key={rowKey}>
                  <TableRow
                    hover
                    sx={{
                      cursor: 'pointer',
                      '& > *': { borderBottom: expandedRows.has(resultKey) ? 0 : undefined }
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedWords.includes(resultKey)}
                        onChange={() => handleSelectWord(resultKey)}
                        size="small"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        size="small" 
                        onClick={() => toggleRow(resultKey)}
                      >
                        {expandedRows.has(resultKey) 
                          ? <KeyboardArrowDownIcon fontSize="small" /> 
                          : <KeyboardArrowRightIcon fontSize="small" />
                        }
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {result.word}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {result.frequency.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {result.pos_tags.map(pos => (
                          <Chip key={pos} label={pos} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      {result.synonym_count}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                        {result.all_synonyms.slice(0, 5).join(', ')}
                        {result.all_synonyms.length > 5 && '...'}
                      </Typography>
                    </TableCell>
                    {corpusId && (
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        <WordActionMenu
                          word={result.word}
                          wordLemma={result.word}
                          matchMode="lemma"
                          corpusId={corpusId}
                          textIds={textIds || 'all'}
                          selectionMode={selectionMode}
                          selectedTags={selectedTags}
                          libraryId={libraryId}
                          selectedEntryIds={selectedEntryIds}
                          showCollocation={true}
                          showWordSketch={true}
                        />
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Expanded row with synset details */}
                  <TableRow>
                    <TableCell colSpan={corpusId ? 8 : 7} sx={{ py: 0 }}>
                      <Collapse in={expandedRows.has(resultKey)} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 4 }}>
                          <SynsetDetails
                            synsets={result.synsets}
                            allSynonyms={result.all_synonyms}
                            synonymCount={result.synonym_count}
                            corpusId={corpusId}
                            textIds={textIds}
                            selectionMode={selectionMode}
                            selectedTags={selectedTags}
                            libraryId={libraryId}
                            selectedEntryIds={selectedEntryIds}
                          />
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={filteredResults.length}
        page={page}
        onPageChange={(_, newPage) => {
          if (onPageChange) onPageChange(newPage)
          else setInternalPage(newPage)
        }}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          const val = parseInt(e.target.value, 10)
          if (onRowsPerPageChange) {
            onRowsPerPageChange(val)
            onPageChange?.(0)
          } else {
            setInternalRowsPerPage(val)
            setInternalPage(0)
          }
        }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage={t('common.rowsPerPage')}
      />
    </Box>
  )
}

const IN_CORPUS_SYNSET_NAME = '_in_corpus'

// Expandable content: "所有同义词" chips, then one block per synonym with its definition. Each synonym card has cross-link menu (same as word column).
function SynsetDetails({ 
  synsets, 
  allSynonyms, 
  synonymCount,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags,
  libraryId,
  selectedEntryIds
}: { 
  synsets: Synset[]
  allSynonyms: string[]
  synonymCount: number
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: SelectionMode
  selectedTags?: string[]
  libraryId?: string
  selectedEntryIds?: string[]
}) {
  const { t } = useTranslation()
  
  // For each synonym, the synset(s) that contain it (same sense as the row word). Used to show "this synonym's definition" only.
  const synonymToSynsets = useMemo(() => {
    const map = new Map<string, Synset[]>()
    for (const syn of allSynonyms) {
      const key = syn.toLowerCase()
      if (map.has(key)) continue
      const containing = synsets.filter(
        ss => ss.name !== IN_CORPUS_SYNSET_NAME && ss.synonyms.some(s => s.toLowerCase() === key)
      )
      map.set(key, containing)
    }
    return map
  }, [allSynonyms, synsets])
  
  const uniqueSynonyms = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const syn of allSynonyms) {
      const key = syn.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(syn)
    }
    return out
  }, [allSynonyms])
  
  if (synsets.length === 0 && allSynonyms.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('synonym.results.noSynsets')}
      </Typography>
    )
  }
  
  return (
    <Stack spacing={2}>
      {/* All synonyms (same as table row: 词语列 → 同义词列) */}
      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
        <Stack spacing={1}>
          <Typography variant="subtitle1" fontWeight={600}>
            {t('synonym.results.allSynonyms')} ({synonymCount})
          </Typography>
          <Box>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {allSynonyms.map(syn => (
                <Chip key={syn} label={syn} size="small" variant="outlined" color="primary" />
              ))}
            </Stack>
          </Box>
        </Stack>
      </Paper>
      
      {/* 同义词集详情 = 每个同义词的释义（该词作为当前词语同义词时的义项），不以 synset 名为主标题 */}
      <Typography variant="subtitle2" fontWeight={600}>
        {t('synonym.results.synsetDetails')}
      </Typography>
      {uniqueSynonyms.map(syn => {
        const key = syn.toLowerCase()
        const synsetsForSyn = synonymToSynsets.get(key) ?? []
        const inCorpusOnly = synsets.find(ss => ss.name === IN_CORPUS_SYNSET_NAME && ss.synonyms.some(s => s.toLowerCase() === key))
        return (
          <Paper key={key} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" color="primary">
                {syn}
              </Typography>
              {corpusId && (
                <WordActionMenu
                  word={syn}
                  corpusId={corpusId}
                  textIds={textIds ?? 'all'}
                  selectionMode={selectionMode}
                  selectedTags={selectedTags}
                  libraryId={libraryId}
                  selectedEntryIds={selectedEntryIds}
                  showCollocation={true}
                  showWordSketch={true}
                />
              )}
            </Stack>
            {synsetsForSyn.length === 0 && !inCorpusOnly && (
              <Typography variant="body2" color="text.secondary">—</Typography>
            )}
            {synsetsForSyn.map((ss, i) => (
              <Box key={ss.name} sx={{ mt: i > 0 ? 1.5 : 0 }}>
                {ss.definition && (
                  <Typography variant="body2">
                    <strong>{t('synonym.results.definition')}:</strong> {ss.definition}
                  </Typography>
                )}
                {ss.examples.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    <strong>{t('synonym.results.examples')}:</strong>{' '}
                    {ss.examples.map((ex, i) => `"${ex}"`).join('; ')}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  WordNet: {ss.name}{ss.pos ? ` · ${ss.pos}` : ''}
                </Typography>
              </Box>
            ))}
            {inCorpusOnly && synsetsForSyn.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('synonym.results.inCorpusSynset')}
              </Typography>
            )}
          </Paper>
        )
      })}
    </Stack>
  )
}

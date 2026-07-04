/**
 * Results Table Component for Semantic Domain Analysis
 * Displays results in two views: by domain or by word
 */

import { useState, useMemo, useRef } from 'react'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Typography,
  Chip,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  TextField,
  InputAdornment,
  Switch,
  FormControlLabel,
  Checkbox,
  Menu,
  MenuItem,
  ListItemIcon
} from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'
import DownloadIcon from '@mui/icons-material/Download'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import LinkIcon from '@mui/icons-material/Link'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import { analysisApi } from '../../api'
import type {
  SemanticAnalysisResponse,
  SemanticDomainResult,
  SemanticWordResult,
  SortConfig,
  SortField,
  DomainWordsResponse
} from '../../types/semanticAnalysis'
import type { SelectionMode } from '../../types/crossLink'
import { WordActionMenu } from '../../components/common'

interface ResultsTableProps {
  results: SemanticAnalysisResponse
  sortConfig: SortConfig
  onSortChange: (config: SortConfig) => void
  page: number
  rowsPerPage: number
  onPageChange: (page: number) => void
  onRowsPerPageChange: (rowsPerPage: number) => void
  tableFilter?: string
  onTableFilterChange?: (value: string) => void
  corpusId: string
  textIds: string[] | 'all'
  lowercase: boolean
  // Cross-link props
  selectionMode?: SelectionMode
  selectedTags?: string[]
  libraryId?: string
  selectedEntryIds?: string[]
  // Metaphor highlight props
  showMetaphorHighlight?: boolean
  onShowMetaphorHighlightChange?: (value: boolean) => void
  // Selection props
  selectedItems?: string[]
  onSelectionChange?: (items: string[]) => void
}

export default function ResultsTable({
  results,
  sortConfig,
  onSortChange,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  tableFilter: tableFilterProp,
  onTableFilterChange,
  corpusId,
  textIds,
  lowercase,
  selectionMode = 'all',
  selectedTags,
  libraryId,
  selectedEntryIds,
  showMetaphorHighlight = false,
  onShowMetaphorHighlightChange,
  selectedItems = [],
  onSelectionChange
}: ResultsTableProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const { openTab } = useTabStore()
  const [tableFilterInternal, setTableFilterInternal] = useState('')
  const tableFilter = tableFilterProp ?? tableFilterInternal
  const setTableFilter = onTableFilterChange ?? setTableFilterInternal
  const [domainMenuAnchor, setDomainMenuAnchor] = useState<null | HTMLElement>(null)
  const [domainMenuDomain, setDomainMenuDomain] = useState<{ domain: string; domainName: string } | null>(null)
  const pendingDomainLinkRef = useRef<{ domain: string; domainName: string } | null>(null)
  const handleDomainMenuExited = () => {
    if (pendingDomainLinkRef.current) {
      const { domain } = pendingDomainLinkRef.current
      pendingDomainLinkRef.current = null
      openTab({
        type: 'collocation',
        title: `${t('collocation.title')} - ${domain}`,
        props: {
          crossLinkParams: {
            searchWord: domain,
            corpusId: corpusId!,
            textIds,
            selectionMode: selectionMode ?? 'all',
            selectedTags,
            ...(libraryId && { libraryId }),
            ...(libraryId && selectionMode === 'selected' && selectedEntryIds?.length && { selectedEntryIds }),
            autoSearch: true,
            semanticDomain: domain,
            semanticDomainMatch: 'contains',
            ignoreCase: true
          }
        }
      })
    }
  }
  const [domainWordsDialog, setDomainWordsDialog] = useState<{
    open: boolean
    domain: string
    domainName: string
    loading: boolean
    data: DomainWordsResponse | null
  }>({
    open: false,
    domain: '',
    domainName: '',
    loading: false,
    data: null
  })

  const isDomainMode = results.result_mode === 'domain'

  // Filter results by table search
  const filteredResults = useMemo(() => {
    if (!tableFilter.trim()) return results.results
    const filter = tableFilter.toLowerCase()
    return results.results.filter(r => {
      if (isDomainMode) {
        const domainResult = r as SemanticDomainResult
        return domainResult.domain.toLowerCase().includes(filter) ||
               domainResult.domain_name.toLowerCase().includes(filter)
      } else {
        const wordResult = r as SemanticWordResult
        return wordResult.word.toLowerCase().includes(filter) ||
               wordResult.domain.toLowerCase().includes(filter) ||
               wordResult.domain_name.toLowerCase().includes(filter)
      }
    })
  }, [results.results, tableFilter, isDomainMode])

  // Sort results
  const sortedResults = useMemo(() => {
    const data = [...filteredResults]
    
    data.sort((a, b) => {
      let aValue: any
      let bValue: any
      
      switch (sortConfig.field) {
        case 'rank':
          aValue = a.rank
          bValue = b.rank
          break
        case 'domain':
          aValue = a.domain
          bValue = b.domain
          break
        case 'word':
          aValue = (a as SemanticWordResult).word || ''
          bValue = (b as SemanticWordResult).word || ''
          break
        case 'frequency':
          aValue = a.frequency
          bValue = b.frequency
          break
        case 'percentage':
          aValue = a.percentage
          bValue = b.percentage
          break
        default:
          aValue = a.frequency
          bValue = b.frequency
      }
      
      if (typeof aValue === 'string') {
        return sortConfig.order === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }
      
      return sortConfig.order === 'asc' ? aValue - bValue : bValue - aValue
    })
    
    return data
  }, [filteredResults, sortConfig])

  // Paginate results
  const paginatedResults = useMemo(() => {
    const start = page * rowsPerPage
    return sortedResults.slice(start, start + rowsPerPage)
  }, [sortedResults, page, rowsPerPage])

  // Handle sort
  const handleSort = (field: SortField) => {
    const isAsc = sortConfig.field === field && sortConfig.order === 'asc'
    onSortChange({
      field,
      order: isAsc ? 'desc' : 'asc'
    })
  }

  // Get item key for selection (domain for domain mode, word for word mode)
  const getItemKey = (item: SemanticDomainResult | SemanticWordResult) => {
    if (isDomainMode) {
      return (item as SemanticDomainResult).domain
    }
    return (item as SemanticWordResult).word
  }

  // Handle select all on current page
  const handleSelectAllPage = () => {
    if (!onSelectionChange) return
    const pageItems = paginatedResults.map(r => getItemKey(r))
    const allSelected = pageItems.every(item => selectedItems.includes(item))
    
    if (allSelected) {
      // Deselect all on page
      onSelectionChange(selectedItems.filter(item => !pageItems.includes(item)))
    } else {
      // Select all on page
      const newSelected = [...new Set([...selectedItems, ...pageItems])]
      onSelectionChange(newSelected)
    }
  }

  // Handle select all filtered results
  const handleSelectAll = () => {
    if (!onSelectionChange) return
    const allItems = sortedResults.map(r => getItemKey(r))
    if (selectedItems.length === allItems.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(allItems)
    }
  }

  // Handle single item selection
  const handleSelectItem = (item: string) => {
    if (!onSelectionChange) return
    if (selectedItems.includes(item)) {
      onSelectionChange(selectedItems.filter(i => i !== item))
    } else {
      onSelectionChange([...selectedItems, item])
    }
  }

  // Copy selected items
  const handleCopySelected = () => {
    const text = selectedItems.join('\n')
    navigator.clipboard.writeText(text)
  }

  // Check if all on page are selected
  const allPageSelected = paginatedResults.length > 0 && 
    paginatedResults.every(r => selectedItems.includes(getItemKey(r)))
  const somePageSelected = paginatedResults.some(r => selectedItems.includes(getItemKey(r)))

  // Handle domain click - show words in domain
  const handleDomainClick = async (domain: string, domainName: string) => {
    setDomainWordsDialog({
      open: true,
      domain,
      domainName,
      loading: true,
      data: null
    })

    try {
      const response = await analysisApi.getDomainWords({
        corpus_id: corpusId,
        domain,
        text_ids: textIds,
        lowercase
      })

      if (response.success && response.data) {
        setDomainWordsDialog(prev => ({
          ...prev,
          loading: false,
          data: response.data
        }))
      } else {
        setDomainWordsDialog(prev => ({
          ...prev,
          loading: false,
          data: null
        }))
      }
    } catch (err) {
      console.error('Failed to load domain words:', err)
      setDomainWordsDialog(prev => ({
        ...prev,
        loading: false,
        data: null
      }))
    }
  }

  // Close domain words dialog
  const handleCloseDomainWordsDialog = () => {
    setDomainWordsDialog({
      open: false,
      domain: '',
      domainName: '',
      loading: false,
      data: null
    })
  }

  // Export results as CSV
  const handleExport = () => {
    let csvContent = ''
    
    if (isDomainMode) {
      csvContent = 'Rank,Domain,Domain Name,Category,Frequency,Percentage\n'
      sortedResults.forEach((r: any) => {
        csvContent += `${r.rank},"${r.domain}","${r.domain_name}","${r.category}",${r.frequency},${r.percentage.toFixed(4)}\n`
      })
    } else {
      csvContent = 'Rank,Word,Domain,Domain Name,POS,Frequency,Percentage,Metaphor Type\n'
      sortedResults.forEach((r: any) => {
        const metaphorType = r.is_mflag ? 'mflag' : r.is_direct_metaphor ? 'direct' : r.is_implicit_metaphor ? 'implicit' : r.is_metaphor ? 'indirect' : 'none'
        csvContent += `${r.rank},"${r.word}","${r.domain}","${r.domain_name}","${r.pos}",${r.frequency},${r.percentage.toFixed(4)},"${metaphorType}"\n`
      })
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `semantic_analysis_${results.result_mode}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Stack 
        direction="row" 
        spacing={2} 
        alignItems="center" 
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {/* Stats — grows to fill available width so the control cluster
            (switch, filter box, action icons) stays anchored to the right edge */}
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ flex: '1 1 auto', minWidth: 0 }}>
          <Chip 
            label={`${t('semantic.results.totalTokens')}: ${results.total_tokens.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip 
            label={`${t('semantic.results.uniqueDomains')}: ${results.unique_domains.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip 
            label={`${t('semantic.results.uniqueWords')}: ${results.unique_words.toLocaleString()}`}
            size="small"
            variant="outlined"
          />
          <Chip 
            label={`${t('semantic.results.resultCount')}: ${filteredResults.length.toLocaleString()}`}
            size="small"
            color="primary"
          />
          {/* Metaphor highlight switch — sits inline with stats chips
              (same placement as the implicit-backref switch in Metaphor Analysis) */}
          {onShowMetaphorHighlightChange && (
            <FormControlLabel
              control={
                <Switch
                  checked={showMetaphorHighlight}
                  onChange={(e) => onShowMetaphorHighlightChange(e.target.checked)}
                  size="small"
                  color="success"
                />
              }
              label={
                <Typography variant="caption" color={showMetaphorHighlight ? 'success.main' : 'text.secondary'} noWrap>
                  {t('semantic.results.showMetaphorHighlight')}
                </Typography>
              }
              sx={{ mx: 0 }}
            />
          )}

          {selectedItems.length > 0 && (
            <Chip
              label={`${isZh ? '已选' : 'Selected'}: ${selectedItems.length}`}
              size="small"
              color="primary"
            />
          )}
        </Stack>

        {/* Table filter — wide but shrinkable; right-aligned with the actions */}
        <TextField
          size="small"
          placeholder={isDomainMode ? t('semantic.table.filterDomainPlaceholder') : t('semantic.table.filterWordPlaceholder')}
          value={tableFilter}
          onChange={(e) => {
            setTableFilter(e.target.value)
            onPageChange(0)
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
        {onSelectionChange && (
          <>
            <Tooltip title={isZh ? '全选' : 'Select All'}>
              <IconButton size="small" onClick={handleSelectAll}>
                {selectedItems.length === sortedResults.length ? <DeselectIcon /> : <SelectAllIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title={isZh ? '复制选中' : 'Copy Selected'}>
              <IconButton size="small" onClick={handleCopySelected} disabled={selectedItems.length === 0}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title={t('common.export')}>
          <IconButton size="small" onClick={handleExport}>
            <DownloadIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Table */}
      <TableContainer sx={{ flex: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {onSelectionChange && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={somePageSelected && !allPageSelected}
                    checked={allPageSelected}
                    onChange={handleSelectAllPage}
                    size="small"
                  />
                </TableCell>
              )}
              <TableCell sx={{ width: 60 }}>
                <TableSortLabel
                  active={sortConfig.field === 'rank'}
                  direction={sortConfig.field === 'rank' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('rank')}
                >
                  #
                </TableSortLabel>
              </TableCell>
              
              {!isDomainMode && (
                <TableCell>
                  <TableSortLabel
                    active={sortConfig.field === 'word'}
                    direction={sortConfig.field === 'word' ? sortConfig.order : 'asc'}
                    onClick={() => handleSort('word')}
                  >
                    {t('semantic.results.word')}
                  </TableSortLabel>
                </TableCell>
              )}
              
              <TableCell>
                <TableSortLabel
                  active={sortConfig.field === 'domain'}
                  direction={sortConfig.field === 'domain' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('domain')}
                >
                  {t('semantic.results.domain')}
                </TableSortLabel>
              </TableCell>
              
              <TableCell sx={{ width: 100 }}>
                <TableSortLabel
                  active={sortConfig.field === 'frequency'}
                  direction={sortConfig.field === 'frequency' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('frequency')}
                >
                  {t('semantic.results.frequency')}
                </TableSortLabel>
              </TableCell>
              
              <TableCell sx={{ width: 120 }}>
                <TableSortLabel
                  active={sortConfig.field === 'percentage'}
                  direction={sortConfig.field === 'percentage' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('percentage')}
                >
                  {t('semantic.results.percentage')}
                </TableSortLabel>
              </TableCell>
              
              {isDomainMode && (
                <>
                  <TableCell sx={{ width: 60 }}>{t('semantic.results.viewWords')}</TableCell>
                  <TableCell sx={{ width: 48 }} align="center">{t('semantic.results.crossLink')}</TableCell>
                </>
              )}
              
              {!isDomainMode && corpusId && (
                <TableCell align="center" sx={{ width: 50 }}>
                  {t('common.actions')}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          
          <TableBody>
            {paginatedResults.map((row, index) => {
              const domainResult = row as SemanticDomainResult
              const wordResult = row as SemanticWordResult
              const itemKey = getItemKey(row)
              const isSelected = selectedItems.includes(itemKey)
              
              return (
                <TableRow 
                  key={index} 
                  hover
                  selected={isSelected}
                  sx={{ cursor: onSelectionChange ? 'pointer' : 'default' }}
                  onClick={() => onSelectionChange && handleSelectItem(itemKey)}
                >
                  {onSelectionChange && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isSelected}
                        size="small"
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleSelectItem(itemKey)}
                      />
                    </TableCell>
                  )}
                  <TableCell>{row.rank}</TableCell>
                  
                  {!isDomainMode && (
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                        <Typography
                          variant="body2"
                          component="span"
                          fontWeight={showMetaphorHighlight && (wordResult.is_metaphor || wordResult.is_direct_metaphor || wordResult.is_mflag || wordResult.is_implicit_metaphor) ? 'bold' : 'medium'}
                          sx={{
                            color: showMetaphorHighlight
                              ? wordResult.is_mflag
                                ? '#9C27B0'
                                : wordResult.is_direct_metaphor
                                  ? '#E91E63'
                                  : wordResult.is_implicit_metaphor
                                    ? '#FF9800'
                                    : wordResult.is_metaphor
                                      ? '#4CAF50'
                                      : 'inherit'
                              : 'inherit'
                          }}
                        >
                          {wordResult.word}
                        </Typography>
                        {wordResult.pos && (
                          <Chip
                            label={wordResult.pos}
                            size="small"
                            sx={{ height: 18, fontSize: '0.7rem' }}
                          />
                        )}
                        {showMetaphorHighlight && wordResult.is_metaphor && !wordResult.is_direct_metaphor && !wordResult.is_mflag && !wordResult.is_implicit_metaphor && (
                          <Chip
                            label={t('semantic.results.metaphorIndirect')}
                            size="small"
                            sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#4CAF50', color: '#fff' }}
                          />
                        )}
                        {showMetaphorHighlight && wordResult.is_direct_metaphor && (
                          <Chip
                            label={t('semantic.results.metaphorDirect')}
                            size="small"
                            sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#E91E63', color: '#fff' }}
                          />
                        )}
                        {showMetaphorHighlight && wordResult.is_mflag && (
                          <Chip
                            label={t('semantic.results.metaphorMFlag')}
                            size="small"
                            sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#9C27B0', color: '#fff' }}
                          />
                        )}
                        {showMetaphorHighlight && wordResult.is_implicit_metaphor && (
                          <Chip
                            label={t('semantic.results.metaphorImplicit')}
                            size="small"
                            sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#FF9800', color: '#fff' }}
                          />
                        )}
                      </Box>
                    </TableCell>
                  )}
                  
                  <TableCell>
                    <Tooltip title={row.domain_name || row.domain}>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            label={row.category || row.domain[0]}
                            size="small"
                            color="primary"
                            sx={{ minWidth: 28 }}
                          />
                          <Typography variant="body2">
                            {row.domain}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {row.domain_name}
                        </Typography>
                      </Box>
                    </Tooltip>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {row.frequency.toLocaleString()}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2">
                      {row.percentage.toFixed(2)}%
                    </Typography>
                  </TableCell>
                  
                  {isDomainMode && (
                    <>
                      <TableCell>
                        <Tooltip title={t('semantic.results.viewWords')}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDomainClick(row.domain, row.domain_name)
                            }}
                          >
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {corpusId && (
                          <Tooltip title={t('crossLink.viewInOtherModules')}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDomainMenuAnchor(e.currentTarget)
                                setDomainMenuDomain({ domain: row.domain, domainName: row.domain_name })
                              }}
                              sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                            >
                              <MoreVertIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </>
                  )}
                  
                  {!isDomainMode && corpusId && (
                    <TableCell align="center">
                      <WordActionMenu
                        word={wordResult.word}
                        corpusId={corpusId}
                        textIds={textIds}
                        selectionMode={selectionMode}
                        selectedTags={selectedTags}
                        libraryId={libraryId}
                        selectedEntryIds={selectedEntryIds}
                        showCollocation={true}
                        showWordSketch={true}
                        showSemanticDomain={false}
                      />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Single Menu for domain-mode cross-link (outside table so only one instance, shadow matches word-mode) */}
      {isDomainMode && corpusId && (
        <Menu
          anchorEl={domainMenuAnchor}
          open={Boolean(domainMenuAnchor)}
          onClose={() => {
            setDomainMenuAnchor(null)
            setDomainMenuDomain(null)
          }}
          onClick={(e) => e.stopPropagation()}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          TransitionProps={{ onExited: handleDomainMenuExited }}
        >
          <MenuItem
            onClick={() => {
              if (domainMenuDomain) {
                pendingDomainLinkRef.current = { domain: domainMenuDomain.domain, domainName: domainMenuDomain.domainName }
                setDomainMenuAnchor(null)
                setDomainMenuDomain(null)
              }
            }}
          >
            <ListItemIcon>
              <LinkIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('crossLink.viewCollocation')} />
          </MenuItem>
        </Menu>
      )}

      {/* Pagination */}
      <TablePagination
        component="div"
        count={sortedResults.length}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, newPage) => onPageChange(newPage)}
        onRowsPerPageChange={(e) => {
          onRowsPerPageChange(parseInt(e.target.value, 10))
          onPageChange(0)
        }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage={t('common.rowsPerPage')}
      />

      {/* Domain Words Dialog */}
      <Dialog
        open={domainWordsDialog.open}
        onClose={handleCloseDomainWordsDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">
                {domainWordsDialog.domain}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {domainWordsDialog.domainName}
              </Typography>
            </Box>
            <IconButton onClick={handleCloseDomainWordsDialog}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        
        <DialogContent dividers>
          {domainWordsDialog.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : domainWordsDialog.data ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('semantic.results.wordsInDomain')}: {domainWordsDialog.data.total_words}
              </Typography>
              <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
                {domainWordsDialog.data.words.map((item, idx) => (
                  <ListItem key={idx} divider secondaryAction={
                    corpusId && (
                      <WordActionMenu
                        word={item.word}
                        corpusId={corpusId}
                        textIds={textIds}
                        selectionMode={selectionMode}
                        selectedTags={selectedTags}
                        libraryId={libraryId}
                        selectedEntryIds={selectedEntryIds}
                        showCollocation={true}
                        showWordSketch={true}
                        showSemanticDomain={false}
                      />
                    )
                  }>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                          <Typography
                            variant="body2"
                            component="span"
                            fontWeight={showMetaphorHighlight && (item.is_metaphor || item.is_direct_metaphor || item.is_mflag || item.is_implicit_metaphor) ? 'bold' : 'medium'}
                            sx={{
                              color: showMetaphorHighlight
                                ? item.is_mflag
                                  ? '#9C27B0'
                                  : item.is_direct_metaphor
                                    ? '#E91E63'
                                    : item.is_implicit_metaphor
                                      ? '#FF9800'
                                      : item.is_metaphor
                                        ? '#4CAF50'
                                        : 'inherit'
                                : 'inherit'
                            }}
                          >
                            {item.word}
                          </Typography>
                          {showMetaphorHighlight && item.is_metaphor && !item.is_direct_metaphor && !item.is_mflag && !item.is_implicit_metaphor && (
                            <Chip
                              label={t('semantic.results.metaphorIndirect')}
                              size="small"
                              sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#4CAF50', color: '#fff' }}
                            />
                          )}
                          {showMetaphorHighlight && item.is_direct_metaphor && (
                            <Chip
                              label={t('semantic.results.metaphorDirect')}
                              size="small"
                              sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#E91E63', color: '#fff' }}
                            />
                          )}
                          {showMetaphorHighlight && item.is_mflag && (
                            <Chip
                              label={t('semantic.results.metaphorMFlag')}
                              size="small"
                              sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#9C27B0', color: '#fff' }}
                            />
                          )}
                          {showMetaphorHighlight && item.is_implicit_metaphor && (
                            <Chip
                              label={t('semantic.results.metaphorImplicit')}
                              size="small"
                              sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#FF9800', color: '#fff' }}
                            />
                          )}
                        </Box>
                      }
                      secondary={`${t('semantic.results.frequency')}: ${item.frequency}`}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          ) : (
            <Typography color="text.secondary" textAlign="center">
              {t('common.noData')}
            </Typography>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleCloseDomainWordsDialog}>
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

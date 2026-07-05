/**
 * Feature statistics table (67 Biber features): frequency per 100 tokens,
 * z-score vs Biber norms, dimension loading, expandable contributing words.
 * Layout matches Metaphor Analysis: full-height sticky-header table with
 * bottom TablePagination; the filter box lives in the ResultsPanel toolbar.
 */

import { Fragment, useMemo, useState } from 'react'
import {
  Box,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TablePagination,
  Chip,
  Collapse,
  IconButton,
  Stack,
  Tooltip,
  Typography
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import { useTranslation } from 'react-i18next'
import type { MDAFeatureSummary } from '../../../types/mdaAnalysis'
import { DIMENSION_COLORS } from './biberReference'
import { WordActionMenu } from '../../../components/common'
import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'

type SortField = 'code' | 'mean' | 'zscore' | 'raw_total'

interface FeaturesTableProps {
  features: MDAFeatureSummary[]
  /** 当前语料选择：贡献词的跨模块操作菜单需要（同同义词分析的 WordActionMenu） */
  corpusSelection?: CorpusOrLibrarySelection | null
  /** 受控筛选值（由 ResultsPanel 工具栏的搜索框提供） */
  filter: string
  /** 选中的特征代码列表（受控，由 ResultsPanel 工具栏共享） */
  selected: string[]
  onSelectionChange: (codes: string[]) => void
}

function zColor(z: number): 'error' | 'info' | 'default' {
  if (z > 2) return 'error'
  if (z < -2) return 'info'
  return 'default'
}

export default function FeaturesTable({ features, corpusSelection, filter, selected, onSelectionChange }: FeaturesTableProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [sortField, setSortField] = useState<SortField>('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(100)

  const rows = useMemo(() => {
    let arr = [...features]
    if (filter.trim()) {
      const q = filter.trim().toLowerCase()
      arr = arr.filter(f =>
        f.code.toLowerCase().includes(q)
        || f.name_en.toLowerCase().includes(q)
        || f.name_zh.includes(q)
      )
    }
    arr.sort((a, b) => {
      let cmp: number
      switch (sortField) {
        case 'code': cmp = a.code.localeCompare(b.code); break
        case 'mean': cmp = a.mean - b.mean; break
        case 'zscore': cmp = a.zscore - b.zscore; break
        case 'raw_total': cmp = (a.raw_total ?? -1) - (b.raw_total ?? -1); break
        default: cmp = 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [features, filter, sortField, sortDir])

  const pageRows = useMemo(
    () => rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [rows, page, rowsPerPage]
  )

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'code' ? 'asc' : 'desc')
    }
    setPage(0)
  }

  const headSort = (field: SortField, label: string) => (
    <TableSortLabel
      active={sortField === field}
      direction={sortField === field ? sortDir : 'asc'}
      onClick={() => handleSort(field)}
    >
      {label}
    </TableSortLabel>
  )

  // Row selection (same semantics as Metaphor Analysis: header = current page)
  const allPageSelected = pageRows.length > 0 && pageRows.every(r => selected.includes(r.code))
  const somePageSelected = pageRows.some(r => selected.includes(r.code))
  const handleSelectAllPage = () => {
    const pageCodes = pageRows.map(r => r.code)
    if (allPageSelected) {
      onSelectionChange(selected.filter(c => !pageCodes.includes(c)))
    } else {
      onSelectionChange([...new Set([...selected, ...pageCodes])])
    }
  }
  const handleSelectRow = (code: string) => {
    if (selected.includes(code)) onSelectionChange(selected.filter(c => c !== code))
    else onSelectionChange([...selected, code])
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
              <TableCell sx={{ width: 36 }} />
              <TableCell>{headSort('code', t('mda.features.code'))}</TableCell>
              <TableCell>{t('mda.features.name')}</TableCell>
              <TableCell align="center">{t('mda.features.dimension')}</TableCell>
              <TableCell align="right">{headSort('raw_total', t('mda.features.rawTotal'))}</TableCell>
              <TableCell align="right">
                <Tooltip title={t('mda.features.meanHint')}>
                  <span>{headSort('mean', t('mda.features.mean'))}</span>
                </Tooltip>
              </TableCell>
              <TableCell align="right">{t('mda.features.sd')}</TableCell>
              <TableCell align="right">
                <Tooltip title={t('mda.features.biberHint')}>
                  <span>{t('mda.features.biberNorm')}</span>
                </Tooltip>
              </TableCell>
              <TableCell align="right">
                <Tooltip title={t('mda.features.zscoreHint')}>
                  <span>{headSort('zscore', 'Z')}</span>
                </Tooltip>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map(f => {
              const hasWords = !!f.top_words?.length
              const isOpen = expanded === f.code
              return (
                <Fragment key={f.code}>
                  <TableRow
                    hover
                    selected={selected.includes(f.code)}
                    sx={{ cursor: hasWords ? 'pointer' : 'default', '& td': { borderBottom: isOpen ? 0 : undefined } }}
                    onClick={() => hasWords && setExpanded(isOpen ? null : f.code)}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(f.code)}
                        onChange={() => handleSelectRow(f.code)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell padding="none" sx={{ pl: 1 }}>
                      {hasWords && (
                        <IconButton size="small">
                          {isOpen ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{f.code}</TableCell>
                    <TableCell>{isZh ? f.name_zh : f.name_en}</TableCell>
                    <TableCell align="center">
                      {f.loading && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`D${f.loading.dimension}${f.loading.sign > 0 ? '+' : '−'}`}
                          sx={{
                            borderColor: DIMENSION_COLORS[f.loading.dimension],
                            color: DIMENSION_COLORS[f.loading.dimension],
                            fontWeight: 600
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">{f.raw_total !== null ? f.raw_total.toLocaleString() : '—'}</TableCell>
                    <TableCell align="right">{f.mean.toFixed(2)}</TableCell>
                    <TableCell align="right">{f.sd.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>
                      {f.biber_mean !== null ? `${f.biber_mean} ± ${f.biber_sd}` : '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        color={zColor(f.zscore)}
                        variant={Math.abs(f.zscore) > 2 ? 'filled' : 'outlined'}
                        label={f.zscore.toFixed(2)}
                        sx={{ minWidth: 64, fontFamily: 'monospace' }}
                      />
                    </TableCell>
                  </TableRow>
                  {hasWords && (
                    <TableRow>
                      <TableCell colSpan={10} sx={{ py: 0, borderBottom: isOpen ? undefined : 0 }}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 1.5, pl: 5 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                              {t('mda.features.topWords')}
                            </Typography>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                              {f.top_words!.map(wItem => (
                                <Stack key={wItem.word} direction="row" alignItems="center" spacing={0}
                                  onClick={(e) => e.stopPropagation()}>
                                  <Chip size="small" label={`${wItem.word} (${wItem.count})`} />
                                  {corpusSelection && (
                                    <WordActionMenu
                                      word={wItem.word}
                                      wordLemma={wItem.lemma}
                                      matchMode="word"
                                      corpusId={corpusSelection.corpusId}
                                      textIds={corpusSelection.textIds || 'all'}
                                      selectionMode={corpusSelection.selectionMode === 'keywords' ? 'tags' : (corpusSelection.selectionMode ?? 'all')}
                                      selectedTags={corpusSelection.selectedKeywords ?? corpusSelection.selectedTags ?? []}
                                      libraryId={corpusSelection.dataSource === 'library' ? corpusSelection.libraryId : undefined}
                                      selectedEntryIds={corpusSelection.dataSource === 'library' && corpusSelection.selectionMode === 'selected' ? corpusSelection.selectedEntryIds : undefined}
                                      size="small"
                                    />
                                  )}
                                </Stack>
                              ))}
                            </Stack>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={rows.length}
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

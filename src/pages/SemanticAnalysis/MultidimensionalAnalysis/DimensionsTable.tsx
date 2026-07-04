/**
 * Per-text dimension score table with corpus summary row.
 * Layout matches Metaphor Analysis: full-height sticky-header table with
 * bottom TablePagination; the corpus summary row is pinned to every page.
 */

import { useMemo, useState } from 'react'
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
  Tooltip,
  Typography
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { MDATextResult, MDACorpusSummary } from '../../../types/mdaAnalysis'
import { DIMENSION_LABELS, DIMENSION_COLORS, TEXT_TYPE_LABELS_ZH } from './biberReference'

type SortField = 'filename' | 'tokens' | 'awl' | 'ttr' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6'

interface DimensionsTableProps {
  texts: MDATextResult[]
  corpus: MDACorpusSummary
  /** 选中的 text_id 列表（受控，由 ResultsPanel 工具栏共享） */
  selected: string[]
  onSelectionChange: (ids: string[]) => void
}

export default function DimensionsTable({ texts, corpus, selected, onSelectionChange }: DimensionsTableProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [sortField, setSortField] = useState<SortField>('filename')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(50)

  const sorted = useMemo(() => {
    const arr = [...texts]
    const val = (r: MDATextResult): string | number => {
      switch (sortField) {
        case 'filename': return r.filename.toLowerCase()
        case 'tokens': return r.tokens
        case 'awl': return r.awl
        case 'ttr': return r.ttr
        default: return r.dimensions[sortField.slice(1)] ?? 0
      }
    }
    arr.sort((a, b) => {
      const va = val(a); const vb = val(b)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [texts, sortField, sortDir])

  const pageRows = useMemo(
    () => sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sorted, page, rowsPerPage]
  )

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'filename' ? 'asc' : 'desc')
    }
    setPage(0)
  }

  const typeLabel = (name: string) => (isZh ? TEXT_TYPE_LABELS_ZH[name] || name : name)

  // Row selection (same semantics as Metaphor Analysis: header = current page)
  const allPageSelected = pageRows.length > 0 && pageRows.every(r => selected.includes(r.text_id))
  const somePageSelected = pageRows.some(r => selected.includes(r.text_id))
  const handleSelectAllPage = () => {
    const pageIds = pageRows.map(r => r.text_id)
    if (allPageSelected) {
      onSelectionChange(selected.filter(id => !pageIds.includes(id)))
    } else {
      onSelectionChange([...new Set([...selected, ...pageIds])])
    }
  }
  const handleSelectRow = (id: string) => {
    if (selected.includes(id)) onSelectionChange(selected.filter(x => x !== id))
    else onSelectionChange([...selected, id])
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
              <TableCell>{headSort('filename', t('mda.table.filename'))}</TableCell>
              <TableCell align="right">{headSort('tokens', t('mda.table.tokens'))}</TableCell>
              <TableCell align="right">{headSort('awl', 'AWL')}</TableCell>
              <TableCell align="right">{headSort('ttr', 'TTR')}</TableCell>
              {[1, 2, 3, 4, 5, 6].map(d => (
                <TableCell key={d} align="right">
                  <Tooltip title={isZh ? DIMENSION_LABELS[d].zh : DIMENSION_LABELS[d].en}>
                    <Box component="span" sx={{ color: DIMENSION_COLORS[d], fontWeight: 600 }}>
                      {headSort(`d${d}` as SortField, `D${d}`)}
                    </Box>
                  </Tooltip>
                </TableCell>
              ))}
              <TableCell>{t('mda.table.closestType')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map(row => (
              <TableRow key={row.text_id} hover selected={selected.includes(row.text_id)}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.includes(row.text_id)}
                    onChange={() => handleSelectRow(row.text_id)}
                    size="small"
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Tooltip title={row.filename}><span>{row.filename}</span></Tooltip>
                </TableCell>
                <TableCell align="right">{row.tokens.toLocaleString()}</TableCell>
                <TableCell align="right">{row.awl.toFixed(2)}</TableCell>
                <TableCell align="right">{row.ttr}</TableCell>
                {[1, 2, 3, 4, 5, 6].map(d => (
                  <TableCell key={d} align="right">
                    {(row.dimensions[String(d)] ?? 0).toFixed(2)}
                  </TableCell>
                ))}
                <TableCell>
                  <Typography variant="caption">{typeLabel(row.closest_text_type)}</Typography>
                </TableCell>
              </TableRow>
            ))}
            {/* Corpus summary row (pinned to every page) */}
            <TableRow sx={{ '& td': { fontWeight: 700, borderTop: 2, borderColor: 'divider' } }}>
              <TableCell padding="checkbox" />
              <TableCell>{t('mda.table.corpusMean')}</TableCell>
              <TableCell align="right">{corpus.total_tokens.toLocaleString()}</TableCell>
              <TableCell align="right">{corpus.awl.toFixed(2)}</TableCell>
              <TableCell align="right">{corpus.ttr.toFixed(0)}</TableCell>
              {[1, 2, 3, 4, 5, 6].map(d => (
                <TableCell key={d} align="right" sx={{ color: DIMENSION_COLORS[d] }}>
                  <Tooltip title={`${t('mda.table.range')}: ${corpus.dimension_ranges[String(d)]?.[0]} ~ ${corpus.dimension_ranges[String(d)]?.[1]}`}>
                    <span>{(corpus.dimensions[String(d)] ?? 0).toFixed(2)}</span>
                  </Tooltip>
                </TableCell>
              ))}
              <TableCell>
                <Typography variant="caption" fontWeight={700}>{typeLabel(corpus.closest_text_type)}</Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={sorted.length}
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

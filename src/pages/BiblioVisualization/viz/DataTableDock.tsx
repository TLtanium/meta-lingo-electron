/**
 * DataTableDock — collapsible, drag-to-resize bottom dock listing the chart's nodes.
 *
 * Shared across the node-based charts (network / cluster / timeline / timezone). The
 * "visible" checkbox toggles a node's presence on the canvas; the variable column is
 * renamed to match the active node type (keyword / author / institution / country).
 * Supports column sorting, free-text search, and CSV export.
 */

import { useMemo, useState, useRef, useCallback } from 'react'
import {
  Box, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel,
  Checkbox, IconButton, Typography, TextField, Tooltip, TableContainer,
  Collapse, Chip, InputAdornment
} from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import SearchIcon from '@mui/icons-material/Search'
import TableRowsIcon from '@mui/icons-material/TableRows'
import { useTranslation } from 'react-i18next'

export interface DataTableRow {
  id: string
  label: string
  frequency: number
  centrality: number
  year?: number | null
  cluster?: number
}

interface DataTableDockProps {
  rows: DataTableRow[]
  variableLabel: string
  hiddenNodeIds: Set<string>
  onToggleNode: (id: string) => void
  onSetAll: (visible: boolean) => void
  open: boolean
  onToggleOpen: () => void
}

type SortKey = 'visible' | 'frequency' | 'centrality' | 'year' | 'label'

export default function DataTableDock({
  rows, variableLabel, hiddenNodeIds, onToggleNode, onSetAll, open, onToggleOpen
}: DataTableDockProps) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<SortKey>('frequency')
  const [sortAsc, setSortAsc] = useState(false)
  const [query, setQuery] = useState('')
  const [height, setHeight] = useState(220)
  const dragState = useRef<{ startY: number; startH: number } | null>(null)

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(s => !s)
    else { setSortKey(key); setSortAsc(key === 'label') }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = q ? rows.filter(r => r.label.toLowerCase().includes(q)) : rows.slice()
    list.sort((a, b) => {
      let av: number | string, bv: number | string
      switch (sortKey) {
        case 'visible': av = hiddenNodeIds.has(a.id) ? 0 : 1; bv = hiddenNodeIds.has(b.id) ? 0 : 1; break
        case 'centrality': av = a.centrality; bv = b.centrality; break
        case 'year': av = a.year ?? 0; bv = b.year ?? 0; break
        case 'label': av = a.label.toLowerCase(); bv = b.label.toLowerCase(); break
        default: av = a.frequency; bv = b.frequency
      }
      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })
    return list
  }, [rows, query, sortKey, sortAsc, hiddenNodeIds])

  const allVisible = rows.length > 0 && rows.every(r => !hiddenNodeIds.has(r.id))
  const someHidden = rows.some(r => hiddenNodeIds.has(r.id))
  const hiddenCount = rows.reduce((n, r) => n + (hiddenNodeIds.has(r.id) ? 1 : 0), 0)
  const maxFreq = useMemo(() => Math.max(1, ...rows.map(r => r.frequency)), [rows])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragState.current = { startY: e.clientY, startH: height }
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const dy = dragState.current.startY - ev.clientY
      setHeight(Math.max(120, Math.min(560, dragState.current.startH + dy)))
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [height])

  const exportCsv = () => {
    const header = ['visible', 'frequency', 'centrality', 'year', variableLabel]
    const lines = [header.join(',')]
    filtered.forEach(r => {
      const cells = [
        hiddenNodeIds.has(r.id) ? '0' : '1',
        String(r.frequency),
        r.centrality.toFixed(4),
        r.year != null ? String(r.year) : '',
        '"' + r.label.replace(/"/g, '""') + '"',
      ]
      lines.push(cells.join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'biblio-nodes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const headCellSx = { py: 0.75, fontWeight: 600, bgcolor: 'background.paper', whiteSpace: 'nowrap' as const }

  return (
    <Box sx={{
      border: 1, borderColor: 'divider', bgcolor: 'background.paper',
      borderRadius: 2, overflow: 'hidden', transition: 'box-shadow .2s ease',
      boxShadow: open ? '0 2px 12px rgba(0,0,0,0.08)' : 'none',
    }}>
      {/* Grip / resize handle (only when open) */}
      {open && (
        <Box onMouseDown={onDragStart}
          sx={{ height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'ns-resize', '&:hover .grip': { bgcolor: 'primary.main' } }}>
          <Box className="grip" sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', transition: 'background-color .15s' }} />
        </Box>
      )}

      {/* Header bar */}
      <Box
        onClick={open ? undefined : onToggleOpen}
        sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: open ? 0.5 : 1.5, gap: 1,
          cursor: open ? 'default' : 'pointer',
          background: 'transparent' }}
      >
        <TableRowsIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="subtitle2" sx={{ cursor: 'pointer' }} onClick={onToggleOpen}>
          {t('biblio.dataTable')}
        </Typography>
        <Chip size="small" label={rows.length} variant="outlined" sx={{ height: 20, '& .MuiChip-label': { px: 0.8, fontSize: 11 } }} />
        {hiddenCount > 0 && (
          <Chip size="small" color="warning" variant="outlined"
            label={`${hiddenCount} ${t('biblio.hidden')}`}
            sx={{ height: 20, '& .MuiChip-label': { px: 0.8, fontSize: 11 } }} />
        )}
        <Box sx={{ flex: 1 }} />
        {open && (
          <>
            <TextField
              size="small" placeholder={t('common.search') as string}
              value={query} onChange={(e) => setQuery(e.target.value)}
              InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>) }}
              sx={{ width: 200, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <Tooltip title={t('biblio.exportCsv') as string}>
              <IconButton size="small" onClick={exportCsv}><SaveAltIcon fontSize="small" /></IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title={(open ? t('common.collapse') : t('common.expand')) as string}>
          <IconButton size="small" onClick={onToggleOpen}>
            {open ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Collapse in={open} timeout={220} unmountOnExit>
        <TableContainer sx={{ maxHeight: height, borderTop: 1, borderColor: 'divider' }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { borderColor: 'divider' } }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={headCellSx}>
                  <Checkbox size="small" checked={allVisible} indeterminate={!allVisible && someHidden}
                    onChange={(e) => onSetAll(e.target.checked)} />
                </TableCell>
                <TableCell sx={{ ...headCellSx, width: 180 }} sortDirection={sortKey === 'frequency' ? (sortAsc ? 'asc' : 'desc') : false}>
                  <TableSortLabel active={sortKey === 'frequency'} direction={sortAsc ? 'asc' : 'desc'} onClick={() => onSort('frequency')}>
                    {t('biblio.frequency')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ ...headCellSx, width: 110 }}>
                  <TableSortLabel active={sortKey === 'centrality'} direction={sortAsc ? 'asc' : 'desc'} onClick={() => onSort('centrality')}>
                    {t('biblio.centrality')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ ...headCellSx, width: 80 }}>
                  <TableSortLabel active={sortKey === 'year'} direction={sortAsc ? 'asc' : 'desc'} onClick={() => onSort('year')}>
                    {t('biblio.year')}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={headCellSx}>
                  <TableSortLabel active={sortKey === 'label'} direction={sortAsc ? 'asc' : 'desc'} onClick={() => onSort('label')}>
                    {variableLabel}
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(r => {
                const hidden = hiddenNodeIds.has(r.id)
                return (
                  <TableRow key={r.id} hover sx={{ opacity: hidden ? 0.45 : 1, '& td': { py: 0.4 } }}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={!hidden} onChange={() => onToggleNode(r.id)} />
                    </TableCell>
                    <TableCell>
                      {/* frequency value + proportional mini-bar */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.frequency}</Box>
                        <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                          <Box sx={{ width: `${Math.round((r.frequency / maxFreq) * 100)}%`, height: '100%',
                            borderRadius: 3, bgcolor: 'primary.main', opacity: 0.7 }} />
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.centrality.toFixed(4)}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.year ?? '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.label}
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    {t('biblio.noData')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>
    </Box>
  )
}

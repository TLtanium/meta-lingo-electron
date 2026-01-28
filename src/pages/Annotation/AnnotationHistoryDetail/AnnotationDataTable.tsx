/**
 * AnnotationDataTable - 增强的标注数据表格组件
 * 
 * 功能：
 * - 列排序（点击表头）
 * - 搜索筛选（标签/文本）
 * - 分页
 * - 导出 CSV
 * - 行颜色高亮
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
  TableSortLabel,
  TablePagination,
  Paper,
  TextField,
  InputAdornment,
  Button,
  Stack,
  Chip,
  Typography,
  Tooltip,
  Alert
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import DownloadIcon from '@mui/icons-material/Download'
import { useTranslation } from 'react-i18next'
import type { Annotation } from '../../../types'

interface AnnotationDataTableProps {
  annotations: Annotation[]
  archiveName: string
  excludeVideoAnnotations?: boolean  // 是否排除视频标注（type === 'video'）
}

type Order = 'asc' | 'desc'
type OrderBy = 'index' | 'label' | 'text' | 'pos' | 'entity' | 'position'

// POS 颜色映射
const getPosColor = (pos: string): string => {
  const colors: Record<string, string> = {
    'NOUN': '#2196f3',
    'VERB': '#f44336',
    'ADJ': '#4caf50',
    'ADV': '#ff9800',
    'PROPN': '#9c27b0',
    'DET': '#00bcd4',
    'ADP': '#607d8b',
    'PRON': '#e91e63',
    'NUM': '#795548',
    'CCONJ': '#009688',
    'SCONJ': '#3f51b5',
    'PART': '#cddc39',
    'PUNCT': '#9e9e9e',
    'Mul': '#ff5722'
  }
  return colors[pos] || '#757575'
}

// 实体颜色映射
const getEntityColor = (label: string): string => {
  const colors: Record<string, string> = {
    'PERSON': '#f44336',
    'ORG': '#2196f3',
    'GPE': '#4caf50',
    'LOC': '#ff9800',
    'DATE': '#9c27b0',
    'TIME': '#e91e63',
    'MONEY': '#ffeb3b',
    'PERCENT': '#00bcd4',
    'EVENT': '#ff5722',
    'PRODUCT': '#607d8b',
    'WORK_OF_ART': '#673ab7',
    'Mul': '#ff5722'
  }
  return colors[label] || '#757575'
}

export default function AnnotationDataTable({ annotations, archiveName, excludeVideoAnnotations = false }: AnnotationDataTableProps) {
  const { t } = useTranslation()
  
  // 状态
  const [order, setOrder] = useState<Order>('asc')
  const [orderBy, setOrderBy] = useState<OrderBy>('position')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  
  // 基础数据（排除视频标注如果需要）
  const baseData = useMemo(() => {
    if (excludeVideoAnnotations) {
      return annotations.filter(a => a.type !== 'video')
    }
    return annotations
  }, [annotations, excludeVideoAnnotations])
  
  // 过滤数据
  const filteredData = useMemo(() => {
    if (!searchQuery) return baseData
    
    const query = searchQuery.toLowerCase()
    return baseData.filter(ann => 
      ann.label.toLowerCase().includes(query) ||
      ann.text.toLowerCase().includes(query) ||
      (ann.pos && ann.pos.toLowerCase().includes(query)) ||
      (ann.entity && ann.entity.toLowerCase().includes(query)) ||
      (ann.remark && ann.remark.toLowerCase().includes(query))
    )
  }, [baseData, searchQuery])
  
  // 排序数据
  const sortedData = useMemo(() => {
    const comparator = (a: Annotation, b: Annotation): number => {
      let comparison = 0
      switch (orderBy) {
        case 'label':
          comparison = a.label.localeCompare(b.label)
          break
        case 'text':
          comparison = a.text.localeCompare(b.text)
          break
        case 'pos':
          comparison = (a.pos || '').localeCompare(b.pos || '')
          break
        case 'entity':
          comparison = (a.entity || '').localeCompare(b.entity || '')
          break
        case 'position':
        default:
          comparison = a.startPosition - b.startPosition
          break
      }
      return order === 'asc' ? comparison : -comparison
    }
    
    return [...filteredData].sort(comparator)
  }, [filteredData, order, orderBy])
  
  // 分页数据
  const paginatedData = useMemo(() => {
    const start = page * rowsPerPage
    return sortedData.slice(start, start + rowsPerPage)
  }, [sortedData, page, rowsPerPage])
  
  // 处理排序
  const handleSort = (property: OrderBy) => {
    const isAsc = orderBy === property && order === 'asc'
    setOrder(isAsc ? 'desc' : 'asc')
    setOrderBy(property)
  }
  
  // 导出 CSV
  const handleExportCsv = () => {
    const headers = ['#', t('annotation.label', '标签'), t('annotation.text', '文本'), 
                     t('annotation.pos', '词性'), t('annotation.ner', '命名实体'),
                     t('annotation.position', '位置'), t('annotation.remark', '备注')]
    
    const rows = sortedData.map((ann, idx) => [
      idx + 1,
      ann.label,
      `"${ann.text.replace(/"/g, '""')}"`,
      ann.pos || '-',
      ann.entity || '-',
      ann.startPosition,
      ann.remark ? `"${ann.remark.replace(/"/g, '""')}"` : '-'
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const safeFileName = archiveName.replace(/[<>:"/\\|?*]/g, '_')
    link.download = `${safeFileName}_annotations.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  
  // 表头样式
  const headerCellSx = {
    bgcolor: '#f5f5f5',
    fontWeight: 600,
    borderBottom: '2px solid #ddd',
    fontSize: '12px',
    px: 1.5,
    py: 1,
    whiteSpace: 'nowrap'
  }
  
  // 表格内容样式
  const bodyCellSx = {
    fontSize: '12px',
    borderBottom: '1px solid #eee',
    px: 1.5,
    py: 0.75
  }
  
  if (baseData.length === 0) {
    return (
      <Alert severity="info">
        {t('annotation.noAnnotations', '暂无标注')}
      </Alert>
    )
  }
  
  return (
    <Box>
      {/* 工具栏 */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
        <TextField
          size="small"
          placeholder={t('annotation.searchAnnotation', '搜索标注...')}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setPage(0)
          }}
          sx={{ minWidth: 250 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
        
        <Box sx={{ flex: 1 }} />
        
        <Typography variant="body2" color="text.secondary">
          {t('common.all', '共')} {filteredData.length} {t('common.items', '条')}
        </Typography>
        
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleExportCsv}
        >
          {t('annotation.exportCsv', '导出CSV')}
        </Button>
      </Stack>
      
      {/* 表格 */}
      <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>#</TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'label'}
                  direction={orderBy === 'label' ? order : 'asc'}
                  onClick={() => handleSort('label')}
                >
                  {t('annotation.label', '标签')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'text'}
                  direction={orderBy === 'text' ? order : 'asc'}
                  onClick={() => handleSort('text')}
                >
                  {t('annotation.text', '文本')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'pos'}
                  direction={orderBy === 'pos' ? order : 'asc'}
                  onClick={() => handleSort('pos')}
                >
                  {t('annotation.pos', '词性')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'entity'}
                  direction={orderBy === 'entity' ? order : 'asc'}
                  onClick={() => handleSort('entity')}
                >
                  {t('annotation.ner', '命名实体')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'position'}
                  direction={orderBy === 'position' ? order : 'asc'}
                  onClick={() => handleSort('position')}
                >
                  {t('annotation.position', '位置')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.remark', '备注')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((ann, idx) => (
              <TableRow 
                key={ann.id}
                sx={{
                  '&:hover': { bgcolor: `${ann.color}10` }
                }}
              >
                <TableCell sx={bodyCellSx}>
                  {page * rowsPerPage + idx + 1}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Chip
                    label={ann.label}
                    size="small"
                    sx={{
                      bgcolor: ann.color || '#2196F3',
                      color: '#fff',
                      fontWeight: 500,
                      fontSize: '11px',
                      height: 22
                    }}
                  />
                </TableCell>
                <TableCell sx={{ ...bodyCellSx, maxWidth: 300 }}>
                  <Tooltip title={ann.text}>
                    <Typography
                      variant="body2"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '12px'
                      }}
                    >
                      {ann.text}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  {ann.pos && ann.pos !== '-' ? (
                    <Chip
                      label={ann.pos}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '10px',
                        bgcolor: `${getPosColor(ann.pos)}20`,
                        color: getPosColor(ann.pos),
                        fontWeight: 500
                      }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.disabled">-</Typography>
                  )}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  {ann.entity && ann.entity !== '-' ? (
                    <Chip
                      label={ann.entity}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '10px',
                        bgcolor: `${getEntityColor(ann.entity)}20`,
                        color: getEntityColor(ann.entity),
                        fontWeight: 500
                      }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.disabled">-</Typography>
                  )}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  {ann.startPosition}
                </TableCell>
                <TableCell sx={{ ...bodyCellSx, maxWidth: 200 }}>
                  <Tooltip title={ann.remark || ''}>
                    <Typography
                      variant="body2"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '12px'
                      }}
                    >
                      {ann.remark || '-'}
                    </Typography>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* 分页 */}
      <TablePagination
        component="div"
        count={filteredData.length}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10))
          setPage(0)
        }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage={t('common.rowsPerPage', '每页行数')}
      />
    </Box>
  )
}

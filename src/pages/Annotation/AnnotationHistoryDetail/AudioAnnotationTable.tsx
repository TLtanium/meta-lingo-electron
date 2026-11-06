/**
 * AudioAnnotationTable - 音频画框标注表格
 * 
 * 功能：
 * - 列排序（点击表头）
 * - 搜索筛选
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
  Alert,
  useTheme
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import DownloadIcon from '@mui/icons-material/Download'
import { useTranslation } from 'react-i18next'
import type { AudioBox, Annotation } from '../../../types'
import { audioBoxesToCsv } from '../../../utils/audioAnnotationArchive'

interface AudioAnnotationTableProps {
  audioBoxes: AudioBox[]
  annotations: Annotation[]  // 保留兼容性（不再使用）
  archiveName: string
}

type Order = 'asc' | 'desc'
type OrderBy = 'index' | 'label' | 'startTime' | 'endTime' | 'duration'

export default function AudioAnnotationTable({
  audioBoxes,
  archiveName
}: AudioAnnotationTableProps) {
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const { t } = useTranslation()
  
  // 状态
  const [order, setOrder] = useState<Order>('asc')
  const [orderBy, setOrderBy] = useState<OrderBy>('startTime')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  
  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }
  
  // 过滤数据
  const filteredData = useMemo(() => {
    if (!searchQuery) return audioBoxes
    
    const query = searchQuery.toLowerCase()
    return audioBoxes.filter(box => 
      box.label.toLowerCase().includes(query) ||
      (box.labelPath && box.labelPath.toLowerCase().includes(query)) ||
      (box.remark && box.remark.toLowerCase().includes(query)) ||
      (box.text && box.text.toLowerCase().includes(query))
    )
  }, [audioBoxes, searchQuery])
  
  // 排序数据
  const sortedData = useMemo(() => {
    const comparator = (a: AudioBox, b: AudioBox): number => {
      let comparison = 0
      switch (orderBy) {
        case 'label':
          comparison = a.label.localeCompare(b.label)
          break
        case 'startTime':
          comparison = a.startTime - b.startTime
          break
        case 'endTime':
          comparison = a.endTime - b.endTime
          break
        case 'duration':
          comparison = (a.endTime - a.startTime) - (b.endTime - b.startTime)
          break
        default:
          comparison = a.startTime - b.startTime
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
    const headers = ['ID', t('annotation.label'), t('annotation.labelPath'), t('annotation.startTime'),
      t('annotation.endTime'), t('annotation.duration'), t('annotation.audioBoxY'), t('annotation.audioBoxHeight'), t('annotation.remark')]
    const csvContent = audioBoxesToCsv(sortedData, headers)
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const safeFileName = archiveName.replace(/[<>:"/\\|?*]/g, '_')
    link.download = `${safeFileName}_audio_annotations.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  
  // 表头样式
  const headerCellSx = {
    bgcolor: isDarkMode ? '#2a2a2a' : '#f5f5f5',
    fontWeight: 600,
    borderBottom: isDarkMode ? '2px solid #444' : '2px solid #ddd',
    fontSize: '12px',
    px: 1.5,
    py: 1,
    whiteSpace: 'nowrap'
  }
  
  // 表格内容样式
  const bodyCellSx = {
    fontSize: '12px',
    borderBottom: isDarkMode ? '1px solid #333' : '1px solid #eee',
    px: 1.5,
    py: 0.75
  }
  
  if (audioBoxes.length === 0) {
    return (
      <Alert severity="info">
        {t('annotation.noAudioAnnotations', '暂无音频标注数据')}
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
                  active={orderBy === 'startTime'}
                  direction={orderBy === 'startTime' ? order : 'asc'}
                  onClick={() => handleSort('startTime')}
                >
                  {t('annotation.startTime', '开始时间')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'endTime'}
                  direction={orderBy === 'endTime' ? order : 'asc'}
                  onClick={() => handleSort('endTime')}
                >
                  {t('annotation.endTime', '结束时间')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'duration'}
                  direction={orderBy === 'duration' ? order : 'asc'}
                  onClick={() => handleSort('duration')}
                >
                  {t('annotation.duration', '时长')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.remark')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((box, idx) => (
              <TableRow 
                key={box.id}
                sx={{
                  '&:hover': { bgcolor: `${box.color}10` }
                }}
              >
                <TableCell sx={bodyCellSx}>
                  {page * rowsPerPage + idx + 1}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Chip
                    label={box.label}
                    title={box.labelPath || box.label}
                    size="small"
                    sx={{
                      bgcolor: box.color || '#f97316',
                      color: '#fff',
                      fontWeight: 500,
                      fontSize: '11px',
                      height: 22
                    }}
                  />
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Tooltip title={`${box.startTime.toFixed(3)}s`}>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '12px', fontFamily: 'monospace' }}
                    >
                      {formatTime(box.startTime)}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Tooltip title={`${box.endTime.toFixed(3)}s`}>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '12px', fontFamily: 'monospace' }}
                    >
                      {formatTime(box.endTime)}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '12px', fontFamily: 'monospace' }}
                  >
                    {(box.endTime - box.startTime).toFixed(2)}s
                  </Typography>
                </TableCell>
                <TableCell sx={bodyCellSx}>{box.remark ?? box.text ?? ''}</TableCell>
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

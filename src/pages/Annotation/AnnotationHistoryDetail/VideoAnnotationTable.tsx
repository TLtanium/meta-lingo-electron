/**
 * VideoAnnotationTable - 视频标注表格组件
 * 
 * 功能：
 * - 显示 YOLO 检测 + 手动视频标注
 * - 列排序
 * - 搜索筛选
 * - 分页
 * - 导出 CSV
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
  Alert
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import DownloadIcon from '@mui/icons-material/Download'
import { useTranslation } from 'react-i18next'
import type { Annotation, YoloTrack, VideoBox, ClipAnnotationData } from '../../../types'

interface VideoAnnotationTableProps {
  annotations: Annotation[]  // 包含 type === 'video' 的手动画框标注
  yoloAnnotations: YoloTrack[]
  manualTracks: VideoBox[]
  clipAnnotations?: ClipAnnotationData | null
  archiveName: string
}

// 合并后的视频标注项
interface VideoAnnotationItem {
  id: string
  source: 'CLIP' | 'YOLO' | 'manual'
  label: string
  time: number
  frame: number
  confidence: number | null
  color: string
}

type Order = 'asc' | 'desc'
type OrderBy = 'source' | 'label' | 'time' | 'frame' | 'confidence'

export default function VideoAnnotationTable({ 
  annotations,
  yoloAnnotations, 
  manualTracks,
  clipAnnotations,
  archiveName 
}: VideoAnnotationTableProps) {
  const { t } = useTranslation()
  
  // 状态
  const [order, setOrder] = useState<Order>('asc')
  const [orderBy, setOrderBy] = useState<OrderBy>('time')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  
  // 从 annotations 中提取视频标注 (type === 'video')
  const videoAnnotationsFromAnnotations = useMemo(() => {
    return annotations.filter(a => a.type === 'video')
  }, [annotations])
  
  // 合并 CLIP、YOLO、手动轨迹和 annotations 中的视频标注
  const allAnnotations = useMemo<VideoAnnotationItem[]>(() => {
    const items: VideoAnnotationItem[] = []
    
    // CLIP 标注
    if (clipAnnotations?.frame_results?.length) {
      const fps = clipAnnotations.fps || 30
      clipAnnotations.frame_results.forEach((frame, idx) => {
        items.push({
          id: `clip-${frame.frame_number}-${idx}`,
          source: 'CLIP',
          label: frame.top_label,
          time: frame.timestamp_seconds,
          frame: frame.frame_number,
          confidence: frame.confidence,
          color: '#6366f1'  // 紫色
        })
      })
    }
    
    // YOLO 标注
    yoloAnnotations.forEach((track, idx) => {
      items.push({
        id: `yolo-${track.trackId}-${idx}`,
        source: 'YOLO',
        label: track.className,
        time: track.startTime,
        frame: track.startFrame,
        confidence: track.detections.length > 0 
          ? track.detections.reduce((sum, d) => sum + d.confidence, 0) / track.detections.length
          : null,
        color: track.color || '#2196F3'
      })
    })
    
    // 手动轨迹标注 (manualTracks)
    manualTracks.forEach((track, idx) => {
      items.push({
        id: `manual-track-${track.id}-${idx}`,
        source: 'manual',
        label: track.label,
        time: track.startTime,
        frame: track.startFrame,
        confidence: null,
        color: track.color || '#FF5722'
      })
    })
    
    // annotations 中 type === 'video' 的手动画框标注
    videoAnnotationsFromAnnotations.forEach((ann, idx) => {
      items.push({
        id: `manual-ann-${ann.id}-${idx}`,
        source: 'manual',
        label: ann.label,
        time: ann.timestamp || 0,
        frame: ann.frameNumber || 0,
        confidence: null,
        color: ann.color || '#FF5722'
      })
    })
    
    return items
  }, [clipAnnotations, yoloAnnotations, manualTracks, videoAnnotationsFromAnnotations])
  
  // 计算各类标注总数
  const totalClipCount = clipAnnotations?.frame_results?.length || 0
  const totalManualCount = manualTracks.length + videoAnnotationsFromAnnotations.length
  
  // 过滤数据
  const filteredData = useMemo(() => {
    if (!searchQuery) return allAnnotations
    
    const query = searchQuery.toLowerCase()
    return allAnnotations.filter(ann => 
      ann.label.toLowerCase().includes(query) ||
      ann.source.toLowerCase().includes(query)
    )
  }, [allAnnotations, searchQuery])
  
  // 排序数据
  const sortedData = useMemo(() => {
    const comparator = (a: VideoAnnotationItem, b: VideoAnnotationItem): number => {
      let comparison = 0
      switch (orderBy) {
        case 'source':
          comparison = a.source.localeCompare(b.source)
          break
        case 'label':
          comparison = a.label.localeCompare(b.label)
          break
        case 'time':
          comparison = a.time - b.time
          break
        case 'frame':
          comparison = a.frame - b.frame
          break
        case 'confidence':
          const aConf = a.confidence ?? -1
          const bConf = b.confidence ?? -1
          comparison = aConf - bConf
          break
        default:
          comparison = a.time - b.time
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
    const headers = ['#', t('annotation.source', '来源'), t('annotation.label', '标签'),
                     t('annotation.timeInSeconds', '时间(秒)'), t('annotation.frame', '帧数'),
                     t('annotation.confidence', '置信度')]
    
    const rows = sortedData.map((ann, idx) => [
      idx + 1,
      ann.source === 'CLIP' 
        ? t('annotation.clipClassification', 'CLIP分类')
        : ann.source === 'YOLO' 
        ? t('annotation.yoloDetection', 'YOLO检测') 
        : t('annotation.manualAnnotation', '手动标注'),
      ann.label,
      ann.time.toFixed(2),
      ann.frame,
      ann.confidence !== null ? ann.confidence.toFixed(3) : '-'
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
    link.download = `${safeFileName}_video_annotations.csv`
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
  
  if (allAnnotations.length === 0) {
    return (
      <Alert severity="info">
        {t('annotation.noVideoAnnotations', '暂无视频标注（YOLO检测或手动标注）')}
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
        
        <Stack direction="row" spacing={1}>
          {totalClipCount > 0 && (
            <Chip 
              label={`CLIP: ${totalClipCount}`} 
              size="small" 
              sx={{ bgcolor: '#6366f120', color: '#6366f1' }}
            />
          )}
          <Chip 
            label={`YOLO: ${yoloAnnotations.length}`} 
            size="small" 
            sx={{ bgcolor: '#2196F320', color: '#2196F3' }}
          />
          <Chip 
            label={`${t('annotation.manualAnnotation', '手动')}: ${totalManualCount}`} 
            size="small" 
            sx={{ bgcolor: '#FF572220', color: '#FF5722' }}
          />
        </Stack>
        
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
                  active={orderBy === 'source'}
                  direction={orderBy === 'source' ? order : 'asc'}
                  onClick={() => handleSort('source')}
                >
                  {t('annotation.source', '来源')}
                </TableSortLabel>
              </TableCell>
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
                  active={orderBy === 'time'}
                  direction={orderBy === 'time' ? order : 'asc'}
                  onClick={() => handleSort('time')}
                >
                  {t('annotation.timeInSeconds', '时间(秒)')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'frame'}
                  direction={orderBy === 'frame' ? order : 'asc'}
                  onClick={() => handleSort('frame')}
                >
                  {t('annotation.frame', '帧数')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headerCellSx}>
                <TableSortLabel
                  active={orderBy === 'confidence'}
                  direction={orderBy === 'confidence' ? order : 'asc'}
                  onClick={() => handleSort('confidence')}
                >
                  {t('annotation.confidence', '置信度')}
                </TableSortLabel>
              </TableCell>
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
                    label={ann.source === 'CLIP' 
                      ? t('annotation.clipClassification', 'CLIP分类')
                      : ann.source === 'YOLO' 
                      ? t('annotation.yoloDetection', 'YOLO检测') 
                      : t('annotation.manualAnnotation', '手动标注')}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '11px',
                      bgcolor: ann.source === 'CLIP' ? '#6366f120' : ann.source === 'YOLO' ? '#2196F320' : '#FF572220',
                      color: ann.source === 'CLIP' ? '#6366f1' : ann.source === 'YOLO' ? '#2196F3' : '#FF5722',
                      fontWeight: 500
                    }}
                  />
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Chip
                    label={ann.label}
                    size="small"
                    sx={{
                      bgcolor: ann.color,
                      color: '#fff',
                      fontWeight: 500,
                      fontSize: '11px',
                      height: 22
                    }}
                  />
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  {ann.time.toFixed(2)}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  {ann.frame}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  {ann.confidence !== null ? (
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontSize: '12px',
                        color: ann.confidence > 0.8 ? 'success.main' 
                             : ann.confidence > 0.5 ? 'warning.main' 
                             : 'error.main'
                      }}
                    >
                      {ann.confidence.toFixed(3)}
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.disabled">-</Typography>
                  )}
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

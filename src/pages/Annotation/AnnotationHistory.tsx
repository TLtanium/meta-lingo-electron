/**
 * AnnotationHistory - 标注历史管理页面
 * 
 * 功能：
 * - 按语料库分组显示所有存档列表
 * - 存档详情预览（框架、标注数量、时间戳）
 * - 点击卡片进入详情页面（表格展示 + 数据可视化）
 * - 直接导出单个存档（以存档名命名）
 * - 批量导出存档
 * - 搜索和筛选
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
  Divider,
  Checkbox
} from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import SearchIcon from '@mui/icons-material/Search'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import DescriptionIcon from '@mui/icons-material/Description'
import VideoFileIcon from '@mui/icons-material/VideoFile'
import FolderIcon from '@mui/icons-material/Folder'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useTranslation } from 'react-i18next'
import { useCorpusStore } from '../../stores/corpusStore'
import { api } from '../../api/client'
import AnnotationHistoryDetail from './AnnotationHistoryDetail'

// 存档信息类型
interface ArchiveInfo {
  id: string
  filename: string
  type: 'text' | 'multimodal'
  framework: string
  textName?: string
  resourceName?: string
  annotationCount: number
  clipFrameCount?: number
  yoloCount?: number
  manualCount?: number
  timestamp: string
  corpus: string
}

// 语料库简单类型
interface CorpusBasic {
  id: string
  name: string
}

export default function AnnotationHistory() {
  const { t } = useTranslation()
  const { corpora: storeCorpora, setCorpora } = useCorpusStore()
  
  // 状态
  const [loading, setLoading] = useState(false)
  const [archives, setArchives] = useState<ArchiveInfo[]>([])
  const [filteredArchives, setFilteredArchives] = useState<ArchiveInfo[]>([])
  const [corpora, setLocalCorpora] = useState<CorpusBasic[]>([])
  
  // 筛选条件
  const [selectedCorpus, setSelectedCorpus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'text' | 'multimodal'>('all')
  
  // 选中的存档
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  // 删除确认对话框
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ArchiveInfo | null>(null)
  
  // 详情页面状态
  const [showDetail, setShowDetail] = useState(false)
  const [selectedArchive, setSelectedArchive] = useState<ArchiveInfo | null>(null)
  
  // 导出状态
  const [exporting, setExporting] = useState<string | null>(null)
  
  // 加载语料库列表
  const loadCorpora = useCallback(async () => {
    try {
      const response = await api.get('/api/corpus/list')
      const result = response.data as { success: boolean; data: any[] }
      
      if (result.success && Array.isArray(result.data)) {
        const corporaList = result.data.map((c: any) => ({
          id: c.id,
          name: c.name
        }))
        setLocalCorpora(corporaList)
        
        // 同时更新 store（如果 store 是空的）
        if (storeCorpora.length === 0 && result.data.length > 0) {
          setCorpora(result.data)
        }
        
        return corporaList
      }
      return []
    } catch (error) {
      console.error('Failed to load corpora:', error)
      return []
    }
  }, [storeCorpora.length, setCorpora])
  
  // 加载所有存档
  const loadAllArchives = useCallback(async (corporaList: CorpusBasic[]) => {
    setLoading(true)
    try {
      const allArchives: ArchiveInfo[] = []
      
      for (const corpus of corporaList) {
        try {
          const response = await api.get(`/api/annotation/list/${corpus.name}`)
          const result = response.data as { success: boolean; data: { archives: any[] } }
          
          if (result.success && result.data?.archives) {
            result.data.archives.forEach((archive: any) => {
              allArchives.push({
                ...archive,
                corpus: corpus.name
              })
            })
          }
        } catch (err) {
          console.error(`Failed to load archives for ${corpus.name}:`, err)
        }
      }
      
      // 按时间戳排序（支持 YYYYMMDD_HHMMSS 格式）
      allArchives.sort((a, b) => {
        const parseTimestamp = (ts: string): number => {
          if (!ts) return 0
          // 处理 YYYYMMDD_HHMMSS 格式
          if (ts.includes('_') && !ts.includes('-')) {
            return parseInt(ts.replace('_', ''), 10) || 0
          }
          const date = new Date(ts)
          return isNaN(date.getTime()) ? 0 : date.getTime()
        }
        return parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp)
      })
      
      setArchives(allArchives)
    } catch (error) {
      console.error('Failed to load archives:', error)
    } finally {
      setLoading(false)
    }
  }, [])
  
  // 初始加载
  useEffect(() => {
    const init = async () => {
      const corporaList = await loadCorpora()
      if (corporaList.length > 0) {
        await loadAllArchives(corporaList)
      } else {
        setLoading(false)
      }
    }
    init()
  }, [loadCorpora, loadAllArchives])
  
  // 筛选存档
  useEffect(() => {
    let result = archives
    
    // 语料库筛选
    if (selectedCorpus !== 'all') {
      result = result.filter(a => a.corpus === selectedCorpus)
    }
    
    // 类型筛选
    if (typeFilter !== 'all') {
      result = result.filter(a => a.type === typeFilter)
    }
    
    // 搜索筛选
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(a => 
        (a.textName?.toLowerCase()?.includes(query)) ||
        (a.resourceName?.toLowerCase()?.includes(query)) ||
        (a.framework?.toLowerCase()?.includes(query)) ||
        (a.id?.toLowerCase()?.includes(query))
      )
    }
    
    setFilteredArchives(result)
  }, [archives, selectedCorpus, typeFilter, searchQuery])
  
  // 处理选中
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }
  
  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedIds.length === filteredArchives.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredArchives.map(a => a.id))
    }
  }
  
  // 删除存档
  const handleDelete = async () => {
    if (!deleteTarget) return
    
    try {
      await api.delete(
        `/api/annotation/${deleteTarget.corpus}/${deleteTarget.id}`
      )
      setArchives(prev => prev.filter(a => a.id !== deleteTarget.id))
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    } catch (error) {
      console.error('Failed to delete archive:', error)
    }
  }
  
  // 单个导出（直接导出，以存档名命名）
  const handleSingleExport = async (archive: ArchiveInfo, e?: React.MouseEvent) => {
    // 阻止事件冒泡，防止触发卡片点击
    if (e) {
      e.stopPropagation()
    }
    
    setExporting(archive.id)
    try {
      const response = await api.get(
        `/api/annotation/load/${archive.corpus}/${archive.id}`
      )
      const result = response.data as { success: boolean; data: any }
      
      if (result.success && result.data) {
        // 使用存档名命名（textName 或 resourceName）
        const fileName = archive.textName || archive.resourceName || archive.id
        // 清理文件名中的非法字符
        const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_')
        
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: 'application/json'
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${safeFileName}.json`
        link.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error(`Failed to export ${archive.id}:`, error)
    } finally {
      setExporting(null)
    }
  }
  
  // 批量导出
  const handleBatchExport = async () => {
    const selectedArchives = archives.filter(a => selectedIds.includes(a.id))
    
    for (const archive of selectedArchives) {
      try {
        const response = await api.get(
          `/api/annotation/load/${archive.corpus}/${archive.id}`
        )
        const result = response.data as { success: boolean; data: any }
        
        if (result.success && result.data) {
          // 使用存档名命名
          const fileName = archive.textName || archive.resourceName || archive.id
          const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_')
          
          const blob = new Blob([JSON.stringify(result.data, null, 2)], {
            type: 'application/json'
          })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `${safeFileName}.json`
          link.click()
          URL.revokeObjectURL(url)
        }
      } catch (error) {
        console.error(`Failed to export ${archive.id}:`, error)
      }
    }
    
    setSelectedIds([])
  }
  
  // 点击卡片进入详情页面
  const handleCardClick = (archive: ArchiveInfo) => {
    setSelectedArchive(archive)
    setShowDetail(true)
  }
  
  // 从详情页返回列表
  const handleBackToList = async () => {
    setShowDetail(false)
    setSelectedArchive(null)
    // 返回时刷新存档列表
    if (corpora.length > 0) {
      await loadAllArchives(corpora)
    }
  }
  
  // 手动刷新存档列表
  const handleRefresh = async () => {
    if (corpora.length > 0) {
      await loadAllArchives(corpora)
    }
  }
  
  // 格式化时间
  const formatTime = (timestamp: string) => {
    if (!timestamp) return '-'
    // 处理 YYYYMMDD_HHMMSS 格式
    if (timestamp.includes('_') && !timestamp.includes('-')) {
      const [date, time] = timestamp.split('_')
      const year = date.slice(0, 4)
      const month = date.slice(4, 6)
      const day = date.slice(6, 8)
      const hour = time.slice(0, 2)
      const minute = time.slice(2, 4)
      return `${year}-${month}-${day} ${hour}:${minute}`
    }
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return timestamp // 无法解析时返回原始值
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  // 如果显示详情页面
  if (showDetail && selectedArchive) {
    return (
      <AnnotationHistoryDetail
        archive={selectedArchive}
        onBack={handleBackToList}
      />
    )
  }
  
  return (
    <Box sx={{ height: '100%', width: '100%', overflow: 'auto', p: 2, boxSizing: 'border-box' }}>
      {/* 页面标题 */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon color="primary" />
          <Typography variant="h5" fontWeight={600}>
            {t('annotation.history', '标注历史')}
          </Typography>
        </Box>
        <IconButton 
          onClick={handleRefresh} 
          disabled={loading}
          title={t('common.refresh', '刷新')}
        >
          <RefreshIcon />
        </IconButton>
      </Box>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('annotation.historyDescription', '查看和管理所有语料库的标注存档')}
      </Typography>
      
      {/* 筛选工具栏 */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
            <InputLabel>{t('corpus.selectCorpus', '选择语料库')}</InputLabel>
            <Select
              value={selectedCorpus}
              onChange={(e) => setSelectedCorpus(e.target.value)}
              label={t('corpus.selectCorpus', '选择语料库')}
            >
              <MenuItem value="all">
                {t('common.all', '全部')}
              </MenuItem>
              {corpora.map(corpus => (
                <MenuItem key={corpus.id} value={corpus.name}>
                  {corpus.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 150, flex: 1 }}>
            <InputLabel>{t('annotation.type', '类型')}</InputLabel>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              label={t('annotation.type', '类型')}
            >
              <MenuItem value="all">{t('common.all', '全部')}</MenuItem>
              <MenuItem value="text">{t('annotation.textAnnotation', '文本标注')}</MenuItem>
              <MenuItem value="multimodal">{t('annotation.multimodalAnnotation', '多模态标注')}</MenuItem>
            </Select>
          </FormControl>
          
          <TextField
            size="small"
            placeholder={t('common.search', '搜索...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ minWidth: 200, flex: 1.5 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
          />
          
          <Button
            variant="outlined"
            size="small"
            onClick={handleSelectAll}
            sx={{ flexShrink: 0 }}
          >
            {selectedIds.length === filteredArchives.length && filteredArchives.length > 0
              ? t('common.deselectAll', '取消全选')
              : t('common.selectAll', '全选')
            }
          </Button>
        </Box>
        
        {/* 批量操作 */}
        {selectedIds.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip 
              label={`${t('common.selected', '已选择')} ${selectedIds.length} ${t('common.items', '项')}`}
              color="primary"
            />
            <Button
              size="small"
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleBatchExport}
            >
              {t('annotation.batchExport', '批量导出')}
            </Button>
          </Box>
        )}
      </Paper>
      
      {/* 存档列表 */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : filteredArchives.length === 0 ? (
        <Alert severity="info">
          {archives.length === 0 
            ? t('annotation.noArchives', '暂无标注存档')
            : t('annotation.noMatchingArchives', '没有匹配的存档')
          }
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {filteredArchives.map(archive => {
            const isMultimodal = archive.type === 'multimodal'
            const totalCount = isMultimodal 
              ? archive.annotationCount + (archive.clipFrameCount || 0) + (archive.yoloCount || 0) + (archive.manualCount || 0)
              : archive.annotationCount
            
            return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={archive.id}>
              <Card 
                variant="outlined"
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderColor: selectedIds.includes(archive.id) 
                    ? 'primary.main' 
                    : 'divider',
                  borderWidth: selectedIds.includes(archive.id) ? 2 : 1,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    boxShadow: 3,
                    borderColor: isMultimodal ? 'secondary.main' : 'primary.main'
                  }
                }}
                onClick={() => handleCardClick(archive)}
              >
                {/* 顶部类型标识条 */}
                <Box sx={{ 
                  height: 4, 
                  bgcolor: isMultimodal ? 'secondary.main' : 'primary.main',
                  borderRadius: '4px 4px 0 0'
                }} />
                
                <CardContent sx={{ pb: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* 标题行 */}
                  <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                    <Checkbox
                      checked={selectedIds.includes(archive.id)}
                      onChange={() => handleToggleSelect(archive.id)}
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                      sx={{ mt: -0.5, ml: -0.5 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Tooltip title={archive.textName || archive.resourceName || archive.id}>
                        <Typography 
                          variant="subtitle2" 
                          fontWeight={600} 
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: 1.4,
                            wordBreak: 'break-word',
                            minHeight: 40
                          }}
                        >
                          {archive.textName || archive.resourceName || archive.id}
                        </Typography>
                      </Tooltip>
                    </Box>
                  </Stack>
                  
                  {/* 元信息 */}
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, mb: 1 }}>
                    <Chip 
                      icon={isMultimodal ? <VideoFileIcon sx={{ fontSize: 14 }} /> : <DescriptionIcon sx={{ fontSize: 14 }} />}
                      label={isMultimodal ? t('annotation.multimodalAnnotation', '多模态') : t('annotation.textAnnotation', '文本')}
                      size="small"
                      color={isMultimodal ? 'secondary' : 'primary'}
                      variant="outlined"
                      sx={{ height: 22, fontSize: '11px' }}
                    />
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
                      {archive.corpus}
                    </Typography>
                  </Stack>
                  
                  {/* 框架名称 */}
                  <Tooltip title={archive.framework}>
                    <Typography 
                      variant="caption" 
                      color="text.secondary"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                        mb: 1
                      }}
                    >
                      {archive.framework}
                    </Typography>
                  </Tooltip>
                  
                  {/* 统计信息 - 统一的标签样式 */}
                  <Box sx={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: 0.5, 
                    flex: 1,
                    alignContent: 'flex-start'
                  }}>
                    {isMultimodal ? (
                      <>
                        {archive.annotationCount > 0 && (
                          <Chip 
                            label={`${t('annotation.transcriptAnnotation', '转录')} ${archive.annotationCount}`}
                            size="small"
                            sx={{ 
                              height: 20, 
                              fontSize: '10px',
                              bgcolor: '#f0fdf4',
                              color: '#16a34a',
                              '& .MuiChip-label': { px: 1 }
                            }}
                          />
                        )}
                        {(archive.clipFrameCount || 0) > 0 && (
                          <Chip 
                            label={`CLIP ${archive.clipFrameCount}`}
                            size="small"
                            sx={{ 
                              height: 20, 
                              fontSize: '10px',
                              bgcolor: '#f5f3ff',
                              color: '#8b5cf6',
                              '& .MuiChip-label': { px: 1 }
                            }}
                          />
                        )}
                        {(archive.yoloCount || 0) > 0 && (
                          <Chip 
                            label={`YOLO ${archive.yoloCount}`}
                            size="small"
                            sx={{ 
                              height: 20, 
                              fontSize: '10px',
                              bgcolor: '#eff6ff',
                              color: '#3b82f6',
                              '& .MuiChip-label': { px: 1 }
                            }}
                          />
                        )}
                        {(archive.manualCount || 0) > 0 && (
                          <Chip 
                            label={`${t('annotation.manualAnnotation', '手动')} ${archive.manualCount}`}
                            size="small"
                            sx={{ 
                              height: 20, 
                              fontSize: '10px',
                              bgcolor: '#fef2f2',
                              color: '#ef4444',
                              '& .MuiChip-label': { px: 1 }
                            }}
                          />
                        )}
                        {totalCount === 0 && (
                          <Typography variant="caption" color="text.disabled">
                            {t('annotation.noAnnotations', '暂无标注')}
                          </Typography>
                        )}
                      </>
                    ) : (
                      <Chip 
                        label={`${t('annotation.count', '标注')} ${archive.annotationCount}`}
                        size="small"
                        sx={{ 
                          height: 20, 
                          fontSize: '10px',
                          bgcolor: 'primary.50',
                          color: 'primary.main',
                          '& .MuiChip-label': { px: 1 }
                        }}
                      />
                    )}
                  </Box>
                  
                  {/* 时间 - 底部固定 */}
                  <Typography 
                    variant="caption" 
                    color="text.disabled" 
                    sx={{ mt: 'auto', pt: 1, display: 'block' }}
                  >
                    {formatTime(archive.timestamp)}
                  </Typography>
                </CardContent>
                
                <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                  <Tooltip title={t('common.delete', '删除')}>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(archive)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.export', '导出')}>
                    <IconButton
                      size="small"
                      color="primary"
                      disabled={exporting === archive.id}
                      onClick={(e) => handleSingleExport(archive, e)}
                    >
                      {exporting === archive.id ? (
                        <CircularProgress size={20} />
                      ) : (
                        <DownloadIcon />
                      )}
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
            )
          })}
        </Grid>
      )}
      
      {/* 删除确认对话框 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>{t('common.confirmDelete', '确认删除')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('annotation.deleteConfirm', '确定要删除这个标注存档吗？此操作不可撤销。')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            {t('common.cancel', '取消')}
          </Button>
          <Button onClick={handleDelete} color="error">
            {t('common.delete', '删除')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}


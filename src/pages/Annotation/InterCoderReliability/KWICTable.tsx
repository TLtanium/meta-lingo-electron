/**
 * AnnotationDetailsTable - 标注详情表组件
 * 
 * 展示所有标注单元：
 * - 以标注单位为中心显示上下文（上下各6个词）
 * - 标注单位加粗显示
 * - 点击查看全文上下文和各编码者标注情况
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  IconButton,
  Collapse,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  useTheme
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import WarningIcon from '@mui/icons-material/Warning'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import { useTranslation } from 'react-i18next'
import type { 
  ArchiveFile, 
  KWICItem,
  PositionDetails
} from '../../../api/reliability'
import { reliabilityApi } from '../../../api/reliability'

interface KWICTableProps {
  files: ArchiveFile[]
}

// 提取上下文中心词的辅助函数
function extractCenteredContext(
  leftContext: string, 
  annotationUnit: string, 
  rightContext: string,
  wordCount: number = 6
): { before: string; unit: string; after: string; hasMoreBefore: boolean; hasMoreAfter: boolean } {
  // 从左侧上下文提取最后N个词
  const leftText = leftContext.trim()
  const leftWords = leftText.split(/\s+/).filter(w => w)
  const beforeWords = leftWords.slice(-wordCount)
  const hasMoreBefore = leftWords.length > wordCount
  
  // 从右侧上下文提取前N个词
  const rightText = rightContext.trim()
  const rightWords = rightText.split(/\s+/).filter(w => w)
  const afterWords = rightWords.slice(0, wordCount)
  const hasMoreAfter = rightWords.length > wordCount
  
  return {
    before: beforeWords.join(' '),
    unit: annotationUnit,
    after: afterWords.join(' '),
    hasMoreBefore,
    hasMoreAfter
  }
}

// 根据标注率和标签一致性获取行颜色
function getRowColor(annotationRate: number, labelAgreement: boolean, isDark: boolean): { bg: string; hover: string } {
  if (annotationRate === 1 && labelAgreement) {
    // 100% 标注率且标签一致 - 绿色
    return isDark 
      ? { bg: 'rgba(76, 175, 80, 0.2)', hover: 'rgba(76, 175, 80, 0.3)' }
      : { bg: '#e8f5e9', hover: '#c8e6c9' }
  } else if (annotationRate === 1 && !labelAgreement) {
    // 100% 标注率但标签不一致 - 黄色
    return isDark
      ? { bg: 'rgba(255, 152, 0, 0.2)', hover: 'rgba(255, 152, 0, 0.3)' }
      : { bg: '#fff8e1', hover: '#ffecb3' }
  } else {
    // 有未标注的 - 红色
    return isDark
      ? { bg: 'rgba(244, 67, 54, 0.2)', hover: 'rgba(244, 67, 54, 0.3)' }
      : { bg: '#ffebee', hover: '#ffcdd2' }
  }
}

// 详情行组件
function DetailRow({ 
  item, 
  files, 
  open, 
  onToggle,
  onShowFullContext
}: { 
  item: KWICItem
  files: ArchiveFile[]
  open: boolean
  onToggle: () => void
  onShowFullContext: (item: KWICItem) => void
}) {
  const { t } = useTranslation()
  const theme = useTheme()
  const [details, setDetails] = useState<PositionDetails | null>(null)
  const [loading, setLoading] = useState(false)
  
  // 提取居中上下文
  const centeredContext = useMemo(() => 
    extractCenteredContext(item.left_context, item.annotation_unit, item.right_context, 6),
    [item]
  )
  
  // 获取行颜色
  const rowColor = useMemo(() => 
    getRowColor(item.annotation_rate, item.label_agreement, theme.palette.mode === 'dark'),
    [item.annotation_rate, item.label_agreement, theme.palette.mode]
  )
  
  // 加载详情
  useEffect(() => {
    if (open && !details) {
      setLoading(true)
      reliabilityApi.getPositionDetails(files, item.start_position, item.end_position)
        .then(response => {
          if (response.success && response.data) {
            setDetails(response.data)
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [open, details, files, item])
  
  // 获取非空标签用于显示
  const displayLabels = item.all_labels.filter(l => l)
  
  return (
    <>
      {/* 主行 */}
      <TableRow 
        sx={{ 
          '& > *': { borderBottom: 'unset' },
          bgcolor: rowColor.bg,
          cursor: 'pointer',
          '&:hover': { bgcolor: rowColor.hover }
        }}
        onClick={onToggle}
      >
        <TableCell sx={{ width: 40, p: 0.5 }}>
          <IconButton size="small">
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ width: 50 }} align="center">{item.row_number}</TableCell>
        <TableCell sx={{ width: 80 }} align="center">
          <Typography variant="body2" fontWeight={600}>
            {(item.annotation_rate * 100).toFixed(0)}%
          </Typography>
        </TableCell>
        <TableCell sx={{ width: 80 }} align="center">
          {item.annotation_rate === 1 && item.label_agreement ? (
            <CheckCircleIcon fontSize="small" color="success" />
          ) : item.annotation_rate === 1 ? (
            <WarningIcon fontSize="small" color="warning" />
          ) : (
            <CancelIcon fontSize="small" color="error" />
          )}
        </TableCell>
        <TableCell sx={{ width: 150 }}>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {displayLabels.length > 0 ? (
              [...new Set(displayLabels)].map((label, idx) => (
                <Chip 
                  key={idx}
                  label={label} 
                  size="small"
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">-</Typography>
            )}
          </Stack>
        </TableCell>
        <TableCell>
          <Typography variant="body2" component="span">
            {centeredContext.hasMoreBefore && (
              <span style={{ color: '#999' }}>... </span>
            )}
            {centeredContext.before && (
              <span style={{ color: '#666' }}>{centeredContext.before} </span>
            )}
            <strong style={{ 
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
              padding: '2px 4px',
              borderRadius: '3px'
            }}>
              {centeredContext.unit}
            </strong>
            {centeredContext.after && (
              <span style={{ color: '#666' }}> {centeredContext.after}</span>
            )}
            {centeredContext.hasMoreAfter && (
              <span style={{ color: '#999' }}> ...</span>
            )}
          </Typography>
        </TableCell>
      </TableRow>
      
      {/* 详情折叠行 */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 1 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : details ? (
                <Grid container spacing={2}>
                  {/* 一致性指标 */}
                  <Grid item xs={12} md={3}>
                    <Stack spacing={1}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          {t('reliability.annotationRate', '标注率')}
                        </Typography>
                        <Typography variant="h5" fontWeight={600}>
                          {(item.annotation_rate * 100).toFixed(0)}%
                        </Typography>
                      </Paper>
                      <Paper 
                        variant="outlined" 
                        sx={{ 
                          p: 1.5, 
                          textAlign: 'center',
                          bgcolor: item.annotation_rate === 1 && item.label_agreement 
                            ? (theme.palette.mode === 'dark' ? 'rgba(76, 175, 80, 0.2)' : 'success.50')
                            : item.annotation_rate === 1 
                              ? (theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.2)' : 'warning.50')
                              : (theme.palette.mode === 'dark' ? 'rgba(244, 67, 54, 0.2)' : 'error.50')
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {t('reliability.labelAgreement', '标签一致')}
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>
                          {item.annotation_rate === 1 && item.label_agreement ? (
                            <CheckCircleIcon color="success" />
                          ) : item.annotation_rate === 1 ? (
                            <WarningIcon color="warning" />
                          ) : (
                            <CancelIcon color="error" />
                          )}
                        </Box>
                      </Paper>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<FullscreenIcon />}
                        onClick={(e) => {
                          e.stopPropagation()
                          onShowFullContext(item)
                        }}
                      >
                        {t('reliability.viewFullContext', '查看全文')}
                      </Button>
                    </Stack>
                  </Grid>
                  
                  {/* 编码者详情表格 */}
                  <Grid item xs={12} md={9}>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('reliability.coderDetails', '各编码者标注情况')}
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? '#1e1e2e' : 'grey.100' }}>
                            <TableCell>{t('reliability.coder', '编码者')}</TableCell>
                            <TableCell>{t('reliability.status', '状态')}</TableCell>
                            <TableCell>{t('reliability.label', '标签')}</TableCell>
                            <TableCell>{t('reliability.text', '标注文本')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {details.details.map((detail, idx) => (
                            <TableRow 
                              key={idx}
                              sx={{
                                bgcolor: detail.annotated 
                                  ? (item.label_agreement
                                      ? (theme.palette.mode === 'dark' ? 'rgba(76, 175, 80, 0.15)' : 'success.50')
                                      : (theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.15)' : 'warning.50'))
                                  : (theme.palette.mode === 'dark' ? 'rgba(244, 67, 54, 0.15)' : 'error.50')
                              }}
                            >
                              <TableCell sx={{ fontWeight: 500 }}>{detail.coder_id}</TableCell>
                              <TableCell>
                                {detail.annotated ? (
                                  <Chip 
                                    label={t('reliability.annotated', '已标注')} 
                                    size="small" 
                                    color="success"
                                    sx={{ fontSize: '0.7rem' }}
                                  />
                                ) : (
                                  <Chip 
                                    label={t('reliability.notAnnotated', '未标注')} 
                                    size="small" 
                                    color="error"
                                    sx={{ fontSize: '0.7rem' }}
                                  />
                                )}
                              </TableCell>
                              <TableCell>{detail.label || '-'}</TableCell>
                              <TableCell>{detail.annotation_text || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>
                </Grid>
              ) : (
                <Alert severity="error">
                  {t('reliability.loadDetailsFailed', '加载详情失败')}
                </Alert>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

// 全文上下文对话框
function FullContextDialog({
  open,
  onClose,
  item,
  fullText
}: {
  open: boolean
  onClose: () => void
  item: KWICItem | null
  fullText: string
}) {
  const { t } = useTranslation()
  const theme = useTheme()
  const [beforeRange, setBeforeRange] = useState(100)
  const [afterRange, setAfterRange] = useState(100)
  const EXPAND_STEP = 100
  
  // 重置范围当 item 变化时
  useEffect(() => {
    if (item) {
      setBeforeRange(100)
      setAfterRange(100)
    }
  }, [item])
  
  if (!item) return null
  
  // 计算显示范围
  const start = Math.max(0, item.start_position - beforeRange)
  const end = Math.min(fullText.length, item.end_position + afterRange)
  
  const beforeText = fullText.slice(start, item.start_position)
  const unitText = fullText.slice(item.start_position, item.end_position)
  const afterText = fullText.slice(item.end_position, end)
  
  const canExpandBefore = start > 0
  const canExpandAfter = end < fullText.length
  
  const handleExpandBefore = () => {
    setBeforeRange(prev => Math.min(prev + EXPAND_STEP, item.start_position))
  }
  
  const handleExpandAfter = () => {
    setAfterRange(prev => Math.min(prev + EXPAND_STEP, fullText.length - item.end_position))
  }
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6">
            {t('reliability.fullContext', '全文上下文')}
          </Typography>
          <Chip 
            label={item.label} 
            size="small"
            sx={{ bgcolor: item.color, color: 'white' }}
          />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {/* 向上展开更多 */}
        {canExpandBefore && (
          <Box sx={{ textAlign: 'center', mb: 1 }}>
            <Button
              size="small"
              variant="text"
              onClick={handleExpandBefore}
              startIcon={<KeyboardArrowUpIcon />}
            >
              {t('reliability.showMoreBefore', '显示更多上文')}
            </Button>
          </Box>
        )}
        
        <Paper 
          variant="outlined" 
          sx={{ 
            p: 2, 
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.50',
            lineHeight: 1.8,
            fontSize: '1rem',
            maxHeight: 400,
            overflow: 'auto'
          }}
        >
          {start > 0 && <span style={{ color: '#999' }}>... </span>}
          <span style={{ color: '#666' }}>{beforeText}</span>
          <mark style={{ 
            backgroundColor: `${item.color}40`,
            padding: '2px 4px',
            borderRadius: '3px',
            fontWeight: 600
          }}>
            {unitText}
          </mark>
          <span style={{ color: '#666' }}>{afterText}</span>
          {end < fullText.length && <span style={{ color: '#999' }}> ...</span>}
        </Paper>
        
        {/* 向下展开更多 */}
        {canExpandAfter && (
          <Box sx={{ textAlign: 'center', mt: 1 }}>
            <Button
              size="small"
              variant="text"
              onClick={handleExpandAfter}
              startIcon={<KeyboardArrowDownIcon />}
            >
              {t('reliability.showMoreAfter', '显示更多下文')}
            </Button>
          </Box>
        )}
        
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('reliability.positionInfo', '位置')}: {item.start_position} - {item.end_position}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('reliability.contextRange', '上下文范围')}: -{beforeRange} / +{afterRange} {t('reliability.chars', '字符')}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close', '关闭')}</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function KWICTable({ files }: KWICTableProps) {
  const { t } = useTranslation()
  
  const [kwicItems, setKwicItems] = useState<KWICItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openRowId, setOpenRowId] = useState<number | null>(null)
  
  // 全文上下文对话框状态
  const [contextDialogOpen, setContextDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KWICItem | null>(null)
  const [fullText, setFullText] = useState('')
  
  // 分页
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  
  // 从文件中提取全文
  useEffect(() => {
    if (files.length > 0) {
      try {
        const content = JSON.parse(files[0].content)
        setFullText(content.text || '')
      } catch {
        setFullText('')
      }
    }
  }, [files])
  
  // 加载 KWIC 数据
  useEffect(() => {
    if (files.length >= 2) {
      setLoading(true)
      setError(null)
      
      reliabilityApi.generateKWIC(files, 50) // 获取更多上下文
        .then(response => {
          if (response.success && response.data) {
            setKwicItems(response.data)
          } else {
            setError(t('reliability.generateKWICFailed', '生成标注详情失败'))
          }
        })
        .catch(err => {
          console.error('KWIC error:', err)
          setError(t('reliability.generateKWICError', '生成标注详情出错'))
        })
        .finally(() => setLoading(false))
    }
  }, [files, t])
  
  // 处理行展开
  const handleRowToggle = (rowId: number) => {
    setOpenRowId(openRowId === rowId ? null : rowId)
  }
  
  // 显示全文上下文
  const handleShowFullContext = (item: KWICItem) => {
    setSelectedItem(item)
    setContextDialogOpen(true)
  }
  
  if (files.length < 2) {
    return (
      <Alert severity="info">
        {t('reliability.validateFirst', '请先验证数据')}
      </Alert>
    )
  }
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }
  
  if (error) {
    return <Alert severity="error">{error}</Alert>
  }
  
  // 当前页数据
  const currentPageItems = kwicItems.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  )
  
  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="body2" color="text.secondary">
          {t('reliability.clickRowToExpand', '点击行查看各编码者标注情况')}
        </Typography>
        <Chip 
          label={`${kwicItems.length} ${t('reliability.annotationUnits', '个标注单元')}`}
          color="primary"
          size="small"
        />
      </Stack>
      
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', width: 40, p: 0.5 }} />
              <TableCell sx={{ color: 'white', width: 50 }} align="center">
                #
              </TableCell>
              <TableCell sx={{ color: 'white', width: 80 }} align="center">
                {t('reliability.annotationRate', '标注率')}
              </TableCell>
              <TableCell sx={{ color: 'white', width: 80 }} align="center">
                {t('reliability.labelConsistency', '一致性')}
              </TableCell>
              <TableCell sx={{ color: 'white', width: 150 }}>
                {t('reliability.allLabels', '标签')}
              </TableCell>
              <TableCell sx={{ color: 'white' }}>
                {t('reliability.contextWithUnit', '上下文')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {currentPageItems.map((item) => (
              <DetailRow
                key={item.row_number}
                item={item}
                files={files}
                open={openRowId === item.row_number}
                onToggle={() => handleRowToggle(item.row_number)}
                onShowFullContext={handleShowFullContext}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <TablePagination
        component="div"
        count={kwicItems.length}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10))
          setPage(0)
        }}
        rowsPerPageOptions={[5, 10, 25, 50]}
        labelRowsPerPage={t('common.rowsPerPage', '每页')}
      />
      
      {/* 全文上下文对话框 */}
      <FullContextDialog
        open={contextDialogOpen}
        onClose={() => setContextDialogOpen(false)}
        item={selectedItem}
        fullText={fullText}
      />
    </>
  )
}

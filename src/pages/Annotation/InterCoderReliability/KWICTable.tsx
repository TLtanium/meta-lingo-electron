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
import DownloadIcon from '@mui/icons-material/Download'
import { useTranslation } from 'react-i18next'
import type {
  ArchiveFile,
  KWICItem,
  PositionDetails,
  ValidationSummary
} from '../../../api/reliability'
import { reliabilityApi } from '../../../api/reliability'

interface KWICTableProps {
  files: ArchiveFile[]
  dataSummary?: ValidationSummary | null
  includedLabels?: string[] | null
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
  onShowFullContext,
  includedLabels
}: {
  item: KWICItem
  files: ArchiveFile[]
  open: boolean
  onToggle: () => void
  onShowFullContext: (item: KWICItem) => void
  includedLabels?: string[] | null
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
      reliabilityApi.getPositionDetails(files, item.start_position, item.end_position, includedLabels)
        .then(response => {
          if (response.success && response.data) {
            setDetails(response.data)
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [open, details, files, item, includedLabels])
  
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
                              <TableCell>
                                {detail.labels && detail.labels.length > 0 ? (
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                    {detail.labels.map((lab, li) => (
                                      <Chip key={li} label={lab} size="small"
                                        sx={{ fontSize: '0.7rem', height: 20 }} />
                                    ))}
                                  </Stack>
                                ) : (detail.label || '-')}
                              </TableCell>
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

// CSV escape helper
function csvEsc(s: string): string {
  const str = String(s ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export default function KWICTable({ files, dataSummary, includedLabels }: KWICTableProps) {
  const { t } = useTranslation()

  const [kwicItems, setKwicItems] = useState<KWICItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openRowId, setOpenRowId] = useState<number | null>(null)
  const [exportingDetails, setExportingDetails] = useState(false)
  
  // 全文上下文对话框状态
  const [contextDialogOpen, setContextDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KWICItem | null>(null)
  const [fullText, setFullText] = useState('')
  
  // 分页
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  
  // 导出标注详情 CSV（词汇×层级纵向格式，直接解析存档文件，无 API 调用）
  const handleExportDetails = async () => {
    if (files.length === 0) return
    setExportingDetails(true)
    try {
      // ── 1. 解析所有存档文件 ──────────────────────────────────────
      interface ParsedAnn {
        text: string
        startPosition: number
        endPosition: number
        label: string
        labelPath: string
        layer: string  // 最近父类别（标注层级）
      }
      interface CoderData {
        coderId: string
        annotations: ParsedAnn[]
      }

      const coderDataList: CoderData[] = []
      let fullText = ''

      for (const file of files) {
        let content: any = {}
        try { content = JSON.parse(file.content) } catch { continue }
        if (!fullText && content.text) fullText = content.text as string

        const rawAnns: any[] = content.annotations || []
        const annotations: ParsedAnn[] = rawAnns
          .filter(ann =>
            ann.startPosition != null &&
            ann.endPosition != null &&
            !String(ann.id || '').startsWith('spacy-')
          )
          .map(ann => {
            const rawPath: string = (ann.labelPath || ann.label || '') as string
            const parts = rawPath.split('/').filter(Boolean)
            const layer = parts.length >= 2
              ? parts[parts.length - 2]
              : (parts[0] || (ann.label as string) || '')
            return {
              text: (ann.text || '') as string,
              startPosition: ann.startPosition as number,
              endPosition: ann.endPosition as number,
              label: (ann.label || '') as string,
              labelPath: rawPath,
              layer
            }
          })

        // 优先使用 coderName 字段（与后端一致），其次文件名
        const fileBaseName = file.name.replace(/\.[^/.]+$/, '').split(/[/\\]/).pop() || file.name
        const coderId = (content.coderName as string | undefined) || fileBaseName
        coderDataList.push({ coderId, annotations })
      }

      // ── 2. Tokenize（空白分词，保留字符位置） ───────────────────
      const tokens: { word: string; start: number; end: number }[] = []
      {
        const re = /\S+/g
        let m: RegExpExecArray | null
        while ((m = re.exec(fullText)) !== null) {
          tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length })
        }
      }

      // ── 3. 收集唯一层级（按首次出现位置排序） ──────────────────
      const layerFirstSeen = new Map<string, number>()
      for (const cd of coderDataList) {
        for (const ann of cd.annotations) {
          if (ann.layer && !layerFirstSeen.has(ann.layer)) {
            layerFirstSeen.set(ann.layer, ann.startPosition)
          }
        }
      }
      const layerOrder = [...layerFirstSeen.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([layer]) => layer)
      if (layerOrder.length === 0) layerOrder.push('标注')

      const coderIds = coderDataList.map(cd => cd.coderId)

      // ── 4. 生成 CSV ─────────────────────────────────────────────
      const rows: string[] = []

      // 元数据
      rows.push(csvEsc('编码者间标注详情（词汇纵向格式）'))
      rows.push(['框架', csvEsc(dataSummary?.framework || '')].join(','))
      rows.push(['编码者数', coderIds.length].join(','))
      rows.push(['编码者', ...coderIds.map(csvEsc)].join(','))
      rows.push(['标注层级', layerOrder.length, ...layerOrder.map(csvEsc)].join(','))
      rows.push(['总词数', tokens.length].join(','))
      rows.push(['导出时间', csvEsc(new Date().toLocaleString('zh-CN'))].join(','))
      rows.push('')
      rows.push(['说明', '一致=全员标注且标签相同', '不一致=全员标注但标签不同', '部分=部分人员标注', '均未标注=该层级无人标注'].join(','))
      rows.push('')

      // 表头
      rows.push(['词汇', '标注层级', ...coderIds.map(csvEsc), '一致情况', '讨论'].map(csvEsc).join(','))

      let agreeCount = 0, disagreeCount = 0, partialCount = 0, noneCount = 0

      for (const token of tokens) {
        // 检查任意编码者是否标注了该 token
        const hasAny = coderDataList.some(cd =>
          cd.annotations.some(a => a.startPosition <= token.start && a.endPosition >= token.end)
        )

        if (!hasAny) {
          // 无标注词汇：单行，层级留空
          rows.push([token.word, '', ...coderIds.map(() => ''), '均未标注', ''].map(csvEsc).join(','))
          noneCount++
          continue
        }

        // 有标注：按层级展开，每层一行
        for (const layer of layerOrder) {
          const coderLabels = coderDataList.map(cd => {
            const ann = cd.annotations.find(a =>
              a.layer === layer &&
              a.startPosition <= token.start &&
              a.endPosition >= token.end
            )
            return ann ? ann.label : ''
          })

          const nonEmpty = coderLabels.filter(l => l !== '')
          let agreement: string
          if (nonEmpty.length === 0) {
            agreement = '均未标注'
            noneCount++
          } else if (nonEmpty.length < coderIds.length) {
            const unique = [...new Set(nonEmpty)]
            agreement = unique.length === 1 ? '部分(一致)' : '部分(不一致)'
            partialCount++
          } else {
            const unique = [...new Set(nonEmpty)]
            agreement = unique.length === 1 ? '一致' : '不一致'
            if (unique.length === 1) agreeCount++; else disagreeCount++
          }

          rows.push([token.word, layer, ...coderLabels, agreement, ''].map(csvEsc).join(','))
        }
      }

      // 汇总
      rows.push('')
      rows.push(csvEsc('汇总'))
      rows.push(['一致', agreeCount].join(','))
      rows.push(['不一致', disagreeCount].join(','))
      rows.push(['部分标注', partialCount].join(','))
      rows.push(['均未标注（层级行）', noneCount].join(','))

      // ── 5. 下载 ─────────────────────────────────────────────────
      const csv = '﻿' + rows.join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `annotation_details_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export details error:', err)
    } finally {
      setExportingDetails(false)
    }
  }

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
      
      reliabilityApi.generateKWIC(files, 50, includedLabels) // 获取更多上下文，按标签筛选
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
  }, [files, t, includedLabels])
  
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
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={`${kwicItems.length} ${t('reliability.annotationUnits', '个标注单元')}`}
            color="primary"
            size="small"
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={exportingDetails ? <CircularProgress size={14} /> : <DownloadIcon />}
            onClick={handleExportDetails}
            disabled={exportingDetails || kwicItems.length === 0}
          >
            {exportingDetails
              ? t('reliability.exportingDetails', '导出中...')
              : t('reliability.exportDetails', '导出详情 CSV')}
          </Button>
        </Stack>
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
                includedLabels={includedLabels}
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

/**
 * AnnotationDataTable - 增强的标注数据表格组件
 *
 * 功能：
 * - 列排序（点击表头）
 * - 搜索筛选（标签/文本）
 * - 分页
 * - 三种导出格式：标注列表 / 统计表 / 全文纵向
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
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useTheme
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import DownloadIcon from '@mui/icons-material/Download'
import TableChartIcon from '@mui/icons-material/TableChart'
import BarChartIcon from '@mui/icons-material/BarChart'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import { useTranslation } from 'react-i18next'
import type { Annotation, SpacyToken, AnnotationRelation } from '../../../types'

interface AnnotationDataTableProps {
  annotations: Annotation[]
  relations?: AnnotationRelation[]
  archiveName: string
  excludeVideoAnnotations?: boolean
  originalText?: string
  spacyTokens?: SpacyToken[]
  frameworkName?: string
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

// CSV 安全转义
const csvEscape = (val: string): string => {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

// 下载 CSV 工具
const downloadCsv = (content: string, filename: string) => {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function AnnotationDataTable({
  annotations,
  relations = [],
  archiveName,
  excludeVideoAnnotations = false,
  originalText,
  spacyTokens,
  frameworkName: _frameworkName
}: AnnotationDataTableProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'

  // 状态
  const [order, setOrder] = useState<Order>('asc')
  const [orderBy, setOrderBy] = useState<OrderBy>('position')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null)

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

  const safeFileName = archiveName.replace(/[<>:"/\\|?*]/g, '_')

  // 导出格式 1: 标注列表 (原有格式)
  const handleExportAnnotationList = () => {
    setExportAnchorEl(null)

    // Build relation lookup: annotationId → comma-separated target texts
    const annIdToText = new Map(annotations.map(a => [a.id, a.text]))
    const relLookup = new Map<string, string[]>()
    for (const rel of relations) {
      const targetText = annIdToText.get(rel.targetId) || rel.targetId
      const existing = relLookup.get(rel.sourceId) || []
      existing.push(targetText)
      relLookup.set(rel.sourceId, existing)
    }
    const hasRelations = relations.length > 0

    const headers = ['#', t('annotation.label', '标签'), t('annotation.text', '文本'),
                     t('annotation.pos', '词性'), t('annotation.ner', '命名实体'),
                     t('annotation.position', '位置'), t('annotation.remark', '备注'),
                     ...(hasRelations ? ['→ 关联目标'] : [])]

    const rows = sortedData.map((ann, idx) => [
      String(idx + 1),
      csvEscape(ann.label),
      csvEscape(ann.text),
      ann.pos || '-',
      ann.entity || '-',
      String(ann.startPosition),
      ann.remark ? csvEscape(ann.remark) : '-',
      ...(hasRelations ? [csvEscape((relLookup.get(ann.id) || []).join('; ') || '-')] : [])
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    downloadCsv(csvContent, `${safeFileName}_annotations.csv`)
  }

  // 导出格式 2: 统计表
  const handleExportStatistics = () => {
    setExportAnchorEl(null)
    const total = baseData.length
    const counts: Record<string, number> = {}
    baseData.forEach(ann => {
      counts[ann.label] = (counts[ann.label] || 0) + 1
    })

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])

    const headers = [
      t('annotation.label', '标签'),
      t('annotation.exportCount', '数量'),
      t('annotation.exportPercentage', '占比')
    ]

    const rows = entries.map(([label, count]) => [
      csvEscape(label),
      String(count),
      `${(count / total * 100).toFixed(2)}%`
    ])

    // 汇总行
    rows.push([
      t('annotation.totalAnnotations', '总计'),
      String(total),
      '100.00%'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    downloadCsv(csvContent, `${safeFileName}_statistics.csv`)
  }

  // 导出格式 3: 全文纵向 (参考 annotation_demo.csv)
  const handleExportFullText = () => {
    setExportAnchorEl(null)

    // 获取所有唯一标签名
    const labelSet = new Set<string>()
    baseData.forEach(ann => labelSet.add(ann.label))
    const labels = Array.from(labelSet).sort()

    // 获取分词 tokens
    const tokens = spacyTokens && spacyTokens.length > 0
      ? spacyTokens
      : null

    if (!tokens && !originalText) {
      // 无法构建全文，回退到标注列表导出
      handleExportAnnotationList()
      return
    }

    // 构建 token 列表（基于 spacy tokens 或简单分词）
    interface TokenInfo {
      text: string
      lemma: string
      pos: string
      ner: string
      start: number
      end: number
    }

    const tokenList: TokenInfo[] = tokens
      ? tokens.map(tok => ({
          text: tok.text,
          lemma: tok.lemma || tok.text,
          pos: tok.pos || '',
          ner: '',
          start: tok.start,
          end: tok.end
        }))
      : originalText!.split(/(\s+)/).reduce<TokenInfo[]>((acc, part) => {
          if (!part) return acc
          const prevEnd = acc.length > 0 ? acc[acc.length - 1].end : 0
          const start = originalText!.indexOf(part, prevEnd)
          acc.push({
            text: part,
            lemma: part,
            pos: '',
            ner: '',
            start: start >= 0 ? start : prevEnd,
            end: (start >= 0 ? start : prevEnd) + part.length
          })
          return acc
        }, [])

    // 填充 NER 信息
    if (tokens) {
      // 从 spacy entities 或 annotations 中提取 NER
      baseData.forEach(ann => {
        if (ann.entity && ann.entity !== '-') {
          tokenList.forEach(tok => {
            if (tok.start >= ann.startPosition && tok.end <= ann.endPosition) {
              tok.ner = ann.entity!
            }
          })
        }
      })
    }

    // 为每个 token 计算每个 label 的覆盖情况
    // 对每个标注，找到覆盖的 token 范围，标记 ✓
    const tokenLabelMap: Map<number, Set<string>> = new Map()
    tokenList.forEach((_, idx) => tokenLabelMap.set(idx, new Set()))

    baseData.forEach(ann => {
      for (let i = 0; i < tokenList.length; i++) {
        const tok = tokenList[i]
        // token 与标注有交叉就算覆盖
        if (tok.end > ann.startPosition && tok.start < ann.endPosition) {
          tokenLabelMap.get(i)!.add(ann.label)
        }
      }
    })

    // 构建 CSV
    const headers = [
      'article_id',
      'sentence_id',
      'word',
      'lemma',
      'pos',
      'ner',
      ...labels
    ]

    // 分句：基于 spacy 的 sentence boundaries 或简单按标点分句
    let sentenceId = 1
    const rows: string[][] = []

    for (let i = 0; i < tokenList.length; i++) {
      const tok = tokenList[i]

      // 跳过纯空白 token
      if (tok.text.trim() === '') continue

      const labelChecks = labels.map(label =>
        tokenLabelMap.get(i)!.has(label) ? '✓' : ''
      )

      rows.push([
        csvEscape(safeFileName),
        String(sentenceId),
        csvEscape(tok.text),
        csvEscape(tok.lemma),
        tok.pos || '',
        tok.ner || '',
        ...labelChecks
      ])

      // 遇到句末标点时递增句号
      if (tok.text.match(/[.!?。！？]/)) {
        sentenceId++
      }
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    downloadCsv(csvContent, `${safeFileName}_fulltext.csv`)
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
          onClick={(e) => setExportAnchorEl(e.currentTarget)}
        >
          {t('annotation.exportCsv', '导出CSV')}
        </Button>

        <Menu
          anchorEl={exportAnchorEl}
          open={Boolean(exportAnchorEl)}
          onClose={() => setExportAnchorEl(null)}
        >
          <MenuItem onClick={handleExportAnnotationList}>
            <ListItemIcon><TableChartIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('annotation.exportAnnotationList', '标注列表')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleExportStatistics}>
            <ListItemIcon><BarChartIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('annotation.exportStatistics', '统计表')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleExportFullText}>
            <ListItemIcon><ViewColumnIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('annotation.exportFullText', '全文纵向表')}</ListItemText>
          </MenuItem>
        </Menu>
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
              {relations.length > 0 && (
                <TableCell sx={{ ...headerCellSx, textAlign: 'center' }}>关联</TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((ann, idx) => {
              // Build target label chip for this annotation's outgoing relations
              const outgoing = relations.filter(r => r.sourceId === ann.id)
              const annIdToLabel = new Map(annotations.map(a => [a.id, { text: a.text, color: a.color }]))
              return (
                <TableRow
                  key={ann.id}
                  data-annotation-row={ann.id}
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
                {relations.length > 0 && (
                  <TableCell sx={bodyCellSx} align="center">
                    {outgoing.length > 0 ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="center">
                        {outgoing.map(rel => {
                          const tgt = annIdToLabel.get(rel.targetId)
                          return (
                            <Tooltip key={rel.id} title={`→ ${tgt?.text || rel.targetId}`}>
                              <Chip
                                label={`→ ${tgt?.text ? (tgt.text.length > 8 ? tgt.text.slice(0, 8) + '…' : tgt.text) : rel.targetId.slice(0, 6)}`}
                                size="small"
                                sx={{ height: 18, fontSize: 10, bgcolor: `${tgt?.color || '#8a96af'}30`, color: tgt?.color || '#8a96af' }}
                              />
                            </Tooltip>
                          )
                        })}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.disabled">-</Typography>
                    )}
                  </TableCell>
                )}
              </TableRow>
              )
            })}
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

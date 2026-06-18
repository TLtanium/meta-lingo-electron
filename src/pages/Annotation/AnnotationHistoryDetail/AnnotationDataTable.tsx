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
import type { Annotation, SpacyToken, AnnotationRelation, AnnotationGroup } from '../../../types'
import { countAnnotationUnits, buildGroupNumberMap } from '../../../utils/annotationGroups'

interface AnnotationDataTableProps {
  annotations: Annotation[]
  relations?: AnnotationRelation[]
  groups?: AnnotationGroup[]
  archiveName: string
  excludeVideoAnnotations?: boolean
  originalText?: string
  spacyTokens?: SpacyToken[]
  frameworkName?: string
  /** 编码者名字（作为「标注列表」纵向导出中编码者列的表头） */
  coderName?: string
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

/**
 * 从标注的 labelPath 推导其「标注层级」（标签所在的上层分组名）。
 * 框架树按 label → tier → label → … → leaf(label) 交替：
 * - 手动标注 labelPath 用 '/' 分隔且**包含** tier 节点
 *   （如 `metaphor/SYSTEM-TYPE/markers/MARKERS-TYPE/mrw/MRW-TYPE/indirect`），
 *   leaf 的「层级」= 其祖父 label 节点 = 倒数第 3 段（'mrw'）；
 * - 自动标注 labelPath 用 ' > ' 分隔且为**纯 label** 面包屑
 *   （如 `metaphor > mipvu > markers > mrw > indirect`），层级 = 父 label = 倒数第 2 段。
 * 无法推导时回退为标签自身。
 */
const deriveTier = (labelPath: string | undefined, label: string): string => {
  if (!labelPath) return label
  if (labelPath.includes('>')) {
    const segs = labelPath.split('>').map(s => s.trim()).filter(Boolean)
    return segs.length >= 2 ? segs[segs.length - 2] : (segs[0] || label)
  }
  const segs = labelPath.split('/').map(s => s.trim()).filter(Boolean)
  if (segs.length >= 3) return segs[segs.length - 3]
  if (segs.length === 2) return segs[0]
  return segs[0] || label
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
  groups = [],
  archiveName,
  excludeVideoAnnotations = false,
  originalText,
  spacyTokens,
  frameworkName: _frameworkName,
  coderName
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

  // Group lookup: annotationId → group number (1-based)
  const groupMap = useMemo(() => {
    const map = new Map<string, number>()
    groups.forEach((g, idx) => {
      g.annotationIds.forEach(id => map.set(id, idx + 1))
    })
    return map
  }, [groups])

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

  // 导出格式 1: 标注列表（纵向逐词 × 已标注层级；参考 mipvu_annotator 的 fulltext 格式）
  // - 每个词都成行，未标注词的编码者列留空（不是只列出标注）
  // - 列：词序 / 原文行号 / 词汇 / 词性 / 命名实体 / 位置 / 标注层级 / <编码者名> / 备注 [ / → 关联目标]
  // - 「标注层级」仅包含文本中实际标注过的层级；用了 N 个层级，则每个词 N 行
  const handleExportAnnotationList = () => {
    setExportAnchorEl(null)

    // 1) 分词：spacy tokens 优先，否则按空白切分原文
    interface Tok { text: string; pos: string; ner: string; start: number; end: number }
    const tokenList: Tok[] = (spacyTokens && spacyTokens.length > 0)
      ? spacyTokens.map(tk => ({ text: tk.text, pos: tk.pos || '', ner: '', start: tk.start, end: tk.end }))
      : (originalText
          ? originalText.split(/(\s+)/).reduce<Tok[]>((acc, part) => {
              if (!part) return acc
              const prevEnd = acc.length > 0 ? acc[acc.length - 1].end : 0
              const start = originalText.indexOf(part, prevEnd)
              const s = start >= 0 ? start : prevEnd
              acc.push({ text: part, pos: '', ner: '', start: s, end: s + part.length })
              return acc
            }, [])
          : [])

    // 关联目标查找：annId → 目标文本数组
    const annIdToText = new Map(annotations.map(a => [a.id, a.text]))
    const relLookup = new Map<string, string[]>()
    for (const rel of relations) {
      const targetText = annIdToText.get(rel.targetId) || rel.targetId
      const existing = relLookup.get(rel.sourceId) || []
      existing.push(targetText)
      relLookup.set(rel.sourceId, existing)
    }
    const hasRelations = relations.length > 0
    const groupNumMap = buildGroupNumberMap(groups)  // annId → 1-based 词组序号
    const hasGroups = groups.length > 0
    const coder = (coderName && coderName.trim()) ? coderName.trim() : t('annotation.exportCoder1', '编码者1')

    // 列顺序：… 标注层级 / 编码者 / [词组] / [→ 关联目标] / 备注（备注始终最右）
    const groupHeader = t('annotation.exportGroup', '词组')

    // 无法分词（既无 token 也无原文）→ 回退为逐条标注简表
    if (tokenList.length === 0) {
      const headers = ['#', t('annotation.label', '标签'), t('annotation.text', '文本'),
                       t('annotation.pos', '词性'), t('annotation.ner', '命名实体'),
                       t('annotation.position', '位置'), t('annotation.exportTier', '标注层级'),
                       ...(hasGroups ? [groupHeader] : []),
                       ...(hasRelations ? ['→ 关联目标'] : []),
                       t('annotation.remark', '备注')]
      const rows = sortedData.map((ann, idx) => [
        String(idx + 1), csvEscape(ann.label), csvEscape(ann.text), ann.pos || '-', ann.entity || '-',
        String(ann.startPosition), csvEscape(deriveTier(ann.labelPath, ann.label)),
        ...(hasGroups ? [groupNumMap.has(ann.id) ? String(groupNumMap.get(ann.id)) : ''] : []),
        ...(hasRelations ? [csvEscape((relLookup.get(ann.id) || []).join('; ') || '-')] : []),
        ann.remark ? csvEscape(ann.remark) : '-',
      ])
      downloadCsv([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), `${safeFileName}_annotations.csv`)
      return
    }

    // ── 性能优化：先把每条标注的「层级」算一次，再用二分定位它覆盖的 token 区间，
    //    O(标注数 × 覆盖词数 + 词数 × 层级数)，避免对每个 词×层级 都全量 filter+重算层级。

    // 每条标注的层级只推导一次
    const annTiers = baseData.map(ann => deriveTier(ann.labelPath, ann.label))

    // 二分：返回 [s,e) 字符区间覆盖的 token 索引区间 [lo,hi)（token 按 start/end 升序、互不重叠）
    const n = tokenList.length
    const coveredRange = (s: number, e: number): [number, number] => {
      let lo = 0, hi = n
      while (lo < hi) { const m = (lo + hi) >> 1; if (tokenList[m].end > s) hi = m; else lo = m + 1 }
      let j = lo
      while (j < n && tokenList[j].start < e) j++
      return [lo, j]
    }

    // NER 填充（token 完全落在标注范围内）
    for (let a = 0; a < baseData.length; a++) {
      const ann = baseData[a]
      if (!ann.entity || ann.entity === '-') continue
      const [lo, hi] = coveredRange(ann.startPosition, ann.endPosition)
      for (let i = lo; i < hi; i++) {
        if (tokenList[i].start >= ann.startPosition && tokenList[i].end <= ann.endPosition) tokenList[i].ner = ann.entity
      }
    }

    // 已标注层级集合（按首次出现位置排序）；无标注时用单个空层级，保证每词仍成行
    const tierFirstPos = new Map<string, number>()
    for (let a = 0; a < baseData.length; a++) {
      const tier = annTiers[a]
      const prev = tierFirstPos.get(tier)
      if (prev === undefined || baseData[a].startPosition < prev) tierFirstPos.set(tier, baseData[a].startPosition)
    }
    const sortedTiers = Array.from(tierFirstPos.keys()).sort((a, b) => tierFirstPos.get(a)! - tierFirstPos.get(b)!)
    const usedTiers = sortedTiers.length > 0 ? sortedTiers : ['']
    const T = usedTiers.length
    const tierIndex = new Map(usedTiers.map((tr, i) => [tr, i]))

    // 逐 token × 层级的聚合桶：遍历标注一次填充（cells[tokenIdx*T + tierIdx]）
    interface Cell { labels: string[]; remarks: string[]; groups: string[]; rels: string[] }
    const cells: (Cell | undefined)[] = new Array(n * T)
    for (let a = 0; a < baseData.length; a++) {
      const ann = baseData[a]
      const ti = tierIndex.get(annTiers[a])
      if (ti === undefined) continue
      const gn = groupNumMap.get(ann.id)
      const rels = relLookup.get(ann.id)
      const [lo, hi] = coveredRange(ann.startPosition, ann.endPosition)
      for (let i = lo; i < hi; i++) {
        const k = i * T + ti
        let c = cells[k]
        if (!c) { c = { labels: [], remarks: [], groups: [], rels: [] }; cells[k] = c }
        c.labels.push(ann.label)
        if (ann.remark) c.remarks.push(ann.remark)
        if (hasGroups && gn !== undefined) c.groups.push(String(gn))
        if (hasRelations && rels) c.rels.push(...rels)
      }
    }

    // 行号：统计 token.start 之前的换行数 + 1（无原文则留空）
    const newlineIdx: number[] = []
    if (originalText) for (let i = 0; i < originalText.length; i++) if (originalText[i] === '\n') newlineIdx.push(i)
    const lineNoFor = (pos: number): string => {
      if (!originalText) return ''
      let lo = 0, hi = newlineIdx.length
      while (lo < hi) { const mid = (lo + hi) >> 1; if (newlineIdx[mid] < pos) lo = mid + 1; else hi = mid }
      return String(lo + 1)
    }

    const headers = [
      t('annotation.exportWordSeq', '词序'),
      t('annotation.exportLineNo', '原文行号'),
      t('annotation.exportWord', '词汇'),
      t('annotation.pos', '词性'),
      t('annotation.ner', '命名实体'),
      t('annotation.position', '位置'),
      t('annotation.exportTier', '标注层级'),
      csvEscape(coder),
      ...(hasGroups ? [groupHeader] : []),
      ...(hasRelations ? ['→ 关联目标'] : []),
      t('annotation.remark', '备注'),
    ]

    const rows: string[][] = []
    let wordSeq = 0
    for (let i = 0; i < n; i++) {
      const tk = tokenList[i]
      if (tk.text.trim() === '') continue
      wordSeq++
      const ln = lineNoFor(tk.start)
      for (let ti = 0; ti < T; ti++) {
        const c = cells[i * T + ti]
        const labelVal = c ? c.labels.join(', ') : ''
        const groupVal = c && c.groups.length ? Array.from(new Set(c.groups)).join(', ') : ''
        const relVal = c && c.rels.length ? c.rels.join('; ') : ''
        const remarkVal = c && c.remarks.length ? c.remarks.join('; ') : ''
        rows.push([
          String(wordSeq), ln, csvEscape(tk.text), tk.pos || '', tk.ner || '',
          String(tk.start), csvEscape(usedTiers[ti]), labelVal ? csvEscape(labelVal) : '',
          ...(hasGroups ? [groupVal ? csvEscape(groupVal) : ''] : []),
          ...(hasRelations ? [relVal ? csvEscape(relVal) : ''] : []),
          remarkVal ? csvEscape(remarkVal) : '',
        ])
      }
    }

    downloadCsv([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), `${safeFileName}_annotations.csv`)
  }

  // 导出格式 2: 统计表（词组计为一个单位：每个词组仅以首个成员计入其标签）
  const handleExportStatistics = () => {
    setExportAnchorEl(null)
    const { total, byLabel } = countAnnotationUnits(baseData, groups)
    const entries = Array.from(byLabel.entries()).sort((a, b) => b[1] - a[1])

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

    // 二分：返回 [s,e) 覆盖的 token 索引区间 [lo,hi)（token 按 start/end 升序、互不重叠）
    const n = tokenList.length
    const coveredRange = (s: number, e: number): [number, number] => {
      let lo = 0, hi = n
      while (lo < hi) { const m = (lo + hi) >> 1; if (tokenList[m].end > s) hi = m; else lo = m + 1 }
      let j = lo
      while (j < n && tokenList[j].start < e) j++
      return [lo, j]
    }

    // 填充 NER 信息（token 完全落在标注范围内）
    for (let a = 0; a < baseData.length; a++) {
      const ann = baseData[a]
      if (!ann.entity || ann.entity === '-') continue
      const [lo, hi] = coveredRange(ann.startPosition, ann.endPosition)
      for (let i = lo; i < hi; i++) {
        if (tokenList[i].start >= ann.startPosition && tokenList[i].end <= ann.endPosition) tokenList[i].ner = ann.entity
      }
    }

    // 词组序号 + 关联目标查找（每条标注算一次）
    const groupNumMap = buildGroupNumberMap(groups)
    const hasGroups = groups.length > 0
    const annIdToText = new Map(annotations.map(a => [a.id, a.text]))
    const relLookup = new Map<string, string[]>()
    for (const rel of relations) {
      const targetText = annIdToText.get(rel.targetId) || rel.targetId
      const existing = relLookup.get(rel.sourceId) || []
      existing.push(targetText)
      relLookup.set(rel.sourceId, existing)
    }
    const hasRelations = relations.length > 0

    // 逐 token 聚合：标签集合 / 词组序号 / 关联目标（遍历标注一次 + 二分定位，避免 O(标注×词) 全扫）
    const tokenLabels: Set<string>[] = tokenList.map(() => new Set())
    const tokenGroups: Set<string>[] = hasGroups ? tokenList.map(() => new Set()) : []
    const tokenRels: Set<string>[] = hasRelations ? tokenList.map(() => new Set()) : []
    for (let a = 0; a < baseData.length; a++) {
      const ann = baseData[a]
      const gn = groupNumMap.get(ann.id)
      const rels = relLookup.get(ann.id)
      const [lo, hi] = coveredRange(ann.startPosition, ann.endPosition)
      for (let i = lo; i < hi; i++) {
        tokenLabels[i].add(ann.label)
        if (hasGroups && gn !== undefined) tokenGroups[i].add(String(gn))
        if (hasRelations && rels) for (const r of rels) tokenRels[i].add(r)
      }
    }

    // 构建 CSV（标签 ✓ 列之后追加 词组 / → 关联目标 列）
    const headers = [
      'article_id', 'sentence_id', 'word', 'lemma', 'pos', 'ner',
      ...labels,
      ...(hasGroups ? [t('annotation.exportGroup', '词组')] : []),
      ...(hasRelations ? ['→ 关联目标'] : []),
    ]

    // 分句：简单按句末标点递增句号
    let sentenceId = 1
    const rows: string[][] = []
    for (let i = 0; i < n; i++) {
      const tok = tokenList[i]
      if (tok.text.trim() === '') continue  // 跳过纯空白 token

      const labelChecks = labels.map(label => tokenLabels[i].has(label) ? '✓' : '')
      const groupVal = hasGroups ? Array.from(tokenGroups[i]).join(', ') : ''
      const relVal = hasRelations ? Array.from(tokenRels[i]).join('; ') : ''

      rows.push([
        csvEscape(safeFileName), String(sentenceId), csvEscape(tok.text), csvEscape(tok.lemma),
        tok.pos || '', tok.ner || '', ...labelChecks,
        ...(hasGroups ? [groupVal ? csvEscape(groupVal) : ''] : []),
        ...(hasRelations ? [relVal ? csvEscape(relVal) : ''] : []),
      ])

      if (tok.text.match(/[.!?。！？]/)) sentenceId++
    }

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                    {groupMap.has(ann.id) && (
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 16, height: 16, borderRadius: '50%',
                          bgcolor: 'white',
                          border: `1.5px solid ${ann.color || '#2196F3'}`,
                          fontSize: '8px', color: ann.color || '#2196F3',
                          fontWeight: 700, lineHeight: 1, flexShrink: 0,
                        }}
                        title={`Group ${groupMap.get(ann.id)}`}
                      >
                        {groupMap.get(ann.id)}
                      </Box>
                    )}
                  </Box>
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

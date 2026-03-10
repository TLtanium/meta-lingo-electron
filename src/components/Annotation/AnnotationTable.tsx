/**
 * AnnotationTable Component
 * Table view of all annotations with POS and NER columns
 *
 * Features:
 * - List all annotations with details
 * - Display POS (Part of Speech) from SpaCy data
 * - Display NER (Named Entity Recognition) from SpaCy data
 * - Edit remark for each annotation
 * - Delete annotations (via dropdown menu)
 * - Cross-link to collocation / word sketch / N-gram analysis
 * - Highlight annotation on hover or click
 * - Auto-width columns based on content
 */

import { useState, useMemo, useRef } from 'react'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Tooltip,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import LinkIcon from '@mui/icons-material/Link'
import JoinInnerIcon from '@mui/icons-material/JoinInner'
import HubIcon from '@mui/icons-material/Hub'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import CategoryIcon from '@mui/icons-material/Category'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import type { Annotation } from '../../types'
import type { CrossLinkParams, TabType } from '../../types'

// SpaCy data interfaces
interface SpacyToken {
  text: string
  start: number
  end: number
  pos: string
  tag: string
  lemma: string
}

interface SpacyEntity {
  text: string
  start: number
  end: number
  label: string
}

interface AnnotationTableProps {
  annotations: Annotation[]
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<Annotation>) => void
  onHighlight?: (id: string | null) => void
  highlightedId?: string | null
  spacyTokens?: SpacyToken[]
  spacyEntities?: SpacyEntity[]
  showVideoColumns?: boolean  // 是否显示视频相关列（起始帧、总帧数）
  // Cross-link props
  corpusId?: string
  textIds?: string[] | 'all'
  selectionMode?: 'all' | 'selected' | 'tags'
  selectedTags?: string[]
  // Row selection
  onSelect?: (id: string | null) => void
  selectedId?: string | null
  /** When true, show a direct X delete button instead of MoreVert dropdown menu */
  directDeleteOnly?: boolean
}

/**
 * Find POS tags for a given text range
 */
function findPosForRange(start: number, end: number, tokens: SpacyToken[]): string {
  const matching = tokens.filter(t => t.start >= start && t.end <= end)
  if (matching.length === 0) return '-'

  const uniquePos = [...new Set(matching.map(t => t.pos))]
  if (uniquePos.length > 1) return 'Mul'
  return uniquePos[0]
}

/**
 * Find entity label for a given text range
 */
function findEntityForRange(start: number, end: number, entities: SpacyEntity[]): string {
  const matching = entities.filter(e =>
    (e.start >= start && e.start < end) ||
    (e.end > start && e.end <= end) ||
    (e.start <= start && e.end >= end)
  )
  if (matching.length === 0) return '-'

  const uniqueLabels = [...new Set(matching.map(e => e.label))]
  if (uniqueLabels.length > 1) return 'Mul'
  return uniqueLabels[0]
}

/**
 * Get color for POS tag
 */
function getPosColor(pos: string): string {
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

/**
 * Get color for entity label
 */
function getEntityColor(label: string): string {
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

// Common cell styles - will be customized per theme in component
const getHeaderCellSx = (isDarkMode: boolean) => ({
  bgcolor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#f5f5f5',
  fontWeight: 600,
  borderBottom: `2px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : '#ddd'}`,
  fontSize: '12px',
  px: 1.5,
  py: 1,
  whiteSpace: 'nowrap',
  textAlign: 'center'
})

const getBodyCellSx = (isDarkMode: boolean) => ({
  fontSize: '12px',
  borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : '#eee'}`,
  px: 1.5,
  py: 0.75,
  whiteSpace: 'nowrap',
  textAlign: 'center',
  verticalAlign: 'middle'
})

export default function AnnotationTable({
  annotations,
  onDelete,
  onUpdate,
  onHighlight,
  highlightedId,
  spacyTokens = [],
  spacyEntities = [],
  showVideoColumns = false,
  corpusId,
  textIds,
  selectionMode = 'all',
  selectedTags,
  onSelect,
  selectedId,
  directDeleteOnly = false
}: AnnotationTableProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const headerCellSx = getHeaderCellSx(isDarkMode)
  const bodyCellSx = getBodyCellSx(isDarkMode)
  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [remarkText, setRemarkText] = useState('')

  // Dropdown action menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuAnn, setMenuAnn] = useState<Annotation | null>(null)
  // Pending action executed after menu exit transition (same pattern as WordActionMenu)
  const pendingActionRef = useRef<(() => void) | null>(null)
  const { openTab } = useTabStore()

  // 过滤 SpaCy 标注
  const displayAnnotations = useMemo(() =>
    annotations.filter(a => !a.id.startsWith('spacy-')),
    [annotations]
  )

  // Calculate POS and NER for each annotation
  const annotationsWithSpacy = useMemo(() => {
    return displayAnnotations.map(ann => ({
      ...ann,
      pos: ann.pos || findPosForRange(ann.startPosition, ann.endPosition, spacyTokens),
      entity: ann.entity || findEntityForRange(ann.startPosition, ann.endPosition, spacyEntities)
    }))
  }, [displayAnnotations, spacyTokens, spacyEntities])

  // 表头排序
  type OrderBy = 'label' | 'text' | 'pos' | 'entity' | 'position' | 'startFrame' | 'totalFrames'
  const [orderBy, setOrderBy] = useState<OrderBy>('position')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const handleSort = (property: OrderBy) => {
    const isAsc = orderBy === property && order === 'asc'
    setOrder(isAsc ? 'desc' : 'asc')
    setOrderBy(property)
  }
  const sortedAnnotations = useMemo(() => {
    return [...annotationsWithSpacy].sort((a, b) => {
      let aVal: string | number | undefined
      let bVal: string | number | undefined
      switch (orderBy) {
        case 'label':
          aVal = (a.label || '').toLowerCase()
          bVal = (b.label || '').toLowerCase()
          break
        case 'text':
          aVal = (a.text || '').toLowerCase()
          bVal = (b.text || '').toLowerCase()
          break
        case 'pos':
          aVal = (a.pos || '').toLowerCase()
          bVal = (b.pos || '').toLowerCase()
          break
        case 'entity':
          aVal = (a.entity || '').toLowerCase()
          bVal = (b.entity || '').toLowerCase()
          break
        case 'position':
          aVal = a.startPosition
          bVal = b.startPosition
          break
        case 'startFrame':
          aVal = a.frameNumber ?? -1
          bVal = b.frameNumber ?? -1
          break
        case 'totalFrames':
          aVal = a.frameCount ?? -1
          bVal = b.frameCount ?? -1
          break
        default:
          return 0
      }
      if (aVal === bVal) return 0
      const cmp = typeof aVal === 'string' ? (aVal < bVal ? -1 : 1) : (aVal < bVal ? -1 : 1)
      return order === 'asc' ? cmp : -cmp
    })
  }, [annotationsWithSpacy, orderBy, order])

  const handleOpenRemark = (annotation: Annotation) => {
    setEditingAnnotation(annotation)
    setRemarkText(annotation.remark || '')
    setRemarkDialogOpen(true)
  }

  const handleSaveRemark = () => {
    if (editingAnnotation) {
      onUpdate(editingAnnotation.id, { remark: remarkText })
    }
    setRemarkDialogOpen(false)
    setEditingAnnotation(null)
  }

  const handleMouseEnter = (id: string) => {
    onHighlight?.(id)
  }

  const handleMouseLeave = () => {
    onHighlight?.(null)
  }

  const handleRowClick = (id: string) => {
    onSelect?.(selectedId === id ? null : id)
  }

  // Dropdown menu handlers
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, ann: Annotation) => {
    event.stopPropagation()
    setMenuAnchor(event.currentTarget)
    setMenuAnn(ann)
  }

  const handleMenuClose = () => {
    setMenuAnchor(null)
  }

  const handleMenuExited = () => {
    if (pendingActionRef.current) {
      pendingActionRef.current()
      pendingActionRef.current = null
    }
  }

  const buildCrossLinkParams = (ann: Annotation): CrossLinkParams => ({
    searchWord: ann.text || ann.label,
    corpusId: corpusId || '',
    textIds: textIds || 'all',
    selectionMode,
    selectedTags,
    autoSearch: true,
    sourceModule: 'metaphor'  // annotation module
  })

  const handleOpenCollocation = () => {
    if (!menuAnn) return
    const params = buildCrossLinkParams(menuAnn)
    const title = `${t('collocation.title', '搭配分析')} - ${menuAnn.text || menuAnn.label}`
    pendingActionRef.current = () => {
      openTab({ type: 'collocation' as TabType, title, props: { crossLinkParams: { ...params, targetSubTab: 0, ignoreCase: true } } })
    }
    handleMenuClose()
  }

  const handleOpenCollocationAnalysis = () => {
    if (!menuAnn) return
    const params = buildCrossLinkParams(menuAnn)
    const title = `${t('wordsketch.collocationAnalysisTab', '搭配分析')} - ${menuAnn.text || menuAnn.label}`
    pendingActionRef.current = () => {
      openTab({ type: 'wordsketch' as TabType, title, props: { crossLinkParams: { ...params, targetSubTab: 0 } } })
    }
    handleMenuClose()
  }

  const handleOpenWordSketch = () => {
    if (!menuAnn) return
    const params = buildCrossLinkParams(menuAnn)
    const title = `${t('wordsketch.title', '词图分析')} - ${menuAnn.text || menuAnn.label}`
    pendingActionRef.current = () => {
      openTab({ type: 'wordsketch' as TabType, title, props: { crossLinkParams: { ...params, targetSubTab: 1 } } })
    }
    handleMenuClose()
  }

  const handleOpenNgram = () => {
    if (!menuAnn) return
    const params = buildCrossLinkParams(menuAnn)
    const title = `${t('ngram.title', 'N-gram分析')} - ${menuAnn.text || menuAnn.label}`
    pendingActionRef.current = () => {
      openTab({
        type: 'ngram' as TabType,
        title,
        props: {
          crossLinkParams: {
            ...params,
            ngramValues: [2, 3, 4],        // Bigram, Trigram, 4-gram
            ngramSearchType: 'contains'    // 包含
          }
        }
      })
    }
    handleMenuClose()
  }

  const handleOpenSemanticDomain = () => {
    if (!menuAnn) return
    const params = buildCrossLinkParams(menuAnn)
    const word = menuAnn.text || menuAnn.label
    const title = `${t('semantic.title', '语义分析')} - ${word}`
    pendingActionRef.current = () => {
      openTab({
        type: 'semantic' as TabType,
        title,
        props: {
          crossLinkParams: {
            ...params,
            semanticResultMode: 'domain',
            semanticSearchType: 'contains',
            semanticSearchValue: word
          }
        }
      })
    }
    handleMenuClose()
  }

  const handleDeleteFromMenu = () => {
    if (!menuAnn) return
    const annId = menuAnn.id
    handleMenuClose()
    // Execute delete directly (no need to defer)
    onDelete(annId)
  }

  const hasCrossLinkProps = !!(corpusId && textIds)

  if (displayAnnotations.length === 0) {
    return (
      <TableContainer
        component={Paper}
        sx={{
          bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#FAFAFA',
          border: '1px solid',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'divider',
          overflowX: 'auto'
        }}
      >
        <Table size="small" sx={{ minWidth: 'max-content' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>#</TableCell>
              <TableCell sx={headerCellSx} sortDirection={orderBy === 'label' ? order : false}>
                <TableSortLabel active={orderBy === 'label'} direction={orderBy === 'label' ? order : 'asc'} onClick={() => handleSort('label')}>
                  {t('annotation.label', '标签')}
                </TableSortLabel>
              </TableCell>
              {!directDeleteOnly && (
                <TableCell sx={headerCellSx} sortDirection={orderBy === 'text' ? order : false}>
                  <TableSortLabel active={orderBy === 'text'} direction={orderBy === 'text' ? order : 'asc'} onClick={() => handleSort('text')}>
                    {t('annotation.text', '文本')}
                  </TableSortLabel>
                </TableCell>
              )}
              {showVideoColumns && (
                <>
                  <TableCell sx={headerCellSx} sortDirection={orderBy === 'startFrame' ? order : false}>
                    <TableSortLabel active={orderBy === 'startFrame'} direction={orderBy === 'startFrame' ? order : 'asc'} onClick={() => handleSort('startFrame')}>
                      {t('annotation.startFrame')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={headerCellSx} sortDirection={orderBy === 'totalFrames' ? order : false}>
                    <TableSortLabel active={orderBy === 'totalFrames'} direction={orderBy === 'totalFrames' ? order : 'asc'} onClick={() => handleSort('totalFrames')}>
                      {t('annotation.totalFrames')}
                    </TableSortLabel>
                  </TableCell>
                </>
              )}
              {!directDeleteOnly && (
                <TableCell sx={headerCellSx} sortDirection={orderBy === 'pos' ? order : false}>
                  <TableSortLabel active={orderBy === 'pos'} direction={orderBy === 'pos' ? order : 'asc'} onClick={() => handleSort('pos')}>
                    {t('annotation.pos', '词性')}
                  </TableSortLabel>
                </TableCell>
              )}
              {!directDeleteOnly && (
                <TableCell sx={headerCellSx} sortDirection={orderBy === 'entity' ? order : false}>
                  <TableSortLabel active={orderBy === 'entity'} direction={orderBy === 'entity' ? order : 'asc'} onClick={() => handleSort('entity')}>
                    {t('annotation.ner', '命名实体')}
                  </TableSortLabel>
                </TableCell>
              )}
              {!directDeleteOnly && (
                <TableCell sx={headerCellSx} sortDirection={orderBy === 'position' ? order : false}>
                  <TableSortLabel active={orderBy === 'position'} direction={orderBy === 'position' ? order : 'asc'} onClick={() => handleSort('position')}>
                    {t('annotation.position', '位置')}
                  </TableSortLabel>
                </TableCell>
              )}
              <TableCell sx={headerCellSx}>{t('annotation.remark', '备注')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.action', '操作')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell colSpan={directDeleteOnly ? (showVideoColumns ? 6 : 4) : (showVideoColumns ? 10 : 8)} sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
                {t('annotation.noAnnotations', '暂无标注，选中文本进行标注')}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  return (
    <>
      <TableContainer
        component={Paper}
        sx={{
          maxHeight: 300,
          bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#FAFAFA',
          border: '1px solid',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'divider',
          overflowX: 'auto'
        }}
      >
        <Table size="small" stickyHeader sx={{ minWidth: 'max-content' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>#</TableCell>
              <TableCell sx={headerCellSx} sortDirection={orderBy === 'label' ? order : false}>
                <TableSortLabel active={orderBy === 'label'} direction={orderBy === 'label' ? order : 'asc'} onClick={() => handleSort('label')}>
                  {t('annotation.label', '标签')}
                </TableSortLabel>
              </TableCell>
              {!directDeleteOnly && (
                <TableCell sx={headerCellSx} sortDirection={orderBy === 'text' ? order : false}>
                  <TableSortLabel active={orderBy === 'text'} direction={orderBy === 'text' ? order : 'asc'} onClick={() => handleSort('text')}>
                    {t('annotation.text', '文本')}
                  </TableSortLabel>
                </TableCell>
              )}
              {showVideoColumns && (
                <>
                  <TableCell sx={headerCellSx} sortDirection={orderBy === 'startFrame' ? order : false}>
                    <TableSortLabel active={orderBy === 'startFrame'} direction={orderBy === 'startFrame' ? order : 'asc'} onClick={() => handleSort('startFrame')}>
                      {t('annotation.startFrame')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={headerCellSx} sortDirection={orderBy === 'totalFrames' ? order : false}>
                    <TableSortLabel active={orderBy === 'totalFrames'} direction={orderBy === 'totalFrames' ? order : 'asc'} onClick={() => handleSort('totalFrames')}>
                      {t('annotation.totalFrames')}
                    </TableSortLabel>
                  </TableCell>
                </>
              )}
              {!directDeleteOnly && (
                <TableCell sx={headerCellSx} sortDirection={orderBy === 'pos' ? order : false}>
                  <TableSortLabel active={orderBy === 'pos'} direction={orderBy === 'pos' ? order : 'asc'} onClick={() => handleSort('pos')}>
                    {t('annotation.pos', '词性')}
                  </TableSortLabel>
                </TableCell>
              )}
              {!directDeleteOnly && (
                <TableCell sx={headerCellSx} sortDirection={orderBy === 'entity' ? order : false}>
                  <TableSortLabel active={orderBy === 'entity'} direction={orderBy === 'entity' ? order : 'asc'} onClick={() => handleSort('entity')}>
                    {t('annotation.ner', '命名实体')}
                  </TableSortLabel>
                </TableCell>
              )}
              {!directDeleteOnly && (
                <TableCell sx={headerCellSx} sortDirection={orderBy === 'position' ? order : false}>
                  <TableSortLabel active={orderBy === 'position'} direction={orderBy === 'position' ? order : 'asc'} onClick={() => handleSort('position')}>
                    {t('annotation.position', '位置')}
                  </TableSortLabel>
                </TableCell>
              )}
              <TableCell sx={headerCellSx}>{t('annotation.remark', '备注')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.action', '操作')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedAnnotations.map((ann, idx) => (
              <TableRow
                key={ann.id}
                hover
                onClick={() => handleRowClick(ann.id)}
                onMouseEnter={() => handleMouseEnter(ann.id)}
                onMouseLeave={handleMouseLeave}
                sx={{
                  cursor: 'pointer',
                  // 仅选中行显示颜色；悬停仅阴影（纯 CSS，无状态，避免快速移动拖影）
                  backgroundColor: selectedId === ann.id ? `${ann.color || '#2196F3'}30` : 'transparent',
                  outline: selectedId === ann.id ? `1.5px solid ${ann.color || '#2196F3'}` : 'none',
                  '&:hover': {
                    backgroundColor: selectedId === ann.id ? `${ann.color || '#2196F3'}30` : 'transparent',
                    boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.08)'
                  }
                }}
              >
                <TableCell sx={bodyCellSx}>
                  {idx + 1}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      backgroundColor: ann.color || '#2196F3',
                      color: '#fff',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {ann.label}
                  </Box>
                </TableCell>
                {!directDeleteOnly && (
                  <TableCell sx={{ ...bodyCellSx, maxWidth: 200 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '12px',
                        display: 'block'
                      }}
                      title={ann.type === 'video' ? `[${ann.label}]` : ann.text}
                    >
                      {ann.type === 'video' ? `[${ann.label}]` : ann.text}
                    </Typography>
                  </TableCell>
                )}
                {showVideoColumns && (
                  <>
                    <TableCell sx={bodyCellSx}>
                      {ann.frameNumber ?? '-'}
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      {ann.frameCount ?? '-'}
                    </TableCell>
                  </>
                )}
                {!directDeleteOnly && (
                  <TableCell sx={bodyCellSx}>
                    {ann.pos && ann.pos !== '-' ? (
                      <Tooltip title={ann.pos === 'Mul' ? 'Multiple POS tags' : ann.pos}>
                        <Chip
                          label={ann.pos}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '10px',
                            bgcolor: `${getPosColor(ann.pos)}20`,
                            color: getPosColor(ann.pos),
                            fontWeight: 500,
                            '& .MuiChip-label': { px: 1 }
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">-</Typography>
                    )}
                  </TableCell>
                )}
                {!directDeleteOnly && (
                  <TableCell sx={bodyCellSx}>
                    {ann.entity && ann.entity !== '-' ? (
                      <Tooltip title={ann.entity === 'Mul' ? 'Multiple entities' : ann.entity}>
                        <Chip
                          label={ann.entity}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '10px',
                            bgcolor: `${getEntityColor(ann.entity)}20`,
                            color: getEntityColor(ann.entity),
                            fontWeight: 500,
                            '& .MuiChip-label': { px: 1 }
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">-</Typography>
                    )}
                  </TableCell>
                )}
                {!directDeleteOnly && (
                  <TableCell sx={bodyCellSx}>
                    {ann.startPosition}
                  </TableCell>
                )}
                <TableCell sx={bodyCellSx}>
                  <Tooltip title={ann.remark || '添加备注'}>
                    <Button
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleOpenRemark(ann) }}
                      sx={{
                        minWidth: 28,
                        height: 28,
                        p: 0,
                        bgcolor: ann.remark ? '#4CAF50' : '#9E9E9E',
                        color: '#fff',
                        fontSize: '12px',
                        borderRadius: '4px',
                        '&:hover': {
                          bgcolor: ann.remark ? '#43A047' : '#757575'
                        }
                      }}
                    >
                      {ann.remark ? <MoreHorizIcon sx={{ fontSize: 16 }} /> : <AddIcon sx={{ fontSize: 16 }} />}
                    </Button>
                  </Tooltip>
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  {directDeleteOnly ? (
                    <Tooltip title={t('common.delete', '删除')}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => { e.stopPropagation(); onDelete(ann.id) }}
                        sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                      >
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title={t('annotation.moreActions', '更多操作')}>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, ann)}
                        sx={{
                          opacity: 0.6,
                          '&:hover': { opacity: 1 }
                        }}
                      >
                        <MoreVertIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dropdown action menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        TransitionProps={{ onExited: handleMenuExited }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={handleOpenCollocation}
          disabled={!hasCrossLinkProps}
        >
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('crossLink.viewCollocation', '查看语境索引')} />
        </MenuItem>
        <MenuItem
          onClick={handleOpenCollocationAnalysis}
          disabled={!hasCrossLinkProps}
        >
          <ListItemIcon>
            <JoinInnerIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('crossLink.viewCollocationAnalysis', '查看搭配分析')} />
        </MenuItem>
        <MenuItem
          onClick={handleOpenWordSketch}
          disabled={!hasCrossLinkProps}
        >
          <ListItemIcon>
            <HubIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('crossLink.viewWordSketch', '查看词图分析')} />
        </MenuItem>
        <MenuItem
          onClick={handleOpenNgram}
          disabled={!hasCrossLinkProps}
        >
          <ListItemIcon>
            <TextFieldsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('crossLink.viewNgram', 'N-gram分析')} />
        </MenuItem>
        <MenuItem
          onClick={handleOpenSemanticDomain}
          disabled={!hasCrossLinkProps}
        >
          <ListItemIcon>
            <CategoryIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('crossLink.viewSemanticDomain', '语义域分析')} />
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={handleDeleteFromMenu}
          sx={{ color: '#f44336' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" sx={{ color: '#f44336' }} />
          </ListItemIcon>
          <ListItemText primary={t('annotation.deleteAnnotation', '删除标注')} />
        </MenuItem>
      </Menu>

      {/* 备注对话框 */}
      <Dialog
        open={remarkDialogOpen}
        onClose={() => setRemarkDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6">{t('annotation.remark', '备注')}</Typography>
          {editingAnnotation && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {editingAnnotation.text.substring(0, 50)}{editingAnnotation.text.length > 50 ? '...' : ''}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            rows={4}
            fullWidth
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder={t('annotation.enterRemark', '输入备注内容...')}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemarkDialogOpen(false)}>
            {t('common.cancel', '取消')}
          </Button>
          <Button onClick={handleSaveRemark} variant="contained">
            {t('common.save', '保存')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

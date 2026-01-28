/**
 * AnnotationTable Component
 * Table view of all annotations with POS and NER columns
 * 
 * Features:
 * - List all annotations with details
 * - Display POS (Part of Speech) from SpaCy data
 * - Display NER (Named Entity Recognition) from SpaCy data
 * - Edit remark for each annotation
 * - Delete annotations
 * - Highlight annotation on hover
 * - Auto-width columns based on content
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
  useTheme
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import { useTranslation } from 'react-i18next'
import type { Annotation } from '../../types'

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
  showVideoColumns = false
}: AnnotationTableProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const headerCellSx = getHeaderCellSx(isDarkMode)
  const bodyCellSx = getBodyCellSx(isDarkMode)
  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [remarkText, setRemarkText] = useState('')

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
              <TableCell sx={headerCellSx}>{t('annotation.label', '标签')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.text', '文本')}</TableCell>
              {showVideoColumns && (
                <>
                  <TableCell sx={headerCellSx}>起始帧</TableCell>
                  <TableCell sx={headerCellSx}>总帧数</TableCell>
                </>
              )}
              <TableCell sx={headerCellSx}>{t('annotation.pos', '词性')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.ner', '命名实体')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.position', '位置')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.remark', '备注')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.action', '操作')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell colSpan={showVideoColumns ? 10 : 8} sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
                {t('annotation.noAnnotations', '暂无标注，选中文本进行标注')}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  // Sort by position
  const sorted = [...annotationsWithSpacy].sort((a, b) => a.startPosition - b.startPosition)

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
              <TableCell sx={headerCellSx}>{t('annotation.label', '标签')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.text', '文本')}</TableCell>
              {showVideoColumns && (
                <>
                  <TableCell sx={headerCellSx}>起始帧</TableCell>
                  <TableCell sx={headerCellSx}>总帧数</TableCell>
                </>
              )}
              <TableCell sx={headerCellSx}>{t('annotation.pos', '词性')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.ner', '命名实体')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.position', '位置')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.remark', '备注')}</TableCell>
              <TableCell sx={headerCellSx}>{t('annotation.action', '操作')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((ann, idx) => (
              <TableRow
                key={ann.id}
                onMouseEnter={() => handleMouseEnter(ann.id)}
                onMouseLeave={handleMouseLeave}
                sx={{
                  backgroundColor: highlightedId === ann.id 
                    ? `${ann.color}20` 
                    : 'transparent',
                  '&:hover': {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#f9f9f9'
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
                <TableCell sx={bodyCellSx}>
                  {ann.startPosition}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Tooltip title={ann.remark || '添加备注'}>
                    <Button
                      size="small"
                      onClick={() => handleOpenRemark(ann)}
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
                  <Button
                    size="small"
                    onClick={() => onDelete(ann.id)}
                    sx={{
                      minWidth: 'auto',
                      height: 28,
                      px: 1.5,
                      bgcolor: '#ff5252',
                      color: '#fff',
                      fontSize: '11px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      '&:hover': {
                        bgcolor: '#ff1744'
                      }
                    }}
                  >
                    {t('common.delete', '删除')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

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

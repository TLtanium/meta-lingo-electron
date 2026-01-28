/**
 * BatchTextEditDialog - 批量文本编辑对话框组件
 * 支持：查找/替换、实体提取、文本标准化 - 批量应用到多个选中文本
 * 支持左右键导航预览各文本处理结果
 * 保存后自动执行 SpaCy -> USAS -> MIPVU 标注流程
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Stack,
  Tab,
  Tabs,
  IconButton,
  Chip,
  Tooltip,
  Divider,
  Alert,
  CircularProgress,
  Paper,
  FormControlLabel,
  Checkbox,
  LinearProgress,
  Badge
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import FindReplaceIcon from '@mui/icons-material/FindReplace'
import CleaningServicesIcon from '@mui/icons-material/CleaningServices'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import SaveIcon from '@mui/icons-material/Save'
import UndoIcon from '@mui/icons-material/Undo'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import PreviewIcon from '@mui/icons-material/Preview'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { useTranslation } from 'react-i18next'
import { corpusApi } from '../../api'

export interface BatchTextItem {
  id: string
  filename: string
  originalContent: string
  editedContent: string
  hasChanges: boolean
  status: 'pending' | 'saving' | 'saved' | 'error'
  error?: string
}

// 标注阶段类型
type AnnotationStage = 'idle' | 'saving' | 'spacy' | 'usas' | 'mipvu' | 'complete' | 'error'

interface BatchTextEditDialogProps {
  open: boolean
  onClose: () => void
  // 语料库ID
  corpusId: string
  // 选中的文本项 (ID -> 文件名)
  selectedTexts: { id: string; filename: string }[]
  // 获取文本内容的回调
  onLoadContent: (textId: string) => Promise<string>
  // 保存单个文本的回调
  onSaveContent: (textId: string, content: string) => Promise<void>
  // 所有保存和标注完成后的回调
  onAllSaved: () => void
  // 标题
  title?: string
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`batch-edit-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  )
}

// 实体提取正则表达式
const ENTITY_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  url: /https?:\/\/[^\s<>"{}|\\^`\[\]]+|www\.[^\s<>"{}|\\^`\[\]]+/g,
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ip: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g
}

interface NormalizeOptions {
  unicode: boolean
  whitespace: boolean
  removeLineBreaks: boolean
  specialChars: boolean
  htmlTags: boolean
  controlChars: boolean
}

// 文本标准化函数
const normalizeText = (text: string, options: NormalizeOptions): string => {
  let result = text
  
  if (options.unicode) {
    result = result.normalize('NFKC')
  }
  
  if (options.whitespace) {
    result = result.split('\n').map(line => 
      line.replace(/[ \t]+/g, ' ').trim()
    ).join('\n')
  }
  
  if (options.removeLineBreaks) {
    result = result.replace(/\n{2,}/g, '\n')
  }
  
  if (options.specialChars) {
    result = result.replace(/[^\w\s\u4e00-\u9fff.,!?;:'"()\n-]/g, '')
  }
  
  if (options.htmlTags) {
    result = result.replace(/<[^>]*>/g, '')
  }
  
  if (options.controlChars) {
    result = result.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
  }
  
  return result
}

// 转义正则特殊字符
const escapeRegex = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function BatchTextEditDialog({
  open,
  onClose,
  corpusId,
  selectedTexts,
  onLoadContent,
  onSaveContent,
  onAllSaved,
  title = ''
}: BatchTextEditDialogProps) {
  const { t } = useTranslation()
  
  // 当前标签页
  const [tabValue, setTabValue] = useState(0)
  
  // 批量编辑状态
  const [textItems, setTextItems] = useState<BatchTextItem[]>([])
  const [loading, setLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  
  // 标注流程状态
  const [annotationStage, setAnnotationStage] = useState<AnnotationStage>('idle')
  const [annotationProgress, setAnnotationProgress] = useState(0)
  const [annotationCurrentText, setAnnotationCurrentText] = useState('')
  const [annotationCurrentIndex, setAnnotationCurrentIndex] = useState(0)
  const [annotationTotalTexts, setAnnotationTotalTexts] = useState(0)
  const [countdown, setCountdown] = useState(3)
  
  // 查找/替换状态
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [regexValid, setRegexValid] = useState(true)
  const [regexError, setRegexError] = useState<string>('')
  
  // 实体提取状态
  const [extractEmail, setExtractEmail] = useState(true)
  const [extractUrl, setExtractUrl] = useState(true)
  const [extractPhone, setExtractPhone] = useState(false)
  const [extractIp, setExtractIp] = useState(false)
  const [extractedEntitiesMap, setExtractedEntitiesMap] = useState<Map<string, {type: string, value: string}[]>>(new Map())
  
  // 标准化选项
  const [normalizeOptions, setNormalizeOptions] = useState<NormalizeOptions>({
    unicode: true,
    whitespace: true,
    removeLineBreaks: false,
    specialChars: false,
    htmlTags: true,
    controlChars: true
  })
  
  // 保存状态 (用annotationStage代替)
  const saving = annotationStage !== 'idle' && annotationStage !== 'complete'
  
  // 加载所有选中文本的内容 (只在打开对话框时加载一次)
  useEffect(() => {
    if (open && selectedTexts.length > 0 && textItems.length === 0 && !loading) {
      loadAllContents()
    }
    // 关闭时重置状态
    if (!open) {
      setTextItems([])
      setAnnotationStage('idle')
      setAnnotationProgress(0)
    }
  }, [open])
  
  const loadAllContents = async () => {
    setLoading(true)
    setCurrentIndex(0)
    setExtractedEntitiesMap(new Map())
    
    const items: BatchTextItem[] = []
    
    for (const text of selectedTexts) {
      try {
        const content = await onLoadContent(text.id)
        items.push({
          id: text.id,
          filename: text.filename,
          originalContent: content,
          editedContent: content,
          hasChanges: false,
          status: 'pending'
        })
      } catch (e) {
        items.push({
          id: text.id,
          filename: text.filename,
          originalContent: '',
          editedContent: '',
          hasChanges: false,
          status: 'error',
          error: String(e)
        })
      }
    }
    
    setTextItems(items)
    setLoading(false)
  }
  
  // 当前显示的文本
  const currentItem = textItems[currentIndex]
  
  // 统计信息
  const stats = useMemo(() => {
    const changedCount = textItems.filter(item => item.hasChanges).length
    const savedCount = textItems.filter(item => item.status === 'saved').length
    return { changedCount, savedCount, total: textItems.length }
  }, [textItems])
  
  // 计算当前文本的匹配数量并验证正则表达式
  const matchCount = useMemo(() => {
    if (!findText || !currentItem) return 0
    try {
      const flags = caseSensitive ? 'g' : 'gi'
      const pattern = useRegex ? new RegExp(findText, flags) : new RegExp(escapeRegex(findText), flags)
      const matches = currentItem.editedContent.match(pattern)
      return matches ? matches.length : 0
    } catch {
      return 0
    }
  }, [findText, caseSensitive, useRegex, currentItem])
  
  // 验证正则表达式
  useEffect(() => {
    if (!findText || !useRegex) {
      setRegexValid(true)
      setRegexError('')
      return
    }
    
    try {
      const flags = caseSensitive ? 'g' : 'gi'
      new RegExp(findText, flags)
      setRegexValid(true)
      setRegexError('')
    } catch (error) {
      setRegexValid(false)
      setRegexError(error instanceof Error ? error.message : 'Invalid regex')
    }
  }, [findText, caseSensitive, useRegex])
  
  // 计算所有文本的总匹配数
  const totalMatchCount = useMemo(() => {
    if (!findText) return 0
    let total = 0
    try {
      const flags = caseSensitive ? 'g' : 'gi'
      const pattern = useRegex ? new RegExp(findText, flags) : new RegExp(escapeRegex(findText), flags)
      for (const item of textItems) {
        const matches = item.editedContent.match(pattern)
        if (matches) total += matches.length
      }
    } catch {
      // ignore
    }
    return total
  }, [findText, caseSensitive, useRegex, textItems])
  
  // 批量查找/替换
  const handleBatchReplace = () => {
    if (!findText) return
    
    setTextItems(prev => prev.map(item => {
      try {
        const flags = caseSensitive ? 'g' : 'gi'
        const pattern = useRegex ? new RegExp(findText, flags) : new RegExp(escapeRegex(findText), flags)
        const newContent = item.editedContent.replace(pattern, replaceText)
        const changed = newContent !== item.originalContent
        return { ...item, editedContent: newContent, hasChanges: changed }
      } catch {
        return item
      }
    }))
  }
  
  // 批量实体提取
  const handleBatchExtractEntities = () => {
    const newEntitiesMap = new Map<string, {type: string, value: string}[]>()
    
    setTextItems(prev => prev.map(item => {
      let newContent = item.editedContent
      const entities: {type: string, value: string}[] = []
      
      if (extractEmail) {
        const matches = newContent.match(ENTITY_PATTERNS.email) || []
        matches.forEach(m => entities.push({ type: 'email', value: m }))
        newContent = newContent.replace(ENTITY_PATTERNS.email, '')
      }
      
      if (extractUrl) {
        const matches = newContent.match(ENTITY_PATTERNS.url) || []
        matches.forEach(m => entities.push({ type: 'url', value: m }))
        newContent = newContent.replace(ENTITY_PATTERNS.url, '')
      }
      
      if (extractPhone) {
        const matches = newContent.match(ENTITY_PATTERNS.phone) || []
        matches.forEach(m => entities.push({ type: 'phone', value: m }))
        newContent = newContent.replace(ENTITY_PATTERNS.phone, '')
      }
      
      if (extractIp) {
        const matches = newContent.match(ENTITY_PATTERNS.ip) || []
        matches.forEach(m => entities.push({ type: 'ip', value: m }))
        newContent = newContent.replace(ENTITY_PATTERNS.ip, '')
      }
      
      // 清理多余空格
      newContent = newContent.split('\n').map(line => 
        line.replace(/[ \t]+/g, ' ').trim()
      ).join('\n')
      
      newEntitiesMap.set(item.id, entities)
      const changed = newContent !== item.originalContent
      return { ...item, editedContent: newContent, hasChanges: changed }
    }))
    
    setExtractedEntitiesMap(newEntitiesMap)
  }
  
  // 批量标准化
  const handleBatchNormalize = () => {
    setTextItems(prev => prev.map(item => {
      const newContent = normalizeText(item.editedContent, normalizeOptions)
      const changed = newContent !== item.originalContent
      return { ...item, editedContent: newContent, hasChanges: changed }
    }))
  }
  
  // 撤销所有更改
  const handleUndoAll = () => {
    setTextItems(prev => prev.map(item => ({
      ...item,
      editedContent: item.originalContent,
      hasChanges: false,
      status: 'pending'
    })))
    setExtractedEntitiesMap(new Map())
  }
  
  // 轮询任务状态直到完成
  const pollTaskUntilComplete = useCallback(async (taskId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const poll = async () => {
        try {
          const taskResponse = await corpusApi.getTaskStatus(taskId)
          if (taskResponse.success && taskResponse.data) {
            const task = taskResponse.data
            
            if (task.status === 'completed') {
              resolve(true)
            } else if (task.status === 'failed') {
              resolve(false)
            } else {
              // 继续轮询
              setTimeout(poll, 1500)
            }
          } else {
            resolve(false)
          }
        } catch {
          resolve(false)
        }
      }
      poll()
    })
  }, [])

  // 保存所有更改并执行标注流程
  const handleSaveAll = async () => {
    const changedItems = textItems.filter(item => item.hasChanges)
    if (changedItems.length === 0) return
    
    setAnnotationTotalTexts(changedItems.length)
    setAnnotationCurrentIndex(0)
    
    // 阶段1: 保存文本内容
    setAnnotationStage('saving')
    setAnnotationProgress(0)
    
    let saved = 0
    const savedTextIds: string[] = []
    
    for (const item of changedItems) {
      setAnnotationCurrentText(item.filename)
      setAnnotationCurrentIndex(saved + 1)
      
      setTextItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, status: 'saving' as const } : i
      ))
      
      try {
        await onSaveContent(item.id, item.editedContent)
        saved++
        savedTextIds.push(item.id)
        setAnnotationProgress((saved / changedItems.length) * 100)
        
        setTextItems(prev => prev.map(i => 
          i.id === item.id ? { ...i, status: 'saved' as const, originalContent: i.editedContent, hasChanges: false } : i
        ))
      } catch (e) {
        setTextItems(prev => prev.map(i => 
          i.id === item.id ? { ...i, status: 'error' as const, error: String(e) } : i
        ))
      }
    }
    
    if (savedTextIds.length === 0) {
      setAnnotationStage('error')
      return
    }
    
    // 阶段2-4: 对每个保存的文本执行 SpaCy -> USAS -> MIPVU
    for (let i = 0; i < savedTextIds.length; i++) {
      const textId = savedTextIds[i]
      const item = changedItems.find(it => it.id === textId)
      setAnnotationCurrentText(item?.filename || textId)
      setAnnotationCurrentIndex(i + 1)
      
      try {
        // SpaCy 标注
        setAnnotationStage('spacy')
        setAnnotationProgress(0)
        const spacyResponse = await corpusApi.reAnnotateSpacy(corpusId, textId, true)
        if (spacyResponse.success && spacyResponse.task_id) {
          await pollTaskUntilComplete(spacyResponse.task_id)
        }
        setAnnotationProgress(33)
        
        // USAS 标注
        setAnnotationStage('usas')
        const usasResponse = await corpusApi.reAnnotateUsas(corpusId, textId)
        if (usasResponse.success && usasResponse.task_id) {
          await pollTaskUntilComplete(usasResponse.task_id)
        }
        setAnnotationProgress(66)
        
        // MIPVU 标注
        setAnnotationStage('mipvu')
        const mipvuResponse = await corpusApi.reAnnotateMipvu(corpusId, textId)
        if (mipvuResponse.success && mipvuResponse.task_id) {
          await pollTaskUntilComplete(mipvuResponse.task_id)
        }
        setAnnotationProgress(100)
        
      } catch (err) {
        console.error('Annotation failed for', textId, err)
      }
    }
    
    // 完成 - 开始倒计时
    setAnnotationStage('complete')
    setCountdown(3)
  }
  
  // 完成后倒计时
  useEffect(() => {
    if (annotationStage !== 'complete') return
    
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else {
      // 倒计时结束，回到编辑界面
      setAnnotationStage('idle')
      onAllSaved()
    }
  }, [annotationStage, countdown, onAllSaved])
  
  // 键盘导航
  useEffect(() => {
    if (!open) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1)
      } else if (e.key === 'ArrowRight' && currentIndex < textItems.length - 1) {
        setCurrentIndex(currentIndex + 1)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, currentIndex, textItems.length])
  
  // 字符统计
  const charCount = useMemo(() => {
    if (!currentItem) return { chars: 0, words: 0, lines: 0 }
    const text = currentItem.editedContent
    return {
      chars: text.length,
      words: text.split(/\s+/).filter(w => w.length > 0).length,
      lines: text.split('\n').length
    }
  }, [currentItem])
  
  // 获取当前文本提取的实体
  const currentEntities = extractedEntitiesMap.get(currentItem?.id || '') || []
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { minHeight: '75vh' } }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <EditIcon color="primary" />
            <Typography variant="h6">
              {title || t('corpus.batchEdit.title', '')}
            </Typography>
            <Chip 
              label={`${stats.changedCount}/${stats.total} ${t('corpus.batchEdit.modified', '')}`} 
              size="small" 
              color={stats.changedCount > 0 ? 'warning' : 'default'} 
            />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            {currentItem && (
              <Typography variant="caption" color="text.secondary">
                {charCount.chars} {t('corpus.edit.chars', '')} | {charCount.words} {t('corpus.edit.words', '')}
              </Typography>
            )}
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Stack>
      </DialogTitle>
      
      <DialogContent dividers sx={{ position: 'relative', minHeight: 500, overflow: 'hidden' }}>
        {/* 标注进度覆盖层 - 放在最前面确保覆盖所有内容 */}
        {annotationStage !== 'idle' && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100
            }}
          >
            {annotationStage === 'complete' ? (
              <Box sx={{ textAlign: 'center' }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 100, color: 'success.main', mb: 2 }} />
                <Typography variant="h5" color="success.main" gutterBottom>
                  {t('corpus.batchEdit.annotationComplete')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('corpus.batchEdit.returningToEditorCountdown', { count: countdown })}
                </Typography>
              </Box>
            ) : annotationStage === 'error' ? (
              <Box sx={{ textAlign: 'center' }}>
                <ErrorIcon sx={{ fontSize: 80, color: 'error.main', mb: 2 }} />
                <Typography variant="h6" color="error.main">
                  {t('corpus.batchEdit.saveFailed')}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', width: '80%', maxWidth: 400 }}>
                <CircularProgress size={60} sx={{ mb: 3 }} />
                
                <Typography variant="h6" gutterBottom>
                  {annotationStage === 'saving' && t('corpus.batchEdit.stageSaving')}
                  {annotationStage === 'spacy' && t('corpus.batchEdit.stageSpacy')}
                  {annotationStage === 'usas' && t('corpus.batchEdit.stageUsas')}
                  {annotationStage === 'mipvu' && t('corpus.batchEdit.stageMipvu')}
                </Typography>
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {annotationCurrentText} ({annotationCurrentIndex}/{annotationTotalTexts})
                </Typography>
                
                <LinearProgress 
                  variant="determinate" 
                  value={annotationProgress} 
                  sx={{ height: 8, borderRadius: 4 }}
                />
                
                <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 3 }}>
                  <Chip 
                    label={t('corpus.batchEdit.chipSave')} 
                    size="small"
                    color={annotationStage === 'saving' ? 'primary' : 'success'}
                    variant="filled"
                  />
                  <Chip 
                    label="SpaCy" 
                    size="small"
                    color={annotationStage === 'spacy' ? 'primary' : (['usas', 'mipvu'].includes(annotationStage) ? 'success' : 'default')}
                    variant={['spacy', 'usas', 'mipvu'].includes(annotationStage) ? 'filled' : 'outlined'}
                  />
                  <Chip 
                    label="USAS" 
                    size="small"
                    color={annotationStage === 'usas' ? 'primary' : (annotationStage === 'mipvu' ? 'success' : 'default')}
                    variant={['usas', 'mipvu'].includes(annotationStage) ? 'filled' : 'outlined'}
                  />
                  <Chip 
                    label="MIPVU" 
                    size="small"
                    color={annotationStage === 'mipvu' ? 'primary' : 'default'}
                    variant={annotationStage === 'mipvu' ? 'filled' : 'outlined'}
                  />
                </Stack>
              </Box>
            )}
          </Box>
        )}
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>{t('corpus.batchEdit.loading', '')}</Typography>
          </Box>
        ) : (
          <>
            {/* 导航栏 */}
            <Paper 
              elevation={0} 
              sx={{ 
                p: 1.5, 
                mb: 2, 
                bgcolor: 'action.hover',
                borderRadius: 2
              }}
            >
              <Stack direction="row" alignItems="center" spacing={2}>
                <IconButton 
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                >
                  <NavigateBeforeIcon />
                </IconButton>
                
                <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1 }}>
                  <PreviewIcon color="action" />
                  <Typography variant="subtitle2">
                    {currentItem?.filename || '-'}
                  </Typography>
                  <Chip 
                    label={`${currentIndex + 1} / ${textItems.length}`} 
                    size="small" 
                    variant="outlined"
                  />
                  {currentItem?.hasChanges && (
                    <Chip label={t('corpus.edit.modified', '*')} size="small" color="warning" />
                  )}
                  {currentItem?.status === 'saved' && (
                    <Chip label={t('corpus.batchEdit.saved', '')} size="small" color="success" />
                  )}
                  {currentItem?.status === 'error' && (
                    <Chip label={t('corpus.batchEdit.error', '')} size="small" color="error" />
                  )}
                </Stack>
                
                <Typography variant="caption" color="text.secondary">
                  {t('corpus.batchEdit.navHint', '')}
                </Typography>
                
                <IconButton 
                  onClick={() => setCurrentIndex(Math.min(textItems.length - 1, currentIndex + 1))}
                  disabled={currentIndex >= textItems.length - 1}
                >
                  <NavigateNextIcon />
                </IconButton>
              </Stack>
            </Paper>
            
            {/* 标签页 */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                <Tab 
                  icon={<FindReplaceIcon />} 
                  iconPosition="start" 
                  label={t('corpus.edit.findReplace', '')} 
                />
                <Tab 
                  icon={<FilterAltIcon />} 
                  iconPosition="start" 
                  label={
                    <Badge badgeContent={currentEntities.length} color="secondary">
                      {t('corpus.edit.entityExtract', '')}
                    </Badge>
                  } 
                />
                <Tab 
                  icon={<CleaningServicesIcon />} 
                  iconPosition="start" 
                  label={t('corpus.edit.normalize', '')} 
                />
              </Tabs>
            </Box>
            
            {/* Tab 0: 查找/替换 */}
            <TabPanel value={tabValue} index={0}>
              <Stack spacing={2}>
                <Alert severity="info">
                  {t('corpus.batchEdit.findReplaceInfo', '')}
                </Alert>
                
                <Stack direction="row" spacing={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('corpus.edit.find', '')}
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    error={useRegex && !regexValid}
                    helperText={useRegex && !regexValid ? regexError : ''}
                    InputProps={{
                      endAdornment: findText && (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {useRegex && (
                            <Tooltip title={regexValid ? t('corpus.edit.regexValid', 'Regex syntax valid') : regexError}>
                              {regexValid ? (
                                <CheckCircleIcon color="success" fontSize="small" />
                              ) : (
                                <ErrorIcon color="error" fontSize="small" />
                              )}
                            </Tooltip>
                          )}
                          <Chip size="small" label={`${matchCount} ${t('corpus.batchEdit.inCurrent', '')}`} />
                          <Chip size="small" label={`${totalMatchCount} ${t('corpus.batchEdit.inAll', '')}`} color="primary" />
                        </Stack>
                      )
                    }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label={t('corpus.edit.replace', '')}
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                  />
                </Stack>
                
                <Stack direction="row" spacing={2} alignItems="center">
                  <FormControlLabel
                    control={<Checkbox checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />}
                    label={t('corpus.edit.caseSensitive', '')}
                  />
                  <FormControlLabel
                    control={<Checkbox checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />}
                    label={t('corpus.edit.useRegex', '')}
                  />
                  <Box sx={{ flexGrow: 1 }} />
                  <Button 
                    variant="contained" 
                    onClick={handleBatchReplace}
                    disabled={!findText || totalMatchCount === 0}
                  >
                    {t('corpus.batchEdit.replaceInAll', '')}
                  </Button>
                </Stack>
              </Stack>
            </TabPanel>
            
            {/* Tab 1: 实体提取 */}
            <TabPanel value={tabValue} index={1}>
              <Stack spacing={2}>
                <Alert severity="info">
                  {t('corpus.batchEdit.entityExtractInfo', '')}
                </Alert>
                
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <FormControlLabel
                    control={<Checkbox checked={extractEmail} onChange={(e) => setExtractEmail(e.target.checked)} />}
                    label={t('corpus.edit.email', '')}
                  />
                  <FormControlLabel
                    control={<Checkbox checked={extractUrl} onChange={(e) => setExtractUrl(e.target.checked)} />}
                    label={t('corpus.edit.url', '')}
                  />
                  <FormControlLabel
                    control={<Checkbox checked={extractPhone} onChange={(e) => setExtractPhone(e.target.checked)} />}
                    label={t('corpus.edit.phone', '')}
                  />
                  <FormControlLabel
                    control={<Checkbox checked={extractIp} onChange={(e) => setExtractIp(e.target.checked)} />}
                    label={t('corpus.edit.ip', 'IP')}
                  />
                </Stack>
                
                <Button 
                  variant="contained" 
                  onClick={handleBatchExtractEntities}
                  startIcon={<FilterAltIcon />}
                >
                  {t('corpus.batchEdit.extractFromAll', '')}
                </Button>
                
                {currentEntities.length > 0 && (
                  <>
                    <Divider />
                    <Typography variant="subtitle2">
                      {t('corpus.batchEdit.extractedFromCurrent', '')} ({currentEntities.length})
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, maxHeight: 150, overflow: 'auto' }}>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {currentEntities.map((entity, idx) => (
                          <Tooltip key={idx} title={entity.type}>
                            <Chip 
                              label={entity.value} 
                              size="small"
                              color={entity.type === 'email' ? 'primary' : entity.type === 'url' ? 'secondary' : 'default'}
                              onDelete={() => navigator.clipboard.writeText(entity.value)}
                              deleteIcon={<ContentCopyIcon />}
                            />
                          </Tooltip>
                        ))}
                      </Stack>
                    </Paper>
                  </>
                )}
              </Stack>
            </TabPanel>
            
            {/* Tab 2: 标准化 */}
            <TabPanel value={tabValue} index={2}>
              <Stack spacing={2}>
                <Alert severity="info">
                  {t('corpus.batchEdit.normalizeInfo', '')}
                </Alert>
                
                <Stack spacing={1}>
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={normalizeOptions.unicode} 
                        onChange={(e) => setNormalizeOptions({...normalizeOptions, unicode: e.target.checked})} 
                      />
                    }
                    label={<Typography variant="body2">{t('corpus.edit.unicodeNormalize', 'Unicode')}</Typography>}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={normalizeOptions.whitespace} 
                        onChange={(e) => setNormalizeOptions({...normalizeOptions, whitespace: e.target.checked})} 
                      />
                    }
                    label={<Typography variant="body2">{t('corpus.edit.whitespaceNormalize', '')}</Typography>}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={normalizeOptions.removeLineBreaks} 
                        onChange={(e) => setNormalizeOptions({...normalizeOptions, removeLineBreaks: e.target.checked})} 
                      />
                    }
                    label={<Typography variant="body2">{t('corpus.edit.removeLineBreaks', '')}</Typography>}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={normalizeOptions.specialChars} 
                        onChange={(e) => setNormalizeOptions({...normalizeOptions, specialChars: e.target.checked})} 
                      />
                    }
                    label={<Typography variant="body2">{t('corpus.edit.removeSpecialChars', '')}</Typography>}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={normalizeOptions.htmlTags} 
                        onChange={(e) => setNormalizeOptions({...normalizeOptions, htmlTags: e.target.checked})} 
                      />
                    }
                    label={<Typography variant="body2">{t('corpus.edit.removeHtml', 'HTML')}</Typography>}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={normalizeOptions.controlChars} 
                        onChange={(e) => setNormalizeOptions({...normalizeOptions, controlChars: e.target.checked})} 
                      />
                    }
                    label={<Typography variant="body2">{t('corpus.edit.removeControlChars', '')}</Typography>}
                  />
                </Stack>
                
                <Button 
                  variant="contained" 
                  onClick={handleBatchNormalize}
                  startIcon={<CleaningServicesIcon />}
                >
                  {t('corpus.batchEdit.normalizeAll', '')}
                </Button>
              </Stack>
            </TabPanel>
            
            <Divider sx={{ my: 2 }} />
            
            {/* 预览区 */}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('corpus.batchEdit.preview', '')}
            </Typography>
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 2, 
                maxHeight: 200, 
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                bgcolor: currentItem?.hasChanges ? 'warning.lighter' : 'background.paper'
              }}
            >
              {currentItem?.editedContent || t('corpus.batchEdit.noContent', '')}
            </Paper>
          </>
        )}
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button 
          startIcon={<UndoIcon />} 
          onClick={handleUndoAll}
          disabled={stats.changedCount === 0 || saving}
        >
          {t('corpus.edit.undoAll', '')}
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button 
          variant="contained" 
          onClick={handleSaveAll}
          disabled={stats.changedCount === 0 || saving}
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
        >
          {t('corpus.batchEdit.saveAll', '')} ({stats.changedCount})
        </Button>
      </DialogActions>
    </Dialog>
  )
}

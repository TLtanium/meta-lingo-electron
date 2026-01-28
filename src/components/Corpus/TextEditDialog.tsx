/**
 * TextEditDialog - 文本编辑对话框组件
 * 支持：直接编辑、实体提取、文本标准化、查找/替换
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  List,
  ListItem,
  ListItemText,
  FormControlLabel,
  Checkbox,
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import { useTranslation } from 'react-i18next'

interface TextEditDialogProps {
  open: boolean
  onClose: () => void
  // 文本模式
  textContent?: string
  // 转录模式 - 分段文本
  transcriptSegments?: TranscriptSegmentEdit[]
  // 保存回调
  onSave: (content: string | TranscriptSegmentEdit[]) => Promise<void>
  // 标题
  title: string
  // 是否为转录模式
  isTranscript?: boolean
}

export interface TranscriptSegmentEdit {
  id: number | string
  start: number
  end: number
  text: string
  originalText?: string  // 原始文本，用于撤销
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
      id={`edit-tabpanel-${index}`}
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

// 文本标准化函数
const normalizeText = (text: string, options: NormalizeOptions): string => {
  let result = text
  
  // Unicode 标准化
  if (options.unicode) {
    result = result.normalize('NFKC')
  }
  
  // 去除多余空白（保留换行符）
  if (options.whitespace) {
    // 只处理行内连续空格和制表符，保留换行符
    result = result.split('\n').map(line => 
      line.replace(/[ \t]+/g, ' ').trim()
    ).join('\n')
  }
  
  // 合并连续换行
  if (options.removeLineBreaks) {
    result = result.replace(/\n{2,}/g, '\n')
  }
  
  // 去除特殊符号（保留基本标点）
  if (options.specialChars) {
    // 保留字母、数字、中文、基本标点、空格和换行符
    result = result.replace(/[^\w\s\u4e00-\u9fff.,!?;:'"()\n-]/g, '')
  }
  
  // 去除HTML标签
  if (options.htmlTags) {
    result = result.replace(/<[^>]*>/g, '')
  }
  
  // 去除控制字符（保留换行符和制表符）
  if (options.controlChars) {
    result = result.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
  }
  
  return result
}

interface NormalizeOptions {
  unicode: boolean
  whitespace: boolean
  removeLineBreaks: boolean
  specialChars: boolean
  htmlTags: boolean
  controlChars: boolean
}

export default function TextEditDialog({
  open,
  onClose,
  textContent = '',
  transcriptSegments = [],
  onSave,
  title,
  isTranscript = false
}: TextEditDialogProps) {
  const { t } = useTranslation()
  
  // 当前标签页
  const [tabValue, setTabValue] = useState(0)
  
  // 编辑状态
  const [editedContent, setEditedContent] = useState('')
  const [editedSegments, setEditedSegments] = useState<TranscriptSegmentEdit[]>([])
  const [originalContent, setOriginalContent] = useState('')
  const [originalSegments, setOriginalSegments] = useState<TranscriptSegmentEdit[]>([])
  
  // 查找/替换状态
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [regexValid, setRegexValid] = useState(true)
  const [regexError, setRegexError] = useState<string>('')
  
  // 实体提取状态
  const [extractEmail, setExtractEmail] = useState(true)
  const [extractUrl, setExtractUrl] = useState(true)
  const [extractPhone, setExtractPhone] = useState(false)
  const [extractIp, setExtractIp] = useState(false)
  const [extractedEntities, setExtractedEntities] = useState<{type: string, value: string}[]>([])
  
  // 标准化选项
  const [normalizeOptions, setNormalizeOptions] = useState<NormalizeOptions>({
    unicode: true,
    whitespace: true,
    removeLineBreaks: false,
    specialChars: false,
    htmlTags: true,
    controlChars: true
  })
  
  // 保存状态
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  
  // 初始化内容
  useEffect(() => {
    if (open) {
      if (isTranscript) {
        const segments = transcriptSegments.map(seg => ({
          ...seg,
          originalText: seg.text
        }))
        setEditedSegments(segments)
        setOriginalSegments(JSON.parse(JSON.stringify(segments)))
      } else {
        setEditedContent(textContent)
        setOriginalContent(textContent)
      }
      setHasChanges(false)
      setTabValue(0)
    }
  }, [open, textContent, transcriptSegments, isTranscript])
  
  // 检测变化
  useEffect(() => {
    if (isTranscript) {
      const changed = editedSegments.some((seg, idx) => 
        seg.text !== originalSegments[idx]?.text
      )
      setHasChanges(changed)
    } else {
      setHasChanges(editedContent !== originalContent)
    }
  }, [editedContent, editedSegments, originalContent, originalSegments, isTranscript])
  
  // 获取当前文本（用于统一处理）
  const getCurrentText = useCallback(() => {
    if (isTranscript) {
      return editedSegments.map(seg => seg.text).join('\n')
    }
    return editedContent
  }, [isTranscript, editedContent, editedSegments])
  
  // 更新文本（统一处理）
  const updateText = useCallback((newText: string) => {
    if (isTranscript) {
      const lines = newText.split('\n')
      setEditedSegments(prev => prev.map((seg, idx) => ({
        ...seg,
        text: lines[idx] !== undefined ? lines[idx] : seg.text
      })))
    } else {
      setEditedContent(newText)
    }
  }, [isTranscript])
  
  // 计算匹配数量并验证正则表达式
  useEffect(() => {
    if (!findText) {
      setMatchCount(0)
      setRegexValid(true)
      setRegexError('')
      return
    }
    
    const text = getCurrentText()
    try {
      const flags = caseSensitive ? 'g' : 'gi'
      const pattern = useRegex ? new RegExp(findText, flags) : new RegExp(escapeRegex(findText), flags)
      const matches = text.match(pattern)
      setMatchCount(matches ? matches.length : 0)
      setRegexValid(true)
      setRegexError('')
    } catch (error) {
      setMatchCount(0)
      setRegexValid(false)
      setRegexError(error instanceof Error ? error.message : 'Invalid regex')
    }
  }, [findText, caseSensitive, useRegex, getCurrentText])
  
  // 转义正则特殊字符
  const escapeRegex = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  
  // 执行查找替换
  const handleReplace = (replaceAll: boolean) => {
    if (!findText) return
    
    const text = getCurrentText()
    try {
      const flags = caseSensitive ? (replaceAll ? 'g' : '') : (replaceAll ? 'gi' : 'i')
      const pattern = useRegex ? new RegExp(findText, flags) : new RegExp(escapeRegex(findText), flags)
      const newText = text.replace(pattern, replaceText)
      updateText(newText)
    } catch (e) {
      console.error('Replace error:', e)
    }
  }
  
  // 提取实体
  const handleExtractEntities = () => {
    const text = getCurrentText()
    const entities: {type: string, value: string}[] = []
    let newText = text
    
    if (extractEmail) {
      const matches = text.match(ENTITY_PATTERNS.email) || []
      matches.forEach(m => entities.push({ type: 'email', value: m }))
      newText = newText.replace(ENTITY_PATTERNS.email, '')
    }
    
    if (extractUrl) {
      const matches = text.match(ENTITY_PATTERNS.url) || []
      matches.forEach(m => entities.push({ type: 'url', value: m }))
      newText = newText.replace(ENTITY_PATTERNS.url, '')
    }
    
    if (extractPhone) {
      const matches = text.match(ENTITY_PATTERNS.phone) || []
      matches.forEach(m => entities.push({ type: 'phone', value: m }))
      newText = newText.replace(ENTITY_PATTERNS.phone, '')
    }
    
    if (extractIp) {
      const matches = text.match(ENTITY_PATTERNS.ip) || []
      matches.forEach(m => entities.push({ type: 'ip', value: m }))
      newText = newText.replace(ENTITY_PATTERNS.ip, '')
    }
    
    // 清理多余空格（保留换行）
    newText = newText.split('\n').map(line => 
      line.replace(/[ \t]+/g, ' ').trim()
    ).join('\n')
    
    setExtractedEntities(entities)
    updateText(newText)
  }
  
  // 标准化文本
  const handleNormalize = () => {
    const text = getCurrentText()
    const normalized = normalizeText(text, normalizeOptions)
    updateText(normalized)
  }
  
  // 撤销所有更改
  const handleUndo = () => {
    if (isTranscript) {
      setEditedSegments(JSON.parse(JSON.stringify(originalSegments)))
    } else {
      setEditedContent(originalContent)
    }
  }
  
  // 保存
  const handleSave = async () => {
    setSaving(true)
    try {
      if (isTranscript) {
        await onSave(editedSegments)
      } else {
        await onSave(editedContent)
      }
      onClose()
    } catch (e) {
      console.error('Save error:', e)
    } finally {
      setSaving(false)
    }
  }
  
  // 格式化时间戳
  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }
  
  // 字符统计
  const charCount = useMemo(() => {
    const text = getCurrentText()
    return {
      chars: text.length,
      words: text.split(/\s+/).filter(w => w.length > 0).length,
      lines: text.split('\n').length
    }
  }, [getCurrentText])
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { minHeight: '70vh' } }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <EditIcon color="primary" />
            <Typography variant="h6">{title}</Typography>
            {hasChanges && (
              <Chip label={t('corpus.edit.unsaved', '*')} size="small" color="warning" />
            )}
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="caption" color="text.secondary">
              {charCount.chars} {t('corpus.edit.chars', '')} | {charCount.words} {t('corpus.edit.words', '')}
            </Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Stack>
      </DialogTitle>
      
      <DialogContent dividers>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab 
              icon={<EditIcon />} 
              iconPosition="start" 
              label={t('corpus.edit.directEdit', '')} 
            />
            <Tab 
              icon={<FindReplaceIcon />} 
              iconPosition="start" 
              label={t('corpus.edit.findReplace', '')} 
            />
            <Tab 
              icon={<FilterAltIcon />} 
              iconPosition="start" 
              label={
                <Badge badgeContent={extractedEntities.length} color="secondary">
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
        
        {/* Tab 0: */}
        <TabPanel value={tabValue} index={0}>
          {isTranscript ? (
            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
              <List dense>
                {editedSegments.map((segment, idx) => (
                  <ListItem key={segment.id} sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip 
                        size="small" 
                        label={`${formatTimestamp(segment.start)} - ${formatTimestamp(segment.end)}`}
                        sx={{ minWidth: 140 }}
                      />
                      {segment.text !== segment.originalText && (
                        <Chip size="small" label={t('corpus.edit.modified', '*')} color="warning" />
                      )}
                    </Stack>
                    <TextField
                      fullWidth
                      multiline
                      size="small"
                      value={segment.text}
                      onChange={(e) => {
                        const newSegments = [...editedSegments]
                        newSegments[idx] = { ...segment, text: e.target.value }
                        setEditedSegments(newSegments)
                      }}
                      sx={{ '& .MuiInputBase-root': { fontSize: '0.9rem' } }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : (
            <TextField
              fullWidth
              multiline
              rows={15}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              placeholder={t('corpus.edit.placeholder', '')}
              sx={{ 
                '& .MuiInputBase-root': { 
                  fontFamily: 'monospace',
                  fontSize: '0.9rem'
                } 
              }}
            />
          )}
        </TabPanel>
        
        {/* Tab 1: / */}
        <TabPanel value={tabValue} index={1}>
          <Stack spacing={2}>
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
                  endAdornment: (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {useRegex && findText && (
                        <Tooltip title={regexValid ? t('corpus.edit.regexValid', 'Regex syntax valid') : regexError}>
                          {regexValid ? (
                            <CheckCircleIcon color="success" fontSize="small" />
                          ) : (
                            <ErrorIcon color="error" fontSize="small" />
                          )}
                        </Tooltip>
                      )}
                      {matchCount > 0 && (
                        <Chip size="small" label={`${matchCount} ${t('corpus.edit.matches', '')}`} />
                      )}
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
                variant="outlined" 
                onClick={() => handleReplace(false)}
                disabled={!findText || matchCount === 0}
              >
                {t('corpus.edit.replaceOne', '')}
              </Button>
              <Button 
                variant="contained" 
                onClick={() => handleReplace(true)}
                disabled={!findText || matchCount === 0}
              >
                {t('corpus.edit.replaceAll', '')}
              </Button>
            </Stack>
            
            <Divider />
            
            {/* / */}
            <Typography variant="subtitle2" color="text.secondary">
              {t('corpus.edit.preview', '')}
            </Typography>
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 2, 
                maxHeight: 300, 
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {getCurrentText()}
            </Paper>
          </Stack>
        </TabPanel>
        
        {/* Tab 2:  */}
        <TabPanel value={tabValue} index={2}>
          <Stack spacing={2}>
            <Alert severity="info">
              {t('corpus.edit.entityExtractInfo', '')}
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
              onClick={handleExtractEntities}
              startIcon={<FilterAltIcon />}
            >
              {t('corpus.edit.extractAndRemove', '')}
            </Button>
            
            {extractedEntities.length > 0 && (
              <>
                <Divider />
                <Typography variant="subtitle2">
                  {t('corpus.edit.extractedEntities', '')} ({extractedEntities.length})
                </Typography>
                <Paper variant="outlined" sx={{ p: 2, maxHeight: 200, overflow: 'auto' }}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {extractedEntities.map((entity, idx) => (
                      <Tooltip key={idx} title={entity.type}>
                        <Chip 
                          label={entity.value} 
                          size="small"
                          color={entity.type === 'email' ? 'primary' : entity.type === 'url' ? 'secondary' : 'default'}
                          onDelete={() => {
                            // 复制到剪贴板
                            navigator.clipboard.writeText(entity.value)
                          }}
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
        
        {/* Tab 3:  */}
        <TabPanel value={tabValue} index={3}>
          <Stack spacing={2}>
            <Alert severity="info">
              {t('corpus.edit.normalizeInfo', '')}
            </Alert>
            
            <Stack spacing={1}>
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={normalizeOptions.unicode} 
                    onChange={(e) => setNormalizeOptions({...normalizeOptions, unicode: e.target.checked})} 
                  />
                }
                label={
                  <Stack>
                    <Typography variant="body2">{t('corpus.edit.unicodeNormalize', 'Unicode')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('corpus.edit.unicodeNormalizeDesc', 'NFKC')}
                    </Typography>
                  </Stack>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={normalizeOptions.whitespace} 
                    onChange={(e) => setNormalizeOptions({...normalizeOptions, whitespace: e.target.checked})} 
                  />
                }
                label={
                  <Stack>
                    <Typography variant="body2">{t('corpus.edit.whitespaceNormalize', '')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('corpus.edit.whitespaceNormalizeDesc', '')}</Typography>
                  </Stack>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={normalizeOptions.removeLineBreaks} 
                    onChange={(e) => setNormalizeOptions({...normalizeOptions, removeLineBreaks: e.target.checked})} 
                  />
                }
                label={
                  <Stack>
                    <Typography variant="body2">{t('corpus.edit.removeLineBreaks', '')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('corpus.edit.removeLineBreaksDesc', '')}</Typography>
                  </Stack>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={normalizeOptions.specialChars} 
                    onChange={(e) => setNormalizeOptions({...normalizeOptions, specialChars: e.target.checked})} 
                  />
                }
                label={
                  <Stack>
                    <Typography variant="body2">{t('corpus.edit.removeSpecialChars', '')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('corpus.edit.removeSpecialCharsDesc', '')}</Typography>
                  </Stack>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={normalizeOptions.htmlTags} 
                    onChange={(e) => setNormalizeOptions({...normalizeOptions, htmlTags: e.target.checked})} 
                  />
                }
                label={
                  <Stack>
                    <Typography variant="body2">{t('corpus.edit.removeHtml', 'HTML')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('corpus.edit.removeHtmlDesc', 'HTML')}</Typography>
                  </Stack>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={normalizeOptions.controlChars} 
                    onChange={(e) => setNormalizeOptions({...normalizeOptions, controlChars: e.target.checked})} 
                  />
                }
                label={
                  <Stack>
                    <Typography variant="body2">{t('corpus.edit.removeControlChars', '')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('corpus.edit.removeControlCharsDesc', '')}</Typography>
                  </Stack>
                }
              />
            </Stack>
            
            <Button 
              variant="contained" 
              onClick={handleNormalize}
              startIcon={<CleaningServicesIcon />}
            >
              {t('corpus.edit.applyNormalize', '')}
            </Button>
          </Stack>
        </TabPanel>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button 
          startIcon={<UndoIcon />} 
          onClick={handleUndo}
          disabled={!hasChanges}
        >
          {t('corpus.edit.undoAll', '')}
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button 
          variant="contained" 
          onClick={handleSave}
          disabled={!hasChanges || saving}
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * DataSourcePanel - 数据源选择组件
 * 
 * 支持两种数据源：
 * 1. 从语料库选取存档
 * 2. 上传本地文件
 * 
 * 新增功能：
 * - 选择一个存档作为标准答案，用于计算召回率和精确率
 */

import { useState, useCallback } from 'react'
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Alert,
  CircularProgress,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Radio,
  Tooltip
} from '@mui/material'
import FolderIcon from '@mui/icons-material/Folder'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DescriptionIcon from '@mui/icons-material/Description'
import RefreshIcon from '@mui/icons-material/Refresh'
import StarIcon from '@mui/icons-material/Star'
import { useTranslation } from 'react-i18next'
import { useCorpusStore } from '../../../stores/corpusStore'
import { API_BASE_URL } from '../../../api/client'
import type { 
  ArchiveFile, 
  ArchiveInfo, 
  ValidationSummary 
} from '../../../api/reliability'
import { reliabilityApi } from '../../../api/reliability'

interface DataSourcePanelProps {
  onDataValidated: (
    data: any, 
    summary: ValidationSummary, 
    files: ArchiveFile[],
    goldStandardIndex?: number
  ) => void
  onError: (error: string) => void
}

type DataSourceType = 'corpus' | 'upload'

export default function DataSourcePanel({ 
  onDataValidated, 
  onError 
}: DataSourcePanelProps) {
  const { t } = useTranslation()
  const { corpora } = useCorpusStore()
  
  // 数据源类型
  const [sourceType, setSourceType] = useState<DataSourceType>('corpus')
  
  // 语料库选择
  const [selectedCorpus, setSelectedCorpus] = useState<string>('')
  const [archives, setArchives] = useState<ArchiveInfo[]>([])
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([])
  const [loadingArchives, setLoadingArchives] = useState(false)
  
  // 文件上传
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  
  // 标准答案选择（可选）
  const [goldStandardId, setGoldStandardId] = useState<string | null>(null)
  const [goldStandardFileIndex, setGoldStandardFileIndex] = useState<number | null>(null)
  
  // 验证状态
  const [validating, setValidating] = useState(false)
  const [validationPassed, setValidationPassed] = useState(false)
  
  // 加载语料库存档列表
  const loadArchives = useCallback(async (corpusName: string) => {
    if (!corpusName) return
    
    setLoadingArchives(true)
    try {
      const response = await reliabilityApi.listCorpusArchives(corpusName)
      if (response.success && response.data) {
        setArchives(response.data.archives)
      }
    } catch (error) {
      console.error('Failed to load archives:', error)
      onError('加载存档列表失败')
    } finally {
      setLoadingArchives(false)
    }
  }, [onError])
  
  // 处理语料库选择
  const handleCorpusChange = (corpusName: string) => {
    setSelectedCorpus(corpusName)
    setSelectedArchiveIds([])
    setGoldStandardId(null)
    setValidationPassed(false)
    if (corpusName) {
      loadArchives(corpusName)
    }
  }
  
  // 刷新存档列表
  const handleRefreshArchives = () => {
    if (selectedCorpus) {
      loadArchives(selectedCorpus)
    }
  }
  
  // 处理存档选择
  const handleArchiveToggle = (archiveId: string) => {
    setSelectedArchiveIds(prev => {
      const newIds = prev.includes(archiveId)
        ? prev.filter(id => id !== archiveId)
        : [...prev, archiveId]
      
      // 如果取消选择的存档是标准答案，清除标准答案
      if (!newIds.includes(archiveId) && goldStandardId === archiveId) {
        setGoldStandardId(null)
      }
      
      return newIds
    })
    setValidationPassed(false)
  }
  
  // 处理标准答案选择
  const handleGoldStandardSelect = (archiveId: string) => {
    setGoldStandardId(prev => prev === archiveId ? null : archiveId)
    setValidationPassed(false)
  }
  
  // 处理文件上传
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      setUploadedFiles(Array.from(files))
      setGoldStandardFileIndex(null)
      setValidationPassed(false)
    }
  }
  
  // 处理上传文件的标准答案选择
  const handleGoldStandardFileSelect = (index: number) => {
    setGoldStandardFileIndex(prev => prev === index ? null : index)
    setValidationPassed(false)
  }
  
  // 验证数据
  const handleValidate = async () => {
    setValidating(true)
    setValidationPassed(false)
    
    try {
      let filesToValidate: ArchiveFile[] = []
      
      if (sourceType === 'corpus') {
        // 从语料库加载存档内容
        if (selectedArchiveIds.length < 2) {
          onError('请至少选择2个存档')
          setValidating(false)
          return
        }
        
        // 加载存档内容
        for (const archiveId of selectedArchiveIds) {
          const archive = archives.find(a => a.id === archiveId)
          if (archive) {
            try {
              // 使用完整的 API URL 加载存档
              const response = await fetch(
                `${API_BASE_URL}/api/annotation/load/${encodeURIComponent(selectedCorpus)}/${archiveId}`
              )
              const result = await response.json()
              console.log('[Reliability] Load archive response:', archiveId, result)
              // 后端返回格式为 { success: true, data: archive }
              const archiveData = result.data
              if (result.success && archiveData) {
                console.log('[Reliability] Archive data loaded:', archive.filename, 'annotations:', archiveData.annotations?.length)
                filesToValidate.push({
                  name: archive.filename,
                  content: JSON.stringify(archiveData)
                })
              } else {
                console.error('[Reliability] Failed to get archive data:', archiveId, result)
              }
            } catch (e) {
              console.error('[Reliability] Failed to load archive:', archiveId, e)
            }
          }
        }
        
        console.log('[Reliability] Files to validate:', filesToValidate.length, filesToValidate.map(f => f.name))
      } else {
        // 从上传的文件
        if (uploadedFiles.length < 2) {
          onError('请至少上传2个文件')
          setValidating(false)
          return
        }
        
        for (const file of uploadedFiles) {
          const archiveFile = await reliabilityApi.readFileAsArchive(file)
          filesToValidate.push(archiveFile)
        }
      }
      
      if (filesToValidate.length < 2) {
        onError('有效文件数量不足')
        setValidating(false)
        return
      }
      
      // 验证文件
      const result = await reliabilityApi.validateFiles(filesToValidate)
      
      if (result.success && result.data && result.summary) {
        setValidationPassed(true)
        
        // 计算标准答案在文件列表中的索引
        let goldIndex: number | undefined = undefined
        if (sourceType === 'corpus' && goldStandardId) {
          goldIndex = selectedArchiveIds.indexOf(goldStandardId)
          if (goldIndex === -1) goldIndex = undefined
        } else if (sourceType === 'upload' && goldStandardFileIndex !== null) {
          goldIndex = goldStandardFileIndex
        }
        
        onDataValidated(result.data, result.summary, filesToValidate, goldIndex)
      } else {
        onError(result.error || '验证失败')
      }
    } catch (error) {
      console.error('Validation error:', error)
      onError('验证过程出错')
    } finally {
      setValidating(false)
    }
  }
  
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {t('reliability.dataSource', '数据来源')}
      </Typography>
      
      {/* 数据源类型选择 */}
      <ToggleButtonGroup
        value={sourceType}
        exclusive
        onChange={(_, value) => value && setSourceType(value)}
        sx={{ mb: 2 }}
        fullWidth
      >
        <ToggleButton value="corpus">
          <FolderIcon sx={{ mr: 1 }} />
          {t('reliability.fromCorpus', '从语料库选取')}
        </ToggleButton>
        <ToggleButton value="upload">
          <UploadFileIcon sx={{ mr: 1 }} />
          {t('reliability.uploadFiles', '上传文件')}
        </ToggleButton>
      </ToggleButtonGroup>
      
      <Divider sx={{ my: 2 }} />
      
      {sourceType === 'corpus' ? (
        // 语料库选择模式
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('corpus.selectCorpus', '选择语料库')}</InputLabel>
              <Select
                value={selectedCorpus}
                onChange={(e) => handleCorpusChange(e.target.value)}
                label={t('corpus.selectCorpus', '选择语料库')}
              >
                {corpora.map(corpus => (
                  <MenuItem key={corpus.id} value={corpus.name}>
                    {corpus.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedCorpus && (
              <Button
                variant="outlined"
                size="small"
                onClick={handleRefreshArchives}
                disabled={loadingArchives}
                sx={{ minWidth: 40 }}
                title={t('common.refresh', '刷新')}
              >
                <RefreshIcon />
              </Button>
            )}
          </Box>
          
          {loadingArchives ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : archives.length > 0 ? (
            <>
              <Typography variant="body2" color="text.secondary">
                {t('reliability.selectArchives', '选择存档（至少2个）')}
              </Typography>
              <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
                <List dense disablePadding>
                  {archives.map(archive => (
                    <ListItemButton
                      key={archive.id}
                      onClick={() => handleArchiveToggle(archive.id)}
                      sx={{
                        bgcolor: goldStandardId === archive.id ? 'warning.50' : 'inherit',
                        borderLeft: goldStandardId === archive.id ? '3px solid' : 'none',
                        borderColor: 'warning.main'
                      }}
                    >
                      <ListItemIcon>
                        <Checkbox
                          edge="start"
                          checked={selectedArchiveIds.includes(archive.id)}
                          tabIndex={-1}
                          disableRipple
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {archive.textName || archive.filename}
                            {goldStandardId === archive.id && (
                              <Chip
                                icon={<StarIcon sx={{ fontSize: 14 }} />}
                                label={t('reliability.goldStandard', '标准答案')}
                                size="small"
                                color="warning"
                                sx={{ height: 20, fontSize: '10px', maxWidth: 100, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                              />
                            )}
                          </Box>
                        }
                        secondary={`${archive.annotationCount} 条标注 - ${archive.timestamp}`}
                      />
                      {selectedArchiveIds.includes(archive.id) && (
                        <Tooltip title={t('reliability.setAsGoldStandard', '设为标准答案')}>
                          <Radio
                            checked={goldStandardId === archive.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleGoldStandardSelect(archive.id)
                            }}
                            size="small"
                            color="warning"
                          />
                        </Tooltip>
                      )}
                    </ListItemButton>
                  ))}
                </List>
              </Paper>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {selectedArchiveIds.length > 0 && (
                  <Chip
                    label={`${t('reliability.selected', '已选择')} ${selectedArchiveIds.length} ${t('reliability.archives', '个存档')}`}
                    color={selectedArchiveIds.length >= 2 ? 'success' : 'warning'}
                  />
                )}
                {goldStandardId && (
                  <Chip
                    icon={<StarIcon />}
                    label={t('reliability.goldStandardSet', '已设置标准答案')}
                    color="warning"
                    variant="outlined"
                    onDelete={() => setGoldStandardId(null)}
                  />
                )}
              </Stack>
              {selectedArchiveIds.length >= 2 && !goldStandardId && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  {t('reliability.goldStandardHint', '可选：点击已选存档右侧的单选按钮将其设为标准答案，计算召回率和精确率')}
                </Alert>
              )}
            </>
          ) : selectedCorpus ? (
            <Alert severity="info">
              {t('reliability.noArchives', '该语料库暂无存档')}
            </Alert>
          ) : null}
        </Stack>
      ) : (
        // 文件上传模式
        <Stack spacing={2}>
          <Button
            variant="outlined"
            component="label"
            startIcon={<UploadFileIcon />}
            fullWidth
          >
            {t('reliability.selectFiles', '选择JSON文件（至少2个）')}
            <input
              type="file"
              hidden
              multiple
              accept=".json"
              onChange={handleFileUpload}
            />
          </Button>
          
          {uploadedFiles.length > 0 && (
            <>
              <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
                <List dense disablePadding>
                  {uploadedFiles.map((file, index) => (
                    <ListItemButton 
                      key={index}
                      sx={{
                        bgcolor: goldStandardFileIndex === index ? 'warning.50' : 'inherit',
                        borderLeft: goldStandardFileIndex === index ? '3px solid' : 'none',
                        borderColor: 'warning.main'
                      }}
                    >
                      <ListItemIcon>
                        <DescriptionIcon />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {file.name}
                            {goldStandardFileIndex === index && (
                              <Chip
                                icon={<StarIcon sx={{ fontSize: 14 }} />}
                                label={t('reliability.goldStandard', '标准答案')}
                                size="small"
                                color="warning"
                                sx={{ height: 20, fontSize: '10px', maxWidth: 100, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                              />
                            )}
                          </Box>
                        }
                        secondary={`${(file.size / 1024).toFixed(1)} KB`}
                      />
                      <Tooltip title={t('reliability.setAsGoldStandard', '设为标准答案')}>
                        <Radio
                          checked={goldStandardFileIndex === index}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleGoldStandardFileSelect(index)
                          }}
                          size="small"
                          color="warning"
                        />
                      </Tooltip>
                    </ListItemButton>
                  ))}
                </List>
              </Paper>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  label={`${t('reliability.selected', '已选择')} ${uploadedFiles.length} ${t('reliability.files', '个文件')}`}
                  color={uploadedFiles.length >= 2 ? 'success' : 'warning'}
                />
                {goldStandardFileIndex !== null && (
                  <Chip
                    icon={<StarIcon />}
                    label={t('reliability.goldStandardSet', '已设置标准答案')}
                    color="warning"
                    variant="outlined"
                    onDelete={() => setGoldStandardFileIndex(null)}
                  />
                )}
              </Stack>
              {uploadedFiles.length >= 2 && goldStandardFileIndex === null && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  {t('reliability.goldStandardHint', '可选：点击文件右侧的单选按钮将其设为标准答案，计算召回率和精确率')}
                </Alert>
              )}
            </>
          )}
        </Stack>
      )}
      
      <Divider sx={{ my: 2 }} />
      
      {/* 验证按钮 */}
      <Button
        variant="contained"
        fullWidth
        onClick={handleValidate}
        disabled={
          validating || 
          (sourceType === 'corpus' && selectedArchiveIds.length < 2) ||
          (sourceType === 'upload' && uploadedFiles.length < 2)
        }
        startIcon={validating ? <CircularProgress size={16} /> : 
          validationPassed ? <CheckCircleIcon /> : null}
        color={validationPassed ? 'success' : 'primary'}
      >
        {validating 
          ? t('reliability.validating', '验证中...') 
          : validationPassed 
            ? t('reliability.validated', '验证通过')
            : t('reliability.validate', '验证并加载数据')
        }
      </Button>
    </Box>
  )
}


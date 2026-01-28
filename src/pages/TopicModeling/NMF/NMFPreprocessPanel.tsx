/**
 * NMF Preprocess Panel
 * POS filtering + language-specific preprocessing + preview
 * Reuses LDA preprocessing service
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  FormControlLabel,
  Checkbox,
  Button,
  CircularProgress,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  FormControl,
  RadioGroup,
  Radio,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip
} from '@mui/material'
import { NumberInput } from '../../../components/common'
import PreviewIcon from '@mui/icons-material/Preview'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import CheckIcon from '@mui/icons-material/Check'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import { useTranslation } from 'react-i18next'
import type { NMFPreprocessConfig, POSTagInfo } from '../../../types/topicModeling'
import { topicModelingApi, previewNMFPreprocess } from '../../../api/topicModeling'

interface NMFPreprocessPanelProps {
  corpusId: string
  textIds: string[]
  language: string
  config: NMFPreprocessConfig
  onConfigChange: (config: NMFPreprocessConfig) => void
}

// Group POS tags by category
const POS_CATEGORIES = {
  content: ['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN'],
  function: ['ADP', 'AUX', 'CCONJ', 'DET', 'PART', 'PRON', 'SCONJ'],
  other: ['INTJ', 'NUM', 'PUNCT', 'SYM', 'X']
}

interface PreviewItem {
  text_id: string
  original: string
  processed: string
  original_tokens: number
  final_tokens: number
}

export default function NMFPreprocessPanel({
  corpusId,
  textIds,
  language,
  config,
  onConfigChange
}: NMFPreprocessPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  
  // POS tags
  const [posTags, setPosTags] = useState<POSTagInfo[]>([])
  const [posExpanded, setPosExpanded] = useState(false)
  
  // Preview
  const [previewing, setPreviewing] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreviewItem[] | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [selectedPreview, setSelectedPreview] = useState<PreviewItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  
  // Load POS tags on mount
  useEffect(() => {
    loadPOSTags()
  }, [])
  
  const loadPOSTags = async () => {
    try {
      const response = await topicModelingApi.getLDAPOSTags()
      if (response.success && response.data) {
        setPosTags(response.data.tags)
      }
    } catch (err) {
      console.error('Failed to load POS tags:', err)
    }
  }
  
  // Handle config change
  const handleConfigChange = (key: keyof NMFPreprocessConfig, value: unknown) => {
    onConfigChange({ ...config, [key]: value })
  }
  
  // Toggle POS tag selection
  const handleTogglePOS = (tag: string) => {
    const newSelected = config.pos_filter.includes(tag)
      ? config.pos_filter.filter(p => p !== tag)
      : [...config.pos_filter, tag]
    handleConfigChange('pos_filter', newSelected)
  }
  
  // Select all POS tags
  const handleSelectAllPOS = () => {
    handleConfigChange('pos_filter', posTags.map(p => p.tag))
  }
  
  // Clear all POS tags
  const handleClearAllPOS = () => {
    handleConfigChange('pos_filter', [])
  }
  
  // Get display label for POS tag
  const getTagLabel = (tag: string) => {
    const tagInfo = posTags.find(p => p.tag === tag)
    if (!tagInfo) return tag
    return isZh ? tagInfo.description_zh : tagInfo.description_en
  }
  
  // Get tooltip for POS tag
  const getTagTooltip = (tag: string) => {
    const tagInfo = posTags.find(p => p.tag === tag)
    if (!tagInfo) return tag
    return `${tag}: ${isZh ? tagInfo.description_zh : tagInfo.description_en}`
  }
  
  // Render POS category
  const renderPOSCategory = (categoryKey: string, tags: string[]) => {
    const categoryTags = tags.filter(tag => posTags.some(p => p.tag === tag))
    if (categoryTags.length === 0) return null
    
    const categoryNames: Record<string, { en: string; zh: string }> = {
      content: { en: 'Content Words', zh: '实词' },
      function: { en: 'Function Words', zh: '虚词' },
      other: { en: 'Other', zh: '其他' }
    }
    
    return (
      <Box key={categoryKey} sx={{ mb: 1.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 0.5 }}
        >
          {isZh ? categoryNames[categoryKey].zh : categoryNames[categoryKey].en}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.5}>
          {categoryTags.map(tag => (
            <Tooltip key={tag} title={getTagTooltip(tag)} arrow>
              <Chip
                label={`${tag} (${getTagLabel(tag)})`}
                size="small"
                onClick={() => handleTogglePOS(tag)}
                color={config.pos_filter.includes(tag) ? 'primary' : 'default'}
                variant={config.pos_filter.includes(tag) ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.75rem', height: 26 }}
              />
            </Tooltip>
          ))}
        </Stack>
      </Box>
    )
  }
  
  // Handle preview
  const handlePreview = async () => {
    if (!corpusId || textIds.length === 0) {
      setPreviewError(t('topicModeling.nmf.selectTextsFirst', 'Please select texts first'))
      return
    }
    
    setPreviewing(true)
    setPreviewError(null)
    
    try {
      const response = await previewNMFPreprocess(
        corpusId,
        textIds,
        language,
        config,
        5
      )
      
      if (response.success && response.data) {
        setPreviewResult(response.data.previews)
      } else {
        setPreviewError(response.error || 'Preview failed')
      }
    } catch (err) {
      setPreviewError(String(err))
    } finally {
      setPreviewing(false)
    }
  }
  
  // Handle preview item click
  const handlePreviewClick = (item: PreviewItem) => {
    setSelectedPreview(item)
    setDialogOpen(true)
  }
  
  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {t('topicModeling.nmf.preprocess.title', 'Preprocessing')}
      </Typography>
      
      <Stack spacing={2}>
        {/* Language info */}
        <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('topicModeling.nmf.preprocess.languageInfo', 'Language')}: {' '}
            <Chip
              label={language === 'chinese' ? t('corpus.chinese', 'Chinese') : t('corpus.english', 'English')}
              size="small"
              color="primary"
              variant="outlined"
            />
            {language === 'chinese' && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                ({t('topicModeling.nmf.preprocess.jiebaTokenize', 'jieba tokenization')})
              </Typography>
            )}
          </Typography>
        </Box>
        
        {/* Basic preprocessing options - 2x2 grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={config.remove_stopwords}
                onChange={(e) => handleConfigChange('remove_stopwords', e.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                {t('topicModeling.nmf.preprocess.removeStopwords', 'Remove stopwords')}
              </Typography>
            }
          />
          
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={config.remove_punctuation}
                onChange={(e) => handleConfigChange('remove_punctuation', e.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                {t('topicModeling.nmf.preprocess.removePunctuation', 'Remove punct.')}
              </Typography>
            }
          />
          
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={config.lemmatize}
                onChange={(e) => handleConfigChange('lemmatize', e.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                {t('topicModeling.nmf.preprocess.lemmatize', 'Lemmatize')}
              </Typography>
            }
          />
          
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={config.lowercase}
                onChange={(e) => handleConfigChange('lowercase', e.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                {t('topicModeling.nmf.preprocess.lowercase', 'Lowercase')}
              </Typography>
            }
          />
        </Box>
        
        {/* Min word length */}
        <NumberInput
          label={t('topicModeling.nmf.preprocess.minWordLength', 'Min word length')}
          size="small"
          value={config.min_word_length}
          onChange={(val) => handleConfigChange('min_word_length', val)}
          min={1}
          max={10}
          integer
          fullWidth
        />
        
        {/* Document Frequency Filter */}
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('topicModeling.nmf.preprocess.dfFilter', 'Document Frequency Filter')}
          </Typography>
          <Stack direction="row" spacing={2}>
            <NumberInput
              label={t('topicModeling.nmf.preprocess.minDf', 'Min DF')}
              size="small"
              value={config.min_df}
              onChange={(val) => handleConfigChange('min_df', val)}
              min={1}
              max={100}
              integer
              sx={{ flex: 1 }}
              helperText={t('topicModeling.nmf.preprocess.minDfHelp', 'Min docs containing word')}
            />
            <NumberInput
              label={t('topicModeling.nmf.preprocess.maxDf', 'Max DF')}
              size="small"
              value={config.max_df}
              onChange={(val) => handleConfigChange('max_df', val)}
              min={0.1}
              max={1.0}
              step={0.05}
              sx={{ flex: 1 }}
              helperText={t('topicModeling.nmf.preprocess.maxDfHelp', 'Max ratio of docs')}
            />
          </Stack>
        </Box>
        
        {/* POS Filter Accordion */}
        <Accordion
          expanded={posExpanded}
          onChange={(_, isExpanded) => setPosExpanded(isExpanded)}
          sx={{
            '&:before': { display: 'none' },
            boxShadow: 'none',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <FilterListIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">
                {t('wordFrequency.posFilter.title', 'POS Filter')}
              </Typography>
              {config.pos_filter.length > 0 && (
                <Chip
                  label={config.pos_filter.length}
                  size="small"
                  color="primary"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Stack>
          </AccordionSummary>
          
          <AccordionDetails>
            {/* Mode selection */}
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <RadioGroup
                row
                value={config.pos_keep_mode ? 'keep' : 'filter'}
                onChange={(e) => handleConfigChange('pos_keep_mode', e.target.value === 'keep')}
              >
                <FormControlLabel
                  value="keep"
                  control={<Radio size="small" />}
                  label={
                    <Typography variant="body2">
                      {t('wordFrequency.posFilter.keepMode', 'Keep mode')}
                    </Typography>
                  }
                />
                <FormControlLabel
                  value="filter"
                  control={<Radio size="small" />}
                  label={
                    <Typography variant="body2">
                      {t('wordFrequency.posFilter.filterMode', 'Filter mode')}
                    </Typography>
                  }
                />
              </RadioGroup>
            </FormControl>
            
            {/* Quick actions */}
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button
                size="small"
                startIcon={<CheckIcon />}
                onClick={handleSelectAllPOS}
                variant="outlined"
              >
                {t('common.selectAll')}
              </Button>
              <Button
                size="small"
                startIcon={<ClearAllIcon />}
                onClick={handleClearAllPOS}
                variant="outlined"
              >
                {t('common.clearAll')}
              </Button>
            </Stack>
            
            {/* POS tag groups */}
            {renderPOSCategory('content', POS_CATEGORIES.content)}
            {renderPOSCategory('function', POS_CATEGORIES.function)}
            {renderPOSCategory('other', POS_CATEGORIES.other)}
            
            {/* Mode description */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {config.pos_keep_mode
                ? t('wordFrequency.posFilter.keepModeDesc', 'Only keep words with selected POS tags')
                : t('wordFrequency.posFilter.filterModeDesc', 'Remove words with selected POS tags')
              }
            </Typography>
          </AccordionDetails>
        </Accordion>
        
        {/* Preview Button */}
        <Button
          variant="outlined"
          startIcon={previewing ? <CircularProgress size={16} /> : <PreviewIcon />}
          onClick={handlePreview}
          disabled={previewing || !corpusId || textIds.length === 0}
          fullWidth
        >
          {t('topicModeling.preprocess.preview', 'Preview')}
        </Button>
        
        {/* Error */}
        {previewError && (
          <Alert severity="error" onClose={() => setPreviewError(null)}>
            {previewError}
          </Alert>
        )}
        
        {/* Preview Result */}
        {previewResult && previewResult.length > 0 && (
          <Box>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <Typography variant="body2" color="text.secondary">
                {t('topicModeling.preprocess.previewResult', 'Preview')} ({previewResult.length} {t('common.items')})
              </Typography>
            </Stack>
            
            <Stack spacing={1} sx={{ maxHeight: 300, overflow: 'auto' }}>
              {previewResult.map((preview, index) => (
                <Paper
                  key={index}
                  variant="outlined"
                  sx={{
                    p: 1,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'action.hover',
                      borderColor: 'primary.main'
                    }
                  }}
                  onClick={() => handlePreviewClick(preview)}
                >
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                    <Chip
                      label={`#${index + 1}`}
                      size="small"
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {preview.original_tokens} -&gt; {preview.final_tokens} tokens
                    </Typography>
                    <Typography variant="caption" color="primary.main" sx={{ ml: 'auto' }}>
                      {t('common.clickToView', 'Click to view')}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{
                      bgcolor: 'action.hover',
                      p: 0.5,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      maxHeight: 60,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical'
                    }}
                  >
                    {preview.processed || '(empty)'}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
      
      {/* Preview Detail Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6">
              {t('topicModeling.nmf.preprocess.detail', 'Preprocessing Detail')}
            </Typography>
            {selectedPreview && (
              <>
                <Chip
                  label={`${selectedPreview.original_tokens} tokens`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={`-> ${selectedPreview.final_tokens} tokens`}
                  size="small"
                  color="primary"
                />
              </>
            )}
          </Stack>
          <IconButton onClick={() => setDialogOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedPreview && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {t('topicModeling.nmf.preprocess.original', 'Original')}:
                </Typography>
                <Box sx={{
                  bgcolor: 'action.hover',
                  p: 2,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '30vh',
                  overflow: 'auto'
                }}>
                  {selectedPreview.original}
                </Box>
              </Box>
              
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {t('topicModeling.nmf.preprocess.processed', 'Processed')}:
                </Typography>
                <Box sx={{
                  bgcolor: 'success.light',
                  p: 2,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '30vh',
                  overflow: 'auto',
                  opacity: 0.9
                }}>
                  {selectedPreview.processed || '(empty)'}
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

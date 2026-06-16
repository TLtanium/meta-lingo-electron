/**
 * Collocation Collocate POS Filter Dialog
 * Dialog form for filtering collocate words by POS tag.
 * Design consistent with CollocationPOSFilter / POSFilterPanel (accordion style inside a dialog).
 */

import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Stack,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Tooltip,
  IconButton
} from '@mui/material'
import FilterListIcon from '@mui/icons-material/FilterList'
import CheckIcon from '@mui/icons-material/Check'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import RestoreIcon from '@mui/icons-material/Restore'
import { useTranslation } from 'react-i18next'
import type { POSFilterConfig, POSTagInfo } from '../../../types/wordFrequency'
import { DEFAULT_COLLOCATE_POS_FILTER } from '../../../types/collocationAnalysis'

interface CollocationCollocatePOSDialogProps {
  open: boolean
  onClose: () => void
  config: POSFilterConfig
  onConfigChange: (config: POSFilterConfig) => void
  posTags: POSTagInfo[]
}

const POS_CATEGORIES = {
  content: ['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN'],
  function: ['ADP', 'AUX', 'CCONJ', 'DET', 'PART', 'PRON', 'SCONJ'],
  other: ['INTJ', 'NUM', 'PUNCT', 'SYM', 'X']
}

export default function CollocationCollocatePOSDialog({
  open,
  onClose,
  config,
  onConfigChange,
  posTags
}: CollocationCollocatePOSDialogProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  const [localConfig, setLocalConfig] = useState<POSFilterConfig>(config)

  const handleEnter = () => {
    setLocalConfig({ ...config })
  }

  const handleTogglePOS = (tag: string) => {
    const newSelected = localConfig.selectedPOS.includes(tag)
      ? localConfig.selectedPOS.filter(p => p !== tag)
      : [...localConfig.selectedPOS, tag]
    setLocalConfig({ ...localConfig, selectedPOS: newSelected })
  }

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalConfig({ ...localConfig, keepMode: event.target.value === 'keep' })
  }

  const handleSelectAll = () => {
    setLocalConfig({ ...localConfig, selectedPOS: posTags.map(p => p.tag) })
  }

  const handleClearAll = () => {
    setLocalConfig({ ...localConfig, selectedPOS: [] })
  }

  const handleReset = () => {
    setLocalConfig({ ...DEFAULT_COLLOCATE_POS_FILTER })
  }

  const handleSave = () => {
    onConfigChange(localConfig)
    onClose()
  }

  const getTagLabel = (tag: string) => {
    const tagInfo = posTags.find(p => p.tag === tag)
    if (!tagInfo) return tag
    return isZh ? tagInfo.description_zh : tagInfo.description_en
  }

  const getTagTooltip = (tag: string) => {
    const tagInfo = posTags.find(p => p.tag === tag)
    if (!tagInfo) return tag
    return `${tag}: ${isZh ? tagInfo.description_zh : tagInfo.description_en}`
  }

  const categoryNames: Record<string, { en: string; zh: string }> = {
    content: { en: 'Content Words', zh: '实词' },
    function: { en: 'Function Words', zh: '虚词' },
    other: { en: 'Other', zh: '其他' }
  }

  const renderCategory = (categoryKey: string, tags: string[]) => {
    const categoryTags = tags.filter(tag => posTags.some(p => p.tag === tag))
    if (categoryTags.length === 0) return null
    return (
      <Box key={categoryKey} sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {isZh ? categoryNames[categoryKey].zh : categoryNames[categoryKey].en}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.5}>
          {categoryTags.map(tag => (
            <Tooltip key={tag} title={getTagTooltip(tag)} arrow>
              <Chip
                label={`${tag} (${getTagLabel(tag)})`}
                size="small"
                onClick={() => handleTogglePOS(tag)}
                color={localConfig.selectedPOS.includes(tag) ? 'primary' : 'default'}
                variant={localConfig.selectedPOS.includes(tag) ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.75rem', height: 26 }}
              />
            </Tooltip>
          ))}
        </Stack>
      </Box>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ onEnter: handleEnter }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <FilterListIcon fontSize="small" color="action" />
            <Typography variant="h6">
              {t('collocationAnalysis.collocatePosFilter.title')}
            </Typography>
            {localConfig.selectedPOS.length > 0 && (
              <Chip
                label={localConfig.selectedPOS.length}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Stack>
          <Tooltip title={t('collocationAnalysis.statistics.reset')}>
            <IconButton size="small" onClick={handleReset}>
              <RestoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('collocationAnalysis.collocatePosFilter.description')}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {/* Mode selection */}
        <FormControl component="fieldset" sx={{ mb: 2 }}>
          <RadioGroup
            row
            value={localConfig.keepMode ? 'keep' : 'filter'}
            onChange={handleModeChange}
          >
            <FormControlLabel
              value="keep"
              control={<Radio size="small" />}
              label={<Typography variant="body2">{t('collocationAnalysis.collocatePosFilter.keepMode')}</Typography>}
            />
            <FormControlLabel
              value="filter"
              control={<Radio size="small" />}
              label={<Typography variant="body2">{t('collocationAnalysis.collocatePosFilter.filterMode')}</Typography>}
            />
          </RadioGroup>
        </FormControl>

        {/* Quick actions */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button size="small" startIcon={<CheckIcon />} onClick={handleSelectAll} variant="outlined">
            {t('common.selectAll')}
          </Button>
          <Button size="small" startIcon={<ClearAllIcon />} onClick={handleClearAll} variant="outlined">
            {t('common.clearAll')}
          </Button>
        </Stack>

        {/* POS tag groups */}
        {renderCategory('content', POS_CATEGORIES.content)}
        {renderCategory('function', POS_CATEGORIES.function)}
        {renderCategory('other', POS_CATEGORIES.other)}

        {/* Mode hint */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {localConfig.keepMode
            ? t('collocationAnalysis.collocatePosFilter.keepHint')
            : t('collocationAnalysis.collocatePosFilter.filterHint')
          }
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={handleSave}>{t('common.confirm')}</Button>
      </DialogActions>
    </Dialog>
  )
}

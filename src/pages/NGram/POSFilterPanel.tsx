/**
 * POS Filter Panel Component for N-gram Analysis
 * Provides SpaCy Universal POS tag filtering with keep/filter modes
 * Note: In N-gram analysis, ALL words in the N-gram must match the POS filter
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Chip,
  Stack,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Tooltip,
  Alert
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import CheckIcon from '@mui/icons-material/Check'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import { useTranslation } from 'react-i18next'
import type { POSFilterConfig, POSTagInfo } from '../../types/ngram'

interface POSFilterPanelProps {
  config: POSFilterConfig
  onChange: (config: POSFilterConfig) => void
  posTags: POSTagInfo[]
  disabled?: boolean
}

// Group POS tags by category for better organization
const POS_CATEGORIES = {
  content: ['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN'],
  function: ['ADP', 'AUX', 'CCONJ', 'DET', 'PART', 'PRON', 'SCONJ'],
  other: ['INTJ', 'NUM', 'PUNCT', 'SYM', 'X']
}

export default function POSFilterPanel({
  config,
  onChange,
  posTags,
  disabled = false
}: POSFilterPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [expanded, setExpanded] = useState(false)

  // Toggle a POS tag selection
  const handleTogglePOS = (tag: string) => {
    const newSelected = config.selectedPOS.includes(tag)
      ? config.selectedPOS.filter(p => p !== tag)
      : [...config.selectedPOS, tag]
    
    onChange({
      ...config,
      selectedPOS: newSelected
    })
  }

  // Toggle keep/filter mode
  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      keepMode: event.target.value === 'keep'
    })
  }

  // Select all POS tags
  const handleSelectAll = () => {
    onChange({
      ...config,
      selectedPOS: posTags.map(p => p.tag)
    })
  }

  // Clear all POS tags
  const handleClearAll = () => {
    onChange({
      ...config,
      selectedPOS: []
    })
  }

  // Get display label for a POS tag
  const getTagLabel = (tag: string) => {
    const tagInfo = posTags.find(p => p.tag === tag)
    if (!tagInfo) return tag
    return isZh ? tagInfo.description_zh : tagInfo.description_en
  }

  // Get full description for tooltip
  const getTagTooltip = (tag: string) => {
    const tagInfo = posTags.find(p => p.tag === tag)
    if (!tagInfo) return tag
    return `${tag}: ${isZh ? tagInfo.description_zh : tagInfo.description_en}`
  }

  // Render POS tags in a category
  const renderCategory = (categoryKey: string, tags: string[]) => {
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
                color={config.selectedPOS.includes(tag) ? 'primary' : 'default'}
                variant={config.selectedPOS.includes(tag) ? 'filled' : 'outlined'}
                disabled={disabled}
                sx={{ 
                  fontSize: '0.75rem',
                  height: 26
                }}
              />
            </Tooltip>
          ))}
        </Stack>
      </Box>
    )
  }

  return (
    <Accordion 
      expanded={expanded} 
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      disabled={disabled}
      sx={{ 
        '&:before': { display: 'none' },
        boxShadow: 'none',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        '&.Mui-disabled': { bgcolor: 'transparent' }
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <FilterListIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            {t('ngram.posFilter.title')}
          </Typography>
          {config.selectedPOS.length > 0 && (
            <Chip 
              label={config.selectedPOS.length} 
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
            value={config.keepMode ? 'keep' : 'filter'}
            onChange={handleModeChange}
          >
            <FormControlLabel
              value="keep"
              control={<Radio size="small" />}
              label={
                <Typography variant="body2">
                  {t('ngram.posFilter.keepMode')}
                </Typography>
              }
            />
            <FormControlLabel
              value="filter"
              control={<Radio size="small" />}
              label={
                <Typography variant="body2">
                  {t('ngram.posFilter.filterMode')}
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
            onClick={handleSelectAll}
            variant="outlined"
          >
            {t('common.selectAll')}
          </Button>
          <Button
            size="small"
            startIcon={<ClearAllIcon />}
            onClick={handleClearAll}
            variant="outlined"
          >
            {t('common.clearAll')}
          </Button>
        </Stack>

        {/* POS tag groups */}
        {renderCategory('content', POS_CATEGORIES.content)}
        {renderCategory('function', POS_CATEGORIES.function)}
        {renderCategory('other', POS_CATEGORIES.other)}

        {/* Mode description */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {config.keepMode
            ? t('ngram.posFilter.keepModeDesc')
            : t('ngram.posFilter.filterModeDesc')
          }
        </Typography>

      </AccordionDetails>
    </Accordion>
  )
}

/**
 * Search Configuration Panel for N-gram Analysis
 * Includes frequency filters, search type, exclude words, lowercase toggle
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  TextField,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
  Divider,
  Tooltip
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type { SearchConfig, SearchType } from '../../types/ngram'

interface SearchConfigPanelProps {
  config: SearchConfig
  onChange: (config: SearchConfig) => void
  minFreq: number
  maxFreq: number | null
  minWordLength: number
  lowercase: boolean
  onMinFreqChange: (value: number) => void
  onMaxFreqChange: (value: number | null) => void
  onMinWordLengthChange: (value: number) => void
  onLowercaseChange: (value: boolean) => void
  disabled?: boolean
}

const SEARCH_TYPE_OPTIONS: { value: SearchType; labelKey: string; descKey: string }[] = [
  { value: 'all', labelKey: 'ngram.search.typeAll', descKey: 'ngram.search.typeAllDesc' },
  { value: 'starts', labelKey: 'ngram.search.typeStarts', descKey: 'ngram.search.typeStartsDesc' },
  { value: 'ends', labelKey: 'ngram.search.typeEnds', descKey: 'ngram.search.typeEndsDesc' },
  { value: 'contains', labelKey: 'ngram.search.typeContains', descKey: 'ngram.search.typeContainsDesc' },
  { value: 'contains_word', labelKey: 'ngram.search.typeContainsWord', descKey: 'ngram.search.typeContainsWordDesc' },
  { value: 'regex', labelKey: 'ngram.search.typeRegex', descKey: 'ngram.search.typeRegexDesc' },
  { value: 'wordlist', labelKey: 'ngram.search.typeWordlist', descKey: 'ngram.search.typeWordlistDesc' }
]

export default function SearchConfigPanel({
  config,
  onChange,
  minFreq,
  maxFreq,
  minWordLength,
  lowercase,
  onMinFreqChange,
  onMaxFreqChange,
  onMinWordLengthChange,
  onLowercaseChange,
  disabled = false
}: SearchConfigPanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // Handle search type change
  const handleSearchTypeChange = (type: SearchType) => {
    onChange({
      ...config,
      searchType: type
    })
  }

  // Handle search value change
  const handleSearchValueChange = (value: string) => {
    onChange({
      ...config,
      searchValue: value
    })
  }

  // Local state for exclude words text (allows multiline editing)
  const [excludeWordsText, setExcludeWordsText] = useState(config.excludeWords.join('\n'))

  // Sync local state when config changes from outside
  useEffect(() => {
    setExcludeWordsText(config.excludeWords.join('\n'))
  }, [config.excludeWords])

  // Handle exclude words text change (keep raw text for editing)
  const handleExcludeWordsChange = (value: string) => {
    setExcludeWordsText(value)
  }

  // Handle exclude words blur (save to config)
  const handleExcludeWordsBlur = () => {
    const words = excludeWordsText.split('\n').map(w => w.trim()).filter(w => w)
    onChange({
      ...config,
      excludeWords: words
    })
  }

  // Get current search type description
  const getCurrentSearchTypeDesc = () => {
    const option = SEARCH_TYPE_OPTIONS.find(o => o.value === config.searchType)
    return option ? t(option.descKey) : ''
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
          <SearchIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            {t('ngram.search.title')}
          </Typography>
        </Stack>
      </AccordionSummary>
      
      <AccordionDetails>
        <Stack spacing={2}>
          {/* Frequency range */}
          <Box>
            <Typography variant="body2" gutterBottom>
              {t('ngram.search.frequencyRange')}
            </Typography>
            <Stack direction="row" spacing={2}>
              <NumberInput
                label={t('ngram.search.minFrequency')}
                size="small"
                value={minFreq}
                onChange={onMinFreqChange}
                min={1}
                step={1}
                integer
                defaultValue={1}
                sx={{ flex: 1 }}
              />
              <NumberInput
                label={t('ngram.search.maxFrequency')}
                size="small"
                value={maxFreq ?? 0}
                onChange={(val) => onMaxFreqChange(val === 0 ? null : val)}
                min={0}
                step={10}
                integer
                defaultValue={0}
                sx={{ flex: 1 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {t('ngram.search.maxFrequencyHint')}
            </Typography>
          </Box>

          {/* Minimum word length */}
          <Box>
            <Typography variant="body2" gutterBottom>
              {t('ngram.search.minWordLength')}
              <Tooltip title={t('ngram.search.minWordLengthDesc')}>
                <InfoOutlinedIcon 
                  fontSize="inherit" 
                  sx={{ ml: 0.5, verticalAlign: 'middle', opacity: 0.6 }} 
                />
              </Tooltip>
            </Typography>
            <NumberInput
              size="small"
              value={minWordLength}
              onChange={onMinWordLengthChange}
              min={1}
              max={20}
              step={1}
              integer
              defaultValue={1}
              fullWidth
            />
          </Box>

          <Divider />

          {/* Search type */}
          <Box>
            <Typography variant="body2" gutterBottom>
              {t('ngram.search.searchType')}
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={config.searchType}
                onChange={(e) => handleSearchTypeChange(e.target.value as SearchType)}
              >
                {SEARCH_TYPE_OPTIONS.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {getCurrentSearchTypeDesc()}
            </Typography>
          </Box>

          {/* Search value - show when not 'all' */}
          {config.searchType !== 'all' && (
            <Box>
              <Typography variant="body2" gutterBottom>
                {config.searchType === 'wordlist' 
                  ? t('ngram.search.searchWordlist')
                  : t('ngram.search.searchValue')
                }
              </Typography>
              {config.searchType === 'wordlist' ? (
                <TextField
                  multiline
                  rows={4}
                  size="small"
                  value={config.searchValue}
                  onChange={(e) => handleSearchValueChange(e.target.value)}
                  placeholder={t('ngram.search.wordlistPlaceholder')}
                  fullWidth
                />
              ) : (
                <TextField
                  size="small"
                  value={config.searchValue}
                  onChange={(e) => handleSearchValueChange(e.target.value)}
                  placeholder={
                    config.searchType === 'regex' 
                      ? t('ngram.search.regexPlaceholder')
                      : t('ngram.search.valuePlaceholder')
                  }
                  fullWidth
                />
              )}
            </Box>
          )}

          <Divider />

          {/* Exclude words */}
          <Box>
            <Typography variant="body2" gutterBottom>
              {t('ngram.search.excludeWords')}
              <Tooltip title={t('ngram.search.excludeWordsDesc')}>
                <InfoOutlinedIcon 
                  fontSize="inherit" 
                  sx={{ ml: 0.5, verticalAlign: 'middle', opacity: 0.6 }} 
                />
              </Tooltip>
            </Typography>
            <TextField
              multiline
              rows={3}
              size="small"
              value={excludeWordsText}
              onChange={(e) => handleExcludeWordsChange(e.target.value)}
              onBlur={handleExcludeWordsBlur}
              placeholder={t('ngram.search.excludeWordsPlaceholder')}
              fullWidth
            />
          </Box>

          <Divider />

          {/* Lowercase toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={lowercase}
                onChange={(e) => onLowercaseChange(e.target.checked)}
                size="small"
              />
            }
            label={
              <Stack>
                <Typography variant="body2">
                  {t('ngram.search.lowercase')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('ngram.search.lowercaseDesc')}
                </Typography>
              </Stack>
            }
          />
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

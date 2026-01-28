/**
 * Search Config Panel Component for Semantic Analysis
 * Provides search filtering options: frequency range, search type, exclusion
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
  Tooltip,
  IconButton
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { useTranslation } from 'react-i18next'
import type { SearchConfig } from '../../types/semanticAnalysis'
import { NumberInput } from '../../components/common'

interface SearchConfigPanelProps {
  config: SearchConfig
  onChange: (config: SearchConfig) => void
  minFreq: number
  maxFreq: number | null
  lowercase: boolean
  onMinFreqChange: (value: number) => void
  onMaxFreqChange: (value: number | null) => void
  onLowercaseChange: (value: boolean) => void
  disabled?: boolean
}

type SearchType = 'all' | 'starts' | 'ends' | 'contains' | 'regex' | 'wordlist'

const SEARCH_TYPES: { value: SearchType; labelKey: string }[] = [
  { value: 'all', labelKey: 'wordFrequency.search.typeAll' },
  { value: 'starts', labelKey: 'wordFrequency.search.typeStarts' },
  { value: 'ends', labelKey: 'wordFrequency.search.typeEnds' },
  { value: 'contains', labelKey: 'wordFrequency.search.typeContains' },
  { value: 'regex', labelKey: 'wordFrequency.search.typeRegex' },
  { value: 'wordlist', labelKey: 'wordFrequency.search.typeWordlist' }
]

export default function SearchConfigPanel({
  config,
  onChange,
  minFreq,
  maxFreq,
  lowercase,
  onMinFreqChange,
  onMaxFreqChange,
  onLowercaseChange,
  disabled = false
}: SearchConfigPanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)

  // Handle search value change
  const handleSearchValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      searchValue: event.target.value
    })
  }

  // Local state for exclude words text (allows multiline editing)
  const [excludeWordsText, setExcludeWordsText] = useState(config.excludeWords.join('\n'))

  // Sync local state when config changes from outside
  useEffect(() => {
    setExcludeWordsText(config.excludeWords.join('\n'))
  }, [config.excludeWords])

  // Handle exclude words text change (keep raw text for editing)
  const handleExcludeWordsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setExcludeWordsText(event.target.value)
  }

  // Handle exclude words blur (save to config)
  const handleExcludeWordsBlur = () => {
    const words = excludeWordsText.split('\n').map(w => w.trim()).filter(w => w)
    onChange({
      ...config,
      excludeWords: words
    })
  }

  // Get placeholder text based on search type
  const getPlaceholder = () => {
    switch (config.searchType) {
      case 'starts':
        return t('wordFrequency.search.placeholderStarts')
      case 'ends':
        return t('wordFrequency.search.placeholderEnds')
      case 'contains':
        return t('wordFrequency.search.placeholderContains')
      case 'regex':
        return t('wordFrequency.search.placeholderRegex')
      case 'wordlist':
        return t('wordFrequency.search.placeholderWordlist')
      default:
        return ''
    }
  }

  // Check if search value field should be shown
  const showSearchValue = config.searchType !== 'all'

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
            {t('wordFrequency.search.title')}
          </Typography>
        </Stack>
      </AccordionSummary>

      <AccordionDetails>
        {/* Frequency Range */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {t('wordFrequency.search.frequencyRange')}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <NumberInput
            label={t('wordFrequency.search.minFreq')}
            size="small"
            value={minFreq}
            onChange={(val) => onMinFreqChange(val)}
            min={1}
            max={10000}
            integer
            defaultValue={1}
            sx={{ width: 130 }}
          />
          <NumberInput
            label={t('wordFrequency.search.maxFreq')}
            size="small"
            value={maxFreq ?? 0}
            onChange={(val) => onMaxFreqChange(val === 0 ? null : val)}
            min={0}
            max={100000}
            integer
            defaultValue={0}
            helperText={maxFreq === null ? t('wordFrequency.search.noLimit') : ''}
            sx={{ width: 130 }}
          />
        </Stack>

        {/* Case sensitivity */}
        <FormControlLabel
          control={
            <Switch
              checked={lowercase}
              onChange={(e) => onLowercaseChange(e.target.checked)}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              {t('wordFrequency.search.lowercase')}
            </Typography>
          }
          sx={{ mb: 2 }}
        />

        {/* Search Type */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>{t('wordFrequency.search.searchType')}</InputLabel>
          <Select
            value={config.searchType}
            label={t('wordFrequency.search.searchType')}
            onChange={(e) => onChange({ ...config, searchType: e.target.value as SearchType })}
          >
            {SEARCH_TYPES.map(type => (
              <MenuItem key={type.value} value={type.value}>
                {t(type.labelKey)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Search Value */}
        {showSearchValue && (
          <Box sx={{ mb: 2 }}>
            {config.searchType === 'wordlist' ? (
              <TextField
                label={t('wordFrequency.search.searchValue')}
                multiline
                rows={4}
                fullWidth
                size="small"
                value={config.searchValue}
                onChange={handleSearchValueChange}
                placeholder={getPlaceholder()}
                helperText={t('wordFrequency.search.wordlistHelp')}
              />
            ) : (
              <TextField
                label={t('wordFrequency.search.searchValue')}
                fullWidth
                size="small"
                value={config.searchValue}
                onChange={handleSearchValueChange}
                placeholder={getPlaceholder()}
                InputProps={{
                  endAdornment: config.searchType === 'regex' && (
                    <Tooltip title={t('wordFrequency.search.regexHelp')}>
                      <IconButton size="small">
                        <HelpOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )
                }}
              />
            )}
          </Box>
        )}

        {/* Exclude Words */}
        <TextField
          label={t('wordFrequency.search.excludeWords')}
          multiline
          rows={3}
          fullWidth
          size="small"
          value={excludeWordsText}
          onChange={handleExcludeWordsChange}
          onBlur={handleExcludeWordsBlur}
          placeholder={t('wordFrequency.search.excludeWordsPlaceholder')}
          helperText={t('wordFrequency.search.excludeWordsHelp')}
        />
      </AccordionDetails>
    </Accordion>
  )
}

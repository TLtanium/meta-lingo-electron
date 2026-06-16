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
  Tooltip,
  IconButton
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type { SearchConfig, SearchType, SearchTarget } from '../../types/ngram'

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
  const [expanded, setExpanded] = useState(true)

  const handleSearchTypeChange = (type: SearchType) => {
    onChange({ ...config, searchType: type })
  }

  const handleSearchValueChange = (value: string) => {
    onChange({ ...config, searchValue: value })
  }

  const [excludeWordsText, setExcludeWordsText] = useState(config.excludeWords.join('\n'))

  useEffect(() => {
    setExcludeWordsText(config.excludeWords.join('\n'))
  }, [config.excludeWords])

  const handleExcludeWordsBlur = () => {
    const words = excludeWordsText.split('\n').map(w => w.trim()).filter(w => w)
    onChange({ ...config, excludeWords: words })
  }

  const getCurrentSearchTypeDesc = () => {
    const option = SEARCH_TYPE_OPTIONS.find(o => o.value === config.searchType)
    return option ? t(option.descKey) : ''
  }

  const getSearchValuePlaceholder = () => {
    switch (config.searchType) {
      case 'regex': return t('ngram.search.regexPlaceholder')
      case 'wordlist': return t('ngram.search.wordlistPlaceholder')
      default: return t('ngram.search.valuePlaceholder')
    }
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
        {/* Frequency Range */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
          {t('ngram.search.frequencyRange')}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
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
            helperText={maxFreq === null ? t('wordFrequency.search.noLimit') : ''}
            sx={{ flex: 1 }}
          />
        </Stack>

        {/* Lowercase */}
        <FormControlLabel
          control={
            <Switch
              checked={lowercase}
              onChange={(e) => onLowercaseChange(e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="body2">{t('ngram.search.lowercase')}</Typography>}
          sx={{ mb: 2 }}
        />

        {/* Min Word Length */}
        <NumberInput
          label={t('ngram.search.minWordLength')}
          size="small"
          value={minWordLength}
          onChange={onMinWordLengthChange}
          min={1}
          max={20}
          step={1}
          integer
          defaultValue={1}
          helperText={t('ngram.search.minWordLengthDesc')}
          fullWidth
          sx={{ mb: 2 }}
        />

        {/* Search Target: Word Form / Lemma */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>{t('ngram.search.searchTarget')}</InputLabel>
          <Select
            value={config.searchTarget ?? 'word'}
            label={t('ngram.search.searchTarget')}
            onChange={(e) => onChange({ ...config, searchTarget: e.target.value as SearchTarget })}
          >
            <MenuItem value="word">{t('ngram.search.targetWord')}</MenuItem>
            <MenuItem value="lemma">{t('ngram.search.targetLemma')}</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, mt: -1 }}>
          {(config.searchTarget ?? 'word') === 'lemma' ? t('ngram.search.lemmaDesc') : t('ngram.search.wordDesc')}
        </Typography>

        {/* Search Type */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>{t('ngram.search.searchType')}</InputLabel>
          <Select
            value={config.searchType}
            label={t('ngram.search.searchType')}
            onChange={(e) => handleSearchTypeChange(e.target.value as SearchType)}
          >
            {SEARCH_TYPE_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, mt: -1 }}>
          {getCurrentSearchTypeDesc()}
        </Typography>

        {/* Search Value */}
        {config.searchType !== 'all' && (
          <Box sx={{ mb: 2 }}>
            {config.searchType === 'wordlist' ? (
              <TextField
                label={t('ngram.search.searchWordlist')}
                multiline
                rows={4}
                fullWidth
                size="small"
                value={config.searchValue}
                onChange={(e) => handleSearchValueChange(e.target.value)}
                placeholder={t('ngram.search.wordlistPlaceholder')}
                helperText={t('wordFrequency.search.wordlistHelp')}
              />
            ) : (
              <TextField
                label={t('ngram.search.searchValue')}
                fullWidth
                size="small"
                value={config.searchValue}
                onChange={(e) => handleSearchValueChange(e.target.value)}
                placeholder={getSearchValuePlaceholder()}
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
          label={t('ngram.search.excludeWords')}
          multiline
          rows={3}
          fullWidth
          size="small"
          value={excludeWordsText}
          onChange={(e) => setExcludeWordsText(e.target.value)}
          onBlur={handleExcludeWordsBlur}
          placeholder={t('ngram.search.excludeWordsPlaceholder')}
          helperText={t('ngram.search.excludeWordsDesc')}
        />
      </AccordionDetails>
    </Accordion>
  )
}

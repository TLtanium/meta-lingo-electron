/**
 * Search Configuration Panel for Synonym Analysis
 * Configures search query, frequency threshold, and other options
 */

import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Stack,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TuneIcon from '@mui/icons-material/Tune'
import SearchIcon from '@mui/icons-material/Search'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'

interface SearchConfigPanelProps {
  searchQuery: string
  minFreq: number
  maxResults: number
  lowercase: boolean
  onSearchQueryChange: (value: string) => void
  onMinFreqChange: (value: number) => void
  onMaxResultsChange: (value: number) => void
  onLowercaseChange: (value: boolean) => void
  disabled?: boolean
}

export default function SearchConfigPanel({
  searchQuery,
  minFreq,
  maxResults,
  lowercase,
  onSearchQueryChange,
  onMinFreqChange,
  onMaxResultsChange,
  onLowercaseChange,
  disabled = false
}: SearchConfigPanelProps) {
  const { t } = useTranslation()

  return (
    <Accordion 
      disabled={disabled}
      defaultExpanded
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
          <TuneIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            {t('synonym.search.title')}
          </Typography>
        </Stack>
      </AccordionSummary>
      
      <AccordionDetails>
        <Stack spacing={2}>
          {/* Search query */}
          <TextField
            size="small"
            fullWidth
            label={t('synonym.search.searchQuery')}
            placeholder={t('synonym.search.searchQueryPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            disabled={disabled}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }}
          />

          <Typography variant="caption" color="text.secondary">
            {t('synonym.search.searchQueryHelp')}
          </Typography>

          <Divider />

          {/* Frequency settings */}
          <Typography variant="body2" color="text.secondary">
            {t('synonym.search.frequencySettings')}
          </Typography>

          <Stack direction="row" spacing={2}>
            <NumberInput
              label={t('synonym.search.minFreq')}
              size="small"
              value={minFreq}
              onChange={onMinFreqChange}
              min={1}
              max={100}
              step={1}
              integer
              defaultValue={1}
              disabled={disabled}
              sx={{ width: 130 }}
            />
            <NumberInput
              label={t('synonym.search.maxResults')}
              size="small"
              value={maxResults}
              onChange={onMaxResultsChange}
              min={10}
              max={500}
              step={10}
              integer
              defaultValue={100}
              disabled={disabled}
              sx={{ width: 130 }}
            />
          </Stack>

          <Divider />

          {/* Options */}
          <FormControlLabel
            control={
              <Switch
                checked={lowercase}
                onChange={(e) => onLowercaseChange(e.target.checked)}
                disabled={disabled}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                {t('synonym.search.lowercase')}
              </Typography>
            }
          />

          <Typography variant="caption" color="text.secondary">
            {t('synonym.search.lowercaseHelp')}
          </Typography>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

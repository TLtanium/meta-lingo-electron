/**
 * LDA Dynamic Topic Panel
 * Configure dynamic topic analysis using corpus metadata dates for LDA
 */

import { useMemo } from 'react'
import {
  Box,
  Typography,
  Paper,
  FormControlLabel,
  Checkbox,
  Stack,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider
} from '@mui/material'
import TimelineIcon from '@mui/icons-material/Timeline'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type { LDADynamicConfig, DateFormatType } from '../../../types/topicModeling'
import type { CorpusText } from '../../../types'

interface LDADynamicPanelProps {
  config: LDADynamicConfig
  onConfigChange: (config: LDADynamicConfig) => void
  texts: CorpusText[]
  /** When in library mode, text_id -> date string (year) from biblio entry */
  textDates?: Record<string, string>
  disabled?: boolean
}

export default function LDADynamicPanel({
  config,
  onConfigChange,
  texts,
  textDates: textDatesProp,
  disabled = false
}: LDADynamicPanelProps) {
  const { t } = useTranslation()

  // Count texts with date metadata (or from library textDates)
  const textsWithDate = useMemo(() => {
    if (textDatesProp && Object.keys(textDatesProp).length > 0) return Object.keys(textDatesProp).length
    return texts.filter(text => text.metadata?.date).length
  }, [texts, textDatesProp])

  // Get text dates mapping: prefer prop (library mode), else derive from texts
  const textDates = useMemo(() => {
    if (textDatesProp && Object.keys(textDatesProp).length > 0) return textDatesProp
    const dates: Record<string, string> = {}
    texts.forEach(text => {
      if (text.metadata?.date) dates[text.id] = text.metadata.date
    })
    return dates
  }, [texts, textDatesProp])

  const totalTextCount = useMemo(() => {
    if (textDatesProp && Object.keys(textDatesProp).length > 0) return Object.keys(textDatesProp).length
    return texts.length
  }, [texts, textDatesProp])

  const handleConfigChange = (key: keyof LDADynamicConfig, value: unknown) => {
    onConfigChange({ ...config, [key]: value })
  }

  const hasEnoughDates = textsWithDate >= 2

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
        <TimelineIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1" fontWeight={600}>
          {t('topicModeling.ldaDynamic.title', 'Dynamic Topic Analysis')}
        </Typography>
      </Stack>

      <Stack spacing={2}>
        {/* Date metadata info */}
        <Alert 
          severity={hasEnoughDates ? 'info' : 'warning'} 
          icon={false}
          sx={{ py: 0.5 }}
        >
          <Typography variant="caption">
            {textsWithDate > 0 ? (
              <>
                <strong>{textsWithDate}</strong> {t('topicModeling.ldaDynamic.textsWithDate', 'texts have date metadata')}
                {' '}/ {totalTextCount} {t('corpus.textsCount', 'texts')}
              </>
            ) : (
              t('topicModeling.ldaDynamic.noDateData', 'No date metadata found in selected texts')
            )}
          </Typography>
          {textDatesProp && Object.keys(textDatesProp).length > 0 && (
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }} color="text.secondary">
              {t('topicModeling.ldaDynamic.libraryYearHint')}
            </Typography>
          )}
        </Alert>

        {/* Enable checkbox */}
        <FormControlLabel
          control={
            <Checkbox
              checked={config.enabled}
              onChange={(e) => handleConfigChange('enabled', e.target.checked)}
              size="small"
              disabled={disabled || !hasEnoughDates}
            />
          }
          label={
            <Typography variant="body2">
              {t('topicModeling.ldaDynamic.enable', 'Enable dynamic topic analysis')}
            </Typography>
          }
        />

        {/* Configuration options - only show when enabled */}
        {config.enabled && hasEnoughDates && (
          <>
            <Divider />
            
            {/* Date format selection */}
            <FormControl size="small" fullWidth disabled={disabled}>
              <InputLabel>{t('topicModeling.dynamicTopic.dateFormat', 'Date Format')}</InputLabel>
              <Select
                value={config.date_format}
                label={t('topicModeling.dynamicTopic.dateFormat', 'Date Format')}
                onChange={(e) => handleConfigChange('date_format', e.target.value as DateFormatType)}
              >
                <MenuItem value="year_only">
                  {t('topicModeling.dynamicTopic.yearOnly', 'Year only')}
                </MenuItem>
                <MenuItem value="full_date">
                  {t('topicModeling.dynamicTopic.fullDate', 'Full date')}
                </MenuItem>
              </Select>
            </FormControl>

            {/* Number of bins */}
            <NumberInput
              label={t('topicModeling.ldaDynamic.nrBins', 'Time Bins')}
              size="small"
              value={config.nr_bins || null}
              onChange={(value) => handleConfigChange('nr_bins', value || null)}
              min={2}
              max={100}
              integer
              disabled={disabled}
              fullWidth
              helperText={t('topicModeling.ldaDynamic.nrBinsHelp', 'Number of time periods for analysis. Leave empty for auto.')}
            />
          </>
        )}
      </Stack>
    </Paper>
  )
}

/**
 * Helper function to get text dates mapping from texts array
 */
export function getTextDatesMapping(texts: CorpusText[]): Record<string, string> {
  const dates: Record<string, string> = {}
  texts.forEach(text => {
    if (text.metadata?.date) {
      dates[text.id] = text.metadata.date
    }
  })
  return dates
}


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
  disabled?: boolean
}

export default function LDADynamicPanel({
  config,
  onConfigChange,
  texts,
  disabled = false
}: LDADynamicPanelProps) {
  const { t } = useTranslation()

  // Count texts with date metadata
  const textsWithDate = useMemo(() => {
    return texts.filter(text => text.metadata?.date).length
  }, [texts])

  // Get text dates mapping
  const textDates = useMemo(() => {
    const dates: Record<string, string> = {}
    texts.forEach(text => {
      if (text.metadata?.date) {
        dates[text.id] = text.metadata.date
      }
    })
    return dates
  }, [texts])

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
                {' '}/ {texts.length} {t('corpus.textsCount', 'texts')}
              </>
            ) : (
              t('topicModeling.ldaDynamic.noDateData', 'No date metadata found in selected texts')
            )}
          </Typography>
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


/**
 * Dynamic Topic Panel for Topic Modeling
 * Configure dynamic topic analysis using corpus metadata dates
 */

import { useState, useEffect, useMemo } from 'react'
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
  Chip,
  Divider
} from '@mui/material'
import TimelineIcon from '@mui/icons-material/Timeline'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type { DynamicTopicConfig, DateFormatType } from '../../types/topicModeling'
import type { CorpusText } from '../../types'

interface DynamicTopicPanelProps {
  config: DynamicTopicConfig
  onConfigChange: (config: DynamicTopicConfig) => void
  texts: CorpusText[]
  disabled?: boolean
}

export default function DynamicTopicPanel({
  config,
  onConfigChange,
  texts,
  disabled = false
}: DynamicTopicPanelProps) {
  const { t } = useTranslation()

  // Count texts with date metadata
  const textsWithDate = useMemo(() => {
    return texts.filter(text => text.metadata?.date).length
  }, [texts])

  const handleConfigChange = (key: keyof DynamicTopicConfig, value: unknown) => {
    onConfigChange({ ...config, [key]: value })
  }

  const hasEnoughDates = textsWithDate >= 2

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
        <TimelineIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1" fontWeight={600}>
          {t('topicModeling.dynamicTopic.title')}
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
                <strong>{textsWithDate}</strong> {t('topicModeling.dynamicTopic.textsWithDate')}
                {' '}/ {texts.length} {t('corpus.textsCount')}
              </>
            ) : (
              t('topicModeling.dynamicTopic.noDateData')
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
              {t('topicModeling.dynamicTopic.enable')}
            </Typography>
          }
        />

        {/* Configuration options - only show when enabled */}
        {config.enabled && hasEnoughDates && (
          <>
            <Divider />
            
            {/* Date format selection */}
            <FormControl size="small" fullWidth disabled={disabled}>
              <InputLabel>{t('topicModeling.dynamicTopic.dateFormat')}</InputLabel>
              <Select
                value={config.date_format}
                label={t('topicModeling.dynamicTopic.dateFormat')}
                onChange={(e) => handleConfigChange('date_format', e.target.value as DateFormatType)}
              >
                <MenuItem value="year_only">
                  {t('topicModeling.dynamicTopic.yearOnly')}
                </MenuItem>
                <MenuItem value="full_date">
                  {t('topicModeling.dynamicTopic.fullDate')}
                </MenuItem>
              </Select>
            </FormControl>

            {/* Number of bins */}
            <NumberInput
              label={t('topicModeling.dynamicTopic.nrBins')}
              size="small"
              value={config.nr_bins || null}
              onChange={(value) => handleConfigChange('nr_bins', value || null)}
              min={2}
              max={100}
              integer
              disabled={disabled}
              fullWidth
              helperText={t('topicModeling.dynamicTopic.nrBinsHelp')}
            />

            {/* Tuning options */}
            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={config.evolution_tuning}
                    onChange={(e) => handleConfigChange('evolution_tuning', e.target.checked)}
                    size="small"
                    disabled={disabled}
                  />
                }
                label={
                  <Typography variant="body2">
                    {t('topicModeling.dynamicTopic.evolutionTuning')}
                  </Typography>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={config.global_tuning}
                    onChange={(e) => handleConfigChange('global_tuning', e.target.checked)}
                    size="small"
                    disabled={disabled}
                  />
                }
                label={
                  <Typography variant="body2">
                    {t('topicModeling.dynamicTopic.globalTuning')}
                  </Typography>
                }
              />
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  )
}

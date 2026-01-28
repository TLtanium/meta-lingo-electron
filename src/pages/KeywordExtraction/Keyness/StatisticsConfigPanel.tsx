/**
 * Statistics Configuration Panel for Keyness Analysis
 */

import { useState } from 'react'
import {
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
  Tooltip,
  Divider
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import EqualizerIcon from '@mui/icons-material/Equalizer'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type { KeynessStatistic, KeynessConfig } from '../../../types/keyword'

interface StatisticsConfigPanelProps {
  statistic: KeynessStatistic
  config: KeynessConfig
  onStatisticChange: (statistic: KeynessStatistic) => void
  onConfigChange: (config: KeynessConfig) => void
  lowercase: boolean
  onLowercaseChange: (value: boolean) => void
  disabled?: boolean
}

export default function StatisticsConfigPanel({
  statistic,
  config,
  onStatisticChange,
  onConfigChange,
  lowercase,
  onLowercaseChange,
  disabled = false
}: StatisticsConfigPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [expanded, setExpanded] = useState(true)

  const statistics = [
    {
      id: 'log_likelihood' as KeynessStatistic,
      name_en: 'Log-Likelihood (G2)',
      name_zh: '对数似然比 (G2)',
      description_en: 'Most reliable significance test for corpus comparison',
      description_zh: '语料库对比中最可靠的显著性检验'
    },
    {
      id: 'chi_squared' as KeynessStatistic,
      name_en: 'Chi-squared',
      name_zh: '卡方检验',
      description_en: 'Classic statistical test with Yates correction',
      description_zh: '带Yates校正的经典统计检验'
    },
    {
      id: 'log_ratio' as KeynessStatistic,
      name_en: 'Log Ratio',
      name_zh: '对数比率',
      description_en: 'Pure effect size measure',
      description_zh: '纯效应量指标'
    },
    {
      id: 'dice' as KeynessStatistic,
      name_en: 'Dice Coefficient',
      name_zh: 'Dice系数',
      description_en: 'Association strength measure [0,1]',
      description_zh: '关联强度指标 [0,1]'
    },
    {
      id: 'mi' as KeynessStatistic,
      name_en: 'Mutual Information',
      name_zh: '互信息',
      description_en: 'Information-theoretic measure',
      description_zh: '信息论指标'
    },
    {
      id: 'mi3' as KeynessStatistic,
      name_en: 'MI3',
      name_zh: 'MI3',
      description_en: 'Cubed MI, reduces bias towards rare words',
      description_zh: 'MI立方,减少对低频词偏好'
    },
    {
      id: 't_score' as KeynessStatistic,
      name_en: 'T-score',
      name_zh: 'T-score',
      description_en: 'Favors high-frequency words',
      description_zh: '偏向高频词'
    },
    {
      id: 'simple_keyness' as KeynessStatistic,
      name_en: 'Simple Keyness',
      name_zh: '简单关键性',
      description_en: 'Simple frequency ratio',
      description_zh: '简单频率比值'
    },
    {
      id: 'fishers_exact' as KeynessStatistic,
      name_en: "Fisher's Exact",
      name_zh: 'Fisher精确检验',
      description_en: 'Exact test for small samples',
      description_zh: '小样本精确检验'
    }
  ]

  const currentStat = statistics.find(s => s.id === statistic)

  const updateConfig = (key: keyof KeynessConfig, value: any) => {
    onConfigChange({ ...config, [key]: value })
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
          <EqualizerIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            {t('keyword.keyness.config.title', 'Statistics Configuration')}
          </Typography>
        </Stack>
      </AccordionSummary>
      
      <AccordionDetails>
        {/* Statistic selection */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>{t('keyword.keyness.config.statistic', 'Statistic')}</InputLabel>
          <Select
            value={statistic}
            onChange={(e) => onStatisticChange(e.target.value as KeynessStatistic)}
            label={t('keyword.keyness.config.statistic', 'Statistic')}
          >
            {statistics.map(stat => (
              <MenuItem key={stat.id} value={stat.id}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography>{isZh ? stat.name_zh : stat.name_en}</Typography>
                  <Tooltip title={isZh ? stat.description_zh : stat.description_en}>
                    <HelpOutlineIcon fontSize="small" color="action" />
                  </Tooltip>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Statistic description */}
        {currentStat && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {isZh ? currentStat.description_zh : currentStat.description_en}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Lowercase option */}
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
              {t('keyword.config.lowercase', 'Convert to lowercase')}
            </Typography>
          }
          sx={{ mb: 2 }}
        />

        {/* Frequency thresholds */}
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
          {t('keyword.keyness.config.thresholds', 'Frequency Thresholds')}
        </Typography>
        
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <NumberInput
            label={t('keyword.keyness.config.minFreqStudy', 'Min Study Freq')}
            size="small"
            value={config.minFreqStudy}
            onChange={(v) => updateConfig('minFreqStudy', v)}
            min={1}
            max={100}
            step={1}
            integer
            fullWidth
          />
          <NumberInput
            label={t('keyword.keyness.config.minFreqRef', 'Min Ref Freq')}
            size="small"
            value={config.minFreqRef}
            onChange={(v) => updateConfig('minFreqRef', v)}
            min={0}
            max={100}
            step={1}
            integer
            fullWidth
          />
        </Stack>

        {/* Effect size threshold (for Log Ratio) */}
        {statistic === 'log_ratio' && (
          <NumberInput
            label={t('keyword.keyness.config.effectSizeThreshold', 'Effect Size Threshold')}
            size="small"
            value={config.effectSizeThreshold}
            onChange={(v) => updateConfig('effectSizeThreshold', v)}
            min={0}
            max={5}
            step={0.5}
            fullWidth
            sx={{ mb: 2 }}
          />
        )}

        {/* Show negative keywords */}
        <FormControlLabel
          control={
            <Switch
              checked={config.showNegative}
              onChange={(e) => updateConfig('showNegative', e.target.checked)}
              size="small"
            />
          }
          label={
            <Stack>
              <Typography variant="body2">
                {t('keyword.keyness.config.showNegative', 'Show negative keywords')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('keyword.keyness.config.showNegativeDesc', 'Words unusually infrequent in study corpus')}
              </Typography>
            </Stack>
          }
        />
      </AccordionDetails>
    </Accordion>
  )
}


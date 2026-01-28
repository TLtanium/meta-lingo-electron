/**
 * Algorithm Configuration Panel for Single Document Keyword Extraction
 */

import { useState } from 'react'
import {
  Box,
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
  IconButton
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SettingsIcon from '@mui/icons-material/Settings'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type { 
  SingleDocAlgorithm, 
  SingleDocConfig
} from '../../../types/keyword'

interface AlgorithmConfigPanelProps {
  algorithm: SingleDocAlgorithm
  config: SingleDocConfig
  onAlgorithmChange: (algorithm: SingleDocAlgorithm) => void
  onConfigChange: (config: SingleDocConfig) => void
  lowercase: boolean
  onLowercaseChange: (value: boolean) => void
  disabled?: boolean
}

export default function AlgorithmConfigPanel({
  algorithm,
  config,
  onAlgorithmChange,
  onConfigChange,
  lowercase,
  onLowercaseChange,
  disabled = false
}: AlgorithmConfigPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [expanded, setExpanded] = useState(true)

  const algorithms = [
    {
      id: 'tfidf' as SingleDocAlgorithm,
      name_en: 'TF-IDF',
      name_zh: 'TF-IDF',
      description_en: 'Term Frequency-Inverse Document Frequency',
      description_zh: '词频-逆文档频率'
    },
    {
      id: 'textrank' as SingleDocAlgorithm,
      name_en: 'TextRank',
      name_zh: 'TextRank',
      description_en: 'Graph-based ranking algorithm',
      description_zh: '基于图的排序算法'
    },
    {
      id: 'yake' as SingleDocAlgorithm,
      name_en: 'YAKE!',
      name_zh: 'YAKE!',
      description_en: 'Yet Another Keyword Extractor',
      description_zh: '基于统计特征的关键词提取'
    },
    {
      id: 'rake' as SingleDocAlgorithm,
      name_en: 'RAKE',
      name_zh: 'RAKE',
      description_en: 'Rapid Automatic Keyword Extraction',
      description_zh: '快速自动关键词提取'
    }
  ]

  const currentAlgo = algorithms.find(a => a.id === algorithm)

  // Update TF-IDF config
  const updateTfidfConfig = (key: string, value: any) => {
    onConfigChange({
      ...config,
      tfidf: { ...config.tfidf, [key]: value }
    })
  }

  // Update TextRank config
  const updateTextrankConfig = (key: string, value: any) => {
    onConfigChange({
      ...config,
      textrank: { ...config.textrank, [key]: value }
    })
  }

  // Update YAKE config
  const updateYakeConfig = (key: string, value: any) => {
    onConfigChange({
      ...config,
      yake: { ...config.yake, [key]: value }
    })
  }

  // Update RAKE config
  const updateRakeConfig = (key: string, value: any) => {
    onConfigChange({
      ...config,
      rake: { ...config.rake, [key]: value }
    })
  }

  // Render algorithm-specific parameters
  const renderAlgorithmParams = () => {
    switch (algorithm) {
      case 'tfidf':
        return (
          <Stack spacing={2}>
            <NumberInput
              label={t('keyword.config.maxFeatures', 'Max Keywords')}
              size="small"
              value={config.tfidf.maxFeatures}
              onChange={(v) => updateTfidfConfig('maxFeatures', v)}
              min={5}
              max={500}
              step={5}
              integer
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <NumberInput
                label={t('keyword.config.minDf', 'Min Doc Freq')}
                size="small"
                value={config.tfidf.minDf}
                onChange={(v) => updateTfidfConfig('minDf', v)}
                min={0.01}
                max={0.5}
                step={0.01}
                fullWidth
              />
              <NumberInput
                label={t('keyword.config.maxDf', 'Max Doc Freq')}
                size="small"
                value={config.tfidf.maxDf}
                onChange={(v) => updateTfidfConfig('maxDf', v)}
                min={0.5}
                max={1.0}
                step={0.05}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <NumberInput
                label={t('keyword.config.minNgram', 'Min N-gram')}
                size="small"
                value={config.tfidf.ngramRange[0]}
                onChange={(v) => updateTfidfConfig('ngramRange', [v, config.tfidf.ngramRange[1]])}
                min={1}
                max={3}
                step={1}
                integer
                fullWidth
              />
              <NumberInput
                label={t('keyword.config.maxNgram', 'Max N-gram')}
                size="small"
                value={config.tfidf.ngramRange[1]}
                onChange={(v) => updateTfidfConfig('ngramRange', [config.tfidf.ngramRange[0], v])}
                min={1}
                max={5}
                step={1}
                integer
                fullWidth
              />
            </Stack>
          </Stack>
        )

      case 'textrank':
        return (
          <Stack spacing={2}>
            <NumberInput
              label={t('keyword.config.topN', 'Top N Keywords')}
              size="small"
              value={config.textrank.topN}
              onChange={(v) => updateTextrankConfig('topN', v)}
              min={5}
              max={500}
              step={5}
              integer
              fullWidth
            />
            <NumberInput
              label={t('keyword.config.windowSize', 'Window Size')}
              size="small"
              value={config.textrank.windowSize}
              onChange={(v) => updateTextrankConfig('windowSize', v)}
              min={2}
              max={10}
              step={1}
              integer
              fullWidth
            />
            <NumberInput
              label={t('keyword.config.damping', 'Damping Factor')}
              size="small"
              value={config.textrank.damping}
              onChange={(v) => updateTextrankConfig('damping', v)}
              min={0.5}
              max={0.99}
              step={0.05}
              fullWidth
            />
            <NumberInput
              label={t('keyword.config.maxIter', 'Max Iterations')}
              size="small"
              value={config.textrank.maxIter}
              onChange={(v) => updateTextrankConfig('maxIter', v)}
              min={10}
              max={500}
              step={10}
              integer
              fullWidth
            />
          </Stack>
        )

      case 'yake':
        return (
          <Stack spacing={2}>
            <NumberInput
              label={t('keyword.config.topN', 'Top N Keywords')}
              size="small"
              value={config.yake.topN}
              onChange={(v) => updateYakeConfig('topN', v)}
              min={5}
              max={500}
              step={5}
              integer
              fullWidth
            />
            <NumberInput
              label={t('keyword.config.maxNgramSize', 'Max N-gram Size')}
              size="small"
              value={config.yake.maxNgramSize}
              onChange={(v) => updateYakeConfig('maxNgramSize', v)}
              min={1}
              max={5}
              step={1}
              integer
              fullWidth
            />
            <NumberInput
              label={t('keyword.config.dedupThreshold', 'Dedup Threshold')}
              size="small"
              value={config.yake.dedupThreshold}
              onChange={(v) => updateYakeConfig('dedupThreshold', v)}
              min={0.1}
              max={1.0}
              step={0.1}
              fullWidth
            />
            <NumberInput
              label={t('keyword.config.windowSize', 'Window Size')}
              size="small"
              value={config.yake.windowSize}
              onChange={(v) => updateYakeConfig('windowSize', v)}
              min={1}
              max={5}
              step={1}
              integer
              fullWidth
            />
          </Stack>
        )

      case 'rake':
        return (
          <Stack spacing={2}>
            <NumberInput
              label={t('keyword.config.topN', 'Top N Keywords')}
              size="small"
              value={config.rake.topN}
              onChange={(v) => updateRakeConfig('topN', v)}
              min={5}
              max={500}
              step={5}
              integer
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <NumberInput
                label={t('keyword.config.minLength', 'Min Length')}
                size="small"
                value={config.rake.minLength}
                onChange={(v) => updateRakeConfig('minLength', v)}
                min={1}
                max={5}
                step={1}
                integer
                fullWidth
              />
              <NumberInput
                label={t('keyword.config.maxLength', 'Max Length')}
                size="small"
                value={config.rake.maxLength}
                onChange={(v) => updateRakeConfig('maxLength', v)}
                min={1}
                max={10}
                step={1}
                integer
                fullWidth
              />
            </Stack>
            <NumberInput
              label={t('keyword.config.minFrequency', 'Min Frequency')}
              size="small"
              value={config.rake.minFrequency}
              onChange={(v) => updateRakeConfig('minFrequency', v)}
              min={1}
              max={10}
              step={1}
              integer
              fullWidth
            />
          </Stack>
        )

      default:
        return null
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
          <SettingsIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            {t('keyword.config.title', 'Algorithm Configuration')}
          </Typography>
        </Stack>
      </AccordionSummary>
      
      <AccordionDetails>
        {/* Algorithm selection */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>{t('keyword.config.algorithm', 'Algorithm')}</InputLabel>
          <Select
            value={algorithm}
            onChange={(e) => onAlgorithmChange(e.target.value as SingleDocAlgorithm)}
            label={t('keyword.config.algorithm', 'Algorithm')}
          >
            {algorithms.map(algo => (
              <MenuItem key={algo.id} value={algo.id}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography>{isZh ? algo.name_zh : algo.name_en}</Typography>
                  <Tooltip title={isZh ? algo.description_zh : algo.description_en}>
                    <HelpOutlineIcon fontSize="small" color="action" />
                  </Tooltip>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Algorithm description */}
        {currentAlgo && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {isZh ? currentAlgo.description_zh : currentAlgo.description_en}
          </Typography>
        )}

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

        {/* Algorithm-specific parameters */}
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 1 }}>
          {t('keyword.config.parameters', 'Parameters')}
        </Typography>
        {renderAlgorithmParams()}
      </AccordionDetails>
    </Accordion>
  )
}


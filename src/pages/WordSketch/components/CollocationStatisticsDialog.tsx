/**
 * Collocation Statistics Dialog
 * Card-based UI for configuring statistical association measures.
 * Users can enable/disable, reorder, and set thresholds for each measure.
 * Improved layout: two-row cards with more spacing and threshold for all methods.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Switch,
  IconButton,
  Tooltip,
  Paper,
  Stack,
  Chip
} from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import RestoreIcon from '@mui/icons-material/Restore'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type { StatMeasureConfig, StatisticalMeasure } from '../../../types/collocationAnalysis'
import { STAT_MEASURE_INFO, DEFAULT_STAT_CONFIGS } from '../../../types/collocationAnalysis'

interface CollocationStatisticsDialogProps {
  open: boolean
  onClose: () => void
  configs: StatMeasureConfig[]
  onConfigsChange: (configs: StatMeasureConfig[]) => void
}

export default function CollocationStatisticsDialog({
  open,
  onClose,
  configs,
  onConfigsChange
}: CollocationStatisticsDialogProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Local state for editing
  const [localConfigs, setLocalConfigs] = useState<StatMeasureConfig[]>(configs)

  // Re-sync when dialog opens
  const handleEnter = () => {
    setLocalConfigs([...configs])
  }

  // Get sorted configs by order
  const sortedConfigs = [...localConfigs].sort((a, b) => a.order - b.order)

  // Get measure info by ID
  const getInfo = (id: StatisticalMeasure) => {
    return STAT_MEASURE_INFO.find(m => m.id === id)
  }

  // Toggle enabled
  const handleToggle = (id: StatisticalMeasure) => {
    setLocalConfigs(prev =>
      prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c)
    )
  }

  // Update threshold
  const handleThresholdChange = (id: StatisticalMeasure, value: number | null) => {
    setLocalConfigs(prev =>
      prev.map(c => c.id === id ? { ...c, threshold: value } : c)
    )
  }

  // Move up
  const handleMoveUp = (id: StatisticalMeasure) => {
    const sorted = [...localConfigs].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(c => c.id === id)
    if (idx <= 0) return

    const newConfigs = sorted.map((c, i) => {
      if (i === idx - 1) return { ...c, order: idx }
      if (i === idx) return { ...c, order: idx - 1 }
      return { ...c, order: i }
    })
    setLocalConfigs(newConfigs)
  }

  // Move down
  const handleMoveDown = (id: StatisticalMeasure) => {
    const sorted = [...localConfigs].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(c => c.id === id)
    if (idx >= sorted.length - 1) return

    const newConfigs = sorted.map((c, i) => {
      if (i === idx) return { ...c, order: idx + 1 }
      if (i === idx + 1) return { ...c, order: idx }
      return { ...c, order: i }
    })
    setLocalConfigs(newConfigs)
  }

  // Reset to defaults
  const handleReset = () => {
    setLocalConfigs([...DEFAULT_STAT_CONFIGS])
  }

  // Save and close
  const handleSave = () => {
    onConfigsChange(localConfigs)
    onClose()
  }

  const enabledCount = localConfigs.filter(c => c.enabled).length

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      TransitionProps={{ onEnter: handleEnter }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            {t('collocationAnalysis.statistics.title')}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={`${enabledCount} ${t('collocationAnalysis.statistics.enabled')}`}
              size="small"
              color="primary"
              variant="outlined"
            />
            <Tooltip title={t('collocationAnalysis.statistics.reset')}>
              <IconButton size="small" onClick={handleReset}>
                <RestoreIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('collocationAnalysis.statistics.description')}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={1.5}>
          {sortedConfigs.map((config, index) => {
            const info = getInfo(config.id)
            if (!info) return null

            return (
              <Paper
                key={config.id}
                variant="outlined"
                sx={{
                  p: 2,
                  opacity: config.enabled ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                  '&:hover': { borderColor: 'primary.main' }
                }}
              >
                {/* Row 1: reorder + toggle + name + range */}
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  {/* Reorder buttons */}
                  <Stack spacing={0} sx={{ flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveUp(config.id)}
                      disabled={index === 0}
                      sx={{ p: 0.25 }}
                    >
                      <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveDown(config.id)}
                      disabled={index === sortedConfigs.length - 1}
                      sx={{ p: 0.25 }}
                    >
                      <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>

                  {/* Enable toggle */}
                  <Switch
                    checked={config.enabled}
                    onChange={() => handleToggle(config.id)}
                    size="small"
                  />

                  {/* Name */}
                  <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
                    {isZh ? info.name_zh : info.name_en}
                  </Typography>

                  {/* Range chip */}
                  <Chip
                    label={info.range}
                    size="small"
                    variant="outlined"
                    sx={{ flexShrink: 0 }}
                  />

                  <Box sx={{ flex: 1 }} />

                  {/* Threshold */}
                  <NumberInput
                    label={t('collocationAnalysis.statistics.threshold')}
                    size="small"
                    value={config.threshold ?? 0}
                    onChange={(v) => handleThresholdChange(config.id, v === 0 ? null : v)}
                    min={-100}
                    max={100}
                    step={0.5}
                    sx={{ width: 120, flexShrink: 0 }}
                    disabled={!config.enabled}
                  />
                </Stack>

                {/* Row 2: description */}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', ml: 9 }}>
                  {isZh ? info.description_zh : info.description_en}
                </Typography>
              </Paper>
            )
          })}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="contained" onClick={handleSave}>
          {t('common.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

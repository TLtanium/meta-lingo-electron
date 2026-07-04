/**
 * MDA parameter panel — styled to match SearchConfigPanel (检索配置)
 */

import { useState } from 'react'
import {
  Typography,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
  Tooltip,
  TextField,
  Autocomplete,
  Alert
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TuneIcon from '@mui/icons-material/Tune'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import { FEATURE_CODES } from './mdaCsv'

interface ParamsPanelProps {
  ttrTokens: number
  zCorrection: boolean
  excludedFeatures: string[]
  onTtrTokensChange: (value: number) => void
  onZCorrectionChange: (value: boolean) => void
  onExcludedFeaturesChange: (value: string[]) => void
  disabled?: boolean
}

export default function ParamsPanel({
  ttrTokens,
  zCorrection,
  excludedFeatures,
  onTtrTokensChange,
  onZCorrectionChange,
  onExcludedFeaturesChange,
  disabled = false
}: ParamsPanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)

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
          <TuneIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            {t('mda.params.title')}
          </Typography>
        </Stack>
      </AccordionSummary>

      <AccordionDetails>
        {/* TTR window */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
          {t('mda.params.ttrTokensHint')}
        </Typography>
        <NumberInput
          label={t('mda.params.ttrTokens')}
          size="small"
          value={ttrTokens}
          onChange={(val) => onTtrTokensChange(val)}
          min={50}
          max={10000}
          step={50}
          integer
          defaultValue={400}
          fullWidth
          sx={{ mb: 2 }}
        />
        {ttrTokens !== 400 && (
          <Alert severity="info" sx={{ mb: 2, py: 0 }}>
            {t('mda.params.ttrNotComparable')}
          </Alert>
        )}

        {/* Z-score correction */}
        <Tooltip title={t('mda.params.zCorrectionHint')} placement="right">
          <FormControlLabel
            control={
              <Switch
                checked={zCorrection}
                onChange={(e) => onZCorrectionChange(e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                {t('mda.params.zCorrection')}
              </Typography>
            }
            sx={{ mb: 2 }}
          />
        </Tooltip>

        {/* Excluded features */}
        <Autocomplete
          multiple
          size="small"
          options={FEATURE_CODES}
          value={excludedFeatures}
          onChange={(_, v) => onExcludedFeaturesChange(v)}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('mda.params.excludedFeatures')}
              helperText={t('mda.params.excludedFeaturesHint')}
            />
          )}
        />
      </AccordionDetails>
    </Accordion>
  )
}

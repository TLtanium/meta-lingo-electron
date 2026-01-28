/**
 * POS Filter Panel Component for Synonym Analysis
 * Simple dropdown selector for POS filtering
 */

import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Chip
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import { useTranslation } from 'react-i18next'
import { POS_FILTER_OPTIONS } from '../../types/synonym'

interface POSFilterPanelProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function POSFilterPanel({
  value,
  onChange,
  disabled = false
}: POSFilterPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Get display label for current selection
  const getDisplayLabel = () => {
    const option = POS_FILTER_OPTIONS.find(o => o.value === value)
    if (!option) return value
    return isZh ? option.label_zh : option.label_en
  }

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
          <FilterListIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            {t('synonym.posFilter.title')}
          </Typography>
          {value !== 'auto' && (
            <Chip 
              label={getDisplayLabel()} 
              size="small" 
              color="primary"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Stack>
      </AccordionSummary>
      
      <AccordionDetails>
        <FormControl fullWidth size="small">
          <InputLabel>{t('synonym.posFilter.title')}</InputLabel>
          <Select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            label={t('synonym.posFilter.title')}
            disabled={disabled}
          >
            {POS_FILTER_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2">
                    {isZh ? option.label_zh : option.label_en}
                  </Typography>
                  {option.value !== 'auto' && (
                    <Typography variant="caption" color="text.secondary">
                      ({option.value.toUpperCase()})
                    </Typography>
                  )}
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Help text */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {t('synonym.posFilter.helpText')}
        </Typography>

        {/* Warning for pronoun */}
        {value === 'pronoun' && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
            {t('synonym.posFilter.pronounWarning')}
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  )
}

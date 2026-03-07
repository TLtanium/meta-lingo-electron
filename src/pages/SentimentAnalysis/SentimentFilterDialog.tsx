/**
 * Dialog to choose which emotions to show. Separate panels for polarity and dimension.
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  Box,
  Typography
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { SentimentEmotionFilterPolarity, SentimentEmotionFilterDimension } from '../../types/sentiment'

const POLARITY_KEYS: (keyof SentimentEmotionFilterPolarity)[] = ['positive', 'negative', 'neutral']
const DIMENSION_KEYS: (keyof SentimentEmotionFilterDimension)[] = [
  'anger',
  'anticipation',
  'disgust',
  'fear',
  'joy',
  'sadness',
  'surprise',
  'trust',
  'others'
]

interface SentimentFilterDialogProps {
  open: boolean
  onClose: () => void
  analysisMode: 'polarity' | 'dimension'
  filterPolarity: SentimentEmotionFilterPolarity
  filterDimension: SentimentEmotionFilterDimension
  onConfirm: (
    polarity: SentimentEmotionFilterPolarity,
    dimension: SentimentEmotionFilterDimension
  ) => void
}

export default function SentimentFilterDialog({
  open,
  onClose,
  analysisMode,
  filterPolarity,
  filterDimension,
  onConfirm
}: SentimentFilterDialogProps) {
  const { t } = useTranslation()
  const [localPolarity, setLocalPolarity] = useState<SentimentEmotionFilterPolarity>(filterPolarity)
  const [localDimension, setLocalDimension] = useState<SentimentEmotionFilterDimension>(filterDimension)

  useEffect(() => {
    if (open) {
      setLocalPolarity(filterPolarity)
      setLocalDimension(filterDimension)
    }
  }, [open, filterPolarity, filterDimension])

  const handleConfirm = () => {
    onConfirm(localPolarity, localDimension)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('sentiment.filterDialog.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
          {analysisMode === 'polarity' && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                {t('sentiment.filterDialog.polarityTitle')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {POLARITY_KEYS.map((k) => (
                  <FormControlLabel
                    key={k}
                    control={
                      <Checkbox
                        size="small"
                        checked={localPolarity[k]}
                        onChange={(e) => setLocalPolarity((prev) => ({ ...prev, [k]: e.target.checked }))}
                      />
                    }
                    label={t(`sentiment.polarity.${k}`)}
                  />
                ))}
              </Box>
            </Box>
          )}
          {analysisMode === 'dimension' && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                {t('sentiment.filterDialog.dimensionTitle')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {DIMENSION_KEYS.map((k) => (
                  <FormControlLabel
                    key={k}
                    control={
                      <Checkbox
                        size="small"
                        checked={localDimension[k]}
                        onChange={(e) => setLocalDimension((prev) => ({ ...prev, [k]: e.target.checked }))}
                      />
                    }
                    label={t(`sentiment.dimension.${k}`)}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={handleConfirm}>
          {t('sentiment.filterDialog.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

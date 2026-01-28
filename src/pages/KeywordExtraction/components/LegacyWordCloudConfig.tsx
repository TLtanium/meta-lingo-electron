/**
 * Legacy Word Cloud Configuration Panel
 * Configuration panel for legacy Python wordcloud engine
 */

import { useState, useCallback } from 'react'
import {
  Box,
  Stack,
  Button,
  Typography,
  IconButton
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../components/common'
import type { WordCloudConfig, WordCloudColormap, WordCloudStyle } from '../../../types/wordFrequency'
import { WORDCLOUD_COLORMAPS } from '../../../types/wordFrequency'

interface LegacyWordCloudConfigProps {
  config: WordCloudConfig
  onChange: (config: WordCloudConfig) => void
}

// Map frontend style to backend style (Chinese)
const STYLE_OPTIONS: Array<{ value: WordCloudStyle; labelZh: string; labelEn: string; backendValue: string }> = [
  { value: 'default', labelZh: '默认', labelEn: 'Default', backendValue: '默认' },
  { value: 'mask', labelZh: '使用蒙版', labelEn: 'Use Mask', backendValue: '使用蒙版' },
  { value: 'imageColor', labelZh: '基于图片颜色', labelEn: 'Image Color Based', backendValue: '基于图片颜色' }
]

export default function LegacyWordCloudConfig({
  config,
  onChange
}: LegacyWordCloudConfigProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert(t('wordFrequency.viz.wordCloudConfig.invalidImageType'))
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert(t('wordFrequency.viz.wordCloudConfig.imageTooLarge'))
      return
    }

    // Convert to base64
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      onChange({
        ...config,
        maskImage: base64,
        maskImageFile: file
      })
    }
    reader.onerror = () => {
      alert(t('wordFrequency.viz.wordCloudConfig.imageReadError'))
    }
    reader.readAsDataURL(file)
  }, [config, onChange, t])

  // Handle file removal
  const handleFileRemove = useCallback(() => {
    onChange({
      ...config,
      maskImage: null,
      maskImageFile: null
    })
  }, [config, onChange])

  // Get style label
  const getStyleLabel = (style: WordCloudStyle) => {
    const option = STYLE_OPTIONS.find(opt => opt.value === style)
    return option ? (isZh ? option.labelZh : option.labelEn) : style
  }

  // Check if mask is required
  const requiresMask = config.style === 'mask' || config.style === 'imageColor'

  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%' }}>
      {/* Mask Image Upload */}
      {!config.maskImage ? (
        <Button
          variant="outlined"
          component="label"
          startIcon={<CloudUploadIcon />}
          size="small"
        >
          {t('wordFrequency.viz.wordCloudConfig.uploadMask')}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={handleFileUpload}
          />
        </Button>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="success.main">
            {config.maskImageFile?.name || t('wordFrequency.viz.wordCloudConfig.maskImageUploaded')}
          </Typography>
          <IconButton
            size="small"
            onClick={handleFileRemove}
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Stack>
  )
}

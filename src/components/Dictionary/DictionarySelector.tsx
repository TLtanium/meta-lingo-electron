/**
 * 词典选择器组件
 * 显示可用词典列表，支持多选
 */

import { Box, Chip, CircularProgress, Typography, Tooltip } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { dictSelectorChipStyles } from './DictionaryStyles'

export interface DictionaryInfo {
  name: string
  count: number
  filename: string
}

interface DictionarySelectorProps {
  dictionaries: DictionaryInfo[]
  selectedDicts: string[]
  onSelectionChange: (selected: string[]) => void
  loading?: boolean
}

export default function DictionarySelector({
  dictionaries,
  selectedDicts,
  onSelectionChange,
  loading = false,
}: DictionarySelectorProps) {
  const { t } = useTranslation()

  const handleToggle = (dictName: string) => {
    if (selectedDicts.includes(dictName)) {
      // 至少保留一个选中
      if (selectedDicts.length > 1) {
        onSelectionChange(selectedDicts.filter((d) => d !== dictName))
      }
    } else {
      onSelectionChange([...selectedDicts, dictName])
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          {t('dictionary.loadingDicts', 'Loading dictionaries...')}
        </Typography>
      </Box>
    )
  }

  if (dictionaries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('dictionary.noDicts', 'No dictionaries available')}
      </Typography>
    )
  }

  // 获取词典名称的翻译
  const getDictDisplayName = (dictName: string): string => {
    const translationKey = `dictionary.dictNames.${dictName}`
    const translated = t(translationKey, dictName)
    // 如果翻译键不存在，返回原名称
    return translated !== translationKey ? translated : dictName
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {dictionaries.map((dict) => {
        const isSelected = selectedDicts.includes(dict.name)
        return (
          <Tooltip
            key={dict.name}
            title={t('dictionary.entryCount', '{{count}} entries', { count: dict.count })}
          >
            <Chip
              label={getDictDisplayName(dict.name)}
              onClick={() => handleToggle(dict.name)}
              variant={isSelected ? 'filled' : 'outlined'}
              color={isSelected ? 'primary' : 'default'}
              sx={isSelected ? dictSelectorChipStyles.selected : dictSelectorChipStyles.default}
            />
          </Tooltip>
        )
      })}
    </Box>
  )
}

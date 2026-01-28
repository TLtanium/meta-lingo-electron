/**
 * 词典内容渲染组件
 * 负责渲染词条HTML内容，处理内部链接点击
 */

import { useRef, useEffect } from 'react'
import { Box, Typography, Alert } from '@mui/material'
import { useTranslation } from 'react-i18next'
import {
  getDictStyles,
  getFuzzyMatchStyles,
  getNotFoundStyles,
  emptyStateStyles,
} from './DictionaryStyles'
import MenuBookIcon from '@mui/icons-material/MenuBook'

export interface LookupResult {
  found: boolean
  word?: string
  content?: string
  fuzzy?: boolean
  matched_key?: string
  error?: string
}

interface DictionaryContentProps {
  dictName: string
  result: LookupResult | null
  onWordClick: (word: string) => void
  isLoading?: boolean
  isDark?: boolean
}

export default function DictionaryContent({
  dictName,
  result,
  onWordClick,
  isLoading = false,
  isDark = false,
}: DictionaryContentProps) {
  const { t } = useTranslation()
  const contentRef = useRef<HTMLDivElement>(null)

  // 处理内部链接点击
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a.dict-link') as HTMLAnchorElement

      if (link) {
        e.preventDefault()
        const word = link.getAttribute('data-word')
        if (word) {
          onWordClick(word)
        }
      }
    }

    const container = contentRef.current
    if (container) {
      container.addEventListener('click', handleClick)
      return () => container.removeEventListener('click', handleClick)
    }
  }, [onWordClick])

  // 加载中状态
  if (isLoading) {
    return (
      <Box sx={emptyStateStyles}>
        <Typography>{t('common.loading')}</Typography>
      </Box>
    )
  }

  // 无结果时显示空状态
  if (!result) {
    return (
      <Box sx={emptyStateStyles}>
        <MenuBookIcon sx={{ fontSize: 48, opacity: 0.5, mb: 2 }} />
        <Typography>{t('dictionary.inputToSearch', 'Enter a word to search')}</Typography>
      </Box>
    )
  }

  // 错误状态
  if (result.error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{result.error}</Alert>
      </Box>
    )
  }

  // 未找到结果
  if (!result.found) {
    return (
      <Box sx={getNotFoundStyles(isDark)}>
        <Typography>
          {t('dictionary.noResults')} "{result.word}"
        </Typography>
      </Box>
    )
  }

  // 获取词典对应样式
  const dictStyles = getDictStyles(dictName, isDark)

  return (
    <Box sx={{ p: 2 }}>
      {/* 模糊匹配提示 */}
      {result.fuzzy && result.matched_key && (
        <Box sx={getFuzzyMatchStyles(isDark)}>
          {t('dictionary.fuzzyMatch', 'Fuzzy match')}: <strong>{result.matched_key}</strong>
        </Box>
      )}

      {/* 词条内容 */}
      <Box
        ref={contentRef}
        sx={{
          ...dictStyles,
          p: 2,
          borderRadius: 2,
        }}
        dangerouslySetInnerHTML={{ __html: result.content || '' }}
      />
    </Box>
  )
}

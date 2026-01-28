/**
 * SearchAnnotateBox - 搜索标注框组件
 * 
 * 功能：
 * - 提供搜索输入框
 * - 精确词语匹配搜索（全词匹配）
 * - 显示匹配数量
 * - 回车触发批量标注
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Tooltip
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import { useTranslation } from 'react-i18next'

export interface SearchMatch {
  start: number
  end: number
  text: string
}

interface SearchAnnotateBoxProps {
  text: string
  onSearchChange: (searchTerm: string, matches: SearchMatch[]) => void
  onConfirmAnnotate: (matches: SearchMatch[]) => void
  disabled?: boolean
  placeholder?: string
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 检测文本是否包含中文字符
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text)
}

/**
 * 执行精确词语搜索
 * - 英文：使用词边界 \b
 * - 中文：直接字符串匹配
 */
function findExactMatches(searchTerm: string, text: string): SearchMatch[] {
  if (!searchTerm || !text) return []
  
  const matches: SearchMatch[] = []
  const isChinese = containsChinese(searchTerm)
  
  if (isChinese) {
    // 中文：直接字符串搜索
    let startIndex = 0
    while (true) {
      const index = text.indexOf(searchTerm, startIndex)
      if (index === -1) break
      
      matches.push({
        start: index,
        end: index + searchTerm.length,
        text: searchTerm
      })
      startIndex = index + 1
    }
  } else {
    // 英文：使用词边界正则
    try {
      const escapedTerm = escapeRegex(searchTerm)
      const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi')
      let match
      
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        })
      }
    } catch (e) {
      console.error('Regex error:', e)
    }
  }
  
  return matches
}

export default function SearchAnnotateBox({
  text,
  onSearchChange,
  onConfirmAnnotate,
  disabled = false,
  placeholder
}: SearchAnnotateBoxProps) {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  
  // 处理搜索词变化
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
    const newMatches = findExactMatches(value, text)
    setMatches(newMatches)
    onSearchChange(value, newMatches)
  }, [text, onSearchChange])
  
  // 处理回车确认
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && matches.length > 0) {
      e.preventDefault()
      onConfirmAnnotate(matches)
    }
  }, [matches, onConfirmAnnotate])
  
  // 清除搜索
  const handleClear = useCallback(() => {
    setSearchTerm('')
    setMatches([])
    onSearchChange('', [])
  }, [onSearchChange])
  
  // 当文本变化时重新搜索
  useEffect(() => {
    if (searchTerm) {
      const newMatches = findExactMatches(searchTerm, text)
      setMatches(newMatches)
      onSearchChange(searchTerm, newMatches)
    }
  }, [text])
  
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <TextField
        size="small"
        value={searchTerm}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder || t('annotation.searchPlaceholder', '搜索词语...')}
        sx={{ minWidth: 200 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
          endAdornment: searchTerm && (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleClear}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          )
        }}
      />
      
      {matches.length > 0 && (
        <Tooltip title={t('annotation.pressEnterToAnnotate', '按回车键批量标注')}>
          <Chip
            label={t('annotation.matchCount', '{{count}} 处匹配', { count: matches.length })}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Tooltip>
      )}
      
      {searchTerm && matches.length === 0 && (
        <Chip
          label={t('annotation.noMatches', '未找到匹配')}
          size="small"
          color="default"
          variant="outlined"
        />
      )}
    </Box>
  )
}


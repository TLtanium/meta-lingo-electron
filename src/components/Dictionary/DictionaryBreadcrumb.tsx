/**
 * 词典面包屑导航组件
 * 显示查询历史，支持返回之前的查询
 */

import { Box, Typography, IconButton, Tooltip } from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { useTranslation } from 'react-i18next'
import { getBreadcrumbStyles, breadcrumbItemStyles, breadcrumbActiveStyles } from './DictionaryStyles'

export interface NavHistoryItem {
  word: string
  dictionaries: string[]
}

interface DictionaryBreadcrumbProps {
  navHistory: NavHistoryItem[]
  currentWord: string
  onNavigate: (index: number) => void
  onHome: () => void
  isDark?: boolean
}

export default function DictionaryBreadcrumb({
  navHistory,
  currentWord,
  onNavigate,
  onHome,
  isDark = false,
}: DictionaryBreadcrumbProps) {
  const { t } = useTranslation()

  return (
    <Box sx={getBreadcrumbStyles(isDark)}>
      {/* 首页按钮 */}
      <Tooltip title={t('dictionary.home', 'Home')}>
        <IconButton
          size="small"
          onClick={onHome}
          sx={{
            color: 'rgba(255,255,255,0.8)',
            '&:hover': {
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
            },
          }}
        >
          <HomeIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* 历史记录 */}
      {navHistory.map((item, index) => (
        <Box key={index} sx={{ display: 'flex', alignItems: 'center' }}>
          <NavigateNextIcon
            sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px' }}
          />
          <Typography
            component="span"
            sx={breadcrumbItemStyles}
            onClick={() => onNavigate(index)}
          >
            {item.word}
          </Typography>
        </Box>
      ))}

      {/* 当前词 */}
      {currentWord && (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <NavigateNextIcon
            sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px' }}
          />
          <Typography component="span" sx={breadcrumbActiveStyles}>
            {currentWord}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

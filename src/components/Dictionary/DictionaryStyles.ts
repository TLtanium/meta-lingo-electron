/**
 * 词典样式定义
 * 通用选择器和导航样式；词条样式由隔离文档和导入的 CSS 提供
 */

import { SxProps, Theme } from '@mui/material'

export const getBreadcrumbStyles = (isDark: boolean): SxProps<Theme> => ({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '4px',
  padding: '10px 16px',
  background: isDark
    ? 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)'
    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  borderRadius: '8px',
  minHeight: '40px',
})

export const breadcrumbItemStyles: SxProps<Theme> = {
  color: 'rgba(255,255,255,0.8)',
  fontSize: '14px',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '4px',
  transition: 'all 0.2s',
  '&:hover': {
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
  },
}

export const breadcrumbActiveStyles: SxProps<Theme> = {
  ...breadcrumbItemStyles,
  color: 'white',
  fontWeight: 600,
  cursor: 'default',
  '&:hover': {
    background: 'transparent',
  },
}

// 词典选择器样式
export const dictSelectorChipStyles = {
  default: {
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'divider',
    '&:hover': {
      borderColor: 'primary.main',
      backgroundColor: 'rgba(21, 101, 192, 0.05)',
    },
  },
  selected: {
    backgroundColor: 'primary.main',
    borderColor: 'primary.main',
    color: 'white',
    '&:hover': {
      backgroundColor: 'primary.dark',
    },
  },
}

// 搜索框样式
export const searchBoxStyles: SxProps<Theme> = {
  position: 'relative',
  '& .MuiInputBase-root': {
    paddingRight: '100px',
  },
}

// 空状态样式
export const emptyStateStyles: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '300px',
  color: 'text.secondary',
}

// 结果容器样式 - 支持深色模式
export const getResultContainerStyles = (isDark: boolean): SxProps<Theme> => ({
  flex: 1,
  overflow: 'auto',
  padding: '20px',
  minHeight: 0,
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-track': {
    background: isDark ? '#2d2d3d' : '#f1f1f1',
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb': {
    background: isDark ? '#4a4a5a' : '#c1c1c1',
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    background: isDark ? '#5a5a6a' : '#a1a1a1',
  },
})

// 模糊匹配提示样式 - 支持深色模式
export const getFuzzyMatchStyles = (isDark: boolean): SxProps<Theme> => ({
  backgroundColor: isDark ? 'rgba(230, 81, 0, 0.15)' : '#fff3e0',
  color: isDark ? '#ffb74d' : '#e65100',
  padding: '10px 16px',
  borderRadius: '6px',
  marginBottom: '16px',
  fontSize: '14px',
  border: isDark ? '1px solid rgba(230, 81, 0, 0.3)' : 'none',
})

// 未找到提示样式 - 支持深色模式
export const getNotFoundStyles = (isDark: boolean): SxProps<Theme> => ({
  textAlign: 'center',
  padding: '40px 20px',
  color: isDark ? '#9e9e9e' : '#999',
  fontSize: '16px',
})

// 为了保持向后兼容，保留原来的导出（默认浅色模式）
export const breadcrumbStyles = getBreadcrumbStyles(false)
export const resultContainerStyles = getResultContainerStyles(false)
export const fuzzyMatchStyles = getFuzzyMatchStyles(false)
export const notFoundStyles = getNotFoundStyles(false)

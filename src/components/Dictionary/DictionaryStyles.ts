/**
 * 词典样式定义
 * 包含各词典的专属样式，支持浅色/深色模式
 */

import { SxProps, Theme } from '@mui/material'

// 词典内容基础样式 - 根据主题模式动态生成
export const getDictionaryContentStyles = (isDark: boolean): SxProps<Theme> => ({
  lineHeight: 1.8,
  fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
  '& a.dict-link': {
    color: isDark ? '#64b5f6' : '#1565c0',
    textDecoration: 'none',
    borderBottom: `1px dotted ${isDark ? '#64b5f6' : '#1565c0'}`,
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:hover': {
      color: isDark ? '#90caf9' : '#0d47a1',
      backgroundColor: isDark ? 'rgba(100, 181, 246, 0.15)' : '#e3f2fd',
      borderBottomStyle: 'solid',
    },
  },
})

// 麦克米伦词典样式
export const getMacmillanStyles = (isDark: boolean): SxProps<Theme> => ({
  ...getDictionaryContentStyles(isDark),
  background: isDark 
    ? 'linear-gradient(to bottom, rgba(198, 40, 40, 0.15) 0%, rgba(30, 30, 40, 0.95) 100%)'
    : 'linear-gradient(to bottom, #ffebee 0%, #ffffff 100%)',
  color: isDark ? '#e0e0e0' : 'inherit',
  '& h1, & h2': {
    color: isDark ? '#ef9a9a' : '#c62828',
    borderBottom: `2px solid ${isDark ? '#ef5350' : '#e57373'}`,
    paddingBottom: '8px',
    marginTop: '20px',
    marginBottom: '12px',
    fontWeight: 600,
  },
  '& h3': {
    color: isDark ? '#ef9a9a' : '#d32f2f',
    marginTop: '16px',
    marginBottom: '8px',
    fontWeight: 600,
    fontSize: '16px',
  },
  '& strong, & b': {
    color: isDark ? '#ef5350' : '#b71c1c',
    fontWeight: 700,
  },
  '& em, & i': {
    color: isDark ? '#e57373' : '#e53935',
    fontStyle: 'italic',
  },
})

// 朗文搭配词典样式
export const getLongmanCollStyles = (isDark: boolean): SxProps<Theme> => ({
  ...getDictionaryContentStyles(isDark),
  background: isDark
    ? 'linear-gradient(135deg, rgba(40, 53, 147, 0.3) 0%, rgba(30, 30, 40, 0.95) 50%, rgba(40, 53, 147, 0.15) 100%)'
    : 'linear-gradient(135deg, #e8eaf6 0%, #ffffff 50%, #f3f4f9 100%)',
  color: isDark ? '#e0e0e0' : 'inherit',
  '& .entryhead': {
    display: 'block',
    background: isDark
      ? 'linear-gradient(135deg, #1a237e, #283593)'
      : 'linear-gradient(135deg, #283593, #3949ab)',
    color: 'white',
    padding: '16px 24px',
    borderRadius: '10px',
    marginBottom: '24px',
    boxShadow: isDark
      ? '0 4px 12px rgba(0, 0, 0, 0.4)'
      : '0 4px 12px rgba(63, 81, 181, 0.3)',
  },
  '& .hwd': {
    fontSize: '1.8em',
    fontWeight: 800,
    marginRight: '12px',
    display: 'inline-block',
  },
  '& .PronCodes, & .pron': {
    color: '#ffeb3b',
    fontFamily: '"Courier New", monospace',
    fontSize: '1.1em',
    margin: '0 8px',
  },
  '& .pos': {
    background: 'rgba(255, 255, 255, 0.2)',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '0.9em',
    marginLeft: '8px',
  },
  '& .sense': {
    display: 'block',
    margin: '24px 0',
    padding: '20px',
    background: isDark ? 'rgba(40, 40, 55, 0.9)' : '#ffffff',
    borderRadius: '12px',
    boxShadow: isDark
      ? '0 2px 8px rgba(0,0,0,0.3)'
      : '0 2px 8px rgba(0,0,0,0.06)',
  },
  '& .sensenum': {
    display: 'inline-block',
    background: isDark
      ? 'linear-gradient(135deg, #303f9f, #3f51b5)'
      : 'linear-gradient(135deg, #3f51b5, #5c6bc0)',
    color: 'white',
    padding: '6px 14px',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '1.1em',
    marginRight: '12px',
    boxShadow: isDark
      ? '0 2px 6px rgba(0, 0, 0, 0.4)'
      : '0 2px 6px rgba(63, 81, 181, 0.3)',
  },
  '& .def': {
    display: 'block',
    color: isDark ? '#9fa8da' : '#1a237e',
    fontSize: '1.08em',
    lineHeight: 1.8,
    fontWeight: 600,
    margin: '12px 0 16px 0',
    padding: '12px 16px',
    background: isDark
      ? 'linear-gradient(to right, rgba(92, 107, 192, 0.2) 0%, transparent 100%)'
      : 'linear-gradient(to right, #e8eaf6 0%, transparent 100%)',
    borderLeft: `4px solid ${isDark ? '#7986cb' : '#5c6bc0'}`,
    borderRadius: '0 8px 8px 0',
  },
  '& .secheading': {
    display: 'block',
    background: isDark
      ? 'linear-gradient(135deg, #303f9f, #1a237e)'
      : 'linear-gradient(135deg, #3f51b5, #303f9f)',
    color: 'white',
    padding: '10px 18px',
    borderRadius: '8px',
    margin: '16px 0 12px 0',
    fontWeight: 700,
    fontSize: '1em',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    boxShadow: isDark
      ? '0 3px 10px rgba(0, 0, 0, 0.4)'
      : '0 3px 10px rgba(63, 81, 181, 0.25)',
    borderLeft: `5px solid ${isDark ? '#5c6bc0' : '#1a237e'}`,
  },
  '& .collocate': {
    display: 'block',
    margin: '12px 0',
    padding: '14px 18px',
    background: isDark ? 'rgba(50, 50, 70, 0.8)' : '#fafbff',
    borderRadius: '8px',
    borderLeft: `4px solid ${isDark ? '#5c6bc0' : '#7986cb'}`,
    boxShadow: isDark
      ? '0 2px 6px rgba(0,0,0,0.25)'
      : '0 2px 6px rgba(0,0,0,0.05)',
  },
  '& .colloc': {
    display: 'inline-block',
    background: isDark ? 'rgba(121, 134, 203, 0.3)' : '#c5cae9',
    color: isDark ? '#c5cae9' : '#1a237e',
    padding: '5px 12px',
    borderRadius: '6px',
    fontWeight: 700,
    fontSize: '1.02em',
    marginRight: '10px',
    marginBottom: '8px',
  },
  '& .collexa': {
    display: 'block',
    color: isDark ? '#b0b0b0' : '#212121',
    fontSize: '1em',
    lineHeight: 1.7,
    marginTop: '8px',
    padding: '10px 14px',
    background: isDark ? 'rgba(60, 60, 80, 0.6)' : '#f5f7ff',
    borderRadius: '6px',
    fontStyle: 'italic',
  },
  '& .colloinexa': {
    color: isDark ? '#90caf9' : '#1565c0',
    fontWeight: 600,
    textDecoration: 'underline',
    textDecorationStyle: 'wavy',
    textDecorationColor: isDark ? '#7986cb' : '#7986cb',
  },
})

// 默认词典样式
export const getDefaultDictStyles = (isDark: boolean): SxProps<Theme> => ({
  ...getDictionaryContentStyles(isDark),
  background: isDark
    ? 'linear-gradient(to bottom, rgba(40, 40, 55, 0.95) 0%, rgba(30, 30, 40, 0.95) 100%)'
    : 'linear-gradient(to bottom, #f5f5f5 0%, #ffffff 100%)',
  color: isDark ? '#e0e0e0' : '#333',
  '& h1, & h2, & h3': {
    color: isDark ? '#e0e0e0' : '#333',
    marginTop: '16px',
    marginBottom: '8px',
  },
  '& strong, & b': {
    color: isDark ? '#ffffff' : '#1a1a1a',
    fontWeight: 700,
  },
  '& em, & i': {
    color: isDark ? '#b0b0b0' : '#555',
    fontStyle: 'italic',
  },
})

/**
 * 根据词典名称和主题模式获取对应样式
 */
export function getDictStyles(dictName: string, isDark: boolean = false): SxProps<Theme> {
  const nameLower = dictName.toLowerCase()
  
  // 麦克米伦词典
  if (nameLower.includes('macmillan') || dictName.includes('麦克米伦')) {
    return getMacmillanStyles(isDark)
  }
  
  // 朗文搭配词典
  if ((nameLower.includes('longman') && nameLower.includes('coll')) ||
      dictName.includes('朗文搭配')) {
    return getLongmanCollStyles(isDark)
  }
  
  // 默认样式
  return getDefaultDictStyles(isDark)
}

// 面包屑样式 - 深色模式下调整渐变
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
export const dictionaryContentStyles = getDictionaryContentStyles(false)
export const macmillanStyles = getMacmillanStyles(false)
export const longmanCollStyles = getLongmanCollStyles(false)
export const defaultDictStyles = getDefaultDictStyles(false)
export const breadcrumbStyles = getBreadcrumbStyles(false)
export const resultContainerStyles = getResultContainerStyles(false)
export const fuzzyMatchStyles = getFuzzyMatchStyles(false)
export const notFoundStyles = getNotFoundStyles(false)

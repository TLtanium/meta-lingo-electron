/**
 * 词典查询弹窗主组件
 * 整合搜索、词典选择、内容展示、面包屑导航等功能
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Tabs,
  Tab,
  Typography,
  CircularProgress,
  Paper,
  Autocomplete,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@mui/material/styles'
import { dictionaryApi } from '../../api/utilities'
import DictionarySelector, { DictionaryInfo } from './DictionarySelector'
import DictionaryContent, { LookupResult } from './DictionaryContent'
import DictionaryBreadcrumb, { NavHistoryItem } from './DictionaryBreadcrumb'
import { emptyStateStyles } from './DictionaryStyles'

interface DictionaryDialogProps {
  open: boolean
  onClose: () => void
}

export default function DictionaryDialog({
  open,
  onClose,
}: DictionaryDialogProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  // 状态
  const [dictionaries, setDictionaries] = useState<DictionaryInfo[]>([])
  const [selectedDicts, setSelectedDicts] = useState<string[]>([])
  const [searchWord, setSearchWord] = useState('')
  const [currentWord, setCurrentWord] = useState('')
  const [results, setResults] = useState<Record<string, LookupResult>>({})
  const [activeDictionary, setActiveDictionary] = useState('')
  const searchGeneration = useRef(0)
  const [navHistory, setNavHistory] = useState<NavHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [dictsLoading, setDictsLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // 加载词典列表
  useEffect(() => {
    const refresh = () => { if (open) void loadDictionaries() }
    refresh()
    window.addEventListener('meta-lingo:user-resources-changed', refresh)
    return () => window.removeEventListener('meta-lingo:user-resources-changed', refresh)
  }, [open])


  const loadDictionaries = async () => {
    searchGeneration.current++
    setLoading(false)
    setDictsLoading(true)
    try {
      const response = await dictionaryApi.list()
      const data = response.data
      if (data?.success && data?.data) {
        setDictionaries(data.data)
        // 默认选中所有词典
        setSelectedDicts(data.data.map((d: DictionaryInfo) => d.name))
        setResults({})
      }
    } catch (error) {
      console.error('Failed to load dictionaries:', error)
    } finally {
      setDictsLoading(false)
    }
  }

  // 搜索词条
  const performSearch = useCallback(
    async (word: string, options: { dictionaries?: string[]; preferredDictionary?: string; addHistory?: boolean } = {}) => {
      const requestedDicts = options.dictionaries || selectedDicts
      if (!word.trim() || requestedDicts.length === 0) return
      const preferredDictionary = options.preferredDictionary || activeDictionary
      const generation = ++searchGeneration.current

      // 添加到历史记录
      if (options.addHistory !== false && currentWord && currentWord !== word) {
        setNavHistory((prev) => [...prev, { word: currentWord, dictionaries: [...selectedDicts], activeDictionary }])
      }

      setLoading(true)
      setCurrentWord(word)

      try {
        const response = await dictionaryApi.lookup(word, requestedDicts)
        if (generation !== searchGeneration.current) return
        const data = response.data
        if (data?.success) {
          const resultData = data.results || {}
          setResults(resultData)
          const dictNames = Object.keys(resultData).filter(name => requestedDicts.includes(name))
          if (dictNames.length > 0) {
            const foundIndex = dictNames.findIndex(
              (name) => resultData[name]?.found
            )
            setActiveDictionary(dictNames.includes(preferredDictionary)
              ? preferredDictionary : dictNames[foundIndex >= 0 ? foundIndex : 0])
          }
        }
      } catch (error) {
        console.error('Lookup failed:', error)
      } finally {
        if (generation === searchGeneration.current) setLoading(false)
      }
    },
    [selectedDicts, currentWord, activeDictionary]
  )

  // 获取输入建议
  const fetchSuggestions = useCallback(
    async (prefix: string) => {
      if (!prefix.trim() || selectedDicts.length === 0) {
        setSuggestions([])
        return
      }

      setSuggestionsLoading(true)
      try {
        const response = await dictionaryApi.suggestions(prefix, selectedDicts)
        const data = response.data
        if (data?.success) {
          setSuggestions(data.suggestions || [])
        }
      } catch (error) {
        console.error('Failed to fetch suggestions:', error)
      } finally {
        setSuggestionsLoading(false)
      }
    },
    [selectedDicts]
  )

  // 输入变化处理
  const handleInputChange = (_: unknown, value: string) => {
    setSearchWord(value)

    // 防抖获取建议
    if (suggestionDebounceRef.current) {
      clearTimeout(suggestionDebounceRef.current)
    }
    suggestionDebounceRef.current = setTimeout(() => {
      fetchSuggestions(value)
    }, 300)
  }

  // 搜索处理
  const handleSearch = () => {
    if (searchWord.trim()) {
      performSearch(searchWord.trim())
    }
  }

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  // 词条内链接点击
  const handleWordClick = (word: string, dictionary: string) => {
    setSearchWord(word)
    performSearch(word, { preferredDictionary: dictionary })
  }

  // 面包屑导航
  const handleNavigate = (index: number) => {
    if (index < navHistory.length) {
      const target = navHistory[index]
      setNavHistory(navHistory.slice(0, index))
      setSelectedDicts(target.dictionaries)
      setSearchWord(target.word)
      performSearch(target.word, { dictionaries: target.dictionaries, preferredDictionary: target.activeDictionary, addHistory: false })
    }
  }

  // 返回首页
  const handleHome = () => {
    searchGeneration.current++
    setLoading(false)
    setNavHistory([])
    setCurrentWord('')
    setResults({})
    setSearchWord('')
  }

  // 关闭弹窗重置状态
  const handleClose = () => {
    searchGeneration.current++
    setLoading(false)
    setNavHistory([])
    setCurrentWord('')
    setResults({})
    setSearchWord('')
    onClose()
  }

  // 获取当前显示的词典名列表
  const displayDicts = Object.keys(results).filter((name) => selectedDicts.includes(name))

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          height: '80vh',
          maxHeight: 700,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* 标题栏 */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MenuBookIcon color="primary" />
          <Typography variant="h6">{t('dictionary.title')}</Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {!dictsLoading && dictionaries.length === 0 && <Alert severity="info" sx={{ m: 2 }}>{t('resources.dictionaryEmpty')}</Alert>}
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1, overflow: 'hidden' }}>
        {/* 搜索区域 */}
        <Paper elevation={0} sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'grey.50' }}>
          {/* 搜索框 */}
          <Autocomplete
            freeSolo
            options={suggestions}
            loading={suggestionsLoading}
            inputValue={searchWord}
            onInputChange={handleInputChange}
            onKeyDown={handleKeyDown}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={searchInputRef}
                placeholder={t('dictionary.search')}
                size="small"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <>
                      {suggestionsLoading ? <CircularProgress size={16} /> : null}
                      <InputAdornment position="end">
                        <IconButton
                          onClick={handleSearch}
                          disabled={!searchWord.trim() || selectedDicts.length === 0}
                          size="small"
                          color="primary"
                        >
                          <SearchIcon />
                        </IconButton>
                      </InputAdornment>
                    </>
                  ),
                }}
              />
            )}
            sx={{ mb: 2 }}
          />

          {/* 词典选择器 */}
          <DictionarySelector
            dictionaries={dictionaries}
            selectedDicts={selectedDicts}
            onSelectionChange={setSelectedDicts}
            loading={dictsLoading}
          />
        </Paper>

        {/* 面包屑导航 */}
        {(navHistory.length > 0 || currentWord) && (
          <DictionaryBreadcrumb
            navHistory={navHistory}
            currentWord={currentWord}
            onNavigate={handleNavigate}
            onHome={handleHome}
            isDark={isDark}
          />
        )}

        {/* 结果区域 */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {loading ? (
            <Box sx={emptyStateStyles}>
              <CircularProgress />
              <Typography sx={{ mt: 2 }}>{t('common.loading')}</Typography>
            </Box>
          ) : displayDicts.length > 0 ? (
            <>
              {/* 标签页 */}
              <Tabs
                value={displayDicts.includes(activeDictionary) ? activeDictionary : displayDicts[0]}
                onChange={(_, v) => setActiveDictionary(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ borderBottom: 1, borderColor: 'divider' }}
              >
                {displayDicts.map((dictName) => (
                  <Tab key={dictName} value={dictName} label={dictName} />
                ))}
              </Tabs>

              {/* 内容区域 - 滚动容器 */}
              <Box 
                sx={{ 
                  flex: 1, 
                  minHeight: 0,
                  overflow: 'auto',
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
                }}
              >
                {displayDicts.map((dictName) => (
                  <Box
                    key={dictName}
                    role="tabpanel"
                    hidden={(displayDicts.includes(activeDictionary) ? activeDictionary : displayDicts[0]) !== dictName}
                    sx={{ 
                      display: (displayDicts.includes(activeDictionary) ? activeDictionary : displayDicts[0]) === dictName ? 'block' : 'none',
                    }}
                  >
                    <DictionaryContent
                      dictName={dictName}
                      result={results[dictName]}
                      onWordClick={word => handleWordClick(word, dictName)}
                      isDark={isDark}
                    />
                  </Box>
                ))}
              </Box>
            </>
          ) : (
            <Box sx={emptyStateStyles}>
              <MenuBookIcon sx={{ fontSize: 48, opacity: 0.5, mb: 2 }} />
              <Typography color="text.secondary">
                {t('dictionary.inputToSearch', 'Enter a word and click search')}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}

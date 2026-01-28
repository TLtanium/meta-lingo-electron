/**
 * Co-occurrence Search Panel
 * Configures search mode, value, and context size
 * 6 search modes: simple, lemma, phrase, word, character, cql
 */

import { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Checkbox,
  FormControlLabel,
  Slider,
  Stack,
  Collapse,
  SelectChangeEvent,
  Alert,
  Tooltip,
  IconButton,
  Chip
} from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useTranslation } from 'react-i18next'
import type { SearchMode } from '../../../types/collocation'
import { SEARCH_MODE_LABELS } from '../../../types/collocation'
import CQLEditor from './CQLEditor'

interface CollocationSearchPanelProps {
  searchMode: SearchMode
  searchValue: string
  contextSize: number
  lowercase: boolean
  onSearchModeChange: (mode: SearchMode) => void
  onSearchValueChange: (value: string) => void
  onContextSizeChange: (size: number) => void
  onLowercaseChange: (lowercase: boolean) => void
  disabled?: boolean
}

export default function CollocationSearchPanel({
  searchMode,
  searchValue,
  contextSize,
  lowercase,
  onSearchModeChange,
  onSearchValueChange,
  onContextSizeChange,
  onLowercaseChange,
  disabled = false
}: CollocationSearchPanelProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const [showHelp, setShowHelp] = useState(false)

  // Handle search mode change
  const handleSearchModeChange = (event: SelectChangeEvent<SearchMode>) => {
    onSearchModeChange(event.target.value as SearchMode)
    onSearchValueChange('') // Clear value when mode changes
  }

  // Get placeholder based on search mode
  const getPlaceholder = () => {
    switch (searchMode) {
      case 'simple':
        return isZh 
          ? '输入搜索词... (如: m*, ???t, return|go back, multi--billion)' 
          : 'Enter search word... (e.g., m*, ???t, return|go back, multi--billion)'
      case 'lemma':
        return isZh ? '输入词元... (如: go, b.*)' : 'Enter lemma... (e.g., go, b.*)'
      case 'phrase':
        return isZh ? '输入短语...' : 'Enter phrase...'
      case 'word':
        return isZh ? '输入词形...' : 'Enter word form...'
      case 'character':
        return isZh ? '输入字符或字符串... (如: ck, ing)' : 'Enter character or string... (e.g., ck, ing)'
      case 'cql':
        return isZh ? '输入CQL查询...' : 'Enter CQL query...'
      default:
        return ''
    }
  }

  // Get helper text for search mode
  const getHelperText = () => {
    const modeInfo = SEARCH_MODE_LABELS[searchMode]
    return isZh ? modeInfo.desc_zh : modeInfo.desc_en
  }

  // Render search input based on mode
  const renderSearchInput = () => {
    if (searchMode === 'cql') {
      return (
        <CQLEditor
          value={searchValue}
          onChange={onSearchValueChange}
          disabled={disabled}
        />
      )
    }

    return (
      <TextField
        fullWidth
        size="small"
        placeholder={getPlaceholder()}
        value={searchValue}
        onChange={(e) => onSearchValueChange(e.target.value)}
        disabled={disabled}
        multiline={searchMode === 'phrase'}
        rows={searchMode === 'phrase' ? 2 : 1}
      />
    )
  }

  // Get wildcard chips for simple mode
  const getWildcardChips = () => {
    if (searchMode !== 'simple') return null
    
    const wildcards = [
      { symbol: '*', desc: isZh ? '任意字符' : 'any chars' },
      { symbol: '?', desc: isZh ? '单字符' : 'one char' },
      { symbol: '|', desc: isZh ? '或' : 'or' },
      { symbol: '--', desc: isZh ? '连字符变体' : 'hyphen variants' }
    ]
    
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
        {wildcards.map(({ symbol, desc }) => (
          <Chip
            key={symbol}
            label={`${symbol} ${desc}`}
            size="small"
            variant="outlined"
            sx={{ 
              fontSize: '0.7rem',
              height: 20,
              '& .MuiChip-label': { px: 1 }
            }}
          />
        ))}
      </Stack>
    )
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        {t('collocation.search.title')}
      </Typography>

      <Stack spacing={2}>
        {/* Search Mode with Help Toggle */}
        <Box>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <FormControl fullWidth size="small">
              <InputLabel>{t('collocation.search.mode')}</InputLabel>
              <Select
                value={searchMode}
                onChange={handleSearchModeChange}
                label={t('collocation.search.mode')}
                disabled={disabled}
              >
                {(Object.keys(SEARCH_MODE_LABELS) as SearchMode[]).map(mode => (
                  <MenuItem key={mode} value={mode}>
                    <Typography>
                      {isZh ? SEARCH_MODE_LABELS[mode].zh : SEARCH_MODE_LABELS[mode].en}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Tooltip title={showHelp ? (isZh ? '隐藏说明' : 'Hide help') : (isZh ? '显示说明' : 'Show help')}>
              <IconButton
                size="small"
                onClick={() => setShowHelp(!showHelp)}
                sx={{ mt: 0.5 }}
              >
                {showHelp ? <ExpandLessIcon fontSize="small" /> : <InfoOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Collapsible Help Panel */}
          <Collapse in={showHelp}>
            <Box 
              sx={{ 
                mt: 1,
                p: 1.5,
                bgcolor: 'action.hover',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  {getHelperText()}
                </Typography>
                
                {/* Wildcard chips for simple mode */}
                {getWildcardChips()}
                
                {/* Examples */}
                {searchMode === 'simple' && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                      {isZh ? '示例' : 'Examples'}:
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 1 }}>
                      m* | ???t | return|go back | multi--billion
                    </Typography>
                  </Box>
                )}
                {searchMode === 'lemma' && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                      {isZh ? '示例' : 'Examples'}:
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 1 }}>
                      go {isZh ? '(匹配 go, goes, went, going, gone)' : '(matches go, goes, went, going, gone)'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 1 }}>
                      b.* {isZh ? '(词元以b开头的词)' : '(lemmas starting with b)'}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Box>
          </Collapse>
        </Box>

        {/* Search Value */}
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {t('collocation.search.value')}
          </Typography>
          {renderSearchInput()}
        </Box>

        {/* Lowercase option - not applicable for CQL mode */}
        {searchMode !== 'cql' && (
          <FormControlLabel
            control={
              <Checkbox
                checked={lowercase}
                onChange={(e) => onLowercaseChange(e.target.checked)}
                size="small"
                disabled={disabled}
              />
            }
            label={
              <Typography variant="body2">
                {t('collocation.search.lowercase')}
              </Typography>
            }
          />
        )}

        {/* Context Size */}
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {isZh ? '上下文长度' : 'Context Size'}: {contextSize}
          </Typography>
          <Slider
            value={contextSize}
            onChange={(_, value) => onContextSizeChange(value as number)}
            min={1}
            max={15}
            marks={[
              { value: 1, label: '1' },
              { value: 5, label: '5' },
              { value: 10, label: '10' },
              { value: 15, label: '15' }
            ]}
            disabled={disabled}
            size="small"
          />
        </Box>
      </Stack>
    </Paper>
  )
}

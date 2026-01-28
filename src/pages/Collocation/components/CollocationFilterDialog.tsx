/**
 * Co-occurrence Filter Dialog
 * Filters KWIC results based on various criteria
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Radio,
  RadioGroup,
  ToggleButton,
  ToggleButtonGroup,
  SelectChangeEvent
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import { useTranslation } from 'react-i18next'

// Query types
type QueryType = 'simple' | 'lemma' | 'phrase' | 'word' | 'character' | 'cql'

// Range types
type RangeType = 'token' | 'sentence' | 'custom'

// Position unit type
type PositionUnit = 'token' | 'sentence'

// Filter configuration
export interface FilterConfig {
  // Basic options
  keepMode: 'containing' | 'not_containing'
  queryType: QueryType
  queryValue: string
  
  // Range options
  rangeType: RangeType
  rangeStart: number
  rangeEnd: number
  rangeStartUnit: PositionUnit
  rangeEndUnit: PositionUnit
  excludeKwic: boolean
  
  // Quick filters
  hideSubHits: boolean
  onlyFirstHit: boolean
}

// Default filter config
const DEFAULT_FILTER: FilterConfig = {
  keepMode: 'containing',
  queryType: 'simple',
  queryValue: '',
  rangeType: 'token',
  rangeStart: -3,
  rangeEnd: 3,
  rangeStartUnit: 'token',
  rangeEndUnit: 'token',
  excludeKwic: false,
  hideSubHits: false,
  onlyFirstHit: false
}

interface CollocationFilterDialogProps {
  open: boolean
  onClose: () => void
  onApply: (config: FilterConfig) => void
  initialConfig?: FilterConfig
}

// Query type labels
const QUERY_TYPE_LABELS: Record<QueryType, { en: string; zh: string }> = {
  simple: { en: 'Simple', zh: '简单匹配' },
  lemma: { en: 'Lemma', zh: '词元匹配' },
  phrase: { en: 'Phrase', zh: '短语匹配' },
  word: { en: 'Word', zh: '词形匹配' },
  character: { en: 'Character', zh: '字符匹配' },
  cql: { en: 'CQL', zh: 'CQL查询' }
}

// Number input component
function NumberInput({ 
  value, 
  onChange, 
  min = -10, 
  max = 10 
}: { 
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={0}>
      <IconButton 
        size="small" 
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 0.5 }}
      >
        <RemoveIcon fontSize="small" />
      </IconButton>
      <Typography 
        sx={{ 
          minWidth: 40, 
          textAlign: 'center', 
          fontWeight: 500,
          px: 1
        }}
      >
        {value}
      </Typography>
      <IconButton 
        size="small" 
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 0.5 }}
      >
        <AddIcon fontSize="small" />
      </IconButton>
    </Stack>
  )
}

export default function CollocationFilterDialog({
  open,
  onClose,
  onApply,
  initialConfig
}: CollocationFilterDialogProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Filter config state
  const [config, setConfig] = useState<FilterConfig>(DEFAULT_FILTER)

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setConfig(initialConfig || DEFAULT_FILTER)
    }
  }, [open, initialConfig])

  // Update config
  const updateConfig = (updates: Partial<FilterConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }))
  }

  // Handle range position toggle for token/sentence mode
  const handleRangeToggle = (position: number) => {
    const isKwic = position === 0
    if (isKwic) {
      // Toggle exclude KWIC
      updateConfig({ excludeKwic: !config.excludeKwic })
      return
    }
    
    const isSelected = position >= config.rangeStart && position <= config.rangeEnd
    
    if (isSelected) {
      // Shrink the range
      if (position === config.rangeStart) {
        updateConfig({ rangeStart: position + 1 })
      } else if (position === config.rangeEnd) {
        updateConfig({ rangeEnd: position - 1 })
      }
    } else {
      // Expand the range
      if (position < config.rangeStart) {
        updateConfig({ rangeStart: position })
      } else if (position > config.rangeEnd) {
        updateConfig({ rangeEnd: position })
      }
    }
  }

  // Check if position is in range
  const isInRange = (position: number) => {
    if (position === 0) {
      return !config.excludeKwic
    }
    return position >= config.rangeStart && position <= config.rangeEnd
  }

  // Handle apply
  const handleApply = () => {
    onApply(config)
    onClose()
  }

  // Render token range selector
  const renderTokenRangeSelector = () => {
    const positions = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
    
    return (
      <Box sx={{ mt: 1 }}>
        <Stack direction="row" spacing={0} alignItems="center" justifyContent="center" flexWrap="wrap">
          {positions.map(pos => {
            const isKwic = pos === 0
            const inRange = isInRange(pos)
            
            return (
              <ToggleButton
                key={pos}
                value={pos}
                selected={inRange}
                onChange={() => handleRangeToggle(pos)}
                sx={{
                  minWidth: isKwic ? 50 : 32,
                  height: 32,
                  fontSize: '0.8rem',
                  fontWeight: isKwic ? 600 : 400,
                  '&.Mui-selected': {
                    bgcolor: isKwic ? 'primary.main' : 'primary.light',
                    color: 'white',
                    '&:hover': { bgcolor: isKwic ? 'primary.dark' : 'primary.main' }
                  }
                }}
              >
                {isKwic ? 'KWIC' : pos}
              </ToggleButton>
            )
          })}
        </Stack>
      </Box>
    )
  }

  // Render sentence range selector (similar to token but for sentences)
  const renderSentenceRangeSelector = () => {
    const positions = [-2, -1, 0, 1, 2]
    
    return (
      <Box sx={{ mt: 1 }}>
        <Stack direction="row" spacing={0} alignItems="center" justifyContent="center">
          {positions.map(pos => {
            const isKwic = pos === 0
            const inRange = isInRange(pos)
            
            return (
              <ToggleButton
                key={pos}
                value={pos}
                selected={inRange}
                onChange={() => handleRangeToggle(pos)}
                sx={{
                  minWidth: isKwic ? 50 : 40,
                  height: 32,
                  fontSize: '0.8rem',
                  fontWeight: isKwic ? 600 : 400,
                  '&.Mui-selected': {
                    bgcolor: isKwic ? 'primary.main' : 'primary.light',
                    color: 'white',
                    '&:hover': { bgcolor: isKwic ? 'primary.dark' : 'primary.main' }
                  }
                }}
              >
                {isKwic ? 'KWIC' : pos}
              </ToggleButton>
            )
          })}
        </Stack>
      </Box>
    )
  }

  // Render custom range selector
  const renderCustomRangeSelector = () => {
    return (
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} justifyContent="center" flexWrap="wrap">
          {/* From */}
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {isZh ? '从' : 'From'}
            </Typography>
            <NumberInput
              value={config.rangeStart}
              onChange={(v) => updateConfig({ rangeStart: v })}
              min={-10}
              max={0}
            />
            <Typography variant="body2" color="text.secondary">
              {isZh ? '位置' : 'position'}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <Select
                value={config.rangeStartUnit}
                onChange={(e: SelectChangeEvent) => updateConfig({ rangeStartUnit: e.target.value as PositionUnit })}
              >
                <MenuItem value="token">Token</MenuItem>
                <MenuItem value="sentence">{isZh ? '句子' : 'Sentence'}</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {/* To */}
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {isZh ? '到' : 'to'}
            </Typography>
            <NumberInput
              value={config.rangeEnd}
              onChange={(v) => updateConfig({ rangeEnd: v })}
              min={0}
              max={10}
            />
            <Typography variant="body2" color="text.secondary">
              {isZh ? '位置' : 'position'}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <Select
                value={config.rangeEndUnit}
                onChange={(e: SelectChangeEvent) => updateConfig({ rangeEndUnit: e.target.value as PositionUnit })}
              >
                <MenuItem value="token">Token</MenuItem>
                <MenuItem value="sentence">{isZh ? '句子' : 'Sentence'}</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>

        {/* Exclude KWIC checkbox */}
        <Box sx={{ textAlign: 'center', mt: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={config.excludeKwic}
                onChange={(e) => updateConfig({ excludeKwic: e.target.checked })}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                {isZh ? '排除 KWIC' : 'Exclude KWIC'}
              </Typography>
            }
          />
        </Box>
      </Box>
    )
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6">
          {isZh ? '筛选设置' : 'Filter Settings'}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {/* Keep lines selector */}
        <Stack direction="row" alignItems="center" spacing={2} mb={2}>
          <Typography variant="body2">
            {isZh ? '保留行:' : 'Keep lines:'}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={config.keepMode}
              onChange={(e: SelectChangeEvent) => updateConfig({ keepMode: e.target.value as 'containing' | 'not_containing' })}
            >
              <MenuItem value="containing">{isZh ? '包含' : 'Containing'}</MenuItem>
              <MenuItem value="not_containing">{isZh ? '不包含' : 'Not containing'}</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* Query type selector - dropdown */}
        <Stack direction="row" alignItems="center" spacing={2} mb={2}>
          <Typography variant="body2">
            {isZh ? '查询类型:' : 'Query type:'}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={config.queryType}
              onChange={(e: SelectChangeEvent) => updateConfig({ queryType: e.target.value as QueryType })}
            >
              {(Object.keys(QUERY_TYPE_LABELS) as QueryType[]).map(type => (
                <MenuItem key={type} value={type}>
                  {isZh ? QUERY_TYPE_LABELS[type].zh : QUERY_TYPE_LABELS[type].en}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {/* Query value input */}
        <TextField
          fullWidth
          size="small"
          label={isZh ? '查询内容' : 'Query value'}
          placeholder={isZh ? '输入查询内容...' : 'Enter query...'}
          value={config.queryValue}
          onChange={(e) => updateConfig({ queryValue: e.target.value })}
          sx={{ mb: 3 }}
        />

        {/* Range options */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {isZh ? '范围:' : 'Range:'}
          </Typography>

          <RadioGroup
            value={config.rangeType}
            onChange={(e) => {
              const newType = e.target.value as RangeType
              updateConfig({ 
                rangeType: newType,
                // Reset range values based on type
                rangeStart: newType === 'sentence' ? -1 : -3,
                rangeEnd: newType === 'sentence' ? 1 : 3
              })
            }}
          >
            <FormControlLabel
              value="token"
              control={<Radio size="small" />}
              label={<Typography variant="body2">Token</Typography>}
            />
            {config.rangeType === 'token' && renderTokenRangeSelector()}
            
            <FormControlLabel
              value="sentence"
              control={<Radio size="small" />}
              label={<Typography variant="body2">{isZh ? '句子' : 'Sentence'}</Typography>}
            />
            {config.rangeType === 'sentence' && renderSentenceRangeSelector()}
            
            <FormControlLabel
              value="custom"
              control={<Radio size="small" />}
              label={<Typography variant="body2">{isZh ? '自定义' : 'Custom'}</Typography>}
            />
            {config.rangeType === 'custom' && renderCustomRangeSelector()}
          </RadioGroup>
        </Box>

        {/* Quick filters */}
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {isZh ? '快速筛选:' : 'Quick filters:'}
          </Typography>
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={config.hideSubHits}
                  onChange={(e) => updateConfig({ hideSubHits: e.target.checked })}
                  size="small"
                />
              }
              label={<Typography variant="body2">{isZh ? '隐藏子匹配' : 'Hide sub-hits'}</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={config.onlyFirstHit}
                  onChange={(e) => updateConfig({ onlyFirstHit: e.target.checked })}
                  size="small"
                />
              }
              label={<Typography variant="body2">{isZh ? '仅文档首次命中' : 'Only 1st hit in doc'}</Typography>}
            />
          </Stack>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit">
          {isZh ? '取消' : 'Cancel'}
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
        >
          {isZh ? '应用' : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

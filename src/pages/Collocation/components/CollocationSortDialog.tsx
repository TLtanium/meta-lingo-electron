/**
 * Co-occurrence Sort Dialog
 * Configures sorting options for KWIC results
 */

import { useState, useEffect, useRef } from 'react'
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
  Paper,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  SelectChangeEvent
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { useTranslation } from 'react-i18next'

// Sort position options
type SortPosition = '3L' | '2L' | '1L' | 'KWIC' | '1R' | '2R' | '3R'

// Sort attribute options
type SortAttribute = 'word' | 'lemma' | 'pos'

// Single sort criterion
interface SortCriterion {
  id: string
  position: SortPosition
  attribute: SortAttribute
  ignoreCase: boolean
  retrograde: boolean
}

interface CollocationSortDialogProps {
  open: boolean
  onClose: () => void
  onApply: (criteria: SortCriterion[], descending: boolean) => void
  initialCriteria?: SortCriterion[]
  initialDescending?: boolean
}

// Default criterion
const createDefaultCriterion = (id: string): SortCriterion => ({
  id,
  position: '1L',
  attribute: 'word',
  ignoreCase: false,
  retrograde: false
})

export default function CollocationSortDialog({
  open,
  onClose,
  onApply,
  initialCriteria,
  initialDescending = false
}: CollocationSortDialogProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Sort criteria state
  const [criteria, setCriteria] = useState<SortCriterion[]>([
    createDefaultCriterion('1')
  ])
  
  // Sort order state
  const [descending, setDescending] = useState<boolean>(false)
  
  // Track previous open state to detect when dialog opens
  const prevOpenRef = useRef(false)
  // Store initial values when dialog opens
  const initialValuesRef = useRef<{ criteria?: SortCriterion[]; descending: boolean } | null>(null)

  // Reset when dialog opens (only when transitioning from closed to open)
  useEffect(() => {
    const wasOpen = prevOpenRef.current
    const isOpen = open
    
    if (isOpen && !wasOpen) {
      // Dialog just opened, load initial values
      if (initialCriteria && initialCriteria.length > 0) {
        // Deep copy to avoid reference issues
        const criteriaCopy = JSON.parse(JSON.stringify(initialCriteria))
        setCriteria(criteriaCopy)
        initialValuesRef.current = { criteria: criteriaCopy, descending: initialDescending }
      } else {
        const defaultCriteria = [createDefaultCriterion('1')]
        setCriteria(defaultCriteria)
        initialValuesRef.current = { criteria: defaultCriteria, descending: initialDescending }
      }
      setDescending(initialDescending)
    } else if (!isOpen && wasOpen) {
      // Dialog just closed, clear initial values ref
      initialValuesRef.current = null
    }
    
    prevOpenRef.current = isOpen
  }, [open, initialCriteria, initialDescending])

  // Update a criterion
  const updateCriterion = (id: string, updates: Partial<SortCriterion>) => {
    setCriteria(prev => prev.map(c => 
      c.id === id ? { ...c, ...updates } : c
    ))
  }

  // Add a new criterion
  const addCriterion = () => {
    const newId = String(Date.now())
    setCriteria(prev => [...prev, createDefaultCriterion(newId)])
  }

  // Remove a criterion
  const removeCriterion = (id: string) => {
    if (criteria.length > 1) {
      setCriteria(prev => prev.filter(c => c.id !== id))
    }
  }

  // Handle apply
  const handleApply = () => {
    onApply(criteria, descending)
    onClose()
  }

  // Render a single criterion row
  const renderCriterion = (criterion: SortCriterion, index: number) => (
    <Paper 
      key={criterion.id}
      variant="outlined" 
      sx={{ p: 2, mb: 2, bgcolor: 'background.paper', borderColor: 'divider' }}
    >
      {/* Header with remove button */}
      {criteria.length > 1 && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="caption" color="text.secondary">
            {isZh ? `排序条件 ${index + 1}` : `Sort criterion ${index + 1}`}
          </Typography>
          <IconButton size="small" onClick={() => removeCriterion(criterion.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}

      {/* Position selector */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" mb={1}>
          <Typography variant="body2" color="text.secondary">
            {isZh ? '左侧上下文' : 'Left context'}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {isZh ? '右侧上下文' : 'Right context'}
          </Typography>
        </Stack>
        
        <Stack direction="row" spacing={0} alignItems="center" justifyContent="center">
          {/* Left context buttons */}
          <ToggleButtonGroup
            value={criterion.position}
            exclusive
            onChange={(_, value) => value && updateCriterion(criterion.id, { position: value })}
            size="small"
          >
            <ToggleButton value="3L" sx={{ px: 1.5 }}>3</ToggleButton>
            <ToggleButton value="2L" sx={{ px: 1.5 }}>2</ToggleButton>
            <ToggleButton value="1L" sx={{ px: 1.5 }}>1</ToggleButton>
          </ToggleButtonGroup>

          {/* KWIC button */}
          <ToggleButtonGroup
            value={criterion.position}
            exclusive
            onChange={(_, value) => value && updateCriterion(criterion.id, { position: value })}
            size="small"
            sx={{ mx: 1 }}
          >
            <ToggleButton 
              value="KWIC" 
              sx={{ 
                px: 2, 
                fontWeight: 600,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': {
                    bgcolor: 'primary.dark'
                  }
                }
              }}
            >
              KWIC
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Right context buttons */}
          <ToggleButtonGroup
            value={criterion.position}
            exclusive
            onChange={(_, value) => value && updateCriterion(criterion.id, { position: value })}
            size="small"
          >
            <ToggleButton value="1R" sx={{ px: 1.5 }}>1</ToggleButton>
            <ToggleButton value="2R" sx={{ px: 1.5 }}>2</ToggleButton>
            <ToggleButton value="3R" sx={{ px: 1.5 }}>3</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Box>

      {/* Sort attribute selector */}
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>{isZh ? '排序属性' : 'Sort attribute'}</InputLabel>
        <Select
          value={criterion.attribute}
          onChange={(e: SelectChangeEvent) => updateCriterion(criterion.id, { attribute: e.target.value as SortAttribute })}
          label={isZh ? '排序属性' : 'Sort attribute'}
        >
          <MenuItem value="word">{isZh ? '词形 (Word)' : 'Word'}</MenuItem>
          <MenuItem value="lemma">{isZh ? '词元 (Lemma)' : 'Lemma'}</MenuItem>
          <MenuItem value="pos">{isZh ? '词性 (Part of speech)' : 'Part of speech'}</MenuItem>
        </Select>
      </FormControl>

      {/* Checkboxes */}
      <Stack direction="row" spacing={3}>
        <FormControlLabel
          control={
            <Checkbox
              checked={criterion.ignoreCase}
              onChange={(e) => updateCriterion(criterion.id, { ignoreCase: e.target.checked })}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              {isZh ? '忽略大小写' : 'Ignore case'}
            </Typography>
          }
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={criterion.retrograde}
              onChange={(e) => updateCriterion(criterion.id, { retrograde: e.target.checked })}
              size="small"
            />
          }
          label={
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="body2">
                {isZh ? '按词尾排序' : 'Retrograde'}
              </Typography>
              <Tooltip title={isZh 
                ? '按词的最后一个字符开始排序，然后是倒数第二个字符，以此类推。适用于无词性标注的语料，有助于将相同词性或语法范畴的词聚在一起。' 
                : 'Sort by last character first, then second to last, etc. Useful for corpora without POS tags to group same parts of speech together.'
              }>
                <HelpOutlineIcon fontSize="small" sx={{ color: 'text.disabled' }} />
              </Tooltip>
            </Stack>
          }
        />
      </Stack>
    </Paper>
  )

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6">
          {isZh ? '排序设置' : 'Sort Settings'}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {/* Description */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {isZh 
            ? '按KWIC或其左右上下文的词进行字母排序。' 
            : 'Sort concordance lines alphabetically by KWIC or context tokens.'
          }
        </Typography>

        {/* Sort criteria */}
        {criteria.map((criterion, index) => renderCriterion(criterion, index))}

        {/* Add criterion button */}
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={addCriterion}
          fullWidth
          sx={{ mb: 2 }}
        >
          {isZh ? '增加排序条件' : 'Add sort criterion'}
        </Button>

        {/* Sort order selector */}
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>{isZh ? '排序顺序' : 'Sort order'}</InputLabel>
            <Select
              value={descending ? 'descending' : 'ascending'}
              onChange={(e: SelectChangeEvent) => setDescending(e.target.value === 'descending')}
              label={isZh ? '排序顺序' : 'Sort order'}
            >
              <MenuItem value="ascending">{isZh ? '升序 (A-Z)' : 'Ascending (A-Z)'}</MenuItem>
              <MenuItem value="descending">{isZh ? '降序 (Z-A)' : 'Descending (Z-A)'}</MenuItem>
            </Select>
          </FormControl>
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

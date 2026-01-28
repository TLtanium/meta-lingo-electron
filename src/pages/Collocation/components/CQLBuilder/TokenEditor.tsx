/**
 * Token Editor Component
 * Editor for configuring token conditions (attributes, operators, values)
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Button,
  Stack,
  Chip,
  Tooltip,
  Autocomplete
} from '@mui/material'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import { useTranslation } from 'react-i18next'
import type { TokenEditorProps, TokenCondition, ConditionGroup, TokenAttribute, ComparisonOperator } from './types'
import { 
  TOKEN_ATTRIBUTES, 
  COMPARISON_OPERATORS, 
  UNIVERSAL_POS_TAGS,
  PENN_POS_TAGS,
  DEPENDENCY_RELATIONS,
  generateId 
} from './constants'

export default function TokenEditor({
  element,
  onUpdate,
  onComplete,
  onCancel
}: TokenEditorProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // Initialize condition groups from element
  const [conditionGroups, setConditionGroups] = useState<ConditionGroup[]>(() => {
    if (element.conditionGroups && element.conditionGroups.length > 0) {
      return element.conditionGroups
    }
    // Default: single condition group with one empty condition
    return [{
      conditions: [{
        id: generateId(),
        attribute: 'lemma' as TokenAttribute,
        operator: '=' as ComparisonOperator,
        value: ''
      }],
      logic: 'and'
    }]
  })

  // Get suggestions based on attribute
  const getSuggestions = (attribute: TokenAttribute): { value: string; label: string }[] => {
    switch (attribute) {
      case 'pos':
      case 'headpos':
        return UNIVERSAL_POS_TAGS.map(tag => ({
          value: tag.value,
          label: `${tag.value} - ${isZh ? tag.label.zh : tag.label.en}`
        }))
      case 'tag':
        return PENN_POS_TAGS.map(tag => ({
          value: tag.value,
          label: `${tag.value} - ${isZh ? tag.label.zh : tag.label.en}`
        }))
      case 'dep':
      case 'headdep':
        return DEPENDENCY_RELATIONS.map(rel => ({
          value: rel.value,
          label: `${rel.value} - ${isZh ? rel.label.zh : rel.label.en}`
        }))
      default:
        return []
    }
  }
  
  // Check if attribute needs autocomplete suggestions
  const needsSuggestions = (attr: TokenAttribute): boolean => {
    return ['pos', 'tag', 'dep', 'headpos', 'headdep'].includes(attr)
  }

  // Update condition in group
  const updateCondition = (
    groupIndex: number, 
    conditionIndex: number, 
    field: keyof TokenCondition, 
    value: string
  ) => {
    setConditionGroups(prev => {
      const newGroups = [...prev]
      const newConditions = [...newGroups[groupIndex].conditions]
      newConditions[conditionIndex] = {
        ...newConditions[conditionIndex],
        [field]: value
      }
      newGroups[groupIndex] = { ...newGroups[groupIndex], conditions: newConditions }
      return newGroups
    })
  }

  // Add condition to group
  const addCondition = (groupIndex: number) => {
    setConditionGroups(prev => {
      const newGroups = [...prev]
      newGroups[groupIndex] = {
        ...newGroups[groupIndex],
        conditions: [
          ...newGroups[groupIndex].conditions,
          {
            id: generateId(),
            attribute: 'lemma' as TokenAttribute,
            operator: '=' as ComparisonOperator,
            value: ''
          }
        ]
      }
      return newGroups
    })
  }

  // Remove condition from group
  const removeCondition = (groupIndex: number, conditionIndex: number) => {
    setConditionGroups(prev => {
      const newGroups = [...prev]
      const newConditions = newGroups[groupIndex].conditions.filter((_, i) => i !== conditionIndex)
      if (newConditions.length === 0) {
        // Remove the entire group if no conditions left
        return newGroups.filter((_, i) => i !== groupIndex)
      }
      newGroups[groupIndex] = { ...newGroups[groupIndex], conditions: newConditions }
      return newGroups
    })
  }

  // Toggle logic operator for group
  const toggleGroupLogic = (groupIndex: number) => {
    setConditionGroups(prev => {
      const newGroups = [...prev]
      newGroups[groupIndex] = {
        ...newGroups[groupIndex],
        logic: newGroups[groupIndex].logic === 'and' ? 'or' : 'and'
      }
      return newGroups
    })
  }

  // Handle save
  const handleSave = () => {
    // Filter out empty conditions
    const validGroups = conditionGroups
      .map(group => ({
        ...group,
        conditions: group.conditions.filter(c => c.value.trim() !== '')
      }))
      .filter(group => group.conditions.length > 0)

    onUpdate({
      ...element,
      conditionGroups: validGroups.length > 0 ? validGroups : undefined
    })
    onComplete()
  }

  return (
    <Paper 
      sx={{ 
        p: 2, 
        bgcolor: 'primary.50',
        border: '2px solid',
        borderColor: 'primary.main',
        borderRadius: 2
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" color="primary.main">
          {isZh ? '编辑 Token' : 'Edit Token'}
        </Typography>
        <Box>
          <IconButton size="small" onClick={onCancel} sx={{ mr: 0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={handleSave} color="primary">
            <CheckIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Condition Groups */}
      {conditionGroups.map((group, groupIndex) => (
        <Box key={groupIndex} sx={{ mb: 2 }}>
          {/* Group header with logic toggle */}
          {groupIndex > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Chip
                label={group.logic.toUpperCase()}
                size="small"
                color={group.logic === 'and' ? 'primary' : 'secondary'}
                onClick={() => toggleGroupLogic(groupIndex)}
                sx={{ cursor: 'pointer' }}
              />
            </Box>
          )}

          {/* Conditions in group */}
          <Stack spacing={1.5}>
            {group.conditions.map((condition, conditionIndex) => (
              <Box key={condition.id}>
                {/* Logic operator between conditions */}
                {conditionIndex > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, ml: 1 }}>
                    <Chip
                      label={group.logic}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                  </Box>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {/* Delete button */}
                  {(group.conditions.length > 1 || conditionGroups.length > 1) && (
                    <IconButton 
                      size="small" 
                      onClick={() => removeCondition(groupIndex, conditionIndex)}
                      sx={{ color: 'error.main' }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}

                  {/* Attribute selector with grouped options */}
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>{isZh ? '属性' : 'Attr'}</InputLabel>
                    <Select
                      value={condition.attribute}
                      onChange={(e) => updateCondition(groupIndex, conditionIndex, 'attribute', e.target.value)}
                      label={isZh ? '属性' : 'Attr'}
                    >
                      {/* Basic attributes */}
                      <MenuItem disabled sx={{ opacity: 0.7, fontWeight: 'bold', fontSize: '0.75rem' }}>
                        {isZh ? '--- 基本属性 ---' : '--- Basic ---'}
                      </MenuItem>
                      {TOKEN_ATTRIBUTES.filter(a => a.category === 'basic' || !a.category).map(attr => (
                        <MenuItem key={attr.value} value={attr.value}>
                          <Tooltip title={isZh ? attr.description.zh : attr.description.en} placement="right">
                            <span>{isZh ? attr.label.zh : attr.label.en}</span>
                          </Tooltip>
                        </MenuItem>
                      ))}
                      {/* Head-based attributes for dependency constraints */}
                      <MenuItem disabled sx={{ opacity: 0.7, fontWeight: 'bold', fontSize: '0.75rem', mt: 1 }}>
                        {isZh ? '--- 头词属性 ---' : '--- Head Token ---'}
                      </MenuItem>
                      {TOKEN_ATTRIBUTES.filter(a => a.category === 'head').map(attr => (
                        <MenuItem key={attr.value} value={attr.value}>
                          <Tooltip title={isZh ? attr.description.zh : attr.description.en} placement="right">
                            <span>{isZh ? attr.label.zh : attr.label.en}</span>
                          </Tooltip>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Operator selector */}
                  <FormControl size="small" sx={{ minWidth: 70 }}>
                    <Select
                      value={condition.operator}
                      onChange={(e) => updateCondition(groupIndex, conditionIndex, 'operator', e.target.value)}
                    >
                      {COMPARISON_OPERATORS.map(op => (
                        <MenuItem key={op.value} value={op.value}>
                          <Tooltip title={isZh ? op.description.zh : op.description.en}>
                            <span>{op.label}</span>
                          </Tooltip>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Value input with suggestions */}
                  <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>"</Typography>
                    {needsSuggestions(condition.attribute) ? (
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={getSuggestions(condition.attribute)}
                        getOptionLabel={(option) => typeof option === 'string' ? option : option.value}
                        value={condition.value}
                        onChange={(_, newValue) => {
                          const value = typeof newValue === 'string' ? newValue : newValue?.value || ''
                          updateCondition(groupIndex, conditionIndex, 'value', value)
                        }}
                        onInputChange={(_, newValue) => {
                          updateCondition(groupIndex, conditionIndex, 'value', newValue)
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder={isZh ? '输入值...' : 'Enter value...'}
                            sx={{ minWidth: 120 }}
                          />
                        )}
                        renderOption={(props, option) => (
                          <li {...props} key={typeof option === 'string' ? option : option.value}>
                            {typeof option === 'string' ? option : option.label}
                          </li>
                        )}
                        sx={{ flex: 1 }}
                      />
                    ) : (
                      <TextField
                        size="small"
                        value={condition.value}
                        onChange={(e) => updateCondition(groupIndex, conditionIndex, 'value', e.target.value)}
                        placeholder={isZh ? '输入值...' : 'Enter value...'}
                        sx={{ flex: 1 }}
                      />
                    )}
                    <Typography sx={{ ml: 0.5, color: 'text.secondary' }}>"</Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>

          {/* Add condition button */}
          <Button
            size="small"
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => addCondition(groupIndex)}
            sx={{ mt: 1, textTransform: 'none' }}
          >
            {isZh ? '添加条件' : 'Add Condition'}
          </Button>
        </Box>
      ))}

      {/* Hint */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {isZh 
          ? '提示: 使用正则表达式进行模式匹配，如 ".*ing" 匹配所有以-ing结尾的词。使用头词属性(headword/headlemma等)可以约束语法关系。' 
          : 'Tip: Use regex for pattern matching, e.g., ".*ing" matches words ending in -ing. Use head attributes (headword/headlemma) to constrain grammatical relations.'}
      </Typography>
    </Paper>
  )
}


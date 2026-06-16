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
import { useTranslation } from 'react-i18next'
import QuantifierBar from './QuantifierBar'
import type { TokenEditorProps, TokenCondition, ConditionGroup, TokenAttribute, ComparisonOperator } from './types'
import { 
  TOKEN_ATTRIBUTES, 
  COMPARISON_OPERATORS, 
  UNIVERSAL_POS_TAGS,
  PENN_POS_TAGS,
  DEPENDENCY_RELATIONS,
  generateId 
} from './constants'
import { usasApi, flattenUsasDomains } from '../../../../api/usas'
import { NRC_POLARITY_LABELS, NRC_EMOTION_LABELS } from './constants'

export default function TokenEditor({
  element,
  onUpdate,
  onComplete,
  annotationLabels = [],
}: TokenEditorProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  // USAS domain options for usas attribute (loaded once)
  const [usasOptions, setUsasOptions] = useState<{ value: string; label: string }[]>([])
  useEffect(() => {
    let cancelled = false
    usasApi.getDomains().then((data) => {
      if (!cancelled) setUsasOptions(flattenUsasDomains(data))
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

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

  // Grouped suggestion option type
  type SuggestionOption = { value: string; label: string; group?: string }

  // Group keys for dep relations
  const DEP_GROUPS: Record<string, { zh: string; en: string }> = {
    nsubj: { zh: '核心论元', en: 'Core Arguments' }, nsubjpass: { zh: '核心论元', en: 'Core Arguments' },
    dobj: { zh: '核心论元', en: 'Core Arguments' }, obj: { zh: '核心论元', en: 'Core Arguments' },
    iobj: { zh: '核心论元', en: 'Core Arguments' }, csubj: { zh: '核心论元', en: 'Core Arguments' },
    ccomp: { zh: '核心论元', en: 'Core Arguments' }, xcomp: { zh: '核心论元', en: 'Core Arguments' },
    amod: { zh: '名词修饰语', en: 'Nominal Modifiers' }, advmod: { zh: '名词修饰语', en: 'Nominal Modifiers' },
    nmod: { zh: '名词修饰语', en: 'Nominal Modifiers' }, nummod: { zh: '名词修饰语', en: 'Nominal Modifiers' },
    det: { zh: '名词修饰语', en: 'Nominal Modifiers' }, poss: { zh: '名词修饰语', en: 'Nominal Modifiers' },
    case: { zh: '名词修饰语', en: 'Nominal Modifiers' },
    prep: { zh: '介词/斜格', en: 'Prepositional/Oblique' }, pobj: { zh: '介词/斜格', en: 'Prepositional/Oblique' },
    obl: { zh: '介词/斜格', en: 'Prepositional/Oblique' },
    compound: { zh: '复合/并列', en: 'Compound & Coord' }, 'compound:prt': { zh: '复合/并列', en: 'Compound & Coord' },
    conj: { zh: '复合/并列', en: 'Compound & Coord' }, cc: { zh: '复合/并列', en: 'Compound & Coord' },
    aux: { zh: '动词助元', en: 'Verb Auxiliaries' }, auxpass: { zh: '动词助元', en: 'Verb Auxiliaries' },
    cop: { zh: '动词助元', en: 'Verb Auxiliaries' },
  }

  // Get suggestions based on attribute — returns { value, label (description only), group? }
  const getSuggestions = (attribute: TokenAttribute): SuggestionOption[] => {
    switch (attribute) {
      case 'pos':
      case 'headpos':
        return UNIVERSAL_POS_TAGS.map(tag => ({
          value: tag.value,
          label: isZh ? tag.label.zh : tag.label.en,
        }))
      case 'tag':
        return PENN_POS_TAGS.map(tag => ({
          value: tag.value,
          label: isZh ? tag.label.zh : tag.label.en,
        }))
      case 'dep':
      case 'headdep':
        return DEPENDENCY_RELATIONS.map(rel => ({
          value: rel.value,
          label: isZh ? rel.label.zh : rel.label.en,
          group: (DEP_GROUPS[rel.value]?.[isZh ? 'zh' : 'en']) ?? (isZh ? '其他' : 'Special'),
        }))
      case 'usas':
        return usasOptions
      case 'nrc':
        return [
          ...NRC_POLARITY_LABELS.map(l => ({
            value: l.value,
            label: isZh ? l.label.zh : l.label.en,
            group: isZh ? '极性' : 'Polarity',
          })),
          ...NRC_EMOTION_LABELS.map(l => ({
            value: l.value,
            label: isZh ? l.label.zh : l.label.en,
            group: isZh ? '情感' : 'Emotion',
          }))
        ]
      case 'annotation':
        return annotationLabels.map(l => ({ value: l, label: l }))
      default:
        return []
    }
  }

  // Whether this attribute uses grouped suggestions
  const needsGroupBy = (attr: TokenAttribute) => ['dep', 'headdep', 'nrc'].includes(attr)

  // Check if attribute needs autocomplete suggestions
  const needsSuggestions = (attr: TokenAttribute): boolean =>
    ['pos', 'tag', 'dep', 'headpos', 'headdep', 'usas', 'nrc', 'annotation'].includes(attr)

  // MIPVU label options (fixed set)
  const MIPVU_OPTIONS = [
    { value: 'indirect', label: isZh ? '间接隐喻 (indirect)' : 'Indirect (indirect)' },
    { value: 'direct',   label: isZh ? '直接隐喻 (direct)'   : 'Direct (direct)'     },
    { value: 'mflag',    label: isZh ? '隐喻信号词 (mflag)'  : 'MFlag (mflag)'       },
    { value: 'none',     label: isZh ? '非隐喻 (none)'       : 'Non-metaphor (none)' },
  ]



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
      const updated: TokenCondition = { ...newConditions[conditionIndex], [field]: value }
      // When switching to mipvu, auto-set operator=== and value=indirect
      if (field === 'attribute' && value === 'mipvu') {
        updated.operator = '=='
        updated.value = 'indirect'
      }
      // When switching to annotation, auto-set operator===
      if (field === 'attribute' && value === 'annotation') {
        updated.operator = '=='
        updated.value = annotationLabels[0] ?? ''
      }
      // When switching away from mipvu/annotation, clear the preset value so it's not stale
      if (field === 'attribute' && (newConditions[conditionIndex].attribute === 'mipvu' || newConditions[conditionIndex].attribute === 'annotation') && value !== 'mipvu' && value !== 'annotation') {
        updated.value = ''
      }
      newConditions[conditionIndex] = updated
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
      <Box sx={{ mb: 2 }}>
        <QuantifierBar
          title={isZh ? '编辑 Token' : 'Edit Token'}
          element={element}
          onUpdate={onUpdate}
          onDone={handleSave}
          isZh={isZh}
        />
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
                {/* Logic operator between conditions — click to toggle AND/OR */}
                {conditionIndex > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, ml: 1 }}>
                    <Chip
                      label={group.logic.toUpperCase()}
                      size="small"
                      color={group.logic === 'and' ? 'primary' : 'secondary'}
                      variant="outlined"
                      onClick={() => toggleGroupLogic(groupIndex)}
                      sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }}
                    />
                  </Box>
                )}

                <Box>
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
                        renderValue={(val) => {
                          const attr = TOKEN_ATTRIBUTES.find(a => a.value === val)
                          return attr ? (isZh ? attr.label.zh : attr.label.en) : String(val)
                        }}
                      >
                        {/* Basic attributes (exclude annotation if no labels available) */}
                        <MenuItem disabled sx={{ opacity: 0.6, fontSize: '0.7rem', letterSpacing: '0.05em', py: 0.5 }}>
                          {isZh ? '基本属性' : 'Basic'}
                        </MenuItem>
                        {TOKEN_ATTRIBUTES
                          .filter(a => (a.category === 'basic' || !a.category) && (a.value !== 'annotation' || annotationLabels.length > 0))
                          .map(attr => (
                            <MenuItem key={attr.value} value={attr.value} sx={{ py: 0.75 }}>
                              <Stack spacing={0}>
                                <Typography fontSize="0.85rem" color="primary.main" fontWeight={600} lineHeight={1.3}>
                                  {isZh ? attr.label.zh : attr.label.en}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" lineHeight={1.2}>
                                  {isZh ? attr.description.zh : attr.description.en}
                                </Typography>
                              </Stack>
                            </MenuItem>
                          ))}
                        {/* Head-based attributes for dependency constraints */}
                        <MenuItem disabled sx={{ opacity: 0.6, fontSize: '0.7rem', letterSpacing: '0.05em', py: 0.5, mt: 0.5 }}>
                          {isZh ? '头词属性' : 'Head Token'}
                        </MenuItem>
                        {TOKEN_ATTRIBUTES.filter(a => a.category === 'head').map(attr => (
                          <MenuItem key={attr.value} value={attr.value} sx={{ py: 0.75 }}>
                            <Stack spacing={0}>
                              <Typography fontSize="0.85rem" color="primary.main" fontWeight={600} lineHeight={1.3}>
                                {isZh ? attr.label.zh : attr.label.en}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" lineHeight={1.2}>
                                {isZh ? attr.description.zh : attr.description.en}
                              </Typography>
                            </Stack>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {/* Operator selector — mipvu only allows == / !== */}
                    <FormControl size="small" sx={{ minWidth: 70 }}>
                      <Select
                        value={condition.operator}
                        onChange={(e) => updateCondition(groupIndex, conditionIndex, 'operator', e.target.value)}
                      >
                        {COMPARISON_OPERATORS
                          .filter(op => (condition.attribute !== 'mipvu' && condition.attribute !== 'annotation') || op.value === '==' || op.value === '!==')
                          .map(op => (
                            <MenuItem key={op.value} value={op.value}>
                              <Tooltip title={isZh ? op.description.zh : op.description.en}>
                                <span>{op.label}</span>
                              </Tooltip>
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>

                    {/* Value input:
                        mipvu        → fixed Select (indirect/direct/mflag/none)
                        annotation   → fixed Select from annotationLabels
                        == / !== + suggestions → Autocomplete dropdown
                        =  / !=              → plain TextField (regex) */}
                    <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>"</Typography>
                      {condition.attribute === 'mipvu' ? (
                        <FormControl size="small" sx={{ flex: 1, minWidth: 160 }}>
                          <Select
                            value={condition.value || 'indirect'}
                            onChange={(e) => updateCondition(groupIndex, conditionIndex, 'value', e.target.value)}
                          >
                            {MIPVU_OPTIONS.map(opt => (
                              <MenuItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : condition.attribute === 'annotation' ? (
                        <FormControl size="small" sx={{ flex: 1, minWidth: 140 }}>
                          <Select
                            value={condition.value || annotationLabels[0] || ''}
                            onChange={(e) => updateCondition(groupIndex, conditionIndex, 'value', e.target.value)}
                            displayEmpty
                          >
                            {annotationLabels.map(lbl => (
                              <MenuItem key={lbl} value={lbl}>{lbl}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : needsSuggestions(condition.attribute) ? (
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={getSuggestions(condition.attribute)}
                          getOptionLabel={(option) => typeof option === 'string' ? option : option.value}
                          groupBy={needsGroupBy(condition.attribute) ? (opt) => (typeof opt === 'string' ? '' : opt.group ?? '') : undefined}
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
                          renderOption={(props, option) => {
                            const opt = typeof option === 'string' ? { value: option, label: option } : option
                            return (
                              <Box component="li" {...props} key={opt.value}>
                                <Stack>
                                  <Typography fontFamily="monospace" fontSize="0.8rem" color="primary.main" fontWeight="bold">
                                    {opt.value}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {opt.label}
                                  </Typography>
                                </Stack>
                              </Box>
                            )
                          }}
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
          ? '= 正则匹配（可用 NOUN|VERB、NN.*、A.*|E.* 等）；== 精确匹配；AND/OR 切换多条件逻辑。'
          : '= regex match (e.g. NOUN|VERB, NN.*, A.*|E.*); == exact match; AND/OR toggles multi-condition logic.'}
      </Typography>
    </Paper>
  )
}


/**
 * Meet Editor Component
 * Editor for (meet P Q -left right) co-occurrence elements.
 * Pattern 1 and Pattern 2 use a token-editor-style condition builder.
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Divider,
  Stack,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Button,
  Chip,
  TextField,
  Tooltip,
  Autocomplete
} from '@mui/material'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import QuantifierBar from './QuantifierBar'
import type { BuilderElement, TokenCondition, ConditionGroup, TokenAttribute, ComparisonOperator } from './types'
import NumberInput from '../../../../components/common/NumberInput'
import {
  TOKEN_ATTRIBUTES,
  COMPARISON_OPERATORS,
  UNIVERSAL_POS_TAGS,
  PENN_POS_TAGS,
  DEPENDENCY_RELATIONS,
  NRC_POLARITY_LABELS,
  NRC_EMOTION_LABELS,
  generateId
} from './constants'
import { usasApi, flattenUsasDomains } from '../../../../api/usas'

interface MeetEditorProps {
  element: BuilderElement
  onUpdate: (element: BuilderElement) => void
  onComplete?: () => void
}

// Convert condition groups to a CQL token string like [lemma="be"] or [pos="NOUN" & dep="nsubj"]
function groupsToCQL(groups: ConditionGroup[]): string {
  if (!groups || groups.length === 0) return '[]'
  const validGroups = groups.filter(g => g.conditions.some(c => c.value.trim() !== ''))
  if (validGroups.length === 0) return '[]'
  const parts = validGroups.map(group => {
    const conds = group.conditions
      .filter(c => c.value.trim() !== '')
      .map(c => `${c.attribute}${c.operator}"${c.value}"`)
    const join = group.logic === 'or' ? ' | ' : ' & '
    return conds.join(join)
  })
  return `[${parts.join(' & ')}]`
}

// Inline condition builder — mirrors TokenEditor style, no save/cancel buttons
interface MiniTokenBuilderProps {
  groups: ConditionGroup[]
  onChange: (groups: ConditionGroup[]) => void
  label: string
  usasOptions: { value: string; label: string }[]
}

function MiniTokenBuilder({ groups, onChange, label, usasOptions }: MiniTokenBuilderProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  type SuggestionOption = { value: string; label: string; group?: string }

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

  const getSuggestions = (attribute: TokenAttribute): SuggestionOption[] => {
    switch (attribute) {
      case 'pos':
      case 'headpos':
        return UNIVERSAL_POS_TAGS.map(t => ({ value: t.value, label: isZh ? t.label.zh : t.label.en }))
      case 'tag':
        return PENN_POS_TAGS.map(t => ({ value: t.value, label: isZh ? t.label.zh : t.label.en }))
      case 'dep':
      case 'headdep':
        return DEPENDENCY_RELATIONS.map(r => ({
          value: r.value,
          label: isZh ? r.label.zh : r.label.en,
          group: (DEP_GROUPS[r.value]?.[isZh ? 'zh' : 'en']) ?? (isZh ? '其他' : 'Special'),
        }))
      case 'usas':
        return usasOptions
      case 'nrc':
        return [
          ...NRC_POLARITY_LABELS.map(l => ({ value: l.value, label: isZh ? l.label.zh : l.label.en, group: isZh ? '极性' : 'Polarity' })),
          ...NRC_EMOTION_LABELS.map(l => ({ value: l.value, label: isZh ? l.label.zh : l.label.en, group: isZh ? '情感' : 'Emotion' }))
        ]
      default:
        return []
    }
  }

  const needsSuggestions = (attr: TokenAttribute) =>
    ['pos', 'tag', 'dep', 'headpos', 'headdep', 'usas', 'nrc'].includes(attr)

  const needsGroupBy = (attr: TokenAttribute) => ['dep', 'headdep', 'nrc'].includes(attr)

  const updateCondition = (gi: number, ci: number, field: keyof TokenCondition, value: string) => {
    onChange(groups.map((g, gIdx) => gIdx !== gi ? g : {
      ...g,
      conditions: g.conditions.map((c, cIdx) => cIdx !== ci ? c : { ...c, [field]: value })
    }))
  }

  const addCondition = (gi: number) => {
    onChange(groups.map((g, gIdx) => gIdx !== gi ? g : {
      ...g,
      conditions: [...g.conditions, {
        id: generateId(),
        attribute: 'lemma' as TokenAttribute,
        operator: '=' as ComparisonOperator,
        value: ''
      }]
    }))
  }

  const removeCondition = (gi: number, ci: number) => {
    const updated = groups.map((g, gIdx) => {
      if (gIdx !== gi) return g
      const newConds = g.conditions.filter((_, i) => i !== ci)
      return newConds.length > 0 ? { ...g, conditions: newConds } : null
    }).filter(Boolean) as ConditionGroup[]
    onChange(updated.length > 0 ? updated : [{
      conditions: [{ id: generateId(), attribute: 'lemma' as TokenAttribute, operator: '=' as ComparisonOperator, value: '' }],
      logic: 'and'
    }])
  }

  const toggleLogic = (gi: number) => {
    onChange(groups.map((g, gIdx) => gIdx !== gi ? g : { ...g, logic: g.logic === 'and' ? 'or' : 'and' }))
  }

  const preview = groupsToCQL(groups)

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, bgcolor: 'primary.50', borderColor: 'primary.200', borderRadius: 1.5 }}
    >
      {/* Mini header: label + live preview */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="caption" color="primary.main" fontWeight="bold" sx={{ flexShrink: 0 }}>
          {label}
        </Typography>
        <Typography
          fontFamily="monospace"
          fontSize="0.78rem"
          color="primary.dark"
          sx={{ fontWeight: 'bold', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {preview}
        </Typography>
      </Stack>

      {/* Condition rows */}
      {groups.map((group, gi) => (
        <Box key={gi} sx={{ mb: 1 }}>
          {gi > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', py: 0.75 }}>
              <Chip
                label={group.logic.toUpperCase()}
                size="small"
                color={group.logic === 'and' ? 'primary' : 'secondary'}
                onClick={() => toggleLogic(gi)}
                sx={{ cursor: 'pointer' }}
              />
            </Box>
          )}
          <Stack spacing={1.5}>
            {group.conditions.map((condition, ci) => (
              <Box key={condition.id}>
                {ci > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 0, mb: 1.5, ml: 1 }}>
                    <Chip
                      label={group.logic.toUpperCase()}
                      size="small"
                      color={group.logic === 'and' ? 'primary' : 'secondary'}
                      variant="outlined"
                      onClick={() => toggleLogic(gi)}
                      sx={{ fontSize: '0.65rem', height: 18, cursor: 'pointer' }}
                    />
                  </Box>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {/* Delete button (shown when there are multiple conditions) */}
                  {(group.conditions.length > 1 || groups.length > 1) && (
                    <IconButton size="small" onClick={() => removeCondition(gi, ci)} sx={{ color: 'error.main', p: 0.25 }}>
                      <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  )}

                  {/* Attribute selector */}
                  <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel sx={{ fontSize: '0.75rem' }}>{isZh ? '属性' : 'Attr'}</InputLabel>
                    <Select
                      value={condition.attribute}
                      label={isZh ? '属性' : 'Attr'}
                      onChange={(e) => updateCondition(gi, ci, 'attribute', e.target.value)}
                      sx={{ fontSize: '0.8rem' }}
                    >
                      <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
                        {isZh ? '--- 基本 ---' : '--- Basic ---'}
                      </MenuItem>
                      {TOKEN_ATTRIBUTES.filter(a => a.category === 'basic' || !a.category).map(attr => (
                        <MenuItem key={attr.value} value={attr.value} sx={{ fontSize: '0.8rem' }}>
                          <Tooltip title={isZh ? attr.description.zh : attr.description.en} placement="right">
                            <span>{isZh ? attr.label.zh : attr.label.en}</span>
                          </Tooltip>
                        </MenuItem>
                      ))}
                      <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.7rem', mt: 0.5 }}>
                        {isZh ? '--- 头词 ---' : '--- Head ---'}
                      </MenuItem>
                      {TOKEN_ATTRIBUTES.filter(a => a.category === 'head').map(attr => (
                        <MenuItem key={attr.value} value={attr.value} sx={{ fontSize: '0.8rem' }}>
                          <Tooltip title={isZh ? attr.description.zh : attr.description.en} placement="right">
                            <span>{isZh ? attr.label.zh : attr.label.en}</span>
                          </Tooltip>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Operator selector */}
                  <FormControl size="small" sx={{ minWidth: 65 }}>
                    <Select
                      value={condition.operator}
                      onChange={(e) => updateCondition(gi, ci, 'operator', e.target.value)}
                      sx={{ fontSize: '0.8rem' }}
                    >
                      {COMPARISON_OPERATORS.map(op => (
                        <MenuItem key={op.value} value={op.value} sx={{ fontSize: '0.8rem' }}>
                          <Tooltip title={isZh ? op.description.zh : op.description.en}>
                            <span>{op.label}</span>
                          </Tooltip>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Value input with autocomplete suggestions */}
                  <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <Typography sx={{ mr: 0.25, color: 'text.secondary', fontSize: '0.8rem' }}>"</Typography>
                    {needsSuggestions(condition.attribute) ? (
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={getSuggestions(condition.attribute)}
                        getOptionLabel={(o) => typeof o === 'string' ? o : o.value}
                        groupBy={needsGroupBy(condition.attribute) ? (o) => (typeof o === 'string' ? '' : o.group ?? '') : undefined}
                        value={condition.value}
                        onChange={(_, v) => updateCondition(gi, ci, 'value', typeof v === 'string' ? v : v?.value || '')}
                        onInputChange={(_, v) => updateCondition(gi, ci, 'value', v)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            placeholder={isZh ? '值...' : 'value...'}
                            sx={{ minWidth: 90, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                          />
                        )}
                        renderOption={(props, o) => {
                          const opt = typeof o === 'string' ? { value: o, label: o } : o
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
                        onChange={(e) => updateCondition(gi, ci, 'value', e.target.value)}
                        placeholder={isZh ? '值...' : 'value...'}
                        sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                      />
                    )}
                    <Typography sx={{ ml: 0.25, color: 'text.secondary', fontSize: '0.8rem' }}>"</Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>

          <Button
            size="small"
            startIcon={<AddCircleOutlineIcon sx={{ fontSize: 13 }} />}
            onClick={() => addCondition(gi)}
            sx={{ mt: 0.5, textTransform: 'none', fontSize: '0.72rem' }}
          >
            {isZh ? '添加条件' : 'Add Condition'}
          </Button>
        </Box>
      ))}
    </Paper>
  )
}

// ─── Main MeetEditor ──────────────────────────────────────────────────────────

export default function MeetEditor({ element, onUpdate, onComplete }: MeetEditorProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  const [usasOptions, setUsasOptions] = useState<{ value: string; label: string }[]>([])
  useEffect(() => {
    let cancelled = false
    usasApi.getDomains().then((data) => {
      if (!cancelled) setUsasOptions(flattenUsasDomains(data))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Default condition group for each pattern
  const defaultGroup = (): ConditionGroup[] => [{
    conditions: [{ id: generateId(), attribute: 'lemma' as TokenAttribute, operator: '=' as ComparisonOperator, value: '' }],
    logic: 'and'
  }]

  const [p1Groups, setP1Groups] = useState<ConditionGroup[]>(defaultGroup)
  const [p2Groups, setP2Groups] = useState<ConditionGroup[]>(defaultGroup)
  const [left, setLeft] = useState(element.meetLeft ?? -3)
  const [right, setRight] = useState(element.meetRight ?? 3)

  // Helper: split by single-char operator outside quotes
  const splitByOperator = (content: string, op: string): string[] => {
    const parts: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of content) {
      if (ch === '"') {
        inQuotes = !inQuotes
        current += ch
      } else if (ch === op && !inQuotes) {
        parts.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    if (current) parts.push(current)
    return parts
  }

  // Parse a single condition a="b" / lemma=="go" into TokenCondition
  const parseSingleCondition = (text: string): TokenCondition | null => {
    const clean = text.trim()
    if (!clean) return null
    const m = clean.match(/^(\w+)\s*(===?|!==?|=)\s*"([^"]*)"$/)
    if (!m) return null
    const [, attribute, operator, value] = m
    return {
      id: generateId(),
      attribute: attribute as TokenAttribute,
      operator: operator as ComparisonOperator,
      value
    }
  }

  // Convert a CQL token like [pos="NOUN" & lemma="be"] to ConditionGroup[]
  const cqlToGroups = (cql: string | undefined): ConditionGroup[] => {
    if (!cql) return defaultGroup()
    const trimmed = cql.trim()
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return defaultGroup()
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return defaultGroup()

    // Determine group logic and split conditions
    let logic: 'and' | 'or' = 'and'
    let rawConds: string[] = []
    if (inner.includes('|')) {
      logic = 'or'
      rawConds = splitByOperator(inner, '|')
    } else {
      logic = 'and'
      rawConds = splitByOperator(inner, '&')
    }
    const conditions: TokenCondition[] = []
    for (const part of rawConds) {
      const cond = parseSingleCondition(part)
      if (cond) conditions.push(cond)
    }
    if (conditions.length === 0) return defaultGroup()
    return [{ conditions, logic }]
  }

  // Initialize groups from existing meetPattern1/2 when opening editor
  useEffect(() => {
    if (element.meetPattern1) {
      setP1Groups(cqlToGroups(element.meetPattern1))
    }
    if (element.meetPattern2) {
      setP2Groups(cqlToGroups(element.meetPattern2))
    }
    // left/right already initialised from element.meetLeft/Right above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const p1 = groupsToCQL(p1Groups)
    const p2 = groupsToCQL(p2Groups)
    onUpdate({ ...element, meetPattern1: p1, meetPattern2: p2, meetLeft: left, meetRight: right })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p1Groups, p2Groups, left, right])

  const p1Preview = groupsToCQL(p1Groups)
  const p2Preview = groupsToCQL(p2Groups)
  const meetPreview = `(meet ${p1Preview} ${p2Preview} ${left} ${right})`

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 420 }}>
      {/* Header with quantifier bar */}
      <QuantifierBar
        title={isZh ? '编辑左右共现' : 'Edit Meet'}
        element={element}
        onUpdate={onUpdate}
        onDone={onComplete}
        isZh={isZh}
      />

      {/* Pattern 1 */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: 'medium' }}>
          {isZh ? '模式 1 (P)' : 'Pattern 1 (P)'}
        </Typography>
        <MiniTokenBuilder
          groups={p1Groups}
          onChange={setP1Groups}
          label="P"
          usasOptions={usasOptions}
        />
      </Box>

      {/* Pattern 2 */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: 'medium' }}>
          {isZh ? '模式 2 (Q)' : 'Pattern 2 (Q)'}
        </Typography>
        <MiniTokenBuilder
          groups={p2Groups}
          onChange={setP2Groups}
          label="Q"
          usasOptions={usasOptions}
        />
      </Box>

      {/* Distance inputs */}
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {isZh ? '左距离 (−N)' : 'Left Distance (−N)'}
          </Typography>
          <NumberInput
            size="small"
            value={Math.abs(left)}
            onChange={(val) => setLeft(-Math.abs(val))}
            min={0}
            max={99}
            integer
            sx={{ width: '100%' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {isZh ? 'P 在 Q 左侧最多 N 词' : 'P up to N tokens left of Q'}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {isZh ? '右距离 (+M)' : 'Right Distance (+M)'}
          </Typography>
          <NumberInput
            size="small"
            value={right}
            onChange={(val) => setRight(Math.abs(val))}
            min={0}
            max={99}
            integer
            sx={{ width: '100%' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {isZh ? 'P 在 Q 右侧最多 M 词' : 'P up to M tokens right of Q'}
          </Typography>
        </Box>
      </Stack>

      {/* CQL preview */}
      <Divider />
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Typography variant="caption" color="text.secondary">
          {isZh ? '生成 CQL：' : 'Generated CQL:'}
        </Typography>
        <Typography
          fontFamily="monospace"
          fontSize="0.85rem"
          color="primary.main"
          sx={{ fontWeight: 'bold', wordBreak: 'break-all' }}
        >
          {meetPreview}
        </Typography>
      </Stack>
    </Box>
  )
}

/**
 * Word Sketch Editor Component
 * Editor for [ws(headword,relation,collocation)] elements
 */

import { useState, useEffect } from 'react'
import {
  Box,
  TextField,
  Typography,
  Divider,
  Stack,
  Autocomplete,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { BuilderElement } from './types'
import { WS_RELATION_OPTIONS } from './constants'
import QuantifierBar from './QuantifierBar'

interface WordSketchEditorProps {
  element: BuilderElement
  onUpdate: (element: BuilderElement) => void
  onComplete?: () => void
}

export default function WordSketchEditor({ element, onUpdate, onComplete }: WordSketchEditorProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  const [headword, setHeadword] = useState(element.wsHeadword ?? '')
  const [relation, setRelation] = useState(element.wsRelation ?? '')
  const [collocation, setCollocation] = useState(element.wsCollocation ?? '')

  useEffect(() => {
    onUpdate({ ...element, wsHeadword: headword, wsRelation: relation, wsCollocation: collocation })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headword, relation, collocation])

  const preview = `[ws(${headword},${relation},${collocation})]`

  // Options for Autocomplete, with group labels
  const groupOrder: Record<string, string> = {
    VERB: isZh ? '动词关系' : 'Verb Relations',
    NOUN: isZh ? '名词关系' : 'Noun Relations',
    ADJ:  isZh ? '形容词关系' : 'Adjective Relations',
    ADV:  isZh ? '副词关系' : 'Adverb Relations',
  }

  const options = WS_RELATION_OPTIONS.map(r => ({
    value: r.value,
    label: isZh ? r.label.zh : r.label.en,
    group: groupOrder[r.group] ?? r.group,
  }))

  const selectedOption = options.find(o => o.value === relation) ?? null

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 360 }}>
      {/* Header with quantifier bar */}
      <QuantifierBar
        title={isZh ? '编辑词图模板' : 'Edit Word Sketch'}
        element={element}
        onUpdate={onUpdate}
        onDone={onComplete}
        isZh={isZh}
      />

      {/* Headword */}
      <TextField
        size="small"
        fullWidth
        label={isZh ? '搜索词 (headword)' : 'Headword'}
        placeholder={isZh ? '如 make' : 'e.g. make'}
        value={headword}
        onChange={(e) => setHeadword(e.target.value.trim())}
        helperText={isZh ? '词图分析的中心词（词元）' : 'Central word for Word Sketch (lemma)'}
      />

      {/* Relation */}
      <Autocomplete
        size="small"
        options={options}
        groupBy={(opt) => opt.group}
        getOptionLabel={(opt) => `${opt.value} — ${opt.label}`}
        value={selectedOption}
        onChange={(_, newVal) => setRelation(newVal?.value ?? '')}
        renderInput={(params) => (
          <TextField
            {...params}
            label={isZh ? '词图关系 (relation)' : 'Word Sketch Relation'}
            placeholder={isZh ? '选择语法关系模板' : 'Select grammar relation'}
          />
        )}
        renderOption={(props, opt) => (
          <Box component="li" {...props} key={opt.value}>
            <Stack>
              <Typography fontFamily="monospace" fontSize="0.8rem" color="primary.main">
                {opt.value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {opt.label}
              </Typography>
            </Stack>
          </Box>
        )}
      />

      {/* Collocation (optional) */}
      <TextField
        size="small"
        fullWidth
        label={isZh ? '搭配词 (collocation，可选)' : 'Collocation (optional)'}
        placeholder={isZh ? '如 decision（留空匹配所有搭配词）' : 'e.g. decision (empty = any collocate)'}
        value={collocation}
        onChange={(e) => setCollocation(e.target.value.trim())}
        helperText={isZh ? '具体的搭配词词元，留空则匹配所有' : 'Specific collocate lemma; empty matches any'}
      />

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
          {preview}
        </Typography>
      </Stack>
    </Box>
  )
}

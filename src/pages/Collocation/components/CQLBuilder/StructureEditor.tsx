/**
 * Structure Editor Component
 * Editor for structural context elements: <s>, <p> and their variants.
 * Document-level structure is intentionally excluded to avoid conflicts
 * with corpus-level selection.
 */

import { useState, useEffect } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Divider,
  Stack,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { BuilderElement, StructureVariant } from './types'
import QuantifierBar from './QuantifierBar'
import { STRUCTURE_VARIANTS } from './constants'

interface StructureEditorProps {
  element: BuilderElement
  onUpdate: (element: BuilderElement) => void
  onComplete?: () => void
}

// ─── buildStructureCQL (also exported for ElementCard) ───────────────────────

export function buildStructureCQL(variant: StructureVariant): string {
  switch (variant) {
    case 's_open':  return '<s>'
    case 's_close': return '</s>'
    case 's_self':  return '<s/>'
    case 'p_open':  return '<p>'
    case 'p_close': return '</p>'
    case 'p_self':  return '<p/>'
    default:        return '<s/>'
  }
}

// ─── Main StructureEditor ─────────────────────────────────────────────────────

export default function StructureEditor({ element, onUpdate, onComplete }: StructureEditorProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  const [variant, setVariant] = useState<StructureVariant>(element.structureVariant ?? 's_self')

  // Sync to parent on variant change
  useEffect(() => {
    onUpdate({ ...element, structureVariant: variant, structureMeta: undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant])

  const preview = buildStructureCQL(variant)

  const groups: { key: 'sentence' | 'paragraph'; label: string }[] = [
    { key: 'sentence',  label: isZh ? '句子' : 'Sentence' },
    { key: 'paragraph', label: isZh ? '段落' : 'Paragraph' },
  ]

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 300 }}>
      {/* Header with quantifier bar */}
      <QuantifierBar
        title={isZh ? '编辑结构标记' : 'Edit Structure'}
        element={element}
        onUpdate={onUpdate}
        onDone={onComplete}
        isZh={isZh}
      />

      {/* Variant selector */}
      <FormControl size="small" fullWidth>
        <InputLabel>{isZh ? '结构类型' : 'Structure Type'}</InputLabel>
        <Select
          value={variant}
          label={isZh ? '结构类型' : 'Structure Type'}
          onChange={(e) => setVariant(e.target.value as StructureVariant)}
        >
          {groups.map(({ key, label }) => [
            <MenuItem key={`__g_${key}`} disabled sx={{ opacity: 1, py: 0.5 }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </MenuItem>,
            ...STRUCTURE_VARIANTS.filter(v => v.group === key).map(v => (
              <MenuItem key={v.value} value={v.value} sx={{ pl: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography fontFamily="monospace" fontSize="0.85rem" color="primary.main">
                    {v.cql}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {isZh ? v.label.zh : v.label.en}
                  </Typography>
                </Stack>
              </MenuItem>
            ))
          ])}
        </Select>
      </FormControl>

      {/* CQL preview */}
      <Divider />
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {isZh ? '生成 CQL：' : 'Generated CQL:'}
        </Typography>
        <Typography
          fontFamily="monospace"
          fontSize="0.9rem"
          color="primary.main"
          sx={{ fontWeight: 'bold' }}
        >
          {preview}
        </Typography>
      </Stack>
    </Box>
  )
}

/**
 * KeyboardShortcutsDialog
 * Configure Ctrl/Cmd + 1-0 keyboard shortcut slots for annotation labels.
 * Each framework has independent settings stored in localStorage.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  Stack,
  Chip,
  Divider,
  IconButton,
  Tooltip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ClearIcon from '@mui/icons-material/Clear'
import { useTranslation } from 'react-i18next'
import type { Framework, FrameworkNode } from '../../types'
import {
  SHORTCUT_KEYS,
  ShortcutKey,
  FrameworkShortcuts,
  getFrameworkShortcuts,
  setFrameworkShortcuts,
  getShortcutDisplay,
  isMacOS
} from '../../utils/annotationShortcuts'

interface FlatLabel {
  label: string
  path: string
  color: string
}

/** Flatten all label nodes from the framework tree */
function flattenLabels(node: FrameworkNode, path: string[] = []): FlatLabel[] {
  const results: FlatLabel[] = []
  const currentPath = [...path, node.name]

  if (node.type === 'label') {
    results.push({
      label: node.name,
      path: currentPath.join(' / '),
      color: node.color || '#607D8B'
    })
  }

  for (const child of node.children || []) {
    results.push(...flattenLabels(child, currentPath))
  }
  return results
}

interface KeyboardShortcutsDialogProps {
  open: boolean
  onClose: () => void
  framework: Framework | null
  /** Called when shortcuts are saved so parent can apply them */
  onSaved?: (frameworkId: string, shortcuts: FrameworkShortcuts) => void
}

export default function KeyboardShortcutsDialog({
  open,
  onClose,
  framework,
  onSaved
}: KeyboardShortcutsDialogProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const mac = isMacOS()

  const [slots, setSlots] = useState<FrameworkShortcuts>({})
  const [allLabels, setAllLabels] = useState<FlatLabel[]>([])

  // Load current shortcuts when dialog opens
  useEffect(() => {
    if (open && framework) {
      setSlots(getFrameworkShortcuts(framework.id))
      setAllLabels(flattenLabels(framework.root))
    }
  }, [open, framework])

  const handleSlotChange = useCallback((key: ShortcutKey, value: string) => {
    if (value === '__clear__') {
      setSlots(prev => ({ ...prev, [key]: null }))
      return
    }
    const found = allLabels.find(l => l.path === value)
    if (found) {
      setSlots(prev => ({
        ...prev,
        [key]: { label: found.label, path: found.path, color: found.color }
      }))
    }
  }, [allLabels])

  const handleSave = () => {
    if (!framework) return
    setFrameworkShortcuts(framework.id, slots)
    onSaved?.(framework.id, slots)
    onClose()
  }

  if (!framework) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">
          {isZh ? '键盘快捷键设置' : 'Keyboard Shortcut Settings'}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {isZh
            ? `为框架「${framework.name}」的快捷键分配标签。按下快捷键后，该标签会被自动选中用于标注。`
            : `Assign labels to shortcut keys for framework "${framework.name}". Pressing a shortcut will select that label for annotation.`}
        </Typography>

        <Stack spacing={1.5}>
          {SHORTCUT_KEYS.map((key) => {
            const slot = slots[key]
            const display = getShortcutDisplay(key, mac)
            return (
              <Box
                key={key}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5
                }}
              >
                {/* Shortcut key badge */}
                <Chip
                  label={display}
                  size="small"
                  variant="outlined"
                  sx={{
                    minWidth: 64,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '0.78rem'
                  }}
                />

                {/* Label selector */}
                <FormControl size="small" sx={{ flex: 1 }}>
                  <Select
                    value={slot?.path ?? ''}
                    displayEmpty
                    onChange={(e) => handleSlotChange(key, e.target.value)}
                    renderValue={(val) => {
                      if (!val) {
                        return (
                          <Typography variant="body2" color="text.disabled">
                            {isZh ? '未设置' : 'Not assigned'}
                          </Typography>
                        )
                      }
                      const found = allLabels.find(l => l.path === val)
                      return (
                        <Stack direction="row" alignItems="center" gap={0.5}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              bgcolor: found?.color || '#607D8B',
                              flexShrink: 0
                            }}
                          />
                          <Typography variant="body2" noWrap>{found?.label ?? val}</Typography>
                        </Stack>
                      )
                    }}
                  >
                    <MenuItem value="">
                      <Typography variant="body2" color="text.disabled">
                        {isZh ? '— 不设置 —' : '— None —'}
                      </Typography>
                    </MenuItem>
                    <Divider />
                    {allLabels.map((l) => (
                      <MenuItem key={l.path} value={l.path}>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              bgcolor: l.color,
                              flexShrink: 0
                            }}
                          />
                          <Stack>
                            <Typography variant="body2" fontWeight={600}>
                              {l.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {l.path}
                            </Typography>
                          </Stack>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Clear button */}
                {slot && (
                  <Tooltip title={isZh ? '清除' : 'Clear'}>
                    <IconButton
                      size="small"
                      onClick={() => handleSlotChange(key, '__clear__')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )
          })}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{isZh ? '取消' : 'Cancel'}</Button>
        <Button variant="contained" onClick={handleSave}>
          {isZh ? '保存' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

import { useState, useEffect } from 'react'
import {
  Popover,
  Box,
  Typography,
  Switch,
  Button,
  Divider,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import type { ToolModuleInfo } from '../../api/agentChat'
import { getToolModules } from '../../api/agentChat'

interface ModuleSelectorProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  enabledModules: string[] | null
  onModulesChange: (modules: string[] | null) => void
}

export default function ModuleSelector({
  anchorEl,
  open,
  onClose,
  enabledModules,
  onModulesChange,
}: ModuleSelectorProps) {
  const { t, i18n } = useTranslation()
  const [modules, setModules] = useState<ToolModuleInfo[]>([])
  const language = useSettingsStore((s) => s.language)

  useEffect(() => {
    if (open && modules.length === 0) {
      getToolModules()
        .then((res) => {
          const data = (res as any)?.data
          if (Array.isArray(data)) {
            setModules(data)
          } else if (data?.data && Array.isArray(data.data)) {
            setModules(data.data)
          }
        })
        .catch(() => {})
    }
  }, [open])

  const allSelected = enabledModules === null

  const handleToggleAll = () => {
    onModulesChange(allSelected ? [] : null)
  }

  const handleToggleModule = (name: string) => {
    if (allSelected) {
      const allNames = modules.map((m) => m.name)
      onModulesChange(allNames.filter((n) => n !== name))
    } else {
      const current = enabledModules || []
      if (current.includes(name)) {
        onModulesChange(current.filter((n) => n !== name))
      } else {
        const updated = [...current, name]
        if (updated.length === modules.length) {
          onModulesChange(null)
        } else {
          onModulesChange(updated)
        }
      }
    }
  }

  const isChecked = (name: string) =>
    allSelected || (enabledModules || []).includes(name)

  const isZh = language === 'zh' || i18n.language === 'zh'

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            width: 300,
            maxHeight: 420,
            borderRadius: 2.5,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            mt: 1,
          },
        },
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {t('agentChat.moduleSelector')}
        </Typography>
      </Box>

      <Box sx={{ px: 2, pb: 1 }}>
        <Button
          size="small"
          variant={allSelected ? 'contained' : 'outlined'}
          onClick={handleToggleAll}
          fullWidth
          sx={{
            textTransform: 'none',
            borderRadius: 1.5,
            py: 0.75,
          }}
        >
          {t('agentChat.allModules')}
        </Button>
      </Box>

      <Divider />

      <Box sx={{ maxHeight: 300, overflow: 'auto', py: 0.5 }}>
        {modules.map((mod) => (
          <Box
            key={mod.name}
            onClick={() => handleToggleModule(mod.name)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 0.5,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
              borderRadius: 1,
              mx: 0.5,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {isZh ? mod.display_zh : mod.display_en}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {mod.tools.length} {isZh ? '个工具' : 'tools'}
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={isChecked(mod.name)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => handleToggleModule(mod.name)}
            />
          </Box>
        ))}
      </Box>
    </Popover>
  )
}

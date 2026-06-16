import {
  Paper,
  Typography,
  Stack,
  Box,
  IconButton,
  Button,
  Radio,
  Tooltip,
  Divider,
  Alert,
  Chip,
} from '@mui/material'
import ApiIcon from '@mui/icons-material/Api'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import type { ApiLine } from '../../types'
import ApiLineDialog from './ApiLineDialog'

export default function ApiLineManager() {
  const { t } = useTranslation()
  const { apiLines, activeApiLineId, addApiLine, updateApiLine, removeApiLine, setActiveApiLine } = useSettingsStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<ApiLine | null>(null)

  const handleAdd = () => {
    setEditingLine(null)
    setDialogOpen(true)
  }

  const handleEdit = (line: ApiLine) => {
    setEditingLine(line)
    setDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    removeApiLine(id)
  }

  const handleSave = (data: Omit<ApiLine, 'id'>) => {
    if (editingLine) {
      updateApiLine(editingLine.id, data)
    } else {
      addApiLine(data)
    }
    setDialogOpen(false)
  }

  const handleSelectActive = (id: string) => {
    setActiveApiLine(activeApiLineId === id ? null : id)
  }

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <ApiIcon color="primary" />
          <Typography variant="h6">{t('settings.apiLines.title')}</Typography>
          {activeApiLineId && (
            <Chip
              icon={<CheckCircleIcon />}
              label={t('settings.apiLines.enabled')}
              color="success"
              size="small"
              variant="outlined"
            />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('settings.apiLines.subtitle')}
        </Typography>

        {apiLines.length === 0 ? (
          <Box
            sx={{
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              p: 3,
              textAlign: 'center',
              color: 'text.secondary',
              mb: 2,
            }}
          >
            <ApiIcon sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
            <Typography variant="body2">{t('settings.apiLines.noLines')}</Typography>
          </Box>
        ) : (
          <Stack spacing={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            {apiLines.map((line, idx) => {
              const isActive = line.id === activeApiLineId
              return (
                <Box key={line.id}>
                  {idx > 0 && <Divider />}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{
                      px: 2,
                      py: 1.5,
                      bgcolor: isActive ? 'action.selected' : 'transparent',
                      transition: 'background-color 0.15s',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Tooltip title={isActive ? t('settings.apiLines.clickToDeactivate') : t('settings.apiLines.setActive')}>
                      <Radio
                        checked={isActive}
                        onChange={() => handleSelectActive(line.id)}
                        size="small"
                        color="primary"
                      />
                    </Tooltip>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" fontWeight={isActive ? 600 : 400} noWrap>
                          {line.name || t('settings.apiLines.unnamed')}
                        </Typography>
                        {isActive && (
                          <Chip label={t('settings.apiLines.active')} color="primary" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                        )}
                      </Stack>
                      <Stack direction="row" spacing={2}>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                          {line.baseUrl}
                        </Typography>
                        {line.model && (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {line.model}
                          </Typography>
                        )}
                      </Stack>
                    </Box>

                    <Stack direction="row" spacing={0.5} flexShrink={0}>
                      <Tooltip title={t('settings.apiLines.editLine')}>
                        <IconButton size="small" onClick={() => handleEdit(line)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('settings.apiLines.deleteLine')}>
                        <IconButton size="small" color="error" onClick={() => handleDelete(line.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </Box>
              )
            })}
          </Stack>
        )}

        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAdd}
        >
          {t('settings.apiLines.addLine')}
        </Button>

        <Alert severity="info" sx={{ mt: 2 }}>
          {t('settings.apiLines.helpText')}
        </Alert>
      </Paper>

      <ApiLineDialog
        open={dialogOpen}
        line={editingLine}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
      />
    </>
  )
}

import { useState } from 'react'
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import { useTranslation } from 'react-i18next'
import type { Conversation } from '../../stores/chatStore'
import { downloadConversation, type ExportFormat } from '../../utils/conversationExport'

interface ChatSidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onClearAll: () => void
}

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClearAll,
}: ChatSidebarProps) {
  const { t } = useTranslation()

  // Export dialog state
  const [exportTarget, setExportTarget] = useState<Conversation | null>(null)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('markdown')

  const handleExportConfirm = () => {
    if (!exportTarget) return
    downloadConversation(exportTarget, exportFormat)
    setExportTarget(null)
  }

  return (
    <Box
      sx={{
        width: 260,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          {t('agentChat.sidebar')}
        </Typography>
        <Box>
          <Tooltip title={t('agentChat.newConversation')}>
            <IconButton size="small" onClick={onNew}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {conversations.length > 0 && (
            <Tooltip title={t('agentChat.clearAll')}>
              <IconButton size="small" onClick={onClearAll}>
                <DeleteSweepIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Divider />

      {/* Conversation list */}
      <List sx={{ flex: 1, overflow: 'auto', py: 0.5 }} dense>
        {conversations.length === 0 && (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <ChatBubbleOutlineIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
            <Typography variant="caption" color="text.secondary" display="block">
              {t('agentChat.emptyState')}
            </Typography>
          </Box>
        )}
        {conversations.map((conv) => (
          <ListItemButton
            key={conv.id}
            selected={conv.id === activeId}
            onClick={() => onSelect(conv.id)}
            sx={{
              mx: 0.5,
              borderRadius: 1,
              mb: 0.25,
              '&.Mui-selected': {
                bgcolor: 'action.selected',
              },
            }}
          >
            <ListItemText
              primary={conv.title || t('agentChat.untitledConversation')}
              primaryTypographyProps={{
                variant: 'body2',
                noWrap: true,
                sx: { fontSize: '0.8rem' },
              }}
              secondary={new Date(conv.updatedAt).toLocaleDateString()}
              secondaryTypographyProps={{
                variant: 'caption',
                sx: { fontSize: '0.7rem' },
              }}
            />
            {/* Action buttons — visible on hover */}
            <Box sx={{ display: 'flex', flexShrink: 0 }}>
              <Tooltip title={t('agentChat.exportConversation')}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    setExportFormat('markdown')
                    setExportTarget(conv)
                  }}
                  sx={{
                    opacity: 0,
                    '.MuiListItemButton-root:hover &': { opacity: 0.6 },
                    '&:hover': { opacity: 1 },
                  }}
                >
                  <FileDownloadIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('agentChat.deleteConversation')}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(conv.id)
                  }}
                  sx={{
                    opacity: 0,
                    '.MuiListItemButton-root:hover &': { opacity: 0.7 },
                    '&:hover': { opacity: 1 },
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </ListItemButton>
        ))}
      </List>

      {/* Export format dialog */}
      <Dialog
        open={Boolean(exportTarget)}
        onClose={() => setExportTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('agentChat.exportConversation')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {exportTarget?.title || t('agentChat.untitledConversation')}
          </Typography>
          <FormControl>
            <FormLabel sx={{ mb: 1, fontSize: '0.85rem' }}>
              {t('agentChat.exportFormat')}
            </FormLabel>
            <RadioGroup
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            >
              <FormControlLabel
                value="markdown"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">Markdown (.md)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('agentChat.exportFormatMdDesc')}
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="json"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">JSON (.json)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('agentChat.exportFormatJsonDesc')}
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="txt"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">{t('agentChat.exportFormatTxtLabel')} (.txt)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('agentChat.exportFormatTxtDesc')}
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportTarget(null)} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleExportConfirm}
            variant="contained"
            startIcon={<FileDownloadIcon />}
          >
            {t('agentChat.exportDownload')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

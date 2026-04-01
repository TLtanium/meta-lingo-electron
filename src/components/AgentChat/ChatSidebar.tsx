import {
  Box,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
  Divider,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import { useTranslation } from 'react-i18next'
import type { Conversation } from '../../stores/chatStore'

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
              <IconButton
                size="small"
                onClick={() => {
                  if (window.confirm(t('agentChat.confirmClearAll'))) {
                    onClearAll()
                  }
                }}
              >
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
            <Tooltip title={t('agentChat.deleteConversation')}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(t('agentChat.confirmDelete'))) {
                    onDelete(conv.id)
                  }
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
          </ListItemButton>
        ))}
      </List>
    </Box>
  )
}

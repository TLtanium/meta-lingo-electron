import { useState, useRef } from 'react'
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Paper,
  Tooltip,
  Divider,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PersonIcon from '@mui/icons-material/Person'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import defaultUserAvatar from '../../../assets/user.png'
import lemyAvatar from '../../../assets/Lemy.jpg'

/** Rounded-square avatar (8px radius, not circle) */
function RoundedAvatar({
  src,
  size = 44,
  fallbackIcon,
}: {
  src: string
  size?: number
  fallbackIcon?: React.ReactNode
}) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '8px',
        overflow: 'hidden',
        flexShrink: 0,
        bgcolor: 'action.selected',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          alt=""
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        fallbackIcon
      )}
    </Box>
  )
}

export default function UserProfileSettings() {
  const { t } = useTranslation()
  const { userName, userAvatar, setUserName, setUserAvatar } = useSettingsStore()

  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null)
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleOpen = () => {
    setDraftName(userName)
    setDraftAvatar(userAvatar)
    setPreviewAvatar(userAvatar)
    setOpen(true)
  }

  const handleClose = () => setOpen(false)

  const handleSave = () => {
    setUserName(draftName.trim())
    setUserAvatar(draftAvatar)
    setOpen(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setDraftAvatar(result)
      setPreviewAvatar(result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemoveAvatar = () => {
    setDraftAvatar(null)
    setPreviewAvatar(null)
  }

  const userAvatarSrc = userAvatar ?? defaultUserAvatar
  const displayName = userName || t('settings.userProfile.defaultName')

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2.5,
          py: 1.5,
          gap: 3,
        }}
      >
        {/* Section label */}
        <Box sx={{ minWidth: 80 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {t('settings.userProfile.title')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('settings.userProfile.description')}
          </Typography>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* User preview */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <RoundedAvatar src={userAvatarSrc} size={40} fallbackIcon={<PersonIcon sx={{ fontSize: 20, color: 'text.secondary' }} />} />
          <Box>
            <Typography variant="body2" fontWeight={500}>{displayName}</Typography>
            <Typography variant="caption" color="text.secondary">{t('settings.userProfile.you')}</Typography>
          </Box>
        </Box>

        {/* Divider between user and Lemy */}
        <Box sx={{ color: 'text.disabled', fontSize: '1.2rem', userSelect: 'none' }}>↔</Box>

        {/* Lemy preview */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <RoundedAvatar src={lemyAvatar} size={40} fallbackIcon={<SmartToyIcon sx={{ fontSize: 20, color: 'text.secondary' }} />} />
          <Box>
            <Typography variant="body2" fontWeight={500}>Lemy</Typography>
            <Typography variant="caption" color="text.secondary">{t('settings.userProfile.ai')}</Typography>
          </Box>
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Edit button */}
        <Button
          size="small"
          startIcon={<EditIcon />}
          onClick={handleOpen}
          variant="outlined"
          sx={{ flexShrink: 0 }}
        >
          {t('settings.userProfile.edit')}
        </Button>
      </Box>

      {/* Edit Dialog */}
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {t('settings.userProfile.editTitle')}
        </DialogTitle>

        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 1 }}>
            {/* Avatar picker */}
            <Box sx={{ position: 'relative' }}>
              <RoundedAvatar
                src={previewAvatar ?? defaultUserAvatar}
                size={88}
                fallbackIcon={<PersonIcon sx={{ fontSize: 40, color: 'text.secondary' }} />}
              />

              <Box
                sx={{
                  position: 'absolute',
                  bottom: -6,
                  right: -6,
                  display: 'flex',
                  gap: 0.5,
                }}
              >
                <Tooltip title={t('settings.userProfile.uploadAvatar')}>
                  <IconButton
                    size="small"
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      width: 28,
                      height: 28,
                      borderRadius: '6px',
                      '&:hover': { bgcolor: 'primary.dark' },
                    }}
                  >
                    <PhotoCameraIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
                {previewAvatar && (
                  <Tooltip title={t('settings.userProfile.removeAvatar')}>
                    <IconButton
                      size="small"
                      onClick={handleRemoveAvatar}
                      sx={{
                        bgcolor: 'error.main',
                        color: 'error.contrastText',
                        width: 28,
                        height: 28,
                        borderRadius: '6px',
                        '&:hover': { bgcolor: 'error.dark' },
                      }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </Box>

            <Typography variant="caption" color="text.secondary">
              {t('settings.userProfile.avatarHint')}
            </Typography>

            <TextField
              label={t('settings.userProfile.nameLabel')}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              fullWidth
              size="small"
              placeholder={t('settings.userProfile.namePlaceholder')}
              inputProps={{ maxLength: 30 }}
            />
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} variant="contained">
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

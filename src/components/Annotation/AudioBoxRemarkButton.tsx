import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import { useTranslation } from 'react-i18next'
import type { AudioBox } from '../../types/annotation'

interface Props {
  box: AudioBox
  onUpdate: (id: number, updates: Partial<AudioBox>) => void
}

export default function AudioBoxRemarkButton({ box, onUpdate }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [remark, setRemark] = useState('')
  return <>
    <Tooltip title={box.remark || box.text || t('annotation.remark')}>
      <IconButton size="small" onClick={() => {
        setRemark(box.remark ?? box.text ?? '')
        setOpen(true)
      }} aria-label={t('annotation.remark')}>
        <EditIcon fontSize="small" />
      </IconButton>
    </Tooltip>
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>{t('annotation.remark')}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth multiline minRows={3} value={remark}
          margin="dense" label={t('annotation.remark')} placeholder={t('annotation.enterRemark')}
          onChange={event => setRemark(event.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={() => {
          onUpdate(box.id, { remark })
          setOpen(false)
        }}>{t('common.save')}</Button>
      </DialogActions>
    </Dialog>
  </>
}

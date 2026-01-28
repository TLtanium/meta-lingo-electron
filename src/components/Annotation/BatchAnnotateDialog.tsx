/**
 * BatchAnnotateDialog - 批量标注确认弹窗组件
 * 
 * 功能：
 * - 显示确认弹窗
 * - 展示匹配数量和目标标签
 * - 确认/取消操作
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Alert
} from '@mui/material'
import LabelIcon from '@mui/icons-material/Label'
import { useTranslation } from 'react-i18next'
import type { SearchMatch } from './SearchAnnotateBox'

interface BatchAnnotateDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  matches: SearchMatch[]
  labelName: string
  labelColor?: string
}

export default function BatchAnnotateDialog({
  open,
  onClose,
  onConfirm,
  matches,
  labelName,
  labelColor = '#1976d2'
}: BatchAnnotateDialogProps) {
  const { t } = useTranslation()
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {t('annotation.confirmBatchAnnotate', '确认批量标注')}
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('annotation.batchAnnotateMessage', '是否将 {{count}} 处匹配标注为 "{{label}}"？', {
            count: matches.length,
            label: labelName
          })}
        </Alert>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('annotation.targetLabel', '目标标签')}:
          </Typography>
          <Chip
            icon={<LabelIcon />}
            label={labelName}
            size="small"
            sx={{
              bgcolor: labelColor,
              color: 'white',
              '& .MuiChip-icon': { color: 'white' }
            }}
          />
        </Box>
        
        <Typography variant="body2" color="text.secondary">
          {t('annotation.matchPreview', '匹配预览')}:
        </Typography>
        <Box sx={{ 
          maxHeight: 200, 
          overflow: 'auto', 
          mt: 1,
          p: 1,
          bgcolor: 'grey.100',
          borderRadius: 1
        }}>
          {matches.slice(0, 10).map((match, index) => (
            <Chip
              key={`${match.start}-${match.end}`}
              label={`"${match.text}" @ ${match.start}`}
              size="small"
              variant="outlined"
              sx={{ m: 0.25, fontSize: '11px' }}
            />
          ))}
          {matches.length > 10 && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {t('annotation.andMore', '...以及其他 {{count}} 处', { count: matches.length - 10 })}
            </Typography>
          )}
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {t('common.cancel', '取消')}
        </Button>
        <Button onClick={onConfirm} variant="contained" color="primary">
          {t('common.confirm', '确认')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}


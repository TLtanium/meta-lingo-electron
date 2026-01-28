/**
 * Entry Detail Dialog for Bibliographic Visualization
 * 
 * Shows detailed information about a bibliographic entry
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
  Divider,
  Link,
  IconButton
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import LaunchIcon from '@mui/icons-material/Launch'
import { useTranslation } from 'react-i18next'
import type { BiblioEntry } from '../../types/biblio'

interface EntryDetailDialogProps {
  entry: BiblioEntry | null
  open: boolean
  onClose: () => void
}

export default function EntryDetailDialog({ entry, open, onClose }: EntryDetailDialogProps) {
  const { t } = useTranslation()
  
  if (!entry) return null
  
  const DetailRow = ({ label, value }: { label: string; value?: string | number | null }) => {
    if (!value) return null
    return (
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="body2">{value}</Typography>
      </Box>
    )
  }
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, pr: 2 }}>
          <Typography variant="h6" component="div">
            {entry.title}
          </Typography>
          {entry.doc_type && (
            <Chip 
              label={entry.doc_type} 
              size="small" 
              variant="outlined" 
              sx={{ mt: 1 }}
            />
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers>
        {/* Authors */}
        {entry.authors.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.authors')}
            </Typography>
            <Typography variant="body2">
              {entry.authors.join('; ')}
            </Typography>
          </Box>
        )}
        
        {/* Institutions */}
        {entry.institutions.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.institutions')}
            </Typography>
            <Typography variant="body2">
              {entry.institutions.join('; ')}
            </Typography>
          </Box>
        )}
        
        <Divider sx={{ my: 2 }} />
        
        {/* Publication info */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
          <DetailRow label={t('biblio.journal')} value={entry.journal} />
          <DetailRow label={t('biblio.year')} value={entry.year} />
          <DetailRow label={t('biblio.volume')} value={entry.volume} />
          <DetailRow label={t('biblio.issue')} value={entry.issue} />
          <DetailRow label={t('biblio.pages')} value={entry.pages} />
          <DetailRow label={t('biblio.language')} value={entry.language} />
          <DetailRow label={t('biblio.citations')} value={entry.citation_count} />
        </Box>
        
        {/* DOI */}
        {entry.doi && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              DOI
            </Typography>
            <Link 
              href={`https://doi.org/${entry.doi}`} 
              target="_blank" 
              rel="noopener noreferrer"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              {entry.doi}
              <LaunchIcon fontSize="small" />
            </Link>
          </Box>
        )}
        
        {/* Source URL */}
        {entry.source_url && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('biblio.sourceUrl')}
            </Typography>
            <Link 
              href={entry.source_url} 
              target="_blank" 
              rel="noopener noreferrer"
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                wordBreak: 'break-all'
              }}
            >
              {entry.source_url.length > 60 
                ? entry.source_url.substring(0, 60) + '...' 
                : entry.source_url}
              <LaunchIcon fontSize="small" />
            </Link>
          </Box>
        )}
        
        <Divider sx={{ my: 2 }} />
        
        {/* Keywords */}
        {entry.keywords.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('biblio.keywords')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {entry.keywords.map((kw, i) => (
                <Chip key={i} label={kw} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>
        )}
        
        {/* Abstract */}
        {entry.abstract && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('biblio.abstract')}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'justify' }}>
              {entry.abstract}
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}


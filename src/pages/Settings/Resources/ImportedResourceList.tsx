import { useState } from 'react'
import {
  Accordion, AccordionSummary, AccordionDetails, Box, Button, Chip,
  Divider, InputAdornment, Stack, TextField, Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'
import { useTranslation } from 'react-i18next'
import type { UserResource } from '../../../api/resources'

interface Props {
  resources: UserResource[]
  busy: boolean
  onRemove: (id: string) => void
}

export default function ImportedResourceList({ resources, busy, onRemove }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const nameOf = (resource: UserResource) => resource.name
    || resource.name_zh || resource.name_en || resource.id
  const filtered = resources.filter(resource => !query.trim() ||
    [resource.name, resource.name_en, resource.name_zh, resource.id].some(name => name?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))

  return (
    <Accordion disableGutters elevation={0} TransitionProps={{ unmountOnExit: true }}
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px !important', '&:before': { display: 'none' }, overflow: 'hidden' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2">{t('resources.installed')}</Typography>
          <Chip size="small" label={resources.length} variant="outlined" sx={{ height: 22 }} />
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {(resources.length > 5 || query.length > 0) && (
          <TextField fullWidth size="small" value={query} onChange={e => setQuery(e.target.value)}
            label={t('resources.searchImported')} sx={{ mb: 1.5, mt: 0.5 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        )}
        {!resources.length ? <Typography variant="body2" color="text.secondary">{t('resources.empty')}</Typography>
          : !filtered.length ? <Typography variant="body2" color="text.secondary">{t('resources.noMatches')}</Typography>
          : (
            <Box sx={{ maxHeight: 320, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              <Stack divider={<Divider />}>
                {filtered.map(resource => (
                  <Stack key={resource.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
                    alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" sx={{ py: 1.5 }}>
                    <Stack sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{nameOf(resource)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {resource.languages ? Object.keys(resource.languages).join(', ') : (resource.count || resource.word_count || 0).toLocaleString()}
                      </Typography>
                    </Stack>
                    <Button color="error" variant="outlined" size="small" startIcon={<DeleteOutlineIcon />} disabled={busy}
                      sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}
                      onClick={() => { if (window.confirm(t('resources.removeConfirm'))) onRemove(resource.id) }}>
                      {t('resources.remove')}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
      </AccordionDetails>
    </Accordion>
  )
}

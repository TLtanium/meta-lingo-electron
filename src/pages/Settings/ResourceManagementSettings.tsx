import { useEffect, useState } from 'react'
import { Alert, CircularProgress, Paper, Stack, Tab, Tabs, Typography } from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { useTranslation } from 'react-i18next'
import { resourceApi, type ResourceKind, type ResourceStatus } from '../../api/resources'
import ResourceImportForm from './Resources/ResourceImportForm'
import ImportedResourceList from './Resources/ImportedResourceList'
import { resourceError } from './Resources/resourceError'

export default function ResourceManagementSettings() {
  const { t } = useTranslation()
  const [kind, setKind] = useState<ResourceKind>('nrc')
  const [status, setStatus] = useState<ResourceStatus>({ nrc: [], dictionary: [], reference: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => setStatus(await resourceApi.list())
  useEffect(() => {
    const reload = () => { setError(''); refresh().catch(e => setError(e.message)) }
    reload()
    window.addEventListener('meta-lingo:settings-reset-completed', reload)
    return () => window.removeEventListener('meta-lingo:settings-reset-completed', reload)
  }, [])
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await task(); await refresh(); window.dispatchEvent(new Event('meta-lingo:user-resources-changed')) }
    catch (e: any) { setError(String(e.response?.data?.detail || e.message)) }
    finally { setBusy(false) }
  }
  return <Paper sx={{ p: 3 }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
      <FolderOpenIcon color="primary" />
      <Typography variant="h6">{t('resources.title')}</Typography>
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('resources.description')}</Typography>
    <Tabs value={kind} onChange={(_, v) => setKind(v)} variant="scrollable" scrollButtons="auto"
      aria-label={t('resources.title')} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
      {(['nrc', 'dictionary', 'reference'] as const).map(k => <Tab disabled={busy} key={k} value={k}
        id={`resource-tab-${k}`} aria-controls={`resource-panel-${k}`} label={t(`resources.${k}`)} />)}
    </Tabs>
    <Stack spacing={2} role="tabpanel" id={`resource-panel-${kind}`} aria-labelledby={`resource-tab-${kind}`}>
      {busy && <Stack direction="row" spacing={1}><CircularProgress size={20} /><Typography>{t('resources.working')}</Typography></Stack>}
      {error && <Alert severity="error">{resourceError(error, t)}</Alert>}
      <ResourceImportForm key={`${kind}-import`} kind={kind} busy={busy} run={run} />
      <ImportedResourceList key={`${kind}-installed`} resources={status[kind]} busy={busy}
        onRemove={id => void run(() => resourceApi.remove(kind, id))} />
    </Stack>
  </Paper>
}

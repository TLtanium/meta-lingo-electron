import { useState } from 'react'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { resourceApi, type ResourceKind } from '../../../api/resources'
import ReferenceImportForm from './ReferenceImportForm'

interface Props { kind: ResourceKind; busy: boolean; run: (task: () => Promise<unknown>) => Promise<void> }
export default function ResourceImportForm({ kind, busy, run }: Props) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  if (kind === 'reference') return <ReferenceImportForm busy={busy} run={run} />
  const nrc = kind === 'nrc'
  return <Stack spacing={1.5}>
    <Typography variant="body2" color="text.secondary">{t(`resources.${kind}Help`)}</Typography>
    {nrc && <Link href="https://saifmohammad.com/WebPages/NRC-Emotion-Lexicon.htm" target="_blank" rel="noopener noreferrer">{t('resources.nrcWebsite')}</Link>}
    <Button component="label" variant="outlined" startIcon={<FolderOpenIcon />} disabled={busy}>
      {t(nrc ? 'resources.chooseFolder' : 'resources.chooseDictionary')}
      <input hidden type="file" multiple accept={nrc ? undefined : '.mdx,.mdd,.css,.png,.jpg,.jpeg,.gif,.svg,.webp,.mp3,.wav,.ogg,.woff,.woff2,.ttf'}
        {...(nrc ? { webkitdirectory: '', directory: '' } : {})}
        onChange={e => setFiles(Array.from(e.target.files || []).filter(f => !nrc || f.name.toLowerCase().endsWith('.txt')))} />
    </Button>
    {!nrc && <TextField size="small" label={t('resources.dictionaryName')} value={name} disabled={busy} onChange={e => setName(e.target.value)} />}
    {!!files.length && <Typography variant="caption">{t('resources.fileCount', { count: files.length })}</Typography>}
    <Box><Button variant="contained" startIcon={<UploadFileIcon />} disabled={busy || !files.length} onClick={() => void run(async () => {
      await resourceApi.import(kind, files, nrc ? {} : { name })
      setFiles([]); setName('')
    })}>{t('resources.import')}</Button></Box>
    <Alert severity="info">{t('resources.rights')}</Alert>
  </Stack>
}

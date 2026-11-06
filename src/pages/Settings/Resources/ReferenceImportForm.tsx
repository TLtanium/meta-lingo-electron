import { useState } from 'react'
import { Alert, Box, Button, Grid, Stack, TextField, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import { resourceApi } from '../../../api/resources'
import { splitReferenceTags } from '../../../components/CorpusResource/resourceMetadata'
const columns = [['name', 'prefix'], ['tags', 'description']] as const
const fields = columns.flat()
const helperKeys = { name: 'nameHelp', prefix: 'groupHelp', tags: 'tagsHelp', description: 'descriptionHelp' } as const
export default function ReferenceImportForm({ busy, run }: { busy: boolean; run: (task: () => Promise<unknown>) => Promise<void> }) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [report, setReport] = useState<{ rows: number; word_count: number; file_size: number } | null>(null)
  const metadata = { ...values, tags: splitReferenceTags(values.tags || '') }
  return <Stack spacing={1.5}>
    <Typography variant="body2" color="text.secondary">{t('resources.referenceHelp')}</Typography>
    <Button component="label" variant="outlined" startIcon={<FolderOpenIcon />} disabled={busy}>{t('resources.chooseCSV')}
      <input hidden type="file" accept=".csv" onChange={e => { setFile(e.target.files?.[0] || null); setReport(null) }} />
    </Button>
    {file && <Typography variant="caption">{file.name}</Typography>}
    <Box><Button variant="outlined" startIcon={<FactCheckIcon />} disabled={busy || !file} onClick={() => void run(async () => {
      if (file) setReport(await resourceApi.import('reference', [file], {}, true))
    })}>{t('resources.validate')}</Button></Box>
    {report && <Alert severity="success">{t('resources.validated', { rows: report.rows, count: report.word_count, size: report.file_size.toLocaleString() })}</Alert>}
    <Box><Grid container spacing={1.5}>
      {columns.map((column, index) => <Grid item xs={12} sm={6} key={index}>
        <Stack spacing={1.5}>
          {column.map(field => <TextField key={field} fullWidth required size="small" disabled={busy} label={t(`resources.fields.${field}`)}
            multiline={field === 'description'} maxRows={field === 'description' ? 4 : undefined}
            helperText={t(`resources.${helperKeys[field]}`)}
            value={values[field] || ''} onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))} />)}
        </Stack>
      </Grid>)}
    </Grid></Box>
    <Box><Button variant="contained" startIcon={<UploadFileIcon />} disabled={busy || !report || fields.some(f => !values[f]?.trim()) || !metadata.tags.length} onClick={() => void run(async () => {
      if (file) { await resourceApi.import('reference', [file], metadata); setFile(null); setReport(null); setValues({}) }
    })}>{t('resources.import')}</Button></Box>
    <Alert severity="info">{t('resources.rights')}</Alert>
  </Stack>
}

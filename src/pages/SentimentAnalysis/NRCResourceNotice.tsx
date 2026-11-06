import { useEffect, useState } from 'react'
import { Alert } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { resourceApi } from '../../api/resources'
const aliases: Record<string, string> = { en: 'english', zh: 'chinese', 'zh-cn': 'chinese', da: 'danish', nl: 'dutch', fi: 'finnish', fr: 'french', it: 'italian', pt: 'portuguese', ru: 'russian', es: 'spanish', sv: 'swedish' }
export default function NRCResourceNotice({ language }: { language?: string }) {
  const { t } = useTranslation()
  const [languages, setLanguages] = useState<string[] | null>(null)
  useEffect(() => {
    const refresh = () => { resourceApi.list().then(status => setLanguages(status.nrc.flatMap(r => Object.keys(r.languages || {})))).catch(() => setLanguages(null)) }
    refresh(); window.addEventListener('meta-lingo:user-resources-changed', refresh)
    return () => window.removeEventListener('meta-lingo:user-resources-changed', refresh)
  }, [])
  const normalized = (language || '').toLowerCase()
  const missing = languages !== null && (!languages.length || (!!normalized && !languages.includes(aliases[normalized] || normalized)))
  return missing ? <Alert severity="info" sx={{ mb: 2 }}>{t('resources.nrcEmpty')}</Alert> : null
}

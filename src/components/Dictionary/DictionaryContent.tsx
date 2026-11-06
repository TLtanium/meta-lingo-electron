import { useRef, useEffect, useMemo, useState } from 'react'
import { Box, Typography, Alert } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { dictionaryDocument } from './dictionaryDocument'
export interface LookupResult {
  found: boolean; word?: string; content?: string; dictionary_id?: string
  fuzzy?: boolean; matched_key?: string; error?: string
}
interface Props { dictName: string; result: LookupResult | null; onWordClick: (word: string) => void; isLoading?: boolean; isDark?: boolean }
export default function DictionaryContent({ dictName, result, onWordClick, isLoading = false, isDark = false }: Props) {
  const { t } = useTranslation()
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(400)
  const html = useMemo(() => result?.found ? dictionaryDocument(result.content || '', result.dictionary_id || '', isDark,
    { play: t('dictionary.playAudio'), failed: t('dictionary.audioFailed') }) : '', [result, isDark, t])
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return
      if (event.data?.type === 'dictionary-word' && typeof event.data.word === 'string' && event.data.word.length < 500) onWordClick(event.data.word)
      if (event.data?.type === 'dictionary-height' && Number.isFinite(event.data.height)) setHeight(Math.min(20000, Math.max(200, event.data.height)))
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onWordClick])
  if (isLoading) return <Box p={2}>{t('common.loading')}</Box>
  if (!result) return <Box p={2}><Typography>{t('dictionary.inputToSearch')}</Typography></Box>
  if (result.error) return <Alert severity="error">{result.error}</Alert>
  if (!result.found) return <Box p={2}>{t('dictionary.noResults')} “{result.word}”</Box>
  return <iframe ref={frame} title={dictName} sandbox="allow-scripts" srcDoc={html} style={{ width: '100%', height, border: 0 }} />
}

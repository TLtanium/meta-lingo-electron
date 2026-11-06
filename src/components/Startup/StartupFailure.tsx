import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getStartupBridge } from './bridge'

export default function StartupFailure() {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false)
  const prompted = useRef(false), pending = useRef(false), mounted = useRef(true)
  const available = !!getStartupBridge()?.restartApplication
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const restart = useCallback(async () => {
    const bridge = getStartupBridge()
    if (!bridge?.restartApplication || pending.current) return
    pending.current = true
    setBusy(true)
    setFailed(false)
    try {
      const result = await bridge.restartApplication(i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh')
      if (!mounted.current) return
      if (result.status !== 'restarting') {
        setBusy(false)
        setFailed(result.status === 'failed' || result.status === 'unavailable')
      }
    } catch { if (mounted.current) { setFailed(true); setBusy(false) } }
    finally { pending.current = false }
  }, [i18n])
  useEffect(() => {
    if (!prompted.current && available) { prompted.current = true; void restart() }
  }, [available, restart])

  return <div className="startup-error" role="alert">
    <p>{t(failed ? 'startup.restartFailed' : available ? 'startup.restartRequired' : 'startup.manualRestart')}</p>
    {available && <button type="button" disabled={busy} onClick={restart}>
      {t(busy ? 'startup.restarting' : 'startup.restart')}
    </button>}
  </div>
}

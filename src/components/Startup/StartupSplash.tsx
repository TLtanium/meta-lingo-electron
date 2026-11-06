import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import StartupBrand from './StartupBrand'
import { getStartupBridge } from './bridge'
import StartupFailure from './StartupFailure'
import './startup.css'

interface Props {
  version: string
  leaving: boolean
  ready: boolean
  error: boolean
}

export default function StartupSplash({ version, leaving, ready, error }: Props) {
  const dark = useSettingsStore(s => s.darkMode)
  const { t } = useTranslation()
  const [material, setMaterial] = useState(false)

  useEffect(() => {
    let current = true
    const bridge = getStartupBridge()
    bridge?.setStartupAppearance?.({ active: !leaving, dark }).then(result => {
      if (current) setMaterial(result.translucent)
    }).catch(() => { if (current) setMaterial(false) })
    if (!leaving && bridge?.platform === 'win32') {
      bridge.setTitleBarOverlay?.({ color: 'rgba(0,0,0,0)', symbolColor: dark ? '#e8e8ec' : '#212121', height: 48 }).catch(() => {})
    }
    return () => { current = false }
  }, [dark, leaving])

  useEffect(() => {
    document.documentElement.classList.toggle('startup-native-glass', material && !leaving)
    return () => document.documentElement.classList.remove('startup-native-glass')
  }, [material, leaving])

  // Also restore the native surface if an error boundary or navigation unmounts us.
  useEffect(() => () => {
    getStartupBridge()?.setStartupAppearance?.({ active: false, dark: useSettingsStore.getState().darkMode }).catch(() => {})
  }, [])

  return <main className={`startup-splash${dark ? ' startup-dark' : ''}${material ? ' startup-glass' : ''}${leaving ? ' startup-leaving' : ''}`}
    data-version={version} aria-busy={!ready && !error}>
    <div className="startup-drag-region" aria-hidden="true" />
    <div className="startup-composition">
      <StartupBrand />
      {!error && <div className={`startup-line${ready ? ' startup-line-ready' : ''}`} role="progressbar"
        aria-label={t(ready ? 'startup.ready' : 'startup.initializing')} />}
      {error && <StartupFailure />}
    </div>
  </main>
}

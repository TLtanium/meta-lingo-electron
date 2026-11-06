import i18n from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'
import { usePreprocessStore } from '../stores/preprocessStore'
import { useCorpusStore } from '../stores/corpusStore'
import { useTabStore } from '../stores/tabStore'
import { usePetStore } from '../stores/petStore'
import { getNativePetAPI } from '../pet/native'

const OWNED_KEYS = new Set(['collocation_sort_settings', 'biblio_visible_ai_cols', 'cql_saved_templates'])

/** Clear this application's persisted state without clearing other localhost apps. */
export async function resetFrontendState(): Promise<void> {
  await getNativePetAPI()?.reset()
  usePetStore.setState(usePetStore.getInitialState(), true)
  useChatStore.setState(useChatStore.getInitialState(), true)
  usePreprocessStore.setState(usePreprocessStore.getInitialState(), true)
  useCorpusStore.setState(useCorpusStore.getInitialState(), true)
  useSettingsStore.setState(useSettingsStore.getInitialState(), true)
  for (const storage of [localStorage, sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    for (const key of keys) {
      if (key && (/^meta-?lingo[-:]/i.test(key) || OWNED_KEYS.has(key))) storage.removeItem(key)
    }
  }
  const tabs = useTabStore.getState()
  const settings = tabs.tabs.find(tab => tab.type === 'settings')
  if (settings) tabs.closeOtherTabs(settings.id)
  await i18n.changeLanguage(useSettingsStore.getState().language)
}

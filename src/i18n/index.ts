import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './zh.json'
import en from './en.json'

const resources = {
  zh: { translation: zh },
  en: { translation: en }
}

// 从 localStorage 读取保存的语言设置
const getSavedLanguage = (): string => {
  try {
    const saved = localStorage.getItem('meta-lingo-settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      const language = parsed?.state?.language
      if (language === 'zh' || language === 'en') {
        return language
      }
    }
  } catch (err) {
    console.error('Failed to load language from settings:', err)
  }
  return 'zh' // 默认中文
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false
    }
  })

export default i18n


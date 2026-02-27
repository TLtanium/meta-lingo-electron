import { useState, useCallback } from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import { llmChatApi, type LLMChatMessage } from '../../api'
import ChatDialog from './ChatDialog'

export interface AnalysisAIAssistantProps {
  enabled: boolean
  getContext: () => string | Promise<string>
  moduleLabel: string
}

export default function AnalysisAIAssistant({ enabled, getContext, moduleLabel }: AnalysisAIAssistantProps) {
  const { t } = useTranslation()
  const {
    openaiApiEnabled,
    openaiApiBaseUrl,
    openaiApiKey,
    openaiApiModel,
    ollamaConnected,
    ollamaUrl,
    ollamaModel
  } = useSettingsStore()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<LLMChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)

  const suggestedPrompts = [
    t('aiAssistant.suggestExplain'),
    t('aiAssistant.suggestParams'),
    t('aiAssistant.suggestSummary')
  ]

  const handleOpen = useCallback(() => {
    setMessages([])
    setInputValue('')
    setOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setMessages(prev => [...prev, { role: 'user', content: trimmed }])
      setInputValue('')
      setLoading(true)

      const provider = openaiApiEnabled ? 'openai' : ollamaConnected ? 'ollama' : null
      if (!provider) {
        setLoading(false)
        return
      }

      const config =
        provider === 'openai'
          ? {
              openai: {
                base_url: openaiApiBaseUrl,
                api_key: openaiApiKey,
                model: openaiApiModel || 'gpt-4o-mini'
              }
            }
          : {
              ollama: {
                url: ollamaUrl,
                model: ollamaModel || ''
              }
            }

      try {
        const ctx = await Promise.resolve(getContext())
        const groundHint = t('aiAssistant.groundInContext')
        const replyInLanguageHint = t('aiAssistant.replyInLanguage')
        const systemContext = `${ctx}\n\n${groundHint}\n\n${replyInLanguageHint}`
        const singleTurnMessages: LLMChatMessage[] = [{ role: 'user', content: trimmed }]
        const res = await llmChatApi.chat(provider, config, systemContext, singleTurnMessages)
        if (res.success && res.data?.response != null) {
          setMessages(prev => [...prev, { role: 'assistant', content: res.data!.response }])
        } else {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: res.error || t('aiAssistant.error') }
          ])
        }
      } catch (e) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: (e as Error)?.message || t('aiAssistant.error') }
        ])
      }
      setLoading(false)
    },
    [
      getContext,
      openaiApiEnabled,
      openaiApiBaseUrl,
      openaiApiKey,
      openaiApiModel,
      ollamaConnected,
      ollamaUrl,
      ollamaModel,
      t
    ]
  )

  const handleSend = useCallback(() => {
    sendMessage(inputValue)
  }, [inputValue, sendMessage])

  const handleSuggestedClick = useCallback(
    (text: string) => {
      sendMessage(text)
    },
    [sendMessage]
  )

  const dialogTitle = `${moduleLabel} - ${t('aiAssistant.title')}`

  return (
    <>
      <Tooltip
        title={enabled ? t('aiAssistant.tooltipEnabled') : t('aiAssistant.tooltipDisabled')}
      >
        <span>
          <IconButton
            size="small"
            color="primary"
            onClick={handleOpen}
            disabled={!enabled}
            aria-label={t('aiAssistant.title')}
          >
            <SmartToyIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <ChatDialog
        open={open}
        onClose={handleClose}
        title={dialogTitle}
        messages={messages}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSend={handleSend}
        loading={loading}
        suggestedPrompts={suggestedPrompts}
        onSuggestedClick={handleSuggestedClick}
      />
    </>
  )
}

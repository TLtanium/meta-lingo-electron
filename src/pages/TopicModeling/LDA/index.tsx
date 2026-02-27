/**
 * LDA Tab Main Component
 * LDA topic modeling using Gensim engine
 * Supports dynamic topic analysis for temporal evolution
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Divider,
  Stack,
  Chip,
  LinearProgress
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../../stores/settingsStore'
import { topicModelingApi } from '../../../api'
import type { CorpusText } from '../../../types'
import type {
  LDAPreprocessConfig,
  LDAConfig,
  LDAResult,
  LDAOptimizeResult,
  LDADynamicConfig,
  LDADynamicResult,
  LDATopic
} from '../../../types/topicModeling'
import {
  DEFAULT_LDA_PREPROCESS_CONFIG,
  DEFAULT_LDA_CONFIG,
  DEFAULT_LDA_DYNAMIC_CONFIG
} from '../../../types/topicModeling'

import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import CorpusOrLibrarySelector from '../../../components/Corpus/CorpusOrLibrarySelector'
import LDAPreprocessPanel from './LDAPreprocessPanel'
import LDAParameterPanel from './LDAParameterPanel'
import LDADynamicPanel, { getTextDatesMapping } from './LDADynamicPanel'
import LDAResultsPanel from './LDAResultsPanel'
import LDAVisualizationPanel from './LDAVisualizationPanel'
import AnalysisAIAssistant from '../../../components/AnalysisAIAssistant'
import type { CrossLinkParams } from '../../../types/crossLink'

interface LDATabProps {
  crossLinkParams?: CrossLinkParams
}

export default function LDATab({ crossLinkParams }: LDATabProps = {}) {
  const { t } = useTranslation()
  const { 
    ollamaConnected, 
    openaiApiEnabled,
    ollamaUrl, 
    ollamaModel, 
    ollamaLanguage,
    openaiApiBaseUrl,
    openaiApiKey,
    openaiApiModel,
    setOllamaConnected,
    setOllamaModels,
    setOllamaModel
  } = useSettingsStore()
  
  // Auto-check Ollama connection on mount
  useEffect(() => {
    const checkOllama = async () => {
      if (!ollamaConnected && ollamaUrl) {
        try {
          const response = await topicModelingApi.checkOllamaConnection(ollamaUrl)
          if (response.success && response.data?.connected) {
            setOllamaConnected(true)
            setOllamaModels(response.data.models || [])
            if (response.data.models?.length > 0 && !ollamaModel) {
              setOllamaModel(response.data.models[0])
            }
          }
        } catch (err) {
          console.log('Ollama not connected')
        }
      }
    }
    checkOllama()
  }, [ollamaUrl])
  
  // Corpus/library selection (unified selector)
  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)
  
  // Derived from selection for panels/API (resolve 'all' to array via allTexts)
  const corpusId = corpusSelection?.corpusId ?? ''
  const textIds = corpusSelection?.textIds === 'all'
    ? (corpusSelection?.allTexts?.map(t => t.id) ?? [])
    : (corpusSelection?.textIds ?? [])
  const texts = corpusSelection?.allTexts ?? []
  const corpusLanguage = corpusSelection?.language ?? 'english'
  const selectionMode = corpusSelection?.selectionMode === 'keywords' ? 'tags' : (corpusSelection?.selectionMode ?? 'all')
  const selectedTags = corpusSelection?.selectedKeywords ?? corpusSelection?.selectedTags ?? []
  const libraryId = corpusSelection?.dataSource === 'library' ? corpusSelection.libraryId : undefined
  
  // Text dates: from library entry year when in library mode, else from texts metadata
  const textDates = useMemo(() => {
    if (corpusSelection?.textDates && Object.keys(corpusSelection.textDates).length > 0) return corpusSelection.textDates
    return getTextDatesMapping(texts)
  }, [corpusSelection?.textDates, texts])

  // Sync corpus/library selection from cross-link so selector shows same source
  useEffect(() => {
    if (!crossLinkParams?.corpusId) return
    setCorpusSelection({
      corpusId: crossLinkParams.corpusId,
      textIds: Array.isArray(crossLinkParams.textIds) ? crossLinkParams.textIds : 'all',
      language: 'english',
      dataSource: crossLinkParams.libraryId ? 'library' : 'corpus',
      selectionMode: (crossLinkParams.selectionMode as 'all' | 'tags' | 'selected') ?? 'all',
      selectedTags: crossLinkParams.selectedTags ?? [],
      ...(crossLinkParams.libraryId && { libraryId: crossLinkParams.libraryId }),
      ...(crossLinkParams.selectedEntryIds?.length && { selectedEntryIds: crossLinkParams.selectedEntryIds })
    })
  }, [crossLinkParams])

  // External selection for selector sync when opened via cross-link (including library)
  const externalSelection = useMemo((): CorpusOrLibrarySelection | null => {
    if (!crossLinkParams?.corpusId) return null
    return {
      corpusId: crossLinkParams.corpusId,
      textIds: Array.isArray(crossLinkParams.textIds) ? crossLinkParams.textIds : 'all',
      language: 'english',
      dataSource: crossLinkParams.libraryId ? 'library' : 'corpus',
      selectionMode: (crossLinkParams.selectionMode as 'all' | 'tags' | 'selected') ?? 'all',
      selectedTags: crossLinkParams.selectedTags ?? [],
      ...(crossLinkParams.libraryId && { libraryId: crossLinkParams.libraryId }),
      ...(crossLinkParams.selectedEntryIds?.length && { selectedEntryIds: crossLinkParams.selectedEntryIds })
    }
  }, [crossLinkParams])
  
  // Preprocess config
  const [preprocessConfig, setPreprocessConfig] = useState<LDAPreprocessConfig>(
    DEFAULT_LDA_PREPROCESS_CONFIG
  )
  
  // LDA config
  const [ldaConfig, setLdaConfig] = useState<LDAConfig>(DEFAULT_LDA_CONFIG)
  
  // Dynamic topic config
  const [dynamicConfig, setDynamicConfig] = useState<LDADynamicConfig>(
    DEFAULT_LDA_DYNAMIC_CONFIG
  )
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<LDADynamicResult | null>(null)
  const [optimizeResult, setOptimizeResult] = useState<LDAOptimizeResult | null>(null)
  
  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)
  
  // Handle corpus/library selection change
  const handleCorpusSelectionChange = (selection: CorpusOrLibrarySelection | null) => {
    if (selection?.corpusId !== corpusSelection?.corpusId) {
      setAnalysisResult(null)
      setOptimizeResult(null)
    }
    setCorpusSelection(selection)
  }
  
  // Handle analysis complete
  const handleAnalysisComplete = (result: LDADynamicResult) => {
    setAnalysisResult(result)
    setIsAnalyzing(false)
    setRightTab(0) // Switch to results tab
  }
  
  // Handle optimize complete
  const handleOptimizeComplete = (result: LDAOptimizeResult) => {
    setOptimizeResult(result)
    setIsAnalyzing(false)
    // Result is now shown in the optimize dialog itself, no need to open separate dialog
  }
  
  // Handle analysis start
  const handleAnalysisStart = () => {
    setIsAnalyzing(true)
  }
  
  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      {/* Left panel - Configuration */}
      <Box sx={{
        width: 450,
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t('topicModeling.lda.title', 'LDA')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('topicModeling.lda.title', 'LDA')}
            getContext={() => {
              const hint = t('aiAssistant.topicModelingLdaContextHint')
              const corpusInfo = corpusId ? `CorpusId: ${corpusId}, ${textIds.length} texts, language: ${corpusLanguage}` : 'Corpus: (none)'
              const params = `num_topics=${dynamicConfig.n_topics}, passes=${dynamicConfig.passes}, alpha=${dynamicConfig.alpha}`
              const topics = analysisResult?.result?.topics ?? analysisResult?.topics ?? []
              if (!topics.length) return `${hint}\n\n${corpusInfo}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
              const toWords = (kw: any) => (typeof kw === 'string' ? kw : (kw?.word ?? '')).trim()
              const topicSummary = topics.slice(0, 15).map((topic: any, i: number) => {
                const kws = (topic.keywords || []).slice(0, 5).map(toWords).filter(Boolean)
                return `${i + 1}. ${topic.custom_label ?? topic.name ?? topic.topic_id}: ${kws.join(', ')}`
              }).join('\n')
              const viewLabel = rightTab === 1 ? `${t('topicModeling.visualization.title')}. ` : ''
              return `${hint}\n\n${corpusInfo}\n${params}\n${viewLabel}Topics (${topics.length}):\n${topicSummary}`
            }}
          />
        </Stack>
        
        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
          <Chip
            label="LDA"
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label="Gensim"
            size="small"
            variant="outlined"
          />
          {corpusLanguage && (
            <Chip
              label={`${t('corpus.language')}: ${corpusLanguage}`}
              size="small"
              variant="outlined"
            />
          )}
          {textIds.length > 0 && (
            <Chip
              label={`${textIds.length} ${t('common.items')}`}
              size="small"
              variant="outlined"
            />
          )}
        </Stack>
        
        {/* 1. Corpus / Library Selector */}
        <CorpusOrLibrarySelector
          sectionTitle={t('topicModeling.corpus.title')}
          onSelectionChange={handleCorpusSelectionChange}
          externalSelection={externalSelection}
        />
        
        <Divider sx={{ my: 2 }} />
        
        {/* 2. Preprocess Panel */}
        <LDAPreprocessPanel
          corpusId={corpusId}
          textIds={textIds}
          language={corpusLanguage}
          config={preprocessConfig}
          onConfigChange={setPreprocessConfig}
        />
        
        {/* 3. Dynamic Topic Panel (like BERTopic, before parameters) */}
        <LDADynamicPanel
          config={dynamicConfig}
          onConfigChange={setDynamicConfig}
          texts={texts}
          textDates={Object.keys(textDates).length > 0 ? textDates : undefined}
          disabled={textIds.length === 0 || isAnalyzing}
        />
        
        {/* 4. LDA Parameter Panel */}
        <LDAParameterPanel
          corpusId={corpusId}
          textIds={textIds}
          language={corpusLanguage}
          preprocessConfig={preprocessConfig}
          config={ldaConfig}
          onConfigChange={setLdaConfig}
          dynamicConfig={dynamicConfig}
          textDates={textDates}
          onAnalysisStart={handleAnalysisStart}
          onAnalysisComplete={handleAnalysisComplete}
          onOptimizeComplete={handleOptimizeComplete}
          disabled={textIds.length === 0}
        />
      </Box>
      
      {/* Right panel - Results & Visualization */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isAnalyzing && <LinearProgress />}
        
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)}>
            <Tab label={t('topicModeling.results.title')} />
            <Tab label={t('topicModeling.visualization.title')} />
          </Tabs>
        </Box>
        
        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {rightTab === 0 && (
            <LDAResultsPanel
              result={analysisResult}
              corpusId={corpusId}
              textIds={selectionMode === 'all' ? 'all' : textIds}
              selectionMode={selectionMode}
              selectedTags={selectedTags}
              libraryId={libraryId}
              selectedEntryIds={corpusSelection?.dataSource === 'library' && corpusSelection?.selectionMode === 'selected' ? corpusSelection?.selectedEntryIds : undefined}
              ngramEnabled={preprocessConfig.ngram_enabled}
              ollamaConnected={ollamaConnected}
              ollamaUrl={ollamaUrl}
              ollamaModel={ollamaModel}
              ollamaLanguage={ollamaLanguage}
              openaiApiEnabled={openaiApiEnabled}
              openaiApiBaseUrl={openaiApiBaseUrl ?? ''}
              openaiApiKey={openaiApiKey ?? ''}
              openaiApiModel={openaiApiModel ?? ''}
              onTopicsUpdate={(updatedTopics: LDATopic[]) => {
                if (analysisResult) {
                  setAnalysisResult({
                    ...analysisResult,
                    topics: updatedTopics
                  })
                }
              }}
            />
          )}
          
          {rightTab === 1 && (
            <LDAVisualizationPanel result={analysisResult} />
          )}
        </Box>
      </Box>
    </Box>
  )
}

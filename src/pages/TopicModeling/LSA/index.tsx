/**
 * LSA Tab Main Component
 * LSA topic modeling with TruncatedSVD
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
import type {
  LSAPreprocessConfig,
  LSAConfig,
  LSAResult,
  LSAOptimizeResult,
  LSADynamicResult,
  LSATopic
} from '../../../types/topicModeling'
import {
  DEFAULT_LSA_PREPROCESS_CONFIG,
  DEFAULT_LSA_CONFIG,
  DEFAULT_LSA_DYNAMIC_CONFIG
} from '../../../types/topicModeling'

import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import CorpusOrLibrarySelector from '../../../components/Corpus/CorpusOrLibrarySelector'
import LSAPreprocessPanel from './LSAPreprocessPanel'
import LDADynamicPanel, { getTextDatesMapping } from '../LDA/LDADynamicPanel'
import LSAParameterPanel from './LSAParameterPanel'
import LSAResultsPanel from './LSAResultsPanel'
import LSAVisualizationPanel from './LSAVisualizationPanel'
import AnalysisAIAssistant from '../../../components/AnalysisAIAssistant'
import type { CrossLinkParams } from '../../../types/crossLink'

interface LSATabProps {
  crossLinkParams?: CrossLinkParams
}

export default function LSATab({ crossLinkParams }: LSATabProps = {}) {
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
  
  // Derived from selection for panels/API
  const corpusId = corpusSelection?.corpusId ?? ''
  const textIds = corpusSelection?.textIds === 'all'
    ? (corpusSelection?.allTexts?.map(t => t.id) ?? [])
    : (corpusSelection?.textIds ?? [])
  const texts = corpusSelection?.allTexts ?? []
  const corpusLanguage = corpusSelection?.language ?? 'english'
  const selectionMode = corpusSelection?.selectionMode === 'keywords' ? 'tags' : (corpusSelection?.selectionMode ?? 'all')
  const selectedTags = corpusSelection?.selectedKeywords ?? corpusSelection?.selectedTags ?? []
  const libraryId = corpusSelection?.dataSource === 'library' ? corpusSelection.libraryId : undefined

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
  const [preprocessConfig, setPreprocessConfig] = useState<LSAPreprocessConfig>(
    DEFAULT_LSA_PREPROCESS_CONFIG
  )
  
  // LSA config
  const [lsaConfig, setLsaConfig] = useState<LSAConfig>(DEFAULT_LSA_CONFIG)
  // Dynamic topic config
  const [dynamicConfig, setDynamicConfig] = useState(DEFAULT_LSA_DYNAMIC_CONFIG)
  
  // Text dates: from library entry year when in library mode, else from texts metadata
  const textDates = useMemo(() => {
    if (corpusSelection?.textDates && Object.keys(corpusSelection.textDates).length > 0) return corpusSelection.textDates
    return getTextDatesMapping(texts)
  }, [corpusSelection?.textDates, texts])
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<LSAResult | LSADynamicResult | null>(null)
  const [optimizeResult, setOptimizeResult] = useState<LSAOptimizeResult | null>(null)
  
  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)
  
  const handleCorpusSelectionChange = (selection: CorpusOrLibrarySelection | null) => {
    if (selection?.corpusId !== corpusSelection?.corpusId) {
      setAnalysisResult(null)
      setOptimizeResult(null)
    }
    setCorpusSelection(selection)
  }
  
  // Handle analysis complete
  const handleAnalysisComplete = (result: LSAResult | LSADynamicResult) => {
    setAnalysisResult(result)
    setIsAnalyzing(false)
    setRightTab(0) // Switch to results tab
  }
  
  // Handle optimize complete
  const handleOptimizeComplete = (result: LSAOptimizeResult) => {
    setOptimizeResult(result)
    setIsAnalyzing(false)
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
            {t('topicModeling.lsa.title', 'LSA')}
          </Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('topicModeling.lsa.title', 'LSA')}
            getContext={() => {
              const hint = t('aiAssistant.topicModelingLsaContextHint')
              const corpusInfo = corpusId ? `CorpusId: ${corpusId}, ${textIds.length} texts, language: ${corpusLanguage}` : 'Corpus: (none)'
              const params = `num_topics=${lsaConfig.n_components}, max_iter=${lsaConfig.max_iter}`
              const topics = analysisResult?.topics ?? []
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
            label="LSA"
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label="TruncatedSVD"
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
        <LSAPreprocessPanel
          corpusId={corpusId}
          textIds={textIds}
          language={corpusLanguage}
          config={preprocessConfig}
          onConfigChange={setPreprocessConfig}
        />
        
        {/* 3. Dynamic Topic Panel */}
        <LDADynamicPanel
          config={dynamicConfig as import('../../../types/topicModeling').LDADynamicConfig}
          onConfigChange={(c) => setDynamicConfig({ enabled: c.enabled, date_format: c.date_format, nr_bins: c.nr_bins })}
          texts={texts}
          textDates={Object.keys(textDates).length > 0 ? textDates : undefined}
          disabled={textIds.length === 0 || isAnalyzing}
        />
        
        <Divider sx={{ my: 2 }} />
        
        {/* 4. LSA Parameter Panel */}
        <LSAParameterPanel
          corpusId={corpusId}
          textIds={textIds}
          language={corpusLanguage}
          preprocessConfig={preprocessConfig}
          config={lsaConfig}
          onConfigChange={setLsaConfig}
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
            <LSAResultsPanel
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
              onTopicsUpdate={(updatedTopics: LSATopic[]) => {
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
            <LSAVisualizationPanel result={analysisResult} />
          )}
        </Box>
      </Box>
    </Box>
  )
}

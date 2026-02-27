/**
 * Topic Modeling Page
 * BERTopic-based topic modeling with SBERT embeddings
 * LDA topic modeling with Gensim
 * LSA/NMF topic modeling with sklearn
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Box,
  Typography,
  LinearProgress,
  Tabs,
  Tab,
  Divider,
  Stack,
  Chip,
  TabsActions
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import type { 
  PreprocessConfig, 
  TopicAnalysisResult, 
  TopicItem,
  DynamicTopicConfig,
  ChunkingConfig
} from '../../types/topicModeling'
import { DEFAULT_CHUNKING_CONFIG } from '../../types/topicModeling'
import type { CorpusText } from '../../types'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import CorpusOrLibrarySelector from '../../components/Corpus/CorpusOrLibrarySelector'
import PreprocessPanel from './PreprocessPanel'
import EmbeddingPanel from './EmbeddingPanel'
import AnalysisPanel from './AnalysisPanel'
import ResultsPanel from './ResultsPanel'
import VisualizationPanel from './VisualizationPanel'
import DynamicTopicPanel from './DynamicTopicPanel'
import LDATab from './LDA'
import LSATab from './LSA'
import NMFTab from './NMF'
import AnalysisAIAssistant from '../../components/AnalysisAIAssistant'
import type { CrossLinkParams } from '../../types/crossLink'

interface TopicModelingProps {
  crossLinkParams?: CrossLinkParams
}

export default function TopicModeling({ crossLinkParams }: TopicModelingProps = {}) {
  const { t } = useTranslation()
  const { ollamaConnected, openaiApiEnabled, ollamaUrl, ollamaModel, openaiApiBaseUrl, openaiApiKey, openaiApiModel } = useSettingsStore()
  const tabsActionRef = useRef<TabsActions>(null)
  
  // Main tab (BERTopic / LDA)
  const [mainTab, setMainTab] = useState(0)

  // Force tabs indicator recalculation after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      tabsActionRef.current?.updateIndicator()
    }, 100)
    return () => clearTimeout(timer)
  }, [])
  
  // Corpus selection (unified corpus or library)
  const [corpusId, setCorpusId] = useState<string>('')
  const [textIds, setTextIds] = useState<string[]>([])
  const [texts, setTexts] = useState<CorpusText[]>([])
  const [corpusLanguage, setCorpusLanguage] = useState<string>('english')
  
  // Track selection mode from corpus selector (for downstream)
  const [selectionMode, setSelectionMode] = useState<'all' | 'selected' | 'tags'>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [libraryId, setLibraryId] = useState<string | undefined>(undefined)
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[] | undefined>(undefined)
  const [textDates, setTextDates] = useState<Record<string, string> | undefined>(undefined)

  // Apply cross-link params to state so BERTopic tab shows same corpus/library when opened via cross-link
  useEffect(() => {
    if (!crossLinkParams?.corpusId) return
    setCorpusId(crossLinkParams.corpusId)
    setTextIds(Array.isArray(crossLinkParams.textIds) ? crossLinkParams.textIds : [])
    setSelectionMode((crossLinkParams.selectionMode as 'all' | 'tags' | 'selected') ?? 'all')
    setSelectedTags(crossLinkParams.selectedTags ?? [])
    setLibraryId(crossLinkParams.libraryId)
    setSelectedEntryIds(crossLinkParams.selectedEntryIds)
  }, [crossLinkParams])

  // Preprocess config
  const [preprocessConfig, setPreprocessConfig] = useState<PreprocessConfig>({
    remove_stopwords: false,
    remove_punctuation: false,
    lemmatize: false,
    lowercase: false,
    min_token_length: 1,
    pos_filter: []
  })
  const [chunkingConfig, setChunkingConfig] = useState<ChunkingConfig>(DEFAULT_CHUNKING_CONFIG)
  const [dynamicTopicConfig, setDynamicTopicConfig] = useState<DynamicTopicConfig>({
    enabled: false,
    date_format: 'year_only',
    nr_bins: null,
    evolution_tuning: true,
    global_tuning: true
  })
  const [selectedEmbedding, setSelectedEmbedding] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<TopicAnalysisResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [rightTab, setRightTab] = useState(0)

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

  const handleCorpusSelectionChange = (selection: CorpusOrLibrarySelection | null) => {
    if (!selection) {
      setCorpusId('')
      setTextIds([])
      setTexts([])
      setCorpusLanguage('english')
      setSelectionMode('all')
      setSelectedTags([])
      setLibraryId(undefined)
      setSelectedEntryIds(undefined)
      setTextDates(undefined)
      return
    }
    setCorpusId(selection.corpusId)
    setTextIds(Array.isArray(selection.textIds) ? selection.textIds : [])
    setTexts(selection.allTexts ?? [])
    setCorpusLanguage(selection.language)
    setSelectionMode(selection.selectionMode === 'keywords' ? 'tags' : selection.selectionMode)
    setSelectedTags(selection.selectedKeywords ?? selection.selectedTags ?? [])
    setLibraryId(selection.dataSource === 'library' ? selection.libraryId : undefined)
    setSelectedEntryIds(selection.dataSource === 'library' && selection.selectionMode === 'selected' ? selection.selectedEntryIds : undefined)
    setTextDates(selection.textDates)
    if (selection.corpusId !== corpusId) {
      setSelectedEmbedding(null)
      setAnalysisResult(null)
      // Reset dynamic topic config when corpus changes
      setDynamicTopicConfig({
        enabled: false,
        date_format: 'year_only',
        nr_bins: null,
        evolution_tuning: true,
        global_tuning: true
      })
    }
  }

  // Handle analysis complete
  const handleAnalysisComplete = (result: TopicAnalysisResult) => {
    setAnalysisResult(result)
    setIsLoading(false)
    // Switch to results tab
    setRightTab(0)
  }

  // Handle topics update (from Ollama naming)
  const handleTopicsUpdate = (topics: TopicItem[]) => {
    if (analysisResult) {
      setAnalysisResult({
        ...analysisResult,
        topics
      })
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top-level Tabs: BERTopic / LDA / LSA */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs 
          value={mainTab} 
          onChange={(_, v) => setMainTab(v)}
          action={tabsActionRef}
          sx={{ minHeight: 48 }}
        >
          <Tab 
            label={t('topicModeling.tabs.bertopic', 'BERTopic')} 
            sx={{ minHeight: 48 }}
          />
          <Tab 
            label={t('topicModeling.tabs.lda', 'LDA')} 
            sx={{ minHeight: 48 }}
          />
          <Tab 
            label={t('topicModeling.tabs.lsa', 'LSA')} 
            sx={{ minHeight: 48 }}
          />
          <Tab 
            label={t('topicModeling.tabs.nmf', 'NMF')} 
            sx={{ minHeight: 48 }}
          />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* BERTopic Tab - use display instead of conditional rendering to preserve state */}
        <Box sx={{ display: mainTab === 0 ? 'flex' : 'none', height: '100%' }}>
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
                  {t('topicModeling.bertopic.title', 'BERTopic')}
                </Typography>
                <AnalysisAIAssistant
                  enabled={ollamaConnected || openaiApiEnabled}
                  moduleLabel={t('topicModeling.bertopic.title', 'BERTopic')}
                  getContext={() => {
                    const hint = t('aiAssistant.topicModelingBertopicContextHint')
                    const corpusInfo = corpusId ? `CorpusId: ${corpusId}, ${textIds.length} texts, language: ${corpusLanguage}` : 'Corpus: (none)'
                    const params = `preprocess: remove_stopwords=${preprocessConfig.remove_stopwords}, lemmatize=${preprocessConfig.lemmatize}, chunking=${chunkingConfig.strategy}`
                    if (!analysisResult?.topics?.length) return `${hint}\n\n${corpusInfo}\n${params}\n${t('aiAssistant.noAnalysisResult')}`
                    const toWords = (kw: any) => (typeof kw === 'string' ? kw : (kw?.word ?? '')).trim()
                    const topicSummary = (analysisResult.topics || []).slice(0, 15).map((topic: TopicItem & { topic_id?: number; keywords?: any[] }, i: number) => {
                      const arr = topic.words ?? topic.keywords ?? []
                      const kws = arr.slice(0, 5).map(toWords).filter(Boolean)
                      return `${i + 1}. ${topic.custom_label ?? topic.name ?? topic.topic_id ?? topic.id}: ${kws.join(', ')}`
                    }).join('\n')
                    let view = rightTab === 0 ? `Topics (${analysisResult.topics?.length ?? 0}):\n${topicSummary}` : `Visualization (${analysisResult.topics?.length ?? 0} topics). Topic list:\n${topicSummary}`
                    if (rightTab === 1 && analysisResult.has_dynamic_topics && analysisResult.topics_over_time?.length) {
                      const byTs = (analysisResult.topics_over_time as { timestamp: string; topic_name: string; words: string; frequency: number; topic?: number }[]).reduce<Record<string, string[]>>((acc, item) => {
                        const ts = item.timestamp ?? ''
                        if (!acc[ts]) acc[ts] = []
                        acc[ts].push(`${item.topic_name} (${(item.words ?? '').slice(0, 80)}) freq=${item.frequency ?? 0}`)
                        return acc
                      }, {})
                      const dynamicLines = Object.entries(byTs).map(([ts, lines]) => `${ts}:\n  ${lines.join('\n  ')}`).join('\n\n')
                      view += `\n\n${t('aiAssistant.topicModelingDynamicTopicsSection')}\n${dynamicLines}`
                    }
                    return `${hint}\n\n${corpusInfo}\n${params}\n${view}`
                  }}
                />
              </Stack>

              {/* Info chip */}
              <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
                <Chip
                  label="BERTopic"
                  size="small" 
                  color="primary" 
                  variant="outlined"
                />
                <Chip 
                  label="SBERT" 
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
                {ollamaConnected && (
                  <Chip 
                    label={t('topicModeling.ollama.connected')} 
                    size="small" 
                    color="success"
                    variant="outlined"
                  />
                )}
              </Stack>

              {/* 1. Corpus Selector */}
              <CorpusOrLibrarySelector
                sectionTitle={t('topicModeling.corpus.title')}
                onSelectionChange={handleCorpusSelectionChange}
                externalSelection={externalSelection}
              />
              
              <Divider sx={{ my: 2 }} />
              
              {/* 2. Preprocess Panel */}
              <PreprocessPanel
                corpusId={corpusId}
                textIds={textIds}
                config={preprocessConfig}
                onConfigChange={setPreprocessConfig}
                chunkingConfig={chunkingConfig}
                onChunkingConfigChange={setChunkingConfig}
                corpusLanguage={corpusLanguage}
              />

              {/* 3. Embedding Panel */}
              <EmbeddingPanel
                corpusId={corpusId}
                textIds={textIds}
                preprocessConfig={preprocessConfig}
                chunkingConfig={chunkingConfig}
                selectedEmbedding={selectedEmbedding}
                onEmbeddingSelect={setSelectedEmbedding}
                corpusLanguage={corpusLanguage}
              />

              {/* 4. Dynamic Topic Panel */}
              <DynamicTopicPanel
                config={dynamicTopicConfig}
                onConfigChange={setDynamicTopicConfig}
                texts={texts}
                textDates={textDates}
                libraryId={libraryId}
                textCount={textIds.length}
                disabled={!selectedEmbedding}
              />

              {/* 5. Analysis Panel */}
              <AnalysisPanel
                embeddingId={selectedEmbedding}
                onAnalysisComplete={handleAnalysisComplete}
                dynamicTopicConfig={dynamicTopicConfig}
                corpusId={corpusId}
                textIds={textIds}
                corpusLanguage={corpusLanguage}
                resultId={analysisResult?.result_id}
                outlierCount={analysisResult?.stats?.outlier_count ?? 0}
                libraryId={libraryId}
              />
            </Box>

            {/* Right panel - Results & Visualization */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {isLoading && <LinearProgress />}

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
                  <ResultsPanel
                    result={analysisResult}
                    ollamaConnected={ollamaConnected}
                    ollamaUrl={ollamaUrl}
                    ollamaModel={ollamaModel || ''}
                    ollamaLanguage={corpusLanguage === 'chinese' ? 'zh' : 'en'}
                    openaiApiEnabled={openaiApiEnabled}
                    openaiApiBaseUrl={openaiApiBaseUrl ?? ''}
                    openaiApiKey={openaiApiKey ?? ''}
                    openaiApiModel={openaiApiModel ?? ''}
                    onTopicsUpdate={handleTopicsUpdate}
                    corpusId={corpusId}
                    textIds={selectionMode === 'all' ? 'all' : textIds}
                    selectionMode={selectionMode}
                    selectedTags={selectedTags}
                    libraryId={libraryId}
                    selectedEntryIds={libraryId && selectionMode === 'selected' ? selectedEntryIds : undefined}
                  />
                )}
                
                {rightTab === 1 && (
                  <VisualizationPanel
                    resultId={analysisResult?.result_id || null}
                    hasDynamicTopics={analysisResult?.has_dynamic_topics || false}
                  />
                )}
              </Box>
            </Box>
          </Box>

        {/* LDA Tab - use display instead of conditional rendering to preserve state */}
        <Box sx={{ display: mainTab === 1 ? 'block' : 'none', height: '100%' }}>
          <LDATab crossLinkParams={crossLinkParams} />
        </Box>

        {/* LSA Tab - use display instead of conditional rendering to preserve state */}
        <Box sx={{ display: mainTab === 2 ? 'block' : 'none', height: '100%' }}>
          <LSATab crossLinkParams={crossLinkParams} />
        </Box>

        {/* NMF Tab - use display instead of conditional rendering to preserve state */}
        <Box sx={{ display: mainTab === 3 ? 'block' : 'none', height: '100%' }}>
          <NMFTab crossLinkParams={crossLinkParams} />
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Topic Modeling Page
 * BERTopic-based topic modeling with SBERT embeddings
 * LDA topic modeling with Gensim
 * LSA/NMF topic modeling with sklearn
 */

import { useState, useEffect, useRef } from 'react'
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

import TopicCorpusSelector from './TopicCorpusSelector'
import PreprocessPanel from './PreprocessPanel'
import EmbeddingPanel from './EmbeddingPanel'
import AnalysisPanel from './AnalysisPanel'
import ResultsPanel from './ResultsPanel'
import VisualizationPanel from './VisualizationPanel'
import DynamicTopicPanel from './DynamicTopicPanel'
import LDATab from './LDA'
import LSATab from './LSA'
import NMFTab from './NMF'

export default function TopicModeling() {
  const { t } = useTranslation()
  const { ollamaConnected, ollamaUrl, ollamaModel } = useSettingsStore()
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
  
  // Corpus selection
  const [corpusId, setCorpusId] = useState<string>('')
  const [textIds, setTextIds] = useState<string[]>([])
  const [texts, setTexts] = useState<CorpusText[]>([])
  const [corpusLanguage, setCorpusLanguage] = useState<string>('english')
  
  // Preprocess config
  // Note: stopwords and punctuation are handled by vectorizer, not during embedding
  const [preprocessConfig, setPreprocessConfig] = useState<PreprocessConfig>({
    remove_stopwords: false,
    remove_punctuation: false,
    lemmatize: false,
    lowercase: false,  // Keep original case for embedding
    min_token_length: 1,
    pos_filter: []
  })
  
  // Chunking config
  const [chunkingConfig, setChunkingConfig] = useState<ChunkingConfig>(DEFAULT_CHUNKING_CONFIG)
  
  // Dynamic topic config
  const [dynamicTopicConfig, setDynamicTopicConfig] = useState<DynamicTopicConfig>({
    enabled: false,
    date_format: 'year_only',
    nr_bins: null,
    evolution_tuning: true,
    global_tuning: true
  })
  
  // Embedding selection
  const [selectedEmbedding, setSelectedEmbedding] = useState<string | null>(null)
  
  // Analysis result
  const [analysisResult, setAnalysisResult] = useState<TopicAnalysisResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Right panel tabs
  const [rightTab, setRightTab] = useState(0)

  // Handle corpus selection change
  const handleCorpusSelectionChange = (
    newCorpusId: string, 
    newTextIds: string[], 
    language: string,
    allTexts: CorpusText[]
  ) => {
    setCorpusId(newCorpusId)
    setTextIds(newTextIds)
    setTexts(allTexts)  // Store all texts for dynamic topic date counting
    setCorpusLanguage(language)
    // Reset downstream selections when corpus changes
    if (newCorpusId !== corpusId) {
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
              <Typography variant="h6" gutterBottom>
                {t('topicModeling.bertopic.title', 'BERTopic')}
              </Typography>
              
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
              <TopicCorpusSelector 
                onSelectionChange={handleCorpusSelectionChange}
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
                    onTopicsUpdate={handleTopicsUpdate}
                    corpusId={corpusId}
                    textIds={textIds.length > 0 ? textIds : 'all'}
                    selectionMode={textIds.length > 0 ? 'selected' : 'all'}
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
          <LDATab />
        </Box>

        {/* LSA Tab - use display instead of conditional rendering to preserve state */}
        <Box sx={{ display: mainTab === 2 ? 'block' : 'none', height: '100%' }}>
          <LSATab />
        </Box>

        {/* NMF Tab - use display instead of conditional rendering to preserve state */}
        <Box sx={{ display: mainTab === 3 ? 'block' : 'none', height: '100%' }}>
          <NMFTab />
        </Box>
      </Box>
    </Box>
  )
}

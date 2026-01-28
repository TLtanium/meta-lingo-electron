/**
 * LDA Tab Main Component
 * LDA topic modeling using Gensim engine
 * Supports dynamic topic analysis for temporal evolution
 */

import { useState, useEffect } from 'react'
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

import TopicCorpusSelector from '../TopicCorpusSelector'
import LDAPreprocessPanel from './LDAPreprocessPanel'
import LDAParameterPanel from './LDAParameterPanel'
import LDADynamicPanel, { getTextDatesMapping } from './LDADynamicPanel'
import LDAResultsPanel from './LDAResultsPanel'
import LDAVisualizationPanel from './LDAVisualizationPanel'

export default function LDATab() {
  const { t } = useTranslation()
  const { 
    ollamaConnected, 
    ollamaUrl, 
    ollamaModel, 
    ollamaLanguage,
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
  
  // Corpus selection
  const [corpusId, setCorpusId] = useState<string>('')
  const [textIds, setTextIds] = useState<string[]>([])
  const [texts, setTexts] = useState<CorpusText[]>([])
  const [corpusLanguage, setCorpusLanguage] = useState<string>('english')
  
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
  
  // Handle corpus selection change
  const handleCorpusSelectionChange = (
    newCorpusId: string,
    newTextIds: string[],
    language: string,
    allTexts: CorpusText[]
  ) => {
    setCorpusId(newCorpusId)
    setTextIds(newTextIds)
    setTexts(allTexts)
    setCorpusLanguage(language)
    
    // Reset result when corpus changes
    if (newCorpusId !== corpusId) {
      setAnalysisResult(null)
      setOptimizeResult(null)
    }
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
        <Typography variant="h6" gutterBottom>
          {t('topicModeling.lda.title', 'LDA')}
        </Typography>
        
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
        
        {/* 1. Corpus Selector */}
        <TopicCorpusSelector
          onSelectionChange={handleCorpusSelectionChange}
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
          textDates={getTextDatesMapping(texts)}
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
              textIds={textIds}
              selectionMode="selected"
              selectedTags={[]}
              ollamaConnected={ollamaConnected}
              ollamaUrl={ollamaUrl}
              ollamaModel={ollamaModel}
              ollamaLanguage={ollamaLanguage}
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

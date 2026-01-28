/**
 * NMF Tab Main Component
 * NMF (Non-negative Matrix Factorization) topic modeling with sklearn
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
  NMFPreprocessConfig,
  NMFConfig,
  NMFResult,
  NMFOptimizeResult,
  NMFTopic
} from '../../../types/topicModeling'
import {
  DEFAULT_NMF_PREPROCESS_CONFIG,
  DEFAULT_NMF_CONFIG
} from '../../../types/topicModeling'

import TopicCorpusSelector from '../TopicCorpusSelector'
import NMFPreprocessPanel from './NMFPreprocessPanel'
import NMFParameterPanel from './NMFParameterPanel'
import NMFResultsPanel from './NMFResultsPanel'
import NMFVisualizationPanel from './NMFVisualizationPanel'

export default function NMFTab() {
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
  const [preprocessConfig, setPreprocessConfig] = useState<NMFPreprocessConfig>(
    DEFAULT_NMF_PREPROCESS_CONFIG
  )
  
  // NMF config
  const [nmfConfig, setNmfConfig] = useState<NMFConfig>(DEFAULT_NMF_CONFIG)
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<NMFResult | null>(null)
  const [optimizeResult, setOptimizeResult] = useState<NMFOptimizeResult | null>(null)
  
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
  const handleAnalysisComplete = (result: NMFResult) => {
    setAnalysisResult(result)
    setIsAnalyzing(false)
    setRightTab(0) // Switch to results tab
  }
  
  // Handle optimize complete
  const handleOptimizeComplete = (result: NMFOptimizeResult) => {
    setOptimizeResult(result)
    setIsAnalyzing(false)
  }
  
  // Handle analysis start
  const handleAnalysisStart = () => {
    setIsAnalyzing(true)
  }
  
  // Get init method display name
  const getInitDisplayName = (init: string) => {
    const names: Record<string, string> = {
      'nndsvd': 'NNDSVD',
      'nndsvda': 'NNDSVDa',
      'nndsvdar': 'NNDSVDar',
      'random': 'Random'
    }
    return names[init] || init
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
          {t('topicModeling.nmf.title', 'NMF')}
        </Typography>
        
        {/* Info chips */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
          <Chip
            label="NMF"
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label={`${getInitDisplayName(nmfConfig.init)} / ${nmfConfig.solver.toUpperCase()}`}
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
        <NMFPreprocessPanel
          corpusId={corpusId}
          textIds={textIds}
          language={corpusLanguage}
          config={preprocessConfig}
          onConfigChange={setPreprocessConfig}
        />
        
        <Divider sx={{ my: 2 }} />
        
        {/* 3. NMF Parameter Panel */}
        <NMFParameterPanel
          corpusId={corpusId}
          textIds={textIds}
          language={corpusLanguage}
          preprocessConfig={preprocessConfig}
          config={nmfConfig}
          onConfigChange={setNmfConfig}
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
            <NMFResultsPanel 
              result={analysisResult}
              corpusId={corpusId}
              textIds={textIds}
              selectionMode="selected"
              selectedTags={[]}
              ollamaConnected={ollamaConnected}
              ollamaUrl={ollamaUrl}
              ollamaModel={ollamaModel}
              ollamaLanguage={ollamaLanguage}
              onTopicsUpdate={(updatedTopics: NMFTopic[]) => {
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
            <NMFVisualizationPanel result={analysisResult} />
          )}
        </Box>
      </Box>
    </Box>
  )
}

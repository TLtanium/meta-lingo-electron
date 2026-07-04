/**
 * Multidimensional Analysis (Biber 1988 / MAT)
 * Computes dimension scores from stored SpaCy annotations and visualizes
 * the corpus position relative to Biber's genres and text types.
 */

import { useMemo, useState } from 'react'
import {
  Box,
  Typography,
  LinearProgress,
  Tabs,
  Tab,
  Stack,
  Chip,
  Button,
  Alert
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ViewInArIcon from '@mui/icons-material/ViewInAr'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../../stores/settingsStore'
import { analysisApi } from '../../../api'
import type { CrossLinkParams } from '../../../types/crossLink'
import type {
  MDAResponse,
  MDAVisualizationConfig
} from '../../../types/mdaAnalysis'
import { DEFAULT_MDA_VIZ_CONFIG } from '../../../types/mdaAnalysis'
import CorpusOrLibrarySelector, { type CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import AnalysisAIAssistant from '../../../components/AnalysisAIAssistant'
import ResultsPanel from './ResultsPanel'
import VisualizationPanel from './VisualizationPanel'
import ParamsPanel from './ParamsPanel'
import { buildMdaAIContext } from './buildMdaAIContext'

interface MultidimensionalAnalysisProps {
  crossLinkParams?: CrossLinkParams
}

export default function MultidimensionalAnalysis({ crossLinkParams }: MultidimensionalAnalysisProps = {}) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language === 'zh'
  const { ollamaConnected, openaiApiEnabled } = useSettingsStore()

  const [corpusSelection, setCorpusSelection] = useState<CorpusOrLibrarySelection | null>(null)

  // Analysis parameters
  const [ttrTokens, setTtrTokens] = useState(400)
  const [zCorrection, setZCorrection] = useState(false)
  const [excludedFeatures, setExcludedFeatures] = useState<string[]>([])

  // Results
  const [result, setResult] = useState<MDAResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Right panel
  const [rightTab, setRightTab] = useState(0)
  const [vizConfig, setVizConfig] = useState<MDAVisualizationConfig>(DEFAULT_MDA_VIZ_CONFIG)

  // Sync selection from cross-link
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

  const handleAnalyze = async () => {
    if (!corpusSelection) return
    setIsLoading(true)
    setError(null)
    try {
      const response = await analysisApi.mdaAnalysis({
        corpus_id: corpusSelection.corpusId,
        text_ids: corpusSelection.textIds,
        ttr_tokens: ttrTokens,
        z_correction: zCorrection,
        excluded_features: excludedFeatures
      })
      if (response.success && response.data) {
        if (response.data.success) {
          setResult(response.data)
        } else {
          setError(response.data.error || t('common.error'))
        }
      } else {
        setError(response.error || t('common.error'))
      }
    } catch (err: any) {
      console.error('MDA analysis error:', err)
      setError(err.message || t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  const isNonEnglishSelection = corpusSelection !== null &&
    corpusSelection.language !== 'english' && corpusSelection.language !== 'en'
  const canAnalyze = corpusSelection !== null && !isLoading && !isNonEnglishSelection
  // Cross-module linking for contributing words now goes through WordActionMenu
  // inside FeaturesTable (full option set, same as Synonym Analysis).

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      {/* Left panel - Configuration (width aligned with Metaphor/Semantic Domain) */}
      <Box sx={{
        width: 400,
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">{t('mda.title')}</Typography>
          <AnalysisAIAssistant
            enabled={ollamaConnected || openaiApiEnabled}
            moduleLabel={t('mda.title')}
            getContext={() => buildMdaAIContext({ t, isZh, corpusSelection, ttrTokens, zCorrection, excludedFeatures, result, rightTab, vizConfig })}
          />
        </Stack>

        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip label="Biber 1988" size="small" color="primary" variant="outlined" />
          <Chip label="MAT" size="small" color="secondary" variant="outlined" />
          <Chip label={isZh ? '仅英语' : 'English Only'} size="small" color="warning" variant="outlined" />
        </Stack>

        {/* 1. Corpus / Library selection */}
        <CorpusOrLibrarySelector
          sectionTitle={t('wordFrequency.corpus.title')}
          onSelectionChange={setCorpusSelection}
          externalSelection={externalSelection}
        />

        {isNonEnglishSelection && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('mda.englishOnly')}
          </Alert>
        )}

        {/* 2. Parameters (styled like SearchConfigPanel) */}
        <Box sx={{ mb: 2 }}>
          <ParamsPanel
            ttrTokens={ttrTokens}
            zCorrection={zCorrection}
            excludedFeatures={excludedFeatures}
            onTtrTokensChange={setTtrTokens}
            onZCorrectionChange={setZCorrection}
            onExcludedFeaturesChange={setExcludedFeatures}
            disabled={!corpusSelection}
          />
        </Box>

        {/* 3. Analyze button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          fullWidth
        >
          {isLoading ? t('common.loading') : t('mda.startAnalysis')}
        </Button>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {result?.skipped_texts && result.skipped_texts.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('mda.skippedTexts', { count: result.skipped_texts.length })}
          </Alert>
        )}
      </Box>

      {/* Right panel (70%) - Results & Visualization */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isLoading && <LinearProgress />}

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)}>
            <Tab label={t('mda.tabs.results')} />
            <Tab label={t('mda.tabs.visualization')} />
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: rightTab === 0 ? 'flex' : 'none', flexDirection: 'column' }}>
            {result?.success ? (
              <ResultsPanel result={result} corpusSelection={corpusSelection} />
            ) : (
              <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2, p: 4 }}>
                <ViewInArIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">{t('mda.title')}</Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 420 }}>
                  {t('mda.emptyHint')}
                </Typography>
              </Box>
            )}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: rightTab === 1 ? 'flex' : 'none', flexDirection: 'column' }}>
            <VisualizationPanel
              result={result}
              config={vizConfig}
              onConfigChange={setVizConfig}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

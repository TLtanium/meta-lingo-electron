/**
 * Sentiment visualization panel — layout aligned with Word Frequency VisualizationPanel
 * Top: chart type Tabs (饼图/雷达图 + 词云图). Then: param bar. Then: chart area; no data = icon + 暂无数据 / 请先执行分析
 * Word cloud: dual engine (D3 default / legacy with mask support).
 */

import { useState, useRef, useCallback, useMemo } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Stack,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  FormControlLabel,
  Switch,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material'
import PieChartIcon from '@mui/icons-material/PieChart'
import RadarIcon from '@mui/icons-material/Radar'
import CloudIcon from '@mui/icons-material/Cloud'
import InsertChartIcon from '@mui/icons-material/InsertChart'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ImageIcon from '@mui/icons-material/Image'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../components/common'
import type {
  SentimentResultRow,
  SentimentEmotionFilterPolarity,
  SentimentEmotionFilterDimension
} from '../../types/sentiment'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type { WordCloudConfig, WordCloudColormap, WordCloudEngine, WordCloudStyle } from '../../types/wordFrequency'
import { DEFAULT_WORDCLOUD_CONFIG, DEFAULT_LEGACY_WORDCLOUD_CONFIG } from '../../types/wordFrequency'
import SentimentPieChart from './SentimentPieChart'
import SentimentRadarChart from './SentimentRadarChart'
import WordCloud from '../WordFrequency/components/WordCloud'
import LegacyWordCloud from '../WordFrequency/components/LegacyWordCloud'
import LegacyWordCloudConfig from '../WordFrequency/components/LegacyWordCloudConfig'

const POLARITY_KEYS = ['positive', 'negative', 'neutral']
const DIMENSION_KEYS = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'trust', 'others']
const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' }
]

type VizTab = 'chart' | 'wordcloud'

interface SentimentVisualizationPanelProps {
  results: SentimentResultRow[]
  summary: Record<string, number>
  analysisMode: 'polarity' | 'dimension'
  corpusSelection: CorpusOrLibrarySelection | null
  emotionFilterPolarity: SentimentEmotionFilterPolarity
  emotionFilterDimension: SentimentEmotionFilterDimension
  searchTarget?: string
  /** Optional controlled viz tab for AI context */
  activeTab?: VizTab
  onActiveTabChange?: (tab: VizTab) => void
}

export default function SentimentVisualizationPanel({
  results,
  summary,
  analysisMode,
  corpusSelection,
  emotionFilterPolarity,
  emotionFilterDimension,
  searchTarget = 'word',
  activeTab: controlledActiveTab,
  onActiveTabChange
}: SentimentVisualizationPanelProps) {
  const { t } = useTranslation()
  const [internalActiveTab, setInternalActiveTab] = useState<VizTab>('chart')
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab
  const setActiveTab = (v: VizTab) => {
    if (onActiveTabChange) onActiveTabChange(v)
    else setInternalActiveTab(v)
  }
  const [colorScheme, setColorScheme] = useState<'blue' | 'green' | 'purple' | 'orange' | 'red'>('blue')
  const [showPercentage, setShowPercentage] = useState(true)
  const [wordCloudEngine, setWordCloudEngine] = useState<WordCloudEngine>('d3')
  const [wordCloudConfig, setWordCloudConfig] = useState<WordCloudConfig>({ ...DEFAULT_WORDCLOUD_CONFIG })
  const [legacyWordCloudConfig, setLegacyWordCloudConfig] = useState<WordCloudConfig>({ ...DEFAULT_LEGACY_WORDCLOUD_CONFIG })
  const chartContainerRef = useRef<HTMLDivElement>(null)

  const getCurrentWordCloudConfig = (): WordCloudConfig =>
    wordCloudEngine === 'd3' ? wordCloudConfig : legacyWordCloudConfig

  const setCurrentWordCloudConfig = (next: WordCloudConfig) => {
    if (wordCloudEngine === 'd3') setWordCloudConfig(next)
    else setLegacyWordCloudConfig(next)
  }

  const emotionFilter = analysisMode === 'polarity' ? emotionFilterPolarity : emotionFilterDimension
  const chartKeys =
    analysisMode === 'polarity'
      ? (POLARITY_KEYS as (keyof SentimentEmotionFilterPolarity)[]).filter((k) => emotionFilter[k])
      : (DIMENSION_KEYS as (keyof SentimentEmotionFilterDimension)[]).filter((k) => emotionFilter[k])
  const chartKeysToUse = chartKeys.length > 0 ? chartKeys : (analysisMode === 'polarity' ? POLARITY_KEYS : DIMENSION_KEYS)
  const chartData =
    analysisMode === 'polarity'
      ? chartKeysToUse.map((k) => ({
          key: k,
          label: t(`sentiment.polarity.${k}`),
          value: summary[k] ?? 0
        }))
      : chartKeysToUse.map((k) => ({
          key: k,
          label: t(`sentiment.dimension.${k}`),
          value: summary[k] ?? 0
        }))

  const isUsasMode = searchTarget === 'usas'

  const wordCloudData = useMemo(() => {
    const keys =
      analysisMode === 'polarity'
        ? (POLARITY_KEYS as (keyof SentimentEmotionFilterPolarity)[]).filter((k) => emotionFilterPolarity[k])
        : (DIMENSION_KEYS as (keyof SentimentEmotionFilterDimension)[]).filter((k) => emotionFilterDimension[k])
    const keysToUse = keys.length > 0 ? keys : (analysisMode === 'polarity' ? POLARITY_KEYS : DIMENSION_KEYS)
    return results
      .map((r) => ({
        // In USAS mode use domain name as cloud text; fall back to code when name unavailable
        text: isUsasMode ? (r.domain_name || r.word) : r.word,
        value: keysToUse.reduce((sum, k) => sum + (Number(r[k]) || 0), 0)
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 500)
  }, [results, analysisMode, emotionFilterPolarity, emotionFilterDimension, isUsasMode])
  const hasData = results.length > 0

  const wordCloudWfData = useMemo(() => {
    const wcConfig = getCurrentWordCloudConfig()
    const useAllWords = wcConfig.useAllWords ?? false
    const maxWordsToUse = useAllWords ? wordCloudData.length : Math.min(wcConfig.maxWords ?? 100, wordCloudData.length)
    const limited = wordCloudData.slice(0, maxWordsToUse)
    return limited.map((d, i) => ({
      word: d.text,
      frequency: d.value,
      percentage: 0,
      rank: i + 1
    }))
  }, [wordCloudData, wordCloudEngine, wordCloudConfig, legacyWordCloudConfig])

  const isLegacyWordCloud = activeTab === 'wordcloud' && wordCloudEngine === 'legacy'

  const handleExportSVG = useCallback(() => {
    const container = chartContainerRef.current
    if (!container || !hasData || isLegacyWordCloud) return
    const svg = container.querySelector('svg')
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sentiment-${activeTab}-${analysisMode}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }, [activeTab, analysisMode, hasData, isLegacyWordCloud])

  const handleExportPNG = useCallback(async () => {
    const container = chartContainerRef.current
    if (!container || !hasData) return
    if (isLegacyWordCloud) {
      const img = container.querySelector('img')
      if (img?.src) {
        const link = document.createElement('a')
        link.href = img.src
        link.download = `sentiment-wordcloud-${analysisMode}-${Date.now()}.png`
        link.click()
      }
      return
    }
    const svg = container.querySelector('svg')
    if (!svg) return
    try {
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svg)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = 2
        canvas.width = svg.clientWidth * scale
        canvas.height = svg.clientHeight * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(svgUrl)
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(svgUrl)
        canvas.toBlob((blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `sentiment-${activeTab}-${analysisMode}.png`
          link.click()
          URL.revokeObjectURL(url)
        }, 'image/png', 1.0)
      }
      img.onerror = () => URL.revokeObjectURL(svgUrl)
      img.src = svgUrl
    } catch (e) {
      console.error('Export PNG failed', e)
    }
  }, [activeTab, analysisMode, hasData, isLegacyWordCloud])

  const renderChart = () => {
    if (!hasData) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'text.secondary',
            flexDirection: 'column',
            gap: 2,
            p: 4
          }}
        >
          <InsertChartIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            {t('wordFrequency.viz.noData')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('wordFrequency.viz.runAnalysisFirst')}
          </Typography>
        </Box>
      )
    }

    if (activeTab === 'wordcloud') {
      const wcConfig = getCurrentWordCloudConfig()
      if (wordCloudEngine === 'legacy') {
        return (
          <Box sx={{ height: '100%', display: 'flex' }}>
            <LegacyWordCloud
              data={wordCloudWfData}
              config={{
                maxWords: wcConfig.maxWords ?? 100,
                useAllWords: wcConfig.useAllWords ?? false,
                style: (wcConfig.style as string) || 'default',
                colormap: wcConfig.colormap,
                maskImage: wcConfig.maskImage
              }}
            />
          </Box>
        )
      }
      return (
        <Box sx={{ height: '100%', display: 'flex' }}>
          <WordCloud
            data={wordCloudWfData}
            config={{
              ...wcConfig,
              maxWords: wcConfig.maxWords ?? 100,
              engine: 'd3'
            }}
          />
        </Box>
      )
    }

    if (analysisMode === 'polarity') {
      return (
        <Box sx={{ height: '100%', display: 'flex' }}>
          <SentimentPieChart
            data={chartData as any}
            colorScheme={colorScheme}
            showPercentage={showPercentage}
          />
        </Box>
      )
    }
    return (
      <Box sx={{ height: '100%', display: 'flex' }}>
        <SentimentRadarChart data={chartData} colorScheme={colorScheme as import('./SentimentRadarChart').RadarColorScheme} />
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Chart type tabs — same style as Word Frequency */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(_, v: VizTab) => setActiveTab(v)} variant="fullWidth">
          <Tab
            value="chart"
            icon={analysisMode === 'polarity' ? <PieChartIcon /> : <RadarIcon />}
            label={analysisMode === 'polarity' ? t('sentiment.viz.pie') : t('sentiment.viz.radar')}
            iconPosition="start"
          />
          <Tab value="wordcloud" icon={<CloudIcon />} label={t('sentiment.viz.wordcloud')} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Top parameter bar — always visible, same style as Word Frequency */}
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
          {activeTab === 'wordcloud' && (
            <>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>{t('wordFrequency.viz.wordCloudConfig.engine')}</InputLabel>
                <Select
                  value={wordCloudEngine}
                  label={t('wordFrequency.viz.wordCloudConfig.engine')}
                  onChange={(e) => setWordCloudEngine(e.target.value as WordCloudEngine)}
                >
                  <MenuItem value="d3">{t('wordFrequency.viz.wordCloudConfig.engine.d3')}</MenuItem>
                  <MenuItem value="legacy">{t('wordFrequency.viz.wordCloudConfig.engine.legacy')}</MenuItem>
                </Select>
              </FormControl>
              {wordCloudEngine === 'legacy' && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={getCurrentWordCloudConfig().useAllWords ?? false}
                      onChange={(e) =>
                        setCurrentWordCloudConfig({
                          ...getCurrentWordCloudConfig(),
                          useAllWords: e.target.checked
                        })
                      }
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {t('wordFrequency.viz.wordCloudConfig.useAllWords')}
                    </Typography>
                  }
                />
              )}
              {!(wordCloudEngine === 'legacy' && (getCurrentWordCloudConfig().useAllWords ?? false)) && (
                <NumberInput
                  label={t('wordFrequency.viz.maxWords')}
                  size="small"
                  value={getCurrentWordCloudConfig().maxWords ?? 100}
                  onChange={(value) =>
                    setCurrentWordCloudConfig({ ...getCurrentWordCloudConfig(), maxWords: value })
                  }
                  min={5}
                  max={500}
                  step={10}
                  integer
                  defaultValue={100}
                  sx={{ width: 140 }}
                />
              )}
              {wordCloudEngine === 'legacy' && (
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>{t('wordFrequency.viz.wordCloudConfig.style')}</InputLabel>
                  <Select
                    value={getCurrentWordCloudConfig().style ?? 'default'}
                    label={t('wordFrequency.viz.wordCloudConfig.style')}
                    onChange={(e) => {
                      const newStyle = e.target.value as WordCloudStyle
                      const cur = getCurrentWordCloudConfig()
                      setCurrentWordCloudConfig({
                        ...cur,
                        style: newStyle,
                        ...(newStyle === 'default' && { maskImage: null, maskImageFile: null })
                      })
                    }}
                  >
                    <MenuItem value="default">{t('wordFrequency.viz.wordCloudConfig.style.default')}</MenuItem>
                    <MenuItem value="mask">{t('wordFrequency.viz.wordCloudConfig.style.mask')}</MenuItem>
                    <MenuItem value="imageColor">{t('wordFrequency.viz.wordCloudConfig.style.imageColor')}</MenuItem>
                  </Select>
                </FormControl>
              )}
            </>
          )}
          {(() => {
            const showColorScheme =
              activeTab !== 'wordcloud' ||
              (activeTab === 'wordcloud' &&
                (wordCloudEngine === 'd3' ||
                  (wordCloudEngine === 'legacy' &&
                    (getCurrentWordCloudConfig().style === 'default' ||
                      getCurrentWordCloudConfig().style === 'mask'))))
            if (!showColorScheme) return null
            return (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t('wordFrequency.viz.colorScheme')}</InputLabel>
                <Select
                  value={
                    activeTab === 'wordcloud'
                      ? (getCurrentWordCloudConfig().colormap ?? 'viridis')
                      : colorScheme
                  }
                  label={t('wordFrequency.viz.colorScheme')}
                  onChange={(e) => {
                    if (activeTab === 'wordcloud') {
                      setCurrentWordCloudConfig({
                        ...getCurrentWordCloudConfig(),
                        colormap: e.target.value as WordCloudColormap
                      })
                    } else {
                      setColorScheme(e.target.value as any)
                    }
                  }}
                >
                  {activeTab === 'wordcloud' ? (
                    ['viridis', 'inferno', 'plasma', 'autumn', 'winter', 'rainbow', 'ocean', 'forest', 'sunset'].map(
                      (scheme) => (
                        <MenuItem key={scheme} value={scheme}>
                          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                            {scheme}
                          </Typography>
                        </MenuItem>
                      )
                    )
                  ) : (
                    COLOR_SCHEMES.map((s) => (
                      <MenuItem key={s.value} value={s.value}>
                        {s.label}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            )
          })()}
          {activeTab === 'chart' && analysisMode === 'polarity' && (
            <FormControlLabel
              control={
                <Switch checked={showPercentage} onChange={(e) => setShowPercentage(e.target.checked)} size="small" />
              }
              label={<Typography variant="body2">{t('wordFrequency.viz.showPercentage')}</Typography>}
            />
          )}
        </Stack>

        {hasData && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip
              title={
                isLegacyWordCloud
                  ? t('wordFrequency.viz.wordCloudConfig.svgNotSupported')
                  : t('wordFrequency.viz.export') + ' SVG'
              }
            >
              <span>
                <IconButton
                  size="small"
                  onClick={handleExportSVG}
                  disabled={isLegacyWordCloud}
                >
                  <SaveAltIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('wordFrequency.viz.export') + ' PNG'}>
              <IconButton size="small" onClick={handleExportPNG}>
                <ImageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Paper>

      {activeTab === 'wordcloud' &&
        wordCloudEngine === 'legacy' &&
        (getCurrentWordCloudConfig().style === 'mask' ||
          getCurrentWordCloudConfig().style === 'imageColor') && (
          <Paper
            elevation={0}
            sx={{
              px: 2,
              py: 1,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'background.default'
            }}
          >
            <LegacyWordCloudConfig
              config={getCurrentWordCloudConfig()}
              onChange={setCurrentWordCloudConfig}
            />
          </Paper>
        )}

      {/* Chart container */}
      <Box ref={chartContainerRef} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {renderChart()}
      </Box>
    </Box>
  )
}

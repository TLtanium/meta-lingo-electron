/**
 * Builds the full AI assistant context string for Sentiment Analysis module.
 * Includes: data source, POS filter, search config (word/lemma/usas), analysis mode,
 * emotion filter, frequency params, and current view (results table with visible rows, or visualization).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import type { POSFilterConfig, SearchConfig, SearchType, SearchTarget } from '../../../types/wordFrequency'
import type {
  SentimentResultRow,
  SentimentEmotionFilterPolarity,
  SentimentEmotionFilterDimension,
  SentimentAnalysisMode
} from '../../../types/sentiment'

const SEARCH_TYPE_KEYS: Record<SearchType, string> = {
  all: 'wordFrequency.search.typeAll',
  starts: 'wordFrequency.search.typeStarts',
  ends: 'wordFrequency.search.typeEnds',
  contains: 'wordFrequency.search.typeContains',
  regex: 'wordFrequency.search.typeRegex',
  wordlist: 'wordFrequency.search.typeWordlist'
}

const SEARCH_TARGET_KEYS: Record<SearchTarget, string> = {
  word: 'wordFrequency.search.targetWord',
  lemma: 'wordFrequency.search.targetLemma',
  usas: 'wordFrequency.search.targetUsas'
}

type SortColumn = string  // 'word' | 'total' | 'percentage' | polarity/dimension emotion keys
type SortDirection = 'asc' | 'desc'

const POLARITY_KEYS = ['positive', 'negative', 'neutral']
const DIMENSION_KEYS = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'trust', 'others']

function getVisibleTableRows(
  results: SentimentResultRow[],
  tableFilter: string,
  sortColumn: SortColumn,
  sortDirection: SortDirection,
  page: number,
  rowsPerPage: number,
  isUsasMode: boolean
): SentimentResultRow[] {
  const filter = tableFilter.trim().toLowerCase()
  const filtered = filter
    ? results.filter((r) => {
        if (isUsasMode) {
          return (
            r.word.toLowerCase().includes(filter) ||
            (r.domain_name?.toLowerCase() ?? '').includes(filter)
          )
        }
        return r.word.toLowerCase().includes(filter)
      })
    : results
  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortColumn] as number | string | undefined
    const bVal = b[sortColumn] as number | string | undefined
    const isWordCol = sortColumn === 'word'
    if (isWordCol) {
      const aStr = typeof aVal === 'string' ? aVal : String(aVal ?? '')
      const bStr = typeof bVal === 'string' ? bVal : String(bVal ?? '')
      return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
    }
    const aNum = typeof aVal === 'number' && !Number.isNaN(aVal) ? aVal : Number(aVal) || 0
    const bNum = typeof bVal === 'number' && !Number.isNaN(bVal) ? bVal : Number(bVal) || 0
    return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
  })
  const start = page * rowsPerPage
  return sorted.slice(start, start + rowsPerPage)
}

export interface BuildSentimentAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: POSFilterConfig
  searchConfig: SearchConfig
  minFreq: number
  maxFreq: number | null
  lowercase: boolean
  analysisMode: SentimentAnalysisMode
  emotionFilterPolarity: SentimentEmotionFilterPolarity
  emotionFilterDimension: SentimentEmotionFilterDimension
  results: SentimentResultRow[]
  summary: Record<string, number>
  totalTokens: number
  uniqueWords: number
  rightTab: number
  tableFilter: string
  sortColumn: SortColumn
  sortDirection: SortDirection
  paginationConfig: { page: number; rowsPerPage: number }
  vizTab: 'chart' | 'wordcloud'
}

export function buildSentimentAIContext(params: BuildSentimentAIContextParams): string {
  const {
    t,
    corpusSelection,
    posFilter,
    searchConfig,
    minFreq,
    maxFreq,
    lowercase,
    analysisMode,
    emotionFilterPolarity,
    emotionFilterDimension,
    results,
    summary,
    totalTokens,
    uniqueWords,
    rightTab,
    tableFilter,
    sortColumn,
    sortDirection,
    paginationConfig,
    vizTab
  } = params

  const lines: string[] = []
  const a = (key: string) => lines.push(t(key))
  const aRaw = (s: string) => lines.push(s)
  const isUsasMode = searchConfig.searchTarget === 'usas'

  aRaw(t('aiAssistant.sentiment.contextIntro'))
  lines.push('')

  // --- 一、数据源 ---
  aRaw(`## ${t('aiAssistant.sentiment.sectionCorpus')}`)
  if (!corpusSelection) {
    aRaw(`${t('sentiment.corpus.title')}: (none)`)
  } else {
    const mode =
      corpusSelection.dataSource === 'library'
        ? t('aiAssistant.sentiment.libraryMode')
        : t('aiAssistant.sentiment.corpusMode')
    aRaw(`${t('sentiment.corpus.title')}: ${mode}`)
    const selMode = corpusSelection.selectionMode ?? 'all'
    if (selMode === 'all') {
      aRaw(`  - ${t('aiAssistant.sentiment.selectionAll')}`)
    } else if (selMode === 'tags' || selMode === 'keywords') {
      aRaw(`  - ${t('aiAssistant.sentiment.selectionByTags')}`)
      const tags = corpusSelection.selectedTags ?? corpusSelection.selectedKeywords ?? []
      if (tags.length) {
        aRaw(`  - ${t('aiAssistant.sentiment.tagsLabel')}: ${tags.join(', ')}`)
      }
    } else {
      aRaw(`  - ${t('aiAssistant.sentiment.selectionManual')}`)
      const ids = corpusSelection.selectedEntryIds ?? []
      aRaw(`  - ${t('aiAssistant.sentiment.entryIdsCount')}: ${ids.length}`)
    }
    const textCount =
      corpusSelection.textIds === 'all'
        ? 'all'
        : Array.isArray(corpusSelection.textIds)
          ? String(corpusSelection.textIds.length)
          : '0'
    aRaw(`  - ${t('aiAssistant.sentiment.textsCount')}: ${textCount}`)
    if (corpusSelection.language) {
      aRaw(`  - ${t('aiAssistant.sentiment.languageLabel')}: ${corpusSelection.language}`)
    }
  }
  lines.push('')

  // --- 二、词性过滤 ---
  aRaw(`## ${t('aiAssistant.sentiment.sectionPos')}`)
  if (!posFilter.selectedPOS.length) {
    a(t('aiAssistant.sentiment.posDisabled'))
  } else {
    const modeLabel = posFilter.keepMode
      ? t('aiAssistant.sentiment.posKeep')
      : t('aiAssistant.sentiment.posFilter')
    aRaw(`  - ${modeLabel}`)
    aRaw(`  - ${t('aiAssistant.sentiment.posTagsList')}: ${posFilter.selectedPOS.join(', ')}`)
  }
  lines.push('')

  // --- 三、检索与过滤 ---
  aRaw(`## ${t('aiAssistant.sentiment.sectionSearch')}`)
  aRaw(`  - ${t('aiAssistant.sentiment.searchTargetLabel')}: ${t(SEARCH_TARGET_KEYS[searchConfig.searchTarget])}`)
  aRaw(`  - ${t('aiAssistant.sentiment.searchTypeLabel')}: ${t(SEARCH_TYPE_KEYS[searchConfig.searchType])}`)
  if (searchConfig.searchType !== 'all' && searchConfig.searchValue) {
    const valuePreview =
      searchConfig.searchValue.length > 80
        ? searchConfig.searchValue.slice(0, 80) + '...'
        : searchConfig.searchValue
    aRaw(`  - ${t('aiAssistant.sentiment.searchValueLabel')}: ${valuePreview.replace(/\n/g, ' ')}`)
  }
  if (searchConfig.excludeWords.length) {
    aRaw(`  - ${t('aiAssistant.sentiment.excludeWordsLabel')}: ${searchConfig.excludeWords.join(', ')}`)
  }
  aRaw(`  - ${t('aiAssistant.sentiment.removeStopwordsLabel')}: ${searchConfig.removeStopwords ? 'yes' : 'no'}`)
  lines.push('')

  // --- 四、频率与大小写 ---
  aRaw(`## ${t('aiAssistant.sentiment.sectionParams')}`)
  aRaw(`  - ${t('aiAssistant.sentiment.minFreqLabel')}: ${minFreq}`)
  aRaw(`  - ${t('aiAssistant.sentiment.maxFreqLabel')}: ${maxFreq == null ? t('aiAssistant.sentiment.noLimit') : maxFreq}`)
  aRaw(`  - ${t('aiAssistant.sentiment.lowercaseLabel')}: ${lowercase ? 'yes' : 'no'}`)
  lines.push('')

  // --- 五、分析模式 ---
  aRaw(`## ${t('aiAssistant.sentiment.sectionAnalysisMode')}`)
  aRaw(
    `  - ${analysisMode === 'polarity' ? t('aiAssistant.sentiment.analysisModePolarity') : t('aiAssistant.sentiment.analysisModeDimension')}`
  )
  lines.push('')

  // --- 六、情感筛选 ---
  aRaw(`## ${t('aiAssistant.sentiment.sectionEmotionFilter')}`)
  if (analysisMode === 'polarity') {
    const active = POLARITY_KEYS.filter((k) => emotionFilterPolarity[k as keyof SentimentEmotionFilterPolarity])
    aRaw(`  - ${t('aiAssistant.sentiment.emotionFilterDesc')}: ${active.map((k) => t(`sentiment.polarity.${k}`)).join(', ')}`)
  } else {
    const active = DIMENSION_KEYS.filter((k) => emotionFilterDimension[k as keyof SentimentEmotionFilterDimension])
    aRaw(`  - ${t('aiAssistant.sentiment.emotionFilterDesc')}: ${active.map((k) => t(`sentiment.dimension.${k}`)).join(', ')}`)
  }
  aRaw(`  - ${t('aiAssistant.sentiment.emotionFilterRowDesc')}`)
  lines.push('')

  // --- 七、当前视图 ---
  aRaw(`## ${t('aiAssistant.sentiment.sectionCurrentView')}`)
  aRaw(`  - totalTokens: ${totalTokens}, uniqueWords: ${uniqueWords}`)

  if (results.length === 0) {
    aRaw('')
    a('aiAssistant.noAnalysisResult')
    return lines.join('\n')
  }

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.sentiment.viewResultsTab')}`)
    if (isUsasMode) {
      aRaw(`  - ${t('aiAssistant.sentiment.tableColumnsUsas')}`)
    } else {
      aRaw(
        `  - ${analysisMode === 'polarity' ? t('aiAssistant.sentiment.tableColumnsPolarity') : t('aiAssistant.sentiment.tableColumnsDimension')}`
      )
    }
    const sortColLabel =
      sortColumn === 'word' || sortColumn === 'total' || sortColumn === 'percentage'
        ? t(`sentiment.table.${sortColumn}`)
        : t(`sentiment.${analysisMode === 'polarity' ? 'polarity' : 'dimension'}.${sortColumn}`)
    const sortOrderLabel = sortDirection === 'asc' ? t('aiAssistant.sentiment.sortOrderAsc') : t('aiAssistant.sentiment.sortOrderDesc')
    aRaw(`  - ${t('aiAssistant.sentiment.tableSortDesc')}: ${t('aiAssistant.sentiment.tableSortBy', { column: sortColLabel, order: sortOrderLabel })}`)
    aRaw(`  - ${t('aiAssistant.sentiment.tableOrderFollowsSort')}`)
    const totalFiltered = tableFilter.trim()
      ? results.filter((r) => {
          const f = tableFilter.trim().toLowerCase()
          if (isUsasMode) {
            return r.word.toLowerCase().includes(f) || (r.domain_name?.toLowerCase() ?? '').includes(f)
          }
          return r.word.toLowerCase().includes(f)
        }).length
      : results.length
    aRaw(
      `  - ${t('aiAssistant.sentiment.tablePageDesc')}: page ${paginationConfig.page + 1}, ${paginationConfig.rowsPerPage} per page, total rows ${totalFiltered}`
    )
    if (tableFilter.trim()) {
      aRaw(`  - ${t('aiAssistant.sentiment.tableFilterDesc')}: "${tableFilter.trim()}"`)
    }
  const emotionCols =
    analysisMode === 'polarity'
      ? (POLARITY_KEYS as (keyof SentimentEmotionFilterPolarity)[]).filter(
          (k) => emotionFilterPolarity[k]
        )
      : (DIMENSION_KEYS as (keyof SentimentEmotionFilterDimension)[]).filter(
          (k) => emotionFilterDimension[k]
        )
  const emotionColsToShow = emotionCols.length > 0 ? emotionCols : (analysisMode === 'polarity' ? POLARITY_KEYS : DIMENSION_KEYS)

  aRaw(`  - ${t('aiAssistant.sentiment.tableVisibleRows')}:`)
  const visible = getVisibleTableRows(
    results,
    tableFilter,
    sortColumn,
    sortDirection,
    paginationConfig.page,
    paginationConfig.rowsPerPage,
    isUsasMode
  )
  const headerCols = [
    isUsasMode ? t('sentiment.table.domain') : t('sentiment.table.word'),
    t('sentiment.table.total'),
    t('sentiment.table.percentage'),
    ...emotionColsToShow.map((c) =>
      t(`sentiment.${analysisMode === 'polarity' ? 'polarity' : 'dimension'}.${c}`)
    )
  ]
  aRaw('\t' + headerCols.join('\t'))
  visible.forEach((r) => {
    const rowCells = [
      r.word,
      r.total,
      (r.percentage ?? 0).toFixed(4) + '%',
      ...emotionColsToShow.map((c) => String(r[c] ?? 0))
    ]
    aRaw('\t' + rowCells.join('\t'))
  })
  } else {
    aRaw(`  - ${t('aiAssistant.sentiment.viewVizTab')}`)
    const chartLabel =
      vizTab === 'wordcloud'
        ? t('aiAssistant.sentiment.vizWordcloud')
        : analysisMode === 'polarity'
          ? t('aiAssistant.sentiment.vizPie')
          : t('aiAssistant.sentiment.vizRadar')
    aRaw(`  - ${t('aiAssistant.sentiment.currentChartType')}: ${chartLabel}`)
    aRaw(`  - ${t('aiAssistant.sentiment.interpretAsChartType')}`)
    if (vizTab === 'chart') {
      if (analysisMode === 'polarity') {
        aRaw(`  - ${t('aiAssistant.sentiment.vizPieDesc')}`)
        aRaw(`  - ${t('aiAssistant.sentiment.summaryData')}:`)
        POLARITY_KEYS.forEach((k) => {
          aRaw(`    ${t(`sentiment.polarity.${k}`)}: ${summary[k] ?? 0}`)
        })
      } else {
        aRaw(`  - ${t('aiAssistant.sentiment.vizRadarDesc')}`)
        aRaw(`  - ${t('aiAssistant.sentiment.summaryData')}:`)
        DIMENSION_KEYS.forEach((k) => {
          aRaw(`    ${t(`sentiment.dimension.${k}`)}: ${summary[k] ?? 0}`)
        })
      }
    } else {
      aRaw(`  - ${t('aiAssistant.sentiment.vizWordcloudDesc')}`)
      aRaw(`  - ${t('aiAssistant.sentiment.vizDataPrefix')} (top 30):`)
      const wordCol = isUsasMode ? (r: SentimentResultRow) => r.domain_name || r.word : (r: SentimentResultRow) => r.word
      const emotionKeys = analysisMode === 'polarity' ? POLARITY_KEYS : DIMENSION_KEYS
      results.slice(0, 30).forEach((r, i) => {
        const sum = emotionKeys.reduce((s, k) => s + (Number(r[k]) || 0), 0)
        aRaw(`\t${i + 1}\t${wordCol(r)}\t${sum}`)
      })
    }
  }

  return lines.join('\n')
}

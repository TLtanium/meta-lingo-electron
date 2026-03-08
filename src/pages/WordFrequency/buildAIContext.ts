/**
 * Builds the full AI assistant context string for Word Frequency module.
 * Includes: data source (corpus/library, selection mode, tags/entries),
 * POS filter (mode + tags), search config (target, type, value, exclude, stopwords),
 * frequency params, and current view (results table with visible rows, or visualization with chart description).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import type {
  POSFilterConfig,
  SearchConfig,
  WordFrequencyResult,
  TableSortConfig,
  TablePaginationConfig,
  VisualizationConfig,
  ChartType,
  SearchType,
  SearchTarget
} from '../../../types/wordFrequency'

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

const CHART_TYPE_LABEL_KEYS: Record<ChartType, string> = {
  bar: 'aiAssistant.wordFrequency.chartTypeBar',
  pie: 'aiAssistant.wordFrequency.chartTypePie',
  wordcloud: 'aiAssistant.wordFrequency.chartTypeWordcloud'
}

function getVisibleTableRows(
  results: WordFrequencyResult[],
  tableFilter: string,
  sortConfig: TableSortConfig,
  paginationConfig: TablePaginationConfig
): WordFrequencyResult[] {
  const filter = tableFilter.trim().toLowerCase()
  const filtered = filter
    ? results.filter(r => r.word.toLowerCase().includes(filter))
    : results
  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortConfig.column]
    const bVal = b[sortConfig.column]
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortConfig.direction === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }
    return sortConfig.direction === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })
  const start = paginationConfig.page * paginationConfig.rowsPerPage
  return sorted.slice(start, start + paginationConfig.rowsPerPage)
}

export interface BuildWordFrequencyContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: POSFilterConfig
  searchConfig: SearchConfig
  minFreq: number
  maxFreq: number | null
  lowercase: boolean
  results: WordFrequencyResult[]
  totalTokens: number
  uniqueWords: number
  rightTab: number
  sortConfig: TableSortConfig
  paginationConfig: TablePaginationConfig
  tableFilter: string
  vizConfig: VisualizationConfig
}

export function buildWordFrequencyContext(params: BuildWordFrequencyContextParams): string {
  const {
    t,
    corpusSelection,
    posFilter,
    searchConfig,
    minFreq,
    maxFreq,
    lowercase,
    results,
    totalTokens,
    uniqueWords,
    rightTab,
    sortConfig,
    paginationConfig,
    tableFilter,
    vizConfig
  } = params

  const lines: string[] = []
  const a = (key: string) => lines.push(t(key))
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.wordFrequency.contextIntro'))
  lines.push('')

  // --- 一、数据源 ---
  aRaw(`## ${t('aiAssistant.wordFrequency.sectionCorpus')}`)
  if (!corpusSelection) {
    aRaw(`${t('wordFrequency.corpus.title')}: (none)`)
  } else {
    const mode = corpusSelection.dataSource === 'library'
      ? t('aiAssistant.wordFrequency.libraryMode')
      : t('aiAssistant.wordFrequency.corpusMode')
    aRaw(`${t('wordFrequency.corpus.title')}: ${mode}`)
    const selMode = corpusSelection.selectionMode ?? 'all'
    if (selMode === 'all') {
      aRaw(`  - ${t('aiAssistant.wordFrequency.selectionAll')}`)
    } else if (selMode === 'tags' || selMode === 'keywords') {
      aRaw(`  - ${t('aiAssistant.wordFrequency.selectionByTags')}`)
      const tags = corpusSelection.selectedTags ?? corpusSelection.selectedKeywords ?? []
      if (tags.length) {
        aRaw(`  - ${t('aiAssistant.wordFrequency.tagsLabel')}: ${tags.join(', ')}`)
      }
    } else {
      aRaw(`  - ${t('aiAssistant.wordFrequency.selectionManual')}`)
      const ids = corpusSelection.selectedEntryIds ?? []
      aRaw(`  - ${t('aiAssistant.wordFrequency.entryIdsCount')}: ${ids.length}`)
    }
    const textCount =
      corpusSelection.textIds === 'all'
        ? 'all'
        : Array.isArray(corpusSelection.textIds)
          ? String(corpusSelection.textIds.length)
          : '0'
    aRaw(`  - ${t('aiAssistant.wordFrequency.textsCount')}: ${textCount}`)
    if (corpusSelection.language) {
      aRaw(`  - ${t('aiAssistant.wordFrequency.languageLabel')}: ${corpusSelection.language}`)
    }
  }
  lines.push('')

  // --- 二、词性过滤 ---
  aRaw(`## ${t('aiAssistant.wordFrequency.sectionPos')}`)
  if (!posFilter.selectedPOS.length) {
    a(t('aiAssistant.wordFrequency.posDisabled'))
  } else {
    const modeLabel = posFilter.keepMode
      ? t('aiAssistant.wordFrequency.posKeep')
      : t('aiAssistant.wordFrequency.posFilter')
    aRaw(`  - ${modeLabel}`)
    aRaw(`  - ${t('aiAssistant.wordFrequency.posTagsList')}: ${posFilter.selectedPOS.join(', ')}`)
  }
  lines.push('')

  // --- 三、检索与过滤 ---
  aRaw(`## ${t('aiAssistant.wordFrequency.sectionSearch')}`)
  aRaw(`  - ${t('aiAssistant.wordFrequency.searchTargetLabel')}: ${t(SEARCH_TARGET_KEYS[searchConfig.searchTarget])}`)
  aRaw(`  - ${t('aiAssistant.wordFrequency.searchTypeLabel')}: ${t(SEARCH_TYPE_KEYS[searchConfig.searchType])}`)
  if (searchConfig.searchType !== 'all' && searchConfig.searchValue) {
    const valuePreview =
      searchConfig.searchValue.length > 80
        ? searchConfig.searchValue.slice(0, 80) + '...'
        : searchConfig.searchValue
    aRaw(`  - ${t('aiAssistant.wordFrequency.searchValueLabel')}: ${valuePreview.replace(/\n/g, ' ')}`)
  }
  if (searchConfig.excludeWords.length) {
    aRaw(`  - ${t('aiAssistant.wordFrequency.excludeWordsLabel')}: ${searchConfig.excludeWords.join(', ')}`)
  }
  aRaw(`  - ${t('aiAssistant.wordFrequency.removeStopwordsLabel')}: ${searchConfig.removeStopwords ? 'yes' : 'no'}`)
  lines.push('')

  // --- 四、频率与大小写 ---
  aRaw(`## ${t('aiAssistant.wordFrequency.sectionParams')}`)
  aRaw(`  - ${t('aiAssistant.wordFrequency.minFreqLabel')}: ${minFreq}`)
  aRaw(`  - ${t('aiAssistant.wordFrequency.maxFreqLabel')}: ${maxFreq == null ? t('aiAssistant.wordFrequency.noLimit') : maxFreq}`)
  aRaw(`  - ${t('aiAssistant.wordFrequency.lowercaseLabel')}: ${lowercase ? 'yes' : 'no'}`)
  lines.push('')

  // --- 五、当前视图 ---
  aRaw(`## ${t('aiAssistant.wordFrequency.sectionCurrentView')}`)
  aRaw(`  - totalTokens: ${totalTokens}, uniqueWords: ${uniqueWords}`)

  if (results.length === 0) {
    aRaw('')
    a('aiAssistant.noAnalysisResult')
    return lines.join('\n')
  }

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.wordFrequency.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.wordFrequency.tableColumnsDesc')}`)
    const sortColLabel = t(`wordFrequency.table.${sortConfig.column}`)
    const sortOrderLabel = sortConfig.direction === 'asc' ? t('aiAssistant.wordFrequency.sortOrderAsc') : t('aiAssistant.wordFrequency.sortOrderDesc')
    aRaw(`  - ${t('aiAssistant.wordFrequency.tableSortDesc')}: ${t('aiAssistant.wordFrequency.tableSortBy', { column: sortColLabel, order: sortOrderLabel })}`)
    aRaw(`  - ${t('aiAssistant.wordFrequency.tableOrderFollowsSort')}`)
    const totalFiltered = tableFilter.trim()
      ? results.filter(r => r.word.toLowerCase().includes(tableFilter.trim().toLowerCase())).length
      : results.length
    aRaw(`  - ${t('aiAssistant.wordFrequency.tablePageDesc')}: page ${paginationConfig.page + 1}, ${paginationConfig.rowsPerPage} per page, total rows ${totalFiltered}`)
    if (tableFilter.trim()) {
      aRaw(`  - ${t('aiAssistant.wordFrequency.tableFilterDesc')}: "${tableFilter.trim()}"`)
    }
    aRaw(`  - ${t('aiAssistant.wordFrequency.tableVisibleRows')}:`)
    const visible = getVisibleTableRows(results, tableFilter, sortConfig, paginationConfig)
    const header = `\t${t('wordFrequency.table.rank')}\t${t('wordFrequency.table.word')}\t${t('wordFrequency.table.frequency')}\t${t('wordFrequency.table.percentage')}`
    aRaw(header)
    visible.forEach((r) => {
      aRaw(`${r.rank}\t${r.word}\t${r.frequency}\t${r.percentage?.toFixed(4) ?? ''}%`)
    })
  } else {
    const chartType: ChartType = vizConfig.chartType
    aRaw(`  - ${t('aiAssistant.wordFrequency.currentChartType')}: ${t(CHART_TYPE_LABEL_KEYS[chartType])}`)
    aRaw(`  - ${t('aiAssistant.wordFrequency.interpretAsChartType')}`)
    aRaw(`  - ${t('aiAssistant.wordFrequency.viewVizTab')}: ${chartType}`)

    const maxItemsByType = vizConfig.maxItemsByType ?? {}
    const defaultMax: Record<ChartType, number> = { bar: 20, pie: 10, wordcloud: 100 }
    const topN = maxItemsByType[chartType] ?? vizConfig.maxItems ?? defaultMax[chartType]

    if (chartType === 'bar') {
      aRaw(`  - ${t('aiAssistant.wordFrequency.vizBarDesc')}`)
      aRaw(`  - ${t('wordFrequency.viz.maxItems')}: ${topN}, ${t('wordFrequency.viz.showPercentage')}: ${vizConfig.showPercentage}, ${t('wordFrequency.viz.colorScheme')}: ${vizConfig.colorScheme}`)
    } else if (chartType === 'pie') {
      aRaw(`  - ${t('aiAssistant.wordFrequency.vizPieDesc')}`)
      aRaw(`  - ${t('wordFrequency.viz.maxItems')}: ${topN}, ${t('wordFrequency.viz.colorScheme')}: ${vizConfig.colorScheme}`)
    } else {
      aRaw(`  - ${t('aiAssistant.wordFrequency.vizWordcloudDesc')}`)
      const engine = vizConfig.wordCloudEngine ?? 'd3'
      aRaw(`  - Engine: ${engine === 'd3' ? t('aiAssistant.wordFrequency.vizWordcloudEngineD3') : t('aiAssistant.wordFrequency.vizWordcloudEngineLegacy')}`)
      const wcConfig = engine === 'd3' ? vizConfig.wordCloudConfig : vizConfig.legacyWordCloudConfig
      const maxWords = wcConfig?.maxWords ?? 100
      const colormap = wcConfig?.colormap ?? 'viridis'
      aRaw(`  - ${t('wordFrequency.viz.maxWords')}: ${maxWords}, colormap: ${colormap}`)
    }

    aRaw(`  - ${t('aiAssistant.wordFrequency.vizDataPrefix')} (N=${topN}):`)
    const dataHeader = `\t${t('wordFrequency.table.word')}\t${t('wordFrequency.table.frequency')}`
    aRaw(dataHeader)
    results.slice(0, topN).forEach((r, i) => {
      aRaw(`${i + 1}\t${r.word}\t${r.frequency}`)
    })
  }

  return lines.join('\n')
}

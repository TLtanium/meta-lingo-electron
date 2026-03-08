/**
 * Builds the full AI assistant context string for Single-Document Keyword Extraction.
 * Includes: data source, POS filter, stopwords, algorithm and parameters, and current view.
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import type {
  POSFilterConfig,
  SingleDocKeyword,
  SingleDocAlgorithm,
  SingleDocConfig,
  StopwordsConfig
} from '../../../types/keyword'

type SortColumn = 'rank' | 'keyword' | 'score' | 'frequency'
type SortDirection = 'asc' | 'desc'
type VizTab = 'bar' | 'pie' | 'wordcloud'

function getVisibleTableRows(
  results: SingleDocKeyword[],
  tableFilter: string,
  sortColumn: SortColumn,
  sortDirection: SortDirection,
  page: number,
  rowsPerPage: number
): SingleDocKeyword[] {
  const filter = tableFilter.trim().toLowerCase()
  const filtered = filter
    ? results.filter((r) => r.keyword.toLowerCase().includes(filter))
    : results
  const sorted = [...filtered].sort((a, b) => {
    let aVal: string | number = a[sortColumn]
    let bVal: string | number = b[sortColumn]
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase()
      bVal = (bVal as string).toLowerCase()
    }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
  const start = page * rowsPerPage
  return sorted.slice(start, start + rowsPerPage)
}

const SORT_COLUMN_KEYS: Record<SortColumn, string> = {
  rank: 'wordFrequency.table.rank',
  keyword: 'keyword.results.keyword',
  score: 'keyword.results.score',
  frequency: 'wordFrequency.table.frequency'
}

const VIZ_TAB_KEYS: Record<VizTab, string> = {
  bar: 'aiAssistant.keyword.singleDoc.vizBar',
  pie: 'aiAssistant.keyword.singleDoc.vizPie',
  wordcloud: 'aiAssistant.keyword.singleDoc.vizWordcloud'
}

export interface BuildSingleDocKeywordAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: POSFilterConfig
  stopwordsConfig: StopwordsConfig
  algorithm: SingleDocAlgorithm
  config: SingleDocConfig
  lowercase: boolean
  results: SingleDocKeyword[]
  totalKeywords: number
  rightTab: number
  tableFilter: string
  sortColumn: SortColumn
  sortDirection: SortDirection
  paginationConfig: { page: number; rowsPerPage: number }
  vizTab: VizTab
}

export function buildSingleDocKeywordAIContext(
  params: BuildSingleDocKeywordAIContextParams
): string {
  const {
    t,
    corpusSelection,
    posFilter,
    stopwordsConfig,
    algorithm,
    config,
    lowercase,
    results,
    totalKeywords,
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

  aRaw(t('aiAssistant.keyword.singleDoc.contextIntro'))
  lines.push('')

  // --- 一、数据源 ---
  aRaw(`## ${t('aiAssistant.keyword.singleDoc.sectionCorpus')}`)
  if (!corpusSelection) {
    aRaw(`${t('keyword.corpus.title')}: (none)`)
  } else {
    const mode =
      corpusSelection.dataSource === 'library'
        ? t('aiAssistant.synonym.libraryMode')
        : t('aiAssistant.synonym.corpusMode')
    aRaw(`${t('keyword.corpus.title')}: ${mode}`)
    const selMode = corpusSelection.selectionMode ?? 'all'
    if (selMode === 'all') {
      aRaw(`  - ${t('aiAssistant.synonym.selectionAll')}`)
    } else if (selMode === 'tags' || selMode === 'keywords') {
      aRaw(`  - ${t('aiAssistant.synonym.selectionByTags')}`)
      const tags = corpusSelection.selectedTags ?? corpusSelection.selectedKeywords ?? []
      if (tags.length) aRaw(`  - ${t('aiAssistant.synonym.tagsLabel')}: ${tags.join(', ')}`)
    } else {
      aRaw(`  - ${t('aiAssistant.synonym.selectionManual')}`)
      const ids = corpusSelection.selectedEntryIds ?? []
      aRaw(`  - ${t('aiAssistant.synonym.entryIdsCount')}: ${ids.length}`)
    }
    const textCount =
      corpusSelection.textIds === 'all'
        ? 'all'
        : Array.isArray(corpusSelection.textIds)
          ? String(corpusSelection.textIds.length)
          : '0'
    aRaw(`  - ${t('aiAssistant.synonym.textsCount')}: ${textCount}`)
    if (corpusSelection.language) {
      aRaw(`  - ${t('aiAssistant.synonym.languageLabel')}: ${corpusSelection.language}`)
    }
  }
  lines.push('')

  // --- 二、词性过滤 ---
  aRaw(`## ${t('aiAssistant.keyword.singleDoc.sectionPos')}`)
  if (posFilter.selectedPOS.length === 0) {
    aRaw('  - (none)')
  } else {
    aRaw(
      `  - ${posFilter.keepMode ? 'keep' : 'exclude'}: ${posFilter.selectedPOS.join(', ')}`
    )
  }
  lines.push('')

  // --- 三、停用词与排除词 ---
  aRaw(`## ${t('aiAssistant.keyword.singleDoc.sectionStopwords')}`)
  aRaw(`  - removeStopwords: ${stopwordsConfig.removeStopwords}`)
  if (stopwordsConfig.excludeWords?.length) {
    aRaw(`  - excludeWords: ${stopwordsConfig.excludeWords.slice(0, 20).join(', ')}${stopwordsConfig.excludeWords.length > 20 ? '...' : ''}`)
  }
  lines.push('')

  // --- 四、算法与参数 ---
  aRaw(`## ${t('aiAssistant.keyword.singleDoc.sectionAlgorithm')}`)
  const algoConfig = config[algorithm] as { topN?: number; maxFeatures?: number }
  const limitParam = algorithm === 'tfidf' ? (algoConfig?.maxFeatures ?? 50) : (algoConfig?.topN ?? 50)
  aRaw(`  - algorithm: ${algorithm}, ${algorithm === 'tfidf' ? 'maxFeatures' : 'topN'}: ${limitParam}, lowercase: ${lowercase}`)
  lines.push('')

  // --- 五、当前视图 ---
  aRaw(`## ${t('aiAssistant.keyword.singleDoc.sectionCurrentView')}`)
  aRaw(`  - totalKeywords: ${totalKeywords}`)

  if (results.length === 0) {
    aRaw('')
    a('aiAssistant.noAnalysisResult')
    return lines.join('\n')
  }

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.keyword.singleDoc.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.keyword.singleDoc.tableColumnsDesc')}`)
    const sortColLabel = t(SORT_COLUMN_KEYS[sortColumn])
    const sortOrderLabel =
      sortDirection === 'asc'
        ? t('aiAssistant.keyword.singleDoc.sortOrderAsc')
        : t('aiAssistant.keyword.singleDoc.sortOrderDesc')
    aRaw(
      `  - ${t('aiAssistant.keyword.singleDoc.tableSortDesc')}: ${t('aiAssistant.keyword.singleDoc.tableSortBy', { column: sortColLabel, order: sortOrderLabel })}`
    )
    aRaw(`  - ${t('aiAssistant.keyword.singleDoc.tableOrderFollowsSort')}`)
    const totalFiltered = tableFilter.trim()
      ? results.filter((r) =>
          r.keyword.toLowerCase().includes(tableFilter.trim().toLowerCase())
        ).length
      : results.length
    aRaw(
      `  - ${t('aiAssistant.keyword.singleDoc.tablePageDesc')}: page ${paginationConfig.page + 1}, ${paginationConfig.rowsPerPage} per page, total rows ${totalFiltered}`
    )
    if (tableFilter.trim()) {
      aRaw(`  - ${t('aiAssistant.keyword.singleDoc.tableFilterDesc')}: "${tableFilter.trim()}"`)
    }
    aRaw(`  - ${t('aiAssistant.keyword.singleDoc.tableVisibleRows')}:`)
    const visible = getVisibleTableRows(
      results,
      tableFilter,
      sortColumn,
      sortDirection,
      paginationConfig.page,
      paginationConfig.rowsPerPage
    )
    const header = `\t${t('wordFrequency.table.rank')}\t${t('keyword.results.keyword')}\t${t('keyword.results.score')}\t${t('wordFrequency.table.frequency')}`
    aRaw(header)
    visible.forEach((r) => {
      aRaw(`\t${r.rank}\t${r.keyword}\t${r.score.toFixed(4)}\t${r.frequency}`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.keyword.singleDoc.viewVizTab')}`)
    aRaw(
      `  - ${t('aiAssistant.keyword.singleDoc.currentChartType')}: ${t(VIZ_TAB_KEYS[vizTab])}`
    )
    aRaw(`  - ${t('aiAssistant.keyword.singleDoc.interpretAsChartType')}`)
    aRaw(`  - ${t('aiAssistant.keyword.singleDoc.vizDataPrefix')} (top ${Math.min(30, results.length)}):`)
    results.slice(0, 30).forEach((r, i) => {
      aRaw(`\t${i + 1}\t${r.keyword}\t${r.score.toFixed(4)}\t${r.frequency}`)
    })
  }

  return lines.join('\n')
}

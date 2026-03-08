/**
 * Builds the full AI assistant context string for Collocation Analysis (搭配分析).
 * Includes: data source, POS filter, search config (node word, span, frequency),
 * sort, table filter, pagination, and current view (table or visualization).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type { POSFilterConfig } from '../../types/wordFrequency'
import type {
  CollocationAnalysisResult,
  CollocationTableSortConfig,
  CollocationTablePaginationConfig,
  CollocationVizConfig,
  StatMeasureConfig
} from '../../types/collocationAnalysis'
import type { CollocationChartType } from '../../types/collocationAnalysis'

const VIZ_TYPE_KEYS: Record<CollocationChartType, string> = {
  bar: 'aiAssistant.collocationAnalysis.vizBar',
  pie: 'aiAssistant.collocationAnalysis.vizPie',
  network: 'aiAssistant.collocationAnalysis.vizNetwork',
  wordcloud: 'aiAssistant.collocationAnalysis.vizWordcloud'
}

function filterResults(
  results: CollocationAnalysisResult[],
  tableFilter: string,
  statConfigs: StatMeasureConfig[]
): CollocationAnalysisResult[] {
  let filtered = results
  const thresholdConfigs = statConfigs.filter(c => c.enabled && c.threshold != null)
  if (thresholdConfigs.length > 0) {
    filtered = filtered.filter(r =>
      thresholdConfigs.every(config => {
        const value = (r as any)[config.id]
        return typeof value === 'number' && value >= config.threshold!
      })
    )
  }
  if (tableFilter.trim()) {
    const f = tableFilter.toLowerCase()
    filtered = filtered.filter(r => r.collocate.toLowerCase().includes(f))
  }
  return filtered
}

function sortResults(
  data: CollocationAnalysisResult[],
  sortConfig: CollocationTableSortConfig
): CollocationAnalysisResult[] {
  const sorted = [...data]
  const col = sortConfig.column
  sorted.sort((a, b) => {
    let aVal: number | string = (a as any)[col] ?? (col === 'collocate' ? a.collocate : 0)
    let bVal: number | string = (b as any)[col] ?? (col === 'collocate' ? b.collocate : 0)
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortConfig.direction === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })
  return sorted
}

export interface BuildCollocationAnalysisAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: POSFilterConfig
  matchMode: 'lemma' | 'word'
  nodeWord: string
  span: number
  minFreq: number
  maxFreq: number | null
  lowercase: boolean
  removeStopwords: boolean
  excludeWords: string[]
  results: CollocationAnalysisResult[]
  statConfigs: StatMeasureConfig[]
  sortConfig: CollocationTableSortConfig
  tableFilter: string
  paginationConfig: CollocationTablePaginationConfig
  rightTab: number
  vizConfig: CollocationVizConfig
}

export function buildCollocationAnalysisAIContext(params: BuildCollocationAnalysisAIContextParams): string {
  const {
    t,
    corpusSelection,
    posFilter,
    matchMode,
    nodeWord,
    span,
    minFreq,
    maxFreq,
    lowercase,
    removeStopwords,
    excludeWords,
    results,
    statConfigs,
    sortConfig,
    tableFilter,
    paginationConfig,
    rightTab,
    vizConfig
  } = params

  const lines: string[] = []
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.collocationAnalysis.contextIntro'))
  lines.push('')

  aRaw(`## ${t('aiAssistant.collocationAnalysis.sectionCorpus')}`)
  if (!corpusSelection) {
    aRaw(`${t('wordFrequency.corpus.title')}: (none)`)
  } else {
    const mode = corpusSelection.dataSource === 'library'
      ? t('aiAssistant.synonym.libraryMode')
      : t('aiAssistant.synonym.corpusMode')
    aRaw(`${t('wordFrequency.corpus.title')}: ${mode}`)
    const selMode = corpusSelection.selectionMode ?? 'all'
    if (selMode === 'all') aRaw(`  - ${t('aiAssistant.synonym.selectionAll')}`)
    else if (selMode === 'tags' || selMode === 'keywords') {
      aRaw(`  - ${t('aiAssistant.synonym.selectionByTags')}`)
      const tags = corpusSelection.selectedTags ?? corpusSelection.selectedKeywords ?? []
      if (tags.length) aRaw(`  - ${t('aiAssistant.synonym.tagsLabel')}: ${tags.join(', ')}`)
    } else {
      aRaw(`  - ${t('aiAssistant.synonym.selectionManual')}`)
      const ids = corpusSelection.selectedEntryIds ?? []
      aRaw(`  - ${t('aiAssistant.synonym.entryIdsCount')}: ${ids.length}`)
    }
    const textCount = corpusSelection.textIds === 'all' ? 'all' : Array.isArray(corpusSelection.textIds) ? String(corpusSelection.textIds.length) : '0'
    aRaw(`  - ${t('aiAssistant.synonym.textsCount')}: ${textCount}`)
    if (corpusSelection.language) aRaw(`  - ${t('aiAssistant.synonym.languageLabel')}: ${corpusSelection.language}`)
  }
  lines.push('')

  aRaw(`## ${t('aiAssistant.collocationAnalysis.sectionPos')}`)
  if (posFilter.selectedPOS.length === 0) aRaw('  - (none)')
  else aRaw(`  - ${posFilter.keepMode ? 'keep' : 'exclude'}: ${posFilter.selectedPOS.join(', ')}`)
  lines.push('')

  aRaw(`## ${t('aiAssistant.collocationAnalysis.sectionSearch')}`)
  aRaw(`  - nodeWord: ${nodeWord || '(empty)'}, span: ${span}, matchMode: ${matchMode}`)
  aRaw(`  - minFreq: ${minFreq}, maxFreq: ${maxFreq ?? 'null'}, lowercase: ${lowercase}, removeStopwords: ${removeStopwords}`)
  if (excludeWords.length) aRaw(`  - excludeWords: ${excludeWords.join(', ')}`)
  lines.push('')

  aRaw(`## ${t('aiAssistant.collocationAnalysis.sectionFreq')}`)
  aRaw(`  - (included in search config above)`)
  lines.push('')

  aRaw(`## ${t('aiAssistant.collocationAnalysis.sectionCurrentView')}`)

  if (results.length === 0) {
    lines.push('')
    aRaw(t('aiAssistant.noAnalysisResult'))
    return lines.join('\n')
  }

  const filtered = filterResults(results, tableFilter, statConfigs)
  const sorted = sortResults(filtered, sortConfig)
  const { page, rowsPerPage } = paginationConfig
  const start = page * rowsPerPage
  const visible = sorted.slice(start, start + rowsPerPage)

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.tableColumnsDesc')}`)
    const orderLabel = sortConfig.direction === 'desc'
      ? t('aiAssistant.collocationAnalysis.sortOrderDesc')
      : t('aiAssistant.collocationAnalysis.sortOrderAsc')
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.tableSortDesc')}: ${t('aiAssistant.collocationAnalysis.tableSortBy', { column: sortConfig.column, order: orderLabel })}`)
    if (tableFilter.trim()) aRaw(`  - ${t('aiAssistant.collocationAnalysis.tableFilterDesc')}: "${tableFilter.trim()}"`)
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.tablePageDesc')}: page ${page + 1}, ${rowsPerPage} per page, total filtered rows ${sorted.length}`)
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.tableOrderFollowsSort')}`)
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.tableVisibleRows')}:`)
    visible.forEach((r, i) => {
      const scoreVal = (r.logdice ?? r.mi ?? r.ll ?? r.deltap1 ?? r.deltap2) != null
        ? Number((r.logdice ?? r.mi ?? r.ll ?? r.deltap1 ?? r.deltap2)).toFixed(2)
        : ''
      aRaw(`\t${start + i + 1}\t${r.collocate}\t${r.collocation_freq}\t${r.total_freq}\t${scoreVal}`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.viewVizTab')}`)
    const chartKey = VIZ_TYPE_KEYS[vizConfig.chartType]
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.currentChartType')}: ${t(chartKey)}`)
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.interpretAsChartType')}`)
    const topN = Math.min(vizConfig.maxItems ?? 20, sorted.length)
    aRaw(`  - ${t('aiAssistant.collocationAnalysis.vizDataPrefix')} (top ${topN}):`)
    sorted.slice(0, topN).forEach((r, i) => {
      const scoreVal = (r.logdice ?? r.mi ?? r.ll ?? r.deltap1 ?? r.deltap2) != null ? String((r.logdice ?? r.mi ?? r.ll ?? r.deltap1 ?? r.deltap2).toFixed(2)) : ''
      aRaw(`\t${i + 1}\t${r.collocate}\t${r.collocation_freq}\t${scoreVal}`)
    })
  }

  return lines.join('\n')
}

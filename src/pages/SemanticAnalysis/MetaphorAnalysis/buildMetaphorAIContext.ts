/**
 * Builds the full AI assistant context string for Metaphor Analysis.
 * Includes: data source, POS filter, search config, frequency,
 * sort, table filter, pagination, and current view (table or visualization).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import type {
  MetaphorResult,
  MetaphorStatistics,
  MetaphorVisualizationConfig
} from '../../../types/metaphorAnalysis'

type SortField = 'word' | 'frequency' | 'percentage' | 'pos' | 'is_metaphor' | 'source'
type SortDirection = 'asc' | 'desc'

const VIZ_TYPE_KEYS: Record<string, string> = {
  bar: 'aiAssistant.metaphor.vizBar',
  pie: 'aiAssistant.metaphor.vizPie',
  wordcloud: 'aiAssistant.metaphor.vizWordcloud'
}

interface POSFilterConfig {
  selectedPOS: string[]
  keepMode: boolean
}

interface SearchConfig {
  searchType: string
  searchValue: string
  excludeWords: string[]
}

function filterResults(results: MetaphorResult[], tableFilter: string): MetaphorResult[] {
  if (!tableFilter.trim()) return results
  const filter = tableFilter.toLowerCase()
  return results.filter(r => (r.word || '').toLowerCase().includes(filter))
}

function sortResults(
  data: MetaphorResult[],
  sortField: SortField,
  sortDirection: SortDirection
): MetaphorResult[] {
  const sorted = [...data]
  sorted.sort((a, b) => {
    let aVal: string | number
    let bVal: string | number
    switch (sortField) {
      case 'word':
        aVal = a.word.toLowerCase()
        bVal = b.word.toLowerCase()
        break
      case 'frequency':
        aVal = a.frequency
        bVal = b.frequency
        break
      case 'percentage':
        aVal = a.percentage
        bVal = b.percentage
        break
      case 'pos':
        aVal = a.pos
        bVal = b.pos
        break
      case 'is_metaphor':
        aVal = a.is_metaphor ? 1 : 0
        bVal = b.is_metaphor ? 1 : 0
        break
      case 'source':
        aVal = a.source
        bVal = b.source
        break
      default:
        return 0
    }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
  return sorted
}

export interface BuildMetaphorAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: POSFilterConfig
  searchConfig: SearchConfig
  minFreq: number
  maxFreq: number | null
  lowercase: boolean
  results: MetaphorResult[]
  statistics: MetaphorStatistics | null
  sortField: SortField
  sortDirection: SortDirection
  tableFilter: string
  page: number
  rowsPerPage: number
  rightTab: number
  vizConfig: MetaphorVisualizationConfig
}

export function buildMetaphorAIContext(params: BuildMetaphorAIContextParams): string {
  const {
    t,
    corpusSelection,
    posFilter,
    searchConfig,
    minFreq,
    maxFreq,
    lowercase,
    results,
    statistics,
    sortField,
    sortDirection,
    tableFilter,
    page,
    rowsPerPage,
    rightTab,
    vizConfig
  } = params

  const lines: string[] = []
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.metaphor.contextIntro'))
  lines.push('')

  // --- 一、数据源 ---
  aRaw(`## ${t('aiAssistant.metaphor.sectionCorpus')}`)
  if (!corpusSelection) {
    aRaw(`${t('wordFrequency.corpus.title')}: (none)`)
  } else {
    const mode =
      corpusSelection.dataSource === 'library'
        ? t('aiAssistant.synonym.libraryMode')
        : t('aiAssistant.synonym.corpusMode')
    aRaw(`${t('wordFrequency.corpus.title')}: ${mode}`)
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

  // --- 二、词性 ---
  aRaw(`## ${t('aiAssistant.metaphor.sectionPos')}`)
  if (posFilter.selectedPOS.length === 0) {
    aRaw('  - (none)')
  } else {
    aRaw(`  - ${posFilter.keepMode ? 'keep' : 'exclude'}: ${posFilter.selectedPOS.join(', ')}`)
  }
  lines.push('')

  // --- 三、检索配置 ---
  aRaw(`## ${t('aiAssistant.metaphor.sectionSearch')}`)
  aRaw(`  - searchType: ${searchConfig.searchType}, searchValue: ${searchConfig.searchValue || '(empty)'}`)
  if (searchConfig.excludeWords?.length) {
    aRaw(`  - excludeWords: ${searchConfig.excludeWords.join(', ')}`)
  }
  lines.push('')

  // --- 四、频率与选项 ---
  aRaw(`## ${t('aiAssistant.metaphor.sectionFreq')}`)
  aRaw(`  - minFreq: ${minFreq}, maxFreq: ${maxFreq ?? 'null'}, lowercase: ${lowercase}`)
  if (statistics) {
    aRaw(`  - total_tokens: ${statistics.total_tokens}, metaphor_tokens: ${statistics.metaphor_tokens}, metaphor_rate: ${(statistics.metaphor_rate * 100).toFixed(2)}%`)
  }
  lines.push('')

  // --- 五、当前视图 ---
  aRaw(`## ${t('aiAssistant.metaphor.sectionCurrentView')}`)

  if (results.length === 0) {
    lines.push('')
    aRaw(t('aiAssistant.noAnalysisResult'))
    return lines.join('\n')
  }

  const filtered = filterResults(results, tableFilter)
  const sorted = sortResults(filtered, sortField, sortDirection)
  const start = page * rowsPerPage
  const visible = sorted.slice(start, start + rowsPerPage)

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.metaphor.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.metaphor.tableColumnsDesc')}`)
    const orderLabel = sortDirection === 'desc'
      ? t('aiAssistant.metaphor.sortOrderDesc')
      : t('aiAssistant.metaphor.sortOrderAsc')
    aRaw(`  - ${t('aiAssistant.metaphor.tableSortDesc')}: ${t('aiAssistant.metaphor.tableSortBy', { column: sortField, order: orderLabel })}`)
    if (tableFilter.trim()) {
      aRaw(`  - ${t('aiAssistant.metaphor.tableFilterDesc')}: "${tableFilter.trim()}"`)
    }
    aRaw(
      `  - ${t('aiAssistant.metaphor.tablePageDesc')}: page ${page + 1}, ${rowsPerPage} per page, total filtered rows ${sorted.length}`
    )
    aRaw(`  - ${t('aiAssistant.metaphor.tableOrderFollowsSort')}`)
    aRaw(`  - ${t('aiAssistant.metaphor.tableVisibleRows')}:`)
    visible.forEach((r, i) => {
      aRaw(`\t${start + i + 1}\t${r.word}\t${r.lemma}\t${r.pos}\t${r.frequency}\t${r.percentage.toFixed(2)}%\t${r.is_metaphor ? 'Y' : 'N'}\t${r.source}`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.metaphor.viewVizTab')}`)
    const chartKey = VIZ_TYPE_KEYS[vizConfig.chartType] || vizConfig.chartType
    aRaw(`  - ${t('aiAssistant.metaphor.currentChartType')}: ${t(chartKey)}`)
    aRaw(`  - ${t('aiAssistant.metaphor.interpretAsChartType')}`)
    const topN = Math.min(vizConfig.maxItems ?? 20, sorted.length)
    aRaw(`  - ${t('aiAssistant.metaphor.vizDataPrefix')} (top ${topN}):`)
    sorted.slice(0, topN).forEach((r, i) => {
      aRaw(`\t${i + 1}\t${r.word}\t${r.frequency}\t${r.percentage.toFixed(2)}%\t${r.is_metaphor ? 'Y' : 'N'}`)
    })
  }

  return lines.join('\n')
}

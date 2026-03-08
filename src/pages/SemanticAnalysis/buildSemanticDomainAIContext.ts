/**
 * Builds the full AI assistant context string for Semantic Domain Analysis.
 * Includes: data source, POS filter, search config, frequency, result mode,
 * sort, table filter, pagination, and current view (table or visualization).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type {
  POSFilterConfig,
  SearchConfig,
  SemanticAnalysisResponse,
  SemanticDomainResult,
  SemanticWordResult,
  SortConfig,
  VisualizationConfig
} from '../../types/semanticAnalysis'
import type { ChartType } from '../../types/semanticAnalysis'

const VIZ_TYPE_KEYS: Record<ChartType, string> = {
  bar: 'aiAssistant.semanticDomain.vizBar',
  pie: 'aiAssistant.semanticDomain.vizPie',
  treemap: 'aiAssistant.semanticDomain.vizTreemap',
  wordcloud: 'aiAssistant.semanticDomain.vizWordcloud'
}

function filterResults(
  results: SemanticDomainResult[] | SemanticWordResult[],
  tableFilter: string,
  isDomainMode: boolean
): (SemanticDomainResult | SemanticWordResult)[] {
  if (!tableFilter.trim()) return results
  const filter = tableFilter.toLowerCase()
  return results.filter(r => {
    if (isDomainMode) {
      const d = r as SemanticDomainResult
      return (d.domain || '').toLowerCase().includes(filter) ||
             (d.domain_name || '').toLowerCase().includes(filter)
    }
    const w = r as SemanticWordResult
    return (w.word || '').toLowerCase().includes(filter) ||
           (w.domain || '').toLowerCase().includes(filter) ||
           (w.domain_name || '').toLowerCase().includes(filter)
  })
}

function sortResults(
  data: (SemanticDomainResult | SemanticWordResult)[],
  sortConfig: SortConfig,
  isDomainMode: boolean
): (SemanticDomainResult | SemanticWordResult)[] {
  const arr = [...data]
  arr.sort((a, b) => {
    let aValue: string | number
    let bValue: string | number
    switch (sortConfig.field) {
      case 'rank':
        aValue = a.rank
        bValue = b.rank
        break
      case 'domain':
        aValue = a.domain
        bValue = b.domain
        break
      case 'word':
        aValue = (a as SemanticWordResult).word || ''
        bValue = (b as SemanticWordResult).word || ''
        break
      case 'frequency':
        aValue = a.frequency
        bValue = b.frequency
        break
      case 'percentage':
        aValue = a.percentage
        bValue = b.percentage
        break
      default:
        aValue = a.frequency
        bValue = b.frequency
    }
    if (typeof aValue === 'string') {
      return sortConfig.order === 'asc'
        ? aValue.localeCompare(bValue as string)
        : (bValue as string).localeCompare(aValue)
    }
    return sortConfig.order === 'asc'
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number)
  })
  return arr
}

export interface BuildSemanticDomainAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: POSFilterConfig
  searchConfig: SearchConfig
  minFreq: number
  maxFreq: number | null
  lowercase: boolean
  resultMode: 'domain' | 'word'
  results: SemanticAnalysisResponse | null
  sortConfig: SortConfig
  tableFilter: string
  page: number
  rowsPerPage: number
  rightTab: number
  vizConfig: VisualizationConfig
}

export function buildSemanticDomainAIContext(params: BuildSemanticDomainAIContextParams): string {
  const {
    t,
    corpusSelection,
    posFilter,
    searchConfig,
    minFreq,
    maxFreq,
    lowercase,
    resultMode,
    results,
    sortConfig,
    tableFilter,
    page,
    rowsPerPage,
    rightTab,
    vizConfig
  } = params

  const lines: string[] = []
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.semanticDomain.contextIntro'))
  lines.push('')

  // --- 一、数据源 ---
  aRaw(`## ${t('aiAssistant.semanticDomain.sectionCorpus')}`)
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
  aRaw(`## ${t('aiAssistant.semanticDomain.sectionPos')}`)
  if (posFilter.selectedPOS.length === 0) {
    aRaw('  - (none)')
  } else {
    aRaw(`  - ${posFilter.keepMode ? 'keep' : 'exclude'}: ${posFilter.selectedPOS.join(', ')}`)
  }
  lines.push('')

  // --- 三、检索配置 ---
  aRaw(`## ${t('aiAssistant.semanticDomain.sectionSearch')}`)
  aRaw(`  - searchType: ${searchConfig.searchType}, searchValue: ${searchConfig.searchValue || '(empty)'}`)
  if (searchConfig.excludeWords?.length) {
    aRaw(`  - excludeWords: ${searchConfig.excludeWords.join(', ')}`)
  }
  lines.push('')

  // --- 四、频率与选项 ---
  aRaw(`## ${t('aiAssistant.semanticDomain.sectionFreq')}`)
  aRaw(`  - minFreq: ${minFreq}, maxFreq: ${maxFreq ?? 'null'}, lowercase: ${lowercase}`)
  lines.push('')

  // --- 五、结果模式 ---
  aRaw(`## ${t('aiAssistant.semanticDomain.sectionResultMode')}`)
  aRaw(`  - resultMode: ${resultMode}`)
  lines.push('')

  // --- 六、当前视图 ---
  aRaw(`## ${t('aiAssistant.semanticDomain.sectionCurrentView')}`)

  if (!results || !results.results || results.results.length === 0) {
    lines.push('')
    aRaw(t('aiAssistant.noAnalysisResult'))
    return lines.join('\n')
  }

  const isDomainMode = results.result_mode === 'domain'
  const filtered = filterResults(results.results, tableFilter, isDomainMode)
  const sorted = sortResults(filtered, sortConfig, isDomainMode)
  const start = page * rowsPerPage
  const visible = sorted.slice(start, start + rowsPerPage)

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.semanticDomain.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.semanticDomain.tableColumnsDesc')}`)
    const orderLabel = sortConfig.order === 'desc'
      ? t('aiAssistant.semanticDomain.sortOrderDesc')
      : t('aiAssistant.semanticDomain.sortOrderAsc')
    aRaw(`  - ${t('aiAssistant.semanticDomain.tableSortDesc')}: ${t('aiAssistant.semanticDomain.tableSortBy', { column: sortConfig.field, order: orderLabel })}`)
    if (tableFilter.trim()) {
      aRaw(`  - ${t('aiAssistant.semanticDomain.tableFilterDesc')}: "${tableFilter.trim()}"`)
    }
    aRaw(
      `  - ${t('aiAssistant.semanticDomain.tablePageDesc')}: page ${page + 1}, ${rowsPerPage} per page, total filtered rows ${sorted.length}`
    )
    aRaw(`  - ${t('aiAssistant.semanticDomain.tableOrderFollowsSort')}`)
    aRaw(`  - ${t('aiAssistant.semanticDomain.tableVisibleRows')}:`)
    visible.forEach((r, i) => {
      const rank = r.rank
      const wordOrDomain = isDomainMode ? (r as SemanticDomainResult).domain : (r as SemanticWordResult).word
      const domain = r.domain
      const domainName = r.domain_name ?? ''
      const freq = r.frequency
      const pct = r.percentage.toFixed(2)
      const extra = !isDomainMode && (r as SemanticWordResult).pos ? `\t${(r as SemanticWordResult).pos}` : ''
      aRaw(`\t${start + i + 1}\t${rank}\t${wordOrDomain}\t${domain}\t${domainName}\t${freq}\t${pct}%${extra}`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.semanticDomain.viewVizTab')}`)
    const chartKey = VIZ_TYPE_KEYS[vizConfig.chartType as ChartType] || vizConfig.chartType
    aRaw(`  - ${t('aiAssistant.semanticDomain.currentChartType')}: ${t(chartKey)}`)
    aRaw(`  - ${t('aiAssistant.semanticDomain.interpretAsChartType')}`)
    const topN = Math.min(vizConfig.showTopN ?? 20, sorted.length)
    aRaw(`  - ${t('aiAssistant.semanticDomain.vizDataPrefix')} (top ${topN}):`)
    sorted.slice(0, topN).forEach((r, i) => {
      const label = isDomainMode ? (r as SemanticDomainResult).domain : (r as SemanticWordResult).word
      aRaw(`\t${i + 1}\t${label}\t${r.frequency}\t${r.percentage.toFixed(2)}%`)
    })
  }

  return lines.join('\n')
}

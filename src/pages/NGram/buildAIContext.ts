/**
 * Builds the full AI assistant context string for N-gram Analysis.
 * Includes: data source, N-gram params, POS filter, search config, frequency, and current view.
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type {
  POSFilterConfig,
  SearchConfig,
  NGramConfig,
  NGramResult,
  NGramVisualizationConfig,
  TableSortConfig,
  TablePaginationConfig
} from '../../types/ngram'

type NGramChartType = 'bar' | 'network' | 'sankey' | 'wordcloud'

function getVisibleTableRows(
  results: NGramResult[],
  tableFilter: string,
  sortConfig: TableSortConfig,
  paginationConfig: TablePaginationConfig
): NGramResult[] {
  const filter = tableFilter.trim().toLowerCase()
  const filtered = filter
    ? results.filter((r) => r.ngram.toLowerCase().includes(filter))
    : results
  const sorted = [...filtered].sort((a, b) => {
    let comparison = 0
    switch (sortConfig.column) {
      case 'ngram':
        comparison = a.ngram.localeCompare(b.ngram)
        break
      case 'frequency':
        comparison = a.frequency - b.frequency
        break
      case 'percentage':
        comparison = a.percentage - b.percentage
        break
      case 'n':
        comparison = a.n - b.n
        break
      default:
        comparison = a.frequency - b.frequency
    }
    return sortConfig.direction === 'asc' ? comparison : -comparison
  })
  const start = paginationConfig.page * paginationConfig.rowsPerPage
  return sorted.slice(start, start + paginationConfig.rowsPerPage)
}

const SORT_COLUMN_KEYS: Record<TableSortConfig['column'], string> = {
  ngram: 'ngram.results.ngram',
  frequency: 'ngram.results.frequency',
  percentage: 'ngram.results.percentage',
  n: '' // use literal "N" below
}

const VIZ_TAB_KEYS: Record<NGramChartType, string> = {
  bar: 'aiAssistant.ngram.vizBar',
  network: 'aiAssistant.ngram.vizNetwork',
  sankey: 'aiAssistant.ngram.vizSankey',
  wordcloud: 'aiAssistant.ngram.vizWordcloud'
}

export interface BuildNgramAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: POSFilterConfig
  searchConfig: SearchConfig
  ngramConfig: NGramConfig
  minFreq: number
  maxFreq: number | null
  lowercase: boolean
  results: NGramResult[]
  totalNgrams: number
  uniqueNgrams: number
  rightTab: number
  tableFilter: string
  sortConfig: TableSortConfig
  paginationConfig: TablePaginationConfig
  vizTab: NGramChartType
  vizConfig: NGramVisualizationConfig
}

export function buildNgramAIContext(params: BuildNgramAIContextParams): string {
  const {
    t,
    corpusSelection,
    posFilter,
    searchConfig,
    ngramConfig,
    minFreq,
    maxFreq,
    lowercase,
    results,
    totalNgrams,
    uniqueNgrams,
    rightTab,
    tableFilter,
    sortConfig,
    paginationConfig,
    vizTab,
    vizConfig
  } = params

  const lines: string[] = []
  const a = (key: string) => lines.push(t(key))
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.ngram.contextIntro'))
  lines.push('')

  // --- 一、数据源 ---
  aRaw(`## ${t('aiAssistant.ngram.sectionCorpus')}`)
  if (!corpusSelection) {
    aRaw(`${t('ngram.corpus.title')}: (none)`)
  } else {
    const mode =
      corpusSelection.dataSource === 'library'
        ? t('aiAssistant.synonym.libraryMode')
        : t('aiAssistant.synonym.corpusMode')
    aRaw(`${t('ngram.corpus.title')}: ${mode}`)
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

  // --- 二、N-gram 参数 ---
  aRaw(`## ${t('aiAssistant.ngram.sectionNgram')}`)
  aRaw(`  - nValues: ${ngramConfig.nValues.join(', ')}, nestNgram: ${ngramConfig.nestNgram}, minWordLength: ${ngramConfig.minWordLength}`)
  lines.push('')

  // --- 三、词性过滤 ---
  aRaw(`## ${t('aiAssistant.ngram.sectionPos')}`)
  if (posFilter.selectedPOS.length === 0) {
    aRaw('  - (none)')
  } else {
    aRaw(`  - ${posFilter.keepMode ? 'keep' : 'exclude'}: ${posFilter.selectedPOS.join(', ')}`)
  }
  lines.push('')

  // --- 四、检索配置 ---
  aRaw(`## ${t('aiAssistant.ngram.sectionSearch')}`)
  aRaw(`  - searchType: ${searchConfig.searchType}, searchValue: ${searchConfig.searchValue || '(empty)'}`)
  if (searchConfig.excludeWords?.length) {
    aRaw(`  - excludeWords: ${searchConfig.excludeWords.slice(0, 15).join(', ')}${searchConfig.excludeWords.length > 15 ? '...' : ''}`)
  }
  lines.push('')

  // --- 五、频率与选项 ---
  aRaw(`## ${t('aiAssistant.ngram.sectionFreq')}`)
  aRaw(`  - minFreq: ${minFreq}, maxFreq: ${maxFreq ?? 'null'}, lowercase: ${lowercase}`)
  lines.push('')

  // --- 六、当前视图 ---
  aRaw(`## ${t('aiAssistant.ngram.sectionCurrentView')}`)
  aRaw(`  - totalNgrams: ${totalNgrams}, uniqueNgrams: ${uniqueNgrams}`)

  if (results.length === 0) {
    aRaw('')
    a('aiAssistant.noAnalysisResult')
    return lines.join('\n')
  }

  const sortColKey = SORT_COLUMN_KEYS[sortConfig.column]
  const sortColLabel = sortConfig.column === 'n' ? 'N' : (sortColKey ? t(sortColKey) : sortConfig.column)
  const sortOrderLabel =
    sortConfig.direction === 'asc'
      ? t('aiAssistant.ngram.sortOrderAsc')
      : t('aiAssistant.ngram.sortOrderDesc')

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.ngram.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.ngram.tableColumnsDesc')}`)
    aRaw(
      `  - ${t('aiAssistant.ngram.tableSortDesc')}: ${t('aiAssistant.ngram.tableSortBy', { column: sortColLabel, order: sortOrderLabel })}`
    )
    aRaw(`  - ${t('aiAssistant.ngram.tableOrderFollowsSort')}`)
    const totalFiltered = tableFilter.trim()
      ? results.filter((r) => r.ngram.toLowerCase().includes(tableFilter.trim().toLowerCase())).length
      : results.length
    aRaw(
      `  - ${t('aiAssistant.ngram.tablePageDesc')}: page ${paginationConfig.page + 1}, ${paginationConfig.rowsPerPage} per page, total rows ${totalFiltered}`
    )
    if (tableFilter.trim()) {
      aRaw(`  - ${t('aiAssistant.ngram.tableFilterDesc')}: "${tableFilter.trim()}"`)
    }
    aRaw(`  - ${t('aiAssistant.ngram.tableVisibleRows')}:`)
    const visible = getVisibleTableRows(results, tableFilter, sortConfig, paginationConfig)
    const header = `\t${t('wordFrequency.table.rank')}\t${t('ngram.results.ngram')}\tN\t${t('ngram.results.frequency')}\t${t('ngram.results.percentage')}`
    aRaw(header)
    visible.forEach((r) => {
      aRaw(`\t${r.rank}\t${r.ngram}\t${r.n}\t${r.frequency}\t${r.percentage.toFixed(2)}%`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.ngram.viewVizTab')}`)
    aRaw(
      `  - ${t('aiAssistant.ngram.currentChartType')}: ${t(VIZ_TAB_KEYS[vizTab])}`
    )
    aRaw(`  - ${t('aiAssistant.ngram.interpretAsChartType')}`)
    const maxItems = vizConfig.maxItemsByType?.[vizTab] ?? vizConfig.maxItems ?? 50
    aRaw(`  - ${t('aiAssistant.ngram.vizDataPrefix')} (top ${Math.min(maxItems, results.length)}):`)
    results.slice(0, maxItems).forEach((r, i) => {
      aRaw(`\t${i + 1}\t${r.ngram}\t${r.n}\t${r.frequency}\t${r.percentage.toFixed(2)}%`)
    })
  }

  return lines.join('\n')
}

/**
 * Builds the full AI assistant context string for Keyness Comparison.
 * Includes: study corpus, reference corpus/resource, POS filter, stopwords,
 * comparison mode and statistic, threshold, and current view.
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../../components/Corpus/CorpusOrLibrarySelector'
import type {
  POSFilterConfig,
  KeynessKeyword,
  KeynessStatistic,
  KeynessConfig,
  ThresholdConfig,
  ComparisonMode,
  CorpusResource,
  StopwordsConfig
} from '../../../types/keyword'

type SortColumn = 'rank' | 'keyword' | 'study_freq' | 'ref_freq' | 'score' | 'effect_size'
type SortDirection = 'asc' | 'desc'
type VizTab = 'bar' | 'pie' | 'wordcloud'

function getVisibleTableRows(
  results: KeynessKeyword[],
  tableFilter: string,
  comparisonMode: ComparisonMode,
  sortColumn: SortColumn,
  sortDirection: SortDirection,
  page: number,
  rowsPerPage: number
): KeynessKeyword[] {
  const filter = tableFilter.trim().toLowerCase()
  const filtered = filter
    ? results.filter((r) => {
        if (comparisonMode === 'domain' && r.domain_name) {
          return String(r.domain_name || '').toLowerCase().includes(filter)
        }
        return r.keyword.toLowerCase().includes(filter)
      })
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
  study_freq: 'keyword.keyness.studyFreq',
  ref_freq: 'keyword.keyness.refFreq',
  score: 'keyword.results.score',
  effect_size: 'keyword.keyness.effect'
}

const VIZ_TAB_KEYS: Record<VizTab, string> = {
  bar: 'aiAssistant.keyword.keyness.vizBar',
  pie: 'aiAssistant.keyword.keyness.vizPie',
  wordcloud: 'aiAssistant.keyword.keyness.vizWordcloud'
}

export interface BuildKeynessAIContextParams {
  t: TFunction
  studySelection: CorpusOrLibrarySelection | null
  refSelection: CorpusOrLibrarySelection | null
  useCorpusResource: boolean
  selectedResource: CorpusResource | null
  posFilter: POSFilterConfig
  stopwordsConfig: StopwordsConfig
  comparisonMode: ComparisonMode
  statistic: KeynessStatistic
  keynessConfig: KeynessConfig
  useThreshold: boolean
  thresholdConfig: ThresholdConfig
  lowercase: boolean
  results: KeynessKeyword[]
  totalKeywords: number
  studySize: number
  refSize: number
  rightTab: number
  tableFilter: string
  sortColumn: SortColumn
  sortDirection: SortDirection
  paginationConfig: { page: number; rowsPerPage: number }
  vizTab: VizTab
  positiveOnly: boolean
}

function describeCorpusSelection(sel: CorpusOrLibrarySelection | null, t: TFunction): string {
  if (!sel) return '(none)'
  const mode = sel.dataSource === 'library' ? t('aiAssistant.synonym.libraryMode') : t('aiAssistant.synonym.corpusMode')
  const textCount = sel.textIds === 'all' ? 'all' : Array.isArray(sel.textIds) ? String(sel.textIds.length) : '0'
  return `${mode}, ${t('aiAssistant.synonym.textsCount')}: ${textCount}`
}

export function buildKeynessAIContext(params: BuildKeynessAIContextParams): string {
  const {
    t,
    studySelection,
    refSelection,
    useCorpusResource,
    selectedResource,
    posFilter,
    stopwordsConfig,
    comparisonMode,
    statistic,
    keynessConfig,
    useThreshold,
    thresholdConfig,
    lowercase,
    results,
    totalKeywords,
    studySize,
    refSize,
    rightTab,
    tableFilter,
    sortColumn,
    sortDirection,
    paginationConfig,
    vizTab,
    positiveOnly
  } = params

  const lines: string[] = []
  const a = (key: string) => lines.push(t(key))
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.keyword.keyness.contextIntro'))
  lines.push('')

  // --- 一、研究语料 ---
  aRaw(`## ${t('aiAssistant.keyword.keyness.sectionStudy')}`)
  aRaw(`  - ${describeCorpusSelection(studySelection, t)}`)
  if (studySelection?.language) {
    aRaw(`  - ${t('aiAssistant.synonym.languageLabel')}: ${studySelection.language}`)
  }
  lines.push('')

  // --- 二、参照语料 ---
  aRaw(`## ${t('aiAssistant.keyword.keyness.sectionRef')}`)
  if (useCorpusResource) {
    aRaw(`  - ${t('aiAssistant.keyword.keyness.useResource')}: yes`)
    aRaw(`  - ${t('aiAssistant.keyword.keyness.resourceName')}: ${selectedResource ? (selectedResource.name_en || selectedResource.name_zh || selectedResource.id) : '(none)'}`)
  } else {
    aRaw(`  - ${describeCorpusSelection(refSelection, t)}`)
  }
  lines.push('')

  // --- 三、词性过滤 ---
  aRaw(`## ${t('aiAssistant.keyword.keyness.sectionPos')}`)
  if (posFilter.selectedPOS.length === 0) {
    aRaw('  - (none)')
  } else {
    aRaw(`  - ${posFilter.keepMode ? 'keep' : 'exclude'}: ${posFilter.selectedPOS.join(', ')}`)
  }
  lines.push('')

  // --- 四、停用词 ---
  aRaw(`## ${t('aiAssistant.keyword.keyness.sectionStopwords')}`)
  aRaw(`  - removeStopwords: ${stopwordsConfig.removeStopwords}`)
  if (stopwordsConfig.excludeWords?.length) {
    aRaw(`  - excludeWords: ${(stopwordsConfig.excludeWords as string[]).slice(0, 20).join(', ')}${(stopwordsConfig.excludeWords as string[]).length > 20 ? '...' : ''}`)
  }
  lines.push('')

  // --- 五、对比模式与统计量 ---
  aRaw(`## ${t('aiAssistant.keyword.keyness.sectionComparison')}`)
  aRaw(`  - comparisonMode: ${comparisonMode}`)
  aRaw(`  - statistic: ${statistic}`)
  aRaw(`  - minFreqStudy: ${keynessConfig.minFreqStudy}, minFreqRef: ${keynessConfig.minFreqRef}, showNegative: ${keynessConfig.showNegative}`)
  aRaw(`  - lowercase: ${lowercase}`)
  if (useThreshold) {
    aRaw(`  - threshold: minScore=${thresholdConfig.minScore ?? '-'}, maxPValue=${thresholdConfig.maxPValue ?? '-'}`)
  }
  lines.push('')

  // --- 六、当前视图 ---
  aRaw(`## ${t('aiAssistant.keyword.keyness.sectionCurrentView')}`)
  aRaw(`  - totalKeywords: ${totalKeywords}, studySize: ${studySize}, refSize: ${refSize}`)

  if (results.length === 0) {
    aRaw('')
    a('aiAssistant.noAnalysisResult')
    return lines.join('\n')
  }

  const labelCol = comparisonMode === 'domain' ? t('keyword.results.semanticDomain') : t('keyword.results.keyword')
  const getLabel = (r: KeynessKeyword) =>
    comparisonMode === 'domain' && r.domain_name ? r.domain_name : r.keyword

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.keyword.keyness.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.keyword.keyness.tableColumnsDesc')}`)
    const sortColLabel = t(SORT_COLUMN_KEYS[sortColumn])
    const sortOrderLabel =
      sortDirection === 'asc'
        ? t('aiAssistant.keyword.keyness.sortOrderAsc')
        : t('aiAssistant.keyword.keyness.sortOrderDesc')
    aRaw(
      `  - ${t('aiAssistant.keyword.keyness.tableSortDesc')}: ${t('aiAssistant.keyword.keyness.tableSortBy', { column: sortColLabel, order: sortOrderLabel })}`
    )
    aRaw(`  - ${t('aiAssistant.keyword.keyness.tableOrderFollowsSort')}`)
    const totalFiltered = tableFilter.trim()
      ? results.filter((r) => {
          if (comparisonMode === 'domain' && r.domain_name) {
            return String(r.domain_name || '').toLowerCase().includes(tableFilter.trim().toLowerCase())
          }
          return r.keyword.toLowerCase().includes(tableFilter.trim().toLowerCase())
        }).length
      : results.length
    aRaw(
      `  - ${t('aiAssistant.keyword.keyness.tablePageDesc')}: page ${paginationConfig.page + 1}, ${paginationConfig.rowsPerPage} per page, total rows ${totalFiltered}`
    )
    if (tableFilter.trim()) {
      aRaw(`  - ${t('aiAssistant.keyword.keyness.tableFilterDesc')}: "${tableFilter.trim()}"`)
    }
    aRaw(`  - ${t('aiAssistant.keyword.keyness.tableVisibleRows')}:`)
    const visible = getVisibleTableRows(
      results,
      tableFilter,
      comparisonMode,
      sortColumn,
      sortDirection,
      paginationConfig.page,
      paginationConfig.rowsPerPage
    )
    const header = `\t${t('wordFrequency.table.rank')}\t${labelCol}\t${t('keyword.keyness.dir')}\t${t('keyword.keyness.studyFreq')}\t${t('keyword.keyness.refFreq')}\t${t('keyword.results.score')}\t${t('keyword.keyness.effect')}\t${t('keyword.keyness.sig')}`
    aRaw(header)
    visible.forEach((r) => {
      aRaw(
        `\t${r.rank}\t${getLabel(r)}\t${r.direction}\t${r.study_freq}\t${r.ref_freq}\t${r.score.toFixed(2)}\t${r.effect_size.toFixed(2)}\t${r.significance || '-'}`
      )
    })
  } else {
    aRaw(`  - ${t('aiAssistant.keyword.keyness.viewVizTab')}`)
    if (positiveOnly) {
      aRaw(`  - ${t('aiAssistant.keyword.keyness.positiveOnlyFilter')}`)
    }
    aRaw(
      `  - ${t('aiAssistant.keyword.keyness.currentChartType')}: ${t(VIZ_TAB_KEYS[vizTab])}`
    )
    aRaw(`  - ${t('aiAssistant.keyword.keyness.interpretAsChartType')}`)
    const vizData = positiveOnly ? results.filter((r) => r.direction === 'positive') : results
    aRaw(`  - ${t('aiAssistant.keyword.keyness.vizDataPrefix')} (top ${Math.min(30, vizData.length)}):`)
    vizData.slice(0, 30).forEach((r, i) => {
      aRaw(
        `\t${i + 1}\t${getLabel(r)}\t${r.direction}\t${r.score.toFixed(2)}\t${r.effect_size.toFixed(2)}`
      )
    })
  }

  return lines.join('\n')
}

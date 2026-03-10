/**
 * Builds the full AI assistant context string for Concordance (语境索引/KWIC) module.
 * Includes: data source, POS filter, search config, sort, and current view (table or visualization).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type {
  POSFilterConfig,
  SearchMode,
  SortMode,
  KWICResult,
  VizType
} from '../../types/collocation'
import { SORT_MODE_LABELS } from '../../types/collocation'

function leftStr(r: KWICResult): string {
  return (r.left_context || [])
    .map((t: { text?: string }) => t?.text ?? '')
    .join(' ')
    .trim()
}

function rightStr(r: KWICResult): string {
  return (r.right_context || [])
    .map((t: { text?: string }) => t?.text ?? '')
    .join(' ')
    .trim()
}

const VIZ_TYPE_KEYS: Record<VizType, string> = {
  densityPlot: 'aiAssistant.collocation.vizDensity',
  ridgePlot: 'aiAssistant.collocation.vizRidge'
}

export interface BuildCollocationAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: POSFilterConfig
  searchMode: SearchMode
  searchValue: string
  contextSize: number
  lowercase: boolean
  sortBy: SortMode
  sortLevels: string[]
  sortDescending: boolean
  results: KWICResult[]
  totalCount: number
  rightTab: number
  page: number
  rowsPerPage: number
  vizTab: VizType
}

export function buildCollocationAIContext(params: BuildCollocationAIContextParams): string {
  const {
    t,
    corpusSelection,
    posFilter,
    searchMode,
    searchValue,
    contextSize,
    lowercase,
    sortBy,
    sortLevels,
    sortDescending,
    results,
    totalCount,
    rightTab,
    page,
    rowsPerPage,
    vizTab
  } = params

  const lines: string[] = []
  const a = (key: string) => lines.push(t(key))
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.collocation.contextIntro'))
  lines.push('')

  // --- 一、数据源 ---
  aRaw(`## ${t('aiAssistant.collocation.sectionCorpus')}`)
  if (!corpusSelection) {
    aRaw(`${t('collocation.corpus.title')}: (none)`)
  } else {
    const mode =
      corpusSelection.dataSource === 'library'
        ? t('aiAssistant.synonym.libraryMode')
        : t('aiAssistant.synonym.corpusMode')
    aRaw(`${t('collocation.corpus.title')}: ${mode}`)
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
  aRaw(`## ${t('aiAssistant.collocation.sectionPos')}`)
  if (posFilter.selectedPOS.length === 0) {
    aRaw('  - (none)')
  } else {
    aRaw(`  - ${posFilter.keepMode ? 'keep' : 'exclude'}: ${posFilter.selectedPOS.join(', ')}`)
  }
  lines.push('')

  // --- 三、检索配置 ---
  aRaw(`## ${t('aiAssistant.collocation.sectionSearch')}`)
  aRaw(`  - searchMode: ${searchMode}, searchValue: ${searchValue || '(empty)'}`)
  aRaw(`  - contextSize: ${contextSize}, lowercase: ${lowercase}`)
  lines.push('')

  // --- 四、排序 ---
  aRaw(`## ${t('aiAssistant.collocation.sectionSort')}`)
  const sortLabel = SORT_MODE_LABELS[sortBy]
  const sortLabelText = sortLabel ? sortLabel.en : sortBy
  const levelsStr = sortLevels.length ? sortLevels.join(', ') : '-'
  const orderLabel = sortDescending
    ? t('aiAssistant.collocation.sortOrderDesc')
    : t('aiAssistant.collocation.sortOrderAsc')
  aRaw(`  - ${t('aiAssistant.collocation.sortDesc')}: ${t('aiAssistant.collocation.sortByLevels', { levels: levelsStr, order: orderLabel })} (sortBy: ${sortLabelText})`)
  lines.push('')

  // --- 五、当前视图 ---
  aRaw(`## ${t('aiAssistant.collocation.sectionCurrentView')}`)
  aRaw(`  - totalCount: ${totalCount}`)

  if (results.length === 0) {
    aRaw('')
    a('aiAssistant.noAnalysisResult')
    return lines.join('\n')
  }

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.collocation.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.collocation.tableColumnsDesc')}`)
    aRaw(`  - ${t('aiAssistant.collocation.tableOrderFollowsSort')}`)
    aRaw(
      `  - ${t('aiAssistant.collocation.tablePageDesc')}: page ${page + 1}, ${rowsPerPage} per page, total rows ${results.length}`
    )
    aRaw(`  - ${t('aiAssistant.collocation.tableVisibleRows')}:`)
    const start = page * rowsPerPage
    const visible = results.slice(start, start + rowsPerPage)
    visible.forEach((r, i) => {
      const left = leftStr(r)
      const right = rightStr(r)
      aRaw(`\t${start + i + 1}\t${left} [${r.keyword ?? ''}] ${right}`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.collocation.viewVizTab')}`)
    aRaw(
      `  - ${t('aiAssistant.collocation.currentChartType')}: ${t(VIZ_TYPE_KEYS[vizTab])}`
    )
    aRaw(`  - ${t('aiAssistant.collocation.interpretAsChartType')}`)
    aRaw(`  - ${t('aiAssistant.collocation.vizDataPrefix')} (sample ${Math.min(20, results.length)}):`)
    results.slice(0, 20).forEach((r, i) => {
      aRaw(`\t${i + 1}\t${leftStr(r)} [${r.keyword ?? ''}] ${rightStr(r)}`)
    })
  }

  return lines.join('\n')
}

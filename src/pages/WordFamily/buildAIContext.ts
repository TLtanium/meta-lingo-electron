/**
 * Builds the full AI assistant context string for Synonym (WordFamily) module.
 * Includes: data source, POS filter, search config, and current view (results table or visualization).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type { SynonymResult, SynonymVizConfig } from '../../types/synonym'

type SortField = 'word' | 'frequency' | 'synonym_count'
type SortDirection = 'asc' | 'desc'

function getVisibleTableRows(
  results: SynonymResult[],
  tableFilter: string,
  sortField: SortField,
  sortDirection: SortDirection,
  page: number,
  rowsPerPage: number
): SynonymResult[] {
  const filter = tableFilter.trim().toLowerCase()
  const filtered = filter
    ? results.filter(
        (r) =>
          r.word.toLowerCase().includes(filter) ||
          (r.all_synonyms || []).some((s) => s.toLowerCase().includes(filter))
      )
    : results
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'word':
        cmp = a.word.localeCompare(b.word)
        break
      case 'frequency':
        cmp = a.frequency - b.frequency
        break
      case 'synonym_count':
        cmp = a.synonym_count - b.synonym_count
        break
    }
    return sortDirection === 'asc' ? cmp : -cmp
  })
  const start = page * rowsPerPage
  return sorted.slice(start, start + rowsPerPage)
}

function getPosFilterLabel(posFilter: string, t: TFunction): string {
  if (posFilter === 'auto') return t('synonym.posFilter.auto')
  const key = posFilter as keyof typeof POS_LABEL_KEYS
  return t(POS_LABEL_KEYS[key] ?? 'synonym.posFilter.auto')
}

const POS_LABEL_KEYS: Record<string, string> = {
  auto: 'synonym.posFilter.auto',
  adjective: 'synonym.posFilter.adjective',
  adverb: 'synonym.posFilter.adverb',
  noun: 'synonym.posFilter.noun',
  verb: 'synonym.posFilter.verb',
  pronoun: 'synonym.posFilter.pronoun'
}

const SORT_FIELD_KEYS: Record<SortField, string> = {
  word: 'synonym.results.word',
  frequency: 'synonym.results.frequency',
  synonym_count: 'synonym.results.synonymCount'
}

export interface BuildSynonymAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  posFilter: string
  searchQuery: string
  minFreq: number
  maxResults: number
  lowercase: boolean
  results: SynonymResult[]
  totalWords: number
  uniqueWords: number
  rightTab: number
  tableFilter: string
  sortField: SortField
  sortDirection: SortDirection
  paginationConfig: { page: number; rowsPerPage: number }
  vizTab: 'network' | 'tree'
  vizConfig: SynonymVizConfig
}

export function buildSynonymAIContext(params: BuildSynonymAIContextParams): string {
  const {
    t,
    corpusSelection,
    posFilter,
    searchQuery,
    minFreq,
    maxResults,
    lowercase,
    results,
    totalWords,
    uniqueWords,
    rightTab,
    tableFilter,
    sortField,
    sortDirection,
    paginationConfig,
    vizTab,
    vizConfig
  } = params

  const lines: string[] = []
  const a = (key: string) => lines.push(t(key))
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.synonym.contextIntro'))
  lines.push('')

  // --- 一、数据源 ---
  aRaw(`## ${t('aiAssistant.synonym.sectionCorpus')}`)
  if (!corpusSelection) {
    aRaw(`${t('synonym.corpus.title')}: (none)`)
  } else {
    const mode =
      corpusSelection.dataSource === 'library'
        ? t('aiAssistant.synonym.libraryMode')
        : t('aiAssistant.synonym.corpusMode')
    aRaw(`${t('synonym.corpus.title')}: ${mode}`)
    const selMode = corpusSelection.selectionMode ?? 'all'
    if (selMode === 'all') {
      aRaw(`  - ${t('aiAssistant.synonym.selectionAll')}`)
    } else if (selMode === 'tags' || selMode === 'keywords') {
      aRaw(`  - ${t('aiAssistant.synonym.selectionByTags')}`)
      const tags = corpusSelection.selectedTags ?? corpusSelection.selectedKeywords ?? []
      if (tags.length) {
        aRaw(`  - ${t('aiAssistant.synonym.tagsLabel')}: ${tags.join(', ')}`)
      }
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
  aRaw(`## ${t('aiAssistant.synonym.sectionPos')}`)
  aRaw(`  - ${t('aiAssistant.synonym.posFilterLabel')}: ${getPosFilterLabel(posFilter, t)}`)
  lines.push('')

  // --- 三、检索配置 ---
  aRaw(`## ${t('aiAssistant.synonym.sectionSearch')}`)
  aRaw(`  - ${t('aiAssistant.synonym.searchQueryLabel')}: ${searchQuery || '(empty = all words)'}`)
  aRaw(`  - ${t('aiAssistant.synonym.minFreqLabel')}: ${minFreq}`)
  aRaw(`  - ${t('aiAssistant.synonym.maxResultsLabel')}: ${maxResults}`)
  aRaw(`  - ${t('aiAssistant.synonym.lowercaseLabel')}: ${lowercase ? 'yes' : 'no'}`)
  lines.push('')

  // --- 四、当前视图 ---
  aRaw(`## ${t('aiAssistant.synonym.sectionCurrentView')}`)
  aRaw(`  - totalWords: ${totalWords}, uniqueWords: ${uniqueWords}`)

  if (results.length === 0) {
    aRaw('')
    a('aiAssistant.noAnalysisResult')
    return lines.join('\n')
  }

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.synonym.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.synonym.tableColumnsDesc')}`)
    const sortColLabel = t(SORT_FIELD_KEYS[sortField])
    const sortOrderLabel =
      sortDirection === 'asc' ? t('aiAssistant.synonym.sortOrderAsc') : t('aiAssistant.synonym.sortOrderDesc')
    aRaw(`  - ${t('aiAssistant.synonym.tableSortDesc')}: ${t('aiAssistant.synonym.tableSortBy', { column: sortColLabel, order: sortOrderLabel })}`)
    aRaw(`  - ${t('aiAssistant.synonym.tableOrderFollowsSort')}`)
    const totalFiltered = tableFilter.trim()
      ? results.filter(
          (r) =>
            r.word.toLowerCase().includes(tableFilter.trim().toLowerCase()) ||
            (r.all_synonyms || []).some((s) => s.toLowerCase().includes(tableFilter.trim().toLowerCase()))
        ).length
      : results.length
    aRaw(
      `  - ${t('aiAssistant.synonym.tablePageDesc')}: page ${paginationConfig.page + 1}, ${paginationConfig.rowsPerPage} per page, total rows ${totalFiltered}`
    )
    if (tableFilter.trim()) {
      aRaw(`  - ${t('aiAssistant.synonym.tableFilterDesc')}: "${tableFilter.trim()}"`)
    }
    aRaw(`  - ${t('aiAssistant.synonym.tableVisibleRows')}:`)
    const visible = getVisibleTableRows(
      results,
      tableFilter,
      sortField,
      sortDirection,
      paginationConfig.page,
      paginationConfig.rowsPerPage
    )
    const header = `\t${t('synonym.results.word')}\t${t('synonym.results.frequency')}\t${t('synonym.results.posTags')}\t${t('synonym.results.synonymCount')}\t${t('synonym.results.synonyms')}`
    aRaw(header)
    visible.forEach((r) => {
      const posStr = (r.pos_tags || []).join(', ')
      const synStr = (r.all_synonyms || []).slice(0, 8).join(', ')
      aRaw(`\t${r.word}\t${r.frequency}\t${posStr}\t${r.synonym_count}\t${synStr}`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.synonym.viewVizTab')}`)
    const chartLabel =
      vizTab === 'network' ? t('aiAssistant.synonym.vizNetwork') : t('aiAssistant.synonym.vizTree')
    aRaw(`  - ${t('aiAssistant.synonym.currentChartType')}: ${chartLabel}`)
    aRaw(`  - ${t('aiAssistant.synonym.interpretAsChartType')}`)
    if (vizTab === 'network') {
      aRaw(`  - ${t('aiAssistant.synonym.vizNetworkDesc')}`)
    } else {
      aRaw(`  - ${t('aiAssistant.synonym.vizTreeDesc')}`)
    }
    const maxNodes = vizConfig.maxNodesByType?.[vizTab] ?? vizConfig.maxNodes ?? (vizTab === 'network' ? 50 : 5)
    aRaw(`  - ${t('synonym.visualization.maxNodes')}: ${maxNodes}`)
    aRaw(`  - ${t('aiAssistant.synonym.vizDataPrefix')} (top ${Math.min(maxNodes, results.length)}):`)
    results.slice(0, maxNodes).forEach((r, i) => {
      aRaw(`\t${i + 1}\t${r.word}\t${r.frequency}\t${r.synonym_count}\t${(r.all_synonyms || []).slice(0, 5).join(', ')}`)
    })
  }

  return lines.join('\n')
}

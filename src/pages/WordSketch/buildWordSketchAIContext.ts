/**
 * Builds the full AI assistant context string for Word Sketch (词图分析).
 * Includes: data source, search config, and current view (results by relation or visualization).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type { WordSketchResult, RelationData } from '../../api/sketch'

export interface BuildWordSketchAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  searchWord: string
  posFilter: string
  minFrequency: number
  resultsPerRelation: number
  minScore: number
  result: WordSketchResult | null
  rightTab: number
  selectedVisualizationRelation: string
  lang: 'zh' | 'en'
}

const MAX_RELATIONS_SAMPLE = 12
const MAX_COLLOCATES_PER_RELATION = 10

export function buildWordSketchAIContext(params: BuildWordSketchAIContextParams): string {
  const {
    t,
    corpusSelection,
    searchWord,
    posFilter,
    minFrequency,
    resultsPerRelation,
    minScore,
    result,
    rightTab,
    selectedVisualizationRelation,
    lang
  } = params

  const lines: string[] = []
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.wordSketch.contextIntro'))
  lines.push('')

  aRaw(`## ${t('aiAssistant.wordSketch.sectionCorpus')}`)
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

  aRaw(`## ${t('aiAssistant.wordSketch.sectionSearch')}`)
  aRaw(`  - searchWord: ${searchWord || '(empty)'}, posFilter: ${posFilter}, minFrequency: ${minFrequency}, resultsPerRelation: ${resultsPerRelation}, minScore: ${minScore}`)
  lines.push('')

  aRaw(`## ${t('aiAssistant.wordSketch.sectionCurrentView')}`)

  if (!result || !result.relations || Object.keys(result.relations).length === 0) {
    lines.push('')
    aRaw(t('aiAssistant.noAnalysisResult'))
    return lines.join('\n')
  }

  const relationEntries = Object.entries(result.relations).slice(0, MAX_RELATIONS_SAMPLE)

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.wordSketch.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.wordSketch.tableOrderFollowsSort')}`)
    aRaw(`  - ${t('aiAssistant.wordSketch.relationSummary')}:`)
    aRaw(`  - Word: "${result.word}", total_instances: ${result.total_instances}, relation_count: ${result.relation_count}`)
    relationEntries.forEach(([relName, relData]: [string, RelationData]) => {
      const displayName = lang === 'zh' ? (relData.display_zh || relData.display_en || relName) : (relData.display_en || relData.display_zh || relName)
      const colls = (relData.collocations || []).slice(0, MAX_COLLOCATES_PER_RELATION)
      const collStr = colls.map(c => `${c.word || c.lemma}(${c.frequency},${c.score?.toFixed(1) ?? ''})`).join(', ')
      aRaw(`    - ${displayName}: ${collStr}`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.wordSketch.viewVizTab')}`)
    aRaw(`  - selectedRelation: ${selectedVisualizationRelation}`)
    aRaw(`  - ${t('aiAssistant.wordSketch.interpretAsChartType')}`)
    aRaw(`  - ${t('aiAssistant.wordSketch.relationSummary')}:`)
    relationEntries.forEach(([relName, relData]: [string, RelationData]) => {
      const displayName = lang === 'zh' ? (relData.display_zh || relData.display_en || relName) : (relData.display_en || relData.display_zh || relName)
      const colls = (relData.collocations || []).slice(0, 5)
      const collStr = colls.map(c => `${c.word || c.lemma}`).join(', ')
      aRaw(`    - ${displayName}: ${collStr}`)
    })
  }

  return lines.join('\n')
}

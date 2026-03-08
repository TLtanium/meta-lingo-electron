/**
 * Builds the full AI assistant context string for Word Sketch Difference (词图对比).
 * Includes: data source, compare config, and current view (results by relation or visualization).
 */

import type { TFunction } from 'i18next'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type { SketchDifferenceResult, RelationData } from '../../api/sketch'

export interface BuildWordSketchDiffAIContextParams {
  t: TFunction
  corpusSelection: CorpusOrLibrarySelection | null
  word1: string
  word2: string
  posFilter: string
  minFrequency: number
  compareMode: 'lemmas' | 'word_form'
  result: SketchDifferenceResult | null
  rightTab: number
  selectedVisualizationRelation: string
  lang: 'zh' | 'en'
}

const MAX_RELATIONS_SAMPLE = 12
const MAX_COLLOCATES_PER_RELATION = 10

function getMergedSample(relData: RelationData): { word: string; freq1: number; freq2: number; score1: number; score2: number; scoreDiff: number }[] {
  const out: { word: string; freq1: number; freq2: number; score1: number; score2: number; scoreDiff: number }[] = []
  const seen = new Set<string>()
  const add = (word: string, lemma: string, f1: number, f2: number, s1: number, s2: number) => {
    const key = (lemma || word).trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ word: word || lemma, freq1: f1, freq2: f2, score1: s1, score2: s2, scoreDiff: s1 - s2 })
  }
  ;(relData.shared || []).forEach(c => {
    add(c.word || c.lemma, c.lemma || '', c.freq1 ?? c.frequency ?? 0, c.freq2 ?? 0, c.score1 ?? c.score ?? 0, c.score2 ?? 0)
  })
  ;(relData.word1_only || []).forEach(c => {
    add(c.word || c.lemma, c.lemma || '', c.frequency ?? 0, 0, c.score ?? 0, 0)
  })
  ;(relData.word2_only || []).forEach(c => {
    add(c.word || c.lemma, c.lemma || '', 0, c.frequency ?? 0, 0, c.score ?? 0)
  })
  out.sort((a, b) => b.scoreDiff - a.scoreDiff)
  return out.slice(0, MAX_COLLOCATES_PER_RELATION)
}

export function buildWordSketchDiffAIContext(params: BuildWordSketchDiffAIContextParams): string {
  const {
    t,
    corpusSelection,
    word1,
    word2,
    posFilter,
    minFrequency,
    compareMode,
    result,
    rightTab,
    selectedVisualizationRelation,
    lang
  } = params

  const lines: string[] = []
  const aRaw = (s: string) => lines.push(s)

  aRaw(t('aiAssistant.wordSketchDiff.contextIntro'))
  lines.push('')

  aRaw(`## ${t('aiAssistant.wordSketchDiff.sectionCorpus')}`)
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

  aRaw(`## ${t('aiAssistant.wordSketchDiff.sectionCompare')}`)
  aRaw(`  - word1: ${word1 || '(empty)'}, word2: ${word2 || '(empty)'}, posFilter: ${posFilter}, minFrequency: ${minFrequency}, compareMode: ${compareMode}`)
  lines.push('')

  aRaw(`## ${t('aiAssistant.wordSketchDiff.sectionCurrentView')}`)

  if (!result || !result.relations || Object.keys(result.relations).length === 0) {
    lines.push('')
    aRaw(t('aiAssistant.noAnalysisResult'))
    return lines.join('\n')
  }

  const summary = result.summary || { word1_total_relations: 0, word2_total_relations: 0, common_relations: 0 }
  const relationEntries = Object.entries(result.relations).slice(0, MAX_RELATIONS_SAMPLE)

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.wordSketchDiff.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.wordSketchDiff.relationSummary')}:`)
    aRaw(`  - Comparing "${result.word1}" vs "${result.word2}", common_relations: ${summary.common_relations}`)
    relationEntries.forEach(([relName, relData]) => {
      if (!relData) return
      const displayName = lang === 'zh' ? (relData.display_zh || relData.display_en || relName) : (relData.display_en || relData.display_zh || relName)
      const merged = getMergedSample(relData)
      const sampleStr = merged.map(m => `${m.word}(f1:${m.freq1},f2:${m.freq2},Δ:${m.scoreDiff.toFixed(1)})`).join(', ')
      aRaw(`    - ${displayName}: ${sampleStr}`)
    })
  } else {
    aRaw(`  - ${t('aiAssistant.wordSketchDiff.viewVizTab')}`)
    aRaw(`  - selectedRelation: ${selectedVisualizationRelation}`)
    aRaw(`  - ${t('aiAssistant.wordSketchDiff.interpretAsChartType')}`)
    aRaw(`  - ${t('aiAssistant.wordSketchDiff.relationSummary')}:`)
    relationEntries.forEach(([relName, relData]) => {
      if (!relData) return
      const displayName = lang === 'zh' ? (relData.display_zh || relData.display_en || relName) : (relData.display_en || relData.display_zh || relName)
      const merged = getMergedSample(relData)
      const sampleStr = merged.slice(0, 5).map(m => m.word).join(', ')
      aRaw(`    - ${displayName}: ${sampleStr}`)
    })
  }

  return lines.join('\n')
}

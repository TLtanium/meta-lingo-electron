/**
 * Builds the full AI assistant context string for Topic Modeling (BERTopic, LDA, LSA, NMF).
 * Includes: data source, analysis params, and current view (results topic list or visualization).
 */

import type { TFunction } from 'i18next'
import type {
  PreprocessConfig,
  ChunkingConfig,
  DynamicTopicConfig,
  LDAPreprocessConfig,
  LDAConfig,
  LDADynamicConfig,
  LSAPreprocessConfig,
  LSAConfig,
  LSADynamicConfig,
  NMFPreprocessConfig,
  NMFConfig,
  NMFDynamicConfig
} from '../../types/topicModeling'
import type { BERTopicAnalysisConfigSnapshot } from './AnalysisPanel'

export type TopicModelingMethod = 'bertopic' | 'lda' | 'lsa' | 'nmf'

export interface TopicModelingCorpusInput {
  corpusId?: string
  textIds?: string[] | 'all'
  textCount?: number
  selectionMode?: 'all' | 'tags' | 'selected'
  selectedTags?: string[]
  libraryId?: string
  selectedEntryIds?: string[]
  corpusLanguage?: string
}

export interface TopicModelingTopicItem {
  topic_id?: number
  id?: number
  name?: string
  custom_label?: string
  keywords?: Array<{ word: string; weight?: number }>
  words?: Array<{ word: string; weight?: number }>
}

export interface TopicOverTimeItem {
  timestamp?: string
  topic_name?: string
  words?: string
  frequency?: number
  topic?: number
}

export interface BuildTopicModelingAIContextParams {
  t: TFunction
  method: TopicModelingMethod
  corpus: TopicModelingCorpusInput | null
  topics: TopicModelingTopicItem[]
  topicsOverTime?: TopicOverTimeItem[]
  hasDynamicTopics?: boolean
  rightTab: number
  // BERTopic: pass raw configs, builder formats them
  bertopicPreprocess?: PreprocessConfig
  bertopicChunking?: ChunkingConfig
  bertopicDynamic?: DynamicTopicConfig
  bertopicAnalysis?: BERTopicAnalysisConfigSnapshot | null
  // LDA
  ldaPreprocess?: LDAPreprocessConfig
  ldaConfig?: LDAConfig
  ldaDynamic?: LDADynamicConfig
  // LSA
  lsaPreprocess?: LSAPreprocessConfig
  lsaConfig?: LSAConfig
  lsaDynamic?: LSADynamicConfig
  // NMF
  nmfPreprocess?: NMFPreprocessConfig
  nmfConfig?: NMFConfig
  nmfDynamic?: NMFDynamicConfig
}

const CONTEXT_INTRO_KEYS: Record<TopicModelingMethod, string> = {
  bertopic: 'aiAssistant.topicModeling.bertopic.contextIntro',
  lda: 'aiAssistant.topicModeling.lda.contextIntro',
  lsa: 'aiAssistant.topicModeling.lsa.contextIntro',
  nmf: 'aiAssistant.topicModeling.nmf.contextIntro'
}

/** Build param lines for the Params section from raw configs (same paradigm as WordFrequency: builder receives configs and formats internally) */
function buildParamsLines(method: TopicModelingMethod, p: BuildTopicModelingAIContextParams): string[] {
  const lines: string[] = []
  if (method === 'bertopic') {
    const pre = p.bertopicPreprocess
    const chunk = p.bertopicChunking
    const dyn = p.bertopicDynamic
    if (pre) {
      lines.push(`Preprocess: remove_stopwords=${pre.remove_stopwords}, remove_punctuation=${pre.remove_punctuation}, lemmatize=${pre.lemmatize}, lowercase=${pre.lowercase}, min_token_length=${pre.min_token_length}, pos_filter=${pre.pos_filter?.length ? pre.pos_filter.join(',') : 'none'}`)
    }
    if (chunk) {
      lines.push(`Chunking: enabled=${chunk.enabled}, min_tokens=${chunk.min_tokens}, max_tokens=${chunk.max_tokens}, overlap_tokens=${chunk.overlap_tokens}`)
    }
    if (dyn) {
      lines.push(`Dynamic topic: enabled=${dyn.enabled}, date_format=${dyn.date_format}, nr_bins=${dyn.nr_bins ?? 'auto'}, evolution_tuning=${dyn.evolution_tuning}, global_tuning=${dyn.global_tuning}`)
    }
    const analysis = p.bertopicAnalysis
    if (analysis) {
      const dr = analysis.dimReduction
      lines.push(`Dim reduction: method=${dr.method}, n_components=${dr.params.n_components ?? ''}, n_neighbors=${dr.params.n_neighbors ?? ''}, min_dist=${dr.params.min_dist ?? ''}, metric=${dr.params.metric ?? ''}, svd_solver=${dr.params.svd_solver ?? ''}`)
      const cl = analysis.clustering
      lines.push(`Clustering: method=${cl.method}, min_cluster_size=${cl.params.min_cluster_size ?? ''}, min_samples=${cl.params.min_samples ?? ''}, metric=${cl.params.metric ?? ''}, cluster_selection_method=${cl.params.cluster_selection_method ?? ''}, n_clusters=${cl.params.n_clusters ?? ''}, threshold=${cl.params.threshold ?? ''}, branching_factor=${cl.params.branching_factor ?? ''}`)
      const v = analysis.vectorizer
      lines.push(`Vectorizer: type=${v.type}, min_df=${v.params.min_df}, max_df=${v.params.max_df}, ngram_range=${(v.params.ngram_range ?? [1, 1]).join('-')}, stopwords=${analysis.removeStopwords ? 'yes' : 'no'}`)
      const rep = analysis.representationModel
      lines.push(`Representation: ${rep.type ?? 'c-TF-IDF'}` + (rep.params && Object.keys(rep.params).length ? `, params=${JSON.stringify(rep.params)}` : ''))
      const out = analysis.outlierConfig
      lines.push(`Outlier reduction: enabled=${out.enabled}, strategy=${out.strategy}, threshold=${out.threshold}`)
    }
  } else if (method === 'lda' && p.ldaPreprocess && p.ldaConfig && p.ldaDynamic) {
    const pre = p.ldaPreprocess
    const lda = p.ldaConfig
    const dyn = p.ldaDynamic
    lines.push(`Preprocess: remove_stopwords=${pre.remove_stopwords}, remove_punctuation=${pre.remove_punctuation}, lemmatize=${pre.lemmatize}, lowercase=${pre.lowercase}, min_word_length=${pre.min_word_length}, pos_filter=${pre.pos_filter?.join(',') ?? ''}, pos_keep_mode=${pre.pos_keep_mode}, ngram_enabled=${pre.ngram_enabled}, ngram_n_values=${(pre.ngram_n_values ?? []).join(',')}, min_df=${pre.min_df}, max_df=${pre.max_df}`)
    lines.push(`LDA: num_topics=${lda.num_topics}, top_n_keywords=${lda.top_n_keywords}, alpha=${lda.alpha}, eta=${lda.eta}, passes=${lda.passes}, iterations=${lda.iterations}, chunksize=${lda.chunksize}, update_every=${lda.update_every}, eval_every=${lda.eval_every}, minimum_probability=${lda.minimum_probability}, min_df=${lda.min_df}, max_df=${lda.max_df}, random_state=${lda.random_state}`)
    lines.push(`Dynamic topic: enabled=${dyn.enabled}, date_format=${dyn.date_format}, nr_bins=${dyn.nr_bins ?? 'auto'}`)
  } else if (method === 'lsa' && p.lsaPreprocess && p.lsaConfig && p.lsaDynamic) {
    const pre = p.lsaPreprocess
    const lsa = p.lsaConfig
    const dyn = p.lsaDynamic
    lines.push(`Preprocess: remove_stopwords=${pre.remove_stopwords}, remove_punctuation=${pre.remove_punctuation}, lemmatize=${pre.lemmatize}, lowercase=${pre.lowercase}, min_word_length=${pre.min_word_length}, pos_filter=${pre.pos_filter?.join(',') ?? ''}, pos_keep_mode=${pre.pos_keep_mode}, ngram_enabled=${pre.ngram_enabled}, ngram_n_values=${(pre.ngram_n_values ?? []).join(',')}, min_df=${pre.min_df}, max_df=${pre.max_df}`)
    lines.push(`LSA: num_topics=${lsa.num_topics}, num_keywords=${lsa.num_keywords}, svd_algorithm=${lsa.svd_algorithm}, max_features=${lsa.max_features}, min_df=${lsa.min_df}, max_df=${lsa.max_df}, tol=${lsa.tol}, random_state=${lsa.random_state}, n_iter=${lsa.n_iter}, n_oversamples=${lsa.n_oversamples}, power_iteration_normalizer=${lsa.power_iteration_normalizer}`)
    lines.push(`Dynamic topic: enabled=${dyn.enabled}, date_format=${dyn.date_format}, nr_bins=${dyn.nr_bins ?? 'auto'}`)
  } else if (method === 'nmf' && p.nmfPreprocess && p.nmfConfig && p.nmfDynamic) {
    const pre = p.nmfPreprocess
    const nmf = p.nmfConfig
    const dyn = p.nmfDynamic
    lines.push(`Preprocess: remove_stopwords=${pre.remove_stopwords}, remove_punctuation=${pre.remove_punctuation}, lemmatize=${pre.lemmatize}, lowercase=${pre.lowercase}, min_word_length=${pre.min_word_length}, pos_filter=${pre.pos_filter?.join(',') ?? ''}, pos_keep_mode=${pre.pos_keep_mode}, ngram_enabled=${pre.ngram_enabled}, ngram_n_values=${(pre.ngram_n_values ?? []).join(',')}, min_df=${pre.min_df}, max_df=${pre.max_df}`)
    lines.push(`NMF: num_topics=${nmf.num_topics}, num_keywords=${nmf.num_keywords}, init=${nmf.init}, solver=${nmf.solver}, max_iter=${nmf.max_iter}, tol=${nmf.tol}, alpha_W=${nmf.alpha_W}, alpha_H=${nmf.alpha_H}, l1_ratio=${nmf.l1_ratio}, beta_loss=${nmf.beta_loss}, shuffle=${nmf.shuffle}, random_state=${nmf.random_state}, max_features=${nmf.max_features}, min_df=${nmf.min_df}, max_df=${nmf.max_df}`)
    lines.push(`Dynamic topic: enabled=${dyn.enabled}, date_format=${dyn.date_format}, nr_bins=${dyn.nr_bins ?? 'auto'}`)
  }
  return lines
}

function getTopicKeywords(topic: TopicModelingTopicItem, topN = 5): string[] {
  const arr = topic.keywords ?? topic.words ?? []
  const words = arr.map((k: { word: string }) => (k?.word ?? '').trim()).filter(Boolean)
  return words.slice(0, topN)
}

function getTopicLabel(topic: TopicModelingTopicItem): string {
  return (topic.custom_label ?? topic.name ?? topic.topic_id ?? topic.id ?? '').toString()
}

export function buildTopicModelingAIContext(params: BuildTopicModelingAIContextParams): string {
  const { t, method, corpus, topics, topicsOverTime, hasDynamicTopics, rightTab } = params

  const lines: string[] = []
  const aRaw = (s: string) => lines.push(s)

  aRaw(t(CONTEXT_INTRO_KEYS[method]))
  lines.push('')

  aRaw(`## ${t('aiAssistant.topicModeling.sectionCorpus')}`)
  if (!corpus?.corpusId) {
    aRaw(`${t('topicModeling.corpus.title')}: (none)`)
  } else {
    const mode = corpus.libraryId ? t('aiAssistant.synonym.libraryMode') : t('aiAssistant.synonym.corpusMode')
    aRaw(`${t('topicModeling.corpus.title')}: ${mode}`)
    const selMode = corpus.selectionMode ?? 'all'
    if (selMode === 'all') aRaw(`  - ${t('aiAssistant.synonym.selectionAll')}`)
    else if (selMode === 'tags' || selMode === 'keywords') {
      aRaw(`  - ${t('aiAssistant.synonym.selectionByTags')}`)
      const tags = corpus.selectedTags ?? []
      if (tags.length) aRaw(`  - ${t('aiAssistant.synonym.tagsLabel')}: ${tags.join(', ')}`)
    } else {
      aRaw(`  - ${t('aiAssistant.synonym.selectionManual')}`)
      const ids = corpus.selectedEntryIds ?? []
      aRaw(`  - ${t('aiAssistant.synonym.entryIdsCount')}: ${ids.length}`)
    }
    const count = corpus.textCount ?? (Array.isArray(corpus.textIds) ? corpus.textIds.length : (corpus.textIds === 'all' ? 'all' : 0))
    aRaw(`  - ${t('aiAssistant.synonym.textsCount')}: ${count}`)
    if (corpus.corpusLanguage) aRaw(`  - ${t('aiAssistant.synonym.languageLabel')}: ${corpus.corpusLanguage}`)
  }
  lines.push('')

  aRaw(`## ${t('aiAssistant.topicModeling.sectionParams')}`)
  const paramLines = buildParamsLines(method, params)
  paramLines.forEach(l => aRaw(`  - ${l.trim()}`))
  lines.push('')

  aRaw(`## ${t('aiAssistant.topicModeling.sectionCurrentView')}`)

  if (!topics.length) {
    lines.push('')
    aRaw(t('aiAssistant.noAnalysisResult'))
    return lines.join('\n')
  }

  const topicListSample = topics.slice(0, 20)
  const topicListLines = topicListSample.map((topic, i) => {
    const label = getTopicLabel(topic)
    const kws = getTopicKeywords(topic).join(', ')
    return `${i + 1}. ${label}: ${kws}`
  })

  if (rightTab === 0) {
    aRaw(`  - ${t('aiAssistant.topicModeling.viewResultsTab')}`)
    aRaw(`  - ${t('aiAssistant.topicModeling.topicListDesc')} (${topics.length} topics, sample below):`)
    topicListLines.forEach(l => aRaw(`    ${l}`))
  } else {
    aRaw(`  - ${t('aiAssistant.topicModeling.viewVizTab')}`)
    aRaw(`  - ${t('aiAssistant.topicModeling.topicListDesc')} (${topics.length} topics, sample below):`)
    topicListLines.forEach(l => aRaw(`    ${l}`))
  }

  if (hasDynamicTopics && topicsOverTime && topicsOverTime.length > 0) {
    lines.push('')
    aRaw(t('aiAssistant.topicModeling.topicsOverTimeDesc'))
    const byTs = topicsOverTime.reduce<Record<string, string[]>>((acc, item) => {
      const ts = (item.timestamp ?? '').toString()
      if (!acc[ts]) acc[ts] = []
      acc[ts].push(`${item.topic_name ?? ''} (${(item.words ?? '').slice(0, 80)}) freq=${item.frequency ?? 0}`)
      return acc
    }, {})
    Object.entries(byTs).slice(0, 15).forEach(([ts, items]) => {
      aRaw(`  ${ts}:`)
      items.slice(0, 8).forEach(item => aRaw(`    - ${item}`))
    })
  }

  return lines.join('\n')
}

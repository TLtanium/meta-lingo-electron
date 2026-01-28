// Analysis result types

export interface WordFrequencyResult {
  word: string
  frequency: number
  percentage: number
  rank: number
}

export interface WordFamilyResult {
  headword: string
  family: string[]
  totalFrequency: number
  members: WordFrequencyResult[]
}

export interface KeywordResult {
  keyword: string
  score: number
  frequency: number
  keyness: number
}

export interface NGramResult {
  ngram: string[]
  frequency: number
  percentage: number
}

export interface CollocationResult {
  collocate: string
  frequency: number
  score: number // MI score, t-score, etc.
  position: 'left' | 'right' | 'both'
}

export interface KWICResult {
  left: string
  keyword: string
  right: string
  sourceText: string
  position: number
}

export interface WordSketchResult {
  word: string
  grammarRelations: GrammarRelation[]
}

export interface GrammarRelation {
  relation: string
  collocates: CollocationResult[]
}

export interface TopicModelResult {
  topics: Topic[]
  documentTopics: DocumentTopic[]
}

export interface Topic {
  id: number
  words: TopicWord[]
  label?: string
}

export interface TopicWord {
  word: string
  weight: number
}

export interface DocumentTopic {
  documentId: string
  topicDistribution: number[]
  dominantTopic: number
}

export type TopicModelType = 'bertopic' | 'lda' | 'lsa' | 'nmf' | 'dtm'

export type CollocationMode = 'standard' | 'grammar' | 'wordsketch'

export interface AnalysisParams {
  corpusSelection: import('./corpus').CorpusSelection
  options?: Record<string, unknown>
}

export interface NGramParams extends AnalysisParams {
  n: number
  minFrequency?: number
}

export interface CollocationParams extends AnalysisParams {
  node: string
  windowSize: number
  minFrequency?: number
  measure: 'mi' | 'tscore' | 'logdice' | 'frequency'
  mode: CollocationMode
}

export interface TopicModelParams extends AnalysisParams {
  modelType: TopicModelType
  numTopics?: number
}


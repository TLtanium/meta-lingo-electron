/**
 * Cross-module linking types
 * Used for navigating between analysis modules with shared context
 */

export type SelectionMode = 'all' | 'selected' | 'tags'

/** Match mode for CQL queries */
export type MatchMode = 'word' | 'lemma'

/** Source module for cross-link */
export type SourceModule = 'wordFrequency' | 'semantic' | 'metaphor' | 'wordSketch' | 'ngram' | 'keyword' | 'synonym'

/**
 * Parameters passed when opening a new tab from another module
 */
export interface CrossLinkParams {
  /** The word or phrase to search for */
  searchWord: string
  /** The corpus ID to use */
  corpusId: string
  /** Selected text IDs or 'all' */
  textIds: string[] | 'all'
  /** How texts were selected */
  selectionMode: SelectionMode
  /** Selected tags (when selectionMode is 'tags') */
  selectedTags?: string[]
  /** Whether to automatically trigger search on load */
  autoSearch?: boolean
  /** Words to highlight in context (e.g., collocate words from Word Sketch) */
  highlightWords?: string[]
  /** Words that must appear in context to filter results (e.g., collocate from Word Sketch) */
  contextFilterWords?: string[]
  
  // CQL-related fields for precise cross-module matching (2026-01)
  /** Generated CQL query for precise grammatical matching */
  cqlQuery?: string
  /** Match mode: word form or lemma */
  matchMode?: MatchMode
  /** Grammar relation name from Word Sketch (e.g., 'object', 'subject') */
  relationName?: string
  /** Dependency pattern for the grammatical relation (e.g., 'dobj', 'nsubj') */
  depPattern?: string
  /** Force search mode to CQL when cqlQuery is provided */
  forceSearchMode?: 'cql' | 'simple' | 'lemma' | 'phrase' | 'word' | 'character'
  
  // KWIC display control for multi-token CQL matches (2026-01)
  /** The lemma that should be displayed as KWIC keyword (main word from Word Sketch) */
  kwicKeywordLemma?: string
  /** The lemma that should be highlighted in context (collocate from Word Sketch) */
  kwicHighlightLemma?: string
  
  // Source module identification (2026-01-27)
  /** The module that initiated the cross-link (for default settings) */
  sourceModule?: SourceModule
}

/**
 * Props for modules that can receive cross-link parameters
 */
export interface CrossLinkableProps {
  crossLinkParams?: CrossLinkParams
}


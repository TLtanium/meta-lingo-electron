/**
 * Cross-module linking types
 * Used for navigating between analysis modules with shared context
 */

export type SelectionMode = 'all' | 'selected' | 'tags'

/** Match mode for CQL queries */
export type MatchMode = 'word' | 'lemma'

/** Source module for cross-link */
export type SourceModule = 'wordFrequency' | 'semantic' | 'metaphor' | 'wordSketch' | 'ngram' | 'keyword' | 'synonym' | 'collocationAnalysis' | 'sentiment'

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
  /** When linking from library mode, the library id so target can sync selector */
  libraryId?: string
  /** When library + manual selection, entry IDs so target can restore exact selection without depending on first page of entries */
  selectedEntryIds?: string[]
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
  /** Context size for co-occurrence analysis (synced from collocation span) */
  contextSize?: number
  /** Target sub-tab index when opening a multi-tab module (e.g., WordSketch tabs 0/1/2) */
  targetSubTab?: number

  // N-gram specific settings (2026-02)
  /** N values to pre-select in N-gram analysis (e.g. [2,3,4] for Bigram/Trigram/4-gram) */
  ngramValues?: number[]
  /** Search type to pre-select in N-gram analysis (e.g. 'contains') */
  ngramSearchType?: string
  /** Target sub-tab index within the opened module (e.g. for Collocation: 0=results, 1=visualization) */
  targetSubTab?: number

  // Semantic domain → Collocation (2026-02)
  /** Semantic domain code (normalized, no _MWE) when linking from semantic domain row */
  semanticDomain?: string
  /** Match mode for semantic domain in CQL: exact or contains */
  semanticDomainMatch?: 'exact' | 'contains'

  /** When linking to Collocation: default "ignore case" (忽略大小写) to checked */
  ignoreCase?: boolean

  // Other modules → Semantic domain analysis (2026-02)
  /** Open semantic in "by domain" mode with search */
  semanticResultMode?: 'domain'
  /** Search type in semantic (e.g. 'contains') */
  semanticSearchType?: string
  /** Search value (linked word) for semantic analysis */
  semanticSearchValue?: string
}

/**
 * Props for modules that can receive cross-link parameters
 */
export interface CrossLinkableProps {
  crossLinkParams?: CrossLinkParams
}


/**
 * Synonym Analysis Types
 * Types for synonym analysis using NLTK WordNet
 */

// POS filter option
export interface POSOption {
  value: string;
  label_en: string;
  label_zh: string;
}

// Synset information from WordNet
export interface Synset {
  name: string;          // Synset ID (e.g., "dog.n.01")
  pos: string;           // Part of speech
  definition: string;    // Definition text
  examples: string[];    // Example sentences
  synonyms: string[];    // Synonym words in this synset
}

// Single synonym result item
export interface SynonymResult {
  word: string;              // The word (lemma)
  frequency: number;         // Frequency in corpus
  pos_tags: string[];        // SpaCy POS tags found
  synsets: Synset[];         // WordNet synsets
  all_synonyms: string[];    // All synonyms combined
  synonym_count: number;     // Total synonym count
}

// Synonym analysis request
export interface SynonymRequest {
  corpus_id: string;
  text_ids: string[] | 'all';
  pos_filter: string;        // auto/adjective/adverb/noun/verb/pronoun
  search_query: string;
  min_freq: number;
  max_results: number;
  lowercase: boolean;
}

// Synonym analysis response
export interface SynonymResponse {
  success: boolean;
  results: SynonymResult[];
  total_words: number;
  unique_words: number;
  error?: string;
}

// Single word synonym lookup response
export interface WordSynonymResponse {
  success: boolean;
  word: string;
  synsets: Synset[];
  all_synonyms: string[];
  synonym_count: number;
  error?: string;
}

// Visualization config for synonym network
export interface SynonymVizConfig {
  type: 'network' | 'tree' | 'list';
  maxNodes: number;  // For backward compatibility, but use maxNodesByType instead
  maxNodesByType?: {
    network?: number;
    tree?: number;
    list?: number;
  };
  showDefinitions: boolean;
  colorScheme: string;
}

// Default values
export const DEFAULT_SYNONYM_REQUEST: Omit<SynonymRequest, 'corpus_id'> = {
  text_ids: 'all',
  pos_filter: 'auto',
  search_query: '',
  min_freq: 1,
  max_results: 100,
  lowercase: true,
};

export const DEFAULT_VIZ_CONFIG: SynonymVizConfig = {
  type: 'network',
  maxNodes: 50,  // For backward compatibility
  maxNodesByType: {
    network: 50,
    tree: 5,
    list: 200
  },
  showDefinitions: true,
  colorScheme: 'default',
};

// POS filter options (for UI)
export const POS_FILTER_OPTIONS: POSOption[] = [
  { value: 'auto', label_en: 'Auto-detect', label_zh: '自动检测' },
  { value: 'adjective', label_en: 'Adjective', label_zh: '形容词' },
  { value: 'adverb', label_en: 'Adverb', label_zh: '副词' },
  { value: 'noun', label_en: 'Noun', label_zh: '名词' },
  { value: 'verb', label_en: 'Verb', label_zh: '动词' },
  { value: 'pronoun', label_en: 'Pronoun', label_zh: '代词' },
];

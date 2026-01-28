/**
 * CQL Builder Constants
 * Constants and configuration for CQL visual builder
 */

import type { TokenAttribute, ComparisonOperator, AddElementOption } from './types'

/**
 * Available token attributes - basic and head-based for dependency constraints
 */
export const TOKEN_ATTRIBUTES: {
  value: TokenAttribute
  label: { zh: string; en: string }
  description: { zh: string; en: string }
  category?: 'basic' | 'head'  // For grouping in UI
}[] = [
  // Basic attributes
  {
    value: 'word',
    label: { zh: '词形', en: 'Word' },
    description: { zh: '匹配原始词形', en: 'Match the original word form' },
    category: 'basic'
  },
  {
    value: 'lemma',
    label: { zh: '词元', en: 'Lemma' },
    description: { zh: '匹配词元(基本形式)', en: 'Match the lemma (base form)' },
    category: 'basic'
  },
  {
    value: 'pos',
    label: { zh: '词性 (Universal)', en: 'POS (Universal)' },
    description: { zh: '匹配Universal POS标签', en: 'Match Universal POS tag' },
    category: 'basic'
  },
  {
    value: 'tag',
    label: { zh: '词性 (Penn)', en: 'POS (Penn)' },
    description: { zh: '匹配Penn Treebank细粒度标签', en: 'Match Penn Treebank fine-grained tag' },
    category: 'basic'
  },
  {
    value: 'dep',
    label: { zh: '依存关系', en: 'Dependency' },
    description: { zh: '匹配依存关系标签', en: 'Match dependency relation' },
    category: 'basic'
  },
  // Head-based attributes for dependency constraints
  {
    value: 'headword',
    label: { zh: '头词词形', en: 'Head Word' },
    description: { zh: '匹配语法头词的词形', en: 'Match head token word form' },
    category: 'head'
  },
  {
    value: 'headlemma',
    label: { zh: '头词词元', en: 'Head Lemma' },
    description: { zh: '匹配语法头词的词元', en: 'Match head token lemma' },
    category: 'head'
  },
  {
    value: 'headpos',
    label: { zh: '头词词性', en: 'Head POS' },
    description: { zh: '匹配语法头词的词性', en: 'Match head token POS' },
    category: 'head'
  },
  {
    value: 'headdep',
    label: { zh: '头词依存关系', en: 'Head Dep' },
    description: { zh: '匹配语法头词的依存关系', en: 'Match head token dependency' },
    category: 'head'
  }
]

/**
 * Comparison operators
 */
export const COMPARISON_OPERATORS: {
  value: ComparisonOperator
  label: string
  description: { zh: string; en: string }
}[] = [
  {
    value: '=',
    label: '=',
    description: { zh: '正则匹配', en: 'Regex match' }
  },
  {
    value: '!=',
    label: '!=',
    description: { zh: '正则不匹配', en: 'Regex not match' }
  },
  {
    value: '==',
    label: '==',
    description: { zh: '精确匹配', en: 'Exact match' }
  },
  {
    value: '!==',
    label: '!==',
    description: { zh: '精确不匹配', en: 'Exact not match' }
  }
]

/**
 * Add element menu options
 */
export const ADD_ELEMENT_OPTIONS: AddElementOption[] = [
  {
    type: 'normal_token',
    label: { zh: '普通 Token', en: 'Normal Token' },
    description: { zh: '定义一个具体的词或词元', en: 'Define a specific word or lemma' },
    icon: 'TextFields',
    preview: '[attr="value"]'
  },
  {
    type: 'unspecified_token',
    label: { zh: '任意 Token', en: 'Unspecified Token' },
    description: { zh: '匹配任意一个词', en: 'Match any single token' },
    icon: 'HelpOutline',
    preview: '[]'
  },
  {
    type: 'distance',
    label: { zh: '距离', en: 'Distance' },
    description: { zh: '指定Token之间的距离范围', en: 'Specify distance range between tokens' },
    icon: 'SwapHoriz',
    preview: '[]{min,max}'
  },
  {
    type: 'or',
    label: { zh: '或 (OR)', en: 'OR' },
    description: { zh: '连接两个查询选项', en: 'Connect two query options' },
    icon: 'CallSplit',
    preview: '|'
  }
]

/**
 * Common POS tags for Universal Dependencies
 */
export const UNIVERSAL_POS_TAGS = [
  { value: 'ADJ', label: { zh: '形容词', en: 'Adjective' } },
  { value: 'ADP', label: { zh: '介词', en: 'Adposition' } },
  { value: 'ADV', label: { zh: '副词', en: 'Adverb' } },
  { value: 'AUX', label: { zh: '助动词', en: 'Auxiliary' } },
  { value: 'CCONJ', label: { zh: '并列连词', en: 'Coord. Conj.' } },
  { value: 'DET', label: { zh: '限定词', en: 'Determiner' } },
  { value: 'INTJ', label: { zh: '感叹词', en: 'Interjection' } },
  { value: 'NOUN', label: { zh: '名词', en: 'Noun' } },
  { value: 'NUM', label: { zh: '数词', en: 'Numeral' } },
  { value: 'PART', label: { zh: '小品词', en: 'Particle' } },
  { value: 'PRON', label: { zh: '代词', en: 'Pronoun' } },
  { value: 'PROPN', label: { zh: '专有名词', en: 'Proper Noun' } },
  { value: 'PUNCT', label: { zh: '标点', en: 'Punctuation' } },
  { value: 'SCONJ', label: { zh: '从属连词', en: 'Subord. Conj.' } },
  { value: 'SYM', label: { zh: '符号', en: 'Symbol' } },
  { value: 'VERB', label: { zh: '动词', en: 'Verb' } },
  { value: 'X', label: { zh: '其他', en: 'Other' } }
]

/**
 * Penn Treebank POS tags (fine-grained)
 */
export const PENN_POS_TAGS = [
  // Punctuation
  { value: '.', label: { zh: '句号', en: 'Sentence-final punct.' } },
  { value: ',', label: { zh: '逗号', en: 'Comma' } },
  { value: ':', label: { zh: '冒号/分号', en: 'Colon/semicolon' } },
  { value: '``', label: { zh: '左引号', en: 'Opening quotation' } },
  { value: "''", label: { zh: '右引号', en: 'Closing quotation' } },
  { value: '-LRB-', label: { zh: '左括号', en: 'Left bracket' } },
  { value: '-RRB-', label: { zh: '右括号', en: 'Right bracket' } },
  { value: 'HYPH', label: { zh: '连字符', en: 'Hyphen' } },
  
  // Adjectives
  { value: 'JJ', label: { zh: '形容词', en: 'Adjective' } },
  { value: 'JJR', label: { zh: '形容词比较级', en: 'Adjective, comparative' } },
  { value: 'JJS', label: { zh: '形容词最高级', en: 'Adjective, superlative' } },
  
  // Nouns
  { value: 'NN', label: { zh: '名词单数', en: 'Noun, singular' } },
  { value: 'NNS', label: { zh: '名词复数', en: 'Noun, plural' } },
  { value: 'NNP', label: { zh: '专有名词单数', en: 'Proper noun, singular' } },
  { value: 'NNPS', label: { zh: '专有名词复数', en: 'Proper noun, plural' } },
  
  // Verbs
  { value: 'VB', label: { zh: '动词原形', en: 'Verb, base form' } },
  { value: 'VBD', label: { zh: '动词过去式', en: 'Verb, past tense' } },
  { value: 'VBG', label: { zh: '动词现在分词', en: 'Verb, gerund/present participle' } },
  { value: 'VBN', label: { zh: '动词过去分词', en: 'Verb, past participle' } },
  { value: 'VBP', label: { zh: '动词非三单现在时', en: 'Verb, non-3rd person singular present' } },
  { value: 'VBZ', label: { zh: '动词三单现在时', en: 'Verb, 3rd person singular present' } },
  
  // Adverbs
  { value: 'RB', label: { zh: '副词', en: 'Adverb' } },
  { value: 'RBR', label: { zh: '副词比较级', en: 'Adverb, comparative' } },
  { value: 'RBS', label: { zh: '副词最高级', en: 'Adverb, superlative' } },
  
  // Pronouns
  { value: 'PRP', label: { zh: '人称代词', en: 'Personal pronoun' } },
  { value: 'PRP$', label: { zh: '物主代词', en: 'Possessive pronoun' } },
  { value: 'WP', label: { zh: '疑问代词', en: 'Wh-pronoun' } },
  { value: 'WP$', label: { zh: '物主疑问代词', en: 'Possessive wh-pronoun' } },
  
  // Determiners
  { value: 'DT', label: { zh: '限定词', en: 'Determiner' } },
  { value: 'PDT', label: { zh: '前限定词', en: 'Predeterminer' } },
  { value: 'WDT', label: { zh: '疑问限定词', en: 'Wh-determiner' } },
  
  // Prepositions and conjunctions
  { value: 'IN', label: { zh: '介词/从属连词', en: 'Preposition/subordinating conjunction' } },
  { value: 'CC', label: { zh: '并列连词', en: 'Coordinating conjunction' } },
  
  // Cardinals and others
  { value: 'CD', label: { zh: '基数词', en: 'Cardinal number' } },
  { value: 'EX', label: { zh: '存在词there', en: 'Existential there' } },
  { value: 'FW', label: { zh: '外来词', en: 'Foreign word' } },
  { value: 'LS', label: { zh: '列表项标记', en: 'List item marker' } },
  { value: 'MD', label: { zh: '情态动词', en: 'Modal' } },
  { value: 'POS', label: { zh: '所有格标记', en: 'Possessive ending' } },
  { value: 'RP', label: { zh: '小品词', en: 'Particle' } },
  { value: 'SYM', label: { zh: '符号', en: 'Symbol' } },
  { value: 'TO', label: { zh: 'to', en: 'to' } },
  { value: 'UH', label: { zh: '感叹词', en: 'Interjection' } },
  { value: 'WRB', label: { zh: '疑问副词', en: 'Wh-adverb' } },
  
  // Special
  { value: 'NFP', label: { zh: '非最终标点', en: 'Superfluous punctuation' } },
  { value: 'ADD', label: { zh: '地址/网址', en: 'Email/URL' } },
  { value: 'AFX', label: { zh: '词缀', en: 'Affix' } },
  { value: 'GW', label: { zh: '错误词', en: 'Additional word' } },
  { value: 'XX', label: { zh: '未知', en: 'Unknown' } },
  { value: '_SP', label: { zh: '空格', en: 'Space' } }
]

/**
 * Common dependency relations - comprehensive list for CQL matching
 */
export const DEPENDENCY_RELATIONS = [
  // Core arguments
  { value: 'nsubj', label: { zh: '名词性主语', en: 'Nominal Subject' } },
  { value: 'nsubjpass', label: { zh: '被动主语', en: 'Passive Subject' } },
  { value: 'dobj', label: { zh: '直接宾语', en: 'Direct Object' } },
  { value: 'obj', label: { zh: '宾语', en: 'Object' } },
  { value: 'iobj', label: { zh: '间接宾语', en: 'Indirect Object' } },
  { value: 'csubj', label: { zh: '从句主语', en: 'Clausal Subject' } },
  { value: 'ccomp', label: { zh: '从句补语', en: 'Clausal Complement' } },
  { value: 'xcomp', label: { zh: '开放从句补语', en: 'Open Clausal Complement' } },
  // Nominal modifiers
  { value: 'amod', label: { zh: '形容词修饰语', en: 'Adjectival Modifier' } },
  { value: 'advmod', label: { zh: '副词修饰语', en: 'Adverbial Modifier' } },
  { value: 'nmod', label: { zh: '名词修饰语', en: 'Nominal Modifier' } },
  { value: 'nummod', label: { zh: '数词修饰语', en: 'Numeric Modifier' } },
  { value: 'det', label: { zh: '限定词', en: 'Determiner' } },
  { value: 'poss', label: { zh: '所有格', en: 'Possessive' } },
  { value: 'case', label: { zh: '格标记', en: 'Case Marking' } },
  // Prepositional/oblique
  { value: 'prep', label: { zh: '介词', en: 'Prepositional' } },
  { value: 'pobj', label: { zh: '介词宾语', en: 'Object of Preposition' } },
  { value: 'obl', label: { zh: '斜格', en: 'Oblique' } },
  // Compound and coordination
  { value: 'compound', label: { zh: '复合词', en: 'Compound' } },
  { value: 'compound:prt', label: { zh: '短语动词小品词', en: 'Phrasal Verb Particle' } },
  { value: 'conj', label: { zh: '连词', en: 'Conjunct' } },
  { value: 'cc', label: { zh: '并列连词', en: 'Coordinating Conj.' } },
  // Verb auxiliaries
  { value: 'aux', label: { zh: '助动词', en: 'Auxiliary' } },
  { value: 'auxpass', label: { zh: '被动助动词', en: 'Passive Auxiliary' } },
  { value: 'cop', label: { zh: '系动词', en: 'Copula' } },
  // Special
  { value: 'neg', label: { zh: '否定词', en: 'Negation' } },
  { value: 'mark', label: { zh: '从句标记', en: 'Marker' } },
  { value: 'prt', label: { zh: '小品词', en: 'Particle' } },
  { value: 'attr', label: { zh: '属性', en: 'Attribute' } },
  { value: 'acomp', label: { zh: '形容词补语', en: 'Adjectival Complement' } },
  { value: 'advcl', label: { zh: '副词从句', en: 'Adverbial Clause' } },
  { value: 'relcl', label: { zh: '关系从句', en: 'Relative Clause' } },
  { value: 'acl', label: { zh: '从句修饰语', en: 'Clausal Modifier' } },
  { value: 'appos', label: { zh: '同位语', en: 'Apposition' } },
  { value: 'root', label: { zh: '根节点', en: 'Root' } },
  { value: 'punct', label: { zh: '标点', en: 'Punctuation' } }
]

/**
 * Example CQL queries for templates
 */
export const CQL_EXAMPLES = [
  {
    name: { zh: '名词短语', en: 'Noun Phrase' },
    cql: '[pos="DET"]? [pos="ADJ"]* [pos="NOUN"]',
    description: { zh: '匹配限定词(可选) + 形容词(多个) + 名词', en: 'Match det(optional) + adj(multiple) + noun' }
  },
  {
    name: { zh: '动词短语', en: 'Verb Phrase' },
    cql: '[pos="VERB"] []{0,3} [pos="NOUN"]',
    description: { zh: '匹配动词 + 0-3个词 + 名词', en: 'Match verb + 0-3 words + noun' }
  },
  {
    name: { zh: '特定词元搭配', en: 'Lemma Collocation' },
    cql: '[lemma="make"] [] [pos="NOUN"]',
    description: { zh: '查找make + 任意词 + 名词', en: 'Find make + any word + noun' }
  },
  {
    name: { zh: '词形变体', en: 'Word Variants' },
    cql: '[word=".*ing"]',
    description: { zh: '匹配以-ing结尾的词', en: 'Match words ending in -ing' }
  },
  {
    name: { zh: '相邻名词', en: 'Adjacent Nouns' },
    cql: '[pos="NOUN"] [pos="NOUN"]',
    description: { zh: '匹配两个连续的名词', en: 'Match two consecutive nouns' }
  },
  // New: Dependency-based examples
  {
    name: { zh: '动词的宾语', en: 'Verb Objects' },
    cql: '[lemma="make"] []{0,5} [dep="dobj" & headlemma="make"]',
    description: { zh: '查找make的直接宾语 (基于依存关系)', en: 'Find direct objects of make (dependency-based)' }
  },
  {
    name: { zh: '形容词修饰的名词', en: 'Adjective-Modified Nouns' },
    cql: '[pos="ADJ"] [pos="NOUN" & dep="amod"]',
    description: { zh: '查找被形容词修饰的名词', en: 'Find nouns modified by adjectives' }
  },
  {
    name: { zh: '主语-动词搭配', en: 'Subject-Verb Collocation' },
    cql: '[pos="NOUN" & dep="nsubj"] []{0,3} [pos="VERB"]',
    description: { zh: '查找作为主语的名词与其动词', en: 'Find subject nouns with their verbs' }
  }
]

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Local storage key for saved templates
 */
export const TEMPLATES_STORAGE_KEY = 'meta-lingo-cql-templates'


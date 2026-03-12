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
  },
  {
    value: 'usas',
    label: { zh: '语义域 (USAS)', en: 'Semantic Domain (USAS)' },
    description: { zh: '匹配 USAS 语义域标签；= 包含(前缀)，== 精确', en: 'Match USAS semantic domain; = contains/prefix, == exact' },
    category: 'basic'
  },
  {
    value: 'nrc',
    label: { zh: '情感标签 (NRC)', en: 'Emotion Tag (NRC)' },
    description: { zh: '匹配 NRC 情感/极性标签；== 精确含标签，= 正则匹配', en: 'Match NRC emotion/polarity label; == exact label, = regex match' },
    category: 'basic'
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
  },
  {
    type: 'within',
    label: { zh: '区间内 (Within)', en: 'Within' },
    description: { zh: '左侧 token 出现在右侧序列所界定的区间内', en: 'Left token appears within the span defined by the right sequence' },
    icon: 'CompareArrows',
    preview: 'within'
  },
  {
    type: 'not_within',
    label: { zh: '区间外 (!Within)', en: '!Within' },
    description: { zh: '左侧 token 不出现在右侧序列所界定的区间内', en: 'Left token does NOT appear within the right span' },
    icon: 'CompareArrows',
    preview: '!within'
  },
  {
    type: 'containing',
    label: { zh: '包含 (Containing)', en: 'Containing' },
    description: { zh: '左侧结构（如 <s/>）中包含右侧 pattern', en: 'Left structure (e.g. <s/>) contains the right pattern' },
    icon: 'FilterAlt',
    preview: 'containing'
  },
  {
    type: 'not_containing',
    label: { zh: '不包含 (!Containing)', en: '!Containing' },
    description: { zh: '左侧结构中不包含右侧 pattern', en: 'Left structure does NOT contain the right pattern' },
    icon: 'FilterAltOff',
    preview: '!containing'
  },
  {
    type: 'meet',
    label: { zh: '左右共现 (Meet)', en: 'Meet' },
    description: { zh: '查找两个 pattern 在指定距离范围内左右共现', en: 'Find two patterns co-occurring within a given distance' },
    icon: 'Hub',
    preview: '(meet P Q -n m)'
  },
  {
    type: 'word_sketch',
    label: { zh: '词图模板 (Word Sketch)', en: 'Word Sketch' },
    description: { zh: '基于词图语法关系匹配搭配词', en: 'Match collocates via Word Sketch grammar relations' },
    icon: 'AccountTree',
    preview: '[ws(hw,rel,col)]'
  },
  {
    type: 'structure',
    label: { zh: '结构标记 (Structure)', en: 'Structure' },
    description: { zh: '匹配句子/段落/文档的边界，可附加元数据属性', en: 'Match sentence/paragraph/document boundaries with optional metadata' },
    icon: 'DataObject',
    preview: '<s/>'
  }
]

/**
 * Structural context variant display labels
 */
export const STRUCTURE_VARIANTS: {
  value: import('./types').StructureVariant
  label: { zh: string; en: string }
  cql: string
  group: 'sentence' | 'paragraph'
}[] = [
  // Sentence
  { value: 's_open',  label: { zh: '句子开头 <s>',  en: 'Sentence Start <s>'  }, cql: '<s>',   group: 'sentence' },
  { value: 's_close', label: { zh: '句子结尾 </s>', en: 'Sentence End </s>'   }, cql: '</s>',  group: 'sentence' },
  { value: 's_self',  label: { zh: '整个句子 <s/>', en: 'Whole Sentence <s/>' }, cql: '<s/>',  group: 'sentence' },
  // Paragraph
  { value: 'p_open',  label: { zh: '段落开头 <p>',  en: 'Paragraph Start <p>'  }, cql: '<p>',   group: 'paragraph' },
  { value: 'p_close', label: { zh: '段落结尾 </p>', en: 'Paragraph End </p>'   }, cql: '</p>',  group: 'paragraph' },
  { value: 'p_self',  label: { zh: '整个段落 <p/>', en: 'Whole Paragraph <p/>' }, cql: '<p/>',  group: 'paragraph' },
]

/**
 * Word Sketch grammar relation options (from grammar_patterns.py)
 * Grouped by center_pos: VERB, NOUN, ADJ, ADV
 */
export const WS_RELATION_OPTIONS: {
  value: string
  label: { zh: string; en: string }
  group: 'VERB' | 'NOUN' | 'ADJ' | 'ADV'
}[] = [
  // VERB relations
  { value: 'object',                  label: { zh: '"[动词]"的宾语',            en: 'objects of "[verb]"'                      }, group: 'VERB' },
  { value: 'subject',                 label: { zh: '"[动词]"的主语',            en: 'subjects of "[verb]"'                     }, group: 'VERB' },
  { value: 'modifier',                label: { zh: '修饰"[动词]"的副词',        en: 'modifiers of "[verb]"'                    }, group: 'VERB' },
  { value: 'and_or',                  label: { zh: '"[动词]"和/或...',          en: '"[verb]" and/or ...'                      }, group: 'VERB' },
  { value: 'prepositional_phrases',   label: { zh: '介词短语 (动词)',           en: 'prepositional phrases (verb)'             }, group: 'VERB' },
  { value: 'particles_intransitive',  label: { zh: '"[动词]"后的小品词',        en: 'particles after "[verb]"'                 }, group: 'VERB' },
  { value: 'particles_transitive',    label: { zh: '"[动词]"后的小品词（及物）', en: 'particles after "[verb]" with object'     }, group: 'VERB' },
  { value: 'pronominal_objects',      label: { zh: '"[动词]"的代词宾语',        en: 'pronominal objects of "[verb]"'           }, group: 'VERB' },
  { value: 'pronominal_subjects',     label: { zh: '"[动词]"的代词主语',        en: 'pronominal subjects of "[verb]"'          }, group: 'VERB' },
  { value: 'wh_words',                label: { zh: '"[动词]"后的疑问词',        en: 'wh-words following "[verb]"'              }, group: 'VERB' },
  { value: 'infinitive_objects',      label: { zh: '"[动词]"的不定式宾语',      en: 'infinitive objects of "[verb]"'           }, group: 'VERB' },
  { value: 'ing_objects',             label: { zh: '"[动词]"的动名词宾语',      en: '-ing objects of "[verb]"'                 }, group: 'VERB' },
  { value: 'complements',             label: { zh: '"[动词]"的补语',            en: 'complements of "[verb]"'                  }, group: 'VERB' },
  { value: 'adjectives_after',        label: { zh: '"[动词]"后的形容词',        en: 'adjectives after "[verb]"'                }, group: 'VERB' },
  { value: 'usage_patterns',          label: { zh: '用法模式 (动词)',           en: 'usage patterns (verb)'                    }, group: 'VERB' },
  // NOUN relations
  { value: 'nouns_modified_by',       label: { zh: '被"[名词]"修饰的名词',      en: 'nouns modified by "[noun]"'               }, group: 'NOUN' },
  { value: 'verbs_with_as_object',    label: { zh: '以"[名词]"为宾语的动词',    en: 'verbs with "[noun]" as object'            }, group: 'NOUN' },
  { value: 'verbs_with_as_subject',   label: { zh: '以"[名词]"为主语的动词',    en: 'verbs with "[noun]" as subject'           }, group: 'NOUN' },
  { value: 'noun_and_or',             label: { zh: '"[名词]"和/或...',          en: '"[noun]" and/or ...'                      }, group: 'NOUN' },
  { value: 'noun_prepositional_phrases', label: { zh: '介词短语 (名词)',        en: 'prepositional phrases (noun)'             }, group: 'NOUN' },
  { value: 'adjective_predicates',    label: { zh: '"[名词]"的形容词谓语',      en: 'adjective predicates of "[noun]"'         }, group: 'NOUN' },
  { value: 'noun_is_a',               label: { zh: '"[名词]"是...',             en: '"[noun]" is a ...'                        }, group: 'NOUN' },
  { value: 'possessive',              label: { zh: '"[名词]"的...',             en: "[noun]'s ..."                             }, group: 'NOUN' },
  { value: 'possessors',              label: { zh: '"[名词]"的所有者',          en: 'possessors of "[noun]"'                   }, group: 'NOUN' },
  { value: 'pronominal_possessors',   label: { zh: '"[名词]"的代词所有者',      en: 'pronominal possessors of "[noun]"'        }, group: 'NOUN' },
  { value: 'is_a_noun',               label: { zh: '...是"[名词]"',             en: '... is a "[noun]"'                        }, group: 'NOUN' },
  { value: 'verbs_with_particle_object', label: { zh: '带小品词且以"[名词]"为宾语的动词', en: 'verbs with particle and "[noun]" as object' }, group: 'NOUN' },
  { value: 'noun_usage_patterns',     label: { zh: '用法模式 (名词)',           en: 'usage patterns (noun)'                    }, group: 'NOUN' },
  { value: 'modifiers_of_noun',       label: { zh: '修饰"[名词]"的形容词',      en: 'modifiers of "[noun]"'                    }, group: 'NOUN' },
  { value: 'object_of',               label: { zh: '"[名词]"是...的宾语',       en: '"[noun]" is object of'                    }, group: 'NOUN' },
  { value: 'subject_of',              label: { zh: '"[名词]"是...的主语',       en: '"[noun]" is subject of'                   }, group: 'NOUN' },
  // ADJ relations
  { value: 'adj_modifies',            label: { zh: '"[形容词]"修饰的名词',      en: '"[adjective]" modifies'                   }, group: 'ADJ' },
  { value: 'adj_subject',             label: { zh: '"[形容词]"的主语',          en: 'subject of "[adjective]"'                 }, group: 'ADJ' },
  { value: 'adj_comp_of',             label: { zh: '"[形容词]"是...的补语',     en: '"[adjective]" is complement of'           }, group: 'ADJ' },
  { value: 'adj_and_or',              label: { zh: '"[形容词]"和/或...',        en: '"[adjective]" and/or ...'                 }, group: 'ADJ' },
  { value: 'nouns_modified_by_adj',   label: { zh: '被"[形容词]"修饰的名词',    en: 'nouns modified by "[adjective]"'          }, group: 'ADJ' },
  { value: 'verbs_with_adj_complement', label: { zh: '以"[形容词]"为补语的动词', en: 'verbs with "[adjective]" as complement'  }, group: 'ADJ' },
  // ADV relations
  { value: 'modifiers_of_adv',        label: { zh: '修饰"[副词]"的词',          en: 'modifiers of "[adverb]"'                  }, group: 'ADV' },
  { value: 'verbs_modified_by_adv',   label: { zh: '被"[副词]"修饰的动词',      en: 'verbs modified by "[adverb]"'             }, group: 'ADV' },
  { value: 'adverbs_modified_by_adv', label: { zh: '被"[副词]"修饰的副词',      en: 'adverbs modified by "[adverb]"'           }, group: 'ADV' },
  { value: 'adjectives_modified_by_adv', label: { zh: '被"[副词]"修饰的形容词', en: 'adjectives modified by "[adverb]"'        }, group: 'ADV' },
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
 * NRC polarity labels
 */
export const NRC_POLARITY_LABELS = [
  { value: 'positive', label: { zh: '积极', en: 'Positive' } },
  { value: 'negative', label: { zh: '消极', en: 'Negative' } },
  { value: 'neutral',  label: { zh: '中性', en: 'Neutral' } }
]

/**
 * NRC emotion labels
 */
export const NRC_EMOTION_LABELS = [
  { value: 'anger',        label: { zh: '愤怒', en: 'Anger' } },
  { value: 'anticipation', label: { zh: '期待', en: 'Anticipation' } },
  { value: 'disgust',      label: { zh: '厌恶', en: 'Disgust' } },
  { value: 'fear',         label: { zh: '恐惧', en: 'Fear' } },
  { value: 'joy',          label: { zh: '喜悦', en: 'Joy' } },
  { value: 'sadness',      label: { zh: '悲伤', en: 'Sadness' } },
  { value: 'surprise',     label: { zh: '惊讶', en: 'Surprise' } },
  { value: 'trust',        label: { zh: '信任', en: 'Trust' } },
  { value: 'others',       label: { zh: '其他/无情感', en: 'Others/No Emotion' } }
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
  },
  // New: structural / operator examples
  {
    name: { zh: '两动词之间的名词 (within)', en: 'Noun between Verbs (within)' },
    cql: '[pos="NOUN"] within [pos="VERB"] []{1,5} [pos="VERB"]',
    description: { zh: '查找出现在两个动词（最多相距5词）之间的名词', en: 'Find nouns appearing between two verbs at most 5 tokens apart' }
  },
  {
    name: { zh: '不含大写词的句子 (!containing)', en: 'Sentences without Capitals (!containing)' },
    cql: '<s/> !containing [word="[A-Z][A-Za-z]*"]',
    description: { zh: '查找不含任何大写字母开头词语的句子', en: 'Find sentences not containing any word starting with a capital letter' }
  },
  {
    name: { zh: '左右共现 (meet)', en: 'Left-Right Co-occurrence (meet)' },
    cql: '(meet [pos="NOUN"] [lemma="be"] -3 3)',
    description: { zh: '查找在动词be左右3个词以内出现的名词', en: 'Find nouns co-occurring within 3 tokens of the verb "be"' }
  },
  {
    name: { zh: '词图模板 (ws)', en: 'Word Sketch Template (ws)' },
    cql: '[ws(make,object,decision)]',
    description: { zh: '查找make的宾语中的decision', en: 'Find "decision" as an object of "make" via Word Sketch' }
  },
  {
    name: { zh: '带元数据的文档', en: 'Doc with Metadata' },
    cql: '<doc tag="spoken"> [pos="NOUN"]',
    description: { zh: '在标注为spoken的文档开头位置查找名词', en: 'Find nouns at the start of documents tagged as spoken' }
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


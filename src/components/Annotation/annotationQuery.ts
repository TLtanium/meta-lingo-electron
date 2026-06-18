/**
 * annotationQuery - 标注模式 CQL 客户端求值器
 *
 * 背景：CQL 中的 `annotation` 属性是「标注模式」专有的，后端 CQL 引擎
 * (backend/services/collocation/cql_engine.py) 的 ATTRIBUTES 集合中**不包含**
 * `annotation`，因此凡是涉及 annotation 的查询都必须在前端针对当前已有标注求值，
 * 不能下发到后端（否则会报 "Unknown attribute: annotation"）。
 *
 * 本模块支持的语法（仅针对 annotation 标签）：
 *   [annotation=="X"]                       精确匹配标签 X
 *   [annotation!=="X"]                      不含标签 X
 *   [annotation="re"]                       正则匹配（任一标签全匹配）
 *   [annotation!="re"]                      正则不匹配
 *   [annotation=="A" & annotation=="B"]     同一 span 同时具备 A 和 B（AND）
 *   [annotation=="A" | annotation=="B"]     同一 span 具备 A 或 B（OR）
 *   [!annotation=="X"]                      取反前缀
 *   P containing  Q / P !containing  Q      P 的 span 是否（不）包含一个匹配 Q 的子 span
 *   P within      Q / P !within      Q      P 的 span 是否（不）被一个匹配 Q 的 span 所包含
 *
 * 不支持（会抛 AnnotationQueryError，提示用户而非静默下发后端）：
 *   - annotation 与其他属性（word/pos/...）混用
 *   - token 序列、距离 {m,n}、meet、ws()、结构标记 <s/> 等高级语法
 */

import type { Annotation } from '../../types'

export interface SearchMatch {
  start: number
  end: number
  text: string
}

export type AnnErrorCode = 'parse' | 'mixed' | 'unsupported'

export class AnnotationQueryError extends Error {
  code: AnnErrorCode
  constructor(code: AnnErrorCode) {
    super(code)
    this.code = code
    this.name = 'AnnotationQueryError'
  }
}

type Operator = '==' | '!==' | '=' | '!='

interface AnnCondition {
  value: string
  operator: Operator
  negated: boolean // 来自 ! 前缀
}

interface AnnPattern {
  isAny: boolean
  and: AnnCondition[]
  or: AnnCondition[][] | null
}

type SpanOp = 'containing' | 'not_containing' | 'within' | 'not_within'

interface AnnQuery {
  base: AnnPattern
  op: SpanOp | null
  other: AnnPattern | null
}

type Token =
  | { kind: 'pattern'; raw: string }
  | { kind: 'op'; op: SpanOp }

const CONDITION_RE = /^(!?)\s*(\w+)\s*(===?|!==?|=)\s*"([^"]*)"$/

/**
 * 判断查询是否引用了 annotation 属性（即应走前端求值）。
 * 仅匹配作为属性名出现的 annotation（其后紧跟比较运算符），
 * 不会误判形如 [word=="annotation"] 中作为值的 annotation。
 */
export function isAnnotationQuery(cql: string): boolean {
  return /\bannotation\s*(===?|!==?|=)/.test(cql)
}

/** 按分隔符切分，遵守引号（引号内的分隔符不切） */
function splitTop(s: string, sep: string): string[] {
  const parts: string[] = []
  let cur = ''
  let inQuote = false
  for (const c of s) {
    if (c === '"') {
      inQuote = !inQuote
      cur += c
    } else if (c === sep && !inQuote) {
      parts.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}

function parseCondition(part: string): AnnCondition {
  const m = part.match(CONDITION_RE)
  if (!m) throw new AnnotationQueryError('parse')
  const [, neg, attr, opRaw, value] = m
  if (attr !== 'annotation') throw new AnnotationQueryError('mixed')

  let operator: Operator
  if (opRaw === '=') operator = '='
  else if (opRaw === '!=') operator = '!='
  else if (opRaw.startsWith('!')) operator = '!==' // !== / !==
  else operator = '==' // == / ===

  return { value, operator, negated: neg === '!' }
}

/** 解析单个 token 模式（raw 含方括号） */
function parsePattern(raw: string): AnnPattern {
  const inner = raw.slice(1, -1).trim()
  if (inner === '') return { isAny: true, and: [], or: null }

  const orParts = splitTop(inner, '|')
  if (orParts.length > 1) {
    const or = orParts.map(p => splitTop(p, '&').map(parseCondition))
    return { isAny: false, and: [], or }
  }
  const and = splitTop(inner, '&').map(parseCondition)
  return { isAny: false, and, or: null }
}

/** 词法切分：识别 [..] 模式与 containing/within/!containing/!within 运算符 */
function tokenize(cql: string): Token[] {
  const tokens: Token[] = []
  const n = cql.length
  let i = 0

  const keywords: [string, SpanOp][] = [
    ['!containing', 'not_containing'],
    ['!within', 'not_within'],
    ['containing', 'containing'],
    ['within', 'within'],
  ]

  while (i < n) {
    const ch = cql[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }

    if (ch === '[') {
      let depth = 1
      let j = i + 1
      let inQuote = false
      while (j < n && depth > 0) {
        const c = cql[j]
        if (c === '"') inQuote = !inQuote
        else if (!inQuote && c === '[') depth++
        else if (!inQuote && c === ']') depth--
        j++
      }
      if (depth !== 0) throw new AnnotationQueryError('parse')
      tokens.push({ kind: 'pattern', raw: cql.slice(i, j) })
      i = j
      continue
    }

    const rest = cql.slice(i)
    let matched = false
    for (const [kw, op] of keywords) {
      if (rest.startsWith(kw)) {
        const after = rest[kw.length]
        // 运算符后必须是空白、方括号或字符串结束，避免误匹配
        if (after === undefined || /\s/.test(after) || after === '[') {
          tokens.push({ kind: 'op', op })
          i += kw.length
          matched = true
          break
        }
      }
    }
    if (matched) continue

    // 其它字符（| < ( " 等高级语法）对 annotation 模式不支持
    throw new AnnotationQueryError('unsupported')
  }

  return tokens
}

function parseAnnotationQuery(cql: string): AnnQuery {
  const tokens = tokenize(cql)
  if (tokens.length === 0) throw new AnnotationQueryError('parse')
  if (tokens[0].kind !== 'pattern') throw new AnnotationQueryError('unsupported')

  const base = parsePattern(tokens[0].raw)
  if (tokens.length === 1) return { base, op: null, other: null }

  if (
    tokens.length === 3 &&
    tokens[1].kind === 'op' &&
    tokens[2].kind === 'pattern'
  ) {
    return { base, op: tokens[1].op, other: parsePattern(tokens[2].raw) }
  }

  // 多个 token 序列 / 多个运算符等：不支持
  throw new AnnotationQueryError('unsupported')
}

function regexFullMatch(pattern: string, label: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`, 'i').test(label)
  } catch {
    return label.toLowerCase() === pattern.toLowerCase()
  }
}

function conditionMatches(cond: AnnCondition, labels: string[]): boolean {
  let m: boolean
  switch (cond.operator) {
    case '==':
      m = labels.includes(cond.value)
      break
    case '!==':
      m = !labels.includes(cond.value)
      break
    case '=':
      m = labels.some(l => regexFullMatch(cond.value, l))
      break
    case '!=':
      m = !labels.some(l => regexFullMatch(cond.value, l))
      break
  }
  return cond.negated ? !m : m
}

function patternMatches(pat: AnnPattern, labels: string[]): boolean {
  if (pat.isAny) return true
  if (pat.or) return pat.or.some(group => group.every(c => conditionMatches(c, labels)))
  return pat.and.every(c => conditionMatches(c, labels))
}

interface SpanGroup {
  start: number
  end: number
  labels: string[]
  text: string
}

/** 按 span (start-end) 聚合标注，得到每个 span 上的标签集合 */
function groupBySpan(annotations: Annotation[]): SpanGroup[] {
  const map = new Map<string, SpanGroup>()
  for (const a of annotations) {
    const key = `${a.startPosition}-${a.endPosition}`
    let g = map.get(key)
    if (!g) {
      g = { start: a.startPosition, end: a.endPosition, labels: [], text: a.text }
      map.set(key, g)
    }
    g.labels.push(a.label)
  }
  return Array.from(map.values())
}

/**
 * 在当前标注集合上求值一个 annotation 模式 CQL 查询。
 * @throws AnnotationQueryError 语法/属性不支持时抛出
 */
export function evaluateAnnotationQuery(
  cql: string,
  annotations: Annotation[]
): SearchMatch[] {
  const { base, op, other } = parseAnnotationQuery(cql)
  const groups = groupBySpan(annotations)

  const baseSpans = groups.filter(g => patternMatches(base, g.labels))

  const toMatch = (g: SpanGroup): SearchMatch => ({ start: g.start, end: g.end, text: g.text })

  if (!op || !other) {
    return baseSpans.map(toMatch)
  }

  const otherSpans = groups.filter(g => patternMatches(other, g.labels))
  const isContaining = op === 'containing' || op === 'not_containing'
  const negate = op === 'not_containing' || op === 'not_within'

  const result = baseSpans.filter(s => {
    let has: boolean
    if (isContaining) {
      // s 是否包含一个匹配 other 的子 span（含同一 span）
      has = otherSpans.some(o => o.start >= s.start && o.end <= s.end)
    } else {
      // s 是否被一个匹配 other 的 span 所包含（within）
      has = otherSpans.some(o => s.start >= o.start && s.end <= o.end)
    }
    return negate ? !has : has
  })

  return result.map(toMatch)
}

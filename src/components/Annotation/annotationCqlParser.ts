/**
 * annotationCqlParser - 标注模式「混用」CQL 解析器
 *
 * 当 CQL 查询把 `annotation` 标签与 token 语言学属性（word/lemma/pos/tag/dep）
 * 混写时（例如 [annotation=="indirect" & pos="NOUN"]），无法走纯 annotation 的
 * span 级求值器（annotationQuery.ts），也不能下发后端（后端不认识 annotation）。
 * 本模块把这类查询解析为 token 级的 CQL 结构，交给 annotationTokenQuery.ts 在
 * 前端 SpaCy token 序列上求值。
 *
 * 支持语法（token 级）：
 *   [attr=="v" & attr2="v2"]   AND
 *   [attr=="v" | attr2="v2"]   OR
 *   [!attr=="v"]               取反前缀
 *   []  []{n}  []{m,n}  []?  []*  token 序列与数量词
 *   seq | seq                  顶层 OR
 *   P containing Q / P !containing Q
 *   P within Q     / P !within Q
 *   (meet P Q -n m)
 *
 * 支持属性：annotation, word, lemma, pos, tag, dep
 * 不支持（抛 TokenQueryError('unsupported_attr')）：usas/nrc/mipvu/head*（前端 token 无此数据）
 * 不支持（抛 TokenQueryError('unsupported')）：结构标记 <s>、ws() 等
 */

export type TokenQueryErrorCode = 'parse' | 'unsupported_attr' | 'unsupported'

export class TokenQueryError extends Error {
  code: TokenQueryErrorCode
  constructor(code: TokenQueryErrorCode) {
    super(code)
    this.code = code
    this.name = 'TokenQueryError'
  }
}

export type Operator = '==' | '!==' | '=' | '!='

/** token 级支持的属性（前端 SpaCy token 携带的字段） */
export const SUPPORTED_ATTRS = new Set(['annotation', 'word', 'lemma', 'pos', 'tag', 'dep'])
/** 已知但前端缺少数据的属性：明确报「不支持混用」而非静默失败 */
const KNOWN_BACKEND_ONLY = new Set(['usas', 'nrc', 'mipvu', 'headword', 'headlemma', 'headpos', 'headdep'])

export interface Condition {
  attribute: string
  value: string
  operator: Operator
  negated: boolean
}

export interface Pattern {
  conditions: Condition[]            // AND 条件
  orConditions: Condition[][] | null // OR 分组（每组内部 AND）
  isAny: boolean                     // []
  minCount: number
  maxCount: number
  optional: boolean
}

export interface MeetQuery {
  pattern1: Pattern
  pattern2: Pattern
  left: number
  right: number
}

export interface ParsedTokenQuery {
  patterns: Pattern[]
  orGroups: Pattern[][] | null
  containing: { container: Pattern[]; content: Pattern[]; negated: boolean } | null
  within: { left: Pattern[]; right: Pattern[]; negated: boolean } | null
  meet: MeetQuery | null
}

const CONDITION_RE = /^(!?)\s*(\w+)\s*(===?|!==?|=)\s*"([^"]*)"$/

/** 按分隔符切分，遵守引号与括号 */
function splitTop(s: string, sep: string): string[] {
  const parts: string[] = []
  let cur = ''
  let inQuote = false
  let paren = 0
  for (const c of s) {
    if (c === '"') { inQuote = !inQuote; cur += c }
    else if (c === '(') { paren++; cur += c }
    else if (c === ')') { paren--; cur += c }
    else if (c === sep && !inQuote && paren === 0) { parts.push(cur); cur = '' }
    else cur += c
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}

function parseCondition(part: string): Condition {
  // 支持带括号的取反 !(attr="v")（与后端一致）
  let outerNeg = false
  let p = part.trim()
  if (p.startsWith('!(') && p.endsWith(')')) {
    outerNeg = true
    p = p.slice(2, -1).trim()
  }
  const m = p.match(CONDITION_RE)
  if (!m) throw new TokenQueryError('parse')
  const [, neg, attr, opRaw, value] = m
  if (!SUPPORTED_ATTRS.has(attr)) {
    if (KNOWN_BACKEND_ONLY.has(attr)) throw new TokenQueryError('unsupported_attr')
    throw new TokenQueryError('parse')
  }
  let operator: Operator
  if (opRaw === '=') operator = '='
  else if (opRaw === '!=') operator = '!='
  else if (opRaw.startsWith('!')) operator = '!=='
  else operator = '=='
  return { attribute: attr, value, operator, negated: outerNeg !== (neg === '!') }
}

/** 解析 [ ... ] 内容（不含方括号），可带数量词信息（由调用方传入） */
function parsePatternBody(inner: string, minCount: number, maxCount: number, optional: boolean): Pattern {
  const trimmed = inner.trim()
  if (trimmed === '') {
    return { conditions: [], orConditions: null, isAny: true, minCount, maxCount, optional }
  }
  if (trimmed.startsWith('ws(')) throw new TokenQueryError('unsupported')

  const orParts = splitTop(trimmed, '|')
  if (orParts.length > 1) {
    const orConditions = orParts.map(p => splitTop(p, '&').map(parseCondition))
    return { conditions: [], orConditions, isAny: false, minCount, maxCount, optional }
  }
  const conditions = splitTop(trimmed, '&').map(parseCondition)
  return { conditions, orConditions: null, isAny: false, minCount, maxCount, optional }
}

interface RawPattern { raw: string; min: number; max: number; optional: boolean }

/** 从 pos 处解析一个 [..] 及其数量词后缀，返回内容与结束位置 */
function readBracket(cql: string, start: number): { pat: RawPattern; end: number } {
  let depth = 1
  let j = start + 1
  let inQuote = false
  while (j < cql.length && depth > 0) {
    const c = cql[j]
    if (c === '"') inQuote = !inQuote
    else if (!inQuote && c === '[') depth++
    else if (!inQuote && c === ']') depth--
    j++
  }
  if (depth !== 0) throw new TokenQueryError('parse')
  const inner = cql.slice(start + 1, j - 1)
  let min = 1, max = 1, optional = false

  if (j < cql.length) {
    if (cql[j] === '{') {
      const rep = cql.indexOf('}', j)
      if (rep === -1) throw new TokenQueryError('parse')
      const content = cql.slice(j + 1, rep).trim()
      if (content.includes(',')) {
        const [a, b] = content.split(',')
        min = a.trim() ? parseInt(a.trim(), 10) : 0
        max = b.trim() ? parseInt(b.trim(), 10) : 100
      } else {
        min = max = parseInt(content, 10)
      }
      if (Number.isNaN(min) || Number.isNaN(max)) throw new TokenQueryError('parse')
      j = rep + 1
    } else if (cql[j] === '?') {
      optional = true; min = 0; max = 1; j++
    } else if (cql[j] === '*') {
      min = 0; max = 100; j++
    } else if (cql[j] === '+') {
      min = 1; max = 100; j++
    }
  }
  return { pat: { raw: inner, min, max, optional }, end: j }
}

type Segment =
  | { kind: 'pattern'; pat: RawPattern }
  | { kind: 'or' }
  | { kind: 'within' | 'not_within' | 'containing' | 'not_containing' }
  | { kind: 'meet'; meet: MeetQuery }

function parseMeet(cql: string, start: number): { meet: MeetQuery; end: number } {
  let pos = start + 1 // skip (
  while (pos < cql.length && /\s/.test(cql[pos])) pos++ // 容忍 "( meet"
  if (cql.slice(pos, pos + 4).toLowerCase() !== 'meet') throw new TokenQueryError('parse')
  pos += 4            // skip 'meet'
  while (pos < cql.length && /\s/.test(cql[pos])) pos++
  if (cql[pos] !== '[') throw new TokenQueryError('parse')
  const b1 = readBracket(cql, pos); pos = b1.end
  while (pos < cql.length && /\s/.test(cql[pos])) pos++
  if (cql[pos] !== '[') throw new TokenQueryError('parse')
  const b2 = readBracket(cql, pos); pos = b2.end
  while (pos < cql.length && /\s/.test(cql[pos])) pos++
  const ls = pos
  if (cql[pos] === '-') pos++
  while (pos < cql.length && /\d/.test(cql[pos])) pos++
  const left = parseInt(cql.slice(ls, pos), 10)
  while (pos < cql.length && /\s/.test(cql[pos])) pos++
  const rs = pos
  while (pos < cql.length && /\d/.test(cql[pos])) pos++
  const right = parseInt(cql.slice(rs, pos), 10)
  if (Number.isNaN(left) || Number.isNaN(right)) throw new TokenQueryError('parse')
  while (pos < cql.length && /\s/.test(cql[pos])) pos++
  if (cql[pos] !== ')') throw new TokenQueryError('parse')
  pos++
  const toPat = (b: RawPattern) => parsePatternBody(b.raw, b.min, b.max, b.optional)
  return { meet: { pattern1: toPat(b1.pat), pattern2: toPat(b2.pat), left, right }, end: pos }
}

function tokenizeSegments(cql: string): Segment[] {
  const segs: Segment[] = []
  let i = 0
  const ops: [string, Segment['kind']][] = [
    ['!containing', 'not_containing'],
    ['!within', 'not_within'],
    ['containing', 'containing'],
    ['within', 'within'],
  ]
  while (i < cql.length) {
    const ch = cql[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '[') {
      const { pat, end } = readBracket(cql, i)
      segs.push({ kind: 'pattern', pat })
      i = end
      continue
    }
    if (ch === '|') { segs.push({ kind: 'or' }); i++; continue }
    if (ch === '(' && cql.slice(i).replace(/^\(\s*/, '').toLowerCase().startsWith('meet')) {
      const { meet, end } = parseMeet(cql, i)
      segs.push({ kind: 'meet', meet })
      i = end
      continue
    }
    const rest = cql.slice(i)
    let matched = false
    for (const [kw, kind] of ops) {
      if (rest.startsWith(kw)) {
        const after = rest[kw.length]
        if (after === undefined || /\s/.test(after) || after === '[') {
          segs.push({ kind } as Segment)
          i += kw.length
          matched = true
          break
        }
      }
    }
    if (matched) continue
    // 其它语法（结构标记 < 等）token 模式不支持
    throw new TokenQueryError('unsupported')
  }
  return segs
}

/** 把 CQL 解析为 token 级查询结构 */
export function parseTokenCql(cql: string): ParsedTokenQuery {
  const segs = tokenizeSegments(cql.trim())
  if (segs.length === 0) throw new TokenQueryError('parse')

  const toPat = (p: RawPattern) => parsePatternBody(p.raw, p.min, p.max, p.optional)

  // meet 单段
  if (segs.length === 1 && segs[0].kind === 'meet') {
    return { patterns: [], orGroups: null, containing: null, within: null, meet: segs[0].meet }
  }
  if (segs.some(s => s.kind === 'meet')) throw new TokenQueryError('unsupported')

  const kinds = segs.map(s => s.kind)

  // within / !within
  const wi = kinds.findIndex(k => k === 'within' || k === 'not_within')
  if (wi >= 0) {
    const left = segs.slice(0, wi).filter(s => s.kind === 'pattern').map(s => toPat((s as any).pat))
    const right = segs.slice(wi + 1).filter(s => s.kind === 'pattern').map(s => toPat((s as any).pat))
    return {
      patterns: [], orGroups: null, meet: null, containing: null,
      within: { left, right, negated: kinds[wi] === 'not_within' },
    }
  }

  // containing / !containing
  const ci = kinds.findIndex(k => k === 'containing' || k === 'not_containing')
  if (ci >= 0) {
    const container = segs.slice(0, ci).filter(s => s.kind === 'pattern').map(s => toPat((s as any).pat))
    const content = segs.slice(ci + 1).filter(s => s.kind === 'pattern').map(s => toPat((s as any).pat))
    return {
      patterns: [], orGroups: null, meet: null, within: null,
      containing: { container, content, negated: kinds[ci] === 'not_containing' },
    }
  }

  // 顶层 OR
  if (kinds.includes('or')) {
    const groups: Pattern[][] = []
    let cur: Pattern[] = []
    for (const s of segs) {
      if (s.kind === 'or') { if (cur.length) groups.push(cur); cur = [] }
      else if (s.kind === 'pattern') cur.push(toPat(s.pat))
    }
    if (cur.length) groups.push(cur)
    if (groups.length === 0) throw new TokenQueryError('parse')
    if (groups.length === 1) return { patterns: groups[0], orGroups: null, containing: null, within: null, meet: null }
    return { patterns: groups[0], orGroups: groups, containing: null, within: null, meet: null }
  }

  // 标准序列
  const patterns = segs.filter(s => s.kind === 'pattern').map(s => toPat((s as any).pat))
  if (patterns.length === 0) throw new TokenQueryError('parse')
  return { patterns, orGroups: null, containing: null, within: null, meet: null }
}

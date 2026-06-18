/**
 * annotationTokenQuery - 标注模式「混用」CQL token 级求值器
 *
 * 在前端 SpaCy token 序列上求值把 `annotation` 标签与 word/lemma/pos/tag/dep
 * 混写的 CQL 查询。每个 token 携带「覆盖它的标注标签集合」（annotation 作为
 * token 属性，类似后端对 mipvu/nrc 的集合匹配处理）。
 *
 * 匹配粒度：token 级——一个匹配返回从首个匹配 token 的 start 到末个匹配 token
 * 的 end 的字符 span。（纯 annotation 查询仍由 annotationQuery.ts 以 span 级处理。）
 */

import type { Annotation } from '../../types'
import {
  parseTokenCql,
  type Pattern,
  type Condition,
} from './annotationCqlParser'

export { TokenQueryError } from './annotationCqlParser'
export type { TokenQueryErrorCode } from './annotationCqlParser'

export interface SearchMatch {
  start: number
  end: number
  text: string
}

/** 求值所需的 token（前端 SpaCy token 的子集） */
export interface QueryToken {
  text: string
  lemma?: string
  pos?: string
  tag?: string
  dep?: string
  start: number
  end: number
}

interface EvalToken extends QueryToken {
  ann: Set<string> // 覆盖该 token 的标注标签
}

/**
 * 判断查询是否需要 token 级求值（引用了任何非 annotation 的 token 属性）。
 * 用于路由：纯 annotation → span 级；混用 → token 级。
 */
export function referencesTokenAttribute(cql: string): boolean {
  return /\b(word|lemma|pos|tag|dep)\s*(===?|!==?|=)/.test(cql)
}

function regexFullMatch(pattern: string, value: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`, 'i').test(value)
  } catch {
    return value.toLowerCase() === pattern.toLowerCase()
  }
}

function matchCondition(tok: EvalToken, cond: Condition): boolean {
  let m: boolean
  if (cond.attribute === 'annotation') {
    const labels = tok.ann
    switch (cond.operator) {
      case '==': m = labels.has(cond.value); break
      case '!==': m = !labels.has(cond.value); break
      case '=': m = [...labels].some(l => regexFullMatch(cond.value, l)); break
      case '!=': m = ![...labels].some(l => regexFullMatch(cond.value, l)); break
    }
  } else {
    const raw = (cond.attribute === 'word' ? tok.text : (tok as any)[cond.attribute]) ?? ''
    const value = String(raw)
    switch (cond.operator) {
      case '==': m = value.toLowerCase() === cond.value.toLowerCase(); break
      case '!==': m = value.toLowerCase() !== cond.value.toLowerCase(); break
      case '=': m = regexFullMatch(cond.value, value); break
      case '!=': m = !regexFullMatch(cond.value, value); break
    }
  }
  return cond.negated ? !m! : m!
}

function matchPattern(tok: EvalToken, pat: Pattern): boolean {
  if (pat.isAny) return true
  if (pat.orConditions) {
    return pat.orConditions.some(group => group.every(c => matchCondition(tok, c)))
  }
  return pat.conditions.every(c => matchCondition(tok, c))
}

/**
 * 从 start 处尝试匹配 pattern 序列，支持数量词（含 [] 任意 token 的非贪婪/贪婪回溯）。
 * 返回 [startIdx, endIdxExclusive, matchedTokens] 或 null。
 */
function tryMatchSequence(
  tokens: EvalToken[],
  patterns: Pattern[],
  start: number
): [number, number, EvalToken[]] | null {
  if (patterns.length === 0) return [start, start, []]

  const pat = patterns[0]
  const rest = patterns.slice(1)

  if (pat.isAny) {
    const lo = pat.minCount
    const hi = Math.min(pat.maxCount, tokens.length - start)
    // 后面还有 pattern → 非贪婪（少→多）；否则贪婪（多→少）
    const order: number[] = []
    if (rest.length > 0) for (let n = lo; n <= hi; n++) order.push(n)
    else for (let n = hi; n >= lo; n--) order.push(n)
    for (const n of order) {
      if (start + n > tokens.length) continue
      const take = tokens.slice(start, start + n)
      const sub = tryMatchSequence(tokens, rest, start + n)
      if (sub) return [start, sub[1], [...take, ...sub[2]]]
    }
    return null
  }

  // 具名 pattern：当前位置必须匹配（minCount=maxCount=1，optional 允许跳过）
  if (start < tokens.length && matchPattern(tokens[start], pat)) {
    const sub = tryMatchSequence(tokens, rest, start + 1)
    if (sub) return [start, sub[1], [tokens[start], ...sub[2]]]
  }
  if (pat.optional || pat.minCount === 0) {
    const sub = tryMatchSequence(tokens, rest, start)
    if (sub) return sub
  }
  return null
}

function findSequenceMatches(tokens: EvalToken[], patterns: Pattern[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i < tokens.length; i++) {
    const r = tryMatchSequence(tokens, patterns, i)
    if (r && r[2].length > 0) out.push([r[0], r[1]])
  }
  return out
}

function spanOf(tokens: EvalToken[], startIdx: number, endIdxExcl: number): SearchMatch {
  const first = tokens[startIdx]
  const last = tokens[endIdxExcl - 1]
  return {
    start: first.start,
    end: last.end,
    text: tokens.slice(startIdx, endIdxExcl).map(t => t.text).join(' '),
  }
}

/** 构建带标注标签集合的 EvalToken 序列（按 start 排序） */
function buildEvalTokens(tokens: QueryToken[], annotations: Annotation[]): EvalToken[] {
  const userAnns = annotations.filter(a => !a.id?.startsWith('spacy-'))
  const sorted = [...tokens].sort((a, b) => a.start - b.start)
  return sorted.map(t => {
    const ann = new Set<string>()
    for (const a of userAnns) {
      // 任意字符重叠即视为该 token 被该标注覆盖
      if (a.startPosition < t.end && a.endPosition > t.start) ann.add(a.label)
    }
    return { ...t, ann }
  })
}

/**
 * 在前端 SpaCy token 序列上求值「混用」annotation CQL 查询。
 * @throws TokenQueryError 语法/属性不支持时抛出
 */
export function evaluateAnnotationTokenQuery(
  cql: string,
  tokens: QueryToken[],
  annotations: Annotation[]
): SearchMatch[] {
  const q = parseTokenCql(cql)
  const evalTokens = buildEvalTokens(tokens, annotations)

  // 顶层 OR：合并各分支去重
  if (q.orGroups) {
    const seen = new Set<string>()
    const out: SearchMatch[] = []
    for (const group of q.orGroups) {
      for (const [s, e] of findSequenceMatches(evalTokens, group)) {
        const key = `${s}-${e}`
        if (!seen.has(key)) { seen.add(key); out.push(spanOf(evalTokens, s, e)) }
      }
    }
    return out
  }

  // meet：P 与 Q 在 [left,right] token 距离内共现，返回 P 的 token span
  if (q.meet) {
    const { pattern1, pattern2, left, right } = q.meet
    const out: SearchMatch[] = []
    for (let i = 0; i < evalTokens.length; i++) {
      if (!matchPattern(evalTokens[i], pattern1)) continue
      let found = false
      for (let d = left; d <= right; d++) {
        if (d === 0) continue
        const j = i + d
        if (j >= 0 && j < evalTokens.length && matchPattern(evalTokens[j], pattern2)) { found = true; break }
      }
      if (found) out.push(spanOf(evalTokens, i, i + 1))
    }
    return out
  }

  // containing：容器 token span 是否（不）包含一个匹配 content 的子序列
  if (q.containing) {
    const { container, content, negated } = q.containing
    const out: SearchMatch[] = []
    for (const [cs, ce] of findSequenceMatches(evalTokens, container)) {
      let has = false
      for (let i = cs; i < ce; i++) {
        const r = tryMatchSequence(evalTokens, content, i)
        if (r && r[2].length > 0 && r[1] <= ce) { has = true; break }
      }
      if (has !== negated) out.push(spanOf(evalTokens, cs, ce))
    }
    return out
  }

  // within：base(left) token span 是否（不）被一个匹配 right 的序列所包含
  if (q.within) {
    const { left, right, negated } = q.within
    const containers = findSequenceMatches(evalTokens, right)
    const out: SearchMatch[] = []
    for (const [bs, be] of findSequenceMatches(evalTokens, left)) {
      const inside = containers.some(([cs, ce]) => bs >= cs && be <= ce)
      if (inside !== negated) out.push(spanOf(evalTokens, bs, be))
    }
    return out
  }

  // 标准序列
  return findSequenceMatches(evalTokens, q.patterns).map(([s, e]) => spanOf(evalTokens, s, e))
}

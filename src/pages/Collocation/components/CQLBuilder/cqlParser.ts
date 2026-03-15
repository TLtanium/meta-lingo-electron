/**
 * CQL String to BuilderElement[] Parser
 * Converts a CQL query string back into visual builder elements
 * for template restoration and CQL import
 */

import type {
  BuilderElement,
  TokenAttribute,
  ComparisonOperator,
  ConditionGroup,
  TokenCondition,
  RepeatMode,
  RepeatQuantifier
} from './types'
import type { StructureVariant } from './types'
import { generateId } from './constants'

/**
 * Parse a CQL string into an array of BuilderElements
 * Handles: <s>, <doc ...>, (meet P Q -n m), [attr="val"], [], []{n,m}, []?, []*, [ws(...)], "word", |
 */
export function parseCQLToElements(cql: string): BuilderElement[] {
  const elements: BuilderElement[] = []
  let pos = 0
  const query = cql.trim()

  while (pos < query.length) {
    // Skip whitespace
    while (pos < query.length && query[pos] === ' ') pos++
    if (pos >= query.length) break

    if (query[pos] === '<') {
      const result = parseStructuralMarker(query, pos)
      elements.push(result.element)
      pos = result.endPos
    } else if (query[pos] === '(') {
      const meetResult = parseMeetExpression(query, pos)
      if (meetResult) {
        elements.push(meetResult.element)
        pos = meetResult.endPos
      } else {
        pos++ // skip stray '('
      }
    } else if (query.slice(pos).startsWith('within')) {
      elements.push({ id: generateId(), type: 'within' })
      pos += 'within'.length
    } else if (query.slice(pos).startsWith('!within')) {
      elements.push({ id: generateId(), type: 'not_within' })
      pos += '!within'.length
    } else if (query.slice(pos).startsWith('containing')) {
      elements.push({ id: generateId(), type: 'containing' })
      pos += 'containing'.length
    } else if (query.slice(pos).startsWith('!containing')) {
      elements.push({ id: generateId(), type: 'not_containing' })
      pos += '!containing'.length
    } else if (query[pos] === '[') {
      const result = parseBracketToken(query, pos)
      elements.push(result.element)
      pos = result.endPos
    } else if (query[pos] === '"') {
      // Parse quoted word
      const endQuote = query.indexOf('"', pos + 1)
      if (endQuote === -1) break
      const word = query.slice(pos + 1, endQuote)
      elements.push({
        id: generateId(),
        type: 'normal_token',
        conditionGroups: [{
          conditions: [{
            id: generateId(),
            attribute: 'word',
            operator: '=',
            value: word
          }],
          logic: 'and'
        }]
      })
      pos = endQuote + 1
    } else if (query[pos] === '|') {
      elements.push({ id: generateId(), type: 'or' })
      pos++
    } else {
      // Skip unknown characters
      pos++
    }
  }

  return elements
}

// ─── Shared quantifier parser ─────────────────────────────────────────────────

interface ParsedQuantifier {
  optional: boolean
  star: boolean
  repeat?: RepeatQuantifier
  endPos: number
}

/**
 * Try to consume a quantifier suffix (?, *, or {n,m}/{n,}/{,m}/{n}) starting at pos.
 * Returns flags + new endPos. All flags false if no quantifier found.
 */
function parseQuantifierSuffix(query: string, pos: number): ParsedQuantifier {
  if (pos < query.length && query[pos] === '?') {
    return { optional: true, star: false, endPos: pos + 1 }
  }
  if (pos < query.length && query[pos] === '*') {
    return { optional: false, star: true, endPos: pos + 1 }
  }
  if (pos < query.length && query[pos] === '{') {
    const repEnd = query.indexOf('}', pos)
    if (repEnd !== -1) {
      const repContent = query.slice(pos + 1, repEnd)
      let mode: RepeatMode = 'minmax'
      let min = 0, max = 2
      if (repContent.includes(',')) {
        const ci = repContent.indexOf(',')
        const minStr = repContent.slice(0, ci).trim()
        const maxStr = repContent.slice(ci + 1).trim()
        if (!minStr)       { mode = 'max';     min = 0; max = parseInt(maxStr) || 1 }
        else if (!maxStr)  { mode = 'min';     min = parseInt(minStr) || 0; max = 0 }
        else               { mode = 'minmax';  min = parseInt(minStr) || 0; max = parseInt(maxStr) || 2 }
      } else {
        mode = 'exactly'; min = max = parseInt(repContent.trim()) || 1
      }
      return { optional: false, star: false, repeat: { mode, min, max }, endPos: repEnd + 1 }
    }
  }
  return { optional: false, star: false, endPos: pos }
}

/**
 * Parse a bracket token [...] with optional modifiers
 */
function parseBracketToken(query: string, startPos: number): { element: BuilderElement; endPos: number } {
  // Find matching ]
  let bracketCount = 1
  let pos = startPos + 1
  while (pos < query.length && bracketCount > 0) {
    if (query[pos] === '[') bracketCount++
    else if (query[pos] === ']') bracketCount--
    pos++
  }

  const content = query.slice(startPos + 1, pos - 1).trim()

  // Consume optional quantifier suffix
  const q = parseQuantifierSuffix(query, pos)
  const quantifierKind: 'optional' | 'star' | 'repeat' | null =
    q.optional ? 'optional' : q.star ? 'star' : q.repeat ? 'repeat' : null
  const repeatQuant = q.repeat
  const distMode: RepeatMode = q.repeat?.mode ?? 'minmax'
  const distMin = q.repeat?.min ?? 0
  const distMax = q.repeat?.max ?? 1
  const endPos = q.endPos

  // Empty brackets: [] or []{n,m} or []? or []*
  if (!content) {
    if (quantifierKind === 'repeat') {
      // []{...} → distance element
      return {
        element: {
          id: generateId(),
          type: 'distance',
          distanceMode: distMode,
          minCount: distMin,
          maxCount: distMax,
        },
        endPos
      }
    }
    // []? or []* or [] → unspecified_token (with optional/star flag)
    const el: BuilderElement = { id: generateId(), type: 'unspecified_token' }
    if (quantifierKind === 'optional') el.optional = true
    if (quantifierKind === 'star')     el.star = true
    return { element: el, endPos }
  }

  // Word sketch template: [ws(headword,relation,collocation)]
  if (content.startsWith('ws(') && content.endsWith(')')) {
    const inner = content.slice(3, -1).trim()
    const parts = inner.split(',').map((s) => s.trim())
    const wsHeadword = parts[0] ?? ''
    const wsRelation = parts[1] ?? ''
    const wsCollocation = parts[2] ?? ''
    const el: BuilderElement = {
      id: generateId(),
      type: 'word_sketch',
      wsHeadword,
      wsRelation,
      wsCollocation,
    }
    if (quantifierKind === 'optional') el.optional = true
    else if (quantifierKind === 'star') el.star = true
    else if (quantifierKind === 'repeat' && repeatQuant) el.repeat = repeatQuant
    return { element: el, endPos }
  }

  // Has content: parse conditions → normal_token
  const conditionGroups = parseConditions(content)
  const el: BuilderElement = { id: generateId(), type: 'normal_token', conditionGroups }

  // Apply quantifier to the token
  if (quantifierKind === 'optional')        el.optional = true
  else if (quantifierKind === 'star')       el.star = true
  else if (quantifierKind === 'repeat' && repeatQuant) el.repeat = repeatQuant

  return { element: el, endPos }
}

/**
 * Parse (meet P Q -n m) expression. Returns null if not a meet expression.
 */
function parseMeetExpression(
  query: string,
  startPos: number
): { element: BuilderElement; endPos: number } | null {
  if (query[startPos] !== '(') return null
  const afterOpen = query.slice(startPos + 1).replace(/^\s+/, '')
  if (!afterOpen.toLowerCase().startsWith('meet')) return null
  let pos = startPos + 1
  while (pos < query.length && /[\s]/.test(query[pos])) pos++
  if (pos + 4 > query.length || query.slice(pos, pos + 4).toLowerCase() !== 'meet') return null
  pos += 4
  while (pos < query.length && query[pos] === ' ') pos++
  if (pos >= query.length || query[pos] !== '[') return null
  const p1Start = pos
  const p1Result = parseBracketToken(query, pos)
  pos = p1Result.endPos
  const pattern1CQL = query.slice(p1Start, pos)
  while (pos < query.length && query[pos] === ' ') pos++
  if (pos >= query.length || query[pos] !== '[') return null
  const p2Start = pos
  const p2Result = parseBracketToken(query, pos)
  pos = p2Result.endPos
  const pattern2CQL = query.slice(p2Start, pos)
  while (pos < query.length && query[pos] === ' ') pos++
  const numStart = pos
  if (pos < query.length && query[pos] === '-') pos++
  while (pos < query.length && /[0-9]/.test(query[pos])) pos++
  const leftStr = query.slice(numStart, pos).trim()
  const leftDist = parseInt(leftStr, 10)
  if (Number.isNaN(leftDist)) return null
  while (pos < query.length && query[pos] === ' ') pos++
  const rightStart = pos
  while (pos < query.length && /[0-9]/.test(query[pos])) pos++
  const rightStr = query.slice(rightStart, pos).trim()
  const rightDist = parseInt(rightStr, 10)
  if (Number.isNaN(rightDist)) return null
  while (pos < query.length && query[pos] === ' ') pos++
  if (pos < query.length && query[pos] === ')') pos++

  const element: BuilderElement = {
    id: generateId(),
    type: 'meet',
    meetPattern1: pattern1CQL,
    meetPattern2: pattern2CQL,
    meetLeft: leftDist,
    meetRight: rightDist
  }
  return { element, endPos: pos }
}

/**
 * Parse a structural marker: <s>, </s>, <s/>, <p>, </p>, <p/>
 * Document-level tags (<doc>) are excluded — corpus selection handles that scope.
 */
function parseStructuralMarker(
  query: string,
  startPos: number
): { element: BuilderElement; endPos: number } {
  if (query[startPos] !== '<') return { element: { id: generateId(), type: 'normal_token', conditionGroups: [] }, endPos: startPos + 1 }
  let pos = startPos + 1
  const isClosing = pos < query.length && query[pos] === '/'
  if (isClosing) pos++
  while (pos < query.length && query[pos] === ' ') pos++
  let tagStart = pos
  while (pos < query.length && /[a-z]/.test(query[pos])) pos++
  const tag = query.slice(tagStart, pos).toLowerCase()
  while (pos < query.length && query[pos] === ' ') pos++
  const selfClosing = pos < query.length && query[pos] === '/'
  if (selfClosing) pos++
  while (pos < query.length && query[pos] === ' ') pos++
  // Skip any remaining attributes before '>'
  while (pos < query.length && query[pos] !== '>') pos++
  if (pos < query.length && query[pos] === '>') pos++

  let structureVariant: StructureVariant = 's_self'
  if (tag === 's') {
    structureVariant = isClosing ? 's_close' : selfClosing ? 's_self' : 's_open'
  } else if (tag === 'p') {
    structureVariant = isClosing ? 'p_close' : selfClosing ? 'p_self' : 'p_open'
  }
  // <doc …> is not a supported builder element — skip it

  // Consume optional quantifier suffix after the structural marker
  const q = parseQuantifierSuffix(query, pos)
  const element: BuilderElement = { id: generateId(), type: 'structure', structureVariant }
  if (q.optional)      element.optional = true
  else if (q.star)     element.star = true
  else if (q.repeat)   element.repeat = q.repeat
  return { element, endPos: q.endPos }
}

/**
 * Parse condition content inside brackets into ConditionGroups
 */
function parseConditions(content: string): ConditionGroup[] {
  // Check for | (OR) between conditions
  const orParts = splitByOperator(content, '|')

  if (orParts.length > 1) {
    // OR conditions - put all in one group with logic='or'
    const conditions: TokenCondition[] = []
    for (const part of orParts) {
      // Each OR part may contain AND conditions
      const andParts = splitByOperator(part.trim(), '&')
      for (const andPart of andParts) {
        const parsed = parseSingleCondition(andPart.trim())
        if (parsed) conditions.push(parsed)
      }
    }
    return [{ conditions, logic: 'or' }]
  }

  // AND conditions
  const andParts = splitByOperator(content, '&')
  const conditions: TokenCondition[] = []
  for (const part of andParts) {
    const parsed = parseSingleCondition(part.trim())
    if (parsed) conditions.push(parsed)
  }
  return [{ conditions, logic: 'and' }]
}

/**
 * Parse a single condition string like pos="NOUN" or word=="make"
 */
function parseSingleCondition(text: string): TokenCondition | null {
  if (!text) return null

  // Handle negation prefix
  let negated = false
  let cleanText = text
  if (cleanText.startsWith('!') && !cleanText.startsWith('!=') && !cleanText.startsWith('!==')) {
    negated = true
    cleanText = cleanText.slice(1).trim()
  }

  // Match: attribute operator "value"
  // Operators: ==, !==, !=, =
  const match = cleanText.match(/^(\w+)\s*(===?|!==?|=)\s*"([^"]*)"$/)
  if (!match) return null

  const [, attribute, operator, value] = match

  // Valid attributes
  const validAttributes = ['word', 'lemma', 'pos', 'tag', 'dep', 'headword', 'headlemma', 'headpos', 'headdep', 'usas', 'nrc']
  if (!validAttributes.includes(attribute)) return null

  let finalOperator = operator as ComparisonOperator
  if (negated && operator === '=') {
    finalOperator = '!='
    negated = false
  } else if (negated && operator === '==') {
    finalOperator = '!=='
    negated = false
  }

  return {
    id: generateId(),
    attribute: attribute as TokenAttribute,
    operator: finalOperator,
    value
  }
}

/**
 * Split content by single-char operator, respecting quoted strings
 */
function splitByOperator(content: string, op: string): string[] {
  const parts: string[] = []
  let current: string[] = []
  let inQuotes = false

  for (const char of content) {
    if (char === '"') {
      inQuotes = !inQuotes
      current.push(char)
    } else if (char === op && !inQuotes) {
      parts.push(current.join(''))
      current = []
    } else {
      current.push(char)
    }
  }
  if (current.length) parts.push(current.join(''))
  return parts
}

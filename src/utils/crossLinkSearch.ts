import type { MatchMode } from '../types/crossLink'

/** Missing NLP lemmas include empty strings, not just null/undefined. */
export function nonBlankSearchText(...values: Array<string | null | undefined>): string | undefined {
  return values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim()
}

interface AnnotationRange { text?: string; label?: string; startPosition?: number; endPosition?: number }
interface SearchToken { text: string; start: number; end: number; lemma?: string | null }

export function annotationSearchParams(annotation: AnnotationRange, tokens: SearchToken[]): {
  searchWord: string; matchMode: MatchMode; forceSearchMode: MatchMode | 'simple'
} {
  const text = nonBlankSearchText(annotation.text)
  const matching = tokens.filter(token => token.start >= (annotation.startPosition ?? Infinity) && token.end <= (annotation.endPosition ?? -Infinity))
  // A token merely contained in a wider annotation must not replace the whole span.
  const token = matching.length === 1 && matching[0].text.trim() === text ? matching[0] : undefined
  const lemma = token ? nonBlankSearchText(token.lemma) : undefined
  const mode = lemma ? 'lemma' : 'word'
  return { searchWord: lemma ?? text ?? nonBlankSearchText(annotation.label) ?? '', matchMode: mode, forceSearchMode: lemma ? 'lemma' : 'simple' }
}

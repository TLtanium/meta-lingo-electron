/**
 * Auto-Annotation Utility Functions
 * 
 * Provides helper functions for automatic annotation based on framework type:
 * - MIPVU: Auto-annotate metaphor-related words with 'indirect' label
 * - Halliday-Theme / Berry-Theme: Auto-annotate theme and rheme
 */

import type { Annotation, AnnotationRelation } from '../types'
import type { ThemeRhemeResult } from '../api'

// Framework IDs that support auto-annotation
export const AUTO_ANNOTATION_FRAMEWORKS = {
  MIPVU: 'MIPVU',
  HALLIDAY_THEME: 'Halliday-Theme',
  BERRY_THEME: 'Berry-Theme'
} as const

// Label IDs for each framework
export const FRAMEWORK_LABELS = {
  // Framework id stays 'MIPVU' (auto-annotation detection); display name is now
  // 'Metaphor', and the mipvu labels live under metaphor > SYSTEM-TYPE > mipvu.
  // Paths below are label-only breadcrumbs (tiers omitted) for display.
  MIPVU: {
    indirect: '79ee0895-6eaf-4f39-adad-d0ba5c0c068b',
    indirect_color: '#ad89aa',
    indirect_path: 'metaphor > mipvu > markers > mrw > indirect',
    direct: '67d591b5-dcb6-4664-8742-b52e389d8ce0',
    direct_color: '#d0d59f',
    direct_path: 'metaphor > mipvu > markers > mrw > direct',
    mflag: '621b899e-c406-4f46-ba21-0c6fad3445a3',
    mflag_color: '#b3a89c',
    mflag_path: 'metaphor > mipvu > markers > mflag',
    implicit: '42d5860a-a427-4118-9053-a8bce286a34c',
    implicit_color: '#8a96af',
    implicit_path: 'metaphor > mipvu > markers > mrw > implicit'
  },
  'Halliday-Theme': {
    theme: '641ca3de-75d0-4e7e-ac4f-00aaeedbb2e2',
    theme_color: '#d19bda',
    theme_path: 'element > theme',
    rheme: '89ab545d-db8b-4a3a-bcf0-bdd6ce304be8',
    rheme_color: '#db7fd2',
    rheme_path: 'element > rheme'
  },
  'Berry-Theme': {
    theme: '0eda69bb-212b-4fa6-943d-15adfe64cfe8',
    theme_color: '#d19bda',
    theme_path: 'element > theme',
    rheme: '65c7bcd4-389a-479e-85e0-3c2f570221a5',
    rheme_color: '#db7fd2',
    rheme_path: 'element > rheme'
  }
} as const

/**
 * Check if a framework supports auto-annotation
 */
export function isAutoAnnotationSupported(frameworkId: string): boolean {
  return Object.values(AUTO_ANNOTATION_FRAMEWORKS).includes(frameworkId as typeof AUTO_ANNOTATION_FRAMEWORKS[keyof typeof AUTO_ANNOTATION_FRAMEWORKS])
}

/**
 * Get the auto-annotation type for a framework
 */
export function getAutoAnnotationType(frameworkId: string): 'mipvu' | 'theme-rheme' | null {
  if (frameworkId === AUTO_ANNOTATION_FRAMEWORKS.MIPVU) {
    return 'mipvu'
  }
  if (frameworkId === AUTO_ANNOTATION_FRAMEWORKS.HALLIDAY_THEME || 
      frameworkId === AUTO_ANNOTATION_FRAMEWORKS.BERRY_THEME) {
    return 'theme-rheme'
  }
  return null
}

/**
 * Convert backend transcript offset to frontend contiguous offset.
 * Backend uses +1 (e.g. newline) between segments; frontend uses no separator.
 * segmentLengths[i] = length of segment i text.
 */
export function convertTranscriptBackendOffsetToFrontend(
  backendOffset: number,
  segmentLengths: number[]
): number {
  let backendAcc = 0
  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i]
    const segStart = backendAcc
    const segEnd = backendAcc + segLen
    if (backendOffset >= segStart && backendOffset <= segEnd) {
      return backendOffset - i
    }
    backendAcc = segEnd + 1
  }
  return backendOffset - segmentLengths.length
}

/**
 * Convert MIPVU API data from backend transcript offset space to frontend contiguous.
 * Backend get_mipvu_annotation uses +1 between segments when merging; frontend uses join('').
 */
export function convertMipvuDataOffsetsForTranscript(
  mipvuData: MIPVUAnnotationData,
  segmentLengths: number[]
): MIPVUAnnotationData {
  if (!mipvuData.sentences?.length || !segmentLengths.length) return mipvuData
  const convert = (n: number) => convertTranscriptBackendOffsetToFrontend(n, segmentLengths)
  return {
    ...mipvuData,
    sentences: mipvuData.sentences.map(s => ({
      ...s,
      tokens: s.tokens.map(t => ({
        ...t,
        start: convert(t.start),
        end: convert(t.end)
      }))
    }))
  }
}

/**
 * Convert Theme/Rheme API results from backend transcript offset space to frontend contiguous.
 */
export function convertThemeRhemeResultsForTranscript(
  results: ThemeRhemeResult[],
  segmentLengths: number[]
): ThemeRhemeResult[] {
  if (!segmentLengths.length) return results
  const convert = (n: number) => convertTranscriptBackendOffsetToFrontend(n, segmentLengths)
  return results.map(r => ({
    ...r,
    theme_start: convert(r.theme_start),
    theme_end: convert(r.theme_end),
    rheme_start: convert(r.rheme_start),
    rheme_end: convert(r.rheme_end)
  }))
}

/**
 * MIPVU Token interface from MIPVU annotation data
 */
interface MIPVUToken {
  word: string
  lemma: string
  pos: string
  tag: string
  dep: string
  start: number
  end: number
  is_metaphor: boolean
  is_direct_metaphor?: boolean
  is_mflag?: boolean
  is_implicit_metaphor?: boolean
  metaphor_confidence: number
  direct_confidence?: number
  implicit_rule?: string    // 'VPE-1' | 'VPE-2' | 'SUB-1' | ''
  implicit_antecedent_start?: number  // char offset of antecedent MRW token
  implicit_antecedent_end?: number
  metaphor_source: string
}

interface MIPVUSentence {
  text: string
  tokens: MIPVUToken[]
}

interface MIPVUAnnotationData {
  success: boolean
  sentences: MIPVUSentence[]
  statistics?: {
    total_tokens: number
    metaphor_tokens: number
    literal_tokens: number
    metaphor_rate: number
    source_counts: Record<string, number>
  }
}

/** Maps implicit_rule code to a short description for remarks. */
function _implicitRuleDesc(rule: string | undefined): string {
  if (rule === 'VPE-1') return 'VP ellipsis: trigger + AUX'
  if (rule === 'VPE-2') return 'VP ellipsis: bare AUX clause'
  if (rule === 'SUB-1') return 'pronoun substitution (single antecedent)'
  return 'rule-based'
}

/**
 * Create MIPVU annotations from MIPVU annotation data.
 * Creates one annotation per applicable label per token:
 * - indirect:  tokens with is_metaphor=true          (metalingo-indirect-metaphor)
 * - direct:    tokens with is_direct_metaphor=true   (metalingo-direct-metaphor)
 * - mflag:     tokens with is_mflag=true             (metalingo-direct-metaphor)
 * - implicit:  tokens with is_implicit_metaphor=true (rule-based post-processing, Step 5)
 * A token may receive multiple annotations if multiple labels apply.
 *
 * Returns { annotations, relations } where relations are arrow links from each
 * implicit metaphor annotation to its antecedent indirect metaphor annotation.
 */
export function createMipvuAnnotations(
  mipvuData: MIPVUAnnotationData,
  textContent: string
): { annotations: Annotation[], relations: AnnotationRelation[] } {
  const annotations: Annotation[] = []

  if (!mipvuData.success || !mipvuData.sentences) {
    return { annotations, relations: [] }
  }

  const labelInfo = FRAMEWORK_LABELS.MIPVU

  // Map: character start offset → annotation id (for indirect metaphors only)
  const indirectStartToId = new Map<number, string>()

  // Collect implicit tokens with antecedent offsets for later relation building
  interface ImplicitPending { annId: string; antStart: number | undefined }
  const implicitPending: ImplicitPending[] = []

  for (const sentence of mipvuData.sentences) {
    for (const token of sentence.tokens) {
      const annotatedText = textContent.substring(token.start, token.end) || token.word
      const confPct = (token.metaphor_confidence * 100).toFixed(1)

      // Indirect metaphor
      if (token.is_metaphor) {
        const annId = crypto.randomUUID()
        indirectStartToId.set(token.start, annId)
        annotations.push({
          id: annId,
          text: annotatedText,
          startPosition: token.start,
          endPosition: token.end,
          label: 'indirect',
          labelPath: labelInfo.indirect_path,
          color: labelInfo.indirect_color,
          type: 'text',
          pos: token.pos,
          entity: undefined,
          remark: `Indirect metaphor (MRW, ind) — confidence: ${confPct}%`
        })
      }

      // Direct metaphor MRW
      if (token.is_direct_metaphor) {
        const dConf = token.direct_confidence != null
          ? ` — confidence: ${(token.direct_confidence * 100).toFixed(1)}%`
          : ''
        annotations.push({
          id: crypto.randomUUID(),
          text: annotatedText,
          startPosition: token.start,
          endPosition: token.end,
          label: 'direct',
          labelPath: labelInfo.direct_path,
          color: labelInfo.direct_color,
          type: 'text',
          pos: token.pos,
          entity: undefined,
          remark: `Direct metaphor (MRW, lit)${dConf}`
        })
      }

      // MFlag marker
      if (token.is_mflag) {
        const dConf = token.direct_confidence != null
          ? ` — confidence: ${(token.direct_confidence * 100).toFixed(1)}%`
          : ''
        annotations.push({
          id: crypto.randomUUID(),
          text: annotatedText,
          startPosition: token.start,
          endPosition: token.end,
          label: 'mflag',
          labelPath: labelInfo.mflag_path,
          color: labelInfo.mflag_color,
          type: 'text',
          pos: token.pos,
          entity: undefined,
          remark: `MFlag (metaphor signal marker)${dConf}`
        })
      }

      // Implicit metaphor (MRW, impl) — rule-based Step 5
      if (token.is_implicit_metaphor) {
        const ruleDesc = _implicitRuleDesc(token.implicit_rule)
        const ruleTag  = token.implicit_rule ? ` [${token.implicit_rule}]` : ''
        const annId    = crypto.randomUUID()
        annotations.push({
          id: annId,
          text: annotatedText,
          startPosition: token.start,
          endPosition: token.end,
          label: 'implicit',
          labelPath: labelInfo.implicit_path,
          color: labelInfo.implicit_color,
          type: 'text',
          pos: token.pos,
          entity: undefined,
          remark: `Implicit metaphor (MRW, impl) — ${ruleDesc}${ruleTag}`
        })
        implicitPending.push({ annId, antStart: token.implicit_antecedent_start })
      }
    }
  }

  // Build relations: implicit → antecedent indirect
  const relations: AnnotationRelation[] = []
  for (const { annId, antStart } of implicitPending) {
    if (antStart == null) continue
    const targetId = indirectStartToId.get(antStart)
    if (!targetId) continue
    relations.push({
      id: crypto.randomUUID(),
      sourceId: annId,
      targetId,
      label: 'refers-to',
      color: labelInfo.implicit_color,
    })
  }

  return { annotations, relations }
}

/**
 * Create Theme/Rheme annotations from analysis results
 */
export function createThemeRhemeAnnotations(
  results: ThemeRhemeResult[],
  frameworkId: 'Halliday-Theme' | 'Berry-Theme',
  textContent: string
): Annotation[] {
  const annotations: Annotation[] = []
  
  const labelInfo = FRAMEWORK_LABELS[frameworkId]
  
  for (const result of results) {
    // Create theme annotation if there's text
    if (result.theme_text && result.theme_text.trim()) {
      const themeAnnotation: Annotation = {
        id: crypto.randomUUID(),
        text: result.theme_text.trim(),
        startPosition: result.theme_start,
        endPosition: result.theme_end,
        label: 'theme',
        labelPath: labelInfo.theme_path,
        color: labelInfo.theme_color,
        type: 'text'
      }
      annotations.push(themeAnnotation)
    }
    
    // Create rheme annotation if there's text
    if (result.rheme_text && result.rheme_text.trim()) {
      const rhemeAnnotation: Annotation = {
        id: crypto.randomUUID(),
        text: result.rheme_text.trim(),
        startPosition: result.rheme_start,
        endPosition: result.rheme_end,
        label: 'rheme',
        labelPath: labelInfo.rheme_path,
        color: labelInfo.rheme_color,
        type: 'text'
      }
      annotations.push(rhemeAnnotation)
    }
  }
  
  return annotations
}

/**
 * Merge new auto-annotations with existing annotations
 * Avoids duplicates by checking for overlapping positions with the same label
 */
export function mergeAnnotations(
  existingAnnotations: Annotation[],
  newAnnotations: Annotation[]
): Annotation[] {
  const merged = [...existingAnnotations]
  
  for (const newAnn of newAnnotations) {
    // Check if there's already an annotation at the same position with the same label
    const isDuplicate = existingAnnotations.some(existing => 
      existing.startPosition === newAnn.startPosition &&
      existing.endPosition === newAnn.endPosition &&
      existing.label === newAnn.label
    )
    
    if (!isDuplicate) {
      merged.push(newAnn)
    }
  }
  
  return merged
}

/**
 * Check if annotations would overlap (cross) with existing annotations
 * Returns the conflicting annotations
 */
export function findConflictingAnnotations(
  existingAnnotations: Annotation[],
  newAnnotations: Annotation[]
): Annotation[] {
  const conflicts: Annotation[] = []
  
  for (const newAnn of newAnnotations) {
    for (const existing of existingAnnotations) {
      // Check for crossing (overlapping but not nested)
      const newStart = newAnn.startPosition
      const newEnd = newAnn.endPosition
      const existStart = existing.startPosition
      const existEnd = existing.endPosition
      
      // Crossing condition: one starts inside the other but doesn't end inside
      const isCrossing = (
        (newStart > existStart && newStart < existEnd && newEnd > existEnd) ||
        (existStart > newStart && existStart < newEnd && existEnd > newEnd)
      )
      
      if (isCrossing) {
        conflicts.push(newAnn)
        break
      }
    }
  }
  
  return conflicts
}

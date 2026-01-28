/**
 * Auto-Annotation Utility Functions
 * 
 * Provides helper functions for automatic annotation based on framework type:
 * - MIPVU: Auto-annotate metaphor-related words with 'indirect' label
 * - Halliday-Theme / Berry-Theme: Auto-annotate theme and rheme
 */

import type { Annotation } from '../types'
import type { ThemeRhemeResult } from '../api'

// Framework IDs that support auto-annotation
export const AUTO_ANNOTATION_FRAMEWORKS = {
  MIPVU: 'MIPVU',
  HALLIDAY_THEME: 'Halliday-Theme',
  BERRY_THEME: 'Berry-Theme'
} as const

// Label IDs for each framework
export const FRAMEWORK_LABELS = {
  MIPVU: {
    indirect: '79ee0895-6eaf-4f39-adad-d0ba5c0c068b',
    indirect_color: '#ad89aa',
    indirect_path: 'metaphor > markers > mrw > indirect'
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
  metaphor_confidence: number
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

/**
 * Create MIPVU annotations from MIPVU annotation data
 * Marks all metaphor tokens with the 'indirect' label
 */
export function createMipvuAnnotations(
  mipvuData: MIPVUAnnotationData,
  textContent: string
): Annotation[] {
  const annotations: Annotation[] = []
  
  if (!mipvuData.success || !mipvuData.sentences) {
    return annotations
  }
  
  const labelInfo = FRAMEWORK_LABELS.MIPVU
  
  for (const sentence of mipvuData.sentences) {
    for (const token of sentence.tokens) {
      if (token.is_metaphor) {
        // Extract the actual text from the content
        const annotatedText = textContent.substring(token.start, token.end)
        
        const annotation: Annotation = {
          id: crypto.randomUUID(),
          text: annotatedText || token.word,
          startPosition: token.start,
          endPosition: token.end,
          label: 'indirect',
          labelPath: labelInfo.indirect_path,
          color: labelInfo.indirect_color,
          type: 'text',
          pos: token.pos,
          entity: undefined,
          remark: `Metaphor (${token.metaphor_source}, confidence: ${(token.metaphor_confidence * 100).toFixed(1)}%)`
        }
        
        annotations.push(annotation)
      }
    }
  }
  
  return annotations
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

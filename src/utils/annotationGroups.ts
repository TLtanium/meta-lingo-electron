/**
 * annotationGroups
 *
 * Shared helpers for discontinuous annotation groups (非连续词组). A group bundles
 * ≥2 annotations into one phrasal unit (e.g. "look … up", "not only … but also").
 * For statistics a group counts as ONE unit, represented by its first member.
 */

import type { Annotation, AnnotationGroup } from '../types'

/** Build annotationId → 1-based group number (for the group badge in tables / blocks). */
export function buildGroupNumberMap(groups: AnnotationGroup[]): Map<string, number> {
  const map = new Map<string, number>()
  groups.forEach((g, idx) => g.annotationIds.forEach(id => map.set(id, idx + 1)))
  return map
}

/**
 * Returns the set of annotation IDs that are "absorbed" into a group — i.e. every
 * group member except the representative (first present member). Absorbed members
 * are NOT counted separately, so each group contributes exactly one counting unit.
 */
export function getAbsorbedMemberIds(
  annotations: Annotation[],
  groups: AnnotationGroup[]
): Set<string> {
  const present = new Set(annotations.map(a => a.id))
  const absorbed = new Set<string>()
  for (const g of groups) {
    const members = g.annotationIds.filter(id => present.has(id))
    if (members.length < 2) continue // not a real group among these annotations
    for (let i = 1; i < members.length; i++) absorbed.add(members[i])
  }
  return absorbed
}

/**
 * Counts annotations treating each group as one unit (represented by its first
 * member). Ungrouped annotations count individually. Returns the total unit count
 * and per-label unit counts.
 */
export function countAnnotationUnits(
  annotations: Annotation[],
  groups: AnnotationGroup[]
): { total: number; byLabel: Map<string, number> } {
  const absorbed = getAbsorbedMemberIds(annotations, groups)
  const byLabel = new Map<string, number>()
  let total = 0
  for (const ann of annotations) {
    if (absorbed.has(ann.id)) continue
    total++
    byLabel.set(ann.label, (byLabel.get(ann.label) || 0) + 1)
  }
  return { total, byLabel }
}

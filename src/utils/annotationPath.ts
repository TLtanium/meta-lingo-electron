/**
 * Shared helpers for interpreting an annotation's `labelPath`.
 *
 * Canonical format (v4.9.38+): `/`-separated, includes every ancestor node
 * name from the framework root down to the leaf label — tier nodes (e.g.
 * `MRW-TYPE`) included. This is exactly what `FrameworkTree.addPathsToTree`
 * produces for a manually-picked label, and `createMipvuAnnotations` /
 * `createThemeRhemeAnnotations` (src/utils/autoAnnotation.ts) now hardcode
 * the same tier-inclusive `/` paths, so manual and auto-annotation labelPaths
 * are structurally identical.
 *
 * Older exported/imported archives may still carry the pre-unification
 * auto-annotation format (` > `-separated, tier nodes omitted) — `labelPath`
 * is written once at annotation time and never migrated in place, so both
 * shapes must keep working when read back.
 */

/**
 * Derive the "tier" (nearest ancestor label, i.e. the grandparent label in a
 * tier-inclusive path) a labelPath belongs to, for grouping/display purposes.
 */
export function deriveAnnotationTier(labelPath: string | undefined, label: string): string {
  if (!labelPath) return label

  // Legacy auto-annotation breadcrumb: ' > ' separated, tier nodes already
  // omitted, so the immediate parent segment IS the tier.
  if (!labelPath.includes('/') && labelPath.includes('>')) {
    const segs = labelPath.split('>').map(s => s.trim()).filter(Boolean)
    return segs.length >= 2 ? segs[segs.length - 2] : (segs[0] || label)
  }

  // Canonical tier-inclusive path: leaf's parent is a *-TYPE tier node, so
  // the grandparent (third segment from the end) is the nearest label.
  const segs = labelPath.split('/').map(s => s.trim()).filter(Boolean)
  if (segs.length >= 3) return segs[segs.length - 3]
  return segs[0] || label
}

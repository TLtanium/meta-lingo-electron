/**
 * annotationMeasure
 *
 * Shared DOM-measurement helpers for the text / transcript annotators.
 *
 * The annotation blocks are absolutely positioned over the source text, their
 * left/width derived from a DOM Range over the text's character span. The tricky
 * case is an ACTIVE SEARCH HIGHLIGHT: the highlighted slice is wrapped in a
 * <span> (with padding / bold width), so the text is no longer a single text
 * node and every token after the highlight shifts a few pixels. Measuring
 * against `firstChild` alone then mislocates every block. Walking ALL descendant
 * text nodes maps a character offset onto the real, possibly-shifted layout — and
 * naturally restores once the highlight is removed.
 */

/**
 * Resolves a character offset (relative to `root`'s text content) to a concrete
 * { textNode, offset } inside `root`, walking every descendant text node so it
 * works whether the text is one node or split by highlight spans.
 */
export function resolveCharOffset(
  root: Node,
  charOffset: number
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  let last: Text | null = null
  let remaining = charOffset
  while (node) {
    const len = node.textContent?.length ?? 0
    if (remaining <= len) return { node, offset: remaining }
    remaining -= len
    last = node
    node = walker.nextNode() as Text | null
  }
  if (last) return { node: last, offset: last.textContent?.length ?? 0 }
  return null
}

/** One block to measure: its id and char span relative to the text element. */
export interface MeasureItem {
  id: string
  relStart: number
  relEnd: number
}

/**
 * Measures pixel left/width for every item by mapping its character span onto the
 * live DOM via {@link resolveCharOffset}. Robust to search-highlight spans; falls
 * back to an 8px/char estimate if the offset can't be resolved.
 */
export function measureBlockPositions(
  textEl: Element,
  textLen: number,
  items: MeasureItem[]
): Map<string, { left: number; width: number }> {
  const out = new Map<string, { left: number; width: number }>()
  const containerRect = textEl.getBoundingClientRect()
  const range = document.createRange()
  for (const it of items) {
    const relStart = Math.min(Math.max(it.relStart, 0), textLen)
    const relEnd = Math.min(Math.max(it.relEnd, 0), textLen)
    try {
      const s = resolveCharOffset(textEl, relStart)
      const e = resolveCharOffset(textEl, relEnd)
      if (!s || !e) throw new Error('offset out of range')
      range.setStart(s.node, s.offset)
      range.setEnd(e.node, e.offset)
      const rect = range.getBoundingClientRect()
      out.set(it.id, { left: rect.left - containerRect.left, width: rect.width })
    } catch {
      out.set(it.id, { left: it.relStart * 8, width: (it.relEnd - it.relStart) * 8 })
    }
  }
  return out
}

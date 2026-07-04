/**
 * Shared CiteSpace-style "tag" label backgrounds.
 *
 * Given a selection of node <g> elements each containing a `text.node-label`, insert a
 * rounded, semi-transparent chip behind the text so labels stay legible over any node
 * colour / dense edges (replacing the hard-to-read bare black text).
 */

import * as d3 from 'd3'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function addTagBackgrounds(
  nodeSelection: d3.Selection<any, any, any, any>,
  colorFor: (d: any) => string,
  isDark: boolean
): void {
  const padX = 5
  const padY = 2.5
  const fill = isDark ? 'rgba(28,28,30,0.82)' : 'rgba(255,255,255,0.88)'

  // Two passes to avoid layout thrashing: read ALL bounding boxes first, then do all DOM
  // writes. Interleaving getBBox (read) with insertBefore (write) forces a reflow per
  // label and was a major source of first-render jank.
  const jobs: { parent: SVGGElement; textEl: SVGTextElement; bb: DOMRect; color: string; dc: string | null; dn: string | null }[] = []
  nodeSelection.selectAll<SVGTextElement, any>('text.node-label').each(function (d) {
    const textEl = this
    if (!textEl.textContent) return
    let bb: DOMRect
    try { bb = textEl.getBBox() } catch { return }   // READS only in this pass
    if (!bb.width) return
    const parent = textEl.parentNode as SVGGElement | null
    if (!parent) return
    jobs.push({
      parent, textEl, bb, color: colorFor(d),
      dc: textEl.getAttribute('data-cluster'),
      dn: textEl.getAttribute('data-node-id')
    })
  })

  for (const j of jobs) {                              // WRITES only in this pass
    const c = d3.color(j.color)
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('class', 'node-tag')
    rect.setAttribute('x', String(j.bb.x - padX))
    rect.setAttribute('y', String(j.bb.y - padY))
    rect.setAttribute('width', String(j.bb.width + padX * 2))
    rect.setAttribute('height', String(j.bb.height + padY * 2))
    rect.setAttribute('rx', '4')
    rect.setAttribute('ry', '4')
    rect.setAttribute('fill', fill)
    rect.setAttribute('stroke', c ? c.toString() : (isDark ? '#888' : '#bbb'))
    rect.setAttribute('stroke-width', '0.8')
    rect.setAttribute('stroke-opacity', '0.55')
    if (j.dc != null) rect.setAttribute('data-cluster', j.dc)
    if (j.dn != null) rect.setAttribute('data-node-id', j.dn)
    j.parent.insertBefore(rect, j.textEl)
  }
}

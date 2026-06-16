/**
 * RelationArrows
 *
 * SVG overlay drawn over the TextAnnotator scroll container.
 * For each AnnotationRelation it renders a U-shaped arrow connector:
 *
 *   [source block]          [target block]
 *        |                        ↑
 *        |________________________|
 *
 * The horizontal run is placed 10 px below the lower of the two blocks.
 * The arrowhead points UP into the target block's bottom edge.
 *
 * Layout notes:
 *  - The SVG is positioned `absolute, top:0, left:0` inside the scrollable
 *    container so it follows the full scroll area.
 *  - Block positions are queried via `data-annotation-id` attributes.
 *  - Coordinates are in the container's scroll-space
 *    (clientRect - containerClientRect + scrollOffset).
 *  - Re-measured on every render (annotations / relations change).
 */

import { useEffect, useState } from 'react'
import type { AnnotationRelation, Annotation } from '../../types/annotation'

// ── Types ────────────────────────────────────────────────────────────────────

interface Rect {
  left: number
  top: number
  width: number
  height: number
  bottom: number
  right: number
}

interface ArrowDatum {
  relation: AnnotationRelation
  src: Rect
  tgt: Rect
  color: string
}

interface RelationArrowsProps {
  relations: AnnotationRelation[]
  annotations: Annotation[]
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the bounding rect of an annotation block in the container's
 * full scroll-space (i.e. accounting for container.scrollTop / scrollLeft).
 */
function getBlockRect(
  annotationId: string,
  container: HTMLDivElement
): Rect | null {
  const el = container.querySelector<HTMLElement>(
    `[data-annotation-id="${annotationId}"]`
  )
  if (!el) return null

  const cBounds = container.getBoundingClientRect()
  const eBounds = el.getBoundingClientRect()

  const left   = eBounds.left   - cBounds.left + container.scrollLeft
  const top    = eBounds.top    - cBounds.top  + container.scrollTop
  const width  = eBounds.width
  const height = eBounds.height
  return { left, top, width, height, right: left + width, bottom: top + height }
}

// ── ArrowPath ────────────────────────────────────────────────────────────────

const ARROW_H  = 10  // gap below lower block before the horizontal run
const ARROW_SZ = 6   // arrowhead size (px)
const STROKE   = 1.5

function ArrowPath({ datum }: { datum: ArrowDatum }) {
  const { src, tgt, color } = datum

  const srcCX = src.left + src.width / 2
  const tgtCX = tgt.left + tgt.width / 2
  const connY  = Math.max(src.bottom, tgt.bottom) + ARROW_H

  // U-shape path
  const d = [
    `M ${srcCX.toFixed(1)} ${src.bottom.toFixed(1)}`,
    `L ${srcCX.toFixed(1)} ${connY.toFixed(1)}`,
    `L ${tgtCX.toFixed(1)} ${connY.toFixed(1)}`,
    `L ${tgtCX.toFixed(1)} ${tgt.bottom.toFixed(1)}`,
  ].join(' ')

  // Arrowhead pointing UP (triangle base below, tip at tgt.bottom)
  const ax = tgtCX
  const ay = tgt.bottom
  const arrowPath = `M ${(ax - ARROW_SZ / 2).toFixed(1)} ${(ay + ARROW_SZ).toFixed(1)} L ${ax.toFixed(1)} ${ay.toFixed(1)} L ${(ax + ARROW_SZ / 2).toFixed(1)} ${(ay + ARROW_SZ).toFixed(1)}`

  // Relation label (if any) — rendered at midpoint of horizontal run
  const labelX = (srcCX + tgtCX) / 2
  const labelY = connY - 3

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" opacity={0.85} />
      <path d={arrowPath} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      {datum.relation.label && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fontSize={10}
          fill={color}
          opacity={0.9}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {datum.relation.label}
        </text>
      )}
    </g>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RelationArrows({
  relations,
  annotations,
  containerRef,
}: RelationArrowsProps) {
  const [arrows, setArrows] = useState<ArrowDatum[]>([])
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })

  // Build colour lookup: annotationId → colour
  const colorMap = new Map<string, string>()
  for (const ann of annotations) {
    colorMap.set(ann.id, ann.color || '#2196F3')
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container || relations.length === 0) {
      setArrows([])
      return
    }

    const measure = () => {
      const next: ArrowDatum[] = []

      for (const rel of relations) {
        const src = getBlockRect(rel.sourceId, container)
        const tgt = getBlockRect(rel.targetId, container)
        if (!src || !tgt) continue

        const color = rel.color || colorMap.get(rel.sourceId) || '#FF9800'
        next.push({ relation: rel, src, tgt, color })
      }

      setArrows(next)
      setSvgSize({
        w: container.scrollWidth,
        h: container.scrollHeight,
      })
    }

    // Measure after a short delay so DOM layout settles
    const tid = setTimeout(measure, 40)

    // Re-measure on container scroll (arrows must follow the content)
    const onScroll = () => measure()
    container.addEventListener('scroll', onScroll, { passive: true })

    // Re-measure on container resize
    const ro = new ResizeObserver(measure)
    ro.observe(container)

    return () => {
      clearTimeout(tid)
      container.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [relations, annotations, containerRef])   // re-run when data changes

  if (arrows.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: svgSize.w || '100%',
        height: svgSize.h || '100%',
        pointerEvents: 'none',
        zIndex: 25,
        overflow: 'visible',
      }}
    >
      {arrows.map((datum) => (
        <ArrowPath key={datum.relation.id} datum={datum} />
      ))}
    </svg>
  )
}

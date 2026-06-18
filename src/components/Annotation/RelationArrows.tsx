/**
 * RelationArrows
 *
 * SVG overlay drawn over the TextAnnotator scroll container.
 *
 * DIRECTED RELATIONS (AnnotationRelation)
 *   Solid U-shaped arrow connector below the blocks — arrow points UP into target:
 *
 *   [source block]          [target block]
 *        |                        ↑
 *        |________________________|
 *
 * DISCONTINUOUS GROUPS (AnnotationGroup)
 *   Dashed inverted-U bracket above the blocks — no arrowhead, bidirectional:
 *
 *        |________________________|
 *        |                        |
 *   [member block]          [member block]
 *
 * Layout notes:
 *  - The SVG is positioned `absolute, top:0, left:0` inside the scrollable
 *    container so it follows the full scroll area.
 *  - Block positions are queried via `data-annotation-id` attributes.
 *  - Coordinates are in the container's scroll-space
 *    (clientRect - containerClientRect + scrollOffset).
 *  - Re-measured on every render (annotations / relations / groups change).
 */

import { useEffect, useState } from 'react'
import type { AnnotationRelation, Annotation, AnnotationGroup } from '../../types/annotation'

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
  upper: Rect          // endpoint with the smaller top (higher on screen)
  lower: Rect          // the other endpoint
  color: string
  connY: number        // y of the horizontal run — in the lane just below the UPPER block
  stacked: boolean     // true when endpoints are on different rows (no vertical overlap)
  targetIsUpper: boolean
}

interface GroupDatum {
  group: AnnotationGroup
  members: Rect[]
  color: string
  connY: number  // y of the horizontal bar — placed inside a reserved top lane
}

interface RelationArrowsProps {
  relations: AnnotationRelation[]
  annotations: Annotation[]
  containerRef: React.RefObject<HTMLDivElement | null>
  groups?: AnnotationGroup[]
  /** Bumped by TextAnnotator whenever block positions are re-measured (e.g. a
   *  search highlight shifts tokens horizontally) so arrows re-track the blocks. */
  revision?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Returns the vertical centre (scroll-space) of the reserved connector lane that
 * belongs to the same sentence row as the given annotation block. TextAnnotator
 * renders an empty `[data-lane="top"|"bottom"]` Box in rows that host a connector
 * so the horizontal run gets its own label-height slot and never overlaps the
 * labels of adjacent rows/layers. Returns null when no lane was reserved (caller
 * falls back to a small fixed gap off the block edge).
 */
function getLaneCenterY(
  annotationId: string,
  container: HTMLDivElement,
  which: 'top' | 'bottom'
): number | null {
  const el = container.querySelector<HTMLElement>(
    `[data-annotation-id="${annotationId}"]`
  )
  if (!el) return null
  const row = el.closest<HTMLElement>('[data-sentence-idx], [data-segment-id]')
  if (!row) return null
  const lane = row.querySelector<HTMLElement>(`[data-lane="${which}"]`)
  if (!lane) return null

  const cBounds = container.getBoundingClientRect()
  const lBounds = lane.getBoundingClientRect()
  const top = lBounds.top - cBounds.top + container.scrollTop
  return top + lBounds.height / 2
}

// ── Directed Relation Arrow ───────────────────────────────────────────────────

const ARROW_H  = 10  // gap below the upper block before the horizontal run
const ARROW_SZ = 6   // arrowhead size (px)
const STROKE   = 1.5

function ArrowPath({ datum }: { datum: ArrowDatum }) {
  const { upper, lower, color, connY, stacked, targetIsUpper } = datum

  const upperCX = upper.left + upper.width / 2
  const lowerCX = lower.left + lower.width / 2

  // The horizontal run sits at connY, in the lane directly BELOW the upper block.
  // - Upper endpoint always attaches at its BOTTOM (line drops into that lane).
  // - When stacked (different rows), the lower endpoint attaches at its TOP, so the
  //   connector lives between the two labels — the lower label sits *below* the run
  //   rather than the line cutting down past it.
  // - When on the same line, both attach at the bottom (classic U below the row).
  const lowerAttachY = stacked ? lower.top : lower.bottom
  const d = [
    `M ${upperCX.toFixed(1)} ${upper.bottom.toFixed(1)}`,
    `L ${upperCX.toFixed(1)} ${connY.toFixed(1)}`,
    `L ${lowerCX.toFixed(1)} ${connY.toFixed(1)}`,
    `L ${lowerCX.toFixed(1)} ${lowerAttachY.toFixed(1)}`,
  ].join(' ')

  // Arrowhead sits at the TARGET edge facing the connector, pointing into the target.
  const upArrow = (ax: number, ay: number) =>
    `M ${(ax - ARROW_SZ / 2).toFixed(1)} ${(ay + ARROW_SZ).toFixed(1)} L ${ax.toFixed(1)} ${ay.toFixed(1)} L ${(ax + ARROW_SZ / 2).toFixed(1)} ${(ay + ARROW_SZ).toFixed(1)}`
  const downArrow = (ax: number, ay: number) =>
    `M ${(ax - ARROW_SZ / 2).toFixed(1)} ${(ay - ARROW_SZ).toFixed(1)} L ${ax.toFixed(1)} ${ay.toFixed(1)} L ${(ax + ARROW_SZ / 2).toFixed(1)} ${(ay - ARROW_SZ).toFixed(1)}`
  const arrowPath = targetIsUpper
    ? upArrow(upperCX, upper.bottom)                       // into upper, from below
    : stacked
      ? downArrow(lowerCX, lower.top)                      // into lower top, from above
      : upArrow(lowerCX, lower.bottom)                     // same line: into lower bottom

  // Relation label (if any) — rendered at midpoint of horizontal run
  const labelX = (upperCX + lowerCX) / 2
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

// ── Group Bracket (inverted-U, dashed, no arrowhead) ─────────────────────────

const GROUP_GAP = 10  // gap above topmost block

function GroupBracket({ datum }: { datum: GroupDatum }) {
  const { members, color, group, connY } = datum
  if (members.length < 2) return null

  const cxs   = members.map(m => m.left + m.width / 2)
  const minCX = Math.min(...cxs)
  const maxCX = Math.max(...cxs)

  return (
    <g>
      {/* Horizontal bar (solid — matches the directed-relation connector style) */}
      <line
        x1={minCX.toFixed(1)} y1={connY.toFixed(1)}
        x2={maxCX.toFixed(1)} y2={connY.toFixed(1)}
        stroke={color} strokeWidth={1.5} opacity={0.85}
      />
      {/* Vertical drops from each member to the bar */}
      {members.map((m, i) => {
        const cx = m.left + m.width / 2
        return (
          <line
            key={i}
            x1={cx.toFixed(1)} y1={connY.toFixed(1)}
            x2={cx.toFixed(1)} y2={m.top.toFixed(1)}
            stroke={color} strokeWidth={1.5} opacity={0.85}
          />
        )
      })}
      {/* Optional group label at midpoint of horizontal bar */}
      {group.label && (
        <text
          x={((minCX + maxCX) / 2).toFixed(1)}
          y={(connY - 3).toFixed(1)}
          textAnchor="middle"
          fontSize={10}
          fill={color}
          opacity={0.85}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {group.label}
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
  groups = [],
  revision = 0,
}: RelationArrowsProps) {
  const [arrows, setArrows]   = useState<ArrowDatum[]>([])
  const [brackets, setBrackets] = useState<GroupDatum[]>([])
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })

  // Build colour lookup: annotationId → colour
  const colorMap = new Map<string, string>()
  for (const ann of annotations) {
    colorMap.set(ann.id, ann.color || '#2196F3')
  }

  useEffect(() => {
    const container = containerRef.current
    const hasRelations = relations.length > 0
    const hasGroups    = groups.length > 0
    if (!container || (!hasRelations && !hasGroups)) {
      setArrows([])
      setBrackets([])
      return
    }

    const measure = () => {
      // Directed arrows
      const nextArrows: ArrowDatum[] = []
      for (const rel of relations) {
        const src = getBlockRect(rel.sourceId, container)
        const tgt = getBlockRect(rel.targetId, container)
        if (!src || !tgt) continue
        const color = rel.color || colorMap.get(rel.sourceId) || '#FF9800'

        // Identify the upper (smaller top) and lower endpoint.
        const srcIsUpper  = src.top <= tgt.top
        const upper       = srcIsUpper ? src : tgt
        const lower       = srcIsUpper ? tgt : src
        const upperId     = srcIsUpper ? rel.sourceId : rel.targetId
        const targetIsUpper = !srcIsUpper  // target == upper iff src is the lower one
        // Stacked = lower block starts at/below where the upper block ends (different rows).
        const stacked = lower.top >= upper.bottom - 2

        // Horizontal run sits in the reserved bottom lane directly BELOW the UPPER
        // block, so the connector shows under the first label and the lower label
        // sits beneath the run. Fall back to a small fixed gap if no lane exists.
        const laneY = getLaneCenterY(upperId, container, 'bottom')
        const connY = laneY ?? (stacked
          ? upper.bottom + ARROW_H
          : Math.max(src.bottom, tgt.bottom) + ARROW_H)

        nextArrows.push({ relation: rel, upper, lower, color, connY, stacked, targetIsUpper })
      }

      // Group brackets
      const nextBrackets: GroupDatum[] = []
      for (const grp of groups) {
        const memberRects: Rect[] = []
        let color = '#9C27B0'
        let topId: string | null = null
        let topY = Infinity
        for (const annId of grp.annotationIds) {
          const rect = getBlockRect(annId, container)
          if (rect) {
            memberRects.push(rect)
            color = colorMap.get(annId) || color
            if (rect.top < topY) { topY = rect.top; topId = annId }
          }
        }
        if (memberRects.length >= 2 && topId) {
          // The horizontal bar sits in the reserved top lane of the topmost
          // member's sentence row (above all label layers, below the text line).
          const laneY = getLaneCenterY(topId, container, 'top')
          const connY = laneY ?? (Math.min(...memberRects.map(m => m.top)) - GROUP_GAP)
          nextBrackets.push({ group: grp, members: memberRects, color, connY })
        }
      }

      setArrows(nextArrows)
      setBrackets(nextBrackets)
      setSvgSize({
        w: container.scrollWidth,
        h: container.scrollHeight,
      })
    }

    const tid = setTimeout(measure, 40)
    const onScroll = () => measure()
    container.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(container)

    return () => {
      clearTimeout(tid)
      container.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [relations, annotations, groups, containerRef, revision])

  if (arrows.length === 0 && brackets.length === 0) return null

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
      {/* Render group brackets first so arrows appear on top */}
      {brackets.map((datum) => (
        <GroupBracket key={datum.group.id} datum={datum} />
      ))}
      {arrows.map((datum) => (
        <ArrowPath key={datum.relation.id} datum={datum} />
      ))}
    </svg>
  )
}

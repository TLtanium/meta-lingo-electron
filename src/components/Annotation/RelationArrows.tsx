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
  connY: number        // y of the horizontal run — in the bottom lane below the LOWER block
  targetIsUpper: boolean
}

interface GroupDatum {
  group: AnnotationGroup
  members: Rect[]
  color: string
  connY: number  // y of the horizontal bar — in the bottom lane below the LOWEST member
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
  const { upper, lower, color, connY, targetIsUpper } = datum

  const upperCX = upper.left + upper.width / 2
  const lowerCX = lower.left + lower.width / 2

  // The horizontal run sits at connY, in the reserved bottom lane below the LOWER
  // block. BOTH endpoints attach at their BOTTOM edge — so every connector leaves a
  // label from underneath, including the lower (cross-sentence) endpoint (which used
  // to attach at its top). The upper endpoint's vertical line drops past the lower
  // row to reach the run; the lower endpoint drops a short way into the same run.
  const d = [
    `M ${upperCX.toFixed(1)} ${upper.bottom.toFixed(1)}`,
    `L ${upperCX.toFixed(1)} ${connY.toFixed(1)}`,
    `L ${lowerCX.toFixed(1)} ${connY.toFixed(1)}`,
    `L ${lowerCX.toFixed(1)} ${lower.bottom.toFixed(1)}`,
  ].join(' ')

  // Arrowhead sits at the TARGET's BOTTOM edge, pointing UP into the target from the
  // connector run below it (regardless of whether the target is the upper or lower one).
  const upArrow = (ax: number, ay: number) =>
    `M ${(ax - ARROW_SZ / 2).toFixed(1)} ${(ay + ARROW_SZ).toFixed(1)} L ${ax.toFixed(1)} ${ay.toFixed(1)} L ${(ax + ARROW_SZ / 2).toFixed(1)} ${(ay + ARROW_SZ).toFixed(1)}`
  const arrowPath = targetIsUpper
    ? upArrow(upperCX, upper.bottom)                       // into upper bottom, from below
    : upArrow(lowerCX, lower.bottom)                       // into lower bottom, from below

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
      {/* Horizontal bar (solid — matches the directed-relation connector style),
          placed in the bottom lane BELOW the members. */}
      <line
        x1={minCX.toFixed(1)} y1={connY.toFixed(1)}
        x2={maxCX.toFixed(1)} y2={connY.toFixed(1)}
        stroke={color} strokeWidth={1.5} opacity={0.85}
      />
      {/* Vertical risers from each member's BOTTOM down to the bar — every member
          connects from underneath its label (U bracket below, not above). */}
      {members.map((m, i) => {
        const cx = m.left + m.width / 2
        return (
          <line
            key={i}
            x1={cx.toFixed(1)} y1={connY.toFixed(1)}
            x2={cx.toFixed(1)} y2={m.bottom.toFixed(1)}
            stroke={color} strokeWidth={1.5} opacity={0.85}
          />
        )
      })}
      {/* Optional group label just below the horizontal bar */}
      {group.label && (
        <text
          x={((minCX + maxCX) / 2).toFixed(1)}
          y={(connY + 12).toFixed(1)}
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
        const lowerId     = srcIsUpper ? rel.targetId : rel.sourceId
        const targetIsUpper = !srcIsUpper  // target == upper iff src is the lower one

        // Horizontal run sits in the reserved bottom lane directly BELOW the LOWER
        // block, so BOTH endpoints attach from underneath their labels. Fall back to
        // a small fixed gap below the lowest block if no lane was reserved.
        const laneY = getLaneCenterY(lowerId, container, 'bottom')
        const connY = laneY ?? (Math.max(src.bottom, tgt.bottom) + ARROW_H)

        nextArrows.push({ relation: rel, upper, lower, color, connY, targetIsUpper })
      }

      // Group brackets
      const nextBrackets: GroupDatum[] = []
      for (const grp of groups) {
        const memberRects: Rect[] = []
        let color = '#9C27B0'
        let bottomId: string | null = null
        let bottomY = -Infinity
        for (const annId of grp.annotationIds) {
          const rect = getBlockRect(annId, container)
          if (rect) {
            memberRects.push(rect)
            color = colorMap.get(annId) || color
            if (rect.bottom > bottomY) { bottomY = rect.bottom; bottomId = annId }
          }
        }
        if (memberRects.length >= 2 && bottomId) {
          // The horizontal bar sits in the reserved bottom lane of the LOWEST
          // member's sentence row, so every member connects from underneath its
          // label (U bracket below, consistent with directed relations).
          const laneY = getLaneCenterY(bottomId, container, 'bottom')
          const connY = laneY ?? (Math.max(...memberRects.map(m => m.bottom)) + GROUP_GAP)
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

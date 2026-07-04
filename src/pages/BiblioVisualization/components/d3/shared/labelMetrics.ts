/**
 * Shared node-label ranking metrics for the CiteSpace-style cluster / timeline views.
 *
 * CiteSpace exposes two independent label dropdowns:
 *   • Keyword / Term / Overlay Labels  → term (diamond) layer  — default "By Degree"
 *   • Node Labels                      → reference (circle) layer — default "By Citation"
 *
 * A node is labelled only if its chosen metric clears a threshold. Different node
 * types (term vs. reference) can rank by different metrics, so callers pick the
 * metric per node via {@link isReferenceNode}.
 *
 * Only metrics we can actually compute from our data are offered (Usage180 /
 * Usage2013 / Uncertainty E·H·T from WoS/CiteSpace-proprietary fields are omitted).
 */

export type LabelMetric =
  | 'citation'    // reference-layer default; == frequency (citation count)
  | 'frequency'   // term-layer "By Freq"
  | 'degree'
  | 'centrality'  // betweenness centrality
  | 'eigen'       // eigenvector centrality
  | 'sigma'
  | 'cluster'     // one representative label per cluster (top frequency)
  | 'burstness'   // only nodes flagged by Kleinberg burst detection
  | 'hide'

/** Metric options for the term / keyword (diamond) layer, in CiteSpace order. */
export const TERM_METRICS: LabelMetric[] =
  ['degree', 'cluster', 'frequency', 'centrality', 'eigen', 'burstness', 'hide']

/** Metric options for the reference (circle) layer, in CiteSpace order. */
export const REF_METRICS: LabelMetric[] =
  ['citation', 'cluster', 'degree', 'centrality', 'burstness', 'eigen', 'sigma', 'hide']

/** Minimal node shape needed to rank a label. */
export interface MetricNode {
  id: string
  frequency?: number
  degree?: number
  centrality?: number
  eigen_centrality?: number
  sigma?: number
  is_burst?: boolean
  cluster?: number
  term_type?: string
}

/** Reference-layer nodes render as circles; every other node type renders as a diamond. */
export function isReferenceNode(n: { term_type?: string }): boolean {
  const t = (n.term_type || '').toLowerCase()
  return t === 'reference' || t === 'co-citation'
}

/**
 * Representative node id (highest frequency) of each cluster — used by the
 * "By Cluster" metric to surface a single label per cluster.
 */
export function clusterRepresentatives(nodes: MetricNode[]): Set<string> {
  const best = new Map<number, { id: string; f: number }>()
  for (const n of nodes) {
    const c = n.cluster ?? -1
    const f = n.frequency ?? 0
    const cur = best.get(c)
    if (!cur || f > cur.f) best.set(c, { id: n.id, f })
  }
  return new Set(Array.from(best.values(), v => v.id))
}

/**
 * Numeric rank for a node under a given metric. Higher = more likely to be
 * labelled. `-Infinity` means "never label" (hidden / gated out).
 *
 * @param freqFallback  the node's frequency (used for citation/frequency/cluster
 *                      ranking and as a fallback when degree is unavailable)
 * @param opts.degree   pre-computed degree (cluster view derives it from links)
 * @param opts.clusterReps  representative id set for the "cluster" metric
 */
export function metricValue(
  n: MetricNode,
  metric: LabelMetric,
  freqFallback: number,
  opts?: { degree?: number; clusterReps?: Set<string> },
): number {
  switch (metric) {
    case 'hide': return -Infinity
    case 'degree': return opts?.degree ?? n.degree ?? freqFallback
    case 'centrality': return n.centrality ?? 0
    case 'eigen': return n.eigen_centrality ?? 0
    case 'sigma': return n.sigma ?? 0
    case 'burstness': return n.is_burst ? freqFallback : -Infinity
    case 'cluster': return opts?.clusterReps?.has(n.id) ? freqFallback : -Infinity
    case 'citation':
    case 'frequency':
    default: return freqFallback
  }
}

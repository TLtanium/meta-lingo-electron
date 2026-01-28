/**
 * D3.js Visualization Components for Topic Modeling
 * Exports all D3-based visualization components
 */

// Base components and hooks
export { default as D3Container } from './D3Container'
export { 
  useD3, 
  useResizeObserver, 
  useZoom, 
  useTooltip,
  TOPIC_COLORS,
  getTopicColor,
  formatNumber,
  truncateText
} from './useD3'

// Visualization components
export { default as TopicBubbleChart } from './TopicBubbleChart'
export { default as DocumentScatter } from './DocumentScatter'
export { default as TopicDendrogram } from './TopicDendrogram'
export { default as SimilarityHeatmap } from './SimilarityHeatmap'
export { default as TermDecayChart } from './TermDecayChart'
export { default as TopicTimeline } from './TopicTimeline'
export { default as TopicWordBars } from './TopicWordBars'

// Re-export types for convenience
export type { 
  // TopicBubbleChart types
  // DocumentScatter types  
  // etc.
}


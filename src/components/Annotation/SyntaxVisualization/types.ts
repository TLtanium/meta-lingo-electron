/**
 * Type definitions for Syntax Visualization
 */

export interface TreeNode {
  label: string
  children: TreeNode[]
  text: string
  isLeaf?: boolean
}

export interface DependencyToken {
  id: number
  text: string
  lemma: string
  pos: string
  tag: string
  dep: string
  head_id: number
  head_text: string
}

export interface DependencyArc {
  start: number
  end: number
  label: string
  dir: 'left' | 'right'
}

export interface ConstituencyData {
  tree_string: string
  tree_data: TreeNode | null
}

export interface DependencyData {
  svg_html: string
  tokens: DependencyToken[]
  arcs: DependencyArc[]
}

export interface SentenceInfo {
  id: number
  text: string
  start: number
  end: number
}

export type SyntaxType = 'constituency' | 'dependency'

import type { Framework, FrameworkNode, FrameworkCategory } from '../../../types'

export interface FrameworkState {
  categories: FrameworkCategory[]
  currentFramework: Framework | null
  currentPath: string[]
  currentNode: FrameworkNode | null
  loading: boolean
  error: string | null
}

export interface NodeInfo {
  node: FrameworkNode
  path: string[]
  isRoot: boolean
  isTier: boolean
  isLabel: boolean
}

export type { Framework, FrameworkNode, FrameworkCategory }


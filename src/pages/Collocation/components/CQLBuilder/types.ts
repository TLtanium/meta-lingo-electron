/**
 * CQL Builder Types
 * TypeScript type definitions for CQL visual builder
 */

// Token attributes - basic and head-based for dependency constraints
export type TokenAttribute = 'word' | 'lemma' | 'pos' | 'tag' | 'dep' | 'headword' | 'headlemma' | 'headpos' | 'headdep'

// Comparison operators
export type ComparisonOperator = '=' | '!=' | '==' | '!=='

// Logic operators for combining conditions
export type LogicOperator = 'and' | 'or'

// Element types that can be added to the builder
export type ElementType = 'normal_token' | 'unspecified_token' | 'distance' | 'or'

/**
 * Single condition within a token
 * e.g., lemma="book" or pos="NOUN"
 */
export interface TokenCondition {
  id: string
  attribute: TokenAttribute
  operator: ComparisonOperator
  value: string
}

/**
 * A group of conditions connected by logic operators
 * Represents conditions within a single token [...]
 */
export interface ConditionGroup {
  conditions: TokenCondition[]
  logic: LogicOperator  // How conditions are combined (AND/OR)
}

/**
 * Builder element - represents one unit in the CQL query
 */
export interface BuilderElement {
  id: string
  type: ElementType
  // For normal_token: conditions to match
  conditionGroups?: ConditionGroup[]
  // For distance: repetition count
  minCount?: number
  maxCount?: number
  // Editing state
  isEditing?: boolean
}

/**
 * Saved CQL template
 */
export interface CQLTemplate {
  id: string
  name: string
  cql: string
  elements: BuilderElement[]
  createdAt: string
  updatedAt?: string
}

/**
 * CQL Builder state
 */
export interface CQLBuilderState {
  elements: BuilderElement[]
  selectedElementId: string | null
  editingElementId: string | null
  cqlPreview: string
  isValid: boolean
  validationError?: string
}

/**
 * Props for CQLBuilderDialog
 */
export interface CQLBuilderDialogProps {
  open: boolean
  onClose: () => void
  onApply: (cql: string) => void
  initialCQL?: string
}

/**
 * Props for ElementCard (defined internally in ElementCard.tsx)
 */
export interface ElementCardProps {
  element: BuilderElement
  isSelected: boolean
  isEditing: boolean
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (element: BuilderElement) => void
  onEditComplete: () => void
}

/**
 * Props for TokenEditor
 */
export interface TokenEditorProps {
  element: BuilderElement
  onUpdate: (element: BuilderElement) => void
  onComplete: () => void
  onCancel: () => void
}

/**
 * Props for CQLPreview
 */
export interface CQLPreviewProps {
  cql: string
  isValid: boolean
  error?: string
  onCopy: () => void
}

/**
 * Props for SavedTemplates
 */
export interface SavedTemplatesProps {
  open: boolean
  onClose: () => void
  onSelect: (template: CQLTemplate) => void
  onSave: (name: string, cql: string, elements: BuilderElement[]) => void
}

/**
 * Add element menu option
 */
export interface AddElementOption {
  type: ElementType
  label: {
    zh: string
    en: string
  }
  description: {
    zh: string
    en: string
  }
  icon: string
  preview: string  // CQL syntax preview
}

